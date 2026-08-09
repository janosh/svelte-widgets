import type { MultiSelectProps } from '$lib'
import { assert, onTestFinished, vi } from 'vite-plus/test'

// Generic return type keeps call sites concise for DOM-specific assertions.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function doc_query<T extends Element = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector)
  assert(node !== null, `No element found for selector: ${selector}`)
  return node
}

// Shadows a prototype getter (navigator.userAgent, documentElement.clientWidth) with
// an own value property. Returns the undo, which callers must register for teardown so
// a failed assertion cannot leak the stub into later tests.
// Restores the original descriptor, not just deletes: `globalThis.innerWidth` and friends are
// own properties of the window, so deleting them leaves every later test reading `undefined`.
export const stub_prop = (target: object, prop: string, value: unknown) => {
  const original = Object.getOwnPropertyDescriptor(target, prop)
  Object.defineProperty(target, prop, { value, configurable: true })
  return () => {
    if (original) Object.defineProperty(target, prop, original)
    else Reflect.deleteProperty(target, prop)
  }
}

// happy-dom skips layout, so every geometry an attachment reads has to be mocked:
// getBoundingClientRect plus the read-only offset* properties (hence defineProperty).
export const mock_rect = (
  element: HTMLElement,
  rect: { left: number; top: number; width?: number; height?: number },
) => {
  const { left, top, width = 100, height = 50 } = rect
  element.getBoundingClientRect = vi.fn(() => ({
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON: () => ({}),
  }))
  const offsets = {
    offsetLeft: left,
    offsetTop: top,
    offsetWidth: width,
    offsetHeight: height,
  }
  for (const [prop, value] of Object.entries(offsets)) {
    Object.defineProperty(element, prop, { value, configurable: true })
  }
}

// PointerEvent for pointer*; MouseEvent otherwise. Default isPrimary: true (ctor leaves false).
export const pointer_event = (
  type: string,
  clientX: number,
  clientY: number,
  init: PointerEventInit = {},
) => {
  const shared = { clientX, clientY, bubbles: true, ...init }
  // lostpointercapture is a PointerEvent too — it just doesn't start with `pointer`
  return type.startsWith(`pointer`) || type === `lostpointercapture`
    ? new PointerEvent(type, { isPrimary: true, ...shared })
    : new MouseEvent(type, shared)
}

export const hover = (element: Element, pointer_type = `mouse`) =>
  element.dispatchEvent(pointer_event(`pointerover`, 0, 0, { pointerType: pointer_type }))

export const data_transfer = (
  files: File[],
  items: DataTransferItem[] = [],
): DataTransfer => ({ files, items, types: [`Files`] }) as unknown as DataTransfer

export const drag_event = (type: string, transfer: DataTransfer): DragEvent => {
  const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
  Object.defineProperty(event, `dataTransfer`, { value: transfer })
  return event
}

const key_event = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent(`keydown`, { bubbles: true, cancelable: true, ...init, key })

// cancelable so callers can assert whether a handler swallowed the key
export const escape_key = (init: KeyboardEventInit = {}) => key_event(`Escape`, init)
export const press_key = (
  target: EventTarget,
  key: string,
  init: KeyboardEventInit = {},
) => {
  const event = key_event(key, init)
  target.dispatchEvent(event)
  return event
}

// happy-dom implements neither CSS.highlights nor Highlight.
export const stub_css_highlights = () => {
  const registry = new Map<string, unknown>()
  const clear_spy = vi.fn(() => registry.clear())
  const set_spy = vi.fn((key: string, value: unknown) => registry.set(key, value))
  const delete_spy = vi.fn((key: string) => registry.delete(key))
  vi.stubGlobal(`CSS`, {
    highlights: {
      clear: clear_spy,
      get: (key: string) => registry.get(key),
      set: set_spy,
      delete: delete_spy,
    },
  })
  vi.stubGlobal(
    `Highlight`,
    class {
      readonly ranges: readonly Range[]
      constructor(...ranges: Range[]) {
        this.ranges = ranges
      }
    },
  )
  onTestFinished(() => void vi.unstubAllGlobals())
  return { registry, clear_spy, set_spy, delete_spy }
}

// Tracking settlement (rather than awaiting) is the only way to assert a promise is
// still pending, which is what a queue is for.
export const track = <T>(promise: Promise<T>) => {
  const state: { settled: boolean; value?: T; reason?: unknown } = { settled: false }
  // a rejection settles the promise too; without this arm it would read as forever
  // pending and go unhandled, so a broken promise looks like a hung one
  void promise.then(
    (value) => Object.assign(state, { settled: true, value }),
    (reason: unknown) => Object.assign(state, { settled: true, reason }),
  )
  return state
}

export type Test2WayBindProps = MultiSelectProps & {
  onActiveIndexChanged?: (data: MultiSelectProps[`activeIndex`]) => unknown
  onActiveOptionChanged?: (data: MultiSelectProps[`activeOption`]) => unknown
  onOptionsChanged?: (data: MultiSelectProps[`options`]) => unknown
  onSearchTextChanged?: (data: MultiSelectProps[`searchText`]) => unknown
  onSelectedChanged?: (data: MultiSelectProps[`selected`]) => unknown
  onValueChanged?: (data: MultiSelectProps[`value`]) => unknown
}
