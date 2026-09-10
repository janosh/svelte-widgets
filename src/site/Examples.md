```svelte example
<script lang="ts">
  import { MultiSelect } from 'svelte-widgets'

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
<p aria-live="polite">Selected: {selected.join(`, `) || `None yet`}</p>
```

[Explore MultiSelect and its recipes →](multiselect)
