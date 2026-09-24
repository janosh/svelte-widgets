import { get_html_sort_value, sortable, type SortableOptions } from '$lib/attachments'
import { describe, expect, it, onTestFinished } from 'vitest'
import { create_element, press_key } from '../index'

describe(`get_html_sort_value`, () => {
  it.each([
    [`data-sort-value wins over text`, `<p data-sort-value="key">Text</p>`, `key`],
    [`an empty data-sort-value stays empty`, `<p data-sort-value="">Text</p>`, ``],
    [`textContent without data-sort-value`, `<p>Element text</p>`, `Element text`],
    [`an empty element`, `<p></p>`, ``],
    [`whitespace textContent verbatim`, `<p>   \n\t   </p>`, `   \n\t   `],
    [`complete cell text`, `<p>Item <strong>20</strong> kg</p>`, `Item 20 kg`],
    [
      `a child key after text`,
      `<p><span>Label</span><span data-sort-value="2">Two</span></p>`,
      `2`,
    ],
    [
      `an empty child key`,
      `<p><span data-sort-value=""></span><span>Label</span></p>`,
      ``,
    ],
    [
      `the first nested key`,
      `<p>Parent<span>Child<em data-sort-value="grandchild">G</em></span><span data-sort-value="sibling">S</span></p>`,
      `grandchild`,
    ],
  ])(`reads %s`, (_desc, markup, expected) => {
    const host = create_element()
    host.innerHTML = markup
    const element = host.firstElementChild
    if (!(element instanceof HTMLElement)) throw new Error(`bad markup ${markup}`)
    expect(get_html_sort_value(element)).toBe(expected)
  })
})

