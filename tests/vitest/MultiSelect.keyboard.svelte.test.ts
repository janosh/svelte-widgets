import { tick } from 'svelte'
import { describe, expect, test, vi } from 'vite-plus/test'
import type { MultiSelectProps } from '#lib/types.ts'
import { click, create_element, doc_query, key_reads, press_key } from './index'
import {
  active_text,
  focus_input,
  fresh_key,
  get_input,
  mount_multiselect,
  normalized_text,
  press_sequence,
  selected_chips,
  selected_text,
  type_search_text,
} from './MultiSelect.test-utils'

vi.mock(`#lib/internal/key-selector.svelte.ts`, async (import_original) =>
  (await import(`./index`)).count_key_reads(await import_original()),
)

// https://github.com/janosh/svelte-widgets/issues/111
// https://github.com/janosh/svelte-widgets/issues/112
test(`can select 1st and last option with arrow and enter key`, async () => {
  const props = $state<MultiSelectProps>({ open: true, options: [1, 2, 3], value: [] })
  mount_multiselect(props)

  const input = get_input()

  key_reads.count = 0
  await press_sequence(input, `ArrowDown`)
  expect(active_text()).toBe(`1`)
  // only the row whose active state flips re-checks it
  expect(key_reads.count).toBe(1)
  await press_sequence(input, `Enter`)
  expect(props.value).toEqual([1])

  await press_sequence(input, `ArrowUp`, `Enter`)
  expect(props.value).toEqual([1, 3])
})

// https://github.com/janosh/svelte-widgets/issues/183
test(`arrow keys traverse matching options and the create-option row in both directions`, async () => {
  const create_msg = `Create this option...` // component default
  mount_multiselect({
    options: [`foo`, `bar`, `baz`],
    allow_user_options: true,
    open: true,
  })

  const input = await type_search_text(`ba`)
  expect(normalized_text(doc_query(`ul.options`))).toBe(`bar baz ${create_msg}`)

  await focus_input()
  const steps = [
    [`ArrowDown`, `bar`],
    [`ArrowDown`, `baz`],
    [`ArrowDown`, create_msg], // past the last match onto the create row
    [`ArrowDown`, `bar`], // wraps back to the top
    [`ArrowUp`, create_msg], // wraps back onto the create row
    [`ArrowUp`, `baz`], // must land on the LAST match, not the first
    [`ArrowUp`, `bar`],
  ] as const
  for (const [idx, [key, expected]] of steps.entries()) {
    await press_sequence(input, key)
    const active = doc_query(`ul.options li.active`)
    expect(active.textContent, `step ${idx}: ${key}`).toContain(expected)
  }
})

test.each([
  [`ArrowDown`, `First enabled`],
  [`ArrowUp`, `Last enabled`],
  [`a`, `First enabled`],
] as const)(
  `%s from no active option skips disabled options`,
  async (key_name, label) => {
    mount_multiselect({
      options: [
        { label: `First disabled`, disabled: true },
        { label: `First enabled` },
        { label: `Last enabled` },
        { label: `Last disabled`, disabled: true },
      ],
      open: true,
      key: () => `duplicate`,
    })
    const input = get_input()

    await press_sequence(input, key_name)
    expect(active_text()).toBe(label)
  },
)

test(`option row Enter key selects option`, async () => {
  const props = $state<MultiSelectProps>({ options: [`Red`, `Blue`], value: [] })
  mount_multiselect(props)

  await press_sequence(doc_query(`ul.options li`), `Enter`)
  expect(props.value).toEqual([`Red`])
})

test(`Enter on a closed dropdown reopens it instead of selecting the auto-active option`, async () => {
  const props = $state<MultiSelectProps>({
    options: [`Alpha`, `Beta`],
    auto_active_first_option: true,
    value: [],
    active_index: null,
    open: false,
  })
  mount_multiselect(props)
  const input = await focus_input()
  expect(props.active_index).toBe(0)

  await press_sequence(input, `Escape`)
  expect(props.open).toBe(false)
  expect(props.active_index).toBeNull() // nothing active while collapsed

  await press_sequence(input, `Enter`)
  expect(props.value).toEqual([])
  expect(props.open).toBe(true)
  expect(props.active_index).toBe(0)
})

