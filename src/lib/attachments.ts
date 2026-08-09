import type { Attachment } from 'svelte/attachments'
import { files_from_data_transfer, filter_accepted_files } from './file-drop'
import type { TextMutationOptions, TextSearchNodeFilter } from './text-search'
import { create_burst_debounce, sync_owned_highlight } from './text-search'
import type { Hotkey, Placement, PositionOptions } from './utils'
import {
  clamp,
  compute_position,
  fuzzy_match_indices,
  get_uuid,
  run_hotkeys,
} from './utils'
// Computed CSS lengths resolve to `<number>px`; strip the unit so Number() can coerce.
// Empty and non-px values (e.g. `none`, `0.5rem`) yield NaN so callers can apply fallbacks.
const css_px = (css_length: string): number => {
  const trimmed = css_length.trim()
  return trimmed ? Number(trimmed.replace(/px$/, ``)) : NaN
}

// Color channels are 0..1 fractions.
const clamp_unit = (value: number): number => clamp(value, 0, 1)

// Capture on `target` so a pointer over an iframe keeps reporting; window listeners still
// get the bubbled moves. `lostpointercapture` is target-only — end there too. pointerId
// filters a second finger; pointercancel ends like release.
const is_primary_press = (event: PointerEvent) => event.button === 0 && event.isPrimary
const follow_pointer = (
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

export interface FileDropOptions {
  accept?: string
  multiple?: boolean
  disabled?: boolean
  // Aborted by a newer accepted drop or when the attachment is recreated/destroyed.
  on_files: (files: File[], signal: AbortSignal) => unknown
  on_drag_active?: (active: boolean, event?: DragEvent) => void
  on_error?: (error: unknown) => unknown
}

// Headless file-drop handling. The data attribute gives CSS consumers the same state
// the callback receives, while the depth counter prevents child-to-child drags from
// flickering inactive. Directory expansion and its explicit errors live in file-drop.
export const file_drop =
  (options: FileDropOptions): Attachment<HTMLElement> =>
  (node): (() => void) | undefined => {
    const {
      accept = ``,
      multiple = false,
      disabled = false,
      on_files,
      on_drag_active,
      on_error,
    } = options

    const previous_drag_active = node.getAttribute(`data-drag-active`)
    node.removeAttribute(`data-drag-active`)
    let drag_depth = 0
    let drag_active = false
    let drop_generation = 0
    let callback_controller: AbortController | undefined

    // items is an array-like DataTransferItemList, unlike the plain types array
    const carries_files = (data_transfer: DataTransfer): boolean =>
      data_transfer.types.includes(`Files`) ||
      data_transfer.files.length > 0 ||
      Array.from(data_transfer.items).some((item) => item.kind === `file`)
    const set_drag_active = (active: boolean, event?: DragEvent) => {
      if (active === drag_active) return
      drag_active = active
      node.toggleAttribute(`data-drag-active`, active)
      on_drag_active?.(active, event)
    }
    const reset_drag = (event?: DragEvent) => {
      drag_depth = 0
      set_drag_active(false, event)
    }
    const on_dragenter = (event: DragEvent) => {
      if (!event.dataTransfer || !carries_files(event.dataTransfer)) return
      event.preventDefault()
      if (disabled) return
      drag_depth += 1
      set_drag_active(true, event)
    }
    const on_dragover = (event: DragEvent) => {
      if (!event.dataTransfer || !carries_files(event.dataTransfer)) return
      event.preventDefault()
    }
    const on_dragleave = (event: DragEvent) => {
      if (!drag_active) return
      drag_depth = Math.max(0, drag_depth - 1)
      if (drag_depth === 0) set_drag_active(false, event)
    }
    const on_drop = (event: DragEvent) => {
      const { dataTransfer: data_transfer } = event
      if (!data_transfer || !carries_files(data_transfer)) return
      event.preventDefault()
      reset_drag(event)
      if (disabled) return

      const generation = ++drop_generation
      let delivery_controller: AbortController | undefined
      void files_from_data_transfer(data_transfer)
        .then(async (dropped) => {
          if (generation !== drop_generation) return
          const accepted = filter_accepted_files(dropped, accept, multiple)
          if (accepted.length === 0) return
          callback_controller?.abort()
          if (generation !== drop_generation) return
          delivery_controller = new AbortController()
          callback_controller = delivery_controller
          await on_files(accepted, delivery_controller.signal)
          if (callback_controller === delivery_controller) callback_controller = undefined
        })
        .catch(async (error: unknown) => {
          if (callback_controller === delivery_controller) callback_controller = undefined
          if (delivery_controller?.signal.aborted) return
          if (!delivery_controller && generation !== drop_generation) return
          // A consumer's handler failing must not itself become an unhandled rejection
          try {
            if (on_error) await on_error(error)
            else globalThis.reportError(error)
          } catch (reporting_error) {
            globalThis.reportError(reporting_error)
          }
        })
    }
    const event_controller = new AbortController()
    node.addEventListener(`dragenter`, on_dragenter, { signal: event_controller.signal })
    node.addEventListener(`dragover`, on_dragover, { signal: event_controller.signal })
    node.addEventListener(`dragleave`, on_dragleave, { signal: event_controller.signal })
    node.addEventListener(`drop`, on_drop, { signal: event_controller.signal })
    globalThis.addEventListener(`dragend`, reset_drag, {
      signal: event_controller.signal,
    })

    return () => {
      drop_generation += 1
      callback_controller?.abort()
      callback_controller = undefined
      event_controller.abort()
      reset_drag()
      if (previous_drag_active === null) node.removeAttribute(`data-drag-active`)
      else node.setAttribute(`data-drag-active`, previous_drag_active)
    }
  }

export interface DraggableOptions {
  handle_selector?: string
  disabled?: boolean
  on_drag_start?: (event: PointerEvent) => void
  on_drag?: (event: PointerEvent) => void
  on_drag_end?: (event: PointerEvent) => void
}

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

export const draggable =
  (options: DraggableOptions = {}): Attachment =>
  (element: Element): (() => void) | undefined => {
    if (options.disabled) return undefined

    if (!(element instanceof HTMLElement)) return undefined
    const node = element

    let dragging = false
    let stop_pointer_follow: (() => void) | undefined
    let start = { x: 0, y: 0 }
    const initial = { left: 0, top: 0 }

    const found = options.handle_selector
      ? node.querySelector<HTMLElement>(options.handle_selector)
      : node
    if (!found) {
      console.warn(
        `Draggable: handle not found with selector "${options.handle_selector}"`,
      )
      return undefined
    }
    const drag_handle = found

    function on_pointerdown(event: PointerEvent) {
      // `dragging` bars a second primary pointer mid-drag (mouse while a touch is down),
      // which would strand the first follower's listeners past cleanup.
      if (dragging || !is_primary_press(event)) return
      if (!(event.target instanceof Node) || !drag_handle.contains(event.target)) return

      dragging = true

      // For position: fixed elements, use getBoundingClientRect for viewport-relative position
      const computed_style = getComputedStyle(node)
      if (computed_style.position === `fixed`) {
        const rect = node.getBoundingClientRect()
        initial.left = rect.left
        initial.top = rect.top
      } else {
        initial.left = node.offsetLeft
        initial.top = node.offsetTop
      }

      node.style.left = `${initial.left}px`
      node.style.top = `${initial.top}px`
      node.style.right = `auto` // Prevent conflict with left
      start = { x: event.clientX, y: event.clientY }
      document.body.style.userSelect = `none` // Prevent text selection during drag
      drag_handle.style.cursor = `grabbing`

      stop_pointer_follow = follow_pointer(
        drag_handle,
        event.pointerId,
        on_pointermove,
        on_pointerup,
      )

      options.on_drag_start?.(event)
    }

    function on_pointermove(event: PointerEvent) {
      if (!dragging) return

      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      node.style.left = `${initial.left + dx}px`
      node.style.top = `${initial.top + dy}px`

      options.on_drag?.(event)
    }

    function on_pointerup(event: PointerEvent) {
      if (!dragging) return

      dragging = false
      event.stopPropagation()
      document.body.style.userSelect = ``
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
      if (dragging) document.body.style.userSelect = ``
      drag_handle.removeEventListener(`pointerdown`, on_pointerdown)
      drag_handle.style.cursor = previous_styles.cursor
      drag_handle.style.touchAction = previous_styles.touch_action
    }
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

    const computed = getComputedStyle(node)
    if (computed.position === `static`) node.style.position = `relative`
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
      const content_box_inset = (properties: string[]) =>
        current_style.boxSizing === `border-box`
          ? 0
          : properties.reduce(
              (total, property) =>
                total + (css_px(current_style.getPropertyValue(property)) || 0),
              0,
            )
      return {
        width: node.offsetWidth,
        height: node.offsetHeight,
        left: css_px(current_style.left) || 0,
        top: css_px(current_style.top) || 0,
        width_inset: content_box_inset([
          `padding-left`,
          `padding-right`,
          `border-left-width`,
          `border-right-width`,
        ]),
        height_inset: content_box_inset([
          `padding-top`,
          `padding-bottom`,
          `border-top-width`,
          `border-bottom-width`,
        ]),
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
      const measured = measure()
      const maximum = read_maximum()
      document.body.style.userSelect = `none`
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
      document.body.style.userSelect = ``
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
      const measured = measure()
      const maximum = read_maximum()
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
      if (is_resizing) document.body.style.userSelect = ``
      abort_controller.abort() // removal alone leaves a retained strip ref able to fire on_pointerdown
      for (const handle of handles) handle.remove()
    }
  }

export function get_html_sort_value(element: HTMLElement): string {
  if (element.dataset.sortValue !== undefined) {
    return element.dataset.sortValue
  }
  for (const child of Array.from(element.children)) {
    if (!(child instanceof HTMLElement)) continue
    const child_val = get_html_sort_value(child)
    if (child_val !== ``) return child_val
  }
  return element.textContent ?? ``
}

export interface SortableOptions {
  header_selector?: string
  asc_class?: string
  desc_class?: string
  sorted_style?: Partial<CSSStyleDeclaration>
  disabled?: boolean
}

// Attachment making an HTML table sortable by clicking column headers (click again to flip direction)
export const sortable =
  (options: SortableOptions = {}) =>
  (node: HTMLElement) => {
    const {
      header_selector = `thead th`,
      asc_class = `table-sort-asc`,
      desc_class = `table-sort-desc`,
      sorted_style = { backgroundColor: `rgba(255, 255, 255, 0.1)` },
      disabled = false,
    } = options

    if (disabled) return undefined

    const headers = Array.from(
      node.querySelectorAll<HTMLTableCellElement>(header_selector),
    )
    let sort_col_idx: number
    let sort_dir = 1 // 1 = asc, -1 = desc

    type HeaderState = {
      header: HTMLTableCellElement
      handler: () => void
      original_html: string
      original_style: string
    }
    const header_state: HeaderState[] = []
    const restore_header = ({ header, original_html, original_style }: HeaderState) => {
      // Restore innerHTML (not textContent) to preserve child markup like icons
      header.innerHTML = original_html
      header.classList.remove(asc_class, desc_class)
      if (original_style) header.setAttribute(`style`, original_style)
      else header.removeAttribute(`style`)
    }

    headers.forEach((header, idx) => {
      const original_html = header.innerHTML
      const original_style = header.getAttribute(`style`) ?? ``
      header.style.cursor = `pointer`

      const click_handler = () => {
        // reset all headers to unsorted state
        for (const state of header_state) {
          restore_header(state)
          state.header.style.cursor = `pointer`
        }
        if (idx === sort_col_idx) {
          sort_dir *= -1
        } else {
          sort_col_idx = idx
          sort_dir = 1
        }
        header.classList.add(sort_dir > 0 ? asc_class : desc_class)
        Object.assign(header.style, sorted_style)
        // Render arrow in a separate span so the header's own markup stays intact
        // (restore_header above already removed any previous arrow span)
        const arrow_span = document.createElement(`span`)
        arrow_span.className = `sort-arrow`
        arrow_span.textContent = ` ${sort_dir > 0 ? `↑` : `↓`}`
        header.append(arrow_span)

        const table_body = node.querySelector(`tbody`)
        if (!table_body) return

        // re-sort table (:scope > tr so rows of nested tables aren't re-parented)
        const rows = Array.from(
          table_body.querySelectorAll<HTMLTableRowElement>(`:scope > tr`),
        )
        rows.sort((row_1, row_2) => {
          const cell_1 = row_1.cells[sort_col_idx]
          const cell_2 = row_2.cells[sort_col_idx]
          // Rows can have fewer cells than the sort column (colspan placeholders,
          // ragged rows) — treat missing cells as empty so they sort last
          const val_1 = cell_1 ? get_html_sort_value(cell_1) : ``
          const val_2 = cell_2 ? get_html_sort_value(cell_2) : ``

          const [trimmed_1, trimmed_2] = [val_1.trim(), val_2.trim()]
          if (trimmed_1 === trimmed_2) return 0
          if (trimmed_1 === ``) return 1 // treat empty/whitespace as lower than any value
          if (trimmed_2 === ``) return -1
          const num_1 = Number(trimmed_1)
          const num_2 = Number(trimmed_2)
          if (isNaN(num_1) && isNaN(num_2)) {
            return (
              sort_dir * trimmed_1.localeCompare(trimmed_2, undefined, { numeric: true })
            )
          }
          // sort non-numeric values after numeric ones
          if (isNaN(num_1)) return sort_dir
          if (isNaN(num_2)) return -sort_dir
          return sort_dir * (num_1 - num_2)
        })

        for (const row of rows) table_body.append(row)
      }

      header.addEventListener(`click`, click_handler)
      header_state.push({ header, handler: click_handler, original_html, original_style })
    })

    return () => {
      for (const state of header_state) {
        state.header.removeEventListener(`click`, state.handler)
        restore_header(state)
      }
    }
  }

export type HighlightOptions = {
  query?: string
  disabled?: boolean
  fuzzy?: boolean
  node_filter?: TextSearchNodeFilter
  css_class?: string
  duration_ms?: number
  scroll_to_match?: false | ScrollIntoViewOptions
  on_highlight?: (context: { node: HTMLElement; ranges: Range[] }) => unknown
  // Re-run when the subtree changes, so consumers stop hand-rolling an observer
  // around this. `true` re-runs on the mutation microtask; `false` freezes the
  // highlight at whatever the DOM held on attach. An object coalesces bursts: the
  // re-run lands `debounce_ms` after the last mutation but no later than
  // `max_wait_ms` after the first of the burst, so a stream of appended log lines
  // still refreshes at a steady rate instead of never settling.
  observe_mutations?: boolean | TextMutationOptions
}

const HAS_NON_ASCII = /\P{ASCII}/u

export const highlight_matches = (ops: HighlightOptions) => (node: HTMLElement) => {
  const {
    query = ``,
    disabled = false,
    fuzzy = false,
    node_filter = () => NodeFilter.FILTER_ACCEPT,
    css_class = `highlight-match`,
    duration_ms,
    scroll_to_match = { behavior: `smooth`, block: `center` },
    on_highlight,
    observe_mutations = true,
  } = ops

  const search = query.trim().toLowerCase().replaceAll(/\s+/gu, ` `)
  // if disabled or empty query, this instance owns no highlight
  if (!search || disabled) return undefined
  // both halves of the CSS Custom Highlight API are needed, same as highlight_ranges
  // checks: a registry without the constructor would throw in sync_owned_highlight
  const highlight_registry =
    typeof globalThis.Highlight === `function` ? globalThis.CSS?.highlights : undefined
  const highlight_owner = Symbol(css_class)
  const substring_pattern = new RegExp(
    search.replaceAll(/[.*+?^${}()|[\]\\]/gu, `\\$&`).replaceAll(` `, `\\s+`),
    `gu`,
  )
  let is_attached = true
  let did_scroll = false
  let effect_cleanup: (() => void) | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined

  const find_ranges = (text_node: Node): Range[] => {
    const original_text = text_node.textContent
    if (!original_text) return []
    const text = original_text.toLowerCase()

    // Offsets are computed on the lowercased text but applied to the original
    // node. Lowercasing can grow some Unicode chars (e.g. İ → i̇), while astral
    // characters span two UTF-16 units. Map each lowered unit to the complete
    // original code point so ranges never shift or split a character.
    const node_length = original_text.length
    let original_starts: number[] | null = null
    let original_ends: number[] | null = null
    // skip for ASCII, which is never astral nor length-changing when lowercased
    let needs_offset_map = false
    if (HAS_NON_ASCII.test(original_text)) {
      for (const char of original_text) {
        if (char.length > 1 || char.toLowerCase().length !== char.length) {
          needs_offset_map = true
          break
        }
      }
    }
    if (needs_offset_map) {
      original_starts = []
      original_ends = []
      let original_idx = 0
      for (const character of original_text) {
        const original_end = original_idx + character.length
        const lowered_length = character.toLowerCase().length
        original_starts.push(
          ...Array.from({ length: lowered_length }, () => original_idx),
        )
        original_ends.push(...Array.from({ length: lowered_length }, () => original_end))
        original_idx = original_end
      }
    }
    const make_range = (start: number, end: number): Range[] => {
      const original_start = original_starts
        ? (original_starts[start] ?? node_length)
        : start
      const original_end = original_ends ? (original_ends[end - 1] ?? node_length) : end
      if (original_start >= node_length) return []
      const range = node.ownerDocument.createRange()
      range.setStart(text_node, original_start)
      range.setEnd(text_node, Math.min(original_end, node_length))
      return [range]
    }

    if (fuzzy) {
      // null means not all characters matched, so highlight nothing.
      const matching_indices = fuzzy_match_indices(search, text)
      const unique_ranges = new Map<string, Range>()
      for (const index of matching_indices ?? []) {
        const [range] = make_range(index, index + 1)
        if (range) unique_ranges.set(`${range.startOffset}:${range.endOffset}`, range)
      }
      return [...unique_ranges.values()]
    }
    return [...text.matchAll(substring_pattern)].flatMap((match) =>
      make_range(match.index, match.index + match[0].length),
    )
  }

  const update_highlight = () => {
    if (!is_attached) return
    observer.disconnect()
    try {
      const previous_cleanup = effect_cleanup
      effect_cleanup = undefined
      previous_cleanup?.()
      if (!is_attached) return
      const tree_walker = node.ownerDocument.createTreeWalker(
        node,
        NodeFilter.SHOW_TEXT,
        { acceptNode: node_filter },
      )
      const ranges: Range[] = []
      let text_node = tree_walker.nextNode()
      while (text_node) {
        ranges.push(...find_ranges(text_node))
        text_node = tree_walker.nextNode()
      }
      if (highlight_registry)
        sync_owned_highlight(highlight_registry, css_class, highlight_owner, ranges)
      const first_match = ranges[0]?.startContainer.parentElement
      if (!did_scroll && scroll_to_match && first_match) {
        did_scroll = true
        first_match.scrollIntoView(scroll_to_match)
      }
      const next_effect_cleanup = on_highlight?.({ node, ranges })
      effect_cleanup =
        typeof next_effect_cleanup === `function`
          ? () => next_effect_cleanup()
          : undefined
    } finally {
      if (is_attached && observe_mutations !== false)
        observer.observe(node, { childList: true, subtree: true, characterData: true })
    }
  }

  const debounce = typeof observe_mutations === `object` ? observe_mutations : undefined
  const { trigger, cancel } = create_burst_debounce(update_highlight, debounce)

  const observer = new MutationObserver(debounce ? trigger : update_highlight)
  const cleanup = () => {
    if (!is_attached) return
    is_attached = false
    if (timeout !== undefined) clearTimeout(timeout)
    cancel()
    observer.disconnect()
    const final_effect_cleanup = effect_cleanup
    effect_cleanup = undefined
    try {
      final_effect_cleanup?.()
    } finally {
      if (highlight_registry)
        sync_owned_highlight(highlight_registry, css_class, highlight_owner)
    }
  }
  try {
    update_highlight()
  } catch (error) {
    cleanup()
    throw error
  }
  if (duration_ms !== undefined && Number.isFinite(duration_ms) && duration_ms >= 0) {
    timeout = setTimeout(cleanup, duration_ms)
  }

  return cleanup
}

// Global tooltip state to ensure only one tooltip is shown at a time
let current_tooltip: (HTMLElement & { owner_element: HTMLElement }) | null = null
let show_timeout: ReturnType<typeof setTimeout> | undefined
let hide_timeout: ReturnType<typeof setTimeout> | undefined
// Element that scheduled the pending show_timeout. owner_element is only set once
// the timeout fires, so pending shows need their own ownership tracking to let
// cleanup of one tooltip instance leave another instance's pending show alone.
let show_timeout_owner: HTMLElement | null = null

function clear_tooltip() {
  clearTimeout(show_timeout)
  show_timeout = undefined
  show_timeout_owner = null
  clearTimeout(hide_timeout)
  hide_timeout = undefined
  current_tooltip?.owner_element.removeAttribute(`aria-describedby`)
  current_tooltip?.remove()
  current_tooltip = null
}

// whether the element owns the visible tooltip or a pending show
const owns_tooltip_state = (element: HTMLElement): boolean =>
  current_tooltip?.owner_element === element || show_timeout_owner === element

export interface TooltipOptions {
  content?: string
  placement?: `top` | `bottom` | `left` | `right`
  delay_ms?: number
  hide_delay_ms?: number // helps with rapid hover transitions
  disabled?: boolean | `touch-devices` // true disables always, 'touch-devices' uses runtime detection
  style?: string
  show_arrow?: boolean // Whether to show the arrow pointer (default: true)
  offset?: number // Distance from trigger element in pixels (default: 12)
  // Security: HTML rendering is opt-in. Set to true only for trusted or sanitized content.
  allow_html?: boolean
  // Optional sanitizer for HTML content - called before setting innerHTML when allow_html is true
  sanitize_html?: (html: string) => string
}

function render_tooltip_content(
  content_el: HTMLElement,
  content: string,
  options: TooltipOptions,
) {
  if (options.allow_html !== true) {
    content_el.textContent = content
    return
  }

  // Convert all newline flavors: HTML parsing normalizes CR/CRLF to LF in
  // attributes, and JS callers pass \n, so matching only \r would never fire
  let html = content.replaceAll(/\r\n?|\n/gu, `<br/>`)
  if (options.sanitize_html) html = options.sanitize_html(html)
  content_el.innerHTML = html
}

export const tooltip =
  (options: TooltipOptions = {}): Attachment =>
  (node: Element): (() => void) | undefined => {
    // SSR guard + element validation
    if (typeof document === `undefined` || !(node instanceof HTMLElement))
      return undefined

    const cleanup_functions: (() => void)[] = []

    if (options.disabled === true) return undefined

    // Track current input method for 'touch-devices' option (runtime detection, not capability sniffing)
    // This allows tooltips on hybrid devices (Surface, iPad with mouse) when using mouse/stylus
    let last_pointer_type: string = `mouse`
    const track_pointer = (event: PointerEvent) => {
      last_pointer_type = event.pointerType
    }
    if (options.disabled === `touch-devices`) {
      document.addEventListener(`pointerdown`, track_pointer, true)
      cleanup_functions.push(() =>
        document.removeEventListener(`pointerdown`, track_pointer, true),
      )
    }

    function setup_tooltip(element: HTMLElement): (() => void) | undefined {
      const tooltip_attrs = [`title`, `aria-label`, `data-title`]
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- empty string should fall through
      let content =
        ((options.content ?? element.title) || element.getAttribute(`aria-label`)) ??
        element.getAttribute(`data-title`)
      if (!content) return undefined

      // Store original title and remove it to prevent native browser tooltip.
      // This must happen even when options.content is provided, otherwise both
      // custom and native tooltips may appear.
      if (element.hasAttribute(`title`)) {
        element.setAttribute(`data-original-title`, element.title)
        element.removeAttribute(`title`)
      }

      // Reactively update content when tooltip attributes change
      const observer = new MutationObserver((mutations) => {
        for (const { type, attributeName } of mutations) {
          if (type !== `attributes` || !attributeName) continue
          const new_content = element.getAttribute(attributeName)
          // null = attribute removed (by us), skip entirely
          if (new_content === null) continue
          // Always remove title to prevent browser's native tooltip (even if empty)
          // Disconnect observer temporarily to avoid re-entrancy from our own removal
          if (attributeName === `title`) {
            observer.disconnect()
            element.removeAttribute(`title`)
            observer.observe(element, {
              attributes: true,
              attributeFilter: tooltip_attrs,
            })
            // Preserve original title for cleanup if title is set later dynamically
            if (!element.hasAttribute(`data-original-title`) && new_content) {
              element.setAttribute(`data-original-title`, new_content)
            }
          }
          if (options.content) continue // custom content takes precedence
          if (!new_content) continue
          content = new_content
          if (current_tooltip?.owner_element === element) {
            const content_el =
              current_tooltip.querySelector<HTMLElement>(`.tooltip-content`)
            if (content_el) {
              render_tooltip_content(content_el, content, options)
              resize_and_position_tooltip(current_tooltip, element)
            }
          }
        }
      })
      observer.observe(element, { attributes: true, attributeFilter: tooltip_attrs })

      const opposite: Record<Placement, Placement> = {
        top: `bottom`,
        bottom: `top`,
        left: `right`,
        right: `left`,
      }

      const apply_triangle_style = (
        triangle_el: HTMLElement,
        placement: Placement,
        px: number,
        color: string,
      ) => {
        triangle_el.style.cssText = `position: absolute; width: 0; height: 0; pointer-events: none;`
        const vert = placement === `top` || placement === `bottom`
        const set = (prop: string, css_value: string) =>
          triangle_el.style.setProperty(prop, css_value)
        set(vert ? `left` : `top`, `calc(50% - ${px}px)`)
        set(opposite[placement], `-${px}px`)
        set(`border-${vert ? `left` : `top`}`, `${px}px solid transparent`)
        set(`border-${vert ? `right` : `bottom`}`, `${px}px solid transparent`)
        set(`border-${placement}`, `${px}px solid ${color}`)
      }

      const sync_arrow_styles = (tooltip_el: HTMLElement, placement: Placement) => {
        const arrow = tooltip_el.querySelector<HTMLElement>(`.custom-tooltip-arrow`)
        if (!arrow) return

        const tooltip_styles = getComputedStyle(tooltip_el)
        const default_arrow_color = `var(--tooltip-bg, light-dark(#fff, #2a2a2e))`
        const tooltip_bg = tooltip_styles.backgroundColor.trim()
        const transparent_colors = new Set([``, `transparent`, `rgba(0, 0, 0, 0)`])
        const is_transparent = (color: string) => transparent_colors.has(color.trim())
        const arrow_size_raw = tooltip_styles
          .getPropertyValue(`--tooltip-arrow-size`)
          .trim()
        const arrow_size_num = css_px(arrow_size_raw)
        const arrow_px = Number.isFinite(arrow_size_num) ? arrow_size_num : 6
        apply_triangle_style(
          arrow,
          placement,
          arrow_px,
          is_transparent(tooltip_bg) ? default_arrow_color : tooltip_bg,
        )

        const border_arrow = tooltip_el.querySelector<HTMLElement>(
          `.custom-tooltip-arrow-border`,
        )
        if (!border_arrow) return

        const border_color = tooltip_styles.borderTopColor
        const border_width_num = css_px(tooltip_styles.borderTopWidth)
        const has_border = !is_transparent(border_color) && border_width_num > 0
        if (!has_border) {
          border_arrow.remove()
          return
        }
        apply_triangle_style(
          border_arrow,
          placement,
          arrow_px + border_width_num * 1.4,
          border_color,
        )
      }

      // Shrink tooltip to fit content, then position for correct centering
      function resize_and_position_tooltip(tooltip_el: HTMLElement, trigger: Element) {
        // Reset width to allow natural sizing before measuring
        tooltip_el.style.width = ``

        requestAnimationFrame(() => {
          if (!document.body.contains(tooltip_el)) return
          const computed = getComputedStyle(tooltip_el)
          const padding_h = css_px(computed.paddingLeft) + css_px(computed.paddingRight)
          const border_h =
            css_px(computed.borderLeftWidth) + css_px(computed.borderRightWidth)
          // Handle max-width: none as unbounded, fallback to 280 only for invalid values
          const max_width_raw = computed.maxWidth
          const max_width_parsed = css_px(max_width_raw)
          const max_width =
            max_width_raw === `none`
              ? Infinity
              : Number.isFinite(max_width_parsed)
                ? max_width_parsed
                : 280
          // With border-box, width includes padding+border; with content-box, subtract them
          const box_adjust =
            computed.boxSizing === `border-box` ? 0 : padding_h + border_h
          const style = tooltip_el.style
          // The configured side, never the resolved one: data-placement carries the
          // outcome for styling, and reading it back would make a flip permanent.
          const requested_placement: Placement = options.placement ?? `bottom`

          // Save styles, measure single-line width with wrapping disabled
          const saved = {
            maxWidth: style.maxWidth,
            overflowWrap: style.overflowWrap,
            textWrap: style.textWrap,
            whiteSpace: style.whiteSpace,
          }
          Object.assign(style, {
            maxWidth: `none`,
            overflowWrap: `normal`,
            textWrap: `nowrap`,
            whiteSpace: `nowrap`,
            width: `auto`,
          })
          const single_line_width = tooltip_el.offsetWidth
          Object.assign(style, saved)

          // Convert offsetWidth to the value needed for style.width
          const content_width = single_line_width - box_adjust
          if (content_width <= max_width) {
            // Single-line: set exact width and prevent wrapping
            style.width = `${Math.max(0, content_width)}px`
            style.textWrap = `nowrap`
          } else {
            // Multi-line: binary search for minimum width that doesn't add line breaks
            style.width = ``
            const baseline_height = tooltip_el.offsetHeight
            const initial_width = tooltip_el.offsetWidth

            // Get min-content (longest word) as lower bound
            Object.assign(style, {
              maxWidth: `none`,
              overflowWrap: `normal`,
              width: `min-content`,
            })
            const min_width = tooltip_el.offsetWidth
            Object.assign(style, {
              maxWidth: saved.maxWidth,
              overflowWrap: saved.overflowWrap,
              width: `${initial_width - box_adjust}px`,
            })

            // If longest word exceeds wrapped width, grow past max-width so the
            // word stays intact (restoring maxWidth would clamp width back down).
            if (min_width >= initial_width) {
              style.maxWidth = `none`
              style.width = `${min_width - box_adjust}px`
            } else {
              // Binary search for minimum width that maintains baseline height
              // Work in offsetWidth units, convert to style.width only when setting
              let [best, high, low] = [initial_width, initial_width, min_width]
              while (high - low > 1) {
                const mid = Math.floor((low + high) / 2)
                style.width = `${mid - box_adjust}px`
                if (tooltip_el.offsetHeight > baseline_height) low = mid
                else {
                  best = mid
                  high = mid
                }
              }
              style.width = `${best - box_adjust}px`
            }
          }

          // Position tooltip after width adjustment so centering uses final dimensions
          const { top, left, placement } = compute_position(
            trigger.getBoundingClientRect(),
            tooltip_el.getBoundingClientRect(),
            { placement: requested_placement, offset: options.offset ?? 12, padding: 8 },
          )

          // Persist final placement for downstream styling.
          tooltip_el.setAttribute(`data-placement`, placement)
          sync_arrow_styles(tooltip_el, placement)

          // The tooltip is absolutely positioned on the body, so add page scroll
          style.left = `${left + globalThis.scrollX}px`
          style.top = `${top + globalThis.scrollY}px`
          style.opacity =
            getComputedStyle(trigger).getPropertyValue(`--tooltip-opacity`).trim() || `1`
        })
      }

      function show_tooltip() {
        if (options.disabled === `touch-devices` && last_pointer_type === `touch`) return

        clear_tooltip()

        show_timeout_owner = element
        show_timeout = setTimeout(() => {
          show_timeout = undefined
          show_timeout_owner = null
          const tooltip_el = document.createElement(`div`)
          tooltip_el.className = `custom-tooltip`
          const placement = options.placement ?? `bottom`
          tooltip_el.setAttribute(`data-placement`, placement)

          // Accessibility: link tooltip to trigger element
          const tooltip_id = `tooltip-${get_uuid()}`
          tooltip_el.id = tooltip_id
          tooltip_el.setAttribute(`role`, `tooltip`)
          element.setAttribute(`aria-describedby`, tooltip_id)
          // light-dark() inherits the page's color-scheme (defaults to light if unset)
          tooltip_el.style.cssText = `
          position: absolute; z-index: 9999; opacity: 0; display: inline-block;
          background-color: var(--tooltip-bg, light-dark(#fff, #2a2a2e)); color: var(--text-color, light-dark(#222, #eee)); border: var(--tooltip-border, 1px solid light-dark(lightgray, #555));
          padding: var(--tooltip-padding, 2px 6px); border-radius: var(--tooltip-radius, 5pt); font-size: var(--tooltip-font-size, 0.8rem); line-height: 1.4;
          max-width: var(--tooltip-max-width, 280px); overflow-wrap: break-word; text-wrap: balance; pointer-events: none;
          filter: var(--tooltip-shadow, drop-shadow(0 2px 8px rgba(0,0,0,0.25))); transition: opacity 0.15s ease-out;
        `

          // Applied after base cssText so they win, preserving any !important priority
          if (options.style) {
            const custom_style = document.createElement(`div`).style
            custom_style.cssText = options.style
            for (let idx = 0; idx < custom_style.length; idx++) {
              const property = custom_style.item(idx)
              tooltip_el.style.setProperty(
                property,
                custom_style.getPropertyValue(property),
                custom_style.getPropertyPriority(property),
              )
            }
          }

          // Wrap content in a span for reactive content updates
          const content_span = document.createElement(`span`)
          content_span.className = `tooltip-content`
          // Security: content renders as plain text unless allow_html is explicitly true.
          render_tooltip_content(content_span, content ?? ``, options)
          tooltip_el.append(content_span)

          // Mirror CSS custom properties from the trigger node onto the tooltip element
          const trigger_styles = getComputedStyle(element)
          for (const css_var_name of [
            `--tooltip-bg`,
            `--text-color`,
            `--tooltip-border`,
            `--tooltip-padding`,
            `--tooltip-radius`,
            `--tooltip-font-size`,
            `--tooltip-shadow`,
            `--tooltip-max-width`,
            `--tooltip-opacity`,
            `--tooltip-arrow-size`,
          ]) {
            const value = trigger_styles.getPropertyValue(css_var_name).trim()
            if (value) tooltip_el.style.setProperty(css_var_name, value)
          }

          // Pages that style themselves dark via CSS vars but never declare `color-scheme`
          // resolve the default light-dark() background to LIGHT while the inherited
          // --text-color may be near-white → unreadable tooltip. Follow the OS preference
          // and pair the text color with it. Pages that declare a scheme keep control
          // (see #405), as do triggers with custom --tooltip-bg or own --text-color.
          // Read the scheme from document.body (inherits any root-declared scheme), not
          // the trigger: the tooltip is appended to body, so a scheme on some container
          // around the trigger never reaches it.
          const body_styles = getComputedStyle(document.body)
          const page_scheme = body_styles.colorScheme
          if (!page_scheme || page_scheme === `normal`) {
            // A var counts as a per-trigger override only if it differs from the value
            // inherited from body/:root (page-level styling shouldn't disable the
            // fallback). Compare against body, not documentElement: the body-mounted
            // tooltip inherits from body, which in turn inherits :root-declared vars.
            const overrides_page = (css_var: string) => {
              const value = tooltip_el.style.getPropertyValue(css_var)
              return value && value !== body_styles.getPropertyValue(css_var).trim()
            }
            if (!overrides_page(`--tooltip-bg`) && !overrides_page(`--text-color`)) {
              tooltip_el.style.setProperty(`color-scheme`, `light dark`)
              tooltip_el.style.setProperty(`--text-color`, `light-dark(#222, #eee)`)
            }
          }

          // Append early so we can read computed border styles for arrow border
          document.body.append(tooltip_el)

          // Create arrow elements before resize so the rAF inside
          // resize_and_position_tooltip can find and style them with the resolved placement.
          if (options.show_arrow !== false) {
            const border_arrow = document.createElement(`div`)
            border_arrow.className = `custom-tooltip-arrow-border`
            const arrow = document.createElement(`div`)
            arrow.className = `custom-tooltip-arrow`
            tooltip_el.append(border_arrow, arrow)
          }

          resize_and_position_tooltip(tooltip_el, element)

          current_tooltip = Object.assign(tooltip_el, { owner_element: element })
        }, options.delay_ms ?? 100)
      }

      function handle_keydown(event: KeyboardEvent) {
        if (event.key === `Escape` && current_tooltip?.owner_element === element) {
          clear_tooltip()
        }
      }

      function hide_tooltip() {
        // A stale leave/blur from the previous trigger must not cancel the next
        // trigger's pending show or schedule a timer that removes its tooltip.
        if (!owns_tooltip_state(element)) return
        if (show_timeout_owner === element) {
          clearTimeout(show_timeout)
          show_timeout = undefined
          show_timeout_owner = null
        }
        if (current_tooltip?.owner_element !== element) return
        // leave/blur both call this; clear any pending hide so a later show isn't
        // wiped by a stale timer from the first hide event
        clearTimeout(hide_timeout)
        hide_timeout = undefined
        const hide_delay_ms = options.hide_delay_ms ?? 0
        if (hide_delay_ms > 0) hide_timeout = setTimeout(clear_tooltip, hide_delay_ms)
        else clear_tooltip()
      }

      function handle_scroll(event: Event) {
        // Hide if document or any ancestor scrolls (would move element). Skip internal element scrolls.
        const target = event.target
        if (target instanceof Node && target !== element && target.contains(element)) {
          hide_tooltip()
        }
      }

      const events = [`mouseenter`, `mouseleave`, `focus`, `blur`]
      const handlers = [show_tooltip, hide_tooltip, show_tooltip, hide_tooltip]

      events.forEach((event, idx) => element.addEventListener(event, handlers[idx]))

      globalThis.addEventListener(`scroll`, handle_scroll, true)
      document.addEventListener(`keydown`, handle_keydown)

      // Watch for element removal from DOM to prevent orphaned tooltips
      const removal_observer = new MutationObserver((mutations) => {
        const was_removed = mutations.some((mut) =>
          Array.from(mut.removedNodes).some(
            (removed_node) =>
              removed_node === element ||
              (removed_node instanceof Element && removed_node.contains(element)),
          ),
        )
        // Clear owned visible tooltip AND owned pending show — otherwise the
        // pending timeout fires after removal and appends an orphaned tooltip
        // positioned against a detached element
        if (was_removed && owns_tooltip_state(element)) clear_tooltip()
      })
      if (element.parentElement) {
        removal_observer.observe(element.parentElement, {
          childList: true,
          subtree: true,
        })
      }

      return () => {
        observer.disconnect()
        removal_observer.disconnect()
        events.forEach((event, idx) => element.removeEventListener(event, handlers[idx]))
        globalThis.removeEventListener(`scroll`, handle_scroll, true)
        document.removeEventListener(`keydown`, handle_keydown)

        // Clear owned tooltip/pending show (also removes aria-describedby)
        if (owns_tooltip_state(element)) clear_tooltip()

        if (element.hasAttribute(`data-original-title`)) {
          element.setAttribute(`title`, element.getAttribute(`data-original-title`) ?? ``)
          element.removeAttribute(`data-original-title`)
        }
      }
    }

    const main_cleanup = setup_tooltip(node)
    if (main_cleanup) cleanup_functions.push(main_cleanup)

    node.querySelectorAll(`[title], [aria-label], [data-title]`).forEach((el) => {
      if (!(el instanceof HTMLElement)) return
      const child_cleanup = setup_tooltip(el)
      if (child_cleanup) cleanup_functions.push(child_cleanup)
    })

    if (cleanup_functions.length === 0) return undefined

    // per-element cleanups already clear any tooltip/pending show they own, and
    // only elements set up here can own one — no extra outer clearing needed
    return () => cleanup_functions.forEach((cleanup) => cleanup())
  }

export type DismissDetail = {
  // Whether focus sat inside the node, so an Escape dismissal can hand focus back
  // to the trigger instead of stranding it on a removed element
  focus_inside: boolean
  via: `pointer` | `escape`
  event: Event // the press or keydown behind the dismissal, to forward to consumers
}

export type DismissConfig = {
  enabled?: boolean
  // Regions that count as inside though they sit outside the node: the trigger above
  // all, whose own click toggles the surface right after this runs, and portalled
  // content the node no longer contains. Elements beat selectors where you hold a
  // reference — they cannot collide with another instance's markup.
  inside?: (Element | string | null | undefined)[]
  // Confines the selector entries of `inside` to one subtree, so a second instance
  // of the same component cannot shield this one's surface with its own trigger.
  // Resolved per press when a function, for a `bind:this` still null at setup time.
  scope?: Element | null | (() => Element | null | undefined)
  escape?: boolean // dismiss on Escape as well, reporting where focus was
  // `release` waits for the click, for a surface floating over something draggable (starting a
  // pan or an orbit behind it should not make it vanish under the cursor) and for an outside
  // checkbox bound to the same state, which cannot close the surface otherwise. It gives up
  // dismissing on a right-click and on a press the OS turns into a window drag, neither of
  // which fires a click at all. See dismiss_on_outside_press.
  dismiss_on?: `press` | `release`
}

export type ClickOutsideConfig<T extends HTMLElement> = DismissConfig & {
  callback?: (node: T, config: ClickOutsideConfig<T>, detail: DismissDetail) => void
}

export type DismissOptions = DismissConfig & {
  // The surface, where a single element is one: it counts as inside and receives the
  // `dismiss` event. Leave it out and `inside` becomes the whole membership test,
  // which is what lets one listener cover several surfaces with no shared wrapper —
  // wrapping them would make every press between them count as inside.
  node?: Element | null
  callback?: (detail: DismissDetail) => void
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

// isComposing: Escape cancels an IME composition, it is not a dismissal
const register_escape_layer = key_layer_stack(
  (event) => event.key === `Escape` && !event.isComposing,
)

// A press on a scrollbar reports the scrolling element as its target, which usually
// sits outside the surface. Without this, reaching for the page scrollbar would
// dismiss the very dropdown the user is scrolling toward.
const is_scrollbar_press = (event: Event): boolean => {
  const target = event.target
  if (!(event instanceof MouseEvent) || !(target instanceof Element)) return false
  const root = document.documentElement
  // Page scrollbars: the root's client box excludes them, so viewport coordinates
  // beyond it land in the gutter. Zero sizes mean no layout (jsdom), not a hit.
  if (target === root || target === document.body) {
    return (
      (root.clientWidth > 0 && event.clientX > root.clientWidth) ||
      (root.clientHeight > 0 && event.clientY > root.clientHeight)
    )
  }
  const rect = target.getBoundingClientRect()
  // clientWidth/Height are 0 for non-scrollable boxes (inline elements above all),
  // hence the overflow check — otherwise every press right of such a box looks like
  // a scrollbar hit and silently suppresses dismissal.
  return (
    (target.scrollHeight > target.clientHeight &&
      event.clientX > rect.left + target.clientWidth) ||
    (target.scrollWidth > target.clientWidth &&
      event.clientY > rect.top + target.clientHeight)
  )
}

// Outside-press dismiss. Default `pointerdown` (right-click / OS titlebar drag fire no
// click). Capture + composedPath. Plain function so `node` can be omitted and `inside`
// alone defines the surface.
//
// `dismiss_on: 'release'` waits for the click — pan-behind stays open, and an outside
// `bind:checked` checkbox can close it (dismiss on the press and Svelte's flush writes
// checked=false before the click's pre-click activation flips it back, which the bind commits).
// Neither mode fixes `open = !open` on the control itself; put those in `inside`. `release`
// also closes an outside trigger that opened on the same gesture's `pointerdown`.
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

  if (!enabled) return () => {} // Early return avoids registering unused listener

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

  // document.activeElement reports the outermost shadow host, so descend the focus
  // chain: the host may be inside the node (containment settles it at the first
  // step) or the node may itself live in that shadow tree alongside the focus.
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
  // Cleared on read, on pointercancel and for any press that fires no click of its own (a
  // right-click, a second finger), else the next Enter-click inherits a stale verdict.
  let press_started_inside = false
  const remember_press = (event: PointerEvent) => {
    press_started_inside =
      is_primary_press(event) && is_inside(event.target, event.composedPath())
  }
  const forget_press = () => (press_started_inside = false)

  const handle_press = (event: Event) => {
    // A pointer verdict may only judge a pointer click. `detail` is 0 for keyboard and
    // programmatic clicks, which carry no pointerdown of their own and would otherwise
    // inherit a stale `true` from a press that never produced a click.
    const started_inside =
      press_started_inside && event instanceof MouseEvent && event.detail > 0
    press_started_inside = false
    if (started_inside) return
    const path = event.composedPath()
    if (is_scrollbar_press(event) || is_inside(event.target, path)) return
    // A press never restores focus — the user already picked where it lands
    dismiss({ focus_inside: false, via: `pointer`, event })
  }

  const on_escape = (event: KeyboardEvent) => {
    // Safe to swallow the key: only the innermost layer gets here, so no outer
    // surface is waiting on it. Canceling the default keeps a native <dialog>
    // around the surface open until a second Escape, once this layer is gone.
    event.preventDefault()
    event.stopPropagation()
    dismiss({ focus_inside: focus_is_inside(), via: `escape`, event })
  }

  const wait_for_release = dismiss_on === `release`
  const press_event = wait_for_release ? `click` : `pointerdown`
  document.addEventListener(press_event, handle_press, true)
  if (wait_for_release) {
    document.addEventListener(`pointerdown`, remember_press, true)
    document.addEventListener(`pointercancel`, forget_press, true)
  }
  const unregister_escape = escape ? register_escape_layer(on_escape) : undefined

  return () => {
    document.removeEventListener(press_event, handle_press, true)
    if (wait_for_release) {
      document.removeEventListener(`pointerdown`, remember_press, true)
      document.removeEventListener(`pointercancel`, forget_press, true)
    }
    unregister_escape?.()
  }
}

// The attachment form: the element it is attached to is the surface, so containment
// covers everything under it and `inside` is left for the trigger and portalled parts.
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

// ::backdrop (and dialog padding) both target the dialog — only coordinates tell them
// apart. Start must be outside too, or a selection dragged onto the backdrop dismisses.
export const backdrop_dismiss =
  (callback?: () => void): Attachment<HTMLDialogElement> =>
  (node) => {
    let press_outside = false
    const is_outside_box = ({ target, clientX, clientY }: MouseEvent) => {
      if (target !== node) return false
      const { top, right, bottom, left } = node.getBoundingClientRect()
      return clientX < left || clientX > right || clientY < top || clientY > bottom
    }
    // Same primary/cancel gating as dismiss_on_outside_press: a right-click or second finger
    // must not leave a stale outside verdict for the next click.
    const on_pointerdown = (event: PointerEvent) => {
      press_outside = is_primary_press(event) && is_outside_box(event)
    }
    const forget_press = () => (press_outside = false)
    const on_click = (event: MouseEvent) => {
      if (press_outside && is_outside_box(event)) (callback ?? (() => node.close()))()
      press_outside = false
    }
    node.addEventListener(`pointerdown`, on_pointerdown)
    node.addEventListener(`pointercancel`, forget_press)
    node.addEventListener(`click`, on_click)
    return () => {
      node.removeEventListener(`pointerdown`, on_pointerdown)
      node.removeEventListener(`pointercancel`, forget_press)
      node.removeEventListener(`click`, on_click)
    }
  }

export type AnchorRect = { top: number; left: number; bottom: number; right: number }

export interface FloatOptions extends PositionOptions {
  // A rect instead of an element covers anchors with no markup: the pointer position
  // a context menu opens at, a text selection, a cell in a canvas.
  anchor?: Element | AnchorRect | null
  enabled?: boolean
  // `fixed` needs no scroll bookkeeping but is clipped by an ancestor's transform;
  // `absolute` survives that at the cost of adding page scroll to every update.
  strategy?: `fixed` | `absolute`
  match_width?: boolean // size the floating box to the anchor, for dropdowns
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

    const update = () => {
      // Out of flow before measuring: an in-flow surface is a sibling that pushes the
      // very anchor it is about to measure, which lands it half its height off.
      node.style.position = strategy
      const anchor_rect =
        anchor instanceof Element ? anchor.getBoundingClientRect() : anchor
      if (match_width) node.style.width = `${anchor_rect.right - anchor_rect.left}px`
      const { top, left, placement } = compute_position(
        anchor_rect,
        node.getBoundingClientRect(),
        position_options,
      )
      const add_page_scroll = strategy === `absolute`
      node.style.left = `${left + (add_page_scroll ? globalThis.scrollX : 0)}px`
      node.style.top = `${top + (add_page_scroll ? globalThis.scrollY : 0)}px`
      node.dataset.placement = placement
    }

    update()
    // capture: a scroll in any ancestor moves the anchor, and scroll does not bubble
    globalThis.addEventListener(`scroll`, update, true)
    globalThis.addEventListener(`resize`, update)
    // the floating box can grow after mount (async content, a filtered list)
    const observer = new ResizeObserver(update)
    observer.observe(node)
    if (anchor instanceof Element) observer.observe(anchor)

    return () => {
      globalThis.removeEventListener(`scroll`, update, true)
      globalThis.removeEventListener(`resize`, update)
      observer.disconnect()
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

export interface HotkeyOptions {
  bindings: Hotkey[]
  // Listen on the document rather than the node, for shortcuts that work anywhere.
  // Node-scoped is the default so a shortcut dies with the surface that owns it.
  global?: boolean
  enabled?: boolean
}

// Declarative keybindings. Matching lives in run_hotkeys so components that already
// own a window listener (CommandMenu) share the same semantics without an element.
export const hotkey =
  (options: HotkeyOptions) =>
  (node: Element): (() => void) | undefined => {
    const { bindings, global = false, enabled = true } = options
    if (!enabled || bindings.length === 0) return undefined

    const target: EventTarget = global ? document : node
    const on_keydown = (event: Event) => {
      if (event instanceof KeyboardEvent) run_hotkeys(event, bindings)
    }
    target.addEventListener(`keydown`, on_keydown)
    return () => target.removeEventListener(`keydown`, on_keydown)
  }

export interface FocusTrapOptions {
  enabled?: boolean
  // What to focus on activation: an element, a selector resolved within the root, or
  // `false` to leave focus where it is. Defaults to the first tabbable descendant.
  initial?: Element | string | false
  // Where focus returns on teardown. Defaults to whatever held it on activation;
  // `false` leaves focus alone, for a trigger the surface itself removed.
  restore?: Element | false
  // Further containers the trap covers, for portalled parts of the same surface
  include?: (Element | null | undefined)[]
  // Narrows the trap to a descendant, for a node that wraps the surface together with
  // siblings Tab must not reach — a modal's backdrop button above all. Resolved per
  // keystroke like `click_outside`'s `scope`: a selector picks up markup rendered after
  // setup, a function covers a `bind:this` still null then. Falls back to the node.
  root?: Element | string | null | (() => Element | null | undefined)
  // Escape handler, on the same layer stack `click_outside` uses, so only the innermost
  // trap hears the key. Omit and Escape passes through untouched.
  on_escape?: (event: KeyboardEvent) => void
  // Pull focus back to where it last sat inside whenever something outside takes it.
  // Off by default: a trap that re-runs per state change (ConfirmDialog, once per
  // queued question) has to be able to hand focus over, and recapture would fight it.
  recapture?: boolean
}

// Exported so surfaces can find their own trigger to hand focus back to
export const tabbable_selector = [
  `a[href]`,
  `area[href]`,
  `button`,
  `input`,
  `select`,
  `textarea`,
  `summary`,
  `iframe`,
  `object`,
  `embed`,
  `audio[controls]`,
  `video[controls]`,
  `[contenteditable]:not([contenteditable=false])`,
  `[tabindex]`,
].join(`,`)

// tabbable_selector matches SVG too (an <a href> inside an <svg> is focusable), and only
// these two have focus(), so this is the narrowing every candidate has to pass
const is_focusable = (element: unknown): element is HTMLElement | SVGElement =>
  element instanceof HTMLElement || element instanceof SVGElement

// Visibility read from computed style rather than measured boxes: test DOMs skip
// layout, so getClientRects would report every candidate as hidden and empty the trap.
const is_tabbable = (element: Element): element is HTMLElement | SVGElement => {
  if (!is_focusable(element)) return false
  if (element.closest(`[inert],[hidden],[disabled]`)) return false
  if (Number(element.getAttribute(`tabindex`) ?? 0) < 0) return false
  const style = getComputedStyle(element)
  return style.display !== `none` && style.visibility !== `hidden`
}

// isComposing for the same reason the Escape layer above filters it: Tab cycles IME
// candidates mid-composition, and swallowing it there eats the user's word choice
const register_trap_layer = key_layer_stack(
  (event) => event.key === `Tab` && !event.isComposing,
)

const focus_element = (element: Element | null | undefined) => {
  if (is_focusable(element)) element.focus()
}

// Keep Tab inside a surface and hand focus back when it closes. Pair with
// click_outside: that one decides when a surface goes away, this one decides where
// the keyboard is while it is up and where it lands afterward.
export const focus_trap =
  (options: FocusTrapOptions = {}) =>
  (node: Element): (() => void) | undefined => {
    const {
      enabled = true,
      initial,
      restore,
      include = [],
      root,
      on_escape,
      recapture = false,
    } = options
    if (!enabled || !(node instanceof HTMLElement)) return undefined

    const extra_containers = include.filter((el) => el instanceof Element)
    const resolve_root = (): Element =>
      (typeof root === `function`
        ? root()
        : typeof root === `string`
          ? node.querySelector(root)
          : root) ?? node
    // The node stays the containment boundary while `root` only narrows what Tab cycles.
    // Narrowing both would make a focusable sibling of the root — the backdrop button in
    // a modal, which a click focuses — read as outside: Tab would stop being trapped and
    // teardown would skip the focus restore.
    const containers = (): Element[] => [node, ...extra_containers]
    const tab_scopes = (): Element[] => [resolve_root(), ...extra_containers]
    // Recollected per keystroke: menus grow, filter and disable items while open
    const tabbables = (): (HTMLElement | SVGElement)[] =>
      tab_scopes().flatMap((parent) =>
        [...parent.querySelectorAll(tabbable_selector)].filter(is_tabbable),
      )
    const is_inside = (target: unknown): target is Element =>
      target instanceof Element && containers().some((el) => el.contains(target))
    const holds_focus = () => is_inside(document.activeElement)

    const focus_origin = document.activeElement
    // The root itself is the fallback focus target, so it needs to accept focus.
    // Track where we added tabindex so cleanup can leave the markup as it was. A set
    // because a recapture can resolve a root the last one did not, and all get put back.
    const tabindex_added_to = new Set<Element>()
    let last_inside: Element | null = null
    let trap_active = true

    // `initial: false` keeps focus put by never reaching focus_into at setup, but a
    // recapture has to land somewhere, so there it only means "no entry point named"
    const wanted = initial === false ? undefined : initial

    const focus_into = () => {
      const root_el = resolve_root()
      // Only a recapture focusin ever sets `last_inside`, so this is that path's
      // preference: focus goes back where it sat, not to the trap's entry point.
      const preferred = is_inside(last_inside) ? last_inside : null
      const requested =
        typeof wanted === `string` ? root_el.querySelector(wanted) : wanted
      const target = preferred ?? requested ?? tabbables()[0] ?? root_el
      if (target === root_el && !root_el.hasAttribute(`tabindex`)) {
        root_el.setAttribute(`tabindex`, `-1`)
        tabindex_added_to.add(root_el)
      }
      focus_element(target)
    }

    const on_focusin = (event: FocusEvent) => {
      if (is_inside(event.target)) last_inside = event.target
    }

    // Deferred to a microtask: focus sits on body between one element losing it and
    // the next taking it, so answering at event time would recapture on every step
    // within the trap. Only focus leaving the trap is the trap's business, hence the
    // containment check, and `trap_active` covers the microtask a teardown outruns.
    const on_focusout = (event: FocusEvent) => {
      if (!is_inside(event.target)) return
      queueMicrotask(() => {
        if (trap_active && !holds_focus()) focus_into()
      })
    }

    // Registered before the initial focus so `last_inside` starts out recorded
    if (recapture) {
      document.addEventListener(`focusin`, on_focusin)
      document.addEventListener(`focusout`, on_focusout)
    }

    if (initial !== false) focus_into()

    const on_tab = (event: KeyboardEvent) => {
      // This is a document-wide capture layer, so without this guard a trap that was
      // never given focus still confiscates every Tab on the page and drags focus in.
      // Nav hits that: pinning a submenu leaves focus on the toggle outside it.
      if (!holds_focus()) return
      const items = tabbables()
      event.preventDefault() // even with nothing to focus, Tab must not leave
      if (items.length === 0) return
      const step = event.shiftKey ? -1 : 1
      // findIndex over indexOf so an SVG focusable still matches: tabbable_selector
      // admits them and they are not HTMLElement, which indexOf's typing would demand
      const active = document.activeElement
      const idx = items.findIndex((item) => item === active)
      // Focus on the container itself rather than an item enters at the edge Tab
      // would have reached first
      const edge = event.shiftKey ? items.at(-1) : items[0]
      const next = idx === -1 ? edge : items[(idx + step + items.length) % items.length]
      next?.focus()
    }

    const unregister = register_trap_layer(on_tab)
    // Swallowing the key is the same bargain dismiss_on_outside_press strikes above
    const unregister_escape = on_escape
      ? register_escape_layer((event) => {
          event.preventDefault()
          event.stopPropagation()
          on_escape(event)
        })
      : undefined

    return () => {
      trap_active = false
      unregister()
      unregister_escape?.()
      document.removeEventListener(`focusin`, on_focusin)
      document.removeEventListener(`focusout`, on_focusout)
      for (const element of tabindex_added_to) element.removeAttribute(`tabindex`)
      if (restore === false) return
      // Don't yank focus if the user already placed it elsewhere. A closing surface
      // usually leaves focus on body, which counts as ours to hand back.
      if (!holds_focus() && document.activeElement !== document.body) return
      focus_element(restore ?? focus_origin)
    }
  }

export interface ContrastOptions {
  // Skips the ancestor walk where the background behind the node is already known
  bg_color?: string
  luminance_threshold?: number
  choices?: [string, string] // [on light background, on dark background]
}

// === CSS color parsing ===
// A color authored in a wide-gamut or perceptual space keeps that space in its computed
// value — `getComputedStyle` hands back `oklch(…)`, `lab(…)` or `color(display-p3 …)`
// verbatim rather than an sRGB approximation — so reading only `rgb()`/`rgba()` would
// take a painted ancestor for a transparent one. Everything below converts to sRGB.
// Not covered: named colors and `color-mix()`, neither of which a computed value can
// carry (`color-mix()` resolves to a color in its interpolation space at computed-value
// time). Both are rejected, and callers passing a color by hand get the error.
const RGB_COLOR = /^rgba?\((?<channels>[^)]+)\)$/iu
const HEX_COLOR = /^#(?<digits>[\da-f]+)$/iu
const COLOR_FN = /^(?<name>oklch|oklab|lch|lab|hsla?|hwb|color)\((?<args>[^)]*)\)$/iu

type Triple = [number, number, number]

const dot3 = (matrix: readonly number[], [x_val, y_val, z_val]: Triple): Triple => [
  matrix[0] * x_val + matrix[1] * y_val + matrix[2] * z_val,
  matrix[3] * x_val + matrix[4] * y_val + matrix[5] * z_val,
  matrix[6] * x_val + matrix[7] * y_val + matrix[8] * z_val,
]

// `none` is a real component value meaning "missing", and behaves as zero here
const parse_component = (token: string, percent_ref: number): number => {
  if (token.toLowerCase() === `none`) return 0
  if (token.endsWith(`%`)) return (Number(token.slice(0, -1)) / 100) * percent_ref
  return Number(token)
}
// hsl/hwb take `50` and `50%` to mean the same thing
const parse_percentage = (token: string): number =>
  parse_component(token, 1) / (token.endsWith(`%`) ? 1 : 100)
// alpha is a 0..1 number or a percentage, and absent means opaque
const parse_alpha = (token: string | undefined): number =>
  token === undefined ? 1 : clamp_unit(parse_component(token, 1))
// Junk anywhere in a component reaches here as NaN, so one check at the end rejects
// the whole color rather than every parse site having to guard
const finite_rgba = (
  rgb: Triple,
  alpha: number,
): [number, number, number, number] | null => {
  const parsed: [number, number, number, number] = [...rgb, alpha]
  return parsed.every(Number.isFinite) ? parsed : null
}

const HUE_PER_UNIT: Record<string, number> = {
  deg: 1,
  grad: 0.9,
  rad: 180 / Math.PI,
  turn: 360,
}
// Longest suffix first, so `grad` is never read as the `rad` it ends with. Matching in
// declaration order would work too, but only until someone alphabetizes the object.
const HUE_UNITS = Object.keys(HUE_PER_UNIT).toSorted(
  (one, two) => two.length - one.length,
)
const parse_hue = (token: string): number => {
  const lower = token.toLowerCase()
  const unit = HUE_UNITS.find((suffix) => lower.endsWith(suffix))
  const value = parse_component(unit ? lower.slice(0, -unit.length) : lower, 360)
  return value * (unit ? HUE_PER_UNIT[unit] : 1)
}

// Sign-preserving, so an out-of-gamut channel keeps its order instead of folding
const transfer = (channel: number, encode: (magnitude: number) => number): number =>
  Math.sign(channel) * encode(Math.abs(channel))

const srgb_encode = (channel: number) =>
  transfer(channel, (mag) =>
    mag <= 0.0031308 ? 12.92 * mag : 1.055 * mag ** (1 / 2.4) - 0.055,
  )
const srgb_decode = (channel: number) =>
  transfer(channel, (mag) =>
    mag <= 0.04045 ? mag / 12.92 : ((mag + 0.055) / 1.055) ** 2.4,
  )

const XYZ_D65_TO_LINEAR_SRGB = [
  3.2409699419045226, -1.537383177570094, -0.4986107602930034, -0.9692436362808796,
  1.8759675015077202, 0.04155505740717559, 0.05563007969699366, -0.20397695888897652,
  1.0569715142428786,
]
// Bradford-adapted, for the two spaces defined against the D50 white point
const XYZ_D50_TO_D65 = [
  0.9554734527042182, -0.023098536874261423, 0.0632593086610217, -0.028369706963208136,
  1.0099954580058226, 0.021041398966943008, 0.012314001688319899, -0.020507696433477912,
  1.3303659366080753,
]

const linear_srgb_to_rgb255 = (linear: Triple): Triple =>
  linear.map((channel) => clamp_unit(srgb_encode(channel)) * 255) as Triple

const xyz_d65_to_rgb255 = (xyz: Triple): Triple =>
  linear_srgb_to_rgb255(dot3(XYZ_D65_TO_LINEAR_SRGB, xyz))

// Björn Ottosson's Oklab, https://bottosson.github.io/posts/oklab
const oklab_to_rgb255 = ([lightness, a_axis, b_axis]: Triple): Triple => {
  const long = (lightness + 0.3963377774 * a_axis + 0.2158037573 * b_axis) ** 3
  const medium = (lightness - 0.1055613458 * a_axis - 0.0638541728 * b_axis) ** 3
  const short = (lightness - 0.0894841775 * a_axis - 1.291485548 * b_axis) ** 3
  return linear_srgb_to_rgb255([
    4.0767416621 * long - 3.3077115913 * medium + 0.2309699292 * short,
    -1.2684380046 * long + 2.6097574011 * medium - 0.3413193965 * short,
    -0.0041960863 * long - 0.7034186147 * medium + 1.7076147022 * short,
  ])
}

const KAPPA = 24389 / 27
const EPSILON = 216 / 24389
const D50_WHITE: Triple = [0.3457 / 0.3585, 1, (1 - 0.3457 - 0.3585) / 0.3585]

const lab_to_rgb255 = ([lightness, a_axis, b_axis]: Triple): Triple => {
  const f_y = (lightness + 16) / 116
  const f_x = a_axis / 500 + f_y
  const f_z = f_y - b_axis / 200
  const xyz_d50: Triple = [
    (f_x ** 3 > EPSILON ? f_x ** 3 : (116 * f_x - 16) / KAPPA) * D50_WHITE[0],
    (lightness > KAPPA * EPSILON ? f_y ** 3 : lightness / KAPPA) * D50_WHITE[1],
    (f_z ** 3 > EPSILON ? f_z ** 3 : (116 * f_z - 16) / KAPPA) * D50_WHITE[2],
  ]
  return xyz_d65_to_rgb255(dot3(XYZ_D50_TO_D65, xyz_d50))
}

const hsl_to_rgb255 = (hue: number, saturation: number, lightness: number): Triple => {
  const wrapped = (((hue % 360) + 360) % 360) / 30
  const amplitude = saturation * Math.min(lightness, 1 - lightness)
  const channel = (offset: number) => {
    const key = (offset + wrapped) % 12
    return (lightness - amplitude * Math.max(-1, Math.min(key - 3, 9 - key, 1))) * 255
  }
  return [channel(0), channel(8), channel(4)]
}

const hwb_to_rgb255 = (hue: number, white: number, black: number): Triple => {
  if (white + black >= 1) {
    const gray = (white / (white + black)) * 255
    return [gray, gray, gray]
  }
  const span = 1 - white - black
  return hsl_to_rgb255(hue, 1, 0.5).map(
    (channel) => channel * span + white * 255,
  ) as Triple
}

const LINEAR_SRGB_TO_XYZ_D65 = [
  0.4123907992659595, 0.35758433938387796, 0.1804807884018343, 0.21263900587151036,
  0.7151686787677559, 0.07219231536073371, 0.01933081871559185, 0.11919477979462599,
  0.9505321522496606,
]

const IDENTITY_MATRIX = [1, 0, 0, 0, 1, 0, 0, 0, 1]
const identity = (channel: number) => channel

// The predefined spaces `color()` accepts, each as its decoding transfer function and
// the matrix taking its linear form to XYZ. `d50` marks the ones needing adaptation,
// and the xyz spaces are the degenerate case: their components already are XYZ.
const COLOR_SPACES: Record<
  string,
  { decode: (channel: number) => number; matrix: readonly number[]; d50?: boolean }
> = {
  srgb: { decode: srgb_decode, matrix: LINEAR_SRGB_TO_XYZ_D65 },
  'srgb-linear': { decode: identity, matrix: LINEAR_SRGB_TO_XYZ_D65 },
  xyz: { decode: identity, matrix: IDENTITY_MATRIX },
  'xyz-d65': { decode: identity, matrix: IDENTITY_MATRIX },
  'xyz-d50': { decode: identity, matrix: IDENTITY_MATRIX, d50: true },
  'display-p3': {
    decode: srgb_decode,
    matrix: [
      0.4865709486482162, 0.26566769316909306, 0.1982172852343625, 0.2289745640697488,
      0.6917385218365064, 0.079286914093745, 0, 0.04511338185890264, 1.043944368900976,
    ],
  },
  'a98-rgb': {
    decode: (channel) => transfer(channel, (mag) => mag ** (563 / 256)),
    matrix: [
      0.5766690429101305, 0.1855582379065463, 0.1882286462349947, 0.29734497525053605,
      0.6273635662554661, 0.07529145849399788, 0.02703136138641234, 0.07068885253582723,
      0.9913375368376388,
    ],
  },
  'prophoto-rgb': {
    decode: (channel) =>
      transfer(channel, (mag) => (mag >= 1 / 512 ? mag ** 1.8 : mag / 16)),
    d50: true,
    matrix: [
      0.7977604896723027, 0.13518583717574031, 0.0313493495815248, 0.2880711282292934,
      0.7118432178101014, 0.00008565396060525902, 0, 0, 0.8251046025104601,
    ],
  },
  rec2020: {
    decode: (channel) =>
      transfer(channel, (mag) =>
        mag < 4.5 * 0.018053968510807
          ? mag / 4.5
          : ((mag + 1.09929682680944 - 1) / 1.09929682680944) ** (1 / 0.45),
      ),
    matrix: [
      0.6369580483012914, 0.14461690358620832, 0.1688809751641721, 0.2627002120112671,
      0.6779980715188708, 0.05930171646986196, 0, 0.028072693049087428, 1.060985057710791,
    ],
  },
}
// Component tokens to a rectangular triple, `refs` giving each one's 100% reference
const components = (tokens: string[], refs: Triple): Triple => [
  parse_component(tokens[0], refs[0]),
  parse_component(tokens[1], refs[1]),
  parse_component(tokens[2], refs[2]),
]
// lch and oklch are lab and oklab in polar coordinates, so they convert and reuse the
// rectangular transform rather than carrying one of their own
const polar_components = (tokens: string[], refs: [number, number]): Triple => {
  const chroma = parse_component(tokens[1], refs[1])
  const hue = (parse_hue(tokens[2]) * Math.PI) / 180
  return [
    parse_component(tokens[0], refs[0]),
    chroma * Math.cos(hue),
    chroma * Math.sin(hue),
  ]
}

// Component tokens to sRGB on 0..255; null when they do not fit the function's shape
const function_to_rgb255 = (name: string, tokens: string[]): Triple | null => {
  if (name === `color`) {
    // own properties only: a bare lookup would find Object.prototype keys, so
    // `color(constructor 1 1 1)` came back truthy and then blew up on space.decode
    const space_name = tokens[0]?.toLowerCase() ?? ``
    const space = Object.hasOwn(COLOR_SPACES, space_name)
      ? COLOR_SPACES[space_name]
      : undefined
    if (!space || tokens.length < 4) return null
    const linear = tokens
      .slice(1, 4)
      .map((token) => space.decode(parse_component(token, 1))) as Triple
    const xyz = dot3(space.matrix, linear)
    return xyz_d65_to_rgb255(space.d50 ? dot3(XYZ_D50_TO_D65, xyz) : xyz)
  }
  if (tokens.length !== 3) return null
  if (name === `oklab`) return oklab_to_rgb255(components(tokens, [1, 0.4, 0.4]))
  if (name === `oklch`) return oklab_to_rgb255(polar_components(tokens, [1, 0.4]))
  if (name === `lab`) return lab_to_rgb255(components(tokens, [100, 125, 125]))
  if (name === `lch`) return lab_to_rgb255(polar_components(tokens, [100, 150]))
  // hsl and hwb share a shape: a hue and two percentages
  const to_rgb255 = name === `hwb` ? hwb_to_rgb255 : hsl_to_rgb255
  return to_rgb255(
    parse_hue(tokens[0]),
    clamp_unit(parse_percentage(tokens[1])),
    clamp_unit(parse_percentage(tokens[2])),
  )
}

const parse_color_function = (
  name: string,
  args: string,
): [number, number, number, number] | null => {
  const [main = ``, alpha_arg] = args.split(`/`)
  const tokens = main
    .trim()
    .split(/[\s,]+/u)
    .filter(Boolean)
  // legacy `hsla(h, s, l, a)` carries alpha in the argument list instead of after a slash
  const legacy_alpha =
    alpha_arg === undefined && name !== `color` && tokens.length === 4
      ? tokens.pop()
      : undefined
  const rgb = function_to_rgb255(name, tokens)
  if (!rgb) return null
  return finite_rgba(rgb, parse_alpha(alpha_arg?.trim() ?? legacy_alpha))
}

const parse_color = (color: string): [number, number, number, number] | null => {
  const trimmed = color.trim()
  const channels = RGB_COLOR.exec(trimmed)?.groups?.channels
  if (channels) {
    // percentages are legal here too, in the channels (`rgb(50% 0% 0%)`) as much as in
    // the alpha (`rgb(0 0 0 / 50%)`), even though a computed value never uses them
    const parts = channels.split(/[\s,/]+/u).filter(Boolean)
    if (parts.length < 3) return null
    const rgb = parts.slice(0, 3).map((token) => parse_component(token, 255)) as Triple
    return finite_rgba(rgb, parse_alpha(parts[3]))
  }
  const color_fn = COLOR_FN.exec(trimmed)?.groups
  if (color_fn) {
    return parse_color_function(color_fn.name.toLowerCase(), color_fn.args)
  }
  const digits = HEX_COLOR.exec(trimmed)?.groups?.digits
  if (!digits) return null
  const stride = digits.length < 6 ? 1 : 2 // #rgb(a) spells each channel once
  if (digits.length !== stride * 3 && digits.length !== stride * 4) return null
  const channel = (idx: number) => {
    const slice = digits.slice(idx * stride, idx * stride + stride)
    return Number.parseInt(stride === 1 ? slice + slice : slice, 16)
  }
  return [
    channel(0),
    channel(1),
    channel(2),
    digits.length === stride * 4 ? channel(3) / 255 : 1,
  ]
}

// Human-perceived brightness on 0..1, from https://stackoverflow.com/a/596243
const luminance = (color: string): number => {
  const parsed = parse_color(color)
  if (!parsed) {
    throw new Error(
      `pick_contrast_color: cannot read color \`${color}\`, expected hex, rgb()/rgba(), ` +
        `hsl()/hwb(), lab()/lch()/oklab()/oklch() or color(); named colors and ` +
        `color-mix() are not parsed`,
    )
  }
  const [red, green, blue] = parsed
  return (0.299 * red + 0.587 * green + 0.114 * blue) / 255
}

// Nearest ancestor background that is not fully transparent, or `` when every one of
// them is — a node's own background is usually transparent, so the color that decides
// readability belongs to some container further up.
export const get_bg_color = (element: Element | null): string => {
  for (let node = element; node; node = node.parentElement) {
    const bg_color = getComputedStyle(node).backgroundColor
    if ((parse_color(bg_color)?.[3] ?? 0) > 0) return bg_color
  }
  return ``
}

export const pick_contrast_color = (options: ContrastOptions = {}): string => {
  const { bg_color, luminance_threshold = 0.7, choices = [`black`, `white`] } = options
  // Nothing opaque behind the node: it shows through to the white a page starts as
  const background = bg_color?.trim() ? bg_color : `#fff`
  return luminance(background) > luminance_threshold ? choices[0] : choices[1]
}

// Set text color once at attachment setup to whichever of `choices` reads better on the
// background behind the node. For dynamic fills, re-run with an explicit bg_color.
export const contrast_color =
  (options: ContrastOptions = {}) =>
  (node: Element): (() => void) | undefined => {
    if (!(node instanceof HTMLElement)) return undefined
    const previous_color = node.style.color
    const bg_color = options.bg_color ?? get_bg_color(node)
    node.style.color = pick_contrast_color({ ...options, bg_color })
    return () => {
      node.style.color = previous_color
    }
  }

export interface ForwardWindowKeydownOptions {
  // Report `true` for a key you took, and the browser default (page scroll, quick
  // find) is suppressed here instead of at every call site.
  handle: (event: KeyboardEvent) => boolean
  enabled?: boolean
}

// Hand a component the page's keydowns while the pointer is over it and focus is on the
// page or the component root. Several viewers can then share one set of shortcuts without
// all answering at once, and none takes a key from a focused descendant control.
// Complements `hotkey`, which binds to an element or the document and arbitrates by focus.
export const forward_window_keydown =
  (options: ForwardWindowKeydownOptions) =>
  (node: Element): (() => void) | undefined => {
    const { handle, enabled = true } = options
    if (!enabled) return undefined

    let is_hovered = false
    const on_enter = () => (is_hovered = true)
    const on_leave = () => (is_hovered = false)
    const on_keydown = (event: Event) => {
      if (!is_hovered || !(event instanceof KeyboardEvent)) return
      // The root itself may be focusable so keyboard users can aim shortcuts at it.
      // Any other focused element, including one retargeted through a shadow root, keeps
      // its own keys. composedPath()[0] exposes that original shadow-DOM target.
      const event_target = event.composedPath()[0]
      if (event_target instanceof Element && event_target !== node) return
      const { activeElement, body } = node.ownerDocument
      if (activeElement && activeElement !== body && activeElement !== node) return
      if (handle(event)) event.preventDefault()
    }

    node.addEventListener(`pointerenter`, on_enter)
    node.addEventListener(`pointerleave`, on_leave)
    globalThis.addEventListener(`keydown`, on_keydown)

    return () => {
      node.removeEventListener(`pointerenter`, on_enter)
      node.removeEventListener(`pointerleave`, on_leave)
      globalThis.removeEventListener(`keydown`, on_keydown)
    }
  }
