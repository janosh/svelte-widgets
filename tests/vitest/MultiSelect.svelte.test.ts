import { readFileSync } from 'node:fs'
import { tick, type ComponentProps } from 'svelte'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { Option, OptionStyle } from '$lib'
import type { MultiSelectProps } from '$lib/types'
import { get_label } from '$lib/utils'
import {
  click,
  create_element,
  doc_query,
  drag_event,
  press_key,
  stub_css_highlights,
  stub_props,
  type Test2WayBindProps,
} from './index'
import Test2WayBind from './Test2WayBind.svelte'
import TestMultiSelectSnippets from './TestMultiSelectSnippets.svelte'
import {
  focus_input,
  fresh_key,
  fresh_mousemove,
  get_input,
  make_form,
  mount_component as mount,
  mount_multiselect,
  normalized_text,
  press_sequence,
  type_search_text,
} from './MultiSelect.test-utils'

const mount_snippets = (props: ComponentProps<typeof TestMultiSelectSnippets>) =>
  mount(TestMultiSelectSnippets, { target: document.body, props })
const mount_2way = (props: Test2WayBindProps) =>
  mount(Test2WayBind, { target: document.body, props })

test(`2-way binding preserves a valid initial auto-active index`, async () => {
  const props = $state<MultiSelectProps>({
    options: [`Alpha`, `Beta`, `Gamma`],
    active_index: 1,
    active_option: null,
    auto_active_first_option: true,
    search_text: `a`,
  })

  mount_multiselect(props)
  await tick()
  expect(props.active_index).toBe(1)

  // internal changes bind outward
  for (const idx of [1, 2]) {
    const li = doc_query(`ul.options li:nth-child(${idx})`)
    li.dispatchEvent(fresh_mousemove())
    await tick()

    expect(props.active_index).toEqual(idx - 1)
    expect(props.active_option).toBe(props.options?.[idx - 1])
  }

  // external changes bind inward
  props.active_index = 2
  await tick()

  expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(`Gamma`)
})

test(`clears active state when replacement identity is ambiguous`, async () => {
  const props = $state<MultiSelectProps>({
    options: [{ label: `Duplicate` }, { label: `Duplicate` }],
    active_index: 1,
    active_option: null,
    key: () => `duplicate`,
  })
  mount_multiselect(props)
  await tick()

  props.options = [{ label: `Duplicate` }, { label: `Duplicate` }]
  await tick()

  expect(props.active_index).toBeNull()
  expect(props.active_option).toBeNull()
})

test(`default_disabled_title and custom per-option disabled titles are applied correctly`, () => {
  const default_disabled_title = `Not selectable`
  const special_disabled_title = `Special disabled title`
  const options = [1, 2, 3].map((el) => ({
    label: el,
    disabled: true,
    disabled_title: el > 1 ? undefined : special_disabled_title,
  }))

  mount_multiselect({ options, default_disabled_title })

  const lis = document.querySelectorAll<HTMLLIElement>(`ul.options > li`)

  expect(lis).toHaveLength(3)
  expect([...lis].map((li) => li.title)).toEqual([
    special_disabled_title,
    default_disabled_title,
    default_disabled_title,
  ])
})

test(`applies DOM attributes to input node`, () => {
  // key order matches the DOM readback below
  const attrs = {
    search_text: `1`,
    id: `fancy-id`,
    autocomplete: `on`,
    placeholder: `fancy placeholder`,
    name: `fancy-name`,
    inputmode: `tel`,
    pattern: `(reg)[ex]`,
  } as const
  mount_multiselect({ options: [1, 2, 3], ...attrs })

  expect(document.querySelectorAll(`ul.options > li`)).toHaveLength(1)
  const { value, id, autocomplete, placeholder, inputMode, pattern } = get_input()
  const { name } = doc_query<HTMLInputElement>(`input.form-control`)
  expect([value, id, autocomplete, placeholder, name, inputMode, pattern]).toEqual(
    Object.values(attrs),
  )
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

    await click(`ul.options li`)

    expect(input.placeholder).toBe(expected_after)
  },
)

test(`applies custom classes for styling through CSS frameworks`, async () => {
  const prop_elem_map = {
    input: HTMLInputElement,
    li_option: HTMLLIElement,
    li_active_option: HTMLLIElement,
    li_selected: HTMLLIElement,
    outer_div: HTMLDivElement,
    ul_options: HTMLUListElement,
    ul_selected: HTMLUListElement,
    max_select_msg: HTMLSpanElement,
    li_select_all: HTMLLIElement,
  }
  const css_classes = Object.fromEntries(
    Object.keys(prop_elem_map).map((cls) => [`${cls}_class`, cls]),
  )

  mount_multiselect({
    options: [1, 2, 3],
    ...css_classes,
    value: [1],
    max_select: 2,
    select_all_option: true,
  })

  // hover to make an option active
  document
    .querySelector(`ul.options > li[role='option']:not(.select-all)`)
    ?.dispatchEvent(fresh_mousemove())
  await tick()

  expect(doc_query(`.max_select_msg`).textContent?.trim()).toBe(`1/2`)
  for (const [class_name, elem_type] of Object.entries(prop_elem_map)) {
    const el = doc_query(`.${class_name}`)

    expect(el).toBeInstanceOf(elem_type)
  }
})

test.each([
  // click, keyup and mouse events are covered by the handler-forwarding table below
  [`blur`, FocusEvent],
  [`focus`, FocusEvent],
  [`keydown`, KeyboardEvent],
])(`bubbles <input> node "%s" event`, async (name, event_class) => {
  const spy = vi.fn()
  mount_multiselect({ options: [1, 2, 3], [`on${name}`]: spy })

  const input = get_input()
  input.focus() // blur needs focus before it can lose it
  if (name === `blur`) input.blur()
  else if (name === `keydown`) input.dispatchEvent(fresh_key(`Enter`))
  await tick()
  expect(spy, `event type '${name}'`).toHaveBeenCalledExactlyOnceWith(
    expect.any(event_class),
  )
})

test.each([`single`, `multiple`] as const)(
  `value is the sole controlled state in %s mode`,
  async (mode) => {
    const props =
      mode === `single`
        ? { options: [0, 1, 2], mode, value: 0 }
        : { options: [0, 1, 2], mode, value: [0, 1] }
    const select = mount_2way(props)
    expect(select.value).toEqual(props.value)
    select.value = mode === `single` ? 2 : [2]
    await tick()
    expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`2`)
    select.value = mode === `single` ? null : []
    await tick()
    expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(0)
  },
)

test.each([
  { mode: `single`, trigger: `click` },
  { mode: `single`, trigger: `Enter` },
  { mode: `multiple`, trigger: `click` },
  { mode: `multiple`, trigger: `Enter` },
] as const)(
  `$mode mode with one selected item handles $trigger according to its mode`,
  async ({ mode, trigger }) => {
    const on_max_reached = vi.fn()
    const props = $state<MultiSelectProps>(
      mode === `single`
        ? {
            options: [`Alpha`, `Beta`],
            mode,
            value: `Alpha`,
            active_index: 0,
            on_max_reached,
          }
        : {
            options: [`Alpha`, `Beta`],
            mode,
            value: [`Alpha`],
            max_select: 1,
            active_index: 0,
            on_max_reached,
          },
    )
    mount_multiselect(props)
    await tick()
    expect(doc_query(`ul.options`).getAttribute(`aria-multiselectable`)).toBe(
      String(mode === `multiple`),
    )
    expect(doc_query(`div.multiselect`).classList.contains(`single`)).toBe(
      mode === `single`,
    )
    if (trigger === `click`) doc_query(`ul.options > li`).click()
    else get_input().dispatchEvent(fresh_key(`Enter`))
    await tick()
    expect(props.value).toEqual(mode === `single` ? `Beta` : [`Alpha`])
    expect(on_max_reached).toHaveBeenCalledTimes(mode === `single` ? 0 : 1)
    if (mode === `multiple`)
      expect(on_max_reached).toHaveBeenCalledWith({
        selected: [`Alpha`],
        max_select: 1,
        attempted_option: `Beta`,
      })
  },
)

test(`multiple mode with a one-item limit supports the select-all shortcut`, async () => {
  const props = $state<MultiSelectProps>({
    options: [`Alpha`, `Beta`],
    value: [],
    max_select: 1,
    select_all_option: true,
    shortcuts: { select_all: `ctrl+a` },
  })
  mount_multiselect(props)
  await tick()
  expect(document.querySelector(`li.select-all`)).not.toBeNull()
  press_key(get_input(), `a`, { ctrlKey: true })
  await tick()
  expect(props.value).toEqual([`Alpha`])
})

test.each([0, ``])(`single mode preserves falsy value %j`, (value) => {
  const select = mount_2way({ options: [value, `other`], mode: `single`, value })
  expect(select.value).toBe(value)
})

// untyped runtime data can bypass the prop types, so every contradiction must fail on mount
test.each<[string, Record<string, unknown>, string]>([
  [
    `array value in single mode`,
    { mode: `single`, value: [`Red`] },
    `value must be an option or null`,
  ],
  [
    `scalar value in multiple mode`,
    { mode: `multiple`, value: `Red` },
    `value must be an array`,
  ],
  [
    `max_select in single mode`,
    { mode: `single`, max_select: 2 },
    `max_select is only available in multiple mode`,
  ],
  [`removed selected prop`, { selected: [`Red`] }, `use value instead of selected`],
  [`max_select=0`, { max_select: 0 }, `max_select must be null or a positive integer`],
  [
    `required above max_select`,
    { required: 2, value: `Red`, mode: `single` },
    `max_select=1 < required=2`,
  ],
  [
    `input display in multiple mode`,
    { selected_display: `input` },
    `selected_display="input" requires mode="single"`,
  ],
  [
    `sorted draggable selections`,
    { sort_selected: true, selected_options_draggable: true },
    `sort_selected cannot be combined with selected_options_draggable`,
  ],
  [
    `user options without a creation message`,
    { create_option_msg: ``, allow_user_options: true },
    `requires a non-empty create_option_msg or explicit null`,
  ],
  [
    `object option without a label`,
    { options: [{ foo: 42 }] },
    `MultiSelect: option object must have a label key`,
  ],
  [
    `unknown option style key`,
    { options: [{ label: `foo`, style: { invalid: `color: green;` } }] },
    `MultiSelect: option style may only contain "option" and "selected" keys`,
  ],
  [
    `negative max_visible_chips`,
    { max_visible_chips: -2 },
    `max_visible_chips must be null or a non-negative integer`,
  ],
])(`rejects %s`, (_desc, props, message) => {
  expect(() => mount_multiselect({ options: [`Red`], ...props })).toThrow(message)
})

