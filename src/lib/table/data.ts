// Headless (DOM-free, unit-testable) row logic for DataTable: numeric cell reading,
// sorting, search/filter predicates and date-time parsing/formatting.
import {
  escape_html,
  fuzzy_match,
  HTML_ENTITY_SRC,
  html_to_text,
  HTML_TAG_SRC,
} from '../utils'
import { type CellReaders, default_is_missing } from './filter'
import type { CellVal, Column, DateTimeFormatMode, RowData } from './data-table'

const grapheme_segmenter = new Intl.Segmenter(`en`, { granularity: `grapheme` })

// Columns discovered from the first rows when the caller passes none
export const discover_columns = <Row extends object>(rows: Row[]): Column<Row>[] => {
  const seen = new Set<string>()
  for (const row of rows.slice(0, 50))
    for (const key of Object.keys(row))
      if (key !== `style` && key !== `class`) seen.add(key)
  return [...seen].map((key) => ({ id: key as Extract<keyof Row, string>, label: key }))
}

// Head and tail of a long cell string for a middle ellipsis, split on graphemes so combining
// marks and emoji aren't torn apart. Strings at or below MIDDLE_ELLIPSIS_MIN_LENGTH render whole.
export const MIDDLE_ELLIPSIS_MIN_LENGTH = 16
export const middle_ellipsis_parts = (text: string): [string, string] => {
  const chars = Array.from(grapheme_segmenter.segment(text), ({ segment }) => segment)
  const split_at = chars.length - Math.min(8, Math.floor(chars.length / 2))
  return [chars.slice(0, split_at).join(``), chars.slice(split_at).join(``)]
}

// Missing values, NaN and invalid dates render as n/a, sort to the bottom and never match a
// category filter: the table widgets' own missing-cell test
export const is_invalid = default_is_missing

const HTML_MARKUP_RE = new RegExp(`${HTML_TAG_SRC}|${HTML_ENTITY_SRC}`, `i`)
// Distinguish actual tags/entities from ordinary comparison and ampersand text so plain
// strings still receive middle ellipsis and a direct data-sort-value.
export const is_html_str = (val: unknown): val is string =>
  typeof val === `string` && HTML_MARKUP_RE.test(val)

// A decimal number, optionally followed by an uncertainty ("1.23 ± 0.05", "2.890(8)"). Not
// Number() alone: it reads hex/binary/octal literals, so a "0x1f" ID would sort and color as 31.
// The mantissa alternatives never overlap: `\d+\.?\d*` split a digit run between its two
// quantifiers in O(n²) ways, so a 30k-digit cell ending in a letter took over a second.
const NUMERIC_WITH_ERROR_RE =
  /^\s*(?<numeric>[-+−]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+−]?\d+)?)\s*(?:(?:±|\+[-−]|\().*)?$/s
// Either attribute quote: a single-quoted value was read as absent and sorted by the text
const DATA_SORT_VALUE_RE = /data-sort-value=(?:"(?<double>[^"]*)"|'(?<single>[^']*)')/

// Plain text of a cell: markup stripped and decoded, dates as ISO, objects as JSON, invalid ``
export const cell_text = (val: CellVal): string => {
  if (is_invalid(val)) return ``
  // a number's text has no markup or padding, so skip the decode (2x for numeric searches)
  if (typeof val === `number`) return String(val)
  if (val instanceof Date) return val.toISOString()
  if (typeof val === `object`) return JSON.stringify(val)
  return html_to_text(String(val)).trim()
}

// undefined without a data-sort-value, null for a blank one (Number('') is 0, which would
// sort and color the cell as zero)
const get_data_sort_value = (val: string): string | null | undefined => {
  const groups = DATA_SORT_VALUE_RE.exec(val)?.groups
  const captured = groups?.double ?? groups?.single
  return captured?.trim() === `` ? null : captured
}

// Finite reading of a regex's `numeric` group in plain text, else null
const match_number = (regex: RegExp, text: string): number | null => {
  const numeric_str = regex.exec(text)?.groups?.numeric
  const num = numeric_str === undefined ? NaN : Number(numeric_str.replaceAll(`−`, `-`))
  return Number.isFinite(num) ? num : null
}

