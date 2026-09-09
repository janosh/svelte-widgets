## Keep Selected in Dropdown

Configure how selected options behave in the dropdown. Try different modes:

```svelte example id="keep-selected-interactive"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  const languages =
    `JavaScript TypeScript CoffeeScript Python Ruby C C# C++ Go Swift Java Rust Kotlin Haskell Scala Clojure Erlang Elixir F# Dart Elm Julia Lua R OCaml Perl PHP`
      .split(` `)
      .toSorted()

  const keep_selected_options = [
    [false, 'Default behavior, selected options disappear from dropdown'],
    [
      'plain',
      'Selected options stay visible with left border and background color to differentiate them',
    ],
    ['checkboxes', 'Selected options stay visible and each is prefixed by a checkbox'],
  ] as const
  let selected: string[] = $state(['C', 'Go', 'TypeScript', 'Python'])
  let keepSelectedInDropdown: false | 'plain' | 'checkboxes' = $state('checkboxes')
</script>

{#each keep_selected_options as [mode, label] (mode)}
  <label>
    <input type="radio" bind:group={keepSelectedInDropdown} value={mode} /><code
      >keepSelectedInDropdown = {mode}</code
    >
    &nbsp; <span>{label}</span>
  </label>
{/each}

<MultiSelect
  id="tech-interactive"
  options={languages}
  bind:selected
  {keepSelectedInDropdown}
  placeholder="Choose languages..."
  closeDropdownOnSelect={false}
/>

<style>
  label {
    display: block;
    margin-block: 1em;
  }
  label > span {
    font-weight: 200;
  }
  label:last-of-type {
    margin-bottom: 2em;
  }
</style>
```
