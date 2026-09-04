import { get_heading_visibility } from '$lib/toc-utils'
import { expect, test } from 'vitest'

// h2, h3, h4, h4, h3, h4, h2, h3
const nested_levels = [2, 3, 4, 4, 3, 4, 2, 3]

test.each([
  [`empty`, [], -1, 6, []],
  [`skipped levels`, [2, 4, 3, 5, 2, 6], 3, 4, [true, true, true, true, true, true]],
  // Toc reaches this via headings.indexOf(activeHeading) === -1: collapsing is on but
  // no heading is active, so only the top-level ones stay visible
  [
    `active heading not found`,
    nested_levels,
    -1,
    3,
    [true, false, false, false, false, false, true, false],
  ],
  [`inactive`, nested_levels, null, 6, nested_levels.map(() => true)],
  [`active h4`, nested_levels, 2, 6, [true, true, true, true, true, false, true, false]],
  [
    `h3 threshold`,
    nested_levels,
    0,
    3,
    [true, true, true, true, true, true, true, false],
  ],
] as const)(
  `get_heading_visibility %s keeps expected headings visible`,
  (_, levels, active_idx, collapse_threshold, expected) => {
    expect(get_heading_visibility(levels, active_idx, collapse_threshold)).toEqual(
      expected,
    )
  },
)

test.each([3, 6])(`long sibling runs stay linear at threshold %i`, (threshold) => {
  let reads = 0
  const levels = new Proxy([2, ...Array.from({ length: 1000 }, () => 4)], {
    get(target, property, receiver) {
      if (typeof property === `string` && /^\d+$/.test(property)) reads++
      return Reflect.get(target, property, receiver)
    },
  })
  expect(get_heading_visibility(levels, 0, threshold)).toEqual(levels.map(() => true))
  // Bound element reads rather than wall time so slow CI still detects quadratic scans.
  expect(reads).toBeLessThan(levels.length * 12)
})
