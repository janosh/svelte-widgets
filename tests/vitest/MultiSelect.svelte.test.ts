// deno-lint-ignore-file no-await-in-loop
import { readFileSync } from 'node:fs'
import { tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import type { Option, OptionStyle } from '$lib'
import type { MultiSelectProps } from '$lib/types'
import { get_label } from '$lib/utils'
import { doc_query, type Test2WayBindProps } from './index'
import Test2WayBind from './Test2WayBind.svelte'
import TestMultiSelectSnippets from './TestMultiSelectSnippets.svelte'
import {
  focus_input,
  fresh_key,
  fresh_mouseover,
  get_input,
  mount_component as mount,
  mount_multiselect,
  normalized_text,
  type_search_text,
} from './MultiSelect.test-utils'

test(`2-way binding preserves a valid initial auto-active index`, async () => {
  const props = $state<MultiSelectProps>({
    options: [`Alpha`, `Beta`, `Gamma`],
    activeIndex: 1,
    autoActiveFirstOption: true,
    searchText: `a`,
  })

  mount_multiselect(props)
  await tick()
  expect(props.activeIndex).toBe(1)

  // test internal changes to activeIndex bind outward
  for (const idx of [1, 2]) {
    const li = doc_query(`ul.options li:nth-child(${idx})`)
    li.dispatchEvent(fresh_mouseover())

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
  mount_multiselect(props)
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
  firstOption.dispatchEvent(fresh_mouseover())
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

  mount_multiselect({ options, defaultDisabledTitle })

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

  mount_multiselect({
    options: [1, 2, 3],
    searchText,
    id,
    autocomplete,
    placeholder,
    name,
    inputmode,
    pattern,
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
    mount_multiselect({ options: [1, 2, 3], placeholder })

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

  mount_multiselect({ options: [1, 2, 3], ...css_classes, selected: [1], maxSelect: 2 })

  // make an option active hovering it so it gets the active class
  document.querySelector(`ul.options > li`)?.dispatchEvent(fresh_mouseover())
  await tick()

  expect(doc_query(`.maxSelectMsg`).textContent?.trim()).toBe(`1/2`)
  for (const [class_name, elem_type] of Object.entries(prop_elem_map)) {
    const el = doc_query(`.${class_name}`)

    expect(el).toBeInstanceOf(elem_type)
  }
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

    mount_multiselect({
      options: default_options,
      [`on${name}`]: spy,
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

  test(`input display rejects maxSelect other than 1`, () => {
    expect(() =>
      mount_multiselect({ options: [`Red`], selectedDisplay: `input` }),
    ).toThrow(`selectedDisplay="input" requires maxSelect={1}`)
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

    mount_multiselect(
      {
        ...input_display_props,
        options,
        name: field_name,
        required: true,
      },
      form,
    )

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
    mount_multiselect({
      ...input_display_props,
      options: [`Red`],
      inputProps: {
        maxlength: 5,
        readonly: true,
        [`aria-label`]: `Color input`,
        [`aria-expanded`]: `true`,
        role: `textbox`,
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
      mount_multiselect({
        ...input_display_props,
        loadOptions: { fetch: fetch_fn, debounceMs: 0 },
        open: true,
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
      mount_multiselect({
        ...input_display_props,
        selected: [`Alpha`],
        loadOptions: { fetch: fetch_fn, debounceMs: 0 },
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

test.each<[string, boolean | number, number[], number | null, boolean]>([
  [`optional empty selection`, false, [], null, true],
  [`required empty selection`, true, [], null, false],
  [`one required at max boundary`, 1, [1], 1, true],
  [`two required with one selected`, 2, [1], null, false],
  [`two required and selected`, 2, [1, 2], 2, true],
])(
  `form validation: %s`,
  async (_description, required, selected, maxSelect, form_valid) => {
    const form = document.createElement(`form`)
    document.body.append(form)
    try {
      mount_multiselect({ options: [1, 2, 3], required, selected, maxSelect }, form)
      await tick()

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

test(`rejects a required count above maxSelect`, () => {
  expect(() =>
    mount_multiselect({
      options: [1, 2, 3],
      required: 2,
      selected: [1, 2],
      maxSelect: 1,
    }),
  ).toThrow(`maxSelect=1 < required=2`)
})

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
  mount_multiselect({ options, name: field_name, required: true }, form)
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
    mount_multiselect(
      {
        options,
        name: field_name,
        formSerialize: (selected: Option[]) => selected.map(String).join(`|`),
      },
      form,
    )

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
  mount_multiselect(props, form)

  // form should not be submittable due to missing required input
  expect(form.checkValidity()).toBe(false)

  props.required = false
  await tick()
  expect(form.checkValidity()).toBe(true)
})

test(`invalid=true gives top-level div class 'invalid' and input attribute of 'aria-invalid'`, async () => {
  mount_multiselect({ options: [1, 2, 3], invalid: true })

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

test(`parseLabelsAsHtml renders anchor tags as links`, () => {
  mount_multiselect({
    options: [`<a href="https://example.com">example.com</a>`],
    parseLabelsAsHtml: true,
  })

  const anchor = doc_query(`a[href='https://example.com']`)
  expect(anchor).toBeInstanceOf(HTMLAnchorElement)
})

test(`parseLabelsAsHtml rejects user-created options`, () => {
  expect(() =>
    mount_multiselect({
      options: [`safe`],
      parseLabelsAsHtml: true,
      allowUserOptions: true,
    }),
  ).toThrow(`parseLabelsAsHtml cannot be combined with allowUserOptions`)
})

test(`children snippet receives type='selected' for pills and type='option' for dropdown items`, () => {
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: {
      snippet_variant: `children`,
      options: [`Red`, `Green`, `Blue`],
      selected: [`Red`],
      open: true,
    },
  })

  const selected_span = doc_query(`ul.selected [data-testid="multiselect-child"]`)
  expect(selected_span.dataset.type).toBe(`selected`)
  expect(selected_span.textContent).toBe(`Red`)

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
      open: true,
    },
  })

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

  await focus_input()
  expect(expand.dataset.open).toBe(`true`)
})

test.each([undefined, `left`, `right`] as const)(
  `expandIconPosition=%s places expand icon around selected list`,
  (position) => {
    mount_multiselect({ options: [1, 2, 3], expandIconPosition: position })
    const [expand_icon, selected_list] = [
      doc_query(`.expand-icon`),
      doc_query(`ul.selected`),
    ]
    if (position === `right`) expect(selected_list.nextElementSibling).toBe(expand_icon)
    else expect(expand_icon.nextElementSibling).toBe(selected_list)
  },
)

test(`expandIconPosition=none suppresses default and custom expand icons`, () => {
  mount_multiselect({ options: [1, 2, 3], expandIconPosition: `none` })
  mount(TestMultiSelectSnippets, {
    target: document.body,
    props: { options: [1, 2, 3], expandIconPosition: `none` },
  })
  expect(document.querySelector(`.expand-icon`)).toBeNull()
  expect(document.querySelector(`.expand-snippet`)).toBeNull()
})

test(`expand icon click toggles dropdown in chips mode`, async () => {
  mount_multiselect({ options: [1, 2, 3] })

  const click_expand = async () => {
    doc_query(`.expand-icon`).dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
    await tick()
  }
  const input = get_input()

  for (const expanded of [`true`, `false`, `true`]) {
    await click_expand()
    expect(input.getAttribute(`aria-expanded`)).toBe(expanded)
  }

  doc_query(`div.multiselect`).dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
  await tick()
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

  mount_multiselect({ options })

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
  mount_multiselect(props)

  const input = get_input()
  await type_search_text(`al`, input)

  expect(props.matchingOptions).toEqual([options[0], options[2]])
  expect(normalized_text(doc_query(`ul.options`))).toBe(`Alpha Algae`)
})

test(`autoScroll=false skips scrolling active options into view`, async () => {
  mount_multiselect({ autoScroll: false, open: true, options: [`first`, `second`] })

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
    mount_multiselect({ open: true, options: [`Alpha`, `Beta`], ...extra_props })

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

test.each([
  [[`foo`, `bar`, `baz`]],
  [[1, 2, 3]],
  [[`foo`, 2, `baz`]],
  [[{ label: `foo` }, { label: `bar` }, { label: `baz` }]],
  [[{ label: `foo`, value: 1, key: `whatever` }]],
])(`single remove button removes 1 selected option`, async (options_set) => {
  mount_multiselect({ options: options_set, selected: [...options_set] })

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
  mount_multiselect({ options: [1, 2, 3], selected: [1, 2, 3] })
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`1 2 3`)

  doc_query<HTMLButtonElement>(remove_all_btn_selector).click()
  await tick()
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(``)
  document.body.innerHTML = `` // Clean up for next mount

  // Scenario 2: Select 2 items, button becomes visible only after 2nd selection
  mount_multiselect({ options: [1, 2, 3], selected: [] })

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

  mount_multiselect({ removeAllTitle, removeBtnTitle, options, selected: options })
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
  mount_multiselect({ options })

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

test(`autoScroll scopes active option lookup to current instance`, async () => {
  const [first_target, second_target] = [
    document.createElement(`div`),
    document.createElement(`div`),
  ]
  document.body.append(first_target, second_target)
  mount_multiselect({ options: [`first`], open: true, activeIndex: 0 }, first_target)
  mount_multiselect({ options: [`second`], open: true }, second_target)
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

test.each([2, 10])(
  `can't select more than maxSelect options`,
  async (maxSelect: number) => {
    mount_multiselect({ options: [...Array.from({ length: 10 }).keys()], maxSelect })

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
  mount_multiselect(props)

  expect(doc_query(`div.multiselect`).classList.contains(`open`)).toBe(false)

  doc_query(`ul.selected > li`).dispatchEvent(
    new MouseEvent(`mouseup`, { bubbles: true }),
  )
  await tick()

  expect(doc_query(`div.multiselect`).classList.contains(`open`)).toBe(expect_open)
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
      mount_multiselect({
        options,
        allowUserOptions: true,
        duplicates,
        duplicateOptionMsg,
        createOptionMsg,
        selected,
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
    mount_multiselect({
      options: [1, 2, 3],
      resetFilterOnAdd,
      closeDropdownOnSelect: false,
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
    mount_multiselect({
      options: [1, 2, 3],
      resetFilterOnAdd: true,
      closeDropdownOnSelect: false,
      ...props,
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

test(`disabled multiselect disables input, removal controls, and shows disabled icon`, () => {
  const disabled_input_title = `Selection unavailable`
  mount_multiselect({
    options: [1, 2, 3],
    selected: [1, 2],
    disabled: true,
    disabledInputTitle: disabled_input_title,
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
  mount_multiselect({ options: [`1`, `2`, `3`], allowUserOptions: true })

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
      mount_multiselect({ ...props, onadd: onadd_spy, open: true })
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
    mount_multiselect({ options: [1, 2, 3, 4], minSelect, selected })

    expect(document.querySelectorAll(`ul.selected button[title*='Remove']`)).toHaveLength(
      selected.length > minSelect ? selected.length : 0,
    )
  },
)

test(`remove all button does not remove items when minSelect constraint would be violated`, async () => {
  const options = [`Red`, `Green`, `Yellow`]
  const selected = [`Red`]
  const [minSelect, maxSelect] = [1, 2]

  mount_multiselect({ options, selected, minSelect, maxSelect })

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
  mount_multiselect({
    options: [`Red`, `Green`],
    selected: [`Red`, `Green`],
    minSelect: 2,
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
  mount_multiselect({
    options,
    selected: options,
    onreorder: onreorder_spy,
    onchange: onchange_spy,
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
  mount_multiselect({ options, selected: options })

  const li = doc_query(`ul.selected li`)
  li.dispatchEvent(new DragEvent(`dragenter`, {}))
  await tick()
  expect(li.classList.contains(`active`)).toBe(true)

  // user cancels the drag (Escape / drop outside list) -> dragend fires without drop
  li.dispatchEvent(new DragEvent(`dragend`, {}))
  await tick()
  expect(li.classList.contains(`active`)).toBe(false)
})

test.each([
  [
    `sorted draggable selections`,
    { options: [1, 2, 3], sortSelected: true, selectedOptionsDraggable: true },
    `sortSelected cannot be combined with selectedOptionsDraggable`,
  ],
  [
    `user-created options without a creation message`,
    { options: [1, 2, 3], createOptionMsg: ``, allowUserOptions: true },
    `requires a non-empty createOptionMsg or explicit null`,
  ],
] satisfies [string, MultiSelectProps, string][])(
  `rejects %s`,
  (_name, props, message) => {
    expect(() => mount_multiselect(props)).toThrow(message)
  },
)

test(`rejects empty options without an empty-state mode`, () => {
  expect(() => mount_multiselect({ options: [] })).toThrow(
    `MultiSelect: received no options`,
  )
})

test(`throws synchronously when adding an empty option`, () => {
  mount_multiselect({ options: [``] })
  const empty_option = doc_query<HTMLLIElement>(`ul.options > li`)
  // Invoke Svelte's delegated handler directly so a rejected promise cannot masquerade
  // as a synchronous exception.
  const event_symbol = Object.getOwnPropertySymbols(empty_option).find(
    (symbol) => symbol.description === `events`,
  )
  if (!event_symbol) throw new Error(`Svelte event handlers not found`)
  const event_handlers = (
    empty_option as HTMLLIElement & Record<symbol, { click?: unknown }>
  )[event_symbol]
  const click_handler = event_handlers.click
  if (typeof click_handler !== `function`) {
    throw new TypeError(`Svelte click handler not found`)
  }
  const click_event = new MouseEvent(`click`)

  expect(() => click_handler.call(empty_option, click_event)).toThrow(
    `MultiSelect: cannot add an empty option, got ""`,
  )
})

test.each([
  [`allowEmpty`, { allowEmpty: true }],
  [`disabled`, { disabled: true }],
  [`allowUserOptions`, { allowUserOptions: true }],
  [`loading`, { loading: true }],
] satisfies [string, Partial<MultiSelectProps>][])(
  `accepts empty options in %s mode`,
  (_name, props) => {
    expect(() => mount_multiselect({ options: [], ...props })).not.toThrow()
  },
)

test.each([
  [
    `maxSelect`,
    { options: [1], maxSelect: 0 },
    `maxSelect must be null or a positive integer`,
  ],
  [
    `selected`,
    { options: [1], selected: `not-an-array` as unknown as number[] },
    `selected prop must be an array`,
  ],
] satisfies [string, MultiSelectProps, string][])(
  `rejects an invalid %s invariant`,
  (_label, props, message) => {
    expect(() => mount_multiselect(props)).toThrow(message)
  },
)

test.each([[[1]], [[1, 2, 3]]])(
  `buttons to remove selected options have CSS class "remove"`,
  (selected) => {
    mount_multiselect({ options: selected, selected })

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

test(`rejects an object option without a label key`, () => {
  // ObjectOption requires a label, so the shape under test is only reachable past the
  // type system — which is the point: the guard exists for untyped runtime data
  expect(() => mount_multiselect({ options: [{ foo: 42 }] as never })).toThrow(
    `MultiSelect: option object must have a label key`,
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

    mount_multiselect({
      options: [1, 2, 3],
      selected: [1, 2],
      [`on${event_name}`]: spy,
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
    const [oncreate_spy, onadd_spy] = [vi.fn(), vi.fn()]

    mount_multiselect({
      options,
      allowUserOptions: true,
      oncreate: oncreate_spy,
      onadd: onadd_spy,
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
  mount_multiselect(props)

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
  mount_multiselect(props)

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
  mount_multiselect(props)

  await create_user_option(`new-item`)

  expect(props.selected).toEqual([
    expect.objectContaining({ label: `new-item`, validated: true }),
  ])
})

test(`onadd selected accumulates and onremove selected reflects removal`, async () => {
  const [onadd_spy, onremove_spy] = [vi.fn(), vi.fn()]

  mount_multiselect({ options: [1, 2, 3], onadd: onadd_spy, onremove: onremove_spy })

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
  mount_multiselect({ options: [1, 2, 3], maxSelect: 1, selected: [1], onadd: onadd_spy })

  await focus_input()
  doc_query(`ul.options li`).click()
  await tick()

  expect(onadd_spy).toHaveBeenCalledWith({ option: 2, selected: [2] })
})

test(`onopen fires once with FocusEvent, not again when already open`, async () => {
  const open_spy = vi.fn()
  mount_multiselect({ options: [1, 2, 3], onopen: open_spy })

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
  mount_multiselect({ options: [1, 2, 3], onclose: close_spy })

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
      mount_multiselect({ options, selected, keepSelectedInDropdown: mode })

      await focus_input()

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
    mount_multiselect({ options, selected: [`Apple`], keepSelectedInDropdown: false })

    await focus_input()

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
      mount_multiselect({
        options,
        selected: [`Apple`],
        keepSelectedInDropdown: mode,
        onchange: onChange_spy,
      })

      await focus_input()

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
      mount_multiselect({ options, selected: options, keepSelectedInDropdown: mode })

      await focus_input()

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
      mount_multiselect({
        options,
        selected: [`Apple`, `Banana`],
        keepSelectedInDropdown: mode,
        minSelect: 1,
      })

      await focus_input()

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
      mount_multiselect({
        options,
        selected: [`Apple`],
        keepSelectedInDropdown: mode,
        onchange: onChange_spy,
      })

      await focus_input()

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
      mount_multiselect({
        options: options_with_date,
        selected,
        keepSelectedInDropdown: mode,
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
    const props = {
      options: [`foo`],
      selected: [`foo`],
      noMatchingOptionsMsg,
      createOptionMsg,
      allowUserOptions,
    }
    if (allowUserOptions && !createOptionMsg) {
      expect(() => mount_multiselect(props)).toThrow(
        `requires a non-empty createOptionMsg or explicit null`,
      )
      return
    }
    mount_multiselect(props)

    // create a state where no options match the search text
    await type_search_text(`bar`)

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
  mount_multiselect({
    options: [`foo`, `bar`],
    selected: is_dupe_test ? [`foo`] : [],
    [prop_name]: prop_value,
  })

  const input = get_input()
  await type_search_text(is_dupe_test ? `foo` : `nonexistent`, input)

  expect(document.querySelector(`.user-msg`)).toBeNull()
})

test(`empty duplicateOptionMsg leaves no phantom navigable row`, async () => {
  // a blank message renders nothing, so it must not stay navigable either
  mount_multiselect({ options: [`ab`, `abc`], selected: [`ab`], duplicateOptionMsg: `` })
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

    mount_multiselect({ options, maxOptions })

    expect(document.querySelectorAll(`ul.options li`)).toHaveLength(
      maxOptions === null || maxOptions === undefined
        ? options.length
        : Math.min(options.length, maxOptions),
    )
  },
)

test.each([[true], [-1], [3.5], [`foo`], [{}]])(
  `rejects invalid maxOptions=%s`,
  (maxOptions) => {
    expect(() =>
      mount_multiselect({ options: [1, 2, 3], maxOptions: maxOptions as number }),
    ).toThrow(
      `MultiSelect: maxOptions must be null, undefined, or a non-negative integer`,
    )
  },
)

// A key outside 'selected' | 'option' used to appear here as two more rows, but the body
// queries one list per key and so asserted nothing for them — same mount as the `option`
// row, no expectation reached.
test.each<[OptionStyle, `selected` | `option`, string]>([
  // String style cases
  [`color: red;`, `selected`, `color: red;`],
  [`color: red;`, `option`, `color: red;`],
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
    if (expect_invalid_style_error) {
      expect(() =>
        mount_multiselect({ options, selected: key === `selected` ? options : [] }),
      ).toThrow(`MultiSelect: option style may only contain "option" and "selected" keys`)
      return
    }
    mount_multiselect({ options, selected: key === `selected` ? options : [] })

    const li = doc_query(key === `selected` ? `ul.selected > li` : `ul.options > li`)
    expect(li.style.cssText).toBe(expected_css)
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
  mount_multiselect({ options: [1, 2, 3], [prop]: css_str, selected: [1] })

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
    mount_multiselect({ options: [1, 2, 3], selected: [1] })

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
  mount_multiselect({ closeDropdownOnSelect: `retain-focus`, open: true, ...props })

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
    mount_multiselect({
      options,
      selected,
      allowUserOptions: true,
      createOptionMsg: (state: Record<string, unknown>) => {
        captured_state = state
        return `Create '${String(state.searchText)}'`
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
      mount_multiselect({
        options: [`foo`],
        allowUserOptions: true,
        createOptionMsg,
        noMatchingOptionsMsg: `No matches`,
      })

      const input = get_input()
      await type_search_text(`bar`, input)

      expect(doc_query(`ul.options li.user-msg`).textContent?.trim()).toBe(expected_text)
    },
  )

  test(`function can combine multiple state fields`, async () => {
    mount_multiselect({
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
      mount_multiselect({ options, selectAllOption })
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
      mount_multiselect({ options, ...props })
      get_input().click()
      await tick()
      expect(document.querySelector(`ul.options > li.select-all`)).toBeNull()
    },
  )

  test.each([
    [`visible`, undefined],
    [`matching`, 1],
  ] as const)(`selects all %s options and fires events`, async (scope, maxOptions) => {
    const [onselectAll_spy, onchange_spy] = [vi.fn(), vi.fn()]
    mount_multiselect({
      options,
      maxOptions,
      selectAllOption: true,
      selectAllScope: scope,
      onselectAll: onselectAll_spy,
      onchange: onchange_spy,
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
    mount_multiselect({ options: options_mixed, selectAllOption: true, maxSelect: 2 })
    const input = get_input()
    input.click()
    doc_query(`ul.options > li.select-all`).click()
    await tick()
    expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`A C`) // skipped B (disabled), limited to 2
  })

  test(`triggers onmaxreached when select_all shortcut fired at maxSelect`, async () => {
    const onmaxreached_spy = vi.fn()
    mount_multiselect({
      options: [`a`, `b`, `c`],
      selectAllOption: true,
      selected: [`a`, `b`],
      maxSelect: 2,
      shortcuts: { select_all: `ctrl+a` },
      onmaxreached: onmaxreached_spy,
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
    mount_multiselect({
      options: [`a`, `b`, `c`, `d`, `e`],
      selectAllOption: true,
      selected: [],
      maxSelect: 3,
      onmaxreached: onmaxreached_spy,
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
    mount_multiselect({
      options,
      selected: [...options],
      selectAllOption: true,
      selectAllDisabledTitle: title_prop,
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
      mount_multiselect({ options, selectAllOption: true, resetFilterOnAdd })
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
      mount_multiselect({ selectAllOption: true, ...extra_props })
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
    mount_multiselect(props)
    get_input().click()
    await tick()

    doc_query(`ul.options > li.select-all`).click()
    await tick()

    expect(onselectAll_spy).not.toHaveBeenCalled()
    expect(props.selected).toEqual([`a`, `b`])
  })

  test(`applies liSelectAllClass`, async () => {
    mount_multiselect({ options, selectAllOption: true, liSelectAllClass: `custom` })
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
    mount_multiselect({ options, selectAllOption: true, onselectAll: spy })
    get_input().click()
    doc_query(`ul.options > li.select-all`).dispatchEvent(
      new KeyboardEvent(`keydown`, { ...key_props, bubbles: true }),
    )
    await tick()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

// value initializes selected for single (maxSelect=1) and multi-select (maxSelect=null)
// alike, over string, number and object options. Each row carries its own maxSelect: a
// shared describe.each over both crossed with every value shape spent half its runs
// returning at a validity guard, reporting six passing tests that asserted nothing.
test.each<[1 | null, Option | Option[], Option[], string]>([
  [1, `Red`, [`Red`, `Green`, `Blue`], `Red`],
  [1, 1, [1, 2, 3], `1`],
  [1, { label: `Red` }, [{ label: `Red` }, { label: `Green` }], `Red`],
  [null, [`Red`, `Green`], [`Red`, `Green`, `Blue`], `Red Green`],
  [null, [1, 2], [1, 2, 3], `1 2`],
  [
    null,
    [{ label: `Red` }, { label: `Green` }],
    [{ label: `Red` }, { label: `Green` }, { label: `Blue` }],
    `Red Green`,
  ],
])(
  `maxSelect=%s initializes selected from value=%j`,
  (max_select, value, options, expected_text) => {
    mount_multiselect({ options, value, maxSelect: max_select })

    expect(doc_query(`ul.selected`).textContent?.trim()).toBe(expected_text)
  },
)

test(`createOptionMsg shows immediately with static options`, async () => {
  mount_multiselect({
    options: [`Apple`, `Banana`],
    allowUserOptions: true,
    createOptionMsg: `Create this option`,
    open: true,
  })
  await tick()
  const input = get_input()
  await type_search_text(`Cherry`, input)
  expect(document.querySelector(`.user-msg`)?.textContent?.trim()).toBe(
    `Create this option`,
  )
})

// https://github.com/janosh/svelte-widgets/issues/369
describe(`binding update event count`, () => {
  test(`onchange fires 0 times on init and exactly once per selection`, async () => {
    const onchange_spy = vi.fn()

    mount_multiselect({ options: [1, 2, 3], onchange: onchange_spy })
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
  const component_source = readFileSync(
    `${import.meta.dirname}/../../src/lib/MultiSelect.svelte`,
    `utf-8`,
  )
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

describe(`onsearch event`, () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test(`fires debounced when search text changes (including clearing)`, async () => {
    const onsearch_spy = vi.fn()

    mount_multiselect({ options: [1, 2, 3, 10, 20, 30], onsearch: onsearch_spy })

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

    mount_multiselect({ options: [1, 2, 3], onsearch: onsearch_spy })

    await tick()

    // Advance timers past the debounce period
    await vi.advanceTimersByTimeAsync(200)

    expect(onsearch_spy).not.toHaveBeenCalled()
  })

  test(`debounce resets when typing continues`, async () => {
    const onsearch_spy = vi.fn()

    mount_multiselect({ options: [`apple`, `apricot`, `banana`], onsearch: onsearch_spy })

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
      mount_multiselect({
        options,
        maxSelect: 2,
        selected,
        onmaxreached: onmaxreached_spy,
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

    mount_multiselect({
      options: [1, 2, 3, 4, 5],
      maxSelect,
      selected,
      onmaxreached: onmaxreached_spy,
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

    mount_multiselect({
      options: [1, 2, 3],
      duplicates,
      selected: [1],
      onduplicate: onduplicate_spy,
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

      mount_multiselect({
        options,
        duplicates: false,
        selected,
        onduplicate: onduplicate_spy,
        allowUserOptions: true,
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
    const [onduplicate_spy, onmaxreached_spy] = [vi.fn(), vi.fn()]

    mount_multiselect({
      options: [1, 2, 3],
      duplicates: false,
      maxSelect: 2,
      selected: [1, 2],
      onduplicate: onduplicate_spy,
      onmaxreached: onmaxreached_spy,
      allowUserOptions: true,
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

    mount_multiselect({ options, onactivate: onactivate_spy, open: true })

    const input = await focus_input()

    input.dispatchEvent(new KeyboardEvent(`keydown`, { key, bubbles: true }))
    await tick()

    expect(onactivate_spy).toHaveBeenCalledTimes(1)
    expect(onactivate_spy).toHaveBeenCalledWith(expected)
  })

  test(`pointer and focus activation do not fire onactivate`, async () => {
    const onactivate_spy = vi.fn()

    mount_multiselect({ options: [1, 2, 3], onactivate: onactivate_spy, open: true })

    await focus_input()

    doc_query(`ul.options`).dispatchEvent(new MouseEvent(`mousemove`, { bubbles: true }))
    const option3 = doc_query(`ul.options li:nth-child(3)`)
    option3.dispatchEvent(fresh_mouseover())
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

    mount_multiselect({ options: [1, 2, 3], onactivate: onactivate_spy, open: true })

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

    mount_multiselect({
      options: [],
      onactivate: onactivate_spy,
      allowUserOptions: true,
      createOptionMsg: `Create this option...`,
      open: true,
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

    mount_multiselect({
      options: [1, 2, 3],
      noMatchingOptionsMsg: ``, // Disable "no matching" message
      allowUserOptions: false,
      onactivate: onactivate_spy,
      open: true,
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
    mount_multiselect({ options })
    const items = document.querySelectorAll(`ul.options > li`)
    expect(items).toHaveLength(3)
  })

  test(`can select multiple case-variant options`, async () => {
    const props = $state<MultiSelectProps>({ options: object_options, selected: [] })
    mount_multiselect(props)

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
    mount_multiselect(props)

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
    mount_multiselect({
      options: [`Apple`, `Banana`],
      selected: [`Apple`],
      duplicates: `case-insensitive`,
      duplicateOptionMsg: `Already selected`,
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

    const [onadd_spy, onduplicate_spy] = [vi.fn(), vi.fn()]

    mount_multiselect({
      options,
      selected: [options[0]], // preselect first option
      onadd: onadd_spy,
      onduplicate: onduplicate_spy,
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
    mount_multiselect({ options, selected: [options[0]], duplicates: `case-insensitive` })

    get_input().focus()
    await tick()

    expect(
      document.querySelectorAll(`ul.options > li.selected[title="Already selected"]`),
    ).toHaveLength(3)
  })
})

test(`dropdown has no li children when all user-created options are selected`, async () => {
  mount_multiselect({
    allowUserOptions: `append`,
    noMatchingOptionsMsg: ``,
    createOptionMsg: null,
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
  mount_multiselect({ options: [1, 2, 3], selected: [1, 2, 3], onreorder: onreorder_spy })

  const data_transfer = new DataTransfer()
  data_transfer.setData(`text/plain`, drag_data)
  doc_query(`ul.selected li:nth-child(2)`).dispatchEvent(
    new DragEvent(`drop`, { dataTransfer: data_transfer }),
  )
  await tick()

  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`1 2 3`)
  expect(onreorder_spy).not.toHaveBeenCalled()
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
    mount_multiselect({ options })
    expect(document.querySelectorAll(`ul.options > li`)).toHaveLength(options.length)
  })

  test(`duplicate options get unique DOM ids, aria-posinset, and hover indices`, async () => {
    mount_multiselect({ options: [`a`, `a`, `b`] })
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
      mount_multiselect({
        options,
        selected: [...options],
        maxVisibleChips: max_visible_chips,
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
    mount_multiselect({ options, selected: [...options].slice(0, 3), maxVisibleChips })
    expect(document.querySelector(`li.more-chip`)).toBeNull()
    expect(chips()).toHaveLength(3)
  })

  test(`keyboard chip navigation auto-expands hidden chips`, async () => {
    mount_multiselect({ options, selected: [...options], maxVisibleChips: 2 })
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

  test(`rejects invalid maxVisibleChips`, () => {
    expect(() =>
      mount_multiselect({ options, selected: [...options], maxVisibleChips: -2 }),
    ).toThrow(`maxVisibleChips must be null or a non-negative integer`)
  })
})

// every string MultiSelect renders itself must be overridable for i18n (issue #451)
describe(`labels`, () => {
  const options = [`a`, `b`, `c`]

  test(`chip overflow toggle is configurable, omitted keys keep English`, async () => {
    mount_multiselect({
      options,
      selected: [...options],
      maxVisibleChips: 1,
      labels: { more_chips: (hidden) => `noch ${hidden}` },
    })

    const toggle = doc_query<HTMLButtonElement>(`li.more-chip button.more-chips`)
    expect(toggle.textContent?.trim()).toBe(`noch 2`)

    toggle.click()
    await tick()
    expect(toggle.textContent?.trim()).toBe(`show less`)
  })

  test.each([
    [
      `chip list aria-label`,
      { selected_options: `ausgewählte Optionen` },
      { options },
      () => doc_query(`ul.selected`).getAttribute(`aria-label`),
      `ausgewählte Optionen`,
    ],
    [
      `remove-button title composed with removeBtnTitle`,
      { remove_option: (btn: string, label: string) => `${label} ${btn}` },
      { options, selected: [`a`], removeBtnTitle: `entfernen` },
      () => doc_query(`ul.selected button.remove`).getAttribute(`title`),
      `a entfernen`,
    ],
    [
      `group header aria-label`,
      { group: (name: string) => `Gruppe: ${name}` },
      { options: [{ label: `a`, group: `G` }], open: true },
      () => doc_query(`ul.options > li.group-header`).getAttribute(`aria-label`),
      `Gruppe: G`,
    ],
    [
      `group option count`,
      { group_count: (sel: number, total: number) => `${sel} von ${total}` },
      {
        options: [
          { label: `a`, group: `G` },
          { label: `b`, group: `G` },
        ],
        open: true,
      },
      () => doc_query(`li.group-header .group-count`).textContent?.trim(),
      `0 von 2`,
    ],
    [
      `group select-all button`,
      { group_select_all: `Alle` },
      { options: [{ label: `a`, group: `G` }], open: true, groupSelectAll: true },
      () => doc_query(`button.group-select-all`).textContent?.trim(),
      `Alle`,
    ],
    [
      `checkbox aria-label`,
      { toggle_option: (label: string) => `${label} umschalten` },
      { options, open: true, keepSelectedInDropdown: `checkboxes` as const },
      () => doc_query(`ul.options input[type="checkbox"]`).getAttribute(`aria-label`),
      `a umschalten`,
    ],
    [
      `idle live-region option count`,
      { options_available: (count: number) => `${count} Optionen` },
      { options, open: true },
      () => doc_query(`.sr-only[aria-live="polite"]`).textContent?.trim(),
      `3 Optionen`,
    ],
  ])(`%s`, (_desc, labels, props, read_dom, expected) => {
    mount_multiselect({ ...props, labels })
    expect(read_dom()).toBe(expected)
  })

  test(`live-region announcements are configurable`, async () => {
    // only option_selected is overridden, so the removal announcement must stay English
    mount_multiselect({
      options,
      labels: { option_selected: (label) => `${label} gewählt` },
    })
    await focus_input()

    doc_query<HTMLLIElement>(`ul.options > li[role="option"]`).click()
    await tick()
    const live_region = doc_query(`.sr-only[aria-live="polite"]`)
    expect(live_region.textContent?.trim()).toBe(`a gewählt`)

    doc_query<HTMLButtonElement>(`ul.selected button.remove`).click()
    await tick()
    expect(live_region.textContent?.trim()).toBe(`a removed`)
  })

  test(`bulk announcements are configurable and pluralize`, async () => {
    mount_multiselect({
      options,
      selected: [...options],
      labels: { options_removed: (count) => `${count} entfernt` },
    })

    doc_query<HTMLButtonElement>(`button.remove-all`).click()
    await tick()
    const live_region = doc_query(`.sr-only[aria-live="polite"]`)
    expect(live_region.textContent?.trim()).toBe(`3 entfernt`)
  })

  test.each([
    [1, null, `Bitte etwas wählen`],
    [2, null, `Bitte mindestens 2 wählen`],
    [2, 3, `Bitte 2 bis 3 wählen`], // omitted select_between falls back to English
  ])(
    `form validity message for required=%s maxSelect=%s`,
    async (required, maxSelect, expected) => {
      mount_multiselect({
        options,
        required,
        maxSelect,
        labels: {
          select_an_option: `Bitte etwas wählen`,
          select_at_least: (min) => `Bitte mindestens ${min} wählen`,
          select_between: (min, max) => `Bitte ${min} bis ${max} wählen`,
        },
      })
      await tick() // bind:this on the hidden form control lands in a post-mount effect

      // happy-dom's validationMessage getter ignores setCustomValidity, so spy on the call
      const form_control = doc_query<HTMLInputElement>(`input.form-control`)
      const set_validity = vi.spyOn(form_control, `setCustomValidity`)
      form_control.dispatchEvent(new Event(`invalid`))
      expect(set_validity).toHaveBeenCalledWith(expected)
    },
  )
})

test(`whitespace-only search shows all options instead of a blank dropdown`, async () => {
  mount_multiselect({ options: [1, 2, 3], open: true })
  const input = get_input()
  await type_search_text(`  `, input)

  expect(document.querySelectorAll(`ul.options li[role='option']`)).toHaveLength(3)
  expect(document.querySelector(`ul.options li.user-msg`)).toBeNull()
})

test(`sortSelected orders chips before clearing the accepted search`, async () => {
  let search_seen_by_comparator: string | undefined
  const props = $state<Test2WayBindProps>({
    options: [`a`, `b`, `c`],
    searchText: ``,
    selectedOptionsDraggable: false,
  })
  props.sortSelected = (opt_1: Option, opt_2: Option) => {
    search_seen_by_comparator = props.searchText
    return `${get_label(opt_2)}`.localeCompare(`${get_label(opt_1)}`)
  }
  mount(Test2WayBind, { target: document.body, props })

  for (const label of [`a`, `c`]) {
    const li = [
      ...document.querySelectorAll<HTMLLIElement>(`ul.options li[role='option']`),
    ].find((el) => el.textContent?.trim() === label)
    li?.click()
    await tick()
  }
  props.searchText = `b`
  await tick()
  doc_query<HTMLLIElement>(`ul.options li[role='option']`).click()
  await tick()

  expect(search_seen_by_comparator).toBe(`b`)
  expect(props.searchText).toBe(``)
  expect(normalized_text(doc_query(`ul.selected`))).toBe(`c b a`)
})
