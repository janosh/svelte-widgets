<script lang="ts">
  import { create_flash } from './feedback.svelte'
  import Icon from '../Icon.svelte'
  import type { IconData } from '../icons'
  import {
    ArrowDown,
    ArrowUp,
    ChevronCollapse,
    ChevronExpand,
    Copy,
    Cross,
    Download,
    Search,
  } from '../icons'
  import { download } from './download'
  import { clamp, is_editable_event_target, is_modifier_chord } from '../utils'
  import { make_change_detector } from './helpers'
  import { tick } from 'svelte'
  import { highlight_matches, tooltip } from '../attachments/index'
  import type { HTMLAttributes } from 'svelte/elements'
  import { SvelteSet } from 'svelte/reactivity'
  import JsonNode from './JsonNode.svelte'
  import type { CopyEventPosition, JsonTreeContext, JsonTreeProps } from './types'
  import { set_json_tree_context } from './types'
  import {
    build_ghost_map,
    collect_all_paths,
    compute_diff,
    find_matching_paths,
    format_preview,
    get_ancestor_paths,
    get_value_at_path,
    relative_path_segments,
    serialize_for_copy,
  } from './utils'

  const ARROW_KEYS = new Set([`ArrowDown`, `ArrowUp`, `ArrowLeft`, `ArrowRight`])
  const MATCH_NAV = [
    [-1, `Previous match (Shift+F3)`, ArrowUp],
    [1, `Next match (F3)`, ArrowDown],
  ] as const

  let {
    value,
    root_label,
    default_fold_level = 2,
    auto_fold_arrays = 10,
    auto_fold_objects = 20,
    collapsed_paths = $bindable(new SvelteSet<string>()),
    show_header = true,
    show_data_types = $bindable(false),
    show_array_indices = $bindable(true),
    sort_keys = false,
    max_string_length = 200,
    highlight_changes = true,
    on_select,
    on_copy,
    download_filename,
    compare_value,
    editable = false,
    on_change,
    ...rest
  }: JsonTreeProps & HTMLAttributes<HTMLDivElement> = $props()

  type CopyFeedback = { error: boolean; pos: CopyEventPosition | null }

  let search_query = $state(``)
  let search_input_value = $state(``)
  let search_debounce_timeout: ReturnType<typeof setTimeout> | undefined
  let focused_path = $state<string | null>(null)
  const copy_feedback = create_flash<CopyFeedback | null>(null, 1000)
  $effect(() => () => clearTimeout(search_debounce_timeout))
  // Paths expanded explicitly (overrides auto-fold thresholds)
  let force_expanded = $state(new SvelteSet<string>())
  // Index into sorted_matches (-1 means no selection)
  let current_match_index = $state(-1)
  let content_element = $state<HTMLDivElement>()
  let context_menu_state = $state<{
    x: number
    y: number
    path: string
    value: unknown
    expandable: boolean
    is_collapsed: boolean
  } | null>(null)
  const pinned_paths = new SvelteSet<string>()
  const selected_paths = new SvelteSet<string>()
  let last_selected_path: string | null = null
  // Previous leaf values for change-flash detection (written by JsonValue)
  const prev_values = new Map<string, unknown>()

  const root_path = $derived(root_label ?? ``)
  const value_at = (path: string): unknown => get_value_at_path(value, path, root_label)

  const value_changed = make_change_detector()
  $effect.pre(() => {
    if (!value_changed(value)) return
    focused_path = null
    copy_feedback.reset()
    context_menu_state = null
    force_expanded = new SvelteSet()
    const valid_paths = new Set(collect_all_paths(value, root_path))
    collapsed_paths = new SvelteSet(
      [...collapsed_paths].filter((path) => valid_paths.has(path)),
    )
    pinned_paths.clear()
    selected_paths.clear()
    last_selected_path = null
    current_match_index = -1
    prev_values.clear()
    if (search_query) queueMicrotask(() => expand_to_matches())
  })

  function handle_search_input(event: Event & { currentTarget: HTMLInputElement }) {
    search_input_value = event.currentTarget.value
    clearTimeout(search_debounce_timeout)
    search_debounce_timeout = setTimeout(() => {
      search_query = search_input_value
      // queueMicrotask lets derived sorted_matches update before expand_to_matches runs
      queueMicrotask(() => expand_to_matches())
    }, 150)
  }

  // Matching paths in render order (find_matching_paths walks children in display order)
  const sorted_matches = $derived(
    search_query ? find_matching_paths(value, search_query, root_path, sort_keys) : [],
  )
  const current_match_path = $derived(sorted_matches[current_match_index] ?? null)

  // Expand ancestors so the current match is rendered, then scroll it into view
  async function reveal_current_match(): Promise<void> {
    const match_path = current_match_path
    if (!match_path || !content_element) return
    set_collapsed(get_ancestor_paths(match_path, root_path), () => false)
    await tick()
    content_element
      .querySelector(`[data-path="${CSS.escape(match_path)}"]`)
      ?.scrollIntoView({ behavior: `smooth`, block: `center` })
  }

  // Expand ancestors of every match when the query changes and select the first one
  async function expand_to_matches(): Promise<void> {
    if (sorted_matches.length === 0) {
      current_match_index = -1
      return
    }
    set_collapsed(
      new Set(sorted_matches.flatMap((path) => get_ancestor_paths(path, root_path))),
      () => false,
    )
    if (current_match_index < 0 || current_match_index >= sorted_matches.length) {
      current_match_index = 0
    }
    await reveal_current_match()
  }

  function step_match(delta: number): void {
    const count = sorted_matches.length
    if (count === 0) return
    current_match_index = (current_match_index + delta + count) % count
    void reveal_current_match()
  }

  // Move each path into collapsed or force_expanded (which overrides auto-fold thresholds)
  function set_collapsed(
    paths: Iterable<string>,
    collapse: (path: string) => boolean,
  ): void {
    // A plain Set bound by the parent only notifies on reassignment, so upgrade it to a
    // SvelteSet on first write; afterwards in-place mutation re-renders only touched nodes.
    if (!(collapsed_paths instanceof SvelteSet))
      collapsed_paths = new SvelteSet(collapsed_paths)
    const collapsed = collapsed_paths
    for (const path of paths) {
      if (collapse(path)) {
        force_expanded.delete(path)
        collapsed.add(path)
      } else {
        collapsed.delete(path)
        force_expanded.add(path)
      }
    }
  }

  // Expandable paths in the subtree rooted at target_path, target_path first
  function get_descendants(target_path: string): string[] {
    const descendants = collect_all_paths(value_at(target_path), target_path)
    return descendants[0] === target_path ? descendants : [target_path, ...descendants]
  }

  const toggle_collapse_recursive = (path: string, collapse: boolean) =>
    set_collapsed(get_descendants(path), () => collapse)
  const collapse_children_only = (path: string) =>
    set_collapsed(get_descendants(path), (descendant) => descendant !== path)

  // Collapse every expandable path at depth >= level and force-expand the rest
  function collapse_to_level(level: number): void {
    const new_collapsed = new SvelteSet<string>()
    const new_expanded = new SvelteSet<string>()
    for (const path of collect_all_paths(value, root_path)) {
      const depth = relative_path_segments(path, root_label).length
      ;(depth >= level ? new_collapsed : new_expanded).add(path)
    }
    collapsed_paths = new_collapsed
    force_expanded = new_expanded
  }
  const expand_all = () => collapse_to_level(Infinity)
  const collapse_all = () => collapse_to_level(0)

  function set_focused(path: string | null): void {
    focused_path = path
    if (path !== null) on_select?.(path, value_at(path))
  }

  // Move DOM focus to the focused node (one effect for the tree instead of one per node)
  $effect(() => {
    if (focused_path === null || !content_element) return
    content_element
      .querySelector<HTMLElement>(`.json-node[data-path="${CSS.escape(focused_path)}"]`)
      ?.focus()
  })

  // Rendered node paths in document order, for keyboard navigation and range selection
  const rendered_paths = (): string[] =>
    Array.from(
      content_element?.querySelectorAll<HTMLElement>(`.json-node:not(.ghost)`) ?? [],
      (node) => node.dataset.path ?? ``,
    )

  async function copy_to_clipboard(
    path: string,
    text: string,
    event?: CopyEventPosition,
  ): Promise<void> {
    const pos = event ? { clientX: event.clientX, clientY: event.clientY } : null
    let error = false
    try {
      await navigator.clipboard.writeText(text)
      on_copy?.(path, text)
    } catch {
      error = true // show feedback regardless, but flag the failure
    }
    copy_feedback.show({ error, pos })
  }

  const diff_map = $derived(
    compare_value === undefined ? null : compute_diff(compare_value, value, root_path),
  )
  const ghost_map = $derived(diff_map ? build_ghost_map(diff_map, root_label) : new Map())

  function show_context_menu(
    event: MouseEvent,
    path: string,
    ctx_value: unknown,
    expandable: boolean,
    is_collapsed: boolean,
  ): void {
    event.preventDefault()
    event.stopPropagation() // ancestors would otherwise re-target the menu to themselves
    context_menu_state = {
      x: event.clientX,
      y: event.clientY,
      path,
      value: ctx_value,
      expandable,
      is_collapsed,
    }
  }

  function toggle_pin(path: string): void {
    if (!pinned_paths.delete(path)) pinned_paths.add(path)
  }

  // Context menu entries for the right-clicked node (null renders a separator)
  type MenuItem = { label: string; icon?: IconData; action: () => void }
  const context_menu_items = $derived.by((): (MenuItem | null)[] => {
    if (!context_menu_state) return []
    const { path, value: node_value, expandable, is_collapsed } = context_menu_state
    return [
      {
        label: `Copy value`,
        icon: Copy,
        action: () => copy_to_clipboard(path, serialize_for_copy(node_value)),
      },
      { label: `Copy path`, action: () => copy_to_clipboard(path, path) },
      null,
      ...(expandable
        ? [
            {
              label: `${is_collapsed ? `Expand` : `Collapse`} all children`,
              action: () =>
                is_collapsed
                  ? toggle_collapse_recursive(path, false)
                  : collapse_children_only(path),
            },
            null,
          ]
        : []),
      {
        label: `${pinned_paths.has(path) ? `Unpin` : `Pin`} this path`,
        action: () => toggle_pin(path),
      },
    ]
  })

  // Toggle selection of a path (shift extends from the last selected node in DOM order)
  function toggle_select(path: string, shift: boolean): void {
    const paths = rendered_paths()
    const start_idx = last_selected_path === null ? -1 : paths.indexOf(last_selected_path)
    const end_idx = paths.indexOf(path)
    if (shift && start_idx !== -1 && end_idx !== -1) {
      const [from, to] = start_idx < end_idx ? [start_idx, end_idx] : [end_idx, start_idx]
      for (let idx = from; idx <= to; idx++) selected_paths.add(paths[idx])
    } else if (!selected_paths.delete(path)) selected_paths.add(path)
    last_selected_path = path
  }

  const settings = $derived({
    default_fold_level,
    auto_fold_arrays,
    auto_fold_objects,
    show_data_types,
    show_array_indices,
    sort_keys,
    max_string_length,
    highlight_changes,
    editable,
  })

  const context: JsonTreeContext = {
    get settings() {
      return settings
    },
    get collapsed() {
      return collapsed_paths
    },
    get force_expanded() {
      return force_expanded
    },
    get current_match_path() {
      return current_match_path
    },
    get focused_path() {
      return focused_path
    },
    selected_paths,
    get diff_map() {
      return diff_map
    },
    get ghost_map() {
      return ghost_map
    },
    prev_values,
    toggle_collapse: (path, is_currently_collapsed) =>
      set_collapsed([path], () => !is_currently_collapsed),
    toggle_collapse_recursive,
    collapse_children_only,
    set_focused,
    toggle_select,
    copy_value: (path, val, event) =>
      copy_to_clipboard(path, serialize_for_copy(val), event),
    copy_path: (path, event) => copy_to_clipboard(path, path, event),
    show_context_menu,
    get on_change() {
      return on_change
    },
  }
  set_json_tree_context(context)

  function handle_tree_keydown(event: KeyboardEvent) {
    // F3 navigates search matches (search input handles its own F3/Enter)
    if (event.key === `F3`) {
      event.preventDefault()
      step_match(event.shiftKey ? -1 : 1)
      return
    }
    // Everything below moves tree focus or hijacks Ctrl/Cmd+C; F3 above stays global
    if (is_editable_event_target(event.target)) return
    // Escape closes context menu first, then clears selection
    if (event.key === `Escape`) {
      if (context_menu_state) context_menu_state = null
      else selected_paths.clear()
      return
    }
    // Ctrl/Cmd+C with selection copies all selected
    if (event.key.toLowerCase() === `c` && (event.ctrlKey || event.metaKey)) {
      if (selected_paths.size === 0) return
      event.preventDefault()
      const values = [...selected_paths].map((path) => serialize_for_copy(value_at(path)))
      void copy_to_clipboard(`[selection]`, values.join(`\n`))
      return
    }
    // Any arrow key focuses the first node (index -1 clamps to 0); afterwards Up/Down step
    // (clamped) and Left/Right are left to the focused node's own fold/unfold handler
    if (!ARROW_KEYS.has(event.key) || is_modifier_chord(event)) return
    const paths = rendered_paths()
    const current_index = focused_path === null ? -1 : paths.indexOf(focused_path)
    const step = event.key === `ArrowDown` ? 1 : event.key === `ArrowUp` ? -1 : 0
    if (paths.length === 0 || (current_index !== -1 && step === 0)) return
    event.preventDefault()
    set_focused(paths[clamp(current_index + step, 0, paths.length - 1)])
  }

  function clear_search() {
    clearTimeout(search_debounce_timeout)
    search_input_value = ``
    search_query = ``
    current_match_index = -1
  }

  const download_json = () =>
    download(
      serialize_for_copy(value),
      download_filename ?? `data-${new Date().toISOString().slice(0, 10)}.json`,
      `application/json`,
    )

  function handle_search_keydown(
    event: KeyboardEvent & { currentTarget: HTMLInputElement },
  ) {
    if (event.key === `Escape`) {
      event.preventDefault()
      clear_search()
      event.currentTarget.blur()
    } else if (event.key === `Enter` || event.key === `F3`) {
      event.stopPropagation() // Prevent bubbling to tree-level F3 handler
      event.preventDefault()
      step_match(event.shiftKey ? -1 : 1)
    }
  }
