// deno-lint-ignore-file no-await-in-loop
import { readFileSync } from 'node:fs'
import { createRawSnippet, mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'

import type { Option, OptionStyle } from '$lib'
import { MultiSelect } from '$lib'
import type { LoadOptionsParams, MultiSelectProps, PortalParams } from '$lib/types'
import { get_label } from '$lib/utils'

import { doc_query, type Test2WayBindProps } from './index'
import Test2WayBind from './Test2WayBind.svelte'
import TestMultiSelectSnippets from './TestMultiSelectSnippets.svelte'

const mouseover = new MouseEvent(`mouseover`, { bubbles: true })
// fresh event per dispatch: happy-dom never resets the stop-propagation flag,
// so shared event instances go inert once a handler calls stopPropagation()
const fresh_key = (key: string) => new KeyboardEvent(`keydown`, { key, bubbles: true })
const console_methods = { error: console.error, warn: console.warn }
const normalized_text = (element: Element) =>
  element.textContent?.replaceAll(/\s+/gu, ` `).trim()
afterEach(() => Object.assign(console, console_methods))

async function open_multiselect_via_mouseup(): Promise<void> {
  doc_query(`div.multiselect`).dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
  await tick()
}

// the visible search input; the hidden form-control input carries no autocomplete attr
const get_input = () => doc_query<HTMLInputElement>(`input[autocomplete]`)

// focusing the search input is what opens the dropdown
async function focus_input(): Promise<HTMLInputElement> {
  const input = get_input()
  input.focus()
  await tick()
  return input
}

async function type_search_text(
  search_text: string,
  input = get_input(),
): Promise<HTMLInputElement> {
  input.value = search_text
  input.dispatchEvent(new InputEvent(`input`, { bubbles: true }))
  await tick()
  return input
}

test(`2-way binding preserves a valid initial auto-active index`, async () => {
  const props = $state<MultiSelectProps>({
    options: [`Alpha`, `Beta`, `Gamma`],
    activeIndex: 1,
    autoActiveFirstOption: true,
    searchText: `a`,
  })

  mount(MultiSelect, { target: document.body, props })
  await tick()
  expect(props.activeIndex).toBe(1)

  // test internal changes to activeIndex bind outward
  for (const idx of [1, 2]) {
    const li = doc_query(`ul.options li:nth-child(${idx})`)
    li.dispatchEvent(mouseover)

    expect(props.activeIndex).toEqual(idx - 1)
  }

  // test external changes to activeIndex bind inward
  props.activeIndex = 2
  await tick()

  expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(`Gamma`)
})

test(`clears active state when replacement identity is ambiguous`, async () => {
  const props = $state<MultiSelectProps>({
    options: [{ label: `Duplicate` }, { label: `Duplicate` }],
    activeIndex: 1,
    activeOption: null,
    key: () => `duplicate`,
  })
  mount(MultiSelect, { target: document.body, props })
  await tick()

  props.options = [{ label: `Duplicate` }, { label: `Duplicate` }]
  await tick()

  expect(props.activeIndex).toBeNull()
  expect(props.activeOption).toBeNull()
})

test(`1-way binding of activeOption and hovering an option makes it active`, async () => {
  // test internal change to activeOption binds outward
  let activeOption: Option | null | undefined = 0
  const cb = vi.fn()

  mount(Test2WayBind, {
    target: document.body,
    props: {
      options: [1, 2, 3],
      onActiveOptionChanged: (data: Option | null | undefined) => {
        activeOption = data
        cb(data)
      },
    },
  })

  const firstOption = doc_query(`ul.options > li`)
  firstOption.dispatchEvent(mouseover)
  await tick()

  expect(activeOption).toBe(1)
  expect(cb).toHaveBeenCalled()
})

test(`defaultDisabledTitle and custom per-option disabled titles are applied correctly`, () => {
  const defaultDisabledTitle = `Not selectable`
  const special_disabled_title = `Special disabled title`
  const options = [1, 2, 3].map((el) => ({
    label: el,
    disabled: true,
    disabledTitle: el > 1 ? undefined : special_disabled_title,
  }))

  mount(MultiSelect, {
    target: document.body,
    props: { options, defaultDisabledTitle },
  })

  const lis = document.querySelectorAll<HTMLLIElement>(`ul.options > li`)

  expect(lis).toHaveLength(3)
  expect([...lis].map((li) => li.title)).toEqual([
    special_disabled_title,
    defaultDisabledTitle,
    defaultDisabledTitle,
  ])
})

test(`applies DOM attributes to input node`, () => {
  const searchText = `1`
  const id = `fancy-id`
  const autocomplete = `on`
  const name = `fancy-name`
  const placeholder = `fancy placeholder`
  const inputmode = `tel`
  const pattern = `(reg)[ex]`

  mount(MultiSelect, {
    target: document.body,
    props: {
      options: [1, 2, 3],
      searchText,
      id,
      autocomplete,
      placeholder,
      name,
      inputmode,
      pattern,
    },
  })

  const lis = document.querySelectorAll(`ul.options > li`)
  const input = get_input()
  const form_input = doc_query<HTMLInputElement>(`input.form-control`)

  // make sure the search text filtered the dropdown options
  expect(lis).toHaveLength(1)

  expect(input?.value).toBe(searchText)
  expect(input?.id).toBe(id)
  expect(input?.autocomplete).toBe(autocomplete)
  expect(input?.placeholder).toBe(placeholder)
  expect(form_input?.name).toBe(name)
  expect(input?.inputMode).toBe(inputmode)
  expect(input?.pattern).toBe(pattern)
})

// https://github.com/janosh/svelte-widgets/issues/354
test.each([
  [`Pick a number`, ``],
  [{ text: `Pick a number`, persistent: true }, `Pick a number`],
  [{ text: `Pick a number` }, ``],
] as const)(
  `placeholder=%j shows %j after selection`,
  async (placeholder, expected_after) => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2, 3], placeholder },
    })

    const input = get_input()
    expect(input.placeholder).toBe(`Pick a number`)

    doc_query(`ul.options li`).click()
    await tick()

    expect(input.placeholder).toBe(expected_after)
  },
)

test(`applies custom classes for styling through CSS frameworks`, async () => {
  const prop_elem_map = {
    input: HTMLInputElement,
    liOption: HTMLLIElement,
    liActiveOption: HTMLLIElement,
    liSelected: HTMLLIElement,
    outerDiv: HTMLDivElement,
    ulOptions: HTMLUListElement,
    ulSelected: HTMLUListElement,
    maxSelectMsg: HTMLSpanElement,
  }
  const css_classes = Object.fromEntries(
    Object.keys(prop_elem_map).map((cls) => [`${cls}Class`, cls]),
  )

  mount(MultiSelect, {
    target: document.body,
    // selected and maxSelect are what make ulSelected and maxSelectMsg render at all
    props: { options: [1, 2, 3], ...css_classes, selected: [1], maxSelect: 2 },
  })

  // make an option active hovering it so it gets the active class
  document.querySelector(`ul.options > li`)?.dispatchEvent(mouseover)
  await tick()

  for (const [class_name, elem_type] of Object.entries(prop_elem_map)) {
    const el = doc_query(`.${class_name}`)

    expect(el).toBeInstanceOf(elem_type)
  }
})

// https://github.com/janosh/svelte-widgets/issues/111
test(`arrow down makes first option active`, async () => {
  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], open: true },
  })

  const input = get_input()

  input.dispatchEvent(fresh_key(`ArrowDown`))

  await tick()

  const active_option = doc_query(`ul.options > li.active`)

  expect(active_option.textContent?.trim()).toBe(`1`)
})

// https://github.com/janosh/svelte-widgets/issues/112
test(`can select 1st and last option with arrow and enter key`, async () => {
  let selected: Option[] = []
  mount(Test2WayBind, {
    target: document.body,
    props: {
      open: true,
      options: [1, 2, 3],
      onSelectedChanged: (data: Option[] | undefined) => (selected = data ?? []),
    },
  })

  const input = get_input()

  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()
  input.dispatchEvent(fresh_key(`Enter`))
  await tick()
  expect(selected).toEqual([1])

  input.dispatchEvent(fresh_key(`ArrowUp`))
  await tick()
  input.dispatchEvent(fresh_key(`Enter`))
  await tick()
  expect(selected).toEqual([1, 3])
})

describe(`bubbles <input> node DOM events`, () => {
  const default_options = [1, 2, 3]

  test.each([
    [`blur`, new FocusEvent(`blur`, { bubbles: true })],
    [`click`, new MouseEvent(`click`, { bubbles: true })],
    [`focus`, new FocusEvent(`focus`, { bubbles: true })],
    [`keydown`, fresh_key(`Enter`)],
    [`keyup`, new KeyboardEvent(`keyup`, { key: `Enter`, bubbles: true })],
    [`mouseenter`, new MouseEvent(`mouseenter`, { bubbles: true })],
    [`mouseleave`, new MouseEvent(`mouseleave`, { bubbles: true })],
  ])(`bubbles <input> node "%s" event`, async (name, event) => {
    const spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: {
        options: default_options,
        [`on${name}`]: spy,
      },
    })

    const input = get_input()

    if (name === `focus`) {
      input.focus()
    } else if (name === `blur`) {
      input.focus() // it has to have focus before it can lose it
      input.blur()
    } else {
      if ([`click`, `keydown`, `keyup`].includes(name)) input.focus()
      input.dispatchEvent(event)
    }
    await tick()
    expect(spy, `event type '${name}'`).toHaveBeenCalledTimes(1)
    expect(spy, `event type '${name}'`).toHaveBeenCalledWith(
      expect.any(event.constructor),
    )
  })
})

describe.each([[null], [1]])(`value is`, (maxSelect) => {
  test.each([[[1, 2, 3]], [[`a`, `b`, `c`]]])(
    `${maxSelect === 1 ? `single` : `multiple`} options when maxSelect=${maxSelect}`,
    (options) => {
      const select = mount(Test2WayBind, {
        target: document.body,
        props: { options, maxSelect, selected: options },
      })

      // every option is handed in as selected, so this also pins that an initial
      // selection is truncated to maxSelect rather than kept whole
      expect(select.value).toStrictEqual(maxSelect === 1 ? options[0] : options)
    },
  )
})

test.each([[null], [1]])(`2-way binding of value updates selected`, async (maxSelect) => {
  const select = mount(Test2WayBind, {
    target: document.body,
    props: { options: [1, 2, 3], maxSelect },
  })

  // On init, value stays null (no unnecessary sync from null to []). See issue #369.
  expect(select.value).toBeNull()

  await tick()
  if (maxSelect === 1) {
    select.value = 2
    await tick()
    expect(select.value).toBe(2)
    expect(select.selected).toEqual([2])
  } else {
    select.value = [1, 2]
    await tick()
    expect(select.value).toEqual([1, 2])
    expect(select.selected).toEqual([1, 2])
  }
})

// falsy but valid option values (0, "") must survive the value→selected sync
test.each([
  [0, [0, 1, 2]],
  [``, [``, `a`, `b`]],
])(`maxSelect=1 preserves falsy value %j`, async (falsy_val, opts) => {
  const select = mount(Test2WayBind, {
    target: document.body,
    props: { options: opts, maxSelect: 1 },
  })

  select.value = falsy_val
  await tick()

  expect(select.value).toEqual(falsy_val)
  expect(select.selected).toEqual([falsy_val])
})

// Bug: value/selected should update when maxSelect changes at runtime
test.each([
  {
    initial: null,
    changed: 1,
    selected: [1, 2, 3],
    expectedValue: 1,
    expectedSelected: [1],
  },
  { initial: 1, changed: null, selected: [1], expectedValue: [1], expectedSelected: [1] },
])(`value updates when maxSelect changes from $initial to $changed`, async (params) => {
  const select = mount(Test2WayBind, {
    target: document.body,
    props: { options: [1, 2, 3], selected: params.selected, maxSelect: params.initial },
  })
  await tick()

  select.maxSelect = params.changed
  await tick()

  expect(select.value).toEqual(params.expectedValue)
  expect(select.selected).toEqual(params.expectedSelected)
})

test(`selected is array of first two options when maxSelect=2`, () => {
  // even though all options have preselected=true
  const options = [1, 2, 3].map((itm) => ({
    label: itm,
    preselected: true,
  }))

  const select = mount(Test2WayBind, {
    target: document.body,
    props: { options, maxSelect: 2 },
  })

  expect(select.selected).toEqual(options.slice(0, 2))
})

describe(`selectedDisplay=input`, () => {
  const color_options = [`Red`, `Green`, `Blue`]
  const input_display_props = { maxSelect: 1, selectedDisplay: `input` } satisfies Pick<
    MultiSelectProps,
    `maxSelect` | `selectedDisplay`
  >
  const press = (key: string) =>
    new KeyboardEvent(`keydown`, { key, bubbles: true, cancelable: true })

  const option_items = (): HTMLLIElement[] => [
    ...document.querySelectorAll<HTMLLIElement>(`ul.options > li:not(.user-msg)`),
  ]

  const option_labels = (): string[] =>
    option_items().map((option_item) => option_item.textContent?.trim() ?? ``)

  function option_by_label(label: string): HTMLLIElement {
    const option_item = option_items().find((item) => item.textContent?.trim() === label)
    if (!option_item) throw new Error(`Option "${label}" not found`)
    return option_item
  }

  async function click_expand_icon(): Promise<void> {
    doc_query(`.expand-icon`).dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
    await tick()
  }

  const mount_input_display = (
    props: Partial<Test2WayBindProps> = {},
    target: HTMLElement = document.body,
  ) => mount(Test2WayBind, { target, props: { ...input_display_props, ...props } })

  test.each([
    { options: [`Red`, `Green`], expected: `Red`, expected_value: `Red` },
    { options: [1, 2], expected: `1`, expected_value: 1 },
    {
      options: [
        { label: `Red`, value: `#f00` },
        { label: `Green`, value: `#0f0` },
      ],
      expected: `Red`,
      expected_value: { label: `Red`, value: `#f00` },
    },
  ])(
    `commits $expected to the editable input without rendering chips`,
    async ({ options, expected, expected_value }) => {
      const select = mount_input_display({ options, closeDropdownOnSelect: false })

      doc_query(`ul.options > li`).click()
      await tick()

      const input = get_input()
      expect(input.value).toBe(expected)
      expect(select.searchText).toBe(expected)
      expect(select.value).toEqual(expected_value)
      expect(select.selected).toEqual([expected_value])
      expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(0)
      expect(document.querySelector(`ul.options li.user-msg`)).toBeNull()
    },
  )

  test(`editing committed text clears selected and value while preserving draft text`, async () => {
    const select = mount_input_display({ options: [`Red`, `Green`], selected: [`Red`] })
    await tick()

    const input = get_input()
    expect(input.value).toBe(`Red`)

    await type_search_text(`Reddish`, input)

    expect(input.value).toBe(`Reddish`)
    expect(select.searchText).toBe(`Reddish`)
    expect(select.selected).toEqual([])
    expect(select.value).toBeNull()
  })

  test(`typing exact option label does not auto-select without explicit commit`, async () => {
    const select = mount_input_display({ options: [`Red`, `Green`] })

    await type_search_text(`Red`)

    expect(select.searchText).toBe(`Red`)
    expect(select.selected).toEqual([])
    expect(select.value).toBeNull()
  })

  test(`programmatic value update and clear syncs visible input text`, async () => {
    const options = [
      { label: `Red`, value: `#f00` },
      { label: `Green`, value: `#0f0` },
    ]
    const select = mount_input_display({ options })

    select.value = options[1]
    await tick()

    const input = get_input()
    expect(input.value).toBe(`Green`)
    expect(select.searchText).toBe(`Green`)
    expect(select.selected).toEqual([options[1]])

    select.value = null
    await tick()

    expect(input.value).toBe(``)
    expect(select.searchText).toBe(``)
    expect(select.selected).toEqual([])
  })

  const reopen_cases: [string, (input: HTMLInputElement) => Promise<void>][] = [
    [`caret click`, click_expand_icon],
    [
      `input focus`,
      async (input: HTMLInputElement) => {
        input.focus()
        await tick()
      },
    ],
    [
      `ArrowDown`,
      async (input: HTMLInputElement) => {
        input.focus()
        input.dispatchEvent(press(`ArrowDown`))
        await tick()
      },
    ],
  ]

  test.each(reopen_cases)(
    `reopening after commit via %s shows all options with selected option marked`,
    async (_, reopen) => {
      mount_input_display({ options: color_options })

      option_by_label(`Red`).click()
      await tick()

      const input = get_input()
      expect(input.value).toBe(`Red`)

      await reopen(input)

      expect(input.getAttribute(`aria-expanded`)).toBe(`true`)
      expect(option_labels()).toEqual(color_options)

      const selected_option = option_by_label(`Red`)
      expect(selected_option.classList.contains(`selected`)).toBe(true)
      expect(selected_option.getAttribute(`aria-selected`)).toBe(`true`)
    },
  )

  test(`selecting from reopened committed list replaces value and remains form-valid`, async () => {
    const form = document.createElement(`form`)
    form.addEventListener(`submit`, (event) => event.preventDefault())
    document.body.append(form)
    try {
      const field_name = `color`
      const select = mount_input_display(
        {
          options: color_options,
          selected: [`Red`],
          name: field_name,
          required: true,
          open: true,
        },
        form,
      )
      await tick()

      option_by_label(`Green`).click()
      await tick()

      const input = get_input()
      expect(input.value).toBe(`Green`)
      expect(select.value).toBe(`Green`)
      expect(select.selected).toEqual([`Green`])
      expect(form.checkValidity()).toBe(true)
      expect(new FormData(form).get(field_name)).toBe(`Green`)
    } finally {
      form.remove()
    }
  })

  test(`typing after committed input text returns dropdown to filtered results`, async () => {
    const select = mount_input_display({
      options: color_options,
      selected: [`Red`],
      open: true,
    })
    await tick()

    expect(option_labels()).toEqual(color_options)

    const input = get_input()
    await type_search_text(`Bl`, input)

    expect(option_labels()).toEqual([`Blue`])
    expect(document.querySelector(`ul.options > li.selected`)).toBeNull()
    expect(select.searchText).toBe(`Bl`)
    expect(select.selected).toEqual([])
    expect(select.value).toBeNull()

    await click_expand_icon()

    expect(input.getAttribute(`aria-expanded`)).toBe(`false`)

    await click_expand_icon()

    expect(option_labels()).toEqual(color_options)
  })

  test(`caret click after custom draft shows all options and toggles closed`, async () => {
    const select = mount_input_display({ options: color_options })

    const input = await focus_input()
    await type_search_text(`Purple`, input)

    expect(option_labels()).toEqual([])
    expect(document.querySelector(`ul.options li.user-msg`)?.textContent).toContain(
      `No matching options`,
    )

    await click_expand_icon()

    expect(input.getAttribute(`aria-expanded`)).toBe(`false`)

    await click_expand_icon()

    expect(input.value).toBe(`Purple`)
    expect(option_labels()).toEqual(color_options)
    expect(document.querySelector(`ul.options li.user-msg`)).toBeNull()
    expect(select.selected).toEqual([])
    expect(select.value).toBeNull()

    option_by_label(`Green`).click()
    await tick()

    expect(input.value).toBe(`Green`)
    expect(select.searchText).toBe(`Green`)
    expect(select.selected).toEqual([`Green`])
    expect(select.value).toBe(`Green`)
  })

  test(`keyboard selection keeps aria-activedescendant valid and Escape preserves text`, async () => {
    const select = mount_input_display({ options: [`Red`, `Green`], open: true })
    const input = get_input()

    input.dispatchEvent(press(`ArrowDown`))
    await tick()
    const active_id = input.getAttribute(`aria-activedescendant`)
    expect(active_id).toBeTypeOf(`string`)
    expect(document.querySelector(`#${active_id}`)).toBeInstanceOf(HTMLLIElement)

    input.dispatchEvent(press(`Enter`))
    await tick()
    expect(input.value).toBe(`Red`)
    expect(select.value).toBe(`Red`)
    expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(0)

    input.dispatchEvent(press(`Escape`))
    await tick()
    expect(input.value).toBe(`Red`)
    expect(input.getAttribute(`aria-expanded`)).toBe(`false`)
  })

  test(`Backspace edits text normally instead of removing hidden chips`, async () => {
    const select = mount_input_display({ options: [`Red`, `Green`], selected: [`Red`] })
    await tick()
    const input = get_input()

    const backspace = press(`Backspace`)
    input.dispatchEvent(backspace)
    expect(backspace.defaultPrevented).toBe(false)

    await type_search_text(`Re`, input)

    expect(input.value).toBe(`Re`)
    expect(select.searchText).toBe(`Re`)
    expect(select.selected).toEqual([])
    expect(select.value).toBeNull()
    expect(document.querySelectorAll(`ul.selected > li.highlighted`)).toHaveLength(0)
    expect(input.getAttribute(`aria-activedescendant`)).toBeNull()
  })

  test(`invalid maxSelect combination reports config error`, async () => {
    console.error = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: { options: [`Red`], selectedDisplay: `input` },
    })
    await tick()

    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining(`selectedDisplay="input" requires maxSelect={1}`),
    )
  })

  test(`form submits visible text for draft and object-option values`, async () => {
    const form = document.createElement(`form`)
    form.addEventListener(`submit`, (event) => event.preventDefault())
    document.body.append(form)
    const field_name = `color`
    const options = [
      { label: `Red`, value: `#f00` },
      { label: `Green`, value: `#0f0` },
    ]

    mount(MultiSelect, {
      target: form,
      props: {
        ...input_display_props,
        options,
        name: field_name,
        required: true,
      },
    })

    const input = get_input()
    expect(form.checkValidity()).toBe(false)

    await type_search_text(`custom color`, input)
    expect(form.checkValidity()).toBe(true)
    expect(new FormData(form).get(field_name)).toBe(`custom color`)

    await type_search_text(``, input)
    doc_query(`ul.options > li`).click()
    await tick()
    expect(new FormData(form).get(field_name)).toBe(`Red`)
  })

  test(`inputProps forwards text-input attributes without overriding managed ARIA`, () => {
    mount(MultiSelect, {
      target: document.body,
      props: {
        ...input_display_props,
        options: [`Red`],
        inputProps: {
          maxlength: 5,
          readonly: true,
          [`aria-label`]: `Color input`,
          [`aria-expanded`]: `true`,
          role: `textbox`,
        },
      },
    })

    const input = get_input()
    expect(input.maxLength).toBe(5)
    expect(input.readOnly).toBe(true)
    expect(input.getAttribute(`aria-label`)).toBe(`Color input`)
    expect(input.getAttribute(`role`)).toBe(`combobox`)
    expect(input.getAttribute(`aria-expanded`)).toBe(`false`)
  })

  test(`quiet datalist mode commits custom text without create or no-match messages`, async () => {
    const select = mount_input_display({
      options: [],
      allowUserOptions: true,
      createOptionMsg: null,
      noMatchingOptionsMsg: ``,
    })
    const input = get_input()

    await type_search_text(`Durian`, input)
    expect(document.querySelector(`ul.options li.user-msg`)).toBeNull()

    input.dispatchEvent(press(`Enter`))
    await tick()

    expect(input.value).toBe(`Durian`)
    expect(select.value).toBe(`Durian`)
    expect(select.selected).toEqual([`Durian`])
    expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(0)
  })

  test(`keepSelectedInDropdown does not toggle away committed input selection`, async () => {
    const select = mount_input_display({
      options: [`Red`, `Green`],
      keepSelectedInDropdown: `plain`,
      selected: [`Red`],
      open: true,
    })
    await tick()

    doc_query(`ul.options > li.selected`).click()
    await tick()

    expect(select.value).toBe(`Red`)
    expect(select.selected).toEqual([`Red`])
    expect(get_input().value).toBe(`Red`)
  })

  test(`loadOptions uses input-mode search text for dynamic suggestions`, async () => {
    vi.useFakeTimers()
    try {
      const fetch_fn = vi.fn(() =>
        Promise.resolve({ options: [`Alpha`], hasMore: false }),
      )
      mount(MultiSelect, {
        target: document.body,
        props: {
          ...input_display_props,
          loadOptions: { fetch: fetch_fn, debounceMs: 0 },
          open: true,
        },
      })
      const input = get_input()

      await type_search_text(`Al`, input)
      await vi.runAllTimersAsync()
      await tick()

      expect(fetch_fn).toHaveBeenCalledWith(
        expect.objectContaining({ search: `Al`, offset: 0, limit: 50 }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  test(`loadOptions uses empty search after reopening committed input text`, async () => {
    vi.useFakeTimers()
    try {
      const fetch_fn = vi.fn(() =>
        Promise.resolve({ options: [`Alpha`, `Beta`], hasMore: false }),
      )
      mount(MultiSelect, {
        target: document.body,
        props: {
          ...input_display_props,
          selected: [`Alpha`],
          loadOptions: { fetch: fetch_fn, debounceMs: 0 },
        },
      })
      const input = get_input()

      input.focus()
      await vi.runAllTimersAsync()
      await tick()

      expect(fetch_fn).toHaveBeenCalledTimes(1)
      expect(fetch_fn).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: ``, offset: 0, limit: 50 }),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})

test.each<[string, boolean | number, number[], number | null, boolean, boolean]>([
  [`optional empty selection`, false, [], null, false, true],
  [`required empty selection`, true, [], null, false, false],
  [`one required at max boundary`, 1, [1], 1, false, true],
  [`two required with one selected`, 2, [1], null, false, false],
  [`max below required`, 2, [1, 2], 1, true, false],
  [`two required and selected`, 2, [1, 2], 2, false, true],
])(
  `form validation: %s`,
  async (_description, required, selected, maxSelect, expected_error, form_valid) => {
    const form = document.createElement(`form`)
    document.body.append(form)
    console.error = vi.fn()
    try {
      mount(MultiSelect, {
        target: form,
        props: { options: [1, 2, 3], required, selected, maxSelect },
      })
      await tick()
      if (expected_error) {
        expect(console.error).toHaveBeenCalledWith(
          `MultiSelect: maxSelect=${maxSelect} < required=${required}, makes it impossible for users to submit a valid form`,
        )
      } else expect(console.error).not.toHaveBeenCalled()

      // Form is valid if required count is met without exceeding maxSelect.
      expect(form.checkValidity(), `form_valid=${form_valid}`).toBe(form_valid)

      let submit_count = 0
      let submit_default_prevented = false
      form.addEventListener(`submit`, (event) => {
        submit_count += 1
        submit_default_prevented = event.defaultPrevented
        event.preventDefault()
      })
      const submit_button = document.createElement(`button`)
      submit_button.type = `submit`
      form.append(submit_button)
      submit_button.click()
      await tick()

      expect(submit_count, `form_valid=${form_valid}`).toBe(form_valid ? 1 : 0)
      if (form_valid) {
        expect(submit_default_prevented).toBe(false)
      }
    } finally {
      form.remove()
    }
  },
)

test.each([
  [[1, 2, 3]],
  [[`a`, `b`, `c`]],
  [[{ label: `a` }, { label: `b` }, { label: `c` }]],
])(`passes selected options=%j to form submission handlers`, async (options) => {
  const form = document.createElement(`form`)
  // actual form submission not supported in nodejs, would throw without preventing default behavior
  form.addEventListener(`submit`, (event) => event.preventDefault())
  document.body.append(form)

  const field_name = `test form submission`
  mount(MultiSelect, {
    target: form,
    props: { options, name: field_name, required: true },
  })
  expect(form.checkValidity()).toBe(false)

  const btn = document.createElement(`button`)
  form.append(btn)

  for (const _ of Array.from({ length: 3 })) {
    const li = doc_query(`ul.options li`)
    li.click()
    await tick()
  }
  expect(form.checkValidity()).toBe(true)

  btn.click() // submit form
  const form_data = new FormData(form)
  // parse rather than compare the JSON text, which is brittle to key order and spacing
  const submitted_value = form_data.get(field_name)
  expect(submitted_value).not.toBeNull()
  if (typeof submitted_value !== `string`) throw new Error(`expected string`)
  expect(JSON.parse(submitted_value)).toEqual(options)
})

test(`formSerialize customizes chip-mode form values`, async () => {
  const form = document.createElement(`form`)
  form.addEventListener(`submit`, (event) => event.preventDefault())
  document.body.append(form)

  try {
    const field_name = `serialized choices`
    const options = [`Red`, `Green`]
    mount(MultiSelect, {
      target: form,
      props: {
        options,
        name: field_name,
        formSerialize: (selected: Option[]) => selected.map(String).join(`|`),
      },
    })

    for (const _ of options) {
      doc_query(`ul.options li`).click()
      await tick()
    }

    expect(new FormData(form).get(field_name)).toBe(`Red|Green`)
  } finally {
    form.remove()
  }
})

test(`toggling required after invalid form submission allows submitting`, async () => {
  // https://github.com/janosh/svelte-widgets/issues/285
  const form = document.createElement(`form`)
  document.body.append(form)

  const props = $state({ options: [1, 2, 3], required: true })
  mount(MultiSelect, {
    target: form,
    props,
  })

  // form should not be submittable due to missing required input
  expect(form.checkValidity()).toBe(false)

  props.required = false
  await tick()
  expect(form.checkValidity()).toBe(true)
})

test(`invalid=true gives top-level div class 'invalid' and input attribute of 'aria-invalid'`, async () => {
  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], invalid: true },
  })

  const input = get_input()

  expect(input.getAttribute(`aria-invalid`)).toBe(`true`)
  const multiselect = doc_query(`div.multiselect`)
  expect(multiselect.classList.contains(`invalid`)).toBe(true)

  // assert aria-invalid attribute is removed on selecting a new option
  const option_li = doc_query<HTMLLIElement>(`ul.options > li`)
  option_li.click()
  await tick()

  expect(input.getAttribute(`aria-invalid`)).toBeNull()
  expect(multiselect.classList.contains(`invalid`)).toBe(false)
})

