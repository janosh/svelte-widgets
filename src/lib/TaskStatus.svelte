<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Progress from './Progress.svelte'

  let {
    state = `running`,
    label,
    value,
    max = 100,
    on_cancel,
    on_retry,
    children,
    cancel_label = `Cancel`,
    retry_label = `Retry`,
    ...rest
  }: HTMLAttributes<HTMLDivElement> & {
    state?: `idle` | `running` | `success` | `error` | `cancelled`
    label: string
    value?: number
    max?: number
    on_cancel?: () => void
    on_retry?: () => void
    cancel_label?: string
    retry_label?: string
    children?: Snippet
  } = $props()
</script>

<div {...rest} class={[`task-status`, rest.class]} data-state={state}>
  <div role="status" aria-live="polite">{label}</div>
  {#if state === `running`}<Progress {value} {max} {label} />{/if}
  {@render children?.()}
  {#if state === `running` && on_cancel}
    <button type="button" onclick={on_cancel}>{cancel_label}</button>
  {:else if (state === `error` || state === `cancelled`) && on_retry}
    <button type="button" onclick={on_retry}>{retry_label}</button>
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
