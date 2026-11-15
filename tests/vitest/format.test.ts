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
// ColumnFilter's placeholders: String()-like, typeable into a number input
const plain: FormatNumOptions = {
  digits: 3,
  sci_range: [1e-6, 1e21],
  grouping: false,
  locale: `en-US`,
}
test.each<[number, FormatNumOptions | undefined, string]>([
  [0, undefined, `0`],
  [-0, undefined, `0`],
  [-0, plain, `0`],
  [NaN, undefined, `NaN`],
  [Infinity, undefined, `∞`],
  [-Infinity, undefined, `-∞`],
  [NaN, { non_finite: `n/a` }, `n/a`],
  [-Infinity, { ...sci, non_finite: `n/a` }, `n/a`],
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
  [12345, { grouping: false }, `12345`],
  [12345.678, { locale: `de-DE` }, `12.300`],
  // scientific outside sci_range, on the rounded value, mantissa unpadded
  [999999.9, sci, `1e+6`],
  [1e6, sci, `1e+6`],
  [1234567, sci, `1.23e+6`],
  [1e-4, sci, `1e-4`],
  [-1.5e-7, sci, `-1.5e-7`],
  [0.001, sci, `0.001`],
  // String()-like plain notation, integers in full
  [123456, plain, `123456`],
  [123456.7, plain, `123000`],
  [0.000021799999999999998, plain, `0.0000218`],
  [1.5e-7, plain, `1.5e-7`],
  [1e21, plain, `1e+21`],
])(`format_num(%s, %j) = %s`, (value, options, expected) => {
  expect(format_num(value, options)).toBe(expected)
})
