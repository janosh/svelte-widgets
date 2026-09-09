## Duplicates MultiSelect

```svelte example id="duplicates-demo"
<script lang="ts">
  import { MultiSelect } from '$lib'
  import type { ObjectOption } from '$lib/types'

  interface IdOption extends ObjectOption {
    id: number
  }

  let duplicates = $state(true)
  const options: IdOption[] = [
    { label: 'Duplicate label', id: 1 },
    { label: 'Duplicate label', id: 1 },
    { label: 'Duplicate label', id: 2 },
  ]
  let selected: IdOption[] = $state([options[0]])
  let key: string = $state(`JSON.stringify`)
  let dupe_msg: string | null = $state(null)
</script>

Allow duplicates: <input type="checkbox" bind:checked={duplicates} />

<label for="key">
  Key
  <input bind:group={key} type="radio" name="key" value="JSON.stringify" /> JSON.stringify
  <input bind:group={key} type="radio" name="key" value="===" /> ===
</label>

<MultiSelect
  id="duplicates"
  {options}
  bind:selected
  {duplicates}
  key={key === 'JSON.stringify' ? JSON.stringify : (option) => option}
  onduplicate={({ option }) => (dupe_msg = `'${option.label}' is already selected`)}
/>

{#if dupe_msg}
  <p style="color: #e74c3c; margin-top: 0.5em">{dupe_msg}</p>
{/if}

<pre>{JSON.stringify(selected)}</pre>
```
