<script lang="ts">
  import { RangeSlider, type RangeValue } from '$lib'

  let price = $state<RangeValue>([120, 360])
  let temperature = $state<RangeValue>([-5, 22])
  let confidence = $state<RangeValue>([0.25, 0.85])
  let overlap = $state<RangeValue>([50, 50])
  let rtl_range = $state<RangeValue>([20, 75])
  let batches = $state<RangeValue>([0, 10])
  let locked = $state(false)
  let side_ticks = $state(false)
  let tick_count = $state(2)
  let commits = $state(0)
  const currency = new Intl.NumberFormat(`en-US`, {
    style: `currency`,
    currency: `USD`,
    maximumFractionDigits: 0,
  })
  const money = (value: number): string => currency.format(value)
  const percent = (value: number): string => `${Math.round(value * 100)}%`
</script>

<svelte:head><title>RangeSlider · Svelte Widgets</title></svelte:head>

# RangeSlider

Select an interval by dragging the handles, clicking the track, using the keyboard, or entering values directly.

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
      tick_position={side_ticks ? `sides` : `below`}
      {tick_count}
      oncommit={() => commits++}
      style="--range-slider-color: light-dark(#7c3aed, #c4b5fd)"
    />
    <p class="commit-count">{commits} commits</p>
    <label><input type="checkbox" bind:checked={locked} /> Lock this range</label>
    <label
      ><input type="checkbox" bind:checked={side_ticks} /> Place ticks at the sides</label
    >
    <label>Tick count
      <select aria-label="Tick count" bind:value={tick_count}>
        {#each [2, 3, 4, 5] as count}<option value={count}>{count}</option>{/each}
      </select>
    </label>
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
      tick_position="sides"
      tick_count={3}
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
        tick_position="sides"
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

## Usage

<section aria-label="RangeSlider usage">

```svelte
<script>
  import { RangeSlider } from 'svelte-widgets'
  let value = $state([120, 360])
</script>

<RangeSlider
  label="Nightly budget"
  min={0}
  max={500}
  step={10}
  bind:value
  format_value={(value) => '$' + value}
  oncommit={(value) => console.log('Apply filter', value)}
/>
```

</section>

### Interaction details

- **Drag or tap:** the nearest handle moves. Handles stop at one another. At the same value, drag in either direction to separate them.
- **Keyboard:** Tab reaches each handle in a fixed order. Arrows move one step; Shift + arrow and Page Up / Down move ten. Home / End reach that handle’s allowed bounds.
- **Type:** edits apply on Enter or blur, snap to the nearest step, and stay within the allowed interval. Escape discards a draft. Empty or invalid drafts restore the current value.
- **Events:** binding and `oninput` update while dragging. `oncommit` runs at the end of a changed gesture, on each keyboard adjustment, or after a changed numeric edit. Pointer cancellation keeps and commits the last value. External prop updates emit neither callback.

### Props

| Prop                        | Default             | Purpose                                                                                                                                                                                                        |
| --------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value`                     | `[min, max]`        | Bindable `[lower, upper]` pair.                                                                                                                                                                                |
| `min / max / step`          | `0 / 100 / 1`       | Finite bounds and a positive step anchored at min. Max is always selectable, even between steps.                                                                                                               |
| `label / description`       | `Range / undefined` | Visible group name and optional help text.                                                                                                                                                                     |
| `lower_label / upper_label` | `Minimum / Maximum` | Accessible endpoint names and input tooltips; translate these along with the label.                                                                                                                            |
| `format_value`              | `String`            | Formats the selected values, limits, and announced slider values. Click a selected value to edit its underlying number.                                                                                        |
| `tick_position`             | `below`             | `below` places min/max labels close beneath the track; `sides` shortens the track to fit labels at either end.                                                                                                 |
| `tick_count`                | `2`                 | Total evenly spaced labels including min and max (integer ≥ 2). A count of 3 adds the midpoint. Intermediate labels appear below the track in both layouts, use `format_value`, and are independent of `step`. |
| `show_inputs / disabled`    | `true / false`      | Make selected values read-only or disable every interaction.                                                                                                                                                   |
| `oninput / oncommit`        | —                   | Receive a fresh value pair for live and completed edits.                                                                                                                                                       |

External values must be finite, ordered, and inside the bounds. Update bounds and value together when changing the domain. Invalid configuration throws with the offending values. Extra HTML attributes are forwarded to the group. Native form reset discards numeric drafts; reset the binding in your form handler to restore a saved interval.

Style with `--range-slider-color`, `--range-slider-track`, `--range-slider-thumb`, and `--range-slider-input-bg`. Touch targets are 44 pixels, focus rings remain visible, and the control supports reduced motion and forced colors.

<style>
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
</style>
