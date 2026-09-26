import { format_bytes } from '$lib/format'
import { expect, test } from 'vitest'

test.each([
  // Undefined and edge cases
  [undefined, `Unknown`],
  [NaN, `Unknown`],
  [Infinity, `Unknown`],
  [-Infinity, `Unknown`],

  // Bytes range (< 1024)
  [0, `0 B`],
  [1, `1 B`],
  [1023, `1023 B`],
  [1023.4, `1023 B`],
  [1023.5, `1.00 KiB`],
  [-0.4, `0 B`],
  [0.4, `0 B`],

  // Kibibytes range (1024 - 1024*1024)
  [1024, `1.00 KiB`],
  [1536, `1.50 KiB`],
  // rounding to 2 decimals carries into the next unit
  [1024 * 1024 - 1, `1.00 MiB`],
  [1024 * 1024 - 6, `1023.99 KiB`],
  [-(1024 * 1024 - 1), `-1.00 MiB`],

  // Mebibytes range (1024*1024 - 1024*1024*1024)
  [1024 * 1024, `1.00 MiB`],
  [1024 * 1024 * 1.5, `1.50 MiB`],
  [1024 * 1024 * 500, `500.00 MiB`],
  [1024 * 1024 * 1024 - 1, `1.00 GiB`],

  // Gibibytes range (>= 1024*1024*1024)
  [1024 * 1024 * 1024, `1.00 GiB`],
  [1024 * 1024 * 1024 * 1.5, `1.50 GiB`],
  [1024 * 1024 * 1024 * 1000, `1000.00 GiB`],
])(`format_bytes(%s) should return %s`, (bytes, expected) => {
  expect(format_bytes(bytes)).toBe(expected)
})
