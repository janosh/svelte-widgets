<script lang="ts">
  import Sheet from '$lib/Sheet.svelte'
  import type { ComponentProps } from 'svelte'

  // Compile-time coverage: Sheet accepts native dialog attributes while its parameterized
  // children snippet remains a snippet rather than HTMLAttributes.children.
  let {
    open = $bindable(false),
    ...props
  }: Omit<ComponentProps<typeof Sheet>, `children`> = $props()
</script>

<Sheet {...props} bind:open aria-labelledby="test-sheet-title">
  {#snippet trigger(trigger_props)}
    <button data-testid="sheet-trigger" {...trigger_props}>Open sheet</button>
  {/snippet}
  {#snippet header()}
    <h2 id="test-sheet-title">Settings</h2>
  {/snippet}
  {#snippet children({ close })}
    <button type="button" data-testid="sheet-action" onclick={close}>Save</button>
  {/snippet}
  {#snippet footer()}
    <small data-testid="sheet-footer">Unsaved changes</small>
  {/snippet}
</Sheet>
