import {
  CATEGORY_LIMIT,
  CellSelection,
  cell_range_select,
  compile_filter,
  filter_panel,
  filter_rows,
  table_to_json,
  table_to_text,
  with_category_toggled,
  with_numeric_bound,
  type ColumnFilterValue,
  type FilterPanelOptions,
  type TableMatrix,
} from '#lib/table/index.ts'
import * as lib from '#lib'
import ColumnFilter from '#lib/table/ColumnFilter.svelte'
import ColumnPicker from '#lib/table/ColumnPicker.svelte'
import { tick } from 'svelte'
import { describe, expect, test, vi } from 'vite-plus/test'
import { create_element, press_key } from './index'

// rectangle from (start_row, start_col) to (end_row, end_col)
const rect = (
  start_row: number,
  start_col: number,
  end_row: number,
  end_col: number,
) => ({
  start: { row: start_row, col: start_col },
  end: { row: end_row, col: end_col },
})

describe(`CellSelection`, () => {
  // Selected cells of a 10x10 grid as "row:col", probed through has()
  const sorted_keys = (selection: CellSelection) =>
    Array.from({ length: 100 }, (_unused_value, idx) => [Math.floor(idx / 10), idx % 10])
      .filter(([row, col]) => selection.has(row, col))
      .map(([row, col]) => `${row}:${col}`)

  test(`drag selects a rectangle in either direction, additive drags stack`, () => {
    const selection = new CellSelection()
    selection.start_drag({ row: 2, col: 1 }, false)
    expect(selection.dragging).toBe(true)
    expect(selection.extend_drag({ row: 2, col: 1 })).toBe(false) // same cell: no change
    expect(selection.extend_drag({ row: 0, col: 0 })).toBe(true) // dragging up-left
    expect(sorted_keys(selection)).toEqual([`0:0`, `0:1`, `1:0`, `1:1`, `2:0`, `2:1`])
    expect(selection.end_drag()).toBe(true) // crossed cells -> caller swallows the click

    selection.start_drag({ row: 5, col: 5 }, true)
    expect(selection.end_drag()).toBe(false) // a plain click selects one cell
    expect(selection.size).toBe(7)
    expect(selection.has(5, 5)).toBe(true)

    selection.start_drag({ row: 9, col: 9 }, false) // non-additive replaces everything
    expect(sorted_keys(selection)).toEqual([`9:9`])
    selection.clear()
    expect(selection.size).toBe(0)
    // clearing an empty selection changes nothing, so no cell's has() re-runs
    const { bounds } = selection
    selection.clear()
    expect(selection.bounds).toBe(bounds)
    expect(selection.end_drag()).toBe(false)
  })

  // size counts what a copy emits: overlapping cells once per rectangle, and a select-all on a
  // huge table is measured from the rectangles instead of enumerating every cell
  test.each([
    {
      rects: [
        [0, 0, 2, 2],
        [1, 1, 3, 3],
      ],
      size: 18,
    },
    {
      rects: [
        [0, 0, 4, 0],
        [2, 0, 2, 0],
        [0, 2, 1, 3],
      ],
      size: 10,
    },
    {
      rects: [
        [3, 3, 0, 0],
        [0, 5, 3, 6],
        [1, 4, 2, 5],
      ],
      size: 28,
    },
    {
      rects: [
        [0, 0, 9, 9],
        [5, 5, 5, 5],
      ],
      size: 101,
    },
    { rects: [[0, 0, 1e8 - 1, 9]], size: 1e9 },
  ])(`size of $rects is $size`, ({ rects, size }) => {
    const selection = new CellSelection()
    selection.rects = rects.map(([start_row, start_col, end_row, end_col]) =>
      rect(start_row, start_col, end_row, end_col),
    )
    expect(selection.size).toBe(size)
  })

  test(`keyboard steps replace the selection, Shift grows it from the anchor`, () => {
    const selection = new CellSelection()
    selection.step({ row: 0, col: 0 }, { row: 1, col: 0 }, false)
    expect(sorted_keys(selection)).toEqual([`1:0`])
    selection.step({ row: 1, col: 0 }, { row: 3, col: 0 }, true)
    selection.step({ row: 3, col: 0 }, { row: 3, col: 1 }, true)
    expect(sorted_keys(selection)).toEqual([`1:0`, `1:1`, `2:0`, `2:1`, `3:0`, `3:1`])
    // without a prior rectangle, Shift anchors at the cell being left
    const fresh = new CellSelection()
    const cursor = { row: 4, col: 4 }
    fresh.step(cursor, { row: 4, col: 5 }, true)
    expect(sorted_keys(fresh)).toEqual([`4:4`, `4:5`])
    cursor.row = 9 // the host moving its cursor must not drag the stored anchor along
    expect(sorted_keys(fresh)).toEqual([`4:4`, `4:5`])
  })

  test(`serialises rectangles as TSV blocks`, () => {
    const selection = new CellSelection()
    selection.rects = [rect(1, 1, 0, 0), rect(5, 0, 5, 1)] // first drawn up-left
    expect(selection.to_tsv((row, col) => `r${row}c${col}`)).toBe(
      `r0c0\tr0c1\nr1c0\tr1c1\nr5c0\tr5c1`,
    )
    // tabs and newlines inside a cell would split it, so they flatten to spaces
    selection.rects = [rect(0, 0, 0, 0)]
    expect(selection.to_tsv(() => `a\tb\r\nc`)).toBe(`a b c`)
    // a selection the host forgot to clear copies only cells still in range
    const rows = [[`a`, `b`]]
    selection.rects = [rect(0, 0, 3, 2)]
    expect(selection.to_tsv((row, col) => rows[row]?.[col])).toBe(`a\tb`)
  })
})