</script>

{#snippet header_btn(
  title: string,
  onclick: () => void,
  content: IconData | string,
  active = false,
)}
  <button type="button" {title} {onclick} class:active {@attach tooltip()}>
    {#if typeof content === `string`}
      {content}
    {:else}
      <Icon icon={content} style="width: 14px; height: 14px" />
    {/if}
  </button>
{/snippet}

<div
  role="tree"
  aria-label="JSON tree viewer"
  {...rest}
  class={[`json-tree`, rest.class]}
  onkeydown={handle_tree_keydown}
>
  {#if show_header}
    <header class="json-tree-header">
      <div class="search-wrapper">
        <Icon icon={Search} style="width: 14px; height: 14px; opacity: 0.6" />
        <input
          type="search"
          placeholder="Search keys and values..."
          value={search_input_value}
          oninput={handle_search_input}
          onkeydown={handle_search_keydown}
          class="search-input"
        />
        {#if search_input_value}
          <button
            type="button"
            class="clear-search"
            onclick={clear_search}
            title="Clear search (Esc)"
            {@attach tooltip()}
          >
            <Icon icon={Cross} style="width: 12px; height: 12px" />
          </button>
        {/if}
      </div>
      {#if search_query && sorted_matches.length > 0}
        <div class="match-nav">
          {#each MATCH_NAV as [delta, title, icon] (delta)}
            <button
              type="button"
              class="nav-btn"
              onclick={() => step_match(delta)}
              {title}
              {@attach tooltip()}
            >
              <Icon {icon} style="width: 12px; height: 12px" />
            </button>
          {/each}
          <span class="match-count"
            >{current_match_index + 1} of {sorted_matches.length}</span
          >
        </div>
      {/if}
      <div class="controls">
        {@render header_btn(
          `${show_data_types ? `Hide` : `Show`} data types`,
          () => (show_data_types = !show_data_types),
          `T`,
          show_data_types,
        )}
        {@render header_btn(
          `${show_array_indices ? `Hide` : `Show`} array indices`,
          () => (show_array_indices = !show_array_indices),
          `#`,
          show_array_indices,
        )}
      </div>
      <div class="divider"></div>
      <div class="controls">
        {@render header_btn(`Expand all`, expand_all, ChevronExpand)}
        {@render header_btn(`Collapse all`, collapse_all, ChevronCollapse)}
        {#each [1, 2, 3] as level (level)}
          {@render header_btn(
            `Collapse to level ${level}`,
            () => collapse_to_level(level),
            String(level),
          )}
        {/each}
      </div>
      <div class="divider"></div>
      <div class="controls">
        {@render header_btn(
          `Copy JSON to clipboard`,
          () => copy_to_clipboard(`[root]`, serialize_for_copy(value)),
          Copy,
        )}
        {@render header_btn(`Download as JSON file`, download_json, Download)}
      </div>
    </header>
  {/if}

  {#if focused_path}
    <div class="path-breadcrumb">
      <button
        type="button"
        class="copy-path-btn"
        onclick={() => focused_path && copy_to_clipboard(focused_path, focused_path)}
        title="Click to copy path"
        {@attach tooltip()}
      >
        {focused_path}
      </button>
    </div>
  {/if}

  {#if pinned_paths.size > 0}
    <div class="pinned-panel">
      <div class="pinned-header">
        <span>Pinned ({pinned_paths.size})</span>
        <button
          type="button"
          class="pinned-clear-btn"
          onclick={() => pinned_paths.clear()}
        >
          Clear
        </button>
      </div>
      {#each [...pinned_paths] as pinned_path (pinned_path)}
        <div class="pinned-item">
          <button
            type="button"
            class="pinned-path"
            onclick={() =>
              copy_to_clipboard(pinned_path, serialize_for_copy(value_at(pinned_path)))}
            title="Click to copy value"
            {@attach tooltip()}
          >
            {pinned_path}
          </button>
          <span class="pinned-value">{format_preview(value_at(pinned_path))}</span>
          <button
            type="button"
            class="unpin-btn"
            onclick={() => toggle_pin(pinned_path)}
            title="Unpin"
          >
            ✕
          </button>
        </div>
      {/each}
    </div>
  {/if}

  <div
    bind:this={content_element}
    class="json-tree-content"
    {@attach highlight_matches({
      query: search_query,
      css_class: `json-tree-search-match`,
      scroll_to_match: false, // reveal_current_match scrolls to the selected match instead
    })}
  >
    <JsonNode node_key={root_label ?? null} {value} path={root_path} depth={0} />
  </div>

  {#if copy_feedback.value}
    {@const feedback = copy_feedback.value}
    <div
      class={[`copy-feedback`, { error: feedback.error }]}
      style={feedback.pos
        ? `left: ${feedback.pos.clientX}px; top: ${feedback.pos.clientY - 24}px`
        : `right: 8px; top: 8px`}
    >
      {feedback.error ? `Copy failed` : `Copied!`}
    </div>
  {/if}

  {#if context_menu_state}
    <button
      type="button"
      class="context-menu-backdrop"
      onclick={() => (context_menu_state = null)}
      oncontextmenu={(event) => {
        event.preventDefault()
        context_menu_state = null
      }}
      aria-label="Close context menu"
      tabindex="-1"
    >
    </button>
    <menu
      class="context-menu"
      style="left: {clamp(
        context_menu_state.x,
        0,
        Math.max(0, window.innerWidth - 180),
      )}px; top: {clamp(
        context_menu_state.y,
        0,
        Math.max(0, window.innerHeight - 200),
      )}px"
    >
      {#each context_menu_items as item, idx (idx)}
        <li class={{ separator: !item }}>
          {#if item}
            <button
              type="button"
              onclick={() => {
                item.action()
                context_menu_state = null
              }}
            >
              {#if item.icon}<Icon
                  icon={item.icon}
                  style="width: 12px; height: 12px"
                />{/if}
              {item.label}
            </button>
          {/if}
        </li>
      {/each}
    </menu>
  {/if}
</div>

<style>
  ::highlight(json-tree-search-match) {
    background: var(--jt-search-match-bg, light-dark(#fff59d, #614d00));
    color: inherit;
  }
  .json-tree {
    /* Color variables with light-dark() for automatic theme support */
    --jt-string: light-dark(#a31515, #ce9178);
    --jt-number: light-dark(#098658, #b5cea8);
    --jt-boolean: light-dark(#0000ff, #569cd6);
    --jt-null: light-dark(#808080, #808080);
    --jt-key: light-dark(#001080, #9cdcfe);
    --jt-punctuation: light-dark(#000000, #d4d4d4);
    --jt-arrow: light-dark(#6e6e6e, #858585);
    --jt-preview: light-dark(#808080, #808080);
    --jt-search-match-bg: light-dark(#fff59d, #614d00);
    --jt-current-match-bg: light-dark(#ffcc80, #8a5600);
    --jt-change-flash: light-dark(#c8e6c9, #1b5e20);
    --jt-focus-bg: light-dark(#e3f2fd, #0d3a58);
    --jt-hover-bg: light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.08));
    --jt-indent-guide: light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1));
    --jt-header-bg: light-dark(rgba(0, 0, 0, 0.03), rgba(255, 255, 255, 0.05));
    --jt-header-border: light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1));
    /* Layout variables */
    --jt-indent: 1.2em;
    --jt-line-height: 1.5;
    --jt-font-size: 13px;
    --jt-font-family: 'SF Mono', Monaco, 'Courier New', monospace;
    font-family: var(--jt-font-family);
    font-size: var(--jt-font-size);
    line-height: var(--jt-line-height);
    position: relative;
    background: var(--jt-bg, transparent);
    border-radius: var(--jt-border-radius, 4px);
    overflow: hidden;
  }
  /* Shared reset for every button in the tree, incl. those rendered by JsonNode/JsonValue.
     Specificity (0,1,1): outranks DraggablePane's :where(button) when nested in a pane, yet
     loses to the (0,2,0) per-class rules below and in JsonNode/JsonValue. */
  :global(.json-tree button) {
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .json-tree-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    flex-wrap: wrap;
  }
  .search-wrapper {
    display: flex;
    align-items: center;
    gap: 4px;
    flex: 1;
    min-width: 150px;
    max-width: 300px;
    background: var(--jt-search-bg, light-dark(white, rgba(0, 0, 0, 0.2)));
    border: 1px solid
      var(--jt-search-border, light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.15)));
    border-radius: 4px;
    padding: 2px 6px;
  }
  .search-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 12px;
    padding: 2px;
    outline: none;
    color: inherit;
    &::placeholder {
      color: var(--jt-placeholder, light-dark(#999, #666));
    }
  }
  .clear-search,
  .nav-btn,
  .controls button {
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 3px;
    opacity: 0.6;
    transition:
      opacity 0.15s,
      background 0.15s;
    &:hover,
    &.active {
      opacity: 1;
    }
    &:hover {
      background: var(--jt-hover-bg);
    }
  }
  .clear-search {
    padding: 2px;
  }
  .nav-btn {
    width: 20px;
    height: 20px;
  }
  .controls {
    display: flex;
    gap: 2px;
    button {
      min-width: 24px;
      height: 24px;
      padding: 2px 6px;
      font-size: 11px;
      font-weight: 500;
    }
  }
  .divider {
    width: 1px;
    height: 16px;
    background: var(--jt-header-border);
    margin: 0 4px;
    align-self: center;
  }
  /* touch: 20-24px header buttons are under the finger-target floor, and iOS Safari zooms
     the page when a focused input's font is below 16px */
  @media (pointer: coarse) {
    .nav-btn,
    .clear-search,
    .controls button {
      min-width: 2rem;
      min-height: 2rem;
    }
    .search-input {
      font-size: 16px;
    }
  }
  .match-nav {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .match-count {
    font-size: 11px;
    color: var(--jt-match-count-color, light-dark(#666, #aaa));
    white-space: nowrap;
    margin-left: 4px;
  }
  .path-breadcrumb,
  .pinned-panel {
    padding: 4px 8px;
    background: var(--jt-header-bg);
    border-bottom: 1px solid var(--jt-header-border);
    font-size: 11px;
    overflow: hidden;
  }
  .copy-path-btn,
  .pinned-path {
    color: var(--jt-key);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    &:hover {
      text-decoration: underline;
    }
  }
  .copy-path-btn {
    display: block;
    padding: 2px 4px;
    border-radius: 2px;
    &:hover {
      background: var(--jt-hover-bg);
    }
  }
  .json-tree-content {
    padding: var(--jt-content-padding, 8px);
    overflow: auto;
    max-height: var(--jt-max-height, none);
  }
  .copy-feedback {
    position: fixed;
    background: var(--success-color, #10b981);
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    animation: fade-in-out 1s ease-out forwards;
    pointer-events: none;
    z-index: 1002;
    white-space: nowrap;
    &.error {
      background: var(--error-color, #ef4444);
    }
  }
  @keyframes fade-in-out {
    0% {
      opacity: 0;
      transform: translateY(-4px);
    }
    15% {
      opacity: 1;
      transform: translateY(0);
    }
    85% {
      opacity: 1;
    }
    100% {
      opacity: 0;
    }
  }
  .context-menu-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
    cursor: default;
  }
  .context-menu {
    position: fixed;
    z-index: 1001;
    background: var(--jt-ctx-bg, light-dark(white, #2d2d2d));
    border: 1px solid
      var(--jt-ctx-border, light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.15)));
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    padding: 4px 0;
    min-width: 160px;
    font-size: 12px;
    list-style: none;
    margin: 0;
    button {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 6px 12px;
      text-align: left;
      &:hover {
        background: var(
          --jt-ctx-hover,
          light-dark(rgba(0, 0, 0, 0.06), rgba(255, 255, 255, 0.1))
        );
      }
    }
    .separator {
      height: 1px;
      margin: 4px 8px;
      background: var(
        --jt-ctx-border,
        light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1))
      );
    }
  }
  .pinned-panel {
    max-height: 120px;
    overflow-y: auto;
  }
  .pinned-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 0;
    font-weight: 500;
    opacity: 0.7;
  }
  .pinned-clear-btn {
    font-size: 10px;
    opacity: 0.6;
    padding: 1px 4px;
    &:hover {
      opacity: 1;
      text-decoration: underline;
    }
  }
  .pinned-item {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 4px;
    border-radius: 2px;
    &:hover {
      background: var(--jt-hover-bg);
    }
  }
  .pinned-path {
    max-width: 200px;
  }
  .pinned-value {
    color: var(--jt-preview);
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1;
  }
  .unpin-btn {
    padding: 0 2px;
    opacity: 0.5;
    font-size: 10px;
    &:hover {
      opacity: 1;
    }
  }
</style>
