<script lang="ts">
  import { FileDetails } from '$lib'
  import language_snippet_src from '$site/LanguageSnippet.svelte?raw'
  import options_src from '$site/options.ts?raw'
</script>

## Min/max number of selected options

`maxSelect={5}` prevents users from selecting more than 5 options.

```svelte example id="languages"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import { languages } from '$site/options'
  import { LanguageSnippet } from '$site'

  let selected: string[] = $state(['JavaScript'])
  let max_msg: string | null = $state(null)
</script>

<MultiSelect
  options={languages}
  maxSelect={5}
  placeholder="What languages do you know?"
  minSelect={1}
  bind:selected
  onmaxreached={() => (max_msg = `Maximum of 5 reached!`)}
>
  {#snippet children({ option })}
    <LanguageSnippet {option} />
  {/snippet}
</MultiSelect>

<p style="margin-top: 0.5em">
  Selected ({selected.length}/5): {selected.join(', ')}
  {#if max_msg}<span style="color: #e74c3c; margin-left: 1em">{max_msg}</span>{/if}
</p>
```

<FileDetails files={[
{ title: `LanguageSnippet.svelte`, content: language_snippet_src },
{ title: `options.ts`, content: options_src },
]} />

When setting an integer value for `maxSelect` Multiselect will

- close options dropdown when reaching `maxSelect` items
- prevent users from selecting more options after reaching `maxSelect` items

`required={3}` means users have to pick at least 3 options before they can submit a form.

```svelte example id="required-three"
<script lang="ts">
  import { MultiSelect } from '$lib'

  function handle_submit(event: SubmitEvent): void {
    const form_entries = [...new FormData(event.target as HTMLFormElement)]
    alert(`form data received by submit handler:\n${JSON.stringify(form_entries)}`)
  }
</script>

<form onsubmit={handle_submit}>
  <MultiSelect
    options={[1, 2, 3, 4, 5, 6]}
    required={3}
    name="numbers"
    sortSelected
    placeholder="Pick at least 3..."
  />
  <button>submit</button>
</form>
```

`maxSelect={n}` and `required={m}` can be combined when `n >= m`.

```svelte example id="max-select-with-required"
<script lang="ts">
  import { MultiSelect } from '$lib'

  function handle_submit(event: SubmitEvent): void {
    const form_entries = [...new FormData(event.target as HTMLFormElement)]
    alert(`form data received by submit handler:\n${JSON.stringify(form_entries)}`)
  }
</script>

<form onsubmit={handle_submit}>
  <MultiSelect
    options={[1, 2, 3, 4, 5, 6]}
    required={2}
    maxSelect={3}
    name="numbers"
    sortSelected
  />
  <button>submit</button>
</form>
```

## Select All Option

Use `selectAllOption` to add a "Select all" button at the top of the dropdown. It respects `maxSelect` (only selects up to the limit) and skips disabled options. Optionally set `shortcuts={{ select_all: 'ctrl+a' }}` to enable the keyboard shortcut (disabled by default to avoid hijacking the browser's native Ctrl+A).

```svelte example id="select-all-option"
<script lang="ts">
  import { MultiSelect } from '$lib'

  const fruits: string[] = [
    `Apple`,
    `Banana`,
    `Cherry`,
    `Date`,
    `Elderberry`,
    `Fig`,
    `Grape`,
  ]
  let selected: string[] = $state([])
</script>

<MultiSelect
  options={fruits}
  bind:selected
  selectAllOption
  shortcuts={{ select_all: `ctrl+a` }}
  maxSelect={5}
  placeholder="Pick your favorite fruits"
/>

<p>Selected ({selected.length}/5): {selected.join(`, `) || `none`}</p>
```

Pass a string to customize the label:

```svelte example id="select-all-custom-label"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'

  interface ColorOption extends ObjectOption {
    value: string
  }

  const colors: ColorOption[] = [
    { label: `Red`, value: `#ff6b6b` },
    { label: `Orange`, value: `#ffa94d` },
    { label: `Yellow`, value: `#ffd43b` },
    { label: `Green`, value: `#69db7c` },
    { label: `Blue`, value: `#4dabf7` },
    { label: `Purple`, value: `#9775fa` },
  ]
  let selected: ColorOption[] = $state([])
</script>

<MultiSelect
  options={colors}
  bind:selected
  selectAllOption="Add all colors"
  placeholder="Select colors..."
/>

<div style="display: flex; gap: 4px; margin-top: 8px; flex-wrap: wrap;">
  {#each selected as color}
    <span style="background: {color.value}; padding: 4px 8px; border-radius: 4px;">
      {color.label}
    </span>
  {/each}
</div>
```

## Initialize with `value` prop

For single select (`maxSelect={1}`), you can use `bind:value` to initialize the selected option. Simpler than `selected={[option]}`. Works with any option type (strings, numbers, objects).

```svelte example id="single-select-bind-value"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'

  interface ColorOption extends ObjectOption {
    value: string
  }

  const options: ColorOption[] = [
    { label: `Red`, value: `#e05060` },
    { label: `Green`, value: `#30a050` },
    { label: `Blue`, value: `#4080d0` },
  ]
  let selected_color: ColorOption | null = $state(options[2]) // Preselect Blue
</script>

<MultiSelect {options} bind:value={selected_color} maxSelect={1} />

<p style="color: {selected_color?.value}">
  Selected: <strong>{selected_color?.label ?? `none`}</strong>
</p>
```

```svelte example id="single-select-html-labels"
<script lang="ts">
  // for https://github.com/janosh/svelte-widgets/issues/249
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'

  const red_pill = `🔴  &ensp; Red Pill (<a href="https://wikipedia.org/wiki/Red_pill_and_blue_pill">what?</a>)`
  const blue_pill = `🔵  &ensp; Blue Pill &nbsp; <img height="35px" style="vertical-align: middle;" src="https://upload.wikimedia.org/wikipedia/en/a/ab/Morpheus.jpg" />`
  const options: ObjectOption[] = [
    {
      label: red_pill,
      value: `red pill`,
      preselected: true,
    },
    {
      label: blue_pill,
      value: `blue pill`,
    },
  ]

  let value: ObjectOption | null = $state(null)
</script>

<MultiSelect {options} maxSelect={1} parseLabelsAsHtml bind:value />
```
