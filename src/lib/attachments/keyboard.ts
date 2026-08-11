import type { Hotkey } from '../utils'
import { run_hotkeys } from '../utils'

export interface HotkeyOptions {
  bindings: Hotkey[]
  // Listen on the document rather than the node, for shortcuts that work anywhere.
  // Node-scoped is the default so a shortcut dies with the surface that owns it.
  global?: boolean
  enabled?: boolean
}

// Declarative keybindings. Matching lives in run_hotkeys so components that already
// own a window listener (CommandMenu) share the same semantics without an element.
export const hotkey =
  (options: HotkeyOptions) =>
  (node: Element): (() => void) | undefined => {
    const { bindings, global = false, enabled = true } = options
    if (!enabled || bindings.length === 0) return undefined

    const target: EventTarget = global ? document : node
    const on_keydown = (event: Event) => {
      if (event instanceof KeyboardEvent) run_hotkeys(event, bindings)
    }
    target.addEventListener(`keydown`, on_keydown)
    return () => target.removeEventListener(`keydown`, on_keydown)
  }

export interface ForwardWindowKeydownOptions {
  // Report `true` for a key you took, and the browser default (page scroll, quick
  // find) is suppressed here instead of at every call site.
  handle: (event: KeyboardEvent) => boolean
  enabled?: boolean
}

// Hand a component the page's keydowns while the pointer is over it and focus is on the
// page or the component root. Several viewers can then share one set of shortcuts without
// all answering at once, and none takes a key from a focused descendant control.
// Complements `hotkey`, which binds to an element or the document and arbitrates by focus.
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
      // The root itself may be focusable so keyboard users can aim shortcuts at it.
      // Any other focused element, including one retargeted through a shadow root, keeps
      // its own keys. composedPath()[0] exposes that original shadow-DOM target.
      const event_target = event.composedPath()[0]
      if (event_target instanceof Element && event_target !== node) return
      const { activeElement, body } = node.ownerDocument
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
