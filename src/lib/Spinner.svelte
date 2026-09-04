<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'
  import CircleSpinner from './CircleSpinner.svelte'

  let {
    text,
    ...rest
  }: { text?: string } & Omit<HTMLAttributes<HTMLDivElement>, `children`> = $props()
</script>

<div
  role="status"
  aria-live="polite"
  aria-label={text ? undefined : `Loading`}
  {...rest}
  class={[`spinner`, rest.class]}
>
  <CircleSpinner
    aria-hidden="true"
    color="var(--spinner-color, #007acc)"
    size="var(--spinner-size, 1em)"
    duration="var(--spinner-duration, 1s)"
    style="margin: 0; border-width: var(--spinner-border-width, 4px); box-sizing: border-box"
  />
  {#if text}<span>{text}</span>{/if}
</div>

<style>
  .spinner {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    margin: var(--spinner-margin, 3pt);
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner :global(.circle-spinner) {
      animation: none;
    }
  }
</style>
