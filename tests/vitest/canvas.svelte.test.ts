import { create_canvas_surface } from '$lib/canvas.svelte'
import { flushSync } from 'svelte'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'

const frames = new Map<number, FrameRequestCallback>()
const observers: {
  resize: () => void
  observe: ReturnType<typeof vi.fn>
  disconnect: ReturnType<typeof vi.fn>
}[] = []
const media_queries: EventTarget[] = []
const cleanups: (() => void)[] = []

beforeEach(() => {
  frames.clear()
  observers.length = 0
  media_queries.length = 0
  let next_frame = 0
  vi.stubGlobal(`devicePixelRatio`, 1)
  vi.stubGlobal(`requestAnimationFrame`, (callback: FrameRequestCallback) => {
    frames.set(++next_frame, callback)
    return next_frame
  })
  vi.stubGlobal(`cancelAnimationFrame`, (frame_id: number) => frames.delete(frame_id))
  vi.stubGlobal(
    `ResizeObserver`,
    class {
      observe = vi.fn()
      disconnect = vi.fn()
      constructor(resize: () => void) {
        observers.push({ resize, observe: this.observe, disconnect: this.disconnect })
      }
    },
  )
  vi.stubGlobal(
    `matchMedia`,
    vi.fn(() => {
      const query = new EventTarget()
      media_queries.push(query)
      return query
    }),
  )
})
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
  vi.unstubAllGlobals()
})

const paint = () => {
  const pending = [...frames.values()]
  frames.clear()
  for (const callback of pending) callback(0)
}
const make_canvas = (parent: HTMLElement) => {
  const canvas = document.createElement(`canvas`)
  parent.append(canvas)
  const context = {
    canvas,
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setTransform: vi.fn(),
    imageSmoothingEnabled: false,
    imageSmoothingQuality: `low`,
  }
  const get_context = vi
    .spyOn(canvas, `getContext`)
    .mockReturnValue(context as unknown as CanvasRenderingContext2D)
  return { canvas, context, get_context }
}
const setup = (width = 400, height = 300, padding = ``) => {
  const parent = document.createElement(`div`)
  parent.style.padding = padding
  Object.defineProperties(parent, {
    clientWidth: { value: width, configurable: true },
    clientHeight: { value: height, configurable: true },
  })
  document.body.append(parent)
  const base = make_canvas(parent)
  const overlay = make_canvas(parent)
  base.canvas.style.boxSizing = `border-box`
  base.canvas.style.width = `100%`
  overlay.canvas.style.height = `inherit`
  const state = $state<{
    canvas: HTMLCanvasElement | undefined
    overlay_canvas: HTMLCanvasElement | undefined
    height: number | undefined
    revision: number
  }>({
    canvas: base.canvas,
    overlay_canvas: overlay.canvas,
    height: undefined,
    revision: 0,
  })
  const draw = vi.fn()
  const draw_overlay = vi.fn()
  let surface: ReturnType<typeof create_canvas_surface> | undefined
  const cleanup = $effect.root(() => {
    surface = create_canvas_surface({
      canvas: () => state.canvas,
      overlay_canvas: () => state.overlay_canvas,
      height: () => state.height,
      repaint_deps: () => state.revision,
      draw,
      draw_overlay,
    })
  })
  cleanups.push(cleanup)
  flushSync()
  if (!surface) throw new Error(`Canvas surface was not initialized`)
  return {
    parent,
    base,
    overlay,
    surface,
    draw,
    draw_overlay,
    cleanup,
    state,
  }
}

test(`sizes both layers in CSS pixels and retains unchanged contexts`, () => {
  const { parent, base, overlay, surface, draw, draw_overlay, state } = setup()
  expect(observers[0].observe).toHaveBeenCalledWith(parent)
  expect(surface.dims).toEqual({ width: 400, height: 300 })
  for (const { canvas, context, get_context } of [base, overlay]) {
    expect([canvas.width, canvas.height]).toEqual([400, 300])
    expect(context.setTransform).toHaveBeenCalledExactlyOnceWith(1, 0, 0, 1, 0, 0)
    expect(context.imageSmoothingEnabled).toBe(true)
    expect(context.imageSmoothingQuality).toBe(`high`)
    expect(get_context).toHaveBeenCalledOnce()
  }
  observers[0].resize()
  paint()
  expect(base.get_context).toHaveBeenCalledOnce()
  for (const [layer, callback] of [
    [base, draw],
    [overlay, draw_overlay],
  ] as const) {
    expect(callback).toHaveBeenCalledExactlyOnceWith({
      ctx: layer.context,
      width: 400,
      height: 300,
    })
  }
  expect(base.context.clearRect).toHaveBeenCalledExactlyOnceWith(0, 0, 400, 300)
  expect(overlay.context.clearRect).not.toHaveBeenCalled()

  state.height = 120
  flushSync()
  expect([base.canvas.height, overlay.canvas.height]).toEqual([120, 120])
  expect(base.canvas.style.height).toBe(`120px`)
  state.height = undefined
  flushSync()
  expect(base.canvas.height).toBe(300)
  expect(base.canvas.style.height).toBe(`300px`)
  expect(overlay.canvas.style.height).toBe(`300px`)
})

