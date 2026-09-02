## Page-Reload Persistent MultiSelect

This example shows how to combine MultiSelect with `sessionStorage` to persist the `selected` state across page reloads.

```svelte example id="languages"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import { languages } from '$site/options'
  import { LanguageSnippet } from '$site'
  import { onMount } from 'svelte'

  let selected: string[] = $state([])
  const default_languages = `Python TypeScript C Haskell`.split(` `)
  const is_string_array = (value: unknown): value is string[] =>
    Array.isArray(value) && value.every((item) => typeof item === `string`)

  onMount(() => {
    try {
      const parsed: unknown = JSON.parse(sessionStorage.getItem(`languages`) ?? `null`)
      selected = is_string_array(parsed) ? parsed : default_languages
    } catch {
      selected = default_languages
    }
  })

  $effect(() => {
    if (sessionStorage) sessionStorage[`languages`] = JSON.stringify(selected)
  })
</script>

<MultiSelect options={languages} placeholder="What languages do you know?" bind:selected>
  {#snippet children({ idx, option })}
    <LanguageSnippet {option} {idx} />
  {/snippet}
</MultiSelect>
```

## Array Cloning Infinite Loop Prevention ([#309](https://github.com/janosh/svelte-widgets/issues/309))

Tests that binding to reactive wrappers (Svelte stores, Superforms, etc.) that clone arrays on assignment doesn't cause infinite loops.

```svelte example id="store-binding"
<script lang="ts">
  import { MultiSelect } from '$lib'
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