describe(`VoiceOver/screen reader accessibility (issue #118)`, () => {
  const mount_a11y = (props: Partial<MultiSelectProps> = {}) =>
    mount(MultiSelect, {
      target: document.body,
      props: { options: [`foo`, `bar`, `baz`], ...props },
    })

  test(`implements ARIA combobox pattern with proper attributes and listbox association`, async () => {
    mount_a11y()

    const input = get_input()

    // Static combobox attributes
    expect(input.getAttribute(`role`)).toBe(`combobox`)
    expect(input.getAttribute(`aria-haspopup`)).toBe(`listbox`)
    expect(input.getAttribute(`aria-expanded`)).toBe(`false`)

    // Open dropdown and verify listbox association
    input.focus()
    await tick()
    expect(input.getAttribute(`aria-expanded`)).toBe(`true`)

    const listbox_id = input.getAttribute(`aria-controls`)
    expect(listbox_id).toBeTypeOf(`string`)
    const listbox = doc_query(`ul.options`)
    expect(listbox.id).toBe(listbox_id)
    expect(listbox.getAttribute(`role`)).toBe(`listbox`)

    input.dispatchEvent(fresh_key(`Escape`))
    await tick()
    expect(input.getAttribute(`aria-expanded`)).toBe(`false`)
  })

  test(`aria-activedescendant tracks keyboard navigation with unique option IDs`, async () => {
    mount_a11y()

    const input = await focus_input()

    const options = document.querySelectorAll<HTMLLIElement>(
      `ul.options > li[role="option"]`,
    )
    const ids = [...options].map((opt) => opt.id)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(3) // one id per option, none shared

    expect(input.getAttribute(`aria-activedescendant`)).toBeNull() // nothing active yet

    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()

    const active_id = input.getAttribute(`aria-activedescendant`)
    expect(active_id).toBeTypeOf(`string`)
    const active_option = document.querySelector(`#${active_id}`)
    expect(active_option?.getAttribute(`role`)).toBe(`option`)
    expect(active_option?.classList.contains(`active`)).toBe(true)
  })

  test.each([
    [``, `3 options available`],
    [`ba`, `2 options available`],
    [`foo`, `1 option available`],
    [`xyz`, `0 options available`],
  ])(`aria-live region announces "%s" filter as "%s"`, async (filter, expected) => {
    mount_a11y()

    const input = await focus_input()

    if (filter) {
      await type_search_text(filter, input)
    }

    const live_region = doc_query(`.sr-only[aria-live="polite"]`)
    expect(live_region.getAttribute(`aria-atomic`)).toBe(`true`)
    expect(live_region.textContent).toContain(expected)
  })

  test(`custom id prop is used for ARIA associations`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: [`foo`, `bar`], id: `my-select` },
    })

    const input = await focus_input()

    expect(input.getAttribute(`aria-controls`)).toBe(`my-select-listbox`)
    expect(doc_query(`ul.options`).id).toBe(`my-select-listbox`)

    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    expect(input.getAttribute(`aria-activedescendant`)).toMatch(/^my-select-opt-/u)
  })

  test(`unique id stays stable across ticks when id prop is omitted`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: [`foo`, `bar`], open: true },
    })
    const listbox_id = doc_query(`ul.options`).id
    expect(listbox_id).toMatch(/^sms-.+-listbox$/u)
    await tick()
    expect(doc_query(`ul.options`).id).toBe(listbox_id)
    expect(get_input().getAttribute(`aria-controls`)).toBe(listbox_id)
  })

  test(`aria-label can be passed via rest props for accessible name`, () => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: [`foo`, `bar`], [`aria-label`]: `Select your favorite` },
    })

    const input = get_input()
    expect(input.getAttribute(`aria-label`)).toBe(`Select your favorite`)
  })

  test(`aria-busy reflects loading state`, async () => {
    const props = $state({ options: [`foo`, `bar`], loading: false })
    mount(MultiSelect, { target: document.body, props })

    const input = get_input()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    props.loading = true
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    props.loading = false
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBeNull()
  })

  test(`options have aria-posinset and aria-setsize for position announcements`, async () => {
    mount_a11y()

    await focus_input()

    const options = document.querySelectorAll<HTMLLIElement>(
      `ul.options > li[role="option"]`,
    )
    expect(options).toHaveLength(3)

    options.forEach((option, idx) => {
      expect(option.getAttribute(`aria-posinset`)).toBe(`${idx + 1}`)
      expect(option.getAttribute(`aria-setsize`)).toBe(`3`)
    })
  })

  test(`aria-live announces selection changes`, async () => {
    mount_a11y()

    await focus_input()

    const option = doc_query<HTMLLIElement>(`ul.options > li[role="option"]`)
    option.click()
    await tick()

    const live_region = doc_query(`.sr-only[aria-live="polite"]`)
    expect(live_region.textContent).toContain(`selected`)

    const selected_chip = doc_query(`ul.selected > li`)
    expect(selected_chip.getAttribute(`role`)).toBeNull()
    expect(selected_chip.getAttribute(`aria-selected`)).toBeNull()

    doc_query<HTMLButtonElement>(`ul.selected button.remove`).click()
    await tick()
    expect(live_region.textContent).toContain(`removed`)
  })
})

test(`parseLabelsAsHtml renders anchor tags as links`, () => {
  mount(MultiSelect, {
    target: document.body,
    props: {
      options: [`<a href="https://example.com">example.com</a>`],
      parseLabelsAsHtml: true,
    },
  })

  const anchor = doc_query(`a[href='https://example.com']`)
  expect(anchor).toBeInstanceOf(HTMLAnchorElement)
})

test(`children snippet receives type='selected' for pills and type='option' for dropdown items`, async () => {
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: {
      snippet_variant: `children`,
      options: [`Red`, `Green`, `Blue`],
      selected: [`Red`],
    },
  })

  const selected_span = doc_query(`ul.selected [data-testid="multiselect-child"]`)
  expect(selected_span.dataset.type).toBe(`selected`)
  expect(selected_span.textContent).toBe(`Red`)

  await open_multiselect_via_mouseup()

  const option_spans = document.querySelectorAll<HTMLElement>(
    `ul.options [data-testid="multiselect-child"]`,
  )
  // selected items stay out of the dropdown unless keepSelectedInDropdown is set
  expect([...option_spans].map((span) => [span.dataset.type, span.textContent])).toEqual([
    [`option`, `Green`],
    [`option`, `Blue`],
  ])
})

test(`option snippet receives selected, active, and disabled booleans`, async () => {
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: {
      snippet_variant: `option`,
      options: [
        { label: `Enabled`, value: 1 },
        { label: `Disabled`, value: 2, disabled: true },
      ],
      selected: [{ label: `Enabled`, value: 1 }],
      keepSelectedInDropdown: `plain`,
    },
  })

  await open_multiselect_via_mouseup()

  const option_spans = [
    ...document.querySelectorAll<HTMLElement>(
      `ul.options [data-testid="multiselect-option"]`,
    ),
  ]
  expect(option_spans).toHaveLength(2)

  // keepSelectedInDropdown is why an already-selected option still shows in the list
  expect(option_spans[0].dataset.selected).toBe(`true`)
  expect(option_spans[0].dataset.disabled).toBe(`false`)
  expect(option_spans[0].dataset.active).toBe(`false`)

  expect(option_spans[1].dataset.selected).toBe(`false`)
  expect(option_spans[1].dataset.disabled).toBe(`true`)
  expect(option_spans[1].dataset.active).toBe(`false`)

  // hover first option to activate it
  doc_query(`ul.options > li`).dispatchEvent(
    new MouseEvent(`mouseover`, { bubbles: true }),
  )
  await tick()
  const updated_spans = [
    ...document.querySelectorAll<HTMLElement>(
      `ul.options [data-testid="multiselect-option"]`,
    ),
  ]
  expect(updated_spans[0].dataset.active).toBe(`true`)
  expect(updated_spans[1].dataset.active).toBe(`false`)
})

test(`expandIcon snippet receives open and disabled, open toggles when dropdown opens`, async () => {
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: { options: [1, 2, 3], disabled: true },
  })
  const disabled_expand = doc_query(`.expand-snippet`)
  expect(disabled_expand.dataset.disabled).toBe(`true`)
  expect(disabled_expand.dataset.open).toBe(`false`)

  document.body.innerHTML = ``
  mount(TestMultiSelectSnippets, { target: document.body, props: { options: [1, 2, 3] } })
  const expand = doc_query(`.expand-snippet`)
  expect(expand.dataset.open).toBe(`false`)

  await open_multiselect_via_mouseup()
  expect(expand.dataset.open).toBe(`true`)
})

test.each([undefined, `left`, `right`] as const)(
  `expandIconPosition=%s places expand icon around selected list`,
  (position) => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2, 3], expandIconPosition: position },
    })
    const expand_icon = doc_query(`.expand-icon`)
    const selected_list = doc_query(`ul.selected`)
    if (position === `right`) expect(selected_list.nextElementSibling).toBe(expand_icon)
    else expect(expand_icon.nextElementSibling).toBe(selected_list)
  },
)

test(`expandIconPosition=none suppresses default and custom expand icons`, () => {
  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], expandIconPosition: `none` },
  })
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: { options: [1, 2, 3], expandIconPosition: `none` },
  })
  expect(document.querySelector(`.expand-icon`)).toBeNull()
  expect(document.querySelector(`.expand-snippet`)).toBeNull()
})

test(`expand icon click toggles dropdown in chips mode`, async () => {
  mount(MultiSelect, { target: document.body, props: { options: [1, 2, 3] } })

  const click_expand = async () => {
    doc_query(`.expand-icon`).dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
    await tick()
  }
  const input = get_input()

  for (const expanded of [`true`, `false`, `true`]) {
    await click_expand()
    expect(input.getAttribute(`aria-expanded`)).toBe(expanded)
  }
  await open_multiselect_via_mouseup()
  expect(input.getAttribute(`aria-expanded`)).toBe(`true`)
})

test(`removeIcon snippet receives option for per-item and isRemoveAll flag`, async () => {
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: { options: [1, 2, 3], selected: [1, 2] },
  })
  await tick()

  const remove_spans = [...document.querySelectorAll<HTMLElement>(`.remove-snippet`)]
  expect(remove_spans).toHaveLength(3)

  // first 2 are per-option removes
  expect(remove_spans[0].dataset.isRemoveAll).toBe(`false`)
  expect(remove_spans[0].dataset.option).toBe(`1`)
  expect(remove_spans[1].dataset.isRemoveAll).toBe(`false`)
  expect(remove_spans[1].dataset.option).toBe(`2`)
  // last is the remove-all button
  expect(remove_spans[2].dataset.isRemoveAll).toBe(`true`)
  expect(remove_spans[2].dataset.option).toBeUndefined()
})

test(`beforeInput and afterInput snippets receive searchText and flank the input`, async () => {
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: { options: [1, 2, 3] },
  })

  const before_input = doc_query(`.before-input-snippet`)
  const after_input = doc_query(`.after-input-snippet`)
  expect(before_input.dataset.searchText).toBe(``)
  expect(after_input.dataset.searchText).toBe(``)

  const input = get_input()
  expect(before_input.nextElementSibling).toBe(input)
  expect(input.nextElementSibling).toBe(after_input)

  await type_search_text(`test`, input)

  const before_input_after = doc_query(`.before-input-snippet`)
  const after_input_after = doc_query(`.after-input-snippet`)
  expect(before_input_after.dataset.searchText).toBe(`test`)
  expect(after_input_after.dataset.searchText).toBe(`test`)
})

test(`selectedItem snippet receives selected option and index`, async () => {
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: { options: [`red`, `blue`], selected: [`red`, `blue`] },
  })
  await tick()

  const selected_items = [
    ...document.querySelectorAll<HTMLElement>(`.selected-item-snippet`),
  ]
  expect(selected_items.map((item) => item.textContent)).toEqual([`red`, `blue`])
  expect(selected_items.map((item) => item.dataset.idx)).toEqual([`0`, `1`])
})

test(`userMsg snippet receives search text, message type, and message`, async () => {
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: { options: [`red`], allowUserOptions: true, open: true },
  })

  const input = get_input()
  await type_search_text(`purple`, input)

  const user_msg = doc_query(`.user-msg-snippet`)
  expect(user_msg.dataset.searchText).toBe(`purple`)
  expect(user_msg.dataset.msgType).toBe(`create`)
  expect(user_msg.textContent).toBe(`Create this option...`)
})

test.each([
  [`spinner`, { loading: true }, `.spinner-snippet`, `loading`],
  [`disabledIcon`, { disabled: true }, `.disabled-icon-snippet`, `disabled`],
])(`%s snippet replaces default icon`, (_label, props, selector, text) => {
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: { options: [1, 2, 3], ...props },
  })

  expect(doc_query(selector).textContent).toBe(text)
})

test(`filters dropdown to show only matching options when entering text`, async () => {
  const options = [`foo`, `bar`, `baz`]

  mount(MultiSelect, {
    target: document.body,
    props: { options },
  })

  const input = get_input()

  await type_search_text(`ba`, input)

  expect(normalized_text(doc_query(`ul.options`))).toBe(`bar baz`)
})

test(`filterFunc controls rendered options and matchingOptions`, async () => {
  const options = [`Alpha`, `Beta`, `Algae`]
  const props = $state<MultiSelectProps>({
    filterFunc: (opt: Option, search_text: string) =>
      `${get_label(opt)}`.toLowerCase().startsWith(search_text.toLowerCase()),
    matchingOptions: [],
    open: true,
    options,
  })
  mount(MultiSelect, { target: document.body, props })

  const input = get_input()
  await type_search_text(`al`, input)

  expect(props.matchingOptions).toEqual([options[0], options[2]])
  expect(normalized_text(doc_query(`ul.options`))).toBe(`Alpha Algae`)
})

test(`autoScroll=false skips scrolling active options into view`, async () => {
  mount(MultiSelect, {
    target: document.body,
    props: { autoScroll: false, open: true, options: [`first`, `second`] },
  })

  const options = [...document.querySelectorAll<HTMLElement>(`ul.options > li`)]
  for (const option of options) option.scrollIntoView = vi.fn()
  get_input().dispatchEvent(fresh_key(`ArrowDown`))
  await tick()

  expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(`first`)
  for (const option of options) {
    expect(option.scrollIntoView).not.toHaveBeenCalled()
  }
})

test.each([
  [`highlightMatches=false suppresses highlighting`, { highlightMatches: false }, false],
  [`typed search text is highlighted`, {}, true],
  // after committing, searchText is "Alpha" but it is no longer an active filter, so
  // highlighting must stay off — pins that the dropdown highlights the *effective*
  // filter text rather than the raw searchText
  [
    `committed selectedDisplay=input text is not highlighted`,
    { maxSelect: 1, selectedDisplay: `input`, closeDropdownOnSelect: false },
    false,
  ],
] as const)(`%s`, async (_desc, extra_props, expect_highlight) => {
  const highlights = { get: vi.fn(), set: vi.fn(), delete: vi.fn() }
  try {
    // happy-dom lacks the CSS Custom Highlight API; the registry spies carry the assertions
    vi.stubGlobal(`CSS`, { highlights })
    vi.stubGlobal(
      `Highlight`,
      class MockHighlight {
        ranges: Range[]
        constructor(...ranges: Range[]) {
          this.ranges = ranges
        }
      },
    )
    mount(MultiSelect, {
      target: document.body,
      props: { open: true, options: [`Alpha`, `Beta`], ...extra_props },
    })

    if (`selectedDisplay` in extra_props) {
      doc_query(`ul.options > li`).click()
      await tick()
      expect(get_input().value).toBe(`Alpha`)
    } else await type_search_text(`Al`)

    if (expect_highlight) expect(highlights.set).toHaveBeenCalled()
    else {
      expect(highlights.set).not.toHaveBeenCalled()
      expect(highlights.delete).not.toHaveBeenCalled()
    }
  } finally {
    vi.unstubAllGlobals()
  }
})

test.each([undefined, `Custom no options message`])(
  `shows noMatchingOptionsMsg when no options match searchText`,
  async (noMatchingOptionsMsg) => {
    const change_events: unknown[] = []

    mount(Test2WayBind, {
      target: document.body,
      props: {
        options: [1, 2, 3],
        noMatchingOptionsMsg,
        onchange: (data: Parameters<NonNullable<MultiSelectProps[`onchange`]>>[0]) => {
          change_events.push(data)
          const { option: _option, type: _type } = data
        },
      },
    })

    const input = get_input()

    await type_search_text(`4`, input)

    const expected_msg = noMatchingOptionsMsg ?? `No matching options`

    const dropdown = doc_query(`ul.options`)
    expect(dropdown.textContent?.trim()).toBe(expected_msg)

    const no_match_li = doc_query(`ul.options li.user-msg`)
    expect(no_match_li).toBeInstanceOf(HTMLLIElement)
    expect(no_match_li.textContent?.trim()).toBe(expected_msg)

    no_match_li.click() // the message row is not an option, so it must not select
    expect(change_events).toEqual([])
  },
)

// https://github.com/janosh/svelte-widgets/issues/183
test(`arrow keys traverse matching options and the create-option row in both directions`, async () => {
  const create_msg = `Create this option...` // component default
  mount(MultiSelect, {
    target: document.body,
    props: { options: [`foo`, `bar`, `baz`], allowUserOptions: true, open: true },
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
  [[`foo`, `bar`, `baz`]],
  [[1, 2, 3]],
  [[`foo`, 2, `baz`]],
  [[{ label: `foo` }, { label: `bar` }, { label: `baz` }]],
  [[{ label: `foo`, value: 1, key: `whatever` }]],
])(`single remove button removes 1 selected option`, async (options_set) => {
  mount(MultiSelect, {
    target: document.body,
    props: { options: options_set, selected: [...options_set] }, // Start with all selected
  })

  const option_to_remove = options_set[0]
  const initial_selected_count = options_set.length

  const button_selector = `ul.selected button[title='Remove ${get_label(
    option_to_remove,
  )}']`
  doc_query<HTMLButtonElement>(button_selector).click()
  await tick()

  const selected_ul = doc_query(`ul.selected`)
  const remaining_labels = options_set.slice(1).map(get_label).join(` `).trim()
  expect(selected_ul.textContent?.trim()).toBe(remaining_labels)
  expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(
    initial_selected_count - 1,
  )
})

test(`remove all button removes all selected options and is visible only if more than 1 option is selected`, async () => {
  const remove_all_btn_selector = `button[title='Remove all']`

  // Scenario 1: Multiple items selected, button is visible, click removes all
  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], selected: [1, 2, 3] },
  })
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`1 2 3`)

  doc_query<HTMLButtonElement>(remove_all_btn_selector).click()
  await tick()
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(``)
  document.body.innerHTML = `` // Clean up for next mount

  // Scenario 2: Select 2 items, button becomes visible only after 2nd selection
  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], selected: [] },
  })

  const option_lis = document.querySelectorAll<HTMLLIElement>(`ul.options > li`)
  option_lis[0].click() // Select 1
  expect(
    document.querySelector(remove_all_btn_selector),
    `Remove all button should NOT be visible after 1 selection`,
  ).toBeNull()

  option_lis[1].click() // Select 2
  await tick()
  expect(doc_query(remove_all_btn_selector)).toBeInstanceOf(HTMLButtonElement)
})

test(`removeAllTitle and removeBtnTitle are applied correctly`, () => {
  const removeAllTitle = `Custom remove all title`
  const removeBtnTitle = `Custom remove button title`
  const options = [1, 2, 3]

  mount(MultiSelect, {
    target: document.body,
    props: { removeAllTitle, removeBtnTitle, options, selected: options },
  })
  const remove_all_btn = doc_query<HTMLButtonElement>(`button.remove-all`)
  const remove_btns = document.querySelectorAll<HTMLButtonElement>(
    `ul.selected > li > button`,
  )

  expect(remove_all_btn.title).toBe(removeAllTitle)
  expect([...remove_btns].map((btn) => btn.title)).toEqual(
    options.map((op) => `${removeBtnTitle} ${op}`),
  )
})

test(`can't select disabled options`, async () => {
  const options = [1, 2, 3].map((el) => ({
    label: el,
    disabled: el === 1, // Option 1 is disabled
  }))
  mount(MultiSelect, { target: document.body, props: { options } })

  for (const option_object of options) {
    const li_to_click = [
      ...document.querySelectorAll<HTMLLIElement>(`ul.options > li`),
    ].find((li) => li.textContent?.trim() === String(option_object.label))
    li_to_click?.click()
    await tick()
  }

  const selected_ul = doc_query(`ul.selected`)

  expect(selected_ul.textContent?.trim()).toBe(`2 3`)
})

test.each([
  [`ArrowDown`, `First enabled`],
  [`ArrowUp`, `Last enabled`],
  [`a`, `First enabled`],
] as const)(
  `%s from no active option skips disabled options`,
  async (key_name, label) => {
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [
          { label: `First disabled`, disabled: true },
          { label: `First enabled` },
          { label: `Last enabled` },
          { label: `Last disabled`, disabled: true },
        ],
        open: true,
        key: () => `duplicate`,
      },
    })
    const input = get_input()

    input.dispatchEvent(fresh_key(key_name))
    await tick()
    expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(label)
  },
)

test(`autoScroll scopes active option lookup to current instance`, async () => {
  const [first_target, second_target] = [
    document.createElement(`div`),
    document.createElement(`div`),
  ]
  document.body.append(first_target, second_target)
  mount(MultiSelect, {
    target: first_target,
    props: { options: [`first`], open: true, activeIndex: 0 },
  })
  mount(MultiSelect, {
    target: second_target,
    props: { options: [`second`], open: true },
  })
  const [first_active, second_option] = [
    first_target.querySelector<HTMLElement>(`ul.options > li`),
    second_target.querySelector<HTMLElement>(`ul.options > li`),
  ]
  if (!first_active || !second_option) throw new Error(`Expected both option lists`)
  first_active.scrollIntoView = vi.fn()
  second_option.scrollIntoView = vi.fn()

  second_target
    .querySelector<HTMLInputElement>(`input[autocomplete]`)
    ?.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()
  await tick()

  expect(first_active.scrollIntoView).not.toHaveBeenCalled()
  expect(second_option.scrollIntoView).toHaveBeenCalledOnce()
})

async function setup_user_message(search_text = `Purple`) {
  const props = $state({
    options: [`Red`],
    activeIndex: null as number | null,
    allowUserOptions: true,
    autoActiveFirstOption: true,
    open: true,
  })
  mount(MultiSelect, {
    target: document.body,
    props,
  })
  const input = get_input()
  await type_search_text(search_text, input)

  return { input, props, user_msg: doc_query(`ul.options li.user-msg`) }
}

test(`user message exposes active descendant and toggles active class`, async () => {
  const { input, props, user_msg } = await setup_user_message()

  for (const [event_name, expected_active] of [
    [`mouseover`, true],
    [`mouseout`, false],
    [`focus`, true],
    [`blur`, false],
  ] as const) {
    user_msg.dispatchEvent(new Event(event_name, { bubbles: true }))
    await tick()
    expect(user_msg.classList.contains(`active`)).toBe(expected_active)
  }

  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()

  expect(input.getAttribute(`aria-activedescendant`)).toBe(user_msg.id)
  expect(user_msg.classList.contains(`active`)).toBe(true)

  props.options = [`Purple Rain`, `Purple Haze`, `Red`]
  await tick()
  expect(props.activeIndex).toBe(2)
  expect(user_msg.classList.contains(`active`)).toBe(true)

  await type_search_text(`red`, input)
  expect(doc_query(`li[role=option].active`).textContent).toContain(`Red`)
  expect(doc_query(`li.user-msg`).classList.contains(`active`)).toBe(false)
})

test(`option row Enter key selects option`, async () => {
  const props = $state<MultiSelectProps>({ options: [`Red`, `Blue`], selected: [] })
  mount(MultiSelect, { target: document.body, props })

  doc_query(`ul.options li`).dispatchEvent(fresh_key(`Enter`))
  await tick()

  expect(props.selected).toEqual([`Red`])
})

test.each([2, 10])(
  `can't select more than maxSelect options`,
  async (maxSelect: number) => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: [...Array.from({ length: 10 }).keys()], maxSelect },
    })

    // click the first rendered option 10 times: selects 0..maxSelect-1, then no-ops
    for (const _ of Array.from({ length: 10 })) {
      document.querySelector<HTMLLIElement>(`ul.options > li`)?.click()
      await tick()
    }

    expect(doc_query(`ul.selected`).textContent?.trim()).toEqual(
      [...Array.from({ length: maxSelect }).keys()].join(` `),
    )
  },
)

// https://github.com/janosh/svelte-widgets/issues/353
test.each([
  {
    name: `stays closed when can_remove is true`,
    props: { options: [1, 2, 3], selected: [1, 2] },
    expect_open: false,
  },
  {
    name: `opens when minSelect prevents removal`,
    props: {
      options: [`Red`, `Green`, `Yellow`],
      selected: [`Red`],
      minSelect: 1,
      maxSelect: 1,
    },
    expect_open: true,
  },
])(`clicking selected item $name`, async ({ props, expect_open }) => {
  mount(MultiSelect, { target: document.body, props })

  expect(doc_query(`div.multiselect`).classList.contains(`open`)).toBe(false)

  doc_query(`ul.selected > li`).dispatchEvent(
    new MouseEvent(`mouseup`, { bubbles: true }),
  )
  await tick()

  expect(doc_query(`div.multiselect`).classList.contains(`open`)).toBe(expect_open)
})

test(`closes dropdown on tab out and blur to external element`, async () => {
  const onclose = vi.fn()
  mount(MultiSelect, { target: document.body, props: { options: [1, 2, 3], onclose } })
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

describe.each([
  [[`1`, `2`, `3`], [`1`]], // test string options
  [[1, 2, 3], [1]], // test number options
])(
  `shows correct message when searchText is already selected for options=%j`,
  (options, selected) => {
    const duplicateOptionMsg = `This is already selected`
    const createOptionMsg = `Create this option...`

    test.each([
      [false, duplicateOptionMsg], // duplicates=false shows duplicate warning
      [true, `${selected[0]} ${createOptionMsg}`], // duplicates=true shows option + create msg
    ])(`allowUserOptions=true, duplicates=%s`, async (duplicates, expected_text) => {
      mount(MultiSelect, {
        target: document.body,
        props: {
          options,
          allowUserOptions: true,
          duplicates,
          duplicateOptionMsg,
          createOptionMsg,
          selected,
        },
      })

      const input = get_input()

      // Type the selected value to trigger duplicate/create check
      await type_search_text(`${selected[0]}`, input)

      const dropdown = doc_query(`ul.options`)
      expect(normalized_text(dropdown)).toBe(expected_text)
    })
  },
)

test.each([
  [true, ``, `click`],
  [false, `1`, `click`],
  [true, ``, `enter`],
  [false, `1`, `enter`],
] as const)(
  `resetFilterOnAdd=%j clears input (expected=%j) on %s`,
  async (resetFilterOnAdd, expected, method) => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2, 3], resetFilterOnAdd, closeDropdownOnSelect: false },
    })

    const input = get_input()
    await type_search_text(`1`, input)

    if (method === `click`) {
      doc_query<HTMLLIElement>(`ul.options li`).click()
    } else {
      input.dispatchEvent(fresh_key(`ArrowDown`))
      await tick()
      input.dispatchEvent(fresh_key(`Enter`))
    }
    await tick()

    expect(input.value).toBe(expected)
  },
)

test.each<{
  case_name: string
  props: Partial<MultiSelectProps>
  search_text: string
  expected_selected_count: number
}>([
  {
    case_name: `maxSelect constraint prevents add`,
    props: { selected: [1, 2], maxSelect: 2 },
    search_text: `3`,
    expected_selected_count: 2,
  },
  {
    case_name: `minSelect constraint prevents remove`,
    props: { selected: [1], minSelect: 1, keepSelectedInDropdown: `plain` },
    search_text: `1`,
    expected_selected_count: 1,
  },
])(
  `resetFilterOnAdd=true preserves searchText when $case_name`,
  async ({ props, search_text, expected_selected_count }) => {
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [1, 2, 3],
        resetFilterOnAdd: true,
        closeDropdownOnSelect: false,
        ...props,
      },
    })

    const input = get_input()
    await type_search_text(search_text, input)

    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    input.dispatchEvent(fresh_key(`Enter`))
    await tick()

    expect(input.value).toBe(search_text)
    expect(document.querySelectorAll(`ul.selected li`)).toHaveLength(
      expected_selected_count,
    )
  },
)

test(`Enter key deselection preserves searchText (matching mouse behavior)`, async () => {
  // fixes #362, where only the mouse path preserved the filter
  mount(MultiSelect, {
    target: document.body,
    props: {
      options: [1, 2, 3],
      selected: [1, 2],
      resetFilterOnAdd: false,
      closeDropdownOnSelect: false,
      keepSelectedInDropdown: `plain`, // Allow clicking on selected options to toggle them
    },
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

test(`2-way binding of selected`, async () => {
  let selected: Option[] = []
  const props = $state<Test2WayBindProps>({
    options: [1, 2, 3],
    onSelectedChanged: (data: Option[] | undefined) => (selected = data ?? []),
  })

  mount(Test2WayBind, { target: document.body, props })

  // test internal changes to selected bind outward
  for (const _ of Array.from({ length: 2 })) {
    const li = doc_query(`ul.options li`)
    li.click()
    await tick()
  }

  expect(selected).toEqual([1, 2])

  // test external changes to selected bind inward
  props.selected = [3]
  await tick()

  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`3`)
})

test.each([
  [null, [1, 2]],
  [1, 2],
  [2, [1, 2]],
])(
  `1-way (outward) binding of value works when maxSelect=%s, expected value=%s`,
  async (maxSelect, expected) => {
    let value: Option | Option[] | undefined

    mount(Test2WayBind, {
      target: document.body,
      props: {
        options: [1, 2, 3],
        maxSelect,
        onValueChanged: (data: Option | Option[] | null | undefined) =>
          (value = data ?? undefined),
      },
    })

    // test internal changes bind outward
    for (const _ of [1, 2]) {
      const li = doc_query(`ul.options li`)
      li.click()
      await tick()
    }

    expect(value).toEqual(expected)
  },
)

// disabled=true and the base error case are covered by the allowEmpty/disabled/allowUserOptions matrix below
test(`no console error about missing options if loading=true`, () => {
  console.error = vi.fn()

  mount(MultiSelect, {
    target: document.body,
    props: { options: [], loading: true },
  })

  expect(console.error).not.toHaveBeenCalled()
})

test.each([[null], [`custom add option message`]])(
  `arrow keys on empty multiselect toggle createOptionMsg as active with createOptionMsg=%s`,
  async (createOptionMsg) => {
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [],
        allowUserOptions: true,
        searchText: `foo`,
        createOptionMsg,
      },
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

test(`disabled multiselect disables input, removal controls, and shows disabled icon`, () => {
  const disabled_input_title = `Selection unavailable`
  mount(MultiSelect, {
    target: document.body,
    props: {
      options: [1, 2, 3],
      selected: [1, 2],
      disabled: true,
      disabledInputTitle: disabled_input_title,
    },
  })

  const wrapper = doc_query(`div.multiselect`)
  expect(wrapper.classList).toContain(`disabled`)
  expect(wrapper.getAttribute(`title`)).toBe(disabled_input_title)
  expect(get_input().disabled).toBe(true)
  expect(document.querySelector(`button.remove`)).toBeNull()

  const disabled_icon = doc_query(`svg[data-name='disabled-icon']`)
  expect(disabled_icon).toBeInstanceOf(SVGSVGElement)
  expect(disabled_icon.getAttribute(`aria-disabled`)).toBe(`true`)
})

test(`can remove user-created selected option which is not in dropdown list`, async () => {
  // i.e. allowUserOptions=true, not 'append', meaning user options are only selected but
  // aren't added to dropdown list yet remove() should still be able to delete them
  mount(MultiSelect, {
    target: document.body,
    props: { options: [`1`, `2`, `3`], allowUserOptions: true },
  })

  // add a new option created from user text input
  const input = get_input()
  await type_search_text(`foo`, input)

  const li = doc_query(`ul.options li[title='Create this option...']`)
  li.click()
  await tick()
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`foo`)

  // remove the new option
  const li_selected = doc_query(`ul.selected li button[title*='Remove']`)
  li_selected.click()
  await tick()

  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(``)
})

// https://github.com/janosh/svelte-widgets/issues/409
// whitespace-only input must never be added (was coerced via Number("  ") / key 0 duplicates)
test.each([
  {
    label: `string options`,
    props: { options: [`a`, `b`], allowUserOptions: true } satisfies MultiSelectProps,
  },
  {
    label: `numeric options`,
    props: { options: [1, 2, 3], allowUserOptions: true } satisfies MultiSelectProps,
  },
  {
    label: `empty options hides dropdown`,
    props: { options: [], allowUserOptions: true } satisfies MultiSelectProps,
    search: ` `,
    hide_dropdown: true,
  },
  {
    label: `loadOptions empty (double Enter)`,
    props: {
      loadOptions: {
        fetch: vi.fn().mockResolvedValue({ options: [], hasMore: false }),
        debounceMs: 0,
      },
      allowUserOptions: true,
    } satisfies MultiSelectProps,
    double_enter: true,
  },
])(
  `whitespace-only input rejected: $label`,
  async ({ props, search = `    `, double_enter = false, hide_dropdown = false }) => {
    const uses_timers = `loadOptions` in props
    if (uses_timers) vi.useFakeTimers()
    try {
      const onadd_spy = vi.fn()
      mount(MultiSelect, {
        target: document.body,
        props: { ...props, onadd: onadd_spy, open: true },
      })
      if (uses_timers) await vi.runAllTimersAsync()

      const input = get_input()
      input.focus()
      await type_search_text(search, input)
      if (uses_timers) await vi.runAllTimersAsync()

      if (hide_dropdown) {
        expect(document.querySelector(`ul.options`)).toBeNull()
      }

      input.dispatchEvent(fresh_key(`Enter`))
      if (uses_timers) await vi.runAllTimersAsync()
      else await tick()
      if (double_enter) {
        input.dispatchEvent(fresh_key(`Enter`))
        await vi.runAllTimersAsync()
      }

      expect(onadd_spy).not.toHaveBeenCalled()
      expect(document.querySelectorAll(`ul.selected li`)).toHaveLength(0)
    } finally {
      if (uses_timers) vi.useRealTimers()
    }
  },
)

test.each([[[1]], [[1, 2]], [[1, 2, 3]]])(
  `does not render remove buttons if selected.length <= minSelect`,
  (selected) => {
    const minSelect = 2
    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2, 3, 4], minSelect, selected },
    })

    expect(document.querySelectorAll(`ul.selected button[title*='Remove']`)).toHaveLength(
      selected.length > minSelect ? selected.length : 0,
    )
  },
)

