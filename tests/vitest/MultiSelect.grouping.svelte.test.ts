import { tick } from 'svelte'
import { describe, expect, test, vi } from 'vitest'
import type { MultiSelectProps } from '$lib/types'
import { doc_query } from './index'
import {
  focus_input,
  fresh_key,
  get_input,
  mount_multiselect,
  type_search_text,
} from './MultiSelect.test-utils'

const find_group_header = (name: string): HTMLElement => {
  const header = Array.from(
    document.querySelectorAll<HTMLElement>(`ul.options > li.group-header`),
  ).find((element) => element.textContent?.includes(name))
  if (!header) throw new Error(`Group header "${name}" not found`)
  return header
}
const header_names = () =>
  [...document.querySelectorAll(`ul.options > li.group-header`)].map((header) =>
    header.querySelector(`.group-label`)?.textContent?.trim(),
  )
// `aria-expanded` moved from the presentational <li> onto the real collapse <button>
const group_expanded = (group: string | HTMLElement): string | null => {
  const header = typeof group === `string` ? find_group_header(group) : group
  return (
    header
      .querySelector<HTMLButtonElement>(`button.group-collapse-toggle`)
      ?.getAttribute(`aria-expanded`) ?? null
  )
}
const group_select_all_btn = (group: string) =>
  find_group_header(group).querySelector<HTMLButtonElement>(`button.group-select-all`)
