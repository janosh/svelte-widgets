// Types and column statistics for DataTable. Everything here is DOM-free.
import type { Snippet } from 'svelte'
import type { ClassValue, HTMLAttributes } from 'svelte/elements'
import type { CmdSection } from '../types'
import type { ColumnFilterValue } from './types'

// Every format a table can export, for opting in: <DataTable export_formats={TABLE_EXPORT_FORMATS}>
export const TABLE_EXPORT_FORMATS = [`csv`, `json`, `md`, `tex`] as const
export type TableExportFormat = (typeof TABLE_EXPORT_FORMATS)[number] | `tsv`

// Cell value types for table data
export type CellVal =
  | ClassValue
  | string
  | number
  | boolean
  | Date
  | undefined
  | null
  | Record<string, unknown>
  | Record<string, string | number | null | undefined | boolean>[]

// Row data for table entries
export type RowData = { style?: string; class?: ClassValue; [key: string]: CellVal }

export type DateTimeFormatMode = `date` | `time` | `datetime` | `iso` | `relative`

// How a column's value domain (for data bars, and for hosts coloring cells) is derived:
// - minmax (default): the full data range, so the extremes anchor it
// - diverging: symmetric about zero, so equal magnitudes of either sign read alike
// - quantile: clipped to the 5th–95th percentile, so a lone outlier can't flatten the rest
export type DomainMode = `minmax` | `diverging` | `quantile`

// Which edge a column sticks to while the table scrolls sideways
export type PinSide = `left` | `right`

export type Column<Row extends object = RowData> = {
  // Stable identity for sorting, visibility, preferences and reordering.
  id: string
  // Header text; markup renders through the table's render_html.
  label: string
  // Row property to read; defaults to id. Header and group never determine data access.
  key?: Extract<keyof Row, string>
  cell?: CellSnippet<Row>
  // Columns sharing a group render under one spanning header row and can only be
  // drag-reordered within that group. The column picker also sections its list by it.
  group?: string
  description?: string
  // Passed to the table's format_number for numeric cells
  format?: string
  // Render cells as dates/times in this mode; also makes bare numbers read as epoch timestamps
  datetime_format?: DateTimeFormatMode
  // Which end of the column wins: sets the first sort direction and the best cell
  better?: `higher` | `lower`
  normalize?: DomainMode
  // Columns sharing a tag get one merged domain, so their bars and colors compare directly
  domain_group?: string
  // `bar` draws an in-cell proportional bar; `both` keeps the host's cell color as well
  render_as?: `fill` | `bar` | `both`
  // Ring the column's best cell (needs `better` to know which end wins)
  highlight_best?: boolean
  // Per-column filter control shown in the header. `auto` picks numeric/category/text
  // from the data; false suppresses it for that column.
  filter?: `auto` | `numeric` | `text` | `category` | false
  // Stick to an edge while scrolling sideways. Users can re-pin from the header context menu
  // (stored as column_prefs[id].pinned).
  pin?: PinSide
  // false hides the column by default: the column picker can show it, and its Reset hides it
  // again. Without a bound hidden_columns, these columns are the hidden ones.
  visible?: boolean
  sortable?: boolean
  // Fixed bounds for drag and keyboard resizing (default 50 and 500 px)
  min_width?: number
  max_width?: number
  // When true, the column picker's checkbox is greyed out, so users can't toggle the column
  disabled?: boolean
  style?: string
  cell_style?: string
} & (
  | { id: Extract<keyof Row, string> }
  | { key: Extract<keyof Row, string> }
  | { cell: CellSnippet<Row> }
)

// Arguments passed to cell snippet renderers
export type CellSnippetArgs<Row extends object = RowData> = {
  row: Row
  col: Column<Row>
  val: CellVal
}
export type CellSnippet<Row extends object = RowData> = Snippet<[CellSnippetArgs<Row>]>

export type RowId = string | number

