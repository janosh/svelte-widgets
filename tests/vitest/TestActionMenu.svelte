<script lang="ts">
  import ActionMenu from '$lib/ActionMenu.svelte'
  import type { CmdAction } from '$lib/types'

  let {
    actions,
    open = $bindable(false),
    match_width = false,
  }: {
    actions: CmdAction[]
    open?: boolean
    match_width?: boolean
  } = $props()
</script>

<ActionMenu {actions} bind:open {match_width}>
  {#snippet trigger(props)}
    <span data-testid="action-menu-anchor">
      <button type="button" data-testid="action-menu-trigger" {...props}>Actions</button>
    </span>
  {/snippet}
</ActionMenu>