test(`closes dropdown on tab out and blur to external element`, async () => {
  const on_close = vi.fn()
  mount_multiselect({ options: [1, 2, 3], on_close })
  expect(doc_query(`ul.options.hidden`)).toBeInstanceOf(HTMLUListElement)

  const input = await focus_input()
  expect(document.querySelector(`ul.options.hidden`)).toBeNull()

  await press_sequence(input, `Tab`)
  expect(doc_query(`ul.options.hidden`)).toBeInstanceOf(HTMLUListElement)
  expect(on_close).toHaveBeenCalledTimes(1)

  // reopen, then blur to an element outside the component
  input.focus()
  await tick()
  const external = create_element(`button`)
  input.dispatchEvent(new FocusEvent(`blur`, { bubbles: true, relatedTarget: external }))
  await tick()
  expect(on_close).toHaveBeenCalledTimes(2)
})

test(`Enter key deselection preserves search_text (matching mouse behavior)`, async () => {
  // fixes #362, where only the mouse path preserved the filter
  mount_multiselect({
    options: [1, 2, 3],
    value: [1, 2],
    reset_filter_on_add: false,
    close_dropdown_on_select: false,
    keep_selected_in_dropdown: `plain`, // Allow clicking on selected options to toggle them
  })

  const input = await type_search_text(`1`)

  await press_sequence(input, `ArrowDown`, `Enter`)

  expect(input.value).toBe(`1`)
  expect(document.querySelectorAll(`ul.selected li`)).toHaveLength(1)
})

test.each([null, `custom add option message`])(
  `arrow keys on empty multiselect toggle create_option_msg as active with create_option_msg=%s`,
  async (create_option_msg) => {
    mount_multiselect({
      options: [],
      allow_user_options: true,
      search_text: `foo`,
      create_option_msg,
    })

    await press_sequence(await focus_input(), `ArrowDown`)

    const user_msg_li = doc_query(`ul.options li.user-msg`)
    expect(user_msg_li.classList.contains(`active`)).toBe(create_option_msg !== null)
    expect(user_msg_li.textContent?.trim()).toBe(
      create_option_msg ?? `No matching options`,
    )
  },
)

