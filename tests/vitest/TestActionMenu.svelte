<script lang="ts">
  import ActionMenu from '#lib/ActionMenu.svelte'
  import type { ActionMenuTriggerProps, CmdAction } from '#lib/types.ts'
  import type { ComponentProps } from 'svelte'

  let {
    actions,
    open = $bindable(false),
    match_width = false,
    disabled = false,
    ...callbacks
  }: {
    actions: CmdAction[]
    open?: boolean
    match_width?: boolean
    disabled?: boolean
    // indexed, not Pick<>: svelte-check --tsgo rejects a Pick of ComponentProps
    on_open?: ComponentProps<typeof ActionMenu>[`on_open`]
    on_close?: ComponentProps<typeof ActionMenu>[`on_close`]
  } = $props()
</script>

<ActionMenu {actions} bind:open {match_width} {disabled} {...callbacks}>
  {#snippet trigger(props: ActionMenuTriggerProps)}
    <span data-testid="action-menu-anchor">
      <button type="button" data-testid="action-menu-trigger" {...props}>Actions</button>
    </span>
  {/snippet}
</ActionMenu>
