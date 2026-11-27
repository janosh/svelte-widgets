import { untrack } from 'svelte'
import { on } from 'svelte/events'
import type { Hotkey } from '../shortcuts'
import { is_editable_event_target, is_modifier_chord, run_hotkeys } from '../shortcuts'
import { is_composing } from './shared'

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
      if (event instanceof KeyboardEvent && !event.defaultPrevented)
        run_hotkeys(event, bindings)
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

    // Hydration can attach after the pointer has already entered the server-rendered node.
    let is_hovered = node.matches(`:hover`)
    const on_keydown = (event: Event) => {
      if (
        !is_hovered ||
        !(event instanceof KeyboardEvent) ||
        event.defaultPrevented ||
        is_composing(event)
      )
        return
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
    node.addEventListener(`pointerenter`, () => (is_hovered = true), { signal })
    node.addEventListener(`pointerleave`, () => (is_hovered = false), { signal })
    globalThis.addEventListener(`keydown`, on_keydown, { signal })

    return () => listeners.abort()
  }

// === Viewer keydown ===

type KeydownHandler = (event: KeyboardEvent) => boolean

// Attachment for the keydowns of one viewer (any surface with its own shortcuts), from focus
// inside it or the page's while the pointer is over it (forward_window_keydown), so of several
// viewers only one reacts. `handle` returning true prevents the default and keeps an enclosing
// viewer from acting on the key (the root runs before the window pass, which then skips the
// prevented key). `hover_handle` narrows what the pointer alone may trigger.
export const viewer_keydown =
  (handle: KeydownHandler, hover_handle: KeydownHandler = handle) =>
  (node: HTMLElement): (() => void) => {
    // `on`, not addEventListener: descendants' delegated onkeydown handlers run first, so
    // one that handles (prevents) or stops a key keeps it from the viewer
    const off = on(node, `keydown`, (event) => {
      if (!event.defaultPrevented && !is_composing(event) && handle(event))
        event.preventDefault()
    })
    const detach = forward_window_keydown({ handle: hover_handle })(node)
    return () => {
      off()
      detach?.()
    }
  }

// Plain-key shortcuts of one viewer (see viewer_keydown). Chords stay the browser's (Cmd/Ctrl+R
// reloads), typing and autorepeat are ignored. Keys are matched lowercased for letters (so Caps
// Lock still works) and by `event.key` otherwise (`Escape`, `+`). Shift+letter is a different
// shortcut, never the plain letter's. An action returning false had nothing to do, which leaves
// the key to the host.
export const viewer_keys = (bindings: () => Partial<Record<string, () => unknown>>) => {
  const attach = viewer_keydown((event) => {
    if (
      event.repeat ||
      is_modifier_chord(event) ||
      is_editable_event_target(event.target)
    )
      return false
    const { key, shiftKey } = event
    const letter = key.length === 1 && key.toLowerCase() !== key.toUpperCase()
    if (letter && shiftKey) return false
    const action = bindings()[letter ? key.toLowerCase() : key]
    return action !== undefined && action() !== false
  })
  return (node: HTMLElement): (() => void) => {
    // letters match lowercased, so an uppercase letter binding could never fire
    const never = Object.keys(untrack(bindings)).filter(
      (key) => key.length === 1 && key !== key.toLowerCase(),
    )
    if (never.length)
      throw new Error(`viewer_keys: bind letters lowercase, got ${never.join(`, `)}`)
    return attach(node)
  }
}
