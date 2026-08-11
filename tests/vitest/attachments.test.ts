import type {
  ContrastOptions,
  FocusTrapOptions,
  ResizableOptions,
  TooltipOpenReason,
  TooltipOptions,
} from '$lib/attachments'
import {
  auto_update_position,
  backdrop_dismiss,
  click_outside,
  contrast_color,
  dismiss_on_outside_press,
  draggable,
  file_drop,
  float,
  focus_trap,
  forward_window_keydown,
  get_bg_color,
  get_html_sort_value,
  highlight_matches,
  hotkey,
  pick_contrast_color,
  portal,
  register_escape_layer,
  resizable,
  sortable,
  tooltip,
} from '$lib/attachments'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  data_transfer,
  doc_query,
  drag_event,
  escape_key,
  hover as pointer_over,
  mock_rect,
  pointer_event,
  press_key as dispatch_key,
  stub_css_highlights,
  stub_prop,
} from './index'

const create_element = (tag = `div`, styles: Partial<CSSStyleDeclaration> = {}) => {
  const element = document.createElement(tag)
  Object.assign(element.style, styles)
  document.body.append(element)
  return element
}

describe(`get_html_sort_value`, () => {
  const add_data_sort = (element: HTMLElement, value: string) =>
    element.setAttribute(`data-sort-value`, value)
  const add_text = (element: HTMLElement, text: string) => (element.textContent = text)

  it.each([
    [`data-sort-value wins over text`, `custom-value`, `Different text`, `custom-value`],
    [`an empty data-sort-value stays empty`, ``, `Some text`, ``],
    [`textContent when no data-sort-value`, null, `Element text`, `Element text`],
    [`an empty element`, null, null, ``],
    [`whitespace textContent verbatim`, null, `   \n\t   `, `   \n\t   `],
  ])(`%s`, (_desc, data_sort_value, text_content, expected) => {
    const element = create_element()
    if (data_sort_value !== null) add_data_sort(element, data_sort_value)
    if (text_content !== null) add_text(element, text_content)
    expect(get_html_sort_value(element)).toBe(expected)
  })

  it(`returns the first descendant data-sort-value recursively`, () => {
    const [parent, child, grandchild, sibling] = [
      create_element(),
      create_element(`span`),
      create_element(`em`),
      create_element(`span`),
    ]
    add_text(parent, `Parent text`)
    add_text(child, `Child text`)
    add_data_sort(grandchild, `grandchild-value`)
    add_data_sort(sibling, `sibling-value`)
    add_text(grandchild, `Grandchild text`)
    child.append(grandchild)
    parent.append(child, sibling)
    expect(get_html_sort_value(parent)).toBe(`grandchild-value`)
  })
})