test(`backspace does not remove items when minSelect would be violated`, async () => {
  // https://github.com/janosh/svelte-widgets/issues/327
  const options = [`Red`, `Green`, `Yellow`]
  const selected = [`Red`]
  const [minSelect, maxSelect] = [1, 1]

  mount(MultiSelect, {
    target: document.body,
    props: { options, selected, minSelect, maxSelect },
  })

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
    mount(MultiSelect, {
      target: document.body,
      props: { options, selected, ...extra_props },
    })
    return get_input()
  }

  test(`repeated ArrowLeft moves highlight leftward and stops at 0`, async () => {
    const input = setup()
    for (let step = 0; step < 4; step++) input.dispatchEvent(press(`ArrowLeft`))
    await tick()
    expect(is_highlighted(0)).toBe(true)
    expect(is_highlighted(1)).toBe(false)
  })

  test(`ArrowRight moves highlight rightward, then clears`, async () => {
    const input = setup()
    input.dispatchEvent(press(`ArrowLeft`)) // idx 2
    input.dispatchEvent(press(`ArrowLeft`)) // idx 1
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

  test(`ArrowLeft does nothing when input has text`, async () => {
    const input = setup()
    input.value = `R`
    input.dispatchEvent(new Event(`input`, { bubbles: true }))
    await tick()
    input.dispatchEvent(press(`ArrowLeft`))
    await tick()
    expect(highlighted()).toHaveLength(0)
  })

  test.each([
    [`ArrowLeft`, []],
    [`ArrowRight`, [`Red`, `Green`, `Blue`]],
  ])(`%s is a no-op when highlight cannot start`, async (key, selected) => {
    const input = setup(selected)
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
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [first, second],
        selected: [first, second],
        duplicates: true,
        onremove: ({ option }: { option: unknown }) => (removed = option),
      },
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

  test.each([
    // externally shrinking past the highlighted idx should clamp to the last valid index;
    // clearing should drop the highlight entirely (expected_idx null)
    [`shrink clamps highlighted_idx`, [`Red`, `Green`], 1],
    [`clear nullifies highlighted_idx`, [], null],
  ])(`external selected %s`, async (_name, next_selected, expected_idx) => {
    const props = $state<MultiSelectProps>({
      options,
      selected: [`Red`, `Green`, `Blue`],
    })
    mount(MultiSelect, { target: document.body, props })
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

test(`remove all button does not remove items when minSelect constraint would be violated`, async () => {
  const options = [`Red`, `Green`, `Yellow`]
  const selected = [`Red`]
  const minSelect = 1
  const maxSelect = 2

  mount(MultiSelect, {
    target: document.body,
    props: { options, selected, minSelect, maxSelect },
  })

  const remove_all_button = document.querySelector(`button.remove-all`)
  expect(remove_all_button).toBeNull()

  const input = get_input()
  input.focus()

  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()

  // Red is already selected so it is filtered out of the dropdown: this Enter adds
  // Green, pushing selected past minSelect and bringing the remove-all button back
  const enter_event = fresh_key(`Enter`)
  input.dispatchEvent(enter_event)
  await tick()

  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`Red Green`)

  // doc_query throws if the button is still hidden, so this is the visibility assertion
  doc_query(`button.remove-all`).click()
  await tick()

  // The first item should still be selected since minSelect=1
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`Red`)
})

test(`remove all button is hidden when selected.length equals minSelect`, async () => {
  // above, selected.length <= 1 hides the button anyway; here minSelect is the reason
  mount(MultiSelect, {
    target: document.body,
    props: { options: [`Red`, `Green`], selected: [`Red`, `Green`], minSelect: 2 },
  })
  expect(document.querySelector(`button.remove-all`)).toBeNull()
})

class DataTransfer {
  data: Record<string, string> = {}
  setData(type: string, val: string) {
    this.data[type] = val
  }
  getData(type: string) {
    return this.data[type]
  }
}

class DragEvent extends MouseEvent {
  constructor(type: string, props: Record<string, unknown>) {
    super(type, props)
    Object.assign(this, props)
  }
}

// simulate a real chip drag: dragstart on the source li, then drop on the target
async function drag_chip(source_idx: number, target_idx: number) {
  const data_transfer = new DataTransfer()
  doc_query(`ul.selected li:nth-child(${source_idx + 1})`).dispatchEvent(
    new DragEvent(`dragstart`, { dataTransfer: data_transfer }),
  )
  doc_query(`ul.selected li:nth-child(${target_idx + 1})`).dispatchEvent(
    new DragEvent(`drop`, { dataTransfer: data_transfer }),
  )
  await tick()
}

// https://github.com/janosh/svelte-widgets/issues/176 (reorder)
// https://github.com/janosh/svelte-widgets/issues/371 (onreorder/onchange events)
test(`dragging selected options across each other reorders them and fires onreorder + onchange`, async () => {
  const options = [1, 2, 3]
  const [onreorder_spy, onchange_spy] = [vi.fn(), vi.fn()]
  mount(MultiSelect, {
    target: document.body,
    props: {
      options,
      selected: options,
      onreorder: onreorder_spy,
      onchange: onchange_spy,
    },
  })
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`1 2 3`)

  await drag_chip(1, 0)
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`2 1 3`)
  expect(onreorder_spy).toHaveBeenCalledTimes(1)
  expect(onreorder_spy).toHaveBeenCalledWith({ options: [2, 1, 3], previous: [1, 2, 3] })
  expect(onchange_spy).toHaveBeenCalledTimes(1)
  expect(onchange_spy).toHaveBeenCalledWith({ options: [2, 1, 3], type: `reorder` })

  await drag_chip(0, 1)
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`1 2 3`)
  expect(onreorder_spy).toHaveBeenLastCalledWith({
    options: [1, 2, 3],
    previous: [2, 1, 3],
  })
})

test(`canceled drag clears the active drop-target highlight`, async () => {
  const options = [1, 2, 3]
  mount(MultiSelect, { target: document.body, props: { options, selected: options } })

  const li = doc_query(`ul.selected li`)
  li.dispatchEvent(new DragEvent(`dragenter`, {}))
  await tick()
  expect(li.classList.contains(`active`)).toBe(true)

  // user cancels the drag (Escape / drop outside list) -> dragend fires without drop
  li.dispatchEvent(new DragEvent(`dragend`, {}))
  await tick()
  expect(li.classList.contains(`active`)).toBe(false)
})

test.each([[true], [false]])(
  `console warning when combining sortSelected=%s and selectedOptionsDraggable`,
  async (sortSelected) => {
    console.warn = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [1, 2, 3],
        sortSelected,
        selectedOptionsDraggable: true,
      },
    })
    await tick() // wait for $effect to run

    if (sortSelected) {
      expect(console.warn).toHaveBeenCalledTimes(1)
      expect(console.warn).toHaveBeenCalledWith(
        `MultiSelect: sortSelected and selectedOptionsDraggable should not be combined as any ` +
          `user re-orderings of selected options will be undone by sortSelected on component re-renders.`,
      )
    } else {
      expect(console.warn).not.toHaveBeenCalled()
    }
  },
)

test.each<[boolean, string | null]>([
  [true, `create option`],
  [true, ``],
  [true, null], // explicit null opts out of the warning
  [false, ``],
])(
  `console.error when allowUserOptions=%s but createOptionMsg=%s is falsy`,
  async (allowUserOptions, createOptionMsg) => {
    console.error = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2, 3], createOptionMsg, allowUserOptions },
    })
    await tick() // wait for $effect to run

    if (allowUserOptions && !createOptionMsg && createOptionMsg !== null) {
      expect(console.error).toHaveBeenCalledTimes(1)
      expect(console.error).toHaveBeenCalledWith(
        `MultiSelect: allowUserOptions=${allowUserOptions} but createOptionMsg=${createOptionMsg} is falsy. ` +
          `This prevents the "Add option" <span> from showing up, resulting in a confusing user experience.`,
      )
    } else {
      expect(console.error).not.toHaveBeenCalled()
    }
  },
)

describe.each([[true], [false]])(`allowUserOptions=%s`, (allowUserOptions) => {
  describe.each([[true], [false]])(`disabled=%s`, (disabled) => {
    test.each([[true], [false]])(
      `console.error when allowEmpty=false and multiselect has no options`,
      (allowEmpty) => {
        console.error = vi.fn()

        mount(MultiSelect, {
          target: document.body,
          props: { options: [], allowEmpty, disabled, allowUserOptions },
        })

        if (!allowEmpty && !disabled && !allowUserOptions) {
          expect(console.error).toHaveBeenCalledTimes(1)
          expect(console.error).toHaveBeenCalledWith(`MultiSelect: received no options`)
        } else {
          expect(console.error).not.toHaveBeenCalled()
        }
      },
    )
  })
})

test.each([[[1]], [[1, 2, 3]]])(
  `buttons to remove selected options have CSS class "remove"`,
  (selected) => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: selected, selected },
    })

    expect(document.querySelectorAll(`ul.selected button.remove`)).toHaveLength(
      selected.length,
    )

    expect(document.querySelectorAll(`button.remove.remove-all`)).toHaveLength(
      selected.length > 1 ? 1 : 0,
    )

    // without removeIcon snippet, all remove buttons get default-icon class
    expect(document.querySelectorAll(`button.remove.default-icon`)).toHaveLength(
      selected.length + (selected.length > 1 ? 1 : 0),
    )
  },
)

test(`remove buttons lack default-icon class when removeIcon snippet is provided`, async () => {
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: { options: [1, 2, 3], selected: [1, 2] },
  })
  await tick()
  expect(document.querySelectorAll(`button.remove.default-icon`)).toHaveLength(0)
})

test(`errors to console when option is an object but has no label key`, () => {
  console.error = vi.fn()

  // ObjectOption requires a label, so the shape under test is only reachable past the
  // type system — which is the point: the guard exists for untyped runtime data
  mount(MultiSelect, {
    target: document.body,
    props: { options: [{ foo: 42 }] as never },
  })

  expect(console.error).toHaveBeenCalledWith(
    `MultiSelect: option is an object but has no label key`,
    `{"foo":42}`,
  )
})

// options: [1,2,3], selected: [1,2] → clicking ul.options li adds 3,
// clicking ul.selected button.remove removes 1, clicking button.remove-all removes all
test.each([
  [`add`, `ul.options li`, { option: 3 }],
  [`change`, `ul.options li`, { option: 3, type: `add` }],
  [`remove`, `ul.selected button.remove`, { option: 1 }],
  [`change`, `ul.selected button.remove`, { option: 1, type: `remove` }],
  [`removeAll`, `button.remove-all`, { options: [1, 2] }], // removed options
  [`change`, `button.remove-all`, { options: [], type: `removeAll` }], // remaining selected
])(
  `fires %s event with expected payload when clicking %s`,
  (event_name, selector, expected) => {
    const spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [1, 2, 3],
        selected: [1, 2],
        [`on${event_name}`]: spy,
      },
    })

    doc_query(selector).click()

    expect(spy, `event type '${event_name}'`).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toEqual(expect.objectContaining(expected))
  },
)

async function create_user_option(search_text: string): Promise<void> {
  const input = get_input()
  await type_search_text(search_text, input)
  doc_query(`ul.options li.user-msg`).click()
  await tick()
}

test.each([
  [[`foo`, `bar`, `baz`], `new-string-option`, `new-string-option`],
  [[1, 2, 3], `42`, 42],
  [
    [{ label: `foo` }, { label: `bar` }, { label: `baz` }],
    `new-object-option`,
    { label: `new-object-option` },
  ],
])(
  `fires oncreate event with correct payload when user creates new option for different option types`,
  async (options, search_text, expected_created_option) => {
    const oncreate_spy = vi.fn()
    const onadd_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: {
        options,
        allowUserOptions: true,
        oncreate: oncreate_spy,
        onadd: onadd_spy,
      },
    })

    await create_user_option(search_text)

    expect(oncreate_spy).toHaveBeenCalledTimes(1)
    expect(oncreate_spy).toHaveBeenCalledWith({ option: expected_created_option })

    // a user-created option fires onadd as well, not just oncreate
    expect(onadd_spy).toHaveBeenCalledTimes(1)
    expect(onadd_spy).toHaveBeenCalledWith({
      option: expected_created_option,
      selected: [expected_created_option],
    })
  },
)

test.each<[string, boolean | `append`]>([
  [`allowUserOptions=true`, true],
  [`allowUserOptions=append`, `append`],
])(`oncreate returning false rejects option (%s)`, async (_label, mode) => {
  const onadd_spy = vi.fn()
  const initial_options = [`a`, `b`]
  const props = $state<MultiSelectProps>({
    options: [...initial_options],
    selected: [],
    allowUserOptions: mode,
    oncreate: () => false,
    onadd: onadd_spy,
  })
  mount(MultiSelect, { target: document.body, props })

  await create_user_option(`rejected`)

  expect(onadd_spy).not.toHaveBeenCalled()
  expect(props.selected).toEqual([])
  if (mode === `append`) expect(props.options).toEqual(initial_options)
})

test(`allowUserOptions=append keeps created options selectable after removal`, async () => {
  const props = $state<MultiSelectProps>({
    options: [`a`, `b`],
    selected: [],
    allowUserOptions: `append`,
  })
  mount(MultiSelect, { target: document.body, props })

  await create_user_option(`foobar`)

  expect(props.options).toEqual([`a`, `b`, `foobar`])
  expect(props.selected).toEqual([`foobar`])

  doc_query<HTMLButtonElement>(`ul.selected button.remove`).click()
  await tick()
  expect(props.selected).toEqual([])

  const input = get_input()
  await type_search_text(`foobar`, input)

  const appended_option = doc_query(`ul.options > li:not(.user-msg)`)
  expect(appended_option.textContent?.trim()).toBe(`foobar`)
  appended_option.click()
  await tick()
  expect(props.selected).toEqual([`foobar`])
})

// string transforms and false/undefined returns are covered by the
// `sync oncreate regression` table in the async-oncreate describe
test(`oncreate returning an object transforms the option`, async () => {
  const props = $state<MultiSelectProps>({
    options: [{ label: `existing`, value: 1 }],
    selected: [],
    allowUserOptions: `append`,
    oncreate: ({ option }: { option: Option }) => ({
      ...(typeof option === `object` && option),
      label: typeof option === `object` ? option.label : option,
      validated: true,
    }),
  })
  mount(MultiSelect, { target: document.body, props })

  await create_user_option(`new-item`)

  expect(props.selected).toEqual([
    expect.objectContaining({ label: `new-item`, validated: true }),
  ])
})

test(`onadd selected accumulates and onremove selected reflects removal`, async () => {
  const [onadd_spy, onremove_spy] = [vi.fn(), vi.fn()]

  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], onadd: onadd_spy, onremove: onremove_spy },
  })

  const input = await focus_input()
  doc_query(`ul.options li`).click()
  await tick()
  expect(onadd_spy).toHaveBeenLastCalledWith({ option: 1, selected: [1] })

  input.focus()
  await tick()
  doc_query(`ul.options li`).click()
  await tick()
  expect(onadd_spy).toHaveBeenLastCalledWith({ option: 2, selected: [1, 2] })

  doc_query(`ul.selected button.remove`).click()
  expect(onremove_spy).toHaveBeenCalledTimes(1)
  expect(onremove_spy).toHaveBeenLastCalledWith({ option: 1, selected: [2] })
})

test(`onadd selected reflects replacement when maxSelect=1`, async () => {
  const onadd_spy = vi.fn()
  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], maxSelect: 1, selected: [1], onadd: onadd_spy },
  })

  await focus_input()
  doc_query(`ul.options li`).click()
  await tick()

  expect(onadd_spy).toHaveBeenCalledWith({ option: 2, selected: [2] })
})

test(`onopen fires once with FocusEvent, not again when already open`, async () => {
  const open_spy = vi.fn()
  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], onopen: open_spy },
  })

  const input = await focus_input()
  expect(open_spy).toHaveBeenCalledOnce()
  expect(open_spy.mock.calls[0][0].event).toBeInstanceOf(FocusEvent)

  // clicking the input again while already open should NOT fire onopen again
  input.dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
  await tick()
  expect(open_spy).toHaveBeenCalledOnce()
})

test(`onclose fires once with KeyboardEvent, not again when already closed`, async () => {
  const close_spy = vi.fn()
  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], onclose: close_spy },
  })

  // dropdown starts closed — clicking outside should NOT fire onclose
  document.body.click()
  await tick()
  expect(close_spy).not.toHaveBeenCalled()

  // open then close — should fire exactly once with KeyboardEvent
  const input = await focus_input()
  input.dispatchEvent(fresh_key(`Escape`))
  await tick()
  expect(close_spy).toHaveBeenCalledOnce()
  expect(close_spy.mock.calls[0][0].event).toBeInstanceOf(KeyboardEvent)

  // clicking outside again while already closed — still no extra fire
  document.body.click()
  await tick()
  expect(close_spy).toHaveBeenCalledOnce()
})

describe(`keepSelectedInDropdown feature`, () => {
  const options = [`Apple`, `Banana`, `Cherry`]
  const options_with_date = [`Apple`, `Banana`, `Cherry`, `Date`]
  const keep_selected_modes = [`plain`, `checkboxes`] as const
  type KeepSelectedMode = (typeof keep_selected_modes)[number]
  const option_items = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>(`ul.options > li`))
  const option_by_label = (label: string): HTMLElement | undefined =>
    option_items().find((option_item) => option_item.textContent?.includes(label))

  async function open_options(): Promise<void> {
    get_input().click()
    await tick()
  }

  function click_keep_selected_option(
    option: HTMLElement | undefined,
    mode: KeepSelectedMode,
  ): void {
    if (mode === `checkboxes`)
      option?.querySelector<HTMLElement>(`.option-checkbox`)?.click()
    else option?.click()
  }

  test.each(keep_selected_modes)(
    `keeps selected options visible in dropdown when mode is %s`,
    async (mode) => {
      const selected = [`Apple`]
      mount(MultiSelect, {
        target: document.body,
        props: { options, selected, keepSelectedInDropdown: mode },
      })

      await open_options()

      const dropdown_options = option_items()
      expect(dropdown_options).toHaveLength(3)

      const apple_option = option_by_label(`Apple`)
      expect(apple_option?.classList.contains(`selected`)).toBe(true)

      if (mode === `checkboxes`) {
        const checkbox = apple_option?.querySelector<HTMLInputElement>(`.option-checkbox`)
        expect(checkbox?.checked).toBe(true)
      }

      const other_options = dropdown_options.filter(
        (option_item) => !option_item.textContent?.includes(`Apple`),
      )
      other_options.forEach((option) => {
        expect(option.classList.contains(`selected`)).toBe(false)
        if (mode === `checkboxes`) {
          const checkbox = option.querySelector<HTMLInputElement>(`.option-checkbox`)
          expect(checkbox?.checked).toBe(false)
        }
      })
    },
  )

  test(`hides selected options from dropdown when disabled (default behavior)`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: { options, selected: [`Apple`], keepSelectedInDropdown: false },
    })

    await open_options()

    const dropdown_options = document.querySelectorAll(`ul.options > li`)
    expect(dropdown_options).toHaveLength(2)
    expect(
      Array.from(dropdown_options).some((li) => li.textContent?.includes(`Apple`)),
    ).toBe(false)
  })

  test.each(keep_selected_modes)(
    `toggles option selection when clicked in %s mode`,
    async (mode) => {
      const onChange_spy = vi.fn()
      mount(MultiSelect, {
        target: document.body,
        props: {
          options,
          selected: [`Apple`],
          keepSelectedInDropdown: mode,
          onchange: onChange_spy,
        },
      })

      await open_options()

      // Toggle Apple off (selected → unselected)
      const apple_option = option_by_label(`Apple`)
      click_keep_selected_option(apple_option, mode)
      await tick()

      expect(onChange_spy).toHaveBeenCalledWith({ option: `Apple`, type: `remove` })
      expect(apple_option?.classList.contains(`selected`)).toBe(false)

      // Toggle Banana on (unselected → selected)
      const banana_option = option_by_label(`Banana`)
      click_keep_selected_option(banana_option, mode)
      await tick()

      expect(onChange_spy).toHaveBeenCalledWith({ option: `Banana`, type: `add` })
      expect(banana_option?.classList.contains(`selected`)).toBe(true)
    },
  )

  test.each(keep_selected_modes)(
    `keeps all options visible and styled selected when everything is selected in %s mode`,
    async (mode) => {
      // the partially-selected case, where unselected rows must stay unstyled, is
      // covered where only Apple is selected
      mount(MultiSelect, {
        target: document.body,
        props: { options, selected: options, keepSelectedInDropdown: mode },
      })

      await open_options()

      const all_selected_options = option_items()
      expect(all_selected_options).toHaveLength(3)

      for (const option of all_selected_options) {
        expect(option.classList.contains(`selected`)).toBe(true)
        if (mode === `checkboxes`) {
          const checkbox = option.querySelector<HTMLInputElement>(`.option-checkbox`)
          expect(checkbox?.checked).toBe(true)
        }
      }
    },
  )

  test.each(keep_selected_modes)(
    `respects minSelect constraint when toggling in %s mode`,
    async (mode) => {
      mount(MultiSelect, {
        target: document.body,
        props: {
          options,
          selected: [`Apple`, `Banana`],
          keepSelectedInDropdown: mode,
          minSelect: 1,
        },
      })

      await open_options()

      // Remove Apple (should work as we'll still have Banana)
      const apple_option = option_by_label(`Apple`)
      click_keep_selected_option(apple_option, mode)
      await tick()

      expect(apple_option?.classList.contains(`selected`)).toBe(false)

      // Try to remove Banana as well – should be blocked by minSelect=1
      const banana_option = option_by_label(`Banana`)
      click_keep_selected_option(banana_option, mode)
      await tick()
      expect(banana_option?.classList.contains(`selected`)).toBe(true)
    },
  )

  test.each(keep_selected_modes)(
    `keyboard navigation works correctly in %s mode`,
    async (mode) => {
      const onChange_spy = vi.fn()
      mount(MultiSelect, {
        target: document.body,
        props: {
          options,
          selected: [`Apple`],
          keepSelectedInDropdown: mode,
          onchange: onChange_spy,
        },
      })

      await open_options()

      const input = get_input()
      input.dispatchEvent(fresh_key(`ArrowDown`))
      await tick()
      input.dispatchEvent(fresh_key(`Enter`))

      expect(onChange_spy).toHaveBeenCalledWith({ option: `Apple`, type: `remove` })

      input.dispatchEvent(fresh_key(`ArrowDown`))
      await tick()
      input.dispatchEvent(fresh_key(`Enter`))

      expect(onChange_spy).toHaveBeenCalledWith({ option: `Banana`, type: `add` })
    },
  )

  test.each(keep_selected_modes)(
    `search filtering works correctly in %s mode`,
    async (mode) => {
      const selected = [`Apple`, `Cherry`]
      mount(MultiSelect, {
        target: document.body,
        props: { options: options_with_date, selected, keepSelectedInDropdown: mode },
      })

      const input = get_input()
      input.click()

      await type_search_text(`a`, input)

      const filtered_options = option_items()
      // In keepSelectedInDropdown mode, selected options are always shown
      expect(filtered_options.length).toBeGreaterThanOrEqual(2)

      const matching_options = filtered_options.filter(
        (option_item) =>
          option_item.textContent?.includes(`Banana`) ||
          option_item.textContent?.includes(`Date`),
      )
      expect(matching_options).toHaveLength(2)
    },
  )
})

// all 2x2x2 combos of allowUserOptions x noMatchingOptionsMsg x createOptionMsg:
// .user-msg only renders when the applicable message prop is truthy
test.each(
  [true, false].flatMap((allowUserOptions) =>
    [``, `no matches`].flatMap((noMatchingOptionsMsg) =>
      [`make option`, ``].map(
        (createOptionMsg) =>
          [allowUserOptions, noMatchingOptionsMsg, createOptionMsg] as const,
      ),
    ),
  ),
)(
  `user-msg rendering with allowUserOptions=%s, noMatchingOptionsMsg=%s, createOptionMsg=%s`,
  async (allowUserOptions, noMatchingOptionsMsg, createOptionMsg) => {
    const expected_error = allowUserOptions && !createOptionMsg
    if (expected_error) console.error = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [`foo`],
        selected: [`foo`],
        noMatchingOptionsMsg,
        createOptionMsg,
        allowUserOptions,
      },
    })

    // create a state where no options match the search text
    await type_search_text(`bar`)
    if (expected_error) {
      expect(console.error).toHaveBeenCalledWith(
        `MultiSelect: allowUserOptions=${allowUserOptions} but createOptionMsg=${createOptionMsg} is falsy. ` +
          `This prevents the "Add option" <span> from showing up, resulting in a confusing user experience.`,
      )
    }

    if (allowUserOptions && createOptionMsg) {
      expect(doc_query(`.user-msg`).textContent?.trim()).toBe(createOptionMsg)
    } else if (noMatchingOptionsMsg) {
      expect(doc_query(`.user-msg`).textContent?.trim()).toBe(noMatchingOptionsMsg)
    } else {
      expect(document.querySelector(`.user-msg`)).toBeNull()
    }
  },
)

// Issue #364: empty message props should not render <li> element
test.each([
  [`duplicateOptionMsg`, ``],
  [`duplicateOptionMsg`, null],
  [`noMatchingOptionsMsg`, ``],
  [`noMatchingOptionsMsg`, null],
])(`no .user-msg node is rendered when %s=%j`, async (prop_name, prop_value) => {
  const is_dupe_test = prop_name === `duplicateOptionMsg`
  mount(MultiSelect, {
    target: document.body,
    props: {
      options: [`foo`, `bar`],
      selected: is_dupe_test ? [`foo`] : [],
      [prop_name]: prop_value,
    },
  })

  const input = get_input()
  await type_search_text(is_dupe_test ? `foo` : `nonexistent`, input)

  expect(document.querySelector(`.user-msg`)).toBeNull()
})

test(`empty duplicateOptionMsg leaves no phantom navigable row`, async () => {
  // a blank message renders nothing, so it must not stay navigable either
  mount(MultiSelect, {
    target: document.body,
    props: { options: [`ab`, `abc`], selected: [`ab`], duplicateOptionMsg: `` },
  })
  const input = get_input()
  await type_search_text(`ab`, input)
  input.dispatchEvent(fresh_key(`ArrowDown`))
  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()
  // 'abc' at index 0 is the only match, so the second ArrowDown has nowhere to go;
  // without the fix it lands on the blank row and points at an unrendered element
  const active_id = input.getAttribute(`aria-activedescendant`) ?? ``
  expect(active_id).toMatch(/-opt-0$/u)
  expect(document.querySelector(`#${CSS.escape(active_id)}`)).not.toBeNull()
})

test.each([[0], [1], [5], [undefined]])(
  `no more than maxOptions are rendered if a positive integer, all options are rendered undefined or 0`,
  (maxOptions) => {
    const options = [`foo`, `bar`, `baz`]

    mount(MultiSelect, {
      target: document.body,
      props: { options, maxOptions },
    })

    expect(document.querySelectorAll(`ul.options li`)).toHaveLength(
      maxOptions === null || maxOptions === undefined
        ? options.length
        : Math.min(options.length, maxOptions),
    )
  },
)

test.each([[true], [-1], [3.5], [`foo`], [{}]])(
  `console.error when maxOptions=%s is not a positive integer or undefined`,
  async (maxOptions) => {
    console.error = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- intentionally testing invalid maxOptions values
      props: { options: [1, 2, 3], maxOptions: maxOptions as number },
    })
    await tick() // wait for $effect to run

    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      // eslint-disable-next-line @typescript-eslint/no-base-to-string -- testing console.error message with invalid maxOptions values
      `MultiSelect: maxOptions must be undefined or a positive integer, got ${String(maxOptions)}`,
    )
  },
)

test.each<[OptionStyle, string | null, string]>([
  // Invalid key cases
  [`color: red;`, `invalid`, ``],
  // Valid key cases
  [`color: red;`, `selected`, `color: red;`],
  [`color: red;`, `option`, `color: red;`],
  [`color: red;`, null, `color: red;`],
  // Object style cases
  [{ selected: `color: red;`, option: `color: blue;` }, `selected`, `color: red;`],
  [{ selected: `color: red;`, option: `color: blue;` }, `option`, `color: blue;`],
  [{ selected: `color: red;` }, `selected`, `color: red;`],
  [{ selected: `color: red;` }, `option`, ``],
  [{ option: `color: blue;` }, `option`, `color: blue;`],
  [{ option: `color: blue;` }, `selected`, ``],
  [{}, `selected`, ``],
  // Invalid object style cases
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- intentionally testing invalid style object
  [{ invalid: `color: green;` } as unknown as OptionStyle, `selected`, ``],
])(
  `MultiSelect applies correct styles to <li> elements for different option and key combinations`,
  (style, key, expected_css) => {
    const options: Option[] = [{ label: `foo`, style }]
    const expect_invalid_style_error =
      typeof style === `object` && style !== null && `invalid` in style
    if (expect_invalid_style_error) console.error = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: { options, selected: key === `selected` ? options : [] },
    })
    if (expect_invalid_style_error) {
      expect(console.error).toHaveBeenCalledWith(
        `MultiSelect: invalid style object for option`,
        options[0],
      )
    }

    if (key === `selected`) {
      const selected_li = doc_query(`ul.selected > li`)
      expect(selected_li.style.cssText).toBe(expected_css)
    } else if (key === `option`) {
      const option_li = doc_query(`ul.options > li`)
      expect(option_li.style.cssText).toBe(expected_css)
    }
  },
)

