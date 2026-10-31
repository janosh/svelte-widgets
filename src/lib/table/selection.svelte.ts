import { on } from 'svelte/events'
import { is_editable_event_target } from '../utils'
import { tsv_cell } from './export'
import type { CellPos } from './types'

// Cell-range selection model: a list of rectangles in absolute (row index, column index)
// coordinates. Drag selects one rectangle, Shift/Cmd/Ctrl-drag adds disjoint ones,
// Shift+arrow grows the newest from its anchor. Headless so the geometry is testable without
// a DOM; `cell_range_select` maps pointer and keyboard events onto these calls, or a host
// wires its own.
export type CellRect = {
  start_row: number
  start_col: number
  end_row: number
  end_col: number
}
// Plain text of the cell at absolute (row, col), undefined when out of range
export type CellText = (row: number, col: number) => string | undefined
type RectBounds = { row_lo: number; row_hi: number; col_lo: number; col_hi: number }

const rect_bounds = (rect: CellRect): RectBounds => ({
  row_lo: Math.min(rect.start_row, rect.end_row),
  row_hi: Math.max(rect.start_row, rect.end_row),
  col_lo: Math.min(rect.start_col, rect.end_col),
  col_hi: Math.max(rect.start_col, rect.end_col),
})

// Contract: coordinates index the host's current rows and columns, so hosts clear the
// selection whenever those change (re-sort, filter, hide or reorder). A forgotten clear never
// throws here: `to_tsv` skips cells whose `cell_text` returns undefined (out of range).
export class CellSelection {
  rects = $state<CellRect[]>([])
  dragging = $state(false)
  // true once a drag crossed into another cell, so the click on release can be swallowed
  #drag_moved = false

  // Tested per rendered cell, so it checks the few rectangles rather than materializing
  // every selected cell (a 10k x 30 drag rebuilt 300k keys per pointer move)
  bounds = $derived(this.rects.map(rect_bounds))
  has = (row: number, col: number): boolean =>
    this.bounds.some(
      ({ row_lo, row_hi, col_lo, col_hi }) =>
        row >= row_lo && row <= row_hi && col >= col_lo && col <= col_hi,
    )
  // Distinct selected cells (rectangles may overlap): sweep the row bands between rectangle
  // edges, merging the column spans of the rectangles covering each band
  size = $derived.by(() => {
    const edges = [
      ...new Set(this.bounds.flatMap((rect) => [rect.row_lo, rect.row_hi + 1])),
    ].toSorted((edge_a, edge_b) => edge_a - edge_b)
    let total = 0
    for (let idx = 1; idx < edges.length; idx++) {
      const band_lo = edges[idx - 1]
      const spans = this.bounds
        .filter((rect) => rect.row_lo <= band_lo && rect.row_hi >= band_lo)
        .toSorted((rect_a, rect_b) => rect_a.col_lo - rect_b.col_lo)
      let [width, reach] = [0, -Infinity] // reach: last column counted so far
      for (const { col_lo, col_hi } of spans) {
        width += Math.max(0, col_hi - Math.max(col_lo, reach + 1) + 1)
        reach = Math.max(reach, col_hi)
      }
      total += width * (edges[idx] - band_lo)
    }
    return total
  })
  // A no-op when empty, so clearing on every data update re-runs no cell's has()
  clear = (): void => {
    if (this.rects.length > 0) this.rects = []
  }

  // Pointer down on a cell: start a 1x1 rectangle, replacing the selection unless additive
  start_drag(pos: CellPos, additive: boolean): void {
    const rect = {
      start_row: pos.row,
      start_col: pos.col,
      end_row: pos.row,
      end_col: pos.col,
    }
    this.rects = additive ? [...this.rects, rect] : [rect]
    this.dragging = true
    this.#drag_moved = false
  }

  // Pointer moved over another cell while dragging: stretch the newest rectangle to it.
  // Returns true when this move actually changed the selection.
  extend_drag(pos: CellPos): boolean {
    const active = this.rects.at(-1)
    if (!this.dragging || !active) return false
    if (pos.row === active.end_row && pos.col === active.end_col) return false
    this.#drag_moved = true
    this.rects = [
      ...this.rects.slice(0, -1),
      { ...active, end_row: pos.row, end_col: pos.col },
    ]
    return true
  }

  // Pointer up anywhere: returns whether the drag crossed cells (caller suppresses the click)
  end_drag(): boolean {
    if (!this.dragging) return false
    this.dragging = false
    return this.#drag_moved
  }

  // Keyboard step from `from` to `target`: extend grows the newest rectangle from where it
  // started, otherwise the selection becomes the 1x1 cell it lands on.
  step(from: CellPos, target: CellPos, extend: boolean): void {
    const anchor = extend
      ? (this.rects.at(-1) ?? { start_row: from.row, start_col: from.col })
      : { start_row: target.row, start_col: target.col }
    const kept = extend ? this.rects.slice(0, -1) : []
    this.rects = [...kept, { ...anchor, end_row: target.row, end_col: target.col }]
  }