describe(`tooltip manager`, () => {
  const cleanups: (() => void)[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    cleanups.push(
      stub_prop(globalThis, `innerWidth`, 1000),
      stub_prop(globalThis, `innerHeight`, 800),
    )
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup()
    vi.useRealTimers()
  })

  const attach_tooltip = (
    element: HTMLElement,
    options: TooltipOptions = {},
  ): (() => void) => {
    if (!Object.hasOwn(element, `getBoundingClientRect`)) {
      mock_rect(element, { left: 100, top: 100, width: 80, height: 30 })
    }
    options.strategy ??= `absolute`
    options.open_delay_ms ??= 0
    options.close_delay_ms ??= 0
    const cleanup = tooltip(options)(element)
    if (!cleanup) throw new Error(`tooltip did not return cleanup`)
    cleanups.push(cleanup)
    return cleanup
  }

  const register_tooltip = (title: string, options: TooltipOptions = {}) => {
    const element = create_element(`button`)
    element.title = title
    return { cleanup: attach_tooltip(element, options), element }
  }

  const open_detail = (trigger: HTMLElement, reason: TooltipOpenReason) => ({
    trigger,
    reason,
  })

  const pointer_out = (
    element: HTMLElement,
    related_target: EventTarget = document.body,
  ) => {
    element.dispatchEvent(
      pointer_event(`pointerout`, 110, 110, {
        pointerType: `mouse`,
        relatedTarget: related_target,
      }),
    )
    vi.advanceTimersByTime(0)
  }

  const visible_tooltip = (): HTMLElement => {
    const tooltip_el = doc_query(`.custom-tooltip`)
    expect(tooltip_el.hidden).toBe(false)
    return tooltip_el
  }

  const show_tooltip = (options: TooltipOptions = {}, title = `Tooltip content`) => {
    const { cleanup, element } = register_tooltip(title, options)
    pointer_over(element)
    return { cleanup, element, tooltip_el: visible_tooltip() }
  }

  type QueuedCase = [string, readonly string[], boolean, string?]
  const setup_controlled_handoff = (blur_on_open = false, content = `Controlled`) => {
    const on_open_change = vi.fn()
    const controlled = create_element(`button`)
    const options: TooltipOptions = { content, open: true, on_open_change }
    const close = attach_tooltip(controlled, options)
    const root = create_element()
    const child = document.createElement(`button`)
    const other = document.createElement(`button`)
    child.title = `Next`
    other.title = `Other`
    root.append(child, other)
    attach_tooltip(
      root,
      blur_on_open
        ? {
            on_open_change: (open) => {
              if (open) {
                child.dispatchEvent(
                  new FocusEvent(`focusout`, {
                    bubbles: true,
                    relatedTarget: document.body,
                  }),
                )
              }
            },
          }
        : {},
    )
    mock_rect(child, { left: 250, top: 100, width: 80, height: 30 })
    mock_rect(other, { left: 350, top: 100, width: 80, height: 30 })
    return { child, close, controlled, on_open_change, options, other }
  }

  const mock_tooltip_rect = (width: number, height: number) => {
    const original = HTMLElement.prototype.getBoundingClientRect
    return vi
      .spyOn(HTMLElement.prototype, `getBoundingClientRect`)
      .mockImplementation(function (this: HTMLElement) {
        if (!this.classList.contains(`custom-tooltip`)) return original.call(this)
        return new DOMRect(0, 0, width, height)
      })
  }

  it.each([
    [`title`, `From title`],
    [`aria-label`, `From aria`],
    [`data-title`, `From data`],
  ])(`resolves %s content and restores stripped titles`, (attribute, expected) => {
    const element = create_element(`button`)
    element.setAttribute(attribute, expected)
    const cleanup = attach_tooltip(element)
    pointer_over(element)

    expect(doc_query(`.tooltip-content`).textContent).toBe(expected)
    if (attribute === `title`) expect(element.hasAttribute(`title`)).toBe(false)
    cleanup()
    if (attribute === `title`) expect(element.title).toBe(expected)
  })

  it(`gives explicit content precedence and treats an empty result as disabled`, () => {
    const element = create_element(`button`)
    element.title = `Native`
    attach_tooltip(element, { content: `Explicit` })
    pointer_over(element)
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Explicit`)

    const empty = create_element(`button`)
    empty.setAttribute(`aria-label`, `Fallback must not win`)
    attach_tooltip(empty, { content: () => `` })
    pointer_over(empty)
    const tooltip_el = doc_query(`.custom-tooltip`)
    expect(tooltip_el.hidden).toBe(true)
    expect(tooltip_el.style.display).toBe(`none`)
  })

  it.each([
    [
      `disabled render with content`,
      { content: `text`, disabled: true, render: (): undefined => undefined },
      `render cannot be combined`,
    ],
    [
      `render with allow_html: false`,
      { allow_html: false, render: (): undefined => undefined },
      `render cannot be combined`,
    ],
    [
      `sanitizer without HTML`,
      { sanitize_html: (html: string) => html },
      `sanitize_html requires`,
    ],
    [`manual without open`, { trigger: `manual` as const }, `requires the open option`],
  ])(`rejects invalid options: %s`, (_name, options, message) => {
    const element = create_element()
    expect(() => tooltip(options)(element)).toThrow(message)
  })

  it(`delegates to descendants added after attachment`, () => {
    const root = create_element()
    attach_tooltip(root)
    const child = document.createElement(`button`)
    child.title = `Dynamic child`
    root.append(child)
    mock_rect(child, { left: 120, top: 120, width: 80, height: 30 })

    pointer_over(child)
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Dynamic child`)
    expect(child.hasAttribute(`title`)).toBe(false)
    pointer_out(child)
    expect(child.title).toBe(`Dynamic child`)
    child.remove()
    root.append(child)
    pointer_over(child)
    expect(visible_tooltip().textContent).toBe(`Dynamic child`)
  })

  it(`supports explicit delegated selectors with per-trigger content factories`, () => {
    const root = create_element()
    attach_tooltip(root, {
      delegate: `[data-tip]`,
      content: (trigger) => trigger.getAttribute(`data-tip`) ?? ``,
    })
    const child = document.createElement(`button`)
    child.setAttribute(`data-tip`, `Selected child`)
    root.append(child)
    mock_rect(child, { left: 120, top: 120, width: 80, height: 30 })

    pointer_over(child)
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Selected child`)
  })

  it(`keeps one tooltip when pointer and focus states overlap`, () => {
    const on_open_change = vi.fn()
    const { element, tooltip_el } = show_tooltip({ on_open_change })
    element.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
    pointer_out(element)
    expect(tooltip_el.hidden).toBe(false)

    element.dispatchEvent(
      new FocusEvent(`focusout`, { bubbles: true, relatedTarget: document.body }),
    )
    vi.advanceTimersByTime(0)
    expect(tooltip_el.hidden).toBe(true)
    expect(on_open_change).toHaveBeenLastCalledWith(false, open_detail(element, `blur`))
  })

  it(`stays open while the pointer crosses onto the tooltip`, () => {
    const { element, tooltip_el } = show_tooltip({ close_delay_ms: 100 })
    pointer_out(element, tooltip_el)
    vi.advanceTimersByTime(100)
    expect(tooltip_el.hidden).toBe(false)

    tooltip_el.dispatchEvent(
      pointer_event(`pointerleave`, 100, 140, {
        pointerType: `mouse`,
        relatedTarget: document.body,
      }),
    )
    vi.advanceTimersByTime(100)
    expect(tooltip_el.hidden).toBe(true)
  })

  it(`stays open while another pointer remains on the trigger`, () => {
    const { tooltip_el } = show_tooltip()
    tooltip_el.dispatchEvent(
      pointer_event(`pointerenter`, 100, 140, { pointerType: `pen` }),
    )
    tooltip_el.dispatchEvent(
      pointer_event(`pointerleave`, 100, 140, {
        pointerType: `pen`,
        relatedTarget: document.body,
      }),
    )
    expect(tooltip_el.hidden).toBe(false)
  })

  it(`Escape dismisses one layer and blocks reopen until interaction exits`, () => {
    const { element, tooltip_el } = show_tooltip()
    const escape = escape_key()
    document.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    expect(tooltip_el.hidden).toBe(true)

    pointer_over(element)
    expect(tooltip_el.hidden).toBe(true)
    pointer_out(element)
    pointer_over(element)
    expect(tooltip_el.hidden).toBe(false)
  })

  it(`restores trigger focus when Escape hides custom rendered content`, () => {
    const element = create_element(`button`)
    attach_tooltip(element, {
      render: (content_el) => {
        const control = document.createElement(`button`)
        control.textContent = `Custom control`
        content_el.append(control)
        return undefined
      },
    })
    pointer_over(element)
    const control = doc_query<HTMLButtonElement>(`.tooltip-content button`)
    control.focus()

    document.dispatchEvent(escape_key())
    expect(doc_query(`.custom-tooltip`).hidden).toBe(true)
    expect(document.activeElement).toBe(element)
  })

  it(`stays dismissed when Escape hands focus back to the trigger`, () => {
    const on_open_change = vi.fn()
    const element = create_element(`button`)
    attach_tooltip(element, {
      trigger: `focus`,
      on_open_change,
      render: (content_el) => {
        content_el.append(document.createElement(`button`))
        return undefined
      },
    })
    element.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
    const tooltip_el = visible_tooltip()
    doc_query<HTMLButtonElement>(`.tooltip-content button`).focus()
    document.dispatchEvent(escape_key())
    expect(tooltip_el.hidden).toBe(true)

    // Handing focus back re-enters through focusout/focusin, which must not resurrect
    // the dismissed tooltip — leaving the trigger afterwards is not a second close.
    element.dispatchEvent(
      new FocusEvent(`focusout`, { bubbles: true, relatedTarget: document.body }),
    )
    vi.advanceTimersByTime(0)
    expect(tooltip_el.hidden).toBe(true)
    expect(on_open_change.mock.calls.filter(([open]) => open === false)).toEqual([
      [false, open_detail(element, `escape`)],
    ])
  })

  it(`focus opens immediately despite a long pointer delay`, () => {
    const { element } = register_tooltip(`Keyboard`, { open_delay_ms: 1000 })
    document.dispatchEvent(new KeyboardEvent(`keydown`, { key: `Tab`, bubbles: true }))
    element.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))

    expect(visible_tooltip().textContent).toBe(`Keyboard`)
  })

  it(`suppresses touch-induced default triggers but allows explicit focus mode`, () => {
    const { element: automatic } = register_tooltip(`Automatic`)
    // Browser ordering puts pointerover before pointerdown on first contact.
    pointer_over(automatic, `touch`)
    automatic.dispatchEvent(pointer_event(`pointerdown`, 0, 0, { pointerType: `touch` }))
    automatic.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
    expect(document.querySelector(`.custom-tooltip`)).toBeNull()
    pointer_over(automatic, `mouse`)
    expect(visible_tooltip().textContent).toBe(`Automatic`)

    const { element: focus_only } = register_tooltip(`Focus only`, { trigger: `focus` })
    focus_only.dispatchEvent(pointer_event(`pointerdown`, 0, 0, { pointerType: `touch` }))
    focus_only.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
    expect(visible_tooltip().textContent).toBe(`Focus only`)
  })

  it(`merges and removes only its aria-describedby token`, () => {
    const element = create_element(`button`)
    element.title = `Described`
    element.setAttribute(`aria-describedby`, `help error`)
    attach_tooltip(element)
    pointer_over(element)
    const tooltip_id = visible_tooltip().id

    expect(element.getAttribute(`aria-describedby`)?.split(/\s+/u)).toEqual([
      `help`,
      `error`,
      tooltip_id,
    ])
    pointer_out(element)
    expect(element.getAttribute(`aria-describedby`)).toBe(`help error`)
  })

  it(`recycles one node across triggers and swaps owner relationships`, () => {
    const { element: first } = register_tooltip(`First`)
    const { element: second } = register_tooltip(`Second`)

    pointer_over(first)
    const shared = visible_tooltip()
    pointer_over(second)
    expect(visible_tooltip()).toBe(shared)
    expect(shared.textContent).toBe(`Second`)
    expect(first.hasAttribute(`aria-describedby`)).toBe(false)
    expect(second.getAttribute(`aria-describedby`)).toBe(shared.id)
  })

  it(`shares one document listener pair across all registrations`, () => {
    const add_listener = vi.spyOn(document, `addEventListener`)
    const remove_listener = vi.spyOn(document, `removeEventListener`)
    const { cleanup: cleanup_first } = register_tooltip(`First`)
    const { cleanup: cleanup_second } = register_tooltip(`Second`)
    const manager_events = (calls: unknown[][]) =>
      calls
        .filter(
          ([event_name]) => event_name === `pointerdown` || event_name === `keydown`,
        )
        .map(([event_name]) => event_name)

    expect(manager_events(add_listener.mock.calls)).toEqual([`pointerdown`, `keydown`])
    cleanup_first()
    expect(manager_events(remove_listener.mock.calls)).toEqual([])
    cleanup_second()
    expect(manager_events(remove_listener.mock.calls)).toEqual([`pointerdown`, `keydown`])
  })

  it(`uses first-hover delay and skips it for the next tooltip`, () => {
    const options = { open_delay_ms: 100, close_delay_ms: 0, skip_delay_ms: 300 }
    const { element: first } = register_tooltip(`First`, options)
    const { element: second } = register_tooltip(`Second`, options)

    first.dispatchEvent(pointer_event(`pointerover`, 0, 0, { pointerType: `mouse` }))
    vi.advanceTimersByTime(99)
    expect(document.querySelector(`.custom-tooltip`)).toBeNull()
    vi.advanceTimersByTime(1)
    expect(visible_tooltip().textContent).toBe(`First`)
    pointer_out(first)
    pointer_over(second)
    expect(visible_tooltip().textContent).toBe(`Second`)
  })

  it(`supports controlled manual opening and reports lifecycle reasons`, async () => {
    const changes = vi.fn()
    const element = create_element(`button`)
    attach_tooltip(element, {
      content: `Controlled`,
      trigger: `manual`,
      open: true,
      on_open_change: changes,
    })
    await Promise.resolve()

    expect(visible_tooltip().textContent).toBe(`Controlled`)
    expect(changes).toHaveBeenCalledWith(true, open_detail(element, `controlled`))
    pointer_out(element)
    element.dispatchEvent(
      new FocusEvent(`focusout`, { bubbles: true, relatedTarget: document.body }),
    )
    vi.advanceTimersByTime(0)
    expect(visible_tooltip().textContent).toBe(`Controlled`)

    document.dispatchEvent(escape_key())
    expect(visible_tooltip().textContent).toBe(`Controlled`)
    expect(changes).toHaveBeenLastCalledWith(false, open_detail(element, `escape`))
  })

  it(`keeps controlled hover tooltips visible until open changes`, async () => {
    const on_open_change = vi.fn()
    const element = create_element(`button`)
    attach_tooltip(element, { content: `Controlled`, open: true, on_open_change })
    await Promise.resolve()
    const tooltip_el = visible_tooltip()

    pointer_out(element)
    expect(tooltip_el.hidden).toBe(false)
    expect(on_open_change).toHaveBeenLastCalledWith(
      false,
      open_detail(element, `pointer`),
    )
  })

  it.each([
    [`hands off immediately after controlled close`, [`close`], true],
    [`hands off after controlled state closes`, [`release`], true],
    [`hands off when controlled content never opened`, [`release`], true, ``],
    [`cancels after its pointer leaves`, [`leave-child`, `close`], false],
    [
      `survives blur while its pointer remains`,
      [`focus-child`, `blur-child`, `close`],
      true,
    ],
    [
      `keeps its pointer state when blur follows controlled close`,
      [`focus-child`, `close`, `blur-child`],
      true,
    ],
    [
      `survives reentrant blur from its open callback`,
      [`focus-child-reentrant`, `close`],
      true,
    ],
    [
      `keeps a focused trigger ahead of a transient hover`,
      [`leave-child`, `focus-child`, `hover-other`, `leave-other`, `close`],
      true,
    ],
    [
      `restores a hovered trigger after transient focus elsewhere`,
      [`focus-other`, `blur-other`, `close`],
      true,
    ],
    [
      `drops a stale hover after focus elsewhere also leaves`,
      [`focus-other`, `leave-child`, `blur-other`, `close`],
      false,
    ],
  ] as const)(`queued %s`, async (...[, actions, opens, content]: QueuedCase) => {
    const controlled_content = content ?? `Controlled`
    const reentrant = actions.some((action) => action === `focus-child-reentrant`)
    const { child, close, controlled, on_open_change, options, other } =
      setup_controlled_handoff(reentrant, controlled_content)
    await Promise.resolve()

    pointer_over(child)
    expect(document.querySelector(`.tooltip-content`)?.textContent).toBe(
      controlled_content || undefined,
    )
    expect(child.title).toBe(`Next`)
    expect(on_open_change).toHaveBeenLastCalledWith(
      false,
      open_detail(controlled, `pointer`),
    )
    for (const action of actions) {
      if (action === `close`) close()
      else if (action === `release`) {
        options.open = false
        pointer_out(controlled)
      } else if (action === `leave-child`) pointer_out(child)
      else if (action === `hover-other`) pointer_over(other)
      else if (action === `leave-other`) pointer_out(other)
      else {
        const target = action.includes(`child`) ? child : other
        const event_type = action.startsWith(`focus`) ? `focusin` : `focusout`
        target.dispatchEvent(
          new FocusEvent(event_type, {
            bubbles: true,
            relatedTarget: event_type === `focusout` ? document.body : null,
          }),
        )
      }
    }
    vi.advanceTimersByTime(0)

    if (opens) {
      expect(visible_tooltip().textContent).toBe(`Next`)
      expect(child.hasAttribute(`title`)).toBe(false)
    } else {
      expect(document.querySelector<HTMLElement>(`.custom-tooltip`)?.hidden).toBe(true)
      expect(child.title).toBe(`Next`)
    }
  })

  it(`drops queued triggers once an activation succeeds`, async () => {
    // Nesting the controlled trigger inside a queued one is the only way the pointer
    // reaches it without leaving the outer trigger, so a two-deep queue survives to
    // see a successful activation.
    const outer = create_element()
    outer.title = `Outer`
    const controlled = document.createElement(`button`)
    outer.append(controlled)
    mock_rect(controlled, { left: 20, top: 20, width: 80, height: 30 })
    attach_tooltip(outer)
    const cleanup_controlled = attach_tooltip(controlled, {
      content: `Controlled`,
      open: true,
    })
    const { element: elsewhere } = register_tooltip(`Elsewhere`)
    await Promise.resolve()

    pointer_over(outer) // queues behind the controlled tooltip
    elsewhere.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true })) // queues ahead
    pointer_out(outer, controlled) // stays inside `outer`, so its entry survives
    pointer_over(controlled) // reactivating the controlled trigger clears the queue
    elsewhere.dispatchEvent(
      new FocusEvent(`focusout`, { bubbles: true, relatedTarget: document.body }),
    )
    cleanup_controlled()
    vi.advanceTimersByTime(0)

    // Nothing replays: the queue was superseded, not merely reordered.
    expect(document.querySelector<HTMLElement>(`.custom-tooltip`)?.hidden).toBe(true)
  })

  it(`requests controlled opening without showing against open: false`, () => {
    const on_open_change = vi.fn()
    const { element } = register_tooltip(`Controlled`, { open: false, on_open_change })
    pointer_over(element)

    expect(document.querySelector(`.custom-tooltip`)).toBeNull()
    expect(on_open_change).toHaveBeenCalledWith(true, open_detail(element, `pointer`))
  })

  it(`runs custom render cleanup when switching owners`, () => {
    const cleanup = vi.fn()
    const first = create_element(`button`)
    attach_tooltip(first, {
      render: (content_el) => {
        content_el.textContent = `Rendered`
        return cleanup
      },
    })
    const { element: second } = register_tooltip(`Second`)

    pointer_over(first)
    expect(visible_tooltip().textContent).toBe(`Rendered`)
    pointer_over(second)
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it(`sanitizes trusted HTML and normalizes newline markup`, () => {
    const sanitizer = vi.fn((html: string) =>
      html.replaceAll(/<script[^>]*>.*?<\/script>/giu, ``),
    )
    const { tooltip_el } = show_tooltip(
      { allow_html: true, sanitize_html: sanitizer },
      `<script>bad()</script><b>Safe</b>\nNext`,
    )

    expect(sanitizer).toHaveBeenCalledOnce()
    expect(tooltip_el.querySelector(`script`)).toBeNull()
    expect(tooltip_el.querySelector(`b`)?.textContent).toBe(`Safe`)
    expect(tooltip_el.querySelector(`br`)).not.toBeNull()
  })

  it.each([
    [`balance`, `balance`, `anywhere`, `normal`],
    [`normal`, `wrap`, `anywhere`, `normal`],
    [`nowrap`, `nowrap`, `normal`, `nowrap`],
  ] as const)(
    `applies the %s wrapping policy`,
    (wrap, text_wrap, overflow_wrap, white_space) => {
      const { tooltip_el } = show_tooltip({ wrap })
      expect(tooltip_el.style.textWrap).toBe(text_wrap)
      expect(tooltip_el.style.overflowWrap).toBe(overflow_wrap)
      expect(tooltip_el.style.whiteSpace).toBe(white_space)
    },
  )

  it(`copies language, direction, theme variables and honors reduced motion`, () => {
    vi.mocked(matchMedia).mockReturnValueOnce({
      media: `(prefers-reduced-motion: reduce)`,
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)
    const wrapper = create_element()
    wrapper.lang = `ar`
    wrapper.dir = `rtl`
    const element = document.createElement(`button`)
    element.title = `مرحبا`
    element.style.setProperty(`--tooltip-bg`, `red`)
    wrapper.append(element)
    attach_tooltip(element)
    pointer_over(element)
    const tooltip_el = visible_tooltip()

    expect(tooltip_el.lang).toBe(`ar`)
    expect(tooltip_el.dir).toBe(`rtl`)
    expect(tooltip_el.style.getPropertyValue(`--tooltip-bg`)).toBe(`red`)
    expect(tooltip_el.style.transition).toBe(`none`)

    // the trigger's own lang/dir outrank the wrapper's
    element.lang = `he`
    element.dir = `ltr`
    pointer_out(element)
    pointer_over(element)
    expect([visible_tooltip().lang, visible_tooltip().dir]).toEqual([`he`, `ltr`])
  })

  it(`updates active attribute content and repositions it`, async () => {
    const element = create_element(`button`)
    element.setAttribute(`aria-label`, `Initial`)
    attach_tooltip(element)
    pointer_over(element)
    const tooltip_el = visible_tooltip()
    const initial_left = tooltip_el.style.left

    mock_rect(element, { left: 300, top: 100, width: 80, height: 30 })
    element.setAttribute(`aria-label`, `Updated`)
    await Promise.resolve()
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Updated`)
    expect(tooltip_el.style.left).not.toBe(initial_left)
  })

  it(`uses the final title from a batched update and restores it`, async () => {
    const { cleanup, element } = show_tooltip({}, `Initial`)

    element.title = `Intermediate`
    element.title = `Final`
    await Promise.resolve()
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Final`)
    expect(element.hasAttribute(`title`)).toBe(false)

    cleanup()
    expect(element.title).toBe(`Final`)
  })

  it(`keeps synchronous context mutations caused by title stripping`, async () => {
    const tag_name = `tooltip-title-context`
    if (!customElements.get(tag_name)) {
      customElements.define(
        tag_name,
        class extends HTMLElement {
          static observedAttributes = [`title`]
          attributeChangedCallback(): void {
            if (this.hasAttribute(`title`)) return
            this.style.setProperty(`--tooltip-bg`, `blue`)
            if (this.dataset.normalizeTitle === `true` && !this.dataset.normalized) {
              this.dataset.normalized = `true`
              this.title = `Normalized`
            }
          }
        },
      )
    }
    const element = create_element(tag_name)
    element.title = `Initial`
    const cleanup = attach_tooltip(element)
    element.style.setProperty(`--tooltip-bg`, `red`)
    pointer_over(element)
    const tooltip_el = visible_tooltip()
    expect(tooltip_el.style.getPropertyValue(`--tooltip-bg`)).toBe(`red`)

    element.dataset.normalizeTitle = `true`
    element.title = `Updated`
    await Promise.resolve()
    expect(tooltip_el.style.getPropertyValue(`--tooltip-bg`)).toBe(`blue`)
    expect(tooltip_el.textContent).toBe(`Normalized`)
    expect(element.hasAttribute(`title`)).toBe(false)
    cleanup()
    expect(element.title).toBe(`Normalized`)
  })

  it(`repositions on scroll through one coalesced animation frame`, () => {
    const element = create_element(`button`)
    element.title = `Moving`
    mock_rect(element, { left: 100, top: 100, width: 80, height: 30 })
    attach_tooltip(element)
    pointer_over(element)
    const tooltip_el = visible_tooltip()
    const first_top = tooltip_el.style.top

    mock_rect(element, { left: 100, top: 200, width: 80, height: 30 })
    window.dispatchEvent(new Event(`scroll`))
    vi.advanceTimersByTime(20)
    expect(tooltip_el.style.top).not.toBe(first_top)
  })

  it(`aims the arrow at an edge trigger after shifting`, () => {
    mock_tooltip_rect(200, 40)
    const element = create_element(`button`)
    element.title = `Edge`
    mock_rect(element, { left: 940, top: 100, width: 40, height: 20 })
    attach_tooltip(element, { placement: `bottom` })
    pointer_over(element)
    const tooltip_el = visible_tooltip()
    const arrow = doc_query(`.custom-tooltip-arrow`)

    expect(Number(tooltip_el.style.left.replace(/px$/u, ``))).toBeLessThan(860)
    expect(arrow.style.left).not.toBe(`calc(50% - 6px)`)
    expect(Number(arrow.style.left.replace(/px$/u, ``))).toBeGreaterThan(150)
  })

  it(`clips placement to a boundary element and appends the style option`, () => {
    mock_tooltip_rect(200, 100)
    const boundary = create_element()
    mock_rect(boundary, { left: 0, top: 0, width: 300, height: 200 })
    const element = create_element(`button`)
    element.title = `Bounded`
    mock_rect(element, { left: 100, top: 150, width: 80, height: 30 })
    // The 1000x800 viewport leaves room to the right; the boundary leaves only above.
    attach_tooltip(element, {
      placement: `auto`,
      boundary,
      style: `font-weight: bold`,
    })
    pointer_over(element)

    const tooltip_el = visible_tooltip()
    expect(tooltip_el.dataset.placement).toBe(`top`)
    expect(tooltip_el.style.fontWeight).toBe(`bold`)
  })

  it(`uses the Popover top layer when available`, () => {
    const show_popover = vi.fn()
    const hide_popover = vi.fn()
    cleanups.push(
      stub_prop(HTMLElement.prototype, `popover`, null),
      stub_prop(HTMLElement.prototype, `showPopover`, show_popover),
      stub_prop(HTMLElement.prototype, `hidePopover`, hide_popover),
    )
    const { element } = register_tooltip(`Top layer`, { strategy: `top-layer` })
    pointer_over(element)

    expect(show_popover).toHaveBeenCalledWith({ source: element })
    pointer_out(element)
    expect(hide_popover).toHaveBeenCalledOnce()
  })

  it(`falls back to the document layer without the Popover API`, () => {
    const properties = [`popover`, `showPopover`, `hidePopover`] as const
    const descriptors = properties.map((property) =>
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, property),
    )
    properties.forEach((property) =>
      Reflect.deleteProperty(HTMLElement.prototype, property),
    )
    cleanups.push(() => {
      properties.forEach((property, idx) => {
        const descriptor = descriptors[idx]
        if (descriptor) Object.defineProperty(HTMLElement.prototype, property, descriptor)
      })
    })
    const { cleanup, element, tooltip_el } = show_tooltip(
      { strategy: `top-layer` },
      `Fallback`,
    )

    expect(tooltip_el.style.position).toBe(`absolute`)
    pointer_out(element)
    expect(tooltip_el.hidden).toBe(true)
    expect(tooltip_el.style.display).toBe(`none`)
    cleanup()
    expect(document.querySelector(`.custom-tooltip`)).toBeNull()
    expect(element.title).toBe(`Fallback`)
  })
})

it(`register_escape_layer skips handled Escape and captures through stopped propagation`, () => {
  const layer = vi.fn()
  const unregister = register_escape_layer(layer)
  try {
    const handled = escape_key()
    handled.preventDefault()
    document.dispatchEvent(handled)
    expect(layer).not.toHaveBeenCalled()

    const blocker = create_element()
    const child = document.createElement(`button`)
    blocker.append(child)
    blocker.addEventListener(`keydown`, (event) => event.stopPropagation())
    const event = dispatch_key(child, `Escape`)
    expect(layer).toHaveBeenCalledWith(event)
  } finally {
    unregister()
  }
})

describe(`click_outside`, () => {
  const dispatch_press = (
    target: Element,
    path: EventTarget[] = [],
    kind = `pointerdown`,
    init: PointerEventInit = {},
  ) => {
    // a real PointerEvent so the scrollbar guard (MouseEvent-only) actually runs here, and
    // primary by default because the constructor's own default reads as a second finger.
    // A click gets detail: 1, which is how the dismissal tells a pointer click from a
    // keyboard or programmatic one — a bare Event would be judged as the latter.
    const event = kind.startsWith(`pointer`)
      ? new PointerEvent(kind, { bubbles: true, isPrimary: true, ...init })
      : new MouseEvent(kind, { bubbles: true, detail: 1, ...init })
    Object.defineProperty(event, `target`, { value: target })
    Object.defineProperty(event, `composedPath`, {
      value: () =>
        path.length > 0
          ? path
          : [target, document.body, document.documentElement, document, globalThis],
    })
    document.dispatchEvent(event)
    return event
  }

  // returns the event so callers can assert on identity or defaultPrevented
  const press_escape = (init: KeyboardEventInit = {}) => {
    const event = escape_key(init)
    document.dispatchEvent(event)
    return event
  }

  // document.body.innerHTML = '' leaves click_outside's document capture listeners
  // and Escape layers behind, which would decide later tests' assertions
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
  })

  // attaches click_outside to a fresh element wired to a spy callback
  const attach_outside = (config: Parameters<typeof click_outside>[0] = {}) => {
    const element = create_element()
    const callback = vi.fn()
    const cleanup = click_outside({ callback, ...config })(element)
    if (cleanup) cleanups.push(cleanup)
    return { element, callback, cleanup }
  }

  it(`disabled suppresses outside presses`, () => {
    const { callback } = attach_outside({ enabled: false })
    dispatch_press(create_element())
    expect(callback).not.toHaveBeenCalled()
  })

  it(`inside selectors keep matching regions from dismissing (single, multiple, nested)`, () => {
    const [modal, popover, nested] = [
      create_element(),
      create_element(),
      create_element(),
    ]
    modal.className = `modal`
    popover.className = `popover`
    modal.append(nested)

    const { callback } = attach_outside({ inside: [`.modal`, `.popover`] })

    dispatch_press(modal)
    dispatch_press(popover)
    dispatch_press(nested)
    expect(callback).not.toHaveBeenCalled()

    // control: proves the silence above is the inside list, not a dead listener
    dispatch_press(create_element())
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it(`triggers on clicks landing on SVG elements outside the node`, () => {
    const { callback } = attach_outside()

    const svg = document.createElementNS(`http://www.w3.org/2000/svg`, `svg`)
    document.body.append(svg)
    dispatch_press(svg)

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it(`dispatches a custom event without a callback`, () => {
    const element = create_element()
    const listener = vi.fn()
    element.addEventListener(`dismiss`, listener)
    const cleanup = click_outside({})(element) // no callback
    if (cleanup) cleanups.push(cleanup)
    dispatch_press(create_element())
    expect(listener).toHaveBeenCalled()
  })

  it(`dismisses only on outside presses and stops after cleanup`, () => {
    const { element, callback, cleanup } = attach_outside()
    dispatch_press(element)
    expect(callback).not.toHaveBeenCalled()

    const outside = create_element()
    const event = dispatch_press(outside)
    expect(callback).toHaveBeenCalledTimes(1)
    // the press comes along so consumers can forward it to their own onclose
    expect(callback.mock.calls[0][2]).toEqual({
      focus_inside: false,
      via: `pointer`,
      event,
    })

    // right-clicks and OS-captured drags never send this click, hence pointerdown
    outside.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(callback).toHaveBeenCalledTimes(1)

    cleanup?.()
    dispatch_press(outside)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  // Same selector, another instance's trigger: it must not shield this surface. The
  // function form is resolved per press, for a `bind:this` still null at setup — a
  // plain `scope` prop would have been captured null forever.
  it.each([`element`, `function`] as const)(
    `scope as %s confines inside selectors to one subtree`,
    (kind) => {
      const [own_scope, own_trigger, other_trigger] = [
        create_element(),
        create_element(),
        create_element(),
      ]
      own_trigger.className = `trigger`
      other_trigger.className = `trigger`
      own_scope.append(own_trigger)

      let scope_el: Element | null = kind === `element` ? own_scope : null
      const { callback } = attach_outside({
        inside: [`.trigger`],
        scope: kind === `element` ? own_scope : () => scope_el,
      })

      if (kind === `function`) {
        // unconstrained while null, so the selector still shields every match
        dispatch_press(other_trigger)
        expect(callback).not.toHaveBeenCalled()
        scope_el = own_scope
      }

      dispatch_press(own_trigger)
      expect(callback).not.toHaveBeenCalled()
      dispatch_press(other_trigger)
      expect(callback).toHaveBeenCalledTimes(1)
    },
  )

  it(`an element in inside counts as part of the surface`, () => {
    const portalled = create_element() // sibling in body, no longer a descendant
    const nested = document.createElement(`button`)
    portalled.append(nested)

    // null entries are the norm: the portal target binds after the first render
    const { callback } = attach_outside({ inside: [null, portalled] })

    dispatch_press(portalled)
    dispatch_press(nested)
    expect(callback).not.toHaveBeenCalled()

    dispatch_press(create_element())
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it(`Escape is opt-in, dismisses only the top layer, and stops page handlers`, () => {
    const without_escape = attach_outside()
    const page_handler = vi.fn()
    document.addEventListener(`keydown`, page_handler)
    cleanups.push(() => document.removeEventListener(`keydown`, page_handler))

    expect(press_escape().defaultPrevented).toBe(false)
    expect(without_escape.callback).not.toHaveBeenCalled()
    expect(page_handler).toHaveBeenCalledOnce()
    page_handler.mockClear()

    const outer = attach_outside({ escape: true })
    const inner = attach_outside({ escape: true })

    const event = press_escape()
    expect(inner.callback).toHaveBeenCalledTimes(1)
    expect(outer.callback).not.toHaveBeenCalled()
    expect(page_handler).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)

    // with the inner surface gone, the next Escape reaches the one behind it
    inner.cleanup?.()
    press_escape()
    expect(inner.callback).toHaveBeenCalledTimes(1)
    expect(outer.callback).toHaveBeenCalledTimes(1)
    outer.cleanup?.()
    press_escape()
    expect(page_handler).toHaveBeenCalledTimes(1)
  })

  it(`ignores a press on the page scrollbar`, () => {
    const { callback } = attach_outside()

    // no layout in the test DOM, so give the root a client box the gutter sits outside of
    const root = document.documentElement
    cleanups.push(
      stub_prop(root, `clientWidth`, 800),
      stub_prop(root, `clientHeight`, 600),
    )
    const press = (clientX: number, clientY: number) =>
      document.body.dispatchEvent(
        new PointerEvent(`pointerdown`, { bubbles: true, clientX, clientY }),
      )

    press(820, 300) // vertical scrollbar gutter
    press(400, 620) // horizontal scrollbar gutter
    expect(callback).not.toHaveBeenCalled()

    press(400, 300) // control: same target inside the client box does dismiss
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it(`ignores Escape that is only ending an IME composition`, () => {
    const { callback, cleanup } = attach_outside({ escape: true })

    press_escape({ isComposing: true })
    expect(callback).not.toHaveBeenCalled()

    press_escape()
    expect(callback).toHaveBeenCalledTimes(1)
    cleanup?.()
  })

  it(`tolerates an empty inside selector instead of throwing on every press`, () => {
    // a trailing empty entry makes the joined selector invalid, which would throw
    // out of the capture listener for every press anywhere on the page
    const { callback, cleanup } = attach_outside({ inside: [`.modal`, ``] })

    expect(() => dispatch_press(create_element())).not.toThrow()
    expect(callback).toHaveBeenCalledTimes(1)
    cleanup?.()
  })

  it.each([true, false])(`escape reports focus_inside=%s`, (focus_inside) => {
    const { element, callback, cleanup } = attach_outside({ escape: true })
    const inner = create_element()
    element.append(inner)
    const focus_target = focus_inside ? inner : create_element()
    focus_target.setAttribute(`tabindex`, `0`)
    focus_target.focus()

    const event = press_escape()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][2]).toEqual({ focus_inside, via: `escape`, event })
    cleanup?.()
  })

  // A surface living inside a shadow tree: document.activeElement reports the host,
  // which the surface does not contain, so only descending the chain finds the focus
  it(`escape sees focus on a node that shares the surface's shadow tree`, () => {
    const host = create_element()
    const surface = document.createElement(`div`)
    const inner = document.createElement(`button`)
    surface.append(inner)
    host.attachShadow({ mode: `open` }).append(surface)
    inner.focus()

    const callback = vi.fn()
    const cleanup = click_outside({ callback, escape: true })(surface)
    if (cleanup) cleanups.push(cleanup)
    const event = press_escape()

    expect(callback.mock.calls[0][2]).toEqual({
      focus_inside: true,
      via: `escape`,
      event,
    })
  })

  // Dragging or resizing the surface can release past its edge, and the browser then
  // reports the click on a common ancestor — outside. Only a gesture that both starts
  // and ends outside is a dismissal, else a resize would close what it was resizing.
  it(`dismiss_on: 'release' waits for clicks and ignores gestures started inside`, () => {
    const { element, callback } = attach_outside({ dismiss_on: `release` })
    const outside = create_element()

    dispatch_press(outside)
    expect(callback).not.toHaveBeenCalled()
    dispatch_press(outside, [], `click`)
    expect(callback).toHaveBeenCalledTimes(1)
    callback.mockClear()

    dispatch_press(element)
    dispatch_press(create_element(), [], `click`)
    expect(callback).not.toHaveBeenCalled()

    // the verdict is spent on that click, so the next outside click dismisses as usual
    dispatch_press(create_element(), [], `click`)
    expect(callback).toHaveBeenCalledTimes(1)

    // the OS claiming a gesture ends it without a click, so that verdict must not linger
    // for the next click either
    dispatch_press(element)
    dispatch_press(element, [], `pointercancel`)
    dispatch_press(create_element(), [], `click`)
    expect(callback).toHaveBeenCalledTimes(2)

    // nor may a right-click inside, which fires no click of its own at all
    dispatch_press(element, [], `pointerdown`, { button: 2 })
    dispatch_press(create_element(), [], `click`)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  // A press inside can end without any click at all — released off-screen, or the OS taking
  // over for a native drag. The verdict must not then be applied to a click that carries no
  // pointer of its own: keyboard Enter and .click() both report detail 0.
  it(`dismiss_on: 'release' still dismisses on a keyboard-driven click`, () => {
    const { element, callback } = attach_outside({ dismiss_on: `release` })
    const outside = create_element()

    dispatch_press(element) // pointerdown inside that never produces a click
    outside.dispatchEvent(new MouseEvent(`click`, { bubbles: true, detail: 0 }))

    expect(callback).toHaveBeenCalledTimes(1)
  })

  // Capture phase is what makes dismissal unsuppressable, and its price is running before
  // the pressed control's own handler — so a control that toggles the surface from its click
  // handler belongs in `inside`; `release` cannot reorder that one for it (a control bound to
  // the state is the case `release` does fix, see DraggablePane's checkbox tests)
  it(`dismisses from the capture phase, ahead of the pressed control's handler`, () => {
    const order: string[] = []
    const { callback } = attach_outside({ dismiss_on: `release` })
    callback.mockImplementation(() => order.push(`dismiss`))
    const control = create_element(`button`)
    control.addEventListener(`click`, (event) => {
      event.stopPropagation() // cannot suppress a dismissal that already ran
      order.push(`control`)
    })

    control.dispatchEvent(new PointerEvent(`click`, { bubbles: true }))
    expect(order).toEqual([`dismiss`, `control`])
  })
})

describe(`dismiss_on_outside_press`, () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
  })

  const press = (target: Element) =>
    target.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))

  const listen = (options: Parameters<typeof dismiss_on_outside_press>[0] = {}) => {
    const callback = vi.fn()
    const cleanup = dismiss_on_outside_press({ callback, ...options })
    cleanups.push(cleanup)
    return { callback, cleanup }
  }

  // One listener over several disjoint menus in a panel, which is exactly what the
  // attachment cannot express: a wrapper around them all would count every press
  // between them as inside.
  it(`without a node, inside alone decides membership`, () => {
    const panel = create_element()
    const [menu_a, menu_b] = [create_element(), create_element()]
    const panel_filler = create_element()
    for (const menu of [menu_a, menu_b]) menu.className = `header-menu-root`
    panel.append(menu_a, panel_filler, menu_b)

    // dismiss does not bubble, so this negative assertion requires capture.
    const document_listener = vi.fn()
    document.addEventListener(`dismiss`, document_listener, true)
    cleanups.push(() => document.removeEventListener(`dismiss`, document_listener, true))
    const { callback } = listen({ inside: [`.header-menu-root`] })

    press(menu_a)
    press(menu_b)
    expect(callback).not.toHaveBeenCalled()

    // between the two menus but still inside the panel: an attached surface would
    // have to count this as inside, a node-less listener must not
    press(panel_filler)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toMatchObject({ via: `pointer` })
    expect(document_listener).not.toHaveBeenCalled()
  })

  it(`escape reports focus_inside from the inside selectors alone`, () => {
    const menu = create_element()
    menu.className = `header-menu-root`
    const focusable = document.createElement(`button`)
    menu.append(focusable)
    focusable.focus()

    const { callback } = listen({ inside: [`.header-menu-root`], escape: true })
    document.dispatchEvent(escape_key())

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toMatchObject({ focus_inside: true, via: `escape` })
  })

  it(`disabled registers no listener and returns a callable cleanup`, () => {
    const { callback, cleanup } = listen({ enabled: false })

    press(create_element())
    expect(callback).not.toHaveBeenCalled()
    expect(() => cleanup()).not.toThrow()
  })
})

