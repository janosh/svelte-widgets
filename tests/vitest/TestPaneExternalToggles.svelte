<script lang="ts">
  // A real component, because `bind:checked` writing back through a parent's state is the
  // whole mechanism under test — a hand-built checkbox would not exercise it.
  import DraggablePane from '#lib/DraggablePane.svelte'

  let {
    dismiss_on,
    open = $bindable(false),
  }: { dismiss_on?: `press` | `release`; open?: boolean } = $props()
</script>

<input type="checkbox" bind:checked={open} />
<button data-testid="pointerdown-trigger" onpointerdown={() => (open = true)}>open</button
>
<DraggablePane bind:open {dismiss_on}>
  {#snippet children()}
    <div data-testid="content">pane content</div>
  {/snippet}
</DraggablePane>
