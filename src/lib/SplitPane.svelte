<script lang="ts">
  import { clamp, is_modifier_chord } from './utils'

  type Orientation = `horizontal` | `vertical`

  let {
    orientation = `horizontal`,
    min_ratio = 0.15,
    max_ratio = 0.85,
    collapsed = $bindable(false),
    collapsible = false,
    onresize,
    ratio = $bindable(0.5),
    first_px = $bindable(undefined),
    min_px,
    max_px,
    second_min_px,
    'aria-label': aria_label = `Resize panes`,
  }: {
    orientation?: Orientation
    min_ratio?: number
    max_ratio?: number
    collapsed?: boolean
    collapsible?: boolean
    onresize?: (size: {
      ratio: number
      first_px: number | undefined
      collapsed: boolean
    }) => void
    // Ratio mode (default): the first pane's share of the container, clamped to [15%, 85%]
    ratio?: number
    // Pixel mode: when set, the first pane is sized in px (--split-pane-size becomes `${px}px`)
    // and the ratio clamps don't apply, so a sidebar keeps its width however wide the container
    // gets. The pixel clamps below re-apply against the measured container on every resize
    first_px?: number
    'aria-label'?: string
    // Pixel clamps so a narrow container can't squeeze a pane below a usable size: min_px/max_px
    // bound the first pane, second_min_px reserves room for the second. In ratio mode they
    // tighten the [15%, 85%] clamps. They need the container's measured size, so they're skipped
    // until layout (ratio mode) or only min_px/max_px apply (pixel mode)
    min_px?: number
    max_px?: number
    second_min_px?: number
  } = $props()

  let divider = $state<HTMLDivElement>()
  let active_pointer = $state<number>()
  let drag_from_right = false

  // Container extent along the drag axis, re-measured whenever the container resizes so the
  // pixel clamps (and a pixel-sized first pane) follow it
  let container_size = $state(0)
  const measure_container = (
    bounds = divider?.parentElement?.getBoundingClientRect(),
  ) => {
    container_size = (orientation === `horizontal` ? bounds?.width : bounds?.height) ?? 0
  }
  $effect(() => {
    const parent = divider?.parentElement
    if (!parent) return
    measure_container()
    const observer = new ResizeObserver(() => measure_container())
    observer.observe(parent)
    return () => observer.disconnect()
  })

  const ratio_bounds = (size: number): [number, number] => {
    let lo = min_ratio
    let hi = max_ratio
    if (size > 0) {
      // a floor wider than the container itself means the first pane takes all of it
      if (min_px !== undefined) lo = clamp(min_px / size, lo, 1)
      if (max_px !== undefined) hi = Math.min(hi, max_px / size)
      if (second_min_px !== undefined) hi = Math.min(hi, 1 - second_min_px / size)
      // A container too small for both pixel floors splits at the first pane's floor
      hi = Math.max(lo, hi)
    }
    return [lo, hi]
  }
  const clamp_ratio = (value: number): number => {
    const [lo, hi] = ratio_bounds(container_size)
    return clamp(Number.isFinite(value) ? value : 0.5, lo, hi)
  }
  // Pixel mode has no ratio clamps; as above, an over-constrained container settles at the
  // first pane's floor
  const px_bounds = (size: number): [number, number] => {
    const lo = Math.max(0, min_px ?? 0)
    let hi = max_px ?? Number.POSITIVE_INFINITY
    if (size > 0) hi = Math.min(hi, size - (second_min_px ?? 0))
    return [lo, Math.max(lo, hi)]
  }
  const clamp_px = (value: number): number => {
    const [lo, hi] = px_bounds(container_size)
    return clamp(Number.isFinite(value) ? value : lo, lo, hi)
  }

  let px_mode = $derived(first_px !== undefined)
  let safe_ratio = $derived(clamp_ratio(ratio))
  let safe_px = $derived(clamp_px(first_px ?? 0))
  let pane_size = $derived(
    collapsed ? `0px` : px_mode ? `${safe_px}px` : `${safe_ratio * 100}%`,
  )
  // aria values are in the mode's own unit: percent of the container, or px. Both follow the
  // effective clamps, so pixel floors tightening the ratio range show in the announced bounds
  let aria_bounds = $derived(
    px_mode
      ? px_bounds(container_size)
      : ratio_bounds(container_size).map((bound) => bound * 100),
  )
  let aria_value = $derived(Math.round(px_mode ? safe_px : safe_ratio * 100))

  const update_parent = (value: string): void => {
    divider?.parentElement?.style.setProperty(`--split-pane-size`, value)
  }
  const is_right_to_left = (): boolean => {
    const parent = divider?.parentElement
    return parent ? getComputedStyle(parent).direction === `rtl` : false
  }

  // Pointer/keyboard updates write the style directly: effects only flush after the handler
  // returns, and the pane should follow the pointer within the same event
  const apply_ratio = (value: number): void => {
    collapsed = false
    ratio = clamp_ratio(value)
    update_parent(`${ratio * 100}%`)
    notify_resize()
  }
  const apply_px = (value: number): void => {
    collapsed = false
    first_px = clamp_px(value)
    update_parent(`${first_px}px`)
    notify_resize()
  }

  const notify_resize = () => onresize?.({ ratio, first_px, collapsed })
  $effect(() => update_parent(pane_size))

  const resize_from_pointer = (event: PointerEvent): void => {
    if (active_pointer !== event.pointerId || !divider?.parentElement) return
    const bounds = divider.parentElement.getBoundingClientRect()
    measure_container(bounds)
    if (container_size <= 0) return
    const position =
      orientation === `horizontal`
        ? drag_from_right
          ? bounds.right - event.clientX
          : event.clientX - bounds.left
        : event.clientY - bounds.top
    if (px_mode) apply_px(position)
    else apply_ratio(position / container_size)
  }

  const start_resize = (event: PointerEvent): void => {
    if (active_pointer !== undefined || event.button !== 0) return
    event.preventDefault()
    active_pointer = event.pointerId
    drag_from_right = is_right_to_left()
    ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
  }

  const stop_resize = (event: PointerEvent): void => {
    if (active_pointer !== event.pointerId) return
    active_pointer = undefined
  }

  const resize_from_keyboard = (event: KeyboardEvent): void => {
    if (is_modifier_chord(event)) return
    if (collapsible && event.key === `Enter`) {
      event.preventDefault()
      collapsed = !collapsed
      update_parent(collapsed ? `0px` : px_mode ? `${safe_px}px` : `${safe_ratio * 100}%`)
      notify_resize()
      return
    }
    if (event.key === `Home` || event.key === `End`) {
      event.preventDefault()
      const idx = event.key === `Home` ? 0 : 1
      if (px_mode) apply_px(px_bounds(container_size)[idx])
      else apply_ratio(ratio_bounds(container_size)[idx])
      return
    }
    const horizontal_keys = is_right_to_left()
      ? [`ArrowRight`, `ArrowLeft`]
      : [`ArrowLeft`, `ArrowRight`]
    const [decrease_key, increase_key] =
      orientation === `horizontal` ? horizontal_keys : [`ArrowUp`, `ArrowDown`]
    if (event.key !== decrease_key && event.key !== increase_key) return
    if (is_modifier_chord(event)) return // Cmd/Ctrl+Arrow scrolls the page
    event.preventDefault()
    const direction = event.key === decrease_key ? -1 : 1
    if (px_mode) {
      // 5% of the container per keypress, or a fixed stride before layout
      apply_px(safe_px + direction * (container_size > 0 ? container_size * 0.05 : 16))
    } else apply_ratio(safe_ratio + direction * 0.05)
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div
  bind:this={divider}
  class={[`pane-divider`, orientation, active_pointer != null && `dragging`]}
  role="separator"
  aria-label={aria_label}
  aria-orientation={orientation === `horizontal` ? `vertical` : `horizontal`}
  aria-valuemin={collapsed ? 0 : Math.round(aria_bounds[0])}
  aria-valuemax={Number.isFinite(aria_bounds[1]) ? Math.round(aria_bounds[1]) : undefined}
  aria-valuenow={collapsed ? 0 : aria_value}
  aria-valuetext={collapsed
    ? `Collapsed`
    : px_mode
      ? `${aria_value} pixels`
      : `${aria_value}%`}
  tabindex="0"
  title="Drag to resize panes"
  onkeydown={resize_from_keyboard}
  onpointerdown={start_resize}
  onpointermove={resize_from_pointer}
  onpointerup={stop_resize}
  onpointercancel={stop_resize}
  onlostpointercapture={stop_resize}
></div>

<style>
  .pane-divider {
    position: absolute;
    z-index: 4;
    touch-action: none;
    &::before {
      position: absolute;
      background: color-mix(in srgb, currentColor 24%, transparent);
      content: '';
    }
    &:is(:hover, :focus-visible, .dragging)::before {
      background: var(--active-color, #4e79a7);
    }
    &.horizontal {
      inset-block: 0;
      inset-inline-start: var(--split-pane-size, 50%);
      width: 9px;
      cursor: col-resize;
      transform: translateX(-50%);
      &:dir(rtl) {
        transform: translateX(50%);
      }
      &::before {
        inset-block: 0;
        inset-inline-start: 4px;
        width: 1px;
      }
    }
    &.vertical {
      inset-block-start: var(--split-pane-size, 50%);
      inset-inline: 0;
      height: 9px;
      cursor: row-resize;
      transform: translateY(-50%);
      &::before {
        inset-block-start: 4px;
        inset-inline: 0;
        height: 1px;
      }
    }
  }
</style>