describe(`selected_display=input`, () => {
  const color_options = [`Red`, `Green`, `Blue`]
  const input_display_props = {
    mode: `single` as const,
    selected_display: `input`,
  } satisfies Pick<MultiSelectProps, `mode` | `selected_display`>

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
    props: Partial<Extract<Test2WayBindProps, { mode: `single` }>> = {},
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
      const select = mount_input_display({ options, close_dropdown_on_select: false })

      await click(`ul.options > li`)

      const input = get_input()
      expect(input.value).toBe(expected)
      expect(select.search_text).toBe(expected)
      expect(select.value).toEqual(expected_value)
      expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(0)
      expect(document.querySelector(`ul.options li.user-msg`)).toBeNull()
    },
  )

  test(`editing committed text clears selected and value while preserving draft text`, async () => {
    const select = mount_input_display({ options: [`Red`, `Green`], value: `Red` })
    await tick()

    const input = get_input()
    expect(input.value).toBe(`Red`)

    await type_search_text(`Reddish`, input)

    expect(input.value).toBe(`Reddish`)
    expect(select.search_text).toBe(`Reddish`)
    expect(select.value).toBeNull()
  })

  test(`typing exact option label does not auto-select without explicit commit`, async () => {
    const select = mount_input_display({ options: [`Red`, `Green`] })

    await type_search_text(`Red`)

    expect(select.search_text).toBe(`Red`)
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
    expect(select.search_text).toBe(`Green`)
    expect(select.value).toEqual(options[1])

    select.value = null
    await tick()

    expect(input.value).toBe(``)
    expect(select.search_text).toBe(``)
    expect(select.value).toBeNull()
  })

  test.each<[string, (input: HTMLInputElement) => Promise<unknown>]>([
    [`caret click`, click_expand_icon],
    [`input focus`, focus_input],
    [
      `ArrowDown`,
      async (input) => {
        input.focus()
        await press_sequence(input, `ArrowDown`)
      },
    ],
  ])(
    `reopening after commit via %s shows all options with selected option marked`,
    async (_, reopen) => {
      mount_input_display({ options: color_options })

      await click(option_by_label(`Red`))

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
    const form = make_form()
    const select = mount_input_display(
      { options: color_options, value: `Red`, name: `color`, required: true, open: true },
      form,
    )
    await tick()

    await click(option_by_label(`Green`))

    expect(get_input().value).toBe(`Green`)
    expect(select.value).toBe(`Green`)
    expect(form.checkValidity()).toBe(true)
    expect(new FormData(form).get(`color`)).toBe(`Green`)
  })

  test.each([false, true])(
    `typing after committed input text filters results with beforeinput=%s`,
    async (beforeinput) => {
      const onbeforeinput = vi.fn()
      const select = mount_input_display({
        options: color_options,
        value: `Red`,
        open: true,
        onbeforeinput,
      })
      await tick()

      expect(option_labels()).toEqual(color_options)

      const input = get_input()
      onbeforeinput.mockImplementation(() => select.value)
      if (beforeinput) {
        const event = new InputEvent(`beforeinput`, {
          bubbles: true,
          inputType: `insertText`,
        })
        input.dispatchEvent(event)
        expect(onbeforeinput).toHaveBeenCalledExactlyOnceWith(event)
        expect(onbeforeinput).toHaveReturnedWith(null)
      }
      await type_search_text(`Bl`, input)

      expect(option_labels()).toEqual([`Blue`])
      expect(document.querySelector(`ul.options > li.selected`)).toBeNull()
      expect(select.search_text).toBe(`Bl`)
      expect(select.value).toBeNull()

      await click_expand_icon()

      expect(input.getAttribute(`aria-expanded`)).toBe(`false`)

      await click_expand_icon()

      expect(option_labels()).toEqual(color_options)
    },
  )

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
    expect(select.value).toBeNull()

    await click(option_by_label(`Green`))

    expect(input.value).toBe(`Green`)
    expect(select.search_text).toBe(`Green`)
    expect(select.value).toBe(`Green`)
  })

  test(`keyboard selection keeps aria-activedescendant valid and Escape preserves text`, async () => {
    const select = mount_input_display({ options: [`Red`, `Green`], open: true })
    const input = get_input()

    press_key(input, `ArrowDown`)
    await tick()
    const active_id = input.getAttribute(`aria-activedescendant`)
    expect(active_id).toBeTypeOf(`string`)
    expect(document.querySelector(`#${active_id}`)).toBeInstanceOf(HTMLLIElement)

    press_key(input, `Enter`)
    await tick()
    expect(input.value).toBe(`Red`)
    expect(select.value).toBe(`Red`)
    expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(0)

    press_key(input, `Escape`)
    await tick()
    expect(input.value).toBe(`Red`)
    expect(input.getAttribute(`aria-expanded`)).toBe(`false`)
  })

  test(`Backspace edits text normally instead of removing hidden chips`, async () => {
    const select = mount_input_display({ options: [`Red`, `Green`], value: `Red` })
    await tick()
    const input = get_input()

    expect(press_key(input, `Backspace`).defaultPrevented).toBe(false)

    await type_search_text(`Re`, input)

    expect(input.value).toBe(`Re`)
    expect(select.search_text).toBe(`Re`)
    expect(select.value).toBeNull()
    expect(document.querySelectorAll(`ul.selected > li.highlighted`)).toHaveLength(0)
    expect(input.getAttribute(`aria-activedescendant`)).toBeNull()
  })

  test(`form submits visible text for draft and object-option values`, async () => {
    const form = make_form()
    const options = [
      { label: `Red`, value: `#f00` },
      { label: `Green`, value: `#0f0` },
    ]
    mount_multiselect(
      { ...input_display_props, options, name: `color`, required: true },
      form,
    )

    const input = get_input()
    expect(form.checkValidity()).toBe(false)

    await type_search_text(`custom color`, input)
    expect(form.checkValidity()).toBe(true)
    expect(new FormData(form).get(`color`)).toBe(`custom color`)

    await type_search_text(``, input)
    await click(`ul.options > li`)
    expect(new FormData(form).get(`color`)).toBe(`Red`)
  })

  test(`input_props forwards text-input attributes without overriding managed ARIA`, () => {
    mount_multiselect({
      ...input_display_props,
      options: [`Red`],
      input_props: {
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
      allow_user_options: true,
      create_option_msg: null,
      no_matching_options_msg: ``,
    })
    const input = await type_search_text(`Durian`)
    expect(document.querySelector(`ul.options li.user-msg`)).toBeNull()

    press_key(input, `Enter`)
    await tick()

    expect(input.value).toBe(`Durian`)
    expect(select.value).toBe(`Durian`)
    expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(0)
  })

  test(`keep_selected_in_dropdown does not toggle away committed input selection`, async () => {
    const select = mount_input_display({
      options: [`Red`, `Green`],
      keep_selected_in_dropdown: `plain`,
      value: `Red`,
      open: true,
    })
    await tick()

    await click(`ul.options > li.selected`)

    expect(select.value).toBe(`Red`)
    expect(get_input().value).toBe(`Red`)
  })

  test(`load_options searches empty for committed text and the draft once edited`, async () => {
    vi.useFakeTimers()
    const fetch_fn = vi.fn(() =>
      Promise.resolve({ options: [`Alpha`, `Beta`], has_more: false }),
    )
    mount_multiselect({
      ...input_display_props,
      value: `Alpha`,
      load_options: { fetch: fetch_fn, debounce_ms: 0 },
    })
    const input = get_input()

    input.focus()
    await vi.runAllTimersAsync()
    expect(fetch_fn).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ search: ``, offset: 0, limit: 50 }),
    )

    await type_search_text(`Al`, input)
    await vi.runAllTimersAsync()
    expect(fetch_fn).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: `Al`, offset: 0, limit: 50 }),
    )
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
  async (_description, required, selected, max_select, form_valid) => {
    const form = make_form()
    mount_multiselect({ options: [1, 2, 3], required, value: selected, max_select }, form)
    await tick()
    expect(form.checkValidity()).toBe(form_valid)
  },
)

test.each([
  [[1, 2, 3]],
  [[`a`, `b`, `c`]],
  [[{ label: `a` }, { label: `b` }, { label: `c` }]],
])(`submits selected options=%j as JSON`, async (options) => {
  const form = make_form()
  mount_multiselect({ options, name: `choices`, required: true }, form)
  expect(form.checkValidity()).toBe(false)

  for (const _ of options) {
    await click(`ul.options li`)
  }
  expect(form.checkValidity()).toBe(true)
  // parse rather than compare the JSON text, which is brittle to key order and spacing
  const submitted = new FormData(form).get(`choices`)
  if (typeof submitted !== `string`) throw new Error(`expected a string form value`)
  expect(JSON.parse(submitted)).toEqual(options)
})

test(`form_serialize customizes chip-mode form values`, async () => {
  const form = make_form()
  const options = [`Red`, `Green`]
  mount_multiselect(
    {
      options,
      name: `choices`,
      form_serialize: (selected: Option[]) => selected.map(String).join(`|`),
    },
    form,
  )
  for (const _ of options) {
    await click(`ul.options li`)
  }
  expect(new FormData(form).get(`choices`)).toBe(`Red|Green`)
})

test(`toggling required after invalid form submission allows submitting`, async () => {
  // https://github.com/janosh/svelte-widgets/issues/285
  const form = make_form()

  const props = $state({ options: [1, 2, 3], required: true })
  mount_multiselect(props, form)

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

  await click(`ul.options > li`)

  expect(input.getAttribute(`aria-invalid`)).toBeNull()
  expect(multiselect.classList.contains(`invalid`)).toBe(false)
})

test(`option labels render markup as text`, () => {
  const label = `<a href="https://example.com">example.com</a>`
  mount_multiselect({ options: [label], allow_user_options: true })
  expect(doc_query(`ul.options`).textContent).toContain(label)
  expect(document.querySelector(`a[href='https://example.com']`)).toBeNull()
})

test(`children snippet receives type='selected' for pills and type='option' for dropdown items`, () => {
  mount_snippets({
    snippet_variant: `children`,
    options: [`Red`, `Green`, `Blue`],
    value: [`Red`],
    open: true,
  })

  const selected_span = doc_query(`ul.selected [data-testid="multiselect-child"]`)
  expect(selected_span.dataset.type).toBe(`selected`)
  expect(selected_span.textContent).toBe(`Red`)

  const option_spans = document.querySelectorAll<HTMLElement>(
    `ul.options [data-testid="multiselect-child"]`,
  )
  // selected items stay out of the dropdown unless keep_selected_in_dropdown is set
  expect([...option_spans].map((span) => [span.dataset.type, span.textContent])).toEqual([
    [`option`, `Green`],
    [`option`, `Blue`],
  ])
})

test(`option snippet receives selected, active, and disabled booleans`, async () => {
  mount_snippets({
    snippet_variant: `option`,
    options: [
      { label: `Enabled`, value: 1 },
      { label: `Disabled`, value: 2, disabled: true },
    ],
    value: [{ label: `Enabled`, value: 1 }],
    keep_selected_in_dropdown: `plain`,
    open: true,
  })

  // [selected, disabled, active] per rendered option snippet
  const option_states = () =>
    [
      ...document.querySelectorAll<HTMLElement>(
        `ul.options [data-testid="multiselect-option"]`,
      ),
    ].map(({ dataset }) => [dataset.selected, dataset.disabled, dataset.active])
  // keep_selected_in_dropdown is why an already-selected option still shows in the list
  expect(option_states()).toEqual([
    [`true`, `false`, `false`],
    [`false`, `true`, `false`],
  ])

  doc_query(`ul.options > li`).dispatchEvent(fresh_mousemove())
  await tick()
  expect(option_states()).toEqual([
    [`true`, `false`, `true`],
    [`false`, `true`, `false`],
  ])
})

test(`expand_icon snippet receives open and disabled, open toggles when dropdown opens`, async () => {
  mount_snippets({ options: [1, 2, 3], disabled: true })
  const disabled_expand = doc_query(`.expand-snippet`)
  expect(disabled_expand.dataset.disabled).toBe(`true`)
  expect(disabled_expand.dataset.open).toBe(`false`)

  document.body.innerHTML = ``
  mount_snippets({ options: [1, 2, 3] })
  const expand = doc_query(`.expand-snippet`)
  expect(expand.dataset.open).toBe(`false`)

  await focus_input()
  expect(expand.dataset.open).toBe(`true`)
})

test.each([undefined, `left`, `right`] as const)(
  `expand_icon_position=%s places expand icon around selected list`,
  (position) => {
    mount_multiselect({ options: [1, 2, 3], expand_icon_position: position })
    const [expand_icon, selected_list] = [
      doc_query(`.expand-icon`),
      doc_query(`ul.selected`),
    ]
    if (position === `right`) expect(selected_list.nextElementSibling).toBe(expand_icon)
    else expect(expand_icon.nextElementSibling).toBe(selected_list)
  },
)

