## Masonry

A grid that balances items across as many columns as the container fits. It measures each item, so uneven heights pack without the gaps a plain CSS grid leaves.

`order` decides how items land in columns. `balanced-stable` (the default) sends each new item to the shortest column and keeps placed items put (until the column count grows, which re-packs so new columns fill), suiting feeds that append. `balanced` re-packs everything on every change for the tightest result, so items jump. `row-first` deals items round-robin, `column-sequential` fills each column with an equal count in turn, and `column-balanced` fills each column to an even height in turn.

```svelte example id="masonry-basic"
<script lang="ts">
  import { Masonry, type MasonryOrder } from 'svelte-widgets'
  import { order_options } from 'svelte-widgets/utils'

  let order = $state<MasonryOrder>(`balanced-stable`)
  let n_items = $state(12)
  const items = $derived(
    Array.from({ length: n_items }, (_, idx) => ({
      id: idx,
      // deterministic pseudo-random heights so the packing is visible but stable
      height: 40 + ((idx * 37) % 90),
    })),
  )
</script>

<label>
  Order
  <select bind:value={order}>
    {#each order_options as option (option)}<option>{option}</option>{/each}
  </select>
</label>
<label>
  Items <input type="number" min="1" max="40" bind:value={n_items} style="width: 4em" />
</label>

<Masonry {items} {order} min_col_width={120} gap={10} style="margin-top: 1em">
  {#snippet children({ item })}
    <div
      style="height: {item.height}px; display: grid; place-items: center; border-radius:
      4pt; background: var(--surface); border: 1px solid var(--border)"
    >
      {item.id}
    </div>
  {/snippet}
</Masonry>
```

### Virtualization

Set `virtualize` with a `height` (else it warns and uses 400px) to render only items near the viewport, worth it past a few hundred items.

```svelte example id="masonry-virtualized"
<script lang="ts">
  import { Masonry } from 'svelte-widgets'

  let virtualize = $state(true)
  let rendered = $state(0)
  const count_rendered = (node: Element) => {
    const update = () => (rendered = node.querySelectorAll(`:scope > .col > div`).length)
    const observer = new MutationObserver(update)
    observer.observe(node, { childList: true, subtree: true })
    update()
    return () => observer.disconnect()
  }
  const items = Array.from({ length: 500 }, (_, idx) => ({
    id: idx,
    height: 48 + ((idx * 29) % 72),
  }))
</script>

<label>
  <input type="checkbox" bind:checked={virtualize} />
  Render only the visible window
</label>
<output>{rendered} of {items.length} item nodes mounted</output>

<Masonry
  {@attach count_rendered}
  {items}
  {virtualize}
  height={360}
  overscan={3}
  min_col_width={130}
  gap={8}
  get_estimated_height={(item) => item.height}
  style="margin-top: 0.75em; padding: 8px; border: 1px solid var(--border);
  {virtualize ? `` : `max-height: 360px; overflow-y: auto`}"
>
  {#snippet children({ item })}
    <div
      style="height: {item.height}px; display: grid; place-items: center; background:
      var(--surface); border: 1px solid var(--border)"
    >
      Item {item.id}
    </div>
  {/snippet}
</Masonry>
```

Virtualized items are never measured, so `order` is forced to `row-first` and the FLIP animation (`animate`) is off. Scroll geometry comes from `get_estimated_height` (default 150px), so the closer it is to real heights, the better the scrollbar behaves.
