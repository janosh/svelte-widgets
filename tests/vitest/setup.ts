import type * as Tokens from '#lib/code-editor/tokens.ts'
import Heading from '#lib/Heading.svelte'
import { mount, unmount } from 'svelte'
import { afterAll, beforeAll, beforeEach, vi } from 'vite-plus/test'
import { install_fake_resize_observer, reset_app } from './index'

// Every module mock lives here (see ./index for why and for the state that steers them)
vi.mock(`$app/navigation`, () => ({ afterNavigate: () => {}, goto: async () => {} }))
vi.mock(`$app/paths`, async () => (await import(`./index`)).app_paths)
vi.mock(`$app/state`, async () => ({ page: (await import(`./index`)).app.page }))
vi.mock(`#lib/internal/key-selector.svelte.ts`, async (import_original) =>
  (await import(`./index`)).count_key_reads(await import_original()),
)
vi.mock(`#lib/code-editor/tokens.ts`, async (import_original) => {
  const actual = await import_original<typeof Tokens>()
  const { token_renders } = await import(`./index`)
  return {
    ...actual,
    render_tokens: (...args: Parameters<typeof actual.render_tokens>) => {
      token_renders.count++
      return actual.render_tokens(...args)
    },
  }
})

// happy-dom's ResizeObserver never fires; tests fire the fake by hand
install_fake_resize_observer()

const open_popovers = new WeakSet<HTMLElement>()
const native_matches = Element.prototype.matches

const dispatch_toggle = (element: HTMLElement, new_state: `closed` | `open`): boolean =>
  element.dispatchEvent(Object.assign(new Event(`toggle`), { newState: new_state }))

beforeAll(() => {
  Element.prototype.animate = vi.fn().mockReturnValue({ cancel: vi.fn() })
  Element.prototype.getAnimations = vi.fn().mockReturnValue([{ cancel: vi.fn() }])
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
  vi.useRealTimers() // tests opting into fake timers need no restore of their own
  document.body.innerHTML = ``
  localStorage.clear()
  reset_app()
})

// Test files share one window, so a file's global stubs and whatever it patches onto the
// element prototypes (layout getters happy-dom lacks, say) are undone when it finishes
const prototypes = [Element.prototype, HTMLElement.prototype]
const natives = prototypes.map((proto) => Object.getOwnPropertyDescriptors(proto))
afterAll(() => {
  vi.restoreAllMocks() // else the next file's restore would reinstate a patched prototype
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  // A <svelte:element> child that throws while rendering (what "rejects invalid props"
  // tests provoke) leaves Svelte's `animate:` effect override set, crashing the next
  // `animate:` in the shared runtime. Rendering any <svelte:element> cleanly clears it.
  void unmount(
    mount(Heading, { target: document.createElement(`div`), props: { id: `x` } }),
  )
  for (const [idx, proto] of prototypes.entries()) {
    for (const key of Reflect.ownKeys(proto))
      if (!Object.hasOwn(natives[idx], key)) Reflect.deleteProperty(proto, key)
    Object.defineProperties(proto, natives[idx])
  }
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
