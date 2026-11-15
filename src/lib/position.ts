import { clamp } from './utils'

// "pick a side that fits, then stay on screen", shared by every floating surface

export type Placement = `top` | `right` | `bottom` | `left`

export type PositionOptions = {
  placement?: Placement | `auto`
  align?: `center` | `start` | `end` // start/end line up the matching anchor/floating edges
  offset?: number // gap between anchor and floating box
  cross_axis_offset?: number // nudge perpendicular to the chosen side
  padding?: number // closest the floating box may come to a viewport edge
  boundary?: { top: number; left: number; right: number; bottom: number }
  fallback_placements?: Placement[] // tried after a fixed placement; restricts `auto`
  // true tries the opposite side then the perpendicular ones; an explicit list keeps e.g.
  // a dropdown from ever landing beside its input
  flip?: boolean | Placement[]
  // true slides along any viewport edge rather than overflow it. An edge list only clamps
  // against those edges: a dropdown passes [`top`] so it never slides up over its input
  // when overflowing below, yet its first entries never leave the top of the screen
  shift?: boolean | readonly Placement[]
}

export type PositionResult = { top: number; left: number; placement: Placement }

const FLIP_ORDER: Record<Placement, Placement[]> = {
  bottom: [`bottom`, `top`, `right`, `left`],
  top: [`top`, `bottom`, `right`, `left`],
  right: [`right`, `left`, `bottom`, `top`],
  left: [`left`, `right`, `bottom`, `top`],
}

// Viewport coordinates by default; callers add scroll offsets when positioning absolutely.
export function compute_position(
  anchor: { top: number; left: number; bottom: number; right: number },
  floating: { width: number; height: number },
  options: PositionOptions = {},
): PositionResult {
  const {
    placement = `bottom`,
    align = `center`,
    offset = 0,
    cross_axis_offset = 0,
    padding = 0,
    boundary = {
      top: 0,
      left: 0,
      right: globalThis.innerWidth,
      bottom: globalThis.innerHeight,
    },
    fallback_placements,
    flip = true,
    shift = true,
  } = options
  const requested = placement === `auto` ? `bottom` : placement
  const cross_position = (start: number, end: number, size: number): number => {
    if (align === `start`) return start + cross_axis_offset
    if (align === `end`) return end - size + cross_axis_offset
    return start + (end - start - size) / 2 + cross_axis_offset
  }
  const cross_x = cross_position(anchor.left, anchor.right, floating.width)
  const cross_y = cross_position(anchor.top, anchor.bottom, floating.height)

  const coords: Record<Placement, { top: number; left: number }> = {
    top: { top: anchor.top - floating.height - offset, left: cross_x },
    bottom: { top: anchor.bottom + offset, left: cross_x },
    left: { top: cross_y, left: anchor.left - floating.width - offset },
    right: { top: cross_y, left: anchor.right + offset },
  }

  // Room between the anchor and the boundary on each side, gap already deducted.
  const free_space: Record<Placement, number> = {
    top: anchor.top - boundary.top - padding - offset,
    bottom: boundary.bottom - padding - anchor.bottom - offset,
    left: anchor.left - boundary.left - padding - offset,
    right: boundary.right - padding - anchor.right - offset,
  }
  const vertical = (side: Placement): boolean => side === `top` || side === `bottom`
  // Only main-axis overflow flips; counting the cross axis (shifting's job) would send an
  // edge-aligned bottom tooltip to the left instead.
  const main_axis_overflow = (side: Placement): number =>
    Math.max(0, (vertical(side) ? floating.height : floating.width) - free_space[side])

  // `flip: false` pins the requested side, else least main-axis overflow wins. A named
  // placement stays first choice, its fallbacks queue up behind it.
  const explicit_order = fallback_placements ?? (Array.isArray(flip) ? flip : null)
  let candidates = explicit_order ?? FLIP_ORDER[requested]
  if (flip === false) candidates = [requested]
  else if (fallback_placements && placement !== `auto`)
    candidates = [requested, ...fallback_placements.filter((side) => side !== requested)]

  // Plain `auto` breaks overflow ties above or below before beside (a tooltip beside a
  // trigger in a row of chips covers its neighbors), then on free space
  const rank_by_space = flip !== false && placement === `auto` && !explicit_order
  let chosen = requested
  let least_overflow = Infinity
  let greatest_space = -Infinity
  for (const candidate of candidates) {
    const candidate_overflow = main_axis_overflow(candidate)
    if (
      candidate_overflow < least_overflow ||
      (rank_by_space &&
        candidate_overflow === least_overflow &&
        (vertical(candidate) === vertical(chosen)
          ? free_space[candidate] > greatest_space
          : vertical(candidate)))
    ) {
      chosen = candidate
      least_overflow = candidate_overflow
      greatest_space = free_space[candidate]
    }
  }

  let { top, left } = coords[chosen]
  const min_left = boundary.left + padding
  const max_left = boundary.right - floating.width - padding
  const min_top = boundary.top + padding
  const max_top = boundary.bottom - floating.height - padding
  if (shift === true) {
    // oversize boxes reverse the limits; between them overflow is minimal
    left = clamp(left, Math.min(min_left, max_left), Math.max(min_left, max_left))
    top = clamp(top, Math.min(min_top, max_top), Math.max(min_top, max_top))
  } else if (shift) {
    // far edges first, so a box too big for the boundary keeps its top/left on screen
    if (shift.includes(`bottom`)) top = Math.min(top, max_top)
    if (shift.includes(`right`)) left = Math.min(left, max_left)
    if (shift.includes(`top`)) top = Math.max(top, min_top)
    if (shift.includes(`left`)) left = Math.max(left, min_left)
  }
  return { top, left, placement: chosen }
}
