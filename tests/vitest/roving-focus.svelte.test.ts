import { create_roving_focus, ROVING_ATTR } from '#lib/roving-focus.svelte.ts'
import { flushSync } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'
import { press_key } from './index'

const prevent_default = (event: Event) => event.preventDefault()

const setup = (
  svg = false,
  parent: Element = document.body,
  configure?: (marks: (HTMLElement | SVGElement)[]) => void,
) => {
  const container = svg
    ? document.createElementNS(`http://www.w3.org/2000/svg`, `svg`)
    : document.createElement(`div`)
  parent.append(container)
  const keys = [`alpha`, `series:beta`, `gamma`]
  const initial_marks = keys.map((key) => {
    const mark = svg
      ? document.createElementNS(`http://www.w3.org/2000/svg`, `circle`)
      : document.createElement(`button`)
    mark.setAttribute(ROVING_ATTR, key)
    return mark
  })
  configure?.(initial_marks)
  let marks = $state.raw(initial_marks)
  let handled = false
  onTestFinished(
    $effect.root(() => {
      $effect(() => {
        container.replaceChildren(...marks)
      })
      const focus = create_roving_focus({
        container: () => container,
        items: () => marks,
      })
      container.addEventListener(`focusin`, focus.focusin as EventListener)
      container.addEventListener(`keydown`, (event) => {
        handled = focus.handle_keydown(event as KeyboardEvent)
      })
      $effect(() => {
        for (const mark of marks)
          mark.setAttribute(
            `tabindex`,
            `${focus.tabindex(mark.getAttribute(ROVING_ATTR) ?? ``)}`,
          )
      })
    }),
  )
  flushSync()
  // a target listener runs before the container's, as an earlier handler's would
  const press = (
    target: Element,
    key: string,
    init: KeyboardEventInit = {},
    prevented = false,
  ) => {
    if (prevented) target.addEventListener(`keydown`, prevent_default, { once: true })
    const event = press_key(target, key, init)
    flushSync()
    return { handled, prevented: event.defaultPrevented }
  }
  return {
    container,
    get marks() {
      return marks
    },
    press,
    reorder: (next_marks: typeof marks) => {
      marks = next_marks
      flushSync()
    },
    tabstops: () => [...container.children].map((mark) => mark.getAttribute(`tabindex`)),
  }
}

test.each([false, true])(
  `HTML/SVG svg=%s follows DOM order, wraps and tracks focused keys`,
  (svg) => {
    const { container, marks, press, tabstops } = setup(svg)
    expect(tabstops()).toEqual([`0`, `-1`, `-1`])
    for (const key of [
      `ArrowLeft`,
      `ArrowUp`,
      `End`,
      `ArrowRight`,
      `ArrowDown`,
      `Home`,
    ]) {
      expect(press(container, key)).toEqual({ handled: true, prevented: true })
      expect(document.activeElement).toBe(
        marks[[`ArrowLeft`, `ArrowUp`, `End`].includes(key) ? 2 : 0],
      )
    }
    marks[0].focus()
    for (const [key, index] of [
      [`ArrowRight`, 1],
      [`ArrowDown`, 2],
      [`ArrowRight`, 0],
      [`ArrowLeft`, 2],
      [`ArrowUp`, 1],
      [`Home`, 0],
      [`End`, 2],
    ] as const) {
      const current = document.activeElement
      if (!current) throw new Error(`Expected focused mark before ${key}`)
      expect(press(current, key)).toEqual({ handled: true, prevented: true })
      expect(document.activeElement).toBe(marks[index])
      expect(tabstops()).toEqual(marks.map((_mark, idx) => (idx === index ? `0` : `-1`)))
    }
  },
)

test(`reordering preserves a focused escaped key and removing it chooses the first DOM mark`, () => {
  const { marks, reorder, tabstops, press } = setup()
  marks[1].focus()
  flushSync()
  expect(tabstops()).toEqual([`-1`, `0`, `-1`])
  reorder([marks[2], marks[1], marks[0]])
  expect(tabstops()).toEqual([`-1`, `0`, `-1`])
  expect(press(marks[1], `ArrowRight`).handled).toBe(true)
  expect(document.activeElement).toBe(marks[0])
  reorder([marks[2], marks[1]])
  expect(tabstops()).toEqual([`0`, `-1`])
  reorder([marks[1], marks[2]])
  expect(tabstops()).toEqual([`0`, `-1`])
  reorder([])
  expect(tabstops()).toEqual([])
  reorder([marks[0]])
  expect(tabstops()).toEqual([`0`])
})

test.each([
  [`Alt`, { altKey: true }, false],
  [`Ctrl`, { ctrlKey: true }, false],
  [`Meta`, { metaKey: true }, false],
  [`IME`, { isComposing: true }, false],
  [`prevented`, {}, true],
] as const)(`leaves %s navigation to the caller`, (_label, init, prevented) => {
  const { marks, press, tabstops } = setup()
  marks[0].focus()
  expect(press(marks[0], `ArrowRight`, init, prevented)).toEqual({
    handled: false,
    prevented,
  })
  expect(document.activeElement).toBe(marks[0])
  expect(tabstops()).toEqual([`0`, `-1`, `-1`])
})