  // Selected cells as TSV blocks, one per rectangle, newline-joined. Cells whose text is
  // undefined (out of range) are skipped, and so are rows left with none.
  to_tsv = (cell_text: CellText): string =>
    this.bounds
      .flatMap(({ row_lo, row_hi, col_lo, col_hi }) =>
        Array.from({ length: row_hi - row_lo + 1 }, (_row, row_off) =>
          Array.from({ length: col_hi - col_lo + 1 }, (_col, col_off) =>
            cell_text(row_lo + row_off, col_lo + col_off),
          ).filter((text) => text !== undefined),
        ),
      )
      .filter((cells) => cells.length > 0)
      .map((cells) => cells.map(tsv_cell).join(`\t`))
      .join(`\n`)
}

export type CellRangeSelectOptions = {
  // Cell under an event target. Defaults to the closest `[data-row][data-col]` element
  // inside the attached node, read as absolute indices.
  cell_at?: (target: EventTarget | null, node: HTMLElement) => CellPos | null
  // Text of a cell, read when the user copies. Omit to leave copy native.
  cell_text?: CellText
  // Called with the TSV once it is on the clipboard, e.g. to show a toast
  on_copy?: (text: string) => void
}

// Presses on these keep their native behaviour instead of starting a cell selection
export const INTERACTIVE_SELECTOR = `button, a, input, select, textarea`

const data_cell_at = (target: EventTarget | null, node: HTMLElement): CellPos | null => {
  const cell =
    target instanceof Element ? target.closest<HTMLElement>(`[data-row][data-col]`) : null
  if (!cell || !node.contains(cell)) return null
  const [row, col] = [Number(cell.dataset.row), Number(cell.dataset.col)]
  return Number.isInteger(row) && Number.isInteger(col) ? { row, col } : null
}

// Wires drag selection onto a table (or any grid): pointer down on a cell starts a range,
// Shift/Cmd/Ctrl adds another, dragging stretches it, and the click ending a drag is
// swallowed so row click handlers and links don't fire. Touch presses never select, so a
// scroll starting on a cell keeps the selection. Escape or a press outside the node clears;
// copying (Cmd/Ctrl+C or the Copy menu) puts the cells on the clipboard as TSV when
// `cell_text` is given and no form field or native text selection claims the copy. Window
// listeners capture, so controls that stop propagation can't hide a press or release from
// them. Attach to the whole table container, not just its body, when controls inside it
// (menus, toolbars) must keep the selection.
export const cell_range_select =
  (selection: CellSelection, options: CellRangeSelectOptions = {}) =>
  (node: HTMLElement): (() => void) => {
    const { cell_at = data_cell_at, cell_text, on_copy } = options
    let suppress_click = false
    const capture = { capture: true }
    const cleanups = [
      on(node, `pointerdown`, (event) => {
        const pos = cell_at(event.target, node)
        const on_control =
          event.target instanceof Element && event.target.closest(INTERACTIVE_SELECTOR)
        if (pos && event.button === 0 && event.pointerType !== `touch` && !on_control)
          selection.start_drag(pos, event.shiftKey || event.metaKey || event.ctrlKey)
      }),
      on(node, `pointermove`, (event) => {
        if (!selection.dragging) return
        // a release the window never saw (e.g. outside the browser) ends the drag, else
        // hovers would keep extending the selection
        if (!(event.buttons & 1)) {
          selection.end_drag()
          return
        }
        const pos = cell_at(event.target, node)
        // a native text selection may have started before user-select kicked in
        if (pos && selection.extend_drag(pos)) getSelection()?.removeAllRanges()
      }),
      on(
        node,
        `click`,
        (event) => {
          if (!suppress_click) return
          suppress_click = false
          event.stopPropagation()
          event.preventDefault()
        },
        capture,
      ),
      on(
        window,
        `pointerup`,
        () => {
          if (selection.end_drag()) suppress_click = true
        },
        capture,
      ),
      // the browser took the pointer (touch scroll, pen leaving range): no click follows
      on(window, `pointercancel`, () => void selection.end_drag(), capture),
      on(
        window,
        `pointerdown`,
        (event) => {
          // a drag released outside never got its click, so no later press may inherit it
          suppress_click = false
          if (!(event.target instanceof Node && node.contains(event.target)))
            selection.clear()
        },
        capture,
      ),
      on(window, `keydown`, (event) => {
        if (event.key === `Escape`) selection.clear()
      }),
      // The copy event's clipboardData works on insecure origins too, unlike
      // navigator.clipboard, and needs no permission
      on(document, `copy`, (event) => {
        if (!cell_text || selection.size === 0 || !event.clipboardData) return
        if (is_editable_event_target(event.target) || getSelection()?.toString()) return
        const text = selection.to_tsv(cell_text)
        event.clipboardData.setData(`text/plain`, text)
        event.preventDefault()
        on_copy?.(text)
      }),
    ]
    return () => {
      for (const cleanup of cleanups) cleanup()
    }
  }
