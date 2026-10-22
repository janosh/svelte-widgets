import { in_view } from '#lib/attachments/index.ts'
import { expect, test, vi } from 'vite-plus/test'

// `report` delivers a batch of crossings to the latest fake observer's callback
let report: (...states: boolean[]) => void
let options: IntersectionObserverInit | undefined
const observe = vi.fn()
const disconnect = vi.fn()
class FakeObserver {
  observe = observe
  disconnect = disconnect
  constructor(callback: (entries: object[]) => void, init?: IntersectionObserverInit) {
    options = init
    report = (...states) => callback(states.map((isIntersecting) => ({ isIntersecting })))
  }
}
vi.stubGlobal(`IntersectionObserver`, FakeObserver)

test(`reports every crossing with the latest entry of a batch, and forwards options`, () => {
  const node = document.createElement(`div`)
  const callback = vi.fn()
  const cleanup = in_view(callback, { root_margin: `300px 0px`, threshold: 0.5 })(node)
  expect(observe).toHaveBeenCalledExactlyOnceWith(node)
  expect(options).toMatchObject({ rootMargin: `300px 0px`, threshold: 0.5 })
  report(true)
  report(true, false)
  report()
  expect(callback.mock.calls.map(([visible]) => visible)).toEqual([true, false])
  expect(disconnect).not.toHaveBeenCalled()
  cleanup()
  expect(disconnect).toHaveBeenCalledOnce()
})

test(`once ignores exits, fires on the first entry and disconnects`, () => {
  const callback = vi.fn()
  in_view(callback, { once: true })(document.createElement(`div`))
  report(false)
  expect(callback).not.toHaveBeenCalled()
  // an entry and an exit in one batch still count as the first entry
  report(true, false)
  expect(callback).toHaveBeenCalledExactlyOnceWith(true, { isIntersecting: true })
  expect(disconnect).toHaveBeenCalledOnce()
})
