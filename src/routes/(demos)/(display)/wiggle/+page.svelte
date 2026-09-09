<script lang="ts">
  import Wiggle from '$lib/Wiggle.svelte'

  let wiggle = $state(false)
  let angle = $state(20)
  let scale = $state(1.2)
  let [dx, dy] = $state([10, 10])
  let duration_ms = $state(200)
  let [stiffness, damping] = $state([0.05, 0.1])
</script>

<h2>Wiggle</h2>

<p>
  Wraps its children in a spring-animated wrapper that shakes once whenever <code
    >wiggle</code
  >
  flips to <code>true</code> and resets itself when the spring settles. Bind
  <code>wiggle</code> to trigger it from anywhere. Drag the sliders to tune the motion.
</p>

<button type="button" class="demo" onclick={() => (wiggle = true)}>
  <Wiggle
    bind:wiggle
    {angle}
    {scale}
    {dx}
    {dy}
    {duration_ms}
    spring_options={{ stiffness, damping }}
    style="display: inline-block; padding: 0.5em 1em; background: var(--surface); border-radius: 6pt"
  >
    🎯 Click to wiggle!
  </Wiggle>
</button>

<div class="controls">
  <label>
    angle: {angle}
    <input type="range" min="0" max="45" step="1" bind:value={angle} />
  </label>
  <label>
    scale: {scale.toFixed(2)}
    <input type="range" min="1" max="2" step="0.05" bind:value={scale} />
  </label>
  <label>
    dx: {dx}
    <input type="range" min="0" max="50" step="1" bind:value={dx} />
  </label>
  <label>
    dy: {dy}
    <input type="range" min="0" max="50" step="1" bind:value={dy} />
  </label>
  <label>
    duration_ms: {duration_ms}
    <input type="range" min="50" max="1000" step="50" bind:value={duration_ms} />
  </label>
  <label>
    stiffness: {stiffness.toFixed(2)}
    <input type="range" min="0.01" max="0.5" step="0.01" bind:value={stiffness} />
  </label>
  <label>
    damping: {damping.toFixed(2)}
    <input type="range" min="0.01" max="1" step="0.01" bind:value={damping} />
  </label>
</div>

<style>
  .demo {
    width: 100%;
    border: 0;
    padding: 0;
    color: inherit;
    background: none;
    font-family: inherit;
    font-size: 1.5em;
    text-align: center;
    margin: 1em 0;
    cursor: pointer;
  }
  .controls {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1em;
  }
  input[type='range'] {
    width: 100%;
  }
</style>
