## Masonry

A masonry grid that balances items across as many columns as the container can fit. It
measures each item, so rows of uneven height pack tightly instead of leaving the gaps a
plain CSS grid would.

`order` decides how items land in columns. `balanced-stable` (the default) sends each new
item to the shortest column and never moves one that is already placed, which is what you
want for feeds that append. `balanced` re-packs everything on every change for the
tightest result, at the cost of items jumping around.

```svelte example id="masonry-basic"
<script lang="ts">
  import { Masonry, type MasonryOrder, order_options } from '$lib'

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

<Masonry {items} {order} minColWidth={120} gap={10} style="margin-top: 1em">
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

Set `virtualize` with a `height` to render only the items near the viewport. Useful past a
few hundred items, where the DOM node count starts to cost more than the measuring does.

```svelte example id="masonry-virtualized"
<script lang="ts">
  import { Masonry } from '$lib'

  let virtualize = $state(true)
  const items = Array.from({ length: 500 }, (_, idx) => ({
    id: idx,
    height: 48 + ((idx * 29) % 72),
  }))
</script>

<label>
  <input type="checkbox" bind:checked={virtualize} />
  Render only the visible window
</label>

<div
  style="margin-top: 0.75em; border: 1px solid var(--border)"
  style:max-height={virtualize ? undefined : `360px`}
  style:overflow-y={virtualize ? undefined : `auto`}
>
  <Masonry
    {items}
    {virtualize}
    height={360}
    overscan={3}
    minColWidth={130}
    gap={8}
    getEstimatedHeight={(item) => item.height}
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
</div>
```

Two things change while virtualizing, because off-screen items are never measured:
`order` is forced to `row-first`, and the FLIP animation is switched off. Scroll position
is driven entirely by `getEstimatedHeight` (default 150px), so the closer that is to your
real item heights, the better the scrollbar behaves.