test.each([`input`, `textarea`, `select`, `contenteditable`])(
  `ignores navigation from a nested %s`,
  (kind) => {
    const { marks, press, tabstops } = setup()
    const editable = document.createElement(kind === `contenteditable` ? `div` : kind)
    if (kind === `contenteditable`) editable.setAttribute(`contenteditable`, `true`)
    marks[0].append(editable)
    editable.focus()
    expect(press(editable, `ArrowRight`)).toEqual({ handled: false, prevented: false })
    expect(tabstops()).toEqual([`0`, `-1`, `-1`])
  },
)

test(`nested focus selects its mark; activation keys and empty groups are untouched`, () => {
  const { container, marks, press, tabstops, reorder } = setup()
  const nested = document.createElement(`span`)
  nested.tabIndex = 0
  marks[1].append(nested)
  nested.focus()
  flushSync()
  expect(tabstops()).toEqual([`-1`, `0`, `-1`])
  for (const key of [`Enter`, ` `, `Escape`, `Tab`]) {
    expect(press(nested, key)).toEqual({ handled: false, prevented: false })
  }
  expect(press(nested, `ArrowRight`)).toEqual({ handled: true, prevented: true })
  expect(document.activeElement).toBe(marks[2])
  reorder([])
  expect(press(container, `Home`)).toEqual({ handled: false, prevented: false })
})

test.each([`disabled`, `hidden`, `inert`, `display`, `visibility`, `type`])(
  `skips %s items for initial focus, navigation, and reactive removal`,
  async (kind) => {
    const hide = (mark: HTMLElement | SVGElement) => {
      if (kind === `display`) mark.style.display = `none`
      else if (kind === `visibility`) mark.style.visibility = `hidden`
      else if (kind === `type`) mark.setAttribute(`type`, `hidden`)
      else mark.setAttribute(kind, ``)
    }
    const { container, marks, press, tabstops } = setup(
      false,
      document.body,
      (initial_marks) => {
        if (kind === `type`) {
          initial_marks.forEach((mark, idx) => {
            const input = document.createElement(`input`)
            input.type = `button`
            input.setAttribute(ROVING_ATTR, mark.getAttribute(ROVING_ATTR) ?? ``)
            initial_marks[idx] = input
          })
        }
        hide(initial_marks[0])
      },
    )
    expect(tabstops()).toEqual([`-1`, `0`, `-1`])
    marks[1].focus()
    // Inputs keep their own keys; the container can still initiate navigation.
    expect(press(kind === `type` ? container : marks[1], `ArrowLeft`).handled).toBe(true)
    expect(document.activeElement).toBe(marks[2])
    hide(marks[2])
    await vi.waitFor(() => {
      flushSync()
      expect(tabstops()).toEqual([`-1`, `0`, `-1`])
    })
    hide(marks[1])
    await vi.waitFor(() => {
      flushSync()
      expect(tabstops()).toEqual([`-1`, `-1`, `-1`])
    })
    expect(press(marks[1], `Home`).handled).toBe(false)
  },
)

test.each([`display`, `details`, `fieldset`, `shadow`])(
  `revealing an unavailable %s ancestor restores a tab stop without changing items`,
  async (kind) => {
    const parent = document.createElement(
      kind === `details` || kind === `fieldset` ? kind : `div`,
    )
    if (kind === `fieldset`) parent.setAttribute(`disabled`, ``)
    else if (kind !== `details`) parent.style.display = `none`
    document.body.append(parent)
    const content = document.createElement(`div`)
    if (kind === `shadow`) parent.attachShadow({ mode: `open` }).append(content)
    else parent.append(content)
    const { tabstops } = setup(false, content)
    expect(tabstops()).toEqual([`-1`, `-1`, `-1`])
    parent.style.display = `block`
    parent.removeAttribute(`disabled`)
    parent.setAttribute(`open`, ``)
    await vi.waitFor(() => {
      flushSync()
      expect(tabstops()).toEqual([`0`, `-1`, `-1`])
    })
  },
)

test(`nested groups with duplicate keys keep independent tab stops and navigation`, () => {
  const outer = setup()
  const inner = setup(false, outer.marks[0])
  inner.marks[1].focus()
  flushSync()
  expect(outer.tabstops()).toEqual([`0`, `-1`, `-1`])
  expect(inner.tabstops()).toEqual([`-1`, `0`, `-1`])
  expect(inner.press(inner.marks[1], `ArrowRight`).handled).toBe(true)
  expect(document.activeElement).toBe(inner.marks[2])
  outer.marks[0].focus()
  outer.press(outer.marks[0], `ArrowRight`)
  expect(document.activeElement).toBe(outer.marks[1])
  expect(outer.tabstops()).toEqual([`-1`, `0`, `-1`])
})

