<script lang="ts">
  import { CodeBlock, RangeSlider, type RangeValue } from '$lib'
  import { default_highlighter } from '$lib/highlight'

  let price = $state<RangeValue>([120, 360])
  let temperature = $state<RangeValue>([-5, 22])
  let confidence = $state<RangeValue>([0.25, 0.85])
  let overlap = $state<RangeValue>([50, 50])
  let rtl_range = $state<RangeValue>([20, 75])
  let batches = $state<RangeValue>([0, 10])
  let locked = $state(false)
  let commits = $state(0)
  const currency = new Intl.NumberFormat(`en-US`, {
    style: `currency`,
    currency: `USD`,
    maximumFractionDigits: 0,
  })
  const money = (value: number): string => currency.format(value)
  const percent = (value: number): string => `${Math.round(value * 100)}%`
  const example = `<script>
  import { RangeSlider } from 'svelte-widgets'
  let value = $state([120, 360])
</${`script`}>

<RangeSlider
  label="Nightly budget"
  min={0}
  max={500}
  step={10}
  bind:value
  format_value={(value) => '$' + value}
  oncommit={(value) => console.log('Apply filter', value)}
/>`
</script>

<svelte:head><title>RangeSlider · Svelte Widgets</title></svelte:head>

<section class="intro">
  <h1>RangeSlider</h1>
  <p>
    Select an interval by dragging the handles, clicking the track, using the keyboard, or
    entering values directly.
  </p>
</section>

<div class="showcase">
  <section>
    <header>
      <h2>Currency range</h2>
      <button type="button" onclick={() => (price = [120, 360])}>Reset</button>
    </header>
    <RangeSlider
      label="Nightly budget"
      description="Select a price range in $10 steps."
      lower_label="From"
      upper_label="To"
      min={0}
      max={500}
      step={10}
      bind:value={price}
      format_value={money}
      disabled={locked}
      oncommit={() => commits++}
      style="--range-slider-color: light-dark(#7c3aed, #c4b5fd)"
    />
    <p class="commit-count">{commits} commits</p>
    <label><input type="checkbox" bind:checked={locked} /> Lock this range</label>
  </section>
  <section>
    <header><h2>Decimal steps</h2></header>
    <RangeSlider
      label="Temperature window"
      description="Negative and positive values in 0.5 °C steps."
      min={-30}
      max={50}
      step={0.5}
      bind:value={temperature}
      format_value={(value) => `${value} °C`}
      style="--range-slider-color: light-dark(#0e7490, #67e8f9)"
    />
  </section>
  <section>
    <header><h2>Percentage formatting</h2></header>
    <RangeSlider
      label="Confidence interval"
      description="Percentage values with numeric inputs hidden."
      min={0}
      max={1}
      step={0.01}
      bind:value={confidence}
      format_value={percent}
      show_inputs={false}
      style="--range-slider-color: light-dark(#047857, #6ee7b7)"
    />
    <p class="note">Arrow keys move 1%. Shift + arrow or Page Up / Down moves 10%.</p>
  </section>
  <section>
    <header>
      <h2>Overlapping handles</h2>
      <button type="button" onclick={() => (overlap = [50, 50])}>Overlap handles</button>
    </header>
    <RangeSlider
      label="Shared endpoint"
      description="Drag left or right to separate the handles."
      bind:value={overlap}
      style="--range-slider-color: light-dark(#b45309, #fcd34d)"
    />
  </section>
  <section>
    <header><h2>Right-to-left layout</h2></header>
    <div dir="rtl">
      <RangeSlider
        label="النطاق"
        lower_label="الحد الأدنى"
        upper_label="الحد الأقصى"
        bind:value={rtl_range}
        style="--range-slider-color: light-dark(#be185d, #f9a8d4)"
      />
    </div>
    <p class="note">Right-to-left layouts mirror the track and horizontal arrow keys.</p>
  </section>
  <form
    onreset={(event) => {
      if (!event.defaultPrevented) batches = [0, 10]
    }}
  >
    <header>
      <h2>Uneven steps and form reset</h2>
      <button type="reset">Reset interval</button>
    </header>
    <RangeSlider
      label="Batch size"
      description="Steps of 3 with a maximum of 10."
      min={0}
      max={10}
      step={3}
      bind:value={batches}
      style="--range-slider-color: light-dark(#1d4ed8, #93c5fd)"
    />
    <p class="note">
      Both bounds stay selectable, even when the step does not divide the interval evenly.
    </p>
  </form>
</div>

