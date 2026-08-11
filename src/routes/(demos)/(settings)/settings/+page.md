## Settings

Four components for building a settings panel out of plain markup. They coordinate through
the DOM rather than a shared store, so rows stay ordinary `<label>`s and the pane keeps
owning its own state:

```svelte
<script>
  import {
    NumberRangeInput,
    SettingsGroup,
    SettingsSearch,
    SettingsSection,
  } from 'svelte-widgets'
</script>
```

A row opts into per-row reset and filtering by carrying `data-key`. Direct `label` and `.setting` children without `data-key` are also searchable; other section content still renders but is not indexed.

### `SettingsSearch`

Filters the rows below it as you type, hiding sections and groups that hold no match and
expanding the groups that do. Clearing the query puts every group back the way the user
left it. A row matches on its own text, its `data-label` and `data-description`, or on the
title of any section or group above it — so typing a heading name reveals what it holds.

`trigger` picks the chrome. The default `inline` keeps a labeled field in flow; `icon`
parks a magnifier in the pane's top-right corner and expands it in place on click, for
panes with no room to spare. Escape clears the query and, in `icon` mode, collapses the
field and returns focus to the magnifier.

```svelte example id="settings-search"
<script lang="ts">
  import { SettingsGroup, SettingsSearch, SettingsSection } from '$lib'

  let trigger = $state<`inline` | `icon`>(`icon`)
  let query = $state(``)
  let settings = $state({ atom_radius: 1, color_scheme: `Vesta`, damping: 0.1, zoom: 1 })
</script>

<label>
  Trigger
  <select bind:value={trigger}>
    {#each [`icon`, `inline`] as mode (mode)}<option>{mode}</option>{/each}
  </select>
</label>
{#if query}<small>filtering on <code>{query}</code></small>{/if}

<div
  class="demo-box"
  style="position: relative; max-width: 26em; margin-block: 1em; padding: 1ex"
>
  <SettingsSearch {trigger} bind:query>
    <SettingsGroup title="Appearance" open>
      <SettingsSection title="Atoms" layout="grid">
        <label data-key="atom_radius" data-description="Radius multiplier for each atom">
          <span>Atom radius</span>
          <input
            type="number"
            min="0"
            max="2"
            step="0.1"
            bind:value={settings.atom_radius}
          />
        </label>
        <label data-key="color_scheme" data-description="Element color palette">
          <span>Color scheme</span>
          <select bind:value={settings.color_scheme}>
            {#each [`Vesta`, `Jmol`, `Alloy`] as scheme (scheme)}<option>{scheme}</option
              >{/each}
          </select>
        </label>
      </SettingsSection>
    </SettingsGroup>
    <SettingsGroup title="Camera" subtitle="Navigation">
      <SettingsSection title="Pointer sensitivity" layout="grid">
        <label
          data-key="damping"
          data-description="Motion inertia after releasing the pointer"
        >
          <span>Damping</span>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            bind:value={settings.damping}
          />
        </label>
        <label data-key="zoom" data-description="Wheel zoom sensitivity">
          <span>Zoom speed</span>
          <input type="number" min="0" max="5" step="0.5" bind:value={settings.zoom} />
        </label>
      </SettingsSection>
    </SettingsGroup>
  </SettingsSearch>
</div>
```

Try `camera` to match a group by its title alone, or `inertia` to match a row by its
description. The component never writes `hidden` — it marks filtered rows with
`data-search-hidden`, so a row the surrounding app hides stays hidden and clearing the
query does not drag it back into view.

### `SettingsSection`

A titled region that diffs `current_values` against whatever it mounted with. Changed rows
grow a reset arrow, and the heading grows a Reset button once anything differs. Pass
`on_reset_key` to restore a single key; it receives the mounted value and whether that key
existed, so a caller can restore or delete it exactly.

`setting_metadata` supplies per-row descriptions, revealed by the Explain toggle, and
`layout="grid"` puts every row on one shared `[label] [value] [wide control]` rhythm so
controls line up down the section instead of starting wherever each label ends.

```svelte example id="settings-section"
<script lang="ts">
  import { SettingsSection } from '$lib'

  const defaults = { radius: 1, opacity: 0.8, show_labels: true }
  let settings = $state({ ...defaults })
</script>

<div class="demo-box" style="max-width: 26em; padding: 1ex">
  <SettingsSection
    title="Atoms"
    layout="grid"
    current_values={settings}
    setting_metadata={{
      radius: `Radius multiplier applied to every rendered atom`,
      opacity: `Fill opacity, 0 is fully transparent`,
      show_labels: `Draw the element symbol on each site`,
    }}
    on_reset_key={(key, value) => Reflect.set(settings, key, value)}
  >
    <label data-key="radius">
      <span>Radius</span>
      <input type="number" min="0" max="2" step="0.1" bind:value={settings.radius} />
    </label>
    <label data-key="opacity">
      <span>Opacity</span>
      <input type="number" min="0" max="1" step="0.05" bind:value={settings.opacity} />
    </label>
    <label data-key="show_labels">
      <span>Site labels</span>
      <input type="checkbox" bind:checked={settings.show_labels} />
    </label>
  </SettingsSection>
</div>
```

### `SettingsGroup`

A `<details>` one level above `SettingsSection`, for panes with more sections than fit on
screen. `open` is bindable and `subtitle` shows a short hint — a count, or the active mode
— that stays readable while collapsed.

```svelte example id="settings-group"
<script lang="ts">
  import { SettingsGroup } from '$lib'

  let open = $state(true)
</script>

<div class="demo-box" style="max-width: 26em; padding: 1ex">
  <SettingsGroup title="Appearance" subtitle={open ? `` : `3 settings`} bind:open>
    <label>Background <input type="color" value="#1a1a1a" /></label>
    <label>Grid <input type="checkbox" checked /></label>
    <label>Axes <input type="checkbox" /></label>
  </SettingsGroup>
  <SettingsGroup title="Camera" subtitle="Navigation">
    <label>Field of view <input type="range" /></label>
  </SettingsGroup>
</div>
```

### `NumberRangeInput`

A number input and a slider bound to one value, wrapped in a flex `<label>`. Pass `min`,
`max` and `step` directly, or hand it a JSON-schema-shaped object and the `setting` key to
read them from — `minimum`, `maximum`, `multipleOf` and `description` all come across, and
a missing entry throws rather than silently rendering an unbounded slider.

`data-key` defaults to `setting`, so a row drops into a searchable, resettable section
without repeating the key at the call site.

```svelte example id="number-range-input"
<script lang="ts">
  import { NumberRangeInput } from '$lib'

  const schema = {
    atom_radius: {
      minimum: 0,
      maximum: 2,
      multipleOf: 0.05,
      description: `Radius multiplier applied to every rendered atom`,
    },
  }
  let [radius, opacity] = $state([1, 0.5])
</script>

<div class="demo-box" style="display: grid; gap: 4pt; max-width: 26em; padding: 1ex">
  <NumberRangeInput setting="atom_radius" {schema} bind:value={radius}>
    Radius <small>&times;</small>
  </NumberRangeInput>
  <NumberRangeInput min={0} max={1} step={0.05} title="Fill opacity" bind:value={opacity}>
    Opacity
  </NumberRangeInput>
</div>

<p>radius {radius}, opacity {opacity}</p>
```

Hover either row for the tooltip: it uses the schema `description` when there is one, and
the `title` prop otherwise. The slider takes that same text as its accessible name, since
the wrapping `<label>` only names the number input.
