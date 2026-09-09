## Disabled MultiSelect

Toggle the checkbox to enable/disable the component. When disabled, it shows a custom icon and tooltip.

```svelte example id="disabled-input-title"
<script lang="ts">
  import { MultiSelect, Toggle } from '$lib'

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
  bind:selected
  {disabled}
  disabledInputTitle="Super special disabled message (shows on hover)"
  --sms-disabled-bg="darkred"
>
  {#snippet disabledIcon()}
    <span>This component is disabled. It won't even open.</span>
  {/snippet}
</MultiSelect>

<p style="margin-top: 0.5em">Selected: {selected.join(', ')}</p>
```

The mouse tooltip will show `disabledInputTitle` when hovering the disabled component.