describe(`arrow key navigation between selected items`, () => {
  const options = [`Red`, `Green`, `Blue`]
  const highlighted = () => document.querySelectorAll(`ul.selected > li.highlighted`)
  const is_highlighted = (idx: number) =>
    selected_chips()[idx]?.classList.contains(`highlighted`)

  function setup(
    selected = [`Red`, `Green`, `Blue`],
    extra_props: Record<string, unknown> = {},
  ) {
    mount_multiselect({ options, value: selected, ...extra_props })
    return get_input()
  }

  test(`arrow keys move highlight across bounds and clear past the right edge`, async () => {
    const input = setup()
    await press_sequence(input, ...Array(4).fill(`ArrowLeft`))
    expect(is_highlighted(0)).toBe(true)
    expect(is_highlighted(1)).toBe(false)
    // a highlighted pill is not a listbox option, so it gets no aria-activedescendant
    expect(input.getAttribute(`aria-activedescendant`)).toBeNull()

    await press_sequence(input, `ArrowRight`, `ArrowRight`) // idx 1, then 2
    expect(is_highlighted(2)).toBe(true)
    await press_sequence(input, `ArrowRight`) // clears
    expect(highlighted()).toHaveLength(0)
  })

  test.each<[name: string, key: string, selected: string[], input_text: string]>([
    [`ArrowLeft with input text`, `ArrowLeft`, options, `R`],
    [`ArrowLeft without selected items`, `ArrowLeft`, [], ``],
    [`ArrowRight without a highlight`, `ArrowRight`, options, ``],
  ])(`%s is a no-op`, async (_name, key, selected, input_text) => {
    const input = setup(selected)
    if (input_text) await type_search_text(input_text, input)
    await press_sequence(input, key)
    expect(highlighted()).toHaveLength(0)
  })

  test.each([
    [`removes the last item`, options, {}, `Red Green`],
    // https://github.com/janosh/svelte-widgets/issues/327
    [`keeps items that min_select requires`, [`Red`], { min_select: 1 }, `Red`],
  ])(`Backspace without highlight %s`, async (_name, selected, extra_props, expected) => {
    await press_sequence(setup(selected, extra_props), `Backspace`)
    expect(selected_text()).toBe(expected)
  })

  test(`Backspace on single highlighted item clears highlight`, async () => {
    await press_sequence(setup([`Red`]), `ArrowLeft`, `Backspace`)
    expect(selected_chips()).toHaveLength(0)
    expect(highlighted()).toHaveLength(0)
  })

  test.each([`Escape`, `ArrowDown`, `ArrowUp`, `Tab`, `Enter`, `a`])(
    `%s clears highlight`,
    async (key) => {
      const input = setup()
      await press_sequence(input, `ArrowLeft`)
      expect(highlighted()).toHaveLength(1)
      await press_sequence(input, key)
      expect(highlighted()).toHaveLength(0)
    },
  )

  // each removal leaves the highlighted index valid, so only an explicit reset clears it
  test.each([
    // removing Blue keeps the highlighted idx 1 (Green) in range
    [`the last chip's X button`, {}, 2, `ul.selected li:nth-child(3) button.remove`],
    // min_select=1 keeps Red, the highlighted idx 0, through remove-all
    [`remove-all`, { min_select: 1 }, 3, `button.remove-all`],
  ])(`clicking %s clears highlight`, async (_name, extra_props, n_left, selector) => {
    await press_sequence(setup(options, extra_props), ...Array(n_left).fill(`ArrowLeft`))
    expect(highlighted()).toHaveLength(1)
    await click(selector)
    expect(highlighted()).toHaveLength(0)
  })

  test(`consecutive Backspace removals track highlight correctly`, async () => {
    const input = setup()
    // highlight idx 2, 1, then 0 (Red), then remove Red: highlight stays at 0
    await press_sequence(input, `ArrowLeft`, `ArrowLeft`, `ArrowLeft`, `Backspace`)
    expect(selected_chips()).toHaveLength(2)
    expect(selected_chips()[0]?.textContent).toContain(`Green`)
    expect(is_highlighted(0)).toBe(true)
    await press_sequence(input, `Backspace`) // remove Green, highlight stays at 0
    expect(selected_chips()).toHaveLength(1)
    expect(selected_chips()[0]?.textContent).toContain(`Blue`)
    expect(is_highlighted(0)).toBe(true)
  })

  test(`Backspace with duplicates removes correct occurrence`, async () => {
    // backspace on highlighted idx 2 (the second Red) must remove idx 2, not idx 0
    const input = setup([`Red`, `Blue`, `Red`], { duplicates: true })
    await press_sequence(input, `ArrowLeft`, `Backspace`) // ArrowLeft highlights idx 2
    expect(selected_text()).toBe(`Red Blue`)
  })

  test(`chip remove button removes the clicked occurrence with duplicates`, async () => {
    // both chips share a key, so remove() must use the chip's index instead of findIndex
    const [first, second] = [
      { label: `Red`, tag: 1 },
      { label: `Red`, tag: 2 },
    ]
    let removed: unknown
    mount_multiselect({
      options: [first, second],
      value: [first, second],
      duplicates: true,
      on_remove: ({ option }: { option: unknown }) => (removed = option),
    })
    await click(document.querySelectorAll(`ul.selected li button.remove`)[1])
    // toStrictEqual not toBe: Svelte hands the callback a $state proxy of the option
    expect(removed).toStrictEqual(second)
  })

  test(`re-focusing input clears highlight`, async () => {
    const input = setup()
    await press_sequence(input, `ArrowLeft`)
    expect(highlighted()).toHaveLength(1)
    input.blur()
    input.focus()
    await tick()
    expect(highlighted()).toHaveLength(0)
  })

  test.each<[name: string, next_selected: string[], expected_idx: number | null]>([
    // shrinking past the highlighted idx clamps to the last valid one, clearing drops it
    [`shrink clamps highlighted_idx`, [`Red`, `Green`], 1],
    [`clear nullifies highlighted_idx`, [], null],
  ])(`external selected %s`, async (_name, next_selected, expected_idx) => {
    const props = $state<MultiSelectProps>({ options, value: [`Red`, `Green`, `Blue`] })
    mount_multiselect(props)
    const input = get_input()
    // highlight idx 2 (Blue)
    await press_sequence(input, `ArrowLeft`)
    expect(is_highlighted(2)).toBe(true)
    props.value = next_selected
    await tick()
    expect(selected_chips()).toHaveLength(next_selected.length)
    if (expected_idx === null) expect(highlighted()).toHaveLength(0)
    else expect(is_highlighted(expected_idx)).toBe(true)
  })
})