// A string cell's sort key: its data-sort-value (null when blank, which has no fallback to the
// text either), else its visible text decoded once
const sort_text = (val: string): string | null => {
  const sort_attr = get_data_sort_value(val)
  return sort_attr === undefined ? html_to_text(val).trim() : sort_attr
}

// The one numeric reading of a cell, shared by sorting, coloring, filters and summaries: an
// explicit data-sort-value wins, then the visible text minus uncertainty ("1.23 ± 0.05").
export function parse_numeric_val(val: CellVal): number | null {
  if (typeof val === `number`) return Number.isFinite(val) ? val : null
  if (typeof val !== `string`) return null
  const text = sort_text(val)
  return text === null ? null : match_number(NUMERIC_WITH_ERROR_RE, text)
}

// A number with a unit or other suffix ("1.5 eV", "-3 GPa"), not a version, IP, thousands
// separator (suffix starting `.`/`,`) or radix prefix (0x1f), which keep the text order
const LEADING_NUMBER_RE =
  /^\s*(?![-+−]?0[xXbBoO])(?<numeric>[-+−]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+−]?\d+)?)\s*[^\d\s.,]/

// Sort key only ([number, full text]; colors and filters still read these cells as text): the
// collator compared digit runs as integers, so 1.5 eV sorted after 1.25 eV, -1 GPa before -3 GPa
const leading_number_key = (text: string): [number, string] | null => {
  const num = match_number(LEADING_NUMBER_RE, text)
  return num === null ? null : [num, text]
}

type SortVal = string | number | [number, string] | null

// Sorts on the same rendered text search/filters/export use: raw values sorted `<b>Mango</b>`
// under `<`, and booleans/objects broke the total order. A data-sort-value that isn't a number
// still overrides the visible text. ISO date/time text sorts by its instant: as text, `T09:00`
// and ` 10:00` or two UTC offsets ordered wrongly. null marks a missing sort key, as does
// blank text: as `` it rose above every number in a descending numeric column.
const get_sort_val = (val: CellVal): SortVal => {
  if (is_invalid(val)) return null
  if (val instanceof Date) return val.getTime()
  // ±Infinity sort as numbers at the ends: as text "-Infinity" landed after every number
  if (typeof val === `number`) return val
  // booleans and objects: parse_numeric_val reads only numbers and strings
  if (typeof val !== `string`) return cell_text(val)
  const text = sort_text(val)
  if (!text) return null
  return (
    match_number(NUMERIC_WITH_ERROR_RE, text) ??
    parse_datetime_text(text) ??
    leading_number_key(text) ??
    text
  )
}

export type SortCriterion = { key: string; ascending: boolean }
const sort_collator = new Intl.Collator(undefined, { numeric: true, sensitivity: `base` })

// Comparator over one criterion's sort keys: missing sort keys sink to the bottom regardless
// of direction, numbers sort before strings, strings compare natural-order and
// case-insensitively. Unit-suffixed cells rank by their number, ties going to a bare number,
// then their text. 0 lets the next criterion decide.
function compare_sort_vals(
  sort_val1: SortVal,
  sort_val2: SortVal,
  ascending: boolean,
): number {
  // both missing ranks them equally low, so let the next criterion break the tie
  if (sort_val1 === null && sort_val2 === null) return 0
  if (sort_val1 === null || sort_val2 === null) return sort_val1 === null ? 1 : -1
  const modifier = ascending ? 1 : -1
  const key1 = typeof sort_val1 === `object` ? sort_val1[0] : sort_val1
  const key2 = typeof sort_val2 === `object` ? sort_val2[0] : sort_val2
  if (typeof key1 === `string` && typeof key2 === `string`) {
    return sort_collator.compare(key1, key2) * modifier
  }
  if (typeof key1 !== typeof key2) {
    // number<string is false both ways, breaking the comparator: numbers sort first
    return (typeof key1 === `number` ? -1 : 1) * modifier
  }
  if (key1 !== key2) return key1 < key2 ? -modifier : modifier
  const text1 = typeof sort_val1 === `object` ? sort_val1[1] : ``
  const text2 = typeof sort_val2 === `object` ? sort_val2[1] : ``
  return sort_collator.compare(text1, text2) * modifier
}

