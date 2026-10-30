<script lang="ts" generics="Row extends { render_key: unknown }">
  import type { Snippet } from 'svelte'

  let {
    rows,
    window: viewport = null,
    children,
  }: {
    rows: Row[]
    window?: { start: number; end: number; item_height: number } | null
    children: Snippet<[Row]>
  } = $props()
  // Destructured into per-field deriveds: unlike the fresh window object, the numbers stay
  // equal across sub-row scrolls, so the keyed each re-slices only when a row enters or leaves
  const { start, end } = $derived(viewport ?? { start: 0, end: rows.length })
</script>

{#snippet spacer(height: number)}
  <li
    aria-hidden="true"
    style="height: {height}px; padding: 0; margin: 0; visibility: hidden"
  ></li>
{/snippet}
{#if viewport}{@render spacer(start * viewport.item_height)}{/if}
{#each rows.slice(start, end) as row (row.render_key)}{@render children(row)}{/each}
{#if viewport}{@render spacer((rows.length - end) * viewport.item_height)}{/if}
