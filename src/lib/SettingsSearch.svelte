<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { SvelteSet } from 'svelte/reactivity'
  import { observe_subtree } from './utils'

  let {
    query = $bindable(``),
    label = `Search settings`,
    placeholder = `Search settings`,
    children,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    query?: string
    label?: string
    placeholder?: string
    children: Snippet
  } = $props()

  const search_id = $props.id()
  const input_id = `settings-search-input-${search_id}`
  const status_id = `settings-search-status-${search_id}`
  let match_count = $state(0)
  let no_matches = $derived(query.trim().length > 0 && match_count === 0)

  // Rows opt into per-row reset with `data-key`, but a setting must not be unreachable by search
  // just because nothing resets it individually, so plain section rows count too.
  const ROW_SELECTOR = `section.settings-section [data-key], section.settings-section > :is(label, .setting)`
  const CONTAINER_SELECTOR = `section.settings-section, details.settings-group`

  const filter_settings = (root: HTMLElement): (() => void) => {
    // Only ever revert what this component changed. Recording a baseline once and replaying it
    // fights the pane: a row the caller hides after mount would be forced back into view by the
    // next unrelated DOM mutation, and would reappear mid-search as soon as it matched.
    const hidden_by_search = new SvelteSet<HTMLElement>()
    const opened_by_search = new SvelteSet<HTMLDetailsElement>()

    const set_hidden = (element: HTMLElement, hide: boolean): void => {
      if (hide && !element.hidden) hidden_by_search.add(element)
      if (hidden_by_search.has(element)) element.hidden = hide
      if (!hide) hidden_by_search.delete(element)
    }

    const restore_visibility = (): void => {
      for (const element of hidden_by_search) element.hidden = false
      hidden_by_search.clear()
      // Groups the user had open are never recorded, so their state survives untouched
      for (const group of opened_by_search) group.open = false
      opened_by_search.clear()
    }

    const refresh = (): void => {
      const normalized_query = query.trim().toLocaleLowerCase()
      if (!normalized_query) {
        restore_visibility()
        match_count = 0
        return
      }

      // A section or group is shown iff it holds a visible match, so mark the ancestors of
      // each match as we go. Walking up also covers a group nested inside another group.
      const matched_containers = new SvelteSet<Element>()
      let matches = 0
      for (const row of root.querySelectorAll<HTMLElement>(ROW_SELECTOR)) {
        const searchable_text = [
          row.dataset.label,
          row.textContent,
          row.dataset.description,
        ]
          .join(` `)
          .toLocaleLowerCase()
        set_hidden(row, !searchable_text.includes(normalized_query))
        // A row the caller hid stays hidden, so it must not count as a match either
        if (row.hidden) continue
        matches += 1
        for (
          let ancestor = row.parentElement;
          ancestor && ancestor !== root;
          ancestor = ancestor.parentElement
        ) {
          if (ancestor.matches(CONTAINER_SELECTOR)) matched_containers.add(ancestor)
        }
      }

      for (const container of root.querySelectorAll<HTMLElement>(CONTAINER_SELECTOR)) {
        const shown = matched_containers.has(container)
        set_hidden(container, !shown)
        if (container instanceof HTMLDetailsElement) {
          if (shown && !container.open) {
            container.open = true
            opened_by_search.add(container)
          }
          continue
        }
        const heading = container.previousElementSibling
        if (
          heading instanceof HTMLElement &&
          heading.matches(`.settings-section-heading`)
        ) {
          set_hidden(heading, !shown)
        }
      }

      match_count = matches
    }

    const stop_observing = observe_subtree(
      root,
      [`data-description`, `data-label`, `data-key`],
      refresh,
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

  const handle_keydown = (event: KeyboardEvent): void => {
    if (event.key !== `Escape` || !query) return
    event.preventDefault()
    event.stopPropagation()
    query = ``
  }
</script>

<div {...rest} class={[`settings-search`, rest.class]} {@attach filter_settings}>
  <div class="search-field">
    <label for={input_id}>{label}</label>
    <input
      id={input_id}
      type="search"
      bind:value={query}
      {placeholder}
      onkeydown={handle_keydown}
      aria-describedby={no_matches ? status_id : undefined}
    />
    {#if query}
      <button
        type="button"
        class="clear-search"
        aria-label="Clear settings search"
        onclick={() => (query = ``)}>×</button
      >
    {/if}
  </div>
  {@render children()}
  <p id={status_id} class="no-matches" role="status" hidden={!no_matches}>
    {#if no_matches}
      No settings match “{query.trim()}”.
    {/if}
  </p>
</div>

<style>
  .settings-search {
    display: contents;
  }
  .settings-search :global(section.settings-section > :is(label, .setting)[hidden]),
  .settings-search
    :global(
      :is(
        [data-key][hidden],
        section.settings-section[hidden],
        .settings-section-heading[hidden],
        details.settings-group[hidden]
      )
    ) {
    display: none !important;
  }
  .search-field {
    position: relative;
    display: grid;
    gap: 2pt;
    margin-block-end: 4pt;
    label {
      font-size: 0.78em;
      font-weight: 600;
      color: var(--text-color-muted, #6b7280);
    }
    input {
      width: 100%;
      box-sizing: border-box;
      padding: 4pt 20pt 4pt 6pt;
      border: 1px solid var(--border-color, #d1d5db);
      border-radius: var(--border-radius, 3pt);
      background: var(--input-bg, transparent);
      color: inherit;
      font: inherit;
      &::-webkit-search-cancel-button {
        appearance: none;
      }
    }
  }
  .clear-search {
    position: absolute;
    right: 3pt;
    bottom: 3pt;
    display: grid;
    place-items: center;
    width: 18pt;
    height: 18pt;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text-color-muted, #6b7280);
    font: inherit;
    cursor: pointer;
  }
  .no-matches {
    margin: 6pt 0;
    color: var(--text-color-muted, #6b7280);
    font-size: 0.85em;
    text-align: center;
  }
</style>