test(`expand_icon_position=none suppresses default and custom expand icons`, () => {
  mount_multiselect({ options: [1, 2, 3], expand_icon_position: `none` })
  mount_snippets({ options: [1, 2, 3], expand_icon_position: `none` })
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

test(`remove_icon snippet receives option for per-item and is_remove_all flag`, async () => {
  mount_snippets({ options: [1, 2, 3], value: [1, 2] })
  await tick()

  const remove_spans = [...document.querySelectorAll<HTMLElement>(`.remove-snippet`)]
  // per-option removes first, then the remove-all button
  expect(
    remove_spans.map(({ dataset }) => [dataset.isRemoveAll, dataset.option]),
  ).toEqual([
    [`false`, `1`],
    [`false`, `2`],
    [`true`, undefined],
  ])
  expect(document.querySelectorAll(`button.remove.default-icon`)).toHaveLength(0)
})

test(`before_input and after_input snippets receive search_text and flank the input`, async () => {
  mount_snippets({ options: [1, 2, 3] })

  const search_texts = () =>
    [`.before-input-snippet`, `.after-input-snippet`].map(
      (selector) => doc_query(selector).dataset.searchText,
    )
  expect(search_texts()).toEqual([``, ``])

  const input = get_input()
  expect(doc_query(`.before-input-snippet`).nextElementSibling).toBe(input)
  expect(input.nextElementSibling).toBe(doc_query(`.after-input-snippet`))

  await type_search_text(`test`, input)
  expect(search_texts()).toEqual([`test`, `test`])
})

test(`selected_item snippet receives selected option and index`, async () => {
  mount_snippets({ options: [`red`, `blue`], value: [`red`, `blue`] })
  await tick()

  const selected_items = [
    ...document.querySelectorAll<HTMLElement>(`.selected-item-snippet`),
  ]
  expect(selected_items.map((item) => item.textContent)).toEqual([`red`, `blue`])
  expect(selected_items.map((item) => item.dataset.idx)).toEqual([`0`, `1`])
})

test(`user_msg snippet receives search text, message type, and message`, async () => {
  mount_snippets({ options: [`red`], allow_user_options: true, open: true })

  await type_search_text(`purple`)

  const user_msg = doc_query(`.user-msg-snippet`)
  expect(user_msg.dataset.searchText).toBe(`purple`)
  expect(user_msg.dataset.msgType).toBe(`create`)
  expect(user_msg.textContent).toBe(`Create this option...`)
})

test.each([
  [`spinner`, { loading: true }, `.spinner-snippet`, `loading`],
  [`disabled_icon`, { disabled: true }, `.disabled-icon-snippet`, `disabled`],
])(`%s snippet replaces default icon`, (_label, props, selector, text) => {
  mount_snippets({ options: [1, 2, 3], ...props })

  expect(doc_query(selector).textContent).toBe(text)
})

test(`filters dropdown to show only matching options when entering text`, async () => {
  mount_multiselect({ options: [`foo`, `bar`, `baz`] })
  await type_search_text(`ba`)
  expect(normalized_text(doc_query(`ul.options`))).toBe(`bar baz`)
})

test(`filter_func controls rendered options and matching_options`, async () => {
  const options = [`Alpha`, `Beta`, `Algae`]
  const filter_func = vi.fn((opt: Option, search_text: string) =>
    `${get_label(opt)}`.toLowerCase().startsWith(search_text.toLowerCase()),
  )
  const props = $state<MultiSelectProps>({
    filter_func,
    value: [],
    matching_options: [],
    open: true,
    options,
  })
  mount_multiselect(props)

  await type_search_text(`al`)

  expect(props.matching_options).toEqual([options[0], options[2]])
  expect(normalized_text(doc_query(`ul.options`))).toBe(`Alpha Algae`)
  filter_func.mockClear()
  props.value = [options[0]]
  await tick()
  expect(props.matching_options).toEqual([options[2]])
  expect(normalized_text(doc_query(`ul.options`))).toBe(`Algae`)
  expect(filter_func).not.toHaveBeenCalled()
})

test(`auto_scroll=false skips scrolling active options into view`, async () => {
  mount_multiselect({ auto_scroll: false, open: true, options: [`first`, `second`] })

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
  [
    `highlight_matches=false suppresses highlighting`,
    { highlight_matches: false },
    false,
  ],
  [`typed search text is highlighted`, {}, true],
  // after committing, search_text is "Alpha" but no longer an active filter: highlighting
  // follows the effective filter text, not the raw search_text
  [
    `committed selected_display=input text is not highlighted`,
    {
      mode: `single` as const,
      selected_display: `input`,
      close_dropdown_on_select: false,
    },
    false,
  ],
] as const)(`%s`, async (_desc, extra_props, expect_highlight) => {
  const { set_spy, delete_spy } = stub_css_highlights()
  mount_multiselect({ open: true, options: [`Alpha`, `Beta`], ...extra_props })

  if (`selected_display` in extra_props) {
    await click(`ul.options > li`)
    expect(get_input().value).toBe(`Alpha`)
  } else await type_search_text(`Al`)

  if (expect_highlight) expect(set_spy).toHaveBeenCalled()
  else {
    expect(set_spy).not.toHaveBeenCalled()
    expect(delete_spy).not.toHaveBeenCalled()
  }
})

test.each([undefined, `Custom no options message`])(
  `shows no_matching_options_msg when no options match search_text`,
  async (no_matching_options_msg) => {
    const on_change = vi.fn()
    mount_multiselect({ options: [1, 2, 3], no_matching_options_msg, on_change })

    await type_search_text(`4`)

    const expected_msg = no_matching_options_msg ?? `No matching options`
    expect(doc_query(`ul.options`).textContent?.trim()).toBe(expected_msg)
    const no_match_li = doc_query(`ul.options li.user-msg`)
    expect(no_match_li.textContent?.trim()).toBe(expected_msg)

    await click(no_match_li) // the message row is not an option, so it must not select
    expect(on_change).not.toHaveBeenCalled()
  },
)

test.each([
  [[`foo`, `bar`, `baz`]],
  [[1, 2, 3]],
  [[`foo`, 2, `baz`]],
  [[{ label: `foo` }, { label: `bar` }, { label: `baz` }]],
  [[{ label: `foo`, value: 1, key: `whatever` }]],
])(`single remove button removes 1 selected option`, async (options_set) => {
  mount_multiselect({ options: options_set, value: [...options_set] })

  await click(`ul.selected button[title='Remove ${get_label(options_set[0])}']`)

  const remaining_labels = options_set.slice(1).map(get_label).join(` `)
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(remaining_labels)
  expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(
    options_set.length - 1,
  )
})

test(`remove all button removes all selected options and is visible only if more than 1 option is selected`, async () => {
  const remove_all_btn_selector = `button[title='Remove all']`

  // several selected: the custom-titled buttons are visible and remove-all removes all
  mount_multiselect({
    options: [1, 2, 3],
    value: [1, 2, 3],
    remove_all_title: `Clear`,
    remove_btn_title: `Drop`,
  })
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`1 2 3`)
  expect(
    [...document.querySelectorAll<HTMLButtonElement>(`ul.selected > li > button`)].map(
      (btn) => btn.title,
    ),
  ).toEqual([`Drop 1`, `Drop 2`, `Drop 3`])

  await click(`button[title='Clear']`)
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(``)
  document.body.innerHTML = `` // Clean up for next mount

  // the button appears only on the 2nd selection
  mount_multiselect({ options: [1, 2, 3], value: [] })

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
    await click(li_to_click)
  }

  const selected_ul = doc_query(`ul.selected`)

  expect(selected_ul.textContent?.trim()).toBe(`2 3`)
})

test(`auto_scroll scopes active option lookup to current instance`, async () => {
  const [first_target, second_target] = [create_element(), create_element()]
  mount_multiselect({ options: [`first`], open: true, active_index: 0 }, first_target)
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
  `can't select more than max_select options`,
  async (max_select: number) => {
    mount_multiselect({ options: [...Array.from({ length: 10 }).keys()], max_select })

    // click the first rendered option 10 times: selects 0..max_select-1, then no-ops
    for (const _ of Array.from({ length: 10 })) {
      document.querySelector<HTMLLIElement>(`ul.options > li`)?.click()
      await tick()
    }

    expect(doc_query(`ul.selected`).textContent?.trim()).toEqual(
      [...Array.from({ length: max_select }).keys()].join(` `),
    )
  },
)

// https://github.com/janosh/svelte-widgets/issues/353
test.each([
  {
    name: `stays closed when can_remove is true`,
    props: { options: [1, 2, 3], value: [1, 2] },
    expect_open: false,
  },
  {
    name: `opens when min_select prevents removal`,
    props: {
      options: [`Red`, `Green`, `Yellow`],
      value: `Red`,
      min_select: 1,
      mode: `single` as const,
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
  `shows correct message when search_text is already selected for options=%j`,
  (options, selected) => {
    const duplicate_option_msg = `This is already selected`
    const create_option_msg = `Create this option...`

    test.each([
      [false, duplicate_option_msg], // duplicates=false shows duplicate warning
      [true, `${selected[0]} ${create_option_msg}`], // duplicates=true shows option + create msg
    ])(`allow_user_options=true, duplicates=%s`, async (duplicates, expected_text) => {
      mount_multiselect({
        options,
        allow_user_options: true,
        duplicates,
        duplicate_option_msg,
        create_option_msg,
        value: selected,
      })

      // typing the selected value triggers the duplicate/create check
      await type_search_text(`${selected[0]}`)
      expect(normalized_text(doc_query(`ul.options`))).toBe(expected_text)
    })
  },
)

test.each([
  [true, ``, `click`],
  [false, `1`, `click`],
  [true, ``, `enter`],
  [false, `1`, `enter`],
] as const)(
  `reset_filter_on_add=%j clears input (expected=%j) on %s`,
  async (reset_filter_on_add, expected, method) => {
    mount_multiselect({
      options: [1, 2, 3],
      reset_filter_on_add,
      close_dropdown_on_select: false,
    })

    const input = await type_search_text(`1`)

    if (method === `click`) await click(`ul.options li`)
    else await press_sequence(input, `ArrowDown`, `Enter`)

    expect(input.value).toBe(expected)
  },
)

test.each<{
  case_name: string
  props: MultiSelectProps
  search_text: string
  expected_selected_count: number
}>([
  {
    case_name: `max_select constraint prevents add`,
    props: { value: [1, 2], max_select: 2 },
    search_text: `3`,
    expected_selected_count: 2,
  },
  {
    case_name: `min_select constraint prevents remove`,
    props: { value: [1], min_select: 1, keep_selected_in_dropdown: `plain` },
    search_text: `1`,
    expected_selected_count: 1,
  },
])(
  `reset_filter_on_add=true preserves search_text when $case_name`,
  async ({ props, search_text, expected_selected_count }) => {
    mount_multiselect({
      options: [1, 2, 3],
      reset_filter_on_add: true,
      close_dropdown_on_select: false,
      ...props,
    })

    const input = await type_search_text(search_text)

    await press_sequence(input, `ArrowDown`, `Enter`)

    expect(input.value).toBe(search_text)
    expect(document.querySelectorAll(`ul.selected li`)).toHaveLength(
      expected_selected_count,
    )
  },
)

test.each([
  [null, [1, 2]],
  [1, 2],
  [2, [1, 2]],
])(
  `1-way (outward) binding of value works when max_select=%s, expected value=%s`,
  async (max_select, expected) => {
    const on_value_changed = vi.fn()
    mount_2way({
      options: [1, 2, 3],
      ...(max_select === 1 ? { mode: `single` } : { mode: `multiple`, max_select }),
      onValueChanged: on_value_changed,
    })

    // internal changes bind outward
    for (const _ of [1, 2]) await click(`ul.options li`)

    expect(on_value_changed).toHaveBeenLastCalledWith(expected)
  },
)

test(`disabled multiselect disables input, removal controls, and shows disabled icon`, () => {
  const disabled_input_title = `Selection unavailable`
  mount_multiselect({
    options: [1, 2, 3],
    value: [1, 2],
    disabled: true,
    disabled_input_title,
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
  // allow_user_options=true (not 'append'): user options are selected without joining the
  // dropdown list, and remove() must still delete them
  mount_multiselect({ options: [`1`, `2`, `3`], allow_user_options: true })

  await type_search_text(`foo`)

  await click(`ul.options li[title='Create this option...']`)
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`foo`)

  await click(`ul.selected li button[title*='Remove']`)

  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(``)
})

// https://github.com/janosh/svelte-widgets/issues/409
// whitespace-only input must never be added (was coerced via Number("  ") / key 0 duplicates)
test.each([
  {
    label: `string options`,
    props: { options: [`a`, `b`], allow_user_options: true } satisfies MultiSelectProps,
  },
  {
    label: `numeric options`,
    props: { options: [1, 2, 3], allow_user_options: true } satisfies MultiSelectProps,
  },
  {
    label: `empty options hides dropdown`,
    props: { options: [], allow_user_options: true } satisfies MultiSelectProps,
    search: ` `,
    hide_dropdown: true,
  },
  {
    label: `load_options empty (double Enter)`,
    props: {
      load_options: {
        fetch: vi.fn().mockResolvedValue({ options: [], has_more: false }),
        debounce_ms: 0,
      },
      allow_user_options: true,
    } satisfies MultiSelectProps,
    double_enter: true,
  },
])(
  `whitespace-only input rejected: $label`,
  async ({ props, search = `    `, double_enter = false, hide_dropdown = false }) => {
    const uses_timers = `load_options` in props
    if (uses_timers) vi.useFakeTimers()
    const onadd_spy = vi.fn()
    mount_multiselect({ ...props, on_add: onadd_spy, open: true })
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
  },
)

test.each([[[1]], [[1, 2]], [[1, 2, 3]]])(
  `does not render remove buttons if selected.length <= min_select`,
  (selected) => {
    const min_select = 2
    mount_multiselect({ options: [1, 2, 3, 4], min_select, value: selected })

    const can_remove = selected.length > min_select
    expect(document.querySelectorAll(`ul.selected button[title*='Remove']`)).toHaveLength(
      can_remove ? selected.length : 0,
    )
    // [1, 2] hides remove-all because of min_select, not the single-selection rule
    expect(document.querySelectorAll(`button.remove-all`)).toHaveLength(
      Number(can_remove),
    )
  },
)

test(`remove all button does not remove items when min_select constraint would be violated`, async () => {
  const options = [`Red`, `Green`, `Yellow`]
  const selected = [`Red`]
  const [min_select, max_select] = [1, 2]

  mount_multiselect({ options, value: selected, min_select, max_select })

  expect(document.querySelector(`button.remove-all`)).toBeNull()

  const input = get_input()
  input.focus()
  // Red is already selected so it is filtered out of the dropdown: this Enter adds
  // Green, pushing selected past min_select and bringing the remove-all button back
  await press_sequence(input, `ArrowDown`, `Enter`)

  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`Red Green`)

  // doc_query throws if the button is still hidden, so this is the visibility assertion
  await click(`button.remove-all`)

  // min_select=1 keeps the first item
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`Red`)
})

// simulate a real chip drag: dragstart on the source li, then drop on the target
async function drag_chip(source_idx: number, target_idx: number) {
  const transfer = new DataTransfer()
  doc_query(`ul.selected li:nth-child(${source_idx + 1})`).dispatchEvent(
    drag_event(`dragstart`, transfer),
  )
  doc_query(`ul.selected li:nth-child(${target_idx + 1})`).dispatchEvent(
    drag_event(`drop`, transfer),
  )
  await tick()
}

// https://github.com/janosh/svelte-widgets/issues/176 (reorder)
// https://github.com/janosh/svelte-widgets/issues/371 (on_reorder/on_change events)
test(`dragging selected options across each other reorders them and fires on_reorder + on_change`, async () => {
  const options = [1, 2, 3]
  const [onreorder_spy, onchange_spy] = [vi.fn(), vi.fn()]
  mount_multiselect({
    options,
    value: options,
    on_reorder: onreorder_spy,
    on_change: onchange_spy,
  })
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`1 2 3`)

  await drag_chip(1, 0)
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`2 1 3`)
  expect(onreorder_spy).toHaveBeenCalledExactlyOnceWith({
    options: [2, 1, 3],
    previous: [1, 2, 3],
  })
  expect(onchange_spy).toHaveBeenCalledExactlyOnceWith({
    options: [2, 1, 3],
    type: `reorder`,
  })

  await drag_chip(0, 1)
  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`1 2 3`)
  expect(onreorder_spy).toHaveBeenLastCalledWith({
    options: [1, 2, 3],
    previous: [2, 1, 3],
  })
})

