<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte'
  import type { HTMLAttributes, HTMLButtonAttributes } from 'svelte/elements'
  import type { ResizableOptions } from './attachments/index'
  import { click_outside, draggable, resizable, tooltip } from './attachments/index'
  import Icon from './Icon.svelte'
  import { Cross, DragIndicator, Expand, Reset, type IconData } from './icons'
  import { DRAGGABLE_PANE_LABELS, type DraggablePaneLabels } from './labels'
  import { chain_handlers } from './utils'

  type CloseVia = `toggle` | `button` | `pointer` | `escape`
  // Handed to both snippets so they can react to the pane's own chrome — a plot pausing
  // its animation while the pane is being dragged over it, say.
  type PaneState = {
    open: boolean
    show_controls: boolean
    has_been_dragged: boolean
    dragging: boolean
  }

  let {
    open = $bindable(false),
    children,
    toggle,
    toggle_props = {},
    open_icon = Cross,
    closed_icon = Expand,
    icon_style,
    offset = { x: 5, y: 5 },
    max_width,
    pane_props = {},
    persistent = false,
    // default `release`: outside bind:checked can close; pan-behind does not. See attachments.
    dismiss_on = `release`,
    inside = [],
    resize = `none`,
    position = `absolute`,
    on_close,
    on_drag_start,
    toggle_btn = $bindable(null),
    pane = $bindable(null),
    has_been_dragged = $bindable(false),
    dragging = $bindable(false),
    labels,
  }: {
    open?: boolean
    children: Snippet<[PaneState]>
    // Replaces the toggle button's content, for icons this library doesn't bundle
    toggle?: Snippet<[PaneState]>
    toggle_props?: Omit<HTMLButtonAttributes, `aria-expanded` | `type`>
    open_icon?: IconData
    closed_icon?: IconData
    // Sizing the bundled icon is the common case; reach for `toggle` only to replace it
    icon_style?: string
    // Gap between the toggle button's bottom-right corner and the pane's
    offset?: { x?: number; y?: number }
    max_width?: string
    // `aria-label` is deliberately absent from the Omit: several panes on a page need
    // distinct names. The rest describe the dialog itself and stay component-owned.
    pane_props?: Omit<HTMLAttributes<HTMLDivElement>, `aria-modal` | `role`>
    // Only Escape and the close button dismiss — ignore outside presses
    persistent?: boolean
    dismiss_on?: `press` | `release`
    // Outside controls that drive `open`; the pane's own toggle is always included. Elements
    // only — click_outside's selector form needs its `scope` guard, which this does not expose
    inside?: (Element | null | undefined)[]
    resize?: `both` | `width` | `height` | `none`
    // `fixed` escapes overflow-clipping ancestors; height capped to space below top edge
    position?: `absolute` | `fixed`
    on_close?: (detail: { via: CloseVia }) => void
    on_drag_start?: () => void
    toggle_btn?: HTMLButtonElement | null
    pane?: HTMLDivElement | null
    has_been_dragged?: boolean
    dragging?: boolean
    labels?: Partial<DraggablePaneLabels>
  } = $props()

  const msg = $derived({ ...DRAGGABLE_PANE_LABELS, ...labels })
  const viewport_margin_px = 8
  // How much of the pane stays on screen when the toggle sits near the bottom edge.
  // Without it a low toggle parks the pane in the last few pixels of the viewport.
  const min_reachable_height_px = 180
  // Doubles as `resizable`'s handle_size and as the padding reserved for it, so the
  // grab zone never overlaps content or the content area's own scrollbar
  const resize_gutter_px = 8
  const default_pane_width_px = 450
  const fallback_position = { left: 50, top: 50 }
  let resized_max_width = $state<string | null>(null)
  let resize_start_width = 0
  // An explicit consumer cap stays authoritative. The bundled default cap only shapes the
  // natural width; after a manual resize, the attachment's viewport bound takes over.
  const viewport_max_width = `calc(100vw - ${2 * viewport_margin_px}px)`
  const pane_max_width = $derived(
    max_width ?? resized_max_width ?? `${default_pane_width_px}px`,
  )

  const pane_state = $derived({
    open,
    show_controls: has_been_dragged,
    has_been_dragged,
    dragging,
  })

  // One mapping drives the attachment, its disabled state and the content gutters.
  const edges_by_resize: Record<typeof resize, NonNullable<ResizableOptions[`edges`]>> = {
    both: [`right`, `bottom`],
    width: [`right`],
    height: [`bottom`],
    none: [],
  }
  const resize_edges = $derived(edges_by_resize[resize])
  const gutter = (edge: `right` | `bottom`) =>
    resize_edges.includes(edge) ? `${resize_gutter_px}px` : null

  const close_pane = (via: CloseVia) => {
    // display: none drops focus on the body; hand it back to the toggle instead
    if (pane?.contains(document.activeElement)) toggle_btn?.focus()
    open = false
    on_close?.({ via })
  }
  const toggle_pane = () => (open ? close_pane(`toggle`) : (open = true))

  const clamp_to_viewport = (value: number, upper: number) =>
    Math.max(viewport_margin_px, Math.min(value, upper))

  // Where the pane sits when it has not been dragged: under the toggle, right edges
  // aligned. Fixed panes additionally stay inside the viewport.
  const anchor_position = (): { left: number; top: number } => {
    if (!toggle_btn) return fallback_position
    const toggle_rect = toggle_btn.getBoundingClientRect()
    const pane_width = pane?.getBoundingClientRect().width || default_pane_width_px
    const [offset_x, offset_y] = [offset.x ?? 5, offset.y ?? 5]
    // The anchor in viewport coordinates; each strategy below only restates it in the
    // space its own left/top are read in.
    const left = toggle_rect.right - pane_width + offset_x
    const top = toggle_rect.bottom + offset_y

    if (position === `fixed`) {
      return {
        left: clamp_to_viewport(
          left,
          globalThis.innerWidth - pane_width - viewport_margin_px,
        ),
        top: clamp_to_viewport(
          top,
          globalThis.innerHeight - min_reachable_height_px - viewport_margin_px,
        ),
      }
    }

    // The pane's containing block, not the toggle's: they are siblings and normally share
    // one, but toggle_props can position the toggle independently, and it is the pane's
    // own left/top being computed here. Always laid out at this point — every caller
    // either holds an open pane or is a control inside it.
    const ancestor = pane?.offsetParent
    // No positioned ancestor means the pane is placed against the document
    if (!ancestor) {
      return { left: left + globalThis.scrollX, top: top + globalThis.scrollY }
    }
    // An absolute child's insets resolve against the ancestor's padding box, whereas its
    // rect is the border box, so the border comes off too. clientLeft/clientTop are that
    // border, already in used-value terms.
    const ancestor_rect = ancestor.getBoundingClientRect()
    return {
      left: left - ancestor_rect.left - ancestor.clientLeft,
      top: top - ancestor_rect.top - ancestor.clientTop,
    }
  }

  // Move the pane back under the toggle and drop manual size overrides. A fixed pane
  // must not extend past the bottom viewport edge, so --pane-viewport-clamp (min()'d
  // with --pane-max-height in CSS) is rewritten on every move, or a reset after a drag
  // plus a window resize would keep a stale cap. No minimum needed: anchor_position
  // already clamps the top so min_reachable_height_px of space remains below it.
  const position_pane = () => {
    if (!pane) return
    // Clear the manual size first so anchor_position() measures the natural width
    pane.style.width = ``
    pane.style.height = ``
    const { left, top } = anchor_position()
    Object.assign(pane.style, {
      left: `${left}px`,
      top: `${top}px`,
      right: `auto`,
    })
    if (position === `fixed`) {
      const available = globalThis.innerHeight - top - viewport_margin_px
      pane.style.setProperty(`--pane-viewport-clamp`, `${Math.max(0, available)}px`)
    }
  }

  const reset_position = () => {
    position_pane()
    has_been_dragged = false
    resized_max_width = null
  }

  const reanchor = () => {
    if (open && toggle_btn && !has_been_dragged) position_pane()
  }
  $effect(reanchor)

  let resize_timeout: ReturnType<typeof setTimeout> | undefined
  onDestroy(() => clearTimeout(resize_timeout))
  // Debounced, and reanchor re-checks on the trailing edge: the pane may have been
  // dragged or closed during the wait, either of which cancels the reposition
  const handle_viewport_resize = () => {
    clearTimeout(resize_timeout)
    resize_timeout = setTimeout(reanchor, 50)
  }

  // Resolve at gesture time: the pane may have been dragged or reanchored since attach.
  // Bounding-client coordinates make the same calculation work for fixed and absolute panes.
  const resize_width_limit = (pane_node: HTMLElement) => {
    const { left, width } = pane_node.getBoundingClientRect()
    const room =
      globalThis.innerWidth - Math.max(viewport_margin_px, left) - viewport_margin_px
    const explicit_limit = Number(max_width?.trim().match(/^.*(?=px$)/u)?.[0])
    // Keep the viewport cap at least as wide as the pane so starting a resize does not yank
    // an overflowing pane narrower; an explicit pixel cap remains authoritative.
    return Math.min(
      Math.max(room, width),
      explicit_limit >= 0 ? explicit_limit : Infinity,
    )
  }
