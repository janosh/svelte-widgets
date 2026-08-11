// Computed CSS lengths resolve to `<number>px`; strip the unit so Number() can coerce.
// Empty and non-px values (e.g. `none`, `0.5rem`) yield NaN so callers can apply fallbacks.
export const css_px = (css_length: string): number => {
  const trimmed = css_length.trim()
  return trimmed ? Number(trimmed.replace(/px$/, ``)) : NaN
}

// Capture on `target` so a pointer over an iframe keeps reporting; window listeners still
// get the bubbled moves. `lostpointercapture` is target-only — end there too. pointerId
// filters a second finger; pointercancel ends like release.
export const is_primary_press = (event: PointerEvent) =>
  event.button === 0 && event.isPrimary
export const follow_pointer = (
  target: HTMLElement,
  pointer_id: number,
  on_move: (event: PointerEvent) => void,
  on_end: (event: PointerEvent) => void,
) => {
  const abort_controller = new AbortController()
  const { signal } = abort_controller
  target.setPointerCapture(pointer_id)
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
  }
}

// Layered keys: only the innermost surface hears one, so Escape closes a dropdown
// inside a modal and leaves the modal standing, and a dialog opened from a dialog
// owns Tab. Layers register in attach order, which matches nesting in practice.
// Capture phase so a handler calling stopPropagation cannot suppress them.
type KeyLayer = (event: KeyboardEvent) => void

const key_layer_stack = (wants: (event: KeyboardEvent) => boolean) => {
  const layers: KeyLayer[] = []
  const on_keydown = (event: KeyboardEvent) => {
    if (!event.defaultPrevented && wants(event)) layers.at(-1)?.(event)
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

// Register a handler on the shared LIFO Escape stack. Only the latest handler runs;
// already-handled and IME-composition events are skipped. Returns an unregister function.
export const register_escape_layer = key_layer_stack(
  (event) => event.key === `Escape` && !event.isComposing,
)

// isComposing for the same reason the Escape layer above filters it: Tab cycles IME
// candidates mid-composition, and swallowing it there eats the user's word choice
export const register_trap_layer = key_layer_stack(
  (event) => event.key === `Tab` && !event.isComposing,
)