describe(`sortable`, () => {
  const create_table = (
    inner_html = `<thead><tr><th>Planet</th><th>Moons</th></tr></thead>
      <tbody><tr><td>Mars</td><td>2</td></tr>
      <tr><td>Earth</td><td>1</td></tr>
      <tr><td>Jupiter</td><td>95</td></tr></tbody>`,
  ) => {
    const table = document.createElement(`table`)
    table.innerHTML = inner_html
    document.body.append(table)
    onTestFinished(() => table.remove())
    return table
  }
  const click = (header: Element) =>
    header.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
  const attach_sortable = (table: HTMLTableElement, options: SortableOptions = {}) => {
    const cleanup = sortable(options)(table)
    if (cleanup) onTestFinished(cleanup)
    return cleanup
  }
  const headers_of = (table: HTMLTableElement) => [
    ...table.querySelectorAll<HTMLTableCellElement>(`thead th`),
  ]
  const column_values = (table: HTMLTableElement, col_idx = 0) =>
    [...table.querySelectorAll(`tbody tr`)].map(
      (row) => row.children[col_idx].textContent,
    )

  it(`sorts ascending then descending on repeated clicks`, () => {
    const table = create_table()
    attach_sortable(table)
    const [planet_header] = headers_of(table)

    click(planet_header)
    expect(column_values(table)).toEqual([`Earth`, `Jupiter`, `Mars`])
    click(planet_header)
    expect(column_values(table)).toEqual([`Mars`, `Jupiter`, `Earth`])

    // sort keys must refresh after cell edits between clicks
    table.rows[1].cells[0].textContent = `Venus`
    click(planet_header)
    expect(column_values(table)).toEqual([`Earth`, `Jupiter`, `Venus`])
  })

  it(`sorts from the keyboard and restores header a11y attributes`, () => {
    const table = create_table()
    const [first, second] = headers_of(table)
    first.setAttribute(`tabindex`, `-1`)
    first.setAttribute(`aria-sort`, `other`)
    const cleanup = attach_sortable(table)

    expect([first.tabIndex, second.tabIndex]).toEqual([0, 0])
    expect(press_key(first, `Enter`).defaultPrevented).toBe(true)
    expect(first.getAttribute(`aria-sort`)).toBe(`ascending`)
    expect(column_values(table)).toEqual([`Earth`, `Jupiter`, `Mars`])

    expect(press_key(first, ` `).defaultPrevented).toBe(true)
    expect(first.getAttribute(`aria-sort`)).toBe(`descending`)
    expect(column_values(table)).toEqual([`Mars`, `Jupiter`, `Earth`])

    press_key(second, `Enter`)
    expect(first.hasAttribute(`aria-sort`)).toBe(false)
    expect(second.getAttribute(`aria-sort`)).toBe(`ascending`)
    const sorted = column_values(table)

    cleanup?.()
    expect([first.getAttribute(`tabindex`), first.getAttribute(`aria-sort`)]).toEqual([
      `-1`,
      `other`,
    ])
    expect([second.hasAttribute(`tabindex`), second.hasAttribute(`aria-sort`)]).toEqual([
      false,
      false,
    ])
    press_key(first, `Enter`)
    expect(column_values(table)).toEqual(sorted)
  })

  it(`does not set up sorting when disabled`, () => {
    const table = create_table()
    expect(attach_sortable(table, { disabled: true })).toBeUndefined()
    const [header] = headers_of(table)
    expect(header.style.cursor).toBe(``)

    click(header)
    expect(column_values(table)).toEqual([`Mars`, `Earth`, `Jupiter`]) // unsorted
    expect(header.classList.contains(`table-sort-asc`)).toBe(false)
  })

  it(`applies custom classes and sorted_style, resetting other columns`, () => {
    const table = create_table()
    attach_sortable(table, {
      asc_class: `asc`,
      desc_class: `desc`,
      sorted_style: { backgroundColor: `red` },
    })
    const [h1, h2] = headers_of(table)

    click(h1)
    expect([h1.className, h1.style.backgroundColor]).toEqual([`asc`, `red`])
    click(h1)
    expect(h1.className).toBe(`desc`)

    click(h2)
    expect(h1.textContent).not.toContain(`↑`)
    expect(h1.className).toBe(``)
    expect(h1.style.backgroundColor).toBe(``) // sorted_style reset too, not just the class
    expect(h1.style.cursor).toBe(`pointer`) // reset must not strip the pointer cursor
    expect([h2.className, h2.style.backgroundColor]).toEqual([`asc`, `red`])
  })

  it(`handles an empty table body and a custom header_selector`, () => {
    const table = create_table(
      `<thead><tr><th class="sortable">A</th><th>B</th></tr></thead>`,
    )
    attach_sortable(table, { header_selector: `th.sortable` })
    const [sortable_header, other_header] = headers_of(table)

    expect([sortable_header.style.cursor, other_header.style.cursor]).toEqual([
      `pointer`,
      ``,
    ])
    click(sortable_header)
    expect(sortable_header.textContent).toBe(`A ↑`)
    expect(sortable_header.classList.contains(`table-sort-asc`)).toBe(true)
  })

  it.each([
    [`whitespace-only cells as empty`, [`   `, `5`, `1`], [`1`, `5`, ``]],
    [`natural text ordering`, [`item10`, `item2`, `item1`], [`item1`, `item2`, `item10`]],
    [
      `mixed numeric and text cells`,
      [`foo`, `10`, `bar`, `2`],
      [`2`, `10`, `bar`, `foo`],
    ],
  ])(`sorts %s correctly`, (_desc, cells, expected) => {
    const rows = cells.map((val) => `<tr><td>${val}</td></tr>`).join(``)
    const table = create_table(
      `<thead><tr><th>Col</th></tr></thead><tbody>${rows}</tbody>`,
    )
    attach_sortable(table)
    click(headers_of(table)[0])
    expect(column_values(table).map((val) => val?.trim())).toEqual(expected)
  })

  it.each([`thead th`, `thead th:last-child`])(
    `sorts the actual column with %s and keeps missing cells last`,
    (header_selector) => {
      const table = create_table(
        `<thead><tr><th>Name</th><th>Score</th></tr></thead><tbody>` +
          `<tr><td colspan="2">No data</td></tr>` +
          `<tr><td>Alice</td><td>3</td></tr>` +
          `<tr><td>Bob</td><td>1</td></tr></tbody>`,
      )
      attach_sortable(table, { header_selector })
      click(headers_of(table)[1]) // placeholder row has no cell at index 1
      expect(column_values(table)).toEqual([`Bob`, `Alice`, `No data`])
    },
  )

  it(`does not re-parent rows of nested tables when sorting`, () => {
    const table = create_table(
      `<thead><tr><th>Name</th><th>Data</th></tr></thead><tbody>` +
        `<tr><td>Beta</td><td><table><tbody><tr><td>nested</td></tr></tbody></table></td></tr>` +
        `<tr><td>Alpha</td><td>plain</td></tr></tbody>`,
    )
    attach_sortable(table)
    click(headers_of(table)[0])

    expect(table.querySelectorAll(`tbody table tr`)).toHaveLength(1)
    const outer_rows = table.querySelectorAll(`:scope > tbody > tr`)
    expect([...outer_rows].map((row) => row.firstElementChild?.textContent)).toEqual([
      `Alpha`,
      `Beta`,
    ])
  })

  it(`preserves header child markup across sort clicks and cleanup`, () => {
    const table = create_table()
    const headers = headers_of(table)
    const [header] = headers
    const original_html = `<span class="icon sort-arrow">▲</span> Planet`
    header.innerHTML = original_html
    const icon = header.querySelector(`.icon`)
    header.style.color = `blue`

    const cleanup = attach_sortable(table)
    expect(headers.map(({ style }) => style.cursor)).toEqual([`pointer`, `pointer`])
    click(header)
    expect(header.querySelector(`span.icon`)).toBe(icon)
    expect(header.querySelector(`span.sort-arrow:not(.icon)`)?.textContent).toContain(`↑`)

    // repeated clicks replace only the attachment's arrow, not the consumer's icon
    click(header)
    expect(header.querySelectorAll(`span.sort-arrow`)).toHaveLength(2)
    expect(header.querySelector(`span.sort-arrow:not(.icon)`)?.textContent).toContain(`↓`)

    cleanup?.()
    expect(header.innerHTML).toBe(original_html)
    expect(header.style.color).toBe(`blue`)
    expect(headers.map(({ style }) => style.cursor)).toEqual([``, ``])
    expect(headers.map(({ className }) => className)).toEqual([``, ``])
  })
})
