import type {
  CellColor,
  CellSnippetArgs,
  ColumnPrefs,
  Column,
  DateTimeFormatMode,
  RowData,
  RowId,
  SummaryStat,
} from '#lib/table/index.ts'
import DateTimeFormatMenu from '#lib/table/DateTimeFormatMenu.svelte'
import DataTable from '#lib/table/DataTable.svelte'
import * as table_data from '#lib/table/data.ts'
import data_table_source from '#lib/table/DataTable.svelte?raw'
import * as data_table_module from '#lib/table/data-table.ts'
import { TABLE_EXPORT_FORMATS } from '#lib/table/index.ts'
import type { Component, ComponentProps } from 'svelte'
import { createRawSnippet, flushSync, mount, tick, unmount } from 'svelte'
import * as animations from 'svelte/animate'
import {
  assert,
  describe,
  expect,
  expectTypeOf,
  it,
  onTestFinished,
  vi,
} from 'vite-plus/test'
import {
  bind_props,
  count_attribute_updates,
  dismiss_popover,
  fire,
  keydown,
  mouse,
  stub_reduced_motion,
  trigger_resize_observer,
} from './data-table-test-utils'
import { click, create_element, doc_query, render } from './index'

// vp lint sees .svelte imports as nongeneric; specialize only row-dependent props for mount.
type TableProps<Row extends object = RowData> = Omit<
  ComponentProps<typeof DataTable>,
  `data` | `columns` | `cell` | `row_key` | `on_row_click` | `on_row_double_click`
> & {
  data: Row[]
  columns?: Column<Row>[]
  cell?: Column<Row>[`cell`]
  row_key?: Extract<keyof Row, string> | ((row: Row) => RowId)
  on_row_click?: (event: MouseEvent | KeyboardEvent, row: Row) => void
  on_row_double_click?: (event: MouseEvent, row: Row) => void
}
// Test markup is trusted, so it renders as written (hosts pass a sanitizer instead)
const trusted_html = (html: string): string => html
// Unmounted once the test ends (clearing the body alone leaves open menus' document-level
// Escape layers registered, swallowing later tests' keys), unless it already unmounted them
const live_tables = new Set<ReturnType<typeof mount>>()
const mount_table = (props: TableProps): ReturnType<typeof mount> => {
  const table = mount(DataTable as Component<TableProps>, {
    target: document.body,
    props: Object.assign(props, { render_html: props.render_html ?? trusted_html }),
  })
  live_tables.add(table)
  onTestFinished(async () => {
    if (live_tables.delete(table)) await unmount(table)
  })
  return table
}
const unmount_table = async (table: ReturnType<typeof mount>): Promise<void> => {
  live_tables.delete(table)
  await unmount(table)
}

const plain_columns = (...labels: string[]): Column[] =>
  labels.map((label) => ({ id: label, label }))
// A grouped column whose ID qualifies its label, reading `key` from rows when given
const grouped = (label: string, group: string, key?: string): Column => ({
  id: `${label} (${group})`,
  label,
  group,
  ...(key && { key }),
})
const value_rows = (values: readonly RowData[string][]): RowData[] =>
  values.map((value, idx) => ({ Name: String.fromCharCode(65 + idx), Value: value }))

// Whitespace-collapsed text of every element matching the selector
const texts = (selector: string): (string | undefined)[] =>
  [...document.querySelectorAll(selector)].map((elem) =>
    elem.textContent?.replaceAll(/\s+/g, ` `).trim(),
  )
const col_values = (col_name: string) => texts(`td[data-col="${col_name}"]`)
const cell_at = (row_idx: number, col_idx: number) =>
  doc_query<HTMLTableCellElement>(
    `td[data-row-idx="${row_idx}"][data-col-idx="${col_idx}"]`,
  )
const n_selected = () => document.querySelectorAll(`td.cell-selected`).length
// Right-click a header or cell, then pick the context-menu item whose text matches
const open_context_menu = (target: Element | null) =>
  fire(target, mouse(`contextmenu`, { button: 2 }))
const menu_item = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(`.action-menu button`)].find((btn) =>
    btn.textContent?.includes(label),
  )

// Call before mounting, so the debounce wait below costs no wall clock
const fake_search_timers = () => {
  vi.useFakeTimers()
  onTestFinished(() => void vi.useRealTimers())
}
// A non-empty search_query is debounced 150 ms before it reaches the filter (clearing is not)
const settle_search = async (state: { search_query: string }, query: string) => {
  state.search_query = query
  flushSync() // let the debounce effect schedule its timer before advancing
  await vi.advanceTimersByTimeAsync(150)
  await tick()
}

