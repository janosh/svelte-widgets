import type { Attachment } from 'svelte/attachments'
import { clamp } from '../utils'
import type { AnchorRect } from './float'
import { follow_pointer, is_primary_press } from './shared'

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
  (element: Element): (() => void) | undefined => {
    const { handle_selector, axis = `both`, bounds } = options
    if (options.disabled || !(element instanceof HTMLElement)) return undefined
    const node = element
    const [move_x, move_y] = [axis !== `y`, axis !== `x`]

    let dragging = false
    let stop_pointer_follow: (() => void) | undefined
    let previous_user_select = ``
    let start = { x: 0, y: 0 }
    let min_delta_x = -Infinity
    let max_delta_x = Infinity
    let min_delta_y = -Infinity
    let max_delta_y = Infinity
    const initial = { left: 0, top: 0 }

    const found = handle_selector
      ? node.querySelector<HTMLElement>(handle_selector)
      : node
    if (!found) {
      console.warn(`Draggable: handle not found with selector "${handle_selector}"`)
      return undefined
    }
    // Aliased so the narrowing survives into the hoisted handlers below
    const drag_handle = found

    function on_pointerdown(event: PointerEvent) {
      // `dragging` bars a second primary pointer mid-drag (mouse while a touch is down),
      // which would strand the first follower's listeners past cleanup.
      if (dragging || !is_primary_press(event)) return
      if (!(event.target instanceof Node) || !drag_handle.contains(event.target)) return

      dragging = true
      // A fixed node is placed in viewport coordinates, which is what its rect reports;
      // everything else is placed against its offset parent.
      const origin =
        getComputedStyle(node).position === `fixed`
          ? node.getBoundingClientRect()
          : { left: node.offsetLeft, top: node.offsetTop }
      initial.left = origin.left
      initial.top = origin.top

      if (move_x) {
        node.style.left = `${initial.left}px`
        node.style.right = `auto` // Prevent conflict with left
      }
      if (move_y) {
        node.style.top = `${initial.top}px`
        node.style.bottom = `auto`
      }

      min_delta_x = -Infinity
      max_delta_x = Infinity
      min_delta_y = -Infinity
      max_delta_y = Infinity
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
        // Measure after normalizing active inset styles, since that can move a node
        // originally positioned from its right or bottom edge.
        const node_rect = node.getBoundingClientRect()
        min_delta_x = bounds_rect.left - node_rect.left
        max_delta_x = Math.max(min_delta_x, bounds_rect.right - node_rect.right)
        min_delta_y = bounds_rect.top - node_rect.top
        max_delta_y = Math.max(min_delta_y, bounds_rect.bottom - node_rect.bottom)
      }
      start = { x: event.clientX, y: event.clientY }
      previous_user_select = node.ownerDocument.body.style.userSelect
      node.ownerDocument.body.style.userSelect = `none` // Prevent text selection during drag
      drag_handle.style.cursor = `grabbing`

      options.on_drag_start?.(event)
      stop_pointer_follow = follow_pointer(
        drag_handle,
        event.pointerId,
        on_pointermove,
        on_pointerup,
      )
    }

    function on_pointermove(event: PointerEvent) {
      if (!dragging) return
      if (move_x) {
        const delta_x = clamp(event.clientX - start.x, min_delta_x, max_delta_x)
        node.style.left = `${initial.left + delta_x}px`
      }
      if (move_y) {
        const delta_y = clamp(event.clientY - start.y, min_delta_y, max_delta_y)
        node.style.top = `${initial.top + delta_y}px`
      }
      options.on_drag?.(event)
    }

    function on_pointerup(event: PointerEvent) {
      if (!dragging) return
      dragging = false
      event.stopPropagation()
      node.ownerDocument.body.style.userSelect = previous_user_select
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
      if (dragging) node.ownerDocument.body.style.userSelect = previous_user_select
      drag_handle.removeEventListener(`pointerdown`, on_pointerdown)
      drag_handle.style.cursor = previous_styles.cursor
      drag_handle.style.touchAction = previous_styles.touch_action
    }
  }
