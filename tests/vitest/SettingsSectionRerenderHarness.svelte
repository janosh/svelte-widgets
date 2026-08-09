<script lang="ts">
  import { SettingsSection } from '$lib'

  let current_values = $state({ radius: 1, diameter: 2, palette: `warm` })
  let generation = $state(0)
  let input_generation = $state(0)
  let row_key = $state<`radius` | `diameter`>(`radius`)
  let radius_visible = $state(true)
  let descriptions_open = $state(true)

  const reset_key = (
    key: string,
    reference_value: unknown,
    reference_present: boolean,
  ): void => {
    if (reference_present) Reflect.set(current_values, key, reference_value)
    else Reflect.deleteProperty(current_values, key)
  }
</script>

<button
  type="button"
  data-testid="change-radius"
  onclick={() => {
    current_values.radius = 2
    current_values.diameter = 3
  }}
>
  Change dimensions
</button>
<button type="button" data-testid="replace-radius" onclick={() => (generation += 1)}>
  Replace radius row
</button>
<button type="button" data-testid="replace-input" onclick={() => (input_generation += 1)}>
  Replace input
</button>
<button
  type="button"
  data-testid="change-key"
  onclick={() => (row_key = row_key === `radius` ? `diameter` : `radius`)}
>
  Change key
</button>
<button
  type="button"
  data-testid="toggle-radius"
  onclick={() => (radius_visible = !radius_visible)}
>
  Toggle radius row
</button>

<SettingsSection
  title="Atoms"
  {current_values}
  on_reset_key={reset_key}
  setting_metadata={{
    radius: `Radius of rendered atoms`,
    diameter: `Diameter of rendered atoms`,
    palette: `Palette used for rendered atoms`,
  }}
  bind:descriptions_open
  layout="grid"
>
  {#if radius_visible}
    {#key generation}
      <label data-key={row_key} data-generation={generation}>
        <span>Radius</span>
        {#key input_generation}
          <input type="range" bind:value={current_values.radius} />
        {/key}
      </label>
    {/key}
  {/if}
  <label data-key="palette">
    <span>Palette</span>
    <select bind:value={current_values.palette}>
      <option value="warm">Warm</option>
      <option value="cool">Cool</option>
    </select>
  </label>
</SettingsSection>
