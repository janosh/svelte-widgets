import { in_view } from '#lib/attachments/index.ts'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'

type ObserverCallback = (entries: Partial<IntersectionObserverEntry>[]) => void
let observers: {
  callback: ObserverCallback
  options: IntersectionObserverInit
  disconnect: ReturnType<typeof vi.fn>
  observed: Element[]
}[] = []

beforeEach(() => {
  observers = []
  vi.stubGlobal(
    `IntersectionObserver`,
    class {
      disconnect = vi.fn()
      observed: Element[] = []
      constructor(
        public callback: ObserverCallback,
        public options: IntersectionObserverInit,
      ) {
        observers.push(this)
      }
      observe(node: Element) {
        this.observed.push(node)
      }
    },
  )
})
afterEach(() => void vi.unstubAllGlobals())

const crossing = (...states: boolean[]) =>
  states.map((isIntersecting) => ({ isIntersecting }))

test(`reports every crossing with the latest entry of a batch, and forwards options`, () => {
  const node = document.createElement(`div`)
  const callback = vi.fn()
  const cleanup = in_view(callback, { root_margin: `300px 0px`, threshold: 0.5 })(node)
  const [observer] = observers
  expect(observer.observed).toEqual([node])
  expect(observer.options).toMatchObject({ rootMargin: `300px 0px`, threshold: 0.5 })
  observer.callback(crossing(true))
  observer.callback(crossing(true, false))
  observer.callback([])
  expect(callback.mock.calls.map(([visible]) => visible)).toEqual([true, false])
  expect(observer.disconnect).not.toHaveBeenCalled()
  cleanup?.()
  expect(observer.disconnect).toHaveBeenCalledOnce()
})

test(`once ignores exits, fires on the first entry and disconnects`, () => {
  const callback = vi.fn()
  in_view(callback, { once: true })(document.createElement(`div`))
  const [observer] = observers
  observer.callback(crossing(false))
  expect(callback).not.toHaveBeenCalled()
  observer.callback(crossing(true))
  expect(callback).toHaveBeenCalledExactlyOnceWith(true, { isIntersecting: true })
  expect(observer.disconnect).toHaveBeenCalledOnce()
})