// Parse each distinct cell once per sort, not on every O(n log n) comparison, and read each
// row's keys up front so comparisons index arrays rather than re-reading cells (a 50k-row sort
// went 67 -> 15 ms). The cache is local to this operation, so edits to rows, objects and
// Dates are read on the next sort.
export function sort_table_rows<Row extends RowData>(
  rows: Row[],
  criteria: SortCriterion[],
): Row[] {
  const values = new Map<CellVal, SortVal>()
  const sort_value = (val: CellVal): SortVal => {
    if (typeof val === `number`) return get_sort_val(val)
    let parsed = values.get(val)
    if (parsed === undefined) values.set(val, (parsed = get_sort_val(val)))
    return parsed
  }
  const keyed = criteria.map(({ key, ascending }) => ({
    ascending,
    vals: rows.map((row) => sort_value(row[key])),
  }))
  return rows
    .map((_, idx) => idx)
    .toSorted((idx_a, idx_b) => {
      for (const { ascending, vals } of keyed) {
        const cmp = compare_sort_vals(vals[idx_a], vals[idx_b], ascending)
        if (cmp !== 0) return cmp
      }
      return 0
    })
    .map((idx) => rows[idx])
}

// === Search and per-column filters ===

// Substring match of a lower-cased query, or with fuzzy also subsequence ("mdla" in "model a")
export const text_matches_query = (text: string, query: string, fuzzy = false): boolean =>
  text.includes(query) || (fuzzy && fuzzy_match(query, text))

// How filters (compile_filter and the column filter panel) read a cell: markup stripped,
// numbers through the same parse that sorting and coloring use, so "1.23 ± 0.05" filters as
// 1.23. Missing cells use the widgets' default, which is_invalid is.
export const cell_readers: CellReaders<CellVal> = {
  to_text: cell_text,
  to_number: parse_numeric_val,
}

// === Date/time columns ===

type DateTimeColumnKind = `date` | `time` | `datetime`
export const DATETIME_MODES_BY_KIND: Record<DateTimeColumnKind, DateTimeFormatMode[]> = {
  date: [`date`, `relative`],
  time: [`time`],
  datetime: [`date`, `time`, `datetime`, `iso`, `relative`],
}
export const DATETIME_MODE_LABELS: Record<DateTimeFormatMode, string> = {
  date: `Date`,
  time: `Time`,
  datetime: `Date + time`,
  iso: `ISO`,
  relative: `Since now`,
}

const DATE_ONLY_RE = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/
const DATE_TIME_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/

// Epoch seconds (2001–2286) or milliseconds; anything else is not a timestamp
const normalize_timestamp = (val: number): number | null => {
  if (!Number.isFinite(val)) return null
  const abs = Math.abs(val)
  if (abs >= 1e12 && abs < 1e14) return val
  if (abs >= 1e9 && abs < 1e12) return val * 1000
  return null
}

// Epoch ms of decoded, trimmed ISO date/time text, else null
const parse_datetime_text = (clean: string): number | null => {
  if (!DATE_TIME_RE.test(clean)) return null
  const [year, month, day] = clean.slice(0, 10).split(`-`).map(Number)
  // Date constructors normalize impossible dates (February 30 becomes March 1) and the
  // multi-argument form maps years 00–99 to 1900–1999. Validate the calendar date explicitly.
  const calendar = new Date(0)
  calendar.setFullYear(year, month - 1, day)
  calendar.setHours(0, 0, 0, 0)
  if (
    calendar.getFullYear() !== year ||
    calendar.getMonth() !== month - 1 ||
    calendar.getDate() !== day
  )
    return null
  // Bare dates denote local midnight; Date.parse would interpret them as UTC.
  if (DATE_ONLY_RE.test(clean)) return calendar.getTime()
  const parsed = Date.parse(
    clean.replace(` `, `T`).replace(/\.(?<millis>\d{3})\d+/, `.$<millis>`),
  )
  return Number.isNaN(parsed) ? null : parsed
}

// Epoch milliseconds for a cell, or null when it isn't a date. Numbers and numeric strings
// only count as timestamps in columns that declare a datetime format.
export const parse_datetime_val = (
  val: CellVal,
  col: Omit<Column, `cell`>,
): number | null => {
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val.getTime()
  if (typeof val === `number`)
    return col.datetime_format ? normalize_timestamp(val) : null
  if (typeof val !== `string`) return null
  const text = html_to_text(val).trim()
  const parsed_text = parse_datetime_text(text)
  if (parsed_text !== null) return parsed_text
  if (!col.datetime_format) return null
  return normalize_timestamp(Number(get_data_sort_value(val) ?? text))
}

