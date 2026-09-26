import { get_heading_visibility } from '$lib/toc-utils'
import { expect, test } from 'vitest'

// h2, h3, h4, h4, h3, h4, h2, h3
const nested_levels = [2, 3, 4, 4, 3, 4, 2, 3]

// expected visibility is a 0/1 mask over the levels
test.each([
  [`empty`, [], -1, 6, []],
  [`skipped levels`, [2, 4, 3, 5, 2, 6], 3, 4, [1, 1, 1, 1, 1, 1]],
  // Toc reaches this via headings.indexOf(active_heading) === -1: collapsing is on but
  // no heading is active, so only the top-level ones stay visible
  [`active heading not found`, nested_levels, -1, 3, [1, 0, 0, 0, 0, 0, 1, 0]],
  [`inactive`, nested_levels, null, 6, [1, 1, 1, 1, 1, 1, 1, 1]],
  [`active h4`, nested_levels, 2, 6, [1, 1, 1, 1, 1, 0, 1, 0]],
  [`h3 threshold`, nested_levels, 0, 3, [1, 1, 1, 1, 1, 1, 1, 0]],
] as const)(
  `get_heading_visibility %s keeps expected headings visible`,
  (_, levels, active_idx, collapse_threshold, visible_mask) => {
    expect(get_heading_visibility(levels, active_idx, collapse_threshold)).toEqual(
      visible_mask.map(Boolean),
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
