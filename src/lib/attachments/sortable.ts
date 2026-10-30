export const get_html_sort_value = (element: HTMLElement): string =>
  element.getAttribute(`data-sort-value`) ??
  element.querySelector(`[data-sort-value]`)?.getAttribute(`data-sort-value`) ??
  element.textContent ??
  ``

// Visual column of a cell: colspans before it and rowspans from earlier rows of its
// section (multi-row thead) shift every later column, which cellIndex ignores
const column_start = (cell: HTMLTableCellElement): number => {
  let covered: number[] = [] // rows each column stays spanned from above
  for (const row of cell.parentElement?.parentElement?.children ?? []) {
    // by tag, not instanceof: a table from another realm (same-origin iframe) has rows
    // that aren't this window's HTMLTableRowElement
    if (row.localName !== `tr`) continue
    let col = 0
    for (const other of (row as HTMLTableRowElement).cells) {
      while (covered[col] > 0) col++
      if (other === cell) return col
      // rowspan="0" spans every remaining row of the section. Browsers report it as rowSpan
      // 0; happy-dom reports 1, so the attribute is checked as well.
      const zero_span =
        other.rowSpan === 0 || other.getAttribute(`rowspan`)?.trim() === `0`
      const rows = zero_span ? Infinity : other.rowSpan
      for (let span = 0; span < other.colSpan; span++) covered[col++] = rows
    }
    covered = covered.map((left) => left - 1)
  }
  return 0
}

// Cell starting at visual `column`, in one pass over the row; undefined when the column
// falls inside an earlier cell's colspan or past the row's end
const cell_at = (
  row: HTMLTableRowElement,
  column: number,
): HTMLTableCellElement | undefined => {
  let start = 0
  for (const cell of row.cells) {
    if (start === column) return cell
    start += cell.colSpan
    if (start > column) return undefined
  }
  return undefined
}

const header_controls = `a, button, input, select, textarea, label, [contenteditable]`

export interface SortableOptions {
  header_selector?: string
  asc_class?: string
  desc_class?: string
  sorted_style?: Partial<CSSStyleDeclaration>
  disabled?: boolean
}

// sorts a table by clicking column headers; clicking again flips direction
export const sortable =
  (options: SortableOptions = {}) =>
  (node: HTMLElement) => {
    const {
      header_selector = `thead th`,
      asc_class = `table-sort-asc`,
      desc_class = `table-sort-desc`,
      sorted_style = { backgroundColor: `rgba(255, 255, 255, 0.1)` },
      disabled = false,
    } = options

    if (disabled) return undefined

    const headers = node.querySelectorAll<HTMLTableCellElement>(header_selector)
    const collator = new Intl.Collator(undefined, { numeric: true })
    let sort_col_idx = -1
    let sort_dir = 1 // 1 = asc, -1 = desc

    const listeners = new AbortController()
    type HeaderState = {
      header: HTMLTableCellElement
      original_style: string
      original_tabindex: string | null
      original_aria_sort: string | null
      arrow?: HTMLSpanElement
    }
    const header_states: HeaderState[] = []
    const reset_header = (state: HeaderState) => {
      const { header, original_style } = state
      state.arrow?.remove()
      state.arrow = undefined
      header.classList.remove(asc_class, desc_class)
      if (original_style) header.setAttribute(`style`, original_style)
      else header.removeAttribute(`style`)
      header.removeAttribute(`aria-sort`)
    }
    const restore_header = (state: HeaderState) => {
      reset_header(state)
      const { header, original_tabindex, original_aria_sort } = state
      if (original_tabindex === null) header.removeAttribute(`tabindex`)
      else header.setAttribute(`tabindex`, original_tabindex)
      if (original_aria_sort !== null)
        header.setAttribute(`aria-sort`, original_aria_sort)
    }

    headers.forEach((header) => {
      const column = column_start(header)
      const state: HeaderState = {
        header,
        original_style: header.getAttribute(`style`) ?? ``,
        original_tabindex: header.getAttribute(`tabindex`),
        original_aria_sort: header.getAttribute(`aria-sort`),
      }
      header_states.push(state)
      header.style.cursor = `pointer`
      header.tabIndex = 0
      header.removeAttribute(`aria-sort`)

      const sort_column = () => {
        // reset all headers to unsorted state
        for (const stored of header_states) {
          reset_header(stored)
          stored.header.style.cursor = `pointer`
        }
        sort_dir = column === sort_col_idx ? -sort_dir : 1
        sort_col_idx = column
        header.classList.add(sort_dir > 0 ? asc_class : desc_class)
        header.setAttribute(`aria-sort`, sort_dir > 0 ? `ascending` : `descending`)
        Object.assign(header.style, sorted_style)
        state.arrow = header.ownerDocument.createElement(`span`)
        state.arrow.className = `sort-arrow`
        state.arrow.textContent = ` ${sort_dir > 0 ? `↑` : `↓`}`
        header.append(state.arrow)

        const table_body = node.querySelector(`tbody`)
        if (!table_body) return

        // re-sort table (:scope > tr so rows of nested tables aren't re-parented)
        const rows = Array.from(
          table_body.querySelectorAll<HTMLTableRowElement>(`:scope > tr`),
          (row) => {
            // Missing cells sort last, as do cells spanning in from an earlier column
            // (placeholder rows). Read each cell once per click.
            const cell = cell_at(row, column)
            return [row, cell ? get_html_sort_value(cell).trim() : ``] as const
          },
        )
        rows.sort(([, val_1], [, val_2]) => {
          if (val_1 === val_2) return 0
          if (val_1 === ``) return 1 // empty/whitespace cells last in either direction
          if (val_2 === ``) return -1
          const [num_1, num_2] = [Number(val_1), Number(val_2)]
          const [text_1, text_2] = [Number.isNaN(num_1), Number.isNaN(num_2)]
          // non-numeric values sort after numeric ones
          if (text_1 !== text_2) return text_1 ? sort_dir : -sort_dir
          return sort_dir * (text_1 ? collator.compare(val_1, val_2) : num_1 - num_2)
        })

        for (const [row] of rows) table_body.append(row)
      }

      // only keys aimed at the header itself: a control inside it keeps its own Enter/Space
      const on_keydown = (event: KeyboardEvent) => {
        if (event.target !== header || (event.key !== `Enter` && event.key !== ` `))
          return
        event.preventDefault()
        sort_column()
      }
      // a click on (or a key-fired click from) a control inside the header is the control's
      const on_click = ({ target }: MouseEvent) => {
        if (
          !(target instanceof Element && header.contains(target.closest(header_controls)))
        )
          sort_column()
      }
      header.addEventListener(`click`, on_click, { signal: listeners.signal })
      header.addEventListener(`keydown`, on_keydown, { signal: listeners.signal })
    })

    return () => {
      listeners.abort()
      for (const state of header_states) restore_header(state)
    }
  }
