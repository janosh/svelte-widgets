import type { Attachment } from 'svelte/attachments'
import type { PositionOptions } from '../utils'
import { compute_position } from '../utils'

export type AnchorRect = { top: number; left: number; bottom: number; right: number }

// Coalesce position updates from scrolling, resizing and observed element size changes.
// The caller performs the initial update; this returns a cleanup function.
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
  // A rect instead of an element covers anchors with no markup: the pointer position
  // a context menu opens at, a text selection, a cell in a canvas.
  anchor?: Element | AnchorRect | null
  enabled?: boolean
  // `fixed` needs no scroll bookkeeping but is clipped by an ancestor's transform;
  // `absolute` survives that at the cost of adding page scroll to every update.
  strategy?: `fixed` | `absolute`
  match_width?: boolean // use the anchor's exact border-box width, for dropdowns
}

// Park an element next to an anchor and keep it there while the page moves.
// Geometry comes from compute_position, the same one the tooltip and the portalled
// dropdown use, so all three flip and shift alike.
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
    // Every inline value `update` may write, so a node that outlives the attachment
    // (a persistent surface toggled by `enabled`) is handed back as it arrived.
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
      // Out of flow before measuring: an in-flow surface is a sibling that pushes the
      // very anchor it is about to measure, which lands it half its height off.
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
      // compute_position works in viewport coordinates, which `absolute` offsets from
      // the page origin. Scroll comes from the node's own view, not the top window.
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
      // Original parent already gone: replaceWith would be a no-op and strand the
      // node inside the target, outliving the markup that owns it.
      if (anchor.parentNode) anchor.replaceWith(node)
      else node.remove()
    }
  }