describe(`hotkey`, () => {
  const keydown = (target: EventTarget, key: string, modifiers = {}) => {
    const event = new KeyboardEvent(`keydown`, {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    })
    target.dispatchEvent(event)
    return event
  }

  // a global binding outlives document.body.innerHTML = '', so dispose every one
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
  })
  const attach_hotkey = (
    options: Parameters<typeof hotkey>[0],
    node = create_element(),
  ) => {
    const cleanup = hotkey(options)(node)
    if (cleanup) cleanups.push(cleanup)
    return { node, cleanup }
  }

  it(`fires on its own node only, and anywhere on the page when global`, () => {
    const handler = vi.fn()
    const { node, cleanup } = attach_hotkey({ bindings: [{ keys: `ctrl+k`, handler }] })

    const event = keydown(node, `k`, { ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)

    keydown(create_element(), `k`, { ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)

    cleanup?.()
    keydown(node, `k`, { ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)

    // `global` is the opt-out: that binding answers from anywhere on the page
    const anywhere = vi.fn()
    attach_hotkey({ bindings: [{ keys: `ctrl+j`, handler: anywhere }], global: true })
    keydown(create_element(), `j`, { ctrlKey: true })
    expect(anywhere).toHaveBeenCalledTimes(1)
  })

  it(`leaves bare keys to text fields unless told otherwise`, () => {
    const input = create_element(`input`)
    const [typed, forced, chord] = [vi.fn(), vi.fn(), vi.fn()]
    attach_hotkey({
      global: true,
      bindings: [
        { keys: `/`, handler: typed },
        { keys: `?`, handler: forced, allow_in_inputs: true },
        { keys: `ctrl+/`, handler: chord },
      ],
    })

    keydown(input, `/`)
    expect(typed).not.toHaveBeenCalled() // the user is typing a slash

    keydown(input, `?`)
    expect(forced).toHaveBeenCalledTimes(1)

    keydown(input, `/`, { ctrlKey: true })
    expect(chord).toHaveBeenCalledTimes(1) // a chord is never typing
  })

  it(`runs the first enabled match only and can leave the default alone`, () => {
    const [off, first, second] = [vi.fn(), vi.fn(), vi.fn()]
    const { node } = attach_hotkey({
      bindings: [
        { keys: `ctrl+k`, handler: off, enabled: false },
        { keys: [`ctrl+j`, `ctrl+k`], handler: first, prevent_default: false },
        { keys: `ctrl+k`, handler: second },
      ],
    })

    const event = keydown(node, `k`, { ctrlKey: true })
    expect(off).not.toHaveBeenCalled()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it.each([
    [`Macintosh; Intel Mac OS X 10_15`, { metaKey: true }, { ctrlKey: true }],
    [`X11; Linux x86_64`, { ctrlKey: true }, { metaKey: true }],
  ])(`mod follows the platform (%s)`, (user_agent, matching, other) => {
    cleanups.push(stub_prop(globalThis.navigator, `userAgent`, user_agent))
    const handler = vi.fn()
    const { node } = attach_hotkey({ bindings: [{ keys: `mod+k`, handler }] })

    keydown(node, `k`, other)
    expect(handler).not.toHaveBeenCalled()

    keydown(node, `k`, matching)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it(`stays quiet mid IME composition and when disabled`, () => {
    const node = create_element()
    const handler = vi.fn()
    const { cleanup } = attach_hotkey(
      { bindings: [{ keys: `ctrl+k`, handler }], enabled: false },
      node,
    )
    expect(cleanup).toBeUndefined()
    keydown(node, `k`, { ctrlKey: true })
    expect(handler).not.toHaveBeenCalled()

    attach_hotkey({ bindings: [{ keys: `Enter`, handler }] }, node)
    keydown(node, `Enter`, { isComposing: true })
    expect(handler).not.toHaveBeenCalled()
    keydown(node, `Enter`)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})

describe(`focus_trap`, () => {
  const make_surface = (count = 3) => {
    const surface = create_element()
    const buttons = Array.from({ length: count }, () => document.createElement(`button`))
    surface.append(...buttons)
    return { surface, buttons }
  }

  // returned so callers can assert whether the key was swallowed
  const press_tab = (shiftKey = false) => dispatch_key(document, `Tab`, { shiftKey })
  const press_escape = () => dispatch_key(document, `Escape`)

  // focus lands outside, then the microtask a recapture would schedule gets to run
  const focus_out_to = async (target: HTMLElement) => {
    target.focus()
    await Promise.resolve()
    return document.activeElement
  }

  // the trap layer stack is module-global, so a leaked trap steers a later test's Tab
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
  })
  const attach_trap = (surface: HTMLElement, options: FocusTrapOptions = {}) => {
    const cleanup = focus_trap(options)(surface)
    if (cleanup) cleanups.push(cleanup)
    return cleanup
  }

  it(`focuses the first tabbable, then cycles Tab both ways past the ends`, () => {
    const { surface, buttons } = make_surface()
    attach_trap(surface)
    expect(document.activeElement).toBe(buttons[0])

    press_tab()
    expect(document.activeElement).toBe(buttons[1])
    press_tab()
    press_tab()
    expect(document.activeElement).toBe(buttons[0]) // wrapped past the last
    press_tab(true)
    expect(document.activeElement).toBe(buttons[2]) // and back past the first
  })

  it(`orders and filters structural Tab candidates`, () => {
    const surface = create_element()
    surface.innerHTML = `
      <button id="three" tabindex="3"></button><button id="one" tabindex="1"></button>
      <button id="plain"></button><button disabled></button><button tabindex="-1"></button>
      <input type="radio" name="choice"><input id="checked" type="radio" name="choice" checked>
      <details><summary id="summary"></summary><button></button></details>
      <fieldset disabled><legend><button id="legend"></button></legend><button></button></fieldset>
      <div hidden><button></button></div>
    `
    attach_trap(surface)

    for (const id of [`three`, `plain`, `checked`, `summary`, `legend`, `one`]) {
      press_tab()
      expect(document.activeElement).toBe(surface.querySelector(`#${id}`))
    }
  })

  it(`walks into an open shadow root`, () => {
    const { surface, buttons } = make_surface(1)
    const host = document.createElement(`div`)
    const shadow = host.attachShadow({ mode: `open` })
    shadow.append(document.createElement(`button`))
    buttons[0].before(host)

    attach_trap(surface)
    expect(shadow.activeElement).toBe(shadow.querySelector(`button`))
    press_tab()
    expect(document.activeElement).toBe(buttons[0])
  })

  // an <a href> inside an <svg> is focusable and matches tabbable_selector, but it is an
  // SVGElement, so looking the active element up with a HTMLElement-typed indexOf misses
  // it and Tab jumps back to the edge instead of stepping to the neighbor
  it(`steps past an SVG focusable instead of jumping to the edge`, () => {
    const { surface, buttons } = make_surface()
    const svg = document.createElementNS(`http://www.w3.org/2000/svg`, `svg`)
    const svg_link = document.createElementNS(`http://www.w3.org/2000/svg`, `a`)
    svg_link.setAttribute(`href`, `#target`)
    svg.append(svg_link)
    buttons[0].after(svg)

    attach_trap(surface)
    svg_link.focus()
    expect(document.activeElement).toBe(svg_link)

    press_tab()
    expect(document.activeElement).toBe(buttons[1])
  })

  it.each([
    [`a selector`, `.wanted`],
    [`no initial focus`, false],
  ] as const)(`initial: %s`, (_desc, initial) => {
    const { surface, buttons } = make_surface()
    buttons[2].className = `wanted`
    const outside = create_element(`button`)
    outside.focus()

    attach_trap(surface, { initial })
    expect(document.activeElement).toBe(initial === false ? outside : buttons[2])
  })

  it(`restores to the trigger, to a named element, or wherever the user moved it`, () => {
    const trigger = create_element(`button`)
    trigger.focus()
    const { surface } = make_surface()
    focus_trap()(surface)?.()
    expect(document.activeElement).toBe(trigger)

    const elsewhere = create_element(`button`)
    focus_trap({ restore: elsewhere })(surface)?.()
    expect(document.activeElement).toBe(elsewhere)

    // a deliberate move out during the trap's life outranks the recorded trigger
    trigger.focus()
    const cleanup = focus_trap()(surface)
    elsewhere.focus()
    cleanup?.()
    expect(document.activeElement).toBe(elsewhere)
  })

  it(`gives Tab to the innermost trap only`, () => {
    const outer = make_surface()
    const inner = make_surface()
    attach_trap(outer.surface)
    const cleanup_inner = attach_trap(inner.surface)
    expect(document.activeElement).toBe(inner.buttons[0])

    press_tab()
    expect(document.activeElement).toBe(inner.buttons[1])

    // the outer trap takes over once the inner surface is gone
    cleanup_inner?.()
    outer.buttons[0].focus()
    press_tab()
    expect(document.activeElement).toBe(outer.buttons[1])
  })

  // The trap listens on the document, so a surface that was never given focus must
  // not confiscate Tab from the rest of the page. Nav pins a submenu while focus
  // stays on the toggle outside it, and Tab there has to keep walking the page.
  it(`leaves Tab alone while focus sits outside the trap`, () => {
    const { surface, buttons } = make_surface()
    const outside = create_element(`button`)
    outside.focus()

    attach_trap(surface, { initial: false })
    expect(document.activeElement).toBe(outside) // initial: false kept focus put

    const event = press_tab()
    expect(document.activeElement).toBe(outside) // not dragged into the surface
    expect(event.defaultPrevented).toBe(false) // the browser still gets its Tab

    // once focus is inside, the trap takes over again
    buttons[0].focus()
    press_tab()
    expect(document.activeElement).toBe(buttons[1])
  })

  it(`covers portalled parts of the same surface via include`, () => {
    const { surface, buttons } = make_surface(1)
    const portalled = create_element() // moved to body, no longer a descendant
    const portalled_button = document.createElement(`button`)
    portalled.append(portalled_button)

    attach_trap(surface, { include: [null, portalled] })
    expect(document.activeElement).toBe(buttons[0])
    press_tab()
    expect(document.activeElement).toBe(portalled_button)
  })

  it(`does nothing when disabled`, () => {
    const { surface } = make_surface()
    const outside = create_element(`button`)
    outside.focus()

    expect(focus_trap({ enabled: false })(surface)).toBeUndefined()
    expect(document.activeElement).toBe(outside)
    press_tab()
    expect(document.activeElement).toBe(outside)
  })

  // Layered modal: backdrop button beside a dialog; only the dialog is in the Tab cycle.
  const make_layer = () => {
    const layer = create_element()
    const backdrop = document.createElement(`button`)
    const dialog = document.createElement(`section`)
    dialog.className = `dialog`
    const first = document.createElement(`button`)
    const last = document.createElement(`button`)
    dialog.append(first, last)
    layer.append(backdrop, dialog)
    return { layer, backdrop, dialog, first, last }
  }

  it(`without root the whole node is the trap, backdrop included`, () => {
    const { layer, backdrop, first } = make_layer()
    attach_trap(layer)
    expect(document.activeElement).toBe(backdrop) // first tabbable in DOM order
    press_tab()
    expect(document.activeElement).toBe(first)
  })

  it.each([`selector`, `element`, `function`] as const)(
    `root as %s keeps the sibling backdrop out of the Tab cycle`,
    (kind) => {
      const { layer, backdrop, dialog, first, last } = make_layer()
      const root =
        kind === `selector` ? `.dialog` : kind === `element` ? dialog : () => dialog
      attach_trap(layer, { root })

      expect(document.activeElement).toBe(first) // the backdrop is no longer reachable
      press_tab()
      expect(document.activeElement).toBe(last)
      press_tab()
      expect(document.activeElement).toBe(first) // wrapped, never onto the backdrop
      press_tab(true)
      expect(document.activeElement).toBe(last)

      // `root` narrows what Tab cycles, not what counts as inside: clicking the backdrop
      // focuses it, and if that read as outside the trap it would disarm Tab entirely
      backdrop.focus()
      expect(press_tab().defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(first)
    },
  )

  it(`resolves initial within root, and falls back to the node when root finds nothing`, () => {
    const { layer, dialog, last } = make_layer()
    const decoy = document.createElement(`button`)
    decoy.className = `wanted` // outside the root, so the selector must not reach it
    layer.prepend(decoy)
    last.className = `wanted`
    attach_trap(layer, { root: dialog, initial: `.wanted` })
    expect(document.activeElement).toBe(last)

    const unresolvable = make_layer()
    attach_trap(unresolvable.layer, { root: () => null })
    expect(document.activeElement).toBe(unresolvable.backdrop) // back to the node
  })

  it(`handles Escape only when configured and only in the innermost trap`, () => {
    const plain = make_surface()
    const cleanup_plain = attach_trap(plain.surface)
    expect(press_escape().defaultPrevented).toBe(false)
    cleanup_plain?.()

    const outer = make_surface()
    const inner = make_surface()
    const on_outer = vi.fn()
    const on_inner = vi.fn()
    attach_trap(outer.surface, { on_escape: on_outer })
    const cleanup_inner = attach_trap(inner.surface, { on_escape: on_inner })

    const event = press_escape()
    expect(on_inner).toHaveBeenCalledTimes(1)
    expect(on_outer).not.toHaveBeenCalled()
    // canceled on purpose: a native <dialog> around the surface then stays open
    // until a second Escape lands with this layer gone
    expect(event.defaultPrevented).toBe(true)

    cleanup_inner?.()
    press_escape()
    expect(on_outer).toHaveBeenCalledTimes(1)
    expect(on_inner).toHaveBeenCalledTimes(1)
  })

  // Recapture restores the last inside focus, not the trap's entry point.
  it(`recapture pulls focus back to the last element that held it inside`, async () => {
    const { surface, buttons } = make_surface()
    attach_trap(surface, { recapture: true })
    expect(document.activeElement).toBe(buttons[0])

    buttons[2].focus()
    expect(await focus_out_to(create_element(`button`))).toBe(buttons[2])
  })

  // A recapture re-resolves `root`, so a trap can inject its fallback tabindex into
  // more than one element over its life and owes all of them a cleanup.
  it(`takes the injected tabindex off every root it fell back to`, async () => {
    const surface = create_element()
    // no tabbables in either panel, so the root itself is the fallback focus target
    const panels = [document.createElement(`div`), document.createElement(`div`)]
    surface.append(...panels)
    let current = panels[0]

    const cleanup = attach_trap(surface, {
      root: () => current,
      recapture: true,
      restore: false,
    })
    expect(panels[0].getAttribute(`tabindex`)).toBe(`-1`)

    // the first panel goes away as focus leaves, so the recapture resolves the other
    current = panels[1]
    create_element(`button`).focus()
    panels[0].remove()
    await Promise.resolve()
    expect(panels[1].getAttribute(`tabindex`)).toBe(`-1`)

    cleanup?.()
    expect(panels.map((panel) => panel.hasAttribute(`tabindex`))).toEqual([false, false])
  })

  // the counterpart of the holds_focus guard on Tab: a trap that was never given
  // focus must not summon it on every focus move elsewhere on the page
  it(`recapture stays out of focus moves that never touched the trap`, async () => {
    const { surface } = make_surface()
    const elsewhere = create_element(`button`)
    attach_trap(surface, { recapture: true, initial: false })

    create_element(`button`).focus() // a focus move that never touches the trap
    expect(await focus_out_to(elsewhere)).toBe(elsewhere)
  })

  it(`leaves escaped focus alone without recapture, and after teardown with it`, async () => {
    const { surface, buttons } = make_surface()
    const outside = create_element(`button`)

    const cleanup_plain = attach_trap(surface, { restore: false })
    buttons[1].focus()
    expect(await focus_out_to(outside)).toBe(outside) // no recapture by default
    cleanup_plain?.()

    const cleanup = focus_trap({ recapture: true, restore: false })(surface)
    buttons[1].focus()
    cleanup?.()
    expect(await focus_out_to(outside)).toBe(outside) // a torn-down trap stops recapturing
  })

  // Hygiene rather than behavior — the guard above already silences a late microtask —
  // but without this every surface that opens leaks a pair of document listeners for
  // the rest of the page's life.
  it(`recapture takes its document listeners off again on teardown`, () => {
    const removals = vi.spyOn(document, `removeEventListener`)
    focus_trap({ recapture: true, restore: false })(make_surface().surface)?.()

    expect(removals.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining([`focusin`, `focusout`]),
    )
    removals.mockRestore()
  })
})

describe(`draggable`, () => {
  // fixed positioning makes the attachment read getBoundingClientRect, which mock_rect
  // controls; the offset* fallback path has its own case below
  const create_fixed_box = (
    rect: Parameters<typeof mock_rect>[1] = { left: 10, top: 20 },
  ) => {
    const element = create_element(`div`, { position: `fixed` })
    mock_rect(element, rect)
    return element
  }

  // a second primary press (mouse while a touch is down) would orphan the first follower,
  // whose window listeners then outlive cleanup and keep moving a detached node
  it(`ignores a second primary press mid-drag`, () => {
    const element = create_fixed_box()
    const on_drag = vi.fn()
    const cleanup = draggable({ on_drag })(element)

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5, { pointerId: 1 }))
    element.dispatchEvent(pointer_event(`pointerdown`, 8, 8, { pointerId: 2 }))
    cleanup?.()
    on_drag.mockClear()

    globalThis.dispatchEvent(pointer_event(`pointermove`, 55, 55, { pointerId: 1 }))
    expect(on_drag).not.toHaveBeenCalled()
  })

  it(`updates position, callbacks, cursor and userSelect while dragging`, () => {
    const element = create_fixed_box()
    Object.assign(element.style, {
      right: `3px`,
      bottom: `4px`,
      cursor: `pointer`,
      touchAction: `pan-y`,
    })
    const [on_drag_start, on_drag, on_drag_end] = [vi.fn(), vi.fn(), vi.fn()]

    const cleanup = draggable({ on_drag_start, on_drag, on_drag_end })(element)
    expect(element.style.cursor).toBe(`grab`)
    expect(element.style.touchAction).toBe(`none`)

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))
    expect(element.style.left).toBe(`10px`)
    expect(element.style.top).toBe(`20px`)
    expect(element.style.cursor).toBe(`grabbing`)
    expect(document.body.style.userSelect).toBe(`none`)
    expect(on_drag_start).toHaveBeenCalledOnce()

    globalThis.dispatchEvent(pointer_event(`pointermove`, 15, 25))
    expect(element.style.left).toBe(`20px`)
    expect(element.style.top).toBe(`40px`)
    expect(element.style.right).toBe(`auto`)
    expect(element.style.bottom).toBe(`auto`)
    expect(on_drag).toHaveBeenCalledOnce()

    globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))
    expect(on_drag_end).toHaveBeenCalledOnce()
    expect(element.style.cursor).toBe(`grab`)
    expect(document.body.style.userSelect).toBe(``)

    cleanup?.()
    expect(element.style.cursor).toBe(`pointer`)
    expect(element.style.touchAction).toBe(`pan-y`)
  })

  it.each([
    [`x`, [`40px`, `2px`, `auto`, `4px`]],
    [`y`, [`1px`, `60px`, `3px`, `auto`]],
  ] as const)(`locks dragging to the %s axis`, (axis, expected) => {
    const element = create_fixed_box()
    Object.assign(element.style, {
      left: `1px`,
      top: `2px`,
      right: `3px`,
      bottom: `4px`,
    })
    draggable({ axis })(element)

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 35, 45))

    expect([
      element.style.left,
      element.style.top,
      element.style.right,
      element.style.bottom,
    ]).toEqual(expected)
    globalThis.dispatchEvent(pointer_event(`pointerup`, 35, 45))
  })

  it(`keeps a fixed node within viewport-coordinate bounds`, () => {
    const element = create_fixed_box()
    draggable({ bounds: { top: 0, right: 120, bottom: 80, left: 0 } })(element)
    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))

    globalThis.dispatchEvent(pointer_event(`pointermove`, 100, 100))
    expect([element.style.left, element.style.top]).toEqual([`20px`, `30px`])

    globalThis.dispatchEvent(pointer_event(`pointermove`, -100, -100))
    expect([element.style.left, element.style.top]).toEqual([`0px`, `0px`])
    globalThis.dispatchEvent(pointer_event(`pointerup`, -100, -100))
  })

  it.each([`parent`, `element`] as const)(
    `contains offset-positioned nodes within a %s bound`,
    (kind) => {
      const parent = create_element()
      mock_rect(parent, { left: 100, top: 200, width: 300, height: 200 })
      const element = create_element(`div`, { position: `absolute` })
      parent.append(element)
      mock_rect(element, { left: 125, top: 235, width: 50, height: 40 })
      Object.defineProperties(element, {
        offsetLeft: { value: 25, configurable: true },
        offsetTop: { value: 35, configurable: true },
      })
      draggable({ bounds: kind === `parent` ? `parent` : parent })(element)
      element.dispatchEvent(pointer_event(`pointerdown`, 0, 0))

      globalThis.dispatchEvent(pointer_event(`pointermove`, 500, 500))
      expect([element.style.left, element.style.top]).toEqual([`250px`, `160px`])

      globalThis.dispatchEvent(pointer_event(`pointermove`, -500, -500))
      expect([element.style.left, element.style.top]).toEqual([`0px`, `0px`])
      globalThis.dispatchEvent(pointer_event(`pointerup`, -500, -500))
    },
  )

  it(`ignores element bounds that generate no box`, () => {
    const parent = create_element()
    mock_rect(parent, { left: 0, top: 0, width: 0, height: 0 })
    const element = create_fixed_box()
    parent.append(element)
    draggable({ bounds: `parent` })(element)
    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 15, 25))

    expect([element.style.left, element.style.top]).toEqual([`20px`, `40px`])
    globalThis.dispatchEvent(pointer_event(`pointerup`, 15, 25))
  })

  it(`pins the leading edge when the node is larger than its bounds`, () => {
    const element = create_fixed_box({ left: 10, top: 20, width: 150, height: 100 })
    draggable({ bounds: new DOMRect(0, 0, 100, 80) })(element)
    element.dispatchEvent(pointer_event(`pointerdown`, 0, 0))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 100, 100))

    expect([element.style.left, element.style.top]).toEqual([`0px`, `0px`])
    globalThis.dispatchEvent(pointer_event(`pointerup`, 100, 100))
  })

  it(`ignores moves and releases from another pointer`, () => {
    const element = create_fixed_box()
    const on_drag_end = vi.fn()
    draggable({ on_drag_end })(element)

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5, { pointerId: 1 }))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 50, 50, { pointerId: 2 }))
    globalThis.dispatchEvent(pointer_event(`pointerup`, 50, 50, { pointerId: 2 }))
    expect([element.style.left, element.style.top]).toEqual([`10px`, `20px`])
    expect(on_drag_end).not.toHaveBeenCalled()

    globalThis.dispatchEvent(pointer_event(`pointermove`, 15, 25, { pointerId: 1 }))
    globalThis.dispatchEvent(pointer_event(`pointerup`, 15, 25, { pointerId: 1 }))
    expect([element.style.left, element.style.top]).toEqual([`20px`, `40px`])
    expect(on_drag_end).toHaveBeenCalledOnce()
  })

  it.each([
    [`a non-primary button`, { button: 2 }],
    [`a second finger`, { isPrimary: false }],
  ])(`does not start dragging from %s`, (_desc, init) => {
    const element = create_fixed_box()
    draggable({})(element)
    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5, init))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 50, 50))
    expect([element.style.left, element.style.top]).toEqual([``, ``])
  })

  // Either ends the drag: nothing further arrives for a pointer that was canceled or whose
  // capture went away. `lostpointercapture` is dispatched on the capture target, not window.
  it.each([
    [
      `pointercancel`,
      (el: HTMLElement, id: number) =>
        globalThis.dispatchEvent(pointer_event(`pointercancel`, 0, 0, { pointerId: id })),
    ],
    [
      `lostpointercapture`,
      (el: HTMLElement, id: number) =>
        el.dispatchEvent(pointer_event(`lostpointercapture`, 0, 0, { pointerId: id })),
    ],
  ])(`ends the drag on %s`, (_end_type, dispatch_end) => {
    const element = create_fixed_box()
    const on_drag_end = vi.fn()
    draggable({ on_drag_end })(element)

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5, { pointerId: 3 }))
    expect(element.hasPointerCapture(3)).toBe(true)

    dispatch_end(element, 3)
    expect(on_drag_end).toHaveBeenCalledOnce()
    expect(document.body.style.userSelect).toBe(``)
    expect(element.hasPointerCapture(3)).toBe(false)
    globalThis.dispatchEvent(pointer_event(`pointermove`, 50, 50, { pointerId: 3 }))
    expect([element.style.left, element.style.top]).toEqual([`10px`, `20px`])
  })

  it(`does not set up dragging when disabled`, () => {
    const element = create_fixed_box()
    const cleanup = draggable({ disabled: true })(element)
    expect(cleanup).toBeUndefined()
    expect(element.style.cursor).toBe(``)

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 50, 50))
    expect([element.style.left, element.style.top]).toEqual([``, ``])
  })

  it(`warns and returns undefined for a missing handle selector`, () => {
    const element = create_element()
    const warn_spy = vi.spyOn(console, `warn`).mockImplementation(() => {})

    const cleanup = draggable({ handle_selector: `.nonexistent` })(element)

    expect(cleanup).toBeUndefined()
    expect(warn_spy).toHaveBeenCalledWith(expect.stringContaining(`.nonexistent`))
    warn_spy.mockRestore()
  })

  it(`drags only when the event originates from handle_selector`, () => {
    const element = create_fixed_box({ left: 0, top: 0 })

    const handle = document.createElement(`div`)
    handle.className = `drag-handle`
    element.append(handle)

    const attach = draggable({ handle_selector: `.drag-handle` })
    attach(element)

    // press on element (not handle) should not start dragging
    element.dispatchEvent(pointer_event(`pointerdown`, 0, 0))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 50, 50))
    expect(element.style.left).toBe(``)
    expect(element.style.top).toBe(``)

    // press on handle should start dragging
    handle.dispatchEvent(pointer_event(`pointerdown`, 0, 0))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 30, 40))
    expect(element.style.left).toBe(`30px`)
    expect(element.style.top).toBe(`40px`)
  })

  it(`resets body userSelect and cursor when cleaned up mid-drag`, () => {
    const element = create_fixed_box({ left: 0, top: 0 })

    const cleanup = draggable()(element)
    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))
    expect(document.body.style.userSelect).toBe(`none`)
    expect(element.style.cursor).toBe(`grabbing`)

    cleanup?.() // unmount mid-drag, before any release
    expect(document.body.style.userSelect).toBe(``)
    expect(element.style.cursor).toBe(``)

    globalThis.dispatchEvent(pointer_event(`pointermove`, 100, 100))
    expect(element.style.left).toBe(`0px`)
    expect(element.style.top).toBe(`0px`)
  })
})