test.each([
  [`style`, `div.multiselect`],
  [`ulSelectedStyle`, `ul.selected`],
  [`ulOptionsStyle`, `ul.options`],
  [`liSelectedStyle`, `ul.selected > li`],
  [`liOptionStyle`, `ul.options > li`],
  [`inputStyle`, `input[autocomplete]`],
])(`MultiSelect applies style props to the correct element`, (prop, css_selector) => {
  const css_str = `font-weight: bold; color: red;`
  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], [prop]: css_str, selected: [1] },
  })

  const err_msg = `${prop} (${css_selector})`
  const elem = doc_query(css_selector)
  expect(elem?.style.cssText, err_msg).toContain(css_str)
})

test.each([
  { prop: `liSelectedStyle`, css_selector: `ul.selected > li` },
  { prop: `liOptionStyle`, css_selector: `ul.options > li` },
])(
  `MultiSelect doesn't add style attribute to element '$css_selector' if '$prop' prop not passed`,
  ({ prop, css_selector }) => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2, 3], selected: [1] },
    })

    const elem = doc_query(css_selector)

    const err_msg = `style attribute should be absent when '${prop}' not passed, but hasAttribute('style') is ${elem.hasAttribute(
      `style`,
    )}`
    expect(elem.hasAttribute(`style`), err_msg).toBe(false)
  },
)

test.each([true, false, `if-mobile`, `retain-focus`] as const)(
  `closeDropdownOnSelect=%s controls input focus and dropdown closing`,
  async (closeDropdownOnSelect) => {
    const original_inner_width = globalThis.innerWidth
    try {
      globalThis.innerWidth = 600 // simulate mobile
      const select = mount(Test2WayBind, {
        target: document.body,
        props: { options: [1, 2, 3], closeDropdownOnSelect, open: true },
      })

      const input_el = get_input()
      if (closeDropdownOnSelect === `retain-focus`) input_el.focus()

      const first_option = doc_query(`ul.options > li`)
      first_option.click()
      await tick() // let happy-dom settle document.activeElement after add()'s input.focus()

      const is_desktop = globalThis.innerWidth > select.breakpoint
      const should_be_closed =
        closeDropdownOnSelect === true ||
        closeDropdownOnSelect === `retain-focus` ||
        (closeDropdownOnSelect === `if-mobile` && !is_desktop)

      const selected_items = document.querySelectorAll(`ul.selected > li`)
      expect(selected_items).toHaveLength(1)

      const dropdown = doc_query(`ul.options`)
      const state = JSON.stringify({
        is_desktop,
        should_be_closed,
        closeDropdownOnSelect,
        breakpoint: select.breakpoint,
      })

      expect(dropdown.classList.contains(`hidden`), state).toBe(should_be_closed)
      // focus tracking is reliable only for the close path in happy-dom
      if (closeDropdownOnSelect === `retain-focus`) {
        expect(document.activeElement).toBe(input_el)
      } else if (should_be_closed) {
        expect(document.activeElement).not.toBe(input_el)
      } else {
        expect([input_el, document.body]).toContain(document.activeElement)
      }

      if (closeDropdownOnSelect === `if-mobile`) {
        globalThis.innerWidth = 400
        globalThis.dispatchEvent(new Event(`resize`))
        expect(globalThis.innerWidth).toBeLessThan(select.breakpoint)

        const another_option = doc_query(`ul.options li:not(.selected)`)
        expect(
          another_option,
          `Could not find another option to test mobile selection behavior`,
        ).toBeInstanceOf(HTMLElement)
        another_option?.click()
        await tick()
        expect(dropdown.classList).toContain(`hidden`)
        expect(document.activeElement).not.toBe(input_el)
      }
    } finally {
      globalThis.innerWidth = original_inner_width
    }
  },
)

const mount_retain_focus = (props: Partial<MultiSelectProps> = {}) =>
  mount(MultiSelect, {
    target: document.body,
    props: { closeDropdownOnSelect: `retain-focus`, open: true, ...props },
  })

test.each([
  {
    reopen_method: `typing`,
    reopen_action: async (input_el: HTMLInputElement) => {
      await type_search_text(`r`, input_el)
      return doc_query(`ul.options > li`).textContent?.trim()
    },
    expected_option: `React`,
  },
  {
    reopen_method: `ArrowDown`,
    reopen_action: async (input_el: HTMLInputElement) => {
      input_el.dispatchEvent(fresh_key(`ArrowDown`))
      await tick()
      return doc_query(`ul.options > li.active`).textContent?.trim()
    },
    expected_option: `Solid`,
  },
] as const)(
  `closeDropdownOnSelect='retain-focus' reopens on $reopen_method after keyboard selection`,
  async ({ reopen_action, expected_option }) => {
    mount_retain_focus({ options: [`Svelte`, `Solid`, `React`] })

    const input_el = get_input()
    const dropdown = doc_query(`ul.options`)
    input_el.focus()
    input_el.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    input_el.dispatchEvent(fresh_key(`Enter`))
    await tick()

    expect(document.activeElement).toBe(input_el)
    expect(dropdown.classList).toContain(`hidden`)

    const reopened_option = await reopen_action(input_el)

    expect(dropdown.classList).not.toContain(`hidden`)
    expect(reopened_option).toBe(expected_option)
  },
)

test(`closeDropdownOnSelect='retain-focus' clears active create message after creating an option`, async () => {
  mount_retain_focus({
    options: [`apple`, `banana`, `cherry`],
    allowUserOptions: true,
  })

  const input_el = get_input()
  const dropdown = doc_query(`ul.options`)
  input_el.focus()
  await type_search_text(`app`, input_el)
  input_el.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()
  input_el.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()

  expect(doc_query(`ul.options li.user-msg`).classList).toContain(`active`)

  input_el.dispatchEvent(fresh_key(`Enter`))
  await tick()

  expect(dropdown.classList).toContain(`hidden`)
  expect(document.activeElement).toBe(input_el)

  await type_search_text(`b`, input_el)

  expect(dropdown.classList).not.toContain(`hidden`)
  expect(doc_query(`ul.options > li:not(.user-msg)`).textContent?.trim()).toBe(`banana`)
  expect(doc_query(`ul.options li.user-msg`).classList).not.toContain(`active`)
  expect(input_el.getAttribute(`aria-activedescendant`) ?? ``).not.toMatch(/user-msg/u)
})

test(`closeDropdownOnSelect='retain-focus' restores input focus after keyboard select all`, async () => {
  mount_retain_focus({
    options: [`Apple`, `Banana`],
    selectAllOption: true,
  })

  const input_el = get_input()
  const dropdown = doc_query(`ul.options`)
  const select_all_el = doc_query(`ul.options > li.select-all`)
  select_all_el.focus()
  select_all_el.dispatchEvent(fresh_key(`Enter`))
  await tick()

  expect(dropdown.classList).toContain(`hidden`)
  expect(document.activeElement).toBe(input_el)

  await type_search_text(`z`, input_el)

  expect(dropdown.classList).not.toContain(`hidden`)
  expect(doc_query(`ul.options li.user-msg`).textContent?.trim()).toBe(
    `No matching options`,
  )
})

test.each([
  {
    focus_target: `external`,
    attach_button: (button: HTMLButtonElement) => document.body.append(button),
  },
  {
    focus_target: `internal`,
    attach_button: (button: HTMLButtonElement) =>
      doc_query(`div.multiselect`).append(button),
  },
])(
  `closeDropdownOnSelect='retain-focus' does not override $focus_target onclose focus`,
  async ({ attach_button }) => {
    const focus_button = document.createElement(`button`)
    focus_button.tabIndex = 0
    mount_retain_focus({
      options: [`Apple`, `Banana`],
      selectAllOption: true,
      onclose: () => focus_button.focus(),
    })
    attach_button(focus_button)

    doc_query(`ul.options > li.select-all`).dispatchEvent(fresh_key(`Enter`))
    await tick()

    expect(document.activeElement).toBe(focus_button)
  },
)

test(`closeDropdownOnSelect='retain-focus' works correctly with maxSelect`, async () => {
  mount_retain_focus({ options: [1, 2, 3], maxSelect: 2 })

  const input_el = get_input()
  input_el.focus()

  doc_query(`ul.options > li`).click()
  expect(document.activeElement).toBe(input_el)

  // the second selection reaches maxSelect, which must not steal focus either
  input_el.dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
  await tick()
  doc_query(`ul.options > li`).click()
  await tick()

  expect(document.activeElement).toBe(input_el)
  expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(2)
})

test(`Escape and Tab still blur input even with closeDropdownOnSelect='retain-focus'`, async () => {
  mount_retain_focus({ options: [1, 2, 3] })

  const input_el = get_input()
  input_el.focus()
  await tick()

  // Escape should blur input (retain-focus only applies to selection, not keyboard closing)
  input_el.dispatchEvent(fresh_key(`Escape`))

  expect(document.activeElement).not.toBe(input_el)
})

describe(`createOptionMsg as function`, () => {
  test.each([
    {
      desc: `no matches passes empty matchingOptions`,
      options: [`apple`, `banana`, `cherry`],
      selected: [`apple`],
      search: `grape`,
      expected_matching: [],
    },
    {
      desc: `partial match passes filtered matchingOptions`,
      options: [`apple`, `apricot`, `banana`],
      selected: [],
      search: `ap`,
      expected_matching: [`apple`, `apricot`],
    },
  ])(`$desc`, async ({ options, selected, search, expected_matching }) => {
    let captured_state: Record<string, unknown> = {}
    mount(MultiSelect, {
      target: document.body,
      props: {
        options,
        selected,
        allowUserOptions: true,
        createOptionMsg: (state: Record<string, unknown>) => {
          captured_state = state
          return `Create '${String(state.searchText)}'`
        },
      },
    })

    const input = get_input()
    await type_search_text(search, input)

    expect(doc_query(`ul.options li.user-msg`).textContent?.trim()).toBe(
      `Create '${search}'`,
    )
    expect(captured_state.searchText).toBe(search)
    expect(captured_state.selected).toEqual(selected)
    expect(captured_state.options).toEqual(options)
    expect(captured_state.matchingOptions).toEqual(expected_matching)
  })

  // Static string, null, and function returning empty string
  test.each([
    [`Create this option...`, `Create this option...`],
    [null, `No matches`],
    [() => ``, `No matches`], // function returning '' should not show phantom create slot
  ])(
    `createOptionMsg=%s shows correct user message`,
    async (createOptionMsg, expected_text) => {
      mount(MultiSelect, {
        target: document.body,
        props: {
          options: [`foo`],
          allowUserOptions: true,
          createOptionMsg,
          noMatchingOptionsMsg: `No matches`,
        },
      })

      const input = get_input()
      await type_search_text(`bar`, input)

      expect(doc_query(`ul.options li.user-msg`).textContent?.trim()).toBe(expected_text)
    },
  )

  test(`function can combine multiple state fields`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [`a`, `b`, `c`],
        selected: [`a`, `b`],
        allowUserOptions: true,
        createOptionMsg: ({
          searchText,
          selected,
        }: {
          searchText: string
          selected: unknown[]
        }) => `Create '${searchText}' (${selected.length} selected)`,
      },
    })

    const input = get_input()
    await type_search_text(`d`, input)

    expect(doc_query(`ul.options li.user-msg`).textContent?.trim()).toBe(
      `Create 'd' (2 selected)`,
    )
  })
})

describe(`selectAllOption feature`, () => {
  const options = [`Apple`, `Banana`, `Cherry`, `Date`]

  test.each([
    [true, `Select all`],
    [`Custom label`, `Custom label`],
  ])(
    `shows correct label when selectAllOption=%s`,
    async (selectAllOption, expected_label) => {
      mount(MultiSelect, { target: document.body, props: { options, selectAllOption } })
      get_input().click()
      await tick()
      expect(doc_query(`ul.options > li.select-all`).textContent?.trim()).toBe(
        expected_label,
      )
    },
  )

  test.each([[{ selectAllOption: false }], [{ selectAllOption: true, maxSelect: 1 }]])(
    `hidden when props=%j`,
    async (props) => {
      mount(MultiSelect, { target: document.body, props: { options, ...props } })
      get_input().click()
      await tick()
      expect(document.querySelector(`ul.options > li.select-all`)).toBeNull()
    },
  )

  test.each([
    [`visible`, undefined],
    [`matching`, 1],
  ] as const)(`selects all %s options and fires events`, async (scope, maxOptions) => {
    const onselectAll_spy = vi.fn()
    const onchange_spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options,
        maxOptions,
        selectAllOption: true,
        selectAllScope: scope,
        onselectAll: onselectAll_spy,
        onchange: onchange_spy,
      },
    })
    get_input().click()
    await tick()
    const select_all = doc_query(`ul.options > li.select-all`)
    expect(select_all.getAttribute(`aria-selected`)).toBe(`false`)
    select_all.click()
    await tick()
    expect(select_all.getAttribute(`aria-selected`)).toBe(`true`)
    expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`Apple Banana Cherry Date`)
    expect(onselectAll_spy).toHaveBeenCalledWith({ options, scope })
    expect(onchange_spy).toHaveBeenCalledWith({ options, type: `selectAll` })
  })

  test(`respects maxSelect and skips disabled options`, async () => {
    const options_mixed = [
      { label: `A` },
      { label: `B`, disabled: true },
      { label: `C` },
      { label: `D` },
    ]
    mount(MultiSelect, {
      target: document.body,
      props: { options: options_mixed, selectAllOption: true, maxSelect: 2 },
    })
    const input = get_input()
    input.click()
    doc_query(`ul.options > li.select-all`).click()
    await tick()
    expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`A C`) // skipped B (disabled), limited to 2
  })

  test(`triggers onmaxreached when select_all shortcut fired at maxSelect`, async () => {
    const onmaxreached_spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [`a`, `b`, `c`],
        selectAllOption: true,
        selected: [`a`, `b`],
        maxSelect: 2,
        shortcuts: { select_all: `ctrl+a` },
        onmaxreached: onmaxreached_spy,
      },
    })
    const input = get_input()
    input.focus()
    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `a`, ctrlKey: true, bubbles: true }),
    )
    await tick()

    expect(onmaxreached_spy).toHaveBeenCalledTimes(1)
    expect(onmaxreached_spy).toHaveBeenCalledWith({
      selected: [`a`, `b`],
      maxSelect: 2,
      attemptedOption: `c`,
    })
  })

  test(`triggers onmaxreached on partial batch fill (some added, some dropped)`, async () => {
    const onmaxreached_spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [`a`, `b`, `c`, `d`, `e`],
        selectAllOption: true,
        selected: [],
        maxSelect: 3,
        onmaxreached: onmaxreached_spy,
      },
    })
    const input = get_input()
    input.click()
    await tick()

    doc_query(`ul.options > li.select-all`).click()
    await tick()

    expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`a b c`)
    expect(onmaxreached_spy).toHaveBeenCalledTimes(1)
    expect(onmaxreached_spy).toHaveBeenCalledWith({
      selected: [`a`, `b`, `c`],
      maxSelect: 3,
      attemptedOption: `d`,
    })
  })

  test.each([
    [`custom string`, `Tout est selectionne`, `Tout est selectionne`],
    [
      `function`,
      (state: { selected_count: number }) => `${state.selected_count} ausgewahlt`,
      `4 ausgewahlt`,
    ],
    [`null suppresses`, null, ``],
  ])(`selectAllDisabledTitle %s`, async (_label, title_prop, expected_title) => {
    mount(MultiSelect, {
      target: document.body,
      props: {
        options,
        selected: [...options],
        selectAllOption: true,
        selectAllDisabledTitle: title_prop,
      },
    })
    get_input().click()
    await tick()
    expect(doc_query(`ul.options > li.select-all`).title).toBe(expected_title)
  })

  test.each([
    [true, ``],
    [false, `a`],
  ])(
    `resetFilterOnAdd=%j controls searchText after select all`,
    async (resetFilterOnAdd, expected) => {
      mount(MultiSelect, {
        target: document.body,
        props: { options, selectAllOption: true, resetFilterOnAdd },
      })
      const input = get_input()
      input.click()
      await type_search_text(`a`, input)
      doc_query(`ul.options > li.select-all`).click()
      await tick()
      expect(input.value).toBe(expected)
    },
  )

  test.each<[string, Partial<MultiSelectProps>, boolean, string]>([
    [
      `all selected`,
      { options: [`a`, `b`, `c`, `d`], selected: [`a`, `b`, `c`, `d`] },
      true,
      `All options already selected`,
    ],
    [`some unselected`, { options: [`a`, `b`, `c`, `d`], selected: [`a`] }, false, ``],
    [
      `all non-disabled selected`,
      {
        options: [{ label: `A` }, { label: `B`, disabled: true }, { label: `C` }],
        selected: [{ label: `A` }, { label: `C` }],
      },
      true,
      `All options already selected`,
    ],
    [
      `maxSelect reached`,
      { options: [`a`, `b`, `c`, `d`], selected: [`a`, `b`], maxSelect: 2 },
      true,
      `Maximum of 2 options selected`,
    ],
    [
      `maxSelect reached AND all selectable selected`,
      { options: [`a`, `b`], selected: [`a`, `b`], maxSelect: 2 },
      true,
      `All options already selected`,
    ],
    [
      `case-insensitive duplicates selected`,
      {
        options: [`Apple`, `apple`],
        selected: [`Apple`],
        duplicates: `case-insensitive`,
      },
      true,
      `All options already selected`,
    ],
    [
      `matching scope with loadOptions`,
      {
        open: true,
        selectAllScope: `matching`,
        loadOptions: async () => ({ options: [`a`], hasMore: false }),
      },
      true,
      `Matching select-all is only available with local options`,
    ],
    [
      `loaded visible options selected`,
      {
        open: true,
        selected: [`a`],
        loadOptions: async () => ({ options: [`a`], hasMore: false }),
      },
      true,
      `All options already selected`,
    ],
  ])(
    `Select All disabled state: %s`,
    async (_label, extra_props, expected_disabled, expected_title) => {
      mount(MultiSelect, {
        target: document.body,
        props: { selectAllOption: true, ...extra_props },
      })
      get_input().click()
      const select_all_li = await vi.waitFor(() =>
        doc_query<HTMLLIElement>(`ul.options > li.select-all`),
      )
      expect(select_all_li.classList.contains(`disabled`)).toBe(expected_disabled)
      expect(select_all_li.getAttribute(`aria-disabled`)).toBe(
        expected_disabled ? `true` : null,
      )
      expect(select_all_li.tabIndex).toBe(expected_disabled ? -1 : 0)
      expect(select_all_li.title).toBe(expected_title)
    },
  )

  test(`disabled Select All ignores click`, async () => {
    const onselectAll_spy = vi.fn()
    const props = $state<MultiSelectProps>({
      options: [`a`, `b`, `c`],
      selected: [`a`, `b`],
      selectAllOption: true,
      maxSelect: 2,
      onselectAll: onselectAll_spy,
    })
    mount(MultiSelect, { target: document.body, props })
    get_input().click()
    await tick()

    doc_query(`ul.options > li.select-all`).click()
    await tick()

    expect(onselectAll_spy).not.toHaveBeenCalled()
    expect(props.selected).toEqual([`a`, `b`])
  })

  test(`applies liSelectAllClass`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: { options, selectAllOption: true, liSelectAllClass: `custom` },
    })
    get_input().click()
    await tick()
    expect(doc_query(`ul.options > li.select-all`).classList.contains(`custom`)).toBe(
      true,
    )
  })

  test.each([
    [`Enter`, { key: `Enter` }],
    [`Space`, { code: `Space` }],
  ])(`keyboard %s activates`, async (_name, key_props) => {
    const spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: { options, selectAllOption: true, onselectAll: spy },
    })
    get_input().click()
    doc_query(`ul.options > li.select-all`).dispatchEvent(
      new KeyboardEvent(`keydown`, { ...key_props, bubbles: true }),
    )
    await tick()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

// Test that value prop can initialize selected options for both single (maxSelect=1) and multi-select (maxSelect=null)
// Covers string, number, and object options, with single values for maxSelect=1 and arrays for maxSelect=null
describe.each([[1], [null]])(`initial value prop with maxSelect=%s`, (max_select) => {
  test.each([
    [`Red`, [`Red`, `Green`, `Blue`], `Red`],
    [1, [1, 2, 3], `1`],
    [{ label: `Red` }, [{ label: `Red` }, { label: `Green` }], `Red`],
    [[`Red`, `Green`], [`Red`, `Green`, `Blue`], `Red Green`],
    [[1, 2], [1, 2, 3], `1 2`],
    [
      [{ label: `Red` }, { label: `Green` }],
      [{ label: `Red` }, { label: `Green` }, { label: `Blue` }],
      `Red Green`,
    ],
  ])(`works when value=%s`, (value, options, expected_text) => {
    const is_single_value = !Array.isArray(value)
    const is_single_select = max_select === 1

    // Skip invalid combinations: single value with multi-select, array value with single select
    if (is_single_value !== is_single_select) return

    mount(MultiSelect, {
      target: document.body,
      props: { options, value, maxSelect: max_select },
    })

    const selected_ul = doc_query(`ul.selected`)
    expect(selected_ul.textContent?.trim()).toBe(expected_text)
  })
})

// deferred loadOptions fetch: tests decide exactly when each request settles
type LoadResult = { options: string[]; hasMore: boolean }
function deferred_load() {
  const resolvers: ((val: LoadResult) => void)[] = []
  const rejectors: ((err: Error) => void)[] = []
  const fn = vi.fn(
    (_params: LoadOptionsParams) =>
      new Promise<LoadResult>((resolve, reject) => {
        resolvers.push(resolve)
        rejectors.push(reject)
      }),
  )
  return { fn, resolvers, rejectors }
}