describe(`keyboard shortcuts`, () => {
  // mounts, focuses the input and dispatches one keydown, returning the bound props and
  // the cancelable event so callers can assert selection and defaultPrevented
  async function test_shortcut(
    shortcut_props: Extract<MultiSelectProps, { mode?: `multiple` }>,
    key_event: KeyboardEventInit & { key: string },
  ): Promise<{
    props: MultiSelectProps
    input: HTMLInputElement
    event: KeyboardEvent
  }> {
    const props = $state<MultiSelectProps>({
      options: [`a`, `b`, `c`],
      value: [],
      open: true,
      ...shortcut_props,
    })

    mount_multiselect(props)
    await tick()

    const input = get_input()
    input.focus()
    const { key, ...modifiers } = key_event
    const event = press_key(input, key, modifiers)
    await tick()

    return { props, input, event }
  }

  test.each([
    [`a`, `a`, {}],
    [`ctrl+a`, `a`, { ctrlKey: true }],
    [`meta+a`, `a`, { metaKey: true }],
    [`cmd+a`, `a`, { metaKey: true }],
    [`alt+a`, `a`, { altKey: true }],
    [`ctrl+shift+alt+s`, `s`, { ctrlKey: true, shiftKey: true, altKey: true }],
  ] as const)(`%s selects all and prevents default`, async (shortcut, key, modifiers) => {
    const { props, event } = await test_shortcut(
      { select_all_option: true, shortcuts: { select_all: shortcut } },
      { key, ...modifiers },
    )
    expect(props.value).toEqual([`a`, `b`, `c`])
    expect(event.defaultPrevented).toBe(true)
  })

  test.each([
    [`ctrl+backspace (default)`, `X11; Linux x86_64`, undefined, { ctrlKey: true }],
    [
      `meta+backspace (default)`,
      `Macintosh; Intel Mac OS X`,
      undefined,
      { metaKey: true },
    ],
    [
      `meta+backspace (explicit)`,
      `X11; Linux x86_64`,
      { clear_all: `meta+backspace` },
      { metaKey: true },
    ],
  ])(
    `%s clears all selected options and prevents default`,
    async (_label, user_agent, shortcuts, modifiers) => {
      vi.spyOn(navigator, `userAgent`, `get`).mockReturnValue(user_agent)
      const { props, event } = await test_shortcut(
        { value: [`a`, `b`], shortcuts },
        { key: `Backspace`, ...modifiers },
      )
      expect(props.value).toEqual([])
      expect(event.defaultPrevented).toBe(true)
    },
  )

  test(`custom shortcuts override defaults`, async () => {
    // the default ctrl+a must stop working once select_all is rebound
    const { props, input } = await test_shortcut(
      { select_all_option: true, shortcuts: { select_all: `ctrl+e` } },
      { key: `a`, ctrlKey: true },
    )
    expect(props.value).toEqual([])

    press_key(input, `e`, { ctrlKey: true })
    await tick()
    expect(props.value).toEqual([`a`, `b`, `c`])
  })

  test.each([
    [`unbound by default`, { select_all_option: true }, { ctrlKey: true }],
    [
      `explicitly null`,
      { select_all_option: true, shortcuts: { select_all: null } },
      { ctrlKey: true },
    ],
    [
      `select_all_option=false`,
      { select_all_option: false, shortcuts: { select_all: `ctrl+a` } },
      { ctrlKey: true },
    ],
    [
      `disabled`,
      { select_all_option: true, shortcuts: { select_all: `ctrl+a` }, disabled: true },
      { ctrlKey: true },
    ],
    [
      `invalid format "ctrl+"`,
      { select_all_option: true, shortcuts: { select_all: `ctrl+` } },
      { ctrlKey: true },
    ],
    [`empty string`, { select_all_option: true, shortcuts: { select_all: `` } }, {}],
  ])(
    `select_all %s: the key is not swallowed`,
    async (_label, extra_props, modifiers) => {
      const { props, event } = await test_shortcut(extra_props, {
        key: `a`,
        ...modifiers,
      })
      expect(props.value).toEqual([])
      expect(event.defaultPrevented).toBe(false)
    },
  )

  // select_all under max_select is covered by `select_all shortcut %s` in MultiSelect.svelte.test.ts
  test(`clear_all respects min_select`, async () => {
    const { props } = await test_shortcut(
      { value: [`a`, `b`, `c`], min_select: 1 },
      { key: `Backspace`, ctrlKey: true },
    )
    expect(props.value).toHaveLength(1)
  })

  test(`clear_all skipped when search_text is non-empty`, async () => {
    const { props, event } = await test_shortcut(
      { value: [`a`, `b`], search_text: `xyz` },
      { key: `Backspace`, ctrlKey: true },
    )
    expect(props.value).toEqual([`a`, `b`])
    expect(event.defaultPrevented).toBe(false)
  })

  test(`custom open and close shortcuts toggle the dropdown`, async () => {
    const { props, input } = await test_shortcut(
      { shortcuts: { open: `ctrl+o`, close: `ctrl+w` } },
      { key: `w`, ctrlKey: true },
    )
    expect(props.open).toBe(false)

    press_key(input, `o`, { ctrlKey: true })
    await tick()
    expect(props.open).toBe(true)
  })

  test.each([
    [
      `select_all`,
      { select_all_option: true, value: [], shortcuts: { select_all: `ctrl+a` } },
      `a`,
      { ctrlKey: true },
      [`a`, `b`, `c`],
    ],
    [`clear_all`, { value: [`a`, `b`] }, `Backspace`, { ctrlKey: true }, []],
  ])(
    `%s shortcut works when dropdown is closed`,
    async (_name, extra_props, key, modifiers, expected) => {
      const { props } = await test_shortcut(
        { open: false, ...extra_props },
        { key, ...modifiers },
      )
      expect(props.value).toEqual(expected)
    },
  )

  test.each([
    [`open`, true, { open: `ctrl+o` }, `o`],
    [`close`, false, { close: `ctrl+w` }, `w`],
  ] as const)(
    `%s shortcut is no-op when already %s`,
    async (_action, initial_open, shortcuts, key) => {
      const { props } = await test_shortcut(
        { shortcuts, open: initial_open },
        { key, ctrlKey: true },
      )
      expect(props.open).toBe(initial_open)
    },
  )

  test.each([
    // [description, shortcuts, extra_props, key, expected_open, expected_selected]
    [
      `open=enter overrides Enter select`,
      { open: `enter` },
      { open: false },
      `Enter`,
      true,
      [],
    ],
    [
      `close=escape behaves same as default`,
      { close: `escape` },
      { open: true },
      `Escape`,
      false,
      [],
    ],
    [
      `close=enter overrides Enter select`,
      { close: `enter` },
      { open: true },
      `Enter`,
      false,
      [],
    ],
    [
      `select_all=arrowdown overrides navigation`,
      { select_all: `arrowdown` },
      { open: true, select_all_option: true },
      `ArrowDown`,
      true,
      [`a`, `b`, `c`],
    ],
  ] as const)(
    `shortcut precedence: %s`,
    async (_desc, shortcuts, extra_props, key, expected_open, expected_selected) => {
      const { props } = await test_shortcut({ shortcuts, ...extra_props }, { key })
      expect(props.open).toBe(expected_open)
      expect(props.value).toEqual(expected_selected)
    },
  )
})

