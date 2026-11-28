<script lang="ts">
  // A real component, because `bind:checked` writing back through a parent's state is the
  // whole mechanism under test — a hand-built checkbox would not exercise it.
  import DraggablePane from '#lib/DraggablePane.svelte'
  import type { ComponentProps } from 'svelte'

  type PaneProps = ComponentProps<typeof DraggablePane>
  let {
    dismiss_on,
    open = $bindable(false),
    on_open,
    on_close,
  }: Pick<PaneProps, `dismiss_on` | `on_open` | `on_close`> & {
    open?: boolean
  } = $props()
  let persistent = $state(false)
</script>

<input type="checkbox" bind:checked={open} />
<button data-testid="pointerdown-trigger" onpointerdown={() => (open = true)}>open</button
>
<DraggablePane bind:open bind:persistent {dismiss_on} {on_open} {on_close}>
  {#snippet children()}
    <div data-testid="content">pane content</div>
  {/snippet}
</DraggablePane>
<input type="checkbox" data-testid="persistent" bind:checked={persistent} />
