import type { Attachment } from 'svelte/attachments'
import { clamp } from '../utils'
import { css_px, follow_pointer, is_primary_press } from './shared'

export type Dimensions = { width: number; height: number }
export type ResizeEvent = MouseEvent | KeyboardEvent
export type ResizeCallback = (event: ResizeEvent, dimensions: Dimensions) => void
export type ResizeLimit = number | ((node: HTMLElement) => number)

export interface ResizableOptions {
  edges?: (`top` | `right` | `bottom` | `left`)[]
  min_width?: number
  min_height?: number
  // A function is resolved at gesture time, for bounds that move with the node or viewport.
  max_width?: ResizeLimit
  max_height?: ResizeLimit
  handle_size?: number // px, default 8
  disabled?: boolean
  on_resize_start?: ResizeCallback
  on_resize?: ResizeCallback
  on_resize_end?: ResizeCallback
  on_resize_reset?: ResizeCallback
}

// One `[data-resize-edge]` child per edge, plus a `[data-resize-corner]` child wherever two
// enabled edges meet (touch-action has no per-region form). Every handle is focusable,
// takes arrow keys, and resets on Enter. Promotes `position: static` → `relative`. Put
// overflow on a child — a scrollable node scrolls the handles out of view.
export const resizable =
  (options: ResizableOptions = {}): Attachment =>
  (element: Element): (() => void) | undefined => {
    if (options.disabled) return undefined

    if (!(element instanceof HTMLElement)) return undefined
    const node = element
    const {
      edges = [`right`, `bottom`],
      min_width = 50,
      min_height = 50,
      max_width = Infinity,
      max_height = Infinity,
      handle_size = 8,
      on_resize_start,
      on_resize,
      on_resize_end,
      on_resize_reset,
    } = options

    const invalid_width = typeof max_width === `number` && min_width > max_width
    const invalid_height = typeof max_height === `number` && min_height > max_height
    if (invalid_width || invalid_height) {
      console.warn(
        `resizable: min dimensions exceed max dimensions (min_width=${min_width}, max_width=${max_width}, min_height=${min_height}, max_height=${max_height})`,
      )
      return undefined // Invalid config would cause clamp() to produce inconsistent results
    }

    type Edge = `top` | `right` | `bottom` | `left`
    // A corner press drives both axes at once, so the live grab is a pair of edges rather
    // than a single one. Edge strips fill in only their own axis.
    type Grab = { horizontal?: `left` | `right`; vertical?: `top` | `bottom` }
    let is_resizing = false
    let stop_pointer_follow: (() => void) | undefined
    let previous_user_select = ``

    const computed = getComputedStyle(node)
    const previous_position =
      computed.position === `static` ? node.style.position : undefined
    if (previous_position !== undefined) node.style.position = `relative`
    // Absolute children anchor to the padding box, so a strip at `edge: 0` sits inside the
    // border and leaves the visible edge ungrabbable. Negative insets put it back on the
    // border box, the region the pointer used to be hit-tested against.
    const inset = (edge: Edge) =>
      -(css_px(computed.getPropertyValue(`border-${edge}-width`)) || 0)

    const has_edge = (...sides: Edge[]) => sides.some((side) => edges.includes(side))
    // whether a left/top shrink moved the node, so dblclick knows those are ours to clear
    const repositioned = { left: false, top: false }

    const measure = () => {
      const current_style = getComputedStyle(node)
      const style_px = (property: string) =>
        css_px(current_style.getPropertyValue(property)) || 0
      // What offsetWidth/Height carry beyond the CSS width/height on a content-box node.
      const content_box_inset = (start: Edge, end: Edge) =>
        current_style.boxSizing === `border-box`
          ? 0
          : style_px(`padding-${start}`) +
            style_px(`padding-${end}`) +
            style_px(`border-${start}-width`) +
            style_px(`border-${end}-width`)
      return {
        width: node.offsetWidth,
        height: node.offsetHeight,
        left: css_px(current_style.left) || 0,
        top: css_px(current_style.top) || 0,
        width_inset: content_box_inset(`left`, `right`),
        height_inset: content_box_inset(`top`, `bottom`),
      }
    }
    const read_maximum = (): Dimensions => {
      const resolve = (limit: ResizeLimit) =>
        Math.max(0, typeof limit === `function` ? limit(node) : limit)
      return { width: resolve(max_width), height: resolve(max_height) }
    }
    // Only this instance's own strips — `querySelectorAll` would also rewrite the values of
    // a nested resizable's separators, which report a different element's size.
    const separators: { handle: HTMLElement; controls_width: boolean }[] = []
    const sync_separator_values = (
      current: Dimensions = { width: node.offsetWidth, height: node.offsetHeight },
      maximum: Dimensions = read_maximum(),
    ) => {
      for (const { handle, controls_width } of separators) {
        const minimum = controls_width ? min_width : min_height
        const limit = controls_width ? maximum.width : maximum.height
        handle.setAttribute(`aria-valuemin`, `${Math.min(minimum, limit)}`)
        handle.setAttribute(
          `aria-valuemax`,
          `${Number.isFinite(limit) ? limit : Number.MAX_SAFE_INTEGER}`,
        )
        handle.setAttribute(
          `aria-valuenow`,
          `${controls_width ? current.width : current.height}`,
        )
      }
    }
    const apply_resize = (
      event: ResizeEvent,
      grab: Grab,
      measured: ReturnType<typeof measure>,
      maximum: Dimensions,
      delta_x: number,
      delta_y: number,
      lock_aspect_ratio = false,
    ): Dimensions => {
      // grow from the far edge; a left/top shrink moves the node so the opposite corner stays
      let width =
        measured.width +
        (grab.horizontal === `right` ? delta_x : grab.horizontal ? -delta_x : 0)
      let height =
        measured.height +
        (grab.vertical === `bottom` ? delta_y : grab.vertical ? -delta_y : 0)
      // Content-box padding and borders cannot shrink, so they set the real floor.
      const minimum_width = Math.min(
        Math.max(min_width, measured.width_inset),
        maximum.width,
      )
      const minimum_height = Math.min(
        Math.max(min_height, measured.height_inset),
        maximum.height,
      )

      if (
        lock_aspect_ratio &&
        grab.horizontal &&
        grab.vertical &&
        measured.width > 0 &&
        measured.height > 0
      ) {
        // Both axes are clamped in width space — scaling the height bounds by the ratio makes
        // the two directions the same computation — and the axis that moved further drives.
        const aspect_ratio = measured.width / measured.height
        const width_change = Math.abs(width - measured.width) / measured.width
        const height_change = Math.abs(height - measured.height) / measured.height
        const upper = Math.min(maximum.width, maximum.height * aspect_ratio)
        const lower = Math.min(
          Math.max(minimum_width, minimum_height * aspect_ratio),
          upper,
        )
        const driven = width_change >= height_change ? width : height * aspect_ratio
        width = clamp(driven, lower, upper)
        height = width / aspect_ratio
      } else {
        if (grab.horizontal) width = clamp(width, minimum_width, maximum.width)
        if (grab.vertical) height = clamp(height, minimum_height, maximum.height)
      }

      if (grab.horizontal === `left`) {
        node.style.left = `${measured.left - (width - measured.width)}px`
        repositioned.left = true
      }
      if (grab.vertical === `top`) {
        node.style.top = `${measured.top - (height - measured.height)}px`
        repositioned.top = true
      }
      // Callbacks and constraints use border-box dimensions; CSS width/height do not
      // include padding and borders on content-box elements. Only the grabbed axis is
      // written: pinning the other one would freeze a height-only node's natural width.
      if (grab.horizontal)
        node.style.width = `${Math.max(0, width - measured.width_inset)}px`
      if (grab.vertical)
        node.style.height = `${Math.max(0, height - measured.height_inset)}px`
      const dimensions = { width, height }
      sync_separator_values(dimensions, maximum)
      on_resize?.(event, dimensions)
      return dimensions
    }

    function on_pointerdown(event: PointerEvent, grab: Grab) {
      // Bars a second primary mid-resize (mouse while a touch is down).
      if (is_resizing || !is_primary_press(event)) return
      is_resizing = true

      const origin = { x: event.clientX, y: event.clientY }
      const [measured, maximum] = [measure(), read_maximum()]
      previous_user_select = node.ownerDocument.body.style.userSelect
      node.ownerDocument.body.style.userSelect = `none`
      on_resize_start?.(event, { width: measured.width, height: measured.height })
      stop_pointer_follow = follow_pointer(
        node,
        event.pointerId,
        (move_event) => {
          if (!is_resizing) return
          apply_resize(
            move_event,
            grab,
            measured,
            maximum,
            move_event.clientX - origin.x,
            move_event.clientY - origin.y,
            move_event.shiftKey,
          )
        },
        on_pointerup,
      )
    }

    function on_pointerup(event: PointerEvent) {
      if (!is_resizing) return
      node.ownerDocument.body.style.userSelect = previous_user_select
      on_resize_end?.(event, { width: node.offsetWidth, height: node.offsetHeight })
      stop_pointer_follow?.()
      is_resizing = false
    }

    // Only clear styles we wrote — leave consumer height and `draggable`'s left/top alone
    const reset_size = (event: ResizeEvent) => {
      if (event instanceof KeyboardEvent) event.preventDefault()
      if (has_edge(`left`, `right`)) node.style.width = ``
      if (has_edge(`top`, `bottom`)) node.style.height = ``
      for (const pos of [`left`, `top`] as const) {
        if (!repositioned[pos]) continue
        node.style[pos] = ``
        repositioned[pos] = false
      }
      const dimensions = { width: node.offsetWidth, height: node.offsetHeight }
      sync_separator_values(dimensions)
      on_resize_reset?.(event, dimensions)
    }

    const abort_controller = new AbortController()
    const { signal } = abort_controller
    const arrow_steps: Record<string, { x: number; y: number } | undefined> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }
    const on_keydown = (event: KeyboardEvent, grab: Grab) => {
      if (event.key === `Enter`) return reset_size(event)
      const direction = arrow_steps[event.key]
      // an edge strip ignores the axis it cannot move; a corner takes both
      if (!direction) return
      if ((direction.x && !grab.horizontal) || (direction.y && !grab.vertical)) return
      event.preventDefault()
      const step = event.shiftKey ? 50 : 10
      const [measured, maximum] = [measure(), read_maximum()]
      on_resize_start?.(event, { width: measured.width, height: measured.height })
      const dimensions = apply_resize(
        event,
        grab,
        measured,
        maximum,
        direction.x * step,
        direction.y * step,
      )
      on_resize_end?.(event, dimensions)
    }
    // An edge grab names one side and drives one axis; a corner names both and drives both.
    const add_handle = (grab: Grab, css: string) => {
      const handle = document.createElement(`div`)
      const edge =
        grab.horizontal && grab.vertical ? null : (grab.horizontal ?? grab.vertical)
      if (edge) {
        const arrow_keys = grab.horizontal
          ? [`ArrowLeft`, `ArrowRight`]
          : [`ArrowUp`, `ArrowDown`]
        handle.tabIndex = 0
        handle.setAttribute(
          `aria-keyshortcuts`,
          [...arrow_keys, ...arrow_keys.map((key) => `Shift+${key}`), `Enter`].join(` `),
        )
        handle.dataset.resizeEdge = edge
        handle.setAttribute(`role`, `separator`)
        handle.setAttribute(`aria-label`, `Resize from ${edge} edge`)
        handle.setAttribute(
          `aria-orientation`,
          grab.horizontal ? `vertical` : `horizontal`,
        )
        separators.push({ handle, controls_width: Boolean(grab.horizontal) })
        handle.addEventListener(`keydown`, (event) => on_keydown(event, grab), { signal })
      } else {
        handle.dataset.resizeCorner = `${grab.vertical}-${grab.horizontal}`
        handle.setAttribute(`aria-hidden`, `true`)
      }
      handle.style.cssText = `position: absolute; touch-action: none; ${css}`
      handle.addEventListener(`pointerdown`, (event) => on_pointerdown(event, grab), {
        signal,
      })
      handle.addEventListener(`dblclick`, reset_size, { signal })
      node.append(handle)
      return handle
    }

    const vertical_edges = ([`top`, `bottom`] as const).filter((edge) => has_edge(edge))
    const horizontal_edges = ([`left`, `right`] as const).filter((edge) => has_edge(edge))
    const handles = [
      ...([`top`, `left`, `bottom`, `right`] as const)
        .filter((edge) => has_edge(edge))
        .map((edge) => {
          const across = edge === `left` || edge === `right`
          const cross = across
            ? ([`top`, `bottom`] as const)
            : ([`left`, `right`] as const)
          return add_handle(
            across ? { horizontal: edge } : { vertical: edge },
            `cursor: ${across ? `ew` : `ns`}-resize;
            ${across ? `width` : `height`}: ${handle_size}px;
            ${[edge, ...cross].map((side) => `${side}: ${inset(side)}px`).join(`; `)}`,
          )
        }),
      // Where two enabled edges meet, a square handle drives both axes. Appended after the
      // strips so it paints over their overlap, which otherwise resizes one axis only.
      ...vertical_edges.flatMap((vertical) =>
        horizontal_edges.map((horizontal) =>
          add_handle(
            { horizontal, vertical },
            // top-left/bottom-right share a diagonal, as do top-right/bottom-left
            `cursor: ${(vertical === `top`) === (horizontal === `left`) ? `nwse` : `nesw`}-resize;
            width: ${handle_size}px; height: ${handle_size}px;
            ${vertical}: ${inset(vertical)}px; ${horizontal}: ${inset(horizontal)}px`,
          ),
        ),
      ),
    ]

    sync_separator_values()

    return () => {
      stop_pointer_follow?.()
      if (is_resizing) node.ownerDocument.body.style.userSelect = previous_user_select
      abort_controller.abort() // removal alone leaves a retained strip ref able to fire on_pointerdown
      for (const handle of handles) handle.remove()
      if (previous_position !== undefined) node.style.position = previous_position
    }
  }