describe(`cell_range_select`, () => {
  // 3x3 grid of data-row/data-col cells inside an attached container
  const make_grid = () => {
    const grid = create_element()
    grid.innerHTML = Array.from(
      { length: 9 },
      (_unused, idx) =>
        `<span data-row="${Math.floor(idx / 3)}" data-col="${idx % 3}">${idx}</span>`,
    ).join(``)
    const cell = (row: number, col: number) =>
      grid.querySelector<HTMLElement>(`[data-row="${row}"][data-col="${col}"]`)
    return { grid, cell }
  }
  const pointer = (target: Element | null | undefined, type: string, init = {}) =>
    target?.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, ...init }))

  test(`drags select cells, swallow the release click, and outside presses clear`, async () => {
    const { grid, cell } = make_grid()
    const selection = new CellSelection()
    const detach = cell_range_select(selection)(grid)
    await tick() // svelte/events attaches pointer listeners a microtask later
    const on_click = vi.fn()
    grid.addEventListener(`click`, on_click)
    const drag = (from: Element | null, to: Element | null, init = {}) => {
      pointer(from, `pointerdown`, init)
      pointer(to, `pointermove`, { buttons: 1 })
      pointer(to, `pointerup`)
    }

    drag(cell(0, 0), cell(1, 1))
    expect(selection.size).toBe(4)
    const click = new MouseEvent(`click`, { bubbles: true, cancelable: true })
    cell(1, 1)?.dispatchEvent(click)
    expect(on_click).not.toHaveBeenCalled() // the click ending a drag is swallowed
    expect(click.defaultPrevented).toBe(true) // so is a link's navigation
    cell(1, 1)?.click()
    expect(on_click).toHaveBeenCalledOnce()

    // a drag released without a click must not swallow the next press's click
    drag(cell(0, 0), cell(0, 1))
    pointer(grid, `pointerdown`) // inside the node but off the cells: selection kept
    expect(selection.size).toBe(2)
    cell(0, 0)?.click()
    expect(on_click).toHaveBeenCalledTimes(2)

    drag(cell(2, 2), cell(2, 2), { shiftKey: true }) // additive
    expect(selection.size).toBe(3)

    pointer(document.body, `pointerdown`)
    expect(selection.size).toBe(0)
    detach()
    pointer(cell(0, 0), `pointerdown`)
    expect(selection.size).toBe(0) // listeners gone after teardown
  })

  // window listeners capture: controls that stop pointerdown (popovers, ColumnFilter) must
  // neither inherit a stale click guard nor hide an outside press
  test(`presses on controls that stop propagation still reset the guard and clear`, async () => {
    const { grid, cell } = make_grid()
    const stopper = (parent: HTMLElement) => {
      const wrapper = document.createElement(`span`)
      wrapper.addEventListener(`pointerdown`, (event) => event.stopPropagation())
      wrapper.addEventListener(`pointerup`, (event) => event.stopPropagation())
      const button = document.createElement(`button`)
      wrapper.append(button)
      parent.append(wrapper)
      return button
    }
    const [inner_btn, outer_btn] = [stopper(grid), stopper(document.body)]
    const selection = new CellSelection()
    cell_range_select(selection)(grid)
    await tick()
    const on_click = vi.fn()
    inner_btn.addEventListener(`click`, on_click)

    pointer(cell(0, 0), `pointerdown`)
    pointer(cell(0, 1), `pointermove`, { buttons: 1 })
    pointer(document.body, `pointerup`) // released outside: no click reaches the node
    pointer(inner_btn, `pointerdown`)
    inner_btn.click()
    expect(on_click).toHaveBeenCalledOnce() // the funnel opens
    expect(selection.size).toBe(2)

    pointer(cell(0, 0), `pointerdown`)
    pointer(cell(0, 1), `pointermove`, { buttons: 1 })
    pointer(inner_btn, `pointerup`) // a release that stops propagation still ends the drag
    expect(selection.dragging).toBe(false)
    pointer(outer_btn, `pointerdown`)
    expect(selection.size).toBe(0)
  })

  test(`cancelled pointers end the drag, buttonless moves and touches don't select`, async () => {
    const { grid, cell } = make_grid()
    const selection = new CellSelection()
    cell_range_select(selection)(grid)
    await tick()
    pointer(cell(0, 0), `pointerdown`, { pointerType: `pen` })
    pointer(cell(0, 0), `pointercancel`, { pointerType: `pen` })
    expect(selection.dragging).toBe(false)
    pointer(cell(2, 2), `pointermove`, { buttons: 1 })
    expect(selection.size).toBe(1)

    pointer(cell(0, 0), `pointerdown`)
    pointer(cell(2, 2), `pointermove`) // button released where the window never saw it
    expect([selection.size, selection.dragging]).toEqual([1, false])

    // a touch scroll starting on a cell keeps the selection
    pointer(cell(1, 1), `pointerdown`, { pointerType: `touch` })
    pointer(cell(2, 1), `pointermove`, { pointerType: `touch`, buttons: 1 })
    expect(selection.has(0, 0)).toBe(true)
    expect([selection.size, selection.dragging]).toEqual([1, false])
  })

  describe(`copy`, () => {
    // a copy event as Cmd/Ctrl+C or Edit > Copy fires it, on the focused element
    const copy = (target: EventTarget = document) => {
      const event = new ClipboardEvent(`copy`, { bubbles: true, cancelable: true })
      Object.assign(event, { clipboardData: new DataTransfer() })
      target.dispatchEvent(event)
      return event
    }
    const setup = async (options: Parameters<typeof cell_range_select>[1] = {}) => {
      const { grid, cell } = make_grid()
      const selection = new CellSelection()
      cell_range_select(selection, options)(grid)
      await tick()
      pointer(cell(0, 1), `pointerdown`)
      pointer(cell(1, 2), `pointermove`, { buttons: 1 })
      pointer(cell(1, 2), `pointerup`)
      return { grid, selection }
    }
    const cell_text = (row: number, col: number) => `${row}${col}`

    test(`puts the selection on the clipboard as TSV, Escape clears it`, async () => {
      const on_copy = vi.fn()
      const { selection } = await setup({ cell_text, on_copy })
      const event = copy()
      expect(event.defaultPrevented).toBe(true)
      expect(event.clipboardData?.getData(`text/plain`)).toBe(`01\t02\n11\t12`)
      expect(on_copy).toHaveBeenCalledExactlyOnceWith(`01\t02\n11\t12`)

      press_key(document, `Escape`)
      expect(selection.size).toBe(0)
      expect(copy().defaultPrevented).toBe(false)
    })

    test.each([
      [`an input`, `<input value="x" />`],
      [`a contenteditable`, `<div contenteditable="true">x</div>`],
    ])(`leaves copies from %s native`, async (_desc, markup) => {
      const on_copy = vi.fn()
      await setup({ cell_text, on_copy })
      const field = create_element()
      field.innerHTML = markup
      const event = copy(field.firstElementChild ?? field)
      expect(event.defaultPrevented).toBe(false)
      expect(event.clipboardData?.getData(`text/plain`)).toBe(``)
      expect(on_copy).not.toHaveBeenCalled()
    })

    test(`leaves copy native for a text selection or without cell_text`, async () => {
      const { grid } = await setup({ cell_text })
      getSelection()?.selectAllChildren(grid)
      expect(copy().defaultPrevented).toBe(false)
      getSelection()?.removeAllRanges()
      expect(copy().defaultPrevented).toBe(true)

      await setup() // no cell_text
      const event = copy()
      expect(event.defaultPrevented).toBe(false)
    })
  })

  test(`ignores presses on interactive content and cells outside the node`, async () => {
    const { grid, cell } = make_grid()
    const button = document.createElement(`button`)
    cell(0, 0)?.append(button)
    const outside = create_element(`span`)
    Object.assign(outside.dataset, { row: `0`, col: `0` })
    const selection = new CellSelection()
    cell_range_select(selection)(grid)
    await tick()
    pointer(button, `pointerdown`)
    pointer(outside, `pointerdown`)
    expect(selection.size).toBe(0)
    pointer(cell(0, 0), `pointerdown`)
    expect(selection.size).toBe(1) // the cell itself still selects
  })
})

