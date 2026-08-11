// deno-lint-ignore-file no-await-in-loop
import { tick } from 'svelte'
import { describe, expect, test, vi } from 'vite-plus/test'
import type { MultiSelectProps } from '$lib/types'
import { doc_query } from './index'
import {
  focus_input,
  fresh_key,
  get_input,
  mount_multiselect,
  normalized_text,
  type_search_text,
} from './MultiSelect.test-utils'

// https://github.com/janosh/svelte-widgets/issues/111
// https://github.com/janosh/svelte-widgets/issues/112
test(`can select 1st and last option with arrow and enter key`, async () => {
  const props = $state<MultiSelectProps>({
    open: true,
    options: [1, 2, 3],
    selected: [],
  })
  mount_multiselect(props)

  const input = get_input()

  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()
  expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(`1`)
  input.dispatchEvent(fresh_key(`Enter`))
  await tick()
  expect(props.selected).toEqual([1])

  input.dispatchEvent(fresh_key(`ArrowUp`))
  await tick()
  input.dispatchEvent(fresh_key(`Enter`))
  await tick()
  expect(props.selected).toEqual([1, 3])
})

// https://github.com/janosh/svelte-widgets/issues/183
test(`arrow keys traverse matching options and the create-option row in both directions`, async () => {
  const create_msg = `Create this option...` // component default
  mount_multiselect({
    options: [`foo`, `bar`, `baz`],
    allowUserOptions: true,
    open: true,
  })

  const input = get_input()
  await type_search_text(`ba`, input)
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
    input.dispatchEvent(fresh_key(key))
    await tick()
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

    input.dispatchEvent(fresh_key(key_name))
    await tick()
    expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(label)
  },
)

test(`option row Enter key selects option`, async () => {
  const props = $state<MultiSelectProps>({ options: [`Red`, `Blue`], selected: [] })
  mount_multiselect(props)

  doc_query(`ul.options li`).dispatchEvent(fresh_key(`Enter`))
  await tick()

  expect(props.selected).toEqual([`Red`])
})

test(`closes dropdown on tab out and blur to external element`, async () => {
  const onclose = vi.fn()
  mount_multiselect({ options: [1, 2, 3], onclose })
  expect(doc_query(`ul.options.hidden`)).toBeInstanceOf(HTMLUListElement)

  // opens dropdown on focus
  const input = await focus_input()
  expect(document.querySelector(`ul.options.hidden`)).toBeNull()

  input.dispatchEvent(fresh_key(`Tab`))
  await tick()
  expect(doc_query(`ul.options.hidden`)).toBeInstanceOf(HTMLUListElement)
  expect(onclose).toHaveBeenCalledTimes(1)

  // reopen, then blur to an element outside the component
  input.focus()
  await tick()
  const external = document.createElement(`button`)
  document.body.append(external)
  input.dispatchEvent(new FocusEvent(`blur`, { bubbles: true, relatedTarget: external }))
  await tick()
  expect(onclose).toHaveBeenCalledTimes(2)
})

test(`Enter key deselection preserves searchText (matching mouse behavior)`, async () => {
  // fixes #362, where only the mouse path preserved the filter
  mount_multiselect({
    options: [1, 2, 3],
    selected: [1, 2],
    resetFilterOnAdd: false,
    closeDropdownOnSelect: false,
    keepSelectedInDropdown: `plain`, // Allow clicking on selected options to toggle them
  })

  const input = get_input()
  await type_search_text(`1`, input)

  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()

  input.dispatchEvent(fresh_key(`Enter`))
  await tick()

  expect(input.value).toBe(`1`)

  const selected_items = document.querySelectorAll(`ul.selected li`)
  expect(selected_items).toHaveLength(1)
})

