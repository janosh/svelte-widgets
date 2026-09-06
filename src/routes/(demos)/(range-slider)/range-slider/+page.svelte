<script lang="ts">
  import { CodeExample, RangeSlider, type RangeValue } from '$lib'

  let price = $state<RangeValue>([120, 360])
  let temperature = $state<RangeValue>([-5, 22])
  let confidence = $state<RangeValue>([0.25, 0.85])
  let overlap = $state<RangeValue>([50, 50])
  let rtl_range = $state<RangeValue>([20, 75])
  let batches = $state<RangeValue>([0, 10])
  let locked = $state(false)
  let committed = $state<RangeValue>([120, 360])
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
  <span class="eyebrow">Two handles. One interval.</span>
  <h1>Find your sweet spot.</h1>
  <p>
    Drag either end, tap the track, or type an exact value. A range control that feels
    just as natural with a keyboard as it does under your fingertips.
  </p>
</section>

<div class="showcase">
  <section class="card featured">
    <div class="card-heading">
      <span>01 / A little room to explore</span><button
        type="button"
        onclick={() => (price = [120, 360])}>Reset</button
      >
    </div>
    <RangeSlider
      label="Nightly budget"
      description="Choose a comfortable range for your next stay."
      lower_label="From"
      upper_label="To"
      min={0}
      max={500}
      step={10}
      bind:value={price}
      format_value={money}
      disabled={locked}
      oncommit={(value) => {
        committed = value
        commits++
      }}
      style="--range-slider-color: light-dark(#7c3aed, #c4b5fd)"
    />
    <div class="feedback">
      <span class="dot"></span><span
        >Applied {money(committed[0])} – {money(committed[1])}</span
      ><span class="commit-count">{commits} commits</span>
    </div>
    <label class="lock"
      ><input type="checkbox" bind:checked={locked} /> Lock this range</label
    >
  </section>
  <section class="card">
    <div class="card-heading"><span>02 / Below zero, above ordinary</span></div>
    <RangeSlider
      label="Temperature window"
      description="Fine-tune your comfort zone in half-degree steps."
      min={-30}
      max={50}
      step={0.5}
      bind:value={temperature}
      format_value={(value) => `${value} °C`}
      style="--range-slider-color: light-dark(#0e7490, #67e8f9)"
    />
  </section>
  <section class="card">
    <div class="card-heading"><span>03 / Small steps, clear signals</span></div>
    <RangeSlider
      label="Confidence interval"
      description="A compact variant with formatted values."
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
  <section class="card">
    <div class="card-heading">
      <span>04 / Never get stuck</span><button
        type="button"
        onclick={() => (overlap = [50, 50])}>Overlap handles</button
      >
    </div>
    <RangeSlider
      label="Meeting in the middle"
      description="Drag left or right to separate the handles."
      bind:value={overlap}
      style="--range-slider-color: light-dark(#b45309, #fcd34d)"
    />
  </section>
  <section class="card rtl-card">
    <div class="card-heading"><span>05 / A change of direction</span></div>
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
    class="card"
    onreset={(event) => {
      if (!event.defaultPrevented) batches = [0, 10]
    }}
  >
    <div class="card-heading">
      <span>06 / Every endpoint counts</span><button type="reset">Reset interval</button>
    </div>
    <RangeSlider
      label="Batch size"
      description="Steps of three, with ten still in reach."
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
  <h2>Make it yours</h2>
  <CodeExample src={example} meta={{ lang: `svelte` }} />
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
            >Visible and accessible endpoint names; translate these along with the label.</td
          ></tr
        >
        <tr
          ><td><code>format_value</code></td><td><code>String</code></td><td
            >Formats the summary, limits, and announced slider values. Numeric fields stay
            editable as numbers.</td
          ></tr
        >
        <tr
          ><td><code>show_inputs / disabled</code></td><td><code>true / false</code></td
          ><td>Hide numeric fields or disable every interaction.</td></tr
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
  }
  .eyebrow {
    color: light-dark(#6d28d9, #c4b5fd);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  h1 {
    font-size: clamp(2rem, 5vw, 3.25rem);
    line-height: 1.12;
    letter-spacing: -0.045em;
    margin: 0.5rem 0 1rem;
  }
  .intro p {
    font-size: 1.05rem;
    line-height: 1.65;
    opacity: 0.7;
  }
  .showcase {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1.25rem;
    align-items: start;
  }
  .card {
    min-width: 0;
    padding: 1.5rem;
    border: 1px solid light-dark(#e5e4ed, #343340);
    border-radius: 16px;
    background: light-dark(#fff, #202029);
    box-shadow: 0 3px 18px #00000006;
  }
  .featured {
    background: linear-gradient(
      135deg,
      light-dark(#faf7ff, #282139),
      light-dark(#fff, #202029)
    );
    border-color: light-dark(#ddd1f8, #54406f);
  }
  .card-heading {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
    min-height: 28px;
    margin-bottom: 1.3rem;
    color: light-dark(#656374, #b2aec3);
    font-size: 0.7rem;
    letter-spacing: 0.025em;
  }
  .card-heading button {
    flex-shrink: 0;
    font: inherit;
    padding: 0.35em 0.65em;
    border: 1px solid currentColor;
    border-radius: 5px;
    color: inherit;
    background: transparent;
    cursor: pointer;
  }
  .feedback {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 1.2rem;
    font-size: 0.75rem;
  }
  .dot {
    width: 6px;
    height: 6px;
    background: #10b981;
    border-radius: 50%;
  }
  .commit-count {
    margin-inline-start: auto;
    opacity: 0.6;
    font-variant-numeric: tabular-nums;
  }
  .lock {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-top: 0.8rem;
    font-size: 0.75rem;
    opacity: 0.8;
  }
  .note {
    margin: 1.1rem 0 0;
    font-size: 0.8rem;
    line-height: 1.6;
    opacity: 0.65;
  }
  .guide {
    margin-top: 3rem;
  }
  .guide li {
    margin-bottom: 0.6em;
  }
  .guide p,
  .guide li {
    line-height: 1.65;
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
  @media (max-width: 700px) {
    .showcase {
      grid-template-columns: 1fr;
    }
    .card {
      padding: 1.15rem;
    }
  }
</style>