test(`falsy option values (0, '') are navigable and selectable via keyboard`, async () => {
  const props = $state<MultiSelectProps>({ options: [0, 1, 2], value: [] })
  mount_multiselect(props)
  const input = get_input()

  // ArrowDown activates option 0 (previously reset to null because !0 is truthy)
  await press_sequence(input, `ArrowDown`)
  expect(active_text()).toBe(`0`)

  // navigation continues past the falsy option instead of being stuck on it
  await press_sequence(input, `ArrowDown`)
  expect(active_text()).toBe(`1`)

  // Enter selects option 0 (previously fell through the `if (active_option)` check)
  await press_sequence(input, `ArrowUp`, `Enter`)
  expect(props.value).toEqual([0])
})

test(`keyboard navigation respects max_options: arrow keys wrap within rendered options`, async () => {
  mount_multiselect({ options: [`a`, `b`, `c`, `d`, `e`], max_options: 2 })
  const input = get_input()

  // 3 ArrowDowns: a -> b -> wrap back to a (previously walked into hidden options c/d/e)
  for (const expected of [`a`, `b`, `a`]) {
    await press_sequence(input, `ArrowDown`)
    expect(active_text()).toBe(expected)
    // aria-activedescendant must reference an element that exists in the DOM
    const active_id = input.getAttribute(`aria-activedescendant`)
    expect(active_id).not.toBeNull()
    expect(document.querySelector(`[id="${active_id}"]`)).not.toBeNull()
  }
})

