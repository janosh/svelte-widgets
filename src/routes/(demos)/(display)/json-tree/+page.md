## JsonTree

Inspect objects with collapsible paths, search, copying and comparison highlights. `value` is `unknown`: primitives, empty arrays and empty objects render too. Use [TreeView](tree-view) for a named hierarchy with selection and lazy loading.

### Minimal example

Search keys or values in the toolbar, expand a branch, or right-click a row to copy its value/path or pin it. The toolbar also copies or downloads the complete value.

```svelte example id="json-tree-basic"
<script lang="ts">
  import { JsonTree } from 'svelte-widgets'

  const result = {
    name: `Example run`,
    complete: true,
    samples: [12, 18, 21],
    metadata: { author: `Ada`, tags: [] },
  }
</script>

<JsonTree value={result} root_label="result" download_filename="result.json" />
```

### Compact display

`ui` hides the toolbar, selected path, extra node actions or byte-size hints independently (omitted flags default to `true`). Expand/collapse arrows, syntax highlighting and copy shortcuts stay.

```svelte example id="json-tree-compact"
<script lang="ts">
  import { JsonTree } from 'svelte-widgets'

  const config = { optimizer: { name: `FIRE`, max_steps: 500 }, enabled: true }
</script>

<JsonTree
  value={config}
  ui={{ header: false, path: false, node_actions: false, size_hints: false }}
  default_fold_level={Infinity}
/>
```

### Edit and compare

Editing is caller-owned: `on_change(path, new_value, old_value)` reports a proposed leaf change without mutating your data, and `set_at_path(value, path, new_value, root_label?)` returns a copy with that path replaced (pass the viewer's `root_label` if it has one). Below, edits are compared against the original snapshot, which Reset restores.

```svelte example id="json-tree-edit"
<script lang="ts">
  import { JsonTree } from 'svelte-widgets'
  import { set_at_path } from 'svelte-widgets/json-tree'

  const original = { name: `Experiment`, settings: { enabled: true, count: 12 } }
  let value = $state<unknown>(original)
</script>

<button onclick={() => (value = original)}>Reset edits</button>
<JsonTree
  {value}
  compare_value={original}
  editable
  on_change={(path, new_value) => (value = set_at_path(value, path, new_value))}
/>
```

Double-click a leaf to edit; Enter commits and Escape cancels. Edits parse booleans, `null` and finite numbers, leaving other input as text. Validate against a schema in `on_change` before assigning. `compare_value` marks additions, removals and changes; `highlight_changes` (default `true`) separately flashes values that change between renders.

### Main API

| Prop                                              | Purpose                                                                                                                                       |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`, `root_label`                             | Data and optional display label for its root path.                                                                                            |
| `default_fold_level={2}`                          | Initial expansion depth. Arrays longer than `auto_fold_arrays={10}` and objects larger than `auto_fold_objects={20}` also fold automatically. |
| `bind:collapsed_paths`                            | Externally control collapsed paths. Use a reactive set or replace the set when changing it.                                                   |
| `ui`                                              | Toggle `header`, `path`, `node_actions` (fold buttons, copy hints, context menu, pinned panel), and `size_hints`. All default to `true`.      |
| `bind:show_data_types`, `bind:show_array_indices` | Toggle type annotations and numeric array labels. Defaults are `false` and `true`.                                                            |
| `sort_keys`, `max_string_length={200}`            | Alphabetical object keys and long-string truncation.                                                                                          |
| `on_select(path, value)`, `on_copy(path, text)`   | Observe node focus/selection and successful copies.                                                                                           |
| `editable`, `on_change`, `compare_value`          | Caller-owned editing and comparison, as above.                                                                                                |

CSS properties such as `--jt-max-height`, `--jt-font-size`, `--jt-indent` and `--jt-bg` fit it to a panel. Fetching, loading and request errors belong to the caller: render those before mounting the viewer rather than passing `null` as a loading sentinel. Copies confirm, or report “Copy failed”, in a `.copy-toast` beside the row.

### Keyboard behavior

Up/Down move between rendered nodes; Left/Right fold and unfold branches. In search, Enter or F3 advances through matches and Shift reverses direction; Escape clears search. Select rows with Ctrl/Cmd-click (Shift extends the selection), then Ctrl/Cmd+C copies selected values. Escape closes a context menu or clears the selection. Editable fields keep their normal text navigation.
