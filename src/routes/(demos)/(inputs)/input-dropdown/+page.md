## Editable Input Dropdown

Use `selectedDisplay="input"` with `maxSelect={1}` for a `<datalist>`-like
autocomplete field backed by the existing dropdown
([discussion #221](https://github.com/janosh/svelte-widgets/discussions/221)).
The visible input is editable: `searchText` mirrors what the user sees and, when
the component has a `name`, is what the form submits. `value`/`selected` only
update once an option is committed (clicked or activated via `Enter`). Editing
the text after a commit clears `value` but keeps the draft in `searchText`.
Forward extra `<input>` attributes via `inputProps` (e.g. `maxlength`,
`autocapitalize`, `aria-describedby`).
Click the caret after selecting an option or typing custom text to show the full
list, then click it again to close the dropdown. Committed options are marked
with `aria-selected="true"`.

```svelte example id="input-dropdown"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'

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
  maxSelect={1}
  selectedDisplay="input"
  bind:searchText={color_text}
  bind:value={selected_color}
  placeholder="Type or pick a color"
  inputProps={{ maxlength: 20, [`aria-label`]: `Color input dropdown` }}
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

Combine with `allowUserOptions`, `createOptionMsg={null}` and an empty
`noMatchingOptionsMsg` for a "quiet" mode where typed text becomes the value
without any dropdown messaging — a near drop-in replacement for a plain
`<input>` that still benefits from option suggestions when `options` are
provided.

```svelte example id="quiet-datalist"
<script lang="ts">
  import { MultiSelect } from '$lib'

  let tag_text = $state(``)
</script>

<MultiSelect
  maxSelect={1}
  selectedDisplay="input"
  allowUserOptions
  createOptionMsg={null}
  noMatchingOptionsMsg=""
  bind:searchText={tag_text}
  name="tag"
  placeholder="Type any tag"
/>

<p id="quiet-datalist-state">Typed tag: <strong>{tag_text || `empty`}</strong></p>
```
