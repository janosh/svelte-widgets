import { format_bytes } from '$lib/format'
import { describe, expect, test } from 'vite-plus/test'

describe(`format_bytes`, () => {
  test.each([
    // Undefined and edge cases
    [undefined, `Unknown`],
    [NaN, `Unknown`],
    [Infinity, `Unknown`],
    [-Infinity, `Unknown`],

    // Bytes range (< 1024)
    [0, `0 B`],
    [1, `1 B`],
    [500, `500 B`],
    [1023, `1023 B`],
    [1023.5, `1024 B`],
    [0.4, `0 B`],

    // Kibibytes range (1024 - 1024*1024)
    [1024, `1.00 KiB`],
    [1536, `1.50 KiB`],
    [10240, `10.00 KiB`],
    [102400, `100.00 KiB`],
    [1024 * 1024 - 1, `1024.00 KiB`],

    // Mebibytes range (1024*1024 - 1024*1024*1024)
    [1024 * 1024, `1.00 MiB`],
    [1024 * 1024 * 1.5, `1.50 MiB`],
    [1024 * 1024 * 10, `10.00 MiB`],
    [1024 * 1024 * 100, `100.00 MiB`],
    [1024 * 1024 * 500, `500.00 MiB`],
    [1024 * 1024 * 1024 - 1, `1024.00 MiB`],

    // Gibibytes range (>= 1024*1024*1024)
    [1024 * 1024 * 1024, `1.00 GiB`],
    [1024 * 1024 * 1024 * 1.5, `1.50 GiB`],
    [1024 * 1024 * 1024 * 10, `10.00 GiB`],
    [1024 * 1024 * 1024 * 100, `100.00 GiB`],
    [1024 * 1024 * 1024 * 1000, `1000.00 GiB`],
  ])(`format_bytes(%s) should return %s`, (bytes, expected) => {
    expect(format_bytes(bytes)).toBe(expected)
  })
})
