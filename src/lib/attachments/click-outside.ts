import type { Attachment } from 'svelte/attachments'
import { is_primary_press, register_escape_layer } from './shared'

export type DismissDetail = {
  // Whether focus sat inside the node, so an Escape dismissal can hand focus back
  // to the trigger instead of stranding it on a removed element
  focus_inside: boolean
  via: `pointer` | `escape`
  event: Event // the press or keydown behind the dismissal, to forward to consumers
}

export type DismissConfig = {
  enabled?: boolean
  // Regions that count as inside though they sit outside the node: the trigger above
  // all, whose own click toggles the surface right after this runs, and portalled
  // content the node no longer contains. Elements beat selectors where you hold a
  // reference — they cannot collide with another instance's markup.
  inside?: (Element | string | null | undefined)[]
  // Confines the selector entries of `inside` to one subtree, so a second instance
  // of the same component cannot shield this one's surface with its own trigger.
  // Resolved per press when a function, for a `bind:this` still null at setup time.
  scope?: Element | null | (() => Element | null | undefined)
  escape?: boolean // dismiss on Escape as well, reporting where focus was
  // `release` waits for the click, for a surface floating over something draggable (starting a
  // pan or an orbit behind it should not make it vanish under the cursor) and for an outside
  // checkbox bound to the same state, which cannot close the surface otherwise. It gives up
  // dismissing on a right-click and on a press the OS turns into a window drag, neither of
  // which fires a click at all. See dismiss_on_outside_press.
  dismiss_on?: `press` | `release`
}

export type ClickOutsideConfig<T extends HTMLElement> = DismissConfig & {
  callback?: (node: T, config: ClickOutsideConfig<T>, detail: DismissDetail) => void
}

export type DismissOptions = DismissConfig & {
  // The surface, where a single element is one: it counts as inside and receives the
  // `dismiss` event. Leave it out and `inside` becomes the whole membership test,
  // which is what lets one listener cover several surfaces with no shared wrapper —
  // wrapping them would make every press between them count as inside.
  node?: Element | null
  callback?: (detail: DismissDetail) => void
}

// A press on a scrollbar reports the scrolling element as its target, which usually
// sits outside the surface. Without this, reaching for the page scrollbar would
// dismiss the very dropdown the user is scrolling toward.
const is_scrollbar_press = (event: Event): boolean => {
  const target = event.target
  if (!(event instanceof MouseEvent) || !(target instanceof Element)) return false
  const root = document.documentElement
  // Page scrollbars: the root's client box excludes them, so viewport coordinates
  // beyond it land in the gutter. Zero sizes mean no layout (jsdom), not a hit.
  if (target === root || target === document.body) {
    return (
      (root.clientWidth > 0 && event.clientX > root.clientWidth) ||
      (root.clientHeight > 0 && event.clientY > root.clientHeight)
    )
  }
  const rect = target.getBoundingClientRect()
  // clientWidth/Height are 0 for non-scrollable boxes (inline elements above all),
  // hence the overflow check — otherwise every press right of such a box looks like
  // a scrollbar hit and silently suppresses dismissal.
  return (
    (target.scrollHeight > target.clientHeight &&
      event.clientX > rect.left + target.clientWidth) ||
    (target.scrollWidth > target.clientWidth &&
      event.clientY > rect.top + target.clientHeight)
  )
}