// Dynamic options loading tests (https://github.com/janosh/svelte-widgets/discussions/342)
describe(`loadOptions feature`, () => {
  const mock_data = Array.from({ length: 100 }, (_, idx) => `Option ${idx + 1}`)

  async function flush_ticks(count = 4) {
    for (let idx = 0; idx < count; idx++) await tick()
  }

  function mock_scroll_near_bottom(ul: Element) {
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(500)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(200)
    vi.spyOn(ul, `scrollTop`, `get`).mockReturnValue(250) // 500-250-200=50 < 100 threshold
    ul.dispatchEvent(new Event(`scroll`))
  }

  // bare-fn and `{ fetch }` object forms both default to batchSize 50 / onOpen true, so
  // the object form parameterizes all three initial-open cases uniformly
  test.each([
    [`default batch on open`, {}, 1, { search: ``, offset: 0, limit: 50 }],
    [`batchSize config`, { batchSize: 25 }, 1, { search: ``, offset: 0, limit: 25 }],
    [`onOpen=false skips open load`, { onOpen: false }, 0, null],
  ])(
    `loadOptions initial fetch: %s`,
    async (_label, config_extra, expected_calls, expected_args) => {
      const load_options = vi.fn(() => Promise.resolve({ options: [], hasMore: false }))
      mount(MultiSelect, {
        target: document.body,
        props: { loadOptions: { fetch: load_options, ...config_extra }, open: true },
      })
      await tick()

      expect(load_options).toHaveBeenCalledTimes(expected_calls)
      if (expected_args) {
        expect(load_options).toHaveBeenCalledWith(expect.objectContaining(expected_args))
      }
    },
  )

  // local options must not be gated behind the network: a command palette filters its
  // static commands on the first keystroke while remote results are still in flight
  test(`local options match instantly and remote results append behind them`, async () => {
    vi.useFakeTimers()
    try {
      const { fn: fetch_fn, resolvers } = deferred_load()
      mount(MultiSelect, {
        target: document.body,
        props: {
          options: [`Alpha`, `Beta`],
          loadOptions: { fetch: fetch_fn, debounceMs: 500 },
          open: true,
        },
      })
      await vi.runAllTimersAsync()
      await type_search_text(`al`)

      const rendered = () =>
        [...document.querySelectorAll(`ul.options > li[role='option']`)].map((li) =>
          li.textContent?.trim(),
        )
      // no timers advanced and no fetch settled: this row can only be a local option
      expect(rendered()).toEqual([`Alpha`])
      expect(fetch_fn).toHaveBeenCalledOnce() // just the on-open load, typing still debounced

      await vi.runAllTimersAsync() // debounce elapses, fetch fires but never settles
      expect(rendered()).toEqual([`Alpha`])

      resolvers[1]({ options: [`Remote alpha`], hasMore: false })
      await vi.runAllTimersAsync()

      expect(rendered()).toEqual([`Alpha`, `Remote alpha`])
    } finally {
      vi.useRealTimers()
    }
  })

  test(`loadOptions shows loading indicator while loading`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount(MultiSelect, {
      target: document.body,
      props: { loadOptions: load_options, open: true },
    })
    await tick()

    expect(document.querySelector(`ul.options > li.loading-more`)).toBeInstanceOf(
      HTMLLIElement,
    )

    resolvers[0]({ options: [`Test`], hasMore: false })
    await tick()

    expect(document.querySelector(`ul.options > li.loading-more`)).toBeNull()
  })

  test.each([
    [
      `triggers another fetch when hasMore=true`,
      () =>
        vi
          .fn()
          .mockResolvedValueOnce({ options: mock_data.slice(0, 50), hasMore: true })
          .mockResolvedValueOnce({ options: mock_data.slice(50, 100), hasMore: false }),
      2,
      { search: ``, offset: 50, limit: 50 },
    ],
    [
      `does not fetch again when hasMore=false`,
      () => vi.fn(() => Promise.resolve({ options: [`A`, `B`], hasMore: false })),
      1,
      null,
    ],
  ])(
    `scroll pagination: %s`,
    async (_label, make_load_options, expected_calls, last_args) => {
      const load_options = make_load_options()
      mount(MultiSelect, {
        target: document.body,
        props: { loadOptions: load_options, open: true },
      })
      await tick()
      await tick()

      expect(load_options).toHaveBeenCalledTimes(1)

      mock_scroll_near_bottom(doc_query(`ul.options`))
      await tick()

      expect(load_options).toHaveBeenCalledTimes(expected_calls)
      if (last_args) {
        expect(load_options).toHaveBeenLastCalledWith(expect.objectContaining(last_args))
      }
    },
  )

  // https://github.com/janosh/svelte-widgets/issues/412
  test(`auto-fills when small batchSize doesn't overflow dropdown`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount(MultiSelect, {
      target: document.body,
      props: { loadOptions: { fetch: load_options, batchSize: 5 }, open: true },
    })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    // Mock a rendered but non-overflowing list
    const ul = doc_query(`ul.options`)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(400)
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(100)

    resolvers[0]({ options: mock_data.slice(0, 5), hasMore: true })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(2)

    resolvers[1]({ options: mock_data.slice(5, 10), hasMore: false })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(2) // hasMore=false stops auto-fill
  })

  test(`auto-fill stops when list becomes scrollable`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount(MultiSelect, {
      target: document.body,
      props: { loadOptions: { fetch: load_options, batchSize: 5 }, open: true },
    })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    // Mock overflow BEFORE resolving so auto-fill sees the list as scrollable
    const ul = doc_query(`ul.options`)
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(500)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(400)

    resolvers[0]({ options: mock_data.slice(0, 5), hasMore: true })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(1)
  })

  // The unmount abort lives in a teardown-returning $effect, whose shape is easy to
  // misread as a missing call. This pins the behavior so a "fix" can't silently undo it.
  test(`unmounting aborts the in-flight fetch`, async () => {
    const { fn: load_options } = deferred_load()
    const component = mount(MultiSelect, {
      target: document.body,
      props: { loadOptions: load_options, open: true },
    })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)
    expect(load_options.mock.calls[0][0].signal?.aborted).toBe(false)

    void unmount(component)
    await tick()

    expect(load_options.mock.calls[0][0].signal?.aborted).toBe(true)
  })

  // `signal` is optional, so a consumer may ignore it. Its request then keeps running
  // and can fail for real after being superseded — that must still be reported.
  test(`logs a real failure from a superseded request that ignored signal`, async () => {
    const console_error = vi.spyOn(console, `error`).mockImplementation(() => {})
    const { fn: load_options, rejectors } = deferred_load()
    vi.useFakeTimers()
    try {
      mount(MultiSelect, {
        target: document.body,
        props: { loadOptions: { fetch: load_options, debounceMs: 10 }, open: true },
      })
      await vi.runAllTimersAsync()

      const input = get_input()
      await type_search_text(`abc`, input)
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(2)
      expect(load_options.mock.calls[0][0].signal?.aborted).toBe(true)

      rejectors[0](new Error(`HTTP 500 boom`))
      await vi.runAllTimersAsync()

      expect(console_error).toHaveBeenCalledWith(
        `MultiSelect: loadOptions error:`,
        expect.any(Error),
      )
    } finally {
      vi.useRealTimers()
      console_error.mockRestore()
    }
  })

  test(`a search reset aborts an in-flight pagination request`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    vi.useFakeTimers()
    try {
      mount(MultiSelect, {
        target: document.body,
        props: { loadOptions: { fetch: load_options, debounceMs: 10 }, open: true },
      })
      await vi.runAllTimersAsync()
      resolvers[0]({ options: mock_data.slice(0, 50), hasMore: true })
      await vi.runAllTimersAsync()

      mock_scroll_near_bottom(doc_query(`ul.options`))
      await tick()
      expect(load_options).toHaveBeenCalledTimes(2) // pagination now in flight

      const input = get_input()
      await type_search_text(`zz`, input)
      await vi.runAllTimersAsync()

      expect(load_options.mock.calls[1][0].signal?.aborted).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  // A server can report hasMore alongside an empty batch. Refetching the same offset
  // can't make progress, and a non-reset load at offset 0 would break the documented
  // cursor-pagination pattern that treats offset 0 as "reset your cursor".
  test(`auto-fill stops on an empty batch and never reuses offset 0`, async () => {
    const offsets: number[] = []
    const load_options = vi.fn(async ({ offset }: LoadOptionsParams) => {
      offsets.push(offset)
      return { options: [] as string[], hasMore: true }
    })
    mount(MultiSelect, {
      target: document.body,
      props: { loadOptions: { fetch: load_options, batchSize: 5 }, open: true },
    })
    await tick()

    const ul = doc_query(`ul.options`)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(400)
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(100)
    await flush_ticks(10)

    expect(offsets).toEqual([0])
  })

  test(`stale fetch result discarded when search changes during load`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    vi.useFakeTimers()
    try {
      mount(MultiSelect, {
        target: document.body,
        props: { loadOptions: { fetch: load_options, debounceMs: 10 }, open: true },
      })
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(1)

      // Type new search while first fetch is pending
      const input = get_input()
      await type_search_text(`xyz`, input)
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(2)
      expect(load_options.mock.calls[0][0].signal?.aborted).toBe(true)
      // exact match, not objectContaining: pins that a signal is actually handed over
      expect(load_options).toHaveBeenLastCalledWith({
        search: `xyz`,
        offset: 0,
        limit: 50,
        signal: expect.any(AbortSignal),
      })

      // Resolve the STALE first request after the new one was initiated
      resolvers[0]({ options: [`Stale Result`], hasMore: false })
      await vi.runAllTimersAsync()

      const ul = doc_query(`ul.options`)
      expect(ul.textContent).not.toContain(`Stale Result`)

      // Resolve the current request
      resolvers[1]({ options: [`Fresh Result`], hasMore: false })
      await vi.runAllTimersAsync()
      expect(ul.textContent).toContain(`Fresh Result`)
    } finally {
      vi.useRealTimers()
    }
  })

  test(`pagination error is logged, clears busy state, and stops further loading`, async () => {
    const console_error = vi.spyOn(console, `error`).mockImplementation(() => {})
    const { fn: load_options, resolvers, rejectors } = deferred_load()
    mount(MultiSelect, {
      target: document.body,
      props: { loadOptions: load_options, open: true },
    })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    resolvers[0]({ options: mock_data.slice(0, 50), hasMore: true })
    await tick()
    const input = get_input()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    const ul = doc_query(`ul.options`)
    mock_scroll_near_bottom(ul)
    await tick()
    expect(load_options).toHaveBeenCalledTimes(2)
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    rejectors[1](new Error(`Server error`))
    await tick()
    expect(console_error).toHaveBeenCalledWith(
      `MultiSelect: loadOptions error:`,
      expect.any(Error),
    )

    // the error sets has_more=false, which both clears pending and blocks pagination
    expect(input.getAttribute(`aria-busy`)).toBeNull()
    mock_scroll_near_bottom(ul)
    await tick()
    expect(load_options).toHaveBeenCalledTimes(2)
    console_error.mockRestore()
  })

  test(`close during fetch clears loading state`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount(MultiSelect, {
      target: document.body,
      props: { loadOptions: load_options, open: true },
    })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    const input = get_input()
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    // Close dropdown via Escape while fetch is still pending
    input.dispatchEvent(fresh_key(`Escape`))
    await tick()

    // aria-busy should clear immediately on close
    expect(input.getAttribute(`aria-busy`)).toBeNull()
    expect(load_options.mock.calls[0][0].signal?.aborted).toBe(true)

    // Stale fetch resolves after close — should not corrupt state
    resolvers[0]({ options: [`Result`], hasMore: false })
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    // Reopen — should trigger fresh load, not be stuck
    doc_query(`div.multiselect`).dispatchEvent(
      new MouseEvent(`mouseup`, { bubbles: true }),
    )
    await tick()
    expect(load_options).toHaveBeenCalledTimes(2)
  })

  test(`rapid search changes only apply final result`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    vi.useFakeTimers()
    try {
      mount(MultiSelect, {
        target: document.body,
        props: { loadOptions: { fetch: load_options, debounceMs: 10 }, open: true },
      })
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(1)

      const input = get_input()
      // Type "a", debounce, then "ab" before first completes
      await type_search_text(`a`, input)
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(2)

      await type_search_text(`ab`, input)
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(3)

      // Resolve all three in reverse order (worst-case network jitter)
      resolvers[2]({ options: [`AB Result`], hasMore: false })
      resolvers[1]({ options: [`A Result`], hasMore: false })
      resolvers[0]({ options: [`Initial`], hasMore: false })
      await vi.runAllTimersAsync()

      const ul = doc_query(`ul.options`)
      expect(ul.textContent).toContain(`AB Result`)
      expect(ul.textContent).not.toContain(`A Result`)
      expect(ul.textContent).not.toContain(`Initial`)
    } finally {
      vi.useRealTimers()
    }
  })

  test(`scroll after auto-fill cap resets counter and allows more loading`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount(MultiSelect, {
      target: document.body,
      props: { loadOptions: { fetch: load_options, batchSize: 5 }, open: true },
    })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    const ul = doc_query(`ul.options`)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(400)
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(100)

    // resolve batches until the auto-fill cap is reached
    for (let idx = 0; idx < 20; idx++) {
      resolvers[idx]({ options: [`Item ${idx}`], hasMore: true })
      await flush_ticks()
    }
    const capped_count = load_options.mock.calls.length
    expect(capped_count).toBe(21) // MAX_AUTO_FILL_ROUNDS rounds plus the on-open load
    // Auto-fill should have stopped at the cap
    resolvers[capped_count - 1]({ options: [`Capped`], hasMore: true })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(capped_count)

    // Simulate user scroll — should reset counter and allow more loading
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(500)
    vi.spyOn(ul, `scrollTop`, `get`).mockReturnValue(250)
    ul.dispatchEvent(new Event(`scroll`))
    await tick()
    expect(load_options).toHaveBeenCalledTimes(capped_count + 1)

    // After scroll-triggered load resolves, auto-fill should resume
    // (list still doesn't overflow), verifying that the counter was reset.
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(100)
    resolvers[capped_count]({ options: [`Post-scroll`], hasMore: true })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(capped_count + 2)
  })

  test(`reopen before stale fetch resolves triggers fresh load`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount(MultiSelect, {
      target: document.body,
      props: { loadOptions: load_options, open: true },
    })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    const input = get_input()

    // Close while first fetch is still pending (NOT resolved)
    input.dispatchEvent(fresh_key(`Escape`))
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    // Reopen BEFORE old fetch resolves — this is the critical timing
    doc_query(`div.multiselect`).dispatchEvent(
      new MouseEvent(`mouseup`, { bubbles: true }),
    )
    await tick()
    expect(load_options).toHaveBeenCalledTimes(2)
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    // Old fetch resolves late — must be discarded, not corrupt new session
    resolvers[0]({ options: [`Stale`], hasMore: false })
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)
    expect(doc_query(`ul.options`).textContent).not.toContain(`Stale`)

    // New fetch resolves — applied normally
    resolvers[1]({ options: [`Fresh`], hasMore: false })
    await tick()
    expect(doc_query(`ul.options`).textContent).toContain(`Fresh`)
    expect(input.getAttribute(`aria-busy`)).toBeNull()
  })

  test(`stale error does not affect current request state`, async () => {
    const console_error = vi.spyOn(console, `error`).mockImplementation(() => {})
    const { fn: load_options, resolvers, rejectors } = deferred_load()
    vi.useFakeTimers()
    try {
      mount(MultiSelect, {
        target: document.body,
        props: { loadOptions: { fetch: load_options, debounceMs: 10 }, open: true },
      })
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(1)

      // Type to trigger a new search while first fetch is pending
      const input = get_input()
      await type_search_text(`test`, input)
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(2)

      // New fetch succeeds FIRST with hasMore=true
      resolvers[1]({ options: [`Result A`], hasMore: true })
      await vi.runAllTimersAsync()

      const ul = doc_query(`ul.options`)
      expect(ul.textContent).toContain(`Result A`)

      // Old (stale) fetch ERRORS AFTER success — must not corrupt hasMore
      rejectors[0](new Error(`Stale network error`))
      await vi.runAllTimersAsync()

      // Scroll should trigger pagination (hasMore was NOT corrupted by stale error)
      mock_scroll_near_bottom(ul)
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(3)
    } finally {
      vi.useRealTimers()
      console_error.mockRestore()
    }
  })

  test(`failed initial load retries on close+reopen`, async () => {
    const console_error = vi.spyOn(console, `error`).mockImplementation(() => {})
    const { fn: load_options, resolvers, rejectors } = deferred_load()
    vi.useFakeTimers()
    try {
      // Use onOpen=false so retry requires typing, exposing has_more via pending
      mount(MultiSelect, {
        target: document.body,
        props: {
          loadOptions: { fetch: load_options, onOpen: false, debounceMs: 10 },
          open: true,
        },
      })

      // Type to trigger initial load (onOpen=false requires user input)
      const input = get_input()
      await type_search_text(`q`, input)
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(1)

      rejectors[0](new Error(`Server down`))
      await vi.runAllTimersAsync()

      // Close and reopen
      input.dispatchEvent(fresh_key(`Escape`))
      await vi.runAllTimersAsync()
      doc_query(`div.multiselect`).dispatchEvent(
        new MouseEvent(`mouseup`, { bubbles: true }),
      )
      await vi.runAllTimersAsync()

      // Type to trigger load again (onOpen=false)
      await type_search_text(`q`, input)
      // During debounce: aria-busy must be true (has_more was reset on close)
      await tick()
      expect(input.getAttribute(`aria-busy`)).toBe(`true`)

      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(2)

      resolvers[1]({ options: [`Recovered`], hasMore: false })
      await vi.runAllTimersAsync()
      expect(doc_query(`ul.options`).textContent).toContain(`Recovered`)
      expect(input.getAttribute(`aria-busy`)).toBeNull()
    } finally {
      vi.useRealTimers()
      console_error.mockRestore()
    }
  })

  test(`failed search retryable via input change`, async () => {
    const console_error = vi.spyOn(console, `error`).mockImplementation(() => {})
    const { fn: load_options, resolvers, rejectors } = deferred_load()
    vi.useFakeTimers()
    try {
      mount(MultiSelect, {
        target: document.body,
        props: { loadOptions: { fetch: load_options, debounceMs: 0 }, open: true },
      })
      await vi.runAllTimersAsync()
      // Initial load succeeds
      resolvers[0]({ options: [`Apple`], hasMore: false })
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(1)

      // Search "x" triggers load, which fails
      const input = get_input()
      await type_search_text(`x`, input)
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(2)
      rejectors[1](new Error(`fail`))
      await vi.runAllTimersAsync()

      // Clear and retype the same search to trigger a fresh request.
      await type_search_text(``, input)
      await vi.runAllTimersAsync()
      await type_search_text(`x`, input)
      await vi.runAllTimersAsync()

      expect(load_options).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: `x`, offset: 0, limit: 50 }),
      )
    } finally {
      vi.useRealTimers()
      console_error.mockRestore()
    }
  })
})

// https://github.com/janosh/svelte-widgets/discussions/401
// User messages during async loading: create/no-match suppressed, dupe allowed
test.each([
  {
    name: `createOptionMsg hidden while loading, shown after`,
    props: { allowUserOptions: true, createOptionMsg: `Create this option` },
    initial_options: [`Existing`],
    search: `new tag`,
    while_loading: null,
    after_resolve: `Create this option`,
    resolve_with: [],
  },
  {
    name: `duplicateOptionMsg shown during loading`,
    props: { selected: [`Apple`], duplicateOptionMsg: `Already selected` },
    initial_options: [`Apple`, `Banana`],
    search: `Apple`,
    while_loading: `Already selected`,
    after_resolve: null,
    resolve_with: null,
  },
  {
    name: `noMatchingOptionsMsg hidden while loading, shown after`,
    props: { noMatchingOptionsMsg: `No matches` },
    initial_options: [`Apple`],
    search: `xyz`,
    while_loading: null,
    after_resolve: `No matches`,
    resolve_with: [],
  },
])(
  `$name`,
  async ({
    props,
    initial_options,
    search,
    while_loading,
    after_resolve,
    resolve_with,
  }) => {
    vi.useFakeTimers()
    try {
      const { fn: fetch_fn, resolvers } = deferred_load()

      mount(MultiSelect, {
        target: document.body,
        props: { loadOptions: { fetch: fetch_fn, debounceMs: 0 }, open: true, ...props },
      })
      await vi.runAllTimersAsync()
      resolvers[0]({ options: [...initial_options], hasMore: false })
      await vi.runAllTimersAsync()

      const input = get_input()
      await type_search_text(search, input)
      await vi.runAllTimersAsync()
      expect(fetch_fn.mock.calls.length).toBeGreaterThanOrEqual(2)

      const msg_during = document.querySelector(`.user-msg`)?.textContent?.trim()
      if (while_loading) expect(msg_during).toBe(while_loading)
      else expect(document.querySelector(`.user-msg`)).toBeNull()

      if (resolve_with) {
        resolvers[1]({ options: resolve_with, hasMore: false })
        await vi.runAllTimersAsync()
        expect(document.querySelector(`.user-msg`)?.textContent?.trim()).toBe(
          after_resolve,
        )
      }
    } finally {
      vi.useRealTimers()
    }
  },
)

test(`createOptionMsg shows immediately with static options`, async () => {
  mount(MultiSelect, {
    target: document.body,
    props: {
      options: [`Apple`, `Banana`],
      allowUserOptions: true,
      createOptionMsg: `Create this option`,
      open: true,
    },
  })
  await tick()
  const input = get_input()
  await type_search_text(`Cherry`, input)
  expect(document.querySelector(`.user-msg`)?.textContent?.trim()).toBe(
    `Create this option`,
  )
})

// https://github.com/janosh/svelte-widgets/pull/403#issuecomment-4106385445
describe(`load_options_pending`, () => {
  const create_deferred_fetch = () => {
    const { fn, resolvers } = deferred_load()
    return { fetch_fn: fn, fetch_resolvers: resolvers }
  }

  beforeEach(() => vi.useFakeTimers())

  test(`typing during the first in-flight load debounces instead of firing immediate fetches`, async () => {
    const { fetch_fn } = create_deferred_fetch()

    mount(MultiSelect, {
      target: document.body,
      // onOpen defaults to true, so the first load fires immediately on open
      props: { loadOptions: { fetch: fetch_fn, debounceMs: 200 }, open: true },
    })
    await tick()
    expect(fetch_fn).toHaveBeenCalledTimes(1) // immediate open load, still in-flight

    // type two chars while the first fetch is still awaiting (load_options_last_search
    // is null until it resolves). Pre-fix, each keystroke re-entered the first-load branch
    // and fired another immediate load_dynamic_options(true); the fix routes them to debounce.
    const input = get_input()
    for (const value of [`a`, `ab`]) {
      await type_search_text(value, input)
    }
    expect(fetch_fn).toHaveBeenCalledTimes(1) // no extra immediate fetches while debouncing

    await vi.advanceTimersByTimeAsync(200)
    expect(fetch_fn).toHaveBeenCalledTimes(2) // exactly one debounced fetch for the latest search
    expect(fetch_fn).toHaveBeenLastCalledWith(expect.objectContaining({ search: `ab` }))
  })

  // onOpen=true loads immediately on open, onOpen=false stays idle until the user types.
  // Either way Enter must wait for the debounce and fetch to settle before creating.
  test.each([true, false])(
    `onOpen=%s: Enter during debounce does not create unwanted option`,
    async (on_open) => {
      const { fetch_fn, fetch_resolvers } = create_deferred_fetch()
      const oncreate_spy = vi.fn()

      mount(MultiSelect, {
        target: document.body,
        props: {
          loadOptions: { fetch: fetch_fn, onOpen: on_open, debounceMs: 300 },
          allowUserOptions: true,
          createOptionMsg: `Create this option`,
          open: true,
          oncreate: oncreate_spy,
        },
      })
      await vi.runAllTimersAsync()

      const input = get_input()
      if (on_open) {
        expect(fetch_fn).toHaveBeenCalledTimes(1)
        fetch_resolvers[0]({ options: [`Apple`, `Banana`], hasMore: false })
        await vi.runAllTimersAsync()
      } else {
        expect(fetch_fn).not.toHaveBeenCalled()
        expect(input.getAttribute(`aria-busy`)).toBeNull() // idle until user types
      }

      await type_search_text(`Cherry`, input)

      expect(input.getAttribute(`aria-busy`)).toBe(`true`)

      // Enter during debounce window should NOT create an option
      input.dispatchEvent(fresh_key(`Enter`))
      await tick()
      expect(oncreate_spy).not.toHaveBeenCalled()
      expect(document.querySelector(`.user-msg`)).toBeNull()

      // Let debounce fire and fetch complete
      await vi.runAllTimersAsync()
      fetch_resolvers.at(-1)?.({ options: [], hasMore: false })
      await vi.runAllTimersAsync()

      expect(input.getAttribute(`aria-busy`)).toBeNull()
      expect(document.querySelector(`.user-msg`)?.textContent?.trim()).toBe(
        `Create this option`,
      )

      // Now Enter should create the option
      input.dispatchEvent(fresh_key(`Enter`))
      await tick()
      expect(oncreate_spy).toHaveBeenCalledTimes(1)
    },
  )

  test(`fetch failure unblocks pending state`, async () => {
    console.error = vi.fn()
    const fetch_fn = vi
      .fn()
      .mockResolvedValueOnce({ options: [`Apple`], hasMore: false })
      .mockRejectedValue(new Error(`network error`))

    mount(MultiSelect, {
      target: document.body,
      props: {
        loadOptions: { fetch: fetch_fn, debounceMs: 0 },
        allowUserOptions: true,
        createOptionMsg: `Create this option`,
        open: true,
      },
    })
    await vi.runAllTimersAsync()

    const input = get_input()
    await type_search_text(`NewThing`, input)
    await vi.runAllTimersAsync()

    expect(input.getAttribute(`aria-busy`)).toBeNull()
    expect(document.querySelector(`.user-msg`)?.textContent?.trim()).toBe(
      `Create this option`,
    )
    expect(console.error).toHaveBeenCalledWith(
      `MultiSelect: loadOptions error:`,
      expect.any(Error),
    )
  })

  test(`late fetch response after close does not corrupt next open`, async () => {
    const { fetch_fn, fetch_resolvers } = create_deferred_fetch()

    mount(MultiSelect, {
      target: document.body,
      props: {
        loadOptions: { fetch: fetch_fn, debounceMs: 0 },
        open: true,
      },
    })
    await vi.runAllTimersAsync()
    fetch_resolvers[0]({ options: [`Apple`], hasMore: false })
    await vi.runAllTimersAsync()
    expect(fetch_fn).toHaveBeenCalledTimes(1)

    // Type to trigger a second fetch, then close before it resolves
    const input = get_input()
    await type_search_text(`Rust`, input)
    await vi.runAllTimersAsync()
    expect(fetch_fn).toHaveBeenCalledTimes(2)

    // Close dropdown while fetch is in-flight
    input.dispatchEvent(fresh_key(`Escape`))
    await tick()

    // Late fetch resolves after close — stale results must be discarded
    fetch_resolvers[1]({ options: [`Rust Lang`], hasMore: false })
    await vi.runAllTimersAsync()

    // Reopen — should trigger fresh load immediately (is_first_load path)
    doc_query(`div.multiselect`).dispatchEvent(
      new MouseEvent(`mouseup`, { bubbles: true }),
    )
    await tick()
    // Fresh load fires immediately; stale path would debounce (not yet called)
    expect(fetch_fn).toHaveBeenCalledTimes(3)
    expect(fetch_fn).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: ``, offset: 0, limit: 50 }),
    )
    // Stale "Rust Lang" result must not leak into the reopened session
    expect(document.querySelector(`ul.options`)?.textContent).not.toContain(`Rust Lang`)
  })
})

// https://github.com/janosh/svelte-widgets/issues/369
describe(`binding update event count`, () => {
  test(`onchange fires 0 times on init and exactly once per selection`, async () => {
    const onchange_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2, 3], onchange: onchange_spy },
    })
    await tick()
    expect(onchange_spy).toHaveBeenCalledTimes(0)

    doc_query(`ul.options li`).click()
    await tick()
    expect(onchange_spy).toHaveBeenCalledTimes(1)
    expect(onchange_spy).toHaveBeenCalledWith({ option: 1, type: `add` })
  })

  test.each([null, 1])(
    `selected binding with maxSelect=%s: ≤1 update on init, exactly 1 per selection`,
    async (maxSelect) => {
      const spy = vi.fn()

      mount(Test2WayBind, {
        target: document.body,
        props: { options: [1, 2, 3], maxSelect, onSelectedChanged: spy },
      })
      await tick()
      expect(spy.mock.calls.length).toBeLessThanOrEqual(1) // init: at most 1 call

      spy.mockClear()
      doc_query(`ul.options li`).click()
      await tick()
      expect(spy).toHaveBeenCalledTimes(1) // selection: exactly 1 call
    },
  )

  // This test catches the regression where value gets synced from null to []
  // The bug: values_equal(null, []) returned false, causing value = [] assignment
  test.each([null, 1])(
    `value binding with maxSelect=%s: no extra sync from null to [] on init`,
    async (maxSelect) => {
      const spy = vi.fn()

      mount(Test2WayBind, {
        target: document.body,
        props: { options: [1, 2, 3], maxSelect, onValueChanged: spy },
      })
      await tick()

      // The effect in Test2WayBind fires at least once on mount with initial value
      expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1)
      // pre-fix the last call carried [] for maxSelect=null
      const last_value = spy.mock.calls.at(-1)?.[0]
      expect(last_value, `value should be null, not []`).toBeNull()
    },
  )
})

