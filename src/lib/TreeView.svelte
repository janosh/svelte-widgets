<script lang="ts">
  import type { TreeNode } from './types'
  import { tick, type Snippet } from 'svelte'
  import { SvelteMap } from 'svelte/reactivity'
  import type { HTMLAttributes } from 'svelte/elements'
  import { is_editable_event_target, is_modifier_chord } from './utils'

  let {
    nodes,
    expanded = $bindable(new Set<string>()),
    selected = $bindable(),
    onselect,
    children,
    label = `Tree`,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    nodes: readonly TreeNode[]
    expanded?: Set<string>
    selected?: string
    onselect?: (node: TreeNode) => void
    children?: Snippet<[TreeNode]>
    label?: string
  } = $props()
  let root = $state<HTMLDivElement>()
  let focused = $state<string>()
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
  const rows = $derived.by(() => {
    const result: Row[] = []
    const seen = new Set<string>()
    const visit = (siblings: readonly TreeNode[], depth: number, parent?: string) => {
      siblings.forEach((node, idx) => {
        if (seen.has(node.id))
          throw new Error(`TreeView requires unique node ids, duplicate ${node.id}`)
        seen.add(node.id)
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
    return result
  })
  // Bindable initial expansion can request children before the first interaction.
  $effect(() => {
    for (const { node } of rows) {
      if (expanded.has(node.id)) void expand(node)
    }
  })
  const active_id = $derived(
    rows.some(({ node }) => node.id === focused) ? focused : rows[0]?.node.id,
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
    expanded = new Set([...expanded].filter((value) => value !== id))
  }
  async function focus_node(id: string | undefined): Promise<void> {
    if (id === undefined) return
    focused = id
    await tick()
    root?.querySelector<HTMLElement>(`[data-tree-id="${CSS.escape(id)}"]`)?.focus()
  }
  const select = (node: TreeNode) => {
    if (node.disabled) return
    selected = node.id
    onselect?.(node)
  }
  function keydown(event: KeyboardEvent): void {
    if (is_editable_event_target(event.target) || is_modifier_chord(event)) return
    const idx = rows.findIndex(({ node }) => node.id === active_id)
    const row = rows[idx]
    if (!row) return
    const { node, expandable, parent } = row
    let next: string | undefined
    if (event.key === `ArrowDown`) next = rows[Math.min(idx + 1, rows.length - 1)].node.id
    else if (event.key === `ArrowUp`) next = rows[Math.max(0, idx - 1)].node.id
    else if (event.key === `Home`) next = rows[0]?.node.id
    else if (event.key === `End`) next = rows.at(-1)?.node.id
    else if (event.key === `ArrowRight` && expandable) {
      if (!expanded.has(node.id)) void expand(node)
      else if (rows[idx + 1]?.parent === node.id) next = rows[idx + 1].node.id
    } else if (event.key === `ArrowLeft`) {
      if (expanded.has(node.id)) collapse(node.id)
      else next = parent
    } else if (event.key === `Enter` || event.key === ` `) select(node)
    else if (event.key.length === 1) {
      const ordered = [...rows.slice(idx + 1), ...rows.slice(0, idx + 1)]
      next = ordered.find(({ node: entry }) =>
        entry.label.toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase()),
      )?.node.id
    } else return
    event.preventDefault()
    void focus_node(next)
  }
</script>

<div {...rest} class={[`tree-view`, rest.class]}>
  <div bind:this={root} role="tree" tabindex="-1" aria-label={label} onkeydown={keydown}>
    {#each rows as { node, depth, pos, size, expandable } (node.id)}
      <div
        role="treeitem"
        data-tree-id={node.id}
        aria-level={depth}
        aria-posinset={pos}
        aria-setsize={size}
        aria-expanded={expandable ? expanded.has(node.id) : undefined}
        aria-selected={selected === node.id}
        aria-disabled={node.disabled}
        aria-busy={branches.get(node) instanceof AbortController}
        tabindex={active_id === node.id ? 0 : -1}
        style:padding-inline-start={`${(depth - 1) * 1.25}em`}
        onfocus={() => {
          focused = node.id
        }}
        onclick={() => {
          void focus_node(node.id)
          select(node)
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
              if (expanded.has(node.id)) collapse(node.id)
              else void expand(node)
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
