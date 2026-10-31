import { format_bytes } from '#lib/format.ts'
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
