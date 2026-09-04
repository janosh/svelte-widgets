<script lang="ts" generics="Item extends [string, unknown] = [string, unknown]">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  type NavItem = Item | [string, string]
  type SnippetProps = { item: NavItem; index: number | null; total: number }
  type NavEntry = {
    kind: `prev` | `next`
    item: NavItem | undefined
    title: string
  }

  let {
    items = [],
    node = `nav`,
    current = ``,
    titles = { prev: `&larr; Previous`, next: `Next &rarr;` },
    children,
    between,
    min_items = 3,
    link_props,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, `children`> & {
    items?: (string | Item)[]
    node?: string
    current?: string
    titles?: { prev: string; next: string }
    children?: Snippet<[SnippetProps & { kind: `prev` | `next` }]>
    between?: Snippet<[]>
    min_items?: number
    link_props?: HTMLAttributes<HTMLAnchorElement>
  } = $props()

  let items_arr = $derived(
    (items ?? []).map((item): NavItem =>
      typeof item === `string` ? [item, item] : item,
    ),
  )

  // Calculate prev/next items with wraparound
  let idx = $derived(items_arr.findIndex(([key]) => key === current))
  // position of `current` in items (not the prev/next item), null if not found
  let index = $derived(idx >= 0 ? idx : null)
  let total = $derived(items_arr.length)
  let prev = $derived(items_arr[idx - 1] ?? items_arr.at(-1))
  let next = $derived(items_arr[idx + 1] ?? items_arr[0])
  let nav_entries: NavEntry[] = $derived([
    { kind: `prev`, item: prev, title: titles.prev },
    { kind: `next`, item: next, title: titles.next },
  ])
</script>

{#if items_arr.length >= min_items}
  <svelte:element this={node} class="prev-next" {...rest}>
    {#each nav_entries as { kind, item, title } (kind)}
      {#if kind === `next`}{@render between?.()}{/if}
      {#if item}
        {#if children}
          {@render children({ kind, item, index, total })}
        {:else}
          <div>
            {#if title}<span>{@html title}</span>{/if}
            <a data-sveltekit-preload-data="hover" {...link_props} href={item[0]}
              >{typeof item[1] === `string` ? item[1] : item[0]}
            </a>
          </div>
        {/if}
      {/if}
    {/each}
  </svelte:element>
{/if}

<style>
  .prev-next {
    display: flex;
    list-style: none;
    place-content: space-between;
    gap: var(--prev-next-gap, 2em);
    padding: var(--prev-next-padding, 0);
    margin: var(--prev-next-margin, 3em auto);
  }
  .prev-next a {
    color: var(--prev-next-color, var(--accent, cornflowerblue));
    background: var(--prev-next-link-bg);
    padding: var(--prev-next-link-padding);
    border-radius: var(--prev-next-link-border-radius);
    &:hover {
      color: var(--prev-next-hover-color, var(--accent-hover, orange));
    }
  }
  .prev-next span {
    display: block;
    margin: var(--prev-next-label-margin, 0 auto 1ex);
  }
  .prev-next > div:nth-child(2) {
    text-align: end;
  }
</style>
