<script lang="ts">
  import Heading from '#lib/Heading.svelte'
  import {
    Widgets,
    Tune,
    FileTree,
    ListBulleted,
    Upload,
    Progress,
    Braces,
    MessageText,
    Keyboard,
    GitHub,
    TypeScript,
  } from '#lib/icons.ts'
  import { resolve } from '$app/paths'
  import { default_highlighter } from 'svelte-widgets/highlight'
  import {
    CodeBlock,
    ControlGroup,
    EmptyState,
    GlassChip,
    Icon,
    KeyValueList,
    LiveMessage,
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
  } from 'svelte-widgets'

  let message = $state<string | undefined>(`Your changes were saved.`)
  let dragging = $state(false)
  let clicked = $state(false)
  let feedback_position = $state({ x: 0, y: 0 })
  let value = $state<number | undefined>(0.5)
  let ratio = $state(0.4)
  let collapsed = $state(false)
  let selected = $state<string | null>(null)
  let task_state = $state<`running` | `cancelled`>(`running`)
  let chart_loading = $state(true)
  let n_points = $state(0)
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

<Heading level={2} id="workbench-widgets" icon={Widgets}>Workbench widgets</Heading>
<p>
  Compose controls for settings, file loading, pane layouts, and large data explorers.
  Start with the focused examples and API guides for <a href={resolve(`tree-view`)}
    >TreeView</a
  >,
  <a href={resolve(`json-tree`)}>JsonTree</a>,
  <a href={resolve(`split-pane`)}>SplitPane</a>,
  <a href={resolve(`virtual-list`)}>VirtualList</a>, and
  <a href={resolve(`file-input`)}>FileInput</a>. The combined explorer below shares
  selection and settings between its panes.
</p>
<Heading level={3} id="numberrangeinput" icon={Tune}>NumberRangeInput</Heading>
<p>
  Draft text stays local until it is finite and within bounds. Clearing retains the value;
  use <code>empty="undefined"</code> for optional fields. <code>commit="change"</code>
  waits for Enter, blur, or change. <code>on_commit</code> receives accepted changes.
  Native input attributes go in <code>number_props</code> and <code>range_props</code>.
</p>
<NumberRangeInput label="Opacity" bind:value min={0} max={1} step={0.1} commit="change"
  >Opacity</NumberRangeInput
>
<p>Committed: {value}</p>
<Heading level={3} id="splitpane-and-treeview" icon={FileTree}
  >SplitPane and TreeView</Heading
>
<p>
  SplitPane sizes its parent through <code>--split-pane-size</code>. Bind
  <code>ratio</code>
  or <code>first_px</code>; <code>min_px</code>, <code>max_px</code>, and
  <code>second_min_px</code>
  constrain it. Arrow keys resize, Home/End reach the limits, and Enter collapses or restores
  when <code>collapsible</code> is set. Save bindings or <code>on_resize</code> values in your
  own store for persistence.
</p>
<div class="split-demo">
  <section style:width="var(--split-pane-size, 40%)">
    <TreeView {nodes} bind:value={selected} label="Project files" />
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
<Heading level={3} id="virtuallist" icon={ListBulleted}>VirtualList</Heading>
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
<Heading level={3} id="fileinput" icon={Upload}>FileInput</Heading>
<p>
  Picker and drop validation share <code>accept</code>, <code>max_size</code>,
  <code>max_files</code>, and <code>multiple</code>. Rejections include type, size, or
  count reasons. Supply <code>on_files(files, signal)</code> to parse or upload; replacement,
  cancellation, and unmount abort the signal. Supply a children snippet for custom previews,
  including FileDetails for text.
</p>
<FileInput accept=".json,.txt" multiple max_files={3} max_size={1000000} />
<Heading level={3} id="progress-and-taskstatus" icon={Progress}
  >Progress and TaskStatus</Heading
