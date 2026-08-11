export function get_html_sort_value(element: HTMLElement): string {
  if (element.dataset.sortValue !== undefined) return element.dataset.sortValue
  for (const child of Array.from(element.children)) {
    if (!(child instanceof HTMLElement)) continue
    const child_val = get_html_sort_value(child)
    if (child_val !== ``) return child_val
  }
  return element.textContent ?? ``
}

export interface SortableOptions {
  header_selector?: string
  asc_class?: string
  desc_class?: string
  sorted_style?: Partial<CSSStyleDeclaration>
  disabled?: boolean
}

// Attachment making an HTML table sortable by clicking column headers (click again to flip direction)
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
    let sort_col_idx = -1
    let sort_dir = 1 // 1 = asc, -1 = desc

    const listeners = new AbortController()
    type HeaderState = {
      header: HTMLTableCellElement
      original_style: string
    }
    const header_state: HeaderState[] = []
    // Drop only what this attachment added, leaving the header's own markup and any
    // listeners on it in place — the arrow lives in a span of its own for that reason.
    const restore_header = ({ header, original_style }: HeaderState) => {
      header.querySelector(`:scope > .sort-arrow`)?.remove()
      header.classList.remove(asc_class, desc_class)
      if (original_style) header.setAttribute(`style`, original_style)
      else header.removeAttribute(`style`)
    }

    headers.forEach((header, idx) => {
      const original_style = header.getAttribute(`style`) ?? ``
      header.style.cursor = `pointer`

      const click_handler = () => {
        // reset all headers to unsorted state
        for (const state of header_state) {
          restore_header(state)
          state.header.style.cursor = `pointer`
        }
        if (idx === sort_col_idx) {
          sort_dir *= -1
        } else {
          sort_col_idx = idx
          sort_dir = 1
        }
        header.classList.add(sort_dir > 0 ? asc_class : desc_class)
        Object.assign(header.style, sorted_style)
        // the reset above already dropped any previous arrow
        const arrow_span = document.createElement(`span`)
        arrow_span.className = `sort-arrow`
        arrow_span.textContent = ` ${sort_dir > 0 ? `↑` : `↓`}`
        header.append(arrow_span)

        const table_body = node.querySelector(`tbody`)
        if (!table_body) return

        // re-sort table (:scope > tr so rows of nested tables aren't re-parented)
        const rows = Array.from(
          table_body.querySelectorAll<HTMLTableRowElement>(`:scope > tr`),
        )
        rows.sort((row_1, row_2) => {
          const cell_1 = row_1.cells[idx]
          const cell_2 = row_2.cells[idx]
          // Rows can have fewer cells than the sort column (colspan placeholders,
          // ragged rows) — treat missing cells as empty so they sort last
          const val_1 = cell_1 ? get_html_sort_value(cell_1) : ``
          const val_2 = cell_2 ? get_html_sort_value(cell_2) : ``

          const [trimmed_1, trimmed_2] = [val_1.trim(), val_2.trim()]
          if (trimmed_1 === trimmed_2) return 0
          if (trimmed_1 === ``) return 1 // treat empty/whitespace as lower than any value
          if (trimmed_2 === ``) return -1
          const num_1 = Number(trimmed_1)
          const num_2 = Number(trimmed_2)
          if (isNaN(num_1) && isNaN(num_2)) {
            return (
              sort_dir * trimmed_1.localeCompare(trimmed_2, undefined, { numeric: true })
            )
          }
          // sort non-numeric values after numeric ones
          if (isNaN(num_1)) return sort_dir
          if (isNaN(num_2)) return -sort_dir
          return sort_dir * (num_1 - num_2)
        })

        for (const row of rows) table_body.append(row)
      }

      header.addEventListener(`click`, click_handler, { signal: listeners.signal })
      header_state.push({ header, original_style })
    })

    return () => {
      listeners.abort()
      for (const state of header_state) restore_header(state)
    }
  }
