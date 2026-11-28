## Settings

Four components for building a settings panel from plain markup. They coordinate through the DOM rather than a shared store, so rows stay ordinary `<label>`s and the pane owns its state:

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

A row opts into per-row reset and filtering with `data-key`. Direct `label` and `.setting` children without `data-key` are also searchable; other section content renders but is not indexed.

`SettingsGroup` collapses by default. With `collapsible={false}` it is an always-open, unframed group headed by its title, for a few labeled control groups in a panel. Either way its controls sit in a `<fieldset>` named by the title, so `disabled` turns off the whole group.

### `SettingsSearch`

Filters the rows below it as you type, hiding sections and groups without a match and expanding the groups with one. Clearing the query restores every group as the user left it. A row matches on its own text, its `data-label` and `data-description`, or the title of any section or group above it, so typing a heading name reveals its contents.

`trigger` picks the chrome: the default `inline` keeps a labeled field in flow; `icon` parks a magnifier in the pane's top-right corner and expands it in place on click, for cramped panes. Escape clears the query and, in `icon` mode, collapses the field and refocuses the magnifier.

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

Try `camera` to match a group by its title, or `inertia` to match a row by its description. Filtered rows get `data-search-hidden`, never `hidden`, so a row the app hides itself stays hidden when the query clears.

### `SettingsSection`

A titled region with reset controls for caller-supplied `changed_keys`; the caller owns values, defaults and equality. Keyed rows reserve a reset gutter from the start and show a reset arrow once changed. `on_reset_key(key)` restores one setting. The heading Reset button calls `on_reset`, or `on_reset_key` for each changed key when `on_reset` is omitted.

A keyed row's `data-description` feeds both the Explain toggle (`bind:descriptions_open`) and SettingsSearch.

`layout="grid"` (default `flow`) puts every row on one `[label] [value] [wide control]` rhythm so controls line up down the section instead of starting wherever each label ends. Rows holding just a label and a checkbox (bare, or alone in a wrapper) pack into columns at least `--settings-pack-min` (default `8.5em`) wide, box first, and span the full line again while their description shows. Fieldset rows such as `ColorInput` put their legend in the label track.

```svelte example id="settings-section"
<script lang="ts">
  import { ColorInput, SettingsSection } from 'svelte-widgets'

  const defaults = {
    radius: 1,
    opacity: 0.8,
    show_labels: true,
    show_bonds: false,
    show_cell: true,
    color: `#6495ed`,
  }
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
    <label data-key="show_bonds" data-description="Connect neighboring atoms">
      <span>Bonds</span>
      <input type="checkbox" bind:checked={settings.show_bonds} />
    </label>
    <label data-key="show_cell" data-description="Outline the unit cell">
      <span>Unit cell</span>
      <input type="checkbox" bind:checked={settings.show_cell} />
    </label>
    <ColorInput data-key="color" label="Atom color" bind:value={settings.color} />
  </SettingsSection>
</div>
```

### `SettingsGroup`

A `<details>` one level above `SettingsSection`, for panes with more sections than fit on screen. `open` is bindable (default `false`) and `subtitle` shows a short hint, such as a count or the active mode, that stays readable while collapsed.

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

A number input and a slider bound to one value, in a flex `<label>`. `min`, `max` and `step` are required: bounds must be numbers and `step` a positive number or `"any"`; numeric strings are rejected. `title` holds the description, and `data-key` includes the row in settings search and reset.

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

Hover a row's visible text for its `title` tooltip. `label` names the slider for assistive technology, and also the number input when there are no children (otherwise the visible text names it). `number_props` and `range_props` override individual attributes, ARIA included.

`scale="log"` suits positive values spanning orders of magnitude. Bounds, the binding, numeric drafts and `on_commit` stay in real units; the slider and arrow keys step in base-10 exponents (`step={1}` multiplies or divides by 10). `step="any"` allows continuous dragging and uses one percent of the logarithmic span for keyboard steps. Zero, negative, and out-of-bounds numeric drafts never commit; valid typed values need not lie on the slider's step grid. Logarithmic bounds must be finite, strictly positive, and have distinct logarithms; a defined external value must lie inside them. Steps too small to change a representable value throw a configuration error.

Both endpoints stay selectable even when the step does not divide the span, as in the gain example. Logarithmic number fields hide native spin buttons, whose additive increments cannot represent logarithmic steps; the arrow keys and slider step instead.

`commit="input"` (default) updates while typing or dragging; `commit="change"` waits for change, blur or Enter, and a logarithmic arrow adjustment commits as one edit. Escape discards a numeric draft. Clearing retains the committed value unless `empty="undefined"` is set. `on_commit` receives each changed committed value once.
