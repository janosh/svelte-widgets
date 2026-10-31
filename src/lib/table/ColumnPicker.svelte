<script lang="ts" generics="Col extends TableColumn = TableColumn">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import { slide } from 'svelte/transition'
  import { anchored_popover, close_before_removal, tooltip } from '../attachments/index'
  import Icon from '../Icon.svelte'
  import { Columns, Reset } from '../icons'
  import { merge_defaults } from '../labels'
  import Popover from '../Popover.svelte'
  import { COLUMN_PICKER_LABELS, type ColumnPickerLabels } from './labels'
  import type { TableColumn } from './types'

  // Show/hide menu for table columns (or any toggleable items): a trigger button opening an
  // anchored native popover of checkboxes, sectioned by `group`, searchable when long, with
  // per-section and global reset to each column's default visibility.
  let {
    columns = $bindable([]),
    open = $bindable(false),
    collapsed_groups = $bindable([]),
    filter_threshold = 20,
    max_grid_columns = 3,
    max_grid_rows = 10,
    slide_ms = 200,
    labels,
    search_text = (col: Col) =>
      [col.id, col.label, col.description, col.group].filter(Boolean).join(` `),
    on_toggle,
    trigger,
    header,
    toggle_label,
    description,
    ...rest
  }: Omit<HTMLAttributes<HTMLDivElement>, `children`> & {
    columns: Col[]
    open?: boolean
    // groups whose sections are folded; a non-empty query shows every section regardless
    collapsed_groups?: string[]
    // show the search box above this many columns (0: always, Infinity: never)
    filter_threshold?: number
    // grid layout: the fewest columns that keep each at most max_grid_rows tall, at least
    // two once there are two items, at most max_grid_columns
    max_grid_columns?: number
    max_grid_rows?: number
    // section expand/collapse duration, 0 under prefers-reduced-motion
    slide_ms?: number
    labels?: Partial<ColumnPickerLabels>
    // text the search box matches, by default id, label, description and group
    search_text?: (column: Col) => string
    // every visibility change, resets included, for hosts tracking it outside `visible`
    on_toggle?: (column: Col, visible: boolean) => void
    // replaces the default icon + label; the button around it keeps owning the click
    trigger?: Snippet<[{ open: boolean; changed: boolean }]>
    // extra controls beside the search box, above the column list
    header?: Snippet
    // a column's label inside its toggle, e.g. for markup in labels
    toggle_label?: Snippet<[{ column: Col; visible: boolean }]>
    // hover-popover content for columns with a `description`; defaults to the text
    description?: Snippet<[{ column: Col }]>
  } = $props()

  const msg = $derived(merge_defaults(COLUMN_PICKER_LABELS, labels))
  let query = $state(``)
  const is_visible = (col: Col): boolean => col.visible !== false
  const default_visible = (col: Col): boolean => col.default_visible ?? is_visible(col)
  const show_search = $derived(columns.length > filter_threshold)
  const normalized_query = $derived(show_search ? query.trim().toLowerCase() : ``)
  const matches_query = (col: Col): boolean =>
    !normalized_query || search_text(col).toLowerCase().includes(normalized_query)

  // Reset baseline: each column's default visibility, snapshotted when the column SET changes
  // (a new dataset) and held steady across this menu's own toggles. Sorted so a pure reorder
  // (a host rearranging its columns) is not mistaken for a new set, which would resnapshot
  // and silently drop the baseline. Our own writes record their signature first, so the
  // derived sees them as unchanged and keeps the snapshot.
  const default_signature = () =>
    columns
      .map((col) => `${col.id}:${default_visible(col)}`)
      .toSorted()
      .join(`\0`)
  let snapshot = { signature: ``, defaults: new Map<string, boolean>() }
  const default_visibility = $derived.by(() => {
    const signature = default_signature()
    if (signature !== snapshot.signature) {
      const defaults = new Map(columns.map((col) => [col.id, default_visible(col)]))
      snapshot = { signature, defaults }
    }
    return snapshot.defaults
  })
  // Swaps in updated copies: the host's column objects are never written, so an unbound
  // `columns` stays untouched and unproxied columns from a $derived are no problem
  function publish_visibility(changed: Col[]): void {
    const updated = new Map(changed.map((col) => [col.id, col]))
    columns = columns.map((col) => updated.get(col.id) ?? col)
    snapshot.signature = default_signature()
    for (const col of changed) on_toggle?.(col, is_visible(col))
  }

  const is_changed = (col: Col) =>
    is_visible(col) !== (default_visibility.get(col.id) ?? true)
  const has_any_changes = $derived(columns.some(is_changed))

  function reset_columns(items: Col[]): void {
    const defaults = default_visibility
    publish_visibility(
      items
        .filter(is_changed)
        .map((col) => ({ ...col, visible: defaults.get(col.id) ?? true })),
    )
  }

  // First-seen group order (stable sort), ungrouped columns last in a headerless section,
  // also while searching. A menu without groups is that one section.
  const sections = $derived(
    [...Map.groupBy(columns, (col) => col.group || ``)]
      .toSorted(([name_a], [name_b]) => Number(!name_a) - Number(!name_b))
      .map(([name, items]) => ({ name, items: items.filter(matches_query) }))
      .filter(({ items }) => items.length > 0),
  )

  const grid_template = (item_count: number): string => {
    const preferred =
      item_count <= 1 ? 1 : Math.max(2, Math.ceil(item_count / max_grid_rows))
    return `repeat(${Math.min(max_grid_columns, preferred)}, max-content)`
  }
  const slide_duration = () =>
    matchMedia(`(prefers-reduced-motion: reduce)`).matches ? 0 : slide_ms
  const toggle_group = (name: string) => {
    collapsed_groups = collapsed_groups.includes(name)
      ? collapsed_groups.filter((group) => group !== name)
      : [...collapsed_groups, name]
  }

  let trigger_el = $state<HTMLButtonElement>()
