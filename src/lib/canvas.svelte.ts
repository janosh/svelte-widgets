import { untrack } from 'svelte'
import { css_px } from './attachments/shared'

export interface CanvasFrame {
  ctx: CanvasRenderingContext2D
  width: number
  height: number
}

export function create_canvas_surface(inputs: {
  canvas: () => HTMLCanvasElement | undefined
  overlay_canvas?: () => HTMLCanvasElement | undefined
  height?: () => number | undefined // CSS px; otherwise the parent needs a definite height
  draw: (frame: CanvasFrame) => void // base layer, onto a cleared context
  draw_overlay?: (frame: CanvasFrame) => void // overlay layer, every frame; clears itself
  repaint_deps: () => unknown // reactive values the draw code reads (rAF reads are untracked)
}) {
  let ctx: CanvasRenderingContext2D | null = null
  let overlay_ctx: CanvasRenderingContext2D | null = null
  let dims = $state({ width: 0, height: 0 })
  let frame_id = 0
  let base_is_stale = false
  let disposed = false

  function paint(
    context: CanvasRenderingContext2D | null,
    draw: typeof inputs.draw_overlay,
    clear = false,
  ) {
    if (!context) return
    context.save()
    try {
      if (clear) context.clearRect(0, 0, dims.width, dims.height)
      draw?.({ ctx: context, ...dims })
    } finally {
      context.restore()
    }
  }

  // One frame for both layers: the overlay always, the base only when asked, so an overlay
  // tick landing on a pending base redraw is absorbed rather than requeued
  function schedule(redraw_base = true): void {
    if (disposed) return
    base_is_stale ||= redraw_base
    if (frame_id) return
    frame_id = requestAnimationFrame(() => {
      frame_id = 0
      const redraw = base_is_stale
      base_is_stale = false
      if (!dims.width || !dims.height) return
      if (redraw) paint(ctx, inputs.draw, true)
      paint(overlay_ctx, inputs.draw_overlay)
    })
  }

  function resize(): void {
    if (disposed) return
    const canvas = inputs.canvas()
    if (!canvas) {
      ctx = null
      overlay_ctx = null
      dims = { width: 0, height: 0 }
      return
    }
    const dpr = globalThis.devicePixelRatio || 1
    // Client dimensions include padding but exclude borders and scrollbars.
    const parent = canvas.parentElement
    const style = parent && getComputedStyle(parent)
    const padding = (side: `Left` | `Right` | `Top` | `Bottom`) =>
      css_px(style?.[`padding${side}`] ?? ``) || 0
    const width = Math.max(
      0,
      (parent?.clientWidth ?? 0) - padding(`Left`) - padding(`Right`),
    )
    const height =
      inputs.height?.() ??
      Math.max(0, (parent?.clientHeight ?? 0) - padding(`Top`) - padding(`Bottom`))
    if (!Number.isFinite(height) || height < 0)
      throw new RangeError(`Canvas height must be finite and non-negative: ${height}`)
    // Assigning even an unchanged backing dimension clears the canvas.
    const [px_width, px_height] = [Math.round(width * dpr), Math.round(height * dpr)]
    ;[ctx, overlay_ctx] = [canvas, inputs.overlay_canvas?.()].map((layer, idx) => {
      if (!layer) return null
      layer.style.width = `${width}px`
      layer.style.height = `${height}px`
      if (layer.width !== px_width) layer.width = px_width
      if (layer.height !== px_height) layer.height = px_height
      const existing = idx === 0 ? ctx : overlay_ctx
      const context = existing?.canvas === layer ? existing : layer.getContext(`2d`)
      if (context) {
        context.setTransform(dpr, 0, 0, dpr, 0, 0)
        context.imageSmoothingEnabled = true
        context.imageSmoothingQuality = `high`
      }
      return context
    })
    if (dims.width !== width || dims.height !== height) dims = { width, height }
    schedule()
  }

  $effect(() => () => {
    disposed = true
    if (frame_id) cancelAnimationFrame(frame_id)
    ctx = null
    overlay_ctx = null
  })

  // CSS content dimensions stay independent of the DPR-scaled backing store.
  $effect(() => {
    const originals = [inputs.canvas(), inputs.overlay_canvas?.()]
      .filter((canvas) => canvas !== undefined)
      .map(({ style }) => {
        const { width, height, boxSizing } = style
        style.boxSizing = `content-box`
        return () => Object.assign(style, { width, height, boxSizing })
      })
    return () => {
      for (const restore of originals) restore()
    }
  })

  // DPR changes need a new media query even when CSS dimensions remain unchanged.
  $effect(() => {
    const canvas = inputs.canvas()
    if (!canvas) return undefined
    const observer = new ResizeObserver(resize)
    if (canvas.parentElement) observer.observe(canvas.parentElement)
    const dpr_watch = new AbortController()
    const track_dpr = () => {
      const query = globalThis.matchMedia?.(
        `(resolution: ${globalThis.devicePixelRatio}dppx)`,
      )
      const listen = { once: true, signal: dpr_watch.signal }
      query?.addEventListener(
        `change`,
        () => {
          resize()
          track_dpr()
        },
        listen,
      )
    }
    track_dpr()
    return () => {
      observer.disconnect()
      dpr_watch.abort()
      if (frame_id) cancelAnimationFrame(frame_id)
      frame_id = 0
    }
  })
  // Mount/height changes need sizing even without a parent resize; writes stay untracked.
  $effect(() => {
    void [inputs.canvas(), inputs.overlay_canvas?.(), inputs.height?.()]
    untrack(resize)
  })
  $effect(() => {
    inputs.repaint_deps()
    schedule()
  })

  return {
    get dims() {
      return dims
    },
    schedule,
  }
}