// Statistics a summary row can show. Each names a field of ColumnStats.
export type SummaryStat = `mean` | `median` | `min` | `max` | `count`

// Per-column user tuning, keyed by column ID, bound as one `column_prefs` prop so hosts can
// persist all of it (widths, pins, filters) as a single blob. Hosts may store their own
// fields beside these: the table copies unknown ones through untouched.
export type ColumnPrefs = {
  width?: number
  // null unpins a column its config pins
  pinned?: PinSide | null
  better?: `higher` | `lower`
  datetime_format?: DateTimeFormatMode
  filter?: ColumnFilterValue
}

// One sort key: a column id for DataTable's `sort`, a row property for sort_table_rows
export type SortDir = `asc` | `desc`
export type TableSort = { column: string; dir: SortDir }

// Sort hint configuration (string for simple text, object for full control)
export type SortHint =
  | string
  | {
      text: string
      position?: `top` | `bottom`
      permanent?: boolean
      style?: string
      class?: ClassValue
    }

// Pagination configuration (boolean to enable, object for full control)
export type Pagination =
  | boolean
  | {
      page_size?: number
      page_sizes?: number[]
      on_page_size_change?: (page_size: number) => void
    }

// Row virtualization. overscan: extra rows rendered past each viewport edge. min_window:
// minimum rows kept in the DOM, also the render count when the container size is unknown (SSR).
export type VirtualScroll = boolean | { overscan?: number; min_window?: number }

// Search configuration (boolean to enable, object for full control).
// keys: row property names to match against; defaults to every column's data key (hidden
// columns included, row style/class and other fields not). fuzzy: also match query terms as
// in-order character subsequences (e.g. "mdla" matches "Model A").
export type Search =
  | boolean
  | { placeholder?: string; expanded?: boolean; keys?: string[]; fuzzy?: boolean }

// A cell's fill and the text color that reads on it; null leaves the table's own
export type CellColor = { bg: string | null; text: string | null }
export const NULL_CELL_COLOR: CellColor = { bg: null, text: null }

// Numeric summary of one column over the rows left after search and filters, shared by
// summary rows, best-cell rings, data bars and host coloring (DataTable's column_color).
export type ColumnStats = {
  min: number
  max: number
  // Smallest value above zero (a log scale's lower end), null when there is none
  min_positive: number | null
  q_lo: number // 5th percentile
  q_hi: number // 95th percentile
  mean: number
  median: number | null
  count: number
}

// What DataTable's column_color receives: the column's extrema and resolved domain
export type ColorStats = Pick<ColumnStats, `min` | `max` | `min_positive`> & {
  domain: [number, number]
}

// Value at sorted position `kth` by partial sorting (Hoare quickselect), in place
const quickselect = (values: number[], kth: number): number => {
  let left = 0
  let right = values.length - 1
  while (left < right) {
    const pivot = values[(left + right) >>> 1]
    let scan_lo = left
    let scan_hi = right
    while (scan_lo <= scan_hi) {
      while (values[scan_lo] < pivot) scan_lo++
      while (values[scan_hi] > pivot) scan_hi--
      if (scan_lo <= scan_hi) {
        const tmp = values[scan_lo]
        values[scan_lo] = values[scan_hi]
        values[scan_hi] = tmp
        scan_lo++
        scan_hi--
      }
    }
    if (kth <= scan_hi) right = scan_hi
    else if (kth >= scan_lo) left = scan_lo
    else return values[kth]
  }
  return values[kth]
}

// Linearly interpolated quantile of unsorted values. Partially sorts `values` in place.
function quantile_unordered(values: number[], point_value: number): number {
  const idx = (values.length - 1) * point_value
  const lower = Math.floor(idx)
  const upper = Math.ceil(idx)
  const lo_val = quickselect(values, lower)
  if (upper === lower) return lo_val
  const hi_val = quickselect(values, upper)
  const frac = idx - lower
  // Weighting both ends avoids overflowing hi - lo. For midpoints, add before halving
  // to preserve subnormals when the sum is finite; otherwise keep the weighted form.
  const sum = lo_val + hi_val
  return frac === 0.5 && Number.isFinite(sum)
    ? sum / 2
    : lo_val * (1 - frac) + hi_val * frac
}

