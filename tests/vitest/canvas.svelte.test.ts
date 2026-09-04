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
  let canvas = $state.raw<HTMLCanvasElement | undefined>(base.canvas)
  let overlay_canvas = $state.raw<HTMLCanvasElement | undefined>(overlay.canvas)
  let explicit_height = $state<number | undefined>()
  let revision = $state(0)
  const draw = vi.fn()
  const draw_overlay = vi.fn()
  let surface: ReturnType<typeof create_canvas_surface> | undefined
  const cleanup = $effect.root(() => {
    surface = create_canvas_surface({
      canvas: () => canvas,
      overlay_canvas: () => overlay_canvas,
      height: () => explicit_height,
      repaint_deps: () => revision,
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
    set_canvas: (value: HTMLCanvasElement | undefined) => {
      canvas = value
    },
    set_overlay: (value: HTMLCanvasElement | undefined) => {
      overlay_canvas = value
    },
    set_height: (value: number | undefined) => {
      explicit_height = value
    },
    invalidate: () => {
      revision++
    },
  }
}

test(`sizes both layers in CSS pixels and retains unchanged contexts`, () => {
  const { parent, base, overlay, surface, draw, draw_overlay, set_height } = setup()
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
  expect(draw).toHaveBeenCalledExactlyOnceWith({
    ctx: base.context,
    width: 400,
    height: 300,
  })
  expect(draw_overlay).toHaveBeenCalledExactlyOnceWith({
    ctx: overlay.context,
    width: 400,
    height: 300,
  })
  expect(base.context.clearRect).toHaveBeenCalledExactlyOnceWith(0, 0, 400, 300)
  expect(overlay.context.clearRect).not.toHaveBeenCalled()

  set_height(120)
  flushSync()
  expect([base.canvas.height, overlay.canvas.height]).toEqual([120, 120])
  expect(base.canvas.style.height).toBe(`120px`)
  set_height(undefined)
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
  const { surface, draw, draw_overlay, invalidate } = setup()
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
  invalidate()
  flushSync()
  surface.schedule(false)
  expect(frames.size).toBe(1)
  paint()
  expect(draw).toHaveBeenCalledOnce()
  expect(draw_overlay).toHaveBeenCalledTimes(2)
})

test(`replacement uses new contexts and removal stops drawing detached layers`, () => {
  const { parent, base, overlay, draw, draw_overlay, surface, set_canvas, set_overlay } =
    setup()
  const replacement = make_canvas(parent)
  const replacement_overlay = make_canvas(parent)
  set_canvas(replacement.canvas)
  set_overlay(replacement_overlay.canvas)
  base.canvas.remove()
  overlay.canvas.remove()
  flushSync()
  paint()
  expect(observers[0].disconnect).toHaveBeenCalledOnce()
  expect(observers).toHaveLength(2)
  expect(draw).toHaveBeenCalledExactlyOnceWith({
    ctx: replacement.context,
    width: 400,
    height: 300,
  })
  expect(draw_overlay).toHaveBeenCalledExactlyOnceWith({
    ctx: replacement_overlay.context,
    width: 400,
    height: 300,
  })
  expect(base.context.clearRect).not.toHaveBeenCalled()

  draw_overlay.mockClear()
  set_overlay(undefined)
  replacement_overlay.canvas.remove()
  flushSync()
  paint()
  expect(draw_overlay).not.toHaveBeenCalled()

  draw.mockClear()
  set_canvas(undefined)
  replacement.canvas.remove()
  flushSync()
  surface.schedule()
  paint()
  expect(draw).not.toHaveBeenCalled()
  expect(draw_overlay).not.toHaveBeenCalled()
})

test(`zero-size surfaces defer drawing until the parent has dimensions`, () => {
  const { parent, draw, draw_overlay } = setup(0, 0)
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
  const { parent, base, draw, set_canvas } = setup()
  const replacement = make_canvas(parent)
  replacement.get_context.mockReturnValue(null)
  set_canvas(replacement.canvas)
  flushSync()
  paint()
  expect(draw).not.toHaveBeenCalled()
  expect(base.context.clearRect).not.toHaveBeenCalled()
})

test(`parent padding does not enlarge the drawing surface`, () => {
  const { surface, base, overlay, set_height } = setup(120, 120, `10px`)
  expect(surface.dims).toEqual({ width: 100, height: 100 })
  expect([base.canvas.width, overlay.canvas.height]).toEqual([100, 100])
  set_height(75)
  flushSync()
  expect([base.canvas.style.height, overlay.canvas.style.height]).toEqual([
    `75px`,
    `75px`,
  ])
})

test.each([-1, NaN, Infinity])(`rejects invalid explicit height %s`, (height) => {
  const { set_height } = setup()
  set_height(height)
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
