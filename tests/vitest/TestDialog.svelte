<script lang="ts">
  import Dialog from '$lib/Dialog.svelte'
  import Sheet from '$lib/Sheet.svelte'
  import type { ComponentProps } from 'svelte'

  // Compile-time coverage: Dialog and Sheet accept native dialog attributes while their
  // parameterized children snippet remains a snippet rather than HTMLAttributes.children.
  let {
    open = $bindable(false),
    nested = false,
    on_nested_close,
    sheet = false,
    ...props
  }: Omit<ComponentProps<typeof Sheet>, `children`> & {
    nested?: boolean
    on_nested_close?: ComponentProps<typeof Dialog>[`on_close`]
    sheet?: boolean // render through Sheet, which must forward everything to Dialog
  } = $props()
  let surface = $state<HTMLDialogElement | null>(null)
  const Surface = $derived(sheet ? Sheet : Dialog)
</script>

<Surface {...props} bind:open bind:surface aria-labelledby="test-dialog-title">
  {#snippet trigger(trigger_props)}
    <button data-testid="dialog-trigger" {...trigger_props}>Open dialog</button>
  {/snippet}
  {#snippet header()}
    <h2 id="test-dialog-title">Edit profile</h2>
  {/snippet}
  {#snippet children({ close })}
    <button type="button" data-testid="dialog-action" onclick={close}>Save</button>
    {#if nested}
      <Dialog aria-label="Nested dialog" on_close={on_nested_close}>
        {#snippet trigger(trigger_props)}
          <button data-testid="nested-trigger" {...trigger_props}>Open nested</button>
        {/snippet}
        <button>Nested action</button>
      </Dialog>
    {/if}
  {/snippet}
  {#snippet footer()}
    <small data-testid="dialog-footer">Changes are local</small>
  {/snippet}
</Surface>
<output data-testid="bound-surface">{surface?.id ?? ``}</output>
