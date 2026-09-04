export interface MarkupStroke {
  color: string
  // Coordinates in natural image pixels so resize/letterboxing cannot warp them.
  points: { x: number; y: number }[]
}

// Visible image rectangle inside an object-fit:contain <img> box.
export const object_fit_contain_box = (
  natural_width: number,
  natural_height: number,
  box_width: number,
  box_height: number,
): { x: number; y: number; width: number; height: number; scale: number } => {
  if (
    [natural_width, natural_height, box_width, box_height].some(
      (value) => !Number.isFinite(value) || value < 0,
    )
  ) {
    throw new RangeError(
      `Image and box dimensions must be finite and non-negative: ${natural_width}×${natural_height} in ${box_width}×${box_height}`,
    )
  }
  if (natural_width <= 0 || natural_height <= 0 || box_width <= 0 || box_height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0, scale: 0 }
  }
  const scale = Math.min(box_width / natural_width, box_height / natural_height)
  const width = natural_width * scale
  const height = natural_height * scale
  return {
    x: (box_width - width) / 2,
    y: (box_height - height) / 2,
    width,
    height,
    scale,
  }
}

export const draw_markup_strokes = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  strokes: readonly (Omit<MarkupStroke, `points`> & {
    points: Readonly<MarkupStroke[`points`]>
  })[],
  line_width: number,
): void => {
  ctx.lineCap = `round`
  ctx.lineJoin = `round`
  ctx.lineWidth = line_width
  for (const { color, points } of strokes) {
    const first = points[0]
    if (!first) continue
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.moveTo(first.x, first.y)
    // A lone tap still needs a tiny segment so the stroke paints a dot.
    if (points.length === 1) ctx.lineTo(first.x + 0.01, first.y)
    for (let idx = 1; idx < points.length; idx++) ctx.lineTo(points[idx].x, points[idx].y)
    ctx.stroke()
  }
}
