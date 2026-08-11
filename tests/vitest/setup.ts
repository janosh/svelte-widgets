import { beforeAll, beforeEach, vi } from 'vite-plus/test'

beforeAll(() => {
  Element.prototype.animate = vi.fn().mockReturnValue({ cancel: vi.fn() })
  Element.prototype.getAnimations = vi.fn().mockReturnValue([{}])
})

// Node's localStorage shadows happy-dom's implementation and warns when read.
Object.defineProperty(globalThis, `localStorage`, {
  configurable: true,
  writable: true,
  value: window.localStorage,
})

beforeEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ``
  localStorage.clear()
})

Object.defineProperty(globalThis, `matchMedia`, {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    media: query,
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })),
})
