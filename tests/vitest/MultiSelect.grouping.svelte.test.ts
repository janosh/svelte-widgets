import { tick } from 'svelte'
import { describe, expect, test, vi } from 'vite-plus/test'
import type { MultiSelectProps } from '$lib/types'
import { doc_query } from './index'
import {
  focus_input,
  fresh_key,
  get_input,
  mount_multiselect,
  type_search_text,
} from './MultiSelect.test-utils'

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
  const mount_grouped = async (props: Partial<MultiSelectProps> = {}) => {
    mount_multiselect({ options: grouped_options, open: true, ...props })
    await tick()
  }

  test(`renders group headers and options correctly`, async () => {
    await mount_grouped()

    expect(header_names()).toEqual([`Genre`, `Key`])

    const all_options = document.querySelectorAll(`ul.options > li:not(.group-header)`)
    expect(all_options).toHaveLength(6)
  })

  test.each([`first`, `last`] as const)(
    `ungroupedPosition=%s renders ungrouped options in correct position`,
    async (ungroupedPosition) => {
      await mount_grouped({ ungroupedPosition })

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
    await mount_grouped()

    const input = get_input()
    await type_search_text(`Rock`, input)

    // Only Genre group header should be visible since only Rock matches
    const group_headers = document.querySelectorAll(`ul.options > li.group-header`)
    expect(group_headers).toHaveLength(1)
    expect(group_headers[0].textContent).toContain(`Genre`)
  })

  test(`arrow navigation skips group headers`, async () => {
    await mount_grouped()

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
      await mount_grouped({ collapsibleGroups: true })

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
    await mount_grouped({
      groupSelectAll: true,
      onselectAll: onselectAll_spy,
    })

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
      await mount_grouped({ groupSelectAll: true, maxSelect })

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
      await mount_grouped({ [prop_name]: prop_value })

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

    await mount_grouped({ options: mixed_options })

    const group_headers = document.querySelectorAll(`ul.options > li.group-header`)
    expect(group_headers).toHaveLength(1)

    const selectable_options = document.querySelectorAll(
      `ul.options > li:not(.group-header)`,
    )
    expect(selectable_options).toHaveLength(4)
  })

  test(`selecting options from groups works correctly`, async () => {
    const onchange_spy = vi.fn()
    await mount_grouped({ onchange: onchange_spy })

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
    await mount_grouped({
      options: options_with_disabled,
      groupSelectAll: true,
      onselectAll: onselectAll_spy,
    })

    const test_header = find_group_header(`Test`)
    const select_all_btn = test_header.querySelector<HTMLElement>(
      `button.group-select-all`,
    )
    select_all_btn?.click()
    await tick()

    expect(onselectAll_spy).toHaveBeenCalledTimes(1)
    const selected_options = onselectAll_spy.mock.calls[0][0].options
    expect(selected_options).toHaveLength(2)
    expect(selected_options.every((opt: { disabled?: boolean }) => !opt.disabled)).toBe(
      true,
    )
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

    const select_all_btn = genre_header.querySelector<HTMLElement>(
      `button.group-select-all`,
    )
    expect(select_all_btn).toBeInstanceOf(HTMLButtonElement)
    select_all_btn?.click()
    await tick()

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

    await mount_grouped({ options: ordered_options })

    expect(header_names()).toEqual([`Zebra`, `Alpha`, `Middle`])
  })

  test.each([
    [true, `button`, `0`, true],
    [false, `presentation`, `-1`, false],
  ] as const)(
    `group headers have correct a11y attrs when collapsibleGroups=%s`,
    async (collapsibleGroups, expected_role, expected_tabindex, has_aria_expanded) => {
      await mount_grouped({ collapsibleGroups })

      const group_headers = document.querySelectorAll(`ul.options > li.group-header`)
      expect(group_headers).toHaveLength(2) // else the loop below asserts nothing
      for (const header of group_headers) {
        expect(header.getAttribute(`role`)).toBe(expected_role)
        expect(header.getAttribute(`tabindex`)).toBe(expected_tabindex)
        expect(header.hasAttribute(`aria-expanded`)).toBe(has_aria_expanded)
        expect(header.getAttribute(`aria-label`)).toMatch(/^Group: /u)
      }

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
    await mount_grouped({
      collapsibleGroups: true,
      ongroupToggle: ongroupToggle_spy,
    })

    const genre_header = find_group_header(`Genre`)
    genre_header.click()
    await tick()

    expect(ongroupToggle_spy).toHaveBeenCalledWith({ group: `Genre`, collapsed: true })

    genre_header.click()
    await tick()

    expect(ongroupToggle_spy).toHaveBeenCalledWith({ group: `Genre`, collapsed: false })
    expect(ongroupToggle_spy).toHaveBeenCalledTimes(2)
  })

  test(`collapsedGroups prop controls initial collapsed state`, async () => {
    await mount_grouped({
      collapsibleGroups: true,
      collapsedGroups: new Set([`Genre`]),
    })

    const genre_header = find_group_header(`Genre`)
    expect(genre_header.getAttribute(`aria-expanded`)).toBe(`false`)

    const rock_option = Array.from(
      document.querySelectorAll(`ul.options > li:not(.group-header)`),
    ).find((li) => li.textContent?.includes(`Rock`))
    expect(rock_option).toBeUndefined()

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
    await mount_grouped({
      collapsibleGroups: true,
      collapsedGroups: new Set([`Genre`, `Key`]), // both collapsed initially
      searchExpandsCollapsedGroups: true,
      ongroupToggle: ongroupToggle_spy,
    })

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
      await mount_grouped({
        options: many_options,
        maxOptions: 3,
        onselectAll: onselectAll_spy,
        ...props,
      })

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

      await mount_grouped({
        options: options_with_groups,
        searchMatchesGroups: true,
        ...extra_props,
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
    await mount_grouped({
      collapsibleGroups: true,
      keyboardExpandsCollapsedGroups: true,
    })

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
    await mount_grouped({ stickyGroupHeaders: true })

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
    mount_multiselect(props)
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
    await mount_grouped({
      groupSelectAll: true,
      keepSelectedInDropdown: `checkboxes`,
      onremoveAll: onremoveAll_spy,
    })

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

  const deselect_btn = doc_query<HTMLButtonElement>(
    `ul.options > li.group-header button.group-select-all`,
  )
  expect(deselect_btn.textContent?.trim()).toBe(`Deselect all`)
  deselect_btn.click()
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
