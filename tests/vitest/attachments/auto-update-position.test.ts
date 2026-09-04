import { auto_update_position } from '$lib/attachments'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { create_element, stub_prop } from '../index'

describe(`auto_update_position`, () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup()
  })

  it(`coalesces observed changes and cleans up`, () => {
    let run_frame: FrameRequestCallback = () => undefined
    const visual_viewport = new EventTarget()
    const animation_host = Object.assign(new EventTarget(), {
      visualViewport: visual_viewport,
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        run_frame = callback
        return 42
      }),
      cancelAnimationFrame: vi.fn(),
    }) as unknown as Window
    const [observe, disconnect] = [vi.fn(), vi.fn()]
    let resize_callback: ResizeObserverCallback = () => undefined
    class MockResizeObserver {
      constructor(callback: ResizeObserverCallback) {
        resize_callback = callback
      }
      observe = observe
      disconnect = disconnect
    }
    cleanups.push(stub_prop(globalThis, `ResizeObserver`, MockResizeObserver))

    const [anchor, floating] = [create_element(), create_element()]
    cleanups.push(stub_prop(floating, `ownerDocument`, { defaultView: animation_host }))
    const update = vi.fn()
    const cleanup = auto_update_position(anchor, floating, update)
    cleanups.push(cleanup)
    expect(observe.mock.calls.map(([element]) => element)).toEqual([floating, anchor])

    animation_host.dispatchEvent(new Event(`scroll`))
    animation_host.dispatchEvent(new Event(`resize`))
    visual_viewport.dispatchEvent(new Event(`scroll`))
    expect(animation_host.requestAnimationFrame).toHaveBeenCalledTimes(1)
    expect(update).not.toHaveBeenCalled()

    run_frame(0)
    expect(update).toHaveBeenCalledTimes(1)

    resize_callback([], {} as ResizeObserver)
    expect(animation_host.requestAnimationFrame).toHaveBeenCalledTimes(2)
    cleanup()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(animation_host.cancelAnimationFrame).toHaveBeenCalledWith(42)

    animation_host.dispatchEvent(new Event(`scroll`))
    expect(animation_host.requestAnimationFrame).toHaveBeenCalledTimes(2)

    observe.mockClear()
    cleanups.push(auto_update_position(null, floating, update))
    expect(observe).toHaveBeenCalledExactlyOnceWith(floating)
  })
})