describe(`CSS static analysis`, () => {
  const component_source = readFileSync(`src/lib/MultiSelect.svelte`, `utf-8`)
  const css =
    /<style>(?<style>[\s\S]*?)<\/style>/u.exec(component_source)?.groups?.style ?? ``
  const get_css_block = (pattern: RegExp) => pattern.exec(css)?.groups?.block ?? ``
  const options_block = get_css_block(/:where\(ul\.options\)\s*\{(?<block>[\s\S]*?)\}/u)

  const props = [
    `--sms-border`,
    `--sms-bg`,
    `--sms-disabled-bg`,
    `--sms-selected-bg`,
    `--sms-li-active-bg`,
    `--sms-remove-btn-hover-bg`,
    `--sms-options-bg`,
    `--sms-options-shadow`,
    `--sms-li-selected-plain-bg`,
    `--sms-li-disabled-bg`,
    `--sms-li-disabled-text`,
    `--sms-select-all-border-bottom`,
  ]

  test.each(props)(`%s uses light-dark()`, (prop) => {
    expect(css).toMatch(
      new RegExp(`${prop.replaceAll(`-`, `[-]`)}[^;]*light-dark\\(`, `u`),
    )
  })

  test(`::highlight is global and uses light-dark()`, () => {
    expect(css).toMatch(
      /:global\(::highlight\(sms-search-matches\)\)\s*\{[^}]*light-dark\(/u,
    )
  })

  test(`--sms-active-color fallbacks use light-dark()`, () => {
    expect(
      css.match(/--sms-active-color,\s*light-dark\(/gu)?.length,
    ).toBeGreaterThanOrEqual(2)
  })

  test(`default-icon buttons enforce circle via min-height: 0 + overflow: hidden`, () => {
    const default_icon_block = get_css_block(
      /:is\(div\.multiselect button\.default-icon\)\s*\{(?<block>[\s\S]*?)\}/u,
    )
    expect(default_icon_block).toMatch(/min-height:\s*0/u)
    expect(default_icon_block).toMatch(/overflow:\s*hidden/u)
  })

  test(`options dropdown border and bg use light-dark defaults`, () => {
    expect(options_block).toMatch(/--sms-options-border,\s*1px solid light-dark\(/u)
    expect(options_block).toMatch(
      /border-width:\s*var\(--sms-options-border-width,\s*1px\)/u,
    )
    expect(options_block).toMatch(/--sms-options-bg,\s*light-dark\(#fcfcfc/u)
  })

  // Guards the schemeless-dark-page readability fix: the primary text-bearing surfaces
  // (root, input, dropdown) must pair their light-dark() background with a light-dark()
  // text default, so the widget can't render white-on-white when the page never declares
  // color-scheme (light-dark() → light).
  test.each([
    [`div.multiselect root`, /:where\(div\.multiselect\)\s*\{(?<block>[\s\S]*?)\}/u],
    [
      `input`,
      /:where\(div\.multiselect > ul\.selected > input\)\s*\{(?<block>[\s\S]*?)\}/u,
    ],
    [`ul.options dropdown`, /:where\(ul\.options\)\s*\{(?<block>[\s\S]*?)\}/u],
  ])(`%s pairs text color with a light-dark() default`, (_desc, pattern) => {
    expect(get_css_block(pattern)).toMatch(
      /color:\s*var\(--sms-text-color,\s*light-dark\(#222,\s*#eee\)\)/u,
    )
  })

  test(`selected option text color chain ends in a light-dark() default`, () => {
    const selected_block = get_css_block(
      /:where\(div\.multiselect > ul\.selected > li\)\s*\{(?<block>[\s\S]*?)\}/u,
    )
    expect(selected_block).toMatch(
      /color:\s*var\(--sms-selected-text-color,\s*var\(--sms-text-color,\s*light-dark\(#222,\s*#eee\)\)\)/u,
    )
  })

  test(`custom-snippet remove-all overrides circular defaults`, () => {
    const custom_remove_all = get_css_block(
      /:is\(div\.multiselect button\.remove-all:not\(\.default-icon\)\)\s*\{(?<block>[\s\S]*?)\}/u,
    )
    expect(custom_remove_all).toMatch(/border-radius:\s*3pt/u)
    expect(custom_remove_all).toMatch(/aspect-ratio:\s*auto/u)
    expect(custom_remove_all).toMatch(/padding:\s*0 2pt/u)
  })
})

// Option grouping feature tests (https://github.com/janosh/svelte-widgets/issues/135)
describe(`option grouping feature`, () => {
  const grouped_options = [
    { label: `Rock`, group: `Genre` },
    { label: `Electronic`, group: `Genre` },
    { label: `Jazz`, group: `Genre` },
    { label: `C Major`, group: `Key` },
    { label: `D Minor`, group: `Key` },
    `Ungrouped Option`,
  ]

  // throws rather than returning undefined, so callers can use the result directly
  const find_group_header = (name: string): HTMLElement => {
    const header = Array.from(
      document.querySelectorAll<HTMLElement>(`ul.options > li.group-header`),
    ).find((el) => el.textContent?.includes(name))
    if (!header) throw new Error(`Group header "${name}" not found`)
    return header
  }
  const header_names = () =>
    [...document.querySelectorAll(`ul.options > li.group-header`)].map((header) =>
      header.querySelector(`.group-label`)?.textContent?.trim(),
    )
  const group_select_all_btn = (group: string) =>
    find_group_header(group).querySelector<HTMLButtonElement>(`button.group-select-all`)
  const genre_options = grouped_options.filter(
    (opt) => typeof opt === `object` && opt.group === `Genre`,
  )
  const all_disabled_options = [
    { label: `X`, group: `AllDisabled`, disabled: true },
    { label: `Y`, group: `AllDisabled`, disabled: true },
    { label: `Z`, group: `HasEnabled` },
  ]

  test(`renders group headers and options correctly`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: grouped_options, open: true },
    })
    await tick()

    expect(header_names()).toEqual([`Genre`, `Key`])

    const all_options = document.querySelectorAll(`ul.options > li:not(.group-header)`)
    expect(all_options).toHaveLength(6)
  })

  test.each([`first`, `last`] as const)(
    `ungroupedPosition=%s renders ungrouped options in correct position`,
    async (ungroupedPosition) => {
      mount(MultiSelect, {
        target: document.body,
        props: { options: grouped_options, ungroupedPosition, open: true },
      })
      await tick()

      const all_lis = document.querySelectorAll(`ul.options > li`)
      const ungrouped_idx = Array.from(all_lis).findIndex((li) =>
        li.textContent?.includes(`Ungrouped Option`),
      )

      if (ungroupedPosition === `first`) {
        expect(ungrouped_idx).toBe(0) // first item (before any group headers)
      } else {
        expect(ungrouped_idx).toBe(all_lis.length - 1) // last item
      }
    },
  )

  test(`filtering shows only groups with matching options`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: grouped_options, open: true },
    })

    const input = get_input()
    await type_search_text(`Rock`, input)

    // Only Genre group header should be visible since only Rock matches
    const group_headers = document.querySelectorAll(`ul.options > li.group-header`)
    expect(group_headers).toHaveLength(1)
    expect(group_headers[0].textContent).toContain(`Genre`)
  })

  test(`arrow navigation skips group headers`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: grouped_options, open: true },
    })

    const input = await focus_input()

    // arrows land on real options only: the second press steps over the Genre header
    // sitting between the ungrouped option and Rock
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(
      `Ungrouped Option`,
    )

    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    const active_option = doc_query(`ul.options > li.active`)
    expect(active_option.textContent?.trim()).toBe(`Rock`)
    expect(active_option.classList.contains(`group-header`)).toBe(false)
  })

  test.each([
    [
      `click`,
      (header: HTMLElement) => header.click(),
      (header: HTMLElement) => header.click(),
    ],
    [
      `keyboard Enter/Space`,
      (header: HTMLElement) => header.dispatchEvent(fresh_key(`Enter`)),
      (header: HTMLElement) =>
        header.dispatchEvent(
          new KeyboardEvent(`keydown`, { code: `Space`, bubbles: true }),
        ),
    ],
  ])(
    `collapsibleGroups toggles group visibility via %s`,
    async (_via, collapse, expand) => {
      mount(MultiSelect, {
        target: document.body,
        props: { options: grouped_options, collapsibleGroups: true, open: true },
      })
      await tick()

      const genre_header = find_group_header(`Genre`)
      expect(genre_header.classList.contains(`collapsible`)).toBe(true)

      const count_options = () =>
        document.querySelectorAll(`ul.options > li:not(.group-header)`).length
      const initial_count = count_options()

      collapse(genre_header) // options in Genre group should be hidden
      await tick()
      expect(count_options()).toBeLessThan(initial_count)

      expand(genre_header)
      await tick()
      expect(count_options()).toBe(initial_count)
    },
  )

  test(`groupSelectAll buttons select groups by click and keyboard`, async () => {
    const onselectAll_spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: grouped_options,
        groupSelectAll: true,
        onselectAll: onselectAll_spy,
        open: true,
      },
    })
    await tick()

    const select_all_buttons = document.querySelectorAll(
      `ul.options > li.group-header button.group-select-all`,
    )
    expect(select_all_buttons).toHaveLength(2) // One for each group

    const genre_header = find_group_header(`Genre`)
    const genre_select_all = genre_header.querySelector<HTMLElement>(
      `button.group-select-all`,
    )
    genre_select_all?.click()
    await tick()

    expect(onselectAll_spy).toHaveBeenCalledTimes(1)
    const selected_options = onselectAll_spy.mock.calls[0][0].options
    expect(selected_options).toHaveLength(3) // Rock, Electronic, Jazz
    expect(
      selected_options.every((opt: { group: string }) => opt.group === `Genre`),
    ).toBe(true)

    const key_header = find_group_header(`Key`)
    key_header
      .querySelector<HTMLElement>(`button.group-select-all`)
      ?.dispatchEvent(fresh_key(`Enter`))
    await tick()

    expect(onselectAll_spy).toHaveBeenCalledTimes(2)
    expect(onselectAll_spy.mock.calls[1][0].options).toHaveLength(2)
  })

  test.each([
    [1, 0, 0], // maxSelect=1: button hidden, 0 selected
    [2, 2, 2], // maxSelect=2: button visible (2 groups), 2 selected when clicked
  ] as const)(
    `groupSelectAll with maxSelect=%s shows %s buttons and selects up to maxSelect`,
    async (maxSelect, expected_buttons, expected_selected) => {
      mount(MultiSelect, {
        target: document.body,
        props: { options: grouped_options, groupSelectAll: true, maxSelect, open: true },
      })
      await tick()

      const select_all_buttons = document.querySelectorAll(
        `ul.options > li.group-header button.group-select-all`,
      )
      expect(select_all_buttons).toHaveLength(expected_buttons)

      if (expected_buttons > 0) {
        const genre_header = find_group_header(`Genre`)
        genre_header.querySelector<HTMLButtonElement>(`button.group-select-all`)?.click()
        await tick()
        expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(
          expected_selected,
        )
      }
    },
  )

  // The button's resting state is a pure function of the group's options and the
  // current selection, so every combination is one mount and two reads
  test.each([
    [
      `maxSelect already reached`,
      { selected: [grouped_options[0], grouped_options[1]], maxSelect: 2 },
      `Genre`,
      { disabled: true, label: `Select all` },
    ],
    [
      `every selectable option in the group is selected`,
      { selected: genre_options, keepSelectedInDropdown: `plain` as const },
      `Genre`,
      { disabled: false, label: `Deselect all` },
    ],
    [
      `every option in the group is disabled`,
      { options: all_disabled_options },
      `AllDisabled`,
      { disabled: true, label: `Select all` },
    ],
    [
      `a sibling group still has enabled options`,
      { options: all_disabled_options },
      `HasEnabled`,
      { disabled: false, label: `Select all` },
    ],
  ])(`group select-all when %s`, async (_desc, props, group, expected) => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: grouped_options, groupSelectAll: true, open: true, ...props },
    })
    await tick()

    const btn = group_select_all_btn(group)
    expect(btn?.disabled).toBe(expected.disabled)
    expect(btn?.textContent?.trim()).toBe(expected.label)
  })

  test(`group select-all partial fill fires onmaxreached with correct payload`, async () => {
    const onmaxreached_spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: grouped_options,
        groupSelectAll: true,
        selected: [grouped_options[0]],
        maxSelect: 2,
        open: true,
        onmaxreached: onmaxreached_spy,
      },
    })
    await tick()

    const genre_btn = find_group_header(`Genre`).querySelector<HTMLButtonElement>(
      `button.group-select-all`,
    )
    expect(genre_btn?.disabled).toBe(false)
    genre_btn?.click()
    await tick()

    expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(2)
    expect(onmaxreached_spy).toHaveBeenCalledTimes(1)
    expect(onmaxreached_spy).toHaveBeenCalledWith(
      expect.objectContaining({ maxSelect: 2 }),
    )
  })

  test.each([
    [
      `liGroupHeaderClass`,
      `custom-header-class`,
      (h: HTMLElement) => h.classList.contains(`custom-header-class`),
    ],
    [
      `liGroupHeaderStyle`,
      `background: red`,
      (h: HTMLElement) => h.style.background === `red`,
    ],
  ] as const)(
    `%s is applied to group headers`,
    async (prop_name, prop_value, check_fn) => {
      mount(MultiSelect, {
        target: document.body,
        props: { options: grouped_options, [prop_name]: prop_value, open: true },
      })
      await tick()

      const group_headers = document.querySelectorAll<HTMLElement>(
        `ul.options > li.group-header`,
      )
      expect(group_headers.length).toBeGreaterThan(0)
      group_headers.forEach((header) => expect(check_fn(header)).toBe(true))
    },
  )

  test(`options without group key work alongside grouped options`, async () => {
    const mixed_options = [
      `Plain Option 1`,
      { label: `Grouped A`, group: `Group` },
      `Plain Option 2`,
      { label: `Grouped B`, group: `Group` },
    ]

    mount(MultiSelect, {
      target: document.body,
      props: { options: mixed_options, open: true },
    })
    await tick()

    // Should have 1 group header
    const group_headers = document.querySelectorAll(`ul.options > li.group-header`)
    expect(group_headers).toHaveLength(1)

    // Should have all 4 selectable options
    const selectable_options = document.querySelectorAll(
      `ul.options > li:not(.group-header)`,
    )
    expect(selectable_options).toHaveLength(4)
  })

  test(`selecting options from groups works correctly`, async () => {
    const onchange_spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: { options: grouped_options, onchange: onchange_spy, open: true },
    })
    await tick()

    // Find and click a grouped option
    const rock_option = Array.from(
      document.querySelectorAll<HTMLElement>(`ul.options > li:not(.group-header)`),
    ).find((li) => li.textContent?.trim() === `Rock`)

    rock_option?.click()
    await tick()

    expect(onchange_spy).toHaveBeenCalledWith({
      option: { label: `Rock`, group: `Genre` },
      type: `add`,
    })
  })

  test.each([
    [
      `Genre`,
      undefined,
      (opts: { group?: string }[]) => opts.every((o) => o.group !== `Genre`),
    ],
    [
      `Key`,
      2,
      (opts: { group?: string }[]) =>
        opts.length === 2 && opts.every((o) => o.group !== `Key`),
    ],
  ] as const)(
    `selectAllOption skips collapsed %s group (maxSelect=%s)`,
    async (collapsed_group, maxSelect, validate_fn) => {
      const onselectAll_spy = vi.fn()
      mount(MultiSelect, {
        target: document.body,
        props: {
          options: grouped_options,
          collapsibleGroups: true,
          selectAllOption: true,
          maxSelect,
          onselectAll: onselectAll_spy,
          open: true,
        },
      })
      await tick()

      find_group_header(collapsed_group).click()
      await tick()

      const select_all_li = document.querySelector<HTMLElement>(
        `ul.options > li.select-all`,
      )
      select_all_li?.click()
      await tick()

      expect(onselectAll_spy).toHaveBeenCalledTimes(1)
      expect(validate_fn(onselectAll_spy.mock.calls[0][0].options)).toBe(true)
    },
  )

  test(`groupSelectAll skips disabled options`, async () => {
    const options_with_disabled = [
      { label: `Enabled 1`, group: `Test` },
      { label: `Disabled 1`, group: `Test`, disabled: true },
      { label: `Enabled 2`, group: `Test` },
      { label: `Disabled 2`, group: `Test`, disabled: true },
    ]

    const onselectAll_spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: options_with_disabled,
        groupSelectAll: true,
        onselectAll: onselectAll_spy,
        open: true,
      },
    })
    await tick()

    const test_header = find_group_header(`Test`)
    const select_all_btn = test_header.querySelector<HTMLElement>(
      `button.group-select-all`,
    )
    select_all_btn?.click()
    await tick()

    // Should only select non-disabled options
    expect(onselectAll_spy).toHaveBeenCalledTimes(1)
    const selected_options = onselectAll_spy.mock.calls[0][0].options
    expect(selected_options).toHaveLength(2)
    expect(selected_options.every((opt: { disabled?: boolean }) => !opt.disabled)).toBe(
      true,
    )
  })

  test(`groupSelectAll works on collapsed groups`, async () => {
    const onselectAll_spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: grouped_options,
        collapsibleGroups: true,
        groupSelectAll: true,
        onselectAll: onselectAll_spy,
        open: true,
      },
    })
    await tick()

    // Collapse the Genre group
    const genre_header = find_group_header(`Genre`)
    genre_header.click()
    await tick()

    // Verify group is collapsed (no Genre options visible)
    const visible_options = Array.from(
      document.querySelectorAll(`ul.options > li:not(.group-header):not(.select-all)`),
    )
    expect(
      [...visible_options].every(
        (li) =>
          !li.textContent?.includes(`Rock`) &&
          !li.textContent?.includes(`Electronic`) &&
          !li.textContent?.includes(`Jazz`),
      ),
    ).toBe(true)

    // Click the group's select all button (still visible even when collapsed)
    const select_all_btn = genre_header.querySelector<HTMLElement>(
      `button.group-select-all`,
    )
    expect(select_all_btn).toBeInstanceOf(HTMLButtonElement)
    select_all_btn?.click()
    await tick()

    // Should select ALL options in the collapsed group
    expect(onselectAll_spy).toHaveBeenCalledTimes(1)
    const selected_options = onselectAll_spy.mock.calls[0][0].options
    expect(selected_options).toHaveLength(3) // Rock, Electronic, Jazz
    expect(
      selected_options.every((opt: { group: string }) => opt.group === `Genre`),
    ).toBe(true)
  })

  test(`group order matches first occurrence in options array`, async () => {
    const ordered_options = [
      { label: `Z Item`, group: `Zebra` },
      { label: `A Item`, group: `Alpha` },
      { label: `Z Item 2`, group: `Zebra` },
      { label: `M Item`, group: `Middle` },
    ]

    mount(MultiSelect, {
      target: document.body,
      props: { options: ordered_options, open: true },
    })
    await tick()

    // Groups should appear in order of first occurrence: Zebra, Alpha, Middle
    expect(header_names()).toEqual([`Zebra`, `Alpha`, `Middle`])
  })

  test.each([
    [true, `button`, `0`, true],
    [false, `presentation`, `-1`, false],
  ] as const)(
    `group headers have correct a11y attrs when collapsibleGroups=%s`,
    async (collapsibleGroups, expected_role, expected_tabindex, has_aria_expanded) => {
      mount(MultiSelect, {
        target: document.body,
        props: { options: grouped_options, collapsibleGroups, open: true },
      })
      await tick()

      const group_headers = document.querySelectorAll(`ul.options > li.group-header`)
      expect(group_headers).toHaveLength(2) // else the loop below asserts nothing
      for (const header of group_headers) {
        expect(header.getAttribute(`role`)).toBe(expected_role)
        expect(header.getAttribute(`tabindex`)).toBe(expected_tabindex)
        expect(header.hasAttribute(`aria-expanded`)).toBe(has_aria_expanded)
        expect(header.getAttribute(`aria-label`)).toMatch(/^Group: /u)
      }

      // For collapsible, also verify aria-expanded toggles on click
      if (collapsibleGroups) {
        expect(group_headers[0].getAttribute(`aria-expanded`)).toBe(`true`)
        if (group_headers[0] instanceof HTMLElement) group_headers[0].click()
        await tick()
        expect(group_headers[0].getAttribute(`aria-expanded`)).toBe(`false`)
      }
    },
  )

  test(`ongroupToggle fires when group is collapsed/expanded`, async () => {
    const ongroupToggle_spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: grouped_options,
        collapsibleGroups: true,
        ongroupToggle: ongroupToggle_spy,
        open: true,
      },
    })
    await tick()

    const genre_header = find_group_header(`Genre`)
    genre_header.click()
    await tick()

    expect(ongroupToggle_spy).toHaveBeenCalledWith({ group: `Genre`, collapsed: true })

    // Click again to expand
    genre_header.click()
    await tick()

    expect(ongroupToggle_spy).toHaveBeenCalledWith({ group: `Genre`, collapsed: false })
    expect(ongroupToggle_spy).toHaveBeenCalledTimes(2)
  })

  test(`collapsedGroups prop controls initial collapsed state`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: grouped_options,
        collapsibleGroups: true,
        collapsedGroups: new Set([`Genre`]),
        open: true,
      },
    })
    await tick()

    // Genre group should be collapsed initially
    const genre_header = find_group_header(`Genre`)
    expect(genre_header.getAttribute(`aria-expanded`)).toBe(`false`)

    // Genre options should be hidden
    const rock_option = Array.from(
      document.querySelectorAll(`ul.options > li:not(.group-header)`),
    ).find((li) => li.textContent?.includes(`Rock`))
    expect(rock_option).toBeUndefined()

    // Key group should be expanded
    const key_header = find_group_header(`Key`)
    expect(key_header.getAttribute(`aria-expanded`)).toBe(`true`)
  })

  test.each([
    [`asc`, [`Alpha`, `Middle`, `Zebra`]],
    [`desc`, [`Zebra`, `Middle`, `Alpha`]],
    [
      (group_a: string, group_b: string) => group_a.length - group_b.length,
      [`C`, `BB`, `AAA`],
    ],
  ] as const)(
    `groupSortOrder=%s sorts groups correctly`,
    async (groupSortOrder, expected_order) => {
      // Use different options for custom function test (needs varying lengths)
      const options_for_sort =
        typeof groupSortOrder === `function`
          ? [
              { label: `Item 1`, group: `BB` },
              { label: `Item 2`, group: `AAA` },
              { label: `Item 3`, group: `C` },
            ]
          : [
              { label: `Z Item`, group: `Zebra` },
              { label: `A Item`, group: `Alpha` },
              { label: `M Item`, group: `Middle` },
            ]

      mount(MultiSelect, {
        target: document.body,
        props: { options: options_for_sort, groupSortOrder, open: true },
      })
      await tick()

      expect(header_names()).toEqual(expected_order)
    },
  )

  test.each([
    [`basic count`, {}, `(3)`],
    [
      `selected count with keepSelectedInDropdown`,
      {
        keepSelectedInDropdown: `checkboxes`,
        selected: [{ label: `Rock`, group: `Genre` }],
      } satisfies Partial<MultiSelectProps>,
      `(1/3)`,
    ],
  ])(`group count in header: %s`, async (_desc, extra_props, expected_count) => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: grouped_options, open: true, ...extra_props },
    })
    await tick()

    const genre_header = find_group_header(`Genre`)
    const count_span = genre_header.querySelector(`.group-count`)
    expect(count_span).toBeInstanceOf(HTMLSpanElement)
    expect(count_span?.textContent?.trim()).toBe(expected_count)
  })

  test.each([
    [`expands the matching group`, `Rock`, { group: `Genre`, collapsed: false }],
    // "C Major"/"D Minor" contain spaces, so a bare space fuzzy-matches them. The
    // has_search_text guard must stop the Key group expanding on whitespace-only input.
    [`ignores whitespace-only input`, ` `, null],
  ])(`searchExpandsCollapsedGroups %s`, async (_name, search, expected_toggle) => {
    const ongroupToggle_spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: grouped_options,
        collapsibleGroups: true,
        collapsedGroups: new Set([`Genre`, `Key`]), // both collapsed initially
        searchExpandsCollapsedGroups: true,
        ongroupToggle: ongroupToggle_spy,
        open: true,
      },
    })
    await tick()

    // both groups collapsed → only the ungrouped option is visible initially
    expect(
      document.querySelectorAll(
        `ul.options > li:not(.group-header):not(.select-all):not(.user-msg)`,
      ),
    ).toHaveLength(1)

    const input = get_input()
    await type_search_text(search, input)

    if (expected_toggle) {
      expect(ongroupToggle_spy).toHaveBeenCalledWith(expected_toggle)
    } else expect(ongroupToggle_spy).not.toHaveBeenCalled()
  })

  test.each([
    [
      `groupSelectAll`,
      { groupSelectAll: true },
      `button.group-select-all`,
      [`Option 1`, `Option 2`, `Option 3`],
    ],
    [
      `selectAllOption`,
      { selectAllOption: true },
      `li.select-all`,
      [`Option 1`, `Option 2`, `Option 3`],
    ],
  ] as const)(
    `%s respects maxOptions limit`,
    async (_name, props, selector, expected_labels) => {
      const many_options = [
        { label: `Option 1`, group: `TestGroup` },
        { label: `Option 2`, group: `TestGroup` },
        { label: `Option 3`, group: `TestGroup` },
        { label: `Option 4`, group: `TestGroup` },
        { label: `Option 5`, group: `TestGroup` },
      ]

      const onselectAll_spy = vi.fn()
      mount(MultiSelect, {
        target: document.body,
        props: {
          options: many_options,
          maxOptions: 3,
          onselectAll: onselectAll_spy,
          open: true,
          ...props,
        },
      })
      await tick()

      // Verify only 3 options are rendered
      expect(
        document.querySelectorAll(`ul.options > li:not(.group-header):not(.select-all)`),
      ).toHaveLength(3)

      // Click select all (group or global)
      const select_btn = selector.includes(`group`)
        ? find_group_header(`TestGroup`).querySelector(selector)
        : document.querySelector(selector)
      if (select_btn instanceof HTMLElement) select_btn.click()
      await tick()

      expect(onselectAll_spy).toHaveBeenCalledTimes(1)
      const selected = onselectAll_spy.mock.calls[0][0].options
      expect(selected.map((opt: { label: string }) => opt.label)).toEqual(expected_labels)
    },
  )

  test.each([
    [`group name fuzzy match`, `Python`, {}, [`Django`, `Flask`]],
    [`substring match with fuzzy=false`, `script`, { fuzzy: false }, [`React`, `Vue`]],
  ] as const)(
    `searchMatchesGroups shows options for %s`,
    async (_desc, search_text, extra_props, expected_labels) => {
      const options_with_groups = [
        { label: `React`, group: `JavaScript` },
        { label: `Vue`, group: `JavaScript` },
        { label: `Django`, group: `Python` },
        { label: `Flask`, group: `Python` },
      ]

      mount(MultiSelect, {
        target: document.body,
        props: {
          options: options_with_groups,
          searchMatchesGroups: true,
          open: true,
          ...extra_props,
        },
      })

      const input = get_input()
      await type_search_text(search_text, input)

      const visible_options = document.querySelectorAll(
        `ul.options > li:not(.group-header):not(.select-all)`,
      )
      const labels = Array.from(visible_options).map((li) => li.textContent?.trim())
      expect(labels).toEqual(expected_labels)
    },
  )

  test(`keyboardExpandsCollapsedGroups expands groups on arrow navigation`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: grouped_options,
        collapsibleGroups: true,
        keyboardExpandsCollapsedGroups: true,
        open: true,
      },
    })
    await tick()

    // First, collapse the Genre group manually
    const genre_header = find_group_header(`Genre`)
    genre_header.click()
    await tick()

    // Genre is collapsed, so its options should be hidden
    const visible_options = document.querySelectorAll(
      `ul.options > li:not(.group-header):not(.select-all)`,
    )
    const rock_visible = Array.from(visible_options).some((li) =>
      li.textContent?.includes(`Rock`),
    )
    expect(rock_visible).toBe(false)

    // Press arrow down to trigger keyboard navigation
    const input = get_input()
    input.focus()
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()

    // Genre group should now be expanded (Rock should be visible)
    const options_after = document.querySelectorAll(
      `ul.options > li:not(.group-header):not(.select-all)`,
    )
    const rock_visible_after = Array.from(options_after).some((li) =>
      li.textContent?.includes(`Rock`),
    )
    expect(rock_visible_after).toBe(true)
  })

  test(`stickyGroupHeaders adds sticky class to group headers`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: grouped_options, stickyGroupHeaders: true, open: true },
    })
    await tick()

    const group_headers = document.querySelectorAll(`ul.options > li.group-header`)
    expect(group_headers).toHaveLength(2) // else the loop below asserts nothing
    for (const header of group_headers) {
      expect(header.classList.contains(`sticky`)).toBe(true)
    }
  })

  test(`collapseAllGroups and expandAllGroups functions are bindable`, async () => {
    const oncollapseAll_spy = vi.fn()
    const onexpandAll_spy = vi.fn()
    const props = $state<MultiSelectProps>({
      options: grouped_options,
      collapsibleGroups: true,
      oncollapseAll: oncollapseAll_spy,
      onexpandAll: onexpandAll_spy,
      open: true,
      collapseAllGroups: undefined,
      expandAllGroups: undefined,
    })
    mount(MultiSelect, { target: document.body, props })
    await tick()

    expect(props.collapseAllGroups).toBeInstanceOf(Function)
    expect(props.expandAllGroups).toBeInstanceOf(Function)

    props.collapseAllGroups?.()
    await tick()

    expect(oncollapseAll_spy).toHaveBeenCalledTimes(1)
    expect(oncollapseAll_spy.mock.calls[0][0].groups).toContain(`Genre`)
    expect(oncollapseAll_spy.mock.calls[0][0].groups).toContain(`Key`)

    const visible_after_collapse = document.querySelectorAll(
      `ul.options > li:not(.group-header):not(.select-all)`,
    )
    expect(visible_after_collapse).toHaveLength(1) // the ungrouped option is all that is left

    props.expandAllGroups?.()
    await tick()

    expect(onexpandAll_spy).toHaveBeenCalledTimes(1)

    const visible_after_expand = document.querySelectorAll(
      `ul.options > li:not(.group-header):not(.select-all)`,
    )
    expect(visible_after_expand).toHaveLength(6)
  })

  test(`groupSelectAll toggles to deselect when all group options are selected`, async () => {
    const onremoveAll_spy = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: grouped_options,
        groupSelectAll: true,
        keepSelectedInDropdown: `checkboxes`,
        onremoveAll: onremoveAll_spy,
        open: true,
      },
    })
    await tick()

    const genre_header = find_group_header(`Genre`)
    const select_btn = genre_header.querySelector<HTMLButtonElement>(
      `button.group-select-all`,
    )

    expect(select_btn?.textContent?.trim()).toBe(`Select all`)

    select_btn?.click()
    await tick()

    expect(select_btn?.textContent?.trim()).toBe(`Deselect all`)
    expect(select_btn?.classList.contains(`deselect`)).toBe(true)

    select_btn?.click()
    await tick()

    expect(onremoveAll_spy).toHaveBeenCalledTimes(1)
    const removed = onremoveAll_spy.mock.calls[0][0].options
    expect(removed).toHaveLength(3) // Rock, Electronic, Jazz

    expect(select_btn?.textContent?.trim()).toBe(`Select all`)
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

    mount(MultiSelect, { target: document.body, props })
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

  test(`custom open shortcut opens the dropdown`, async () => {
    const props = $state<MultiSelectProps>({
      options: [`a`, `b`, `c`],
      shortcuts: { open: `ctrl+o` },
      open: true, // Start with dropdown open
    })

    mount(MultiSelect, { target: document.body, props })
    await tick()

    const input = await focus_input()

    // Close dropdown via Escape (keeps focus on input)
    input.dispatchEvent(fresh_key(`Escape`))
    await tick()
    expect(props.open).toBe(false) // Verify dropdown is closed

    // Now use open shortcut to reopen
    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `o`, ctrlKey: true, bubbles: true }),
    )
    await tick()

    expect(props.open).toBe(true) // Verify shortcut reopened dropdown
  })

  test(`custom close shortcut closes the dropdown`, async () => {
    const { props } = await test_shortcut(
      { shortcuts: { close: `ctrl+w` } },
      { key: `w`, ctrlKey: true },
    )
    expect(props.open).toBe(false)
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

      mount(MultiSelect, { target: document.body, props })
      await tick()

      const input = await focus_input()

      input.dispatchEvent(new KeyboardEvent(`keydown`, { key, bubbles: true }))
      await tick()

      expect(props.open).toBe(expected_open)
      expect(props.selected).toEqual(expected_selected)
    },
  )
})

describe(`onsearch event`, () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test(`fires debounced when search text changes (including clearing)`, async () => {
    const onsearch_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2, 3, 10, 20, 30], onsearch: onsearch_spy },
    })

    const input = await focus_input()

    await type_search_text(`1`, input)

    // Should not fire immediately due to debounce
    expect(onsearch_spy).not.toHaveBeenCalled()

    // Advance timers past debounce (150ms)
    await vi.advanceTimersByTimeAsync(200)

    expect(onsearch_spy).toHaveBeenCalledTimes(1)
    expect(onsearch_spy).toHaveBeenCalledWith({
      searchText: `1`,
      matchingOptions: [1, 10],
    })

    // Clear the search - should also fire
    await type_search_text(``, input)
    await vi.advanceTimersByTimeAsync(200)

    expect(onsearch_spy).toHaveBeenCalledTimes(2)
    expect(onsearch_spy).toHaveBeenNthCalledWith(2, {
      searchText: ``,
      matchingOptions: [1, 2, 3, 10, 20, 30],
    })
  })

  test(`does not fire on initial mount`, async () => {
    const onsearch_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2, 3], onsearch: onsearch_spy },
    })

    await tick()

    // Advance timers past the debounce period
    await vi.advanceTimersByTimeAsync(200)

    expect(onsearch_spy).not.toHaveBeenCalled()
  })

  test(`debounce resets when typing continues`, async () => {
    const onsearch_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: { options: [`apple`, `apricot`, `banana`], onsearch: onsearch_spy },
    })

    const input = await focus_input()

    await type_search_text(`a`, input)

    // only part of the 150ms debounce, so nothing has fired yet
    await vi.advanceTimersByTimeAsync(100)

    // Type another character before debounce completes
    await type_search_text(`ap`, input)

    await vi.advanceTimersByTimeAsync(200)

    // Should only fire once with final value
    expect(onsearch_spy).toHaveBeenCalledTimes(1)
    expect(onsearch_spy).toHaveBeenCalledWith({
      searchText: `ap`,
      matchingOptions: [`apple`, `apricot`],
    })
  })
})

describe(`onmaxreached event`, () => {
  const object_opts = [
    { label: `Apple`, value: 1 },
    { label: `Banana`, value: 2 },
    { label: `Cherry`, value: 3 },
  ]
  test.each<{
    desc: string
    options: Option[]
    selected: Option[]
    trigger: `click` | `keyboard`
    attempted: Option
  }>([
    {
      desc: `click, primitives`,
      options: [1, 2, 3, 4],
      selected: [1, 2],
      trigger: `click`,
      attempted: 3,
    },
    {
      desc: `keyboard Enter, primitives`,
      options: [1, 2, 3, 4],
      selected: [1, 2],
      trigger: `keyboard`,
      attempted: 3,
    },
    {
      desc: `click, object options`,
      options: object_opts,
      selected: [object_opts[0], object_opts[1]],
      trigger: `click`,
      attempted: object_opts[2],
    },
  ])(
    `fires when adding beyond maxSelect ($desc)`,
    async ({ options, selected, trigger, attempted }) => {
      const onmaxreached_spy = vi.fn()
      mount(MultiSelect, {
        target: document.body,
        props: { options, maxSelect: 2, selected, onmaxreached: onmaxreached_spy },
      })
      const input = await focus_input()

      // try to add a 3rd option when maxSelect is 2, via click or keyboard
      // Fresh events avoid cross-test pollution from retained event flags.
      if (trigger === `keyboard`) {
        input.dispatchEvent(fresh_key(`ArrowDown`))
        input.dispatchEvent(fresh_key(`Enter`))
      } else doc_query(`ul.options li:nth-child(1)`).click()
      await tick()

      expect(onmaxreached_spy).toHaveBeenCalledTimes(1)
      expect(onmaxreached_spy).toHaveBeenCalledWith({
        selected,
        maxSelect: 2,
        attemptedOption: attempted,
      })
    },
  )

  test.each([
    { maxSelect: 3, selected: [1], desc: `under limit` },
    { maxSelect: 1, selected: [1], desc: `maxSelect=1 (replace mode)` },
    { maxSelect: null, selected: [1, 2, 3, 4], desc: `maxSelect=null (unlimited)` },
  ])(`does not fire when $desc`, async ({ maxSelect, selected }) => {
    const onmaxreached_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [1, 2, 3, 4, 5],
        maxSelect,
        selected,
        onmaxreached: onmaxreached_spy,
      },
    })

    await focus_input()

    doc_query(`ul.options li:nth-child(1)`).click()
    await tick()

    expect(onmaxreached_spy).not.toHaveBeenCalled()
  })
})

describe(`onduplicate event`, () => {
  test.each([
    { duplicates: true, desc: `duplicates=true allows adding same option` },
    { duplicates: false, desc: `adding different option (not a duplicate)` },
  ])(`does not fire when $desc`, async ({ duplicates }) => {
    const onduplicate_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [1, 2, 3],
        duplicates,
        selected: [1],
        onduplicate: onduplicate_spy,
      },
    })

    await focus_input()

    doc_query(`ul.options li:nth-child(1)`).click()
    await tick()

    expect(onduplicate_spy).not.toHaveBeenCalled()
  })

  // Tests duplicate detection via allowUserOptions for both string and object options
  // For object options, label-based detection fires even when keys differ (e.g., typing "Apple"
  // when {label: "Apple", value: 1} is selected) - prevents confusing UX
  test.each<{
    desc: string
    options: Option[]
    selected: Option[]
    typed_value: string
    expected: { option: unknown }
  }>([
    {
      // user typed "1" stays a string (get_label stringifies primitives), so numeric
      // coercion doesn't apply and detection is label-based
      desc: `numeric options coerced to string`,
      options: [1, 2, 3],
      selected: [1],
      typed_value: `1`,
      expected: { option: `1` },
    },
    {
      desc: `string options`,
      options: [`apple`, `banana`, `cherry`],
      selected: [`apple`],
      typed_value: `apple`,
      expected: { option: `apple` },
    },
    {
      desc: `object options (label match)`,
      options: [
        { label: `Apple`, value: 1 },
        { label: `Banana`, value: 2 },
      ],
      selected: [{ label: `Apple`, value: 1 }],
      typed_value: `Apple`,
      expected: { option: `Apple` },
    },
  ])(
    `fires with $desc via allowUserOptions`,
    async ({ options, selected, typed_value, expected }) => {
      const onduplicate_spy = vi.fn()

      mount(MultiSelect, {
        target: document.body,
        props: {
          options,
          duplicates: false,
          selected,
          onduplicate: onduplicate_spy,
          allowUserOptions: true,
        },
      })

      const input = await focus_input()

      await type_search_text(typed_value, input)

      // Fresh Enter event per case: defaultPrevented persists across re-dispatch
      // and would suppress later iterations.
      input.dispatchEvent(fresh_key(`Enter`))
      await tick()

      expect(onduplicate_spy).toHaveBeenCalledTimes(1)
      expect(onduplicate_spy).toHaveBeenCalledWith(expected)
    },
  )

  test(`fires when both maxSelect reached AND duplicate attempted`, async () => {
    const onduplicate_spy = vi.fn()
    const onmaxreached_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [1, 2, 3],
        duplicates: false,
        maxSelect: 2,
        selected: [1, 2],
        onduplicate: onduplicate_spy,
        onmaxreached: onmaxreached_spy,
        allowUserOptions: true,
      },
    })

    const input = await focus_input()

    // Type "1" which is a duplicate AND maxSelect is reached
    await type_search_text(`1`, input)
    input.dispatchEvent(fresh_key(`Enter`))
    await tick()

    // Both events should fire
    expect(onmaxreached_spy).toHaveBeenCalledTimes(1)
    expect(onduplicate_spy).toHaveBeenCalledTimes(1)
  })
})

