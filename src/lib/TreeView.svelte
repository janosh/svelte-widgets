<script lang="ts">
  import type { SelectionProps, TreeNode } from './types'
  import { selection_values } from './internal/selection'
  import { tick, type Snippet } from 'svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import type { HTMLAttributes } from 'svelte/elements'
  import { is_editable_event_target, is_modifier_chord } from './utils'

  let {
    nodes,
    expanded = $bindable(new Set<string>()),
    value = $bindable(),
    mode = `single`,
    on_select,
    on_change,
    children,
    label = `Tree`,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    nodes: readonly TreeNode[]
    expanded?: Set<string>
    on_select?: (node: TreeNode) => void
    children?: Snippet<[TreeNode]>
    label?: string
  } & SelectionProps<string> = $props()
  const multiple = $derived(mode === `multiple`)
  const selected_ids = $derived(new Set(selection_values(mode, value)))
  let focused = $state<string>()
  let selection_anchor: string | undefined
  const node_elements = new Map<string, HTMLElement>()
  const range_keys = new Set([`ArrowDown`, `ArrowUp`, `Home`, `End`])
  const branches = new SvelteMap<TreeNode, AbortController | readonly TreeNode[]>()
  let error = $state(``)
  $effect(() => {
    // A replacement tree owns fresh requests, even when it reuses node IDs.
    void nodes
    return () => {
      for (const branch of branches.values())
        if (branch instanceof AbortController) branch.abort()
      branches.clear()
    }
  })
  type Row = {
    node: TreeNode
    depth: number
    parent?: string
    pos: number
    size: number
    expandable: boolean
  }
  const tree = $derived.by(() => {
    const result: Row[] = []
    const indices = new Map<string, number>()
    const visit = (siblings: readonly TreeNode[], depth: number, parent?: string) => {
      siblings.forEach((node, idx) => {
        if (indices.has(node.id))
          throw new Error(`TreeView requires unique node ids, duplicate ${node.id}`)
        indices.set(node.id, result.length)
        const branch = branches.get(node)
        const descendants =
          node.children ?? (branch instanceof AbortController ? undefined : branch)
        result.push({
          node,
          depth,
          parent,
          pos: idx + 1,
          size: siblings.length,
          expandable: Boolean(descendants?.length || (node.load && !descendants)),
        })
        if (expanded.has(node.id) && descendants) visit(descendants, depth + 1, node.id)
      })
    }
    visit(nodes, 1)
    return { rows: result, indices }
  })
  const rows = $derived(tree.rows)
  // Bindable initial expansion can request children before the first interaction.
  $effect(() => {
    for (const { node } of rows) {
      if (expanded.has(node.id)) void expand(node)
    }
  })
  const is_selected = (node: TreeNode): boolean | undefined =>
    node.disabled ? undefined : selected_ids.has(node.id)
  const active_id = $derived(
    focused !== undefined && tree.indices.has(focused)
      ? focused
      : (rows.find(({ node }) => is_selected(node))?.node.id ?? rows[0]?.node.id),
  )
  async function expand(node: TreeNode): Promise<void> {
    if (node.disabled) return
    if (!expanded.has(node.id)) expanded = new Set(expanded).add(node.id)
    if (!node.load || node.children || branches.has(node)) return
    const controller = new AbortController()
    branches.set(node, controller)
    error = ``
    try {
      const descendants = await node.load(controller.signal)
      if (!controller.signal.aborted) branches.set(node, descendants)
    } catch (cause) {
      if (!controller.signal.aborted) {
        error = `Could not load ${node.label}: ${String(cause)}`
        collapse(node.id)
        branches.delete(node)
      }
    }
  }
  const collapse = (id: string) => {
    expanded = new Set([...expanded].filter((entry) => entry !== id))
  }
  const toggle_expanded = (node: TreeNode): void => {
    if (node.disabled) return
    if (expanded.has(node.id)) collapse(node.id)
    else void expand(node)
  }
  async function focus_node(id: string | undefined): Promise<void> {
    if (id === undefined) return
    focused = id
    await tick()
    node_elements.get(id)?.focus()
  }
  const update_selection = (next_value: string | string[]) => {
    value = next_value
    ;(on_change as ((value: string | string[] | null) => void) | undefined)?.(next_value)
  }
  const select = (node: TreeNode, range = false, toggle = false) => {
    // A range may end on a disabled row; only its enabled members are selected.
    if (node.disabled && (!multiple || !range)) return
    if (!multiple) {
      update_selection(node.id)
      on_select?.(node)
      return
    }
    const ids = toggle ? new Set(selected_ids) : new Set<string>()
    if (range) {
      const end = tree.indices.get(node.id)
      const start = tree.indices.get(selection_anchor ?? active_id ?? node.id) ?? end
      if (start === undefined || end === undefined) return
      selection_anchor = rows[start].node.id
      for (const { node: entry } of rows.slice(
        Math.min(start, end),
        Math.max(start, end) + 1,
      )) {
        if (!entry.disabled) ids.add(entry.id)
      }
    } else {
      selection_anchor = node.id
      if (toggle && ids.has(node.id)) ids.delete(node.id)
      else ids.add(node.id)
    }
    update_selection([...ids])
    if (ids.has(node.id)) on_select?.(node)
  }
  function keydown(event: KeyboardEvent): void {
    if (is_editable_event_target(event.target) || event.altKey) return
    if (!multiple && is_modifier_chord(event)) return
    const toggle = event.ctrlKey || event.metaKey
    if (multiple && toggle && event.key.toLowerCase() === `a`) {
      const ids = new Set(selected_ids)
      for (const { node } of rows) if (!node.disabled) ids.add(node.id)
      update_selection([...ids])
      event.preventDefault()
      return
    }
    if (
      toggle &&
      !range_keys.has(event.key) &&
      event.key !== ` ` &&
      event.key !== `Enter`
    )
      return
    const idx = active_id === undefined ? -1 : (tree.indices.get(active_id) ?? -1)
    const row = rows[idx]
    if (!row) return
    const { node, expandable, parent } = row
    let next: TreeNode | undefined
    if (event.key === `ArrowDown`) next = rows[Math.min(idx + 1, rows.length - 1)].node
    else if (event.key === `ArrowUp`) next = rows[Math.max(0, idx - 1)].node
    else if (event.key === `Home`) next = rows[0]?.node
    else if (event.key === `End`) next = rows.at(-1)?.node
    else if (event.key === `ArrowRight` && expandable) {
      if (!expanded.has(node.id)) void expand(node)
      else if (rows[idx + 1]?.parent === node.id) next = rows[idx + 1].node
    } else if (event.key === `ArrowLeft`) {
      if (expanded.has(node.id)) collapse(node.id)
      else if (parent !== undefined) next = rows[tree.indices.get(parent) ?? -1]?.node
    } else if (event.key === `Enter` && expandable && !event.shiftKey && !toggle) {
      toggle_expanded(node)
    } else if (event.key === `Enter` || event.key === ` `) {
      select(node, event.shiftKey, toggle || (event.key === ` ` && !event.shiftKey))
    } else if (event.key.length === 1) {
      const prefix = event.key.toLocaleLowerCase()
      for (let offset = 1; offset <= rows.length; offset++) {
        const entry = rows[(idx + offset) % rows.length].node
        if (entry.label.toLocaleLowerCase().startsWith(prefix)) {
          next = entry
          break
        }
      }
    } else return
    event.preventDefault()
    if (multiple && event.shiftKey && range_keys.has(event.key) && next)
      select(next, true, toggle)
    void focus_node(next?.id)
  }
