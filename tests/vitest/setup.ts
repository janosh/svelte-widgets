import { beforeAll, beforeEach, vi } from 'vite-plus/test'

const open_popovers = new WeakSet<HTMLElement>()
const native_matches = Element.prototype.matches

const dispatch_toggle = (element: HTMLElement, new_state: `closed` | `open`): boolean =>
  element.dispatchEvent(Object.assign(new Event(`toggle`), { newState: new_state }))

beforeAll(() => {
  Element.prototype.animate = vi.fn().mockReturnValue({ cancel: vi.fn() })
  Element.prototype.getAnimations = vi.fn().mockReturnValue([{}])
  // happy-dom has no Popover API. Unit tests only need observable open state and toggle
  // events; real light dismissal and top-layer behavior are covered in Playwright.
  Object.defineProperty(Element.prototype, `matches`, {
    configurable: true,
    writable: true,
    value(this: Element, selector: string): boolean {
      if (selector === `:popover-open`) {
        return this instanceof HTMLElement && open_popovers.has(this)
      }
      return native_matches.call(this, selector)
    },
  })
  HTMLElement.prototype.showPopover = function showPopover(): void {
    if (open_popovers.has(this)) return
    open_popovers.add(this)
    dispatch_toggle(this, `open`)
  }
  HTMLElement.prototype.hidePopover = function hidePopover(): void {
    if (!open_popovers.has(this)) return
    open_popovers.delete(this)
    dispatch_toggle(this, `closed`)
  }
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
