import { format_bytes, format_num, type FormatNumOptions } from '#lib/format.ts'
import { expect, test } from 'vite-plus/test'

test.each([
  // Undefined and edge cases
  [undefined, `Unknown`],
  [NaN, `Unknown`],
  [Infinity, `Unknown`],
  [-Infinity, `Unknown`],

  // Bytes range (< 1024)
  [0, `0 B`],
  [1023, `1023 B`],
  [1023.4, `1023 B`],
  [1023.5, `1 KiB`],
  [-0.4, `0 B`],
  [0.4, `0 B`],

  // Kibibytes range (1024 - 1024*1024)
  [1024, `1 KiB`],
  [1536, `1.5 KiB`],
  // One decimal below 10, whole numbers from there
  [9.94 * 1024, `9.9 KiB`],
  [9.96 * 1024, `10 KiB`],
  [12.34 * 1024, `12 KiB`],
  // rounding carries into the next unit
  [1024 * 1024 - 1, `1 MiB`],
  [1024 * 1024 - 600, `1023 KiB`],
  [-(1024 * 1024 - 1), `-1 MiB`],

  // Mebibytes range (1024*1024 - 1024*1024*1024)
  [1024 * 1024, `1 MiB`],
  [384.63 * 1024 * 1024, `385 MiB`],
  [1024 * 1024 * 1024 - 1, `1 GiB`],

  // Gibibytes range (>= 1024*1024*1024)
  [1024 * 1024 * 1024, `1 GiB`],
  [2.25 * 1024 * 1024 * 1024, `2.3 GiB`],
  [1024 * 1024 * 1024 * 1000, `1000 GiB`],
])(`format_bytes(%s) should return %s`, (bytes, expected) => {
  expect(format_bytes(bytes)).toBe(expected)
})

const sci: FormatNumOptions = { sci_range: [1e-3, 1e6] }
// String()-like, typeable into a number input
const plain: FormatNumOptions = { digits: 3, sci_range: [1e-6, 1e21], grouping: false }
test.each<[number, FormatNumOptions | undefined, string]>([
  [0, undefined, `0`],
  [-0, undefined, `0`],
  [-0, plain, `0`],
  [NaN, undefined, `NaN`],
  [Infinity, undefined, `∞`],
  [-Infinity, undefined, `-∞`],
  [NaN, sci, `NaN`], // non-finite values never go scientific
  [-Infinity, sci, `-∞`],
  // DataTable's default: integers in full, 3 significant digits, grouped from 5 digits
  [1234567, undefined, `1,234,567`],
  [1766, undefined, `1766`], // years and IDs stay ungrouped below 5 digits
  [12345, undefined, `12,345`],
  [55.85, undefined, `55.9`],
  [0.000123, undefined, `0.000123`],
  [1e-4, undefined, `0.0001`],
  [999999.9, undefined, `1,000,000`],
  [-0.5, undefined, `-0.5`],
  [-0.12355, undefined, `-0.124`],
  [-12345.67, undefined, `-12,300`],
  // grouping and locale
  [1766, { grouping: true }, `1,766`],
  [1766, { grouping: true, locale: `es` }, `1.766`], // `true` always groups, past es's min2
  [12345, { grouping: false }, `12345`],
  [12345.678, { locale: `de-DE` }, `12.300`],
  // scientific outside sci_range, on the rounded value, mantissa unpadded
  [999999.9, sci, `1e+6`],
  [1e6, sci, `1e+6`],
  [1234567, sci, `1.23e+6`],
  [1e-4, sci, `1e-4`],
  [-1.5e-7, sci, `-1.5e-7`],
  // notation is decided in en-US even for comma-decimal locales, and the scientific formatter
  // is cached per locale (the plain en-US call warms the cache first)
  [0.00012, { digits: 2, sci_range: [1e-3, 1e6], locale: `de-DE` }, `1,2e-4`], // unique digits: a fresh rounding cache key
  [1.5e-7, sci, `1.5e-7`],
  [1.5e-7, { ...sci, locale: `de-DE` }, `1,5e-7`],
  // RTL bidi marks around Intl's exponent stay out of the mantissa
  [-1.23e-5, { ...sci, locale: `ar-EG` }, `\u061C-١٫٢٣e-٥`],
  [0.001, sci, `0.001`],
  // notation follows the digits Intl shows, not toPrecision's binary rounding (9.99, 0.000999)
  [9.995, { sci_range: [1e-3, 10], locale: `en-US` }, `1e+1`],
  [0.0009995, sci, `0.001`],
  // String()-like plain notation, integers in full
  [123456, plain, `123456`],
  [123456.7, plain, `123000`],
  [0.000021799999999999998, plain, `0.0000218`],
  [1.5e-7, plain, `1.5e-7`],
  [1e21, plain, `1e+21`],
])(`format_num(%s, %j) = %s`, (value, options, expected) => {
  // pinned to en-US unless a case names its locale, so the table passes on any host
  expect(format_num(value, { locale: `en-US`, ...options })).toBe(expected)
})

test(`format_num uses the host locale when none is given`, () => {
  const host = (options: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(undefined, options).format
  expect([format_num(1234567), format_num(55.85)]).toEqual([
    host({ useGrouping: `min2`, maximumFractionDigits: 0 })(1234567),
    host({ useGrouping: `min2`, maximumSignificantDigits: 3 })(55.85),
  ])
})

// formatters are cached, so options that look alike must not share one: each pair differs
// in one option, run in this order
test(`format_num keeps formatters for differing options apart`, () => {
  const to_10: FormatNumOptions = { sci_range: [1e-3, 10] }
  const calls: [number, FormatNumOptions, string][] = [
    [1234567, { ...sci, grouping: true }, `1.23e+6`],
    [1234567, { grouping: true }, `1,234,567`],
    [1234567, { ...sci, digits: 2 }, `1.2e+6`],
    [1234567, { ...sci, digits: 4 }, `1.235e+6`],
    [12.345, { digits: 2 }, `12`],
    [12.345, { digits: 4 }, `12.35`],
    [12345, { digits: 2 }, `12,345`],
    [12345, { grouping: false }, `12345`],
    [9.995, { ...to_10, digits: 3 }, `1e+1`],
    [9.995, { ...to_10, digits: 4 }, `9.995`],
  ]
  expect(
    calls.map(([value, options]) => format_num(value, { locale: `en-US`, ...options })),
  ).toEqual(calls.map(([, , expected]) => expected))
})
