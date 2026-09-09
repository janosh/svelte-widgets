## Page-Reload Persistent MultiSelect

This example shows how to combine MultiSelect with `sessionStorage` to persist the `selected` state across page reloads.

```svelte example id="languages"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  const languages =
    `JavaScript TypeScript CoffeeScript Python Ruby C C# C++ Go Swift Java Rust Kotlin Haskell Scala Clojure Erlang Elixir F# Dart Elm Julia Lua R OCaml Perl PHP`
      .split(` `)
      .toSorted()
  import { onMount } from 'svelte'

  let selected: string[] = $state([])
  const default_languages = `Python TypeScript C Haskell`.split(` `)
  const is_language_array = (value: unknown): value is string[] =>
    Array.isArray(value) &&
    value.every((item) => typeof item === `string` && languages.includes(item))

  onMount(() => {
    try {
      const parsed: unknown = JSON.parse(sessionStorage.getItem(`languages`) ?? `null`)
      selected = is_language_array(parsed) ? parsed : default_languages
    } catch {
      selected = default_languages
    }
  })

  $effect(() => {
    if (sessionStorage) sessionStorage[`languages`] = JSON.stringify(selected)
  })
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

<MultiSelect options={languages} placeholder="What languages do you know?" bind:selected>
  {#snippet children({ idx, option })}
    {@render language_option(option, idx)}
  {/snippet}
</MultiSelect>
```

## Array Cloning Infinite Loop Prevention ([#309](https://github.com/janosh/svelte-widgets/issues/309))

Tests that binding to reactive wrappers (Svelte stores, Superforms, etc.) that clone arrays on assignment doesn't cause infinite loops.

```svelte example id="store-binding"
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'
  import { type Writable, writable } from 'svelte/store'

  // issue #309: store subscriptions looped forever before values_equal() in MultiSelect.svelte
  const options: string[] = [`Red`, `Green`, `Blue`]
  let increment = $state(0)
  let list_store: Writable<string[]> = writable([])

  list_store.subscribe(() => increment++)
</script>

<MultiSelect {options} bind:selected={$list_store} placeholder="Select colors..." />
<p id="store-binding-status">
  Modified: {increment} times
  {#if increment > 50}⚠️ Regression!{:else if increment > 1}✅ Fixed{/if}
</p>
```
