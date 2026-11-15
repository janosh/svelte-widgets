import {
  format_bytes,
  format_locale,
  format_num,
  type FormatLocaleOptions,
} from '#lib/format.ts'
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

const sci: FormatLocaleOptions = { sci_range: [1e-3, 1e6] }
// String()-like, typeable into a number input
const plain: FormatLocaleOptions = { digits: 3, sci_range: [1e-6, 1e21], grouping: false }
test.each<[number, FormatLocaleOptions | undefined, string]>([
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
  [999999.9, sci, `1e6`],
  [1e6, sci, `1e6`],
  [1234567, sci, `1.23e6`],
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
  [9.995, { sci_range: [1e-3, 10], locale: `en-US` }, `1e1`],
  [0.0009995, sci, `0.001`],
  // String()-like plain notation, integers in full
  [123456, plain, `123456`],
  [123456.7, plain, `123000`],
  [0.000021799999999999998, plain, `0.0000218`],
  [1.5e-7, plain, `1.5e-7`],
  [1e21, plain, `1e21`],
])(`format_locale(%s, %j) = %s`, (value, options, expected) => {
  // pinned to en-US unless a case names its locale, so the table passes on any host
  expect(format_locale(value, { locale: `en-US`, ...options })).toBe(expected)
})

test(`format_locale uses the host locale when none is given`, () => {
  const host = (options: Intl.NumberFormatOptions) =>
    new Intl.NumberFormat(undefined, options).format
  expect([format_locale(1234567), format_locale(55.85)]).toEqual([
    host({ useGrouping: `min2`, maximumFractionDigits: 0 })(1234567),
    host({ useGrouping: `min2`, maximumSignificantDigits: 3 })(55.85),
  ])
})

// formatters are cached, so options that look alike must not share one: each pair differs
// in one option, run in this order
test(`format_locale keeps formatters for differing options apart`, () => {
  const to_10: FormatLocaleOptions = { sci_range: [1e-3, 10] }
  const calls: [number, FormatLocaleOptions, string][] = [
    [1234567, { ...sci, grouping: true }, `1.23e6`],
    [1234567, { grouping: true }, `1,234,567`],
    [1234567, { ...sci, digits: 2 }, `1.2e6`],
    [1234567, { ...sci, digits: 4 }, `1.235e6`],
    [12.345, { digits: 2 }, `12`],
    [12.345, { digits: 4 }, `12.35`],
    [12345, { digits: 2 }, `12,345`],
    [12345, { grouping: false }, `12345`],
    [9.995, { ...to_10, digits: 3 }, `1e1`],
    [9.995, { ...to_10, digits: 4 }, `9.995`],
  ]
  expect(
    calls.map(([value, options]) =>
      format_locale(value, { locale: `en-US`, ...options }),
    ),
  ).toEqual(calls.map(([, , expected]) => expected))
})