describe(`filters`, () => {
  test.each<[unknown, ColumnFilterValue, boolean]>([
    [`1.5`, { kind: `numeric`, min: 1, max: 2 }, true],
    [3, { kind: `numeric`, min: 1, max: 2 }, false],
    [`abc`, { kind: `numeric`, min: 0 }, false],
    [`0x1f`, { kind: `numeric`, min: 0 }, false], // hex is an ID, not 31
    [`1e400`, { kind: `numeric`, min: 0 }, false], // overflows to Infinity, no number
    [``, { kind: `numeric`, max: 1 }, false], // blank is missing, not 0
    [5, { kind: `numeric`, max: 5 }, true],
    [`oxide`, { kind: `category`, values: [`oxide`] }, true],
    // missing cells never match a category; real blanks do
    [null, { kind: `category`, values: [``] }, false],
    [NaN, { kind: `category`, values: [``, `NaN`] }, false],
    [` `, { kind: `category`, values: [``] }, true],
    [`Fe2O3`, { kind: `text`, text: `e2o` }, true],
    [`Fe2O3`, { kind: `text`, text: `cu` }, false],
    // default cell text: dates as ISO strings, other objects as JSON
    [new Date(Date.UTC(2024, 0, 2)), { kind: `text`, text: `2024-01-02t` }, true],
    [{ el: `Fe` }, { kind: `text`, text: `"el":"fe"` }, true],
  ])(`cell %j against %j: %j`, (val, filter, expected) => {
    expect(compile_filter(filter)(val)).toBe(expected)
  })

  test(`compile_filter reads cells through custom readers`, () => {
    const to_text = (val: unknown) => String(val).replaceAll(/<[^>]+>/g, ``)
    const to_number = (val: unknown) => Number(String(val).split(` `)[0])
    const oxide = { kind: `category` as const, values: [`oxide`] }
    expect(compile_filter(oxide)(`<i>oxide</i>`)).toBe(false)
    expect(compile_filter(oxide, { to_text })(`<i>oxide</i>`)).toBe(true)
    expect(compile_filter({ kind: `numeric`, min: 1 }, { to_number })(`1.5 ± 0.1`)).toBe(
      true,
    )
    // a custom is_missing also keeps sentinel cells out of category matches
    const is_missing = (val: unknown) => val === `n/a`
    expect(
      compile_filter({ kind: `category`, values: [`n/a`] }, { is_missing })(`n/a`),
    ).toBe(false)
  })

  const tags = Array.from({ length: CATEGORY_LIMIT + 1 }, (_unused, idx) => `t${idx}`)
  test.each<[string, unknown[], FilterPanelOptions, ReturnType<typeof filter_panel>]>([
    // distinct, natural order (t2 before t10), missing values skipped
    [
      `few strings`,
      [`t10`, `t2`, null, `t2`],
      {},
      { kind: `category`, options: [`t2`, `t10`] },
    ],
    [`too many strings`, tags, {}, { kind: `text`, options: [] }],
    [
      `numbers`,
      [3, `1.5`, NaN, 2],
      {},
      { kind: `numeric`, options: [`1.5`, `2`, `3`], extent: { min: 1.5, max: 3 } },
    ],
    [
      `numeric override`,
      [`a`, `b`],
      { numeric: true },
      { kind: `numeric`, options: [`a`, `b`] },
    ],
    [
      `text override, extent still read`,
      [1, `x`, -2],
      { kind: `text` },
      { kind: `text`, options: [`-2`, `1`, `x`], extent: { min: -2, max: 1 } },
    ],
    [`no values`, [], {}, { kind: `text`, options: [] }],
    // blanks are gaps in a numeric column, still listed as blank
    [
      `numbers with blanks`,
      [1, ``, 2.5, ` `, 3],
      {},
      { kind: `numeric`, options: [`1`, `2.5`, `3`, ``], extent: { min: 1, max: 3 } },
    ],
    // numbers by value (decimals, negatives), then text in natural order
    [
      `mixed numbers and text`,
      [0.5, 0.25, `N/A`, 1.75, -2, -10, 0.125, `n10`, `n9`],
      {},
      {
        kind: `category`,
        options: [`-10`, `-2`, `0.125`, `0.25`, `0.5`, `1.75`, `N/A`, `n9`, `n10`],
        extent: { min: -10, max: 1.75 },
      },
    ],
    [`custom cap`, [`a`, `b`, `c`], { category_limit: 2 }, { kind: `text`, options: [] }],
  ])(`filter_panel: %s`, (_desc, values, options, expected) => {
    expect(filter_panel(values, options)).toEqual(expected)
  })

  test(`an explicit category column lists every value however many there are`, () => {
    expect(filter_panel(tags, { kind: `category` }).options).toHaveLength(
      CATEGORY_LIMIT + 1,
    )
    // past the cap the scan still settles numeric detection on later values
    const many_numbers = [...Array.from({ length: 50 }, (_unused, idx) => idx), `x`]
    expect(filter_panel(many_numbers).kind).toBe(`text`)
  })

  test(`collapses no-op filters to undefined when editing bounds and checklists`, () => {
    const min_only = with_numeric_bound(undefined, `min`, ` 1.5 `)
    expect(min_only).toEqual({ kind: `numeric`, min: 1.5 })
    expect(with_numeric_bound(min_only, `max`, `abc`)).toEqual({
      kind: `numeric`,
      min: 1.5,
    })
    expect(with_numeric_bound(min_only, `min`, ``)).toBeUndefined()
    // a text filter on the same column is replaced, not merged
    expect(with_numeric_bound({ kind: `text`, text: `x` }, `max`, `2`)).toEqual({
      kind: `numeric`,
      max: 2,
    })

    const options = [`a`, `b`, `c`]
    const without_b = with_category_toggled(undefined, `b`, options)
    expect(without_b).toEqual({ kind: `category`, values: [`a`, `c`] })
    expect(with_category_toggled(without_b, `a`, options)).toEqual({
      kind: `category`,
      values: [`c`],
    })
    expect(with_category_toggled(without_b, `b`, options)).toBeUndefined() // all allowed again
    // a value no row holds any more drops out instead of keeping the filter active
    const stale = { kind: `category` as const, values: [`a`, `c`, `gone`] }
    expect(with_category_toggled(stale, `b`, options)).toBeUndefined()
  })

  test(`filter_rows compiles each filter once, not per row`, () => {
    const rows = Array.from({ length: 20 }, (_unused, idx) => ({
      name: `Row ${idx}`,
      tag: `t${idx % 5}`,
    }))
    const read_text = vi.fn(() => `ROW 1`)
    const values = [`t1`, `t2`]
    const includes = vi.spyOn(values, `includes`)
    const kept = filter_rows(rows, {
      name: {
        kind: `text`,
        get text() {
          return read_text()
        },
      },
      tag: { kind: `category`, values },
    })
    expect(kept.map((row) => row.name).join(`,`)).toBe(
      `Row 1,Row 11,Row 12,Row 16,Row 17`,
    )
    expect(read_text).toHaveBeenCalledOnce()
    expect(includes).not.toHaveBeenCalled()
  })

  test(`filter_rows applies every active filter and skips undefined ones`, () => {
    const rows = [
      { name: `A`, score: 10, tier: `alpha` },
      { name: `B`, score: 20, tier: `beta` },
      { name: `C`, score: 30, tier: `alpha` },
    ]
    const names = (filters: Record<string, ColumnFilterValue | undefined>) =>
      filter_rows(rows, filters).map((row) => row.name)
    expect(names({})).toEqual([`A`, `B`, `C`])
    expect(names({ score: { kind: `numeric`, min: 15 }, tier: undefined })).toEqual([
      `B`,
      `C`,
    ])
    expect(
      names({ score: { kind: `numeric`, min: 15 }, tier: { kind: `text`, text: `alp` } }),
    ).toEqual([`C`])
    expect(filter_rows(rows, {})).not.toBe(rows) // always a fresh array
  })
})