describe(`highlight_matches`, () => {
  let mock_element: HTMLElement
  let mock_css_highlights: Map<string, unknown>
  let clear_highlights_spy: ReturnType<typeof vi.fn>
  let set_highlights_spy: ReturnType<typeof vi.fn>
  let delete_highlights_spy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mock_element = document.createElement(`div`)
    const stub = stub_css_highlights()
    mock_css_highlights = stub.registry
    clear_highlights_spy = stub.clear_spy
    set_highlights_spy = stub.set_spy
    delete_highlights_spy = stub.delete_spy
  })

  // the timing cases below opt into fake timers individually, so undo it centrally
  afterEach(() => vi.useRealTimers())

  const get_highlight_ranges = (): Range[] => {
    const highlight = mock_css_highlights.get(`highlight-match`) as
      | { ranges?: Range[] }
      | undefined
    if (!Array.isArray(highlight?.ranges)) throw new Error(`Expected highlight ranges`)
    return highlight.ranges
  }

  it.each([
    // Early returns
    [`whitespace-only query`, ` \t\n `, `a b`, false, undefined, undefined],

    // Substring highlighting (fuzzy=false)
    [`case insensitive`, `test`, `<p>Test with TEST and TeSt</p>`, false, 3, undefined],
    [`no cross-node match`, `bc`, `<ul><li>ab</li><li>cd</li></ul>`, false, 0, undefined],
    [`no matches`, `xyz`, `<p>Content without search term</p>`, false, 0, undefined],

    // Fuzzy highlighting (fuzzy=true)
    [`fuzzy no matches`, `xyz`, `<p>Content without search term</p>`, true, 0, undefined],
    [
      `skip with node_filter`,
      `test`,
      `<div>Test content</div><li class="user-msg">Test hidden</li>`,
      false,
      1,
      (node: Node) =>
        node?.parentElement?.closest(`li.user-msg`)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    ],
  ])(`%s`, (_desc, query, html_content, fuzzy, expected_range_count, node_filter) => {
    mock_element.innerHTML = html_content
    const cleanup = highlight_matches({ query, fuzzy, node_filter })(mock_element)

    expect(mock_css_highlights.size).toBe(expected_range_count === undefined ? 0 : 1)
    expect(clear_highlights_spy).not.toHaveBeenCalled()
    if (expected_range_count !== undefined) {
      expect(set_highlights_spy).toHaveBeenCalledWith(
        `highlight-match`,
        expect.any(Object),
      )
      expect(get_highlight_ranges()).toHaveLength(expected_range_count)
    }
    cleanup?.()
  })

  it(`normalizes query and source whitespace without shifting ranges`, () => {
    mock_element.textContent = `form\n submit`
    const cleanup = highlight_matches({ query: ` form  submit ` })(mock_element)

    expect(get_highlight_ranges().map((range) => range.toString())).toEqual([
      `form\n submit`,
    ])
    cleanup?.()
  })

  it.each([
    [`CSS is missing`, () => vi.stubGlobal(`CSS`, undefined)],
    // a registry without the constructor is what a partial polyfill or a stub in a
    // consumer's test leaves behind; constructing a Highlight there throws
    [`Highlight is missing`, () => vi.stubGlobal(`Highlight`, undefined)],
  ])(`runs range effects when %s`, (_desc, prepare) => {
    prepare()
    mock_element.textContent = `PageSearch result`
    const on_highlight = vi.fn()

    const cleanup = highlight_matches({ query: `PageSearch`, on_highlight })(mock_element)

    expect(on_highlight).toHaveBeenCalledExactlyOnceWith({
      node: mock_element,
      ranges: [expect.any(Range)],
    })
    expect(set_highlights_spy).not.toHaveBeenCalled()
    cleanup?.()
  })

  it.each([
    [`disabled scrolling`, false, undefined],
    [
      `custom scrolling`,
      { behavior: `instant`, block: `start`, inline: `nearest` },
      { behavior: `instant`, block: `start`, inline: `nearest` },
    ],
  ] as const)(`supports %s`, (_description, scroll_to_match, expected_options) => {
    mock_element.textContent = `PageSearch result`
    const scroll_into_view = vi.fn()
    mock_element.scrollIntoView = scroll_into_view

    const cleanup = highlight_matches({
      query: `PageSearch`,
      scroll_to_match,
    })(mock_element)

    expect(scroll_into_view.mock.calls).toEqual(
      expected_options ? [[expected_options]] : [],
    )
    cleanup?.()
  })

  it(`fuzzy highlighting marks matching characters in order`, () => {
    mock_element.innerHTML = `<p>allow-user-options</p>`

    highlight_matches({ query: `auo`, fuzzy: true })(mock_element)

    const ranges = get_highlight_ranges()
    expect(ranges.map((range) => [range.startOffset, range.endOffset])).toEqual([
      [0, 1],
      [6, 7],
      [11, 12],
    ])
  })

  // 'İ' (U+0130) lowercases to 2 UTF-16 units, shifting offsets computed on the
  // lowercased text. Ranges must map back to the ORIGINAL character positions
  // (and never exceed the node length). 'İİİab': lowered is 'i̇i̇i̇ab' so naive
  // offsets for 'a'/'b' would be 6/7 — the correct original offsets are 3/4.
  it.each([
    [`substring`, false],
    [`fuzzy`, true],
  ])(
    `%s highlighting maps offsets back to original text when lowercasing changes length`,
    (_desc, fuzzy) => {
      mock_element.innerHTML = `<p>İİİab</p>`

      expect(() => highlight_matches({ query: `ab`, fuzzy })(mock_element)).not.toThrow()
      const ranges = get_highlight_ranges()
      const offsets = ranges.map((range) => [range.startOffset, range.endOffset])
      // substring: one 'ab' range; fuzzy: single-char ranges for 'a' and 'b'
      expect(offsets).toEqual(
        fuzzy
          ? [
              [3, 4],
              [4, 5],
            ]
          : [[3, 5]],
      )
    },
  )

  it.each([
    [`astral character`, `😀x`, `😀`, [[0, 2]]],
    [`length-changing lowercase`, `İx`, `İ`, [[0, 1]]],
  ] as const)(
    `fuzzy highlighting keeps each %s range whole`,
    (_description, text, query, expected) => {
      mock_element.textContent = text

      highlight_matches({ query, fuzzy: true })(mock_element)

      expect(
        get_highlight_ranges().map((range) => [range.startOffset, range.endOffset]),
      ).toEqual(expected)
    },
  )

  it(`updates highlights when matching text is inserted`, async () => {
    const scroll_into_view = vi.fn()
    mock_element.scrollIntoView = scroll_into_view
    const effect_cleanup = vi.fn()
    const on_highlight = vi.fn(() => effect_cleanup)
    const cleanup = highlight_matches({ query: `PageSearch`, on_highlight })(mock_element)
    expect(scroll_into_view).not.toHaveBeenCalled()
    expect(on_highlight).toHaveBeenCalledExactlyOnceWith({
      node: mock_element,
      ranges: [],
    })
    mock_element.textContent = `PageSearch excerpt`
    await Promise.resolve()

    expect(mock_css_highlights.get(`highlight-match`)).toMatchObject({
      ranges: [expect.any(Range)],
    })
    expect(scroll_into_view).toHaveBeenCalledExactlyOnceWith({
      behavior: `smooth`,
      block: `center`,
    })
    expect(on_highlight).toHaveBeenCalledTimes(2)
    expect(effect_cleanup).toHaveBeenCalledOnce()
    cleanup?.()
    mock_element.textContent = `PageSearch updated excerpt`
    await Promise.resolve()

    expect(effect_cleanup).toHaveBeenCalledTimes(2)
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
  })

  it(`supports timed highlights and opt-in range effects`, async () => {
    vi.useFakeTimers()
    mock_element.textContent = `PageSearch result`
    const effect_cleanup = vi.fn()

    const cleanup = highlight_matches({
      query: `PageSearch`,
      duration_ms: 50,
      on_highlight: () => effect_cleanup,
    })(mock_element)

    await vi.advanceTimersByTimeAsync(50)
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
    expect(effect_cleanup).toHaveBeenCalledOnce()

    cleanup?.()
    expect(effect_cleanup).toHaveBeenCalledOnce()
  })

  it(`removes highlights when range effect setup or cleanup throws`, () => {
    mock_element.textContent = `PageSearch result`

    expect(() =>
      highlight_matches({
        query: `PageSearch`,
        on_highlight: () => {
          throw new Error(`effect failed`)
        },
      })(mock_element),
    ).toThrow(`effect failed`)
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)

    const cleanup = highlight_matches({
      query: `PageSearch`,
      on_highlight: () => () => {
        throw new Error(`cleanup failed`)
      },
    })(mock_element)
    expect(() => cleanup?.()).toThrow(`cleanup failed`)
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
  })

  it(`stays disposed when range effect cleanup removes the attachment`, async () => {
    mock_element.textContent = `PageSearch result`
    let cleanup: (() => void) | undefined
    const on_highlight = vi.fn(() => () => cleanup?.())
    cleanup = highlight_matches({ query: `PageSearch`, on_highlight })(mock_element)

    mock_element.textContent = `Updated PageSearch result`
    await Promise.resolve()

    expect(on_highlight).toHaveBeenCalledOnce()
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
  })

  it(`aggregates same-name highlights across attached elements`, () => {
    const second_element = document.createElement(`div`)
    const other_highlight = { external: true }
    mock_css_highlights.set(`other-highlight`, other_highlight)
    mock_element.textContent = `First match`
    second_element.textContent = `Second match`

    const cleanup_first = highlight_matches({ query: `match` })(mock_element)
    const cleanup_second = highlight_matches({ query: `match` })(second_element)

    expect(mock_css_highlights.get(`highlight-match`)).toMatchObject({
      ranges: [expect.any(Range), expect.any(Range)],
    })
    cleanup_first?.()
    expect(mock_css_highlights.get(`highlight-match`)).toMatchObject({
      ranges: [expect.any(Range)],
    })
    cleanup_second?.()
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
    expect(mock_css_highlights.get(`other-highlight`)).toBe(other_highlight)
    expect(delete_highlights_spy).toHaveBeenCalledWith(`highlight-match`)
  })

  it.each([
    [`restores a pre-existing`, `keep`],
    [`preserves a later replacement`, `replace`],
    [`respects a later deletion of the`, `delete`],
  ])(`%s same-name highlight`, (_description, external_action) => {
    const previous = { external: `previous` }
    const replacement = { external: `replacement` }
    mock_css_highlights.set(`highlight-match`, previous)
    mock_element.textContent = `match`

    const cleanup = highlight_matches({ query: `match` })(mock_element)
    if (external_action === `replace`)
      mock_css_highlights.set(`highlight-match`, replacement)
    if (external_action === `delete`) mock_css_highlights.delete(`highlight-match`)
    cleanup?.()

    expect(mock_css_highlights.get(`highlight-match`)).toBe(
      external_action === `replace`
        ? replacement
        : external_action === `keep`
          ? previous
          : undefined,
    )
  })

  it(`observe_mutations: false freezes the highlight at attach time`, async () => {
    mock_element.textContent = `nothing here`
    const cleanup = highlight_matches({
      query: `PageSearch`,
      observe_mutations: false,
    })(mock_element)

    mock_element.textContent = `PageSearch excerpt`
    await Promise.resolve()

    expect(get_highlight_ranges()).toHaveLength(0)
    cleanup?.()
  })

  // Flush MO (microtask) before advancing timers, or the burst never arms the debounce.
  // afterEach restores real timers — create_burst_debounce keys max_wait off Date.now().
  it(`debounced observation coalesces a burst into one re-run`, async () => {
    vi.useFakeTimers()
    mock_element.textContent = `nothing here`
    const on_highlight = vi.fn()
    const cleanup = highlight_matches({
      query: `line`,
      on_highlight,
      observe_mutations: { debounce_ms: 50, max_wait_ms: 1000 },
    })(mock_element)
    expect(on_highlight).toHaveBeenCalledTimes(1) // the initial run

    for (const idx of [1, 2, 3]) {
      mock_element.append(document.createTextNode(` line ${idx}`))
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(20) // shorter than debounce_ms
    }
    expect(on_highlight).toHaveBeenCalledTimes(1) // still nothing but the initial run

    await vi.advanceTimersByTimeAsync(50)
    expect(on_highlight).toHaveBeenCalledTimes(2)
    expect(get_highlight_ranges()).toHaveLength(3)
    cleanup?.()
  })

  it(`max_wait_ms forces a re-run through a burst that never pauses`, async () => {
    vi.useFakeTimers()
    mock_element.textContent = `nothing here`
    const on_highlight = vi.fn()
    const cleanup = highlight_matches({
      query: `line`,
      on_highlight,
      observe_mutations: { debounce_ms: 50, max_wait_ms: 120 },
    })(mock_element)

    // a mutation every 40 ms would reset a plain debounce forever
    for (const idx of [1, 2, 3, 4]) {
      mock_element.append(document.createTextNode(` line ${idx}`))
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(40)
    }

    expect(on_highlight).toHaveBeenCalledTimes(2) // initial run plus the capped one
    cleanup?.()
  })

  it(`cleanup drops a pending debounced re-run`, async () => {
    vi.useFakeTimers()
    mock_element.textContent = `nothing here`
    const on_highlight = vi.fn()
    const cleanup = highlight_matches({
      query: `line`,
      on_highlight,
      observe_mutations: { debounce_ms: 50 },
    })(mock_element)

    mock_element.append(document.createTextNode(` line 1`))
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(10)
    expect(vi.getTimerCount()).toBe(1)

    cleanup?.()
    // disarmed, not merely ignored: a live timer holds the closure (and, in node,
    // the event loop) until it fires
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(100)

    expect(on_highlight).toHaveBeenCalledTimes(1)
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
  })
})

