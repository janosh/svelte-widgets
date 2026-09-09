## VirtualList

Render a large array while mounting only visible rows plus a small overscan. Every row must have the fixed height specified by `item_size`; this component does not measure variable-height content or fetch additional data.

### Minimal example

Set a viewport height and render a row through `children(item, idx)`. The index is its position in the complete array, not its position within the visible window.

```svelte example id="virtual-list-basic"
<script lang="ts">
  import { VirtualList } from 'svelte-widgets'

  const items = Array.from({ length: 10000 }, (_value, idx) => `Item ${idx + 1}`)
</script>

<VirtualList
  {items}
  item_size={32}
  style="height: 192px"
  tabindex="0"
  aria-label="Ten thousand items"
>
  {#snippet children(item, idx)}
    <div style="height: 32px; display: flex; align-items: center">{idx + 1}: {item}</div>
  {/snippet}
</VirtualList>
```

### Filtering and jumping to a row

Use stable keys when filtering or reordering items. `scroll_to_index` reveals a zero-based index, clamped to the available range. Reset to the first row after changing a filter so a prior scroll position cannot hide a shorter result set.

```svelte example id="virtual-list-filter"
<script lang="ts">
  import { tick } from 'svelte'
  import { VirtualList } from 'svelte-widgets'

  const items = Array.from({ length: 10000 }, (_value, idx) => ({
    id: idx,
    name: `Record ${idx + 1}`,
  }))
  let query = $state(``)
  let list = $state<{ scroll_to_index: (idx: number) => void }>()
  const filtered = $derived(items.filter((item) => item.name.includes(query)))
</script>

<label
  >Filter records <input
    bind:value={query}
    oninput={async () => {
      await tick()
      list?.scroll_to_index(0)
    }}
  /></label
>
<button
  disabled={!filtered.length}
  onclick={() => list?.scroll_to_index(filtered.length - 1)}>Jump to last result</button
>
<p>{filtered.length} results</p>
{#if filtered.length}
  <VirtualList
    bind:this={list}
    items={filtered}
    key={(item) => item.id}
    item_size={32}
    style="height: 192px"
    tabindex="0"
    aria-label="Filtered records"
  >
    {#snippet children(item)}
      <div style="height: 32px; display: flex; align-items: center">{item.name}</div>
    {/snippet}
  </VirtualList>
{:else}
  <p role="status">No records match your filter.</p>
{/if}
```

### Main API

| Prop / method            | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `items: readonly Item[]` | Complete array available for scrolling.                                            |
| `children(item, idx)`    | Render each mounted row. Keep its total content height within `item_size`.         |
| `item_size={32}`         | Positive fixed row height in pixels.                                               |
| `overscan={5}`           | Extra rows mounted above and below the visible window.                             |
| `initial_count={20}`     | Initial render window before the viewport is measured, including server rendering. |
| `key(item, idx)`         | Stable row key; defaults to the index.                                             |
| `bind:element`           | Access the scrolling div for DOM integration.                                      |
| `scroll_to_index(idx)`   | Component method exposed through `bind:this`.                                      |

The container defaults to a maximum height of `20rem`. For a taller viewport, override both `height` and `max-height`, for example with `style="height: 40rem; max-height: none"`. `virtual_window` from `svelte-widgets/virtual` exposes the same window calculation for custom table/grid markup. Fetching, request errors and loading indicators belong outside the list; use [MultiSelect loading recipes](infinite-scroll) for paged option loading.

### Keyboard and accessibility

`tabindex="0"` in these examples makes the scroll area keyboard-focusable for native arrow and Page Up/Down scrolling. VirtualList does not implement row selection or roving focus. Only mounted rows exist in the accessibility tree and browser find results; provide filtering or a non-virtualized alternative when users need to inspect every record at once. Keep application state outside row snippets because offscreen rows unmount.
