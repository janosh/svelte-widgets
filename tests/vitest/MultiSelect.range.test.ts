import { tick } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'
import type { MultiSelectProps } from '$lib/types'
import { doc_query } from './index'
import { mount_multiselect } from './MultiSelect.test-utils'

const alpha_options = [`Alpha`, `Beta`, `Gamma`, `Delta`]
const dup_options = [
  { label: `Dup`, id: 0 },
  { label: `Sel`, id: 1 },
  { label: `Dup`, id: 2 },
]
const same_options = [
  { label: `Same`, id: 1 },
  { label: `Same`, id: 2 },
  { label: `Target`, id: 3 },
]

const option_rows = (): HTMLLIElement[] => [
  ...document.querySelectorAll<HTMLLIElement>(`ul.options > li[role="option"]`),
]

const option_row = (label: string): HTMLLIElement => {
  const row = option_rows().find((item) => item.textContent?.trim() === label)
  if (!row) throw new Error(`Option "${label}" not found`)
  return row
}

const mount_range = (props: MultiSelectProps) => {
  const onrangeSelect = vi.fn()
  mount_multiselect({ rangeSelect: true, ...props, onrangeSelect })
  return onrangeSelect
}

// takes a row directly when duplicate labels make a lookup by label ambiguous
const shift_click = (row: string | HTMLLIElement | undefined): void => {
  const target = typeof row === `string` ? option_row(row) : row
  if (!target) throw new Error(`Missing row to shift-click`)
  target.dispatchEvent(new MouseEvent(`click`, { bubbles: true, shiftKey: true }))
}

const combobox = () => doc_query<HTMLInputElement>(`input[role="combobox"]`)
const selected_rows = () => document.querySelectorAll(`ul.selected > li`)
const press = (key: string, init: KeyboardEventInit = {}) =>
  combobox().dispatchEvent(new KeyboardEvent(`keydown`, { key, bubbles: true, ...init }))

const select_range = async (anchor: string, target: string): Promise<void> => {
  option_row(anchor).click()
  await tick()
  shift_click(target)
  await tick()
}

test(`backward range selects upward from the anchor`, async () => {
  const onrange_select = mount_range({ options: alpha_options, open: true })

  await select_range(`Delta`, `Alpha`)

  // from/to report anchor and clicked row, not the added range's ascending bounds
  expect(onrange_select).toHaveBeenCalledExactlyOnceWith({
    added: [`Alpha`, `Beta`, `Gamma`],
    from: `Delta`,
    to: `Alpha`,
    selected: [`Delta`, `Alpha`, `Beta`, `Gamma`],
  })
})

// the row hint indexes the dropdown but the lookup runs against a superset including
// already-selected rows, so a naive first match lands on the wrong duplicate
test.each([
  // Sel leaves the dropdown once selected, so the second Dup moves up to index 1
  [`distinct labels between them`, dup_options, {}, 1],
  [`a collapsing key()`, same_options, { duplicates: true, key: () => `same` }, 2],
])(
  `shift-click resolves to the clicked duplicate row, with %s`,
  async (_label, options, extra_props, shift_idx) => {
    const onrange_select = mount_range({ options, open: true, ...extra_props })

    option_rows()[1]?.click()
    await tick()
    shift_click(option_rows()[shift_idx])
    await tick()

    // toEqual not toBe: $bindable re-proxies options, so nothing is reference-identical
    const { added, to } = onrange_select.mock.calls[0][0]
    expect([added, to]).toEqual([[options[2]], options[2]])
  },
)

test(`Shift+Enter adds one option instead of extending a range`, async () => {
  const onadd = vi.fn()
  const onrange_select = mount_range({
    options: [`Alpha`, `Beta`, `Gamma`],
    open: true,
    onadd,
  })

  option_row(`Alpha`).click()
  await tick()
  option_row(`Gamma`).dispatchEvent(new MouseEvent(`mousemove`, { bubbles: true }))
  await tick()
  press(`Enter`, { shiftKey: true })
  await tick()

  expect(onrange_select).not.toHaveBeenCalled()
  // the active option specifically: a count of 2 would also pass if Beta were added
  expect(onadd).toHaveBeenLastCalledWith({
    option: `Gamma`,
    selected: [`Alpha`, `Gamma`],
  })
  expect(selected_rows()).toHaveLength(2)
})

