import { evict_oldest } from './utils'
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

export interface FormatLocaleOptions {
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
// cell, so formatters are cached under their locale and options
const formatters = new Map<string, Intl.NumberFormat>()
const cached_format = (
  locale: string | undefined,
  options: Intl.NumberFormatOptions,
): Intl.NumberFormat => {
  const key = JSON.stringify([locale, options])
  let format = formatters.get(key)
  if (!format) formatters.set(key, (format = new Intl.NumberFormat(locale, options)))
  return format
}

// === d3-format spec strings ===

// d3-format's grammar, [[fill]align][sign][symbol][0][width][,][.precision][~][type]
const SPEC_RE =
  /^(?:(?<fill>.)?(?<align>[<>=^]))?(?<sign>[+\-( ])?(?<symbol>[$#])?(?<zero>0)?(?<width>\d+)?(?<comma>,)?(?:\.(?<precision>\d+))?(?<trim>~)?(?<type>[a-z%])?$/i
// SI prefixes from yocto (1e-24) to yotta (1e24); `s` clamps to this range
const SI_PREFIXES = [
  `y`,
  `z`,
  `a`,
  `f`,
  `p`,
  `n`,
  `µ`,
  `m`,
  ``,
  `k`,
  `M`,
  `G`,
  `T`,
  `P`,
  `E`,
  `Z`,
  `Y`,
] as const
const MINUS = `−` // U+2212, as d3 writes it

// [digits, exponent] of finite, nonzero x at `precision` significant digits (all when
// omitted or 0): 1.23 -> [`123`, 0]
const exponent_parts = (x: number, precision?: number): [string, number] => {
  const text = precision ? x.toExponential(precision - 1) : x.toExponential()
  const e_idx = text.indexOf(`e`)
  const coefficient = text.slice(0, e_idx)
  return [
    coefficient.length > 1 ? coefficient[0] + coefficient.slice(2) : coefficient,
    Number(text.slice(e_idx + 1)),
  ]
}

// Set by format_si for the formatter that called it: the power of 1000 its SI prefix names,
// undefined when there is none (zero, ±Infinity)
let si_exponent: number | undefined
const format_si = (x: number, precision: number): string => {
  if (!Number.isFinite(x) || x === 0) {
    si_exponent = undefined
    return x.toPrecision(precision)
  }
  const [coefficient, exponent] = exponent_parts(x, precision)
  si_exponent = Math.max(-8, Math.min(8, Math.floor(exponent / 3))) * 3
  const int_len = exponent - si_exponent + 1
  const n_digits = coefficient.length
  if (int_len === n_digits) return coefficient
  if (int_len > n_digits) return coefficient + `0`.repeat(int_len - n_digits)
  if (int_len > 0) return `${coefficient.slice(0, int_len)}.${coefficient.slice(int_len)}`
  // below 1 yocto: re-round to the digits left after the leading zeros
  const [tail] = exponent_parts(x, Math.max(0, precision + int_len - 1))
  return `0.${`0`.repeat(-int_len)}${tail}`
}

// `precision` significant digits in plain notation, never exponential
const format_rounded = (x: number, precision: number): string => {
  if (!Number.isFinite(x) || x === 0) return `${x}`
  const [coefficient, exponent] = exponent_parts(x, precision)
  if (exponent < 0) return `0.${`0`.repeat(-exponent - 1)}${coefficient}`
  if (coefficient.length > exponent + 1) {
    return `${coefficient.slice(0, exponent + 1)}.${coefficient.slice(exponent + 1)}`
  }
  return coefficient + `0`.repeat(exponent - coefficient.length + 1)
}

// Integer in full; toString would go exponential from 1e21
const format_integer = (x: number): string => {
  const rounded = Math.round(x)
  return Math.abs(rounded) >= 1e21
    ? rounded.toLocaleString(`en`).replaceAll(`,`, ``)
    : rounded.toString(10)
}

// Formatters by type for |value|; `precision` is already clamped and defaulted
const FORMAT_TYPES: Record<string, (x: number, precision: number) => string> = {
  '%': (x, precision) => (x * 100).toFixed(precision),
  b: (x) => Math.round(x).toString(2),
  c: (x) => `${x}`,
  d: format_integer,
  e: (x, precision) => x.toExponential(precision),
  f: (x, precision) => x.toFixed(precision),
  g: (x, precision) => x.toPrecision(precision),
  o: (x) => Math.round(x).toString(8),
  p: (x, precision) => format_rounded(x * 100, precision),
  r: format_rounded,
  s: format_si,
  X: (x) => Math.round(x).toString(16).toUpperCase(),
  x: (x) => Math.round(x).toString(16),
}

// Drop insignificant trailing fraction zeros: 1.2000k -> 1.2k, 1.000e+3 -> 1e+3
const trim_zeros = (text: string): string => {
  let [dot_idx, last_zero] = [-1, -1]
  for (let idx = 1; idx < text.length; idx++) {
    const char = text[idx]
    if (char === `.`) [dot_idx, last_zero] = [idx, idx]
    else if (char === `0`) {
      if (dot_idx === 0) dot_idx = idx
      last_zero = idx
    } else if (!Number(char)) break // neither digit nor dot: the exponent or SI suffix starts
    else if (dot_idx > 0) dot_idx = 0
  }
  return dot_idx > 0 ? text.slice(0, dot_idx) + text.slice(last_zero + 1) : text
}

// Comma-group integer digits in threes, capped at `width` characters for zero padding
const group_thousands = (digits: string, width: number): string => {
  const chunks: string[] = []
  let [end, length, size] = [digits.length, 0, 3]
  while (end > 0 && size > 0) {
    if (length + size + 1 > width) size = Math.max(1, width - length)
    const start = end - size
    chunks.push(digits.slice(Math.max(0, start), end))
    end = start
    length += size + 1
    if (length > width) break
    size = 3
  }
  return chunks.toReversed().join(`,`)
}

// Compile a d3-format spec into a formatter, mirroring d3-format's default (en-US) locale
const compile_spec = (spec: string): ((value: number) => string) => {
  const groups = SPEC_RE.exec(spec)?.groups
  if (!groups) throw new Error(`format_num: invalid format spec "${spec}"`)
  const { symbol, width: width_str, precision: precision_str } = groups
  let [fill, align, zero, comma] = [
    groups.fill ?? ` `,
    groups.align ?? `>`,
    groups.zero !== undefined,
    groups.comma !== undefined,
  ]
  const sign = groups.sign ?? `-`
  const width = width_str === undefined ? undefined : Number(width_str)
  let precision = precision_str === undefined ? undefined : Number(precision_str)
  let trim = groups.trim !== undefined
  let type = groups.type ?? ``
  // `n` is `,g`; no type is `~g` at 12 significant digits unless a precision is given.
  // d3 also reads unknown types as `.12~g`, which would silently misformat a typo'd spec
  if (type === `n`) [comma, type] = [true, `g`]
  else if (type === ``) {
    precision ??= 12
    ;[trim, type] = [true, `g`]
  } else if (!(type in FORMAT_TYPES)) {
    throw new Error(
      `format_num: unknown type "${type}" in format spec "${spec}", expected one of ${Object.keys(FORMAT_TYPES).join(` `)} n or none`,
    )
  }
  // zero padding goes between sign and digits
  if (zero || (fill === `0` && align === `=`)) [zero, fill, align] = [true, `0`, `=`]

  const prefix =
    symbol === `$`
      ? `$`
      : symbol === `#` && /[boxX]/.test(type)
        ? `0${type.toLowerCase()}`
        : ``
  // the `$` currency symbol replaces the percent sign, as in d3's en-US locale
  const suffix = symbol !== `$` && /[%p]/.test(type) ? `%` : ``
  const format_type = FORMAT_TYPES[type]
  // types whose output can carry a fraction, exponent or SI prefix past the integer digits
  const maybe_suffix = /[defgprs%]/.test(type)
  // significant digits in [1, 21], fixed digits in [0, 20]
  const digits =
    precision === undefined
      ? 6
      : /[gprs]/.test(type)
        ? Math.max(1, Math.min(21, precision))
        : Math.max(0, Math.min(20, precision))

  return (value: number): string => {
    let [body, value_prefix, value_suffix] = [``, prefix, suffix]
    if (type === `c`) value_suffix = format_type(value, digits) + value_suffix
    else {
      // -0 is not below 0, but 1 / -0 is
      let negative = value < 0 || 1 / value < 0
      const is_nan = Number.isNaN(value)
      body = is_nan ? `NaN` : format_type(Math.abs(value), digits)
      if (trim) body = trim_zeros(body)
      // positive exponents drop d3's `+`, which only widens cells and ticks: 1.06e+29 -> 1.06e29,
      // and scientific zero (0e+0, 0.00e+0) is a plain 0
      body = type === `e` && value === 0 ? `0` : body.replace(`e+`, `e`)
      // a negative value that rounds to zero shows no sign, unless `+` asks for one
      if (negative && Number(body) === 0 && sign !== `+`) negative = false
      value_prefix =
        (negative
          ? sign === `(`
            ? `(`
            : MINUS
          : sign === `-` || sign === `(`
            ? ``
            : sign) + value_prefix
      const si_prefix =
        type === `s` && !is_nan && si_exponent !== undefined
          ? SI_PREFIXES[8 + si_exponent / 3]
          : ``
      value_suffix = si_prefix + value_suffix + (negative && sign === `(` ? `)` : ``)
      // split the groupable integer digits from the fraction, exponent or suffix after them
      if (maybe_suffix) {
        for (let idx = 0; idx < body.length; idx++) {
          const code = body.codePointAt(idx) ?? 0
          if (code < 48 || code > 57) {
            value_suffix = body.slice(idx) + value_suffix
            body = body.slice(0, idx)
            break
          }
        }
      }
    }
    if (comma && !zero) body = group_thousands(body, Infinity)
    const length = value_prefix.length + body.length + value_suffix.length
    let padding = width !== undefined && length < width ? fill.repeat(width - length) : ``
    // zero padding is grouped along with the digits
    if (comma && zero) {
      body = group_thousands(
        padding + body,
        padding && width !== undefined ? width - value_suffix.length : Infinity,
      )
      padding = ``
    }
    if (align === `<`) return value_prefix + body + value_suffix + padding
    if (align === `=`) return value_prefix + padding + body + value_suffix
    if (align === `^`) {
      const half = padding.length >> 1
      return (
        padding.slice(0, half) + value_prefix + body + value_suffix + padding.slice(half)
      )
    }
    return padding + value_prefix + body + value_suffix
  }
}

// Compiled specs; bounded since specs can be built from data (`.${precision}~f`)
const SPEC_CACHE_LIMIT = 1024
const spec_formatters = new Map<string, (value: number) => string>()
const spec_formatter = (spec: string): ((value: number) => string) => {
  let formatter = spec_formatters.get(spec)
  if (!formatter) {
    formatter = compile_spec(spec)
    evict_oldest(spec_formatters, SPEC_CACHE_LIMIT)
    spec_formatters.set(spec, formatter)
  }
  return formatter
}

// Adaptive spec pair format_num falls back on: [SI spec for 1 <= |x| < 1e27, spec otherwise].
// d3's largest SI prefix is yotta (1e24), so past it `s` would write 1e27 as 1,000Y.
export const DEFAULT_FMT = [`,.3~s`, `.3~g`] as const
// picked on the 3-digit rounding, so 9.9999e26 (shown as 1e27) is past yotta too
export const default_spec = (value: number): string => {
  const magnitude = Math.abs(Number(value.toPrecision(3)))
  return DEFAULT_FMT[magnitude >= 1 && magnitude < 1e27 ? 0 : 1]
}

// Typographic number formatting from a d3-format spec string; no spec (or ``) picks one from
// DEFAULT_FMT: 1.23k, 45.6M, 0.123, 1.23e-7. Formats as d3-format's `format(spec)(value)` in its
// default locale, except positive exponents print without `+` (1.2e6) and scientific zero as 0:
// full grammar [[fill]align][sign][symbol][0][width][,][.precision][~][type] with types
// % b c d e f g n o p r s x X and none, `s` using SI prefixes y z a f p n µ m k M G T P E Z Y.
// Negatives use U+2212 `−` as d3 does. An invalid spec or unknown type throws, where d3 reads
// unknown types as `.12~g`. Specs are compiled once and cached.
export const format_num = (value: number, spec?: string): string =>
  spec_formatter(spec === undefined || spec === `` ? default_spec(value) : spec)(value)

// Locale-aware Intl formatting, typeable into a number input: `digits` significant digits
// (integers in full), optional scientific notation outside `sci_range` (as `1.23e6`, `4.56e-4`,
// mantissa unpadded), Intl digit grouping and locale. -0 prints as 0, NaN and ±Infinity as
// Intl's `NaN`, `∞`, `-∞`, negatives with the locale's minus (`-` in en).
export const format_locale = (
  value: number,
  options: FormatLocaleOptions = {},
): string => {
  const { digits = 3, sci_range, grouping = `min2`, locale } = options
  const keep_integer = Number.isInteger(value)
  if (value === 0) value = 0 // Intl would print -0 as `-0`
  // Notation is picked on Intl's own rounding (half away from zero on the shortest decimal),
  // so it matches the digits shown: 9.995 at 3 digits shows 10, not toPrecision's 9.99
  const rounded =
    sci_range && !keep_integer
      ? Number(
          cached_format(`en-US`, {
            useGrouping: false,
            maximumSignificantDigits: digits,
          }).format(value),
        )
      : value
  const magnitude = Math.abs(rounded)
  // NaN, and ±Infinity (Intl's `∞` parses to NaN), fail both comparisons, so stay plain
  const sci =
    sci_range !== undefined &&
    magnitude > 0 &&
    (magnitude >= sci_range[1] || magnitude < sci_range[0])
  if (!sci) {
    return cached_format(
      locale,
      keep_integer
        ? { useGrouping: grouping, maximumFractionDigits: 0 }
        : { useGrouping: grouping, maximumSignificantDigits: digits },
    ).format(value)
  }
  const parts = cached_format(locale, {
    notation: `scientific`,
    maximumSignificantDigits: digits,
  }).formatToParts(value)
  let [mantissa, exponent, in_exponent] = [``, ``, false]
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

// RFC 4180 quoting, a lone CR included (readers split records on CR, LF and CRLF alike).
// Non-finite numbers are missing data, so they print empty, and text starting like a formula
// (=SUM(...), @cmd), headers included, gets a leading `'` so spreadsheets show it rather
// than evaluate it; numeric text such as `-2` is no formula.
export const escape_csv_field = (value: CsvCell): string => {
  const field =
    typeof value === `number` && !Number.isFinite(value)
      ? ``
      : typeof value === `string` &&
          /^[=+\-@\t\r]/u.test(value) &&
          Number.isNaN(Number(value))
        ? `'${value}`
        : String(value ?? ``)
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
