<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  // Visually hidden polite live region: screen readers announce `message` (or `children`, which
  // take precedence) as it changes. Keep it mounted while empty: a region inserted together
  // with its first message is often missed. `aria-live="assertive"` or `aria-atomic` pass through.
  let {
    message,
    children,
    ...rest
  }: HTMLAttributes<HTMLSpanElement> & { message?: string; children?: Snippet } = $props()
</script>

<span aria-live="polite" {...rest} class={[`sr-only`, rest.class]}>
  {#if children}{@render children()}{:else}{message}{/if}
</span>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