// A chart restyles thousands of nodes per update: only mutations a mark is part of re-check
// eligibility, whose computed-style walk forces a style recalc mid-update
// more marks than a move touches, so re-running every mark's tab stop would show
test(`a focus move re-runs only the tab stops of the two marks it moves between`, () => {
  const container = document.createElement(`div`)
  const marks = Array.from({ length: 8 }, (_, idx) => {
    const mark = document.createElement(`button`)
    mark.setAttribute(ROVING_ATTR, `key ${idx}`)
    return mark
  })
  container.append(...marks)
  document.body.append(container)
  onTestFinished(() => container.remove())
  let runs = 0
  onTestFinished(
    $effect.root(() => {
      const focus = create_roving_focus({
        container: () => container,
        items: () => marks,
      })
      container.addEventListener(`focusin`, focus.focusin as EventListener)
      container.addEventListener(`keydown`, (event) => {
        focus.handle_keydown(event)
      })
      for (const mark of marks)
        $effect(() => {
          runs++
          mark.tabIndex = focus.tabindex(mark.getAttribute(ROVING_ATTR) ?? ``)
        })
    }),
  )
  flushSync()
  marks[0].focus()
  flushSync()
  runs = 0
  press_key(marks[0], `ArrowRight`)
  flushSync()
  expect(document.activeElement).toBe(marks[1])
  expect(marks.map((mark) => mark.tabIndex)).toEqual([-1, 0, -1, -1, -1, -1, -1, -1])
  expect(runs).toBe(2)
})

// MutationObserver callbacks, then the re-measure they schedule
const settle_dom = async () => {
  await new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
  flushSync()
}

test(`restyling nodes with no mark nearby leaves the tab stops unchecked`, async () => {
  const { container, marks, tabstops } = setup()
  // a chart axis: its own group, no mark among its nodes or their siblings
  const axis = document.createElement(`div`)
  const tick_label = document.createElement(`span`)
  axis.append(tick_label)
  container.append(axis)
  const sibling = document.createElement(`span`)
  marks[0].before(sibling)
  await settle_dom()
  const computed_style = vi.spyOn(window, `getComputedStyle`)
  onTestFinished(() => computed_style.mockRestore())
  tick_label.classList.add(`restyled`)
  tick_label.style.color = `red`
  await settle_dom()
  expect(computed_style).not.toHaveBeenCalled()
  // a mark's sibling can restyle it through sibling CSS (`.hide + button`)
  sibling.classList.add(`hide`)
  await settle_dom()
  expect(computed_style).toHaveBeenCalled()
  computed_style.mockClear()
  marks[1].classList.add(`restyled`)
  await settle_dom()
  expect(computed_style).toHaveBeenCalled()
  expect(tabstops().slice(1, 4)).toEqual([`0`, `-1`, `-1`])
  // the tab-stop mark stops being a mark (no item-list change): the next mark takes over
  marks[0].removeAttribute(ROVING_ATTR)
  await settle_dom()
  expect(tabstops().slice(2, 4)).toEqual([`0`, `-1`])
})

// a disabled fieldset's first legend stays enabled, so inserting one changes which nested
// marks can take focus without any mark being added or restyled
test(`a legend inserted into a fieldset holding marks re-checks the tab stops`, async () => {
  const container = document.createElement(`div`)
  const fieldset = document.createElement(`fieldset`)
  const group = document.createElement(`div`)
  const mark = document.createElement(`button`)
  mark.setAttribute(ROVING_ATTR, `alpha`)
  group.append(mark)
  fieldset.append(group)
  container.append(fieldset)
  document.body.append(container)
  onTestFinished(() => container.remove())
  onTestFinished(
    $effect.root(() => {
      const focus = create_roving_focus({ container: () => container, items: () => 1 })
      $effect(() => void focus.tabindex(`alpha`))
    }),
  )
  await settle_dom()
  const computed_style = vi.spyOn(window, `getComputedStyle`)
  onTestFinished(() => computed_style.mockRestore())
  fieldset.prepend(document.createElement(`legend`))
  await settle_dom()
  expect(computed_style).toHaveBeenCalled()
})

test(`a changed item list re-runs no measured tab stop`, () => {
  const container = document.createElement(`div`)
  const mark = document.createElement(`button`)
  mark.setAttribute(ROVING_ATTR, `alpha`)
  container.append(mark)
  document.body.append(container)
  let revision = $state(0)
  let runs = 0
  onTestFinished(
    $effect.root(() => {
      const focus = create_roving_focus({
        container: () => container,
        items: () => revision,
      })
      $effect(() => {
        runs++
        mark.tabIndex = focus.tabindex(`alpha`)
      })
    }),
  )
  flushSync()
  const measured_runs = runs
  revision++
  flushSync()
  expect(runs).toBe(measured_runs)
  expect(mark.tabIndex).toBe(0)
})
