<script lang="ts">
  import ActionMenu from '#lib/ActionMenu.svelte'
  import type {
    ActionMenuCloseVia,
    ActionMenuOpenVia,
    ActionMenuTriggerProps,
    CmdAction,
  } from '#lib/types.ts'

  let {
    actions,
    open = $bindable(false),
    match_width = false,
    disabled = false,
    on_open,
    on_close,
  }: {
    actions: CmdAction[]
    open?: boolean
    match_width?: boolean
    disabled?: boolean
    on_open?: (detail: { via: ActionMenuOpenVia }) => void
    on_close?: (detail: { via: ActionMenuCloseVia }) => void
  } = $props()
</script>

<ActionMenu {actions} bind:open {match_width} {disabled} {on_open} {on_close}>
  {#snippet trigger(props: ActionMenuTriggerProps)}
    <span data-testid="action-menu-anchor">
      <button type="button" data-testid="action-menu-trigger" {...props}>Actions</button>
    </span>
  {/snippet}
</ActionMenu>
