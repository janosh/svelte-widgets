<!-- Breadcrumb trail: nav[aria-label] > ol, the last item marked aria-current. Items navigate by
  href, by their own onclick or through on_navigate. Long trails collapse their middle behind
  an ellipsis button that expands in place. -->
<script lang="ts" generics="Item extends BreadcrumbItem = BreadcrumbItem">
  import { tick, type Snippet } from 'svelte'
  import type { HTMLAnchorAttributes, HTMLAttributes } from 'svelte/elements'
  import Icon from './Icon.svelte'
  import { BREADCRUMBS_LABELS, merge_defaults, type BreadcrumbsLabels } from './labels'
  import type { BreadcrumbItem } from './types'
  import { clamp } from './utils'

  type ItemProps = { item: Item; index: number; current: boolean }

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
    link_props,
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
    // Runs for every activated item after its own onclick, unless that prevented default.
    // Items without href render as buttons when this is set. Prevent default on link clicks
    // here for client-side routing.
    on_navigate?: (item: Item, index: number, event: MouseEvent) => void
    item?: Snippet<[ItemProps]> // replaces icon and label inside the crumb
    labels?: Partial<BreadcrumbsLabels>
    link_props?: Omit<HTMLAnchorAttributes, `href` | `onclick`>
  } = $props()

  const msg = $derived(merge_defaults(BREADCRUMBS_LABELS, labels))
  // [start, end) of the collapsed middle, empty when everything shows
  const [hidden_start, hidden_end] = $derived.by(() => {
    if (max_items !== undefined && !(max_items >= 2)) {
      throw new RangeError(`Breadcrumbs: max_items must be at least 2, got ${max_items}`)
    }
    if (expanded || max_items === undefined || items.length <= max_items) return [0, 0]
    const head = clamp(items_before, 0, max_items - 1)
    return [head, items.length - (max_items - head)]
  })
  const collapsed = $derived(hidden_start < hidden_end)

  let nav_el = $state<HTMLElement>()

  const activate = (item: Item, index: number, event: MouseEvent) => {
    item.onclick?.(event)
    if (!event.defaultPrevented) on_navigate?.(item, index, event)
  }
  const expand = async () => {
    const first_revealed = hidden_start
    expanded = true
    await tick()
    // the ellipsis button is gone, so hand focus to the first level it revealed (plain text
    // crumbs take it through tabindex=-1)
    nav_el
      ?.querySelector<HTMLElement>(`li[data-index="${first_revealed}"] .crumb`)
      ?.focus()
  }
</script>

{#snippet sep()}
  <span class="separator" aria-hidden="true">
    {#if typeof separator === `string`}{separator}{:else}{@render separator()}{/if}
  </span>
{/snippet}

<nav
  bind:this={nav_el}
  aria-label={msg.nav}
  {...rest}
  class={[`breadcrumbs`, rest.class]}
>
  <ol>
    {#each items as item, index (index)}
      {#if collapsed && index === hidden_start}
        <li>
          {#if index > 0}{@render sep()}{/if}
          <button
            type="button"
            class="ellipsis"
            aria-label={msg.expand(hidden_end - hidden_start)}
            onclick={expand}>…</button
          >
        </li>
      {/if}
      {#if !collapsed || index < hidden_start || index >= hidden_end}
        {@const current = index === items.length - 1}
        {@const interactive = !current || link_current}
        <li data-index={index}>
          {#if index > 0}{@render sep()}{/if}
          {#snippet content()}
            {#if item_snippet}
              {@render item_snippet({ item, index, current })}
            {:else}
              {#if item.icon}<Icon icon={item.icon} />{/if}
              <span class="label">{item.label}</span>
            {/if}
          {/snippet}
          {#if interactive && item.href !== undefined}
            <a
              {...link_props}
              class={[`crumb`, link_props?.class]}
              href={item.href}
              target={item.target ?? link_props?.target}
              rel={item.rel ?? link_props?.rel}
              title={item.title ?? link_props?.title}
              aria-current={current ? aria_current : undefined}
              onclick={(event) => activate(item, index, event)}
            >
              {@render content()}
            </a>
          {:else if interactive && (item.onclick || on_navigate)}
            <button
              type="button"
              class="crumb"
              title={item.title}
              aria-current={current ? aria_current : undefined}
              onclick={(event) => activate(item, index, event)}
            >
              {@render content()}
            </button>
          {:else}
            <span
              class="crumb"
              tabindex="-1"
              title={item.title}
              aria-current={current ? aria_current : undefined}
            >
              {@render content()}
            </span>
          {/if}
        </li>
      {/if}
    {/each}
  </ol>
</nav>

<style>
  .breadcrumbs {
    min-width: 0;
    font-size: var(--breadcrumbs-font-size, inherit);
  }
  ol {
    display: flex;
    flex-wrap: var(--breadcrumbs-wrap, wrap);
    align-items: center;
    gap: var(--breadcrumbs-gap, 0.15em);
    min-width: 0;
    margin: 0;
    padding: 0;
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
