<script lang="ts">
  import Heading from '$lib/Heading.svelte'
  import Wiggle from 'svelte-widgets/Wiggle.svelte'

  let wiggle = $state(false)
  // [param, initial, min, max, step]; fractional steps show two decimals
  const sliders = [
    [`angle`, 20, 0, 45, 1],
    [`scale`, 1.2, 1, 2, 0.05],
    [`dx`, 10, 0, 50, 1],
    [`dy`, 10, 0, 50, 1],
    [`duration_ms`, 200, 50, 1000, 50],
    [`stiffness`, 0.05, 0.01, 0.5, 0.01],
    [`damping`, 0.1, 0.01, 1, 0.01],
  ] as const
  // keyed by the slider names, so a typo like params.agle fails type-checking
  const params = $state(
    Object.fromEntries(sliders.map(([param, initial]) => [param, initial])) as Record<
      (typeof sliders)[number][0],
      number
    >,
  )
</script>

<Heading level={2} id="wiggle">Wiggle</Heading>

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
    angle={params.angle}
    scale={params.scale}
    dx={params.dx}
    dy={params.dy}
    duration_ms={params.duration_ms}
    spring_options={{ stiffness: params.stiffness, damping: params.damping }}
    style="display: inline-block; padding: 0.5em 1em; background: var(--surface); border-radius: 6pt"
  >
    🎯 Click to wiggle!
  </Wiggle>
</button>

<div class="controls">
  {#each sliders as [param, , min, max, step] (param)}
    <label>
      {param}: {step < 1 ? params[param].toFixed(2) : params[param]}
      <input type="range" {min} {max} {step} bind:value={params[param]} />
    </label>
  {/each}
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
