import ButtonGroup from '$lib/ButtonGroup.svelte'
import { Check } from '$lib/icons'
import button_group_source from '$lib/ButtonGroup.svelte?raw'
import type { ComponentProps } from 'svelte'
import { createRawSnippet, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { doc_query, hover as dispatch_hover } from './index'

describe(`ButtonGroup`, () => {
  type Props = Partial<ComponentProps<typeof ButtonGroup>>
  // the option object arm of the `options` union, i.e. ButtonGroupOption. Spelled out
  // rather than imported: only svelte-check reads types out of a .svelte module script
  type Option = {
    value: string
    label?: string
    tooltip?: string
    icon?: typeof Check
    disabled?: boolean
    loading?: boolean
  }

  const mounted: Record<string, unknown>[] = []
  afterEach(() => {
    for (const app of mounted.splice(0)) void unmount(app)
  })

  const mount_group = (props: Props) => {
    // options is required; every test passes one, the cast keeps call sites terse
    const full_props = props as ComponentProps<typeof ButtonGroup>
    mounted.push(mount(ButtonGroup, { target: document.body, props: full_props }))
    // `[data-value]` so an option_suffix rendering its own button doesn't join the list
    return [
      ...document.querySelectorAll<HTMLButtonElement>(`.options button[data-value]`),
    ]
  }
  const values_of = (buttons: HTMLButtonElement[]) =>
    buttons.map((button) => button.dataset.value)
  // whichever attribute the current mode uses, so a mode swap can't pass silently
  const checked_state = (button: HTMLButtonElement) =>
    button.getAttribute(`aria-checked`) ?? button.getAttribute(`aria-pressed`)
  const press = (key: string, target: Element | null = document.activeElement) =>
    target?.dispatchEvent(
      new KeyboardEvent(`keydown`, { key, bubbles: true, cancelable: true }),
    )

  const letters = { alpha: `Alpha`, beta: `Beta`, gamma: `Gamma` }
  // happy-dom drops nested CSS rules, so the mounted stylesheet reports `.button-group
  // {}` as empty and computed styles say nothing. The styling assertions below read the
  // source instead; the values they produce were checked in a real browser.
  const styles = button_group_source.slice(button_group_source.indexOf(`<style>`))
  // an info link, the affordance matbench-discovery had nested inside its buttons
  const remove_button = createRawSnippet<[{ option: { value: string } }]>(
    (get_params) => ({
      render: () =>
        `<button type="button" data-remove="${get_params().option.value}">x</button>`,
    }),
  )
  const info_link = createRawSnippet<[{ option: { value: string }; selected: boolean }]>(
    (get_params) => ({
      render: () => {
        const { option: opt, selected } = get_params()
        return `<a href="/docs/${opt.value}" data-sel="${selected}">i</a>`
      },
    }),
  )

  test.each([
    [`bare values`, [`alpha`, `beta`, `gamma`], [`alpha`, `beta`, `gamma`]],
    [`record`, letters, [`Alpha`, `Beta`, `Gamma`]],
    [`tuples`, Object.entries(letters), [`Alpha`, `Beta`, `Gamma`]],
    [
      `option objects`,
      // the label-less one falls back to its value
      [
        { value: `alpha`, label: `Alpha` },
        { value: `beta`, label: `Beta` },
        {
          value: `gamma`,
        },
      ],
      [`Alpha`, `Beta`, `gamma`],
    ],
  ] as const)(`renders %s as one button per option`, (_desc, options, labels) => {
    const buttons = mount_group({ options, selected: `beta` })

    expect(values_of(buttons)).toEqual([`alpha`, `beta`, `gamma`])
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(labels)
    // the value, not the label, is what selection compares against
    expect(buttons.map(checked_state)).toEqual([`false`, `true`, `false`])
  })

  test(`throws on an option shape it cannot read`, () => {
    expect(() => mount_group({ options: [{ label: `no value` }] as never })).toThrow(
      /unsupported option/,
    )
  })

  // literal arms keep handlers narrow; a boolean `multiple` uses the Value | Value[] arm
  test.each([
    [`radiogroup`, `radio`, `aria-checked`, `aria-pressed`, { selected: `beta` }],
    [
      `group`,
      null,
      `aria-pressed`,
      `aria-checked`,
      // `selected` is bindable and reassigned by the component, so it must stay mutable
      // even though `as const` freezes the rest of the row
      { multiple: true, selected: [`beta`] as string[] },
    ],
  ] as const)(
    `a %s announces state through %s`,
    (group_role, button_role, used_attr, unused_attr, mode) => {
      const buttons = mount_group({ options: letters, label: `Greek letters`, ...mode })

      const group = doc_query(`.options`)
      expect(group.getAttribute(`role`)).toBe(group_role)
      expect(group.getAttribute(`aria-label`)).toBe(`Greek letters`)
      expect(buttons.map((button) => button.getAttribute(`role`))).toEqual(
        Array(3).fill(button_role),
      )
      expect(buttons.map((button) => button.getAttribute(used_attr))).toEqual([
        `false`,
        `true`,
        `false`,
      ])
      // the mode's own attribute only: aria-pressed on a radio would announce twice
      expect(buttons.map((button) => button.getAttribute(unused_attr))).toEqual(
        Array(3).fill(null),
      )
      expect(buttons.every((button) => button.type === `button`)).toBe(true)
    },
  )

  test(`single select replaces the selection and never clears it`, async () => {
    const on_change = vi.fn()
    const buttons = mount_group({ options: letters, selected: `alpha`, on_change })

    buttons[2].click()
    await tick()
    expect(on_change.mock.calls).toEqual([[`gamma`]])
    expect(buttons.map(checked_state)).toEqual([`false`, `false`, `true`])

    buttons[2].click() // re-picking the checked radio is a no-op, not a deselect
    await tick()
    expect(on_change).toHaveBeenCalledOnce()
    expect(buttons.map(checked_state)).toEqual([`false`, `false`, `true`])
  })

  test(`multi select toggles each option independently`, async () => {
    const on_change = vi.fn()
    const buttons = mount_group({ options: letters, multiple: true, on_change })
    expect(buttons.map(checked_state)).toEqual([`false`, `false`, `false`])

    buttons[0].click()
    await tick()
    buttons[2].click()
    await tick()
    expect(buttons.map(checked_state)).toEqual([`true`, `false`, `true`])

    buttons[0].click() // second press removes it, leaving the other selection alone
    await tick()
    expect(buttons.map(checked_state)).toEqual([`false`, `false`, `true`])
    expect(on_change.mock.calls).toEqual([[[`alpha`]], [[`alpha`, `gamma`]], [[`gamma`]]])
  })

  test(`arrow keys move focus and the selection with it, wrapping both ends`, async () => {
    const on_change = vi.fn()
    const buttons = mount_group({ options: letters, selected: `alpha`, on_change })
    buttons[0].focus()

    const walk: [string, number][] = [
      [`ArrowRight`, 1],
      [`ArrowDown`, 2],
      [`ArrowRight`, 0], // wraps past the end
      [`ArrowLeft`, 2], // and back past the start
      [`ArrowUp`, 1],
      [`Home`, 0],
      [`End`, 2],
    ]
    for (const [key, expected_idx] of walk) {
      press(key)
      await tick()
      expect(document.activeElement, key).toBe(buttons[expected_idx])
      expect(checked_state(buttons[expected_idx]), key).toBe(`true`)
    }
    expect(on_change.mock.calls.flat()).toEqual([
      `beta`,
      `gamma`,
      `alpha`,
      `gamma`,
      `beta`,
      `alpha`,
      `gamma`,
    ])
  })

  test(`arrow keys in multi select move focus without selecting`, async () => {
    const on_change = vi.fn()
    const buttons = mount_group({ options: letters, multiple: true, on_change })
    buttons[0].focus()

    press(`ArrowRight`)
    await tick()
    expect(document.activeElement).toBe(buttons[1])
    expect(buttons.map(checked_state)).toEqual([`false`, `false`, `false`])
    expect(on_change).not.toHaveBeenCalled() // toggling is the click's job, covered above
  })

  test.each([
    [`ArrowLeft`, 2],
    [`ArrowUp`, 2],
    [`ArrowRight`, 0],
    [`Home`, 0],
    [`End`, 2],
  ] as const)(`%s enters the group at the right end from outside`, async (key, idx) => {
    const buttons = mount_group({ options: letters })
    ;(document.activeElement as HTMLElement | null)?.blur()

    press(key, doc_query(`.options`))
    await tick()
    expect(document.activeElement).toBe(buttons[idx])
  })

  test(`disabled options are skipped by clicks and by arrow keys`, async () => {
    const on_change = vi.fn()
    const options: Option[] = [
      { value: `alpha`, label: `Alpha` },
      { value: `beta`, label: `Beta`, disabled: true },
      { value: `gamma`, label: `Gamma` },
    ]
    const buttons = mount_group({ options, selected: `alpha`, on_change })
    expect(buttons.map((button) => button.disabled)).toEqual([false, true, false])

    buttons[0].focus()
    press(`ArrowRight`)
    await tick()
    expect(document.activeElement).toBe(buttons[2]) // beta skipped
    expect(checked_state(buttons[2])).toBe(`true`)

    press(`ArrowRight`)
    await tick()
    expect(document.activeElement).toBe(buttons[0]) // wraps over beta too
    expect(on_change.mock.calls.flat()).toEqual([`gamma`, `alpha`])
  })

  test(`the whole group can be disabled, which also mutes the keyboard`, async () => {
    const on_change = vi.fn()
    const buttons = mount_group({
      options: letters,
      disabled: true,
      sort_order: `asc`,
      on_change,
    })
    expect(buttons.every((button) => button.disabled)).toBe(true)
    expect(doc_query<HTMLButtonElement>(`.sort-order`).disabled).toBe(true)

    press(`ArrowRight`, doc_query(`.options`))
    await tick()
    expect(on_change).not.toHaveBeenCalled()
  })

  // multi select is a plain group, not a radiogroup, so it keeps every native tab stop
  // rather than roving a single one. Joined so a row is one line: `` is an absent attr.
  test.each([
    [`the checked option`, { selected: `gamma` }, `-1,-1,0`],
    [`the first option when nothing is selected`, {}, `0,-1,-1`],
    [`the first, when the selection matches no option`, { selected: `delta` }, `0,-1,-1`],
    [
      `every button, in multi select`,
      { multiple: true, selected: [`beta`] as string[] },
      `,,`,
    ],
  ] as const)(`the tab stop sits on %s`, (_desc, mode, expected) => {
    const buttons = mount_group({ options: letters, ...mode })

    expect(buttons.map((btn) => btn.getAttribute(`tabindex`) ?? ``).join(`,`)).toBe(
      expected,
    )
  })

  test(`the sort arrow is opt-in and flips between asc and desc`, async () => {
    mount_group({ options: letters })
    expect(document.querySelector(`.sort-order`)).toBeNull()

    const onclick = vi.fn()
    const sort_button_props = {
      class: `sort-extra`,
      style: `font-size: 1.2em`,
      type: `submit` as const,
      onclick,
    }
    mount_group({
      options: letters,
      sort_order: `asc`,
      sort_button_props,
    })

    const arrow = doc_query<HTMLButtonElement>(`.sort-order`)
    // the label states the direction and what activating does. No aria-pressed: APG is
    // explicit that a toggle's label must not change with its state, and this one does,
    // so "Sorted ascending, not pressed" would read as the sort not being applied
    const arrow_state = () => [
      arrow.textContent?.trim(),
      arrow.getAttribute(`aria-label`),
    ]
    const ascending = `Sorted ascending, activate to sort descending`
    const descending = `Sorted descending, activate to sort ascending`
    expect(arrow_state()).toEqual([`↑`, ascending])
    expect(arrow.hasAttribute(`aria-pressed`)).toBe(false)
    // it sits outside the radiogroup, which may only own radios
    expect(arrow.closest(`.options`)).toBeNull()
    expect(arrow.classList.contains(`sort-extra`)).toBe(true)
    expect(arrow.getAttribute(`style`)).toBe(`font-size: 1.2em;`)
    expect(arrow.type).toBe(`button`)

    arrow.click()
    await tick()
    expect(arrow_state()).toEqual([`↓`, descending])
    expect(onclick).toHaveBeenCalledOnce()

    arrow.click()
    await tick()
    expect(arrow_state()).toEqual([`↑`, ascending])
    expect(onclick).toHaveBeenCalledTimes(2)
  })

  test(`renders per-option icon and spinner, and forwards class and rest props`, () => {
    const options: Option[] = [
      { value: `alpha`, label: `Alpha`, icon: Check },
      { value: `beta`, label: `Beta`, loading: true },
      { value: `gamma`, label: `Gamma`, loading: false },
    ]
    const buttons = mount_group({ options, class: `consumer-class`, id: `letters` })

    expect(buttons[0].querySelector(`svg`)).not.toBeNull()
    expect(buttons[1].querySelector(`svg`)).toBeNull()
    // Loading-capable options keep the spinner's width reserved while it is hidden. The
    // spinner itself is decoration either way — `aria-busy` is what carries the state.
    expect(buttons[1].querySelector(`div`)?.style.width).toBe(`0.8em`)
    expect(buttons[1].querySelector(`div`)?.style.visibility).toBe(`visible`)
    expect(buttons[2].querySelector(`div`)?.style.visibility).toBe(`hidden`)
    expect(
      buttons.map((button) => [
        button.getAttribute(`aria-busy`),
        button.querySelector(`div`)?.getAttribute(`aria-hidden`),
      ]),
    ).toEqual([
      [null, undefined],
      [`true`, `true`],
      [null, `true`],
    ])

    const wrapper = doc_query(`#letters`)
    expect(wrapper.classList.contains(`button-group`)).toBe(true)
    expect(wrapper.classList.contains(`consumer-class`)).toBe(true)
  })

  test(`an option snippet replaces the default button content`, () => {
    // wider than the component's own param type, which is how a snippet stays
    // assignable to it (parameters are contravariant)
    const option = createRawSnippet<[{ option: { label?: string }; selected: boolean }]>(
      (get_params) => ({
        render: () => {
          const { option: opt, selected } = get_params()
          return `<span data-testid="custom">${opt.label}:${selected}</span>`
        },
      }),
    )
    const buttons = mount_group({ options: letters, selected: `beta`, option })

    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      `Alpha:false`,
      `Beta:true`,
      `Gamma:false`,
    ])
  })

  // Escaping is the default because tooltip content is often user data; `tooltip_options`
  // is the opt out, and without that pass-through no consumer with rich tooltips can
  // migrate. Each row also pins that an option carrying no tooltip stays silent.
  test.each([
    [`escapes markup by default`, undefined, `&lt;b&gt;bold&lt;/b&gt;`],
    [`renders it under allow_html`, { allow_html: true }, `<b>bold</b>`],
  ] as const)(`a per-option tooltip %s`, async (_desc, tooltip_options, expected) => {
    vi.useFakeTimers()
    try {
      const options: Option[] = [{ value: `a`, tooltip: `<b>bold</b>` }, { value: `b` }]
      const buttons = mount_group({ options, tooltip_options })
      await tick()

      dispatch_hover(buttons[1])
      vi.runAllTimers()
      expect(document.querySelector(`.tooltip-content`)).toBeNull()

      dispatch_hover(buttons[0])
      vi.runAllTimers()
      expect(doc_query(`.tooltip-content`).innerHTML).toBe(expected)
    } finally {
      vi.useRealTimers()
    }
  })

  // `as` exists so a group can sit in a heading or paragraph, where a div is invalid.
  // The inner options wrapper has to follow, or the root is legal and its child isn't.
  test.each([
    [`div`, undefined],
    [`span`, `span` as const],
  ])(`renders a %s root with a phrasing-safe options wrapper`, (expected_tag, as) => {
    mount_group({ options: [`alpha`], ...(as ? { as } : {}) })

    expect(doc_query(`.button-group`).tagName.toLowerCase()).toBe(expected_tag)
    expect(doc_query(`.options`).tagName.toLowerCase()).toBe(`span`)
  })

  // The `font` shorthand would also set weight and style, and since `.button-group
  // button` outranks a consumer's own `button {}` rule it silently overrode their
  // global button typography.
  test(`leaves font-weight and font-style to the consumer`, () => {
    expect(styles).toMatch(/font-family:\s*var\(--btn-group-btn-font-family/u)
    // any `font:` shorthand, not just `font: inherit` — `font: var(--x, inherit)` sets
    // weight and style just the same, and is the form a reintroduction would take
    expect(styles).not.toMatch(/[^-]font:/u)
    // a hook for either would have to be a declaration on the button, which is what
    // reintroduces the override, so neither property is set anywhere
    expect(styles).not.toMatch(/font-(?:weight|style):/u)
  })

  // matbench-discovery's SelectToggle put an info link inside the button, which is an
  // invalid content model. The `option` snippet renders inside the button and so cannot
  // fix it; this one is a sibling, which is the whole point.
  // Opt-in: wrappers break consumers' `.segmented > button` selectors.
  test.each([
    [`options`, `nothing is slotted`, undefined, 0],
    [`option`, `a suffix is slotted`, info_link, 3],
  ] as const)(
    `the button's parent is .%s when %s`,
    (parent, _desc, option_suffix, wraps) => {
      const buttons = mount_group({ options: letters, selected: `beta`, option_suffix })

      expect(document.querySelectorAll(`.options > .option`)).toHaveLength(wraps)
      expect(buttons.map((btn) => btn.parentElement?.classList.contains(parent))).toEqual(
        Array(3).fill(true),
      )
      // the affordance is a sibling, never nested in the button — the invalid model
      expect(buttons.map((btn) => btn.querySelector(`a`))).toEqual(Array(3).fill(null))
    },
  )

  test(`option_suffix gets the same params as option, so it can react to selection`, () => {
    mount_group({ options: letters, selected: `beta`, option_suffix: info_link })

    const links = [...document.querySelectorAll<HTMLAnchorElement>(`.option > a`)]
    expect(
      links.map((link) => `${link.getAttribute(`href`)}:${link.dataset.sel}`),
    ).toEqual([`/docs/alpha:false`, `/docs/beta:true`, `/docs/gamma:false`])
  })

  // A suffix rendering its own button is the second reason this prop exists, and it is
  // what makes handle_keydown's query ambiguous: a bare `button` selector collects the
  // suffixes too, so focus lands on one while the selection jumps an option ahead. An
  // `<a>` suffix cannot catch that, since the selector never matched it either way.
  test.each([
    [`a link`, info_link],
    [`a button`, remove_button],
  ])(
    `the option wrapper holding %s leaves arrow key navigation intact`,
    async (_label, option_suffix) => {
      const on_change = vi.fn()
      const buttons = mount_group({
        options: letters,
        selected: `alpha`,
        on_change,
        option_suffix,
      })
      buttons[0].focus()

      press(`ArrowRight`)
      await tick()
      expect(document.activeElement).toBe(buttons[1])
      expect(buttons.map(checked_state)).toEqual([`false`, `true`, `false`])

      press(`End`)
      await tick()
      expect(document.activeElement).toBe(buttons[2])
      expect(on_change.mock.calls.flat()).toEqual([`beta`, `gamma`])
    },
  )

  // The whole themable surface, not a handful of existence rows: this way a rename, a
  // deletion and an undocumented new knob all fail. `justify-content`, `btn-cursor`,
  // `btn-hover-transform` and `btn-transition` are here because each was a `:global`
  // escape hatch a downstream repo needed.
  test(`exposes exactly the documented custom properties`, () => {
    const matches = styles.matchAll(/var\(\s*--btn-group-(?<name>[\w-]+)/gu)
    const used = [...matches].map((match) => match.groups?.name ?? ``)
    expect([...new Set(used)].toSorted().join(` `)).toBe(
      `bg border btn-active-bg btn-active-border-color btn-active-color btn-bg ` +
        `btn-border btn-color btn-cursor btn-disabled-opacity btn-font-family ` +
        `btn-font-size btn-gap btn-hover-bg btn-hover-color btn-hover-transform ` +
        `btn-padding btn-radius btn-transition display gap justify-content ` +
        `option-btn-padding-right padding radius`,
    )
    // hover color chains to the resting one, so setting only that survives hover
    expect(styles).toMatch(
      /--btn-group-btn-hover-color,\s*var\(\s*--btn-group-btn-color/u,
    )
    expect(styles).toContain(
      `padding-right: var(--btn-group-option-btn-padding-right, 0.5ex)`,
    )
  })
})