<section class="guide">
  <h2>Usage</h2>
  <CodeBlock
    code={example}
    language="svelte"
    label="RangeSlider usage"
    highlight={default_highlighter.highlight}
  />
  <h3>Interaction details</h3>
  <ul>
    <li>
      <strong>Drag or tap:</strong> the nearest handle moves. Handles stop at one another. At
      the same value, drag in either direction to separate them.
    </li>
    <li>
      <strong>Keyboard:</strong> Tab reaches each handle in a fixed order. Arrows move one step;
      Shift + arrow and Page Up / Down move ten. Home / End reach that handle’s allowed bounds.
    </li>
    <li>
      <strong>Type:</strong> edits apply on Enter or blur, snap to the nearest step, and stay
      within the allowed interval. Escape discards a draft. Empty or invalid drafts restore
      the current value.
    </li>
    <li>
      <strong>Events:</strong> binding and <code>oninput</code> update while dragging.
      <code>oncommit</code> runs at the end of a changed gesture, on each keyboard adjustment,
      or after a changed numeric edit. Pointer cancellation keeps and commits the last value.
      External prop updates emit neither callback.
    </li>
  </ul>
  <h3>Props</h3>
  <div class="table-wrap">
    <table>
      <thead><tr><th>Prop</th><th>Default</th><th>Purpose</th></tr></thead>
      <tbody>
        <tr
          ><td><code>value</code></td><td><code>[min, max]</code></td><td
            >Bindable <code>[lower, upper]</code> pair.</td
          ></tr
        >
        <tr
          ><td><code>min / max / step</code></td><td><code>0 / 100 / 1</code></td><td
            >Finite bounds and a positive step anchored at min. Max is always selectable,
            even between steps.</td
          ></tr
        >
        <tr
          ><td><code>label / description</code></td><td><code>Range / undefined</code></td
          ><td>Visible group name and optional help text.</td></tr
        >
        <tr
          ><td><code>lower_label / upper_label</code></td><td
            ><code>Minimum / Maximum</code></td
          ><td
            >Accessible endpoint names and input tooltips; translate these along with the
            label.</td
          ></tr
        >
        <tr
          ><td><code>format_value</code></td><td><code>String</code></td><td
            >Formats the selected values, limits, and announced slider values. Click a
            selected value to edit its underlying number.</td
          ></tr
        >
        <tr
          ><td><code>show_inputs / disabled</code></td><td><code>true / false</code></td
          ><td>Make selected values read-only or disable every interaction.</td></tr
        >
        <tr
          ><td><code>oninput / oncommit</code></td><td>—</td><td
            >Receive a fresh value pair for live and completed edits.</td
          ></tr
        >
      </tbody>
    </table>
  </div>
  <p>
    External values must be finite, ordered, and inside the bounds. Update bounds and
    value together when changing the domain. Invalid configuration throws with the
    offending values. Extra HTML attributes are forwarded to the group. Native form reset
    discards numeric drafts; reset the binding in your form handler to restore a saved
    interval.
  </p>
  <p>
    Style with <code>--range-slider-color</code>, <code>--range-slider-track</code>,
    <code>--range-slider-thumb</code>, and <code>--range-slider-input-bg</code>. Touch
    targets are 44 pixels, focus rings remain visible, and the control supports reduced
    motion and forced colors.
  </p>
</section>

<style>
  .intro {
    max-width: 660px;
    margin: 1.5rem 0 2rem;
    h1 {
      font-size: 2rem;
      text-align: start;
    }
  }
  .showcase {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
    gap: 2rem;
    align-items: start;
    > section,
    > form {
      min-width: 0;
      border-top: 1px solid #8884;
      padding-block: 1rem;
    }
    header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.5rem;
      min-height: 2rem;
      margin-bottom: 1rem;
      h2 {
        margin: 0;
        font-size: 1rem;
      }
      button {
        font-size: 0.8rem;
        padding: 0.25em 0.5em;
        border-radius: 3px;
        box-shadow: none;
      }
    }
    > section > label {
      display: flex;
      align-items: center;
      gap: 0.5em;
      margin-top: 0.8rem;
      font-size: 0.8rem;
    }
  }
  .commit-count {
    margin: 0.75rem 0 0;
    font-size: 0.75rem;
    opacity: 0.6;
    font-variant-numeric: tabular-nums;
  }
  .note {
    margin: 1.1rem 0 0;
    font-size: 0.8rem;
    line-height: 1.6;
    opacity: 0.65;
  }
  .guide {
    margin-top: 3rem;
    li {
      margin-bottom: 0.6em;
    }
  }
  .table-wrap {
    overflow-x: auto;
  }
  table {
    width: 100%;
    font-size: 0.85rem;
    border-collapse: collapse;
  }
  th,
  td {
    text-align: start;
    padding: 0.7em;
    border-bottom: 1px solid #8883;
    vertical-align: top;
  }
</style>
