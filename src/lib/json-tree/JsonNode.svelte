<script lang="ts">
  import { build_path } from './path'
  import { format_bytes } from './helpers'
  // oxlint-disable-next-line import/no-self-import -- recursive Svelte component
  import JsonNode from './JsonNode.svelte'
  import JsonValue from './JsonValue.svelte'
  import { get_json_tree_context } from './types'
  import {
    estimate_byte_size,
    format_preview,
    get_child_count,
    get_children,
    get_value_type,
    is_expandable_type,
  } from './utils'

  // Children mount in pages: a 50k-entry container would otherwise render 50k rows (and
  // their DOM) the moment it is expanded. The bound is per node and grows on demand.
  const CHILD_PAGE_SIZE = 100

  let {
    node_key = null,
    value,
    path,
    depth,
    is_last = true,
  }: {
    node_key?: string | number | null
    value: unknown
    path: string
    depth: number
    is_last?: boolean
  } = $props()

  const ctx = get_json_tree_context()

  const value_type = $derived(get_value_type(value))
  const expandable = $derived(is_expandable_type(value_type))

  // Explicit collapse/expand wins, then the depth fold level, then the size thresholds
  const is_collapsed = $derived.by(() => {
    if (!expandable) return false
    if (ctx.collapsed.has(path)) return true
    if (ctx.force_expanded.has(path)) return false
    const { default_fold_level, auto_fold_arrays, auto_fold_objects } = ctx.settings
    if (depth >= default_fold_level) return true
    if (value_type === `array`) return get_child_count(value) > auto_fold_arrays
    if (value_type === `object`) return get_child_count(value) > auto_fold_objects
    return false
  })

  // Search highlighting is handled by the CSS Highlight API in JsonTree.svelte
  const is_focused = $derived(ctx.focused_path === path)
  const is_current_match = $derived(ctx.current_match_path === path)
  const is_selected = $derived(ctx.selected_paths.has(path))
  const diff_status = $derived(ctx.diff_map?.get(path)?.status ?? null)

  function toggle_collapse(event?: MouseEvent) {
    event?.stopPropagation()
    if (expandable) ctx.toggle_collapse(path, is_collapsed)
  }

  // Double-click toggles the whole subtree (collapsed expands all, and vice versa)
  function toggle_collapse_recursive(event: MouseEvent) {
    event.stopPropagation()
    if (expandable) ctx.toggle_collapse_recursive(path, !is_collapsed)
  }

  const children = $derived(expandable ? get_children(value, ctx.settings.sort_keys) : [])
  let shown_count = $state(CHILD_PAGE_SIZE)
  // The current search match (or the ancestor holding it) may sit past the bound: extend it
  // to that child so JsonTree can scroll the match into view
  const revealed_count = $derived.by(() => {
    const match = ctx.current_match_path
    if (!match || children.length <= shown_count || !match.startsWith(path))
      return shown_count
    const idx = children.findIndex(({ key }) => {
      const child_path = build_path(path, key)
      return (
        match === child_path ||
        match.startsWith(`${child_path}.`) ||
        match.startsWith(`${child_path}[`)
      )
    })
    return idx === -1 ? shown_count : Math.max(shown_count, idx + 1)
  })
  const visible_children = $derived(children.slice(0, revealed_count))
  const hidden_count = $derived(children.length - visible_children.length)

  // Removed entries from the diff (pre-computed in JsonTree) not shadowed by a live child
  const ghost_children = $derived.by(() => {
    if (!expandable || is_collapsed) return []
    const all_ghosts = ctx.ghost_map.get(path) ?? []
    if (all_ghosts.length === 0) return []
    const existing_keys = new Set(children.map((child) => String(child.key)))
    return all_ghosts.filter((ghost) => !existing_keys.has(String(ghost.key)))
  })

  // Expanded shallow nodes keep their header visible while scrolling through children
  const is_sticky = $derived(expandable && !is_collapsed && depth <= 2)
  const [open_bracket, close_bracket] = $derived(
    value_type === `array` ? [`[`, `]`] : [`{`, `}`],
  )

  // Middle-click copies the path (stopped so ancestor rows don't overwrite the clipboard)
  function copy_path_on_middle_click(event: MouseEvent) {
    if (event.button !== 1) return
    event.preventDefault()
    event.stopPropagation()
    ctx.copy_path(path, event)
  }

  function handle_keydown(event: KeyboardEvent) {
    if (!is_focused) return
    if (event.key === `Enter` || event.key === ` `) {
      event.preventDefault()
      if (expandable) toggle_collapse()
      else ctx.copy_value(path, value)
    } else if (event.key === `ArrowRight`) {
      event.preventDefault()
      if (expandable && is_collapsed) toggle_collapse()
    } else if (event.key === `ArrowLeft`) {
      event.preventDefault()
      if (expandable && !is_collapsed) toggle_collapse()
    } else if (event.key.toLowerCase() === `c` && (event.ctrlKey || event.metaKey)) {
      // When nodes are selected, let the tree-level handler do bulk copy
      if (ctx.selected_paths.size) return
      event.preventDefault()
      event.stopPropagation()
      ctx.copy_value(path, value)
    }
  }
