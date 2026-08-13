import { CommandMenu, PageSearch } from '$lib'
import { flushSync, mount, tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import { doc_query } from './index'

const mock_actions = [
  { label: `action 1`, action: vi.fn() },
  { label: `action 2`, action: vi.fn() },
  { label: `action 3`, action: vi.fn() },
]

const menu_input = () => doc_query<HTMLInputElement>(`dialog input[autocomplete]`)

async function type_search(text: string): Promise<HTMLInputElement> {
  const input = menu_input()
  input.value = text
  input.dispatchEvent(new Event(`input`, { bubbles: true }))
  await tick()
  return input
}

test.each([
  {
    triggers: [`k`],
    key_to_press: `k`,
    with_meta: true,
    with_ctrl: false,
    should_open: true,
  },
  // any trigger in the list works, not just the first
  {
    triggers: [`k`, `o`],
    key_to_press: `o`,
    with_meta: true,
    with_ctrl: false,
    should_open: true,
  },
  // trigger key without modifier does nothing
  {
    triggers: [`k`],
    key_to_press: `k`,
    with_meta: false,
    with_ctrl: false,
    should_open: false,
  },
  // non-trigger key does nothing even with modifier
  {
    triggers: [`j`, `l`],
    key_to_press: `k`,
    with_meta: true,
    with_ctrl: false,
    should_open: false,
  },
  // Ctrl works as alternative to Meta
  {
    triggers: [`k`],
    key_to_press: `k`,
    with_meta: false,
    with_ctrl: true,
    should_open: true,
  },
])(
  `handles trigger keys: $triggers with key $key_to_press (meta: $with_meta, ctrl: $with_ctrl) -> $should_open`,
  async ({ triggers, key_to_press, with_meta, with_ctrl, should_open }) => {
    const props = $state({
      open: false,
      triggers,
      actions: mock_actions,
      fade_duration_ms: 0,
    })
    mount(CommandMenu, { target: document.body, props })

    const event = new KeyboardEvent(`keydown`, {
      key: key_to_press,
      metaKey: with_meta,
      ctrlKey: with_ctrl,
      cancelable: true,
    })
    globalThis.dispatchEvent(event)
    await tick()

    expect(props.open).toBe(should_open)
    if (should_open) expect(event.defaultPrevented).toBe(true)
    expect(document.querySelector(`dialog`)).toEqual(
      should_open ? expect.any(HTMLDialogElement) : null,
    )

    if (should_open) {
      expect(document.activeElement).toBe(menu_input())
    }
  },
)

test.each([
  { close_keys: [`Escape`], key_to_press: `Escape`, should_close: true },
  // any key in the list closes, not just the first
  { close_keys: [`Escape`, `x`], key_to_press: `x`, should_close: true },
  // non-close key (even default Escape) does nothing when not configured
  { close_keys: [`q`], key_to_press: `Escape`, should_close: false },
])(
  `handles close keys: $close_keys with key $key_to_press -> $should_close`,
  async ({ close_keys, key_to_press, should_close }) => {
    const props = $state({
      open: true,
      close_keys,
      actions: mock_actions,
      fade_duration_ms: 0,
    })
    mount(CommandMenu, { target: document.body, props })

    const event = new KeyboardEvent(`keydown`, {
      key: key_to_press,
      cancelable: true,
    })
    globalThis.dispatchEvent(event)
    await tick()

    expect(props.open).toBe(!should_close)
    if (should_close) expect(event.defaultPrevented).toBe(true)
    expect(document.querySelector(`dialog`)).toEqual(
      should_close ? null : expect.any(HTMLDialogElement),
    )
  },
)

test.each([`Escape`, `x`])(
  `focused input close key %s does not also trigger its global action shortcut`,
  async (close_key) => {
    const [action, onkeydown] = [vi.fn(), vi.fn()]
    const props = $state({
      open: true,
      close_keys: [close_key],
      actions: [{ label: `Close action`, shortcut: close_key, action }],
      fade_duration_ms: 0,
      onkeydown,
    })
    mount(CommandMenu, { target: document.body, props })
    await tick()

    const event = new KeyboardEvent(`keydown`, {
      key: close_key,
      bubbles: true,
      cancelable: true,
    })
    menu_input().dispatchEvent(event)
    await tick()

    expect(props.open).toBe(false)
    expect(action).not.toHaveBeenCalled()
    expect(onkeydown).toHaveBeenCalledExactlyOnceWith(event)
  },
)

test.each([
  { close_keys: [`Escape`], default_prevented: false },
  { close_keys: [`q`], default_prevented: true },
])(
  `dialog cancel with close_keys=$close_keys prevents default: $default_prevented`,
  async ({ close_keys, default_prevented }) => {
    const oncancel = vi.fn()
    mount(CommandMenu, {
      target: document.body,
      props: {
        open: true,
        close_keys,
        actions: mock_actions,
        dialog_props: { oncancel },
        fade_duration_ms: 0,
      },
    })
    await tick()

    const cancel_event = new Event(`cancel`, { cancelable: true })
    const dialog = doc_query<HTMLDialogElement>(`dialog`)
    dialog.dispatchEvent(cancel_event)

    expect(cancel_event.defaultPrevented).toBe(default_prevented)
    expect(dialog.getAttribute(`closedby`)).toBe(default_prevented ? `none` : `any`)
    expect(oncancel).toHaveBeenCalledOnce()
  },
)

test(`opens a labeled native light-dismiss dialog`, async () => {
  const show_modal = vi.spyOn(HTMLDialogElement.prototype, `showModal`)
  mount(CommandMenu, {
    target: document.body,
    props: {
      actions: mock_actions,
      aria_label: `Run command`,
      open: true,
      fade_duration_ms: 0,
    },
  })
  await tick()

  const dialog = doc_query<HTMLDialogElement>(`dialog`)
  expect(dialog.getAttribute(`aria-label`)).toBe(`Run command`)
  expect(dialog.getAttribute(`closedby`)).toBe(`any`)
  expect(dialog.open).toBe(true)
  expect(show_modal).toHaveBeenCalledOnce()
})

test(`handles action selection and execution`, async () => {
  const actions_with_spies = mock_actions.map(({ label }) => ({
    label,
    action: vi.fn(),
  }))
  const onadd = vi.fn()
  const props = $state({
    open: true,
    actions: actions_with_spies,
    activeIndex: null as number | null,
    searchText: `action`,
    fade_duration_ms: 0,
    onadd,
  })
  mount(CommandMenu, { target: document.body, props })
  await tick()

  const input_el = menu_input()

  // Navigate to second action and select it
  input_el.dispatchEvent(
    new KeyboardEvent(`keydown`, { key: `ArrowDown`, bubbles: true }),
  )
  input_el.dispatchEvent(new KeyboardEvent(`keydown`, { key: `Enter`, bubbles: true }))

  expect(actions_with_spies[1].action).toHaveBeenCalledExactlyOnceWith(`action 2`)
  expect(actions_with_spies[0].action).not.toHaveBeenCalled()
  expect(actions_with_spies[2].action).not.toHaveBeenCalled()
  expect(onadd).toHaveBeenCalledWith(
    expect.objectContaining({ option: actions_with_spies[1] }),
  )
  expect(props.open).toBe(false)
  expect(props.activeIndex).toBeNull()
  expect(props.searchText).toBe(``)
})

test(`ignores user-created options without action handlers`, async () => {
  const action = vi.fn()
  const props = $state({
    open: true,
    actions: [{ label: `existing action`, action }],
    allowUserOptions: true,
    fade_duration_ms: 0,
  })
  mount(CommandMenu, { target: document.body, props })
  await tick()

  await type_search(`custom command`)

  doc_query<HTMLLIElement>(`dialog li.user-msg`).click()
  await tick()

  expect(action).not.toHaveBeenCalled()
  expect(props.open).toBe(true)
})

// open=false must call dialog.close() before `{#if open}` unmounts, including while
// an outro keeps the closed element mounted.
test.each([0, 50])(
  `controlled close fires native onclose once (fade_duration_ms=%i)`,
  async (fade_duration_ms) => {
    vi.useFakeTimers()
    try {
      const onclose = vi.fn()
      const dialog_close = vi.spyOn(HTMLDialogElement.prototype, `close`)
      const props = $state({
        open: true,
        actions: mock_actions,
        fade_duration_ms,
        dialog_props: { onclose },
      })
      mount(CommandMenu, { target: document.body, props })
      await tick()

      const dialog = doc_query<HTMLDialogElement>(`dialog`)
      props.open = false
      await tick()

      expect(dialog.open).toBe(false)
      expect(dialog_close).toHaveBeenCalled()
      expect(onclose).toHaveBeenCalledOnce()
      if (fade_duration_ms === 0) expect(document.querySelector(`dialog`)).toBeNull()
      await vi.runAllTimersAsync()
      await tick()
      expect(onclose).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  },
)

test(`an onclose callback can reopen without another close event`, async () => {
  const props = $state({
    open: true,
    actions: mock_actions,
    fade_duration_ms: 50,
    dialog_props: {
      onclose: vi.fn(() => {
        props.open = true
      }),
    },
  })
  mount(CommandMenu, { target: document.body, props })
  await tick()

  props.open = false
  await tick()
  await tick()

  expect(props.open).toBe(true)
  expect(props.dialog_props.onclose).toHaveBeenCalledOnce()
  expect(doc_query<HTMLDialogElement>(`dialog`).open).toBe(true)
})

test(`a stale native close cannot close a reopened menu`, async () => {
  const props = $state({ open: true, actions: mock_actions, fade_duration_ms: 0 })
  mount(CommandMenu, { target: document.body, props })
  await tick()
  const old_dialog = doc_query<HTMLDialogElement>(`dialog`)

  props.open = false
  await tick()
  props.open = true
  await tick()
  const current_dialog = doc_query<HTMLDialogElement>(`dialog`)
  expect(current_dialog).not.toBe(old_dialog)

  old_dialog.dispatchEvent(new Event(`close`))
  await tick()

  expect(props.open).toBe(true)
  expect(current_dialog.open).toBe(true)
})

test(`applies custom styles and props correctly`, async () => {
  const custom_class = `my-custom-class`
  const custom_placeholder = `Custom placeholder`
  const custom_dialog_style = `border: 2px solid red; padding: 20px;`
  const custom_li_style = `color: blue; font-weight: bold;`

  const props = $state({
    open: true,
    actions: mock_actions,
    class: custom_class,
    placeholder: custom_placeholder,
    dialog_props: { style: custom_dialog_style },
    liOptionStyle: custom_li_style,
  })

  mount(CommandMenu, { target: document.body, props })
  await tick()

  const select_wrapper = doc_query(`dialog div.multiselect`)
  expect(select_wrapper.classList.contains(custom_class)).toBe(true)

  const input = menu_input()
  expect(input.placeholder).toBe(custom_placeholder)

  const dialog = doc_query<HTMLDialogElement>(`dialog`)
  expect(dialog.style.border).toBe(`2px solid red`)
  expect(dialog.style.padding).toBe(`20px`)

  const li_el = doc_query<HTMLLIElement>(`dialog ul.options li`)
  expect(li_el.style.color).toBe(`blue`)
  expect(li_el.style.fontWeight).toBe(`bold`)
})

test(`native dialog close resets state and forwards dialog_props.onclose`, async () => {
  const on_close = vi.fn()
  const props = $state({
    open: true,
    activeIndex: 1,
    activeOption: mock_actions[1],
    searchText: `action`,
    actions: mock_actions,
    fade_duration_ms: 0,
    dialog_props: { class: `custom-dialog`, onclose: on_close },
  })
  mount(CommandMenu, { target: document.body, props })
  await tick()

  const dialog = doc_query<HTMLDialogElement>(`dialog`)
  expect(dialog.classList.contains(`custom-dialog`)).toBe(true)
  expect(dialog.getAttribute(`aria-label`)).toBe(`Command menu`)

  dialog.close()
  await tick()

  expect(on_close).toHaveBeenCalledOnce()
  expect(props).toMatchObject({
    open: false,
    activeIndex: null,
    activeOption: null,
    searchText: ``,
  })
})

test(`rejects an empty static action list`, () => {
  expect(() =>
    mount(CommandMenu, {
      target: document.body,
      props: { open: true, actions: [], fade_duration_ms: 0 },
    }),
  ).toThrow(`MultiSelect: received no options`)
})

test(`remains open when trigger keys are pressed while already open`, async () => {
  const props = $state({ open: true, actions: mock_actions, fade_duration_ms: 0 })
  mount(CommandMenu, { target: document.body, props })

  expect(props.open).toBe(true)

  // Trigger key should not change state when already open
  globalThis.dispatchEvent(new KeyboardEvent(`keydown`, { key: `k`, metaKey: true }))
  await tick()

  expect(props.open).toBe(true)
  expect(document.querySelector(`dialog`)).toBeInstanceOf(HTMLDialogElement)
})

test(`lets command menu dropdown overflow dialog box`, async () => {
  mount(CommandMenu, {
    target: document.body,
    props: { open: true, actions: mock_actions, fade_duration_ms: 0 },
  })
  await tick()

  const dialog = doc_query<HTMLDialogElement>(`dialog`)
  const dialog_style = getComputedStyle(dialog)
  expect(dialog_style.position).toBe(`fixed`)
  expect(dialog_style.left).toBe(`0px`)
  expect(dialog_style.right).toBe(`0px`)
  expect(dialog_style.overflow).toBe(`visible`)
})

test.each([
  {
    fuzzy: true,
    search: `cu`,
    expected: [`create user`],
    description: `fuzzy match 'cu' -> 'create user'`,
  },
  {
    fuzzy: true,
    search: `qwerty`,
    expected: [`No matching commands`],
    description: `fuzzy match 'qwerty' -> no matches message`,
  },
  {
    fuzzy: false,
    search: `cr`,
    expected: [`create user`],
    description: `exact match 'cr' -> 'create user'`,
  },
  {
    fuzzy: false,
    search: `cu`,
    expected: [`No matching commands`],
    description: `exact match 'cu' -> no matches (not a substring)`,
  },
])(`filtering with fuzzy=$fuzzy: $description`, async ({ fuzzy, search, expected }) => {
  const actions = [
    { label: `create user`, action: vi.fn() },
    { label: `delete file`, action: vi.fn() },
    { label: `update config`, action: vi.fn() },
  ]
  mount(CommandMenu, {
    target: document.body,
    props: { open: true, actions, fuzzy, fade_duration_ms: 0 },
  })

  await type_search(search)

  const visible_options = document.querySelectorAll(`dialog ul.options li:not(.hidden)`)
  expect(visible_options).toHaveLength(expected.length)

  expected.forEach((expected_label, idx) => {
    expect(visible_options[idx].textContent).toContain(expected_label)
  })
})

test(`handles bindable props correctly`, async () => {
  const props = $state({
    open: false,
    actions: mock_actions,
    dialog: null,
    input: null,
    fade_duration_ms: 0,
  })
  mount(CommandMenu, { target: document.body, props })

  expect(props.dialog).toBeNull()
  expect(props.input).toBeNull()

  props.open = true
  await tick()

  expect(props.dialog).toBeInstanceOf(HTMLDialogElement)
  expect(props.input).toBeInstanceOf(HTMLInputElement)
  expect(menu_input().getAttribute(`aria-label`)).toBe(`Search commands`)
  expect(document.activeElement).toBe(props.input)
})

test(`selects the first enabled action and preserves pointer selection across grouped refreshes`, async () => {
  const actions = [
    { id: `alpha`, label: `Alpha`, group: `A`, action: vi.fn() },
    { id: `disabled`, label: `Disabled`, group: `B`, disabled: true, action: vi.fn() },
    { id: `beta`, label: `Beta`, group: `A`, action: vi.fn() },
    { id: `extra`, label: `Extra`, group: `B`, action: vi.fn() },
  ]
  const props = $state({
    open: true,
    actions,
    activeIndex: null as number | null,
    fade_duration_ms: 0,
  })
  mount(CommandMenu, { target: document.body, props })
  await tick()

  expect(doc_query(`li.active`).textContent).toContain(`Alpha`)

  const beta_option = [...document.querySelectorAll(`li[role=option]`)].find((option) =>
    option.textContent?.includes(`Beta`),
  )
  beta_option?.dispatchEvent(new MouseEvent(`mouseover`, { bubbles: true }))
  await tick()
  expect(doc_query(`li.active`).textContent).toContain(`Beta`)

  const renamed_beta = { ...actions[2], label: `Renamed Beta` }
  props.actions = [actions[1], renamed_beta, actions[3], actions[0]]
  await tick()
  expect(props.activeIndex).toBe(2)
  expect(doc_query(`li.active`).textContent).toContain(`Renamed Beta`)

  props.activeIndex = 3
  await tick()
  props.actions = [renamed_beta, actions[0], actions[1], actions[3]]
  await tick()
  expect(props.activeIndex).toBe(1)
  expect(doc_query(`li.active`).textContent).toContain(`Alpha`)

  await type_search(`alpha`)
  expect(doc_query(`li.active`).textContent).toContain(`Alpha`)
})

test(`auto-active considers only visible enabled actions`, async () => {
  const props = $state({
    open: true,
    actions: [
      { label: `Disabled`, disabled: true, action: vi.fn() },
      { label: `Enabled`, action: vi.fn() },
    ],
    activeIndex: 0,
    maxOptions: 1,
    fade_duration_ms: 0,
  })
  mount(CommandMenu, { target: document.body, props })
  await tick()

  expect(props.activeIndex).toBeNull()
  expect(document.querySelector(`li.active`)).toBeNull()

  props.maxOptions = 2
  await tick()
  expect(props.activeIndex).toBe(1)
  expect(doc_query(`li.active`).textContent).toContain(`Enabled`)

  props.actions = [
    { ...props.actions[0], disabled: false },
    { ...props.actions[1], disabled: true },
  ]
  await tick()
  expect(props.activeIndex).toBe(0)
})

test(`preserves duplicate action identity across independent key changes`, async () => {
  const first_action = {
    id: `duplicate`,
    label: `Duplicate`,
    description: `Same action`,
    action: vi.fn(),
  }
  const second_action = { ...first_action, action: vi.fn() }
  const third_action = { id: `third`, label: `Third`, action: vi.fn() }
  const props = $state({
    open: true,
    actions: [first_action, second_action, third_action],
    activeIndex: 1,
    fade_duration_ms: 0,
  })
  mount(CommandMenu, { target: document.body, props })
  await tick()

  expect(props.activeIndex).toBe(1)
  const active_option = doc_query<HTMLLIElement>(`li.active`)

  props.actions = [first_action, third_action, second_action]
  await tick()

  expect(props.activeIndex).toBe(2)
  expect(doc_query(`li.active`)).toBe(active_option)

  const renamed_action = { ...second_action, label: `Renamed duplicate` }
  props.actions = [first_action, third_action, renamed_action]
  await tick()
  expect(doc_query(`li.active`)).toBe(active_option)

  const rebuilt_action = vi.fn()
  props.actions = [
    first_action,
    third_action,
    { ...renamed_action, action: rebuilt_action },
  ]
  await tick()
  expect(props.activeIndex).toBe(2)

  menu_input().dispatchEvent(
    new KeyboardEvent(`keydown`, { key: `Enter`, bubbles: true }),
  )
  expect(rebuilt_action).toHaveBeenCalledExactlyOnceWith(`Renamed duplicate`)
  expect(first_action.action).not.toHaveBeenCalled()
})

test(`does not retain an ambiguous index when duplicate actions are rebuilt`, async () => {
  const make_actions = () => [
    { id: `duplicate`, label: `Duplicate`, action: vi.fn() },
    { id: `duplicate`, label: `Duplicate`, action: vi.fn() },
  ]
  const props = $state({
    open: true,
    actions: make_actions(),
    activeIndex: 1,
    fade_duration_ms: 0,
  })
  mount(CommandMenu, { target: document.body, props })
  await tick()

  props.actions = make_actions()
  await tick()

  expect(props.activeIndex).toBe(0)
})

test(`preserves the active action by its unique ID amid rebuilt duplicates`, async () => {
  const props = $state({
    open: true,
    actions: [
      { id: `alpha`, label: `Alpha`, action: vi.fn() },
      { id: `beta`, label: `Beta`, action: vi.fn() },
      { id: `duplicate`, label: `First duplicate`, action: vi.fn() },
      { id: `duplicate`, label: `Second duplicate`, action: vi.fn() },
    ],
    activeIndex: 1,
    fade_duration_ms: 0,
  })
  mount(CommandMenu, { target: document.body, props })
  await tick()
  const active_option = doc_query<HTMLLIElement>(`li.active`)

  const beta_action = vi.fn()
  props.actions = [
    { id: `duplicate`, label: `Rebuilt duplicate`, action: vi.fn() },
    { id: `duplicate`, label: `Rebuilt duplicate`, action: vi.fn() },
    { id: `beta`, label: `Rebuilt Beta`, action: beta_action },
    { id: `alpha`, label: `Rebuilt Alpha`, action: vi.fn() },
  ]
  await tick()

  expect(props.activeIndex).toBe(2)
  expect(doc_query(`li.active`)).toBe(active_option)
  menu_input().dispatchEvent(
    new KeyboardEvent(`keydown`, { key: `Enter`, bubbles: true }),
  )
  expect(beta_action).toHaveBeenCalledExactlyOnceWith(`Rebuilt Beta`)
})

test(`groupSelectAll selects a whole action group without executing actions or closing`, async () => {
  const actions = [
    { label: `New File`, action: vi.fn(), group: `File` },
    { label: `Save`, action: vi.fn(), group: `File` },
    { label: `Copy`, action: vi.fn(), group: `Edit` },
  ]
  const on_select_all = vi.fn()
  const props = $state({
    open: true,
    actions,
    groupSelectAll: true,
    onselectAll: on_select_all,
    fade_duration_ms: 0,
  })
  mount(CommandMenu, { target: document.body, props })
  await tick()

  doc_query<HTMLButtonElement>(`dialog li.group-header button.group-select-all`).click()
  await tick()

  // group selected (scoping is covered by MultiSelect tests) - no action executed
  expect(on_select_all).toHaveBeenCalledTimes(1)
  for (const { action } of actions) expect(action).not.toHaveBeenCalled()
  expect(props.open).toBe(true)
})

// dropdown option labels in display order (used by shortcut/recents tests below)
const option_labels = () =>
  Array.from(document.querySelectorAll(`li[role='option']`), (li) =>
    li.textContent?.trim(),
  )

const shortcut_kbd_parts = () =>
  Array.from(
    document.querySelectorAll(`li[role='option'] .cmd-shortcut kbd`),
    (kbd) => kbd.textContent,
  )

const press_ctrl_shift = (key: string) =>
  globalThis.dispatchEvent(
    new KeyboardEvent(`keydown`, { key, ctrlKey: true, shiftKey: true }),
  )

test(`renders and searches action descriptions, metadata, badges, and keywords`, async () => {
  const actions = [
    {
      label: `save file`,
      action: vi.fn(),
      shortcut: `ctrl+shift+s`,
      description: `Write buffer to disk`,
      metadata: [`Workspace`, `Modified`],
      badge: `File`,
      keywords: [`persist`],
    },
    { label: `quit`, action: vi.fn() },
  ]
  mount(CommandMenu, {
    target: document.body,
    props: { open: true, actions, fade_duration_ms: 0 },
  })
  await tick()

  expect(doc_query(`.cmd-description`).textContent).toBe(`Write buffer to disk`)
  expect(doc_query(`.cmd-metadata`).textContent).toBe(`Workspace · Modified`)
  expect(doc_query(`.cmd-badge`).textContent).toBe(`File`)
  // action without shortcut renders no kbd
  const quit_li = Array.from(document.querySelectorAll(`li[role='option']`)).find((li) =>
    li.textContent?.includes(`quit`),
  )
  expect(quit_li?.querySelector(`kbd`)).toBeNull()

  await type_search(`workspace persist`)
  expect(option_labels()).toHaveLength(1)
  expect(option_labels()[0]).toContain(`save file`)
})

async function search_pagefind(query: string): Promise<void> {
  await type_search(query)
  await vi.runAllTimersAsync()
  await tick()
}

describe(`PageSearch`, () => {
  const base_props = { open: true, fade_duration_ms: 0, debounce_ms: 0 }
  const make_pagefind_response = (title: string) => ({
    results: [
      {
        id: title,
        data: async () => ({
          url: `/${title.toLowerCase()}.html`,
          plain_excerpt: `${title} content`,
          meta: { title },
          sub_results: [],
        }),
      },
    ],
  })

  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test.each([
    {
      strip_html_suffix: true,
      transform_url: (url: string) => `/docs${url}`,
      section_url: `/phase-diagram.html#temperature-composition`,
      expected_url: `/docs/phase-diagram#temperature-composition`,
    },
    {
      strip_html_suffix: false,
      transform_url: undefined,
      section_url: `/phase-diagram.html#temperature-composition`,
      expected_url: `/phase-diagram.html#temperature-composition`,
    },
    {
      strip_html_suffix: true,
      transform_url: undefined,
      section_url: `/download?file=guide.html`,
      expected_url: `/download?file=guide.html`,
    },
    {
      strip_html_suffix: true,
      transform_url: undefined,
      section_url: `/docs/index.html?next=/legacy.html`,
      expected_url: `/docs/?next=/legacy.html`,
    },
    {
      strip_html_suffix: true,
      transform_url: undefined,
      section_url: `/docs/#config.html`,
      expected_url: `/docs/#config.html`,
    },
  ])(
    `PageSearch paginates and navigates $section_url`,
    async ({ strip_html_suffix, transform_url, section_url, expected_url }) => {
      const navigate = vi.fn()
      const search = vi.fn(async () => ({
        results: [
          {
            id: `phase-diagram`,
            data: async () => ({
              url: `/phase-diagram.html`,
              plain_excerpt: `Binary phase diagram`,
              meta: { title: `Phase diagrams` },
              sub_results: [
                {
                  title: `Overview`,
                  url: `/phase-diagram.html#overview`,
                  plain_excerpt: `General phase diagram`,
                },
                {
                  title: `Temperature composition`,
                  url: section_url,
                  plain_excerpt: `Interactive &lt;temperature&gt; composition diagram`,
                },
              ],
            }),
          },
        ],
      }))
      const props = $state({
        ...base_props,
        batch_size: 0.5,
        navigate,
        strip_html_suffix,
        transform_url,
        load_pagefind: async () => ({ search }),
      })
      mount(PageSearch, { target: document.body, props })

      await search_pagefind(`binary`)

      expect(search).toHaveBeenCalledExactlyOnceWith(`binary`)
      expect(document.querySelectorAll(`li[role='option']`)).toHaveLength(1)
      doc_query<HTMLUListElement>(`ul.options`).dispatchEvent(new Event(`scroll`))
      await vi.runAllTimersAsync()
      await tick()
      const options = document.querySelectorAll<HTMLLIElement>(`li[role='option']`)
      expect(Array.from(options, (option) => option.textContent?.trim())).toEqual([
        `Phase diagrams › Overview General phase diagram`,
        `Phase diagrams › Temperature composition Interactive <temperature> composition diagram`,
      ])

      options[1].click()
      await tick()

      expect(navigate).toHaveBeenCalledExactlyOnceWith(expected_url, {
        query: `binary`,
        label: `Phase diagrams › Temperature composition`,
        description: `Interactive <temperature> composition diagram`,
      })
      expect(props.open).toBe(false)
    },
  )

  // typing a page slug must not wait on the index: fallback_actions reach CommandMenu as
  // static options, so they filter client-side while Pagefind is still loading
  test(`fallback actions match while the Pagefind load never settles`, async () => {
    const load_pagefind = vi.fn(() => new Promise<never>(() => {}))
    mount(PageSearch, {
      target: document.body,
      props: {
        ...base_props,
        fallback_actions: [
          { label: `/styling`, action: vi.fn() },
          { label: `/grouping`, action: vi.fn() },
        ],
        load_pagefind,
      },
    })

    await search_pagefind(`styling`)

    expect(option_labels()).toEqual([`/styling`])
    expect(load_pagefind).toHaveBeenCalledOnce()
  })

  test(`isolates concurrent queries that normalize to the same text`, async () => {
    const stale_response = make_pagefind_response(`Stale`)
    const fresh_response = make_pagefind_response(`Fresh`)
    const requests = [
      Promise.withResolvers<typeof stale_response>(),
      Promise.withResolvers<typeof fresh_response>(),
    ]
    const search = vi
      .fn()
      .mockReturnValueOnce(requests[0].promise)
      .mockReturnValueOnce(requests[1].promise)
    mount(PageSearch, {
      target: document.body,
      props: {
        ...base_props,
        load_pagefind: async () => ({ search }),
      },
    })

    await search_pagefind(`alpha`)
    await search_pagefind(` alpha `)
    expect(search).toHaveBeenCalledTimes(2)

    requests[1].resolve(fresh_response)
    await vi.runAllTimersAsync()
    await tick()
    expect(doc_query(`.cmd-label`).childNodes[0]?.textContent?.trim()).toBe(`Fresh`)

    requests[0].resolve(stale_response)
    await tick()

    expect(doc_query(`.cmd-label`).childNodes[0]?.textContent?.trim()).toBe(`Fresh`)
  })

  test(`retries loading Pagefind after a transient failure`, async () => {
    const search = vi.fn(async () => make_pagefind_response(`Fresh`))
    const load_pagefind = vi
      .fn()
      .mockRejectedValueOnce(new Error(`Unavailable`))
      .mockResolvedValue({ search })
    mount(PageSearch, {
      target: document.body,
      props: {
        ...base_props,
        fallback_actions: [{ label: `Fallback`, action: vi.fn() }],
        load_pagefind,
      },
    })

    await search_pagefind(`fallback`)
    expect(doc_query(`.cmd-label`).textContent).toContain(`Fallback`)

    await search_pagefind(`fresh`)
    expect(load_pagefind).toHaveBeenCalledTimes(2)
    expect(doc_query(`.cmd-label`).textContent).toContain(`Fresh`)
  })

  test(`keeps the loader stable while using current callback props`, async () => {
    const [first_navigate, second_navigate, onadd] = [vi.fn(), vi.fn(), vi.fn()]
    const search = vi.fn(async () => make_pagefind_response(`Fresh`))
    const props = $state({
      ...base_props,
      load_pagefind: async () => ({ search }),
      navigate: first_navigate,
      onadd,
      strip_html_suffix: false,
      transform_url: (url: string) => `/old${url}`,
    })
    mount(PageSearch, { target: document.body, props })

    await search_pagefind(`fresh`)
    props.navigate = second_navigate
    props.strip_html_suffix = true
    props.transform_url = (url: string) => `/new${url}`
    await tick()

    expect(search).toHaveBeenCalledOnce()
    doc_query<HTMLLIElement>(`li[role='option']`).click()
    expect(onadd.mock.calls[0][0].option.id).toBe(`pagefind:Fresh:0:/fresh.html`)
    expect(first_navigate).not.toHaveBeenCalled()
    expect(second_navigate).toHaveBeenCalledExactlyOnceWith(`/new/fresh`, {
      query: `fresh`,
      label: `Fresh`,
      description: `Fresh content`,
    })
  })

  test.each([
    [`pagefind_key is unchanged`, `alpha`, `Alpha`, 0],
    [`pagefind_key changes`, `beta`, `Beta`, 1],
  ])(
    `swapping load_pagefind reuses the cached index unless %s`,
    async (_scenario, next_key, expected_label, expected_beta_loads) => {
      const load_alpha = vi.fn(async () => ({
        search: async () => make_pagefind_response(`Alpha`),
      }))
      const load_beta = vi.fn(async () => ({
        search: async () => make_pagefind_response(`Beta`),
      }))
      const props = $state({
        ...base_props,
        pagefind_key: `alpha`,
        load_pagefind: load_alpha,
      })
      mount(PageSearch, { target: document.body, props })

      await search_pagefind(`first`)
      expect(doc_query(`.cmd-label`).textContent).toContain(`Alpha`)

      props.load_pagefind = load_beta
      props.pagefind_key = next_key
      await search_pagefind(`second`)

      expect(doc_query(`.cmd-label`).textContent).toContain(expected_label)
      expect(load_alpha).toHaveBeenCalledOnce()
      expect(load_beta).toHaveBeenCalledTimes(expected_beta_loads)
    },
  )

  test.each([
    [
      `index has no matches`,
      () => vi.fn(async () => ({ search: async () => ({ results: [] }) })),
    ],
    [
      `result fragments all fail`,
      () =>
        vi.fn(async () => ({
          search: async () => ({
            results: [
              {
                id: `broken`,
                data: async () => {
                  throw new Error(`Fragment unavailable`)
                },
              },
            ],
          }),
        })),
    ],
  ])(
    `keeps matching fallback actions locally when the %s`,
    async (_scenario, make_load_pagefind) => {
      const fallback_actions = [
        {
          label: `API reference`,
          description: `All exported props`,
          badge: `Docs`,
          metadata: `Library`,
          keywords: [`schema`],
          action: vi.fn(),
        },
        {
          label: `Styling guide`,
          description: `CSS custom properties`,
          badge: `Guide`,
          metadata: `Visual`,
          keywords: [`theme`],
          action: vi.fn(),
        },
      ]
      const load_pagefind = make_load_pagefind()
      mount(PageSearch, {
        target: document.body,
        props: { ...base_props, fallback_actions, load_pagefind },
      })

      await vi.runAllTimersAsync()
      expect(document.querySelectorAll(`li[role='option']`)).toHaveLength(2)
      expect(load_pagefind).not.toHaveBeenCalled()

      await search_pagefind(`css theme visual guide`)

      const options = document.querySelectorAll(`li[role='option']`)
      expect(options).toHaveLength(1)
      expect(options[0].textContent).toContain(`Styling guide`)
      expect(load_pagefind).toHaveBeenCalledTimes(1)

      await search_pagefind(`api schema library docs`)

      expect(load_pagefind).toHaveBeenCalledTimes(1)
      doc_query<HTMLLIElement>(`li[role='option']`).click()
      expect(fallback_actions[0].action).toHaveBeenCalledExactlyOnceWith(`API reference`)
      expect(fallback_actions[1].action).not.toHaveBeenCalled()
    },
  )

  test(`PageSearch handles a failed fragment and URL-derived title`, async () => {
    const make_result = (
      url: string,
      title: string,
      meta: Record<string, string> = { title },
    ) => ({
      id: url,
      data: async () => ({
        url,
        plain_excerpt: `${title} content`,
        meta,
        sub_results: [],
      }),
    })
    const search = vi.fn(async () => ({
      results: [
        {
          id: `broken`,
          data: async () => {
            throw new Error(`Fragment unavailable`)
          },
        },
        make_result(`/reference-guide.html?tab=api`, `Reference content`, {}),
        make_result(`/docs/`, `Docs content`, {}),
      ],
    }))
    mount(PageSearch, {
      target: document.body,
      props: {
        ...base_props,
        batch_size: 2,
        load_pagefind: async () => ({ search }),
      },
    })

    await search_pagefind(`content`)

    const labels = Array.from(document.querySelectorAll(`.cmd-label`), (label) =>
      label.childNodes[0]?.textContent?.trim(),
    )
    expect(labels).toEqual([`Reference Guide`, `Docs`])
  })
})

test.each([
  [`ctrl+shift+s`, [`Ctrl`, `⇧`, `S`]],
  [`meta+enter`, [`⌘`, `↵`]],
  [`ctrl++`, [`Ctrl`, `+`]], // '+' is both the separator and the key
  [`ctrl+tab`, [`Ctrl`, `Tab`]], // segment without a symbol is title-cased
])(`renders shortcut %s as %j`, async (shortcut, expected_parts) => {
  mount(CommandMenu, {
    target: document.body,
    props: {
      open: true,
      fade_duration_ms: 0,
      actions: [{ label: `zoom in`, action: vi.fn(), shortcut }],
    },
  })
  await tick()

  expect(shortcut_kbd_parts()).toEqual(expected_parts)
})

test(`plain actions without shortcut/description use default option rendering`, async () => {
  mount(CommandMenu, {
    target: document.body,
    props: { open: true, actions: mock_actions, fade_duration_ms: 0 },
  })
  await tick()
  expect(document.querySelector(`.cmd-action`)).toBeNull()
})

test.each([
  {
    desc: `fires when closed`,
    open: false,
    global_shortcuts: true,
    action_disabled: false,
    calls: 1,
  },
  {
    desc: `disabled via prop`,
    open: false,
    global_shortcuts: false,
    action_disabled: false,
    calls: 0,
  },
  {
    desc: `inactive while open`,
    open: true,
    global_shortcuts: true,
    action_disabled: false,
    calls: 0,
  },
  {
    desc: `ignores wrong modifiers`,
    open: false,
    global_shortcuts: true,
    action_disabled: false,
    calls: 0,
    shift: false,
  },
])(
  `global action shortcuts: $desc`,
  async ({ open, global_shortcuts, calls, shift = true, action_disabled }) => {
    const spy = vi.fn()
    const actions = [
      {
        label: `save`,
        action: spy,
        shortcut: `ctrl+shift+s`,
        disabled: action_disabled,
      },
    ]
    mount(CommandMenu, {
      target: document.body,
      props: { actions, open, global_shortcuts, fade_duration_ms: 0 },
    })
    await tick()

    globalThis.dispatchEvent(
      new KeyboardEvent(`keydown`, {
        key: `s`,
        ctrlKey: true,
        shiftKey: shift,
        cancelable: true,
      }),
    )
    await tick()

    expect(spy).toHaveBeenCalledTimes(calls)
    if (calls > 0) expect(spy).toHaveBeenCalledWith(`save`)
  },
)

test(`global shortcuts ignore events consumed by editable controls`, () => {
  const action = vi.fn()
  mount(CommandMenu, {
    target: document.body,
    props: {
      actions: [{ label: `save`, action, shortcut: `ctrl+shift+s` }],
      fade_duration_ms: 0,
    },
  })
  const textarea = document.createElement(`textarea`)
  textarea.addEventListener(`keydown`, (event) => event.preventDefault())
  document.body.append(textarea)

  textarea.dispatchEvent(
    new KeyboardEvent(`keydown`, {
      key: `s`,
      ctrlKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    }),
  )

  expect(action).not.toHaveBeenCalled()
})

// Shift counts as typing, not as a chord, so neither may run nor steal the keystroke
// inside an editable target. The plain div keeps the guard honest: without it,
// suppressing these shortcuts everywhere would still pass.
test.each([`n`, `shift+n`])(
  `global shortcut %s fires only outside editable targets`,
  (shortcut) => {
    const action = vi.fn()
    mount(CommandMenu, {
      target: document.body,
      props: { actions: [{ label: `new note`, action, shortcut }], fade_duration_ms: 0 },
    })
    const press = (tag: string) => {
      const target = document.createElement(tag)
      document.body.append(target)
      const event = new KeyboardEvent(`keydown`, {
        key: `n`,
        shiftKey: shortcut.startsWith(`shift`),
        bubbles: true,
        cancelable: true,
      })
      target.dispatchEvent(event)
      return event.defaultPrevented
    }

    expect(press(`textarea`)).toBe(false)
    expect(action).not.toHaveBeenCalled()

    expect(press(`div`)).toBe(true)
    expect(action).toHaveBeenCalledExactlyOnceWith(`new note`)
  },
)

test(`global shortcuts skip disabled duplicate bindings`, async () => {
  const [disabled_action, enabled_action] = [vi.fn(), vi.fn()]
  mount(CommandMenu, {
    target: document.body,
    props: {
      actions: [
        {
          label: `disabled save`,
          action: disabled_action,
          shortcut: `ctrl+shift+s`,
          disabled: true,
        },
        { label: `save`, action: enabled_action, shortcut: `ctrl+shift+s` },
      ],
    },
  })

  press_ctrl_shift(`s`)
  await tick()

  expect(disabled_action).not.toHaveBeenCalled()
  expect(enabled_action).toHaveBeenCalledExactlyOnceWith(`save`)
})

test(`recent_actions_key ranks, persists, and reloads recently triggered actions`, async () => {
  const [storage_key, next_storage_key] = [`test-cmd-recents`, `test-cmd-recents-next`]
  localStorage.setItem(next_storage_key, JSON.stringify([`beta`]))
  const actions = [`alpha`, `beta`, `gamma`].map((label) => ({
    label,
    action: vi.fn(),
  }))
  const props = $state({
    open: true,
    actions,
    recent_actions_key: storage_key,
    fade_duration_ms: 0,
  })
  mount(CommandMenu, { target: document.body, props })
  await tick()

  // no recents yet: original order
  expect(option_labels()).toEqual([`alpha`, `beta`, `gamma`])

  // trigger gamma via keyboard (ArrowDown x2 + Enter)
  const input_el = menu_input()
  for (let idx = 0; idx < 2; idx++) {
    input_el.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `ArrowDown`, bubbles: true }),
    )
  }
  input_el.dispatchEvent(new KeyboardEvent(`keydown`, { key: `Enter`, bubbles: true }))
  await tick()

  expect(actions[2].action).toHaveBeenCalledExactlyOnceWith(`gamma`)
  expect(props.open).toBe(false) // menu closed after trigger
  expect(JSON.parse(localStorage.getItem(storage_key) ?? `[]`)).toEqual([`gamma`])

  // reopen: gamma now ranks first, rest keep original order
  props.open = true
  await tick()
  expect(option_labels()).toEqual([`gamma`, `alpha`, `beta`])

  props.recent_actions_key = next_storage_key
  await tick()
  expect(option_labels()).toEqual([`beta`, `alpha`, `gamma`])
})