>
<p>
  Progress uses a native progress element; omit value for indeterminate work. TaskStatus
  adds a live label and caller-owned cancellation/retry callbacks, so it can be used
  inside an action, pane, or toast without owning your operation.
</p>
<TaskStatus
  state={task_state}
  label={task_state === `running` ? `Processing files` : `Cancelled`}
  value={35}
  on_cancel={() => (task_state = `cancelled`)}
  on_retry={() => (task_state = `running`)}
/>
<p>
  <code>spinner</code> puts a spinner beside the label while running (styled through
  <code>spinner_props</code>) and shows the bar only once a <code>value</code> arrives.
  <code>label</code> also takes a snippet for markup, and errors go to an assertive alert
  region. <code>overlay</code> centers the status over a positioned parent while pointer events
  pass through to it everywhere but the buttons.
</p>
<button onclick={() => (chart_loading = !chart_loading)}>Toggle loading overlay</button>
<div class="overlay-demo">
  {#if chart_loading}
    <TaskStatus
      overlay
      spinner
      label="Loading structure…"
      on_cancel={() => (chart_loading = false)}
    />
  {:else}
    <EmptyState overlay message="Nothing plotted yet" />
  {/if}
</div>

<Heading level={3} id="codeblock-and-statgrid" icon={Braces}
  >CodeBlock and StatGrid</Heading
>
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
  highlight={default_highlighter.highlight}
/>
<p>
  A <code>title</code> (with optional <code>icon</code> and <code>line_count</code>),
  <code>copy</code> button or <code>actions</code> snippet adds a header for showing a source
  file.
</p>
<CodeBlock
  code={'export const sum = (values: number[]) =>\n  values.reduce((total, value) => total + value, 0)'}
  language="typescript"
  highlight={default_highlighter.highlight}
  title="sum.ts"
  icon={TypeScript}
  line_count
  copy
>
  {#snippet actions()}
    <a href="https://github.com/janosh/svelte-widgets" aria-label="View on GitHub"
      ><Icon icon={GitHub} /></a
    >
  {/snippet}
</CodeBlock>
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
<Heading level={3} id="feedback" icon={MessageText}>Feedback</Heading>
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
<Heading level={3} id="layout-primitives" icon={ListBulleted}>Layout primitives</Heading>
<p>
  <code>EmptyState</code> is a polite status placeholder for missing data; with
  <code>overlay</code> it lies over still-rendered axes or a blank canvas (as above)
  without blocking their pointer events. <code>KeyValueList</code> renders one-line
  term/value rows that ellipsize long values. <code>ControlGroup</code> is an unframed
  fieldset headed by its legend. <code>GlassChip</code> is a frosted label over visual
  content, placed with
  <code>--glass-chip-top</code>/<code>-left</code>. <code>LiveMessage</code> is a visually hidden
  live region that announces its message as it changes.
</p>
<div class="primitives-demo">
  <ControlGroup legend="Sample">
    <label>Points <input type="number" min="0" bind:value={n_points} /></label>
    <LiveMessage message="{n_points} points" />
  </ControlGroup>
  <KeyValueList
    rows={[
      ['Points', n_points],
      ['Spacings', '1.21, 2.42, 3.63, 4.84, 6.05, 7.26, 8.47, 9.68, 10.89'],
    ]}
  />
  <div class="chip-demo">
    <GlassChip>{n_points} points</GlassChip>
  </div>
</div>
<Heading level={3} id="canvas-and-keyboard-primitives" icon={Keyboard}
  >Canvas and keyboard primitives</Heading
>
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
  .overlay-demo {
    position: relative;
    min-height: 8rem;
    margin-block: 1rem;
    border: 1px dashed #8888;
  }
  .primitives-demo {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(12em, 1fr));
    gap: 1em;
  }
  .chip-demo {
    position: relative;
    min-height: 5rem;
    background: linear-gradient(135deg, teal, rebeccapurple);
  }
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
