import { is_primary_press, register_escape_layer } from './shared'

export type DismissDetail = {
  // lets an Escape dismissal hand focus back to the trigger rather than strand it
  focus_inside: boolean
  via: `pointer` | `escape`
  event: Event // the press or keydown behind the dismissal, to forward to consumers
}

export type DismissConfig = {
  enabled?: boolean
  // Outside regions that still count as inside: chiefly the trigger, whose own click
  // toggles the surface right after this runs, and portalled content. Prefer elements over
  // selectors where you hold a reference — they cannot collide with another instance.
  inside?: (Element | string | null | undefined)[]
  // Confines `inside`'s selector entries to one subtree, so a second instance of the same
  // component cannot shield this one's surface. Resolved per press when a function, for a
  // `bind:this` still null at setup.
  scope?: Element | null | (() => Element | null | undefined)
  escape?: boolean // dismiss on Escape as well, reporting where focus was
  // `release` waits for the click: for surfaces floating over draggable content (a pan
  // behind them shouldn't dismiss) and outside checkboxes bound to the same state. It
  // dismisses on neither a right-click nor an OS window drag, which fire no click. See
  // dismiss_on_outside_press.
  dismiss_on?: `press` | `release`
}

export type ClickOutsideConfig<T extends HTMLElement> = DismissConfig & {
  callback?: (node: T, config: ClickOutsideConfig<T>, detail: DismissDetail) => void
}

export type DismissOptions = DismissConfig & {
  // The surface: counts as inside and receives the `dismiss` event. Omit it and `inside`
  // becomes the whole membership test, letting one listener cover several surfaces without
  // a shared wrapper (which would make every press between them count as inside).
  node?: Element | null
  callback?: (detail: DismissDetail) => void
}

// A scrollbar press targets the scrolling element, usually outside the surface, so without
// this, reaching for the page scrollbar dismisses the dropdown being scrolled toward.
const is_scrollbar_press = (event: Event): boolean => {
  const target = event.target
  if (!(event instanceof MouseEvent) || !(target instanceof Element)) return false
  const root = document.documentElement
  // page scrollbars: the root's client box excludes them, so coordinates past it are in
  // the gutter; zero sizes mean no layout (jsdom), not a hit
  if (target === root || target === document.body) {
    return (
      (root.clientWidth > 0 && event.clientX > root.clientWidth) ||
      (root.clientHeight > 0 && event.clientY > root.clientHeight)
    )
  }
  const rect = target.getBoundingClientRect()
  // clientWidth/Height are 0 for non-scrollable boxes (inline elements above all), hence
  // the overflow check: else every press right of one looks like a scrollbar hit. The
  // gutter also starts past the border, which the border-box rect includes and client* not.
  return (
    (target.scrollHeight > target.clientHeight &&
      event.clientX > rect.left + target.clientLeft + target.clientWidth) ||
    (target.scrollWidth > target.clientWidth &&
      event.clientY > rect.top + target.clientTop + target.clientHeight)
  )
}

// Outside-press dismiss, on `pointerdown` by default (a right-click or OS titlebar drag
// fires no click), via capture + composedPath. A plain function, so `node` may be omitted
// and `inside` alone defines the surface.
//
// `dismiss_on: 'release'` waits for the click, keeping a pan-behind open and letting an
// outside `bind:checked` checkbox close it (dismissing on the press writes checked=false
// before pre-click activation flips it back and the bind commits that). `release` also
// closes an outside trigger opened on the same gesture's pointerdown. Neither mode fixes
// `open = !open` on the control itself — put those in `inside`.
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

  if (!enabled) return () => {} // avoids registering an unused listener

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

  // document.activeElement reports the outermost shadow host, so descend the focus chain:
  // the host may be inside the node, or the node may live in that shadow tree itself.
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
  // Cleared on read, on pointercancel and for presses that fire no click (right-click,
  // second finger), else the next Enter-click inherits a stale verdict.
  let press_started_inside = false
  const remember_press = (event: PointerEvent) => {
    press_started_inside =
      is_primary_press(event) && is_inside(event.target, event.composedPath())
  }
  const forget_press = () => (press_started_inside = false)

  const handle_press = (event: Event) => {
    // A pointer verdict may only judge a pointer click: `detail` is 0 for keyboard and
    // programmatic clicks, which have no pointerdown and would inherit a stale `true`.
    const started_inside =
      press_started_inside && event instanceof MouseEvent && event.detail > 0
    press_started_inside = false
    if (started_inside) return
    const path = event.composedPath()
    if (is_scrollbar_press(event) || is_inside(event.target, path)) return
    // a press never restores focus — the user already picked where it lands
    dismiss({ focus_inside: false, via: `pointer`, event })
  }

  const on_escape = (event: KeyboardEvent) => {
    // Safe to swallow: only the innermost layer gets here, so no outer surface waits on it.
    // Canceling the default keeps a wrapping native <dialog> open until a second Escape.
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

// Attachment form: the attached element is the surface, so containment covers everything
// under it and `inside` is left for the trigger and portalled parts.
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
