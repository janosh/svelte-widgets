// mid-IME keystrokes belong to the input method. WebKit ends the composition before the
// Enter (or Escape) that confirms a candidate, so that keydown reads isComposing=false and
// only its legacy keyCode 229 gives it away.
export const is_composing = (event: KeyboardEvent): boolean =>
  // oxlint-disable-next-line typescript/no-deprecated -- WebKit's only IME signal here
  event.isComposing || event.keyCode === 229

// Flat-tree parent: slotted light-DOM content renders inside its slot (and the slot's
// shadow ancestors), and a shadow root's top-level children continue at the host.
export const composed_parent = (element: Element): Element | null => {
  const parent = element.assignedSlot ?? element.parentElement
  if (parent) return parent
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
// Presses a gesture (e.g. a resize handle) already owns. Other gestures on the same node or
// an ancestor skip them, while unrelated outer listeners still see the bubbling event.
export const claimed_pointer_events = new WeakSet<Event>()
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

const push_escape_layer = key_layer_stack(
  (event) => event.key === `Escape` && !is_composing(event),
)

// document.activeElement stops at the outermost shadow host, so walk down the focus chain:
// the host may sit inside the node, or the node inside that shadow tree.
const holds_focus = (node: Node): boolean => {
  let active = document.activeElement
  while (active) {
    if (node.contains(active)) return true
    active = active.shadowRoot?.activeElement ?? null
  }
  return false
}

export interface EscapeLayerOptions {
  // Take every key that reaches the layer, whatever the handler returns: cancel its default,
  // stop its propagation and stop older layers. Safe to swallow: only the innermost layer
  // gets here, so no outer surface waits on it. Canceling the default keeps a wrapping
  // native <dialog> open until a second Escape.
  consume?: boolean
  // Hold the layer only while focus is inside this node. Re-registers on every focusin, so
  // it also outranks layers registered after it. Capture phase so descendants claiming their
  // own layer on focusin (e.g. a tooltip on a focused button) still land above it.
  while_focused?: HTMLElement
}

// Add an Escape handler to the shared newest-first stack, listening on document keydown
// capture (before descendant handlers) and skipping prevented events and IME composition.
// Without `consume`, return true to stop older layers or false to pass the key on. Such a
// layer keeps outer surfaces (a pane, a dialog) from seeing the key while still letting it
// reach the focused node's own keydown handlers, e.g.
// `{@attach (node) => escape_layer(() => open, { while_focused: node })}` for a dropdown
// that closes itself on Escape. Returns the unregister function, so it also works as the
// body of an attachment.
export const escape_layer = (
  handler: (event: KeyboardEvent) => unknown,
  { consume = false, while_focused: node }: EscapeLayerOptions = {},
): (() => void) => {
  const layer = (event: KeyboardEvent) => {
    if (!consume) return Boolean(handler(event))
    event.preventDefault()
    event.stopPropagation()
    handler(event)
    return true
  }
  if (!node) return push_escape_layer(layer)
  let release: (() => void) | undefined
  const stop = () => {
    release?.()
    release = undefined
  }
  const claim = () => {
    stop()
    release = push_escape_layer((event) => {
      // Focus can leave without a focusout reaching the node (a focused descendant hidden
      // via display: none or removed), so drop the stale hold and pass the key on.
      if (holds_focus(node)) return layer(event)
      stop()
      return false
    })
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
  if (holds_focus(node)) claim()
  return () => {
    listeners.abort()
    stop()
  }
}

// isComposing for the same reason the Escape layer above filters it: Tab cycles IME
// candidates mid-composition, and swallowing it there eats the user's word choice
export const register_trap_layer = key_layer_stack(
  (event) => event.key === `Tab` && !is_composing(event),
)
const style_overrides = new WeakMap<
  CSSStyleDeclaration,
  Map<string, { value: string; priority: string; requests: Map<symbol, string> }>
>()

// Latest active owner wins; the last release restores the original inline declaration.
export const override_style = (
  style: CSSStyleDeclaration,
  property: string,
  value: string,
): (() => void) => {
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
