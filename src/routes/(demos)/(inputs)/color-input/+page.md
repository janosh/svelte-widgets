<script lang="ts">
  import Icon from '$lib/Icon.svelte'
  import { Palette, Opacity, ShieldCheck } from '$lib/icons'
</script>

## <Icon icon={Palette} class="heading-icon" aria-hidden="true" /> ColorInput

A native color picker, editable hex field, and optional opacity number input share one bindable color. Presets offer quick choices for palettes used throughout an application.

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

### <Icon icon={Opacity} class="heading-icon" aria-hidden="true" /> Transparency

Set `alpha` to accept transparent colors and show an opacity number input from 0 to 100%. Enter a whole percentage or use the arrow keys to adjust it. Empty or invalid entries leave the color unchanged; blur or Escape restores the committed opacity. Colors use `#rrggbbaa`: setting opacity to zero preserves the RGB channels, so raising it again restores the chosen color. The checkerboard swatches show transparency, while the native picker edits RGB without changing opacity.

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

### <Icon icon={ShieldCheck} class="heading-icon" aria-hidden="true" /> Validation and commits

The hex field accepts three or six digits, or four or eight digits with `alpha`, with an optional `#`. Commits normalize values to lowercase six-digit hex, or eight-digit hex when alpha is enabled. Invalid drafts show an accessible error and leave the committed value intact; blur or Escape restores that value. Invalid initial values and presets throw an error.

`commit="input"` updates the binding and calls `on_commit(value)` for each valid change. Use `commit="change"` to defer updates until change, blur, or Enter. Presets always commit immediately. Repeated commits of the same color do not fire again, and parent-driven value changes update the controls without firing `on_commit`.

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

`name` includes the hex field in native form submissions. `disabled` disables every control, while `readonly` keeps the hex field selectable and prevents edits. Use `label` for the visible fieldset legend and `labels` to translate the picker, hex field, opacity, preset buttons, and validation message. Style the fieldset with standard `class` and `style` props; `--color-input-focus` and `--color-input-error` customize its focus and validation colors.
