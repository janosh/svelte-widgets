<script lang="ts">
  import {
    CodeBlock,
    StatGrid,
    Spinner,
    StatusMessage,
    DragOverlay,
    ClickFeedback,
    FileInput,
    JsonTree,
    NumberRangeInput,
    SplitPane,
    TaskStatus,
    TreeView,
    VirtualList,
    type TreeNode,
  } from '$lib'

  let message = $state<string | undefined>(`Your changes were saved.`)
  let dragging = $state(false)
  let clicked = $state(false)
  let feedback_position = $state({ x: 0, y: 0 })
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

<h3>CodeBlock and StatGrid</h3>
<p>
  <code>CodeBlock</code> accepts plain code or an optional
  <code>highlight(code, language, signal)</code>
  callback. Return tokens with raw text and an optional CSS class (the component escapes the
  text), or trusted highlighted HTML. Changes cancel pending work; failures leave the source
  visible and show the error. Set
  <code>wrap</code> for long lines.
</p>
<CodeBlock
  code={'const total = values.reduce((sum, value) => sum + value, 0)'}
  language="javascript"
/>
<p>
  <code>StatGrid</code> accepts items with label, value, optional unit, delta and hint. A
  custom <code>format</code> callback controls value formatting. Non-finite values and changes
  display as unavailable.
</p>
<StatGrid
  items={[
    { label: 'Completed', value: 1234, delta: 28, hint: 'Since the previous run' },
    { label: 'Latency', value: 12.5, unit: 'ms', delta: -2.1 },
    { label: 'State', value: 'Ready' },
  ]}
/>
<h3>Feedback</h3>
<Spinner text="Loading preview" />
<StatusMessage bind:message type="success" dismissible />
<p>
  <code>StatusMessage</code> supports info, success, warning and error announcements.
  Dismissal clears its bindable message. <code>Spinner</code> adds an accessible status
  around <code>CircleSpinner</code>.
</p>
<button onclick={() => (dragging = !dragging)}>Toggle drop overlay</button>
<div
  style="position: relative; min-height: 6rem; margin-block: 1rem; border: 1px dashed currentColor"
>
  <DragOverlay visible={dragging} message="Drop files here" />
</div>
<button
  onclick={(event) => {
    feedback_position = { x: event.clientX, y: event.clientY }
    clicked = !clicked
  }}>Toggle click feedback</button
>
<ClickFeedback visible={clicked} position={feedback_position} />
<p>
  <code>DragOverlay</code> fills a positioned parent; <code>ClickFeedback</code> uses viewport
  coordinates. The caller owns visibility and timing.
</p>
<h3>Canvas and keyboard primitives</h3>
<p>
  <code>create_canvas_surface</code> from <code>svelte-widgets/canvas</code> takes
  reactive canvas and optional overlay getters, an optional CSS height, draw callbacks and
  <code>repaint_deps</code>. Create it during component initialization. Frames receive a
  2D context and CSS width/height. The base is cleared before drawing; the overlay clears
  itself. <code>schedule(false)</code> redraws only the overlay. Parent resizes and DPR changes
  update both backing stores; cleanup stops observers and pending frames.
</p>
<p>
  <code>create_roving_focus</code> from <code>svelte-widgets/roving-focus</code> takes
  container and items getters. Give each item a unique <code>data-roving-key</code>, and
  use <code>tabindex(key)</code>. Forward the container's keydown and focusin events.
  Arrow keys wrap through DOM order; Home and End reach its ends. Modified keys and
  editable children retain their normal behavior.
</p>

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
