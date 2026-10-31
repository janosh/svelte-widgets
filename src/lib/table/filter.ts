// Headless per-column filtering: compiling a filter into a cell test, picking the control a
// column's filter panel shows, and the edits that panel makes. Hosts with their own cell
// semantics (markup, units, uncertainties) pass `to_text` / `to_number` / `is_missing` readers.
import type { ColumnFilterValue, FilterKind, FilterPanel } from './types'

// Typed by the host's cell value, so readers written for that type plug in directly
export type CellReaders<Val = unknown> = {
  // plain text for category and substring filters
  to_text?: (val: Val) => string
  // finite number for range filters, else null
  to_number?: (val: Val) => number | null
  // missing cells never match a category filter nor enter its checklist
  is_missing?: (val: Val) => boolean
}

// A decimal literal only: Number() alone reads hex/binary/octal, so a "0x1f" ID would
// filter as 31, and reads blank strings as 0
const DECIMAL_RE = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i

export const default_to_number = (val: unknown): number | null => {
  if (typeof val === `number`) return Number.isFinite(val) ? val : null
  if (typeof val !== `string`) return null
  const num = DECIMAL_RE.test(val.trim()) ? Number(val) : null
  return num !== null && Number.isFinite(num) ? num : null // `1e400` overflows to Infinity
}

export const default_to_text = (val: unknown): string => {
  if (typeof val === `string`) return val.trim()
  if (typeof val === `number`) return Number.isNaN(val) ? `` : String(val)
  if (typeof val === `boolean` || typeof val === `bigint`) return String(val)
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? `` : val.toISOString()
  if (val !== null && typeof val === `object`) return JSON.stringify(val)
  return `` // null, undefined, symbols and functions have no cell text
}

// null, undefined, NaN and invalid dates
export const default_is_missing = (val: unknown): boolean =>
  val == null ||
  (typeof val === `number` && Number.isNaN(val)) ||
  (val instanceof Date && Number.isNaN(val.getTime()))

// One cell test per filter, built once so per-row checks do no setup: a Set for category
// allow-lists, a pre-lowercased needle for substrings
export const compile_filter = <Val>(
  filter: ColumnFilterValue,
  {
    to_text = default_to_text,
    to_number = default_to_number,
    is_missing = default_is_missing,
  }: CellReaders<Val> = {},
): ((val: Val) => boolean) => {
  if (filter.kind === `numeric`) {
    const { min, max } = filter
    return (val) => {
      const num = to_number(val)
      return num !== null && (min == null || num >= min) && (max == null || num <= max)
    }
  }
  if (filter.kind === `category`) {
    const allowed = new Set(filter.values)
    return (val) => !is_missing(val) && allowed.has(to_text(val))
  }
  const needle = filter.text.toLowerCase()
  return (val) => to_text(val).toLowerCase().includes(needle)
}

// Above this many distinct values an auto-detected column gets a substring box instead of a
// checklist
export const CATEGORY_LIMIT = 40
const natural_order = new Intl.Collator(undefined, { numeric: true })
// Checklist order: numbers by value (the collator reads `-` as punctuation and orders 0.25
// after 0.5), ahead of other text in natural order, which keeps the order total
const sort_choices = (texts: Iterable<string>): string[] =>
  [...texts]
    .map((text) => ({ text, num: default_to_number(text) }))
    .toSorted((opt_a, opt_b) => {
      if (opt_a.num !== null && opt_b.num !== null) return opt_a.num - opt_b.num
      if (opt_a.num !== null || opt_b.num !== null) return opt_a.num === null ? 1 : -1
      return natural_order.compare(opt_a.text, opt_b.text)
    })
    .map(({ text }) => text)

export type FilterPanelOptions<Val = unknown> = CellReaders<Val> & {
  // `auto` picks numeric, then category, then text from the values
  kind?: FilterKind | `auto`
  // whether the column holds numbers; detected from the values when omitted
  numeric?: boolean
  // distinct-value cap for auto-detected checklists; explicit `category` columns are uncapped
  category_limit?: number
}

// Control kind, checklist choices and numeric extent for one column's filter panel. Pass
// unfiltered values so a filter never hides the choices or range needed to widen it.
export function filter_panel<Val>(
  values: Iterable<Val>,
  {
    kind = `auto`,
    numeric,
    to_text = default_to_text,
    to_number = default_to_number,
    is_missing = default_is_missing,
    category_limit = CATEGORY_LIMIT,
  }: FilterPanelOptions<Val> = {},
): FilterPanel {
  const seen = new Set<string>()
  let [min, max, all_numeric, overflow] = [Infinity, -Infinity, true, false]
  for (const val of values) {
    if (is_missing(val)) continue
    const num = to_number(val)
    if (num !== null) [min, max] = [Math.min(min, num), Math.max(max, num)]
    // blank cells are gaps in a numeric column, not text (they still list as blank)
    else if (all_numeric && to_text(val).trim() !== ``) all_numeric = false
    // past the cap the panel is a text box, so choices stop being collected
    if (overflow) continue
    seen.add(to_text(val))
    overflow = kind !== `category` && seen.size > category_limit
  }
  const choices = overflow ? [] : sort_choices(seen)
  const extent = min <= max ? { min, max } : undefined
  const is_numeric = numeric ?? (extent !== undefined && all_numeric)
  const detected = is_numeric ? `numeric` : choices.length > 0 ? `category` : `text`
  return { kind: kind === `auto` ? detected : kind, choices, extent }
}

// A numeric filter with neither bound, or a category filter allowing everything, is the same
// as no filter: both collapse to undefined so an active-filter indicator stays honest.
export function with_numeric_bound(
  current: ColumnFilterValue | undefined,
  bound: `min` | `max`,
  raw: string,
): ColumnFilterValue | undefined {
  const base = current?.kind === `numeric` ? current : { kind: `numeric` as const }
  const next = { ...base, [bound]: default_to_number(raw) ?? undefined }
  return next.min == null && next.max == null ? undefined : next
}

export function with_category_toggled(
  current: ColumnFilterValue | undefined,
  value: string,
  choices: readonly string[],
): ColumnFilterValue | undefined {
  const allowed = new Set(current?.kind === `category` ? current.values : choices)
  if (!allowed.delete(value)) allowed.add(value)
  // Values no row holds any more drop out, else they'd keep an allow-everything filter active
  const next = choices.filter((choice) => allowed.has(choice))
  return next.length === choices.length ? undefined : { kind: `category`, values: next }
}

// Rows passing every filter, with filters keyed by the row property they test
export const filter_rows = <Val, Row extends Record<string, Val>>(
  rows: readonly Row[],
  filters: Readonly<Record<string, ColumnFilterValue | undefined>>,
  readers: CellReaders<Val> = {},
): Row[] => {
  const tests = Object.entries(filters).flatMap(([key, filter]) =>
    filter ? [{ key, test: compile_filter(filter, readers) }] : [],
  )
  return rows.filter((row) => tests.every(({ key, test }) => test(row[key])))
}