test(`Shift-click adds one visible range and one history entry`, async () => {
  const onrange_select = mount_range({
    options: alpha_options,
    selected: [],
    maxOptions: 3,
  })

  await select_range(`Alpha`, `Delta`)

  expect(onrange_select).toHaveBeenCalledExactlyOnceWith({
    added: alpha_options.slice(1),
    from: `Alpha`,
    to: `Delta`,
    selected: alpha_options,
  })
  press(`z`, { ctrlKey: true })
  await tick()
  const rows_after_undo = selected_rows()
  expect(rows_after_undo).toHaveLength(1)
  expect(rows_after_undo[0]?.textContent).toContain(`Alpha`)
})

test(`Shift+Arrow selects the active range, plain arrows drop the anchor`, async () => {
  const onrange_select = mount_range({
    options: alpha_options,
    open: true,
    autoScroll: false,
  })
  const arrow_down = async (shiftKey = false) => {
    press(`ArrowDown`, { shiftKey })
    await tick()
  }

  await arrow_down() // active: Alpha
  await arrow_down(true) // anchor Alpha, range Alpha-Beta
  expect(onrange_select.mock.calls[0][0].added).toEqual([`Alpha`, `Beta`])

  await arrow_down() // plain move to Gamma must not keep Alpha as the anchor
  await arrow_down(true)

  // from=Alpha here would mean the pre-navigation anchor leaked into the new range
  expect(onrange_select).toHaveBeenLastCalledWith({
    added: [`Gamma`, `Delta`],
    from: `Gamma`,
    to: `Delta`,
    selected: alpha_options,
  })
})

test(`Shift-click is an ordinary click while rangeSelect is off`, async () => {
  const onrange_select = mount_range({
    options: alpha_options,
    selected: [],
    rangeSelect: false,
  })

  await select_range(`Alpha`, `Delta`)

  expect(onrange_select).not.toHaveBeenCalled()
  expect(selected_rows()).toHaveLength(2)
})

test(`range selection skips disabled rows and obeys maxSelect`, async () => {
  const onmaxreached = vi.fn()
  const options = [
    { label: `Alpha` },
    { label: `Beta`, disabled: true },
    { label: `Gamma` },
    { label: `Delta` },
  ]
  const onrange_select = mount_range({
    options,
    selected: [],
    maxSelect: 2,
    onmaxreached,
  })

  await select_range(`Alpha`, `Delta`)

  expect(onrange_select.mock.calls[0][0].selected).toEqual([options[0], options[2]])
  expect(onmaxreached).toHaveBeenCalledOnce()
  expect(onmaxreached.mock.calls[0][0].attemptedOption).toBe(options[3])
})

test(`an invalidated anchor falls back to one ordinary add`, async () => {
  const onadd = vi.fn()
  const onrange_select = mount_range({ options: [`Anchor`, `Target`], onadd })

  option_row(`Anchor`).click()
  await tick()
  onadd.mockClear()
  const input = combobox()
  input.value = `Target`
  input.dispatchEvent(new InputEvent(`input`, { bubbles: true }))
  await tick()
  shift_click(`Target`)
  await tick()

  expect(onrange_select).not.toHaveBeenCalled()
  expect(onadd).toHaveBeenCalledExactlyOnceWith({
    option: `Target`,
    selected: [`Anchor`, `Target`],
  })
})

// two equal-sized ranges yield identical text; a plain string would leave the live
// region's DOM untouched and screen readers silent on the repeat
test(`an identical repeat announcement still replaces the live region node`, async () => {
  mount_range({ options: [`A`, `B`, `C`, `D`, `E`], open: true })
  const live = doc_query(`.sr-only[aria-live="polite"]`)
  const text_node = () =>
    [...live.childNodes].find((node) => node.nodeType === 3 && node.textContent?.trim())

  // two shift-clicks from one anchor each extend by a single option
  await select_range(`A`, `B`)
  expect(live.textContent?.trim()).toBe(`1 option selected`)
  const first = text_node()

  shift_click(`C`)
  await tick()
  expect(live.textContent?.trim()).toBe(`1 option selected`)

  expect(first).toBeDefined()
  expect(text_node()).not.toBe(first)
})
