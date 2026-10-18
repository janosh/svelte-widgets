<script lang="ts">
  // Fixture for tests/playwright/DraggablePane.test.ts: widgets inside an open pane must
  // handle Escape before the pane's capture-phase Escape layer does. A native auto popover
  // closes through the browser's close watcher, which happy-dom lacks.
  import DraggablePane from '#lib/DraggablePane.svelte'
  import MultiSelect from '#lib/MultiSelect.svelte'
  import Popover from '#lib/Popover.svelte'

  let [pane_open, popover_open] = $state([false, false])
</script>

<p>pane: {pane_open} · popover: {popover_open}</p>
<div style="position: relative; height: 24em; display: flex; justify-content: flex-end">
  <DraggablePane bind:open={pane_open} persistent>
    {#snippet children()}
      <MultiSelect options={[`alpha`, `beta`, `gamma`]} placeholder="Pick" />
      <Popover bind:open={popover_open}>
        {#snippet trigger(props)}
          <button type="button" {...props}>Details</button>
        {/snippet}
        <p>Popover body</p>
        <button type="button">inner</button>
      </Popover>
    {/snippet}
  </DraggablePane>
</div>