describe(`onactivate event`, () => {
  test.each([
    { key: `ArrowDown`, options: [1, 2, 3], expected: { option: 1, index: 0 } },
    { key: `ArrowUp`, options: [1, 2, 3], expected: { option: 3, index: 2 } },
    {
      key: `ArrowDown`,
      options: [{ label: `A`, value: 1 }],
      expected: { option: { label: `A`, value: 1 }, index: 0 },
    },
  ])(`fires on $key with $options.length options`, async ({ key, options, expected }) => {
    const onactivate_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: { options, onactivate: onactivate_spy, open: true },
    })

    const input = await focus_input()

    input.dispatchEvent(new KeyboardEvent(`keydown`, { key, bubbles: true }))
    await tick()

    expect(onactivate_spy).toHaveBeenCalledTimes(1)
    expect(onactivate_spy).toHaveBeenCalledWith(expected)
  })

  test(`pointer and focus activation do not fire onactivate`, async () => {
    const onactivate_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2, 3], onactivate: onactivate_spy, open: true },
    })

    await focus_input()

    doc_query(`ul.options`).dispatchEvent(new MouseEvent(`mousemove`, { bubbles: true }))
    const option3 = doc_query(`ul.options li:nth-child(3)`)
    option3.dispatchEvent(mouseover)
    await tick()
    expect(doc_query(`ul.options li.active`).textContent?.trim()).toBe(`3`)

    const option2 = doc_query(`ul.options li:nth-child(2)`)
    option2.dispatchEvent(new FocusEvent(`focus`, { bubbles: true }))
    await tick()
    expect(doc_query(`ul.options li.active`).textContent?.trim()).toBe(`2`)

    expect(onactivate_spy).not.toHaveBeenCalled()
  })

  test(`wrap-around at end navigates to start`, async () => {
    const onactivate_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2, 3], onactivate: onactivate_spy, open: true },
    })

    const input = await focus_input()

    // Navigate to last option
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()

    // One more ArrowDown should wrap to first
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()

    expect(onactivate_spy).toHaveBeenCalledTimes(4)
    expect(onactivate_spy).toHaveBeenNthCalledWith(3, { option: 3, index: 2 })
    expect(onactivate_spy).toHaveBeenNthCalledWith(4, { option: 1, index: 0 })
  })

  test(`does not fire when toggling user message with no matching options`, async () => {
    // When there are no matching options and only the user message is shown,
    // arrow navigation toggles the user message active state but doesn't fire onactivate
    // because the function returns early before reaching the onactivate call
    const onactivate_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [],
        onactivate: onactivate_spy,
        allowUserOptions: true,
        createOptionMsg: `Create this option...`,
        open: true,
      },
    })

    const input = await focus_input()

    // Type something to show the user message
    await type_search_text(`new option`, input)

    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()

    expect(onactivate_spy).not.toHaveBeenCalled()
  })

  test(`does not fire when no options match and noMatchingOptionsMsg disabled`, async () => {
    const onactivate_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [1, 2, 3],
        noMatchingOptionsMsg: ``, // Disable "no matching" message
        allowUserOptions: false,
        onactivate: onactivate_spy,
        open: true,
      },
    })

    const input = await focus_input()

    // Navigate to first option (sets activeIndex = 0)
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    expect(onactivate_spy).toHaveBeenCalledTimes(1)
    expect(onactivate_spy).toHaveBeenCalledWith({ option: 1, index: 0 })

    // Type something that filters all options away
    await type_search_text(`xyz`, input)

    // Press ArrowDown again - should be a no-op since nothing to navigate
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()

    // Should only have 1 call (from first ArrowDown), not 2
    expect(onactivate_spy).toHaveBeenCalledTimes(1)
  })
})

describe(`history / undo-redo`, () => {
  test(`undo/redo bound by default, canUndo/canRedo initially false`, async () => {
    // keys must exist on the $state props for the bindables to write back;
    // canUndo/canRedo start true to verify the component resets them to false
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3],
      // no history prop - enabled by default
      undo: undefined,
      redo: undefined,
      canUndo: true,
      canRedo: true,
    })
    mount(MultiSelect, { target: document.body, props })
    await tick()

    expect(props.undo).toBeInstanceOf(Function)
    expect(props.redo).toBeInstanceOf(Function)
    expect(props.canUndo).toBe(false)
    expect(props.canRedo).toBe(false)
    expect(props.undo?.()).toBe(false) // nothing to undo
    expect(props.redo?.()).toBe(false) // nothing to redo
  })

  // an empty stack already returns false, so these build real history first - otherwise
  // move_history bails on next_index < 0 and never reaches the guard under test
  test.each([`undo`, `redo`] as const)(`%s is a no-op while disabled`, async (method) => {
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3],
      selected: [],
      history: true,
      undo: undefined,
      redo: undefined,
      canUndo: false,
      canRedo: false,
    })
    mount(MultiSelect, { target: document.body, props })
    await tick()
    props.selected = [1]
    await tick()
    if (method === `redo`) {
      props.undo?.() // leaves an undone state that redo could restore
      await tick()
    }
    const selected_before = [...(props.selected ?? [])]

    props.disabled = true
    await tick()

    expect(props[method]?.()).toBe(false)
    expect(props.selected).toEqual(selected_before)
    expect(props.canUndo).toBe(false)
    expect(props.canRedo).toBe(false)
  })

  // false and 0 hit different branches of the max_history derivation; enabled values
  // (true, positive integers) are covered by the undo/redo behavior tests below
  test.each([false, 0] as const)(
    `history=%s records nothing, leaving undo bound but inert`,
    async (history_val) => {
      const props = $state<MultiSelectProps>({
        options: [1, 2, 3],
        selected: [],
        history: history_val,
        undo: undefined,
        canUndo: false,
      })
      mount(MultiSelect, { target: document.body, props })
      await tick()
      props.selected = [1]
      await tick()

      expect(props.canUndo).toBe(false)
      expect(props.undo).toBeInstanceOf(Function)
      expect(props.undo?.()).toBe(false)
      expect(props.selected).toEqual([1]) // undo did not roll the change back
    },
  )

  test.each([
    [`default shortcuts undo`, {}, `z`, { ctrlKey: true }, true],
    [
      `custom shortcuts undo`,
      { shortcuts: { undo: `alt+u` } },
      `u`,
      { altKey: true },
      true,
    ],
    [
      `disabled shortcuts ignore keypress`,
      { shortcuts: { undo: null } },
      `z`,
      {
        ctrlKey: true,
      },
      false,
    ],
  ])(`%s`, async (_desc, extra, key, modifiers, should_undo) => {
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3],
      history: true,
      selected: [],
      ...extra,
    })
    mount(MultiSelect, { target: document.body, props })
    await tick() // Select first option so there's something to undo
    document.querySelector<HTMLElement>(`ul.options > li`)?.click()
    await tick()
    expect(props.selected).toHaveLength(1)

    // Use autocomplete input (the interactive one), not the hidden form-control
    const input = get_input()
    input.focus()
    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key, bubbles: true, ...modifiers }),
    )
    await tick()

    expect(props.selected).toHaveLength(should_undo ? 0 : 1)
  })

  test.each([
    [
      `object options`,
      [
        { label: `A`, value: 1 },
        { label: `B`, value: 2 },
      ],
      {},
    ],
    [`maxSelect=1`, [1, 2, 3], { maxSelect: 1 }],
    [`sortSelected`, [3, 1, 2], { sortSelected: true }],
    [`duplicates`, [1, 2, 3], { duplicates: true }],
    [`allowUserOptions`, [1, 2, 3], { allowUserOptions: true }],
    [`minSelect`, [1, 2, 3], { minSelect: 1 }],
    [
      `grouped`,
      [
        { label: `A`, group: `G1` },
        { label: `B`, group: `G2` },
      ],
      {},
    ],
  ])(`compatible with %s`, async (_desc, options, extra) => {
    const props = $state<MultiSelectProps>({
      options,
      history: true,
      selected: [],
      ...extra,
    })
    mount(MultiSelect, { target: document.body, props })
    await tick()

    // Select first selectable option (skip group headers)
    // A missing row is a failure, not a reason to silently skip a compatibility case.
    doc_query(`ul.options > li:not(.group-header)`).click()
    await tick()
    expect(props.selected?.length).toBeGreaterThan(0)

    // Undo via Ctrl+Z should restore previous state
    const input = get_input()
    input.focus()
    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `z`, ctrlKey: true, bubbles: true }),
    )
    await tick()
    expect(props.selected).toEqual([])
  })

  test(`history isolated per component instance`, async () => {
    const [div1, div2] = [document.createElement(`div`), document.createElement(`div`)]
    document.body.append(div1, div2)

    const props_1 = $state<MultiSelectProps>({
      options: [1, 2],
      selected: [],
      history: true,
      undo: undefined,
    })
    const props_2 = $state<MultiSelectProps>({
      options: [`a`, `b`],
      selected: [],
      history: true,
      undo: undefined,
      canUndo: false,
    })
    mount(MultiSelect, { target: div1, props: props_1 })
    mount(MultiSelect, { target: div2, props: props_2 })
    await tick()
    props_1.selected = [1]
    props_2.selected = [`a`]
    await tick()

    props_1.undo?.()
    await tick()

    expect(props_1.selected).toEqual([])
    // the other instance keeps both its selection and its own undoable step
    expect(props_2.selected).toEqual([`a`])
    expect(props_2.canUndo).toBe(true)
  })

  test(`undo restores previous selection state, redo restores undone state`, async () => {
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3],
      history: true,
      selected: [],
      undo: undefined,
      redo: undefined,
      canUndo: false,
      canRedo: false,
    })
    mount(MultiSelect, { target: document.body, props })
    await tick()

    expect(props.selected).toEqual([])
    expect(props.canUndo).toBe(false)
    expect(props.canRedo).toBe(false)

    await focus_input()
    const first_option = doc_query(`ul.options li`)
    first_option.click()
    await tick()

    expect(props.selected).toEqual([1])
    expect(props.canUndo).toBe(true)
    expect(props.canRedo).toBe(false)

    expect(props.undo?.()).toBe(true)
    await tick()
    expect(props.selected).toEqual([])
    expect(props.canUndo).toBe(false)
    expect(props.canRedo).toBe(true)

    // Calling undo again when nothing to undo should return false and not change state
    expect(props.undo?.()).toBe(false)
    await tick()
    expect(props.selected).toEqual([]) // state unchanged

    expect(props.redo?.()).toBe(true)
    await tick()
    expect(props.selected).toEqual([1])
    expect(props.canUndo).toBe(true)
    expect(props.canRedo).toBe(false)
  })

  test(`undo and redo callbacks receive changes and new actions clear redo`, async () => {
    const onundo = vi.fn()
    const onredo = vi.fn()
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3],
      history: true,
      onundo,
      onredo,
      selected: [],
      undo: undefined,
      redo: undefined,
      canRedo: false,
    })
    mount(MultiSelect, { target: document.body, props })
    await tick()

    const click_option = async (label: string) => {
      const option_to_click = [
        ...document.querySelectorAll<HTMLLIElement>(`ul.options > li`),
      ].find((option) => option.textContent?.trim() === label)
      if (!option_to_click) throw new Error(`option ${label} not found`)
      option_to_click.click()
      await tick()
    }

    await click_option(`1`)
    await click_option(`2`)
    expect(props.selected).toEqual([1, 2])

    expect(props.undo?.()).toBe(true)
    await tick()
    expect(props.selected).toEqual([1])
    expect(props.canRedo).toBe(true)
    expect(onundo).toHaveBeenCalledWith({ previous: [1, 2], current: [1] })

    expect(props.redo?.()).toBe(true)
    await tick()
    expect(props.selected).toEqual([1, 2])
    expect(onredo).toHaveBeenCalledWith({ previous: [1], current: [1, 2] })

    expect(props.undo?.()).toBe(true)
    await tick()
    await click_option(`3`)
    expect(props.selected).toEqual([1, 3])
    expect(props.canRedo).toBe(false)
    expect(props.redo?.()).toBe(false)
  })

  test(`preselected values are correctly tracked as initial state`, async () => {
    // Regression: prev_selected must sync to initial selected on mount,
    // otherwise undo after deselect restores [] instead of preselected state
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3],
      history: true,
      selected: [1, 2],
      undo: undefined,
    })
    mount(MultiSelect, { target: document.body, props })
    await tick()

    // Remove one item, then undo - should restore [1, 2], not []
    doc_query(`ul.selected li button.remove`).click()
    await tick()
    expect(props.selected).toEqual([2])

    props.undo?.()
    await tick()
    expect(props.selected).toEqual([1, 2])
  })

  test(`history=N caps the undo stack at N states`, async () => {
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3, 4],
      selected: [],
      history: 2,
      canUndo: false,
      undo: undefined, // key must exist for the bindable to write back
    })
    mount(MultiSelect, { target: document.body, props })
    await tick()

    // three selection changes with history=2: only the last two states survive
    for (const selection of [[1], [1, 2], [1, 2, 3]]) {
      props.selected = selection
      await tick()
    }

    expect(props.canUndo).toBe(true)
    expect(props.undo?.()).toBe(true)
    await tick()
    expect(props.selected).toEqual([1, 2])
    // the [1] and [] states were trimmed away — no second undo
    expect(props.canUndo).toBe(false)
    expect(props.undo?.()).toBe(false)
  })
})

// Regression test for issue #391: case-variant labels should not crash
// https://github.com/janosh/svelte-widgets/issues/391
describe(`case-variant labels (issue #391)`, () => {
  const object_options = [
    { label: `pd`, value: `uuid-1` },
    { label: `PD`, value: `uuid-2` },
    { label: `Pd`, value: `uuid-3` },
  ]

  // Would crash before fix due to duplicate keys in keyed {#each}
  test.each([
    { desc: `object options`, options: object_options },
    { desc: `string options`, options: [`apple`, `Apple`, `APPLE`] },
  ])(`renders all $desc with case-variant labels`, ({ options }) => {
    mount(MultiSelect, { target: document.body, props: { options } })
    const items = document.querySelectorAll(`ul.options > li`)
    expect(items).toHaveLength(3)
  })

  test(`can select multiple case-variant options`, async () => {
    const props = $state<MultiSelectProps>({ options: object_options, selected: [] })
    mount(MultiSelect, { target: document.body, props })

    for (const li of document.querySelectorAll(`ul.options > li`)) {
      if (li instanceof HTMLElement) li.click()
      await tick()
    }

    expect(props.selected).toHaveLength(3)
    expect(props.selected?.map((opt) => get_label(opt))).toEqual([`pd`, `PD`, `Pd`])
  })
})

describe(`duplicates prop variants`, () => {
  test.each([
    {
      duplicates: false,
      typed: `apple`,
      expect_blocked: false,
      desc: `false (default): case variants allowed`,
    },
    {
      duplicates: `case-insensitive`,
      typed: `APPLE`, // uppercase to test .toLowerCase()
      expect_blocked: true,
      desc: `'case-insensitive': case variants blocked`,
    } satisfies Pick<MultiSelectProps, `duplicates`> & {
      typed: string
      expect_blocked: boolean
      desc: string
    },
  ])(`duplicates=$desc`, async ({ duplicates, typed, expect_blocked }) => {
    const onduplicate_spy = vi.fn()
    const props = $state<MultiSelectProps>({
      options: [`Apple`, `apple`, `APPLE`],
      selected: [`Apple`],
      allowUserOptions: true,
      duplicates,
      onduplicate: onduplicate_spy,
    })
    mount(MultiSelect, { target: document.body, props })

    const input = await focus_input()

    await type_search_text(typed, input)
    input.dispatchEvent(fresh_key(`Enter`))
    await tick()

    if (expect_blocked) {
      expect(onduplicate_spy).toHaveBeenCalledTimes(1)
      expect(props.selected).not.toContain(typed)
    } else {
      expect(onduplicate_spy).not.toHaveBeenCalled()
      expect(props.selected).toContain(typed)
    }
  })

  test(`duplicates='case-insensitive': shows duplicate message`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [`Apple`, `Banana`],
        selected: [`Apple`],
        duplicates: `case-insensitive`,
        duplicateOptionMsg: `Already selected`,
      },
    })

    const input = await focus_input()

    await type_search_text(`apple`, input)

    expect(document.querySelector(`ul.options li.user-msg`)?.textContent).toContain(
      `Already selected`,
    )
  })

  test(`same-label dropdown options respect duplicate rules`, async () => {
    // Issue: label check was blocking dropdown options even when values differ
    // The is_from_options check should skip label-based duplicate detection for dropdown items
    const options = [1, 2, 3].map((value) => ({
      label: `apple`,
      selectedTitle: `Already selected`,
      value,
    }))

    const onadd_spy = vi.fn()
    const onduplicate_spy = vi.fn()

    mount(MultiSelect, {
      target: document.body,
      props: {
        options,
        selected: [options[0]], // preselect first option
        onadd: onadd_spy,
        onduplicate: onduplicate_spy,
      },
    })

    await focus_input()

    // the two unselected options remain, sharing the selected one's label
    const visible_options = document.querySelectorAll(`ul.options > li`)
    expect(visible_options).toHaveLength(2)
    expect(document.querySelectorAll(`ul.options > li.selected`)).toHaveLength(0)
    // a different value, so this must add rather than register a duplicate
    if (visible_options[0] instanceof HTMLElement) visible_options[0].click()
    await tick()

    expect(onduplicate_spy).not.toHaveBeenCalled()
    expect(onadd_spy).toHaveBeenCalledTimes(1)

    document.body.innerHTML = ``
    mount(MultiSelect, {
      target: document.body,
      props: { options, selected: [options[0]], duplicates: `case-insensitive` },
    })

    get_input().focus()
    await tick()

    expect(
      document.querySelectorAll(`ul.options > li.selected[title="Already selected"]`),
    ).toHaveLength(3)
  })
})

test(`dropdown has no li children when all user-created options are selected`, async () => {
  mount(MultiSelect, {
    target: document.body,
    props: {
      allowUserOptions: `append`,
      noMatchingOptionsMsg: ``,
      createOptionMsg: null,
    },
  })

  const input = get_input()
  await type_search_text(`tag1`, input)
  input.dispatchEvent(fresh_key(`Enter`))
  await tick()

  await type_search_text(`tag2`, input)
  input.dispatchEvent(fresh_key(`Enter`))
  await tick()

  input.focus()
  await tick()
  const items = document.querySelectorAll(`ul.options > li`)
  expect(items).toHaveLength(0)
})

// === parse_paste ===

function make_paste_event(text: string): ClipboardEvent {
  const data_transfer = new DataTransfer()
  data_transfer.setData(`text/plain`, text)
  const event = new ClipboardEvent(`paste`, { bubbles: true, cancelable: true })
  Object.assign(event, { clipboardData: data_transfer })
  return event
}

// helper: mount MultiSelect, paste text, return spies and props
async function paste_into(extra_props: Partial<MultiSelectProps>, paste_text: string) {
  const spies = {
    onadd: vi.fn(),
    oncreate: vi.fn(),
    onchange: vi.fn(),
    onmaxreached: vi.fn(),
    onduplicate: vi.fn(),
    onparsed_paste: vi.fn(),
  }
  const props = $state<MultiSelectProps>({
    parse_paste: (text: string) => text.split(`,`),
    ...spies,
    ...extra_props,
  })
  mount(MultiSelect, { target: document.body, props })
  const input = get_input()
  const event = make_paste_event(paste_text)
  input.dispatchEvent(event)
  // No macrotask wait: sync-oncreate paste must complete synchronously. handle_paste
  // only awaits add() when an async oncreate suspends.
  await tick()
  return { ...spies, props, event }
}

describe(`parse_paste`, () => {
  test(`splits pasted text into multiple selected options`, async () => {
    const { onadd, event } = await paste_into(
      { options: [`alpha`, `beta`, `gamma`] },
      `alpha,beta`,
    )
    expect(event.defaultPrevented).toBe(true)
    expect(onadd).toHaveBeenCalledTimes(2)
    expect(onadd).toHaveBeenCalledWith(expect.objectContaining({ option: `alpha` }))
    expect(onadd).toHaveBeenCalledWith(expect.objectContaining({ option: `beta` }))
  })

  test(`fires oncreate for each created option with allowUserOptions`, async () => {
    const { oncreate, onadd } = await paste_into(
      {
        options: [`existing`],
        allowUserOptions: true,
        parse_paste: (text: string) => text.split(/[,\s]+/u).filter(Boolean),
      },
      `new1,new2,new3`,
    )
    expect(oncreate).toHaveBeenCalledTimes(3)
    expect(onadd).toHaveBeenCalledTimes(3)
  })

  test.each([
    [`without parse_paste`, { parse_paste: undefined }],
    [`parse_paste returns empty`, { parse_paste: () => [] }],
  ])(`%s: paste not intercepted`, async (_label, override) => {
    const { onadd, event } = await paste_into(
      { options: [`a`, `b`, `c`], ...override },
      `a,b`,
    )
    expect(onadd).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  test(`object options via allowUserOptions`, async () => {
    const { oncreate } = await paste_into(
      {
        options: [{ label: `existing` }],
        allowUserOptions: `append`,
        parse_paste: (text: string) => text.split(`,`).map((str) => str.trim()),
      },
      `foo,bar`,
    )
    expect(oncreate).toHaveBeenCalledTimes(2)
    expect(oncreate).toHaveBeenCalledWith({ option: { label: `foo` } })
    expect(oncreate).toHaveBeenCalledWith({ option: { label: `bar` } })
  })

  test(`object options preserve extra fields from parse_paste`, async () => {
    const { oncreate, props } = await paste_into(
      {
        options: [{ label: `existing`, value: 0 }],
        selected: [],
        allowUserOptions: `append`,
        parse_paste: (text: string) =>
          text.split(`,`).map((str, idx) => ({ label: str.trim(), value: idx + 1 })),
      },
      `alpha,beta`,
    )
    expect(oncreate).toHaveBeenCalledWith({ option: { label: `alpha`, value: 1 } })
    expect(oncreate).toHaveBeenCalledWith({ option: { label: `beta`, value: 2 } })
    expect(props.selected).toEqual([
      { label: `alpha`, value: 1 },
      { label: `beta`, value: 2 },
    ])
  })

  test(`clears searchText when maxSelect blocks some options`, async () => {
    const { props } = await paste_into(
      {
        options: [`a`, `b`, `c`, `d`],
        selected: [`a`, `b`],
        // non-empty so clearing is observable, else the assertion below is tautological
        searchText: `partial`,
        maxSelect: 3,
      },
      `c,d`,
    )
    expect(props.selected).toEqual([`a`, `b`, `c`])
    expect(props.searchText).toBe(``)
  })

  test.each([
    [`already at max`, [`a`, `b`], 2, `c`, 0, 1, `c`],
    [`exceeds max mid-paste`, [`a`, `b`], 3, `c,d,e`, 1, 1, `d`],
  ])(
    `maxSelect: %s`,
    async (
      _label,
      selected,
      maxSelect,
      paste_text,
      expected_adds,
      expected_max,
      attempted,
    ) => {
      const { onadd, onmaxreached } = await paste_into(
        { options: [`a`, `b`, `c`, `d`, `e`], selected, maxSelect },
        paste_text,
      )
      expect(onadd).toHaveBeenCalledTimes(expected_adds)
      expect(onmaxreached).toHaveBeenCalledTimes(expected_max)
      expect(onmaxreached).toHaveBeenCalledWith(
        expect.objectContaining({ maxSelect, attemptedOption: attempted }),
      )
    },
  )

  test.each([
    [`empty selection`, [], [`a`]],
    [`replaces existing`, [`x`], [`a`]],
  ])(
    `maxSelect=1 with %s: only first option selected`,
    async (_label, initial, expected) => {
      const { onadd, props } = await paste_into(
        { options: [`a`, `b`, `c`, `x`], selected: initial, maxSelect: 1 },
        `a,b,c`,
      )
      expect(onadd).toHaveBeenCalledTimes(1)
      expect(props.selected).toEqual(expected)
    },
  )

  test.each([
    [`preselected duplicate`, [`a`], `a,b,c`, 2, [`a`, `b`, `c`]],
    [`self-duplicate within paste`, [], `a,a,b`, 2, [`a`, `b`]],
  ])(
    `handles %s`,
    async (_label, initial, paste_text, expected_adds, expected_selected) => {
      const { onadd, onduplicate, props } = await paste_into(
        { options: [`a`, `b`, `c`, `d`], selected: initial },
        paste_text,
      )
      expect(onadd).toHaveBeenCalledTimes(expected_adds)
      expect(onduplicate).toHaveBeenCalledTimes(1)
      expect(onduplicate).toHaveBeenCalledWith(expect.objectContaining({ option: `a` }))
      expect(props.selected).toHaveLength(expected_selected.length)
    },
  )

  test(`mixed existing and new options with allowUserOptions`, async () => {
    const { onadd, oncreate, props } = await paste_into(
      { options: [`existing1`, `existing2`], selected: [], allowUserOptions: `append` },
      `existing1,brand_new,existing2`,
    )
    expect(onadd).toHaveBeenCalledTimes(3)
    expect(oncreate).toHaveBeenCalledTimes(1)
    expect(oncreate).toHaveBeenCalledWith({ option: `brand_new` })
    expect(props.selected).toEqual([`existing1`, `brand_new`, `existing2`])
  })

  test(`oncreate returning false during paste skips only rejected options`, async () => {
    const oncreate_spy = vi.fn(({ option }: { option: Option }) => {
      const label = typeof option === `object` ? option.label : option
      return `${label}`.length >= 3 ? undefined : false
    })
    const { onadd, props } = await paste_into(
      { options: [], selected: [], allowUserOptions: `append`, oncreate: oncreate_spy },
      `ab,valid,x,also_ok`,
    )
    expect(oncreate_spy).toHaveBeenCalledTimes(4)
    expect(onadd).toHaveBeenCalledTimes(2)
    expect(props.selected).toEqual([`valid`, `also_ok`])
  })

  test.each<{
    desc: string
    props: Partial<MultiSelectProps>
    paste: string
    expected: Record<string, unknown>
    expected_selected?: Option[]
  }>([
    {
      desc: `added/overflow summary beyond maxSelect`,
      props: { options: [`a`, `b`, `c`, `d`, `e`], selected: [`a`], maxSelect: 3 },
      paste: `b,c,d,e`,
      expected: { added: [`b`, `c`], overflow: [`d`, `e`], raw_text: `b,c,d,e` },
    },
    {
      desc: `maxSelect=1 reports replaced option as added`,
      props: { options: [`a`, `b`, `c`], selected: [`a`], maxSelect: 1 },
      paste: `b,c`,
      expected: { added: [`b`], overflow: [`c`] },
      expected_selected: [`b`],
    },
    {
      desc: `reports rejected options from oncreate`,
      props: {
        options: [],
        selected: [],
        allowUserOptions: `append`,
        oncreate: ({ option }) =>
          `${typeof option === `object` ? option.label : option}`.length >= 3
            ? undefined
            : false,
      },
      paste: `ab,valid,x`,
      expected: { added: [`valid`], rejected: [`ab`, `x`], overflow: [] },
    },
  ])(`onparsed_paste $desc`, async ({ props, paste, expected, expected_selected }) => {
    const { onparsed_paste, props: bound } = await paste_into(props, paste)
    expect(onparsed_paste).toHaveBeenCalledTimes(1)
    expect(onparsed_paste.mock.calls[0][0]).toEqual(expect.objectContaining(expected))
    if (expected_selected) expect(bound.selected).toEqual(expected_selected)
  })
})

test(`falsy option values (0, '') are navigable and selectable via keyboard`, async () => {
  const props = $state<MultiSelectProps>({ options: [0, 1, 2], selected: [] })
  mount(MultiSelect, { target: document.body, props })
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

// drag-drop must reject foreign/invalid drag data (previously corrupted selected)
test.each([
  [`non-numeric text`, `hello`],
  [`empty string`, ``],
  [`out-of-range numeric prefix`, `42 items`],
  [`negative index`, `-1`],
  // numeric page text passes parseInt — must still be rejected since no
  // dragstart fired on this instance (foreign drag source)
  [`valid-looking numeric text without dragstart`, `0`],
])(`drop with foreign/invalid drag data (%s) is a no-op`, async (_desc, drag_data) => {
  const onreorder_spy = vi.fn()
  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], selected: [1, 2, 3], onreorder: onreorder_spy },
  })

  const data_transfer = new DataTransfer()
  data_transfer.setData(`text/plain`, drag_data)
  doc_query(`ul.selected li:nth-child(2)`).dispatchEvent(
    new DragEvent(`drop`, { dataTransfer: data_transfer }),
  )
  await tick()

  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`1 2 3`)
  expect(onreorder_spy).not.toHaveBeenCalled()
})

