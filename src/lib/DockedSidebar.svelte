<script lang="ts">
  import type { Snippet } from 'svelte'
  import SplitPane from './SplitPane.svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { on } from 'svelte/events'

  // The divider keeps the viewer at least this wide and the sidebar at least SIDEBAR_MIN_PX
  const VIEWER_MIN_PX = 320
  const SIDEBAR_MIN_PX = 260

  // A resizable sidebar beside a viewer: the divider and the sidebar go last in a parent that
  // carries the `docked-sidebar-row` class, which lays the two out as grid columns
  let {
    label,
    width = $bindable(0),
    header,
    children,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, `children`> & {
    // Names the sidebar and its divider for assistive tech
    label: string
    // The sidebar's measured width, back to 0 once it unmounts so a host summing viewer and
    // sidebar widths does not count a sidebar that is gone
    width?: number
    header?: Snippet
    children: Snippet
  } = $props()

  // Until the divider moves the sidebar is as wide as its content (at most half the row), so a
  // short table does not leave a band of empty sidebar. A drag hands the width to `ratio`.
  let resized = $state(false)
  // The viewer's share of the row: measured below while the sidebar fits its content and the
  // divider has focus
  let ratio = $state(0.5)
  let aside = $state<HTMLElement>()
  // Observed, not read once: a row that resizes around an unchanged content-fit sidebar still
  // moves the divider's share and can stack the sidebar
  let row_width = $state(0)

  $effect(() => () => (width = 0))
  // The row is an ancestor of every color-resolving component in the viewer, whose theme
  // observers re-read computed styles on each class/style write to it, so the effects below
  // write it only when a value it shows changes (never on a row resize alone) and this one
  // cleans it up
  const row = $derived(aside?.parentElement)
  $effect(() => {
    const parent = row
    if (!parent) return
    const observer = new ResizeObserver(() => (row_width = parent.clientWidth))
    observer.observe(parent)
    return () => {
      observer.disconnect()
      parent.classList.remove(`docked-sidebar-stacked`)
    }
  })
  // A row too narrow for both minimums (a phone) stacks the sidebar under the viewer: beside it,
  // the viewer's floor left the sidebar a few dozen px, too narrow to read or use
  let stacked = $derived(row_width > 0 && row_width < VIEWER_MIN_PX + SIDEBAR_MIN_PX)
  $effect(() => {
    row?.classList.toggle(`docked-sidebar-stacked`, stacked)
  })
  // SplitPane renders no element of its own to bind, but it is the sidebar's left sibling
  const divider = $derived(aside?.previousElementSibling)
  // While the column fits its content, the divider is drawn from the measured width, which goes
  // on the divider itself: it follows every sidebar resize during playback, and on the row (an
  // ancestor of the viewer) each write would re-run its theme observers. Once dragged, the
  // divider sits at the ratio and nothing reads the width.
  $effect(() => {
    if (!(divider instanceof HTMLElement)) return
    if (resized) divider.style.removeProperty(`--docked-sidebar-width`)
    else divider.style.setProperty(`--docked-sidebar-width`, `${width}px`)
  })
  // The fit-content divider is drawn from the width above, so its ratio only matters to a
  // keyboard user: the arrow keys step from it and it is the announced value. Synced while the
  // divider has focus (a pointer drag works from the pointer, and preventDefault keeps it from
  // focusing), since each new ratio makes the divider rewrite the row's --split-pane-size.
  let divider_focused = $state(false)
  $effect(() => {
    if (!divider) return
    const off_focus = on(divider, `focus`, () => (divider_focused = true))
    const off_blur = on(divider, `blur`, () => (divider_focused = false))
    return () => {
      off_focus()
      off_blur()
    }
  })
  $effect(() => {
    if (!resized && divider_focused && row_width > 0) ratio = 1 - width / row_width
  })
</script>

<SplitPane
  orientation="horizontal"
  bind:ratio
  on_resize={() => (resized = true)}
  min_px={VIEWER_MIN_PX}
  second_min_px={SIDEBAR_MIN_PX}
  aria-label="Resize the {label}"
/>
<aside
  {...rest}
  class={[`docked-sidebar`, !resized && `fit-content`, rest.class]}
  aria-label={label}
  bind:this={aside}
  bind:clientWidth={width}
>
  {#if header}<h4>{@render header()}</h4>{/if}
  {@render children()}
</aside>

<style>
  :global(.docked-sidebar-row) {
    display: grid;
    position: relative;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
  }
  /* split only while a sidebar is mounted: a host can keep the row and drop the sidebar */
  :global(.docked-sidebar-row:has(> .docked-sidebar)) {
    grid-template-columns: minmax(0, var(--split-pane-size, 66%)) minmax(0, 1fr);
  }
  :global(.docked-sidebar-row:has(> .docked-sidebar.fit-content)) {
    /* at most half the row (or --docked-sidebar-max-share), never under the viewer's 320px */
    grid-template-columns:
      minmax(0, 1fr)
      fit-content(min(var(--docked-sidebar-max-share, 50%), 100% - 320px));
  }
  :global(.docked-sidebar-row:has(> .docked-sidebar.fit-content) > .pane-divider) {
    inset-inline-start: calc(100% - var(--docked-sidebar-width, 0px));
  }
  /* stacked: viewer above, sidebar below at full width, no divider to drag */
  :global(.docked-sidebar-row.docked-sidebar-stacked:has(> .docked-sidebar)) {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 55%) minmax(0, 1fr);
  }
  :global(.docked-sidebar-row.docked-sidebar-stacked > .pane-divider) {
    display: none;
  }
  /* a rule in place of the hidden divider, in its color unless --border-color is set */
  :global(.docked-sidebar-row.docked-sidebar-stacked > .docked-sidebar) {
    border-top: 1px solid
      var(--border-color, color-mix(in srgb, currentColor 24%, transparent));
  }
  .docked-sidebar {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    padding: 6pt 8pt;
    background: var(--surface-bg, transparent);
    /* opaque sticky table cells match the sidebar, not the page */
    --table-sticky-cell-bg: var(--surface-bg, var(--page-bg, Canvas));
    --table-header-bg: var(--table-sticky-cell-bg);
    h4 {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 0 0 4pt;
    }
    /* The table takes the height left under the header and scrolls within it */
    :global(.table-container) {
      flex: 1;
      min-height: 0;
    }
  }
</style>
