<script lang="ts">
  import Popover from '#lib/Popover.svelte'
  import type { ComponentProps } from 'svelte'

  // Kept out of TestSnippetHarness: one more branch there makes the discriminated
  // union too complex for TS to narrow, which mistypes every other branch.
  let {
    open = $bindable(false),
    ...props
  }: Omit<ComponentProps<typeof Popover>, `children`> = $props()
</script>

<Popover {...props} bind:open>
  {#snippet trigger(trigger_props)}
    <button data-testid="popover-trigger" {...trigger_props}>open</button>
  {/snippet}
  <button data-testid="popover-item">inside</button>
</Popover>
