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
  // significant digits non-integers round to; integers print in full in plain notation
  digits?: number
  // [low, high]: scientific notation when the rounded magnitude is >= high or below low
  // (zero and non-finite values never are); omit for plain notation throughout
  sci_range?: readonly [low: number, high: number]
  // digit grouping: `min2` groups from 5 digits on, so years and IDs read 1766, not 1,766
  grouping?: boolean | `min2`
  // Intl locale; the host's by default
  locale?: string
}

// Intl.NumberFormat construction costs far more than formatting, and tables call this per
// cell, so formatters are cached under a string key of the options that shape them
const formatters = new Map<string, Intl.NumberFormat>()
const cached_format = (
  key: string,
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat => {
  let format = formatters.get(key)
  if (!format) formatters.set(key, (format = new Intl.NumberFormat(locale, options)))
  return format
}

// Number formatting for display: `digits` significant digits (integers in full), optional
// scientific notation outside `sci_range` (as `1.23e+6`, `4.56e-4`, mantissa unpadded),
// Intl digit grouping and locale. -0 prints as 0, NaN and ±Infinity as Intl's `NaN`, `∞`, `-∞`.
export const format_num = (value: number, options: FormatNumOptions = {}): string => {
  const { digits = 3, sci_range, grouping = `min2`, locale } = options
  const keep_integer = Number.isInteger(value)
  if (value === 0) value = 0 // Intl would print -0 as `-0`
  // Notation is picked on Intl's own rounding (half away from zero on the shortest decimal),
  // so it matches the digits shown: 9.995 at 3 digits shows 10, not toPrecision's 9.99
  const magnitude =
    sci_range && !keep_integer
      ? Math.abs(
          Number(
            cached_format(`round|${digits}`, `en-US`, {
              useGrouping: false,
              maximumSignificantDigits: digits,
            }).format(value),
          ),
        )
      : Math.abs(value)
  // NaN, and ±Infinity (Intl's `∞` parses to NaN), fail both comparisons, so stay plain
  const sci =
    sci_range !== undefined &&
    magnitude > 0 &&
    (magnitude >= sci_range[1] || magnitude < sci_range[0])
  if (!sci) {
    return cached_format(
      `${locale}|${grouping}|${keep_integer ? `int` : digits}`,
      locale,
      keep_integer
        ? { useGrouping: grouping, maximumFractionDigits: 0 }
        : { useGrouping: grouping, maximumSignificantDigits: digits },
    ).format(value)
  }
  const parts = cached_format(`${locale}|sci|${digits}`, locale, {
    notation: `scientific`,
    maximumSignificantDigits: digits,
  }).formatToParts(value)
  let [mantissa, exponent, in_exponent] = [``, `+`, false]
  for (const { type, value: text } of parts) {
    if (type === `exponentSeparator`) in_exponent = true
    else if (type === `exponentMinusSign`) exponent = `-`
    else if (type === `exponentInteger`) exponent += text
    // RTL locales (ar-EG) wrap the exponent in bidi marks, which belong to Intl's `E`
    else if (!in_exponent) mantissa += text
  }
  return `${mantissa}e${exponent}`
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
