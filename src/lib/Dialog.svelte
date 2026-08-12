<script lang="ts">
  import { onDestroy } from 'svelte'
  import { backdrop_dismiss } from './attachments/index'
  import {
    restore_dialog_focus,
    type DialogCloseVia,
    type DialogControls,
    type DialogProps,
    type DialogTriggerProps,
  } from './dialog'
  import { chain_handlers } from './utils'

  const unique_id = $props.id()
  let {
    open = $bindable(false),
    close_on_backdrop = true,
    close_on_escape = true,
    surface = $bindable(null),
    trigger,
    header,
    footer,
    children,
    on_close,
    id,
    closedby = `closerequest`,
    'aria-label': aria_label,
    'aria-labelledby': aria_labelledby,
    ...rest
  }: DialogProps = $props()

  const dialog_id = $derived(id ?? unique_id)
  let focus_origin: HTMLElement | SVGElement | null = null

  const close = (via: DialogCloseVia) => {
    if (!open) return
    open = false
    on_close?.({ via })
  }
  const controls: DialogControls = { close: () => close(`close`) }
  const trigger_props: DialogTriggerProps = $derived({
    onclick: () => (open = true),
    'aria-controls': open ? dialog_id : undefined,
    'aria-expanded': open,
    'aria-haspopup': `dialog`,
  })

  // Close while the element is still mounted so the browser can restore the focus that
  // showModal() recorded. This also lets a consumer's native onclose handler run.
  $effect.pre(() => {
    if (!open && surface?.open) surface.close()
  })
  $effect(() => {
    if (!open || !surface || surface.open) return
    const active_element = document.activeElement
    if (active_element instanceof HTMLElement || active_element instanceof SVGElement)
      focus_origin = active_element
    // Native modal stacking makes only the innermost nested dialog interactive and gives
    // Escape to that dialog before its ancestors.
    surface.showModal()
  })
  onDestroy(() => {
    if (surface?.open) restore_dialog_focus(surface, focus_origin)
  })
</script>

{@render trigger?.(trigger_props)}

{#if open}
  <dialog
    bind:this={surface}
    {...rest}
    id={dialog_id}
    class={[`dialog`, rest.class]}
    {closedby}
    aria-label={aria_label ?? (aria_labelledby ? undefined : `Dialog`)}
    aria-labelledby={aria_labelledby}
    {@attach backdrop_dismiss(() => close_on_backdrop && close(`pointer`))}
    oncancel={chain_handlers(rest.oncancel, (event) => {
      if (event.defaultPrevented) return
      // Own the native default so a disabled policy keeps this dialog open and an enabled
      // one closes through the same state/reason path as every other dismissal.
      event.preventDefault()
      if (close_on_escape) close(`escape`)
    })}
    onclose={chain_handlers((event) => {
      // Ignore a queued close from a surface replaced by a rapid controlled reopen.
      if (open && event.currentTarget !== surface) return
      // Explicit restoration also covers removed openers and partial DOM implementations.
      restore_dialog_focus(surface, focus_origin)
      close(`close`)
    }, rest.onclose)}
  >
    {#if header}<header>{@render header(controls)}</header>{/if}
    <div class="dialog-content">{@render children(controls)}</div>
    {#if footer}<footer>{@render footer(controls)}</footer>{/if}
  </dialog>
{/if}

<style>
  :global(:root:has(dialog.dialog[open])) {
    overflow: hidden;
  }
  .dialog {
    box-sizing: border-box;
    flex-direction: column;
    margin: auto;
    padding: 0;
    width: var(--dialog-width, min(32rem, calc(100vw - 2rem)));
    max-width: calc(100vw - 2rem);
    max-height: calc(100vh - 2rem);
    overflow: hidden;
    border: var(--dialog-border, 1px solid light-dark(lightgray, #555));
    border-radius: var(--dialog-radius, 5pt);
    background: var(--dialog-bg, light-dark(#fff, #2a2a2e));
    color: var(--dialog-color, inherit);
    box-shadow: var(--dialog-shadow, 0 3px 18px rgba(0, 0, 0, 0.3));
    &[open] {
      display: flex;
    }
    &::backdrop {
      background: var(--dialog-backdrop, rgba(0, 0, 0, 0.42));
      backdrop-filter: var(--dialog-backdrop-filter, blur(2px));
    }
  }
  header,
  footer {
    padding: var(--dialog-section-padding, 1rem);
  }
  .dialog-content {
    flex: 1;
    padding: var(--dialog-content-padding, 1rem);
    overflow: auto;
  }
</style>