test(`canceled drag clears the active drop-target highlight`, async () => {
  const options = [1, 2, 3]
  mount_multiselect({ options, value: options })

  const li = doc_query(`ul.selected li`)
  li.dispatchEvent(drag_event(`dragenter`, new DataTransfer()))
  await tick()
  expect(li.classList.contains(`active`)).toBe(true)

  // user cancels the drag (Escape / drop outside list) -> dragend fires without drop
  li.dispatchEvent(drag_event(`dragend`, new DataTransfer()))
  await tick()
  expect(li.classList.contains(`active`)).toBe(false)
})

test(`throws synchronously when adding an empty option`, () => {
  mount_multiselect({ options: [``] })
  const empty_option = doc_query<HTMLLIElement>(`ul.options > li`)
  // invoke Svelte's delegated handler directly so a rejected promise can't look synchronous
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

test.each([[[1]], [[1, 2, 3]]])(
  `buttons to remove selected options have CSS class "remove"`,
  (selected) => {
    mount_multiselect({ options: selected, value: selected })

    expect(document.querySelectorAll(`ul.selected button.remove`)).toHaveLength(
      selected.length,
    )

    expect(document.querySelectorAll(`button.remove.remove-all`)).toHaveLength(
      selected.length > 1 ? 1 : 0,
    )

    // without remove_icon snippet, all remove buttons get default-icon class
    expect(document.querySelectorAll(`button.remove.default-icon`)).toHaveLength(
      selected.length + (selected.length > 1 ? 1 : 0),
    )
  },
)

// options: [1,2,3], selected: [1,2] → clicking ul.options li adds 3,
// clicking ul.selected button.remove removes 1, clicking button.remove-all removes all
test.each([
  [`add`, `ul.options li`, { option: 3 }],
  [`change`, `ul.options li`, { option: 3, type: `add` }],
  [`remove`, `ul.selected button.remove`, { option: 1 }],
  [`change`, `ul.selected button.remove`, { option: 1, type: `remove` }],
  [`remove_all`, `button.remove-all`, { options: [1, 2] }], // removed options
  [`change`, `button.remove-all`, { options: [], type: `remove_all` }], // remaining selected
])(
  `fires %s event with expected payload when clicking %s`,
  (event_name, selector, expected) => {
    const spy = vi.fn()

    mount_multiselect({
      options: [1, 2, 3],
      value: [1, 2],
      [`on_${event_name}`]: spy,
    })

    doc_query(selector).click()

    expect(spy, `event type '${event_name}'`).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][0]).toEqual(expect.objectContaining(expected))
  },
)

async function create_user_option(search_text: string): Promise<void> {
  await type_search_text(search_text)
  await click(`ul.options li.user-msg`)
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
  `fires on_create event with correct payload when user creates new option for different option types`,
  async (options, search_text, expected_created_option) => {
    const [oncreate_spy, onadd_spy] = [vi.fn(), vi.fn()]

    mount_multiselect({
      options,
      allow_user_options: true,
      on_create: oncreate_spy,
      on_add: onadd_spy,
    })

    await create_user_option(search_text)

    expect(oncreate_spy).toHaveBeenCalledExactlyOnceWith({
      option: expected_created_option,
    })

    // a user-created option fires on_add as well, not just on_create
    expect(onadd_spy).toHaveBeenCalledExactlyOnceWith({
      option: expected_created_option,
      selected: [expected_created_option],
    })
  },
)

test.each<[string, boolean | `append`]>([
  [`allow_user_options=true`, true],
  [`allow_user_options=append`, `append`],
])(`on_create returning false rejects option (%s)`, async (_label, mode) => {
  const onadd_spy = vi.fn()
  const initial_options = [`a`, `b`]
  const props = $state<MultiSelectProps>({
    options: [...initial_options],
    value: [],
    allow_user_options: mode,
    on_create: () => false,
    on_add: onadd_spy,
  })
  mount_multiselect(props)

  await create_user_option(`rejected`)

  expect(onadd_spy).not.toHaveBeenCalled()
  expect(props.value).toEqual([])
  if (mode === `append`) expect(props.options).toEqual(initial_options)
})

test(`allow_user_options=append keeps created options selectable after removal`, async () => {
  const props = $state<MultiSelectProps>({
    options: [`a`, `b`],
    value: [],
    allow_user_options: `append`,
  })
  mount_multiselect(props)

  await create_user_option(`foobar`)

  expect(props.options).toEqual([`a`, `b`, `foobar`])
  expect(props.value).toEqual([`foobar`])

  await click(`ul.selected button.remove`)
  expect(props.value).toEqual([])

  await type_search_text(`foobar`)

  const appended_option = doc_query(`ul.options > li:not(.user-msg)`)
  expect(appended_option.textContent?.trim()).toBe(`foobar`)
  await click(appended_option)
  expect(props.value).toEqual([`foobar`])
})

// string transforms and false/undefined returns are covered by the
// `sync on_create regression` table in the async-on_create describe
test(`on_create returning an object transforms the option`, async () => {
  const props = $state<MultiSelectProps>({
    options: [{ label: `existing`, value: 1 }],
    value: [],
    allow_user_options: `append`,
    on_create: ({ option }: { option: Option }) => ({
      ...(typeof option === `object` && option),
      label: typeof option === `object` ? option.label : option,
      validated: true,
    }),
  })
  mount_multiselect(props)

  await create_user_option(`new-item`)

  expect(props.value).toEqual([
    expect.objectContaining({ label: `new-item`, validated: true }),
  ])
})

test(`on_add selected accumulates and on_remove selected reflects removal`, async () => {
  const [onadd_spy, onremove_spy] = [vi.fn(), vi.fn()]

  mount_multiselect({ options: [1, 2, 3], on_add: onadd_spy, on_remove: onremove_spy })

  const input = await focus_input()
  await click(`ul.options li`)
  expect(onadd_spy).toHaveBeenLastCalledWith({ option: 1, selected: [1] })

  input.focus()
  await tick()
  await click(`ul.options li`)
  expect(onadd_spy).toHaveBeenLastCalledWith({ option: 2, selected: [1, 2] })

  doc_query(`ul.selected button.remove`).click()
  expect(onremove_spy).toHaveBeenCalledExactlyOnceWith({ option: 1, selected: [2] })
})

test(`on_add selected reflects replacement when max_select=1`, async () => {
  const onadd_spy = vi.fn()
  mount_multiselect({
    options: [1, 2, 3],
    mode: `single` as const,
    value: 1,
    on_add: onadd_spy,
  })

  await focus_input()
  await click(`ul.options li`)

  expect(onadd_spy).toHaveBeenCalledWith({ option: 2, selected: [2] })
})

test(`on_open and on_close fire once per transition with the triggering event`, async () => {
  const open_spy = vi.fn()
  const close_spy = vi.fn()
  mount_multiselect({ options: [1, 2, 3], on_open: open_spy, on_close: close_spy })

  // still closed, so an outside click must not fire
  await click(document.body)
  expect(close_spy).not.toHaveBeenCalled()

  const input = await focus_input()
  expect(open_spy).toHaveBeenCalledOnce()
  expect(open_spy.mock.calls[0][0].event).toBeInstanceOf(FocusEvent)

  // already open, so a second click must not re-fire
  input.dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
  await tick()
  expect(open_spy).toHaveBeenCalledOnce()
  await press_sequence(input, `Escape`)
  expect(close_spy).toHaveBeenCalledOnce()
  expect(close_spy.mock.calls[0][0].event).toBeInstanceOf(KeyboardEvent)

  // closed again, so no extra fire
  await click(document.body)
  expect(close_spy).toHaveBeenCalledOnce()
})

// The dropdown {#each} was hardened against duplicate key() results; the chips loop was
// not, so two selected entries sharing a key threw each_key_duplicate on mount.
test.each([
  [
    `duplicate preselected options`,
    {
      options: [{ label: `x` }],
      value: [{ label: `x` }, { label: `x` }],
    },
  ],
  [`a selected array with repeats`, { options: [`a`], value: [`a`, `a`] }],
])(`renders chips sharing one key without crashing (%s)`, async (_case, props) => {
  mount_multiselect(props)
  await tick()
  expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(2)
})

