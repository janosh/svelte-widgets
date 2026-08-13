<script lang="ts">
  import { onDestroy } from 'svelte'
  import {
    is_dialog_backdrop_event,
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
    backdrop_dim = true,
    backdrop_blur = false,
    close_on_backdrop = true,
    close_on_escape = true,
    surface = $bindable(null),
    trigger,
    header,
    footer,
    children,
    on_close,
    id,
    closedby,
    'aria-label': aria_label,
    'aria-labelledby': aria_labelledby,
    ...rest
  }: DialogProps = $props()

  const dialog_id = $derived(id ?? unique_id)
  const effective_closedby = $derived(
    closedby ?? (close_on_escape ? (close_on_backdrop ? `any` : `closerequest`) : `none`),
  )
  const custom_backdrop_dismiss = $derived(
    closedby === undefined && close_on_backdrop && !close_on_escape,
  )
  let focus_origin: HTMLElement | SVGElement | null = null
  let pending_close_via: DialogCloseVia | null = null
  let backdrop_press_started = false

  const close = (via: DialogCloseVia) => {
    if (!open) return
    if (!surface?.open) throw new Error(`Dialog: cannot close without an open surface`)
    pending_close_via = via
    surface.close()
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
    if (!open && surface?.open) {
      pending_close_via = null
      surface.close()
    }
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
  const track_backdrop_press = (event: PointerEvent) => {
    backdrop_press_started = event.isPrimary && is_dialog_backdrop_event(surface, event)
  }
  const track_backdrop_release = (event: MouseEvent) => {
    if (backdrop_press_started && is_dialog_backdrop_event(surface, event)) {
      if (custom_backdrop_dismiss) close(`pointer`)
      else if (effective_closedby === `any`) pending_close_via = `pointer`
    }
    backdrop_press_started = false
  }
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
    data-backdrop-dim={backdrop_dim || undefined}
    data-backdrop-blur={backdrop_blur || undefined}
    closedby={effective_closedby}
    aria-label={aria_label ?? (aria_labelledby ? undefined : `Dialog`)}
    aria-labelledby={aria_labelledby}
    onpointerdown={chain_handlers(track_backdrop_press, rest.onpointerdown)}
    onclick={chain_handlers(track_backdrop_release, rest.onclick)}
    oncancel={(event) => {
      rest.oncancel?.(event)
      if (event.defaultPrevented) return
      if (effective_closedby === `none`) event.preventDefault()
      else pending_close_via = `escape`
    }}
    onclose={chain_handlers((event) => {
      // Ignore a queued close from a surface replaced by a rapid controlled reopen.
      if (open && event.currentTarget !== surface) return
      const was_open = open
      const close_via = pending_close_via ?? `close`
      pending_close_via = null
      open = false
      // Explicit restoration also covers removed openers and partial DOM implementations.
      restore_dialog_focus(surface, focus_origin)
      if (was_open) on_close?.({ via: close_via })
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
      background: transparent;
      backdrop-filter: none;
    }
    &[data-backdrop-dim]::backdrop {
      background: var(--dialog-backdrop, rgba(0, 0, 0, 0.42));
    }
    &[data-backdrop-blur]::backdrop {
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
