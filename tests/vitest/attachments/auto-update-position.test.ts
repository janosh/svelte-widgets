import { auto_update_position } from '#lib/attachments/index.ts'
import { expect, it, onTestFinished, vi } from 'vite-plus/test'
import { create_element, stub_props, stub_resize_observer } from '../index'

it(`auto_update_position coalesces observed changes and cleans up`, () => {
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
  const { created } = stub_resize_observer()
  const [anchor, floating] = [create_element(), create_element()]
  stub_props(floating, { ownerDocument: { defaultView: animation_host } })
  const update = vi.fn()

  const cleanup = auto_update_position(anchor, floating, update)
  const [{ observe, disconnect }] = created
  expect(observe.mock.calls.map(([element]) => element)).toEqual([floating, anchor])

  animation_host.dispatchEvent(new Event(`scroll`))
  animation_host.dispatchEvent(new Event(`resize`))
  visual_viewport.dispatchEvent(new Event(`scroll`))
  expect(animation_host.requestAnimationFrame).toHaveBeenCalledOnce()
  expect(update).not.toHaveBeenCalled()
  run_frame(0)
  expect(update).toHaveBeenCalledOnce()

  created[0].fire()
  expect(animation_host.requestAnimationFrame).toHaveBeenCalledTimes(2)
  cleanup()
  expect(disconnect).toHaveBeenCalledOnce()
  expect(animation_host.cancelAnimationFrame).toHaveBeenCalledWith(42)
  animation_host.dispatchEvent(new Event(`scroll`))
  expect(animation_host.requestAnimationFrame).toHaveBeenCalledTimes(2)

  onTestFinished(auto_update_position(null, floating, update))
  expect(created[1].observe).toHaveBeenCalledExactlyOnceWith(floating)
})
