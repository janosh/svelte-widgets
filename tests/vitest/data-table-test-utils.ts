// Test environment and helpers for the DataTable suite (ported with it from MatterViz's
// HeatmapTable tests). Importing this module installs a ResizeObserver mock and fixed
// element sizes for its test file only.
import { type Component, mount, tick, unmount } from 'svelte'
import { prefersReducedMotion } from 'svelte/motion'
import { beforeEach, onTestFinished, vi } from 'vite-plus/test'
import { is_plain_object } from '#lib/table/data.ts'

beforeEach(() => {
  document.body.innerHTML = ``
  // happy-dom has no layout engine and reports 0 for both by default
  Object.defineProperty(HTMLElement.prototype, `clientWidth`, {
    get: () => 800,
    configurable: true,
  })
  Object.defineProperty(HTMLElement.prototype, `clientHeight`, {
    get: () => 600,
    configurable: true,
  })
})

// ResizeObserver mock: report a useful initial size and let tests trigger later
// measurements after changing an observed element's dimensions
const resize_observers: TestResizeObserver[] = []
class TestResizeObserver implements ResizeObserver {
  readonly observed_elements = new Set<Element>()
  constructor(private readonly callback: ResizeObserverCallback) {
    resize_observers.push(this)
  }
  notify(element: Element): void {
    const { clientWidth: width, clientHeight: height } = element
    this.callback(
      [{ target: element, contentRect: { width, height } } as ResizeObserverEntry],
      this,
    )
  }
  observe(element: Element): void {
    if (!resize_observers.includes(this)) resize_observers.push(this)
    this.observed_elements.add(element)
    queueMicrotask(() => {
      if (this.observed_elements.has(element)) this.notify(element)
    })
  }
  unobserve(element: Element): void {
    this.observed_elements.delete(element)
  }
  disconnect(): void {
    this.observed_elements.clear()
    const observer_idx = resize_observers.indexOf(this)
    if (observer_idx !== -1) resize_observers.splice(observer_idx, 1)
  }
}
export const trigger_resize_observer = (element: Element): void => {
  for (const observer of resize_observers) {
    if (observer.observed_elements.has(element)) observer.notify(element)
  }
}
globalThis.ResizeObserver = TestResizeObserver

Object.defineProperty(navigator, `clipboard`, {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
  configurable: true,
})

type ElementConstructor<T extends Element> = abstract new (...args: never[]) => T

// First match of a selector, asserting it exists (and its class when given)
export const doc_query = <T extends Element = HTMLElement>(
  selector: string,
  element_constructor?: ElementConstructor<T>,
): T => {
  const element = document.querySelector(selector)
  if (!element) throw new Error(`No element matches ${selector}`)
  if (element_constructor && !(element instanceof element_constructor))
    throw new Error(`${selector} is a ${element.constructor.name}`)
  return element as T
}

// Expose `state`'s keys on `props` as live accessors, so a mounted component's bindable
// props write back into a test-owned $state object
export const bind_props = <P extends object, S extends Record<string, unknown>>(
  props: P,
  state: S,
): P & S =>
  Object.defineProperties(
    props,
    Object.fromEntries(
      Object.keys(state).map((key) => [
        key,
        {
          get: () => state[key],
          set: (value: unknown) => ((state as Record<string, unknown>)[key] = value),
          enumerable: true,
        },
      ]),
    ),
  ) as P & S

// Counts how often Svelte re-reads each element's attribute cache, i.e. re-applies its
// attributes, from now on
export const count_attribute_updates = (elements: Element[]): number[] => {
  const counts = elements.map(() => 0)
  for (const [idx, element] of elements.entries()) {
    // happy-dom keeps its own Symbol(attributes) too: Svelte's is a plain record
    const key = Object.getOwnPropertySymbols(element).find(
      (sym) =>
        sym.description === `attributes` && is_plain_object(Reflect.get(element, sym)),
    )
    if (!key) throw new Error(`${element.tagName} has no Svelte attribute cache`)
    let cache: unknown = Reflect.get(element, key)
    Object.defineProperty(element, key, {
      get: () => {
        counts[idx]++
        return cache
      },
      set: (value: unknown) => {
        cache = value
      },
      configurable: true,
    })
  }
  return counts
}

// Close a popover the way light dismiss does
export const dismiss_popover = (node: Element): void => {
  node.dispatchEvent(Object.assign(new Event(`beforetoggle`), { newState: `closed` }))
}

export const stub_reduced_motion = (reduced: () => boolean): void => {
  const spy = vi.spyOn(prefersReducedMotion, `current`, `get`).mockImplementation(reduced)
  onTestFinished(() => spy.mockRestore())
}

export const mouse = (type: string, init: MouseEventInit = {}): MouseEvent =>
  new MouseEvent(type, { bubbles: true, ...init })
export const keydown = (key: string, init: KeyboardEventInit = {}): KeyboardEvent =>
  new KeyboardEvent(`keydown`, { key, bubbles: true, ...init })

// Dispatch a bubbling event on a node (defaults to a click) and flush the update. Throws on
// a missing target so a stale selector cannot pass as a no-op
export const fire = async (
  target: EventTarget | null | undefined,
  event: Event = mouse(`click`),
): Promise<void> => {
  if (!target) throw new Error(`event target for ${event.type} not found`)
  target.dispatchEvent(event)
  await tick()
}

export const mount_in_test = <Props extends object>(
  component: Component<Props>,
  props: Props,
): HTMLElement => {
  const target = document.createElement(`div`)
  document.body.append(target)
  const instance = mount(component, { target, props })
  onTestFinished(() => unmount(instance).finally(() => target.remove()))
  return target
}