// A column's date/time kind from its config, else a sample: any value with a time of day
// makes it `datetime`, bare dates only `date`.
export function infer_datetime_kind(
  col: Omit<Column, `cell`>,
  sample: CellVal[],
): DateTimeColumnKind | null {
  const mode = col.datetime_format
  if (mode) return mode === `date` || mode === `time` ? mode : `datetime`
  let has_date_value = false
  for (const val of sample) {
    if (parse_datetime_val(val, col) === null) continue
    if (typeof val === `string` && DATE_ONLY_RE.test(html_to_text(val).trim()))
      has_date_value = true
    else return `datetime`
  }
  return has_date_value ? `date` : null
}

const pad2 = (val: number) => String(val).padStart(2, `0`)

// "2h 5m ago" / "3d from now": up to three leading non-zero units, minute granularity
function format_since(timestamp: number, now_ms: number): string {
  const diff = now_ms - timestamp
  let remaining_minutes = Math.floor(Math.abs(diff) / 60_000)
  const parts: string[] = []
  const units = [
    [`y`, 365 * 24 * 60],
    [`mo`, 30 * 24 * 60],
    [`w`, 7 * 24 * 60],
    [`d`, 24 * 60],
    [`h`, 60],
    [`m`, 1],
  ] as const
  for (const [suffix, minutes_per_unit] of units) {
    const value = Math.floor(remaining_minutes / minutes_per_unit)
    // the minutes term only fills in when no coarser unit rendered, so no trailing 0m
    if (value > 0 || (suffix === `m` && parts.length === 0))
      parts.push(`${value}${suffix}`)
    remaining_minutes -= value * minutes_per_unit
    if (parts.length >= 3) break
  }
  return `${parts.join(` `)} ${diff >= 0 ? `ago` : `from now`}`
}

// Local-time rendering of an epoch timestamp in the given mode. Not toISOString() for the
// date/time modes, which would shift to UTC.
export function format_datetime(
  timestamp: number,
  mode: DateTimeFormatMode,
  now_ms = Date.now(),
): string {
  if (mode === `relative`) return format_since(timestamp, now_ms)
  const stamp = new Date(timestamp)
  if (mode === `iso`) return stamp.toISOString()
  const date = `${stamp.getFullYear()}-${pad2(stamp.getMonth() + 1)}-${pad2(stamp.getDate())}`
  const time = `${pad2(stamp.getHours())}:${pad2(stamp.getMinutes())}`
  return mode === `date` ? date : mode === `time` ? time : `${date} ${time}`
}

// DataTable's default number formatter: integers in full, other numbers to 3 significant
// digits. Digits group only from 5 on (`min2`), so years and IDs read 1766, not 1,766.
// `format` strings are host-defined, so ignored here.
export const default_format_number = (num: number): string =>
  num.toLocaleString(undefined, {
    useGrouping: `min2`,
    ...(Number.isInteger(num) ? {} : { maximumSignificantDigits: 3 }),
  })

// DataTable's default render_html: the markup's visible text, escaped. Safe for {@html}
// without a sanitizer, at the cost of dropping formatting.
export const escape_markup = (html: string): string => escape_html(html_to_text(html))

export const is_plain_object = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== `object` || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// A boolean-or-object option merged over defaults, null when off
export const with_defaults = <Defaults extends object, Config extends object>(
  option: boolean | Config | undefined,
  defaults: Defaults,
): (Defaults & Config) | null =>
  option
    ? ({ ...defaults, ...(typeof option === `object` ? option : {}) } as Defaults &
        Config)
    : null

// Keeps returning the first of a run of JSON-equal arguments, so a caller that rebuilds an
// equal value on every read hands its consumers one identity. JSON values only.
export function same_while_equal<T>(): (value: T) => T {
  let last: { key: string; value: T } | undefined
  return (value) => {
    const key = JSON.stringify(value)
    if (last?.key !== key) last = { key, value }
    return last.value
  }
}