describe(`sortable`, () => {
  const get_required_header = (
    table: HTMLTableElement,
    selector = `thead th`,
  ): HTMLTableCellElement => {
    const header = table.querySelector(selector)
    if (!(header instanceof HTMLTableCellElement)) {
      throw new Error(`expected table header '${selector}'`)
    }
    return header
  }

  const create_table = () => {
    const table = document.createElement(`table`)
    table.innerHTML = `<thead><tr><th>Planet</th><th>Moons</th></tr></thead>
      <tbody><tr><td>Mars</td><td>2</td></tr>
      <tr><td>Earth</td><td>1</td></tr>
      <tr><td>Jupiter</td><td>95</td></tr></tbody>`
    document.body.append(table)
    return table
  }

  const get_column_values = (table: HTMLTableElement, col_idx: number) =>
    Array.from(table.querySelectorAll(`tbody tr`)).map(
      (row) => row.children[col_idx].textContent,
    )

  it(`sorts ascending then descending when clicking the same header`, () => {
    const table = create_table()
    const cleanup = sortable()(table)
    const [planet_header] = Array.from(table.querySelectorAll(`thead th`))

    planet_header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(get_column_values(table, 0)).toEqual([`Earth`, `Jupiter`, `Mars`])

    planet_header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(get_column_values(table, 0)).toEqual([`Mars`, `Jupiter`, `Earth`])

    cleanup?.()
  })

  it(`does not set up sorting when disabled`, () => {
    const table = create_table()
    expect(sortable({ disabled: true })(table)).toBeUndefined()
    const header = get_required_header(table)
    expect(header.style.cursor).toBe(``)

    header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(get_column_values(table, 0)).toEqual([`Mars`, `Earth`, `Jupiter`]) // unsorted
    expect(header.classList.contains(`table-sort-asc`)).toBe(false)
  })

  it(`applies custom classes and sorted_style, resetting other columns`, () => {
    const table = create_table()
    sortable({
      asc_class: `asc`,
      desc_class: `desc`,
      sorted_style: { backgroundColor: `red` },
    })(table)
    const [h1, h2] = Array.from(table.querySelectorAll<HTMLTableCellElement>(`thead th`))

    h1.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(h1.classList.contains(`asc`)).toBe(true)
    expect(h1.style.backgroundColor).toBe(`red`)

    h1.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(h1.classList.contains(`desc`)).toBe(true)

    h2.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(h1.textContent).not.toContain(`↑`)
    expect(h1.classList.contains(`asc`)).toBe(false)
    expect(h1.classList.contains(`desc`)).toBe(false)
    expect(h1.style.backgroundColor).toBe(``) // sorted_style reset too, not just the class
    expect(h1.style.cursor).toBe(`pointer`) // reset must not strip the pointer cursor
    expect(h2.classList.contains(`asc`)).toBe(true)
    expect(h2.style.backgroundColor).toBe(`red`)
  })

  it(`handles an empty table body and a custom header_selector`, () => {
    const table = document.createElement(`table`)
    table.innerHTML = `<thead><tr><th class="sortable">A</th><th>B</th></tr></thead>`
    document.body.append(table)

    sortable({ header_selector: `th.sortable` })(table)

    const sortable_header = get_required_header(table, `th.sortable`)
    const second_header = table.querySelectorAll<HTMLTableCellElement>(`th`)[1]
    expect(sortable_header.style.cursor).toBe(`pointer`)
    expect(second_header?.style.cursor).toBe(``)
    sortable_header.dispatchEvent(new MouseEvent(`click`))
    expect(sortable_header.textContent).toBe(`A ↑`)
    expect(sortable_header.classList.contains(`table-sort-asc`)).toBe(true)
  })

  it.each([
    [`whitespace-only cells as empty`, [`   `, `5`, `1`], [`1`, `5`, ``]],
    [
      `mixed numeric and text cells`,
      [`foo`, `10`, `bar`, `2`],
      [`2`, `10`, `bar`, `foo`],
    ],
  ])(`sorts %s correctly`, (_desc, cells, expected) => {
    const table = document.createElement(`table`)
    const rows = cells.map((val: string) => `<tr><td>${val}</td></tr>`).join(``)
    table.innerHTML = `<thead><tr><th>Col</th></tr></thead><tbody>${rows}</tbody>`
    document.body.append(table)

    sortable()(table)
    get_required_header(table).dispatchEvent(new MouseEvent(`click`, { bubbles: true }))

    expect(get_column_values(table, 0).map((val) => val?.trim())).toEqual(expected)
  })

  it(`treats rows with missing cells (colspan placeholder) as empty and sorts them last`, () => {
    const table = document.createElement(`table`)
    table.innerHTML =
      `<thead><tr><th>Name</th><th>Score</th></tr></thead><tbody>` +
      `<tr><td colspan="2">No data</td></tr>` +
      `<tr><td>Alice</td><td>3</td></tr>` +
      `<tr><td>Bob</td><td>1</td></tr>` +
      `</tbody>`
    document.body.append(table)

    sortable()(table)
    // click 2nd column header; placeholder row has no cell at index 1
    const score_header = table.querySelectorAll(`thead th`)[1]
    score_header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))

    const first_cells = Array.from(
      table.querySelectorAll<HTMLTableRowElement>(`tbody tr`),
    ).map((row) => row.cells[0]?.textContent)
    expect(first_cells).toEqual([`Bob`, `Alice`, `No data`])
  })

  it(`does not re-parent rows of nested tables when sorting`, () => {
    const table = document.createElement(`table`)
    table.innerHTML =
      `<thead><tr><th>Name</th><th>Data</th></tr></thead><tbody>` +
      `<tr><td>Beta</td><td><table><tbody><tr><td>nested</td></tr></tbody></table></td></tr>` +
      `<tr><td>Alpha</td><td>plain</td></tr>` +
      `</tbody>`
    document.body.append(table)

    sortable()(table)
    get_required_header(table).dispatchEvent(new MouseEvent(`click`, { bubbles: true }))

    const nested_table = table.querySelector(`tbody table`)
    expect(nested_table?.querySelectorAll(`tr`)).toHaveLength(1)
    const outer_rows = Array.from(table.querySelector(`tbody`)?.children ?? []).filter(
      (child) => child.tagName === `TR`,
    )
    expect(outer_rows.map((row) => row.querySelector(`td`)?.textContent)).toEqual([
      `Alpha`,
      `Beta`,
    ])
  })

  it(`preserves header child markup across sort clicks and cleanup`, () => {
    const table = create_table()
    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>(`thead th`))
    const [header] = headers
    header.innerHTML = `<span class="icon">▲</span> Planet`
    header.style.color = `blue`

    const cleanup = sortable()(table)
    expect(headers.map(({ style }) => style.cursor)).toEqual([`pointer`, `pointer`])
    header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))

    expect(header.querySelector(`span.icon`)?.textContent).toBe(`▲`)
    expect(header.querySelector(`span.sort-arrow`)?.textContent).toContain(`↑`)

    // repeated clicks must not accumulate arrows
    header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(header.querySelectorAll(`span.sort-arrow`)).toHaveLength(1)
    expect(header.querySelector(`span.sort-arrow`)?.textContent).toContain(`↓`)
    expect(header.querySelector(`span.icon`)?.textContent).toBe(`▲`)

    cleanup?.()
    expect(header.innerHTML).toBe(`<span class="icon">▲</span> Planet`)
    expect(header.style.color).toBe(`blue`)
    expect(headers.map(({ style }) => style.cursor)).toEqual([``, ``])
    expect(
      headers.some(
        ({ classList }) =>
          classList.contains(`table-sort-asc`) || classList.contains(`table-sort-desc`),
      ),
    ).toBe(false)
  })
})

