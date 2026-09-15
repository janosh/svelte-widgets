<script lang="ts" generics="Item extends LinkItem = LinkItem">
  import type { Snippet } from 'svelte'
  import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements'
  import type { LinkItem } from './types'
  import { merge_defaults, PREV_NEXT_LABELS, type PrevNextLabels } from './labels'

  type SnippetProps = { item: Item; index: number; total: number }
  type NavEntry = {
    kind: `prev` | `next`
    item: Item | undefined
    title: string
  }

  let {
    items,
    as: tag = `nav`,
    current,
    labels,
    children,
    between,
    min_items = 3,
    link_props,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, `children`> & {
    items: readonly Item[]
    as?: string
    current: string
    labels?: Partial<PrevNextLabels>
    children?: Snippet<[SnippetProps & { kind: `prev` | `next` }]>
    between?: Snippet<[]>
    min_items?: number
    link_props?: Omit<HTMLAnchorAttributes, `href`>
  } = $props()

  const msg = $derived(merge_defaults(PREV_NEXT_LABELS, labels))
  // Calculate prev/next items with wraparound
  const index = $derived.by(() => {
    const idx = items.findIndex(({ href }) => href === current)
    if (idx === -1 && items.length)
      throw new Error(`PrevNext current=${JSON.stringify(current)} is absent from items`)
    return idx
  })
  const total = $derived(items.length)
  const prev = $derived(items[index - 1] ?? items.at(-1))
  const next = $derived(items[index + 1] ?? items[0])
  let nav_entries: NavEntry[] = $derived([
    { kind: `prev`, item: prev, title: msg.prev },
    { kind: `next`, item: next, title: msg.next },
  ])
</script>

{#if index >= 0 && total >= min_items}
  <svelte:element this={tag} {...rest} class={[`prev-next`, rest.class]}>
    {#each nav_entries as { kind, item, title } (kind)}
      {#if kind === `next`}{@render between?.()}{/if}
      {#if item}
        {#if children}
          {@render children({ kind, item, index, total })}
        {:else}
          <div>
            {#if title}<span>{title}</span>{/if}
            <a
              {...link_props}
              href={item.href}
              target={item.target ?? link_props?.target}
              rel={item.rel ?? link_props?.rel}
              title={item.title ?? link_props?.title}
              >{item.label}
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
