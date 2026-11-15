// Binary-prefixed file size, e.g. 1536 -> `1.5 KiB`.
const BYTE_UNITS = [`B`, `KiB`, `MiB`, `GiB`, `TiB`, `PiB`] as const
export const format_bytes = (bytes?: number): string => {
  if (bytes === undefined || !Number.isFinite(bytes)) return `Unknown`
  // One decimal below 10, whole numbers from there: `1.5 KiB`, `385 MiB`, not `384.63 MiB`
  const shown = (value: number): number =>
    Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value)
  // Bytes are integral; a fractional input (an averaged size) must not print as `1023.5 B`
  let [value, unit_idx] = [Math.round(bytes), 0]
  // Step up on the displayed (rounded) value so 1048575 reads `1 MiB`, not `1024 KiB`
  while (Math.abs(shown(value)) >= 1024 && unit_idx < BYTE_UNITS.length - 1) {
    value /= 1024
    unit_idx++
  }
  return `${unit_idx ? shown(value) : value} ${BYTE_UNITS[unit_idx]}`
}

export interface FormatNumOptions {
  // significant digits non-integers round to (and integers, with round_integers)
  digits?: number
  // [low, high]: scientific notation when the rounded magnitude is >= high or below low
  // (zero never is); omit for plain notation throughout
  sci_range?: readonly [low: number, high: number]
  // digit grouping: `min2` groups from 5 digits on, so years and IDs read 1766, not 1,766
  grouping?: boolean | `min2`
  // Intl locale; the host's by default
  locale?: string
  // text for NaN and ±Infinity; Intl's own (`NaN`, `∞`, `-∞`) by default
  non_finite?: string
}

// Intl.NumberFormat construction costs far more than formatting, and tables call this per cell
const formatters = new Map<string, Intl.NumberFormat>()
const formatter = (
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat => {
  const key = `${locale}|${JSON.stringify(options)}`
  let cached = formatters.get(key)
  if (!cached) {
    cached = new Intl.NumberFormat(locale, options)
    formatters.set(key, cached)
  }
  return cached
}

// Number formatting for display: `digits` significant digits (integers in full), optional
// scientific notation outside `sci_range` (as `1.23e+6`, `4.56e-4`, mantissa unpadded),
// Intl digit grouping and locale. -0 prints as 0.
export const format_num = (value: number, options: FormatNumOptions = {}): string => {
  const { digits = 3, sci_range, grouping = `min2`, locale, non_finite } = options
  if (!Number.isFinite(value) && non_finite !== undefined) return non_finite
  const keep_integer = Number.isInteger(value)
  // Pick notation on the rounded value: 999999.9 at 4 digits is 1.000e6, not ungrouped 1000000
  const rounded = keep_integer ? value : Number(value.toPrecision(digits))
  if (rounded === 0) value = 0 // Intl would print -0 as `-0`
  const magnitude = Math.abs(rounded)
  if (
    sci_range &&
    magnitude > 0 &&
    Number.isFinite(value) &&
    (magnitude >= sci_range[1] || magnitude < sci_range[0])
  ) {
    const parts = formatter(locale, {
      notation: `scientific`,
      maximumSignificantDigits: digits,
    }).formatToParts(value)
    let [mantissa, exponent] = [``, `+`]
    for (const { type, value: text } of parts) {
      if (type === `exponentMinusSign`) exponent = `-`
      else if (type === `exponentInteger`) exponent += text
      else if (type !== `exponentSeparator`) mantissa += text
    }
    return `${mantissa}e${exponent}`
  }
  return formatter(locale, {
    useGrouping: grouping === true ? `always` : grouping,
    ...(keep_integer
      ? { maximumFractionDigits: 0 }
      : { maximumSignificantDigits: digits }),
  }).format(value)
}

// === CSV ===

export type CsvCell = number | string | boolean | null | undefined

// Quote a CSV field per RFC 4180. A lone CR counts: readers treat CR, LF and CRLF alike
// as record separators, so an unquoted CR splits one record into two.
// Preserves cell data, including formula prefixes. Sanitize untrusted spreadsheet exports
// at the call site for the target application; RFC quoting does not prevent formula execution.
export const escape_csv_field = (value: CsvCell): string => {
  const field = String(value ?? ``)
  if (!/[",\n\r]/.test(field)) return field
  return `"${field.replaceAll(`"`, `""`)}"`
}

// One CSV record from its cells
export const csv_line = (cells: readonly CsvCell[]): string =>
  cells.map(escape_csv_field).join(`,`)

// Explicit columns support sparse rows and header-only exports; otherwise use first-row keys.
export function rows_to_csv(
  rows: readonly Record<string, CsvCell>[],
  headers: readonly string[] = Object.keys(rows[0] ?? {}),
): string {
  if (rows.length === 0 && headers.length === 0) return ``
  return [
    csv_line(headers),
    ...rows.map((row) => csv_line(headers.map((key) => row[key]))),
  ].join(`\n`)
}

// === Statistics ===

export interface StatItem {
  label: string
  value: string | number
  unit?: string
  delta?: number
  // Direction alone does not imply improvement (e.g. increasing cost or latency).
  delta_tone?: `positive` | `negative`
  hint?: string
}

// StatGrid's number format, for tiles and changes: 4 significant digits (integers in full),
// scientific `1.00e+6` from 1e6 and below 1e-3, en-US grouping, `n/a` for NaN and ±Infinity
export const STAT_NUM_FORMAT: FormatNumOptions = {
  digits: 4,
  sci_range: [1e-3, 1e6],
  grouping: true,
  locale: `en-US`,
  non_finite: `n/a`,
}

// Signed change with a direction glyph; the glyph carries the sign, never color alone.
export const format_stat_delta = (delta: number): string =>
  !Number.isFinite(delta)
    ? `n/a`
    : `${delta > 0 ? `▲` : delta < 0 ? `▼` : `▸`} ${format_num(Math.abs(delta), STAT_NUM_FORMAT)}`

export const stat_delta_label = (delta: number): string =>
  !Number.isFinite(delta)
    ? `change unavailable`
    : `change ${delta > 0 ? `up` : delta < 0 ? `down` : `flat`} ${format_num(Math.abs(delta), STAT_NUM_FORMAT)}`