test(`recent_actions_key uses action ids for duplicate labels`, async () => {
  const storage_key = `test-cmd-recents-ids`
  localStorage.setItem(storage_key, JSON.stringify([`mixed`]))
  const actions = [
    { id: `mixed`, label: `save`, description: `Mixed`, action: vi.fn() },
    { label: `save`, description: `No id`, action: vi.fn() },
  ]
  const props = $state({ open: true, actions, recent_actions_key: storage_key })
  mount(CommandMenu, { target: document.body, props })
  await tick()

  expect(doc_query(`li[role='option'] .cmd-description`).textContent).toBe(`Mixed`)

  doc_query(`li[role='option']`).dispatchEvent(
    new KeyboardEvent(`keydown`, { key: `Enter`, bubbles: true }),
  )
  await tick()

  expect(actions[0].action).toHaveBeenCalledExactlyOnceWith(`save`)
  expect(JSON.parse(localStorage.getItem(storage_key) ?? `[]`)).toEqual([`mixed`])
})

// pre-existing recents-storage contents -> dropdown order on initial open
test.each([
  [
    `valid recents rank first`,
    JSON.stringify([`beta`, `gamma`]),
    [`beta`, `gamma`, `alpha`],
    undefined,
  ],
  [
    `max_recent limits stored recents`,
    JSON.stringify([`beta`, `gamma`]),
    [`beta`, `alpha`, `gamma`],
    1,
  ],
  // stale persisted ids (actions since removed/renamed) must not occupy low ranks,
  // else a real recent (rank 4 here) sorts after non-recents (default rank 3)
  [
    `stale ids are ignored so real recents still rank first`,
    JSON.stringify([`removed-1`, `removed-2`, `removed-3`, `removed-4`, `gamma`]),
    [`gamma`, `alpha`, `beta`],
    undefined,
  ],
  [
    `unparsable JSON is ignored`,
    `not valid json{{{`,
    [`alpha`, `beta`, `gamma`],
    undefined,
  ],
  [`non-string entries are ignored`, `[1,2,3]`, [`alpha`, `beta`, `gamma`], undefined],
])(
  `recents storage on initial open: %s`,
  async (_desc, stored, expected_order, max_recent) => {
    const storage_key = `test-cmd-stored-recents`
    localStorage.setItem(storage_key, stored)
    const actions = [`alpha`, `beta`, `gamma`].map((label) => ({
      label,
      action: vi.fn(),
    }))
    // flushSync so render errors from bad storage data fail this test, not the suite
    flushSync(() => {
      mount(CommandMenu, {
        target: document.body,
        props: {
          open: true,
          actions,
          recent_actions_key: storage_key,
          max_recent,
          fade_duration_ms: 0,
        },
      })
    })
    await tick()

    expect(option_labels()).toEqual(expected_order)
  },
)

