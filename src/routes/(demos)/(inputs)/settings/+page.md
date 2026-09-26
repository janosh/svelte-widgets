## Settings

Four components for building a settings panel out of plain markup. They coordinate through the DOM rather than a shared store, so rows stay ordinary `<label>`s and the pane keeps owning its own state:

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

Filters the rows below it as you type, hiding sections and groups that hold no match and expanding the groups that do. Clearing the query puts every group back the way the user left it. A row matches on its own text, its `data-label` and `data-description`, or on the title of any section or group above it — so typing a heading name reveals what it holds.

`trigger` picks the chrome. The default `inline` keeps a labeled field in flow; `icon` parks a magnifier in the pane's top-right corner and expands it in place on click, for panes with no room to spare. Escape clears the query and, in `icon` mode, collapses the field and returns focus to the magnifier.

```svelte example id="settings-search"
<script lang="ts">
  import { SettingsGroup, SettingsSearch, SettingsSection } from 'svelte-widgets'

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
  style="box-sizing: border-box; width: 100%; margin-inline: auto; border: 1px solid gray; border-radius: 5pt; box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3); position: relative; max-width: 26em; margin-block: 1em; padding: 1ex"
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

Try `camera` to match a group by its title alone, or `inertia` to match a row by its description. The component never writes `hidden` — it marks filtered rows with `data-search-hidden`, so a row the surrounding app hides stays hidden and clearing the query does not drag it back into view.

### `SettingsSection`

A titled region that displays reset controls for caller-supplied `changed_keys`. The caller owns values, defaults, and equality. Keyed rows reserve a reset gutter from the start; changed rows show a reset arrow. `on_reset_key(key)` restores one setting. The heading Reset button calls `on_reset`, or resets each changed key when that callback is omitted.

Each keyed row supplies its description through `data-description`, used by both Explain and SettingsSearch. Bind that attribute directly to a schema description when needed.

`layout="grid"` puts every row on one shared `[label] [value] [wide control]` rhythm so controls line up down the section instead of starting wherever each label ends.

```svelte example id="settings-section"
<script lang="ts">
  import { SettingsSection } from 'svelte-widgets'

  const defaults = { radius: 1, opacity: 0.8, show_labels: true }
  let settings = $state({ ...defaults })
</script>

<div
  style="box-sizing: border-box; width: 100%; margin-inline: auto; border: 1px solid gray; border-radius: 5pt; box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3); max-width: 26em; padding: 1ex"
>
  <SettingsSection
    title="Atoms"
    layout="grid"
    changed_keys={Object.keys(defaults).filter(
      (key) => Reflect.get(settings, key) !== Reflect.get(defaults, key),
    )}
    on_reset_key={(key) => Reflect.set(settings, key, Reflect.get(defaults, key))}
  >
    <label
      data-key="radius"
      data-description="Radius multiplier applied to every rendered atom"
    >
      <span>Radius</span>
      <input type="number" min="0" max="2" step="0.1" bind:value={settings.radius} />
    </label>
    <label data-key="opacity" data-description="Fill opacity, 0 is fully transparent">
      <span>Opacity</span>
      <input type="number" min="0" max="1" step="0.05" bind:value={settings.opacity} />
    </label>
    <label data-key="show_labels" data-description="Draw the element symbol on each site">
      <span>Site labels</span>
      <input type="checkbox" bind:checked={settings.show_labels} />
    </label>
  </SettingsSection>
</div>
```

### `SettingsGroup`

A `<details>` one level above `SettingsSection`, for panes with more sections than fit on screen. `open` is bindable and `subtitle` shows a short hint — a count, or the active mode — that stays readable while collapsed.

```svelte example id="settings-group"
<script lang="ts">
  import { SettingsGroup } from 'svelte-widgets'

  let open = $state(true)
</script>

<div
  style="box-sizing: border-box; width: 100%; margin-inline: auto; border: 1px solid gray; border-radius: 5pt; box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3); max-width: 26em; padding: 1ex"
>
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

A number input and a slider bound to one value, wrapped in a flex `<label>`. Pass `min`, `max` and `step` explicitly, and use `title` for the description.

Use native `data-key` to include a row in settings search and reset. Bounds must be numbers; `step` accepts a positive number or `"any"`. Numeric strings are rejected.

```svelte example id="number-range-input"
<script lang="ts">
  import { NumberRangeInput } from 'svelte-widgets'

  let [radius, opacity, pressure, gain] = $state([1, 0.5, 1e-4, 10])
</script>

<div
  style="box-sizing: border-box; width: 100%; margin-inline: auto; border: 1px solid gray; border-radius: 5pt; box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3); display: grid; gap: 4pt; max-width: 26em; padding: 1ex"
>
  <NumberRangeInput
    data-key="atom_radius"
    label="Radius"
    min={0}
    max={2}
    step={0.05}
    title="Radius multiplier applied to every rendered atom"
    bind:value={radius}
  >
    Radius <small>&times;</small>
  </NumberRangeInput>
  <NumberRangeInput
    min={0}
    max={1}
    step={0.05}
    label="Opacity"
    title="Fill opacity"
    bind:value={opacity}
  >
    Opacity
  </NumberRangeInput>
  <NumberRangeInput
    scale="log"
    min={1e-10}
    max={100}
    step={0.1}
    label="Pressure in bar"
    title="Pressure in bar"
    bind:value={pressure}
  >
    Pressure <small>bar</small>
  </NumberRangeInput>
  <NumberRangeInput
    scale="log"
    min={1}
    max={10}
    step={0.3}
    commit="change"
    label="Logarithmic gain"
    title="Logarithmic gain"
    bind:value={gain}>Gain</NumberRangeInput
  >
</div>

<p>radius {radius}, opacity {opacity}, pressure {pressure} bar, gain {gain}</p>
```

Hover a row's visible text for its `title` tooltip. The separate `label` names the slider for assistive technology. Without children, it also names the number input; with children, the visible text names that input. `number_props` and `range_props` can override individual ARIA attributes.

Use `scale="log"` for positive values across orders of magnitude. Bounds, the binding, numeric drafts, and `on_commit` stay in real units; the slider and arrow keys use base-10 exponent steps (`step={1}` multiplies or divides by 10). `step="any"` allows continuous dragging and uses one percent of the logarithmic span for keyboard steps. Zero, negative, and out-of-bounds numeric drafts never commit; valid typed values need not lie on the slider's step grid. Logarithmic bounds must be finite, strictly positive, and have distinct logarithms; a defined external value must lie inside them. Steps too small to change a representable value throw a configuration error.

The gain example keeps both endpoints selectable even though its step does not divide the span. Logarithmic number fields hide native spin buttons, whose additive increments cannot represent logarithmic steps; use the arrow keys or slider to step instead.

`commit="input"` (the default) updates while typing or dragging. `commit="change"` waits for change, blur, or Enter; a logarithmic arrow adjustment completes and commits one edit. Escape discards a numeric draft. Clearing retains the committed value unless `empty="undefined"` is set. `on_commit` receives each changed committed value once.
