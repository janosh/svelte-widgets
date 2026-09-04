<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Progress from './Progress.svelte'

  let {
    state = `running`,
    label,
    value,
    max = 100,
    oncancel,
    onretry,
    children,
    cancel_label = `Cancel`,
    retry_label = `Retry`,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    state?: `idle` | `running` | `success` | `error` | `cancelled`
    label: string
    value?: number
    max?: number
    oncancel?: () => void
    onretry?: () => void
    cancel_label?: string
    retry_label?: string
    children?: Snippet
  } = $props()
</script>

<div {...rest} class={[`task-status`, rest.class]} data-state={state}>
  <div role="status" aria-live="polite">{label}</div>
  {#if state === `running`}<Progress {value} {max} {label} />{/if}
  {@render children?.()}
  {#if state === `running` && oncancel}
    <button type="button" onclick={oncancel}>{cancel_label}</button>
  {:else if (state === `error` || state === `cancelled`) && onretry}
    <button type="button" onclick={onretry}>{retry_label}</button>
  {/if}
</div>

<style>
  .task-status {
    display: grid;
    gap: 0.5em;
    button {
      justify-self: start;
      font: inherit;
    }
    &[data-state='error'] {
      color: var(--error-color, #c33);
    }
  }
</style>
