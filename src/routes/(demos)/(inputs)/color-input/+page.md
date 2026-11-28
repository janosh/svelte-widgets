<script lang="ts">
  import Icon from '#lib/Icon.svelte'
  import { Palette, Opacity, ShieldCheck } from '#lib/icons.ts'
</script>

## <Icon icon={Palette} class="heading-icon" /> ColorInput

A native color picker, an editable hex field and an optional opacity input share one bindable `value` (default `#000000`). `presets` adds one-click swatches for an app's palette.

```svelte example id="color-input-basic"
<script lang="ts">
  import { ColorInput } from 'svelte-widgets'

  let color = $state(`#6495ed`)
</script>

<ColorInput
  bind:value={color}
  label="Accent color"
  presets={[`#6495ed`, `#e76f51`, `#2a9d8f`, `#e9c46a`]}
/>
<p style:color>Selected color: <code>{color}</code></p>
```

### <Icon icon={Opacity} class="heading-icon" /> Transparency

`alpha` accepts transparent colors and adds an opacity input from 0 to 100% (whole percentages, or arrow keys). Empty or invalid entries leave the color unchanged; blur or Escape restores the committed opacity. Colors use `#rrggbbaa`, and zero opacity keeps the RGB channels, so raising it again restores the color. Checkerboard swatches show transparency; the native picker edits RGB without touching opacity.

```svelte example id="color-input-alpha"
<script lang="ts">
  import { ColorInput } from 'svelte-widgets'

  let color = $state(`#e76f5180`)
</script>

<ColorInput
  bind:value={color}
  alpha
  label="Surface fill"
  presets={[`#e76f5180`, `#2a9d8f80`, `#6495ed00`]}
/>
<div style="margin-top: 1em; padding: 1em; border-radius: 0.5em; background: {color}">
  Surface fill: <code>{color}</code>
</div>
```

### <Icon icon={ShieldCheck} class="heading-icon" /> Validation and commits

The hex field accepts three or six digits (four or eight with `alpha`), with an optional `#`. Commits normalize to lowercase `#rrggbb`, or `#rrggbbaa` with `alpha`. Invalid drafts show an accessible error and leave the committed value intact; blur or Escape restores it. Invalid initial values and presets throw.

`commit="input"` (default) updates the binding and calls `on_commit(value)` on each valid change; `commit="change"` defers until change, blur or Enter. Presets always commit immediately. Re-committing the same color does not fire again, and parent-driven value changes update the controls without firing `on_commit`.

```svelte example id="color-input-commit"
<script lang="ts">
  import { ColorInput } from 'svelte-widgets'

  let color = $state(`#2a9d8f`)
  let commits = $state(0)
</script>

<ColorInput
  bind:value={color}
  label="Commit on change"
  commit="change"
  on_commit={() => (commits += 1)}
/>
<p>Committed: <code>{color}</code> · updates: {commits}</p>
```

`name` includes the hex field in native form submissions. `disabled` disables every control; `readonly` prevents edits but keeps the hex field selectable. `label` is the visible fieldset legend, and `labels` translates the picker, hex field, opacity, preset buttons and validation message. Style the fieldset with `class` and `style`; `--color-input-focus` and `--color-input-error` set its focus and validation colors.
