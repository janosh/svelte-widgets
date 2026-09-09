## Min/max number of selected options

`max_select={5}` prevents users from selecting more than 5 options.

```svelte example id="languages"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  const languages =
    `JavaScript TypeScript CoffeeScript Python Ruby C C# C++ Go Swift Java Rust Kotlin Haskell Scala Clojure Erlang Elixir F# Dart Elm Julia Lua R OCaml Perl PHP`
      .split(` `)
      .toSorted()

  let selected: string[] = $state(['JavaScript'])
  let max_msg: string | null = $state(null)
</script>

{#snippet language_option(option: string, idx?: number, style?: string)}
  {@const language = option.toLowerCase().replaceAll(`+`, `plus`).replace(`#`, `sharp`)}
  <span style={`display: inline-flex; align-items: center; gap: 5pt; ${style ?? ``}`}>
    {#if idx !== undefined}<strong>{idx + 1}</strong>{/if}
    <img
      src={`https://cdn.jsdelivr.net/gh/devicons/devicon/icons/${language}/${language}-original.svg`}
      alt={option}
      style={`height: 20px; ${option === `Rust` ? `filter: invert(1)` : ``}`}
      onerror={(event) => (event.currentTarget.hidden = true)}
    />
    {option}
  </span>
{/snippet}

<MultiSelect
  options={languages}
  max_select={5}
  placeholder="What languages do you know?"
  min_select={1}
  bind:selected
  on_max_reached={() => (max_msg = `Maximum of 5 reached!`)}
>
  {#snippet children({ option })}
    {@render language_option(option)}
  {/snippet}
</MultiSelect>

<p style="margin-top: 0.5em">
  Selected ({selected.length}/5): {selected.join(', ')}
  {#if max_msg}<span style="color: #e74c3c; margin-left: 1em">{max_msg}</span>{/if}
</p>
```

When setting an integer value for `max_select` Multiselect will

- close options dropdown when reaching `max_select` items
- prevent users from selecting more options after reaching `max_select` items

`required={3}` means users have to pick at least 3 options before they can submit a form.

```svelte example id="required-three"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'

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
    sort_selected
    placeholder="Pick at least 3..."
  />
  <button>submit</button>
</form>
```

`max_select={n}` and `required={m}` can be combined when `n >= m`.

```svelte example id="max-select-with-required"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'

  function handle_submit(event: SubmitEvent): void {
    const form_entries = [...new FormData(event.target as HTMLFormElement)]
    alert(`form data received by submit handler:\n${JSON.stringify(form_entries)}`)
  }
</script>

<form onsubmit={handle_submit}>
  <MultiSelect
    options={[1, 2, 3, 4, 5, 6]}
    required={2}
    max_select={3}
    name="numbers"
    sort_selected
  />
  <button>submit</button>
</form>
```

## Select All Option

Use `select_all_option` to add a "Select all" button at the top of the dropdown. It respects `max_select` (only selects up to the limit) and skips disabled options. Optionally set `shortcuts={{ select_all: 'ctrl+a' }}` to enable the keyboard shortcut (disabled by default to avoid hijacking the browser's native Ctrl+A).

```svelte example id="select-all-option-demo"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'

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
  select_all_option
  shortcuts={{ select_all: `ctrl+a` }}
  max_select={5}
  placeholder="Pick your favorite fruits"
/>

<p>Selected ({selected.length}/5): {selected.join(`, `) || `none`}</p>
```

Pass a string to customize the label:

```svelte example id="select-all-custom-label"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { ObjectOption } from 'svelte-widgets'

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
  select_all_option="Add all colors"
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

For single select (`max_select={1}`), you can use `bind:value` to initialize the selected option. Simpler than `selected={[option]}`. Works with any option type (strings, numbers, objects).

```svelte example id="single-select-bind-value"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import type { ObjectOption } from 'svelte-widgets'

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

<MultiSelect {options} bind:value={selected_color} max_select={1} />

<p style="color: {selected_color?.value}">
  Selected: <strong>{selected_color?.label ?? `none`}</strong>
</p>
```

```svelte example id="single-select-html-labels"
<script lang="ts">
  // for https://github.com/janosh/svelte-widgets/issues/249
  import { MultiSelect } from 'svelte-widgets'
  import type { ObjectOption } from 'svelte-widgets'

  const red_pill = `🔴 Red Pill`
  const blue_pill = `🔵 Blue Pill`
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

<MultiSelect {options} max_select={1} bind:value />
```
