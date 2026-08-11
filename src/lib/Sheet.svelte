<script lang="ts">
  import { onDestroy, type Snippet } from 'svelte'
  import type { HTMLDialogAttributes } from 'svelte/elements'
  import { backdrop_dismiss } from './attachments/index'
  import { chain_handlers } from './utils'

  type SheetSide = `top` | `right` | `bottom` | `left`
  type SheetControls = { close: () => void }
  type TriggerProps = {
    onclick: () => void
    'aria-controls': string | undefined
    'aria-expanded': boolean
    'aria-haspopup': `dialog`
  }
  type CloseVia = `pointer` | `escape` | `close`

  const unique_id = $props.id()
  let {
    open = $bindable(false),
    side = `right`,
    close_on_backdrop = true,
    close_on_escape = true,
    surface = $bindable(null),
    trigger,
    header,
    footer,
    children,
    on_close,
    id,
    'aria-label': aria_label,
    'aria-labelledby': aria_labelledby,
    ...rest
  }: Omit<HTMLDialogAttributes, `children`> & {
    open?: boolean
    side?: SheetSide
    close_on_backdrop?: boolean
    close_on_escape?: boolean
    surface?: HTMLDialogElement | null
    // Snippets remain owned by the declaring parent. Sheet renders them in that
    // parent's scope and only supplies stable controls; it does not retain them.
    trigger?: Snippet<[TriggerProps]>
    header?: Snippet<[SheetControls]>
    footer?: Snippet<[SheetControls]>
    children: Snippet<[SheetControls]>
    on_close?: (detail: { via: CloseVia }) => void
  } = $props()

  const sheet_id = $derived(id ?? unique_id)
  let focus_origin: HTMLElement | SVGElement | null = null

  const close = (via: CloseVia) => {
    if (!open) return
    open = false
    on_close?.({ via })
  }
  const controls: SheetControls = { close: () => close(`close`) }
  const trigger_props: TriggerProps = $derived({
    onclick: () => (open = true),
    'aria-controls': open ? sheet_id : undefined,
    'aria-expanded': open,
    'aria-haspopup': `dialog`,
  })

  // `$effect.pre` closes before `{#if open}` unmounts so native `onclose` still fires.
  $effect.pre(() => {
    if (!open && surface?.open) surface.close()
  })
  $effect(() => {
    if (!open || !surface || surface.open) return
    const active = document.activeElement
    if (active instanceof HTMLElement || active instanceof SVGElement)
      focus_origin = active
    surface.showModal()
  })
  onDestroy(() => {
    if (surface?.open) focus_origin?.focus()
  })
</script>

{@render trigger?.(trigger_props)}

{#if open}
  <dialog
    bind:this={surface}
    {...rest}
    id={sheet_id}
    class={[`sheet`, rest.class]}
    data-side={side}
    aria-label={aria_label ?? (aria_labelledby ? undefined : `Sheet`)}
    aria-labelledby={aria_labelledby}
    {@attach backdrop_dismiss(() => close_on_backdrop && close(`pointer`))}
    oncancel={chain_handlers((event) => {
      if (close_on_escape) close(`escape`)
      else event.preventDefault()
    }, rest.oncancel)}
    onclose={chain_handlers(() => close(`close`), rest.onclose)}
  >
    {#if header}<header>{@render header(controls)}</header>{/if}
    <div class="sheet-content">{@render children(controls)}</div>
    {#if footer}<footer>{@render footer(controls)}</footer>{/if}
  </dialog>
{/if}

<style>
  :global(:root:has(dialog.sheet[open])) {
    overflow: hidden;
  }
  .sheet:not([open]) {
    display: none;
  }
  .sheet {
    position: fixed;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    inset: auto;
    margin: 0;
    padding: 0;
    width: auto;
    height: auto;
    max-width: 100vw;
    max-height: 100vh;
    overflow: hidden;
    border: var(--sheet-border, 1px solid light-dark(lightgray, #555));
    background: var(--sheet-bg, light-dark(#fff, #2a2a2e));
    color: var(--sheet-color, inherit);
    box-shadow: var(--sheet-shadow, 0 0 18px rgba(0, 0, 0, 0.3));
  }
  .sheet::backdrop {
    background: var(--sheet-backdrop, rgba(0, 0, 0, 0.42));
    backdrop-filter: var(--sheet-backdrop-filter, blur(2px));
  }
  .sheet:is([data-side='right'], [data-side='left']) {
    top: 0;
    bottom: 0;
    width: var(--sheet-size, min(24rem, 100vw));
  }
  .sheet[data-side='right'] {
    right: 0;
  }
  .sheet[data-side='left'] {
    left: 0;
  }
  .sheet:is([data-side='top'], [data-side='bottom']) {
    right: 0;
    left: 0;
    height: var(--sheet-size, min(20rem, 100vh));
  }
  .sheet[data-side='top'] {
    top: 0;
  }
  .sheet[data-side='bottom'] {
    bottom: 0;
  }
  header,
  footer {
    padding: var(--sheet-section-padding, 1rem);
  }
  .sheet-content {
    flex: 1;
    padding: var(--sheet-content-padding, 1rem);
    overflow: auto;
  }
</style>