test(`keyboard navigation respects maxOptions: arrow keys wrap within rendered options`, async () => {
  mount(MultiSelect, {
    target: document.body,
    props: { options: [`a`, `b`, `c`, `d`, `e`], maxOptions: 2 },
  })
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

test(`group deselect-all keeps at least minSelect options selected`, async () => {
  const group_opts = [`Rock`, `Jazz`, `Pop`].map((label) => ({ label, group: `Genre` }))
  const props = $state<MultiSelectProps>({
    options: group_opts,
    selected: [...group_opts],
    groupSelectAll: true,
    keepSelectedInDropdown: `plain`,
    minSelect: 2,
    open: true,
  })
  mount(MultiSelect, { target: document.body, props })
  await tick()

  const deselect_btn = doc_query<HTMLButtonElement>(
    `ul.options > li.group-header button.group-select-all`,
  )
  expect(deselect_btn.textContent?.trim()).toBe(`Deselect all`)
  deselect_btn.click()
  await tick()

  // previously dropped to 0 selected, violating minSelect=2
  expect(props.selected).toHaveLength(2)
})

test(`IME composition guard: Enter during composition is ignored`, async () => {
  const props = $state<MultiSelectProps>({ options: [`foo`, `bar`], selected: [] })
  mount(MultiSelect, { target: document.body, props })
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

describe(`duplicate entries in options array`, () => {
  test.each([
    [`duplicate strings`, [`a`, `a`, `b`]],
    [
      `object options sharing a value`,
      [
        { label: `first`, value: `same` },
        { label: `second`, value: `same` },
      ],
    ],
    // a real option key that collides with a would-be generated duplicate suffix
    [`option key colliding with dup-suffix pattern`, [`a`, `a`, `a-dup-0-1`]],
  ])(`%s render without keyed-each crash (duplicates=false)`, (_desc, options) => {
    // previously threw Svelte's each_key_duplicate because the keyed {#each} only
    // disambiguated keys when the `duplicates` prop was truthy
    mount(MultiSelect, { target: document.body, props: { options } })
    expect(document.querySelectorAll(`ul.options > li`)).toHaveLength(options.length)
  })

  test(`duplicate options get unique DOM ids, aria-posinset, and hover indices`, async () => {
    mount(MultiSelect, { target: document.body, props: { options: [`a`, `a`, `b`] } })
    const option_lis = [...document.querySelectorAll(`ul.options > li`)]

    // previously navigable_index_map collapsed duplicate values to the last index,
    // giving both 'a' rows the same id and posinset
    expect(option_lis.map((li) => li.id.split(`-opt-`)[1])).toEqual([`0`, `1`, `2`])
    expect(option_lis.map((li) => li.getAttribute(`aria-posinset`))).toEqual([
      `1`,
      `2`,
      `3`,
    ])

    // hovering the first duplicate activates only that row
    option_lis[0].dispatchEvent(new MouseEvent(`mouseover`, { bubbles: true }))
    await tick()
    const active = [...document.querySelectorAll(`ul.options > li.active`)]
    expect(active).toHaveLength(1)
    expect(active[0].id.endsWith(`-opt-0`)).toBe(true)

    option_lis[1].dispatchEvent(new MouseEvent(`mouseover`, { bubbles: true }))
    await tick()
    const second_active = [...document.querySelectorAll(`ul.options > li.active`)]
    expect(second_active).toHaveLength(1)
    expect(second_active[0].id.endsWith(`-opt-1`)).toBe(true)
  })
})

test(`clearing searchText while create-option message is active drops aria-activedescendant`, async () => {
  mount(MultiSelect, {
    target: document.body,
    props: { options: [`foo`], allowUserOptions: true },
  })
  const input = get_input()
  await type_search_text(`xyz`, input)

  // no options match 'xyz' -> ArrowDown activates the create-option message
  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()
  expect(doc_query(`ul.options > li.user-msg`).classList.contains(`active`)).toBe(true)
  expect(input.getAttribute(`aria-activedescendant`)).toContain(`user-msg`)

  // clearing the search removes the message li — active state must not go stale
  await type_search_text(``, input)
  expect(document.querySelector(`ul.options > li.user-msg`)).toBeNull()
  // previously kept pointing at the removed user-msg li (dangling ARIA reference)
  expect(input.getAttribute(`aria-activedescendant`)).toBeNull()
})

describe(`async oncreate`, () => {
  type OncreateResult = false | Option | undefined

  // manually-controlled promise so tests decide exactly when oncreate settles
  function make_deferred<T>() {
    let resolve_fn: (value: T) => void = () => {}
    let reject_fn: (reason: unknown) => void = () => {}
    const promise = new Promise<T>((resolve, reject) => {
      resolve_fn = resolve
      reject_fn = reject
    })
    return { promise, resolve_fn, reject_fn }
  }

  test(`resolving undefined adds typed option after resolve, spinner shown only while pending`, async () => {
    const { promise, resolve_fn } = make_deferred<OncreateResult>()
    const oncreate = vi.fn(() => promise)
    const onadd = vi.fn()
    const spinner = createRawSnippet(() => ({
      render: () => `<span class="custom-spinner">creating</span>`,
    }))
    const props = $state<MultiSelectProps>({
      options: [`foo`, `bar`],
      selected: [],
      allowUserOptions: true,
      oncreate,
      onadd,
      spinner,
    })
    mount(MultiSelect, { target: document.body, props })

    const input = await type_search_text(`new async option`)
    expect(document.querySelector(`.custom-spinner`)).toBeNull()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    input.dispatchEvent(fresh_key(`Enter`))
    await tick()

    expect(oncreate).toHaveBeenCalledTimes(1)
    expect(oncreate).toHaveBeenCalledWith({ option: `new async option` })
    // while the promise is pending: spinner visible, input busy, nothing added yet
    expect(doc_query(`.custom-spinner`).textContent).toBe(`creating`)
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)
    expect(props.selected).toEqual([])
    expect(onadd).not.toHaveBeenCalled()

    resolve_fn(undefined)
    await promise
    await tick()

    expect(document.querySelector(`.custom-spinner`)).toBeNull()
    expect(input.getAttribute(`aria-busy`)).toBeNull()
    expect(props.selected).toEqual([`new async option`])
    expect(onadd).toHaveBeenCalledTimes(1)
    expect(onadd).toHaveBeenCalledWith({
      option: `new async option`,
      selected: [`new async option`],
    })
  })

  test.each<[string, OncreateResult, Option[], number]>([
    [`undefined keeps the original option`, undefined, [`fresh-opt`], 1],
    [`a transformed option replaces the original`, `TRANSFORMED`, [`TRANSFORMED`], 1],
    [`false aborts the add`, false, [], 0],
  ])(
    `resolving %s`,
    async (_label, resolved_value, expected_selected, expected_onadd_calls) => {
      console.error = vi.fn()
      const { promise, resolve_fn } = make_deferred<OncreateResult>()
      const onadd = vi.fn()
      const props = $state<MultiSelectProps>({
        options: [`foo`, `bar`],
        selected: [],
        allowUserOptions: true,
        oncreate: () => promise,
        onadd,
      })
      mount(MultiSelect, { target: document.body, props })

      const input = await type_search_text(`fresh-opt`)
      input.dispatchEvent(fresh_key(`Enter`))
      await tick()

      resolve_fn(resolved_value)
      await promise
      await tick()

      expect(props.selected).toEqual(expected_selected)
      expect(onadd).toHaveBeenCalledTimes(expected_onadd_calls)
      expect(console.error).not.toHaveBeenCalled()
    },
  )

  test(`non-native thenable oncreate result is awaited, not added as an option`, async () => {
    const onadd = vi.fn()
    // custom thenable (e.g. from a non-native promise implementation): must be
    // awaited like a Promise instead of being treated as an option object
    const thenable = {
      // oxlint-disable-next-line unicorn/no-thenable -- deliberately testing thenable handling
      then: (resolve: (value: OncreateResult) => void) => resolve(`from-thenable`),
    }
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      selected: [],
      allowUserOptions: true,
      oncreate: () => thenable as unknown as OncreateResult,
      onadd,
    })
    mount(MultiSelect, { target: document.body, props })

    const input = await type_search_text(`typed-text`)
    input.dispatchEvent(fresh_key(`Enter`))
    await tick()
    await tick() // extra microtask hop for the thenable resolution

    expect(props.selected).toEqual([`from-thenable`])
    expect(onadd).toHaveBeenCalledTimes(1)
  })

  test(`oncreate throwing synchronously adds nothing and logs console.error`, async () => {
    console.error = vi.fn()
    const onadd = vi.fn()
    const sync_error = new Error(`validation blew up`)
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      selected: [],
      allowUserOptions: true,
      oncreate: () => {
        throw sync_error
      },
      onadd,
    })
    mount(MultiSelect, { target: document.body, props })

    const input = await type_search_text(`doomed-opt`)
    input.dispatchEvent(fresh_key(`Enter`))
    await tick()

    expect(props.selected).toEqual([])
    expect(onadd).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(`MultiSelect: oncreate threw:`, sync_error)
  })

  test(`rejecting adds nothing and logs console.error`, async () => {
    console.error = vi.fn()
    const { promise, reject_fn } = make_deferred<OncreateResult>()
    const onadd = vi.fn()
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      selected: [],
      allowUserOptions: true,
      oncreate: () => promise,
      onadd,
    })
    mount(MultiSelect, { target: document.body, props })

    const input = await type_search_text(`doomed-opt`)
    input.dispatchEvent(fresh_key(`Enter`))
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    const rejection = new Error(`backend validation failed`)
    reject_fn(rejection)
    await promise.catch(() => {})
    await tick()

    expect(props.selected).toEqual([])
    expect(onadd).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledTimes(1)
    expect(console.error).toHaveBeenCalledWith(
      `MultiSelect: oncreate promise rejected:`,
      rejection,
    )
    // busy state must reset even on rejection
    expect(input.getAttribute(`aria-busy`)).toBeNull()
  })

  test(`double Enter while async create is pending adds only one option`, async () => {
    const { promise, resolve_fn } = make_deferred<OncreateResult>()
    const oncreate = vi.fn(() => promise)
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      selected: [],
      allowUserOptions: true,
      oncreate,
    })
    mount(MultiSelect, { target: document.body, props })

    const input = await type_search_text(`only-once`)
    input.dispatchEvent(fresh_key(`Enter`))
    await tick()
    input.dispatchEvent(fresh_key(`Enter`)) // second Enter while first create pending
    await tick()

    expect(oncreate).toHaveBeenCalledTimes(1)

    resolve_fn(undefined)
    await promise
    await tick()

    expect(props.selected).toEqual([`only-once`])
  })

  test.each<[string, MultiSelectProps[`oncreate`], Option[]]>([
    [`returning false blocks the option`, () => false, []],
    [
      `returning an option transforms it`,
      ({ option }) => `${get_label(option)}`.toUpperCase(),
      [`SYNC-OPT`],
    ],
    [`returning undefined keeps the original option`, () => undefined, [`sync-opt`]],
    [`returning empty string keeps the original option`, () => ``, [`sync-opt`]],
  ])(`sync oncreate regression: %s`, async (_label, oncreate, expected_selected) => {
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      selected: [],
      allowUserOptions: true,
      oncreate,
    })
    mount(MultiSelect, { target: document.body, props })

    const input = await type_search_text(`sync-opt`)
    input.dispatchEvent(fresh_key(`Enter`))
    await tick()

    expect(props.selected).toEqual(expected_selected)
  })
})

describe(`portal placement`, () => {
  afterEach(() => vi.unstubAllGlobals()) // don't leak innerHeight overrides to other tests

  // happy-dom has no real layout engine, so stub getBoundingClientRect on the
  // outer div, offsetHeight on the portalled dropdown, and the viewport height
  function stub_layout({
    trigger_rect,
    dropdown_height,
    viewport_height,
  }: {
    trigger_rect: { top: number; bottom: number }
    dropdown_height: number
    viewport_height: number
  }): HTMLUListElement {
    const { top, bottom } = trigger_rect
    const rect = {
      top,
      bottom,
      left: 10,
      right: 210,
      width: 200,
      height: bottom - top,
      x: 10,
      y: top,
      toJSON: () => ({}),
    } as DOMRect
    vi.spyOn(doc_query(`div.multiselect`), `getBoundingClientRect`).mockReturnValue(rect)
    const dropdown = doc_query<HTMLUListElement>(`body > ul.options`)
    Object.defineProperty(dropdown, `offsetHeight`, {
      value: dropdown_height,
      configurable: true,
    })
    vi.stubGlobal(`innerHeight`, viewport_height)
    return dropdown
  }

  async function mount_with_portal(placement?: PortalParams[`placement`]) {
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [1, 2, 3],
        open: true,
        portal: { active: true, placement },
      },
    })
    await tick()
  }

  // `top` positions the dropdown's margin edge, so the action subtracts the
  // computed margin-top when placing above — mirror that in expected values
  function expected_top_style(
    expected_placement: `top` | `bottom`,
    trigger_rect: { top: number; bottom: number },
    dropdown_height: number,
    dropdown: HTMLUListElement,
  ): string {
    if (expected_placement === `bottom`) return `${trigger_rect.bottom}px`
    const margin_px = getComputedStyle(dropdown).marginTop.replace(/px$/u, ``)
    const margin_top = Number(margin_px) || 0
    return `${Math.max(0, trigger_rect.top - dropdown_height - margin_top)}px`
  }

  test.each([
    {
      placement: `auto`,
      trigger_rect: { top: 100, bottom: 130 },
      dropdown_height: 200,
      viewport_height: 800,
      expected_placement: `bottom`,
      desc: `plenty of space below`,
    },
    {
      placement: `auto`,
      trigger_rect: { top: 600, bottom: 630 },
      dropdown_height: 200,
      viewport_height: 700,
      expected_placement: `top`,
      desc: `insufficient space below and more space above`,
    },
    {
      placement: `top`,
      trigger_rect: { top: 300, bottom: 330 },
      dropdown_height: 200,
      viewport_height: 800,
      expected_placement: `top`,
      desc: `forced above despite ample space below`,
    },
    {
      placement: `bottom`,
      trigger_rect: { top: 600, bottom: 630 },
      dropdown_height: 200,
      viewport_height: 700,
      expected_placement: `bottom`,
      desc: `forced below despite tight space below`,
    },
    {
      placement: `auto`,
      trigger_rect: { top: 600, bottom: 630 },
      dropdown_height: 0,
      viewport_height: 700,
      expected_placement: `bottom`,
      desc: `unmeasured dropdown (offsetHeight 0) falls back to bottom`,
    },
    {
      // omitted placement must default to auto: same tight-space-below setup as
      // the auto row above, so a flip to top proves the default contract
      placement: undefined,
      trigger_rect: { top: 600, bottom: 630 },
      dropdown_height: 200,
      viewport_height: 700,
      expected_placement: `top`,
      desc: `omitted placement defaults to auto and flips above`,
    },
  ] as const)(
    `placement=$placement with $desc resolves to $expected_placement`,
    async ({
      placement,
      trigger_rect,
      dropdown_height,
      viewport_height,
      expected_placement,
    }) => {
      await mount_with_portal(placement)
      const dropdown = stub_layout({ trigger_rect, dropdown_height, viewport_height })

      globalThis.dispatchEvent(new Event(`resize`)) // force update_position with stubs

      expect(dropdown.dataset.placement).toBe(expected_placement)
      expect(dropdown.style.top).toBe(
        expected_top_style(expected_placement, trigger_rect, dropdown_height, dropdown),
      )
    },
  )

  test.each([
    // forced top with trigger near viewport top and dropdown taller than space above
    { placement: `top`, trigger_rect: { top: 50, bottom: 80 }, dropdown_height: 300 },
    // auto flips above (830 + 900 > 800 and 750 > 800 - 780) but 750 - 900 < 0
    { placement: `auto`, trigger_rect: { top: 750, bottom: 780 }, dropdown_height: 900 },
  ] as const)(
    `placement=$placement never positions dropdown above viewport top (clamps to 0)`,
    async ({ placement, trigger_rect, dropdown_height }) => {
      await mount_with_portal(placement)
      const dropdown = stub_layout({
        trigger_rect,
        dropdown_height,
        viewport_height: 800,
      })

      globalThis.dispatchEvent(new Event(`resize`))

      expect(dropdown.dataset.placement).toBe(`top`)
      expect(dropdown.style.top).toBe(`0px`)
    },
  )

  test(`placement recomputes on scroll and reacts to updated portal params`, async () => {
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3],
      open: true,
      portal: { active: true, placement: `auto` },
    })
    mount(MultiSelect, { target: document.body, props })
    await tick()

    const dropdown = stub_layout({
      trigger_rect: { top: 100, bottom: 130 },
      dropdown_height: 200,
      viewport_height: 800,
    })
    globalThis.dispatchEvent(new Event(`scroll`)) // scroll listener also repositions
    expect(dropdown.dataset.placement).toBe(`bottom`)
    expect(dropdown.style.top).toBe(`130px`)

    // trigger moves near viewport bottom → auto placement flips above on next scroll
    vi.spyOn(doc_query(`div.multiselect`), `getBoundingClientRect`).mockReturnValue({
      top: 600,
      bottom: 630,
      left: 10,
      right: 210,
      width: 200,
      height: 30,
      x: 10,
      y: 600,
      toJSON: () => ({}),
    })
    vi.stubGlobal(`innerHeight`, 700)
    globalThis.dispatchEvent(new Event(`scroll`))
    expect(dropdown.dataset.placement).toBe(`top`)

    // changing placement via props flows through the action's update() method
    props.portal = { active: true, placement: `bottom` }
    await tick()
    globalThis.dispatchEvent(new Event(`resize`))
    expect(dropdown.dataset.placement).toBe(`bottom`)
    expect(dropdown.style.top).toBe(`630px`)
  })
})

describe(`virtualList`, () => {
  const item_height = 30
  const overscan = 5
  const viewport_estimate = 400 // component falls back to 400px since happy-dom reports clientHeight 0
  const n_options = 1000
  const virtual_options = Array.from({ length: n_options }, (_, idx) => `option ${idx}`)
  const virtual_props = {
    options: virtual_options,
    open: true,
    virtualList: { itemHeight: item_height, overscan },
  } satisfies MultiSelectProps

  // window math mirrored from the component (start = 0 before any scrolling)
  const window_end = (scroll_top: number, extra_rows: number) =>
    Math.min(
      n_options,
      Math.ceil((scroll_top + viewport_estimate) / item_height) + extra_rows,
    )
  const initial_end = window_end(0, overscan)

  const get_rendered_options = () => [
    ...document.querySelectorAll<HTMLLIElement>(`ul.options li[role='option']`),
  ]
  const get_spacers = () => [
    ...document.querySelectorAll<HTMLLIElement>(`ul.options li[aria-hidden='true']`),
  ]

  test.each([
    [{ itemHeight: item_height, overscan }, initial_end],
    [true, window_end(0, 10)], // boolean form uses defaults itemHeight=30, overscan=10
    [false, n_options], // non-virtual sanity check: every option gets a DOM node
  ])(
    `virtualList=%j renders %i of ${n_options} options`,
    (virtualList, expected_count) => {
      mount(MultiSelect, {
        target: document.body,
        props: { options: virtual_options, open: true, virtualList },
      })

      expect(get_rendered_options()).toHaveLength(expected_count)
      expect(get_spacers()).toHaveLength(virtualList ? 2 : 0)
    },
  )

  test(`spacers pad the rendered window to the full list height`, () => {
    mount(MultiSelect, { target: document.body, props: { ...virtual_props } })

    const [top_spacer, bottom_spacer] = get_spacers()
    expect(top_spacer.style.height).toBe(`0px`)
    expect(bottom_spacer.style.height).toBe(
      `${(n_options - initial_end) * item_height}px`,
    )
  })

  test(`scrolling the dropdown re-windows which options are rendered`, async () => {
    mount(MultiSelect, { target: document.body, props: { ...virtual_props } })

    const ul_options = doc_query<HTMLUListElement>(`ul.options`)
    const scroll_top = 600
    // happy-dom has no layout, so fake the scroll offset and fire the event manually
    Object.defineProperty(ul_options, `scrollTop`, {
      value: scroll_top,
      configurable: true,
    })
    ul_options.dispatchEvent(new Event(`scroll`))
    await tick()

    const expected_start = Math.floor(scroll_top / item_height) - overscan // 15
    const rendered = get_rendered_options()
    expect(rendered[0]?.textContent?.trim()).toBe(`option ${expected_start}`)
    expect(rendered).toHaveLength(window_end(scroll_top, overscan) - expected_start)
    expect(get_spacers()[0].style.height).toBe(`${expected_start * item_height}px`)
  })

  test(`clicking a rendered option selects it`, async () => {
    const props = $state<MultiSelectProps>({ ...virtual_props, selected: [] })
    mount(MultiSelect, { target: document.body, props })

    get_rendered_options()[0].click()
    await tick()

    expect(props.selected).toEqual([`option 0`])
    expect(doc_query(`ul.selected > li`).textContent?.trim()).toContain(`option 0`)
  })

  test(`arrow keys keep the active option rendered beyond the initial window`, async () => {
    mount(MultiSelect, { target: document.body, props: { ...virtual_props } })

    const input = get_input()
    const n_presses = 25 // activeIndex 24 lies past the initial window end of 19
    for (let press_idx = 0; press_idx < n_presses; press_idx++) {
      input.dispatchEvent(fresh_key(`ArrowDown`))
      await tick()
    }
    await tick() // flush the async scroll adjustment in handle_arrow_navigation

    expect(doc_query(`ul.options li.active`).textContent?.trim()).toBe(
      `option ${n_presses - 1}`,
    )
    // the window scrolled down: option 0 is no longer rendered
    expect(get_rendered_options()[0]?.textContent?.trim()).not.toBe(`option 0`)
    expect(get_rendered_options().length).toBeLessThan(50)
  })

  test(`fuzzy search filtering still works in virtual mode`, async () => {
    mount(MultiSelect, { target: document.body, props: { ...virtual_props } })

    const input = get_input()
    await type_search_text(`999`, input)

    const rendered = get_rendered_options()
    expect(rendered).toHaveLength(1)
    expect(rendered[0].textContent?.trim()).toBe(`option 999`)
    for (const spacer of get_spacers()) expect(spacer.style.height).toBe(`0px`)
  })

  // options spread over 5 groups (group 0 first with count/5 options, etc.)
  const make_grouped = (count: number) =>
    Array.from({ length: count }, (_, idx) => ({
      label: `option ${idx}`,
      group: `group ${idx % 5}`,
    }))

  test(`grouped virtual list re-windows on scroll and keyboard-navigates across groups`, async () => {
    // 50 options in 5 groups of 10 → 55 rows (5 interleaved headers)
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: make_grouped(50),
        open: true,
        virtualList: { itemHeight: item_height, overscan },
      },
    })
    await tick()
    const ul_options = doc_query<HTMLUListElement>(`ul.options`)

    // scroll to the middle: window = rows [15, 39) of 55 — options flat 13-34 plus
    // the group 2 and group 3 headers (rows 22 and 33)
    ul_options.scrollTop = 600
    ul_options.dispatchEvent(new Event(`scroll`))
    await tick()

    const headers = [...document.querySelectorAll(`ul.options li.group-header`)]
    expect(headers.map((el) => el.querySelector(`.group-label`)?.textContent)).toEqual([
      `group 2`,
      `group 3`,
    ])
    // first rendered option = flat idx 13 = group 1's 4th option = label "option 16"
    expect(get_rendered_options()[0].textContent?.trim()).toBe(`option 16`)
    const [top_spacer, bottom_spacer] = get_spacers()
    expect(top_spacer.style.height).toBe(`${15 * item_height}px`) // 15 rows above window
    expect(bottom_spacer.style.height).toBe(`${(55 - 39) * item_height}px`) // 16 below

    // keyboard: first ArrowDown activates flat idx 0, whose ROW is 1 (the group 0
    // header occupies row 0) — auto-scroll must clamp to the row offset, not the
    // flat option index (which would scroll to 0)
    const input = get_input()
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    expect(ul_options.scrollTop).toBe(item_height) // row 1 (header row 0 above it)

    // 11 more presses reach flat idx 11 (group 1's 2nd option = "option 6", row 13),
    // still inside the viewport window — active li must be rendered
    for (let press = 0; press < 11; press++) {
      input.dispatchEvent(fresh_key(`ArrowDown`))
      await tick()
    }
    const active = doc_query(`ul.options li.active`)
    expect(active.textContent?.trim()).toBe(`option 6`)
  })

  test(`stickyGroupHeaders + groups falls back to full rendering with a console.warn`, async () => {
    console.warn = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: make_grouped(50),
        open: true,
        virtualList: true,
        stickyGroupHeaders: true,
      },
    })
    await tick() // wait for validation $effect to run

    expect(console.warn).toHaveBeenCalledTimes(1)
    expect(console.warn).toHaveBeenCalledWith(
      expect.stringContaining(`virtualList does not support stickyGroupHeaders`),
    )
    expect(get_rendered_options()).toHaveLength(50) // fallback renders ALL options
    expect(get_spacers()).toHaveLength(0)
  })
})

describe(`maxVisibleChips`, () => {
  const options = [`a`, `b`, `c`, `d`, `e`]
  const chips = () => [
    ...document.querySelectorAll<HTMLLIElement>(`ul.selected > li:not(.more-chip)`),
  ]

  test.each([
    [2, `+3 more`], // partial overflow
    [0, `+5 more`], // limit 0 hides ALL chips behind the toggle
  ])(
    `maxVisibleChips=%i collapses overflow into a %s toggle that expands and collapses`,
    async (max_visible_chips, toggle_label) => {
      mount(MultiSelect, {
        target: document.body,
        props: { options, selected: [...options], maxVisibleChips: max_visible_chips },
      })

      expect(chips()).toHaveLength(max_visible_chips)
      const toggle = doc_query<HTMLButtonElement>(`li.more-chip button.more-chips`)
      expect(toggle.textContent?.trim()).toBe(toggle_label)
      expect(toggle.getAttribute(`aria-expanded`)).toBe(`false`)

      toggle.click()
      await tick()
      expect(chips()).toHaveLength(5)
      expect(toggle.textContent?.trim()).toBe(`show less`)
      expect(toggle.getAttribute(`aria-expanded`)).toBe(`true`)

      toggle.click()
      await tick()
      expect(chips()).toHaveLength(max_visible_chips)
    },
  )

  test.each([
    [`fits within limit`, 5],
    [`unlimited (null)`, null],
  ])(`renders no toggle when selection %s`, (_desc, maxVisibleChips) => {
    mount(MultiSelect, {
      target: document.body,
      props: { options, selected: [...options].slice(0, 3), maxVisibleChips },
    })
    expect(document.querySelector(`li.more-chip`)).toBeNull()
    expect(chips()).toHaveLength(3)
  })

  test(`keyboard chip navigation auto-expands hidden chips`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: { options, selected: [...options], maxVisibleChips: 2 },
    })
    expect(chips()).toHaveLength(2)

    // ArrowLeft highlights the LAST selected chip (idx 4), which is hidden
    const input = get_input()
    input.dispatchEvent(fresh_key(`ArrowLeft`))
    await tick()

    expect(chips()).toHaveLength(5)
    expect(chips().at(-1)?.classList.contains(`highlighted`)).toBe(true)

    // "show less" must stick: collapsing clears the beyond-limit highlight, else
    // the auto-expand effect would instantly re-expand
    doc_query<HTMLButtonElement>(`li.more-chip button.more-chips`).click()
    await tick()
    expect(chips()).toHaveLength(2)
  })

  test(`invalid maxVisibleChips logs console.error and renders all chips (no +0 more)`, async () => {
    console.error = vi.fn()
    mount(MultiSelect, {
      target: document.body,
      props: { options, selected: [...options], maxVisibleChips: -2 },
    })
    await tick() // validation runs in an effect
    expect(console.error).toHaveBeenCalledWith(
      `MultiSelect: maxVisibleChips must be null or a non-negative integer, got -2`,
    )
    // invalid limit is ignored: every chip renders and no toggle appears
    expect(chips()).toHaveLength(5)
    expect(document.querySelector(`li.more-chip`)).toBeNull()
  })
})

describe(`ARIA correctness`, () => {
  test(`select-all aria-selected tracks all-selectable-selected, not max capacity`, async () => {
    mount(MultiSelect, {
      target: document.body,
      props: { options: [1, 2], selectAllOption: true, open: true },
    })

    const select_all = doc_query(`ul.options li.select-all`)
    expect(select_all.getAttribute(`aria-selected`)).toBe(`false`)

    select_all.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    await tick()
    expect(doc_query(`ul.options li.select-all`).getAttribute(`aria-selected`)).toBe(
      `true`,
    )

    // at max capacity the row is disabled but must NOT be announced as selected:
    // aria-selected tracks only whether all selectable options are selected
    // (option 3 is not) — not the maxSelect capacity limit
    document.body.innerHTML = ``
    mount(MultiSelect, {
      target: document.body,
      props: {
        options: [1, 2, 3],
        selected: [1, 2],
        maxSelect: 2,
        selectAllOption: true,
        open: true,
        keepSelectedInDropdown: `plain`,
      },
    })

    const capped_select_all = doc_query(`ul.options li.select-all`)
    expect(capped_select_all.classList.contains(`disabled`)).toBe(true)
    expect(capped_select_all.getAttribute(`aria-selected`)).toBe(`false`)
  })

  test(`aria-controls is absent while the listbox is not rendered`, async () => {
    // no options + allowEmpty → the options <ul> is not in the DOM
    const props = $state<MultiSelectProps>({ options: [], allowEmpty: true })
    mount(MultiSelect, { target: document.body, props })

    const input = get_input()
    expect(document.querySelector(`ul.options`)).toBeNull()
    expect(input.getAttribute(`aria-controls`)).toBeNull()

    // once options exist, aria-controls references the actual listbox id
    props.options = [1, 2]
    await tick()
    const listbox = doc_query(`ul.options`)
    expect(input.getAttribute(`aria-controls`)).toBe(listbox.id)
  })
})

test(`toggling portal.active at runtime portals and un-portals the dropdown`, async () => {
  const props = $state<MultiSelectProps>({
    options: [1, 2, 3],
    open: true,
    portal: { active: false },
  })
  mount(MultiSelect, { target: document.body, props })
  await tick()

  expect(document.querySelector(`body > ul.options`)).toBeNull()
  expect(document.querySelector(`div.multiselect ul.options`)).not.toBeNull()

  props.portal = { active: true }
  await tick()
  const portalled = doc_query<HTMLUListElement>(`body > ul.options`)
  expect(portalled.style.position).toBe(`fixed`)

  props.portal = { active: false }
  await tick()
  expect(document.querySelector(`body > ul.options`)).toBeNull()
  const back_inside = doc_query<HTMLUListElement>(`div.multiselect ul.options`)
  // portal-only inline styles must be cleared so component CSS applies again
  expect(back_inside.style.position).toBe(``)
  expect(back_inside.dataset.placement).toBeUndefined()
})

// The click_outside attachment receives `inside: [options_list_el]`, which is undefined
// until bind:this lands. Attachments re-run on reactive reads, so the portalled list
// must count as inside once bound — otherwise pressing it would close the dropdown.
test(`press on the portalled dropdown does not close it`, async () => {
  const props = $state<MultiSelectProps>({
    options: [1, 2, 3],
    open: true,
    portal: { active: true },
  })
  // unmount for real: clearing innerHTML would leave the document press listener
  const app = mount(MultiSelect, { target: document.body, props })
  await tick()

  const portalled = doc_query<HTMLUListElement>(`body > ul.options`)
  portalled.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))
  await tick()
  expect(doc_query(`div.multiselect`).classList.contains(`open`)).toBe(true)

  // control: a press with no relation to the component does close it
  const outside = document.createElement(`div`)
  document.body.append(outside)
  outside.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))
  await tick()
  expect(doc_query(`div.multiselect`).classList.contains(`open`)).toBe(false)
  outside.remove()
  await unmount(app)
})

// Portalled blur must not close (issue #335); in-place skips blur (it closes on its own).
test.each([
  [`portalled`, { portal: { active: true } }],
  [`in-place`, {}],
] as const)(
  `dismiss_on='release' keeps a %s dropdown open until click`,
  async (_label, extra) => {
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3],
      dismiss_on: `release`,
      open: true,
      ...extra,
    })
    const app = mount(MultiSelect, { target: document.body, props })
    await tick()
    const is_open = () => doc_query(`div.multiselect`).classList.contains(`open`)
    expect(is_open()).toBe(true)

    const outside = document.createElement(`button`)
    document.body.append(outside)
    outside.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))
    if (`portal` in extra) {
      doc_query(`input[autocomplete]`).dispatchEvent(
        new FocusEvent(`blur`, { relatedTarget: outside }),
      )
    }
    await tick()
    expect(is_open()).toBe(true)

    outside.dispatchEvent(new PointerEvent(`click`, { bubbles: true, detail: 1 }))
    await tick()
    expect(is_open()).toBe(false)
    outside.remove()
    await unmount(app)
  },
)

test(`searchExpandsCollapsedGroups: manually collapsed group stays collapsed until the search changes`, async () => {
  mount(MultiSelect, {
    target: document.body,
    props: {
      options: [
        { label: `apple`, group: `Fruits` },
        { label: `avocado`, group: `Fruits` },
        { label: `ant`, group: `Animals` },
      ],
      open: true,
      collapsibleGroups: true,
      searchExpandsCollapsedGroups: true,
      collapsedGroups: new Set([`Fruits`]),
    },
  })
  const input = get_input()
  const fruits_header = () =>
    [...document.querySelectorAll(`ul.options li.group-header`)].find((el) =>
      el.textContent?.includes(`Fruits`),
    ) as HTMLElement

  // typing auto-expands the collapsed group with matches
  await type_search_text(`a`, input)
  expect(fruits_header().getAttribute(`aria-expanded`)).toBe(`true`)

  // manual collapse mid-search must stick (previously insta-re-expanded)
  fruits_header().click()
  await tick()
  expect(fruits_header().getAttribute(`aria-expanded`)).toBe(`false`)

  // a NEW search re-expands
  await type_search_text(`av`, input)
  expect(fruits_header().getAttribute(`aria-expanded`)).toBe(`true`)
})

test(`whitespace-only search shows all options instead of a blank dropdown`, async () => {
  mount(MultiSelect, {
    target: document.body,
    props: { options: [1, 2, 3], open: true },
  })
  const input = get_input()
  await type_search_text(`  `, input)

  expect(document.querySelectorAll(`ul.options li[role='option']`)).toHaveLength(3)
  expect(document.querySelector(`ul.options li.user-msg`)).toBeNull()
})

test(`sortSelected function comparator controls chip order on add`, async () => {
  const reverse_alphabetical = (opt_1: Option, opt_2: Option) =>
    `${get_label(opt_2)}`.localeCompare(`${get_label(opt_1)}`)
  mount(MultiSelect, {
    target: document.body,
    props: {
      options: [`a`, `b`, `c`],
      sortSelected: reverse_alphabetical,
      selectedOptionsDraggable: false,
    },
  })

  for (const label of [`a`, `c`, `b`]) {
    const li = [
      ...document.querySelectorAll<HTMLLIElement>(`ul.options li[role='option']`),
    ].find((el) => el.textContent?.trim() === label)
    li?.click()
    await tick()
  }

  expect(normalized_text(doc_query(`ul.selected`))).toBe(`c b a`)
})
