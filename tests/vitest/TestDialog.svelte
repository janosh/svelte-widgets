<script lang="ts">
  import Dialog from '$lib/Dialog.svelte'
  import type { ComponentProps } from 'svelte'

  let {
    open = $bindable(false),
    nested = false,
    on_nested_close,
    ...props
  }: Omit<ComponentProps<typeof Dialog>, `children`> & {
    nested?: boolean
    on_nested_close?: ComponentProps<typeof Dialog>[`on_close`]
  } = $props()
  let surface = $state<HTMLDialogElement | null>(null)
  let nested_open = $state(false)
</script>

<div data-testid="dialog-home">
  <Dialog
    {...props}
    bind:open
    bind:surface
    aria-labelledby="test-dialog-title"
    data-testid="dialog-surface"
  >
    {#snippet trigger(trigger_props)}
      <button data-testid="dialog-trigger" {...trigger_props}>Open dialog</button>
    {/snippet}
    {#snippet header({ close })}
      <h2 id="test-dialog-title">Edit profile</h2>
      <button type="button" data-testid="dialog-close" onclick={close}>Close</button>
    {/snippet}
    {#snippet children({ close })}
      <button type="button" data-testid="dialog-action" onclick={close}>Save</button>
      {#if nested}
        <Dialog
          bind:open={nested_open}
          aria-label="Nested dialog"
          on_close={on_nested_close}
        >
          {#snippet trigger(trigger_props)}
            <button data-testid="nested-trigger" {...trigger_props}>Open nested</button>
          {/snippet}
          <button data-testid="nested-action">Nested action</button>
        </Dialog>
      {/if}
    {/snippet}
    {#snippet footer()}
      <small data-testid="dialog-footer">Changes are local</small>
    {/snippet}
  </Dialog>
  <output data-testid="bound-surface">{surface?.id ?? ``}</output>
</div>
