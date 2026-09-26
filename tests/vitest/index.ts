import type { MultiSelectProps } from '$lib'
import { flushSync, mount, tick, unmount, type Component } from 'svelte'
import { assert, onTestFinished, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'

export const create_element = (
  tag = `div`,
  styles: Partial<CSSStyleDeclaration> = {},
): HTMLElement => {
  const element = document.createElement(tag)
  Object.assign(element.style, styles)
  document.body.append(element)
  return element
}

// Generic return type keeps call sites concise for DOM-specific assertions.
// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export function doc_query<T extends Element = HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector)
  assert(node !== null, `No element found for selector: ${selector}`)
  return node
}

// Clicks an element (or the first match of a selector), then flushes the resulting update
export async function click(target: Element | string | null | undefined): Promise<void> {
  const element = typeof target === `string` ? doc_query(target) : target
  assert(
    element instanceof HTMLElement,
    `click target is not an HTMLElement: ${element?.nodeName}`,
  )
  element.click()
  await tick()
}

// Shadows a prototype getter with an own value property; returns the undo callers must
// register for teardown so a failed assertion cannot leak the stub. Restores the original
// descriptor rather than deleting, since `globalThis.innerWidth` and friends are own
// properties that later tests would otherwise read as `undefined`.
export const stub_prop = (target: object, prop: string, value: unknown) => {
  const original = Object.getOwnPropertyDescriptor(target, prop)
  Object.defineProperty(target, prop, { value, configurable: true })
  return () => {
    if (original) Object.defineProperty(target, prop, original)
    else Reflect.deleteProperty(target, prop)
  }
}

// happy-dom skips layout, so mock getBoundingClientRect plus the read-only offset*
// properties (hence defineProperty).
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

// tracking settlement rather than awaiting is the only way to assert a promise is pending
export const track = <T>(promise: Promise<T>) => {
  const state: { settled: boolean; value?: T; reason?: unknown } = { settled: false }
  // rejections settle too; without this arm a broken promise reads as forever pending
  void promise.then(
    (value) => Object.assign(state, { settled: true, value }),
    (reason: unknown) => Object.assign(state, { settled: true, reason }),
  )
  return state
}

export type Test2WayBindProps = MultiSelectProps & {
  onActiveIndexChanged?: (data: MultiSelectProps[`active_index`]) => unknown
  onActiveOptionChanged?: (data: MultiSelectProps[`active_option`]) => unknown
  onOptionsChanged?: (data: MultiSelectProps[`options`]) => unknown
  onSearchTextChanged?: (data: MultiSelectProps[`search_text`]) => unknown
  onValueChanged?: (data: MultiSelectProps[`value`]) => unknown
}

// mounts into the body, flushes, and unmounts when the test finishes
export const render = <Props extends object>(
  component: Component<Props>,
  props: Props,
): (() => Promise<void>) => {
  const instance = mount(component, { target: document.body, props })
  let unmounted: Promise<void> | undefined
  // safe to call early (teardown tests); the finish hook then skips it
  const unmount_once = () => (unmounted ??= unmount(instance))
  onTestFinished(unmount_once)
  flushSync()
  return unmount_once
}

// resolves after one macrotask, for work a component defers with setTimeout(..., 0)
export const next_task = () => new Promise<void>((resolve) => void setTimeout(resolve, 0))

// Escape on the document, where the shared escape layer stack listens
export const press_escape = (init: KeyboardEventInit = {}) =>
  press_key(document, `Escape`, init)

// fresh directory under the OS temp dir, removed when the test finishes
export const temp_dir = async (prefix: string): Promise<string> => {
  const directory = await mkdtemp(`${tmpdir()}/${prefix}`)
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  return directory
}

// optionally sets an input's text, dispatches each bubbling event type in order, then flushes
export const fire_input = async (
  input: HTMLInputElement,
  text: string | undefined,
  ...events: string[]
): Promise<void> => {
  if (text !== undefined) input.value = text
  for (const type of events) input.dispatchEvent(new Event(type, { bubbles: true }))
  await tick()
}

// stub_prop for several props at once, each undone (newest first) when the test finishes
export const stub_props = (target: object, props: Record<string, unknown>) => {
  for (const [prop, value] of Object.entries(props))
    onTestFinished(stub_prop(target, prop, value))
}
