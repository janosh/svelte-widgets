import ColumnFilter from '#lib/table/ColumnFilter.svelte'
import type { ColumnFilterValue } from '#lib/table/types.ts'
import { type ComponentProps, createRawSnippet, tick } from 'svelte'
import { describe, expect, test, vi } from 'vite-plus/test'
import source from '#lib/table/ColumnFilter.svelte?raw'
import { click, doc_query, fire_input, render } from './index'

type Props = ComponentProps<typeof ColumnFilter>

describe(`ColumnFilter`, () => {
  // mounts with `filter` and `open` bound to returned state, like bind:filter / bind:open
  const mount_filter = (
    values: unknown[],
    { open: initially_open = true, ...props }: Partial<Props> = {},
  ) => {
    const state = $state<{ filter?: ColumnFilterValue; open: boolean }>({
      open: initially_open,
    })
    render(ColumnFilter, {
      label: `Score`,
      values: () => values,
      ...props,
      get filter() {
        return state.filter
      },
      set filter(filter: ColumnFilterValue | undefined) {
        state.filter = filter
      },
      get open() {
        return state.open
      },
      set open(open: boolean) {
        state.open = open
      },
    })
    return state
  }
  const trigger = () => doc_query<HTMLButtonElement>(`.column-filter-trigger`)
  const panel = () => document.querySelector<HTMLElement>(`.column-filter-panel`)

  test(`numeric columns get a range whose bounds collapse to no filter when cleared`, async () => {
    const state = mount_filter([3, 1.5, 12.345], { format_bound: String })
    expect(trigger().getAttribute(`aria-label`)).toBe(`Filter Score`)
    const [min, max] = document.querySelectorAll<HTMLInputElement>(`input[type="number"]`)
    expect([min.placeholder, max.placeholder]).toEqual([`1.5`, `12.345`]) // column extent

    await fire_input(min, `2`, `input`)
    expect(state.filter).toEqual({ kind: `numeric`, min: 2 })
    expect(trigger().classList.contains(`active`)).toBe(true)
    await fire_input(max, `10`, `input`)
    expect(state.filter).toEqual({ kind: `numeric`, min: 2, max: 10 })

    await click(`.column-filter-clear`)
    expect(state.filter).toBeUndefined()
    expect(trigger().classList.contains(`active`)).toBe(false)
    expect(document.querySelector(`.column-filter-clear`)).toBeNull()
  })

  // the default placeholders round outwards, so typing them in never drops an edge row
  test.each([
    [[3, 1.5, 12], `1.5`, `12`],
    [[0.12355, 9.8745], `0.123`, `9.88`],
    [[-9.8745, -0.12355], `-9.88`, `-0.123`],
    [[98_765, 123_456], `98700`, `124000`],
  ])(`default bound placeholders for %j are %s to %s`, (values, min, max) => {
    mount_filter(values)
    const inputs = document.querySelectorAll<HTMLInputElement>(`input[type="number"]`)
    expect([...inputs].map((input) => input.placeholder)).toEqual([min, max])
  })

  test(`few distinct values get a checklist, unchecking narrows and rechecking clears`, async () => {
    const state = mount_filter([`beta`, ``, null, `alpha`, `beta`], {
      labels: { blank: `(empty)` },
    })
    const labels = () =>
      [...document.querySelectorAll(`.column-filter-options label`)].map((label) =>
        label.textContent?.trim(),
      )
    expect(labels()).toEqual([`(empty)`, `alpha`, `beta`]) // null is missing, not blank
    const boxes = document.querySelectorAll<HTMLInputElement>(
      `.column-filter-options input`,
    )
    await click(boxes[2])
    expect(state.filter).toEqual({ kind: `category`, values: [``, `alpha`] })
    expect(boxes[2].checked).toBe(false)
    await click(boxes[2])
    expect(state.filter).toBeUndefined() // all allowed again
  })

  test(`text columns get a substring box that clears when emptied`, async () => {
    const state = mount_filter([`a`, `b`], { kind: `text` })
    const input = doc_query<HTMLInputElement>(`.column-filter-panel input[type="search"]`)
    await fire_input(input, `ab`, `input`)
    expect(state.filter).toEqual({ kind: `text`, text: `ab` })
    await fire_input(input, ``, `input`)
    expect(state.filter).toBeUndefined()
  })

  test(`renders checklist entries through the option snippet`, () => {
    mount_filter([`x`], {
      option: createRawSnippet<[{ value: string; checked: boolean }]>((get_args) => ({
        render: () => `<em>${get_args().value}:${get_args().checked}</em>`,
      })),
    })
    expect(doc_query(`.column-filter-options em`).textContent).toBe(`x:true`)
  })

  test(`reads values only while open and closes on popover dismissal`, async () => {
    const values = vi.fn(() => [1, 2])
    const state = mount_filter([], { values })
    expect(values).toHaveBeenCalled()
    state.open = false
    await tick()
    values.mockClear()
    expect(panel()).toBeNull()
    expect(values).not.toHaveBeenCalled()

    await click(trigger())
    expect(state.open).toBe(true)
    expect(values).toHaveBeenCalledOnce()
    expect(panel()?.getAttribute(`popover`)).toBe(`auto`)
    panel()?.dispatchEvent(
      Object.assign(new Event(`beforetoggle`), { newState: `closed` }),
    )
    await tick()
    expect(state.open).toBe(false)
    expect(panel()).toBeNull()
  })

  test(`replaces the funnel through the trigger snippet and forwards root attributes`, async () => {
    const state = mount_filter([1], {
      class: `header-control`,
      trigger: createRawSnippet<[{ open: boolean; active: boolean }]>((get_args) => ({
        render: () => `<span>${get_args().open ? `open` : `closed`}</span>`,
      })),
    })
    expect(doc_query(`.column-filter`).classList.contains(`header-control`)).toBe(true)
    expect(trigger().textContent).toBe(`open`)
    // clicks and activation keys stop here, so a sortable header around the filter doesn't
    // sort; other keys (Escape, arrows) still reach the table
    const stopped = (event: Event) => {
      const stop = vi.spyOn(event, `stopPropagation`)
      trigger().dispatchEvent(event)
      return stop.mock.calls.length > 0
    }
    expect(stopped(new MouseEvent(`click`, { bubbles: true }))).toBe(true)
    state.open = false // an open panel rightly claims Escape for itself
    await tick()
    const keys = [`Enter`, ` `, `Escape`, `ArrowLeft`, `a`]
    expect(
      keys.map((key) => stopped(new KeyboardEvent(`keydown`, { key, bubbles: true }))),
    ).toEqual([true, true, false, false, false])
  })

  // happy-dom can't emulate a coarse pointer, so check the rule that sizes touch targets
  test(`gives the trigger a 24px touch target on coarse pointers`, () => {
    expect(source).toMatch(
      /@media \(pointer: coarse\) \{\s*\.column-filter-trigger \{\s*min-width: 24px;\s*min-height: 24px;/,
    )
  })
})