test(`IME composition guard: Enter during composition is ignored`, async () => {
  const props = $state<MultiSelectProps>({ options: [`foo`, `bar`], value: [] })
  mount_multiselect(props)
  const input = get_input()

  await press_sequence(input, `ArrowDown`)
  expect(active_text()).toBe(`foo`)

  // Enter mid-composition (confirming CJK text) must not select the active option
  const composing_enter = fresh_key(`Enter`)
  Object.defineProperty(composing_enter, `isComposing`, { value: true })
  input.dispatchEvent(composing_enter)
  await tick()
  expect(props.value).toEqual([])

  // same keystroke outside composition selects normally
  await press_sequence(input, `Enter`)
  expect(props.value).toEqual([`foo`])
})

// the remove button is unmounted by the removal it just ran, so focus fell to <body>.
// Enter/Space on a focused <button> activate it natively, i.e. dispatch this click.
test.each([
  [`a single chip's remove button`, `ul.selected button.remove`],
  [`the remove-all button`, `button.remove-all`],
])(`removal via focused %s hands focus back to the input`, async (_case, selector) => {
  mount_multiselect({ options: [`a`, `b`, `c`], value: [`a`, `b`] })
  await tick()
  const button = doc_query<HTMLButtonElement>(selector)
  button.focus()
  button.click()
  await tick() // the rescue runs after the flush that unmounts the button

  expect(document.activeElement).toBe(get_input())
})