const option_items = () =>
  document.querySelectorAll<HTMLElement>(
    `ul.options > li:not(.group-header):not(.select-all):not(.user-msg)`,
  )

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

  const genre_options = grouped_options.filter(
    (opt) => typeof opt === `object` && opt.group === `Genre`,
  )
  const all_disabled_options = [
    { label: `X`, group: `AllDisabled`, disabled: true },
    { label: `Y`, group: `AllDisabled`, disabled: true },
    { label: `Z`, group: `HasEnabled` },
  ]
  const mount_grouped = async (props: Partial<MultiSelectProps> = {}) => {
    mount_multiselect({ options: grouped_options, open: true, ...props })
    await tick()
  }

  test(`renders grouped and ungrouped options that remain selectable`, async () => {
    const onchange = vi.fn()
    await mount_grouped({ onchange })

    expect(header_names()).toEqual([`Genre`, `Key`])
    expect(option_items()).toHaveLength(6)

    const rock_option = Array.from(option_items()).find(
      (item) => item.textContent?.trim() === `Rock`,
    )
    rock_option?.click()
    await tick()
    expect(onchange).toHaveBeenCalledWith({
      option: { label: `Rock`, group: `Genre` },
      type: `add`,
    })
  })

  test.each([`first`, `last`] as const)(
    `ungroupedPosition=%s renders ungrouped options in correct position`,
    async (ungroupedPosition) => {
      await mount_grouped({ ungroupedPosition })

      const all_lis = document.querySelectorAll(`ul.options > li`)
      const ungrouped_idx = Array.from(all_lis).findIndex((li) =>
        li.textContent?.includes(`Ungrouped Option`),
      )

      expect(ungrouped_idx).toBe(ungroupedPosition === `first` ? 0 : all_lis.length - 1)
    },
  )

  test(`filtering shows only groups with matching options`, async () => {
    await mount_grouped()

    await type_search_text(`Rock`)

    expect(header_names()).toEqual([`Genre`])
  })

  test(`arrow navigation skips group headers`, async () => {
    await mount_grouped()

    const input = await focus_input()

    // the second press steps over the Genre header between the ungrouped option and Rock
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(
      `Ungrouped Option`,
    )

    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    expect(doc_query(`ul.options > li.active`).textContent?.trim()).toBe(`Rock`)
  })

  test.each([
    [
      `click`,
      (header: HTMLElement) => header.click(),
      (header: HTMLElement) => header.click(),
    ],
    [
      // a real <button> now, so Enter/Space activate it natively (no keydown handler)
      `keyboard activation of the toggle button`,
      (header: HTMLElement) =>
        header.querySelector<HTMLButtonElement>(`button.group-collapse-toggle`)?.click(),
      (header: HTMLElement) =>
        header.querySelector<HTMLButtonElement>(`button.group-collapse-toggle`)?.click(),
    ],
  ])(
    `collapsibleGroups toggles group visibility via %s`,
    async (_via, collapse, expand) => {
      const ongroupToggle = vi.fn()
      await mount_grouped({ collapsibleGroups: true, ongroupToggle })

      const genre_header = find_group_header(`Genre`)
      expect(genre_header.classList.contains(`collapsible`)).toBe(true)

      const count_options = () => option_items().length
      const initial_count = count_options()

      collapse(genre_header)
      await tick()
      expect(count_options()).toBeLessThan(initial_count)
      expect(group_expanded(genre_header)).toBe(`false`)
      expect(ongroupToggle).toHaveBeenNthCalledWith(1, {
        group: `Genre`,
        collapsed: true,
      })

      expand(genre_header)
      await tick()
      expect(count_options()).toBe(initial_count)
      expect(group_expanded(genre_header)).toBe(`true`)
      expect(ongroupToggle).toHaveBeenNthCalledWith(2, {
        group: `Genre`,
        collapsed: false,
      })
    },
  )

  test(`groupSelectAll buttons select groups by click and keyboard`, async () => {
    const onselectAll_spy = vi.fn()
    await mount_grouped({
      groupSelectAll: true,
      onselectAll: onselectAll_spy,
    })

    const select_all_buttons = document.querySelectorAll(
      `ul.options > li.group-header button.group-select-all`,
    )
    expect(select_all_buttons).toHaveLength(2) // One for each group

    group_select_all_btn(`Genre`)?.click()
    await tick()

    expect(onselectAll_spy).toHaveBeenCalledTimes(1)
    expect(onselectAll_spy.mock.calls[0][0].options).toEqual(genre_options)

    group_select_all_btn(`Key`)?.dispatchEvent(fresh_key(`Enter`))
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
      await mount_grouped({ groupSelectAll: true, maxSelect })

      const select_all_buttons = document.querySelectorAll(
        `ul.options > li.group-header button.group-select-all`,
      )
      expect(select_all_buttons).toHaveLength(expected_buttons)

      if (expected_buttons > 0) {
        group_select_all_btn(`Genre`)?.click()
        await tick()
        expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(
          expected_selected,
        )
      }
    },
  )

  test.each([
    [
      `maxSelect already reached`,
      { selected: [grouped_options[0], grouped_options[1]], maxSelect: 2 },
      `Genre`,
      { disabled: true, label: `Select all` },
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
    await mount_grouped({ groupSelectAll: true, ...props })

    const btn = group_select_all_btn(group)
    expect(btn?.disabled).toBe(expected.disabled)
    expect(btn?.textContent?.trim()).toBe(expected.label)
  })

  test(`group select-all partial fill fires onmaxreached with correct payload`, async () => {
    const onmaxreached_spy = vi.fn()
    await mount_grouped({
      groupSelectAll: true,
      selected: [grouped_options[0]],
      maxSelect: 2,
      onmaxreached: onmaxreached_spy,
    })

    const genre_btn = group_select_all_btn(`Genre`)
    expect(genre_btn?.disabled).toBe(false)
    genre_btn?.click()
    await tick()

    expect(document.querySelectorAll(`ul.selected > li`)).toHaveLength(2)
    expect(onmaxreached_spy).toHaveBeenCalledTimes(1)
    expect(onmaxreached_spy).toHaveBeenCalledWith(
      expect.objectContaining({ maxSelect: 2 }),
    )
  })

  test(`applies group header class, style, and sticky mode`, async () => {
    await mount_grouped({
      liGroupHeaderClass: `custom-header-class`,
      liGroupHeaderStyle: `background: red`,
      stickyGroupHeaders: true,
    })

    const group_headers = document.querySelectorAll<HTMLElement>(
      `ul.options > li.group-header`,
    )
    expect(group_headers).toHaveLength(2)
    for (const header of group_headers) {
      expect(header.classList.contains(`custom-header-class`)).toBe(true)
      expect(header.classList.contains(`sticky`)).toBe(true)
      expect(header.style.background).toBe(`red`)
    }
  })

  test.each([
    [`Genre`, undefined, 3],
    [`Key`, 2, 2],
  ] as const)(
    `selectAllOption skips collapsed %s group (maxSelect=%s)`,
    async (collapsed_group, maxSelect, expected_selected) => {
      const onselectAll_spy = vi.fn()
      await mount_grouped({
        collapsibleGroups: true,
        selectAllOption: true,
        maxSelect,
        onselectAll: onselectAll_spy,
      })

      find_group_header(collapsed_group).click()
      await tick()

      const select_all_li = document.querySelector<HTMLElement>(
        `ul.options > li.select-all`,
      )
      select_all_li?.click()
      await tick()

      expect(onselectAll_spy).toHaveBeenCalledTimes(1)
      const selected = onselectAll_spy.mock.calls[0][0].options
      expect(selected).toHaveLength(expected_selected)
      expect(
        selected.every((option: { group?: string }) => option.group !== collapsed_group),
      ).toBe(true)
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
    await mount_grouped({
      options: options_with_disabled,
      groupSelectAll: true,
      onselectAll: onselectAll_spy,
    })

    group_select_all_btn(`Test`)?.click()
    await tick()

    expect(onselectAll_spy).toHaveBeenCalledTimes(1)
    expect(onselectAll_spy.mock.calls[0][0].options).toEqual([
      options_with_disabled[0],
      options_with_disabled[2],
    ])
  })

  test(`groupSelectAll works on collapsed groups`, async () => {
    const onselectAll_spy = vi.fn()
    await mount_grouped({
      collapsibleGroups: true,
      groupSelectAll: true,
      onselectAll: onselectAll_spy,
    })

    const genre_header = find_group_header(`Genre`)
    genre_header.click()
    await tick()
    expect(group_expanded(genre_header)).toBe(`false`)

    const select_all_btn = group_select_all_btn(`Genre`)
    expect(select_all_btn).toBeInstanceOf(HTMLButtonElement)
    select_all_btn?.click()
    await tick()

    expect(onselectAll_spy).toHaveBeenCalledTimes(1)
    expect(onselectAll_spy.mock.calls[0][0].options).toEqual(genre_options)
  })

  // a listbox may only own `option`/`group` children, so the header row is presentational:
  // focusability or a global ARIA attribute on the <li> would demote it to listitem, hence
  // no aria-label/tabindex/role=button and the group name rides option aria-describedby
  test.each([true, false] as const)(
    `group headers stay presentational when collapsibleGroups=%s`,
    async (collapsibleGroups) => {
      await mount_grouped({ collapsibleGroups })

      const group_headers = document.querySelectorAll(`ul.options > li.group-header`)
      expect(group_headers).toHaveLength(2) // else the loop below asserts nothing
      for (const header of group_headers) {
        expect(header.getAttribute(`role`)).toBe(`presentation`)
        // either of these would demote it back to a listitem, an invalid listbox child
        expect(header.getAttribute(`tabindex`)).toBeNull()
        expect(header.getAttribute(`aria-label`)).toBeNull()
        // the description lives on a hidden span inside, not on the <li>
        expect(header.querySelector(`span.sr-only[id]`)).not.toBeNull()
      }

      // the collapse control is a real button, and only exists when it can do something
      const toggles = document.querySelectorAll(
        `li.group-header button.group-collapse-toggle`,
      )
      expect(toggles).toHaveLength(collapsibleGroups ? 2 : 0)
      for (const toggle of toggles) {
        expect(toggle.getAttribute(`aria-expanded`)).toBe(`true`)
        expect(toggle.getAttribute(`aria-label`)).toMatch(/^Group: /u)
      }
    },
  )

  test(`options name their group through aria-describedby on the header`, async () => {
    await mount_grouped({})
    const header_ids = new Set(
      [...document.querySelectorAll<HTMLElement>(`li.group-header span.sr-only[id]`)].map(
        (span) => span.id,
      ),
    )
    expect(header_ids.size).toBe(2)

    const described = [...option_items()].map((option) => [
      option.textContent?.trim(),
      option.getAttribute(`aria-describedby`),
    ])
    // every grouped option points at its own header; the ungrouped one points at nothing
    expect(described).toHaveLength(6)
    for (const [label, described_by] of described) {
      if (label === `Ungrouped Option`) {
        expect(described_by).toBeNull()
        continue
      }
      expect(header_ids.has(described_by ?? ``)).toBe(true)
      expect(document.querySelector(`#${described_by}`)?.textContent).toContain(
        label === `C Major` || label === `D Minor` ? `Key` : `Genre`,
      )
    }
  })

  test(`collapsedGroups prop controls initial collapsed state`, async () => {
    await mount_grouped({
      collapsibleGroups: true,
      collapsedGroups: new Set([`Genre`]),
    })

    const genre_header = find_group_header(`Genre`)
    expect(group_expanded(genre_header)).toBe(`false`)

    const rock_option = Array.from(option_items()).find((item) =>
      item.textContent?.includes(`Rock`),
    )
    expect(rock_option).toBeUndefined()

    const key_header = find_group_header(`Key`)
    expect(group_expanded(key_header)).toBe(`true`)
  })

  test.each([
    [`none`, [`Zebra`, `Alpha`, `Middle`]],
    [`asc`, [`Alpha`, `Middle`, `Zebra`]],
    [`desc`, [`Zebra`, `Middle`, `Alpha`]],
    [
      (group_a: string, group_b: string) => group_a.length - group_b.length,
      [`C`, `BB`, `AAA`],
    ],
  ] as const)(
    `groupSortOrder=%s orders groups correctly`,
    async (groupSortOrder, expected_order) => {
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
              { label: `Z Item 2`, group: `Zebra` },
              { label: `M Item`, group: `Middle` },
            ]

      await mount_grouped({ options: options_for_sort, groupSortOrder })

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
    await mount_grouped(extra_props)

    const count_span = find_group_header(`Genre`).querySelector(`.group-count`)
    expect(count_span).toBeInstanceOf(HTMLSpanElement)
    expect(count_span?.textContent?.trim()).toBe(expected_count)
  })

  test.each([
    [`expands the matching group`, `Rock`, { group: `Genre`, collapsed: false }],
    // a bare space fuzzy-matches "C Major"/"D Minor", so the has_search_text guard must
    // keep the Key group collapsed
    [`ignores whitespace-only input`, ` `, null],
  ])(`searchExpandsCollapsedGroups %s`, async (_name, search, expected_toggle) => {
    const ongroupToggle_spy = vi.fn()
    await mount_grouped({
      collapsibleGroups: true,
      collapsedGroups: new Set([`Genre`, `Key`]), // both collapsed initially
      searchExpandsCollapsedGroups: true,
      ongroupToggle: ongroupToggle_spy,
    })

    expect(option_items()).toHaveLength(1)

    await type_search_text(search)

    if (expected_toggle) {
      expect(ongroupToggle_spy).toHaveBeenCalledWith(expected_toggle)
    } else expect(ongroupToggle_spy).not.toHaveBeenCalled()
  })

  test.each([
    [`groupSelectAll`, { groupSelectAll: true }, `button.group-select-all`, false],
    [`selectAllOption`, { selectAllOption: true }, `li.select-all`, false],
    [`repeated reference`, { groupSelectAll: true }, `button.group-select-all`, true],
    [
      `collapse disabled`,
      { groupSelectAll: true, collapsedGroups: new Set([`TestGroup`]) },
      `button.group-select-all`,
      false,
    ],
  ] as const)(`%s respects maxOptions limit`, async (_name, props, selector, repeat) => {
    const many_options = [
      { label: `Option 1`, group: `TestGroup` },
      { label: `Option 2`, group: `TestGroup` },
      { label: `Option 3`, group: `TestGroup` },
      { label: `Option 4`, group: `TestGroup` },
      { label: `Option 5`, group: `TestGroup` },
    ]
    // Null-prototype records retain their shared identity through Svelte's proxy boundary.
    if (repeat) many_options.push(Object.setPrototypeOf(many_options[0], null))

    const onselectAll_spy = vi.fn()
    await mount_grouped({
      options: many_options,
      maxOptions: 3,
      onselectAll: onselectAll_spy,
      ...props,
    })

    expect(option_items()).toHaveLength(3)

    const select_btn = selector.includes(`group`)
      ? find_group_header(`TestGroup`).querySelector(selector)
      : document.querySelector(selector)
    if (select_btn instanceof HTMLElement) select_btn.click()
    await tick()

    expect(onselectAll_spy).toHaveBeenCalledTimes(1)
    const selected = onselectAll_spy.mock.calls[0][0].options
    expect(selected.map((opt: { label: string }) => opt.label)).toEqual([
      `Option 1`,
      `Option 2`,
      `Option 3`,
    ])
  })

  test.each([
    [`fuzzy group-name match`, `Pythn`, {}, [`Django`, `Flask`]],
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

      await mount_grouped({
        options: options_with_groups,
        searchMatchesGroups: true,
        ...extra_props,
      })

      await type_search_text(search_text)

      const labels = Array.from(option_items()).map((item) => item.textContent?.trim())
      expect(labels).toEqual(expected_labels)
    },
  )

  test(`keyboardExpandsCollapsedGroups expands groups on arrow navigation`, async () => {
    await mount_grouped({
      collapsibleGroups: true,
      keyboardExpandsCollapsedGroups: true,
    })

    const genre_header = find_group_header(`Genre`)
    genre_header.click()
    await tick()
    expect(group_expanded(genre_header)).toBe(`false`)

    const input = await focus_input()
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()

    expect(group_expanded(genre_header)).toBe(`true`)
  })

  test(`collapseAllGroups and expandAllGroups functions are bindable`, async () => {
    const [oncollapseAll_spy, onexpandAll_spy] = [vi.fn(), vi.fn()]
    const props = $state<MultiSelectProps>({
      options: grouped_options,
      collapsibleGroups: true,
      oncollapseAll: oncollapseAll_spy,
      onexpandAll: onexpandAll_spy,
      open: true,
      collapseAllGroups: undefined,
      expandAllGroups: undefined,
    })
    mount_multiselect(props)
    await tick()

    props.collapseAllGroups?.()
    await tick()

    expect(oncollapseAll_spy).toHaveBeenCalledTimes(1)
    expect(oncollapseAll_spy.mock.calls[0][0].groups).toEqual([`Genre`, `Key`])

    expect(option_items()).toHaveLength(1) // the ungrouped option is all that is left

    props.expandAllGroups?.()
    await tick()

    expect(onexpandAll_spy).toHaveBeenCalledTimes(1)

    expect(option_items()).toHaveLength(6)
  })

  test.each([false, true])(
    `group selection preserves other groups (colliding keys=%s)`,
    async (colliding_keys) => {
      const onremoveAll_spy = vi.fn()
      const onchange = vi.fn()
      await mount_grouped({
        groupSelectAll: true,
        keepSelectedInDropdown: `checkboxes`,
        onremoveAll: onremoveAll_spy,
        onchange,
        selected: [grouped_options[3]],
        duplicates: colliding_keys,
        key: colliding_keys ? () => `shared` : undefined,
      })

      const select_btn = group_select_all_btn(`Genre`)

      expect(select_btn?.textContent?.trim()).toBe(`Select all`)

      select_btn?.click()
      await tick()

      expect(select_btn?.textContent?.trim()).toBe(`Deselect all`)
      expect(select_btn?.classList.contains(`deselect`)).toBe(true)

      select_btn?.click()
      await tick()

      expect(onremoveAll_spy).toHaveBeenCalledTimes(1)
      expect(onremoveAll_spy.mock.calls[0][0].options).toEqual(genre_options)
      expect(onchange).toHaveBeenLastCalledWith({
        options: [grouped_options[3]],
        type: `removeAll`,
      })

      expect(select_btn?.textContent?.trim()).toBe(`Select all`)
    },
  )
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
  mount_multiselect(props)
  await tick()

  const deselect_btn = group_select_all_btn(`Genre`)
  expect(deselect_btn?.textContent?.trim()).toBe(`Deselect all`)
  deselect_btn?.click()
  await tick()

  // previously dropped to 0 selected, violating minSelect=2
  expect(props.selected).toHaveLength(2)
})

test(`searchExpandsCollapsedGroups: manually collapsed group stays collapsed until the search changes`, async () => {
  mount_multiselect({
    options: [
      { label: `apple`, group: `Fruits` },
      { label: `avocado`, group: `Fruits` },
      { label: `ant`, group: `Animals` },
    ],
    open: true,
    collapsibleGroups: true,
    searchExpandsCollapsedGroups: true,
    collapsedGroups: new Set([`Fruits`]),
  })
  const input = get_input()
  await type_search_text(`a`, input)
  expect(group_expanded(`Fruits`)).toBe(`true`)

  // manual collapse mid-search must stick (previously insta-re-expanded)
  find_group_header(`Fruits`).click()
  await tick()
  expect(group_expanded(`Fruits`)).toBe(`false`)

  // a NEW search re-expands
  await type_search_text(`av`, input)
  expect(group_expanded(`Fruits`)).toBe(`true`)
})