describe(`backdrop_dismiss`, () => {
  it(`closes or invokes a callback only after a primary outside gesture`, () => {
    const dialog = create_element(`dialog`) as HTMLDialogElement
    mock_rect(dialog, { left: 10, top: 10, width: 100, height: 100 })
    const close = vi.spyOn(dialog, `close`).mockImplementation(() => undefined)
    const cleanup = backdrop_dismiss()(dialog)
    const dispatch = (
      type: `pointerdown` | `pointercancel` | `click`,
      client_x: number,
      client_y: number,
      init: PointerEventInit = {},
    ) => dialog.dispatchEvent(pointer_event(type, client_x, client_y, init))

    dispatch(`pointerdown`, 50, 50)
    dispatch(`click`, 5, 5)
    dispatch(`pointerdown`, 5, 5)
    dispatch(`click`, 50, 50)
    dispatch(`pointerdown`, 5, 5, { button: 2 })
    dispatch(`click`, 5, 5)
    dispatch(`pointerdown`, 5, 5, { isPrimary: false })
    dispatch(`click`, 5, 5)
    dispatch(`pointerdown`, 5, 5)
    dispatch(`pointercancel`, 5, 5)
    dispatch(`click`, 5, 5)
    expect(close).not.toHaveBeenCalled()

    dispatch(`pointerdown`, 5, 5)
    dispatch(`click`, 5, 5)
    expect(close).toHaveBeenCalledOnce()
    cleanup?.()
    close.mockClear()

    const callback = vi.fn()
    const callback_cleanup = backdrop_dismiss(callback)(dialog)
    dispatch(`pointerdown`, 5, 5)
    dispatch(`click`, 5, 5)

    expect(callback).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    callback_cleanup?.()
  })
})

describe(`resizable`, () => {
  // every case resizes the same 200x150 box unless it needs its own position
  const create_box = (rect = { left: 0, top: 0, width: 200, height: 150 }) => {
    const element = create_element(`div`, { width: `200px`, height: `150px` })
    mock_rect(element, rect)
    return element
  }
  // the handle the browser hit-tests, in place of coordinates near an edge
  const handle_of = (box: HTMLElement, attribute: string, value: string) => {
    const handle = box.querySelector<HTMLElement>(`[${attribute}="${value}"]`)
    if (!handle) throw new Error(`no ${value} ${attribute} on ${box.outerHTML}`)
    return handle
  }
  const grip = (box: HTMLElement, edge = `right`) =>
    handle_of(box, `data-resize-edge`, edge)
  const corner_grip = (box: HTMLElement, corner = `bottom-right`) =>
    handle_of(box, `data-resize-corner`, corner)

  // A mouse pressed while a touch is down reaches here: isPrimary bars a second finger but
  // not a second device. Without the guard the first follower is orphaned, so its window
  // listeners outlive cleanup and keep resizing a detached node.
  it(`ignores a second primary press mid-resize`, () => {
    const element = create_box()
    const on_resize = vi.fn()
    const cleanup = resizable({ on_resize })(element)

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75, { pointerId: 1 }))
    grip(element, `bottom`).dispatchEvent(
      pointer_event(`pointerdown`, 100, 145, { pointerId: 2 }),
    )
    globalThis.dispatchEvent(pointer_event(`pointerup`, 100, 75, { pointerId: 1 }))
    expect(document.body.style.userSelect).toBe(``)

    cleanup?.()
    on_resize.mockClear()
    globalThis.dispatchEvent(pointer_event(`pointermove`, 400, 75, { pointerId: 1 }))
    expect(on_resize).not.toHaveBeenCalled()
  })

  // `touch-action` has no per-region form, so each strip is a real element carrying its own
  // — and its cursor, which needs no hover handler now
  it.each([
    [`right`, `ew-resize`, `width`, [`top`, `bottom`], `vertical`, `200`],
    [`bottom`, `ns-resize`, `height`, [`left`, `right`], `horizontal`, `150`],
    [`left`, `ew-resize`, `width`, [`top`, `bottom`], `vertical`, `200`],
    [`top`, `ns-resize`, `height`, [`left`, `right`], `horizontal`, `150`],
  ] as const)(
    `the %s strip grabs %s`,
    (edge, cursor, thickness, across, orientation, value) => {
      const element = create_box()
      resizable({ edges: [edge], handle_size: 20 })(element)
      const handle = grip(element, edge)
      const { style } = handle

      expect([style.cursor, style.touchAction, style.position]).toEqual([
        cursor,
        `none`,
        `absolute`,
      ])
      // pinned at both ends of the cross axis, so neither corner of the edge is dead
      expect([style[thickness], style[edge], style[across[0]], style[across[1]]]).toEqual(
        [`20px`, `0px`, `0px`, `0px`],
      )
      expect([
        handle.tabIndex,
        handle.getAttribute(`role`),
        handle.getAttribute(`aria-orientation`),
        handle.getAttribute(`aria-valuemin`),
        // an uncapped axis has no infinite aria value, so it reports the largest safe one
        handle.getAttribute(`aria-valuemax`),
        handle.getAttribute(`aria-valuenow`),
        handle.getAttribute(`aria-label`),
      ]).toEqual([
        0,
        `separator`,
        orientation,
        `50`,
        `${Number.MAX_SAFE_INTEGER}`,
        value,
        `Resize from ${edge} edge`,
      ])
    },
  )

  it(`reports a functional width cap below the minimum as both aria limits`, () => {
    const element = create_box()
    resizable({ edges: [`right`], max_width: () => 30 })(element)
    const handle = grip(element)

    expect([
      handle.getAttribute(`aria-valuemin`),
      handle.getAttribute(`aria-valuemax`),
    ]).toEqual([`30`, `30`])
  })

  // Absolute children anchor to the padding box, so a strip flush with its edge sits inside
  // the border, leaving the visible edge — grabbable back when this hit-tested — dead.
  it(`offsets each strip outward by the border it covers`, () => {
    const element = create_box()
    element.style.borderStyle = `solid`
    element.style.borderWidth = `4px 6px 8px 10px` // top right bottom left
    resizable({ edges: [`right`, `bottom`] })(element)

    const right = grip(element, `right`).style
    expect([right.right, right.top, right.bottom]).toEqual([`-6px`, `-4px`, `-8px`])
    const bottom = grip(element, `bottom`).style
    expect([bottom.bottom, bottom.left, bottom.right]).toEqual([`-8px`, `-10px`, `-6px`])
  })

  it(`preserves content-box dimensions at zero pointer delta`, () => {
    const element = create_box()
    Object.assign(element.style, {
      boxSizing: `content-box`,
      padding: `10px 12px`,
      border: `3px solid`,
    })
    mock_rect(element, { left: 0, top: 0, width: 230, height: 176 })
    const on_resize = vi.fn()
    resizable({ min_width: 20, on_resize })(element)

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 230, 80))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 230, 80))
    // 230 border-box minus the 30px of padding and border CSS width excludes here
    expect(element.style.width).toBe(`200px`)

    globalThis.dispatchEvent(pointer_event(`pointermove`, 0, 80))
    expect(element.style.width).toBe(`0px`)
    expect(on_resize).toHaveBeenLastCalledWith(expect.any(PointerEvent), {
      width: 30,
      height: 176,
    })
  })

  // A height-only drag that also pinned the width would freeze a responsive element at
  // whatever it happened to measure the first time anyone grabbed it
  it(`writes only the axis its grab controls`, () => {
    const element = create_box()
    Object.assign(element.style, { width: ``, height: `` })
    resizable({ edges: [`bottom`] })(element)

    grip(element, `bottom`).dispatchEvent(pointer_event(`pointerdown`, 100, 145))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 100, 245))

    expect([element.style.width, element.style.height]).toEqual([``, `250px`])
    globalThis.dispatchEvent(pointer_event(`pointerup`, 100, 245))
  })

  // aria values describe the node a strip resizes, so an outer instance rewriting every
  // separator it can find would make a nested pane's handles report the wrong size
  it(`leaves a nested resizable's separator values alone`, () => {
    const outer = create_box()
    const inner = create_element(`div`, { width: `80px`, height: `60px` })
    mock_rect(inner, { left: 0, top: 0, width: 80, height: 60 })
    outer.append(inner)
    resizable({ edges: [`right`] })(inner)
    resizable({ edges: [`right`] })(outer)
    const outer_strip = outer.querySelector(`:scope > [data-resize-edge="right"]`)

    expect(grip(inner).getAttribute(`aria-valuenow`)).toBe(`80`)

    outer_strip?.dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 295, 75))

    expect(outer_strip?.getAttribute(`aria-valuenow`)).toBe(`300`)
    expect(grip(inner).getAttribute(`aria-valuenow`)).toBe(`80`)
    globalThis.dispatchEvent(pointer_event(`pointerup`, 295, 75))
  })

  // detaching a strip does not unbind its listeners, so a consumer holding one could still
  // press it and resize a node this attachment no longer manages
  it(`stops responding to a strip retained across cleanup`, () => {
    const element = create_box()
    const on_resize = vi.fn()
    const cleanup = resizable({ on_resize })(element)
    const strip = grip(element)

    cleanup?.()
    strip.dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 300, 75))
    expect(on_resize).not.toHaveBeenCalled()
    expect(element.style.width).toBe(`200px`) // untouched from create_box
  })

  it(`creates a strip per edge, plus a handle per corner the edges form`, () => {
    const element = create_box()
    const cleanup = resizable({ edges: [`right`, `bottom`, `top`] })(element)

    const strips = [...element.querySelectorAll(`[data-resize-edge]`)]
    expect(strips.map((strip) => strip.getAttribute(`data-resize-edge`))).toEqual([
      `top`,
      `bottom`,
      `right`,
    ])
    // only the two corners whose *both* edges are enabled; `left` is absent so its are too
    const corners = [...element.querySelectorAll(`[data-resize-corner]`)]
    expect(corners.map((corner) => corner.getAttribute(`data-resize-corner`))).toEqual([
      `top-right`,
      `bottom-right`,
    ])
    const corner = corner_grip(element, `top-right`)
    expect([corner.tabIndex, corner.getAttribute(`aria-hidden`)]).toEqual([-1, `true`])
    expect(corner.style.cursor).toBe(`nesw-resize`)
    // corners come last so they paint over the strip overlap they sit on
    expect(element.lastElementChild?.getAttribute(`data-resize-corner`)).toBe(
      `bottom-right`,
    )

    cleanup?.()
    expect(
      element.querySelectorAll(`[data-resize-edge], [data-resize-corner]`),
    ).toHaveLength(0)

    // an `edges` change re-runs the attachment; the old handles must not survive it
    resizable({ edges: [`left`] })(element)
    const after = [...element.querySelectorAll(`[data-resize-edge]`)]
    expect(after.map((strip) => strip.getAttribute(`data-resize-edge`))).toEqual([`left`])
    // one edge forms no corner
    expect(element.querySelectorAll(`[data-resize-corner]`)).toHaveLength(0)
  })

  // The whole point of a corner: dragging it moves both axes, where the edge strips it
  // overlaps would each move only their own.
  it.each([
    [`bottom-right`, 300, 250, 300, 250],
    [`top-left`, -50, -30, 250, 180],
  ] as const)(`the %s corner resizes both axes`, (corner, to_x, to_y, width, height) => {
    const element = create_box()
    const on_resize = vi.fn()
    resizable({ edges: [`top`, `right`, `bottom`, `left`], on_resize })(element)

    const handle = corner_grip(element, corner)
    expect(handle.style.cursor).toBe(`nwse-resize`)

    const [from_x, from_y] = corner === `bottom-right` ? [200, 150] : [0, 0]
    handle.dispatchEvent(pointer_event(`pointerdown`, from_x, from_y))
    globalThis.dispatchEvent(pointer_event(`pointermove`, to_x, to_y))

    expect([element.style.width, element.style.height]).toEqual([
      `${width}px`,
      `${height}px`,
    ])
    // a top/left corner grows away from the pointer, so the far corner has to stay put
    if (corner === `top-left`) {
      expect([element.style.left, element.style.top]).toEqual([`-50px`, `-30px`])
    }
    expect(on_resize).toHaveBeenLastCalledWith(expect.any(PointerEvent), {
      width,
      height,
    })
    globalThis.dispatchEvent(pointer_event(`pointerup`, to_x, to_y))
  })

  it(`locks a corner drag to its pointer-down aspect ratio while Shift is held`, () => {
    const element = create_box()
    resizable({ edges: [`right`, `bottom`] })(element)
    const handle = corner_grip(element)

    handle.dispatchEvent(pointer_event(`pointerdown`, 200, 150))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 300, 160, { shiftKey: true }))

    expect([element.style.width, element.style.height]).toEqual([`300px`, `225px`])
    globalThis.dispatchEvent(pointer_event(`pointerup`, 300, 160))
  })

  it.each([
    [`right`, `ArrowRight`, false, `210px`, `150px`, ``],
    [`right`, `ArrowRight`, true, `250px`, `150px`, ``],
    [`left`, `ArrowLeft`, false, `210px`, `150px`, `-10px`],
    [`bottom`, `ArrowDown`, true, `200px`, `200px`, ``],
    [`top`, `ArrowUp`, true, `200px`, `200px`, `-50px`],
  ] as const)(
    `resizes from the %s edge via %s (Shift: %s)`,
    (edge, key, shift_key, width, height, position) => {
      const element = create_box()
      resizable({ edges: [edge] })(element)

      const event = dispatch_key(grip(element, edge), key, { shiftKey: shift_key })

      expect(event.defaultPrevented).toBe(true)
      expect([element.style.width, element.style.height]).toEqual([width, height])
      expect(element.style[edge === `left` ? `left` : `top`]).toBe(position)
    },
  )

  it(`resets a keyboard resize with Enter`, () => {
    const element = create_box()
    const on_resize_start = vi.fn()
    const on_resize_reset = vi.fn()
    resizable({ edges: [`right`], on_resize_start, on_resize_reset })(element)
    const handle = grip(element, `right`)

    dispatch_key(handle, `ArrowRight`, { shiftKey: true })
    expect(on_resize_start).toHaveBeenCalledWith(expect.any(KeyboardEvent), {
      width: 200,
      height: 150,
    })

    expect(dispatch_key(handle, `Enter`).defaultPrevented).toBe(true)
    expect(handle.getAttribute(`aria-keyshortcuts`)?.split(` `)).toContain(`Enter`)
    expect([element.style.width, element.style.height]).toEqual([``, `150px`])
    expect(on_resize_reset).toHaveBeenCalledWith(expect.any(KeyboardEvent), {
      width: 200,
      height: 150,
    })
  })

  // the one visible way back from a manual resize, so it has to clear what the drag wrote
  it.each<[string, ResizableOptions | undefined, string, string]>([
    [`a strip`, undefined, ``, ``],
    // width-only must not wipe a consumer-set height
    [`a strip of a width-only instance`, { edges: [`right`] }, ``, `240px`],
  ])(`double-clicking %s clears managed sizes`, (_desc, options, width, height) => {
    const element = create_box()
    const on_resize_reset = vi.fn()
    resizable({ ...options, on_resize_reset })(element)
    element.style.width = `320px`
    element.style.height = `240px`

    grip(element).dispatchEvent(pointer_event(`dblclick`, 195, 75))
    expect([element.style.width, element.style.height]).toEqual([width, height])
    expect(on_resize_reset).toHaveBeenCalledWith(expect.any(MouseEvent), {
      width: 200,
      height: 150,
    })
  })

  it(`leaves a double-click on the content alone`, () => {
    const element = create_box()
    resizable()(element)
    element.style.width = `320px`

    element.dispatchEvent(pointer_event(`dblclick`, 100, 75))
    expect(element.style.width).toBe(`320px`)
  })

  // left/top are also written by `draggable` on the same node, so a reset that blanks them
  // unconditionally would snap a dragged element back to wherever its stylesheet puts it
  it(`double-click leaves a left/top this instance never wrote`, () => {
    const element = create_box()
    resizable({ edges: [`left`, `top`] })(element)
    // stands in for draggable having positioned the node
    element.style.left = `60px`
    element.style.top = `60px`

    grip(element, `left`).dispatchEvent(pointer_event(`dblclick`, 5, 75))
    expect([element.style.left, element.style.top]).toEqual([`60px`, `60px`])
  })

  it.each([
    [`min_width`, { min_width: 100 }, `right`, [50, 75], `width`, `100px`],
    [`max_width`, { max_width: 300 }, `right`, [500, 75], `width`, `300px`],
    [`min_height`, { min_height: 80 }, `bottom`, [100, 30], `height`, `80px`],
    [`max_height`, { max_height: 250 }, `bottom`, [100, 400], `height`, `250px`],
  ] as const)(
    `respects the %s constraint`,
    (_constraint, options, edge, [drag_client_x, drag_client_y], dimension, expected) => {
      const element = create_box()
      resizable(options)(element)

      grip(element, edge).dispatchEvent(pointer_event(`pointerdown`, 195, 145))
      globalThis.dispatchEvent(pointer_event(`pointermove`, drag_client_x, drag_client_y))

      expect(element.style[dimension]).toBe(expected)

      globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))
    },
  )

  it(`resolves functional size limits for each gesture`, () => {
    const element = create_box()
    let current_max_width = 240
    resizable({ max_width: () => current_max_width })(element)
    current_max_width = 260

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 500, 75))

    expect(element.style.width).toBe(`260px`)
    globalThis.dispatchEvent(pointer_event(`pointerup`, 500, 75))
  })

  // a second finger drives and ends nothing; the resize belongs to the first, until the OS
  // takes it away — cancel or lost capture both end it
  it.each([
    [
      `pointercancel`,
      (el: HTMLElement, id: number) =>
        globalThis.dispatchEvent(
          pointer_event(`pointercancel`, 250, 75, { pointerId: id }),
        ),
    ],
    [
      `lostpointercapture`,
      (el: HTMLElement, id: number) =>
        el.dispatchEvent(pointer_event(`lostpointercapture`, 250, 75, { pointerId: id })),
    ],
  ])(`ignores another pointer, ends on %s`, (_end_type, dispatch_end) => {
    const element = create_box()
    const on_resize_end = vi.fn()
    resizable({ on_resize_end })(element)

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75, { pointerId: 1 }))
    expect(element.hasPointerCapture(1)).toBe(true)
    globalThis.dispatchEvent(pointer_event(`pointermove`, 400, 75, { pointerId: 2 }))
    globalThis.dispatchEvent(pointer_event(`pointerup`, 400, 75, { pointerId: 2 }))
    expect(element.style.width).toBe(`200px`) // untouched from create_box
    expect(on_resize_end).not.toHaveBeenCalled()

    globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75, { pointerId: 1 }))
    dispatch_end(element, 1)
    expect(element.style.width).toBe(`255px`)
    expect(on_resize_end).toHaveBeenCalledOnce()
    expect(document.body.style.userSelect).toBe(``)
    expect(element.hasPointerCapture(1)).toBe(false)
  })

  // every way a gesture can fail to be a resize. A non-primary press matters most: the
  // context menu it opens can swallow the release, leaving the element stuck to the cursor
  it.each([
    [
      `a press on the content, clear of every strip`,
      (box: HTMLElement) => box.dispatchEvent(pointer_event(`pointerdown`, 100, 75)),
    ],
    [
      `a non-primary button on a strip`,
      (box: HTMLElement) =>
        grip(box).dispatchEvent(pointer_event(`pointerdown`, 195, 75, { button: 2 })),
    ],
  ])(`does not start resizing on %s`, (_desc, gesture) => {
    const element = create_box()
    const on_resize_start = vi.fn()
    const on_resize = vi.fn()
    const on_resize_end = vi.fn()
    resizable({ on_resize_start, on_resize, on_resize_end })(element)

    gesture(element)
    globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75))
    globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))

    expect(on_resize_start).not.toHaveBeenCalled()
    expect(on_resize).not.toHaveBeenCalled()
    expect(on_resize_end).not.toHaveBeenCalled()
    expect(element.style.width).toBe(`200px`) // untouched from create_box
  })

  it(`fires on_resize_start, on_resize and on_resize_end callbacks`, () => {
    const element = create_box()

    const on_resize_start = vi.fn()
    const on_resize = vi.fn()
    const on_resize_end = vi.fn()

    resizable({ on_resize_start, on_resize, on_resize_end })(element)

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    expect(document.body.style.userSelect).toBe(`none`)
    expect(on_resize_start).toHaveBeenCalledTimes(1)
    expect(on_resize_start).toHaveBeenCalledWith(expect.any(PointerEvent), {
      width: 200,
      height: 150,
    })

    globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75))
    expect(on_resize).toHaveBeenCalledTimes(1)
    expect(on_resize).toHaveBeenCalledWith(expect.any(PointerEvent), {
      width: 255,
      height: 150,
    })

    // End resize
    globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))
    expect(document.body.style.userSelect).toBe(``)
    expect(on_resize_end).toHaveBeenCalledTimes(1)
    expect(on_resize_end).toHaveBeenCalledWith(
      expect.any(PointerEvent),
      { width: 200, height: 150 }, // offsetWidth/Height from mock
    )
  })

  it.each([
    [
      `left`,
      { left: 100, top: 50, width: 200, height: 150 },
      [105, 100],
      [55, 100],
      { width: `250px`, left: `-50px` },
    ],
    [
      `top`,
      { left: 100, top: 100, width: 200, height: 150 },
      [200, 105],
      [200, 55],
      { height: `200px`, top: `-50px` },
    ],
  ] as const)(
    `handles a %s edge resize with position adjustment`,
    (
      _edge,
      rect,
      [start_client_x, start_client_y],
      [drag_client_x, drag_client_y],
      expected_styles,
    ) => {
      const element = create_box(rect)
      resizable({ edges: [_edge] })(element)

      grip(element, _edge).dispatchEvent(
        pointer_event(`pointerdown`, start_client_x, start_client_y),
      )
      globalThis.dispatchEvent(pointer_event(`pointermove`, drag_client_x, drag_client_y))

      for (const [property, value] of Object.entries(expected_styles)) {
        expect(element.style.getPropertyValue(property)).toBe(value)
      }

      globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))
    },
  )

  it(`does nothing when disabled`, () => {
    const element = create_box()
    const cleanup = resizable({ disabled: true })(element)

    expect(cleanup).toBeUndefined()
    expect(element.style.position).toBe(``) // disabled skips the position: relative fixup
    expect(element.querySelectorAll(`[data-resize-edge]`)).toHaveLength(0)
  })

  it.each([
    [`width`, { min_width: 300, max_width: 100 }],
    [`height`, { min_height: 300, max_height: 100 }],
  ] as const)(`warns and skips invalid %s constraints`, (_dimension, options) => {
    const element = create_box()
    const warn = vi.spyOn(console, `warn`).mockImplementation(() => undefined)

    try {
      const cleanup = resizable(options)(element)

      expect(cleanup).toBeUndefined()
      expect(warn).toHaveBeenCalledWith(
        expect.stringContaining(`min dimensions exceed max dimensions`),
      )
      expect(element.querySelectorAll(`[data-resize-edge]`)).toHaveLength(0)
    } finally {
      warn.mockRestore()
    }
  })

  it.each([
    [`static`, `relative`],
    [`absolute`, `absolute`],
  ])(`position %s initializes as %s`, (initial_position, expected_position) => {
    const element = create_box()
    element.style.position = initial_position

    resizable()(element)

    expect(element.style.position).toBe(expected_position)
  })

  it(`resets body userSelect when cleaned up mid-resize`, () => {
    const element = create_box()
    const on_resize = vi.fn()

    const cleanup = resizable({ on_resize })(element)
    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    expect(document.body.style.userSelect).toBe(`none`)

    cleanup?.() // unmount mid-resize, before any release
    expect(document.body.style.userSelect).toBe(``)
    expect(element.querySelectorAll(`[data-resize-edge]`)).toHaveLength(0)

    globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75))
    expect(on_resize).not.toHaveBeenCalled()
  })
})

