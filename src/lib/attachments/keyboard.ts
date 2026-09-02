import type { Hotkey } from '../utils'
import { run_hotkeys } from '../utils'

export interface HotkeyOptions {
  bindings: Hotkey[]
  // listen on the document, for shortcuts that work anywhere; node-scoped by default so a
  // shortcut dies with the surface that owns it
  global?: boolean
  enabled?: boolean
}

// Declarative keybindings. Matching lives in run_hotkeys so components with their own
// window listener (CommandMenu) share the semantics without an element.
export const hotkey =
  (options: HotkeyOptions) =>
  (node: Element): (() => void) | undefined => {
    const { bindings, global = false, enabled = true } = options
    if (!enabled || bindings.length === 0) return undefined

    const target = global ? node.ownerDocument : node
    const on_keydown = (event: Event) => {
      if (event instanceof KeyboardEvent) run_hotkeys(event, bindings)
    }
    target.addEventListener(`keydown`, on_keydown)
    return () => target.removeEventListener(`keydown`, on_keydown)
  }

export interface ForwardWindowKeydownOptions {
  // return `true` for a key you took and the browser default (scroll, quick find) is
  // suppressed here rather than at every call site
  handle: (event: KeyboardEvent) => boolean
  enabled?: boolean
}

// Hands a component the page's keydowns while the pointer is over it and focus is on the
// page or its root, so several viewers share one set of shortcuts without all answering and
// none steals a key from a focused descendant. Complements `hotkey`, which arbitrates by
// focus instead.
export const forward_window_keydown =
  (options: ForwardWindowKeydownOptions) =>
  (node: Element): (() => void) | undefined => {
    const { handle, enabled = true } = options
    if (!enabled) return undefined

    let is_hovered = false
    const on_enter = () => (is_hovered = true)
    const on_leave = () => (is_hovered = false)
    const on_keydown = (event: Event) => {
      if (!is_hovered || !(event instanceof KeyboardEvent)) return
      // The root may be focusable so keyboard users can aim shortcuts at it, and an
      // unfocused page targets body or html. Anything else keeps its own keys, including a
      // shadow-retargeted node, which composedPath()[0] exposes.
      const { activeElement, body, documentElement } = node.ownerDocument
      const event_target = event.composedPath()[0]
      const idle = [node, body, documentElement]
      if (event_target instanceof Element && !idle.includes(event_target)) return
      if (activeElement && activeElement !== body && activeElement !== node) return
      if (handle(event)) event.preventDefault()
    }

    const listeners = new AbortController()
    const { signal } = listeners
    node.addEventListener(`pointerenter`, on_enter, { signal })
    node.addEventListener(`pointerleave`, on_leave, { signal })
    globalThis.addEventListener(`keydown`, on_keydown, { signal })

    return () => listeners.abort()
  }
