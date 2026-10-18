export const composed_parent = (element: Element): Element | null => {
  if (element.parentElement) return element.parentElement
  const root = element.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

// only these two element types expose focus(); selector matches can include SVG anchors
export const focusable = (target: unknown): HTMLElement | SVGElement | null =>
  target instanceof HTMLElement || target instanceof SVGElement ? target : null

export const is_active_element = (element: Element): boolean => {
  const root = element.getRootNode()
  return `activeElement` in root && root.activeElement === element
}

export const is_focus_available = (element: Element): boolean => {
  if (element.matches(`:disabled,input[type="hidden" i]`)) return false
  // Descendants can override inherited visibility, so only the candidate's value matters.
  if ([`hidden`, `collapse`].includes(getComputedStyle(element).visibility)) return false
  let current: Element | null = element
  let child = element
  while (current) {
    const style = getComputedStyle(current)
    if (
      current.matches(`[hidden],[inert]`) ||
      style.display === `none` ||
      (current.matches(`details:not([open])`) &&
        current !== element &&
        current.querySelector(`:scope > summary`) !== child) ||
      (element.matches(`button,input,select,textarea`) &&
        current.matches(`fieldset[disabled]`) &&
        current.contains(element) &&
        !current.querySelector(`:scope > legend`)?.contains(element))
    )
      return false
    child = current
    current = composed_parent(current)
  }
  return true
}

// Computed CSS lengths resolve to `<number>px`; strip the unit so Number() coerces. Empty
// and non-px values (`none`, `auto`, `0.5rem`) give `fallback`.
export const css_px = (css_length: string, fallback = 0): number => {
  const trimmed = css_length.trim()
  const parsed = trimmed ? Number(trimmed.replace(/px$/, ``)) : NaN
  return Number.isFinite(parsed) ? parsed : fallback
}

export const is_primary_press = (event: PointerEvent) =>
  event.button === 0 && event.isPrimary
// Capture keeps moves reporting over iframes; lostpointercapture only fires on the target.
// Filter other pointers and end on release, cancellation or capture loss. Text selection is
// off page-wide until the returned stop runs.
export const follow_pointer = (
  target: HTMLElement,
  pointer_id: number,
  on_move: (event: PointerEvent) => void,
  on_end: (event: PointerEvent) => void,
) => {
  try {
    target.setPointerCapture(pointer_id)
  } catch (error) {
    if (!(error instanceof DOMException && error.name === `NotFoundError`)) throw error
    on_end(new PointerEvent(`pointercancel`, { pointerId: pointer_id }))
    return () => {}
  }

  const restore_user_select = override_style(
    target.ownerDocument.body.style,
    `user-select`,
    `none`,
  )
  const abort_controller = new AbortController()
  const { signal } = abort_controller
  const on_pointer = (event: PointerEvent) => {
    if (event.pointerId !== pointer_id) return
    if (event.type === `pointermove`) on_move(event)
    else on_end(event)
  }
  for (const type of [`pointermove`, `pointerup`, `pointercancel`] as const) {
    globalThis.addEventListener(type, on_pointer, { signal })
  }
  target.addEventListener(`lostpointercapture`, on_pointer, { signal })
  return () => {
    abort_controller.abort() // before release, or lostpointercapture re-enters on_end
    if (target.hasPointerCapture(pointer_id)) target.releasePointerCapture(pointer_id)
    restore_user_select()
  }
}

// Offer keys newest-first until a layer handles them. Capture runs before descendant handlers.
type KeyLayer = (event: KeyboardEvent) => boolean

const key_layer_stack = (wants: (event: KeyboardEvent) => boolean) => {
  const layers: KeyLayer[] = []
  const on_keydown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || !wants(event)) return
    for (let idx = layers.length - 1; idx >= 0; idx--) {
      if (layers[idx](event)) return
    }
  }
  return (layer: KeyLayer) => {
    if (layers.length === 0) document.addEventListener(`keydown`, on_keydown, true)
    layers.push(layer)
    return () => {
      const idx = layers.indexOf(layer)
      if (idx !== -1) layers.splice(idx, 1)
      if (layers.length === 0) document.removeEventListener(`keydown`, on_keydown, true)
    }
  }
}

// Register an Escape handler; return true to consume, false to try the next layer.
// Returns an unregister function. Skip prevented events and IME composition.
export const register_escape_layer = key_layer_stack(
  (event) => event.key === `Escape` && !event.isComposing,
)

// An Escape layer that always consumes the key. Safe to swallow: only the innermost layer
// gets here, so no outer surface waits on it. Canceling the default keeps a wrapping native
// <dialog> open until a second Escape.
export const claim_escape = (handler: (event: KeyboardEvent) => void) =>
  register_escape_layer((event) => {
    event.preventDefault()
    event.stopPropagation()
    handler(event)
    return true
  })

// Attachment holding the top Escape layer while focus is inside the node, so a bar or panel
// closes itself rather than the pane or dialog hosting it. Re-claims on every focusin, so it
// also outranks layers registered after it. Capture phase so descendants claiming their own
// layer on focusin (e.g. a tooltip on a focused button) still land above it.
export const claim_escape_while_focused =
  (handler: (event: KeyboardEvent) => void) =>
  (node: HTMLElement): (() => void) => {
    let release: (() => void) | undefined
    const stop = () => {
      release?.()
      release = undefined
    }
    const claim = () => {
      stop()
      release = claim_escape(handler)
    }
    const listeners = new AbortController()
    const { signal } = listeners
    node.addEventListener(`focusin`, claim, { signal, capture: true })
    node.addEventListener(
      `focusout`,
      ({ relatedTarget }) => {
        if (!(relatedTarget instanceof Node && node.contains(relatedTarget))) stop()
      },
      { signal },
    )
    if (node.matches(`:focus-within`)) claim()
    return () => {
      listeners.abort()
      stop()
    }
  }

// isComposing for the same reason the Escape layer above filters it: Tab cycles IME
// candidates mid-composition, and swallowing it there eats the user's word choice
export const register_trap_layer = key_layer_stack(
  (event) => event.key === `Tab` && !event.isComposing,
)
const style_overrides = new WeakMap<
  CSSStyleDeclaration,
  Map<string, { value: string; priority: string; requests: Map<symbol, string> }>
>()

// Latest active owner wins; the last release restores the original inline declaration.
export function override_style(
  style: CSSStyleDeclaration,
  property: string,
  value: string,
) {
  let properties = style_overrides.get(style)
  if (!properties) style_overrides.set(style, (properties = new Map()))
  let state = properties.get(property)
  if (!state) {
    state = {
      value: style.getPropertyValue(property),
      priority: style.getPropertyPriority(property),
      requests: new Map(),
    }
    properties.set(property, state)
  }
  const owner = Symbol(property)
  const { requests, priority, value: original } = state
  requests.set(owner, value)
  style.setProperty(property, value, priority)
  return () => {
    if (!requests.delete(owner)) return
    style.setProperty(property, [...requests.values()].at(-1) ?? original, priority)
    if (!requests.size) properties.delete(property)
  }
}
