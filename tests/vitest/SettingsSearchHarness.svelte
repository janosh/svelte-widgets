<script lang="ts">
  import { SettingsGroup, SettingsSearch, SettingsSection } from '$lib'
  import { untrack } from 'svelte'

  // Seeds the field the way a restored session or a deep link would, without the user
  // ever touching the trigger. Owned here so the component's writes land somewhere live.
  let {
    trigger = `inline`,
    initial_query = ``,
  }: {
    trigger?: `inline` | `icon`
    initial_query?: string
  } = $props()
  let query = $state(untrack(() => initial_query))
  let appearance_open = $state(true)
  let camera_open = $state(false)
  let zoom_speed_hidden = $state(false)
</script>

<button
  type="button"
  data-testid="hide-zoom-speed"
  onclick={() => (zoom_speed_hidden = true)}
>
  Hide zoom speed
</button>

<SettingsSearch {trigger} bind:query>
  <!-- Keyed content outside settings sections must remain visible while filtering. -->
  <div data-key="chart-legend">Unrelated chart legend</div>
  <SettingsGroup title="Appearance" class="appearance-group" bind:open={appearance_open}>
    <SettingsSection
      title="Atoms"
      layout="grid"
      current_values={{ atom_radius: 1, color_scheme: `Vesta` }}
      setting_metadata={{
        atom_radius: { description: `Radius multiplier for rendered atoms` },
        color_scheme: { description: `Element color palette` },
      }}
    >
      <label data-key="atom_radius"><span>Atom radius</span><input type="range" /></label>
      <label data-key="color_scheme" hidden
        ><span>Color scheme</span><select></select></label
      >
      <!-- no data-key: nothing resets it individually, but search must still find it -->
      <label><span>Sphere segments</span><input type="number" /></label>
      <!-- a keyed wrapper whose own rows are keyed too, so the two nest -->
      <div class="setting" data-key="rotation" data-label="Rotation axes">
        <label data-key="rotation_x"><span>X</span><input type="number" /></label>
        <label data-key="rotation_y"><span>Y</span><input type="number" /></label>
      </div>
      <div class="setting"><span>Surface quality</span><select></select></div>
    </SettingsSection>
  </SettingsGroup>
  <SettingsGroup title="Camera" subtitle="Navigation" bind:open={camera_open}>
    <SettingsSection
      title="Pointer sensitivity"
      current_values={{ rotation_damping: 0.1, zoom_speed: 1 }}
      setting_metadata={{
        rotation_damping: { description: `Motion inertia after releasing the pointer` },
        zoom_speed: { description: `Pointer wheel zoom sensitivity` },
      }}
    >
      <label data-key="rotation_damping"><span>Damping</span><input type="range" /></label
      >
      <label data-key="zoom_speed" hidden={zoom_speed_hidden}>
        <span>Zoom speed</span><input type="range" />
      </label>
    </SettingsSection>
  </SettingsGroup>
</SettingsSearch>
