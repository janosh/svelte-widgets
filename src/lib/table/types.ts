// Shared types of the table building blocks. Tables keep their own row and cell models:
// these only describe what the column menu, filters, selection and exporters need.

// A column (or any other toggleable item) as ColumnPicker lists it. Hosts may pass richer
// objects; the picker preserves every extra field when it writes visibility back.
export type TableColumn = {
  // stable identity across reorders, renames and visibility changes
  id: string
  // plain-text name; render markup through ColumnPicker's `toggle_label` snippet
  label: string
  // columns sharing a group render under one collapsible section header
  group?: string
  // shown on hover over the column's toggle
  description?: string
  // undefined counts as visible
  visible?: boolean
  // reset baseline when a host keeps visibility elsewhere; defaults to `visible`
  default_visible?: boolean
  // greyed-out toggle the user cannot flip, e.g. a required column
  disabled?: boolean
}

export type FilterKind = `numeric` | `category` | `text`

// Active filter on one column: a numeric range (either end optional), a category
// allow-list, or a case-insensitive substring
export type ColumnFilterValue =
  | { kind: `numeric`; min?: number; max?: number }
  | { kind: `text`; text: string }
  | { kind: `category`; values: string[] }

// Which control a filter panel shows, the distinct values a category checklist offers and
// the range of the column's numbers (undefined when it has none)
export type FilterPanel = {
  kind: FilterKind
  choices: string[]
  extent?: { min: number; max: number }
}

// A cell by absolute (row, column) index in the host's sorted rows and visible columns
export type CellPos = { row: number; col: number }

// A table as plain text, the single extraction every text exporter builds on
export type TableMatrix = {
  headers: string[]
  rows: string[][]
  // per column; right-aligns numeric columns in Markdown and LaTeX. Missing entries count
  // as non-numeric.
  numeric?: boolean[]
}