// d3-format spec strings, expected values from d3-format 3.1.3's format(spec)(value) with
// positive exponents' + dropped and scientific zero as 0
test.each<[number, string, string]>([
  // f: fixed decimals, ~ trims trailing zeros, a negative that rounds to 0 loses its sign
  [1234.5678, `.2f`, `1234.57`],
  [1234.5678, `.0f`, `1235`],
  [1.2, `.3f`, `1.200`],
  [1.2, `.3~f`, `1.2`],
  [-0.0004, `.3~f`, `0`],
  [-0.0004, `+.3~f`, `−0`],
  // e, g, r, none
  [1234.5678, `.3e`, `1.235e3`],
  [0, `.3~e`, `0`],
  [1.2e-7, `.3~e`, `1.2e-7`],
  [0.000123456, `.3g`, `0.000123`],
  [123456789, `.3g`, `1.23e8`],
  [1.5, `.3~g`, `1.5`],
  [1234.5678, `.3r`, `1230`],
  [0.000123456, `.2~r`, `0.00012`],
  [1234.5, `.3`, `1.23e3`],
  [1e-7, `.3~`, `1e-7`],
  // significant-digit types clamp precision 0 up to 1
  [1234.5, `.0g`, `1e3`],
  [1234.5, `.0~s`, `1k`],
  [1234.5, `.0r`, `1000`],
  // % and p
  [0.1234, `.1%`, `12.3%`],
  [0.5, `.1~%`, `50%`],
  [-0.004, `.0%`, `0%`],
  [0.1234, `.1p`, `10%`],
  // d and , grouping
  [1234567.89, `,d`, `1,234,568`],
  [123, `,d`, `123`],
  [-1234.5, `d`, `−1235`],
  [1e21, `d`, `1000000000000000000000`],
  [1234567.89, `,.2f`, `1,234,567.89`],
  [1234567, `,~`, `1,234,567`],
  [1234.5, `n`, `1,234.50`],
  // signs: U+2212 minus, + forces a sign (also on -0), ( wraps negatives, space pads positives
  [42, `+.2f`, `+42.00`],
  [-42, `(.2f`, `(42.00)`],
  [42, ` .1f`, ` 42.0`],
  [42, `-.1f`, `42.0`],
  [-0, `.1f`, `0.0`],
  [-0, `+.1f`, `−0.0`],
  // other bases, symbols, character
  [255, `x`, `ff`],
  [255, `#X`, `0xFF`],
  [5, `b`, `101`],
  [8, `#o`, `0o10`],
  [65, `c`, `65`],
  [42.5, `$,.2f`, `$42.50`],
  [0.5, `$.1%`, `$50.0`], // the currency symbol drops the percent sign
  // fill, align, zero padding and width; zero padding is grouped too
  [3.14567, `08.2f`, `00003.15`],
  [1234.5, `010,.1f`, `0,001,234.5`],
  [42, `*^9d`, `***42****`],
  [42, `<6d`, `42    `],
  [-42, `=+8d`, `−     42`],
  // non-finite values
  [NaN, `.3~f`, `NaN`],
  [NaN, `,.3~s`, `NaN`],
  [Infinity, `.2f`, `Infinity`],
  [-Infinity, `,.3~s`, `−Infinity`],
  [Infinity, `d`, `∞`],
  // s past the prefix range: yocto and yotta stay, digits pad or shrink
  [1e-27, `.3~s`, `0.001y`],
  [1e30, `.3~s`, `1000000Y`],
  [1234567, `,.3~s`, `1.23M`],
  [-0.000123, `.2~s`, `−120µ`],
])(`format_num(%s, %j) = %s`, (value, spec, expected) => {
  expect(format_num(value, spec)).toBe(expected)
})

// .3~s at each SI prefix edge, at 0.9995x (rounds up across the edge, unless binary rounding
// lands below the tie) and at 0.99949x (stays on the prefix below)
const si_edges: [number, string, string, string][] = [
  // below 1 yocto, d3 re-rounds to fewer digits: 0.99949y shows 0.1y
  [-24, `1y`, `1y`, `0.1y`],
  [-21, `1z`, `999y`, `999y`],
  [-18, `1a`, `1a`, `999z`],
  [-15, `1f`, `1f`, `999a`],
  [-12, `1p`, `1p`, `999f`],
  [-9, `1n`, `1n`, `999p`],
  [-6, `1µ`, `999n`, `999n`],
  [-3, `1m`, `1m`, `999µ`],
  [0, `1`, `1`, `999m`],
  [3, `1k`, `1k`, `999`],
  [6, `1M`, `1M`, `999k`],
  [9, `1G`, `1G`, `999M`],
  [12, `1T`, `1T`, `999G`],
  [15, `1P`, `1P`, `999T`],
  [18, `1E`, `1E`, `999P`],
  [21, `1Z`, `1Z`, `999E`],
  [24, `1Y`, `999Z`, `999Z`],
]
test.each(si_edges)(`.3~s at 1e%i edge: %s, %s, %s`, (exp, at_edge, tie, below) => {
  const edge = 10 ** exp
  expect(
    [edge, edge * 0.9995, edge * 0.99949].map((value) => format_num(value, `.3~s`)),
  ).toEqual([at_edge, tie, below])
  expect(format_num(-edge, `.3~s`)).toBe(`−${at_edge}`)
})

