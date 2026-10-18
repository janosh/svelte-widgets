<script lang="ts">
  // Inner widgets inside an open pane: their own Escape must win over the pane's.
  import ColorInput from '#lib/ColorInput.svelte'
  import DraggablePane from '#lib/DraggablePane.svelte'
  import JsonTree from '#lib/json-tree/JsonTree.svelte'
  import MultiSelect from '#lib/MultiSelect.svelte'
  import NumberRangeInput from '#lib/NumberRangeInput.svelte'
  import RangeSlider from '#lib/RangeSlider.svelte'
  import SettingsSearch from '#lib/SettingsSearch.svelte'

  let {
    widget,
    open = $bindable(true),
  }: {
    widget: `multiselect` | `color` | `number` | `range` | `search` | `json`
    open?: boolean
  } = $props()
  let number_value = $state<number | undefined>(5)
</script>

<DraggablePane bind:open>
  {#snippet children()}
    {#if widget === `multiselect`}
      <MultiSelect options={[`a`, `b`, `c`]} />
    {:else if widget === `color`}
      <ColorInput value="#ff0000" />
    {:else if widget === `number`}
      <NumberRangeInput bind:value={number_value} min={0} max={10} step={1} label="n" />
    {:else if widget === `range`}
      <RangeSlider value={[2, 8]} min={0} max={10} />
    {:else if widget === `search`}
      <SettingsSearch>
        <p>row</p>
      </SettingsSearch>
    {:else}
      <JsonTree
        value={{ name: `x`, n: 1 }}
        editable
        default_fold_level={5}
        on_change={() => {}}
      />
    {/if}
  {/snippet}
</DraggablePane>
