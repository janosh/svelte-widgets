// deno-lint-ignore-file no-await-in-loop
import { tick } from 'svelte'
import { describe, expect, test } from 'vitest'
import type { MultiSelectProps } from '$lib/types'
import { doc_query } from './index'
import {
  fresh_key,
  get_input,
  mount_multiselect,
  type_search_text,
} from './MultiSelect.test-utils'

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
      mount_multiselect({ options: virtual_options, open: true, virtualList })

      expect(get_rendered_options()).toHaveLength(expected_count)
      expect(get_spacers()).toHaveLength(virtualList ? 2 : 0)
    },
  )

  test(`spacers pad the rendered window to the full list height`, () => {
    mount_multiselect(virtual_props)

    const [top_spacer, bottom_spacer] = get_spacers()
    expect(top_spacer.style.height).toBe(`0px`)
    expect(bottom_spacer.style.height).toBe(
      `${(n_options - initial_end) * item_height}px`,
    )
  })

  test(`scrolling the dropdown re-windows which options are rendered`, async () => {
    mount_multiselect(virtual_props)

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
    mount_multiselect(props)

    get_rendered_options()[0].click()
    await tick()

    expect(props.selected).toEqual([`option 0`])
    expect(doc_query(`ul.selected > li`).textContent?.trim()).toContain(`option 0`)
  })

  test(`arrow keys keep the active option rendered beyond the initial window`, async () => {
    mount_multiselect(virtual_props)

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
    expect(get_rendered_options()[0]?.textContent?.trim()).not.toBe(`option 0`)
    expect(get_rendered_options().length).toBeLessThan(50)
  })

  test(`fuzzy search filtering still works in virtual mode`, async () => {
    mount_multiselect(virtual_props)

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
    mount_multiselect({
      options: make_grouped(50),
      open: true,
      virtualList: { itemHeight: item_height, overscan },
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

    // first ArrowDown activates flat idx 0, whose ROW is 1 (group 0's header is row 0) —
    // auto-scroll must use the row offset, not the flat index (which would scroll to 0)
    const input = get_input()
    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    expect(ul_options.scrollTop).toBe(item_height) // row 1 (header row 0 above it)

    // 11 more presses reach flat idx 11 ("option 6", row 13), still inside the window
    for (let press = 0; press < 11; press++) {
      input.dispatchEvent(fresh_key(`ArrowDown`))
      await tick()
    }
    const active = doc_query(`ul.options li.active`)
    expect(active.textContent?.trim()).toBe(`option 6`)
  })

  test(`rejects virtual grouped lists with sticky headers`, () => {
    expect(() =>
      mount_multiselect({
        options: make_grouped(50),
        open: true,
        virtualList: true,
        stickyGroupHeaders: true,
      }),
    ).toThrow(`virtualList cannot be combined with stickyGroupHeaders`)
  })

  test.each([
    [{ itemHeight: 0 }, `virtualList.itemHeight must be positive`],
    [{ overscan: -1 }, `virtualList.overscan must be a non-negative integer`],
    [{ overscan: 1.5 }, `virtualList.overscan must be a non-negative integer`],
  ] as const)(`rejects invalid virtual config %j`, (virtualList, message) => {
    expect(() => mount_multiselect({ options: virtual_options, virtualList })).toThrow(
      message,
    )
  })
})