// global shortcut presses (while closed) persist the triggered action to recents
// (that the action also fires is covered by `global action shortcuts: fires when closed`)
test.each([
  {
    desc: `records the triggered action`,
    actions: [
      { label: `alpha`, action: vi.fn() },
      { label: `hotkeyed`, action: vi.fn(), shortcut: `ctrl+shift+h` },
    ],
    max_recent: undefined,
    keys: [`h`],
    expected: [`hotkeyed`],
  },
  {
    desc: `max_recent caps recents at the most-recently triggered`,
    actions: [
      { label: `first`, action: vi.fn(), shortcut: `ctrl+shift+1` },
      { label: `second`, action: vi.fn(), shortcut: `ctrl+shift+2` },
    ],
    max_recent: 1,
    keys: [`1`, `2`],
    expected: [`second`],
  },
])(
  `global shortcut recents persistence: $desc`,
  async ({ actions, max_recent, keys, expected }) => {
    const storage_key = `test-cmd-recents-${expected.join(`-`)}`
    mount(CommandMenu, {
      target: document.body,
      props: {
        actions,
        open: false,
        recent_actions_key: storage_key,
        max_recent,
        fade_duration_ms: 0,
      },
    })
    await tick()

    for (const key of keys) press_ctrl_shift(key)
    await tick()

    expect(JSON.parse(localStorage.getItem(storage_key) ?? `[]`)).toEqual(expected)
  },
)
