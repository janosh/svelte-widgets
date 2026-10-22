import type { TransitionConfig } from 'svelte/transition'
import { float } from './float'
import { register_escape_layer } from './shared'

// Each open anchored popover's silent close (hide without reporting it through on_close)
const silent_closers = new WeakMap<Element, () => void>()

export type AnchoredPopoverOptions = {
  anchor: HTMLButtonElement | null | undefined
  on_close: () => void
  placement?: `top` | `bottom` // preferred side; float flips when it doesn't fit
  align?: `start` | `center` | `end`
}

// Shows a dropdown as a native auto popover floated beside its trigger: the top layer escapes
// overflow clipping and stacking contexts, and the browser owns light dismiss. The trigger is
// the invoker (`popovertarget`), so pressing it toggles rather than dismissing and reopening.
// `on_close` reports every close from the synchronous `beforetoggle` (the async `toggle` comes
// a frame late, painting a closed menu in normal flow). Unmounting closes it silently. Pair it
// with `out:close_before_removal`.
export const anchored_popover =
  ({ anchor, on_close, placement = `bottom`, align = `end` }: AnchoredPopoverOptions) =>
  (node: HTMLElement): (() => void) | undefined => {
    if (!anchor) return undefined
    const handle_toggle = (event: ToggleEvent) => {
      if (event.newState === `closed`) on_close()
    }
    // Escape belongs to the open popover (the innermost Escape layer), before a host's own
    // Escape handling. Focus returns to the trigger before hiding: the browser's own restore
    // fires focusin mid-hide, where a tooltip's showPopover throws.
    const release_escape = register_escape_layer((event) => {
      if (!node.matches(`:popover-open`)) return false
      event.preventDefault()
      event.stopPropagation()
      if (node.contains(document.activeElement)) anchor.focus()
      node.hidePopover()
      return true
    })
    // Teardown restores what this changes: a rerun that bails (the anchor gone) must leave the
    // node as it was, not a hidden popover
    const { pointerEvents, inset, margin } = node.style
    const before = {
      popover: node.popover,
      style: { pointerEvents, inset, margin },
      target: anchor.popoverTargetElement,
      action: anchor.popoverTargetAction,
    }
    node.popover = `auto`
    // The top layer doesn't escape inherited styles: a click-through host overlay would pass
    // `pointer-events: none` on to the menu. `inset` and `margin` undo the UA [popover] box,
    // which would center the menu over `float`'s top/left.
    Object.assign(node.style, { pointerEvents: `auto`, inset: `auto`, margin: `0` })
    anchor.popoverTargetElement = node
    // `show`: the click that just opened it (its native step runs after the caller's handler)
    // must not hide it again; closing on a trigger click is the caller's handler's job
    anchor.popoverTargetAction = `show`
    node.addEventListener(`beforetoggle`, handle_toggle)
    node.showPopover({ source: anchor })
    const stop_float = float({ anchor, placement, align, offset: 4, padding: 4 })(node)
    const close_silently = () => {
      node.removeEventListener(`beforetoggle`, handle_toggle)
      if (!node.matches(`:popover-open`)) return
      const focus_inside = node.contains(document.activeElement)
      node.hidePopover()
      // With focus inside, hiding refocuses the trigger. Keep that for keyboard users; after a
      // mouse pick it would open the trigger's tooltip, so drop focus. Blur after hiding:
      // blurring first left the host's :hover stale.
      const refocused = focus_inside && document.activeElement === anchor
      if (refocused && !anchor.matches(`:focus-visible`)) anchor.blur()
    }
    silent_closers.set(node, close_silently)
    return () => {
      close_silently()
      silent_closers.delete(node)
      release_escape()
      stop_float?.()
      node.popover = before.popover
      Object.assign(node.style, before.style)
      anchor.popoverTargetElement = before.target
      anchor.popoverTargetAction = before.action
    }
  }

// Outro hiding an anchored popover before Svelte removes it. Svelte detaches DOM before
// attachment teardown, and Chromium leaves stale :hover on the host (hiding its hover-only
// chrome) when an open top-layer element is removed under the pointer. An outro
// runs before the removal, and with no duration the removal still happens synchronously.
export const close_before_removal = (node: Element): TransitionConfig => {
  silent_closers.get(node)?.()
  return {}
}