describe(`keep_selected_in_dropdown feature`, () => {
  const options = [`Apple`, `Banana`, `Cherry`]
  const keep_selected_modes = [`plain`, `checkboxes`] as const
  type KeepSelectedMode = (typeof keep_selected_modes)[number]
  const option_items = (): HTMLElement[] =>
    Array.from(document.querySelectorAll<HTMLElement>(`ul.options > li`))
  const option_by_label = (label: string): HTMLElement | undefined =>
    option_items().find((option_item) => option_item.textContent?.includes(label))

  const click_keep_selected_option = (
    option: HTMLElement | undefined,
    mode: KeepSelectedMode,
  ) => click(mode === `checkboxes` ? option?.querySelector(`.option-checkbox`) : option)

  test.each(
    keep_selected_modes.flatMap((mode) =>
      [false, true].map((colliding_keys) => ({ mode, colliding_keys })),
    ),
  )(
    `keeps selection accurate with $mode and colliding keys=$colliding_keys`,
    async ({ mode, colliding_keys }) => {
      const props = $state<MultiSelectProps>({
        options,
        value: [`Apple`],
        matching_options: [],
        keep_selected_in_dropdown: mode,
        duplicates: colliding_keys,
        key: colliding_keys ? () => `shared` : undefined,
      })
      mount_multiselect(props)

      await focus_input()

      // [selected class, checkbox state] per row; plain mode renders no checkbox
      const box = (checked: boolean) => (mode === `checkboxes` ? checked : undefined)
      expect(
        option_items().map((li) => [
          li.classList.contains(`selected`),
          li.querySelector<HTMLInputElement>(`.option-checkbox`)?.checked,
        ]),
      ).toEqual([
        [true, box(true)],
        [false, box(false)],
        [false, box(false)],
      ])
      const [apple_option, banana_option] = [`Apple`, `Banana`].map(option_by_label)
      const { matching_options } = props
      for (const selected_after_click of [true, false]) {
        await click_keep_selected_option(banana_option, mode)
        expect(apple_option?.classList.contains(`selected`)).toBe(true)
        expect(banana_option?.classList.contains(`selected`)).toBe(selected_after_click)
      }
      // toggling must not re-filter, which would regroup and rebuild every row
      expect(props.matching_options).toBe(matching_options)
    },
  )

  // the box is one-way bound with no change handler, so a native click flipped it before the
  // <li> toggle ran; on a refusal Svelte saw no new value to write and the box stayed wrong
  test.each([
    // max_select 1 replaces rather than refuses, so a real refusal needs a full multi-select
    [
      `max_select reached`,
      { max_select: 2, value: [`Apple`, `Banana`] },
      `Cherry`,
      false,
    ],
    [`min_select reached`, { min_select: 1, value: [`Apple`] }, `Apple`, true],
    [
      `disabled option`,
      { options: [`Apple`, { label: `Banana`, disabled: true }] },
      `Banana`,
      false,
    ],
  ])(
    `checkbox stays in sync when a toggle is refused (%s)`,
    async (_case, props, label, expected_checked) => {
      mount_multiselect({ options, keep_selected_in_dropdown: `checkboxes`, ...props })
      await focus_input()

      const option = option_by_label(label)
      const checkbox = option?.querySelector<HTMLInputElement>(`.option-checkbox`)
      expect(checkbox?.checked).toBe(expected_checked)

      await click_keep_selected_option(option, `checkboxes`)

      // the refusal held, so the box must still show the unchanged selection
      expect(checkbox?.checked).toBe(expected_checked)
      expect(option?.classList.contains(`selected`)).toBe(expected_checked)
    },
  )

  test.each(
    keep_selected_modes.flatMap((mode) =>
      [`pointer`, `keyboard`].map((interaction) => ({ mode, interaction })),
    ),
  )(
    `toggles option selection with $interaction in $mode mode`,
    async ({ mode, interaction }) => {
      const on_change = vi.fn()
      mount_multiselect({
        options,
        value: [`Apple`],
        keep_selected_in_dropdown: mode,
        on_change,
      })
      const input = await focus_input()
      for (const [label, type] of [
        [`Apple`, `remove`],
        [`Banana`, `add`],
      ]) {
        const option = option_by_label(label)
        if (interaction === `keyboard`) await press_sequence(input, `ArrowDown`, `Enter`)
        else await click_keep_selected_option(option, mode)
        expect(on_change).toHaveBeenLastCalledWith({ option: label, type })
        expect(option?.classList.contains(`selected`)).toBe(type === `add`)
      }
    },
  )

  test.each(keep_selected_modes)(
    `respects min_select constraint when toggling in %s mode`,
    async (mode) => {
      mount_multiselect({
        options,
        value: [`Apple`, `Banana`],
        keep_selected_in_dropdown: mode,
        min_select: 1,
      })

      await focus_input()

      // removing Apple is allowed, Banana remains
      const apple_option = option_by_label(`Apple`)
      await click_keep_selected_option(apple_option, mode)
      expect(apple_option?.classList.contains(`selected`)).toBe(false)

      // removing Banana too is blocked by min_select=1
      const banana_option = option_by_label(`Banana`)
      await click_keep_selected_option(banana_option, mode)
      expect(banana_option?.classList.contains(`selected`)).toBe(true)
    },
  )

  test.each(keep_selected_modes)(
    `search filters selected and unselected options alike in %s mode`,
    async (mode) => {
      mount_multiselect({
        options: [`Apple`, `Banana`, `Cherry`, `Date`],
        value: [`Apple`, `Cherry`],
        keep_selected_in_dropdown: mode,
      })
      await type_search_text(`a`)
      expect(option_items().map((li) => li.textContent?.trim())).toEqual([
        `Apple`,
        `Banana`,
        `Date`,
      ])
    },
  )
})

// all 2x2x2 combos of allow_user_options x no_matching_options_msg x create_option_msg:
// .user-msg only renders when the applicable message prop is truthy
test.each(
  [true, false].flatMap((allow_user_options) =>
    [``, `no matches`].flatMap((no_matching_options_msg) =>
      [`make option`, ``].map(
        (create_option_msg) =>
          [allow_user_options, no_matching_options_msg, create_option_msg] as const,
      ),
    ),
  ),
)(
  `user-msg rendering with allow_user_options=%s, no_matching_options_msg=%s, create_option_msg=%s`,
  async (allow_user_options, no_matching_options_msg, create_option_msg) => {
    const props = {
      options: [`foo`],
      value: [`foo`],
      no_matching_options_msg,
      create_option_msg,
      allow_user_options,
    }
    if (allow_user_options && !create_option_msg) {
      expect(() => mount_multiselect(props)).toThrow(
        `requires a non-empty create_option_msg or explicit null`,
      )
      return
    }
    mount_multiselect(props)

    // no option matches this search text
    await type_search_text(`bar`)

    if (allow_user_options && create_option_msg) {
      expect(doc_query(`.user-msg`).textContent?.trim()).toBe(create_option_msg)
    } else if (no_matching_options_msg) {
      expect(doc_query(`.user-msg`).textContent?.trim()).toBe(no_matching_options_msg)
    } else {
      expect(document.querySelector(`.user-msg`)).toBeNull()
    }
  },
)

// Issue #364: empty message props should not render <li> element
test.each([
  [`duplicate_option_msg`, ``],
  [`duplicate_option_msg`, null],
  [`no_matching_options_msg`, ``],
  [`no_matching_options_msg`, null],
])(`no .user-msg node is rendered when %s=%j`, async (prop_name, prop_value) => {
  const is_dupe_test = prop_name === `duplicate_option_msg`
  mount_multiselect({
    options: [`foo`, `bar`],
    value: is_dupe_test ? [`foo`] : [],
    [prop_name]: prop_value,
  })

  await type_search_text(is_dupe_test ? `foo` : `nonexistent`)

  expect(document.querySelector(`.user-msg`)).toBeNull()
})

test(`empty duplicate_option_msg leaves no phantom navigable row`, async () => {
  // a blank message renders nothing, so it must not stay navigable either
  mount_multiselect({ options: [`ab`, `abc`], value: [`ab`], duplicate_option_msg: `` })
  const input = await type_search_text(`ab`)
  input.dispatchEvent(fresh_key(`ArrowDown`))
  await press_sequence(input, `ArrowDown`)
  // 'abc' at index 0 is the only match, so the second ArrowDown has nowhere to go;
  // without the fix it lands on the blank row and points at an unrendered element
  const active_id = input.getAttribute(`aria-activedescendant`) ?? ``
  expect(active_id).toMatch(/-opt-0$/u)
  expect(document.querySelector(`#${CSS.escape(active_id)}`)).not.toBeNull()
})

test.each([[0], [1], [5], [undefined]])(
  `renders at most max_options options, or all when max_options is undefined`,
  (max_options) => {
    const options = [`foo`, `bar`, `baz`]

    mount_multiselect({ options, max_options })

    expect(document.querySelectorAll(`ul.options li`)).toHaveLength(
      Math.min(options.length, max_options ?? Infinity),
    )
  },
)

test.each([[true], [-1], [3.5], [`foo`], [{}]])(
  `rejects invalid max_options=%s`,
  (max_options) => {
    expect(() =>
      mount_multiselect({ options: [1, 2, 3], max_options: max_options as number }),
    ).toThrow(
      `MultiSelect: max_options must be null, undefined, or a non-negative integer`,
    )
  },
)

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
])(`option style %j applies %j to the %s <li>`, (style, key, expected_css) => {
  const options: Option[] = [{ label: `foo`, style }]
  mount_multiselect({ options, value: key === `selected` ? options : [] })

  const li = doc_query(key === `selected` ? `ul.selected > li` : `ul.options > li`)
  expect(li.style.cssText).toBe(expected_css)
})

test.each([
  [`style`, `div.multiselect`],
  [`ul_selected_style`, `ul.selected`],
  [`ul_options_style`, `ul.options`],
  [`li_selected_style`, `ul.selected > li`],
  [`li_option_style`, `ul.options > li`],
  [`input_style`, `input[autocomplete]`],
])(`MultiSelect applies style props to the correct element`, (prop, css_selector) => {
  const css_str = `font-weight: bold; color: red;`
  mount_multiselect({ options: [1, 2, 3], [prop]: css_str, value: [1] })

  expect(doc_query(css_selector).style.cssText, prop).toContain(css_str)
})

test.each([
  { prop: `li_selected_style`, css_selector: `ul.selected > li` },
  { prop: `li_option_style`, css_selector: `ul.options > li` },
])(
  `MultiSelect doesn't add style attribute to element '$css_selector' if '$prop' prop not passed`,
  ({ prop, css_selector }) => {
    mount_multiselect({ options: [1, 2, 3], value: [1] })

    expect(doc_query(css_selector).hasAttribute(`style`), prop).toBe(false)
  },
)

// the default breakpoint is 800px, so 600 is mobile and 800 already counts as desktop
test.each([
  [true, 600, true],
  [false, 600, false],
  [`if-mobile`, 600, true],
  [`if-mobile`, 800, false],
  [`if-mobile`, 1024, false],
  [`retain-focus`, 600, true],
] as const)(
  `close_dropdown_on_select=%s at %ipx wide closes the dropdown: %s`,
  async (close_dropdown_on_select, innerWidth, should_be_closed) => {
    stub_props(globalThis, { innerWidth })
    mount_multiselect({ options: [1, 2, 3], close_dropdown_on_select, open: true })
    const input = get_input()
    if (close_dropdown_on_select === `retain-focus`) input.focus()

    doc_query(`ul.options > li`).click()
    await tick() // let happy-dom settle document.activeElement after add()'s input.focus()

    expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(1)
    expect(doc_query(`ul.options`).classList.contains(`hidden`)).toBe(should_be_closed)
    // focus tracking is reliable only for the close path in happy-dom
    if (close_dropdown_on_select === `retain-focus`)
      expect(document.activeElement).toBe(input)
    else if (should_be_closed) expect(document.activeElement).not.toBe(input)
    else expect([input, document.body]).toContain(document.activeElement)
  },
)

const mount_retain_focus = (props: MultiSelectProps = {}) =>
  mount_multiselect({ close_dropdown_on_select: `retain-focus`, open: true, ...props })

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
      await press_sequence(input_el, `ArrowDown`)
      return doc_query(`ul.options > li.active`).textContent?.trim()
    },
    expected_option: `Solid`,
  },
] as const)(
  `close_dropdown_on_select='retain-focus' reopens on $reopen_method after keyboard selection`,
  async ({ reopen_action, expected_option }) => {
    mount_retain_focus({ options: [`Svelte`, `Solid`, `React`] })

    const input_el = get_input()
    const dropdown = doc_query(`ul.options`)
    input_el.focus()
    await press_sequence(input_el, `ArrowDown`, `Enter`)

    expect(document.activeElement).toBe(input_el)
    expect(dropdown.classList).toContain(`hidden`)

    const reopened_option = await reopen_action(input_el)

    expect(dropdown.classList).not.toContain(`hidden`)
    expect(reopened_option).toBe(expected_option)
  },
)

test(`close_dropdown_on_select='retain-focus' clears active create message after creating an option`, async () => {
  mount_retain_focus({ options: [`apple`, `banana`, `cherry`], allow_user_options: true })

  const input_el = get_input()
  const dropdown = doc_query(`ul.options`)
  input_el.focus()
  await type_search_text(`app`, input_el)
  await press_sequence(input_el, `ArrowDown`, `ArrowDown`)

  expect(doc_query(`ul.options li.user-msg`).classList).toContain(`active`)

  await press_sequence(input_el, `Enter`)

  expect(dropdown.classList).toContain(`hidden`)
  expect(document.activeElement).toBe(input_el)

  await type_search_text(`b`, input_el)

  expect(dropdown.classList).not.toContain(`hidden`)
  expect(doc_query(`ul.options > li:not(.user-msg)`).textContent?.trim()).toBe(`banana`)
  expect(doc_query(`ul.options li.user-msg`).classList).not.toContain(`active`)
  expect(input_el.getAttribute(`aria-activedescendant`) ?? ``).not.toMatch(/user-msg/u)
})

