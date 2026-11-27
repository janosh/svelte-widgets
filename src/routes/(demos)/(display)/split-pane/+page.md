## SplitPane

Resize two adjacent panes with a pointer or keyboard. SplitPane renders the separator; your markup owns the panes and uses the `--split-pane-size` CSS property that it writes on their shared parent.

### Minimal example

The parent needs `position: relative`. Give the first pane a width of `var(--split-pane-size)` and let the second fill the remaining space. Keep `min-width: 0` on pane content so long text cannot force a larger layout.

```svelte example id="split-pane-basic"
<script lang="ts">
  import { SplitPane } from 'svelte-widgets'

  let ratio = $state(0.4)
  let collapsed = $state(false)
</script>

<div class="panes">
  <section style:width="var(--split-pane-size)">
    <p>Files</p>
    <p>Drag the divider or focus it and use the arrow keys.</p>
  </section>
  <SplitPane bind:ratio bind:collapsed collapsible aria-label="Resize file sidebar" />
  <section style:flex="1"><p>Preview</p></section>
</div>
<p>Sidebar: {collapsed ? `collapsed` : `${Math.round(ratio * 100)}%`}</p>

<style>
  .panes {
    display: flex;
    position: relative;
    min-height: 12rem;
    border: 1px solid #8885;
    section {
      min-width: 0;
      overflow: hidden;
      p {
        margin: 1rem;
      }
    }
  }
</style>
```

### Fixed-size sidebar

Set `first_px` to use pixels instead of a ratio. Its width remains stable when the container grows; `min_px`, `max_px` and `second_min_px` constrain resizing. Ratio limits do not apply in pixel mode.

```svelte example id="split-pane-pixels"
<script lang="ts">
  import { SplitPane } from 'svelte-widgets'

  let first_px = $state<number | undefined>(200)
</script>

<div style="display: flex; position: relative; height: 8rem; border: 1px solid #8885">
  <section style="width: var(--split-pane-size); overflow: auto; min-width: 0">
    <p style="margin: 1rem">Sidebar: {Math.round(first_px ?? 0)} px</p>
  </section>
  <SplitPane bind:first_px min_px={100} max_px={300} second_min_px={100} />
  <section style="flex: 1; overflow: auto; min-width: 0">
    <p style="margin: 1rem">Remaining space</p>
  </section>
</div>
```

### Main API

| Prop                                        | Purpose                                                                                                                                                   |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bind:ratio={0.5}`                          | First pane's share of its container in ratio mode.                                                                                                        |
| `min_ratio={0.15}`, `max_ratio={0.85}`      | Bounds for ratio mode. Pixel limits can tighten them.                                                                                                     |
| `bind:first_px`                             | Supplying a number enables pixel mode.                                                                                                                    |
| `min_px`, `max_px`, `second_min_px`         | First-pane bounds and space reserved for the second pane. If both minimums cannot fit, the first pane's minimum wins.                                     |
| `collapsible`, `bind:collapsed`             | Enable Enter to collapse/restore; collapse retains the previous size.                                                                                     |
| `orientation="horizontal"`                  | Side-by-side panes by default. For `vertical`, use a column flex layout, a definite parent height and `height: var(--split-pane-size)` on the first pane. |
| `on_resize({ ratio, first_px, collapsed })` | Receive pointer/keyboard changes; save bindings in your own store for persistence.                                                                        |
| `aria-label`                                | Accessible name of the focusable separator.                                                                                                               |

### Keyboard behavior

Tab focuses the divider. Left/Right resize side-by-side panes; Up/Down resize stacked panes. Each press changes the size by 5% of the container. Home/End reach the effective bounds, and Enter collapses or restores when enabled. Horizontal keys follow the page's text direction. Render loading, empty or error feedback inside either pane; SplitPane only owns their size.

## DockedSidebar

A resizable sidebar beside a main pane, built on SplitPane. Until the divider moves, the sidebar is as wide as its content (at most half the row, or `--docked-sidebar-max-share`), so a short table leaves no band of empty space; a drag or arrow key hands its width to the divider. A row too narrow for both minimums (320 px main pane, 260 px sidebar) stacks the sidebar under the main pane. Give the parent the `docked-sidebar-row` class and render the sidebar last in it. While docked, the main pane (the row's first child) and the sidebar read as one box: `--docked-sidebar-radius` rounds their outer corners and the edge they share stays square, beside or stacked.

```svelte example id="docked-sidebar"
<script lang="ts">
  import { DockedSidebar } from 'svelte-widgets'

  let width = $state(0)
</script>

<div
  class="docked-sidebar-row"
  style="height: 12rem; border: 1px solid #8885; border-radius: 8px; --docked-sidebar-radius: 8px"
>
  <section style="min-width: 0; overflow: auto; padding: 1rem">
    Main pane. Sidebar width: {Math.round(width)} px
  </section>
  <DockedSidebar label="details" bind:width>
    {#snippet header()}Details{/snippet}
    <p style="margin: 0">Sized to its content until you drag the divider.</p>
  </DockedSidebar>
</div>
```

| Prop                  | Purpose                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------- |
| `label`               | Accessible name of the sidebar and its divider.                                         |
| `bind:width`          | The sidebar's measured width, back to 0 once it unmounts.                               |
| `header`              | Snippet rendered as the sidebar's `<h4>` heading row.                                   |
| `children`            | Sidebar content. A DataTable inside takes the height left under the header and scrolls. |
| other HTML attributes | Forwarded to the `<aside>`, including `class`.                                          |