</script>

<div {...rest} class={[`tree-view`, rest.class]}>
  <div
    role="tree"
    tabindex="-1"
    aria-label={label}
    aria-multiselectable={multiple || undefined}
    onkeydown={keydown}
  >
    {#each rows as { node, depth, pos, size, expandable } (node.id)}
      <div
        role="treeitem"
        aria-label={node.label}
        data-tree-id={node.id}
        {@attach (element) => {
          const { id } = node
          node_elements.set(id, element)
          return () => node_elements.delete(id)
        }}
        aria-level={depth}
        aria-posinset={pos}
        aria-setsize={size}
        aria-expanded={expandable ? expanded.has(node.id) : undefined}
        aria-selected={is_selected(node)}
        aria-disabled={node.disabled}
        aria-busy={branches.get(node) instanceof AbortController}
        tabindex={active_id === node.id ? 0 : -1}
        style:padding-inline-start={`${(depth - 1) * 1.25}em`}
        onfocus={() => {
          focused = node.id
        }}
        onpointerdown={(event) => {
          // Pointer default focus runs before click; retain the prior row for a first range.
          if (multiple && event.shiftKey && selection_anchor === undefined)
            selection_anchor = active_id
        }}
        onclick={(event) => {
          select(node, event.shiftKey, event.ctrlKey || event.metaKey)
          void focus_node(node.id)
        }}
        onkeydown={() => {}}
      >
        {#if expandable}<button
            type="button"
            tabindex="-1"
            disabled={node.disabled}
            aria-label={`${expanded.has(node.id) ? `Collapse` : `Expand`} ${node.label}`}
            onclick={(event) => {
              event.stopPropagation()
              void focus_node(node.id)
              toggle_expanded(node)
            }}>{expanded.has(node.id) ? `▾` : `▸`}</button
          >{:else}<span aria-hidden="true" style="width: 1.5em"></span>{/if}
        {#if children}{@render children(node)}{:else}{node.label}{/if}
      </div>
    {/each}
  </div>
  <div role="status">{error}</div>
</div>

<style>
  [role='treeitem'] {
    display: flex;
    align-items: center;
    cursor: pointer;
    &[aria-selected='true'] {
      background: color-mix(in srgb, currentColor 12%, transparent);
    }
    &[aria-disabled='true'] {
      opacity: 0.5;
    }
    button {
      width: 1.5em;
      font: inherit;
      color: inherit;
      background: none;
      border: none;
      padding: 0;
    }
  }
</style>
