import { sortable, type SortableOptions } from '$lib/attachments'
import { describe, expect, it, onTestFinished } from 'vite-plus/test'
import { press_key } from '../index'

describe(`sortable`, () => {
  const mount_table = (table: HTMLTableElement) => {
    document.body.append(table)
    onTestFinished(() => table.remove())
    return table
  }
  const attach_sortable = (table: HTMLTableElement, options: SortableOptions = {}) => {
    const cleanup = sortable(options)(table)
    if (cleanup) onTestFinished(cleanup)
    return cleanup
  }

  const get_required_header = (
    table: HTMLTableElement,
    selector = `thead th`,
  ): HTMLTableCellElement => {
    const header = table.querySelector(selector)
    if (!(header instanceof HTMLTableCellElement)) {
      throw new Error(`expected table header '${selector}'`)
    }
    return header
  }

  const create_table = () => {
    const table = document.createElement(`table`)
    table.innerHTML = `<thead><tr><th>Planet</th><th>Moons</th></tr></thead>
      <tbody><tr><td>Mars</td><td>2</td></tr>
      <tr><td>Earth</td><td>1</td></tr>
      <tr><td>Jupiter</td><td>95</td></tr></tbody>`
    return mount_table(table)
  }

  const get_column_values = (table: HTMLTableElement, col_idx: number) =>
    Array.from(table.querySelectorAll(`tbody tr`)).map(
      (row) => row.children[col_idx].textContent,
    )

  it.each<[string, (header: HTMLTableCellElement) => unknown]>([
    [
      `a click`,
      (header) => header.dispatchEvent(new MouseEvent(`click`, { bubbles: true })),
    ],
    [`Enter`, (header) => press_key(header, `Enter`)],
    [`Space`, (header) => press_key(header, ` `)],
  ])(`sorts ascending then descending on repeated %s`, (_activation, activate) => {
    const table = create_table()
    attach_sortable(table)
    const planet_header = get_required_header(table)

    activate(planet_header)
    expect(get_column_values(table, 0)).toEqual([`Earth`, `Jupiter`, `Mars`])

    activate(planet_header)
    expect(get_column_values(table, 0)).toEqual([`Mars`, `Jupiter`, `Earth`])
  })

  it(`exposes headers to the keyboard and restores their a11y attributes`, () => {
    const table = create_table()
    const [first, second] = table.querySelectorAll<HTMLTableCellElement>(`thead th`)
    first.setAttribute(`tabindex`, `-1`)
    first.setAttribute(`aria-sort`, `other`)
    const cleanup = attach_sortable(table)

    expect([first.tabIndex, second.tabIndex]).toEqual([0, 0])
    expect(press_key(first, `Enter`).defaultPrevented).toBe(true)
    expect(first.getAttribute(`aria-sort`)).toBe(`ascending`)

    expect(press_key(first, ` `).defaultPrevented).toBe(true)
    expect(first.getAttribute(`aria-sort`)).toBe(`descending`)

    press_key(second, `Enter`)
    expect(first.hasAttribute(`aria-sort`)).toBe(false)
    expect(second.getAttribute(`aria-sort`)).toBe(`ascending`)
    const sorted = get_column_values(table, 0)

    cleanup?.()
    expect([first.getAttribute(`tabindex`), first.getAttribute(`aria-sort`)]).toEqual([
      `-1`,
      `other`,
    ])
    expect(second.hasAttribute(`tabindex`)).toBe(false)
    expect(second.hasAttribute(`aria-sort`)).toBe(false)
    press_key(first, `Enter`)
    expect(get_column_values(table, 0)).toEqual(sorted)
  })

  it(`does not set up sorting when disabled`, () => {
    const table = create_table()
    expect(attach_sortable(table, { disabled: true })).toBeUndefined()
    const header = get_required_header(table)
    expect(header.style.cursor).toBe(``)

    header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(get_column_values(table, 0)).toEqual([`Mars`, `Earth`, `Jupiter`]) // unsorted
    expect(header.classList.contains(`table-sort-asc`)).toBe(false)
  })

  it(`applies custom classes and sorted_style, resetting other columns`, () => {
    const table = create_table()
    attach_sortable(table, {
      asc_class: `asc`,
      desc_class: `desc`,
      sorted_style: { backgroundColor: `red` },
    })
    const [h1, h2] = Array.from(table.querySelectorAll<HTMLTableCellElement>(`thead th`))

    h1.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(h1.classList.contains(`asc`)).toBe(true)
    expect(h1.style.backgroundColor).toBe(`red`)

    h1.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(h1.classList.contains(`desc`)).toBe(true)

    h2.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(h1.textContent).not.toContain(`↑`)
    expect(h1.classList.contains(`asc`)).toBe(false)
    expect(h1.classList.contains(`desc`)).toBe(false)
    expect(h1.style.backgroundColor).toBe(``) // sorted_style reset too, not just the class
    expect(h1.style.cursor).toBe(`pointer`) // reset must not strip the pointer cursor
    expect(h2.classList.contains(`asc`)).toBe(true)
    expect(h2.style.backgroundColor).toBe(`red`)
  })

  it(`handles an empty table body and a custom header_selector`, () => {
    const table = document.createElement(`table`)
    table.innerHTML = `<thead><tr><th class="sortable">A</th><th>B</th></tr></thead>`
    mount_table(table)

    attach_sortable(table, { header_selector: `th.sortable` })

    const sortable_header = get_required_header(table, `th.sortable`)
    const second_header = table.querySelectorAll<HTMLTableCellElement>(`th`)[1]
    expect(sortable_header.style.cursor).toBe(`pointer`)
    expect(second_header?.style.cursor).toBe(``)
    sortable_header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(sortable_header.textContent).toBe(`A ↑`)
    expect(sortable_header.classList.contains(`table-sort-asc`)).toBe(true)
  })

  it.each([
    [`whitespace-only cells as empty`, [`   `, `5`, `1`], [`1`, `5`, ``]],
    [
      `mixed numeric and text cells`,
      [`foo`, `10`, `bar`, `2`],
      [`2`, `10`, `bar`, `foo`],
    ],
  ])(`sorts %s correctly`, (_desc, cells, expected) => {
    const table = document.createElement(`table`)
    const rows = cells.map((val: string) => `<tr><td>${val}</td></tr>`).join(``)
    table.innerHTML = `<thead><tr><th>Col</th></tr></thead><tbody>${rows}</tbody>`
    mount_table(table)

    attach_sortable(table)
    get_required_header(table).dispatchEvent(new MouseEvent(`click`, { bubbles: true }))

    expect(get_column_values(table, 0).map((val) => val?.trim())).toEqual(expected)
  })

  it(`treats rows with missing cells (colspan placeholder) as empty and sorts them last`, () => {
    const table = document.createElement(`table`)
    table.innerHTML =
      `<thead><tr><th>Name</th><th>Score</th></tr></thead><tbody>` +
      `<tr><td colspan="2">No data</td></tr>` +
      `<tr><td>Alice</td><td>3</td></tr>` +
      `<tr><td>Bob</td><td>1</td></tr>` +
      `</tbody>`
    mount_table(table)

    attach_sortable(table)
    // click 2nd column header; placeholder row has no cell at index 1
    const score_header = table.querySelectorAll(`thead th`)[1]
    score_header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))

    const first_cells = Array.from(
      table.querySelectorAll<HTMLTableRowElement>(`tbody tr`),
    ).map((row) => row.cells[0]?.textContent)
    expect(first_cells).toEqual([`Bob`, `Alice`, `No data`])
  })

  it(`does not re-parent rows of nested tables when sorting`, () => {
    const table = document.createElement(`table`)
    table.innerHTML =
      `<thead><tr><th>Name</th><th>Data</th></tr></thead><tbody>` +
      `<tr><td>Beta</td><td><table><tbody><tr><td>nested</td></tr></tbody></table></td></tr>` +
      `<tr><td>Alpha</td><td>plain</td></tr>` +
      `</tbody>`
    mount_table(table)

    attach_sortable(table)
    get_required_header(table).dispatchEvent(new MouseEvent(`click`, { bubbles: true }))

    const nested_table = table.querySelector(`tbody table`)
    expect(nested_table?.querySelectorAll(`tr`)).toHaveLength(1)
    const outer_rows = Array.from(table.querySelector(`tbody`)?.children ?? []).filter(
      (child) => child.tagName === `TR`,
    )
    expect(outer_rows.map((row) => row.querySelector(`td`)?.textContent)).toEqual([
      `Alpha`,
      `Beta`,
    ])
  })

  it(`preserves header child markup across sort clicks and cleanup`, () => {
    const table = create_table()
    const headers = Array.from(table.querySelectorAll<HTMLTableCellElement>(`thead th`))
    const [header] = headers
    header.innerHTML = `<span class="icon sort-arrow">▲</span> Planet`
    const icon = header.querySelector<HTMLSpanElement>(`.icon`)
    if (!icon) throw new Error(`expected header icon`)
    header.style.color = `blue`

    const cleanup = attach_sortable(table)
    expect(headers.map(({ style }) => style.cursor)).toEqual([`pointer`, `pointer`])
    header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))

    expect(header.querySelector(`span.icon`)).toBe(icon)
    expect(header.querySelector(`span.sort-arrow:not(.icon)`)?.textContent).toContain(`↑`)

    // repeated clicks replace only the attachment's arrow, preserving the consumer's
    header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(header.querySelectorAll(`span.sort-arrow`)).toHaveLength(2)
    expect(header.querySelector(`span.sort-arrow:not(.icon)`)?.textContent).toContain(`↓`)

    cleanup?.()
    expect(header.innerHTML).toBe(`<span class="icon sort-arrow">▲</span> Planet`)
    expect(header.style.color).toBe(`blue`)
    expect(headers.map(({ style }) => style.cursor)).toEqual([``, ``])
    expect(
      headers.some(
        ({ classList }) =>
          classList.contains(`table-sort-asc`) || classList.contains(`table-sort-desc`),
      ),
    ).toBe(false)
  })
})
