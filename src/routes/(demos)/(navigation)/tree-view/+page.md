## TreeView

Navigate hierarchical data with stable node IDs, lazy loading and single or multiple selection. Use [JsonTree](json-tree) when your input is an object to inspect rather than a hierarchy of named nodes.

### Minimal example

Bind `selected` to a node ID and `expanded` to a set of branch IDs. Clicking a label selects it; its caret independently expands or collapses the branch.

```svelte example id="tree-view-basic"
<script lang="ts">
  import { TreeView, type TreeNode } from 'svelte-widgets'

  const nodes: TreeNode[] = [
    {
      id: `project`,
      label: `Project`,
      children: [
        { id: `readme`, label: `README.md` },
        { id: `source`, label: `src`, children: [{ id: `app`, label: `App.svelte` }] },
      ],
    },
  ]
  let selected = $state<string>()
  let expanded = $state(new Set([`project`]))
</script>

<TreeView {nodes} bind:selected bind:expanded label="Project files" />
<p>Selected: {selected ?? `None`}</p>
```

### Multiple selection

Set `multiple` and bind `selected_ids` to a set of IDs. An ordinary click or Enter selects one node; Ctrl/Cmd-click or Space toggles it. Shift-click, Shift+Space and Shift+Up/Down/Home/End select a range over visible rows. Ctrl/Cmd with Shift adds the range to the existing selection. Ctrl/Cmd+A adds all visible, enabled rows. Arrow navigation alone only moves focus.

Disabled rows can receive focus but cannot be selected or expanded, and ranges skip them. Collapsing a branch preserves selected descendants; replacing a selection with a visible range excludes hidden descendants. If the range anchor disappears, the next range starts at its destination. Replace `selected_ids` when updating it externally; `on_selection_change(ids)` receives a fresh set after each selection gesture, including deselection and select-all.

```svelte example id="tree-view-multiple"
<script lang="ts">
  import { TreeView, type TreeNode } from 'svelte-widgets'

  const nodes: TreeNode[] = [
    {
      id: `source`,
      label: `src`,
      children: [
        { id: `app`, label: `App.svelte` },
        { id: `config`, label: `config.ts`, disabled: true },
        { id: `theme`, label: `theme.css` },
      ],
    },
    { id: `readme`, label: `README.md` },
  ]
  let selected_ids = $state(new Set<string>())
  let expanded = $state(new Set([`source`]))
</script>

<TreeView
  {nodes}
  multiple
  bind:selected_ids
  bind:expanded
  label="Files for batch actions"
/>
<p>Selected: {[...selected_ids].join(`, `) || `None`}</p>
<button
  onclick={() => {
    selected_ids = new Set()
  }}>Clear selection</button
>
```

### Lazy branches, failure and retry

`load(signal)` runs when a branch first expands. Loaded children are cached for that node object; replacing `nodes` clears the cache and aborts outstanding requests. Failed branches collapse and announce the error. Expand again to retry. This example simulates a slow source; toggle failure before expanding Remote files.

```svelte example id="tree-view-loading"
<script lang="ts">
  import { TreeView, type TreeNode } from 'svelte-widgets'

  let fail = $state(true)
  const nodes: TreeNode[] = [
    {
      id: `remote`,
      label: `Remote files`,
      load: async (signal) => {
        await new Promise<void>((resolve) => setTimeout(resolve, 500))
        signal.throwIfAborted()
        if (fail) throw new Error(`Example source is unavailable`)
        return [{ id: `report`, label: `report.json` }]
      },
    },
  ]
</script>

<label><input type="checkbox" bind:checked={fail} /> Simulate load failure</label>
<TreeView {nodes} label="Remote files">
  {#snippet children(node)}
    <code>{node.label}</code>
  {/snippet}
</TreeView>

<style>
  :global([aria-label='Remote files'] [aria-busy='true'])::after {
    content: 'Loading…';
    margin-inline-start: 0.5em;
  }
</style>
```

For HTTP loaders, pass `signal` to `fetch`, check `response.ok`, and validate the returned nodes. Collapsing a branch leaves its request running; replacing the tree or unmounting cancels it. A loader returning `[]` produces a leaf. For an entirely empty tree, render your own message instead of `<TreeView nodes={[]} />`.

### Main API

| Prop                             | Purpose                                                                                                            |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `nodes: readonly TreeNode[]`     | Each node needs a globally unique `id` and a `label`; optionally provide `children`, `load(signal)` or `disabled`. |
| `bind:expanded`, `bind:selected` | Control expanded branch IDs and the selected ID. Replace the set when updating it externally.                      |
| `multiple`, `bind:selected_ids`  | Enable multiple selection and control its IDs; `selected` is only used in single-selection mode.                   |
| `on_select(node)`                | Receive an individually selected node; deselection and select-all only notify `on_selection_change`.               |
| `on_selection_change(ids)`       | Receive the complete multiple-selection set after a gesture, including selected descendants of collapsed branches. |
| `children(node)`                 | Customize the label without replacing the row's selection and expansion behavior.                                  |
| `label`                          | Accessible tree name; defaults to `Tree`. Other HTML attributes apply to the outer wrapper.                        |

### Keyboard behavior

Tab enters the tree at its active row. Up/Down move through visible rows; Home/End reach the first/last. Right expands a branch or enters its first child; Left collapses it or moves to its parent. Enter/Space selects. Typing a character focuses the next visible label starting with that character. Moving focus does not select a node.
