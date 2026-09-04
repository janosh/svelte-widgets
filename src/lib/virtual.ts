import { clamp } from './utils'

// Visible [start, end) indices for uniform items, padded by `overscan` on each side.
// Scroll is relative to the first item; negative offsets allow leading content, and stale
// offsets after data shrinks clamp to the last page. `min_window` also covers unmeasured views.
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
