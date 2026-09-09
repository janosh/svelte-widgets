## TreeView

Navigate hierarchical data with stable node IDs, lazy loading and keyboard selection. Use [JsonTree](json-tree) when your input is an object to inspect rather than a hierarchy of named nodes.

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
| `onselect(node)`                 | Receive the selected node; disabled nodes cannot be selected or expanded.                                          |
| `children(node)`                 | Customize the label without replacing the row's selection and expansion behavior.                                  |
| `label`                          | Accessible tree name; defaults to `Tree`. Other HTML attributes apply to the outer wrapper.                        |

### Keyboard behavior

Tab enters the tree at its active row. Up/Down move through visible rows; Home/End reach the first/last. Right expands a branch or enters its first child; Left collapses it or moves to its parent. Enter/Space selects. Typing a character focuses the next visible label starting with that character. Moving focus does not select a node.
