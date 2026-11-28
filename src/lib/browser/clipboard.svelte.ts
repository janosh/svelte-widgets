import { SvelteSet } from 'svelte/reactivity'
import { compute_position } from '../position'

// Headless "recently copied" state for UIs rendering their own copy affordances, where
// CopyButton's markup is in the way: a value table with a checkmark per row, a code block
// with a copy target per line.

export interface ClipboardFeedback {
  // keys copied within the last `duration_ms`; reactive, so markup re-renders on change
  copied: SvelteSet<string>
  // Writes `text` and flags `key` (the text itself by default), returning whether the write
  // succeeded. A failure resolves false only when `on_error` handles it, else it throws.
  copy: (text: string, key?: string) => Promise<boolean>
  // drops the flag and its pending timer, for one key or all
  clear: (key?: string) => void
}

export const create_clipboard_feedback = (
  duration_ms = 1000,
  on_error?: (error: unknown, text: string) => void,
): ClipboardFeedback => {
  const copied = new SvelteSet<string>()
  // plain Map: timer bookkeeping is not UI state and must not subscribe callers
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const clear = (key?: string): void => {
    for (const timer_key of key === undefined ? [...timers.keys()] : [key]) {
      clearTimeout(timers.get(timer_key))
      timers.delete(timer_key)
      copied.delete(timer_key)
    }
  }

  const copy = async (text: string, key: string = text): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      if (!on_error) throw error // a silently dropped copy looks identical to a slow one
      on_error(error, text)
      return false
    }
    clearTimeout(timers.get(key)) // a re-copy gets a full window, not the old remainder
    copied.add(key)
    const timer = setTimeout(() => clear(key), duration_ms)
    timers.set(key, timer)
    return true
  }

  return { copied, copy, clear }
}

// === Anchored copy toast ===

// The copied element, a viewport point (a canvas click) or, by default, the focused element.
// With none of these the toast shows at the bottom center of the viewport.
export type CopyAnchor = Element | { x: number; y: number } | null

export interface CopyTextOptions {
  anchor?: CopyAnchor
  labels?: { success?: string; error?: string }
  duration_ms?: number
  // writes the text, navigator.clipboard.writeText by default; a no-op confirms a copy that
  // already happened, such as a copy event's clipboardData
  write?: (text: string) => Promise<void>
}

// One toast per page, so a new copy replaces the last confirmation instead of stacking. It is a
// top-layer popover (above dialogs and other popovers), re-shown per copy to stay on top, which
// re-inserts it into the accessibility tree. So screen readers hear a separate, never-toggled
// visually hidden live region instead, and the toast itself is aria-hidden.
let toast: HTMLElement | null = null
let live: HTMLElement | null = null
let clear_timer: ReturnType<typeof setTimeout> | undefined
let latest_copy = 0
// screen readers often skip a message landing in a just-inserted live region, so nothing is
// announced until this long after the last insertion
const FRESH_LIVE_DELAY_MS = 100
let live_ready_at = 0

const point_rect = (x: number, y: number) => ({ top: y, bottom: y, left: x, right: x })
const anchor_rect = (anchor: CopyAnchor | undefined) => {
  if (!(anchor instanceof Element)) return anchor && point_rect(anchor.x, anchor.y)
  const page_level = anchor === document.body || anchor === document.documentElement
  return anchor.isConnected && !page_level ? anchor.getBoundingClientRect() : null
}
// closest() stops at a shadow root, so continue from each root's host
const modal_dialog = (node: Element | null): Element | null => {
  for (let el = node; el;) {
    const dialog = el.closest(`dialog:modal`)
    if (dialog) return dialog
    const root = el.getRootNode()
    el = root instanceof ShadowRoot ? root.host : null
  }
  return null
}
// activeElement is retargeted to the shadow host, so descend through open shadow roots
const focused_element = () => {
  let el = document.activeElement
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement
  return el
}

// Writes `text` to the clipboard, confirms it in a toast beside `anchor` and announces it to
// screen readers. Resolves whether the write landed: a failure shows in the toast, so callers
// can fire and forget.
export async function copy_text(
  text: string,
  options: CopyTextOptions = {},
): Promise<boolean> {
  const {
    anchor = focused_element(),
    labels = {},
    duration_ms = 1000,
    write = (content: string) => navigator.clipboard.writeText(content),
  } = options
  // measured now: the anchor may re-render or detach while the write settles
  const rect = anchor_rect(anchor)
  // a modal dialog makes the rest of the page inert, hiding a toast outside it from screen readers
  const host =
    modal_dialog(anchor instanceof Element ? anchor : focused_element()) ?? document.body
  if (!toast || !live) {
    toast = document.createElement(`div`)
    toast.className = `copy-toast`
    toast.setAttribute(`aria-hidden`, `true`)
    toast.style.cssText = `position: fixed; inset: auto; margin: 0; border: 0; padding: 1px 5px; border-radius: 3px; font-size: 12px; color: white; white-space: nowrap; pointer-events: none; z-index: 10000; opacity: 0;`
    if (typeof toast.showPopover === `function`) toast.popover = `manual` // top layer
    live = document.createElement(`div`)
    live.className = `copy-toast-live`
    live.setAttribute(`role`, `status`)
    live.style.cssText = `position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap;`
  }
  const [el, region] = [toast, live] // narrowed for the callbacks below
  clearTimeout(clear_timer)
  // a copy mid-fade: the old animation's fill would otherwise hold the toast at its opacity
  for (const animation of el.getAnimations?.() ?? []) animation.cancel()
  el.textContent = ``
  region.textContent = ``
  el.style.opacity = `0`
  if (region.parentElement !== host) {
    host.append(region)
    live_ready_at = Date.now() + FRESH_LIVE_DELAY_MS
  }
  if (el.parentElement !== host) host.append(el)
  // re-shown each time so it stacks above top-layer surfaces opened since the last copy
  if (el.popover) {
    if (el.matches(`:popover-open`)) el.hidePopover()
    el.showPopover()
  }

  const copy_id = ++latest_copy
  let copied = true
  try {
    await write(text)
  } catch {
    copied = false
  }
  if (copy_id !== latest_copy) return copied // a newer copy owns the toast
  const message = copied ? (labels.success ?? `Copied!`) : (labels.error ?? `Copy failed`)
  const announce = () => {
    if (copy_id === latest_copy) region.textContent = message
  }
  const live_wait = live_ready_at - Date.now()
  if (live_wait > 0) setTimeout(announce, live_wait)
  else announce()
  el.textContent = message
  el.toggleAttribute(`data-error`, !copied)
  el.style.background = copied
    ? `var(--toast-success-color, #4a8f67)`
    : `var(--toast-error-color, crimson)`
  const { width, height } = el.getBoundingClientRect()
  // beside the anchor, else centered above the viewport's bottom edge
  const [target, placement] = rect
    ? [rect, `right` as const]
    : [point_rect(innerWidth / 2, innerHeight - 10), `top` as const]
  const position = { placement, offset: 6, padding: 4 }
  const { top, left } = compute_position(target, { width, height }, position)
  Object.assign(el.style, { top: `${top}px`, left: `${left}px`, opacity: `1` })
  const fade = { opacity: [0, 1, 1, 0], offset: [0, 0.15, 0.85, 1] }
  el.animate?.(fade, { duration: duration_ms, fill: `forwards` })
  const clear = () => {
    el.style.opacity = `0`
    el.textContent = ``
    region.textContent = ``
  }
  clear_timer = setTimeout(clear, Math.max(duration_ms, FRESH_LIVE_DELAY_MS))
  return copied
}
