import { clamp } from './utils'

// Index window of uniformly sized items intersecting a scrolled viewport, padded by
// `overscan` items on each side. Shared by HeatmapTable's row virtualisation and
// HeatmapMatrix's track windowing. `scroll` is measured from the first item, so it may be
// negative while a leading label track fills the viewport (nothing renders then), and it may
// overshoot the content after data shrinks (the browser only clamps scrollTop after the next
// layout), in which case the window settles on the last page instead of past the end.
// `min_window` keeps at least that many items rendered, which is also the render count
// while the viewport is unmeasured (SSR, first paint).
export function virtual_window({
  scroll,
  viewport,
  item_size,
  count,
  overscan = 0,
  min_window = 0,
}: {
  scroll: number
  viewport: number
  item_size: number
  count: number
  overscan?: number
  min_window?: number
}): { start: number; end: number } {
  if (count <= 0 || item_size <= 0) return { start: 0, end: 0 }
  const top = Math.min(scroll, Math.max(0, count * item_size - viewport))
  const start = clamp(Math.floor(top / item_size) - overscan, 0, count)
  const end = clamp(Math.ceil((top + viewport) / item_size) + overscan, 0, count)
  return { start, end: Math.max(end, clamp(start + min_window, 0, count)) }
}