test.each([null, `custom add option message`])(
  `arrow keys on empty multiselect toggle createOptionMsg as active with createOptionMsg=%s`,
  async (createOptionMsg) => {
    mount_multiselect({
      options: [],
      allowUserOptions: true,
      searchText: `foo`,
      createOptionMsg,
    })

    const input = get_input()
    input.focus()
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()

    const user_msg_li = document.querySelector<HTMLLIElement>(`ul.options li.user-msg`)
    if (!user_msg_li) throw new Error(`li.user-msg should exist`)

    expect(user_msg_li.classList.contains(`active`)).toBe(createOptionMsg !== null)
    if (createOptionMsg === null) {
      expect(user_msg_li.textContent?.trim()).toBe(`No matching options`)
    } else expect(user_msg_li.textContent?.trim()).toBe(createOptionMsg)
  },
)

test(`backspace does not remove items when minSelect would be violated`, async () => {
  // https://github.com/janosh/svelte-widgets/issues/327
  const options = [`Red`, `Green`, `Yellow`]
  const selected = [`Red`]
  const minSelect = 1

  mount_multiselect({ options, selected, minSelect })

  // Try to remove the only selected item with backspace
  const backspace = fresh_key(`Backspace`)
  const input = get_input()
  input.dispatchEvent(backspace)
  await tick()

  // The item should still be selected since minSelect=1
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`Red`)
})