test(`close_dropdown_on_select='retain-focus' restores input focus after keyboard select all`, async () => {
  mount_retain_focus({ options: [`Apple`, `Banana`], select_all_option: true })

  const input_el = get_input()
  const dropdown = doc_query(`ul.options`)
  const select_all_el = doc_query(`ul.options > li.select-all`)
  select_all_el.focus()
  await press_sequence(select_all_el, `Enter`)

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
  `close_dropdown_on_select='retain-focus' does not override $focus_target on_close focus`,
  async ({ attach_button }) => {
    const focus_button = document.createElement(`button`)
    focus_button.tabIndex = 0
    mount_retain_focus({
      options: [`Apple`, `Banana`],
      select_all_option: true,
      on_close: () => focus_button.focus(),
    })
    attach_button(focus_button)

    doc_query(`ul.options > li.select-all`).dispatchEvent(fresh_key(`Enter`))
    await tick()

    expect(document.activeElement).toBe(focus_button)
  },
)

test(`close_dropdown_on_select='retain-focus' works correctly with max_select`, async () => {
  mount_retain_focus({ options: [1, 2, 3], max_select: 2 })

  const input_el = get_input()
  input_el.focus()

  doc_query(`ul.options > li`).click()
  expect(document.activeElement).toBe(input_el)

  // the second selection reaches max_select, which must not steal focus either
  input_el.dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
  await tick()
  await click(`ul.options > li`)

  expect(document.activeElement).toBe(input_el)
  expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(2)
})

test(`Escape and Tab still blur input even with close_dropdown_on_select='retain-focus'`, async () => {
  mount_retain_focus({ options: [1, 2, 3] })

  const input_el = await focus_input()

  // retain-focus applies to selection, not keyboard closing, so Escape blurs
  input_el.dispatchEvent(fresh_key(`Escape`))

  expect(document.activeElement).not.toBe(input_el)
})

describe(`create_option_msg as function`, () => {
  test.each([
    {
      desc: `no matches passes empty matching_options`,
      options: [`apple`, `banana`, `cherry`],
      value: [`apple`],
      search: `grape`,
      expected_matching: [],
    },
    {
      desc: `partial match passes filtered matching_options`,
      options: [`apple`, `apricot`, `banana`],
      value: [],
      search: `ap`,
      expected_matching: [`apple`, `apricot`],
    },
  ])(`$desc`, async ({ options, value: selected, search, expected_matching }) => {
    let captured_state: Record<string, unknown> = {}
    mount_multiselect({
      options,
      value: selected,
      allow_user_options: true,
      create_option_msg: (state: Record<string, unknown>) => {
        captured_state = state
        return `Create '${String(state.search_text)}'`
      },
    })

    await type_search_text(search)

    expect(doc_query(`ul.options li.user-msg`).textContent?.trim()).toBe(
      `Create '${search}'`,
    )
    expect(captured_state.search_text).toBe(search)
    expect(captured_state.selected).toEqual(selected)
    expect(captured_state.options).toEqual(options)
    expect(captured_state.matching_options).toEqual(expected_matching)
  })

  // Static string, null, and function returning empty string
  test.each([
    [`Create this option...`, `Create this option...`],
    [null, `No matches`],
    [() => ``, `No matches`], // function returning '' should not show phantom create slot
  ])(
    `create_option_msg=%s shows correct user message`,
    async (create_option_msg, expected_text) => {
      mount_multiselect({
        options: [`foo`],
        allow_user_options: true,
        create_option_msg,
        no_matching_options_msg: `No matches`,
      })

      await type_search_text(`bar`)

      expect(doc_query(`ul.options li.user-msg`).textContent?.trim()).toBe(expected_text)
    },
  )
})

describe(`select_all_option feature`, () => {
  const options = [`Apple`, `Banana`, `Cherry`, `Date`]

  test.each([
    [true, `Select all`],
    [`Custom label`, `Custom label`],
  ])(
    `shows correct label when select_all_option=%s`,
    async (select_all_option, expected_label) => {
      mount_multiselect({ options, select_all_option })
      await click(get_input())
      expect(doc_query(`ul.options > li.select-all`).textContent?.trim()).toBe(
        expected_label,
      )
    },
  )

  test.each([
    [{ select_all_option: false }],
    [{ select_all_option: true, mode: `single` as const }],
  ])(`hidden when props=%j`, async (props) => {
    mount_multiselect({ options, ...props })
    await click(get_input())
    expect(document.querySelector(`ul.options > li.select-all`)).toBeNull()
  })

  test.each([
    [`visible`, undefined],
    [`matching`, 1],
  ] as const)(`selects all %s options and fires events`, async (scope, max_options) => {
    const [onselectAll_spy, onchange_spy] = [vi.fn(), vi.fn()]
    mount_multiselect({
      options,
      max_options,
      select_all_option: true,
      select_all_scope: scope,
      on_select_all: onselectAll_spy,
      on_change: onchange_spy,
    })
    await click(get_input())
    const select_all = doc_query(`ul.options > li.select-all`)
    expect(select_all.getAttribute(`aria-selected`)).toBe(`false`)
    await click(select_all)
    expect(select_all.getAttribute(`aria-selected`)).toBe(`true`)
    expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`Apple Banana Cherry Date`)
    expect(onselectAll_spy).toHaveBeenCalledWith({ options, scope })
    expect(onchange_spy).toHaveBeenCalledWith({ options, type: `select_all` })
  })

  test(`respects max_select, skips disabled options and reports the first dropped one`, async () => {
    const options_mixed = [
      { label: `A` },
      { label: `B`, disabled: true },
      { label: `C` },
      { label: `D` },
    ]
    const on_max_reached = vi.fn()
    mount_multiselect({
      options: options_mixed,
      select_all_option: true,
      max_select: 2,
      on_max_reached,
    })
    await click(`ul.options > li.select-all`)
    expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`A C`)
    expect(on_max_reached).toHaveBeenCalledExactlyOnceWith({
      selected: [options_mixed[0], options_mixed[2]],
      max_select: 2,
      attempted_option: options_mixed[3],
    })
  })

  test(`triggers on_max_reached when select_all shortcut fired at max_select`, async () => {
    const onmaxreached_spy = vi.fn()
    mount_multiselect({
      options: [`a`, `b`, `c`],
      select_all_option: true,
      value: [`a`, `b`],
      max_select: 2,
      shortcuts: { select_all: `ctrl+a` },
      on_max_reached: onmaxreached_spy,
    })
    const input = get_input()
    input.focus()
    press_key(input, `a`, { ctrlKey: true })
    await tick()

    expect(onmaxreached_spy).toHaveBeenCalledExactlyOnceWith({
      selected: [`a`, `b`],
      max_select: 2,
      attempted_option: `c`,
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
  ])(`select_all_disabled_title %s`, async (_label, title_prop, expected_title) => {
    mount_multiselect({
      options,
      value: [...options],
      select_all_option: true,
      select_all_disabled_title: title_prop,
    })
    await click(get_input())
    expect(doc_query(`ul.options > li.select-all`).title).toBe(expected_title)
  })

  test.each([
    [true, ``],
    [false, `a`],
  ])(
    `reset_filter_on_add=%j controls search_text after select all`,
    async (reset_filter_on_add, expected) => {
      mount_multiselect({ options, select_all_option: true, reset_filter_on_add })
      const input = get_input()
      input.click()
      await type_search_text(`a`, input)
      await click(`ul.options > li.select-all`)
      expect(input.value).toBe(expected)
    },
  )

  const remote_matching = {
    open: true,
    select_all_scope: `matching`,
    load_options: async () => ({ options: [`a`], has_more: false }),
  } satisfies MultiSelectProps
  test.each<[string, MultiSelectProps, boolean, string]>([
    [
      `all selected`,
      { options: [`a`, `b`, `c`, `d`], value: [`a`, `b`, `c`, `d`] },
      true,
      `All options already selected`,
    ],
    [`some unselected`, { options: [`a`, `b`, `c`, `d`], value: [`a`] }, false, ``],
    [
      `all non-disabled selected`,
      {
        options: [{ label: `A` }, { label: `B`, disabled: true }, { label: `C` }],
        value: [{ label: `A` }, { label: `C` }],
      },
      true,
      `All options already selected`,
    ],
    [
      `max_select reached`,
      { options: [`a`, `b`, `c`, `d`], value: [`a`, `b`], max_select: 2 },
      true,
      `Maximum of 2 options selected`,
    ],
    [
      `max_select reached AND all selectable selected`,
      { options: [`a`, `b`], value: [`a`, `b`], max_select: 2 },
      true,
      `All options already selected`,
    ],
    // both default titles are `labels` keys, so a locale reaches them without having to
    // reimplement the three-way choice through `select_all_disabled_title`
    [
      `max_select reached, count reworded through labels`,
      {
        options: [`a`, `b`, `c`, `d`],
        value: [`a`, `b`],
        max_select: 2,
        labels: { max_select_reached: (max) => `hochstens ${max}` },
      },
      true,
      `hochstens 2`,
    ],
    [
      `all selected, reworded through labels`,
      {
        options: [`a`, `b`],
        value: [`a`, `b`],
        labels: { all_options_selected: `Alle bereits gewahlt` },
      },
      true,
      `Alle bereits gewahlt`,
    ],
    [
      `case-insensitive duplicates selected`,
      {
        options: [`Apple`, `apple`],
        value: [`Apple`],
        duplicates: `case-insensitive`,
      },
      true,
      `All options already selected`,
    ],
    [
      `matching scope with load_options`,
      remote_matching,
      true,
      `Matching select-all is only available with local options`,
    ],
    // `select_all_disabled_title` used to be unreachable here: the scope message returned
    // first, so neither `null` nor a replacement string could take effect.
    [
      `matching scope, title suppressed with null`,
      { ...remote_matching, select_all_disabled_title: null },
      true,
      ``,
    ],
    [
      `matching scope, title replaced by the caller`,
      {
        ...remote_matching,
        select_all_disabled_title: `Not available while loading remotely`,
      },
      true,
      `Not available while loading remotely`,
    ],
    // the callback used to receive only max_reached/max_select/selected_count, which could not
    // distinguish this state from `all options selected` nor rebuild the string it replaces
    [
      `matching scope, callback wraps the default it replaces`,
      {
        ...remote_matching,
        select_all_disabled_title: ({ matching_scope_unavailable, default_title }) =>
          `${matching_scope_unavailable}: ${default_title}`,
      },
      true,
      `true: Matching select-all is only available with local options`,
    ],
    [
      `loaded visible options selected`,
      {
        open: true,
        value: [`a`],
        load_options: async () => ({ options: [`a`], has_more: false }),
      },
      true,
      `All options already selected`,
    ],
  ])(
    `Select All disabled state: %s`,
    async (_label, extra_props, expected_disabled, expected_title) => {
      mount_multiselect({ select_all_option: true, ...extra_props })
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
      value: [`a`, `b`],
      select_all_option: true,
      max_select: 2,
      on_select_all: onselectAll_spy,
    })
    mount_multiselect(props)
    await click(get_input())

    await click(`ul.options > li.select-all`)

    expect(onselectAll_spy).not.toHaveBeenCalled()
    expect(props.value).toEqual([`a`, `b`])
  })

  test.each([
    [`Enter`, { key: `Enter` }],
    [`Space`, { code: `Space` }],
  ])(`keyboard %s activates`, async (_name, key_props) => {
    const spy = vi.fn()
    mount_multiselect({ options, select_all_option: true, on_select_all: spy })
    get_input().click()
    doc_query(`ul.options > li.select-all`).dispatchEvent(
      new KeyboardEvent(`keydown`, { ...key_props, bubbles: true }),
    )
    await tick()
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

test.each<[MultiSelectProps, string]>([
  [{ mode: `single`, value: `Red`, options: [`Red`, `Green`, `Blue`] }, `Red`],
  [{ mode: `single`, value: 1, options: [1, 2, 3] }, `1`],
  [
    {
      mode: `single`,
      value: { label: `Red` },
      options: [{ label: `Red` }, { label: `Green` }],
    },
    `Red`,
  ],
  [{ value: [`Red`, `Green`], options: [`Red`, `Green`, `Blue`] }, `Red Green`],
  [{ value: [1, 2], options: [1, 2, 3] }, `1 2`],
  [
    {
      value: [{ label: `Red` }, { label: `Green` }],
      options: [{ label: `Red` }, { label: `Green` }, { label: `Blue` }],
    },
    `Red Green`,
  ],
])(`initial selection from %j renders %s`, (props, expected_text) => {
  mount_multiselect(props)

  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(expected_text)
})

// https://github.com/janosh/svelte-widgets/issues/369
describe(`binding update event count`, () => {
  test.each([
    `beforeinput`,
    `click`,
    `drop`,
    `keyup`,
    `mousedown`,
    `mouseenter`,
    `mouseleave`,
    `mouseup`,
    `paste`,
    `touchcancel`,
    `touchend`,
    `touchmove`,
    `touchstart`,
  ] as const)(
    `forwards %s handlers to the input and follows replacements`,
    async (type) => {
      const first_handler = vi.fn((event: Event) => event.currentTarget)
      const next_handler = vi.fn((event: Event) => event.currentTarget)
      const event_prop = `on${type}` as const
      const props = $state<MultiSelectProps>({
        options: [`a`],
        open: false,
        [event_prop]: first_handler,
      })
      mount_multiselect(props)
      const input = get_input()

      for (const handler of [first_handler, next_handler]) {
        props[event_prop] = handler
        await tick()
        const event = new Event(type, { bubbles: true, cancelable: true })
        input.dispatchEvent(event)
        doc_query(`div.multiselect`).dispatchEvent(new Event(type, { bubbles: true }))
        expect(handler).toHaveBeenCalledExactlyOnceWith(event)
        expect(handler).toHaveReturnedWith(input)
        if (type === `drop`) expect(event.defaultPrevented).toBe(true)
        if (type === `mouseup`) expect(props.open).toBe(true)
      }
      expect(first_handler).toHaveBeenCalledOnce()
    },
  )

  test(`on_change fires 0 times on init and exactly once per selection`, async () => {
    const onchange_spy = vi.fn()
    const native_change = vi.fn()

    mount_multiselect({
      options: [1, 2, 3],
      on_change: onchange_spy,
      onchange: native_change,
    })
    await tick()
    expect(onchange_spy).toHaveBeenCalledTimes(0)

    await click(`ul.options li`)
    expect(onchange_spy).toHaveBeenCalledExactlyOnceWith({ option: 1, type: `add` })
    expect(native_change).not.toHaveBeenCalled()

    const event = new Event(`change`, { bubbles: true })
    get_input().dispatchEvent(event)
    expect(native_change).toHaveBeenCalledExactlyOnceWith(event)
    expect(onchange_spy).toHaveBeenCalledTimes(1)
  })

  test.each([`single`, `multiple`] as const)(
    `%s value binding updates once on mount and once per selection`,
    async (mode) => {
      const spy = vi.fn()
      mount_2way({ options: [1, 2, 3], mode, onValueChanged: spy })
      await tick()
      expect(spy).toHaveBeenCalledExactlyOnceWith(mode === `single` ? null : [])
      spy.mockClear()
      await click(`ul.options li`)
      expect(spy).toHaveBeenCalledExactlyOnceWith(mode === `single` ? 1 : [1])
    },
  )
})

describe(`on_search event`, () => {
  beforeEach(() => vi.useFakeTimers())

  test(`fires debounced when search text changes (including clearing), not on mount`, async () => {
    const onsearch_spy = vi.fn()

    mount_multiselect({ options: [1, 2, 3, 10, 20, 30], on_search: onsearch_spy })

    const input = await focus_input()
    await vi.advanceTimersByTimeAsync(200)
    expect(onsearch_spy).not.toHaveBeenCalled()

    await type_search_text(`1`, input)

    expect(onsearch_spy).not.toHaveBeenCalled()

    // past the 150ms debounce
    await vi.advanceTimersByTimeAsync(200)

    expect(onsearch_spy).toHaveBeenCalledExactlyOnceWith({
      search_text: `1`,
      matching_options: [1, 10],
    })

    // clearing the search fires too
    await type_search_text(``, input)
    await vi.advanceTimersByTimeAsync(200)

    expect(onsearch_spy).toHaveBeenCalledTimes(2)
    expect(onsearch_spy).toHaveBeenNthCalledWith(2, {
      search_text: ``,
      matching_options: [1, 2, 3, 10, 20, 30],
    })
  })

  test(`debounce resets when typing continues`, async () => {
    const onsearch_spy = vi.fn()

    mount_multiselect({
      options: [`apple`, `apricot`, `banana`],
      on_search: onsearch_spy,
    })

    const input = await focus_input()

    await type_search_text(`a`, input)

    // only part of the 150ms debounce, so nothing has fired yet
    await vi.advanceTimersByTimeAsync(100)

    // another character before the debounce completes
    await type_search_text(`ap`, input)

    await vi.advanceTimersByTimeAsync(200)

    expect(onsearch_spy).toHaveBeenCalledExactlyOnceWith({
      search_text: `ap`,
      matching_options: [`apple`, `apricot`],
    })
  })
})

describe(`on_max_reached event`, () => {
  const object_opts = [
    { label: `Apple`, value: 1 },
    { label: `Banana`, value: 2 },
    { label: `Cherry`, value: 3 },
  ]
  test.each<[`click` | `keyboard`, Option[], Option[], Option]>([
    [`click`, [1, 2, 3, 4], [1, 2], 3],
    [`keyboard`, [1, 2, 3, 4], [1, 2], 3],
    [`click`, object_opts, object_opts.slice(0, 2), object_opts[2]],
  ])(
    `fires when adding beyond max_select via %s with options=%j`,
    async (trigger, options, selected, attempted) => {
      const onmaxreached_spy = vi.fn()
      mount_multiselect({
        options,
        max_select: 2,
        value: selected,
        on_max_reached: onmaxreached_spy,
      })
      const input = await focus_input()

      // add a 3rd option past max_select=2; fresh events avoid retained defaultPrevented flags
      if (trigger === `keyboard`) {
        input.dispatchEvent(fresh_key(`ArrowDown`))
        input.dispatchEvent(fresh_key(`Enter`))
      } else doc_query(`ul.options li:nth-child(1)`).click()
      await tick()

      expect(onmaxreached_spy).toHaveBeenCalledExactlyOnceWith({
        selected,
        max_select: 2,
        attempted_option: attempted,
      })
    },
  )

  test.each([
    { max_select: 3, value: [1], desc: `under limit` },
    { mode: `single` as const, value: 1, desc: `max_select=1 (replace mode)` },
    { max_select: null, value: [1, 2, 3, 4], desc: `max_select=null (unlimited)` },
  ])(`does not fire when $desc`, async ({ desc: _description, ...props }) => {
    const onmaxreached_spy = vi.fn()

    mount_multiselect({
      options: [1, 2, 3, 4, 5],
      ...props,
      on_max_reached: onmaxreached_spy,
    })

    await focus_input()

    await click(`ul.options li:nth-child(1)`)

    expect(onmaxreached_spy).not.toHaveBeenCalled()
  })
})

describe(`on_duplicate event`, () => {
  test.each([
    { duplicates: true, desc: `duplicates=true allows adding same option` },
    { duplicates: false, desc: `adding different option (not a duplicate)` },
  ])(`does not fire when $desc`, async ({ duplicates }) => {
    const onduplicate_spy = vi.fn()

    mount_multiselect({
      options: [1, 2, 3],
      duplicates,
      value: [1],
      on_duplicate: onduplicate_spy,
    })

    await focus_input()

    await click(`ul.options li:nth-child(1)`)

    expect(onduplicate_spy).not.toHaveBeenCalled()
  })

  // detection is label-based, so typing "Apple" hits a selected {label: "Apple", value: 1}
  // even though the keys differ — otherwise the UX is confusing
  test.each<[string, Option[], Option[], string]>([
    // user typed "1" stays a string (get_label stringifies primitives), so numeric
    // coercion doesn't apply and detection is label-based
    [`numeric options coerced to string`, [1, 2, 3], [1], `1`],
    [`string options`, [`apple`, `banana`, `cherry`], [`apple`], `apple`],
    [
      `object options (label match)`,
      [
        { label: `Apple`, value: 1 },
        { label: `Banana`, value: 2 },
      ],
      [{ label: `Apple`, value: 1 }],
      `Apple`,
    ],
  ])(
    `fires with %s via allow_user_options`,
    async (_desc, options, selected, typed_value) => {
      const onduplicate_spy = vi.fn()

      mount_multiselect({
        options,
        duplicates: false,
        value: selected,
        on_duplicate: onduplicate_spy,
        allow_user_options: true,
      })

      const input = await focus_input()

      await type_search_text(typed_value, input)

      // fresh Enter per case: defaultPrevented persists across re-dispatch
      await press_sequence(input, `Enter`)

      expect(onduplicate_spy).toHaveBeenCalledExactlyOnceWith({ option: typed_value })
    },
  )

  test(`fires when both max_select reached AND duplicate attempted`, async () => {
    const [onduplicate_spy, onmaxreached_spy] = [vi.fn(), vi.fn()]

    mount_multiselect({
      options: [1, 2, 3],
      duplicates: false,
      max_select: 2,
      value: [1, 2],
      on_duplicate: onduplicate_spy,
      on_max_reached: onmaxreached_spy,
      allow_user_options: true,
    })

    const input = await focus_input()

    // "1" is a duplicate and max_select is already reached
    await type_search_text(`1`, input)
    await press_sequence(input, `Enter`)

    expect(onmaxreached_spy).toHaveBeenCalledTimes(1)
    expect(onduplicate_spy).toHaveBeenCalledTimes(1)
  })
})

describe(`on_activate event`, () => {
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

    mount_multiselect({ options, on_activate: onactivate_spy, open: true })

    const input = await focus_input()

    await press_sequence(input, key)

    expect(onactivate_spy).toHaveBeenCalledExactlyOnceWith(expected)
  })

  test(`pointer and focus activation do not fire on_activate`, async () => {
    const onactivate_spy = vi.fn()

    mount_multiselect({ options: [1, 2, 3], on_activate: onactivate_spy, open: true })

    await press_sequence(await focus_input(), `ArrowDown`)
    onactivate_spy.mockClear()

    const option3 = doc_query(`ul.options li:nth-child(3)`)
    // Scrolling can emit mouseover; only actual movement should override the keyboard.
    option3.dispatchEvent(new MouseEvent(`mouseover`, { bubbles: true }))
    await tick()
    expect(doc_query(`ul.options li.active`).textContent?.trim()).toBe(`1`)
    option3.dispatchEvent(fresh_mousemove())
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

    mount_multiselect({ options: [1, 2, 3], on_activate: onactivate_spy, open: true })

    const input = await focus_input()

    for (const key of [`ArrowDown`, `ArrowDown`, `ArrowDown`, `ArrowDown`]) {
      input.dispatchEvent(fresh_key(key))
      await tick()
    }

    expect(onactivate_spy).toHaveBeenCalledTimes(4)
    expect(onactivate_spy).toHaveBeenNthCalledWith(3, { option: 3, index: 2 })
    expect(onactivate_spy).toHaveBeenNthCalledWith(4, { option: 1, index: 0 })
  })

  test(`back-to-back keys each report their own option despite the auto-scroll tick`, async () => {
    const onactivate_spy = vi.fn()
    mount_multiselect({ options: [1, 2, 3], on_activate: onactivate_spy, open: true })
    const input = await focus_input()
    // no tick between presses, as with key repeat outpacing Svelte's flush
    input.dispatchEvent(fresh_key(`ArrowDown`))
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    expect(onactivate_spy.mock.calls).toEqual([
      [{ option: 1, index: 0 }],
      [{ option: 2, index: 1 }],
    ])
  })

  test(`does not fire when toggling user message with no matching options`, async () => {
    // with only the user message shown, arrow navigation toggles its active state but returns
    // early, before the on_activate call
    const onactivate_spy = vi.fn()

    mount_multiselect({
      options: [],
      on_activate: onactivate_spy,
      allow_user_options: true,
      create_option_msg: `Create this option...`,
      open: true,
    })

    const input = await focus_input()

    await type_search_text(`new option`, input)

    await press_sequence(input, `ArrowDown`)

    expect(onactivate_spy).not.toHaveBeenCalled()
  })

  test(`does not fire when no options match and no_matching_options_msg disabled`, async () => {
    const onactivate_spy = vi.fn()

    mount_multiselect({
      options: [1, 2, 3],
      no_matching_options_msg: ``, // Disable "no matching" message
      allow_user_options: false,
      on_activate: onactivate_spy,
      open: true,
    })

    const input = await focus_input()

    // sets active_index = 0
    await press_sequence(input, `ArrowDown`)
    expect(onactivate_spy).toHaveBeenCalledExactlyOnceWith({ option: 1, index: 0 })

    // filters every option away
    await type_search_text(`xyz`, input)

    await press_sequence(input, `ArrowDown`)

    expect(onactivate_spy).toHaveBeenCalledTimes(1)
  })
})

// case-variant labels used to crash: https://github.com/janosh/svelte-widgets/issues/391
describe(`case-variant labels (issue #391)`, () => {
  const object_options = [
    { label: `pd`, value: `uuid-1` },
    { label: `PD`, value: `uuid-2` },
    { label: `Pd`, value: `uuid-3` },
  ]

  test(`renders and selects every case-variant option`, async () => {
    const props = $state<MultiSelectProps>({ options: object_options, value: [] })
    mount_multiselect(props)

    // duplicate keys in the keyed {#each} used to crash here
    expect(document.querySelectorAll(`ul.options > li`)).toHaveLength(3)
    for (const li of document.querySelectorAll(`ul.options > li`)) await click(li)

    expect(props.value).toEqual(object_options)
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
      value: [`Apple`],
      allow_user_options: true,
      duplicates,
      on_duplicate: onduplicate_spy,
    })
    mount_multiselect(props)

    const input = await focus_input()

    await type_search_text(typed, input)
    await press_sequence(input, `Enter`)

    if (expect_blocked) {
      expect(onduplicate_spy).toHaveBeenCalledTimes(1)
      expect(props.value).not.toContain(typed)
    } else {
      expect(onduplicate_spy).not.toHaveBeenCalled()
      expect(props.value).toContain(typed)
    }
  })

  test(`duplicates='case-insensitive': shows duplicate message`, async () => {
    mount_multiselect({
      options: [`Apple`, `Banana`],
      value: [`Apple`],
      duplicates: `case-insensitive`,
      duplicate_option_msg: `Already selected`,
    })

    const input = await focus_input()

    await type_search_text(`apple`, input)

    expect(document.querySelector(`ul.options li.user-msg`)?.textContent).toContain(
      `Already selected`,
    )
  })

  test(`same-label dropdown options respect duplicate rules`, async () => {
    // the label check blocked dropdown options with differing values; is_from_options skips
    const options = [1, 2, 3].map((value) => ({
      label: `apple`,
      selected_title: `Already selected`,
      value,
    }))

    const [onadd_spy, onduplicate_spy] = [vi.fn(), vi.fn()]

    mount_multiselect({
      options,
      value: [options[0]], // preselect first option
      on_add: onadd_spy,
      on_duplicate: onduplicate_spy,
    })

    await focus_input()

    // the two unselected options remain, sharing the selected one's label
    const visible_options = document.querySelectorAll(`ul.options > li`)
    expect(visible_options).toHaveLength(2)
    expect(document.querySelectorAll(`ul.options > li.selected`)).toHaveLength(0)
    // a different value, so this must add rather than register a duplicate
    await click(visible_options[0])

    expect(onduplicate_spy).not.toHaveBeenCalled()
    expect(onadd_spy).toHaveBeenCalledTimes(1)

    document.body.innerHTML = ``
    mount_multiselect({ options, value: [options[0]], duplicates: `case-insensitive` })

    await focus_input()

    expect(
      document.querySelectorAll(`ul.options > li.selected[title="Already selected"]`),
    ).toHaveLength(3)
  })
})