export function compute_column_stats(
  values: (number | null | undefined)[],
  // Quantiles (up to six quickselect passes) only serve quantile domains and medians
  with_quantiles = true,
): ColumnStats | null {
  // Collect and reduce in one pass rather than allocating another array with `.filter()`
  const nums: number[] = []
  let sum = 0
  let lowest = Infinity
  let highest = -Infinity
  let lowest_positive = Infinity
  for (const val of values) {
    if (typeof val !== `number` || !Number.isFinite(val)) continue
    nums.push(val)
    sum += val
    if (val < lowest) lowest = val
    if (val > highest) highest = val
    if (val > 0 && val < lowest_positive) lowest_positive = val
  }
  if (nums.length === 0) return null
  // Running mean only when the plain sum overflowed (~1.8e308), so huge values stay finite
  let mean = sum / nums.length
  if (!Number.isFinite(mean)) {
    mean = 0
    for (const [idx, val] of nums.entries()) mean += (val - mean) / (idx + 1)
  }
  // quantile_unordered partially sorts nums in place, which nothing else reads
  return {
    min: lowest,
    max: highest,
    min_positive: lowest_positive === Infinity ? null : lowest_positive,
    q_lo: with_quantiles ? quantile_unordered(nums, 0.05) : lowest,
    q_hi: with_quantiles ? quantile_unordered(nums, 0.95) : highest,
    mean,
    median: with_quantiles ? quantile_unordered(nums, 0.5) : null,
    count: nums.length,
  }
}

export function resolve_domain(
  stats: ColumnStats,
  mode: DomainMode = `minmax`,
): [number, number] {
  if (mode === `diverging`) {
    const reach = Math.max(Math.abs(stats.min), Math.abs(stats.max)) || 1
    return [-reach, reach]
  }
  if (mode === `quantile` && stats.q_lo < stats.q_hi) return [stats.q_lo, stats.q_hi]
  return [stats.min, stats.max]
}

// Props of <DataTable>. Exported so wrapping components (e.g. a heatmap table) can extend them.
export type DataTableProps<
  Row extends object = RowData,
  Prefs extends ColumnPrefs = ColumnPrefs,