describe(`arrow key navigation between selected items`, () => {
  const options = [`Red`, `Green`, `Blue`]
  const press = fresh_key
  const highlighted = () => document.querySelectorAll(`ul.selected > li.highlighted`)
  const selected_items = () => document.querySelectorAll(`ul.selected > li`)
  const is_highlighted = (idx: number) =>
    selected_items()[idx]?.classList.contains(`highlighted`)

  function setup(
    selected = [`Red`, `Green`, `Blue`],
    extra_props: Record<string, unknown> = {},
  ) {
    mount_multiselect({ options, selected, ...extra_props })
    return get_input()
  }

  test(`arrow keys move highlight across bounds and clear past the right edge`, async () => {
    const input = setup()
    for (let step = 0; step < 4; step++) input.dispatchEvent(press(`ArrowLeft`))
    await tick()
    expect(is_highlighted(0)).toBe(true)
    expect(is_highlighted(1)).toBe(false)

    input.dispatchEvent(press(`ArrowRight`)) // idx 1
    input.dispatchEvent(press(`ArrowRight`)) // idx 2
    await tick()
    expect(is_highlighted(2)).toBe(true)
    input.dispatchEvent(press(`ArrowRight`)) // clears
    await tick()
    expect(highlighted()).toHaveLength(0)
  })

  test(`Backspace removes highlighted item and highlight stays at same index`, async () => {
    const input = setup()
    input.dispatchEvent(press(`ArrowLeft`)) // Blue (idx 2)
    input.dispatchEvent(press(`ArrowLeft`)) // Green (idx 1)
    input.dispatchEvent(press(`Backspace`))
    await tick()
    expect(selected_items()).toHaveLength(2)
    expect(selected_items()[0]?.textContent).toContain(`Red`)
    expect(selected_items()[1]?.textContent).toContain(`Blue`)
    // highlight should stay at idx 1 (Blue), not jump to idx 0 (Red)
    expect(is_highlighted(1)).toBe(true)
    expect(is_highlighted(0)).toBe(false)
  })

  test.each<[name: string, key: string, selected: string[], input_text: string]>([
    [`ArrowLeft with input text`, `ArrowLeft`, options, `R`],
    [`ArrowLeft without selected items`, `ArrowLeft`, [], ``],
    [`ArrowRight without a highlight`, `ArrowRight`, options, ``],
  ])(`%s is a no-op`, async (_name, key, selected, input_text) => {
    const input = setup(selected)
    if (input_text) {
      input.value = input_text
      input.dispatchEvent(new Event(`input`, { bubbles: true }))
      await tick()
    }
    input.dispatchEvent(press(key))
    await tick()
    expect(highlighted()).toHaveLength(0)
  })

  test(`Backspace without highlight removes last item`, async () => {
    const input = setup()
    input.dispatchEvent(press(`Backspace`))
    await tick()
    const text = doc_query(`ul.selected`).textContent?.trim()
    expect(text).toContain(`Red`)
    expect(text).toContain(`Green`)
    expect(text).not.toContain(`Blue`)
  })

  test(`Backspace on single highlighted item clears highlight`, async () => {
    const input = setup([`Red`])
    input.dispatchEvent(press(`ArrowLeft`))
    input.dispatchEvent(press(`Backspace`))
    await tick()
    expect(selected_items()).toHaveLength(0)
    expect(highlighted()).toHaveLength(0)
  })

  test.each([`Escape`, `ArrowDown`, `ArrowUp`, `Tab`, `Enter`, `a`])(
    `%s clears highlight`,
    async (key) => {
      const input = setup()
      input.dispatchEvent(press(`ArrowLeft`))
      await tick()
      expect(highlighted()).toHaveLength(1)
      input.dispatchEvent(press(key))
      await tick()
      expect(highlighted()).toHaveLength(0)
    },
  )

  test(`clicking X button clears highlight`, async () => {
    const input = setup()
    // highlight idx 1 (Green) so removing the last item leaves a valid stale index
    input.dispatchEvent(press(`ArrowLeft`))
    input.dispatchEvent(press(`ArrowLeft`))
    await tick()
    expect(is_highlighted(1)).toBe(true)
    // click X on last item (Blue) — selected becomes [Red, Green], stale idx 1 still valid
    ;[...document.querySelectorAll<HTMLElement>(`ul.selected li button.remove`)]
      .at(-1)
      ?.click()
    await tick()
    expect(highlighted()).toHaveLength(0)
  })

  test(`remove-all button clears highlight`, async () => {
    // minSelect=1 so one item survives remove-all, exposing stale highlighted_idx
    const input = setup([`Red`, `Green`, `Blue`], { minSelect: 1 })
    // highlight idx 0 (Red) — this item will survive remove-all
    for (let step = 0; step < 3; step++) input.dispatchEvent(press(`ArrowLeft`))
    await tick()
    expect(is_highlighted(0)).toBe(true)
    doc_query(`button.remove-all`).click()
    await tick()
    expect(selected_items()).toHaveLength(1)
    expect(highlighted()).toHaveLength(0)
  })

  test(`consecutive Backspace removals track highlight correctly`, async () => {
    const input = setup()
    input.dispatchEvent(press(`ArrowLeft`)) // idx 2 (Blue)
    input.dispatchEvent(press(`ArrowLeft`)) // idx 1 (Green)
    input.dispatchEvent(press(`ArrowLeft`)) // idx 0 (Red)
    input.dispatchEvent(press(`Backspace`)) // remove Red, highlight stays at 0
    await tick()
    expect(selected_items()).toHaveLength(2)
    expect(selected_items()[0]?.textContent).toContain(`Green`)
    expect(is_highlighted(0)).toBe(true)
    input.dispatchEvent(press(`Backspace`)) // remove Green, highlight stays at 0
    await tick()
    expect(selected_items()).toHaveLength(1)
    expect(selected_items()[0]?.textContent).toContain(`Blue`)
    expect(is_highlighted(0)).toBe(true)
  })

  test(`Backspace with duplicates removes correct occurrence`, async () => {
    // with duplicates=true, selected can have repeated values
    // backspace on highlighted idx 2 (second "Red") must remove idx 2, not idx 0
    const input = setup([`Red`, `Blue`, `Red`], { duplicates: true })
    input.dispatchEvent(press(`ArrowLeft`)) // idx 2 (second Red)
    input.dispatchEvent(press(`Backspace`))
    await tick()
    expect(selected_items()).toHaveLength(2)
    // first Red (idx 0) should survive, Blue (idx 1) should survive
    expect(selected_items()[0]?.textContent).toContain(`Red`)
    expect(selected_items()[1]?.textContent).toContain(`Blue`)
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
      selected: [first, second],
      duplicates: true,
      onremove: ({ option }: { option: unknown }) => (removed = option),
    })
    document.querySelectorAll<HTMLElement>(`ul.selected li button.remove`)[1]?.click()
    await tick()
    // toStrictEqual not toBe: Svelte hands the callback a $state proxy of the option
    expect(removed).toStrictEqual(second)
  })

  test(`re-focusing input clears highlight`, async () => {
    const input = setup()
    input.dispatchEvent(press(`ArrowLeft`))
    await tick()
    expect(highlighted()).toHaveLength(1)
    input.blur()
    input.focus()
    await tick()
    expect(highlighted()).toHaveLength(0)
  })

  test.each<[name: string, next_selected: string[], expected_idx: number | null]>([
    // externally shrinking past the highlighted idx should clamp to the last valid index;
    // clearing should drop the highlight entirely (expected_idx null)
    [`shrink clamps highlighted_idx`, [`Red`, `Green`], 1],
    [`clear nullifies highlighted_idx`, [], null],
  ])(`external selected %s`, async (_name, next_selected, expected_idx) => {
    const props = $state<MultiSelectProps>({
      options,
      selected: [`Red`, `Green`, `Blue`],
    })
    mount_multiselect(props)
    const input = get_input()
    // highlight idx 2 (Blue)
    input.dispatchEvent(press(`ArrowLeft`))
    await tick()
    expect(is_highlighted(2)).toBe(true)
    props.selected = next_selected
    await tick()
    expect(selected_items()).toHaveLength(next_selected.length)
    if (expected_idx === null) expect(highlighted()).toHaveLength(0)
    else expect(is_highlighted(expected_idx)).toBe(true)
  })

  test(`highlighted pill does not set aria-activedescendant`, async () => {
    const input = setup()
    expect(input.getAttribute(`aria-activedescendant`)).toBeNull()
    input.dispatchEvent(press(`ArrowLeft`))
    await tick()
    const highlighted_li = document.querySelector(`ul.selected > li.highlighted`)
    expect(highlighted_li).toBeInstanceOf(HTMLLIElement)
    expect(input.getAttribute(`aria-activedescendant`)).toBeNull()
  })

  test(`each selected <li> has a stable id`, () => {
    setup()
    const items = selected_items()
    for (const item of items) {
      expect(item.id).toMatch(/-selected-\d+$/u)
    }
    const ids = [...items].map((li) => li.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe(`keyboard shortcuts`, () => {
  // Mount with shortcut props, focus the input, dispatch one keydown, and return the
  // bound props plus the (cancelable) event so callers can assert selection + defaultPrevented.
  async function test_shortcut(
    shortcut_props: Partial<MultiSelectProps>,
    key_event: {
      key: string
      ctrlKey?: boolean
      shiftKey?: boolean
      altKey?: boolean
      metaKey?: boolean
    },
  ): Promise<{ props: MultiSelectProps; input: HTMLInputElement; event: KeyboardEvent }> {
    const props = $state<MultiSelectProps>({
      options: [`a`, `b`, `c`],
      selected: [],
      open: true,
      ...shortcut_props,
    })

    mount_multiselect(props)
    await tick()

    const input = get_input()
    input.focus()
    const event = new KeyboardEvent(`keydown`, {
      ...key_event,
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)
    await tick()

    return { props, input, event }
  }

  test(`ctrl+a selects all when shortcut is explicitly set`, async () => {
    const { props, event } = await test_shortcut(
      { selectAllOption: true, shortcuts: { select_all: `ctrl+a` } },
      { key: `a`, ctrlKey: true },
    )
    expect(props.selected).toEqual([`a`, `b`, `c`])
    expect(event.defaultPrevented).toBe(true)
  })

  test.each([
    [`ctrl+backspace (default)`, {}, { ctrlKey: true }],
    [`meta+backspace (explicit)`, { clear_all: `meta+backspace` }, { metaKey: true }],
  ])(
    `%s clears all selected options and prevents default`,
    async (_label, shortcut_override, modifiers) => {
      const { props, event } = await test_shortcut(
        {
          selected: [`a`, `b`],
          ...(Object.keys(shortcut_override).length > 0
            ? { shortcuts: shortcut_override }
            : {}),
        },
        { key: `Backspace`, ...modifiers },
      )
      expect(props.selected).toEqual([])
      expect(event.defaultPrevented).toBe(true)
    },
  )

  test(`custom shortcuts override defaults`, async () => {
    // Default ctrl+a should NOT work with a custom select_all binding
    const { props, input } = await test_shortcut(
      { selectAllOption: true, shortcuts: { select_all: `ctrl+e` } },
      { key: `a`, ctrlKey: true },
    )
    expect(props.selected).toEqual([])

    // Custom ctrl+e SHOULD work
    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `e`, ctrlKey: true, bubbles: true }),
    )
    await tick()
    expect(props.selected).toEqual([`a`, `b`, `c`])
  })

  test.each([
    [`default (null)`, {}],
    [`explicitly null`, { shortcuts: { select_all: null } }],
  ])(`select_all %s: ctrl+a not swallowed`, async (_label, extra_props) => {
    const { props, event } = await test_shortcut(
      { selectAllOption: true, ...extra_props },
      { key: `a`, ctrlKey: true },
    )
    expect(props.selected).toEqual([])
    expect(event.defaultPrevented).toBe(false)
  })

  test.each([
    [
      `select_all respects maxSelect`,
      {
        selected: [],
        selectAllOption: true,
        shortcuts: { select_all: `ctrl+a` },
        maxSelect: 2,
      },
      { key: `a`, ctrlKey: true },
      2,
    ],
    [
      `clear_all respects minSelect`,
      { selected: [`a`, `b`, `c`], minSelect: 1 },
      { key: `Backspace`, ctrlKey: true },
      1,
    ],
  ])(`%s`, async (_label, extra_props, key_event, expected_length) => {
    const { props } = await test_shortcut(extra_props, key_event)
    expect(props.selected).toHaveLength(expected_length)
  })

  test(`clear_all skipped when searchText is non-empty`, async () => {
    const { props, event } = await test_shortcut(
      { selected: [`a`, `b`], searchText: `xyz` },
      { key: `Backspace`, ctrlKey: true },
    )
    expect(props.selected).toEqual([`a`, `b`])
    expect(event.defaultPrevented).toBe(false)
  })

  test.each([`meta+a`, `cmd+a`])(`%s shortcut works for Mac users`, async (shortcut) => {
    const { props } = await test_shortcut(
      { selectAllOption: true, shortcuts: { select_all: shortcut } },
      { key: `a`, metaKey: true },
    )
    expect(props.selected).toEqual([`a`, `b`, `c`])
  })

  test(`select_all does nothing when selectAllOption is false`, async () => {
    const { props } = await test_shortcut(
      { selectAllOption: false, shortcuts: { select_all: `ctrl+a` } },
      { key: `a`, ctrlKey: true },
    )
    // Should NOT select all since selectAllOption is false
    expect(props.selected).toEqual([])
  })

  test(`custom open and close shortcuts toggle the dropdown`, async () => {
    const props = $state<MultiSelectProps>({
      options: [`a`, `b`, `c`],
      shortcuts: { open: `ctrl+o`, close: `ctrl+w` },
      open: true,
    })
    mount_multiselect(props)
    await tick()
    const input = await focus_input()

    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `w`, ctrlKey: true, bubbles: true }),
    )
    await tick()
    expect(props.open).toBe(false)

    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `o`, ctrlKey: true, bubbles: true }),
    )
    await tick()
    expect(props.open).toBe(true)
  })

  test.each([
    [`alt+a`, `a`, { altKey: true }],
    [`ctrl+shift+alt+s`, `s`, { ctrlKey: true, shiftKey: true, altKey: true }],
  ] as const)(`modifier combo %s works`, async (shortcut, key, modifiers) => {
    const { props } = await test_shortcut(
      { selectAllOption: true, shortcuts: { select_all: shortcut } },
      { key, ...modifiers },
    )
    expect(props.selected).toEqual([`a`, `b`, `c`])
  })

  test(`shortcuts are blocked when disabled=true`, async () => {
    const { props } = await test_shortcut(
      { selectAllOption: true, shortcuts: { select_all: `ctrl+a` }, disabled: true },
      { key: `a`, ctrlKey: true },
    )
    // Shortcuts should not work when component is disabled
    expect(props.selected).toEqual([])
  })

  test.each([
    [`ctrl+`, { ctrlKey: true }], // missing key
    [``, {}], // empty string
  ])(
    `invalid shortcut format "%s" does not trigger action`,
    async (shortcut, modifiers) => {
      const { props } = await test_shortcut(
        { selectAllOption: true, shortcuts: { select_all: shortcut } },
        { key: `a`, ...modifiers },
      )
      expect(props.selected).toEqual([])
    },
  )

  test.each([
    [
      `select_all`,
      { selectAllOption: true, selected: [], shortcuts: { select_all: `ctrl+a` } },
      `a`,
      { ctrlKey: true },
      [`a`, `b`, `c`],
    ],
    [`clear_all`, { selected: [`a`, `b`] }, `Backspace`, { ctrlKey: true }, []],
  ])(
    `%s shortcut works when dropdown is closed`,
    async (_name, extra_props, key, modifiers, expected) => {
      const { props } = await test_shortcut(
        { open: false, ...extra_props },
        { key, ...modifiers },
      )
      expect(props.selected).toEqual(expected)
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

  // Tests for shortcut override behavior - custom shortcuts take precedence over built-in keys
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
      { open: true, selectAllOption: true },
      `ArrowDown`,
      true,
      [`a`, `b`, `c`],
    ],
  ] as const)(
    `shortcut precedence: %s`,
    async (_desc, shortcuts, extra_props, key, expected_open, expected_selected) => {
      const props = $state<MultiSelectProps>({
        options: [`a`, `b`, `c`],
        shortcuts,
        selected: [],
        ...extra_props,
      })

      mount_multiselect(props)
      await tick()

      const input = await focus_input()

      input.dispatchEvent(new KeyboardEvent(`keydown`, { key, bubbles: true }))
      await tick()

      expect(props.open).toBe(expected_open)
      expect(props.selected).toEqual(expected_selected)
    },
  )
})