test(`dropdown has no li children when all user-created options are selected`, async () => {
  mount_multiselect({
    allow_user_options: `append`,
    no_matching_options_msg: ``,
    create_option_msg: null,
  })

  const input = await type_search_text(`tag1`)
  await press_sequence(input, `Enter`)

  await type_search_text(`tag2`, input)
  await press_sequence(input, `Enter`)

  input.focus()
  await tick()
  expect(document.querySelectorAll(`ul.options > li`)).toHaveLength(0)
})

// drag-drop must reject foreign/invalid drag data (previously corrupted selected)
test.each([
  [`non-numeric text`, `hello`],
  [`empty string`, ``],
  [`out-of-range numeric prefix`, `42 items`],
  [`negative index`, `-1`],
  // passes parseInt but no dragstart fired on this instance, so it is a foreign source
  [`valid-looking numeric text without dragstart`, `0`],
])(`drop with foreign/invalid drag data (%s) is a no-op`, async (_desc, drag_data) => {
  const onreorder_spy = vi.fn()
  mount_multiselect({ options: [1, 2, 3], value: [1, 2, 3], on_reorder: onreorder_spy })

  const transfer = new DataTransfer()
  transfer.setData(`text/plain`, drag_data)
  doc_query(`ul.selected li:nth-child(2)`).dispatchEvent(drag_event(`drop`, transfer))
  await tick()

  expect(doc_query(`ul.selected`).textContent?.trim()).toBe(`1 2 3`)
  expect(onreorder_spy).not.toHaveBeenCalled()
})