describe(`float`, () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
  })

  // anchor as a bare rect, so no element geometry has to be mocked for the anchor
  const anchor_rect = { top: 100, bottom: 140, left: 60, right: 200 }

  const attach_float = (options: Parameters<typeof float>[0] = {}) => {
    const node = create_element()
    mock_rect(node, { left: 0, top: 0, width: 50, height: 20 })
    const cleanup = float({ anchor: anchor_rect, ...options })(node)
    if (cleanup) cleanups.push(cleanup)
    return node
  }

  it.each([
    [`fixed`, `fixed`, 0, 0],
    // absolute is measured against the document, so page scroll has to be added back
    [`absolute`, `absolute`, 400, 700],
  ] as const)(
    `%s strategy positions relative to the right origin`,
    (_desc, strategy, scroll_x, scroll_y) => {
      cleanups.push(
        stub_prop(globalThis, `scrollX`, scroll_x),
        stub_prop(globalThis, `scrollY`, scroll_y),
      )

      const node = attach_float({ strategy, placement: `bottom`, align: `start` })

      expect(node.style.position).toBe(strategy)
      // bottom placement sits below the anchor, start aligns the left edges
      expect(node.style.top).toBe(`${140 + scroll_y}px`)
      expect(node.style.left).toBe(`${60 + scroll_x}px`)
    },
  )

  it(`match_width sets the exact border-box width and restores inline sizing`, () => {
    const matched = attach_float({ match_width: true })
    expect([
      matched.style.width,
      matched.style.minWidth,
      matched.style.boxSizing,
    ]).toEqual([`140px`, `140px`, `border-box`])
    expect(attach_float().style.width).toBe(``)

    const node = create_element()
    node.style.cssText = `box-sizing: content-box; min-width: 10rem; width: 20px`
    const original_sizing = [node.style.boxSizing, node.style.minWidth, node.style.width]
    mock_rect(node, { left: 0, top: 0, width: 50, height: 20 })
    const cleanup = float({ anchor: anchor_rect, match_width: true })(node)
    cleanup?.()
    expect([node.style.boxSizing, node.style.minWidth, node.style.width]).toEqual(
      original_sizing,
    )
  })

  it(`repositions on scroll using the floating element's window`, () => {
    const animation_host = Object.assign(new EventTarget(), {
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        callback(0)
        return 42
      }),
      cancelAnimationFrame: vi.fn(),
    }) as unknown as Window
    const node = create_element()
    mock_rect(node, { left: 0, top: 0, width: 50, height: 20 })
    cleanups.push(stub_prop(node, `ownerDocument`, { defaultView: animation_host }))
    const cleanup = float({ anchor: anchor_rect, placement: `bottom` })(node)
    node.style.top = `0px`
    animation_host.dispatchEvent(new Event(`scroll`))
    expect(node.style.top).toBe(`140px`)
    cleanup?.()
  })

  it.each([
    [`disabled`, { enabled: false }],
    [`no anchor`, { anchor: null }],
  ] as const)(`%s attaches nothing`, (_desc, options) => {
    const node = create_element()
    expect(float({ anchor: anchor_rect, ...options })(node)).toBeUndefined()
    expect(node.style.position).toBe(``)
  })
})

describe(`auto_update_position`, () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup()
  })

  it(`coalesces observed changes and cleans up`, () => {
    let run_frame: FrameRequestCallback = () => undefined
    const visual_viewport = new EventTarget()
    const animation_host = Object.assign(new EventTarget(), {
      visualViewport: visual_viewport,
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        run_frame = callback
        return 42
      }),
      cancelAnimationFrame: vi.fn(),
    }) as unknown as Window
    const observe = vi.fn()
    const disconnect = vi.fn()
    let resize_callback: ResizeObserverCallback = () => undefined
    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resize_callback = callback
      }
      observe = observe
      disconnect = disconnect
    }
    cleanups.push(stub_prop(globalThis, `ResizeObserver`, MockResizeObserver))

    const anchor = create_element()
    const floating = create_element()
    cleanups.push(stub_prop(floating, `ownerDocument`, { defaultView: animation_host }))
    const update = vi.fn()
    const cleanup = auto_update_position(anchor, floating, update)
    cleanups.push(cleanup)
    expect(observe.mock.calls.map(([element]) => element)).toEqual([floating, anchor])

    animation_host.dispatchEvent(new Event(`scroll`))
    animation_host.dispatchEvent(new Event(`resize`))
    visual_viewport.dispatchEvent(new Event(`scroll`))
    expect(animation_host.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()

    run_frame(0)
    expect(update).toHaveBeenCalledTimes(1)

    resize_callback([], {} as ResizeObserver)
    expect(animation_host.requestAnimationFrame).toHaveBeenCalledTimes(2)
    cleanup()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(animation_host.cancelAnimationFrame).toHaveBeenCalledWith(42)

    animation_host.dispatchEvent(new Event(`scroll`))
    expect(animation_host.requestAnimationFrame).toHaveBeenCalledTimes(2)

    observe.mockClear()
    cleanups.push(auto_update_position(null, floating, update))
    expect(observe).toHaveBeenCalledExactlyOnceWith(floating)
  })
})

describe(`portal`, () => {
  // home has siblings on both sides, so restoring to the wrong index is visible
  const setup = () => {
    const home = create_element()
    const target = create_element()
    const [before, node, after] = [
      document.createElement(`i`),
      document.createElement(`b`),
      document.createElement(`u`),
    ]
    home.append(before, node, after)
    return { home, target, node }
  }

  it(`moves the node into the target and restores its position on teardown`, () => {
    const { home, target, node } = setup()

    const cleanup = portal(target)(node)

    expect(node.parentElement).toBe(target)
    expect(home.innerHTML).toBe(`<i></i><!--portal--><u></u>`) // anchor holds the spot
    home.append(document.createElement(`s`))

    cleanup?.()
    expect(node.parentElement).toBe(home)
    expect(home.innerHTML).toBe(`<i></i><b></b><u></u><s></s>`)
    expect(target.childNodes).toHaveLength(0)
  })

  it.each([`null`, `undefined`, `already the parent`] as const)(
    `a %s target leaves the node where it is`,
    (kind) => {
      const { home, node } = setup()
      const target = { null: null, undefined, 'already the parent': home }[kind]

      expect(portal(target)(node)).toBeUndefined()
      expect(node.parentElement).toBe(home)
      expect(home.innerHTML).toBe(`<i></i><b></b><u></u>`) // not re-appended after <u>
    },
  )

  it(`removes the node instead of stranding it when its anchor is gone`, () => {
    const { home, target, node } = setup()
    const cleanup = portal(target)(node)

    home.innerHTML = `` // the block that owned the node tore its markup down
    cleanup?.()

    expect(node.parentElement).toBeNull()
    expect(target.childNodes).toHaveLength(0)
  })

  it(`restores into a detached home rather than dropping the node`, () => {
    const { home, target, node } = setup()
    const cleanup = portal(target)(node)

    home.remove() // whole subtree detached, anchor still marks the spot inside it
    cleanup?.()

    expect(node.parentElement).toBe(home)
    expect(target.childNodes).toHaveLength(0)
  })
})

describe(`contrast_color`, () => {
  // brackets a color's luminance from both sides: a threshold just below it has to read
  // as `over` and one just above as `under`, which pins the value without exposing it
  const luminance_brackets = (bg_color: string, expected: number, tolerance: number) => {
    const probe = (luminance_threshold: number) =>
      pick_contrast_color({ bg_color, luminance_threshold, choices: [`over`, `under`] })
    return [probe(expected - tolerance), probe(expected + tolerance)]
  }
  const bracketed = [`over`, `under`]

  it.each([
    [`light rgb background`, `rgb(255, 255, 255)`, `black`],
    [`dark rgb background`, `rgb(20, 20, 20)`, `white`],
    [`space-separated rgb`, `rgb(255 255 255)`, `black`],
    [`rgba with alpha`, `rgba(10, 10, 10, 0.9)`, `white`],
    [`six-digit hex`, `#ffffff`, `black`],
    [`three-digit hex`, `#111`, `white`],
    [`eight-digit hex`, `#ffffffcc`, `black`],
    // computed styles keep a color in the space it was authored in, so these arrive
    // at get_bg_color verbatim rather than pre-converted to rgb()
    [`white oklch`, `oklch(1 0 0)`, `black`],
    [`black oklab`, `oklab(0 0 0)`, `white`],
    [`red oklch`, `oklch(0.627955 0.257683 29.2338)`, `white`],
    [`white lab`, `lab(100 0 0)`, `black`],
    [`red lch`, `lch(54.291 106.837 40.853)`, `white`],
    [`white display-p3`, `color(display-p3 1 1 1)`, `black`],
    [`black srgb`, `color(srgb 0 0 0)`, `white`],
    [`white rec2020`, `color(rec2020 1 1 1)`, `black`],
    [`white xyz`, `color(xyz 0.9505 1 1.089)`, `black`],
    [`red hsl`, `hsl(0 100% 50%)`, `white`],
    [`white hwb`, `hwb(0 100% 0%)`, `black`],
  ])(`picks contrast text for a %s`, (_desc, bg_color, expected) => {
    expect(pick_contrast_color({ bg_color })).toBe(expected)
  })

  // the conversions are only worth anything if they land on the same luminance the
  // equivalent sRGB spelling does, so each pair has to agree either side of a threshold
  // set at the reference color's own luminance
  it.each([
    [`oklab(0.627955 0.224863 0.125846)`, 0.299],
    [`oklch(62.7955% 0.257683 29.2338deg)`, 0.299],
    [`lab(54.291 80.805 69.891)`, 0.299],
    [`color(srgb 1 0 0)`, 0.299],
    [`color(display-p3 1 0 0)`, 0.299], // p3 red is out of sRGB gamut and clips to red
    [`color(prophoto-rgb 1 1 1)`, 1],
    [`color(a98-rgb 1 1 1)`, 1],
    [`color(srgb-linear 1 1 1)`, 1],
    [`color(xyz-d50 0.9643 1 0.8251)`, 1],
    [`hwb(0.5turn 0% 0%)`, 0.701], // cyan
    // same cyan a third way: 200grad is 180deg, and `grad` must not read as the `rad`
    // it ends with, which would leave a trailing `g` and parse to NaN
    [`hwb(200grad 0% 0%)`, 0.701],
    [`oklch(0.627955 0.257683 0.51022606rad)`, 0.299], // red, the 29.2338deg above in radians
    // percentages are as legal in rgb() as anywhere else, in channels and alpha alike
    [`rgb(100% 0% 0%)`, 0.299],
    [`rgb(0 0 0 / 50%)`, 0],
    [`rgba(255, 255, 255, 50%)`, 1],
    [`hwb(0 25% 25%)`, 0.3995], // white and black both mixed into the pure hue
    [`hsla(0, 100%, 50%, 0.5)`, 0.299],
  ])(`%s converts to a luminance of %f`, (bg_color, expected) => {
    expect(luminance_brackets(bg_color, expected, 1e-4)).toEqual(bracketed)
  })

  // The cases above are all primaries or pure white, which every space maps to the same
  // corner of sRGB — they pass whatever the conversion matrices hold. These are mid-gamut,
  // where the coefficients actually decide the answer, and the expected channels are what
  // Chrome 144 paints for the same string (canvas fillStyle, then getImageData).
  // Chrome quantizes to 8-bit, so its answer is only good to half a channel: 0.5/255 is
  // 1.96e-3 of luminance, and the tolerance is that bound. Every wrong-matrix result
  // checked (skipping the D50 adaptation above all) misses by far more than this.
  it.each([
    [`oklch(0.7 0.15 30)`, [237, 118, 101]],
    [`oklab(0.35 0.08 -0.12)`, [75, 28, 118]],
    [`lab(50 40 -30)`, [165, 91, 171]],
    [`lch(60 50 300)`, [157, 131, 222]],
    [`hsl(200 60% 40%)`, [41, 122, 163]],
    [`hwb(45 60% 10%)`, [230, 210, 153]],
    [`color(srgb-linear 0.5 0.5 0.5)`, [188, 188, 188]],
    [`color(display-p3 0.8 0.2 0.4)`, [222, 24, 101]],
    [`color(a98-rgb 0.5 0.5 0.2)`, [128, 128, 40]],
    [`color(prophoto-rgb 0.4 0.7 0.3)`, [0, 204, 64]],
    [`color(rec2020 0.6 0.3 0.8)`, [187, 74, 218]],
    [`color(xyz-d50 0.3 0.4 0.2)`, [122, 184, 127]],
    [`color(xyz-d65 0.3 0.4 0.2)`, [139, 182, 107]],
  ])(`%s lands where Chrome paints it`, (bg_color, [red, green, blue]) => {
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255
    expect(luminance_brackets(bg_color, luminance, 2e-3)).toEqual(bracketed)
  })

  // Perceived brightness weights green ×0.587, red ×0.299 and blue ×0.114, so the
  // same channel value reads very differently. A plain channel average would land
  // all three of these on 0.333 and give one answer for the lot.
  it.each([
    [`green`, `rgb(0, 255, 0)`, `black`],
    [`red`, `rgb(255, 0, 0)`, `white`],
    [`blue`, `rgb(0, 0, 255)`, `white`],
  ])(`weighs channels perceptually: full %s`, (_desc, bg_color, expected) => {
    expect(pick_contrast_color({ bg_color, luminance_threshold: 0.5 })).toBe(expected)
  })

  it.each<[string, ContrastOptions, string]>([
    [`custom choices`, { bg_color: `#000`, choices: [`#222`, `#eee`] }, `#eee`],
    // white's luminance is 1, so a threshold above it flips even white to dark text
    [`custom threshold`, { bg_color: `#fff`, luminance_threshold: 1.5 }, `white`],
    [`empty bg treated as a white page`, { bg_color: `` }, `black`],
    [`no bg treated as a white page`, {}, `black`],
  ])(`honors %s`, (_desc, options, expected) => {
    expect(pick_contrast_color(options)).toBe(expected)
  })

  // named colors and color-mix() stay out: a computed value can carry neither, since
  // color-mix() resolves to a color in its interpolation space before it is read back
  it.each([
    `red`,
    `color-mix(in oklab, red, blue)`,
    `color(not-a-space 1 1 1)`,
    // Object.prototype keys are not color spaces: a bare lookup finds `constructor`
    `color(constructor 1 1 1)`,
    `color(srgb 1 1)`,
    `oklch(0.7 0.1)`,
    `#12345`,
    `rgb(1, 2)`,
    `rgb(a, b, c)`,
  ])(`throws on the unparsable color %s`, (bg_color) => {
    expect(() => pick_contrast_color({ bg_color })).toThrow(/cannot read color/u)
  })

  // a chain with nothing painted in it reports no background at all, and a page with
  // nothing behind the node is assumed white
  it.each([
    [`the first painted ancestor`, `rgb(10, 10, 10)`, `rgb(10, 10, 10)`, `white`],
    [`nothing when every ancestor is transparent`, `rgba(0, 0, 0, 0)`, ``, `black`],
  ])(`the ancestor walk finds %s`, (_desc, background, expected_bg, expected_color) => {
    const painted = create_element(`div`, { backgroundColor: background })
    const middle = document.createElement(`div`)
    const node = document.createElement(`span`)
    painted.append(middle)
    middle.append(node)

    expect(get_bg_color(node)).toBe(expected_bg)
    const cleanup = contrast_color()(node)
    expect(node.style.color).toBe(expected_color)
    cleanup?.()
  })

  // the ancestor walk stops at the first painted background, and a wide-gamut one is
  // painted: reading only rgb()/rgba() used to skip straight past it
  it.each([
    [`oklch(0.3 0.1 200)`, `white`, true],
    [`oklch(0.3 0.1 200 / 0)`, `black`, false],
    [`rgb(0 0 0 / 0%)`, `black`, false], // a percentage alpha reads as transparent too
    [`color(display-p3 1 1 1)`, `black`, true],
  ])(`sees %s as a painted ancestor: %s`, (background, expected_color, painted) => {
    const ancestor = document.createElement(`div`)
    const node = document.createElement(`span`)
    ancestor.append(node)
    document.body.append(ancestor)
    vi.spyOn(globalThis, `getComputedStyle`).mockImplementation(
      (element) =>
        ({
          backgroundColor: element === ancestor ? background : `rgba(0, 0, 0, 0)`,
        }) as CSSStyleDeclaration,
    )

    expect(get_bg_color(node)).toBe(painted ? background : ``)
    const cleanup = contrast_color()(node)
    expect(node.style.color).toBe(expected_color)
    cleanup?.()
  })

  it(`bg_color skips the ancestor walk and cleanup restores the inline color`, () => {
    const node = create_element(`div`, {
      backgroundColor: `rgb(255, 255, 255)`,
      color: `rebeccapurple`,
    })

    const cleanup = contrast_color({ bg_color: `rgb(0, 0, 0)` })(node)
    expect(node.style.color).toBe(`white`) // the ancestor white would have said black

    cleanup?.()
    expect(node.style.color).toBe(`rebeccapurple`)
  })
})