</script>

<div
  class="json-node"
  class:collapsed={is_collapsed}
  class:expandable
  class:focused={is_focused}
  class:selected={is_selected}
  class:current-match={is_current_match}
  class:diff-added={diff_status === `added`}
  class:diff-removed={diff_status === `removed`}
  class:diff-changed={diff_status === `changed`}
  class:sticky-header={is_sticky}
  style:--jt-sticky-depth={is_sticky ? depth : undefined}
  data-path={path}
  role="treeitem"
  aria-expanded={expandable ? !is_collapsed : undefined}
  aria-selected={is_selected}
  tabindex={is_focused ? 0 : -1}
  onclick={(event) => {
    event.stopPropagation() // ancestors would otherwise re-focus/select themselves
    if (event.ctrlKey || event.metaKey) ctx.toggle_select(path, event.shiftKey)
    else ctx.set_focused(path)
  }}
  onauxclick={copy_path_on_middle_click}
  oncontextmenu={(event) => {
    ctx.show_context_menu(event, path, value, expandable, is_collapsed)
  }}
  ondblclick={toggle_collapse_recursive}
  onkeydown={handle_keydown}
>
  <span class="node-content">
    {#if expandable}
      <button
        type="button"
        class="collapse-toggle"
        onclick={toggle_collapse}
        aria-label={is_collapsed ? `Expand` : `Collapse`}
      >
        <span class="arrow" class:collapsed={is_collapsed}>▼</span>
      </button>
    {:else}
      <span class="no-toggle"></span>
    {/if}

    {#if node_key !== null}
      <button
        type="button"
        class={[
          `node-key`,
          {
            'array-index': typeof node_key === `number`,
            collapsed: expandable && is_collapsed,
          },
        ]}
        tabindex="-1"
        onclick={(event) => {
          event.stopPropagation()
          if (event.ctrlKey || event.metaKey) {
            ctx.toggle_select(path, event.shiftKey)
          } else if (event.shiftKey) {
            ctx.copy_path(path, event)
          } else if (expandable && is_collapsed) {
            ctx.toggle_collapse(path, true)
          } else {
            ctx.copy_value(path, value, event)
          }
        }}
        onauxclick={copy_path_on_middle_click}
      >
        {#if typeof node_key === `number` && ctx.settings.show_array_indices}
          <span class="index">{node_key}</span>
        {:else if typeof node_key === `string`}
          "{node_key}"
        {/if}
      </button>
      <span class="colon">:</span>
    {/if}

    {#if expandable}
      <span class="bracket open">{open_bracket}</span>
      {#if is_collapsed}
        <button type="button" class="preview" tabindex="-1" onclick={toggle_collapse}>
          {format_preview(value)}
        </button>
        <span class="size-hint">{format_bytes(estimate_byte_size(value))}</span>
        <span class="bracket close">{close_bracket}</span>
      {/if}
    {:else}
      <JsonValue {value} {value_type} {path} />
    {/if}

    {#if expandable && !is_collapsed}
      <button
        type="button"
        class="collapse-level-btn"
        title="Collapse children to this level"
        tabindex="-1"
        onclick={(event) => {
          event.stopPropagation()
          ctx.collapse_children_only(path)
        }}
      >
        ⊟
      </button>
    {/if}
  </span>

  {#if !is_last && (!expandable || is_collapsed)}
    <span class="comma">,</span>
  {/if}

  {#if expandable && !is_collapsed}
    <div class="children" role="group">
      {#each visible_children as child, idx (child.key)}
        <JsonNode
          node_key={child.key}
          value={child.value}
          path={build_path(path, child.key)}
          depth={depth + 1}
          is_last={idx === children.length - 1 && ghost_children.length === 0}
        />
      {/each}
      {#if hidden_count > 0}
        <div class="more-children">
          <button
            type="button"
            onclick={(event) => {
              event.stopPropagation()
              shown_count = revealed_count + CHILD_PAGE_SIZE
            }}
          >
            Show {Math.min(CHILD_PAGE_SIZE, hidden_count)} more
          </button>
          {#if hidden_count > CHILD_PAGE_SIZE}
            <button
              type="button"
              onclick={(event) => {
                event.stopPropagation()
                shown_count = children.length
              }}
            >
              Show all {children.length}
            </button>
          {/if}
        </div>
      {/if}
      {#each ghost_children as ghost (ghost.key)}
        <div
          class="json-node ghost"
          data-path={ghost.path}
          role="treeitem"
          aria-selected="false"
          aria-disabled="true"
        >
          <span class="node-content">
            <span class="no-toggle"></span>
            <span style="color: var(--jt-key)">
              {#if typeof ghost.key === `number`}
                <span class="index">{ghost.key}</span>
              {:else}
                "{ghost.key}"
              {/if}
            </span>
            <span class="colon">:</span>
            <span style="color: var(--jt-preview); font-style: italic"
              >{format_preview(ghost.value)}</span
            >
          </span>
        </div>
      {/each}
    </div>
    <span class="bracket close">{close_bracket}</span>
    {#if !is_last}
      <span class="comma">,</span>
    {/if}
  {/if}
</div>

<style>
  .json-node {
    font-family: var(--jt-font-family, 'SF Mono', Monaco, 'Courier New', monospace);
    font-size: var(--jt-font-size, 13px);
    line-height: var(--jt-line-height, 1.5);
    outline: none;
    &:focus {
      outline: none;
    }
    &.focused > .node-content {
      background: var(--jt-focus-bg, light-dark(#e3f2fd, #0d3a58));
      border-radius: 2px;
    }
    &.current-match > .node-content {
      background: var(--jt-current-match-bg, light-dark(#ffcc80, #8a5600));
      border-radius: 2px;
    }
    &.selected > .node-content {
      background: var(--jt-select-bg, light-dark(#bbdefb, #0a3050));
    }
    &.diff-added > .node-content {
      background: var(
        --jt-diff-added,
        light-dark(rgba(76, 175, 80, 0.15), rgba(76, 175, 80, 0.2))
      );
    }
    &.diff-removed > .node-content {
      background: var(
        --jt-diff-removed,
        light-dark(rgba(244, 67, 54, 0.12), rgba(244, 67, 54, 0.18))
      );
      text-decoration: line-through;
      opacity: 0.7;
    }
    &.diff-changed > .node-content {
      background: var(
        --jt-diff-changed,
        light-dark(rgba(255, 193, 7, 0.15), rgba(255, 193, 7, 0.2))
      );
    }
    &.sticky-header > .node-content {
      position: sticky;
      top: calc(var(--jt-sticky-depth) * 20px);
      z-index: calc(100 - var(--jt-sticky-depth));
      background: var(--jt-sticky-bg, var(--jt-bg, transparent));
      display: flex;
    }
    &:hover > .node-content > .collapse-level-btn {
      opacity: 0.5;
    }
  }
  .node-content {
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
    padding: 1px 2px;
    border-radius: 2px;
  }
  .ghost .node-content {
    background: var(
      --jt-diff-removed,
      light-dark(rgba(244, 67, 54, 0.12), rgba(244, 67, 54, 0.18))
    );
    text-decoration: line-through;
  }
  .collapse-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1em;
    height: 1em;
    margin: 0;
    color: var(--jt-arrow, light-dark(#6e6e6e, #858585));
    flex-shrink: 0;
    position: relative;
    &:hover {
      color: light-dark(#000, #fff);
    }
    /* the arrow is ~13px; an invisible halo gives fingers a ~23px target while the
       indent stays one em (larger would steal taps from the rows above and below) */
    &::before {
      content: '';
      position: absolute;
      inset: -5px;
    }
  }
  .arrow {
    display: inline-block;
    font-size: 0.7em;
    transition: transform 0.15s ease;
    &.collapsed {
      transform: rotate(-90deg);
    }
  }
  .no-toggle {
    display: inline-block;
    width: 1em;
    flex-shrink: 0;
  }
  .node-key {
    color: var(--jt-key, light-dark(#001080, #9cdcfe));
    /* hover hint: ▸ expands a collapsed node, ⧉ copies an expanded/leaf value */
    &::after {
      content: '⧉';
      opacity: 0;
      font-size: 0.8em;
      margin-left: 2px;
      transition: opacity 0.15s;
      color: var(--jt-arrow, light-dark(#6e6e6e, #858585));
    }
    &.collapsed::after {
      content: '▸';
    }
    &:hover {
      text-decoration: underline;
      &::after {
        opacity: 0.6;
      }
    }
    &.array-index .index {
      color: var(--jt-number, light-dark(#098658, #b5cea8));
    }
  }
  .colon,
  .comma,
  .bracket {
    color: var(--jt-punctuation, light-dark(#000, #d4d4d4));
  }
  .colon {
    margin-right: 4px;
  }
  .preview {
    color: var(--jt-preview, light-dark(#808080, #808080));
    font-style: italic;
    margin: 0 4px;
    &:hover {
      text-decoration: underline;
    }
  }
  .children {
    padding-left: var(--jt-indent, 1.2em);
    border-left: 1px solid
      var(--jt-indent-guide, light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1)));
    margin-left: 0.5em;
  }
  .size-hint {
    font-size: 0.8em;
    color: var(--jt-preview, light-dark(#808080, #808080));
    margin-left: 4px;
    opacity: 0.6;
  }
  .more-children {
    display: flex;
    gap: 8px;
    padding-left: 1em;
    color: var(--jt-preview, light-dark(#808080, #808080));
    font-style: italic;
    button:hover {
      text-decoration: underline;
    }
  }
  .collapse-level-btn {
    opacity: 0;
    padding: 0 2px;
    font-size: 0.85em;
    color: var(--jt-arrow, light-dark(#6e6e6e, #858585));
    transition: opacity 0.15s;
    margin-left: 4px;
    &:hover {
      opacity: 1;
      color: light-dark(#000, #fff);
    }
  }
  .ghost {
    opacity: 0.5;
  }
</style>
