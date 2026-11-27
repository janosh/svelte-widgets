```svelte example
<script lang="ts">
  import { MultiSelect, Tag } from 'svelte-widgets'

  const options = [`Svelte`, `TypeScript`, `CSS`, `Markdown`, `JavaScript`]
  let selected = $state([`Svelte`])
</script>

<label for="home-languages">Your toolkit</label>
<MultiSelect
  id="home-languages"
  {options}
  bind:value={selected}
  placeholder="Choose your languages…"
/>
<p aria-live="polite">
  Selected:
  {#each selected as language (language)}<Tag label={language} />{' '}{:else}None yet{/each}
</p>
```

[Explore MultiSelect and its recipes →](multiselect)
