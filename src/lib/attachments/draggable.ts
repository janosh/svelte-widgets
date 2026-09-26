import type { Attachment } from 'svelte/attachments'
import { clamp } from '../utils'
import type { AnchorRect } from './float'
import { css_px, follow_pointer, is_primary_press, override_style } from './shared'

export interface DraggableOptions {
  handle_selector?: string
  axis?: `x` | `y` | `both`
  bounds?: `parent` | Element | AnchorRect
  disabled?: boolean
  on_drag_start?: (event: PointerEvent) => void
  on_drag?: (event: PointerEvent) => void
  on_drag_end?: (event: PointerEvent) => void
}

export const draggable =
  (options: DraggableOptions = {}): Attachment =>
  (node: Element): (() => void) | undefined => {
    const { handle_selector, axis = `both`, bounds } = options
    if (options.disabled || !(node instanceof HTMLElement)) return undefined
    const [move_x, move_y] = [axis !== `y`, axis !== `x`]

    let dragging = false
    let stop_pointer_follow: (() => void) | undefined
    let restore_user_select: (() => void) | undefined
    let start = { x: 0, y: 0 }
    // pointer delta range keeping the node inside `bounds`
    const unbounded = {
      min_x: -Infinity,
      max_x: Infinity,
      min_y: -Infinity,
      max_y: Infinity,
    }
    let limits = unbounded
    const initial = { left: 0, top: 0 }

    const drag_handle = handle_selector
      ? node.querySelector<HTMLElement>(handle_selector)
      : node
    if (!drag_handle) {
      console.warn(`Draggable: handle not found with selector "${handle_selector}"`)
      return undefined
    }

    const on_pointerdown = (event: PointerEvent) => {
      // `dragging` bars a second primary pointer mid-drag (mouse while a touch is down),
      // which would strand the first follower's listeners past cleanup
      if (dragging || !is_primary_press(event)) return
      if (!(event.target instanceof Node) || !drag_handle.contains(event.target)) return

      dragging = true
      // A fixed node is placed in viewport coordinates (what its rect reports), an absolute
      // one against its offset parent. A relative or promoted-static node is already in
      // flow, where offsetLeft would double its position, so continue from its insets.
      const styles = getComputedStyle(node)
      const origin =
        styles.position === `fixed`
          ? node.getBoundingClientRect()
          : styles.position === `absolute`
            ? { left: node.offsetLeft, top: node.offsetTop }
            : { left: css_px(styles.left) || 0, top: css_px(styles.top) || 0 }
      if (styles.position === `static`) node.style.position = `relative`
      // Rect and offsetLeft report the border edge, but left/top place the margin edge, so
      // an out-of-flow node with margins would jump by them on the first press. The in-flow
      // branch read the insets themselves and is already in that space.
      const out_of_flow = [`fixed`, `absolute`].includes(styles.position)
      initial.left = origin.left - (out_of_flow ? css_px(styles.marginLeft) || 0 : 0)
      initial.top = origin.top - (out_of_flow ? css_px(styles.marginTop) || 0 : 0)

      if (move_x) {
        node.style.left = `${initial.left}px`
        node.style.right = `auto` // Prevent conflict with left
      }
      if (move_y) {
        node.style.top = `${initial.top}px`
        node.style.bottom = `auto`
      }

      limits = unbounded
      const boundary = bounds === `parent` ? node.parentElement : bounds
      const bounds_rect =
        boundary instanceof Element ? boundary.getBoundingClientRect() : boundary
      // A box-less Element (not an explicit zero-sized rect) cannot contain anything.
      if (
        bounds_rect &&
        (!(boundary instanceof Element) ||
          bounds_rect.left !== bounds_rect.right ||
          bounds_rect.top !== bounds_rect.bottom)
      ) {
        // after normalizing inset styles, which can move a node positioned from its right
        // or bottom edge
        const node_rect = node.getBoundingClientRect()
        const min_x = bounds_rect.left - node_rect.left
        const min_y = bounds_rect.top - node_rect.top
        limits = {
          min_x,
          max_x: Math.max(min_x, bounds_rect.right - node_rect.right),
          min_y,
          max_y: Math.max(min_y, bounds_rect.bottom - node_rect.bottom),
        }
      }
      start = { x: event.clientX, y: event.clientY }
      restore_user_select = override_style(
        node.ownerDocument.body.style,
        `user-select`,
        `none`,
      ) // Prevent text selection during drag
      drag_handle.style.cursor = `grabbing`

      options.on_drag_start?.(event)
      stop_pointer_follow = follow_pointer(
        drag_handle,
        event.pointerId,
        on_pointermove,
        on_pointerup,
      )
    }

    const on_pointermove = (event: PointerEvent) => {
      if (!dragging) return
      if (move_x) {
        const delta_x = clamp(event.clientX - start.x, limits.min_x, limits.max_x)
        node.style.left = `${initial.left + delta_x}px`
      }
      if (move_y) {
        const delta_y = clamp(event.clientY - start.y, limits.min_y, limits.max_y)
        node.style.top = `${initial.top + delta_y}px`
      }
      options.on_drag?.(event)
    }

    const on_pointerup = (event: PointerEvent) => {
      if (!dragging) return
      dragging = false
      event.stopPropagation()
      restore_user_select?.()
      drag_handle.style.cursor = `grab`
      stop_pointer_follow?.()
      options.on_drag_end?.(event)
    }

    // restore consumer inline styles on teardown rather than blanking them
    const previous_styles = {
      cursor: drag_handle.style.cursor,
      touch_action: drag_handle.style.touchAction,
    }
    drag_handle.addEventListener(`pointerdown`, on_pointerdown)
    drag_handle.style.cursor = `grab`
    drag_handle.style.touchAction = `none` // else the browser pans and the drag never moves

    return () => {
      stop_pointer_follow?.()
      restore_user_select?.()
      drag_handle.removeEventListener(`pointerdown`, on_pointerdown)
      drag_handle.style.cursor = previous_styles.cursor
      drag_handle.style.touchAction = previous_styles.touch_action
    }
  }
