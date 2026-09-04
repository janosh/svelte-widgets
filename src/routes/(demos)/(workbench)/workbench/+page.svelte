<script lang="ts">
  import {
    FileInput,
    JsonTree,
    NumberRangeInput,
    SplitPane,
    TaskStatus,
    TreeView,
    VirtualList,
    type TreeNode,
  } from '$lib'

  let value = $state<number | undefined>(0.5)
  let ratio = $state(0.4)
  let collapsed = $state(false)
  let selected = $state<string>()
  let task_state = $state<`running` | `cancelled`>(`running`)
  const nodes: TreeNode[] = [
    {
      id: `project`,
      label: `Project`,
      children: [
        { id: `settings`, label: `Settings` },
        {
          id: `results`,
          label: `Results`,
          load: async () => [{ id: `latest`, label: `Latest result` }],
        },
      ],
    },
  ]
  const items = Array.from({ length: 10000 }, (_value, idx) => `Item ${idx + 1}`)
</script>

<h2>Workbench widgets</h2>
<p>Shared controls for settings, file loading, pane layouts, and large data explorers.</p>
<h3>NumberRangeInput</h3>
<p>
  Draft text stays local until it is finite and within bounds. Clearing retains the value;
  use <code>empty="undefined"</code> for optional fields. <code>commit="change"</code>
  waits for Enter, blur, or change. <code>oncommit</code> receives accepted changes.
  Native input attributes go in <code>number_props</code> and <code>range_props</code>.
</p>
<NumberRangeInput bind:value min={0} max={1} step={0.1} commit="change"
  >Opacity</NumberRangeInput
>
<p>Committed: {value}</p>
<h3>SplitPane and TreeView</h3>
<p>
  SplitPane sizes its parent through <code>--split-pane-size</code>. Bind
  <code>ratio</code>
  or <code>first_px</code>; <code>min_px</code>, <code>max_px</code>, and
  <code>second_min_px</code>
  constrain it. Arrow keys resize, Home/End reach the limits, and Enter collapses or restores
  when <code>collapsible</code> is set. Save bindings or <code>onresize</code> values in your
  own store for persistence.
</p>
<div class="split-demo">
  <section style:width="var(--split-pane-size, 40%)">
    <TreeView {nodes} bind:selected label="Project files" />
  </section>
  <SplitPane bind:ratio bind:collapsed collapsible />
  <section style:flex="1">
    <JsonTree value={{ selected, opacity: value, items: [1, 2, 3] }} />
  </section>
</div>
<p>
  TreeView accepts stable unique IDs, labels, children, or an async <code
    >load(signal)</code
  > function. It renders expanded nodes only and supports arrow keys, Home/End, selection, and
  type-to-focus. JsonTree adds search, copy, paths, editing callbacks and comparison highlighting
  for object data.
</p>
<h3>VirtualList</h3>
<p>
  Only visible rows plus <code>overscan</code> are mounted. Set a fixed
  <code>item_size</code>
  that fits your content and call <code>scroll_to_index</code> to reveal a row. The
  exported <code>virtual_window</code> helper supports custom table and grid markup. Variable-height
  rows require a different layout.
</p>
<VirtualList {items} item_size={32} style="height: 160px" aria-label="Ten thousand items">
  {#snippet children(item, idx)}<div>{idx + 1}: {item}</div>{/snippet}
</VirtualList>
<h3>FileInput</h3>
<p>
  Picker and drop validation share <code>accept</code>, <code>max_size</code>,
  <code>max_files</code>, and <code>multiple</code>. Rejections include type, size, or
  count reasons. Supply <code>onfiles(files, signal)</code> to parse or upload; replacement,
  cancellation, and unmount abort the signal. Supply a children snippet for custom previews,
  including FileDetails for text.
</p>
<FileInput accept=".json,.txt" multiple max_files={3} max_size={1000000} />
<h3>Progress and TaskStatus</h3>
<p>
  Progress uses a native progress element; omit value for indeterminate work. TaskStatus
  adds a live label and caller-owned cancellation/retry callbacks, so it can be used
  inside an action, pane, or toast without owning your operation.
</p>
<TaskStatus
  state={task_state}
  label={task_state === `running` ? `Processing files` : `Cancelled`}
  value={35}
  oncancel={() => {
    task_state = `cancelled`
  }}
  onretry={() => {
    task_state = `running`
  }}
/>

<style>
  .split-demo {
    display: flex;
    position: relative;
    min-height: 12rem;
    border: 1px solid #8885;
    section {
      min-width: 0;
      overflow: hidden;
    }
  }
</style>
