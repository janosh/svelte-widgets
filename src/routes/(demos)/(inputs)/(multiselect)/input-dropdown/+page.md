## Editable Input Dropdown

Use `selected_display="input"` with `max_select={1}` for a `<datalist>`-like
autocomplete field backed by the existing dropdown
([discussion #221](https://github.com/janosh/svelte-widgets/discussions/221)).
The visible input is editable: `search_text` mirrors what the user sees and, when
the component has a `name`, is what the form submits. `value`/`selected` only
update once an option is committed (clicked or activated via `Enter`). Editing
the text after a commit clears `value` but keeps the draft in `search_text`.
Forward extra `<input>` attributes via `input_props` (e.g. `maxlength`,
`autocapitalize`, `aria-describedby`).
Click the caret after selecting an option or typing custom text to show the full
list, then click it again to close the dropdown. Committed options are marked
with `aria-selected="true"`.

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
  max_select={1}
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

Combine with `allow_user_options`, `create_option_msg={null}` and an empty
`no_matching_options_msg` for a "quiet" mode where typed text becomes the value
without any dropdown messaging — a near drop-in replacement for a plain
`<input>` that still benefits from option suggestions when `options` are
provided.

```svelte example id="quiet-datalist"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'

  let tag_text = $state(``)
</script>

<MultiSelect
  max_select={1}
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
