<script lang="ts">
  import Icon from './Icon.svelte'
  import { Info } from './icons'
  import type { HTMLAttributes } from 'svelte/elements'

  let {
    visible = false,
    message = `Drop file to load`,
    ...rest
  }: {
    visible?: boolean
    message?: string
  } & Omit<HTMLAttributes<HTMLDivElement>, `children`> = $props()
</script>

{#if visible}
  <div {...rest} class={[`drag-overlay`, rest.class]}>
    <Icon icon={Info} />
    <span>{message}</span>
  </div>
{/if}

<style>
  .drag-overlay {
    position: absolute;
    inset: 0;
    color: var(--accent-color, #1976d2);
    background: color-mix(in srgb, currentColor 10%, transparent);
    border: 2px dashed;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-weight: 600;
    font-size: 1.1em;
    pointer-events: none;
  }
</style>