describe(`forward_window_keydown`, () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
    document.body.innerHTML = ``
  })

  const attach = (handled = true, options: { enabled?: boolean } = {}) => {
    const node = create_element()
    const handle = vi.fn(() => handled)
    const cleanup = forward_window_keydown({ handle, ...options })(node)
    if (cleanup) cleanups.push(cleanup)
    return { node, handle, cleanup }
  }

  const hover = (node: Element) =>
    node.dispatchEvent(new PointerEvent(`pointerenter`, { bubbles: false }))
  const unhover = (node: Element) =>
    node.dispatchEvent(new PointerEvent(`pointerleave`, { bubbles: false }))
  const press_key = (key = `f`) => dispatch_key(globalThis, key)

  it(`forwards only while hovered, and never once cleaned up`, () => {
    const { node, handle, cleanup } = attach()

    press_key()
    expect(handle).not.toHaveBeenCalled() // never hovered, so this key is not ours

    hover(node)
    press_key()
    expect(handle).toHaveBeenCalledTimes(1)

    unhover(node)
    press_key()
    expect(handle).toHaveBeenCalledTimes(1)

    hover(node) // hovered again, but the listener is gone
    cleanup?.()
    press_key()
    expect(handle).toHaveBeenCalledTimes(1)
  })

  it(`two hovered-by-turns components never both answer one key`, () => {
    const first = attach()
    const second = attach()

    hover(first.node)
    press_key()
    expect(first.handle).toHaveBeenCalledTimes(1)
    expect(second.handle).not.toHaveBeenCalled()

    unhover(first.node)
    hover(second.node)
    press_key()
    expect(first.handle).toHaveBeenCalledTimes(1)
    expect(second.handle).toHaveBeenCalledTimes(1)
  })

  it(`leaves focused inputs alone but handles keys focused on its root`, () => {
    const { node, handle } = attach()
    hover(node)
    const input = document.createElement(`input`)
    node.append(input)
    input.focus()

    press_key()
    expect(handle).not.toHaveBeenCalled()

    const shadow_input = document.createElement(`input`)
    node.attachShadow({ mode: `open` }).append(shadow_input)
    shadow_input.focus()
    shadow_input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `f`, bubbles: true, composed: true }),
    )
    expect(handle).not.toHaveBeenCalled()

    node.tabIndex = 0
    node.focus()
    const event = press_key()
    expect(handle).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it(`leaves the browser default alone when unhandled`, () => {
    const { node } = attach(false)
    hover(node)
    expect(press_key().defaultPrevented).toBe(false)
  })

  it(`disabled attaches nothing`, () => {
    const { node, handle, cleanup } = attach(true, { enabled: false })

    expect(cleanup).toBeUndefined()
    hover(node)
    press_key()
    expect(handle).not.toHaveBeenCalled()
  })
})

describe(`file_drop`, () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
    vi.unstubAllGlobals()
  })
  const attach_file_drop = (
    options: Parameters<typeof file_drop>[0],
    node = create_element(),
  ) => {
    const cleanup = file_drop(options)(node)
    if (cleanup) cleanups.push(cleanup)
    return { node, cleanup }
  }
  const flush_tasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
  const pending_until_aborted = (signal: AbortSignal) =>
    new Promise<void>((_resolve, reject) => {
      signal.addEventListener(
        `abort`,
        () => reject(new DOMException(`Drop superseded`, `AbortError`)),
        { once: true },
      )
    })
  const delayed_transfer = (file: File) => {
    let deliver_file: FileCallback | undefined
    const entry = {
      isFile: true,
      isDirectory: false,
      name: file.name,
      fullPath: `/${file.name}`,
      file: (callback: FileCallback) => {
        deliver_file = callback
      },
    } as unknown as FileSystemFileEntry
    const item = {
      kind: `file`,
      webkitGetAsEntry: () => entry,
    } as unknown as DataTransferItem
    return {
      transfer: data_transfer([], [item]),
      resolve: () => {
        if (!deliver_file)
          throw new Error(`Delayed file ${file.name} was never requested`)
        deliver_file(file)
      },
    }
  }

  it(`tracks nested drag activity, filters accept types, and honors multiple`, async () => {
    const on_files = vi.fn()
    const on_drag_active = vi.fn()
    const transfer = data_transfer([
      new File([`one`], `one.TXT`, { type: `text/plain` }),
      new File([`image`], `photo.webp`, { type: `image/webp` }),
      new File([`pdf`], `notes.bin`, { type: `application/pdf` }),
      new File([`skip`], `skip.json`, { type: `application/json` }),
    ])
    const { node } = attach_file_drop({
      accept: `.txt,image/*,application/pdf`,
      multiple: true,
      on_files,
      on_drag_active,
    })

    const enter = drag_event(`dragenter`, transfer)
    node.dispatchEvent(enter)
    node.dispatchEvent(drag_event(`dragenter`, transfer))
    expect(enter.defaultPrevented).toBe(true)
    expect(node.hasAttribute(`data-drag-active`)).toBe(true)
    expect(on_drag_active).toHaveBeenCalledExactlyOnceWith(true, enter)

    node.dispatchEvent(drag_event(`dragleave`, transfer))
    expect(node.hasAttribute(`data-drag-active`)).toBe(true)
    node.dispatchEvent(drag_event(`drop`, transfer))

    await vi.waitFor(() => expect(on_files).toHaveBeenCalledOnce())
    expect(on_files.mock.calls[0][0].map((file: File) => file.name)).toEqual([
      `one.TXT`,
      `photo.webp`,
      `notes.bin`,
    ])
    expect(node.hasAttribute(`data-drag-active`)).toBe(false)
    expect(on_drag_active.mock.calls.map(([active]) => active)).toEqual([true, false])
  })

  it.each([
    [
      `single-file mode chooses the first accepted file`,
      [
        new File([``], `skip.txt`, { type: `text/plain` }),
        new File([``], `first.png`, { type: `image/png` }),
        new File([``], `second.png`, { type: `image/png` }),
      ],
      [[`first.png`]],
    ],
    [
      `a drop with no accepted file is ignored`,
      [new File([``], `notes.txt`, { type: `text/plain` })],
      [],
    ],
  ] as const)(`%s`, async (_description, files, expected_calls) => {
    const on_files = vi.fn<(files: File[]) => void>()
    const { node } = attach_file_drop({ accept: `image/*`, on_files })

    node.dispatchEvent(drag_event(`drop`, data_transfer([...files])))
    await flush_tasks()
    expect(
      on_files.mock.calls.map(([accepted]) => accepted.map((file) => file.name)),
    ).toEqual(expected_calls)
  })

  it(`ignores stale expansion and aborts superseded callbacks and cleanup`, async () => {
    const on_error = vi.fn()
    const on_files = vi.fn((_files: File[], signal: AbortSignal) =>
      pending_until_aborted(signal),
    )
    const { node, cleanup } = attach_file_drop({ accept: `.txt`, on_files, on_error })
    const first = delayed_transfer(new File([``], `first.txt`))
    const second = new File([``], `second.txt`)

    node.dispatchEvent(drag_event(`drop`, first.transfer))
    node.dispatchEvent(drag_event(`drop`, data_transfer([second])))
    await vi.waitFor(() => expect(on_files).toHaveBeenCalledOnce())
    expect(on_files.mock.calls[0][0].map((file: File) => file.name)).toEqual([
      `second.txt`,
    ])

    first.resolve()
    await flush_tasks()
    expect(on_files).toHaveBeenCalledOnce()

    const rejected_transfer = data_transfer([new File([``], `rejected.png`)])
    node.dispatchEvent(drag_event(`drop`, rejected_transfer))
    await flush_tasks()
    expect(on_files.mock.calls.map(([, signal]) => signal.aborted)).toEqual([false])

    const third = new File([``], `third.txt`)
    node.dispatchEvent(drag_event(`drop`, data_transfer([third])))
    await vi.waitFor(() => expect(on_files).toHaveBeenCalledTimes(2))
    expect(on_files.mock.calls.map(([, signal]) => signal.aborted)).toEqual([true, false])

    const after_cleanup = delayed_transfer(new File([``], `after-cleanup.txt`))
    node.dispatchEvent(drag_event(`drop`, after_cleanup.transfer))
    cleanup?.()
    after_cleanup.resolve()
    await flush_tasks()
    expect(on_files.mock.calls.map(([, signal]) => signal.aborted)).toEqual([true, true])
    expect(on_error).not.toHaveBeenCalled()
  })

  it(`stops delivery when aborting the previous callback destroys the attachment`, async () => {
    let cleanup: (() => void) | undefined
    const on_files = vi.fn((_files: File[], signal: AbortSignal) => {
      if (on_files.mock.calls.length === 1) {
        signal.addEventListener(`abort`, () => cleanup?.(), { once: true })
      }
      return pending_until_aborted(signal)
    })
    const attached = attach_file_drop({ on_files })
    if (typeof attached.cleanup !== `function`) throw new Error(`Missing cleanup`)
    cleanup = attached.cleanup
    const first_transfer = data_transfer([new File([``], `first.txt`)])
    const second_transfer = data_transfer([new File([``], `second.txt`)])

    attached.node.dispatchEvent(drag_event(`drop`, first_transfer))
    await vi.waitFor(() => expect(on_files).toHaveBeenCalledOnce())
    attached.node.dispatchEvent(drag_event(`drop`, second_transfer))
    await flush_tasks()

    expect(on_files).toHaveBeenCalledOnce()
  })

  it(`reports directory expansion failures through on_error`, async () => {
    const failure = new DOMException(`entry disappeared`, `NotFoundError`)
    const broken_entry = {
      isFile: true,
      isDirectory: false,
      name: `broken.txt`,
      fullPath: `/broken.txt`,
      file: (_on_file: FileCallback, on_error?: ErrorCallback) => on_error?.(failure),
    } as FileSystemFileEntry
    const item = {
      kind: `file`,
      webkitGetAsEntry: () => broken_entry,
    } as unknown as DataTransferItem
    const on_files = vi.fn()
    const on_error = vi.fn()
    const { node } = attach_file_drop({ multiple: true, on_files, on_error })

    node.dispatchEvent(drag_event(`drop`, data_transfer([], [item])))
    await vi.waitFor(() => expect(on_error).toHaveBeenCalledExactlyOnceWith(failure))
    expect(on_files).not.toHaveBeenCalled()
  })

  it(`disabled mode prevents browser navigation without activating or processing`, () => {
    const on_files = vi.fn()
    const on_drag_active = vi.fn()
    const { node, cleanup } = attach_file_drop({
      disabled: true,
      on_files,
      on_drag_active,
    })
    const transfer = data_transfer([
      new File([``], `ignored.txt`, { type: `text/plain` }),
    ])
    const dragover = drag_event(`dragover`, transfer)
    const drop = drag_event(`drop`, transfer)

    node.dispatchEvent(dragover)
    node.dispatchEvent(drop)
    expect(cleanup).toBeTypeOf(`function`)
    expect(dragover.defaultPrevented).toBe(true)
    expect(drop.defaultPrevented).toBe(true)
    expect(node.hasAttribute(`data-drag-active`)).toBe(false)
    expect(on_drag_active).not.toHaveBeenCalled()
    expect(on_files).not.toHaveBeenCalled()
  })

  it(`global dragend clears activity after unbalanced dragenter events`, () => {
    const on_drag_active = vi.fn()
    const transfer = data_transfer([new File([``], `file.txt`)])
    const { node } = attach_file_drop({ on_files: vi.fn(), on_drag_active })

    node.dispatchEvent(drag_event(`dragenter`, transfer))
    node.dispatchEvent(drag_event(`dragenter`, transfer))
    expect(node.hasAttribute(`data-drag-active`)).toBe(true)
    globalThis.dispatchEvent(drag_event(`dragend`, transfer))

    expect(node.hasAttribute(`data-drag-active`)).toBe(false)
    expect(on_drag_active.mock.calls.map(([active]) => active)).toEqual([true, false])
  })

  it(`uses reportError when asynchronous processing fails without on_error`, async () => {
    const report_error = vi.fn()
    vi.stubGlobal(`reportError`, report_error)
    const failure = new Error(`consumer rejected files`)
    const on_files = vi.fn((files: File[], signal: AbortSignal) => {
      if (files[0]?.name === `second.txt`) throw failure
      return pending_until_aborted(signal)
    })
    const { node } = attach_file_drop({ on_files })

    const first_transfer = data_transfer([new File([``], `first.txt`)])
    node.dispatchEvent(drag_event(`drop`, first_transfer))
    await vi.waitFor(() => expect(on_files).toHaveBeenCalledOnce())
    const second_transfer = data_transfer([new File([``], `second.txt`)])
    node.dispatchEvent(drag_event(`drop`, second_transfer))
    await vi.waitFor(() => expect(report_error).toHaveBeenCalledExactlyOnceWith(failure))
    expect(on_files.mock.calls.map(([, signal]) => signal.aborted)).toEqual([true, false])
  })

  const reporting_error = new Error(`error reporter failed`)
  it.each([
    [
      `throws`,
      () => {
        throw reporting_error
      },
    ],
    [`rejects`, () => Promise.reject(reporting_error)],
  ])(`uses reportError when on_error %s`, async (_description, report_failure) => {
    const report_error = vi.fn()
    vi.stubGlobal(`reportError`, report_error)
    const initial_failure = new Error(`consumer rejected files`)
    const on_error = vi.fn(report_failure)
    const { node } = attach_file_drop({
      on_files: vi.fn(() => {
        throw initial_failure
      }),
      on_error,
    })

    const transfer = data_transfer([new File([``], `file.txt`)])
    node.dispatchEvent(drag_event(`drop`, transfer))
    await vi.waitFor(() =>
      expect(report_error).toHaveBeenCalledExactlyOnceWith(reporting_error),
    )
    expect(on_error).toHaveBeenCalledExactlyOnceWith(initial_failure)
  })

  it(`cleanup removes handlers, resets state, and restores the prior data attribute`, () => {
    const node = create_element()
    node.setAttribute(`data-drag-active`, `consumer-value`)
    const on_files = vi.fn()
    const on_drag_active = vi.fn()
    const transfer = data_transfer([new File([``], `file.txt`)])
    const { cleanup } = attach_file_drop({ on_files, on_drag_active }, node)

    node.dispatchEvent(drag_event(`dragenter`, transfer))
    cleanup?.()
    expect(on_drag_active.mock.calls.map(([active]) => active)).toEqual([true, false])
    expect(node.getAttribute(`data-drag-active`)).toBe(`consumer-value`)

    const drop = drag_event(`drop`, transfer)
    node.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(false)
    expect(on_files).not.toHaveBeenCalled()
  })
})
