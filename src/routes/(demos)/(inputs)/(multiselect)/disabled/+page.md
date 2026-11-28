## Disabled MultiSelect

While disabled, the component shows a custom `disabled_icon` and, on hover, `disabled_input_title`.

```svelte example id="disabled-input-title"
<script lang="ts">
  import { MultiSelect, Toggle } from 'svelte-widgets'

  let disabled = $state(true)
  let selected: string[] = $state([`Svelte`])
</script>

<label for="toggle-disabled" style="display: block; margin-bottom: 1em">
  Disabled
  <Toggle bind:checked={disabled} id="toggle-disabled" />
</label>

<MultiSelect
  id="disabled"
  options={[`Svelte`, `React`, `Vue`, `Angular`]}
  bind:value={selected}
  {disabled}
  disabled_input_title="Super special disabled message (shows on hover)"
  --sms-disabled-bg="darkred"
>
  {#snippet disabled_icon()}
    <span>This component is disabled. It won't even open.</span>
  {/snippet}
</MultiSelect>

<p style="margin-top: 0.5em">Selected: {selected.join(', ')}</p>
```
