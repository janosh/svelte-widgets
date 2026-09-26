<script lang="ts">
  import Icon from '$lib/Icon.svelte'
  import { FileTree, ListChecks, Refresh, BookOpen, Keyboard } from '$lib/icons'
</script>

## <Icon icon={FileTree} class="heading-icon" aria-hidden="true" /> TreeView

Navigate hierarchical data with stable node IDs, lazy loading and single or multiple selection. Use [JsonTree](json-tree) when your input is an object to inspect rather than a hierarchy of named nodes.

### Minimal example

Bind `value` to a node ID and `expanded` to a set of branch IDs. Clicking a label selects it; its caret or Enter independently expands or collapses the branch.

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
  let selected = $state<string | null>(null)
  let expanded = $state(new Set([`project`]))
</script>

<TreeView {nodes} bind:value={selected} bind:expanded label="Project files" />
<p>Selected: {selected ?? `None`}</p>
```

### <Icon icon={ListChecks} class="heading-icon" aria-hidden="true" /> Multiple selection

Set `mode="multiple"` and bind `value` to an array of IDs. An ordinary click selects one node; Ctrl/Cmd-click or Space toggles its selection. Enter expands or collapses a branch and selects a leaf. Shift-click, Shift+Space and Shift+Up/Down/Home/End select a range over visible rows. Ctrl/Cmd with Shift adds the range to the existing selection. Ctrl/Cmd+A adds all visible, enabled rows. Arrow navigation alone only moves focus.

Disabled rows can receive focus but cannot be selected or expanded, and ranges skip them. Collapsing a branch preserves selected descendants; replacing a selection with a visible range excludes hidden descendants. If the range anchor disappears, the next range starts at its destination. Replace `value` when updating it externally; `on_change(value)` receives a fresh array after each selection gesture, including deselection and select-all.

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
  let selected_ids = $state<string[]>([])
  let expanded = $state(new Set([`source`]))
</script>

<TreeView
  {nodes}
  mode="multiple"
  bind:value={selected_ids}
  bind:expanded
  label="Files for batch actions"
/>
<p>Selected: {selected_ids.join(`, `) || `None`}</p>
<button onclick={() => (selected_ids = [])}>Clear selection</button>
```

### <Icon icon={Refresh} class="heading-icon" aria-hidden="true" /> Lazy branches, failure and retry

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

### <Icon icon={BookOpen} class="heading-icon" aria-hidden="true" /> Main API

| Prop                            | Purpose                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `nodes: readonly TreeNode[]`    | Each node needs a globally unique `id` and a `label`; optionally provide `children`, `load(signal)` or `disabled`.         |
| `bind:expanded`, `bind:value`   | Control expanded branch IDs and the selected ID. Replace the set when updating it externally.                              |
| `mode="multiple"`, `bind:value` | Select multiple IDs through an array; single mode uses one ID or null.                                                     |
| `on_select(node)`               | Receive an individually selected node; deselection and select-all only notify `on_change`.                                 |
| `on_change(value)`              | Receive the selected ID or complete selection array after a gesture, including selected descendants of collapsed branches. |
| `children(node)`                | Customize the label without replacing the row's selection and expansion behavior.                                          |
| `label`                         | Accessible tree name; defaults to `Tree`. Other HTML attributes apply to the outer wrapper.                                |

### <Icon icon={Keyboard} class="heading-icon" aria-hidden="true" /> Keyboard behavior

Tab enters the tree at its active row. Up/Down move through visible rows; Home/End reach the first/last. Right expands a branch or enters its first child; Left collapses it or moves to its parent. Enter toggles a branch without changing selection, or selects a leaf. Space selects the focused row (toggles its selection in multiple mode). Typing a character focuses the next visible label starting with that character. Moving focus does not select a node.