describe(`table exporters`, () => {
  const matrix: TableMatrix = {
    headers: [`Name`, `a|b`, `Val`],
    rows: [
      [`x, "q"`, `multi\nline`, `1`],
      [`50% & $3_{}`, `^~\\`, `2`],
      [`cr\rline`, ``, `3`], // a bare CR is a record separator to most readers: quoted too
    ],
    numeric: [false, false, true],
  }

  test(`emits CSV with RFC 4180 quoting and TSV with flattened newlines`, () => {
    const csv = `Name,a|b,Val\n"x, ""q""","multi\nline",1\n50% & $3_{},^~\\,2\n"cr\rline",,3`
    expect(table_to_text(matrix, `csv`)).toBe(csv)
    expect(table_to_text(matrix, `tsv`).split(`\n`).slice(1)).toEqual([
      `x, "q"\tmulti line\t1`,
      `50% & $3_{}\t^~\\\t2`,
      `cr line\t\t3`,
    ])
  })

  test(`exports JSON keyed by stable IDs despite repeated or renamed headers`, () => {
    const when = new Date(Date.UTC(2024, 0, 2))
    const rows = [{ 'n<sub>val</sub>': 1, Name: `<b>Fe</b>`, When: when, Skip: 5 }]
    const columns = [
      { id: `valence`, label: `Value`, key: `n<sub>val</sub>` },
      { id: `Name`, label: `Value` }, // key defaults to the id
      { id: `When`, label: `Value`, key: `When` },
    ]
    expect(JSON.parse(table_to_json(rows, columns))).toEqual([
      { valence: 1, Name: `<b>Fe</b>`, When: when.toISOString() },
    ])
    columns[0].label = `Renamed`
    expect(JSON.parse(table_to_json(rows, columns))[0].valence).toBe(1)
    // to_value maps each cell first, here stripping markup from strings
    const strip = (val: unknown) =>
      typeof val === `string` ? val.replaceAll(/<[^>]+>/g, ``) : val
    expect(JSON.parse(table_to_json(rows, columns, strip))[0].Name).toBe(`Fe`)
  })

  test(`escapes markdown backslashes, pipes and newlines and right-aligns numeric columns`, () => {
    const [header, align, row_1, row_2, row_3] = table_to_text(matrix, `md`).split(`\n`)
    expect(header).toBe(`| Name | a\\|b | Val |`)
    expect(align).toBe(`| :--- | :--- | ---: |`)
    expect(row_1).toBe(`| x, "q" | multi<br>line | 1 |`)
    expect(row_2).toBe(`| 50% & $3_{} | ^~\\\\ | 2 |`)
    expect(row_3).toBe(`| cr<br>line |  | 3 |`) // a bare CR ends a GFM line too
    // decoded escaped markup stays text: `<br>` must not become a live line break
    const markdown = table_to_text({ headers: [`<br> &lt;`], rows: [] }, `md`)
    expect(markdown.split(`\n`)).toEqual([`| &lt;br> &amp;lt; |`, `| :--- |`])
  })

  test(`escapes LaTeX specials once and builds a booktabs tabular`, () => {
    const lines = table_to_text(matrix, `tex`).split(`\n`)
    expect(lines[0]).toBe(`\\begin{tabular}{llr}`)
    // a line break inside a cell would end the paragraph mid-tabular
    expect([lines[4], lines[6]]).toEqual([
      `  x, "q" & multi line & 1 \\\\`,
      `  cr line &  & 3 \\\\`,
    ])
    expect(lines[5]).toBe(
      `  50\\% \\& \\$3\\_\\{\\} & \\textasciicircum{}\\textasciitilde{}\\textbackslash{} & 2 \\\\`,
    )
    expect(lines.at(-1)).toBe(`\\end{tabular}`)
    // omitted `numeric` left-aligns every column
    expect(table_to_text({ ...matrix, numeric: undefined }, `tex`)).toContain(`{lll}`)
  })
})

test(`the root entry re-exports the table components`, () => {
  expect(lib).toMatchObject({ ColumnFilter, ColumnPicker })
})