> = HTMLAttributes<HTMLDivElement> & {
  // Hold large datasets in $state.raw: a deep $state proxy routes every cell read through a
  // signal. Replace, don't mutate.
  data: Row[]
  // Discovered from the first 50 rows' keys when omitted
  columns?: Column<Row>[]
  sort_hint?: SortHint
  cell?: CellSnippet<Row>
  // Extra toolbar content, after the built-in buttons. Receives the export sources (text
  // of the visible columns over the exported rows) for hosts rendering their own export UI.
  controls?: Snippet<[{ sources: Record<TableExportFormat, () => string> }]>
  // Sort keys by column ID in priority order: empty keeps the data's order, several sort by
  // each in turn (Shift+click adds or removes one). Its initial value is the starting sort;
  // bind it to control or persist the sort.
  sort?: TableSort[]
  // Format passed to format_number for columns without their own `format`
  default_num_format?: string
  // Numeric cells and summary values. Defaults to the locale's grouping with up to 4
  // significant digits; pass e.g. a d3-format wrapper to honor `format` strings.
  format_number?: (num: number, format?: string) => string
  // Turns HTML-looking cells, labels and descriptions into markup for {@html}. Defaults to
  // escaped plain text: pass a sanitizer to render formatting (never the raw string).
  render_html?: (html: string) => string
  // Per-column cell colors: a value-to-color function, or undefined to leave the column
  // unpainted. Called again only when the column, its color stats or reactive state the hook
  // reads change, so a data update that moves no extremum repaints only the edited cells.
  column_color?: (
    col: Column<Row>,
    stats: ColorStats,
  ) => ((num: number | null) => CellColor) | undefined
  // Extra sections appended to a column's context menu (right-click a header or cell)
  menu_sections?: (col: Column<Row>) => CmdSection[]
  on_row_click?: (event: MouseEvent | KeyboardEvent, row: Row) => void
  on_row_double_click?: (event: MouseEvent, row: Row) => void
  // The row under the pointer, or null once it leaves the body; fires on row changes only
  on_row_hover?: (row: Row | null) => void
  // A row a linked view points at, shaded like the hovered row and scrolled into view.
  // Needs row_key.
  highlighted_row_id?: RowId | null
  // Column IDs in display order. Bindable so drag reorders persist.
  column_order?: string[]
  // Per-column user tuning (width, pin, better direction, date format, filter), keyed
  // by column ID. Bindable so hosts can persist and restore it.
  column_prefs?: Record<string, Prefs>
  // Built-in export menu (download a file); empty hides it. TSV goes to the clipboard.
  export_formats?: readonly TableExportFormat[]
  export_filename?: string
  on_export?: (detail: { format: TableExportFormat; text: string }) => void
  show_column_toggle?: boolean
  // Show a per-column filter funnel in each header (range, checklist or substring,
  // picked from the column's data). Individual columns opt out with `filter: false`.
  show_filters?: boolean
  // Append summary rows for every numeric column, computed over the rows left after
  // search and filters. `true` shows mean; pass an array to pick and order the stats.
  summary?: boolean | SummaryStat[]
  // Row height preset, driving --table-cell-padding
  density?: `compact` | `cosy` | `comfortable`
  // Make cells keyboard-navigable: arrows move the active cell, Shift+arrow extends the
  // selection, Alt+Left/Right moves a column. Off by default so tables that only display
  // data don't add a tab stop; rows with on_row_click keep their own row-level keys.
  keyboard_cells?: boolean
  search?: Search
  // Current search query. Bindable so parents can control or persist it.
  search_query?: string
  show_row_select?: boolean
  pagination?: Pagination
  // Opt-in row virtualization: only rows near the viewport render, with spacer rows
  // preserving scroll geometry, so DOM size stays bounded for any data length.
  // Inactive when pagination is enabled.
  virtual?: VirtualScroll
  // Required for selection; identifies rows across sorting and data replacement. Without
  // it rows are keyed by object identity, so a new object for a row remounts that row:
  // pass it for live data that replaces row objects, to update their cells in place.
  row_key?: Extract<keyof Row, string> | ((row: Row) => RowId)
  // Row reorder duration in ms; disabled for reduced motion and virtualized tables.
  row_animation_ms?: number
  selected_ids?: RowId[]
  // Read-only output: every row left after search and filters, in the current sort order
  // and across all pages (bind it to export or pick from what the table shows)
  visible_rows?: Row[]
  // Hidden column IDs. While undefined, the columns with `visible: false` are hidden (and
  // follow column changes); the first toggle writes the full list. Bindable for persistence:
  // bind an undefined state to start from the defaults.
  hidden_columns?: string[]
  scroll_style?: string
  // Inline styles for the root container (merged with rest.style)
  root_style?: string
  // Show a row number column as the first column
  show_row_numbers?: boolean
  // Offer a higher/lower-is-better toggle in the context menu of numeric columns
  allow_better_toggle?: boolean
  // Offer pin left / pin right / unpin in every column's context menu
  allow_pinning?: boolean
  // Toolbar visibility: on hover/focus (default), always, or never
  show_controls?: `hover` | `always` | `never`
  // Attributes spread onto the toolbar <section>; class merges with the built-in ones
  controls_props?: HTMLAttributes<HTMLElement>
  // Keep the toolbar shown, e.g. while a host's own pane in it is open
  controls_active?: boolean
  // The root .table-container element. Bindable for hosts resolving styles against it.
  container_el?: HTMLDivElement
}