</script>

<svelte:window onresize={handle_viewport_resize} />

<button
  bind:this={toggle_btn}
  {...toggle_props}
  type="button"
  aria-expanded={open}
  onclick={chain_handlers(toggle_pane, toggle_props.onclick)}
  class={[`pane-toggle`, toggle_props.class]}
  {@attach tooltip({
    content: toggle_props.title ?? (open ? msg.close_pane : msg.open_pane),
  })}
>
  {#if toggle}
    {@render toggle(pane_state)}
  {:else}
    <Icon icon={open ? open_icon : closed_icon} style={icon_style} />
  {/if}
</button>

<!-- toc-exclude keeps pane headings out of a page's Toc: this is floating chrome. The
aria-label sits before the spread, so a page with several panes renames them via pane_props -->
<div
  bind:this={pane}
  aria-label="Draggable pane"
  {...pane_props}
  role="dialog"
  aria-modal="false"
  data-resize={resize}
  data-dragging={dragging}
  style:position
  style:max-width={pane_max_width}
  style:top="{fallback_position.top}px"
  style:left="{fallback_position.left}px"
  style:display={open ? `grid` : `none`}
  style:padding-right={gutter(`right`)}
  style:padding-bottom={gutter(`bottom`)}
  class={[`draggable-pane`, `toc-exclude`, pane_props.class, { 'pane-open': open }]}
  {@attach draggable({
    handle_selector: `.drag-handle`,
    on_drag_start: () => {
      has_been_dragged = true
      dragging = true
      on_drag_start?.()
    },
    on_drag_end: () => (dragging = false),
  })}
  {@attach resizable({
    disabled: resize_edges.length === 0,
    edges: resize_edges,
    min_width: 200,
    min_height: 100,
    // Width only. Height is already bounded by the CSS `max-height` (--pane-max-height
    // min'd with --pane-viewport-clamp); adding a second JS cap on top of it only fought
    // the user's drag.
    max_width: resize_width_limit,
    handle_size: resize_gutter_px,
    labels: { handle: msg.resize_handle },
    on_resize_start: (_event, { width }) => {
      has_been_dragged = true
      resize_start_width = width
    },
    on_resize: (_event, { width }) => {
      if (width === resize_start_width) return
      resized_max_width =
        width > globalThis.innerWidth - 2 * viewport_margin_px
          ? `max(${viewport_max_width}, ${width}px)`
          : viewport_max_width
    },
    on_resize_reset: () => (resized_max_width = null),
  })}
  {@attach click_outside({
    enabled: open,
    inside: [toggle_btn, ...inside],
    escape: true,
    dismiss_on,
    // Escape always dismisses; a press outside is what `persistent` suppresses
    callback: (_node, _config, { via }) => {
      if (via === `escape` || !persistent) close_pane(via)
    },
  })}
>
  <div class="control-tab">
    <span class="drag-handle" aria-hidden="true">
      <Icon icon={DragIndicator} style="width: 100%; height: 100%" />
    </span>
    {#if has_been_dragged}
      <button
        type="button"
        class="reset-button"
        title={msg.reset_position}
        aria-label={msg.reset_position}
        onclick={reset_position}
      >
        <Icon icon={Reset} style="width: 100%; height: 100%" />
      </button>
      <button
        type="button"
        class="close-button"
        title={msg.close_pane}
        aria-label={msg.close_pane}
        onclick={() => close_pane(`button`)}
      >
        <Icon icon={Cross} style="width: 100%; height: 100%" />
      </button>
    {/if}
  </div>
  <div class="pane-content">
    {@render children(pane_state)}
  </div>
  {#if resize === `both`}
    <!-- affordance only; sized to the 8px gutter so its lines sit over pixels that resize -->
    <svg class="resize-grip" viewBox="0 0 8 8" aria-hidden="true">
      <line x1="7" y1="1" x2="1" y2="7" />
      <line x1="7" y1="3" x2="3" y2="7" />
      <line x1="7" y1="5" x2="5" y2="7" />
    </svg>
  {/if}
</div>

<style>
  button.pane-toggle {
    box-sizing: border-box;
    display: flex;
    place-items: center;
    padding: var(--pane-toggle-padding, 2pt);
    border-radius: var(--pane-toggle-border-radius, var(--border-radius, 3pt));
    background-color: transparent;
    transition: var(--pane-toggle-transition, background-color 0.2s);
    font-size: var(--pane-toggle-font-size, 0.875rem);
    &:hover {
      background-color: color-mix(in srgb, currentColor 8%, transparent);
    }
  }
  div.draggable-pane {
    /* position comes from style:position, default absolute so it scrolls with the page */
    box-sizing: border-box;
    /* one in-flow child; minmax(0, 1fr) lets it scroll instead of overflowing once
       the pane has a definite height from a resize or the viewport clamp */
    grid-template-rows: minmax(0, 1fr);
    text-align: left;
    width: var(--pane-width, 28em);
    min-height: var(--pane-min-height, auto);
    /* --pane-viewport-clamp (set for position="fixed") keeps a pane whose toggle sits
       low on screen above the bottom viewport edge */
    max-height: min(var(--pane-max-height, 80vh), var(--pane-viewport-clamp, 200vh));
    overflow: visible; /* the control tab protrudes past the pane's right border */
    background: var(--pane-bg, var(--page-bg, light-dark(white, black)));
    border: var(
      --pane-border,
      1px solid light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.15))
    );
    border-radius: var(--pane-border-radius, var(--border-radius, 3pt));
    box-shadow: var(
      --pane-box-shadow,
      light-dark(0 4px 20px -4px rgba(0, 0, 0, 0.15), 0 8px 16px -4px rgba(0, 0, 0, 0.3))
    );
    z-index: var(--pane-z-index, 10);
    /* position is deliberately not transitioned, which would make dragging sluggish */
    transition:
      opacity 0.3s,
      background-color 0.3s,
      border-color 0.3s,
      box-shadow 0.3s;
    .pane-content {
      padding: var(--pane-padding, 1ex);
      display: grid;
      gap: var(--pane-gap, 4pt);
      /* Rows size to their content and sit at the top. Without this, `normal` stretches the
         auto rows to fill a pane taller than its content — which only shows up once content
         gets short, e.g. a settings pane filtered down to one row, where it inflates that
         row (and any input in it) to hundreds of pixels. */
      align-content: var(--pane-align-content, start);
      box-sizing: border-box;
      min-height: 0; /* or the row refuses to shrink below its content */
      overflow-x: var(--pane-overflow-x, hidden);
      overflow-y: var(--pane-overflow-y, auto);
      overscroll-behavior: contain;
    }
    .control-tab {
      position: absolute;
      top: 6px;
      right: -1px;
      transform: translateX(100%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1px;
      padding: 3px 2px;
      background: inherit;
      border: inherit;
      border-left: none;
      border-radius: 0 5px 5px 0;
      z-index: var(--pane-control-tab-z-index, 1);
      > * {
        width: 1.1em;
        height: 1.1em;
        padding: 1px;
        box-sizing: border-box;
        display: flex;
        place-items: center;
        border: none;
        border-radius: 3px;
        background: none;
        opacity: 0.5;
        &:hover {
          opacity: 0.8;
          background-color: color-mix(in srgb, currentColor 15%, transparent);
        }
      }
      /* .drag-handle's own cursor is inline, set by `draggable` */
      button {
        cursor: pointer;
      }
    }
    .resize-grip {
      position: absolute;
      bottom: 0;
      right: 0;
      width: 8px; /* match resize_gutter_px / resizable handle_size */
      height: 8px;
      opacity: 0.3;
      pointer-events: none; /* gutter underneath belongs to `resizable` */
      line {
        stroke: currentColor;
        stroke-width: 1.5;
        stroke-linecap: round;
      }
    }
  }
</style>
