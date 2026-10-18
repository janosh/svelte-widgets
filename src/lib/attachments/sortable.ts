export const get_html_sort_value = (element: HTMLElement): string =>
  element.getAttribute(`data-sort-value`) ??
  element.querySelector(`[data-sort-value]`)?.getAttribute(`data-sort-value`) ??
  element.textContent ??
  ``

// Visual column of a cell: colspans before it shift every later column, which cellIndex
// ignores
const column_start = (cell: HTMLTableCellElement): number => {
  let start = 0
  for (let prev = cell.previousElementSibling; prev; prev = prev.previousElementSibling)
    if (prev instanceof HTMLTableCellElement) start += prev.colSpan
  return start
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
        rows.sort(([, trimmed_1], [, trimmed_2]) => {
          if (trimmed_1 === trimmed_2) return 0
          if (trimmed_1 === ``) return 1 // treat empty/whitespace as lower than any value
          if (trimmed_2 === ``) return -1
          const [num_1, num_2] = [Number(trimmed_1), Number(trimmed_2)]
          if (Number.isNaN(num_1) && Number.isNaN(num_2)) {
            return sort_dir * collator.compare(trimmed_1, trimmed_2)
          }
          // sort non-numeric values after numeric ones
          if (Number.isNaN(num_1)) return sort_dir
          if (Number.isNaN(num_2)) return -sort_dir
          return sort_dir * (num_1 - num_2)
        })

        for (const [row] of rows) table_body.append(row)
      }

      const on_keydown = (event: KeyboardEvent) => {
        if (event.key !== `Enter` && event.key !== ` `) return
        event.preventDefault()
        sort_column()
      }
      header.addEventListener(`click`, sort_column, { signal: listeners.signal })
      header.addEventListener(`keydown`, on_keydown, { signal: listeners.signal })
    })

    return () => {
      listeners.abort()
      for (const state of header_states) restore_header(state)
    }
  }
