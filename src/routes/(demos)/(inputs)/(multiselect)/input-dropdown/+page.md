## Editable Input Dropdown

`selected_display="input"` with `mode="single"` makes a `<datalist>`-like autocomplete field ([janosh/svelte-widgets#221](https://github.com/janosh/svelte-widgets/discussions/221)). `search_text` mirrors the editable input and, given a `name`, is what the form submits. `value` only updates once an option is committed (clicked or chosen with Enter); editing the text afterwards clears `value` but keeps the draft in `search_text`. Committed options get `aria-selected="true"`. Extra `<input>` attributes (e.g. `maxlength`, `autocapitalize`, `aria-describedby`) go in `input_props`. The caret toggles the full, unfiltered list, even after a selection or with custom text typed.

```svelte example id="input-dropdown"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { ObjectOption } from 'svelte-widgets'

  interface ColorOption extends ObjectOption {
    value: string
  }

  const color_options: ColorOption[] = [
    { label: `Red`, value: `#e05060` },
    { label: `Green`, value: `#30a050` },
    { label: `Blue`, value: `#4080d0` },
  ]
  let color_text = $state(``)
  let selected_color: ColorOption | null = $state(null)
</script>

<MultiSelect
  options={color_options}
  mode="single"
  selected_display="input"
  bind:search_text={color_text}
  bind:value={selected_color}
  placeholder="Type or pick a color"
  input_props={{ maxlength: 20, [`aria-label`]: `Color input dropdown` }}
>
  {#snippet option({ option })}
    <span style="color: {option.value}">{option.label}</span>
  {/snippet}
</MultiSelect>

<p id="input-dropdown-state">
  Typed: <strong>{color_text || `empty`}</strong>, selected:
  <strong>{selected_color?.label ?? `none`}</strong>
</p>
```

## Quiet Datalist Mode

Adding `allow_user_options`, `create_option_msg={null}` and an empty `no_matching_options_msg` silences all dropdown messages and submits typed text as-is: a near drop-in for a plain `<input>` that still suggests any `options` you pass.

```svelte example id="quiet-datalist"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'

  let tag_text = $state(``)
</script>

<MultiSelect
  mode="single"
  selected_display="input"
  allow_user_options
  create_option_msg={null}
  no_matching_options_msg=""
  bind:search_text={tag_text}
  name="tag"
  placeholder="Type any tag"
/>

<p id="quiet-datalist-state">Typed tag: <strong>{tag_text || `empty`}</strong></p>
```