describe(`duplicate entries in options array`, () => {
  test(`indexes colliding selection keys without pairwise row scans`, async () => {
    const options = Array.from({ length: 100 }, (_, idx) => ({ label: `Option ${idx}` }))
    const key = vi.fn(() => `shared`)
    mount_multiselect({
      options,
      value: options.slice(50),
      duplicates: true,
      keep_selected_in_dropdown: `plain`,
      max_visible_chips: 0,
      key,
    })
    await tick()
    expect(document.querySelectorAll(`ul.options > li.selected`)).toHaveLength(50)
    expect(key.mock.calls.length).toBeLessThan(options.length * 25)
  })

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

    // hovering either duplicate activates only that row
    for (const idx of [0, 1]) {
      option_lis[idx].dispatchEvent(fresh_mousemove())
      await tick()
      const active = [...document.querySelectorAll(`ul.options > li.active`)]
      expect(active.map((li) => li.id.split(`-opt-`)[1])).toEqual([`${idx}`])
    }
  })
})

describe(`max_visible_chips`, () => {
  const options = [`a`, `b`, `c`, `d`, `e`]
  const chips = () => [
    ...document.querySelectorAll<HTMLLIElement>(`ul.selected > li:not(.more-chip)`),
  ]

  test.each([
    [2, `+3 more`], // partial overflow
    [0, `+5 more`], // limit 0 hides ALL chips behind the toggle
  ])(
    `max_visible_chips=%i collapses overflow into a %s toggle that expands and collapses`,
    async (max_visible_chips, toggle_label) => {
      mount_multiselect({ options, value: [...options], max_visible_chips })

      expect(chips()).toHaveLength(max_visible_chips)
      const toggle = doc_query<HTMLButtonElement>(`li.more-chip button.more-chips`)
      expect(toggle.textContent?.trim()).toBe(toggle_label)
      expect(toggle.getAttribute(`aria-expanded`)).toBe(`false`)

      await click(toggle)
      expect(chips()).toHaveLength(5)
      expect(toggle.textContent?.trim()).toBe(`show less`)
      expect(toggle.getAttribute(`aria-expanded`)).toBe(`true`)

      await click(toggle)
      expect(chips()).toHaveLength(max_visible_chips)
    },
  )

  test.each([
    [`fits within limit`, 5],
    [`unlimited (null)`, null],
  ])(`renders no toggle when selection %s`, (_desc, max_visible_chips) => {
    mount_multiselect({ options, value: [...options].slice(0, 3), max_visible_chips })
    expect(document.querySelector(`li.more-chip`)).toBeNull()
    expect(chips()).toHaveLength(3)
  })

  test(`keyboard chip navigation auto-expands hidden chips`, async () => {
    mount_multiselect({ options, value: [...options], max_visible_chips: 2 })
    expect(chips()).toHaveLength(2)

    // ArrowLeft highlights the LAST selected chip (idx 4), which is hidden
    await press_sequence(get_input(), `ArrowLeft`)

    expect(chips()).toHaveLength(5)
    expect(chips().at(-1)?.classList.contains(`highlighted`)).toBe(true)

    // "show less" must stick: collapsing clears the beyond-limit highlight, else
    // the auto-expand effect would instantly re-expand
    await click(`li.more-chip button.more-chips`)
    expect(chips()).toHaveLength(2)
  })
})

// every string MultiSelect renders itself must be overridable for i18n (issue #451)
describe(`labels`, () => {
  const options = [`a`, `b`, `c`]

  test(`chip overflow toggle is configurable, omitted keys keep English`, async () => {
    mount_multiselect({
      options,
      value: [...options],
      max_visible_chips: 1,
      labels: { more_chips: (hidden) => `noch ${hidden}` },
    })

    const toggle = doc_query<HTMLButtonElement>(`li.more-chip button.more-chips`)
    expect(toggle.textContent?.trim()).toBe(`noch 2`)

    await click(toggle)
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
      `remove-button title composed with remove_btn_title`,
      { remove_option: (btn: string, label: string) => `${label} ${btn}` },
      { options, value: [`a`], remove_btn_title: `entfernen` },
      () => doc_query(`ul.selected button.remove`).getAttribute(`title`),
      `a entfernen`,
    ],
    [
      // the group name is the option's description now, not a label on a presentational <li>
      `group name described to each option`,
      { group: (name: string) => `Gruppe: ${name}` },
      { options: [{ label: `a`, group: `G` }], open: true },
      () => doc_query(`li.group-header span.sr-only`).textContent?.trim(),
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
      { options: [{ label: `a`, group: `G` }], open: true, group_select_all: true },
      () => doc_query(`button.group-select-all`).textContent?.trim(),
      `Alle`,
    ],
    [
      `checkbox aria-label`,
      { toggle_option: (label: string) => `${label} umschalten` },
      { options, open: true, keep_selected_in_dropdown: `checkboxes` as const },
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

    await click(`ul.options > li[role="option"]`)
    const live_region = doc_query(`.sr-only[aria-live="polite"]`)
    expect(live_region.textContent?.trim()).toBe(`a gewählt`)

    await click(`ul.selected button.remove`)
    expect(live_region.textContent?.trim()).toBe(`a removed`)
  })

  test(`the bulk removal announcement is configurable`, async () => {
    mount_multiselect({
      options,
      value: [...options],
      labels: { options_removed: (count) => `${count} entfernt` },
    })

    await click(`button.remove-all`)
    const live_region = doc_query(`.sr-only[aria-live="polite"]`)
    expect(live_region.textContent?.trim()).toBe(`3 entfernt`)
  })

  test.each([
    [1, null, `Bitte etwas wählen`],
    [2, null, `Bitte mindestens 2 wählen`],
    [2, 3, `Bitte 2 bis 3 wählen`],
  ])(
    `form validity message for required=%s max_select=%s`,
    async (required, max_select, expected) => {
      mount_multiselect({
        options,
        required,
        max_select,
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
  await type_search_text(`  `)

  expect(document.querySelectorAll(`ul.options li[role='option']`)).toHaveLength(3)
  expect(document.querySelector(`ul.options li.user-msg`)).toBeNull()
})

test(`sort_selected orders chips before clearing the accepted search`, async () => {
  let search_seen_by_comparator: string | undefined
  const props = $state<Test2WayBindProps>({
    options: [`a`, `b`, `c`],
    search_text: ``,
    selected_options_draggable: false,
  })
  props.sort_selected = (opt_1: Option, opt_2: Option) => {
    search_seen_by_comparator = props.search_text
    return `${get_label(opt_2)}`.localeCompare(`${get_label(opt_1)}`)
  }
  mount_2way(props)

  for (const label of [`a`, `c`]) {
    const li = [
      ...document.querySelectorAll<HTMLLIElement>(`ul.options li[role='option']`),
    ].find((el) => el.textContent?.trim() === label)
    await click(li)
  }
  props.search_text = `b`
  await tick()
  await click(`ul.options li[role='option']`)

  expect(search_seen_by_comparator).toBe(`b`)
  expect(props.search_text).toBe(``)
  expect(normalized_text(doc_query(`ul.selected`))).toBe(`c b a`)
})

describe(`CSS static analysis`, () => {
  const component_source = readFileSync(
    `${import.meta.dirname}/../../src/lib/MultiSelect.svelte`,
    `utf-8`,
  )
  const css =
    /<style>(?<style>[\s\S]*?)<\/style>/u.exec(component_source)?.groups?.style ?? ``
  // body of the rule whose selector list is exactly `selector`
  const css_block = (selector: string) => {
    const escaped = selector.replaceAll(/[.*+?^${}()|[\]\\]/gu, `\\$&`)
    const pattern = new RegExp(`${escaped}\\s*\\{(?<block>[^}]*)\\}`, `u`)
    return pattern.exec(css)?.groups?.block ?? ``
  }

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

  test(`--sms-active-color fallbacks use light-dark()`, () => {
    expect(
      css.match(/--sms-active-color,\s*light-dark\(/gu)?.length,
    ).toBeGreaterThanOrEqual(2)
  })

  // every text-bearing surface must pair its light-dark() background with a light-dark() text
  // default, else a page that never declares color-scheme renders white-on-white
  const text_color = /color:\s*var\(--sms-text-color,\s*light-dark\(#222,\s*#eee\)\)/u
  test.each<[string, string, RegExp[]]>([
    [
      `::highlight is global and uses light-dark()`,
      `:global(::highlight(sms-search-matches))`,
      [/light-dark\(/u],
    ],
    [
      `default-icon buttons stay circular`,
      `:is(div.multiselect button.default-icon)`,
      [/min-height:\s*0/u, /overflow:\s*hidden/u],
    ],
    [
      `options dropdown pairs text color with light-dark border and bg defaults`,
      `:where(ul.options)`,
      [
        /--sms-options-border,\s*1px solid light-dark\(/u,
        /border-width:\s*var\(--sms-options-border-width,\s*1px\)/u,
        /--sms-options-bg,\s*light-dark\(#fcfcfc/u,
        text_color,
      ],
    ],
    [
      `root pairs text color with a light-dark() default`,
      `:where(div.multiselect)`,
      [text_color],
    ],
    [
      `input pairs text color with a light-dark() default`,
      `:where(div.multiselect > ul.selected > input)`,
      [text_color],
    ],
    [
      `selected option text color chain ends in a light-dark() default`,
      `:where(div.multiselect > ul.selected > li)`,
      [
        /color:\s*var\(--sms-selected-text-color,\s*var\(--sms-text-color,\s*light-dark\(#222,\s*#eee\)\)\)/u,
      ],
    ],
    [
      `custom-snippet remove-all overrides circular defaults`,
      `:is(div.multiselect button.remove-all:not(.default-icon))`,
      [/border-radius:\s*3pt/u, /aspect-ratio:\s*auto/u, /padding:\s*0 2pt/u],
    ],
  ])(`%s`, (_desc, selector, patterns) => {
    const block = css_block(selector)
    for (const pattern of patterns) expect(block).toMatch(pattern)
  })
})
