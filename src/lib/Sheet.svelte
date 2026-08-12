<script lang="ts">
  import Dialog from './Dialog.svelte'
  import type { DialogProps } from './dialog'

  type SheetProps = DialogProps & { side?: `top` | `right` | `bottom` | `left` }

  let {
    open = $bindable(false),
    side = `right`,
    surface = $bindable(null),
    'aria-label': aria_label,
    'aria-labelledby': aria_labelledby,
    class: class_name,
    ...dialog_props
  }: SheetProps = $props()
</script>

<Dialog
  {...dialog_props}
  bind:open
  bind:surface
  class={[`sheet`, class_name]}
  data-side={side}
  aria-label={aria_label ?? (aria_labelledby ? undefined : `Sheet`)}
  aria-labelledby={aria_labelledby}
/>

<style>
  :global(dialog.sheet) {
    --dialog-width: auto;
    --dialog-border: var(--sheet-border, 1px solid light-dark(lightgray, #555));
    --dialog-radius: 0;
    --dialog-bg: var(--sheet-bg, light-dark(#fff, #2a2a2e));
    --dialog-color: var(--sheet-color, inherit);
    --dialog-shadow: var(--sheet-shadow, 0 0 18px rgba(0, 0, 0, 0.3));
    --dialog-backdrop: var(--sheet-backdrop, rgba(0, 0, 0, 0.42));
    --dialog-backdrop-filter: var(--sheet-backdrop-filter, blur(2px));
    --dialog-section-padding: var(--sheet-section-padding, 1rem);
    --dialog-content-padding: var(--sheet-content-padding, 1rem);
    position: fixed;
    inset: auto;
    margin: 0;
    height: auto;
    max-width: 100vw;
    max-height: 100vh;
    &[data-side='right'],
    &[data-side='left'] {
      top: 0;
      bottom: 0;
      width: var(--sheet-size, min(24rem, 100vw));
    }
    &[data-side='right'] {
      right: 0;
    }
    &[data-side='left'] {
      left: 0;
    }
    &[data-side='top'],
    &[data-side='bottom'] {
      right: 0;
      left: 0;
      height: var(--sheet-size, min(20rem, 100vh));
    }
    &[data-side='top'] {
      top: 0;
    }
    &[data-side='bottom'] {
      bottom: 0;
    }
  }
</style>