// Outside-press dismiss. Default `pointerdown` (right-click / OS titlebar drag fire no
// click). Capture + composedPath. Plain function so `node` can be omitted and `inside`
// alone defines the surface.
//
// `dismiss_on: 'release'` waits for the click — pan-behind stays open, and an outside
// `bind:checked` checkbox can close it (dismiss on the press and Svelte's flush writes
// checked=false before the click's pre-click activation flips it back, which the bind commits).
// Neither mode fixes `open = !open` on the control itself; put those in `inside`. `release`
// also closes an outside trigger that opened on the same gesture's `pointerdown`.
export const dismiss_on_outside_press = (options: DismissOptions = {}): (() => void) => {
  const {
    node,
    callback,
    enabled = true,
    inside = [],
    scope,
    escape = false,
    dismiss_on = `press`,
  } = options

  if (!enabled) return () => {} // Early return avoids registering unused listener

  const inside_nodes = [node, ...inside].filter((item) => item instanceof Element)
  // Empty entries would make the joined selector invalid and throw on every press
  const inside_selector = inside
    .filter((item): item is string => typeof item === `string` && item !== ``)
    .join(`,`)
  // `path` is empty for the focus check, which has no event to walk
  const is_inside = (target: EventTarget | null, path: EventTarget[] = []): boolean => {
    const node_target = target instanceof Node ? target : null
    if (inside_nodes.some((el) => path.includes(el) || el.contains(node_target))) {
      return true
    }
    // Element (not HTMLElement) so a press on an SVG child still matches a selector
    if (!inside_selector || !(target instanceof Element)) return false
    const match = target.closest(inside_selector)
    if (!match) return false
    const resolved_scope = typeof scope === `function` ? scope() : scope
    return !resolved_scope || resolved_scope.contains(match)
  }

  // document.activeElement reports the outermost shadow host, so descend the focus
  // chain: the host may be inside the node (containment settles it at the first
  // step) or the node may itself live in that shadow tree alongside the focus.
  const focus_is_inside = (): boolean => {
    let active = document.activeElement
    while (active) {
      if (is_inside(active)) return true
      active = active.shadowRoot?.activeElement ?? null
    }
    return false
  }

  const dismiss = (detail: DismissDetail) => {
    callback?.(detail)
    node?.dispatchEvent(new CustomEvent(`dismiss`, { detail }))
  }

  // `release` only: ignore a click whose pointerdown was inside (resize released outside).
  // Cleared on read, on pointercancel and for any press that fires no click of its own (a
  // right-click, a second finger), else the next Enter-click inherits a stale verdict.
  let press_started_inside = false
  const remember_press = (event: PointerEvent) => {
    press_started_inside =
      is_primary_press(event) && is_inside(event.target, event.composedPath())
  }
  const forget_press = () => (press_started_inside = false)

  const handle_press = (event: Event) => {
    // A pointer verdict may only judge a pointer click. `detail` is 0 for keyboard and
    // programmatic clicks, which carry no pointerdown of their own and would otherwise
    // inherit a stale `true` from a press that never produced a click.
    const started_inside =
      press_started_inside && event instanceof MouseEvent && event.detail > 0
    press_started_inside = false
    if (started_inside) return
    const path = event.composedPath()
    if (is_scrollbar_press(event) || is_inside(event.target, path)) return
    // A press never restores focus — the user already picked where it lands
    dismiss({ focus_inside: false, via: `pointer`, event })
  }

  const on_escape = (event: KeyboardEvent) => {
    // Safe to swallow the key: only the innermost layer gets here, so no outer
    // surface is waiting on it. Canceling the default keeps a native <dialog>
    // around the surface open until a second Escape, once this layer is gone.
    event.preventDefault()
    event.stopPropagation()
    dismiss({ focus_inside: focus_is_inside(), via: `escape`, event })
    return true
  }

  const wait_for_release = dismiss_on === `release`
  const listeners = new AbortController()
  const capture = { capture: true, signal: listeners.signal }
  const press_event = wait_for_release ? `click` : `pointerdown`
  document.addEventListener(press_event, handle_press, capture)
  if (wait_for_release) {
    document.addEventListener(`pointerdown`, remember_press, capture)
    document.addEventListener(`pointercancel`, forget_press, capture)
  }
  const unregister_escape = escape ? register_escape_layer(on_escape) : undefined

  return () => {
    listeners.abort()
    unregister_escape?.()
  }
}

// The attachment form: the element it is attached to is the surface, so containment
// covers everything under it and `inside` is left for the trigger and portalled parts.
export const click_outside =
  <T extends HTMLElement>(config: ClickOutsideConfig<T> = {}) =>
  (node: T): (() => void) | undefined => {
    if (config.enabled === false) return undefined
    return dismiss_on_outside_press({
      ...config,
      node,
      callback: (detail) => config.callback?.(node, config, detail),
    })
  }

// ::backdrop (and dialog padding) both target the dialog — only coordinates tell them
// apart. Start must be outside too, or a selection dragged onto the backdrop dismisses.
export const backdrop_dismiss =
  (callback?: () => void): Attachment<HTMLDialogElement> =>
  (node) => {
    let press_outside = false
    const is_outside_box = ({ target, clientX, clientY }: MouseEvent) => {
      if (target !== node) return false
      const { top, right, bottom, left } = node.getBoundingClientRect()
      return clientX < left || clientX > right || clientY < top || clientY > bottom
    }
    // Same primary/cancel gating as dismiss_on_outside_press: a right-click or second finger
    // must not leave a stale outside verdict for the next click.
    const on_pointerdown = (event: PointerEvent) => {
      press_outside = is_primary_press(event) && is_outside_box(event)
    }
    const forget_press = () => (press_outside = false)
    const on_click = (event: MouseEvent) => {
      if (press_outside && is_outside_box(event)) (callback ?? (() => node.close()))()
      press_outside = false
    }
    const listeners = new AbortController()
    const { signal } = listeners
    node.addEventListener(`pointerdown`, on_pointerdown, { signal })
    node.addEventListener(`pointercancel`, forget_press, { signal })
    node.addEventListener(`click`, on_click, { signal })
    return () => listeners.abort()
  }