describe(`DataTable`, () => {
  it(`accepts named row interfaces with typed keys and cell callbacks`, async () => {
    interface Measurement {
      id: number
      score: number
    }
    const cell = createRawSnippet((args: () => CellSnippetArgs<Measurement>) => ({
      render: () => {
        expectTypeOf(args().row).toEqualTypeOf<Measurement>()
        return `<span>${args().row.score}</span>`
      },
    }))
    expectTypeOf<Column<Measurement>[`key`]>().toEqualTypeOf<`id` | `score` | undefined>()
    expectTypeOf<{ id: `missing_score`; label: `Score` }>().not.toExtend<
      Column<Measurement>
    >()
    expectTypeOf<{ id: `display`; key: `score`; label: `Score` }>().toExtend<
      Column<Measurement>
    >()
    const columns: Column<Measurement>[] = [
      { id: `value`, key: `score`, label: `Score`, cell },
    ]
    const data: Measurement[] = [{ id: 1, score: 42 }]
    mount(DataTable as Component<TableProps<Measurement>>, {
      target: document.body,
      props: { data, columns, row_key: `id` },
    })
    await tick()
    expect(col_values(`Score`)).toEqual([`42`])
  })

  const sample_data = [
    { Model: `Model A`, Score: 0.95, Value: 100 },
    { Model: `Model B`, Score: 0.85, Value: 200 },
    { Model: `Model C`, Score: 0.75, Value: 300 },
  ]

  const sample_columns: Column[] = [
    { id: `Model`, label: `Model`, sticky: true },
    { id: `Score`, label: `Score`, better: `higher`, format: `.2f` },
    { id: `Value`, label: `Value`, better: `lower` },
  ]

  const mount_sample = (props: Partial<TableProps> = {}) =>
    mount_table(bind_props({ data: sample_data, columns: sample_columns }, props))

  const heatmap_col: Column = { id: `Value`, label: `Value` }
  // A stand-in host coloring: each value gets its own fill, so tests can tell cells apart
  const value_color = (): ((num: number | null) => CellColor) => (num) => ({
    bg: num === null ? null : `rgb(${num} 0 0)`,
    text: num === null ? null : `white`,
  })

  // 50-row dataset shared by the Pagination tests.
  // Scores are deterministic but shuffled (37 is coprime to 50).
  const large_data = Array.from({ length: 50 }, (_, idx) => ({
    Model: `Model ${idx + 1}`,
    Score: ((idx * 37) % 50) / 50,
    Value: idx * 10,
  }))

  const open_export_menu = () => click(`button[aria-label="Export"]`)
  const export_item = (label: string) =>
    [...document.querySelectorAll<HTMLButtonElement>(`menu [role=menuitem]`)].find(
      (item) => item.textContent?.trim() === label,
    )

  it.each([false, true])(
    `renders table structure, hidden columns and row numbers=%s`,
    (show_row_numbers) => {
      const columns = [
        ...sample_columns,
        { id: `Hidden`, label: `Hidden`, visible: false },
      ]
      const warn = vi.spyOn(console, `warn`).mockImplementation(() => {})
      onTestFinished(() => warn.mockRestore())
      mount_sample({ columns, show_row_numbers })
      flushSync() // only the column whose key is in no row warns (it would render all n/a)
      expect(warn).toHaveBeenCalledExactlyOnceWith(
        `DataTable column Hidden: key Hidden is in no row`,
      )
      const model_cols = [`Model`, `Score`, `Value`]
      expect(texts(`th`)).toEqual(show_row_numbers ? [`#`, ...model_cols] : model_cols)
      expect(document.querySelectorAll(`tbody tr`)).toHaveLength(3)
      expect(document.querySelector(`tbody tr[tabindex]`)).toBeNull() // no on_row_click
      expect(document.querySelectorAll(`td[data-col="Hidden"]`)).toHaveLength(0)
      expect(texts(`td.row-num-col`)).toEqual(show_row_numbers ? [`1`, `2`, `3`] : [])
      expect(document.querySelector(`tfoot`)).toBeNull() // no footer snippet -> no tfoot
      expect(document.querySelector(`.empty-row`)).toBeNull() // data present -> no empty row
      expect(document.querySelector(`.pane-toggle`)).toBeNull()
      expect(document.querySelector(`.sort-hint`)).toBeNull()
    },
  )

  it(`preserves both ends, markup and links of long cells for middle ellipsis`, async () => {
    const identifier = `prefix-middle-suffix`
    // The flag must land wholly in the 8-grapheme suffix. Code-point slicing would retain
    // only its second regional indicator and this exact assertion would fail.
    const unicode_id = `long-prefix-value🇩🇪1234567`
    const symbols = `research & development < threshold`
    const row = $state({
      ID: identifier,
      Unicode: unicode_id,
      Symbols: symbols,
      Short: `🇩🇪`,
      Rich: `<strong>rich-markup</strong>`,
      Linked: `<span title="Full details" data-sort-value="42"><a href="/dataset">prefix &amp; ${unicode_id}</a></span>`,
    })
    mount_table({
      data: [row],
      columns: plain_columns(`ID`, `Unicode`, `Symbols`, `Short`, `Rich`, `Linked`),
    })
    await tick()

    const id_cell = doc_query(`td[data-col="ID"]`)
    const visual = doc_query(`td[data-col="ID"] .middle-ellipsis-visual`)
    expect(id_cell.textContent?.trim()).toBe(identifier)
    expect(id_cell.dataset.sortValue).toBe(identifier)
    expect(visual.dataset.start).toBe(`prefix-middl`)
    expect(visual.dataset.end).toBe(`e-suffix`)
    expect(visual.getAttribute(`aria-hidden`)).toBe(`true`)
    const unicode_visual = doc_query(`td[data-col="Unicode"] .middle-ellipsis-visual`)
    expect(`${unicode_visual.dataset.start}${unicode_visual.dataset.end}`).toBe(
      unicode_id,
    )
    expect(unicode_visual.dataset.end).toBe(`🇩🇪1234567`)
    const symbols_cell = doc_query(`td[data-col="Symbols"]`)
    expect(symbols_cell.textContent?.trim()).toBe(symbols)
    expect(symbols_cell.querySelector(`.middle-ellipsis`)).not.toBeNull()
    // Short strings stay as one text node, avoiding needless wrappers and grapheme splitting.
    expect(doc_query(`td[data-col="Short"]`).querySelector(`.middle-ellipsis`)).toBeNull()
    // Rich cells retain their sanitized markup instead of being flattened for truncation.
    expect(doc_query(`td[data-col="Rich"] strong`).textContent).toBe(`rich-markup`)
    const linked_cell = doc_query(`td[data-col="Linked"]`)
    // the link crossing the split clips inside itself: still one link (one hover state, name
    // and tab stop), its wrappers marked to shrink with it
    const clipped = doc_query(`td[data-col="Linked"] .middle-ellipsis-html`)
    expect(clipped.tagName).toBe(`A`)
    expect(linked_cell.querySelectorAll(`a`)).toHaveLength(1)
    expect(clipped.getAttribute(`href`)).toBe(`/dataset`)
    expect(clipped.textContent).toBe(`prefix & ${unicode_id}`)
    expect(clipped.lastElementChild?.textContent).toBe(`🇩🇪1234567`)
    const wrapper = doc_query(`td[data-col="Linked"] [title]`)
    expect(wrapper.classList.contains(`middle-ellipsis-host`)).toBe(true)
    expect(wrapper.getAttribute(`data-sort-value`)).toBe(`42`)
    expect(wrapper.parentElement?.dataset.title).toBe(`prefix & ${unicode_id}`)
    clipped.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
    expect(doc_query(`.custom-tooltip .tooltip-content`).textContent).toBe(`Full details`)
    // Auto-fit must measure the hidden prefix too, not just the clipped cell width.
    Object.defineProperty(clipped.children[0], `scrollWidth`, { value: 250 })
    Object.defineProperty(clipped.children[1], `scrollWidth`, { value: 50 })
    Object.defineProperty(linked_cell, `offsetWidth`, { value: linked_cell.clientWidth })
    await fire(doc_query(`th[data-col-id="Linked"] .resize-handle`), mouse(`dblclick`))
    expect(doc_query(`th[data-col-id="Linked"]`).style.width).toBe(`308px`)
    row.Linked = `<strong>short update</strong>`
    await tick()
    expect(linked_cell.querySelector(`.middle-ellipsis-html`)).toBeNull()
    expect(linked_cell.textContent?.trim()).toBe(`short update`)
    expect(linked_cell.querySelector(`strong`)?.textContent).toBe(`short update`)
  })

  it(`does not loop when data rows carry no discoverable column keys`, async () => {
    mount_table({ data: [{ style: `color: red` }, {}], columns: [] })
    await tick()
    expect(document.querySelectorAll(`thead th`)).toHaveLength(0)
  })

  it(`delegates plain-text tooltips across cell re-renders`, async () => {
    const cell = (text: string, tip: string) => `<span title="${tip}">${text}</span>`
    const unsafe_title = `&lt;img src=x onerror=alert(1)&gt;unsafe`
    const rows: RowData[] = $state([
      { Model: cell(`alpha`, `tip alpha v1`), Score: 1 },
      {
        Model: cell(`beta`, `tip beta v1`),
        Score: `<span title="${unsafe_title}">2</span>`,
      },
    ])
    const columns = plain_columns(`Model`, `Score`)
    const component = mount_table({ data: rows, columns })
    await tick()

    const unsafe_cell = doc_query(`td[data-col="Score"] span[title]`)
    unsafe_cell.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
    const tooltip_content = doc_query(`.custom-tooltip .tooltip-content`)
    expect(tooltip_content.querySelector(`img`)).toBeNull()
    expect(tooltip_content.textContent).toBe(`<img src=x onerror=alert(1)>unsafe`)

    const activate_tooltip = (expected_title: string) => {
      const alpha = doc_query(`td[data-col="Model"] span[title]`)
      expect(alpha.getAttribute(`title`)).toBe(expected_title)
      alpha.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
      expect(alpha.getAttribute(`title`)).toBeNull()
    }

    activate_tooltip(`tip alpha v1`)

    rows[0].Model = cell(`alpha`, `tip alpha v2`)
    await tick()
    activate_tooltip(`tip alpha v2`)
    await unmount_table(component)
  })

  describe(`Sorting and Data Updates`, () => {
    it.each([
      { row_animation_ms: 300, reduced: false, virtual: false, duration: 300 },
      { row_animation_ms: 0, reduced: false, virtual: false, duration: 0 },
      { row_animation_ms: 300, reduced: true, virtual: false, duration: 0 },
      { row_animation_ms: 300, reduced: false, virtual: true, duration: 0 },
    ])(
      `sorts missing values with row animation $duration ms ($reduced/$virtual)`,
      async ({ row_animation_ms, reduced, virtual, duration }) => {
        const flip = vi.spyOn(animations, `flip`).mockReturnValue({ duration: 0 })
        stub_reduced_motion(() => reduced)
        const bounds = vi
          .spyOn(HTMLTableRowElement.prototype, `getBoundingClientRect`)
          .mockImplementation(function (this: HTMLTableRowElement) {
            return new DOMRect(0, this.rowIndex * 20, 200, 20)
          })
        onTestFinished(() => {
          flip.mockRestore()
          bounds.mockRestore()
        })
        const data = [
          { Model: `A`, Score: undefined, Value: 100 },
          { Model: `B`, Score: 0.85, Value: undefined },
          { Model: `C`, Score: 0.75, Value: 300 },
        ]

        mount_table({ data, columns: sample_columns, row_animation_ms, virtual })

        const value_header = document.querySelectorAll(`th`)[2]
        // Missing values stay last in both sort directions.
        for (const expected of [
          [`100`, `300`, `n/a`],
          [`300`, `100`, `n/a`],
        ]) {
          await click(value_header)
          expect(col_values(`Value`)).toEqual(expected)
        }
        if (duration) {
          await vi.waitFor(() => expect(flip).toHaveBeenCalled())
          expect(
            flip.mock.calls.every(([, , params]) => params?.duration === duration),
          ).toBe(true)
        } else {
          expect(flip).not.toHaveBeenCalled()
          expect(bounds).not.toHaveBeenCalled()
        }
      },
    )

    it(`maintains sort state on data updates`, async () => {
      const state = $state({ data: sample_data })
      mount_sample(state)
      await click(document.querySelectorAll<HTMLElement>(`th`)[1]) // sort by Score
      state.data = [{ Model: `D`, Score: 0.65, Value: 400 }, ...sample_data]
      await tick()
      expect(col_values(`Score`)).toEqual([`0.95`, `0.85`, `0.75`, `0.65`])
      state.data[0].Score = 0.99
      await tick()
      expect(col_values(`Score`)).toEqual([`0.99`, `0.95`, `0.85`, `0.75`])
    })

    // Svelte already skips DOM writes of unchanged values, so beyond node identity and DOM
    // mutations this counts each column's td attribute-effect runs through a `label` getter
    // (every td reads it for data-col): stable column views keep other columns' cells idle.
    it(`updates one cell in place, repainting its column only when the color range moves`, () => {
      const label_reads: Record<string, number> = {}
      type Extra = Pick<Column, `better` | `highlight_best`>
      const counted = (id: string, label: string, extra: Extra = {}): Column => ({
        id,
        ...extra,
        get label() {
          label_reads[id] = (label_reads[id] ?? 0) + 1
          return label
        },
      })
      const columns = [
        counted(`name`, `Name`),
        counted(`count`, `Count`),
        counted(`energy`, `Energy`, { better: `higher`, highlight_best: true }),
        counted(`phase`, `Phase`),
      ]
      const phases = [`solid`, `liquid`, `gas`]
      // A host keeps returning one color function while the column's domain is unchanged,
      // so an edit that moves no range repaints only its own cell. Count stays unpainted.
      const color_fns = new Map<
        string,
        { key: string; fn: (num: number | null) => CellColor }
      >()
      const memo_color = (
        col: { id: string },
        { domain }: { domain: [number, number] },
      ) => {
        if (col.id === `count`) return undefined
        const key = domain.join(`,`)
        const cached = color_fns.get(col.id)
        if (cached?.key === key) return cached.fn
        const [lo, hi] = domain
        const fn = (num: number | null): CellColor => ({
          bg:
            num === null
              ? null
              : `rgb(${Math.round((255 * (num - lo)) / (hi - lo || 1))} 0 0)`,
          text: null,
        })
        color_fns.set(col.id, { key, fn })
        return fn
      }
      let data = $state.raw(
        Array.from({ length: 20 }, (_, idx) => ({
          name: `row ${idx}`,
          count: idx * 3,
          energy: idx / 4,
          phase: phases[idx % 3],
        })),
      )
      mount_table({
        get data() {
          return data
        },
        columns,
        row_key: `name`,
        column_color: memo_color,
      })
      flushSync()
      const tbody = doc_query(`tbody`)
      const nodes = () => [...tbody.querySelectorAll(`tr, td`)]
      const initial_nodes = nodes()
      expect(initial_nodes).toHaveLength(20 * 5)
      const energy_styles = () =>
        Array.from({ length: 20 }, (_, idx) => cell_at(idx, 2).style.cssText)
      const initial_styles = energy_styles()
      const best_row = () => doc_query(`td.best-cell`).dataset.rowIdx
      expect(best_row()).toBe(`19`)
      const observer = new MutationObserver(() => {})
      observer.observe(tbody, {
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      })
      onTestFinished(() => observer.disconnect())
      // Replaces one row object, returning the cells whose DOM changed
      const update_energy = (row_idx: number, energy: number): HTMLElement[] => {
        for (const id of Object.keys(label_reads)) label_reads[id] = 0
        data = data.with(row_idx, { ...data[row_idx], energy })
        flushSync()
        // a mutated row or tbody maps to itself, failing the column checks below
        const targets = observer.takeRecords().map(({ target }) => {
          const element = target instanceof HTMLElement ? target : target.parentElement
          return element?.closest(`td`) ?? element
        })
        return [...new Set(targets)].filter((node) => node != null)
      }

      // A new maximum moves the color range: the whole Energy column repaints, nothing else
      const repainted = update_energy(7, 99)
      expect(label_reads).toEqual({ name: 0, count: 0, energy: 20, phase: 0 })
      expect(cell_at(7, 2).textContent?.trim()).toBe(`99`)
      expect(repainted.every((cell) => cell.dataset.col === `Energy`)).toBe(true)
      expect(repainted).toContain(cell_at(7, 2))
      expect(repainted).toContain(cell_at(19, 2))
      expect(best_row()).toBe(`7`)

      // An edit inside the range keeps the column's color function: one cell re-runs
      const edited = update_energy(3, 0.8)
      expect(label_reads).toEqual({ name: 0, count: 0, energy: 1, phase: 0 })
      expect(edited).toHaveLength(1)
      expect(edited[0]).toBe(cell_at(3, 2))
      expect(cell_at(3, 2).textContent?.trim()).toBe(`0.8`)

      // Restoring the old maximum restores every other cell's color
      update_energy(7, 7 / 4)
      update_energy(3, 3 / 4)
      expect(energy_styles()).toEqual(initial_styles)
      expect(best_row()).toBe(`19`)
      const current = nodes()
      expect(current).toHaveLength(initial_nodes.length)
      expect(current.every((node, idx) => node === initial_nodes[idx])).toBe(true)
    })

    it(`keeps discovered columns across data updates, re-running only the edited row`, () => {
      let runs = 0
      const seen_cols = new Set<unknown>()
      const cell = createRawSnippet((args: () => CellSnippetArgs) => ({
        render: () => `<span></span>`,
        setup: (span) => {
          $effect(() => {
            const { col, val } = args()
            runs++
            seen_cols.add(col)
            span.textContent = `${Number(val)}`
          })
        },
      }))
      let data = $state.raw(value_rows([1, 2, 3, 4]))
      mount_table({
        get data() {
          return data
        },
        cell,
        row_key: `Name`,
      })
      flushSync()
      expect(runs).toBe(8)
      data = data.with(2, { ...data[2], Value: 30 })
      flushSync()
      // both cells of the replaced row get the new row object, no other cell re-runs
      expect(runs).toBe(10)
      expect(seen_cols.size).toBe(2)
      expect(cell_at(2, 1).querySelector(`span`)?.textContent).toBe(`30`)
    })

    it(`selects valid date/time column display modes`, async () => {
      const created = new Date(2024, 0, 2, 3, 4)
      const now = new Date(2024, 0, 3, 5, 34).getTime()
      const date_now = vi.spyOn(Date, `now`).mockReturnValue(now)
      onTestFinished(() => date_now.mockRestore())
      const data = [
        {
          Observed: `2024-01-02`,
          'Start Time': created,
          Created: created,
          Ancient: new Date(2017, 6, 23, 9, 57),
          Unix: new Date(2024, 0, 2, 12, 0).getTime(),
        },
      ]
      const columns: Column[] = [
        { id: `Observed`, label: `Observed` },
        { id: `Start Time`, label: `Start &amp; <i>Time</i>`, datetime_format: `time` },
        { id: `Created`, label: `Created`, datetime_format: `datetime` },
        { id: `Ancient`, label: `Ancient`, datetime_format: `datetime` },
        { id: `Unix`, label: `Unix`, datetime_format: `datetime` },
      ]
      mount_table({ data, columns })
      const cells = () => texts(`tbody td`)
      const triggers = document.querySelectorAll<HTMLButtonElement>(
        `.datetime-format-trigger`,
      )
      expect(triggers[1].textContent?.trim()).toBe(`Date/time format for Start & Time`)
      const options = (select: HTMLSelectElement) =>
        [...select.options].map((option) => option.value)
      const open_select = async (idx: number): Promise<HTMLSelectElement> => {
        if (triggers[idx].getAttribute(`aria-expanded`) !== `true`)
          await click(triggers[idx])
        return doc_query<HTMLSelectElement>(`.datetime-format-select`)
      }
      const select_mode = async (idx: number, value: string) => {
        const select = await open_select(idx)
        select.value = value
        await fire(select, new Event(`input`, { bubbles: true }))
      }
      expect(cells()).toEqual([
        `2024-01-02`,
        `03:04`,
        `2024-01-02 03:04`,
        `2017-07-23 09:57`,
        `2024-01-02 12:00`,
      ])
      expect(document.querySelector(`.datetime-format-select`)).toBeNull()
      const modes = [...triggers].map((trigger) => trigger.dataset.mode)
      expect(modes).toEqual([`date`, `time`, `datetime`, `datetime`, `datetime`])
      expect(options(await open_select(0))).toEqual([`date`, `relative`])
      expect(options(await open_select(1))).toEqual([`time`])
      const all_modes = [`date`, `time`, `datetime`, `iso`, `relative`]
      expect(options(await open_select(2))).toEqual(all_modes)
      const active_select = await open_select(2)
      await click(active_select)
      expect(document.querySelector(`.datetime-format-select`)).toBeNull()
      await select_mode(2, `relative`)
      expect(document.querySelector(`.datetime-format-select`)).toBeNull()
      expect(triggers[2].dataset.mode).toBe(`relative`)
      expect(cells()[2]).toBe(`1d 2h 30m ago`)
      await select_mode(3, `relative`)
      expect(cells()[3]).toBe(`6y 5mo 2w ago`)
      await select_mode(2, `time`)
      expect(cells()[2]).toBe(`03:04`)
      expect(cells()[1]).toBe(`03:04`)
    })

    // The menu sits in a sortable, draggable header, which must not react to any of its events
    it(`DateTimeFormatMenu keeps its events from the header`, () => {
      const [on_toggle, on_change, header] = [vi.fn(), vi.fn(), vi.fn()]
      const options: DateTimeFormatMode[] = [`date`, `relative`]
      // its own target: Svelte delegates events to the mount root, here a stand-in header
      const props = { col_label: `Created`, mode: options[0], options, open: true }
      render(DateTimeFormatMenu, { ...props, on_toggle, on_change }, create_element())
      const types = [`click`, `input`, `keydown`, `mousedown`, `pointerdown`]
      for (const type of types) document.body.addEventListener(type, header)
      onTestFinished(() => {
        for (const type of types) document.body.removeEventListener(type, header)
      })
      const trigger = doc_query(`button.datetime-format-trigger`)
      for (const event of [
        mouse(`mousedown`),
        mouse(`pointerdown`),
        keydown(`a`),
        mouse(`click`),
      ])
        trigger.dispatchEvent(event)
      expect(on_toggle).toHaveBeenCalledOnce()
      const select = doc_query<HTMLSelectElement>(`select.datetime-format-select`)
      select.value = `relative`
      select.dispatchEvent(new Event(`input`, { bubbles: true }))
      expect(on_change).toHaveBeenCalledExactlyOnceWith(`relative`)
      expect(on_toggle).toHaveBeenCalledTimes(2) // a pick also closes the menu
      expect(header).not.toHaveBeenCalled()
    })

    // Cell parsing itself is covered by the sort_table_rows/parse_numeric_val unit tests; these
    // check a column is wired through them (string initial_sort shorthand sorts ascending)
    // and that a header click then flips the order.
    it.each<[string, string[], string[], boolean]>([
      [
        `data-sort-value over the visible text`,
        [`1,000`, `50`, `10,000`].map(
          (txt) => `<span data-sort-value="${txt.replace(`,`, ``)}">${txt}</span>`,
        ),
        [`50`, `1,000`, `10,000`],
        true,
      ],
      [
        `markup-wrapped numbers numerically`,
        [`<b>10</b>`, `<b>9</b>`, `<b>100</b>`],
        [`9`, `10`, `100`],
        true,
      ],
      [
        // the title attribute orders the raw markup opposite to the sort keys, so neither the
        // visible text nor the unparsed string could produce this order
        `by a non-numeric data-sort-value`,
        [
          [`c`, `1`, `Alpha`],
          [`b`, `2`, `Mike`],
          [`a`, `3`, `Zulu`],
        ].map(
          ([key, title, name]) =>
            `<span title="${title}" data-sort-value="${key}">${name}</span>`,
        ),
        [`Zulu`, `Mike`, `Alpha`],
        false,
      ],
    ])(`sorts %s`, async (_desc, values, expected, numeric) => {
      mount_table({
        data: values.map((Col) => ({ Col })),
        columns: plain_columns(`Col`),
        initial_sort: `Col`,
      })
      await tick()
      expect(col_values(`Col`)).toEqual(expected)
      expect(doc_query(`td[data-col="Col"]`).classList.contains(`numeric-col`)).toBe(
        numeric,
      )
      await click(`th`) // toggle to descending
      expect(col_values(`Col`)).toEqual(expected.toReversed())
    })

    it(`respects unsortable columns`, async () => {
      mount_table({
        data: value_rows([100, 200, 300]),
        columns: [
          { id: `Name`, label: `Name`, sortable: false },
          { id: `Value`, label: `Value` },
        ],
      })
      const headers = document.querySelectorAll(`th`)
      await click(headers[0]) // unsortable: no effect
      expect(col_values(`Name`)).toEqual([`A`, `B`, `C`])
      await click(headers[1]) // sortable: first click sorts descending
      expect(col_values(`Name`)).toEqual([`C`, `B`, `A`])
    })

    // Uncertainty strings sort and colour by their primary value (parse_numeric_val covers the
    // notations one by one in index.test.ts; this checks the table wires sorting through it)
    it(`sorts and colours cells with mixed uncertainty notation by the primary value`, async () => {
      const input = [`1.5 ± 0.2`, `0.8`, `2.3(5)`, `-1.0 +- 0.1`, `5.0e-4 ± 1e-4`]
      mount_table({
        data: value_rows(input),
        columns: [
          { id: `Name`, label: `Name` },
          { ...heatmap_col, better: `lower` },
        ],
        column_color: value_color,
      })
      const style_attrs = () =>
        [...document.querySelectorAll(`td[data-col="Value"]`)].map(
          (cell) => cell.getAttribute(`style`) ?? ``,
        )
      // every cell is numeric, so every cell gets a (distinct) heatmap background
      expect(style_attrs().every((style) => style.includes(`--cell-bg:`))).toBe(true)
      expect(new Set(style_attrs()).size).toBe(input.length)
      await click(document.querySelectorAll(`th`)[1])
      const sorted = [`-1.0 +- 0.1`, `5.0e-4 ± 1e-4`, `0.8`, `1.5 ± 0.2`, `2.3(5)`]
      expect(col_values(`Value`)).toEqual(sorted)
    })

    // Per-cell guard: only numeric cells get --cell-bg, strings never do. Negatives must still
    // enter the linear scale domain rather than be filtered as invalid.
    it.each<{
      desc: string
      values: RowData[string][]
      colored: boolean[]
      props?: Partial<TableProps>
    }>([
      {
        desc: `non-numeric strings`,
        values: [`hello`, `world`],
        colored: [false, false],
      },
      {
        desc: `mixed values`,
        values: [10, `not a number`, 100],
        colored: [true, false, true],
      },
      { desc: `negative values`, values: [-100, 0, 100], colored: [true, true, true] },
      {
        desc: `a host returning no color function`,
        values: [0, 50, 100],
        colored: [false, false, false],
        props: { column_color: () => undefined },
      },
    ])(`colors only numeric cells with $desc`, ({ values, colored, props }) => {
      mount_table({
        data: value_rows(values),
        columns: [{ id: `Name`, label: `Name` }, heatmap_col],
        column_color: value_color,
        ...props,
      })
      const has_bg = [...document.querySelectorAll(`td[data-col="Value"]`)].map((cell) =>
        (cell.getAttribute(`style`) ?? ``).includes(`--cell-bg:`),
      )
      expect(has_bg).toEqual(colored)
    })
  })

  // format strings mean whatever the host's format_number makes of them
  it(`hands column format strings to format_number`, () => {
    mount_table({
      data: [
        { Num: 0.123, Plain: 1.5 },
        { Num: 1.234, Plain: 2 },
      ],
      columns: [
        { id: `Num`, label: `Num`, format: `.1%` },
        { id: `Plain`, label: `Plain` },
      ],
      default_num_format: `.2f`,
      format_number: (num: number, format?: string) => `${num}|${format}`,
    })
    expect(col_values(`Num`)).toEqual([`0.123|.1%`, `1.234|.1%`])
    expect(col_values(`Plain`)).toEqual([`1.5|.2f`, `2|.2f`])
  })

  it.each([
    [1234567, `1,234,567`],
    [1766, `1766`], // years and IDs stay ungrouped below 5 digits
    [55.85, `55.9`],
    [0.000123, `0.000123`],
  ])(`default format_number renders %s as %s`, (num, expected) => {
    expect(table_data.default_format_number(num)).toBe(expected)
  })

  it(`exposes rich column descriptions on keyboard focus`, async () => {
    mount_table({
      data: sample_data,
      columns: [
        { id: `Col`, label: `Col`, description: `<b>Description</b>`, sticky: true },
      ],
    })

    const header = document.querySelector(`th`)
    const trigger = doc_query(`th button`)
    trigger.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
    await vi.waitFor(() =>
      expect(document.querySelector(`.popover b`)?.textContent).toBe(`Description`),
    )
    expect(header?.classList.contains(`pinned`)).toBe(true)
    // It wraps as prose, not as the header's single bold line.
    const { whiteSpace, fontWeight } = getComputedStyle(doc_query(`th .popover`))
    expect({ whiteSpace, fontWeight }).toEqual({
      whiteSpace: `normal`,
      fontWeight: `normal`,
    })
  })

  // Missing values displayed as 'n/a', never as literal 'NaN' or 'undefined'. A row whose
  // values are all undefined is dropped entirely (it would add a third and fourth n/a).
  it.each([
    {
      desc: `undefined values`,
      data: [
        { Model: undefined, Score: undefined },
        { Model: `Empty Model`, Score: undefined, Value: undefined },
      ],
      present: [`Empty Model`],
      n_rows: 1,
    },
    {
      desc: `NaN values`,
      data: [
        { Model: `Model A`, Score: 1.5, Value: NaN },
        { Model: `Model B`, Score: NaN, Value: 2.7 },
      ],
      present: [`Model A`, `1.5`, `2.7`],
      n_rows: 2,
    },
  ])(`displays $desc as 'n/a'`, ({ data, present, n_rows }) => {
    mount_table({ data, columns: sample_columns })
    const all_text = texts(`td`)
    expect(document.querySelectorAll(`tbody tr`)).toHaveLength(n_rows)
    expect(all_text.filter((text) => text === `n/a`)).toHaveLength(2)
    expect(all_text).not.toContain(`NaN`)
    expect(all_text).not.toContain(`undefined`)
    for (const value of present)
      expect(all_text.some((text) => text?.includes(value))).toBe(true)
  })

  it(`prevents HTML strings from being used as data-sort-value attributes`, async () => {
    const html_data = [
      {
        HTML: `<span data-sort-value="100" title="This is a tooltip">100 units</span>`,
        Complex: `<span data-sort-value="3373529" title="Complex tooltip with multiple lines&#013;• Line item 1&#013;• Line item 2">3.37M <small>(details)</small> (<a href="https://example.com">Link</a>)</span>`,
      },
    ]
    mount_table({ data: html_data, columns: plain_columns(`HTML`, `Complex`) })
    expect(doc_query(`td[data-col="HTML"] span`).hasAttribute(`data-sort-value`)).toBe(
      false,
    )
    await tick()

    for (const [col, sort_value, title] of [
      [`HTML`, `100`, `This is a tooltip`],
      [`Complex`, `3373529`, `Complex tooltip`],
    ]) {
      const cell = document.querySelector(`td[data-col="${col}"]`)
      // HTML renders inside the cell, but the raw HTML string must not leak
      // into the td's own data-sort-value attribute
      expect(cell?.innerHTML).toContain(`<span data-sort-value="${sort_value}"`)
      expect(cell?.getAttribute(`data-sort-value`)).toBeNull()
      expect(cell?.querySelector(`span[title]`)?.getAttribute(`title`)).toContain(title)
    }
  })

  describe(`Column grouping`, () => {
    it(`keeps state and cell renderers when headers and groups change`, async () => {
      const cell = createRawSnippet((args: () => CellSnippetArgs) => ({
        render: () => `<span class="score-cell">score=${Number(args().val)}</span>`,
      }))
      const state = $state({
        columns: [
          { id: `name`, label: `Name` },
          { id: `score`, label: `Old score`, group: `Old group`, cell },
          { id: `other`, label: `Other` },
        ] as Column[],
        column_order: [`score`, `name`, `other`],
        column_prefs: {
          score: { width: 180, filter: { kind: `numeric` as const, min: 2 } },
        },
        hidden_columns: [`other`],
        sort: { column: `score`, dir: `desc` as const },
      })
      const data = [`low`, `middle`, `high`].map((name, idx) => ({
        name,
        score: idx + 1,
      }))
      mount_table(bind_props({ data }, state))
      await tick()
      state.columns = state.columns.map((col) =>
        col.id === `score` ? { ...col, label: `Renamed score`, group: `New group` } : col,
      )
      await tick()
      expect(col_values(`Name`)).toEqual([`high`, `middle`])
      expect(col_values(`Renamed score`)).toEqual([`score=3`, `score=2`])
      expect(document.body.textContent).toContain(`New group`)
      expect(document.body.textContent).not.toContain(`Old group`)
      expect(state.column_order).toEqual([`score`, `name`, `other`])
      expect(state.hidden_columns).toEqual([`other`])
      expect(doc_query(`th[data-col-id="score"]`).style.width).toBe(`180px`)
      expect(state.sort).toEqual({ column: `score`, dir: `desc` })
    })

    // Header cells read as `label/colspan`. A split group used to swallow the intervening
    // column under its label, leaving its tail unlabelled.
    it.each<[string, Column[], string[], string[]]>([
      [
        `grouped, repeated and interleaved ungrouped`,
        [
          { id: `Name`, label: `Name`, sticky: true },
          { id: `Regular`, label: `Regular` },
          { ...grouped(`Value 1`, `Values`), description: `V1 only` },
          grouped(`Value 2`, `Values`),
          grouped(`Metric 1`, `Metrics`, `Metric 1`),
          grouped(`Metric 2`, `Metrics`, `Metric 2`),
          { id: `Another`, label: `Another` },
          grouped(`Value 1`, `Second Values`),
          grouped(`Value 2`, `Second Values`),
        ],
        [`/1`, `/1`, `Values/2`, `Metrics/2`, `/1`, `SecondValues/2`],
        [
          `Name`,
          `Regular`,
          `Value1`,
          `Value2`,
          `Metric1`,
          `Metric2`,
          `Another`,
          `Value1`,
          `Value2`,
        ],
      ],
      [
        `non-contiguously listed group`,
        [grouped(`A`, `g1`, `A`), { id: `B`, label: `B` }, grouped(`C`, `g1`, `C`)],
        [`g1/2`, `/1`],
        [`A`, `C`, `B`],
      ],
    ])(`renders %s columns`, (_desc, columns, group_spans, header_labels) => {
      const data = [
        Object.fromEntries(columns.map((col, idx) => [col.key ?? col.id, idx])),
      ]
      mount_table({ data, columns })
      const spans = (row: Element) =>
        [...row.querySelectorAll(`th`)].map(
          (cell) => `${cell.textContent?.replaceAll(/[↑↓\s]/g, ``)}/${cell.colSpan}`,
        )
      const [group_row, header_row, ...rest] = document.querySelectorAll(`thead tr`)
      expect(rest).toHaveLength(0)
      expect(spans(group_row)).toEqual(group_spans)
      expect(spans(header_row)).toEqual(header_labels.map((label) => `${label}/1`))
      // a member column's description belongs to that column, not its group header
      expect(group_row.querySelector(`button`)).toBeNull()
    })
  })

  it(`applies root, density, column, and row styles`, () => {
    mount_table({
      data: [
        { Col1: `a`, Col2: `b`, style: `background-color: yellow;`, class: `custom-row` },
        { Col1: `c`, Col2: `d` },
      ],
      columns: [
        { id: `Col1`, label: `Col1`, style: `color: red; font-weight: lighter;` },
        { id: `Col2`, label: `Col2` },
      ],
      density: `compact`,
      root_style: `flex: 1`,
      style: `color: red`,
    })
    const container = doc_query(`.table-container`)
    const root_style = container.getAttribute(`style`) ?? ``
    expect(root_style).toContain(`color: red`)
    // happy-dom normalizes `flex: 1` to longhand properties
    expect(root_style).toMatch(/flex-grow:\s*1|flex:\s*1/)
    expect(getComputedStyle(container).getPropertyValue(`--table-density-padding`)).toBe(
      `0 4pt`,
    )

    const header_style = document.querySelector(`th`)?.getAttribute(`style`) ?? ``
    expect(header_style).toContain(`color: red`)
    expect(header_style).toContain(`font-weight: lighter`)
    expect(
      document.querySelector(`td[data-col="Col1"]`)?.getAttribute(`style`),
    ).toContain(`font-weight: lighter`)
    expect(document.querySelector(`tbody tr`)?.getAttribute(`style`)).toContain(
      `background-color: yellow`,
    )
    const rows = document.querySelectorAll(`tbody tr`)
    expect(rows[0].classList.contains(`custom-row`)).toBe(true)
    for (const row of rows) expect(row.getAttribute(`class`)).not.toContain(`undefined`)
  })

  describe(`Search and Filter`, () => {
    it.each([
      {
        desc: `search.placeholder is applied to the input expanded on toggle click`,
        search: { placeholder: `Search materials...` },
        click: true,
        placeholder: `Search materials...`,
      },
      {
        desc: `search.expanded auto-expands without clicking`,
        search: { expanded: true },
        click: false,
      },
    ])(`$desc`, async ({ search, click: open_search, placeholder }) => {
      mount_sample({ search })

      expect(document.querySelector(`.control-buttons .icon-btn`)).not.toBeNull()
      if (open_search) await click(`.control-buttons .icon-btn`)

      const search_input = doc_query<HTMLInputElement>(`input[type="search"]`)
      if (placeholder) expect(search_input.placeholder).toBe(placeholder)
    })

    // Filtering is tested through the bindable search_query prop (simulating typing
    // via bind:value needs native input events that happy-dom doesn't support).

    const search_rows = [
      { Model: `Model A`, Note: `great`, style: `background: gold` },
      { Model: `Model B`, Note: `model a lookalike` },
      { Model: `<b>bold</b> Model C &amp; co`, Note: `` },
    ]
    const shown_models = { A: `Model A`, B: `Model B`, C: `bold Model C & co` }
    it.each<[string, TableProps[`search`], string, (keyof typeof shown_models)[]]>([
      [`substring match`, true, `model b`, [`B`]],
      [`html is stripped before matching`, true, `bold`, [`C`]],
      [`no match`, true, `no-such-model`, []],
      [`empty query returns all rows`, true, `  `, [`A`, `B`, `C`]],
      [`non-column keys like row style are not searched`, true, `gold`, []],
      [`entities decode before matching`, true, `c & co`, [`C`]],
      [
        `keys restricts matching to the given columns`,
        { keys: [`Model`] },
        `model a`,
        [`A`],
      ],
      [`no keys searches every column`, {}, `model a`, [`A`, `B`]],
      [
        `fuzzy matches an in-order subsequence`,
        { keys: [`Model`], fuzzy: true },
        `mdla`,
        [`A`],
      ],
      [`fuzzy=false requires a substring`, { keys: [`Model`], fuzzy: false }, `mdla`, []],
    ])(`filters rows by search_query: %s`, async (_desc, search, query, expected) => {
      fake_search_timers()
      const state = $state({ search_query: `` })
      const columns = plain_columns(`Model`, `Note`)
      mount_table(bind_props({ data: search_rows, columns, search }, state))
      state.search_query = query
      await tick()
      if (query.trim()) expect(col_values(`Model`)).toHaveLength(3) // debounced, not yet applied
      await settle_search(state, query)
      expect(col_values(`Model`)).toEqual(expected.map((letter) => shown_models[letter]))
    })

    it(`refreshes indexed searches after row, key, filter, object and Date changes`, async () => {
      fake_search_timers()
      const when = new Date(2024, 0, 2)
      const column_prefs: Record<string, ColumnPrefs> = {}
      const state = $state({
        search_query: ``,
        search: { keys: [`Model`, `Note`, `When`] },
        column_prefs,
        data: [
          { Model: `Alpha`, Note: { value: `old` }, When: when },
          { Model: `Beta`, Note: { value: `new` }, When: null },
        ],
      })
      mount_table(bind_props({ columns: plain_columns(`Model`, `When`) }, state))
      await settle_search(state, `alpha`)
      expect(col_values(`Model`)).toEqual([`Alpha`])
      state.data[1].Model = `<b>Alpha</b>`
      await tick()
      expect(col_values(`Model`)).toEqual([`Alpha`, `Alpha`])
      await settle_search(state, `new`)
      expect(col_values(`Model`)).toHaveLength(1)
      state.data[0].Note.value = `new`
      await tick()
      expect(col_values(`Model`)).toHaveLength(2)
      state.column_prefs.Model = { filter: { kind: `category`, values: [`Beta`] } }
      await tick()
      expect(col_values(`Model`)).toHaveLength(0)
      state.column_prefs = {}
      state.search.keys = [`When`]
      when.setFullYear(2025)
      await settle_search(state, `2025`)
      expect(col_values(`Model`)).toHaveLength(1)
      state.column_prefs.When = {
        filter: { kind: `category`, values: [when.toISOString()] },
      }
      await tick()
      expect(col_values(`Model`)).toHaveLength(1)
      when.setFullYear(2026)
      await settle_search(state, `2026`)
      expect(col_values(`Model`)).toHaveLength(0)
      state.column_prefs = {}
      await tick()
      expect(col_values(`Model`)).toHaveLength(1)
      state.search.keys[0] = `Model`
      await tick()
      expect(col_values(`Model`)).toHaveLength(0)
      state.search.keys.push(`When`)
      await tick()
      expect(col_values(`Model`)).toHaveLength(1)
    })

    // A live refresh with a query active re-read every cell's text (50k x 30: 90 ms); kept
    // rows keep theirs, and a column filter still applies on top of the query.
    it(`re-reads only replaced rows' search text and keeps filtering`, async () => {
      fake_search_timers()
      const text_spy = vi.spyOn(table_data, `cell_text`)
      onTestFinished(() => text_spy.mockRestore())
      const rows = [`A`, `B`, `C`].map((letter, idx) => ({ Model: letter, Score: idx }))
      const column_prefs: Record<string, ColumnPrefs> = {}
      const state = $state({ search_query: ``, column_prefs })
      // raw, as the data prop asks: a deep proxy re-wraps every row object on reassignment
      let data = $state.raw<RowData[]>(rows)
      const columns = plain_columns(`Model`, `Score`)
      const props = {
        get data() {
          return data
        },
        columns,
        search: true,
      }
      mount_table(bind_props(props, state))
      await settle_search(state, `z`)
      expect(text_spy).toHaveBeenCalledTimes(6) // every searched cell once
      text_spy.mockClear()
      data = [rows[0], { Model: `Z`, Score: 1 }, rows[2]]
      await tick()
      expect(text_spy.mock.calls.map(([val]) => val)).toEqual([`Z`]) // matched, Score unread
      expect(col_values(`Model`)).toEqual([`Z`])
      state.column_prefs = { Score: { filter: { kind: `numeric`, min: 2 } } }
      await tick()
      expect(col_values(`Model`)).toEqual([]) // Z scores 1
    })

    it(`clear button resets bound search_query`, async () => {
      const state = $state({ search_query: `model b` })
      mount_sample(bind_props({ search: true }, state))
      await tick()
      expect(col_values(`Model`)).toEqual([`Model B`])

      // input is rendered (non-empty query implies expanded); clear button follows it
      await click(`.control-buttons .icon-btn`)

      expect(state.search_query).toBe(``)
      expect(col_values(`Model`)).toHaveLength(3)
    })
  })

  describe(`Column Visibility Toggle`, () => {
    const menu_boxes = () => [
      ...document.querySelectorAll<HTMLInputElement>(
        `.column-menu input[type="checkbox"]`,
      ),
    ]
    // The menu is ColumnPicker, whose dropdown portals to <body>, so query from document.
    // Default-hidden columns start hidden without counting as a change, and Reset hides them again
    it(`default_hidden_columns is the reset baseline`, async () => {
      const state = $state({
        hidden_columns: [`Value`],
        show_column_toggle: true,
        default_hidden_columns: [`Value`],
      })
      mount_sample(state)
      await tick()
      expect(document.querySelector(`.column-picker > .reset-btn`)).toBeNull()
      await click(`.column-picker > button`)
      await click(
        menu_boxes().find((box) => box.closest(`label`)?.textContent?.includes(`Value`)),
      )
      expect(state.hidden_columns).toEqual([])
      await click(`.column-picker > .reset-btn`)
      expect(state.hidden_columns).toEqual([`Value`])
    })

    it(`toggles columns and resets without enabling caller-hidden columns`, async () => {
      const state = $state({
        hidden_columns: [`Value`],
        columns: [...sample_columns, { id: `Static`, label: `Static`, visible: false }],
        show_column_toggle: true,
      })
      mount_sample(state)
      await tick()
      expect(document.querySelectorAll(`th`)).toHaveLength(2)

      await click(`.column-picker > button`)
      const boxes = menu_boxes()
      expect(boxes).toHaveLength(4)
      expect(boxes.at(-1)?.disabled).toBe(true)

      // The menu sits in the top layer, outside the table's box; moving into it must not
      // dismiss it.
      doc_query(`.table-container`).dispatchEvent(
        new MouseEvent(`mouseleave`, { relatedTarget: boxes[0] }),
      )
      await tick()
      expect(doc_query(`.column-picker > button`).getAttribute(`aria-expanded`)).toBe(
        `true`,
      )

      await click(boxes[0])
      expect(state.hidden_columns).toEqual([`Value`, `Model`])
      expect(document.querySelectorAll(`th`)).toHaveLength(1)

      await click(`.column-picker > .reset-btn`)
      expect(state.hidden_columns).toEqual([])
      expect(document.querySelectorAll(`th`)).toHaveLength(3)
    })

    it(`keeps distinct IDs independent of repeated data keys`, async () => {
      const state = $state({ hidden_columns: [] as string[] })
      const columns = [
        { id: `grouped`, key: `Value (Group A)`, label: `Value`, group: `Group A` },
        { id: `ungrouped`, key: `Value (Group A)`, label: `Qualified value` },
      ]
      const data = [{ 'Value (Group A)': 1 }]
      mount_table(bind_props({ data, columns, show_column_toggle: true }, state))
      await tick()

      await click(`.column-picker > button`)
      for (const box of document.querySelectorAll(`.column-menu.grouped input`))
        await click(box)
      expect(state.hidden_columns).toEqual([`grouped`, `ungrouped`])

      await click(`.column-picker > .reset-btn`)
      expect(state.hidden_columns).toEqual([])
    })

    // The two menus overlap, so only one may be open. ColumnPicker owns its own open state,
    // so each side closes the other when it opens.
    it.each([[`columns`], [`export`]] as const)(
      `opening the %s menu closes the other`,
      async (first) => {
        mount_sample({ show_column_toggle: true, export_formats: TABLE_EXPORT_FORMATS })
        const columns_btn = () => doc_query(`.column-picker > button`)
        const export_btn = () =>
          doc_query<HTMLButtonElement>(`button[aria-label="Export"]`)
        const open_menus = () =>
          [
            document.querySelector(`.column-menu`),
            document.querySelector(`menu[role=menu]`),
          ].filter(Boolean).length

        await click(first === `columns` ? columns_btn() : export_btn())
        expect(open_menus()).toBe(1)
        await click(first === `columns` ? export_btn() : columns_btn())
        expect(open_menus()).toBe(1)
      },
    )
  })

  it(`row selection preserves IDs across row replacement, tracks full selection, then clears it`, async () => {
    const state = $state({ data: sample_data, selected_ids: [] as string[] })
    mount_sample(bind_props({ show_row_select: true, row_key: `Model` }, state))
    const checkboxes = [
      ...document.querySelectorAll<HTMLInputElement>(
        `td.select-col input[type="checkbox"]`,
      ),
    ]
    // every checkbox is named: a bare one reads as "checkbox" to a screen reader
    const label = (box: HTMLInputElement) => box.getAttribute(`aria-label`)
    expect(checkboxes.map(label)).toEqual([1, 2, 3].map((num) => `Select row ${num}`))
    expect(checkboxes.every((checkbox) => !checkbox.checked)).toBe(true)

    await click(checkboxes[0])
    const select_all = doc_query<HTMLInputElement>(`th.select-col input[type="checkbox"]`)
    expect([select_all.checked, label(select_all)]).toEqual([
      false,
      `Select all on this page`,
    ])
    state.data = sample_data.map((row) => ({ ...row, Score: row.Score + 1 }))
    await tick()
    expect(checkboxes[0].checked).toBe(true)
    expect(document.querySelectorAll(`tr.selected`)).toHaveLength(1)
    expect(col_values(`Score`)[0]).toBe(`1.95`)
    expect(document.querySelector(`.selection-badge .badge`)?.textContent).toBe(`1`)

    for (const checkbox of checkboxes.slice(1)) await click(checkbox)

    expect(checkboxes.every((checkbox) => checkbox.checked)).toBe(true)
    expect([select_all.checked, label(select_all)]).toEqual([true, `Deselect all`])
    expect(state.selected_ids).toEqual([`Model A`, `Model B`, `Model C`])
    const badge = document.querySelector<HTMLElement>(`.selection-badge .badge`)
    expect(badge?.textContent).toBe(`3`)

    await click(doc_query<HTMLButtonElement>(`.selection-badge`))
    expect(state.selected_ids).toEqual([])
    expect(document.querySelectorAll(`tr.selected`)).toHaveLength(0)
  })

  it(`Shift+click toggles multi-sort columns and regular click clears them`, async () => {
    const state = $state({
      data: sample_data.map((row) => ({
        ...row,
        Score: row.Model === `Model C` ? 0.85 : row.Score,
      })),
      multi_sort: [] as { column: string; ascending: boolean }[],
    })
    mount_sample(state)
    const headers = document.querySelectorAll(`th`)
    const shift_click = (idx: number) =>
      fire(headers[idx], mouse(`click`, { shiftKey: true }))
    // per header: its multi-sort rank, whether it shows a sort arrow, and its aria-sort
    const marks = () =>
      [...headers].map((header) => {
        const arrow = /[↑↓]/.test(header.textContent ?? ``) ? `↕` : ``
        const rank = header.querySelector(`sup`)?.textContent ?? ``
        return `${rank}${arrow} ${header.getAttribute(`aria-sort`)}`
      })

    await shift_click(0)
    await shift_click(1)
    expect(state.multi_sort).toEqual([
      { column: `Model`, ascending: false },
      { column: `Score`, ascending: false },
    ])
    expect(col_values(`Model`)).toEqual([`Model C`, `Model B`, `Model A`])
    expect(marks()).toEqual([`1↕ descending`, `2↕ none`, ` none`])

    await shift_click(0)
    expect(state.multi_sort).toEqual([{ column: `Score`, ascending: false }])
    expect(marks()).toEqual([` none`, `↕ descending`, ` none`])

    await click(headers[2])
    expect(state.multi_sort).toEqual([])
    expect(marks()).toEqual([` none`, ` none`, `↕ ascending`])

    // Restored external criteria take precedence over the single-column sort and
    // the second criterion resolves tied scores.
    state.multi_sort = [
      { column: `Score`, ascending: true },
      { column: `Value`, ascending: false },
    ]
    await tick()
    expect(col_values(`Model`)).toEqual([`Model C`, `Model B`, `Model A`])
    expect(marks()).toEqual([` none`, `1↕ ascending`, `2↕ none`])
    state.multi_sort = [{ column: `Score`, ascending: true }]
    await tick()
    expect(marks()).toEqual([` none`, `↕ ascending`, ` none`])
    state.multi_sort = []
    await tick()
    expect(col_values(`Model`)).toEqual([`Model A`, `Model B`, `Model C`])
    expect(marks()).toEqual([` none`, ` none`, `↕ ascending`])
  })

  describe(`Pagination`, () => {
    it(`renders controls, caps rows at page_size, and disables prev/first on page 1`, () => {
      mount_table({
        data: large_data,
        columns: sample_columns,
        pagination: { page_size: 10 },
      })

      expect(document.querySelector(`.pagination`)).not.toBeNull()
      // Check page input value (not textContent since it's in an input)
      expect(doc_query<HTMLInputElement>(`.page-input`).value).toBe(`1`)
      expect(document.querySelector(`.page-info`)?.textContent).toContain(`of 5`)
      expect(document.querySelector(`.row-count`)?.textContent).toContain(`50 rows`)
      expect(document.querySelectorAll(`tbody tr`)).toHaveLength(10)
      expect(document.querySelector(`.page-size-select`)).toBeNull()

      // First and Previous are disabled on page 1, Next and Last are not
      const buttons = [...document.querySelectorAll<HTMLButtonElement>(`.page-btn`)]
      expect(buttons.map((btn) => btn.disabled)).toEqual([true, true, false, false])
    })

    it(`keeps the current page across same-length data refreshes, resets on row count change`, async () => {
      const state = $state({ data: large_data.map((row) => ({ ...row })) })
      mount_table(
        bind_props({ columns: sample_columns, pagination: { page_size: 10 } }, state),
      )
      const page_input = doc_query<HTMLInputElement>(`.page-input`)
      const next_btn = document.querySelectorAll<HTMLButtonElement>(`.page-btn`)[2]
      await click(next_btn)
      expect(page_input.value).toBe(`2`)

      state.data[0].Value = 999 // live cell update
      await tick()
      expect(page_input.value).toBe(`2`)
      state.data = state.data.map((row) => ({ ...row })) // same-length replacement
      await tick()
      expect(page_input.value).toBe(`2`)

      state.data = state.data.slice(0, 30) // row count changed
      await tick()
      expect(page_input.value).toBe(`1`)
      state.data = state.data.slice(0, 3) // fits on one page: no pagination bar
      await tick()
      expect(document.querySelector(`.pagination`)).toBeNull()
    })

    // a default page size missing from page_sizes showed as the first option instead
    it(`lists the current page size among page_sizes`, () => {
      mount_sample({ data: large_data, pagination: { page_sizes: [10, 50] } })
      const select = doc_query<HTMLSelectElement>(`.page-size-select`)
      expect([...select.options].map((option) => option.value)).toEqual([
        `10`,
        `25`,
        `50`,
      ])
      expect(select.value).toBe(`25`)
    })

    it.each([`parent`, `select`])(`applies page-size changes from %s`, async (origin) => {
      const on_page_size_change = vi.fn()
      const state = $state({
        data: large_data,
        pagination: { page_size: 10, page_sizes: [10, 25, 50], on_page_size_change },
      })
      mount_sample(state)
      const select = doc_query<HTMLSelectElement>(`.page-size-select`)
      expect([...select.options].map((option) => option.textContent?.trim())).toEqual([
        `10 / page`,
        `25 / page`,
        `50 / page`,
      ])
      expect(document.querySelectorAll(`tbody tr`)).toHaveLength(10)
      if (origin === `parent`) {
        state.pagination = { ...state.pagination, page_size: 25 }
        await tick()
      } else {
        select.value = `25`
        await fire(select, new Event(`change`, { bubbles: true }))
        expect(on_page_size_change).toHaveBeenCalledWith(25)
      }
      expect(select.value).toBe(`25`)
      expect(document.querySelectorAll(`tbody tr`)).toHaveLength(25)
      // a page size that fits all rows hides the page buttons but keeps the picker
      select.value = `50`
      await fire(select, new Event(`change`, { bubbles: true }))
      expect(document.querySelectorAll(`tbody tr`)).toHaveLength(50)
      expect(document.querySelector(`.page-btn`)).toBeNull()
      select.value = `10`
      await fire(select, new Event(`change`, { bubbles: true }))
      expect(document.querySelectorAll(`tbody tr`)).toHaveLength(10)
      // fewer rows than the smallest size: no pick would change paging, so no picker or bar
      state.data = large_data.slice(0, 5)
      await tick()
      expect(document.querySelector(`.pagination`)).toBeNull()
    })
  })

  it(`renders resize handles with ARIA roles and drags them into clamped column widths`, async () => {
    const column_prefs: Record<string, ColumnPrefs> = {}
    const state = $state({ column_prefs })
    // Value carries its own min_width and max_width, overriding the default [50, 500] clamp
    const columns = sample_columns.with(2, {
      ...sample_columns[2],
      min_width: 80,
      max_width: 160,
    })
    mount_sample(bind_props({ columns }, state))

    const resize_handles = document.querySelectorAll<HTMLElement>(`.resize-handle`)
    expect(resize_handles).toHaveLength(3) // One per column
    expect(resize_handles[0].getAttribute(`role`)).toBe(`separator`)
    expect(resize_handles[0].getAttribute(`aria-orientation`)).toBe(`vertical`)
    // the announced range is the column's own clamp, and no width is claimed before a resize
    const aria_range = (handle: HTMLElement) =>
      [`min`, `max`, `now`].map((key) => handle.getAttribute(`aria-value${key}`))
    expect(aria_range(resize_handles[1])).toEqual([`50`, `500`, null])
    expect(aria_range(resize_handles[2])).toEqual([`80`, `160`, null])

    // headers have no layout width in happy-dom, so widths start from 0 and clamp to [50, 500].
    // The handle captures the pointer, so every event of the drag targets it.
    const handle = resize_handles[1]
    const pointer = (type: string, clientX: number, target = handle) =>
      target.dispatchEvent(
        new PointerEvent(type, { clientX, bubbles: true, pointerId: 1 }),
      )
    pointer(`pointerdown`, 100)
    pointer(`pointermove`, 220)
    await tick()
    expect(state.column_prefs.Score?.width).toBe(120)
    expect(doc_query(`th[data-col-id="Score"]`).style.width).toBe(`120px`)
    expect(resize_handles[1].getAttribute(`aria-valuenow`)).toBe(`120`)
    pointer(`pointermove`, 900)
    expect(state.column_prefs.Score?.width).toBe(500)
    pointer(`pointerup`, 900)
    pointer(`pointermove`, 300) // released: further movement must not resize
    expect(state.column_prefs.Score?.width).toBe(500)
    expect(state.column_prefs.Model).toBeUndefined()
    // the click that follows the release lands on the handle inside the sortable header
    await fire(handle, mouse(`click`))
    expect(doc_query(`th[data-col-id="Score"]`).getAttribute(`aria-sort`)).toBe(`none`)
    // keyboard: a named tab stop whose arrows step the width and whose Enter doesn't sort
    expect(handle.getAttribute(`aria-label`)).toBe(`Resize Score column`)
    expect(handle.tabIndex).toBe(0)
    for (const key of [`ArrowRight`, `ArrowLeft`, `Enter`])
      handle.dispatchEvent(keydown(key))
    expect(state.column_prefs.Score?.width).toBe(490) // 500 is the cap: ArrowRight stays there
    expect(doc_query(`th[data-col-id="Score"]`).getAttribute(`aria-sort`)).toBe(`none`)
    for (const [client_x, width] of [
      [100, undefined],
      [400, 160],
      [0, 80],
    ] as const) {
      pointer(
        client_x === 100 ? `pointerdown` : `pointermove`,
        client_x,
        resize_handles[2],
      )
      expect(state.column_prefs.Value?.width).toBe(width)
    }
    pointer(`pointerup`, 0, resize_handles[2])
  })

  it(`appends menu_sections to a column's context menu, without pins when allow_pinning=false`, async () => {
    const action = vi.fn()
    mount_sample({
      allow_pinning: false,
      menu_sections: (col: { id: string }) => [
        { title: `Host`, actions: [{ id: `x`, label: `Inspect ${col.id}`, action }] },
      ],
    })
    await open_context_menu(doc_query(`th[data-col-id="Score"]`))
    expect(menu_item(`Pin left`)).toBeUndefined()
    await fire(menu_item(`Inspect Score`))
    expect(action).toHaveBeenCalledOnce()
  })

  // without a sanitizer, markup renders as its escaped text rather than as raw HTML
  it(`renders HTML cells and labels as escaped text by default`, () => {
    mount_table({
      data: [{ Rich: `<b>bold</b> <img src=x onerror=alert(1)>` }],
      columns: [{ id: `Rich`, label: `<i>Rich</i>` }],
      render_html: table_data.escape_markup,
    })
    const cell = cell_at(0, 0)
    expect(cell.querySelector(`b, img`)).toBeNull()
    expect(cell.textContent?.trim()).toBe(`bold`)
    expect(doc_query(`th[data-col-id="Rich"]`).querySelector(`i`)).toBeNull()
  })

  describe(`Regression tests for bug fixes`, () => {
    it.each<[TableProps[`sort_hint`], string, boolean, `top` | `bottom`]>([
      [`Click to sort`, `Click to sort`, false, `bottom`],
      [
        {
          text: `Full config hint`,
          position: `top`,
          permanent: true,
          style: `font-weight: bold; color: red;`,
          class: `custom-hint-class another-class`,
        },
        `Full config hint`,
        true,
        `top`,
      ],
    ])(`renders sort_hint %j`, (sort_hint, text, permanent, position) => {
      mount_sample({ sort_hint })
      const hint = doc_query(`.sort-hint`)
      expect(hint.textContent).toBe(text)
      expect(hint.classList.contains(`permanent`)).toBe(permanent)
      if (typeof sort_hint === `object`) {
        expect(hint.classList.contains(`custom-hint-class`)).toBe(true)
        expect(hint.classList.contains(`another-class`)).toBe(true)
        expect(hint.style.fontWeight).toBe(`bold`)
        expect(hint.style.color).toBe(`red`)
      }
      expect(hint.compareDocumentPosition(doc_query(`.table-scroll`))).toBe(
        position === `top`
          ? Node.DOCUMENT_POSITION_FOLLOWING
          : Node.DOCUMENT_POSITION_PRECEDING,
      )
    })

    // one object listed twice was a duplicate each-block key, which crashed the table
    it(`renders and sorts a row object listed more than once`, async () => {
      const shared = { Name: `B`, Value: 2 }
      mount_table({ data: [shared, { Name: `A`, Value: 1 }, shared] })
      await click(document.querySelectorAll<HTMLElement>(`th`)[1])
      expect(col_values(`Name`)).toEqual([`B`, `B`, `A`])
    })

    // Two columns share the label `Value`: the header click must sort by its own group.
    // Descending by Group B gives 1, 3, 2 (Group A would give 2, 1, 3). Keyed columns read
    // their plain data key, not their ID.
    it.each<[string, Column[]]>([
      [`ID`, [grouped(`Value`, `Group A`), grouped(`Value`, `Group B`)]],
      [
        `key`,
        [
          grouped(`A`, `Physical`, `Value (Group A)`),
          grouped(`B`, `Physical`, `Value (Group B)`),
        ],
      ],
    ])(`renders and sorts grouped columns by %s`, async (_desc, group_cols) => {
      const data = [
        { Name: `Item 1`, 'Value (Group A)': 10, 'Value (Group B)': 100 },
        { Name: `Item 2`, 'Value (Group A)': 20, 'Value (Group B)': 50.25 },
        { Name: `Item 3`, 'Value (Group A)': 5, 'Value (Group B)': 75 },
      ]
      mount_table({ data, columns: [{ id: `Name`, label: `Name` }, ...group_cols] })
      expect(texts(`td[data-col-idx="2"]`)).toEqual([`100`, `50.3`, `75`])
      await click(document.querySelectorAll(`thead tr:last-child th`)[2])
      expect(col_values(`Name`)).toEqual([`Item 1`, `Item 3`, `Item 2`])
    })

    it(`reads an explicit key present only after the first 50 rows`, () => {
      const data = Array.from({ length: 51 }, (_, idx) =>
        idx === 50 ? { Name: `late`, 'Mass (Physical)': 55.85 } : { Name: `row-${idx}` },
      )
      mount_table({
        data,
        columns: [{ id: `Name`, label: `Name` }, grouped(`Mass`, `Physical`)],
      })
      expect(col_values(`Mass`).at(-1)).toBe(`55.9`)
    })

    // Right-aligned digits are what make a column scannable; text and dates stay left. Every
    // row is scanned: sampling the leading 50 right-aligned Late, whose only text is row 60's.
    it(`right-aligns only all-numeric columns`, () => {
      const late_rows = Array.from({ length: 58 }, (_, idx) => ({
        Name: `row-${idx}`,
        Late: idx === 57 ? `unknown` : idx,
      }))
      mount_table({
        data: [
          { Name: `A`, Mass: 55.85, Mixed: 1, When: `2026-06-21`, Marked: `<b>1.5</b>` },
          {
            Name: `B`,
            Mass: 16,
            Mixed: `n/a-ish text`,
            When: `2026-06-22`,
            Marked: `<b data-sort-value="2.5">2.5 eV</b>`,
          },
          ...late_rows,
        ],
        columns: plain_columns(`Name`, `Mass`, `Mixed`, `When`, `Marked`, `Late`),
      })
      // Text, mixed columns and dates stay left; numeric markup aligns with numbers.
      for (const selector of [`tbody tr:first-child td`, `thead th`]) {
        expect(
          [...document.querySelectorAll(selector)].map((cell) =>
            cell.classList.contains(`numeric-col`),
          ),
        ).toEqual([false, true, false, false, true, false])
      }
    })

    // aria-grabbed follows the drag state reactively rather than being poked onto the DOM
    // by the drag handlers, so it can't fall out of sync with what the component thinks.
    it(`marks the dragged header grabbed until the drag ends`, async () => {
      mount_sample()
      const header = document.querySelector(`thead tr:last-child th`) as HTMLElement
      const drag = (type: string) => {
        const event = new Event(type, { bubbles: true })
        Object.defineProperty(event, `dataTransfer`, {
          value: { effectAllowed: ``, dropEffect: ``, setData: vi.fn() },
        })
        header.dispatchEvent(event)
      }

      expect(header.getAttribute(`aria-grabbed`)).toBeNull()
      drag(`dragstart`)
      await tick()
      expect(header.getAttribute(`aria-grabbed`)).toBe(`true`)
      drag(`dragend`)
      await tick()
      expect(header.getAttribute(`aria-grabbed`)).toBeNull()
    })

    // Sticky columns pin to one edge, so any after the first clears the ones before it (by
    // their measured offsetWidth, re-read when a header resizes). Right pins stack from the
    // right edge in reverse order, and the header context menu re-pins or unpins (a null pref
    // overrides the column's own `sticky`).
    it(`pins and stacks columns on either edge from config and the context menu`, async () => {
      let name_width = 80
      const width_spy = vi
        .spyOn(HTMLElement.prototype, `offsetWidth`, `get`)
        .mockImplementation(function (this: HTMLElement) {
          return this.dataset.colId === `Name` ? name_width : 80
        })
      onTestFinished(() => width_spy.mockRestore())
      const state = $state<{ column_prefs: Record<string, ColumnPrefs> }>({
        column_prefs: {},
      })
      const columns: Column[] = [
        { id: `Name`, label: `Name`, sticky: true },
        { id: `Tag`, label: `Tag` },
        { id: `Value`, label: `Value`, sticky: `right`, group: `Numbers` },
        { id: `Note`, label: `Note`, sticky: `right` },
      ]
      const data = [{ Name: `A`, Tag: `x`, Value: 1, Note: `n` }]
      mount_table(bind_props({ data, columns, summary: true }, state))
      await tick()
      // group-header spacers and summary cells pin with their column too
      const [name_spacer] = document.querySelectorAll<HTMLElement>(`tr.group-header th`)
      expect([name_spacer.className.includes(`pinned`), name_spacer.style.left]).toEqual([
        true,
        `0px`,
      ])
      const [, , value_mean, note_mean] =
        document.querySelectorAll<HTMLElement>(`tfoot td`)
      expect([value_mean.style.right, note_mean.style.right]).toEqual([`80px`, `0px`])
      expect(note_mean.classList.contains(`pinned-right`)).toBe(true)
      const head = (col_id: string) => doc_query(`thead th[data-col-id="${col_id}"]`)
      const cell_style = (col: string) => doc_query(`td[data-col="${col}"]`).style
      const edges = (col_id: string) => {
        const { left, right } = head(col_id).style
        return {
          left,
          right,
          pinned_right: head(col_id).classList.contains(`pinned-right`),
        }
      }
      expect(edges(`Name`)).toEqual({ left: `0px`, right: ``, pinned_right: false })
      expect(edges(`Note`)).toEqual({ left: ``, right: `0px`, pinned_right: true })
      expect(edges(`Value`)).toEqual({ left: ``, right: `80px`, pinned_right: true })
      expect(cell_style(`Value`).right).toBe(`80px`)
      expect(cell_style(`Tag`).left).toBe(``)

      const pick = async (col_id: string, label: string) => {
        await open_context_menu(head(col_id))
        await fire(menu_item(label))
      }
      await pick(`Tag`, `Pin left`)
      expect(state.column_prefs.Tag?.pinned).toBe(`left`)
      expect([edges(`Tag`).left, cell_style(`Tag`).left]).toEqual([`80px`, `80px`]) // after Name
      // the first header grows (a manual resize, longer label): every pin after it shifts
      name_width = 120
      trigger_resize_observer(head(`Name`))
      await tick()
      expect([edges(`Tag`).left, cell_style(`Tag`).left]).toEqual([`120px`, `120px`])
      await pick(`Name`, `Pin left`) // re-picking the current side unpins, over its config
      expect(state.column_prefs.Name?.pinned).toBeNull()
      expect(head(`Name`).classList.contains(`pinned`)).toBe(false)
      expect(edges(`Tag`).left).toBe(`0px`)
      await pick(`Note`, `Pin left`)
      expect(edges(`Value`).right).toBe(`0px`) // Note left the right edge
    })

    it(`clears the grouped-header offset when the final group is hidden`, async () => {
      const height_spy = vi
        .spyOn(HTMLElement.prototype, `clientHeight`, `get`)
        .mockReturnValue(24)
      onTestFinished(() => height_spy.mockRestore())
      const state = $state({ hidden_columns: [] as string[] })
      const columns = [{ id: `Name`, label: `Name` }, grouped(`Mass`, `Physical`, `Mass`)]
      mount_table(bind_props({ data: [{ Name: `Fe`, Mass: 55.85 }], columns }, state))
      await tick()
      const table = doc_query(`table`)
      expect(table.getAttribute(`style`)).toContain(`--group-header-height: 24px`)
      state.hidden_columns = [`Mass (Physical)`]
      await tick()
      expect(table.getAttribute(`style`)).toContain(`--group-header-height: 0px`)
    })
  })

  it(`shows an empty row with colspan over every column, select and row-number`, () => {
    mount_table({
      data: [],
      columns: sample_columns,
      show_row_select: true,
      row_key: `Model`,
      show_row_numbers: true,
    })
    const cell = doc_query(`.empty-row td`)
    expect(cell.textContent?.trim()).toBe(`No data`)
    expect(cell.getAttribute(`colspan`)).toBe(`5`) // 3 data + select + row number
  })

  describe(`Keyboard Navigation`, () => {
    it.each([{ key: `Enter` }, { key: ` ` }])(
      `focusable rows trigger on_row_click on $key key`,
      async ({ key }) => {
        const clicked: unknown[] = []
        mount_sample({
          on_row_click: (
            _event: KeyboardEvent | MouseEvent,
            row: Record<string, unknown>,
          ) => clicked.push(row),
        })

        const rows = document.querySelectorAll<HTMLElement>(`tbody tr`)
        expect([...rows].map((row) => row.getAttribute(`tabindex`))).toEqual([
          `0`,
          `0`,
          `0`,
        ])
        await fire(rows[0], keydown(key))

        expect(clicked).toHaveLength(1)
        expect(clicked[0]).toHaveProperty(`Model`, `Model A`)
      },
    )

    // Row actions are delegated to <tbody> and resolve their row from the DOM, so a table
    // rendered inside a cell snippet (whose own <tr>s carry no index) and a row whose data
    // columns are all hidden must still map back to the right row object
    it(`resolves row actions through nested tables and rows without data cells`, async () => {
      const on_row_click = vi.fn()
      const on_row_double_click = vi.fn()
      const data = [{ A: 1 }, { A: 2 }]
      const cell = createRawSnippet((_args: () => CellSnippetArgs) => ({
        render: () => `<table><tbody><tr><td class="inner">x</td></tr></tbody></table>`,
      }))
      const state = $state({ hidden_columns: [] as string[] })
      const props = { data, columns: plain_columns(`A`), cell, show_row_select: true }
      mount_table(
        bind_props({ ...props, on_row_click, on_row_double_click, row_key: `A` }, state),
      )
      await tick()
      const inner = document.querySelectorAll<HTMLElement>(`td.inner`)[1]
      inner.dispatchEvent(mouse(`click`))
      inner.dispatchEvent(mouse(`dblclick`))
      inner.dispatchEvent(keydown(`Enter`))
      expect(on_row_click.mock.calls.map((call) => call[1])).toEqual([data[1], data[1]])
      expect(on_row_double_click.mock.calls.map((call) => call[1])).toEqual([data[1]])

      on_row_click.mockClear()
      state.hidden_columns = [`A`]
      await tick()
      const last_row = doc_query(`tbody tr[data-row-idx="1"]`)
      expect(last_row.querySelector(`td[data-row-idx]`)).toBeNull()
      last_row.dispatchEvent(mouse(`click`))
      expect(on_row_click.mock.calls.map((call) => call[1])).toEqual([data[1]])
    })

    // A live refresh (a trajectory frame) hands over fresh rows: those equal to the shown ones
    // keep their objects, so only changed rows re-render
    it(`keeps the objects of unchanged rows across a data refresh`, async () => {
      const on_row_click = vi.fn()
      const state = $state<{ data: { A: number; B: number | undefined }[] }>({
        data: [
          { A: 1, B: 1 },
          { A: 2, B: 2 },
        ],
      })
      const [first] = state.data
      mount_table(
        bind_props(
          { columns: plain_columns(`A`, `B`), row_key: `A`, on_row_click },
          state,
        ),
      )
      await tick()
      state.data = [
        { A: 1, B: 1 },
        { A: 2, B: 3 },
      ]
      await tick()
      for (const idx of [0, 1])
        doc_query(`tbody tr[data-row-idx="${idx}"]`).dispatchEvent(mouse(`click`))
      const [[, kept], [, changed]] = on_row_click.mock.calls
      expect(kept).toBe(first)
      expect(changed).toBe(state.data[1])
      // a class row's getter is no own value, so equal own fields don't vouch for its cell
      const scores = new Map([[1, 1]])
      class Scored {
        constructor(readonly A: number) {}
        get B() {
          return scores.get(this.A)
        }
      }
      state.data = [new Scored(1)]
      await tick()
      scores.set(1, 5)
      state.data = [new Scored(1)]
      await tick()
      expect(
        doc_query(`tbody td[data-row-idx="0"][data-col-idx="1"]`).textContent?.trim(),
      ).toBe(`5`)
    })

    // A DataTable nested in a cell (a per-row mini table) carries its own data-row-idx /
    // data-col-idx attributes, so the outer lookups must stop at their own <tbody> instead of
    // resolving the inner table's coordinates against the outer rows
    it(`ignores the indices of a nested DataTable when resolving rows and cells`, async () => {
      const on_row_click = vi.fn()
      const data = [{ A: 1 }, { A: 2 }, { A: 3 }]
      // the inner markup mirrors what a nested DataTable renders for its own first row
      const cell = createRawSnippet((_args: () => CellSnippetArgs) => ({
        render: () =>
          `<table><tbody><tr data-row-idx="0"><td data-row-idx="0" data-col-idx="0" class="inner">x</td></tr></tbody></table>`,
      }))
      mount_table({
        data,
        columns: plain_columns(`A`),
        on_row_click,
        cell,
        keyboard_cells: true,
      })
      await tick()
      const inner = document.querySelectorAll<HTMLElement>(`td.inner`)[2]
      inner.dispatchEvent(mouse(`click`))
      expect(on_row_click.mock.calls.map((call) => call[1])).toEqual([data[2]])

      // a drag started in the inner cell selects the outer cell it sits in, not (0, 0)
      inner.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true, button: 0 }))
      await fire(globalThis, new PointerEvent(`pointerup`))
      const selected = [...document.querySelectorAll<HTMLElement>(`td.cell-selected`)]
      expect(selected.map((selected_cell) => selected_cell.dataset.rowIdx)).toEqual([`2`])
      expect(selected[0].classList.contains(`inner`)).toBe(false)

      // keyboard: ArrowUp from the outer row 2 cell lands on the outer row 1 cell
      cell_at(2, 0).focus()
      await fire(cell_at(2, 0), keydown(`ArrowUp`))
      expect(document.activeElement).toBe(cell_at(1, 0))
    })

    // A row-select checkbox toggles its row itself; the click or key it bubbles into the row
    // must not fire on_row_click too, or a toggling row action undoes the checkbox
    it(`row-select checkbox clicks and keys skip on_row_click`, async () => {
      const on_row_click = vi.fn()
      const state = $state({ selected_ids: [] as RowId[] })
      const props = {
        data: [{ A: 1 }, { A: 2 }],
        columns: plain_columns(`A`),
        on_row_click,
      }
      mount_table(bind_props({ ...props, show_row_select: true, row_key: `A` }, state))
      await tick()
      const checkbox = doc_query<HTMLInputElement>(`tbody tr[data-row-idx="1"] input`)
      checkbox.click()
      await fire(checkbox, keydown(` `))
      expect(state.selected_ids).toEqual([2])
      expect(on_row_click).not.toHaveBeenCalled()
    })
  })

  // on_row_hover links a row to something outside the table (a 3D atom highlight), so the
  // row under a still pointer is re-reported when the data under it changes, and an unmount
  // mid-hover clears it
  it(`on_row_hover follows data changes under the pointer and clears on unmount`, async () => {
    const on_row_hover = vi.fn()
    const state = $state({ data: [{ A: 1 }, { A: 2 }] })
    const table = mount_table(
      bind_props({ columns: plain_columns(`A`), on_row_hover }, state),
    )
    await tick()
    const over = (row_idx: number) =>
      doc_query(`tbody tr[data-row-idx="${row_idx}"] td`).dispatchEvent(
        new PointerEvent(`pointerover`, { bubbles: true }),
      )
    over(1)
    expect(on_row_hover.mock.calls).toEqual([[{ A: 2 }]])
    state.data = [{ A: 3 }, { A: 4 }]
    await tick()
    expect(on_row_hover.mock.lastCall).toEqual([{ A: 4 }])
    // the row is gone: nothing is under the pointer any more
    state.data = [{ A: 5 }]
    await tick()
    expect(on_row_hover.mock.lastCall).toEqual([null])
    over(0)
    const n_calls = on_row_hover.mock.calls.length
    await unmount_table(table)
    expect(on_row_hover.mock.calls.slice(n_calls)).toEqual([[null]])
  })

  // A linked view names a row (an atom hovered in 3D): it is shaded like the hovered row,
  // without re-running the duplicate-id pass over every row on each hover
  it(`highlighted_row_id shades the named row`, async () => {
    const state = $state<{ highlighted_row_id: number | null }>({ highlighted_row_id: 2 })
    let offscreen_reads = 0
    const offscreen_row = {
      get id() {
        offscreen_reads++
        return 4
      },
    }
    const data = [{ id: 1 }, { id: 2 }, { id: 3 }, offscreen_row]
    const props = { data, columns: plain_columns(`id`), pagination: { page_size: 3 } }
    mount_table(bind_props({ ...props, row_key: `id` }, state))
    await tick()
    const shaded = () =>
      [...document.querySelectorAll(`tbody tr[data-row-idx]`)].map((row) =>
        row.classList.contains(`hovered`),
      )
    expect(shaded()).toEqual([false, true, false])
    offscreen_reads = 0
    // only rows whose highlight changes re-apply their attributes (on then off, off, never)
    const attribute_updates = count_attribute_updates([
      ...document.querySelectorAll(`tbody tr[data-row-idx]`),
    ])
    for (const [row_id, expected] of [
      [1, [true, false, false]],
      [null, [false, false, false]],
    ] as const) {
      state.highlighted_row_id = row_id
      await tick()
      expect(shaded()).toEqual(expected)
    }
    expect(offscreen_reads).toBe(0)
    expect(attribute_updates).toEqual([2, 1, 0])
  })

  describe(`Filtering, summaries and per-column state`, () => {
    const metrics = plain_columns(`Model`, `Score`, `Tier`)
    const metric_rows = [
      { Model: `A`, Score: 10, Tier: `alpha` },
      { Model: `B`, Score: 20, Tier: `beta` },
      { Model: `C`, Score: 30, Tier: `alpha` },
    ]
    const rendered_models = () => col_values(`Model`)

    it(`binds visible_rows to the filtered rows in sort order across all pages`, async () => {
      const state = $state({ visible_rows: [] as RowData[] })
      const filter = { kind: `category` as const, values: [`alpha`] }
      const props = {
        data: metric_rows,
        columns: metrics,
        column_prefs: { Tier: { filter } },
      }
      const sort = { column: `Score`, dir: `desc` as const }
      mount_table(bind_props({ ...props, sort, pagination: { page_size: 1 } }, state))
      await tick()
      expect(state.visible_rows.map((row) => row.Model)).toEqual([`C`, `A`])
      expect(rendered_models()).toEqual([`C`]) // one page rendered, all rows reported
    })

    // Summary rows read the same stats the color scales use, so they must shrink with the
    // filter rather than describing the untouched data.
    it(`summarizes only the rows left after filtering`, async () => {
      const props = $state({
        data: metric_rows,
        columns: metrics,
        summary: [`mean`, `median`, `count`] as SummaryStat[],
        column_prefs: {} satisfies Record<string, ColumnPrefs>,
      })
      mount_table(props)
      const summary_cells = () => texts(`tfoot .summary-row td`)
      expect(summary_cells()).toEqual([
        `mean`,
        `20`,
        ``,
        `median`,
        `20`,
        ``,
        `count`,
        `3`,
        ``,
      ])
      props.column_prefs = { Score: { filter: { kind: `numeric`, min: 20 } } }
      await tick()
      expect(summary_cells()).toEqual([
        `mean`,
        `25`,
        ``,
        `median`,
        `25`,
        ``,
        `count`,
        `2`,
        ``,
      ])
    })

    it(`normalizes columns independently and enables median summaries on demand`, async () => {
      const values = [...Array.from({ length: 20 }, (_, idx) => idx * 5), 10_000]
      const props = $state({
        data: values.map((value, idx) => ({
          Name: `row_${idx}`,
          Quantile: value,
          Linear: value,
        })),
        columns: [
          { id: `Name`, label: `Name` },
          { id: `Quantile`, label: `Quantile`, normalize: `quantile`, render_as: `bar` },
          { id: `Linear`, label: `Linear`, render_as: `bar` },
        ] as Column[],
        summary: [] as SummaryStat[],
      })
      mount_table(props)
      // the data bar's length is the value's place in the column's domain
      const fill = (row_idx: number, col_idx: number) =>
        cell_at(row_idx, col_idx).querySelector<HTMLElement>(`.data-bar`)?.style.width
      expect(fill(19, 1)).toBe(fill(20, 1)) // 95 and the outlier saturate above q95
      expect(fill(19, 2)).not.toBe(fill(20, 2)) // minmax keeps the full domain
      props.columns[1].normalize = `minmax`
      props.summary = [`median`]
      await tick()
      expect(fill(19, 1)).toBe(fill(19, 2))
      expect(texts(`tfoot .summary-row td`)).toEqual([`median`, `50`, `50`])
      // A later column widens the shared domain of columns already processed.
      props.columns[1].domain_group = `values`
      props.columns[2].domain_group = `values`
      props.data[19].Linear = 10_000
      props.data[20].Linear = 20_000
      await tick()
      expect(fill(20, 1)).toBe(fill(19, 2))
      expect(fill(20, 1)).not.toBe(fill(20, 2))
    })

    it.each([
      [`higher`, [`0%`, `50%`, `100%`], `30`],
      [`lower`, [`100%`, `50%`, `0%`], `10`],
      [undefined, [`0%`, `50%`, `100%`], undefined],
    ] as const)(
      `sizes data bars and highlights best for better=%s`,
      (better, widths, best) => {
        mount_table({
          data: metric_rows,
          columns: [
            { id: `Model`, label: `Model` },
            {
              id: `Score`,
              label: `Score`,
              better,
              render_as: `bar`,
              highlight_best: true,
            },
          ],
        })
        const bars = document.querySelectorAll<HTMLElement>(
          `td[data-col="Score"] .data-bar`,
        )
        expect([...bars].map((bar) => bar.style.width)).toEqual(widths)
        expect(
          document.querySelector(`td.best-cell[data-col="Score"]`)?.textContent?.trim(),
        ).toBe(best)
      },
    )

    const unsorted_rows = [
      { Model: `A`, Score: 20, Tier: `alpha` },
      { Model: `B`, Score: 10, Tier: `beta` },
      { Model: `C`, Score: 30, Tier: `alpha` },
    ]
    it.each([
      {
        desc: `clears the sort on the third click`,
        data: unsorted_rows,
        columns: metrics,
        initial_sort: undefined,
        initial: [`A`, `B`, `C`],
        states: [
          [[`C`, `A`, `B`], `↑`],
          [[`B`, `A`, `C`], `↓`],
          [[`A`, `B`, `C`], ``],
        ] as const,
      },
      {
        // The gradient-direction pref (context menu) overrides the column config for sorting
        // too, not just for the colors
        desc: `starts ascending when column_prefs marks lower as better`,
        data: unsorted_rows,
        columns: metrics,
        column_prefs: { Score: { better: `lower` as const } },
        initial_sort: undefined,
        initial: [`A`, `B`, `C`],
        states: [
          [[`B`, `A`, `C`], `↓`],
          [[`C`, `A`, `B`], `↑`],
          [[`A`, `B`, `C`], ``],
        ] as const,
      },
      {
        // An initial sort has no unsorted state to return to, so its cycle stays two-step.
        // Data arrives ascending, so the initial order proves the object form sorts desc.
        desc: `keeps cycling asc/desc under an initial_sort`,
        data: [
          { Model: `B`, Score: 10 },
          { Model: `A`, Score: 20 },
        ],
        columns: plain_columns(`Model`, `Score`),
        initial_sort: { column: `Score`, direction: `desc` as const },
        initial: [`A`, `B`],
        states: [
          [[`B`, `A`], `↓`],
          [[`A`, `B`], `↑`],
          [[`B`, `A`], `↓`],
        ] as const,
      },
    ])(`$desc`, async ({ desc: _desc, initial, states, ...props }) => {
      mount_table(props)
      const header = doc_query(`th[data-col-id="Score"]`)
      expect(rendered_models()).toEqual(initial)
      expect(/[↑↓]/.exec(header.textContent ?? ``)?.[0] ?? ``).toBe(
        props.initial_sort ? `↑` : ``,
      )
      for (const [expected, arrow] of states) {
        await click(header)
        expect(rendered_models()).toEqual(expected)
        expect(/[↑↓]/.exec(header.textContent ?? ``)?.[0] ?? ``).toBe(arrow)
      }
    })

    // column_prefs holds widths and colors as well as filters, so a resize must not look
    // like a filter change — that re-filtered every row and wiped the cell selection.
    it(`updates preferences without rescanning offscreen rows or clearing selection`, async () => {
      let offscreen_reads = 0
      const props = $state({
        data: [
          ...metric_rows,
          {
            Model: `D`,
            get Score() {
              offscreen_reads++
              return 40
            },
          },
        ],
        columns: metrics.map((col) => ({ ...col, highlight_best: true })),
        pagination: { page_size: 3 },
        summary: true,
        column_prefs: {} satisfies Record<string, ColumnPrefs>,
      })
      mount_table(props)
      await tick()
      const cell = document.querySelector(
        `td[data-row-idx="1"][data-col-idx="1"]`,
      ) as HTMLElement
      await fire(cell, new PointerEvent(`pointerdown`, { bubbles: true, button: 0 }))
      expect(n_selected()).toBe(1)

      offscreen_reads = 0
      props.column_prefs = { Score: { width: 180 } } // a resize, not a filter
      await tick()
      expect(n_selected()).toBe(1)
      expect(cell.style.width).toBe(`180px`)
      props.column_prefs = {
        Score: { width: 180, better: `lower`, color_scale: `interpolatePlasma` },
      }
      await tick()
      expect(offscreen_reads).toBe(0)
      expect(n_selected()).toBe(1)
      expect(
        document.querySelector(`td.best-cell[data-col="Score"]`)?.textContent?.trim(),
      ).toBe(`10`)
      expect(document.querySelector(`tfoot td:nth-child(2)`)?.textContent?.trim()).toBe(
        `25`,
      )
      props.data[3] = { Model: `D`, Score: 80 }
      await tick()
      expect(document.querySelector(`tfoot td:nth-child(2)`)?.textContent?.trim()).toBe(
        `35`,
      )
    })

    // ColumnFilter's scoped rules outrank the .header-popover ones, so the panel follows the
    // header background only through the widget's own variable
    it(`themes the filter panel with the header background`, () => {
      expect(data_table_source).toMatch(
        /--column-filter-panel-bg: var\(--table-header-bg, var\(--page-bg, Canvas\)\)/,
      )
    })

    // Past the auto-detect cap a checklist would be unusable, but a column explicitly
    // configured as `category` must still get its full option list rather than an empty panel.
    it(`lists every option for an explicitly categorical column past the cap`, async () => {
      const many = Array.from({ length: 60 }, (_unused_value, idx) => ({
        Tag: `t${idx}`,
        Score: idx,
      }))
      mount_table({
        data: many,
        columns: [
          { id: `Tag`, label: `<i>Tag</i> &amp; ID`, filter: `category` },
          { id: `Score`, label: `Score` },
        ],
        show_filters: true,
      })
      await tick()
      const trigger = doc_query<HTMLButtonElement>(`.column-filter-trigger`)
      expect(trigger.getAttribute(`aria-label`)).toBe(`Filter Tag & ID`) // as rendered
      await click(trigger)
      const options = document.querySelectorAll(`.column-filter-choices label`)
      expect(options).toHaveLength(60)
      // keys typed in the panel must not reach the sortable header underneath
      const panel = doc_query(`.column-filter-panel`)
      const event = keydown(`Enter`)
      vi.spyOn(event, `stopPropagation`)
      panel.dispatchEvent(event)
      expect(event.stopPropagation).toHaveBeenCalledOnce()
      expect(panel.getAttribute(`popover`)).toBe(`auto`)
      dismiss_popover(panel)
      await tick()
      expect(document.querySelector(`.column-filter-panel`)).toBeNull()
    })

    // The funnel lives inside the sortable header, so every interaction with it must stop
    // before the header sorts or starts a drag
    it(`drives numeric, category and text filters from the header panel without sorting`, async () => {
      const column_prefs: Record<string, ColumnPrefs> = {}
      const state = $state({ column_prefs })
      const columns: Column[] = [
        { id: `Model`, label: `Model`, filter: `text` },
        ...metrics.slice(1),
      ]
      mount_table(bind_props({ data: metric_rows, columns, show_filters: true }, state))
      const headers = document.querySelectorAll<HTMLElement>(`th`)
      const open_panel = async (header_cell: HTMLElement) => {
        await click(
          header_cell.querySelector<HTMLButtonElement>(`.column-filter-trigger`),
        )
        expect(document.querySelectorAll(`.column-filter-panel`)).toHaveLength(1) // one at a time
        return doc_query(`.column-filter-panel`)
      }
      const set_input = async (input: HTMLInputElement | undefined, value: string) => {
        assert(input)
        input.value = value
        await fire(input, new Event(`input`, { bubbles: true }))
      }

      const [min_input, max_input] = (
        await open_panel(headers[1])
      ).querySelectorAll<HTMLInputElement>(`input[type="number"]`)
      expect(min_input.getAttribute(`placeholder`)).toBe(`10`)
      await set_input(min_input, `15`)
      expect(rendered_models()).toEqual([`B`, `C`])
      await set_input(max_input, `25`)
      expect(state.column_prefs.Score?.filter).toEqual({
        kind: `numeric`,
        min: 15,
        max: 25,
      })
      await set_input(min_input, ``)
      await set_input(max_input, `abc`) // neither bound left: the filter is dropped entirely
      expect(state.column_prefs.Score?.filter).toBeUndefined()
      expect(rendered_models()).toEqual([`A`, `B`, `C`])

      const [alpha_box] = (
        await open_panel(headers[2])
      ).querySelectorAll<HTMLInputElement>(`input`)
      await click(alpha_box)
      expect(state.column_prefs.Tier?.filter).toEqual({
        kind: `category`,
        values: [`beta`],
      })
      expect(rendered_models()).toEqual([`B`])
      await click(doc_query<HTMLButtonElement>(`.column-filter-clear`))
      expect(state.column_prefs.Tier?.filter).toBeUndefined()

      const text_input = (await open_panel(headers[0])).querySelector<HTMLInputElement>(
        `input[type="search"]`,
      )
      await set_input(text_input ?? undefined, `c`)
      expect(state.column_prefs.Model?.filter).toEqual({ kind: `text`, text: `c` })
      expect(rendered_models()).toEqual([`C`])

      // none of this reached the header: nothing got sorted
      expect(
        [...headers].map((header_cell) => header_cell.getAttribute(`aria-sort`)),
      ).toEqual(Array(3).fill(`none`))
    })

    it(`omits summary statistics for columns that aren't fully numeric`, async () => {
      const stats_spy = vi.spyOn(data_table_module, `compute_column_stats`)
      onTestFinished(() => stats_spy.mockRestore())
      mount_table({
        data: [
          { Model: `A`, Score: 10, Mixed: `ok` },
          { Model: `B`, Score: 20, Mixed: 2 },
        ],
        columns: plain_columns(`Model`, `Score`, `Mixed`),
        summary: [`mean`],
      })
      await tick()
      // one pass per column holding numbers (not the text-only Model): writing back the
      // resolved column_order re-scans none
      expect(stats_spy).toHaveBeenCalledTimes(2)
      expect(texts(`tfoot .summary-row td`)).toEqual([`mean`, `15`, ``]) // Mixed has a text value -> no mean
    })

    // Keyboard parity: arrows walk the active cell, Shift extends the rectangle,
    // Alt moves the column. All three were mouse-only before.
    it(`navigates, extends selection and moves columns from the keyboard`, async () => {
      const props = $state({
        data: metric_rows,
        columns: metrics,
        keyboard_cells: true,
        column_order: [] as string[],
      })
      mount_table(props as TableProps)
      await tick() // let column_order initialize; that write clears any pending selection

      // exactly one cell owns the tab stop, and it moves with the arrows
      expect(cell_at(0, 0).getAttribute(`tabindex`)).toBe(`0`)
      expect([...document.querySelectorAll(`td[tabindex="0"]`)]).toHaveLength(1)

      await fire(cell_at(0, 0), keydown(`ArrowDown`))
      expect(n_selected()).toBe(1)
      expect(cell_at(1, 0).classList.contains(`cell-selected`)).toBe(true)
      expect(cell_at(1, 0).getAttribute(`tabindex`)).toBe(`0`)
      expect(document.activeElement).toBe(cell_at(1, 0))

      await fire(cell_at(1, 0), keydown(`ArrowRight`, { shiftKey: true }))
      expect(n_selected()).toBe(2)

      await fire(cell_at(1, 1), keydown(`ArrowLeft`, { altKey: true }))
      expect(props.column_order).toEqual([`Score`, `Model`, `Tier`])
    })

    // A persisted column_order may be stale (renamed/removed columns), partial (new columns)
    // or even contain repeats; the table renders the resolved order and writes it back.
    it(`reconciles a bound column_order with the current columns`, async () => {
      const state = $state({
        data: metric_rows,
        columns: metrics,
        column_order: [`Tier`, `Tier`, `Ghost`],
      })
      mount_table(bind_props({}, state))
      await tick()
      const header_ids = () =>
        [...document.querySelectorAll<HTMLElement>(`th[data-col-id]`)].map(
          (header_cell) => header_cell.dataset.colId,
        )
      expect(state.column_order).toEqual([`Tier`, `Model`, `Score`])
      expect(header_ids()).toEqual(state.column_order)

      state.columns = metrics.filter((col) => col.label !== `Model`)
      await tick()
      expect(state.column_order).toEqual([`Tier`, `Score`])
      expect(header_ids()).toEqual([`Tier`, `Score`])

      state.data = [] // while data reloads there are no columns: the persisted order survives
      state.columns = []
      await tick()
      expect(state.column_order).toEqual([`Tier`, `Score`])
    })
  })

  describe(`Export`, () => {
    it.each([
      [
        `export_formats picks the options`,
        { export_formats: [`csv`, `tsv`] as const },
        [`CSV`, `TSV (copy)`],
      ],
      [`no export menu by default`, {}, null],
    ])(`%s`, async (_desc, props, expected) => {
      mount_sample(props)
      if (!expected) {
        expect(document.querySelector(`button[aria-label="Export"]`)).toBeNull()
        return
      }
      await open_export_menu()
      expect(texts(`menu [role=menuitem]`)).toEqual(expected)
      // an open menu keeps the hover toolbar visible
      expect(doc_query(`.control-buttons`).classList.contains(`force-visible`)).toBe(true)
    })

    // Shared helper: mount, optionally interact, trigger an export, return blob text
    async function export_table_text(
      props: Partial<TableProps>,
      before_export?: () => Promise<void>,
      format = `CSV`,
    ): Promise<string> {
      const create_url = vi.spyOn(URL, `createObjectURL`).mockReturnValue(`blob:test`)
      vi.spyOn(URL, `revokeObjectURL`).mockImplementation(() => {})
      vi.spyOn(HTMLAnchorElement.prototype, `click`).mockImplementation(() => {})
      onTestFinished(() => void vi.restoreAllMocks())
      const on_export = vi.fn()
      const export_formats = TABLE_EXPORT_FORMATS
      mount_sample({ show_column_toggle: true, export_formats, on_export, ...props })
      if (before_export) await before_export()
      await open_export_menu()
      await click(export_item(format))
      const text = await (create_url.mock.calls[0][0] as Blob).text()
      expect(on_export).toHaveBeenCalledExactlyOnceWith({
        format: { CSV: `csv`, Markdown: `md`, LaTeX: `tex`, JSON: `json` }[format],
        text,
      })
      return text
    }

    // Escaping itself is covered by the exporter unit tests; this checks the download wiring,
    // header markup stripping and numeric-column alignment for every format
    it.each<[string, RowData, string[]]>([
      [
        `CSV`,
        { Model: `say "hi", ok`, 'E<sub>f</sub> &amp; &Delta;H': 1 },
        [`Model,Ef & ΔH`, `"say ""hi"", ok",1`],
      ],
      [
        `Markdown`,
        { Model: `a\nb|c`, 'E<sub>f</sub>': 1 },
        [`| Model | Ef |`, `| :--- | ---: |`, `| a<br>b\\|c | 1 |`],
      ],
      [
        `LaTeX`,
        { Model: `Fe_2 & x^2 100%`, 'E<sub>f</sub>': 1 },
        [
          `\\begin{tabular}{lr}`,
          `  \\toprule`,
          `  Model & Ef \\\\`,
          `  \\midrule`,
          `  Fe\\_2 \\& x\\textasciicircum{}2 100\\% & 1 \\\\`,
          `  \\bottomrule`,
          `\\end{tabular}`,
        ],
      ],
      // JSON keys by column ID and keeps numbers, but string cells lose their markup
      [
        `JSON`,
        { Model: `<b>Fe</b>&amp;O`, 'E<sub>f</sub>': 1 },
        [`[`, `  {`, `    "Model": "Fe&O",`, `    "E<sub>f</sub>": 1`, `  }`, `]`],
      ],
    ])(
      `downloads %s with stripped headers and aligned numeric columns`,
      async (format, row, expected) => {
        const text = await export_table_text(
          { data: [row], columns: plain_columns(...Object.keys(row)) },
          undefined,
          format,
        )
        expect(text.split(`\n`)).toEqual(expected)
      },
    )

    it(`TSV goes to the clipboard`, async () => {
      mount_table({
        data: [{ Model: `Model\tA\nB`, Score: 1, Value: 2 }],
        columns: sample_columns,
        export_formats: [`tsv`],
      })
      await open_export_menu()
      await click(export_item(`TSV (copy)`))
      expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
        `Model\tScore\tValue\nModel A B\t1\t2`,
      )
    })

    it(`exports only the selected rows, in the current sort order`, async () => {
      const text = await export_table_text(
        {
          data: sample_data,
          columns: sample_columns,
          show_row_select: true,
          row_key: `Model`,
          sort: { column: `Value`, dir: `desc` },
        },
        async () => {
          // the first two rendered rows (C, B): data order would export them as B, C
          const checkboxes = document.querySelectorAll<HTMLInputElement>(
            `td.select-col input[type="checkbox"]`,
          )
          for (const checkbox of [...checkboxes].slice(0, 2)) await click(checkbox)
        },
      )
      const models = text.trim().split(`\n`).slice(1)
      expect(models.map((line) => line.split(`,`)[0])).toEqual([`Model C`, `Model B`])
    })

    // hosts rendering their own export UI read the same text through the controls snippet
    it(`hands the export sources to the controls snippet`, async () => {
      let sources: Record<string, () => string> = {}
      const controls = createRawSnippet((args: () => { sources: typeof sources }) => ({
        render: () => `<span class="host-controls"></span>`,
        setup: () => {
          sources = args().sources
        },
      }))
      mount_table({ data: sample_data.slice(0, 1), columns: sample_columns, controls })
      await tick()
      expect(document.querySelector(`.control-buttons .host-controls`)).not.toBeNull()
      expect(Object.keys(sources).toSorted()).toEqual([`csv`, `json`, `md`, `tex`, `tsv`])
      expect(sources.csv().split(`\n`)[0]).toBe(`Model,Score,Value`)
    })
  })

  describe(`Controls`, () => {
    it(`show_controls picks the toolbar mode and controls_style styles it`, async () => {
      const state = $state<{ show_controls: `hover` | `always` | `never` }>({
        show_controls: `always`,
      })
      mount_sample(bind_props({ search: true, controls_style: `opacity: 0.5` }, state))
      const row = doc_query(`.control-buttons`)
      expect(row.classList.contains(`always-visible`)).toBe(true)
      expect(row.style.opacity).toBe(`0.5`)
      state.show_controls = `hover`
      await tick()
      expect(row.classList.contains(`hover-visible`)).toBe(true)
      state.show_controls = `never`
      await tick()
      expect(document.querySelector(`.control-buttons`)).toBeNull()
      expect(document.querySelectorAll(`tbody tr`)).toHaveLength(sample_data.length)
    })
  })

  describe(`cell range selection and column copy`, () => {
    const pointer = (type: string, init: MouseEventInit = {}) =>
      mouse(type, { button: 0, ...init })
    const drag_cells = (
      from: [number, number],
      target: [number, number],
      init: MouseEventInit = {},
    ) => {
      cell_at(...from).dispatchEvent(pointer(`pointerdown`, init))
      cell_at(...target).dispatchEvent(pointer(`pointermove`, { buttons: 1 }))
      globalThis.window.dispatchEvent(pointer(`pointerup`))
    }
    // the copy event Cmd/Ctrl+C or Edit > Copy fires on the focused element; returns what
    // the table put on the clipboard
    const copy_cells = (target: EventTarget = document) => {
      const event = new ClipboardEvent(`copy`, { bubbles: true, cancelable: true })
      Object.assign(event, { clipboardData: new DataTransfer() })
      target.dispatchEvent(event)
      return event.clipboardData?.getData(`text/plain`)
    }
    const written_text = (): string =>
      (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]
    const mount_sample_table = async (props: Partial<TableProps> = {}) => {
      mount_sample(props)
      await tick()
    }

    it(`selects, extends, replaces, and copies cell ranges`, async () => {
      await mount_sample_table()

      drag_cells([0, 0], [1, 1])
      await tick()

      expect(n_selected()).toBe(4)
      // a focused resize handle lets the copy through
      expect(copy_cells(doc_query(`.resize-handle`))).toBe(`Model A\t0.95\nModel B\t0.85`)

      drag_cells([0, 0], [0, 0])
      drag_cells([2, 2], [2, 2], { shiftKey: true })
      await tick()

      expect(n_selected()).toBe(2)
      expect(copy_cells()).toBe(`Model A\n300`)

      drag_cells([2, 1], [2, 1])
      await tick()

      expect(n_selected()).toBe(1)
      expect(cell_at(2, 1).classList.contains(`cell-selected`)).toBe(true)
    })

    it.each([`hide`, `reorder`, `sort`, `Escape`, `outside`] as const)(
      `clears a cell selection on %s`,
      async (action) => {
        const state = $state({
          hidden_columns: [] as string[],
          column_order: [] as string[],
        })
        mount_sample(state)
        await tick()
        drag_cells([0, 0], [1, 1])
        cell_at(1, 1).dispatchEvent(pointer(`click`)) // consume the post-drag click guard
        await tick()
        expect(n_selected()).toBe(4)
        if (action === `hide`) state.hidden_columns = [`Value`]
        else if (action === `reorder`) state.column_order = [`Score`, `Model`, `Value`]
        else if (action === `sort`) doc_query(`th[data-col-id="Model"]`).click()
        // from a focused resize handle, which must let it bubble to the window
        else if (action === `Escape`)
          doc_query(`.resize-handle`).dispatchEvent(keydown(`Escape`))
        else document.body.dispatchEvent(pointer(`pointerdown`))
        await tick()
        expect(n_selected()).toBe(0)
      },
    )

    it(`suppresses the row click that follows a cell drag`, async () => {
      const on_row_click = vi.fn()
      await mount_sample_table({ on_row_click })

      // drag across cells -> the click on release must not fire the row action
      drag_cells([0, 0], [1, 1])
      cell_at(1, 1).dispatchEvent(pointer(`click`))
      expect(on_row_click).not.toHaveBeenCalled()

      // plain click (pointer never moved) still fires the row action
      drag_cells([0, 0], [0, 0])
      cell_at(0, 0).dispatchEvent(pointer(`click`))
      expect(on_row_click).toHaveBeenCalledTimes(1)
    })

    // A cell's own tab and newline would split it into extra TSV cells and rows
    it(`right-click copy column copies all filtered rows across pages`, async () => {
      const data = sample_data.with(2, { ...sample_data[2], Model: `Model\tC\nx` })
      await mount_sample_table({ data, pagination: { page_size: 2 } })

      await open_context_menu(cell_at(0, 0))
      const copy_option = menu_item(`Copy column`)
      expect(copy_option?.textContent).toContain(`3 values`)
      await click(copy_option)

      // all rows, not just the 2 on the current page
      expect(written_text()).toBe(`Model A\nModel B\nModel C x`)
      expect(document.querySelector(`.action-menu`)).toBeNull()
      await click(doc_query(`button[aria-label="Next page"]`))
      drag_cells([2, 0], [2, 1])
      expect(copy_cells()).toBe(`Model C x\t0.75`)
    })

    it(`context menu on headers offers copy for non-heatmap columns`, async () => {
      await mount_sample_table()

      await open_context_menu(document.querySelector(`th`))
      expect(menu_item(`Copy column`)).toBeDefined()

      // right-clicking another column while the menu is open must retarget it, not
      // leave it dismissed: the pointerdown of that right-click is an outside press
      const score_header = document.querySelectorAll(`th`)[1]
      score_header?.dispatchEvent(pointer(`pointerdown`, { button: 2 }))
      score_header?.dispatchEvent(pointer(`contextmenu`, { button: 2 }))
      await tick()
      expect(document.querySelector(`.action-menu`)).not.toBeNull()
    })

    // higher/lower-is-better only means something for a column holding numbers
    it.each([
      [`hidden on a text column`, 0, false],
      [`offered on a numeric column`, 1, true],
    ])(`better-direction toggle %s`, async (_desc, th_idx, shown) => {
      mount_table({
        data: sample_data,
        columns: plain_columns(`Model`, `Value`),
        allow_better_toggle: true,
      })
      await tick()

      await open_context_menu(document.querySelectorAll(`th`)[th_idx])
      const menu_text = document.querySelector(`.action-menu`)?.textContent ?? ``
      expect(/Higher is better|Lower is better/.test(menu_text)).toBe(shown)
    })
  })

  describe(`Infinite scroll (virtualized rows)`, () => {
    const row_height_px = 33
    const overscan = 10
    const min_window = 60
    // happy-dom has no layout: clientHeight/offsetHeight are 0, so the window
    // is driven by min_window and the row-height estimate
    const many_rows = Array.from({ length: 200 }, (_, idx) => ({
      Model: `Model ${idx}`,
      Score: idx,
    }))
    const two_cols = plain_columns(`Model`, `Score`)
    const rendered_rows = () =>
      document.querySelectorAll(`tbody tr:not(.virtual-spacer):not(.empty-row)`)
    const spacers = () => [
      ...document.querySelectorAll<HTMLTableRowElement>(`tr.virtual-spacer`),
    ]
    const scroll_to = async (scroll_top: number): Promise<HTMLDivElement> => {
      const scroller = doc_query<HTMLDivElement>(`.table-scroll`)
      scroller.scrollTop = scroll_top
      await fire(scroller, new Event(`scroll`))
      return scroller
    }

    const mount_virtual = (props: Partial<TableProps> = {}) =>
      mount_table(
        bind_props({ data: many_rows, columns: two_cols, virtual: true }, props),
      )

    it.each<[string, Partial<TableProps>, number, boolean]>([
      [`virtual={true} caps rendered rows`, { virtual: true }, min_window, true],
      [`custom min_window bounds the window`, { virtual: { min_window: 25 } }, 25, true],
      [`virtualization is off by default`, {}, many_rows.length, false],
      [
        `pagination disables virtualization`,
        { virtual: true, pagination: { page_size: 10 } },
        10,
        false,
      ],
    ])(`%s`, (_desc, props, n_rendered, virtualized) => {
      mount_table({ data: many_rows, columns: two_cols, ...props })
      expect(rendered_rows()).toHaveLength(n_rendered)
      // the window starts at the top: one bottom spacer and a shown-of-total count
      expect(spacers().map((spacer) => spacer.style.height)).toEqual(
        virtualized ? [`${(many_rows.length - n_rendered) * row_height_px}px`] : [],
      )
      expect(document.querySelector(`.row-count-info`)?.textContent?.trim()).toBe(
        virtualized ? `${n_rendered} of ${many_rows.length} rows` : undefined,
      )
      expect(document.querySelector(`.pagination`) !== null).toBe(`pagination` in props)
    })

    // a row a linked view names (an atom hovered in 3D) outside the window is scrolled to, and
    // followed when new data (the next frame) moves it while it stays named
    it(`highlighted_row_id scrolls an unrendered row into the window`, async () => {
      const props = $state<TableProps>({
        data: many_rows,
        columns: two_cols,
        virtual: true,
        row_key: `Score`,
        highlighted_row_id: 150,
      })
      mount_table(props)
      await tick()
      const scroller = doc_query<HTMLDivElement>(`.table-scroll`)
      // centred in the viewport by the row-height estimate
      expect(scroller.scrollTop).toBe(150 * row_height_px - scroller.clientHeight / 2)
      expect(doc_query(`tbody tr.hovered`).textContent).toContain(`Model 150`)
      props.data = many_rows.toReversed()
      await tick()
      expect(scroller.scrollTop).toBe(49 * row_height_px - scroller.clientHeight / 2)
    })

    it(`moves the window without forcing layout and preserves absolute row numbers`, async () => {
      const rect_spy = vi.spyOn(Element.prototype, `getBoundingClientRect`)
      onTestFinished(() => rect_spy.mockRestore())
      const row_key = vi.fn((row: RowData) => Number(row.Score))
      mount_virtual({ show_row_numbers: true, keyboard_cells: true, row_key })
      await tick()
      rect_spy.mockClear()
      const scroller = await scroll_to(30 * row_height_px)
      expect(rect_spy).not.toHaveBeenCalled()
      // a scroll within one row keeps the window, so no rendered row is re-keyed
      row_key.mockClear()
      await scroll_to(30 * row_height_px + 5)
      expect(row_key).not.toHaveBeenCalled()
      await scroll_to(30 * row_height_px)

      const start = 30 - overscan
      const end = start + min_window
      expect(rendered_rows()).toHaveLength(min_window)
      expect(spacers()).toHaveLength(2)
      expect(spacers()[0].style.height).toBe(`${start * row_height_px}px`)
      expect(spacers()[1].style.height).toBe(
        `${(many_rows.length - end) * row_height_px}px`,
      )
      expect(rendered_rows()[0].querySelector(`.row-num-col`)?.textContent?.trim()).toBe(
        `21`,
      )
      expect(col_values(`Model`)[0]).toBe(`Model 20`)

      // the tab stop moves one row down: only those two cells re-apply their attributes
      const cells = [...document.querySelectorAll(`tbody td[data-col-idx]`)]
      const updates = count_attribute_updates(cells)
      await fire(cell_at(start, 0), keydown(`ArrowDown`))
      expect(document.activeElement).toBe(cell_at(start + 1, 0))
      expect(updates.filter(Boolean)).toHaveLength(2)

      await fire(cell_at(start, 0), keydown(`ArrowRight`))
      expect(scroller.scrollTop).toBe(30 * row_height_px)

      await fire(cell_at(end - 1, 0), keydown(`ArrowDown`))
      expect(scroller.scrollTop).toBe(end * row_height_px)
      expect(document.activeElement).toBe(
        document.querySelector(`td[data-row-idx="${end}"][data-col-idx="0"]`),
      )
    })

    it(`measures hidden rows on resize without scroll feedback`, async () => {
      let measurement_reads = 0
      let rows_have_layout = false
      const offset_height_spy = vi
        .spyOn(HTMLElement.prototype, `offsetHeight`, `get`)
        .mockImplementation(function (this: HTMLElement) {
          if (!(this instanceof HTMLTableRowElement)) return 0
          if (++measurement_reads > min_window * 5)
            throw new Error(`row-height measurement loop`)
          if (!rows_have_layout) return 0
          const row_idx = Number(
            this.querySelector<HTMLElement>(`[data-row-idx]`)?.dataset.rowIdx,
          )
          return row_idx < 90 ? 20 : 60
        })
      onTestFinished(() => offset_height_spy.mockRestore())
      const state = $state({ data: [] as RowData[] })
      mount_virtual(state)
      await tick()
      expect(measurement_reads).toBe(0)

      state.data = many_rows
      await tick()

      for (const scroll_top of [3000, 0, 3000, 0]) {
        await scroll_to(scroll_top)
        expect(rendered_rows().length).toBeGreaterThan(0)
      }
      expect(measurement_reads).toBe(min_window)

      const scroller = doc_query<HTMLDivElement>(`.table-scroll`)
      rows_have_layout = true
      Object.defineProperty(scroller, `clientWidth`, { value: 700, configurable: true })
      trigger_resize_observer(scroller)
      await tick()
      expect(measurement_reads).toBe(min_window * 2)

      state.data = [...many_rows, { Model: `Model 201`, Score: 0.5 }]
      await tick()
      expect(measurement_reads).toBe(min_window * 2)
      expect(spacers()[0].style.height).toBe(`${(state.data.length - min_window) * 20}px`)

      Object.defineProperty(scroller, `clientWidth`, { value: 600, configurable: true })
      trigger_resize_observer(scroller)
      await tick()
      expect(measurement_reads).toBe(min_window * 3)
    })

    // Clickable rows step by absolute index, not DOM sibling: the element after the last
    // rendered row is a spacer (or, paged, nothing), so keyboard users were stranded at the
    // window or page edge.
    it.each([`virtual`, `paged`])(
      `arrow keys walk clickable rows across the %s window boundary`,
      async (mode) => {
        if (mode === `virtual`) mount_virtual({ on_row_click: () => {} })
        else {
          mount_table({
            data: many_rows,
            columns: two_cols,
            pagination: { page_size: min_window },
            on_row_click: () => {},
          })
        }
        await tick() // let bind:this resolve the scroll container
        const scroller = doc_query<HTMLDivElement>(`.table-scroll`)
        const row_at = (abs_idx: number) =>
          document.querySelector(`td[data-row-idx="${abs_idx}"]`)?.closest(`tr`)

        const last_rendered = row_at(min_window - 1)
        assert(last_rendered)
        await fire(last_rendered, keydown(`ArrowDown`))

        if (mode === `virtual`) expect(scroller.scrollTop).toBeGreaterThan(0)
        else expect(doc_query<HTMLInputElement>(`.page-input`).value).toBe(`2`)
        expect(document.activeElement).toBe(row_at(min_window))

        await fire(row_at(min_window), keydown(`ArrowUp`))
        expect(document.activeElement).toBe(row_at(min_window - 1))
      },
    )

    it(`clamps the rendered window when data shrinks below the scroll position`, async () => {
      const state = $state({ data: many_rows })
      mount_virtual(state)
      await scroll_to(150 * row_height_px) // deep into the 200 rows
      expect(rendered_rows().length).toBeGreaterThan(0)

      // happy-dom never clamps scrollTop, so the stale offset (150 rows) now
      // points far past the 20-row content. The window must clamp to the data:
      // all 20 rows fit the 600px viewport, so everything renders, no spacers.
      // (Unclamped, the window would start at row 140 and render zero rows.)
      state.data = many_rows.slice(0, 20)
      await tick()
      expect(rendered_rows()).toHaveLength(20)
      expect(spacers()).toHaveLength(0)
    })

    // A narrowed result set starts at its top: keeping the old offset drops the user past
    // the end of the matches (row 140 of 111), so they land on the tail, not the first hit.
    it(`returns to the top of the results when the search query changes`, async () => {
      fake_search_timers()
      const state = $state({ search_query: `` })
      mount_virtual(state)
      const scroller = await scroll_to(150 * row_height_px)
      expect(spacers()[0].style.height).toBe(`${(150 - overscan) * row_height_px}px`)

      await settle_search(state, `Model 1`) // matches 111 of the 200 rows
      expect(scroller.scrollTop).toBe(0)
      expect(spacers()).toHaveLength(1) // bottom only, so the window starts at row 0
    })
  })
})
