<script lang="ts" generics="Item extends [string, unknown] = [string, unknown]">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { is_editable_event_target, is_modifier_chord } from './utils'

  type NavItem = Item | [string, string]
  type SnippetProps = { item: NavItem; index: number | null; total: number }
  type NavEntry = {
    kind: `prev` | `next`
    item: NavItem | undefined
    snippet: Snippet<[SnippetProps]> | undefined
    title: string
  }

  let {
    items = [],
    node = `nav`,
    current = ``,
    log = `errors`,
    nav_options = { replace_state: true, no_scroll: true },
    titles = { prev: `&larr; Previous`, next: `Next &rarr;` },
    onkeyup = ({ prev, next }) => ({ ArrowLeft: prev[0], ArrowRight: next[0] }),
    prev_snippet,
    children,
    between,
    next_snippet,
    min_items = 3,
    link_props,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, `children` | `onkeyup`> & {
    items?: (string | Item)[]
    node?: string
    current?: string
    log?: `verbose` | `errors` | `silent`
    nav_options?: { replace_state: boolean; no_scroll: boolean }
    titles?: { prev: string; next: string }
    onkeyup?:
      | ((obj: { prev: NavItem; next: NavItem }) => Record<string, string | undefined>)
      | null
    prev_snippet?: Snippet<[SnippetProps]>
    children?: Snippet<[SnippetProps & { kind: `prev` | `next` }]>
    between?: Snippet<[]>
    next_snippet?: Snippet<[SnippetProps]>
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
    { kind: `prev`, item: prev, snippet: prev_snippet, title: titles.prev },
    { kind: `next`, item: next, snippet: next_snippet, title: titles.next },
  ])

  $effect.pre(() => {
    if (log === `silent`) return
    if (items_arr.length < min_items && log === `verbose`) {
      console.warn(
        `PrevNext received ${items_arr.length} items - minimum of ${min_items} expected`,
      )
    }
    if (idx < 0 && log === `errors`) {
      const valid = items_arr.map(([key]) => key)
      console.error(
        `PrevNext received invalid current=${current}, expected one of ${valid}`,
      )
    }
  })

  function handle_keyup(event: KeyboardEvent) {
    if (
      !onkeyup ||
      // a browser/OS chord (Alt+Arrow is Back/Forward), not app navigation
      is_modifier_chord(event) ||
      is_editable_event_target(event.target) ||
      items_arr.length < min_items ||
      !prev ||
      !next
    )
      return
    const key_map = onkeyup({ prev, next })
    const target_href = key_map[event.key]
    if (target_href === undefined) return

    const { replace_state, no_scroll } = nav_options
    const [scroll_x, scroll_y] = no_scroll
      ? [globalThis.scrollX, globalThis.scrollY]
      : [0, 0]
    const goto = globalThis.history[replace_state ? `replaceState` : `pushState`]
    goto.call(globalThis.history, {}, ``, target_href)

    if (no_scroll) globalThis.scrollTo(scroll_x, scroll_y)
  }
</script>

<svelte:window onkeyup={handle_keyup} />

{#if items_arr.length >= min_items}
  <svelte:element this={node} class="prev-next" {...rest}>
    {#each nav_entries as { kind, item, snippet, title } (kind)}
      {#if kind === `next`}{@render between?.()}{/if}
      {#if item}
        {#if snippet}
          {@render snippet({ item, index, total })}
        {:else if children}
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
