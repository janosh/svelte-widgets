<!-- Breadcrumb trail: nav[aria-label] > ol, the last item marked aria-current. Items navigate by
  href, by their own onclick or through on_navigate. Long trails collapse their middle behind
  an ellipsis button that expands in place. -->
<script lang="ts" generics="Item extends BreadcrumbItem = BreadcrumbItem">
  import { tick, type Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import { BREADCRUMBS_LABELS, merge_defaults, type BreadcrumbsLabels } from './labels'
  import type { BreadcrumbItem } from './types'
  import { clamp_integer, is_modified_click } from './utils'

  let {
    items,
    separator = `/`,
    max_items,
    items_before = 1,
    expanded = $bindable(false),
    link_current = false,
    aria_current = `page`,
    on_navigate,
    item: item_snippet,
    labels,
    ...rest
  }: Omit<HTMLAttributes<HTMLElement>, `children`> & {
    items: readonly Item[]
    separator?: string | Snippet // rendered aria-hidden before every entry but the first
    // Longer trails collapse to items_before + ellipsis + the last (max_items - items_before).
    // At least 2; items_before is clamped to max_items - 1 so at most max_items levels show.
    max_items?: number
    items_before?: number
    expanded?: boolean // set by the ellipsis button; reset it to collapse again
    // The current item is plain text by default; true keeps its link or button (e.g. to reload)
    link_current?: boolean
    aria_current?: `page` | `location` | `step` | `true`
    // Runs for every activated item after its own onclick, unless that prevented default or a
    // modifier opens the link elsewhere. Items without href render as buttons when this is set.
    // Prevent default on link clicks here for client-side routing.
    on_navigate?: (item: Item, index: number, event: MouseEvent) => void
    item?: Snippet<[{ item: Item; index: number; current: boolean }]> // replaces icon + label
    labels?: Partial<BreadcrumbsLabels>
  } = $props()

  const msg = $derived(merge_defaults(BREADCRUMBS_LABELS, labels))
  // [start, end) of the collapsed middle, null when everything shows
  const hidden = $derived.by(() => {
    if (max_items !== undefined && !(max_items >= 2)) {
      throw new RangeError(`Breadcrumbs: max_items must be at least 2, got ${max_items}`)
    }
    if (expanded || max_items === undefined || items.length <= max_items) return null
    const start = clamp_integer(items_before, 0, max_items - 1)
    return { start, end: items.length - (max_items - start) }
  })

  const activate = (item: Item, index: number, event: MouseEvent) => {
    item.onclick?.(event)
    if (event.defaultPrevented || (item.href !== undefined && is_modified_click(event)))
      return
    on_navigate?.(item, index, event)
  }
  const expand = async (list: HTMLOListElement | null, first_revealed: number) => {
    expanded = true
    await tick()
    // the ellipsis button is gone, so hand focus to the first level it revealed (plain text
    // crumbs take it through tabindex=-1)
    list?.querySelectorAll<HTMLElement>(`.crumb`)[first_revealed]?.focus()
  }
</script>

<nav aria-label={msg.nav} {...rest} class={[`breadcrumbs`, rest.class]}>
  <ol>
    {#each items as item, index}
      {#if !hidden || index <= hidden.start || index >= hidden.end}
        {@const current = index === items.length - 1}
        {@const tag =
          current && !link_current
            ? `span`
            : item.href !== undefined
              ? `a`
              : item.onclick || on_navigate
                ? `button`
                : `span`}
        <li>
          {#if index > 0}
            <span class="separator" aria-hidden="true">
              {#if typeof separator === `string`}{separator}{:else}{@render separator()}{/if}
            </span>
          {/if}
          {#if hidden && index === hidden.start}
            <button
              type="button"
              class="ellipsis"
              aria-label={msg.expand(hidden.end - hidden.start)}
              onclick={(event) => expand(event.currentTarget.closest(`ol`), hidden.start)}
              >…</button
            >
          {:else}
            <!-- svelte-ignore a11y_no_static_element_interactions (a span gets no onclick) -->
            <svelte:element
              this={tag}
              class="crumb"
              href={tag === `a` ? item.href : undefined}
              target={tag === `a` ? item.target : undefined}
              rel={tag === `a` ? item.rel : undefined}
              type={tag === `button` ? `button` : undefined}
              tabindex={tag === `span` ? -1 : undefined}
              title={item.title}
              aria-current={current ? aria_current : undefined}
              onclick={tag === `span`
                ? undefined
                : (event: MouseEvent) => activate(item, index, event)}
            >
              {#if item_snippet}
                {@render item_snippet({ item, index, current })}
              {:else}
                {#if item.icon}<Icon icon={item.icon} />{/if}
                <span class="label">{item.label}</span>
              {/if}
            </svelte:element>
          {/if}
        </li>
      {/if}
    {/each}
  </ol>
</nav>

<style>
  .breadcrumbs {
    min-width: 0;
  }
  ol {
    display: flex;
    flex-wrap: var(--breadcrumbs-wrap, wrap);
    align-items: center;
    margin: 0;
    padding: 0;
    gap: var(--breadcrumbs-gap, 0.15em);
    list-style: none;
  }
  li {
    display: inline-flex;
    align-items: center;
    gap: var(--breadcrumbs-gap, 0.15em);
    min-width: 0;
  }
  .separator {
    color: var(--breadcrumbs-separator-color, var(--text-color-muted, inherit));
    user-select: none;
  }
  .crumb,
  .ellipsis {
    display: inline-flex;
    align-items: center;
    gap: var(--breadcrumbs-icon-gap, 0.3em);
    min-width: 0;
    max-width: var(--breadcrumbs-item-max-width, 20em);
    padding: var(--breadcrumbs-item-padding, 0.1em 0.3em);
    border: none;
    border-radius: var(--breadcrumbs-item-border-radius, 4px);
    background: none;
    color: var(--breadcrumbs-color, var(--text-color-muted, inherit));
    font: inherit;
    text-decoration: none;
    white-space: nowrap;
    &:is(a, button) {
      cursor: pointer;
      &:hover {
        background: var(
          --breadcrumbs-hover-bg,
          color-mix(in srgb, currentColor 10%, transparent)
        );
        color: var(--breadcrumbs-hover-color, var(--text-color, inherit));
      }
    }
    &[aria-current] {
      color: var(--breadcrumbs-current-color, inherit);
      font-weight: var(--breadcrumbs-current-font-weight, 600);
    }
  }
  .label {
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
