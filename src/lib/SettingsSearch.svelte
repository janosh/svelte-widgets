<script lang="ts">
  import { tick, type Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { SvelteSet } from 'svelte/reactivity'
  import Icon from './Icon.svelte'
  import { Search } from './icons'
  import { observe_subtree } from './utils'

  let {
    query = $bindable(``),
    label = `Search settings`,
    placeholder = `Search settings`,
    // `inline` keeps the field permanently in flow. `icon` parks a magnifier in the top-right
    // corner and expands it in flow once opened, for panes with no room for a standing field.
    trigger = `inline`,
    children,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    query?: string
    label?: string
    placeholder?: string
    trigger?: `inline` | `icon`
    children: Snippet
  } = $props()

  const search_id = $props.id()
  const input_id = `settings-search-input-${search_id}`
  const status_id = `settings-search-status-${search_id}`
  let match_count = $state(0)
  let no_matches = $derived(query.trim().length > 0 && match_count === 0)
  let search_input = $state<HTMLInputElement>()
  let search_trigger = $state<HTMLButtonElement>()
  let collapsible = $derived(trigger === `icon`)
  // Tracked separately from `query`, or backspacing the last character would recompute the
  // field shut while the user is still typing in it.
  let opened = $state(false)
  let field_open = $derived(!collapsible || opened || Boolean(query))

  // Rows opt into per-row reset with `data-key`, but a setting must not be unreachable by search
  // just because nothing resets it individually, so plain section rows count too.
  const ROW_SELECTOR = `section.settings-section [data-key], section.settings-section > :is(label, .setting)`
  const CONTAINER_SELECTOR = `section.settings-section, details.settings-group`
  // Our own marker rather than `hidden`, so a row the caller hides stays the caller's business
  // and clearing the query needs no record of who hid what.
  const HIDDEN_ATTR = `data-search-hidden`

  const filter_settings = (root: HTMLElement): (() => void) => {
    const opened_by_search = new SvelteSet<HTMLDetailsElement>()

    const restore_visibility = (): void => {
      for (const element of root.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
        element.removeAttribute(HIDDEN_ATTR)
      }
      // Groups the user had open are never recorded, so their state survives untouched
      for (const group of opened_by_search) group.open = false
      opened_by_search.clear()
    }

    // Read the heading's title element, not the heading itself, or a section's own action
    // buttons ("Explain", "Reset") would count as searchable text on every row it holds.
    const title_of = (container: HTMLElement): string =>
      (container instanceof HTMLDetailsElement
        ? container.querySelector(`:scope > summary .group-title`)
        : container.previousElementSibling?.querySelector(`.section-title, h4`)
      )?.textContent ?? ``

    const refresh = (): void => {
      const normalized_query = query.trim().toLocaleLowerCase()
      if (!normalized_query) {
        restore_visibility()
        match_count = 0
        return
      }

      const containers = [...root.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR)]
      // A heading match reveals everything under it, so typing a section or group name works
      // even though no row repeats that name in its own text.
      const titled = containers.filter((node) =>
        title_of(node).toLocaleLowerCase().includes(normalized_query),
      )
      const rows = [...root.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
      const hits = rows.filter(
        (row) =>
          titled.some((node) => node.contains(row)) ||
          [row.dataset.label, row.textContent, row.dataset.description]
            .join(` `)
            .toLocaleLowerCase()
            .includes(normalized_query),
      )

      // A match keeps its ancestors and descendants visible, so a keyed wrapper matching on
      // its own label does not leave the rows nested inside it filtered out.
      const visible: HTMLElement[] = []
      for (const row of rows) {
        const show = hits.some((hit) => row.contains(hit) || hit.contains(row))
        row.toggleAttribute(HIDDEN_ATTR, !show)
        // A row the caller hid stays hidden, so it must not count as a match either
        if (show && !row.closest(`[hidden]`)) visible.push(row)
      }

      for (const container of containers) {
        const keep = visible.some((row) => container.contains(row))
        container.toggleAttribute(HIDDEN_ATTR, !keep)
        if (container instanceof HTMLDetailsElement) {
          if (keep && !container.open) {
            container.open = true
            opened_by_search.add(container)
          }
        } else {
          const heading = container.previousElementSibling
          if (
            heading instanceof HTMLElement &&
            heading.matches(`.settings-section-heading`)
          ) {
            heading.toggleAttribute(HIDDEN_ATTR, !keep)
          }
        }
      }

      match_count = visible.length
    }

    // `hidden` is watched so a row the caller hides mid-search drops out of the count, and
    // text is watched because a reactive label rewrites its text node in place.
    const stop_observing = observe_subtree(
      root,
      [`data-description`, `data-label`, `data-key`, `hidden`],
      refresh,
      true,
    )
    // `refresh` reads `query`, so this re-filters on each keystroke. Calling it from the
    // attachment body instead would re-run the whole attachment, whose teardown unhides
    // everything and snaps force-opened groups shut between keystrokes.
    $effect(refresh)

    return () => {
      stop_observing()
      restore_visibility()
      match_count = 0
    }
  }

  const open_search = async (): Promise<void> => {
    opened = true
    await tick()
    search_input?.focus()
  }

  const handle_keydown = async (event: KeyboardEvent): Promise<void> => {
    if (event.key !== `Escape` || (!query && !collapsible)) return
    event.preventDefault()
    event.stopPropagation()
    query = ``
    if (!collapsible) return
    opened = false
    await tick()
    search_trigger?.focus()
  }
</script>

<div {...rest} class={[`settings-search`, rest.class, trigger]}>
  <div class="search-field" class:open={field_open}>
    {#if field_open}
      {#if !collapsible}<label for={input_id}>{label}</label>{/if}
      <input
        bind:this={search_input}
        id={input_id}
        type="search"
        bind:value={query}
        {placeholder}
        aria-label={collapsible ? label : undefined}
        onkeydown={handle_keydown}
        onblur={() => {
          if (collapsible && !query) opened = false
        }}
        aria-describedby={no_matches ? status_id : undefined}
      />
      {#if query}
        <button
          type="button"
          class="clear-search"
          aria-label="Clear settings search"
          onclick={() => {
            // this button unmounts the moment the query empties, so hand focus back to the
            // field rather than dropping it on the body. A query the caller supplied leaves
            // `opened` false, so the field needs pinning open before it can take focus.
            opened = true
            query = ``
            search_input?.focus()
          }}>×</button
        >
      {/if}
    {:else}
      <button
        bind:this={search_trigger}
        type="button"
        class="open-search"
        aria-label={label}
        title={label}
        onclick={open_search}><Icon icon={Search} /></button
      >
    {/if}
  </div>
  <!-- Observe the caller's rows only. Observing the whole component fed our own chrome back
  into the filter — the clear button mounts and unmounts, the status text rewrites — costing
  an extra pass per keystroke. `display: contents` keeps this wrapper out of the layout. -->
  <div class="settings-rows" {@attach filter_settings}>{@render children()}</div>
  <!-- Stay mounted so screen readers observe text updates; :empty collapses it. -->
  <p id={status_id} class="no-matches" role="status">
    {#if no_matches}No settings match “{query.trim()}”.{/if}
  </p>
</div>

<style>
  /* Neither the wrapper nor the observed row group should exist as far as layout is
     concerned — the pane lays our children out directly. Only the corner trigger needs a
     positioning context, so only that mode opts into being a box. */
  .settings-search.inline,
  .settings-rows {
    display: contents;
  }
  .settings-search.icon {
    position: relative;
    display: grid;
    gap: var(--pane-gap, 4pt);
  }
  .settings-search :global(:is([hidden], [data-search-hidden])) {
    display: none !important;
  }
  .search-field {
    position: relative;
    display: grid;
    gap: 2pt;
    &.open {
      margin-block-end: 4pt;
    }
    label {
      font-size: 0.78em;
      font-weight: 600;
      color: var(--text-color-muted, #6b7280);
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 2pt 18pt 2pt 5pt;
      border: 1px solid var(--border-color, #d1d5db);
      border-radius: var(--border-radius, 3pt);
      background: var(--input-bg, transparent);
      color: inherit;
      font: inherit;
      /* `font: inherit` drags in the surrounding prose line-height, which on a docs page
         makes the field half again as tall as the controls it sits above. */
      line-height: 1.3;
      &::-webkit-search-cancel-button {
        appearance: none;
      }
    }
  }
  /* Collapsed only: a bare magnifier pinned to the corner and out of the content flow.
     Once open it drops back to the rules above, so the two states need no round trip. */
  .settings-search.icon .search-field:not(.open) {
    position: absolute;
    top: 0;
    right: 0;
    display: flex;
    justify-content: flex-end;
    z-index: 1;
  }
  :is(.open-search, .clear-search) {
    display: grid;
    place-items: center;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-color-muted, #6b7280);
    font: inherit;
    cursor: pointer;
  }
  .open-search {
    width: 1.8em;
    height: 1.8em;
    padding: 2pt;
    border-radius: var(--border-radius, 3pt);
    &:hover {
      background: color-mix(in srgb, currentColor 8%, transparent);
      color: inherit;
    }
    :global(svg) {
      width: 1em;
      height: 1em;
    }
  }
  .clear-search {
    position: absolute;
    right: 2pt;
    bottom: 3pt;
    width: 15pt;
    height: 15pt;
    line-height: 1;
  }
  .no-matches {
    margin: 6pt 0;
    color: var(--text-color-muted, #6b7280);
    font-size: 0.85em;
    text-align: center;
    /* `display: none` would drop the region from the accessibility tree and silence it.
       Empty plus absolute is zero-sized and no grid item, so it claims no row either. */
    &:empty {
      position: absolute;
    }
  }
</style>