</script>

{#snippet reset_btn(items: Col[], name: string)}
  <button
    class="reset-btn"
    onclick={() => reset_columns(items)}
    type="button"
    aria-label={msg.reset(name)}
    {@attach tooltip()}
  >
    <Icon icon={Reset} width="12px" />
  </button>
{/snippet}

{#snippet column_toggle(col: Col)}
  {#snippet label(trigger_props: HTMLAttributes<HTMLLabelElement> = {})}
    <label {...trigger_props} class={[`toggle-label`, { disabled: col.disabled }]}>
      <input
        type="checkbox"
        checked={is_visible(col)}
        disabled={col.disabled}
        onchange={(event) =>
          publish_visibility([{ ...col, visible: event.currentTarget.checked }])}
      />
      {#if toggle_label}
        {@render toggle_label({ column: col, visible: is_visible(col) })}
      {:else}
        {col.label}
      {/if}
    </label>
  {/snippet}
  {#if col.description}
    <Popover trigger_mode="hover" trap_focus={false} aria-label={msg.details}>
      {#snippet trigger(trigger_props)}{@render label(trigger_props)}{/snippet}
      {#if description}
        {@render description({ column: col })}
      {:else}
        {col.description}
      {/if}
    </Popover>
  {:else}
    {@render label()}
  {/if}
{/snippet}

<!-- The column list is a native popover (anchored_popover): the top layer escapes table
overflow and stacking contexts, and the browser owns light dismiss and Escape -->
<div {...rest} class={[`column-picker`, rest.class]}>
  <button
    bind:this={trigger_el}
    type="button"
    class={[`trigger`, { custom: Boolean(trigger) }]}
    aria-expanded={open}
    aria-label={trigger ? msg.trigger : undefined}
    onclick={() => (open = !open)}
  >
    {#if trigger}
      {@render trigger({ open, changed: has_any_changes })}
    {:else}
      {msg.trigger} <Icon icon={Columns} />
    {/if}
  </button>
  {#if has_any_changes}
    {@render reset_btn(columns, msg.all_columns)}
  {/if}

  {#if open}
    <div
      class={[`column-menu`, { grouped: columns.some((col) => col.group) }]}
      role="group"
      out:close_before_removal
      {@attach anchored_popover({ anchor: trigger_el, on_close: () => (open = false) })}
    >
      {#if header || show_search}
        <div class="menu-header">
          {#if show_search}
            <input
              aria-label={msg.filter}
              bind:value={query}
              class="column-search"
              placeholder={msg.filter_placeholder}
              type="search"
            />
          {/if}
          {@render header?.()}
        </div>
      {/if}
      {#each sections as section (section.name)}
        {@const collapsed = !normalized_query && collapsed_groups.includes(section.name)}
        <div class="section">
          {#if section.name}
            <div class="section-header-row">
              <button
                class="section-header"
                aria-expanded={!collapsed}
                onclick={() => toggle_group(section.name)}
                type="button"
              >
                <span class="collapse-icon">{collapsed ? `▶` : `▼`}</span>
                {section.name}
              </button>
              {#if section.items.some(is_changed)}
                {@render reset_btn(section.items, section.name)}
              {/if}
            </div>
          {/if}
          {#if !collapsed}
            <div
              class="column-items"
              style:grid-template-columns={grid_template(section.items.length)}
              transition:slide={{ duration: slide_duration() }}
            >
              {#each section.items as col (col.id)}
                {@render column_toggle(col)}
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <span class="no-matches">{msg.no_matches}</span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .column-picker {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    > .trigger {
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 4px;
      /* a custom trigger brings its own chrome */
      &.custom {
        padding: 0;
        border: 0;
        background: none;
        color: inherit;
        font: inherit;
      }
      &:where(:not(.custom)) {
        background: var(--column-picker-btn-bg, var(--btn-bg));
        padding: var(--column-picker-btn-padding, 0 6pt);
        margin: 4pt 0;
        border-radius: var(--column-picker-radius, 4pt);
        &:hover {
          background: var(
            --column-picker-hover-bg,
            light-dark(rgba(0, 0, 0, 0.07), rgba(255, 255, 255, 0.12))
          );
        }
      }
    }
  }
  .column-menu {
    font-size: var(--column-picker-font-size, 1.1em);
    box-sizing: border-box;
    width: max-content;
    min-width: 150px;
    max-width: calc(100vw - 16px);
    max-height: var(--column-picker-menu-max-height, min(70vh, 600px));
    overflow: auto;
    padding: var(--column-picker-menu-padding, 3pt 5pt);
    background: var(--column-picker-menu-bg, var(--page-bg, Canvas));
    border: var(
      --column-picker-menu-border,
      1px solid color-mix(in srgb, currentColor 10%, transparent)
    );
    border-radius: var(--column-picker-radius, 4pt);
    box-shadow: var(
      --column-picker-menu-shadow,
      0 4px 12px color-mix(in srgb, currentColor 8%, transparent)
    );
    color: inherit; /* not the UA [popover] CanvasText */
    &.grouped {
      display: flex;
      flex-direction: column;
      gap: 8px;
      padding: var(--column-picker-menu-padding, 6pt 8pt);
    }
  }
  .column-items {
    display: grid;
    column-gap: var(--column-picker-column-gap, 8px);
  }
  .menu-header {
    position: sticky;
    z-index: 2;
    top: 0;
    display: flex;
    gap: 0.65rem;
    min-width: 0;
    min-height: 1.35rem;
    margin-bottom: 4px;
    background: var(--column-picker-menu-bg, var(--page-bg, Canvas));
    font-size: 0.72rem;
    line-height: 1.2;
  }
  .column-search {
    box-sizing: border-box;
    flex: 1;
    min-width: 0;
    height: 1.35rem;
    margin: 0;
    padding: 0 0.35rem;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    border-radius: var(--column-picker-radius, 4pt);
    outline: none;
    background: inherit;
    color: inherit;
    font: inherit;
    &:focus {
      border-color: var(--active-color, #6ea8ff);
    }
  }
  .no-matches {
    display: block;
    padding: 4px;
    color: var(--text-color-muted, color-mix(in srgb, currentColor 65%, transparent));
    font-size: 0.9em;
  }
  .reset-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    padding: 2pt;
    border: none;
    border-radius: var(--column-picker-radius, 3pt);
    background: transparent;
    color: inherit;
    cursor: pointer;
    opacity: 0.5;
    &:hover {
      background: color-mix(in srgb, currentColor 12%, transparent);
      opacity: 1;
    }
  }
  .section-header-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4pt;
    padding: 2pt 4pt;
    border-radius: var(--column-picker-radius, 3pt);
    background: var(
      --column-picker-section-bg,
      color-mix(in srgb, currentColor 5%, transparent)
    );
    &:hover {
      background: var(
        --column-picker-section-hover-bg,
        color-mix(in srgb, currentColor 12%, transparent)
      );
    }
  }
  .section-header {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 4px;
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
    font-weight: 600;
    font-size: 0.9em;
    text-align: left;
  }
  .collapse-icon {
    flex-shrink: 0;
    width: 1em;
    font-size: 0.7em;
  }
  .toggle-label {
    display: inline-block;
    height: 1.3em;
    margin: 1px 2px;
    overflow: hidden;
    border-radius: 3px;
    line-height: 1.3em;
    white-space: nowrap;
    text-overflow: ellipsis;
    &:hover:not(.disabled) {
      background: var(
        --column-picker-hover-bg,
        light-dark(rgba(0, 0, 0, 0.07), rgba(255, 255, 255, 0.12))
      );
    }
    &.disabled {
      opacity: 0.5;
      cursor: not-allowed;
      input {
        cursor: not-allowed;
      }
    }
  }
</style>