test.each([
  [`abc`, `invalid format spec "abc"`],
  [`.3~~f`, `invalid format spec ".3~~f"`],
  [`.f`, `invalid format spec ".f"`],
  // d3 would silently read unknown types as .12~g
  [`.3z`, `unknown type "z" in format spec ".3z"`],
  [`.2F`, `unknown type "F" in format spec ".2F"`],
])(`format_num rejects spec %j`, (spec, message) => {
  // twice: a rejected spec must not be cached as a formatter
  expect(() => format_num(1.5, spec)).toThrow(message)
  expect(() => format_num(1.5, spec)).toThrow(message)
})

// specs are compiled once and cached: lookalike specs must not share a formatter, repeated
// calls must agree, and evicting old specs past the cache bound must not break them
// no format (or ``): SI from 1 up to yotta, .3~g below 1 and past it
// oxfmt-ignore
test.each<[number, string | undefined, string]>([
  [1234, undefined, `1.23k`], [0.123, undefined, `0.123`], [1, ``, `1`], [0, undefined, `0`],
  [1000, undefined, `1k`], [1_000_000, undefined, `1M`], [1e9, undefined, `1G`],
  [-45_600_000, undefined, `−45.6M`], [0.001, undefined, `0.001`], [-1.1, undefined, `−1.1`],
  [-0.000001, undefined, `−0.000001`], [-1e-7, undefined, `−1e-7`], [-1.14123, undefined, `−1.14`],
  // scientific zero collapses to a plain 0, keeping any prefix or suffix
  [0, `.2~e`, `0`], [-0, `.2~e`, `0`], [0, `$.2e`, `$0`], [0, `.2~%`, `0%`],
  [-1.14123e-7, `.5~g`, `−1.1412e-7`],
  // past yotta d3 has no SI prefix left (1e27 would read 1,000Y)
  [9.99e26, undefined, `999Y`], [9.9999e26, undefined, `1e27`], [1e27, undefined, `1e27`], [-1.234e27, undefined, `−1.23e27`],
  [1e100, undefined, `1e100`], [Number.MAX_VALUE, undefined, `1.8e308`],
])(`format_num(%s, %j) = %s`, (value, format, expected) => {
  expect(format_num(value, format)).toBe(expected)
})

test(`exponents pad at their compact width`, () => {
  expect(format_num(1234, `>7.1e`)).toBe(`  1.2e3`)
  expect(format_num(0, `>4.2e`)).toBe(`   0`)
})

test(`format_num caches compiled specs per spec string`, () => {
  const calls: [number, string, string][] = [
    [1.2, `.3f`, `1.200`],
    [1.2, `.3~f`, `1.2`],
    [1.2, `.3f`, `1.200`],
    [1234, `,.0f`, `1,234`],
    [1234, `.0f`, `1234`],
    [1234, `,.0f`, `1,234`],
  ]
  expect(calls.map(([value, spec]) => format_num(value, spec))).toEqual(
    calls.map(([, , expected]) => expected),
  )
  // the s formatter's SI prefix must not leak into the next value or spec
  expect([
    format_num(1e6, `.3~s`),
    format_num(NaN, `.3~s`),
    format_num(0, `.3~s`),
  ]).toEqual([`1M`, `NaN`, `0`])
  for (let precision = 0; precision < 1500; precision++)
    format_num(1.5, `${precision}.1f`)
  expect([format_num(1.2, `.3f`), format_num(1.5, `5.1f`)]).toEqual([`1.200`, `  1.5`])
})