test.each([1, 400])(
  `DPR changes re-arm the watcher and update transforms at width=%s`,
  (width) => {
    const { base, overlay, cleanup, surface, draw, draw_overlay } = setup(width, width)
    for (const ratio of [1.1, 2, 3]) {
      vi.stubGlobal(`devicePixelRatio`, ratio)
      media_queries.at(-1)?.dispatchEvent(new Event(`change`))
      for (const { canvas, context } of [base, overlay]) {
        expect([canvas.width, canvas.height]).toEqual([
          Math.round(width * ratio),
          Math.round(width * ratio),
        ])
        expect(context.setTransform).toHaveBeenLastCalledWith(ratio, 0, 0, ratio, 0, 0)
        expect([canvas.style.width, canvas.style.height]).toEqual([
          `${width}px`,
          `${width}px`,
        ])
        expect(canvas.style.boxSizing).toBe(`content-box`)
      }
    }
    expect(media_queries).toHaveLength(4)
    cleanup()
    const query_count = media_queries.length
    media_queries.at(-1)?.dispatchEvent(new Event(`change`))
    expect(media_queries).toHaveLength(query_count)
    expect(observers[0].disconnect).toHaveBeenCalledOnce()
    expect(frames.size).toBe(0)
    expect([
      base.canvas.style.width,
      base.canvas.style.height,
      base.canvas.style.boxSizing,
      overlay.canvas.style.height,
    ]).toEqual([`100%`, ``, `border-box`, `inherit`])
    surface.schedule()
    observers[0].resize()
    expect(frames.size).toBe(0)
    paint()
    expect(draw).not.toHaveBeenCalled()
    expect(draw_overlay).not.toHaveBeenCalled()
  },
)

test(`coalesces reactive and overlay redraws without losing pending base work`, () => {
  const { surface, draw, draw_overlay, state } = setup()
  paint()
  draw.mockClear()
  draw_overlay.mockClear()
  surface.schedule(false)
  surface.schedule(false)
  expect(frames.size).toBe(1)
  paint()
  expect(draw).not.toHaveBeenCalled()
  expect(draw_overlay).toHaveBeenCalledOnce()

  surface.schedule(false)
  state.revision++
  flushSync()
  surface.schedule(false)
  expect(frames.size).toBe(1)
  paint()
  expect(draw).toHaveBeenCalledOnce()
  expect(draw_overlay).toHaveBeenCalledTimes(2)
})

test(`replacement uses new contexts and removal stops drawing detached layers`, () => {
  const { parent, base, overlay, draw, draw_overlay, surface, state } = setup()
  const replacement = make_canvas(parent)
  const replacement_overlay = make_canvas(parent)
  state.canvas = replacement.canvas
  state.overlay_canvas = replacement_overlay.canvas
  base.canvas.remove()
  overlay.canvas.remove()
  flushSync()
  paint()
  expect(observers[0].disconnect).toHaveBeenCalledOnce()
  expect(observers).toHaveLength(2)
  for (const [layer, callback] of [
    [replacement, draw],
    [replacement_overlay, draw_overlay],
  ] as const) {
    expect(callback).toHaveBeenCalledExactlyOnceWith({
      ctx: layer.context,
      width: 400,
      height: 300,
    })
  }
  expect(base.context.clearRect).not.toHaveBeenCalled()

  draw_overlay.mockClear()
  state.overlay_canvas = undefined
  replacement_overlay.canvas.remove()
  flushSync()
  paint()
  expect(draw_overlay).not.toHaveBeenCalled()

  draw.mockClear()
  state.canvas = undefined
  replacement.canvas.remove()
  flushSync()
  surface.schedule()
  paint()
  expect(draw).not.toHaveBeenCalled()
  expect(draw_overlay).not.toHaveBeenCalled()
})

test.each([
  [0, 0],
  [0, 80],
  [80, 0],
])(`%s×%s surfaces defer drawing until both dimensions are positive`, (width, height) => {
  const { parent, draw, draw_overlay } = setup(width, height)
  paint()
  expect(draw).not.toHaveBeenCalled()
  expect(draw_overlay).not.toHaveBeenCalled()
  Object.defineProperties(parent, {
    clientWidth: { value: 80 },
    clientHeight: { value: 40 },
  })
  observers[0].resize()
  paint()
  expect(draw).toHaveBeenCalledOnce()
  expect(draw_overlay).toHaveBeenCalledOnce()
})

test(`a replacement without a 2D context never draws using the old canvas`, () => {
  const { parent, base, draw, state } = setup()
  const replacement = make_canvas(parent)
  replacement.get_context.mockReturnValue(null)
  state.canvas = replacement.canvas
  flushSync()
  paint()
  expect(draw).not.toHaveBeenCalled()
  expect(base.context.clearRect).not.toHaveBeenCalled()
})

test(`parent padding does not enlarge the drawing surface`, () => {
  const { surface, base, overlay, state } = setup(120, 120, `10px`)
  expect(surface.dims).toEqual({ width: 100, height: 100 })
  expect([base.canvas.width, overlay.canvas.height]).toEqual([100, 100])
  state.height = 75
  flushSync()
  expect([base.canvas.style.height, overlay.canvas.style.height]).toEqual([
    `75px`,
    `75px`,
  ])
})

test.each([-1, NaN, Infinity])(`rejects invalid explicit height %s`, (height) => {
  const { state } = setup()
  state.height = height
  expect(flushSync).toThrow(`Canvas height must be finite and non-negative`)
})

test(`draw state is restored even when a drawing callback throws`, () => {
  const { surface, base, overlay, draw, draw_overlay } = setup()
  draw.mockImplementationOnce(() => {
    throw new Error(`draw failed`)
  })
  expect(paint).toThrow(`draw failed`)
  expect(base.context.save).toHaveBeenCalledOnce()
  expect(base.context.restore).toHaveBeenCalledOnce()
  surface.schedule(false)
  draw_overlay.mockImplementationOnce(() => {
    throw new Error(`overlay failed`)
  })
  expect(paint).toThrow(`overlay failed`)
  expect(overlay.context.save).toHaveBeenCalledOnce()
  expect(overlay.context.restore).toHaveBeenCalledOnce()
})
