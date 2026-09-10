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
  const visible = $derived(viewport ? rows.slice(viewport.start, viewport.end) : rows)
</script>

{#snippet spacer(height: number)}
  <li
    aria-hidden="true"
    style="height: {height}px; padding: 0; margin: 0; visibility: hidden"
  ></li>
{/snippet}
{#if viewport}{@render spacer(viewport.start * viewport.item_height)}{/if}
{#each visible as row (row.render_key)}{@render children(row)}{/each}
{#if viewport}{@render spacer((rows.length - viewport.end) * viewport.item_height)}{/if}
