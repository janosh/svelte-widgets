<script lang="ts">
  import MultiSelect from '$lib/MultiSelect.svelte'
  import type { SelectAllScope } from '$lib/types'

  const options = [
    `Write release notes`,
    `Update examples`,
    `Verify keyboard flows`,
    `Record bundle sizes`,
    `Review migration guide`,
    `Publish prerelease`,
  ]

  let selected = $state<string[]>([])
  let select_all_scope = $state<SelectAllScope>(`visible`)
</script>

<svelte:head><title>Range and select-all scopes demo</title></svelte:head>

<section class="demo" style="max-width: 42rem; margin: 2rem auto">
  <h1>Range and select-all scopes</h1>
  <p>
    Select an anchor, then Shift-click or use Shift+Arrow to add an inclusive range. The
    scope selector controls whether select-all includes rows beyond <code>maxOptions</code
    >.
  </p>

  <label style="display: grid; max-width: 18rem; gap: 0.35rem; margin: 1.5rem 0 1rem">
    Select-all scope
    <select bind:value={select_all_scope} style="padding: 0.4rem; font: inherit">
      <option value="visible">Visible rows only</option>
      <option value="matching">All local matches</option>
    </select>
  </label>

  <MultiSelect
    {options}
    bind:selected
    inputProps={{ [`aria-label`]: `Filter roadmap tasks` }}
    keepSelectedInDropdown="checkboxes"
    maxOptions={4}
    rangeSelect
    selectAllOption="Select scope"
    selectAllScope={select_all_scope}
  />

  <p>Selected: {selected.join(`, `) || `none`}</p>
</section>