test(`falsy option values (0, '') are navigable and selectable via keyboard`, async () => {
  const props = $state<MultiSelectProps>({ options: [0, 1, 2], selected: [] })
  mount_multiselect(props)
  const input = get_input()

  // ArrowDown activates option 0 (previously reset to null because !0 is truthy)
  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()
  expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(`0`)

  // navigation continues past the falsy option instead of being stuck on it
  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()
  expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(`1`)

  // Enter selects option 0 (previously fell through the `if (activeOption)` check)
  input.dispatchEvent(fresh_key(`ArrowUp`))
  await tick()
  input.dispatchEvent(fresh_key(`Enter`))
  await tick()
  expect(props.selected).toEqual([0])
})

test(`keyboard navigation respects maxOptions: arrow keys wrap within rendered options`, async () => {
  mount_multiselect({ options: [`a`, `b`, `c`, `d`, `e`], maxOptions: 2 })
  const input = get_input()

  // 3 ArrowDowns: a -> b -> wrap back to a (previously walked into hidden options c/d/e)
  const expected_active = [`a`, `b`, `a`]
  for (const expected of expected_active) {
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(expected)
    // aria-activedescendant must reference an element that exists in the DOM
    const active_id = input.getAttribute(`aria-activedescendant`)
    expect(active_id).not.toBeNull()
    expect(document.querySelector(`[id="${active_id}"]`)).not.toBeNull()
  }
})

test(`IME composition guard: Enter during composition is ignored`, async () => {
  const props = $state<MultiSelectProps>({ options: [`foo`, `bar`], selected: [] })
  mount_multiselect(props)
  const input = get_input()

  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()
  expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(`foo`)

  // Enter mid-composition (e.g. confirming CJK text) must not select the active option
  const composing_enter = fresh_key(`Enter`)
  Object.defineProperty(composing_enter, `isComposing`, { value: true })
  input.dispatchEvent(composing_enter)
  await tick()
  expect(props.selected).toEqual([])

  // same keystroke outside composition selects normally
  input.dispatchEvent(fresh_key(`Enter`))
  await tick()
  expect(props.selected).toEqual([`foo`])
})
