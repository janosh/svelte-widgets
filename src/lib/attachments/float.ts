import type { Attachment } from 'svelte/attachments'
import type { PositionOptions } from '../utils'
import { compute_position } from '../utils'

export type AnchorRect = { top: number; left: number; bottom: number; right: number }

// Coalesces position updates from scroll, resize and observed size changes; the caller
// does the initial update.
export const auto_update_position = (
  anchor: Element | null,
  floating: Element,
  update: () => void,
): (() => void) => {
  const view = floating.ownerDocument.defaultView
  const visual_viewport = view?.visualViewport
  const animation_host = view ?? globalThis
  let frame_id: number | undefined
  const schedule_update = () => {
    if (frame_id !== undefined) return
    frame_id = animation_host.requestAnimationFrame(() => {
      frame_id = undefined
      update()
    })
  }

  const listeners = new AbortController()
  const { signal } = listeners
  // capture: a scroll in any ancestor moves the anchor, and scroll does not bubble
  view?.addEventListener(`scroll`, schedule_update, { capture: true, signal })
  view?.addEventListener(`resize`, schedule_update, { signal })
  visual_viewport?.addEventListener(`scroll`, schedule_update, { signal })
  visual_viewport?.addEventListener(`resize`, schedule_update, { signal })
  const resize_observer =
    typeof ResizeObserver === `undefined` ? null : new ResizeObserver(schedule_update)
  resize_observer?.observe(floating)
  if (anchor) resize_observer?.observe(anchor)

  return () => {
    listeners.abort()
    resize_observer?.disconnect()
    if (frame_id !== undefined) animation_host.cancelAnimationFrame(frame_id)
  }
}

export interface FloatOptions extends PositionOptions {
  // a rect covers anchors with no markup: a context menu's pointer position, a text
  // selection, a canvas cell
  anchor?: Element | AnchorRect | null
  enabled?: boolean
  // `fixed` needs no scroll bookkeeping but an ancestor transform clips it; `absolute`
  // survives that, paying page scroll on every update
  strategy?: `fixed` | `absolute`
  match_width?: boolean // use the anchor's exact border-box width, for dropdowns
}

// Parks an element next to an anchor and keeps it there while the page moves. Geometry
// comes from compute_position, so tooltip, portalled dropdown and this flip and shift alike.
export const float =
  (options: FloatOptions = {}) =>
  (node: Element): (() => void) | undefined => {
    const {
      anchor,
      enabled = true,
      strategy = `fixed`,
      match_width = false,
      ...position_options
    } = options
    if (!enabled || !anchor || !(node instanceof HTMLElement)) return undefined

    const anchor_element = anchor instanceof Element ? anchor : null
    // every inline value `update` may write, so a node outliving the attachment (a
    // persistent surface toggled by `enabled`) is handed back as it arrived
    const original_styles = {
      position: node.style.position,
      left: node.style.left,
      top: node.style.top,
      boxSizing: node.style.boxSizing,
      minWidth: node.style.minWidth,
      width: node.style.width,
    }
    const original_placement = node.dataset.placement
    const scroll_view = strategy === `absolute` ? node.ownerDocument.defaultView : null
    const update = () => {
      // out of flow before measuring: in flow it is a sibling pushing the very anchor it
      // measures, landing half its height off
      node.style.position = strategy
      const anchor_rect =
        anchor instanceof Element ? anchor.getBoundingClientRect() : anchor
      if (match_width) {
        const width = `${anchor_rect.right - anchor_rect.left}px`
        node.style.boxSizing = `border-box`
        node.style.minWidth = width
        node.style.width = width
      }
      const { top, left, placement } = compute_position(
        anchor_rect,
        node.getBoundingClientRect(),
        position_options,
      )
      // compute_position is in viewport coordinates, which `absolute` offsets from the
      // page origin; scroll comes from the node's own view, not the top window
      node.style.left = `${left + (scroll_view?.scrollX ?? 0)}px`
      node.style.top = `${top + (scroll_view?.scrollY ?? 0)}px`
      node.dataset.placement = placement
    }

    update()
    const stop_auto_update = auto_update_position(anchor_element, node, update)
    return () => {
      stop_auto_update()
      Object.assign(node.style, original_styles)
      if (original_placement === undefined) delete node.dataset.placement
      else node.dataset.placement = original_placement
    }
  }

// Teleport an element into `target` and put it back on teardown, marking where it
// belongs with a comment node so the original position survives siblings coming and
// going. Lets a surface escape an ancestor that would clip it (`overflow: hidden`) or
// trap its `position: fixed` (any `transform`), and lets a component offer its chrome
// for placement in a host's toolbar without duplicating the markup.
// Pairs with `float`: portal moves an element, float places it.
export const portal =
  (target: Element | null | undefined): Attachment =>
  (node: Element): (() => void) | undefined => {
    if (!target || target === node.parentNode) return undefined
    const anchor = node.ownerDocument.createComment(`portal`)
    node.before(anchor)
    target.append(node)
    return () => {
      // Svelte removes a destroyed block's nodes before running teardown, so a node no
      // longer in the target must not be put back: its home is still live markup.
      if (node.parentNode !== target) anchor.remove()
      // Original parent already gone: replaceWith would be a no-op and strand the
      // node inside the target, outliving the markup that owns it.
      else if (anchor.parentNode) anchor.replaceWith(node)
      else node.remove()
    }
  }
