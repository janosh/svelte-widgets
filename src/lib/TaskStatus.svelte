<script lang="ts">
  import type { ComponentProps, Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'
  import Progress from './Progress.svelte'
  import Spinner from './Spinner.svelte'

  let {
    state = `running`,
    label,
    value,
    max = 100,
    show_progress = true,
    spinner = false,
    spinner_props = {},
    overlay = false,
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
    // false drops the progress bar while running, e.g. when `spinner` alone signals the work
    show_progress?: boolean
    // a spinner beside the label while running
    spinner?: boolean
    spinner_props?: Omit<ComponentProps<typeof Spinner>, `text`>
    // centered over a positioned parent (a loading canvas, say), letting pointer events
    // through to it everywhere but the buttons
    overlay?: boolean
    on_cancel?: () => void
    on_retry?: () => void
    cancel_label?: string
    retry_label?: string
    children?: Snippet
  } = $props()
</script>

<div {...rest} class={[`task-status`, rest.class, { overlay }]} data-state={state}>
  <!-- one region stays mounted across states: a live region inserted together with its
  content is announced by only some screen readers. The spinner inside it is no second one. -->
  <div role="status" aria-live="polite">
    {#if spinner && state === `running`}
      <Spinner {...spinner_props} text={label} role={null} aria-live={null} />
    {:else}{label}{/if}
  </div>
  {#if state === `running` && show_progress}<Progress {value} {max} {label} />{/if}
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
      justify-self: var(--task-status-button-justify, start);
      font: inherit;
    }
    &[data-state='error'] {
      color: var(--error-color, #c33);
    }
    :global(.spinner) {
      max-width: 100%;
      margin: 0;
      overflow-wrap: anywhere;
    }
    :global(.circle-spinner) {
      flex-shrink: 0;
    }
    &.overlay {
      position: absolute;
      inset: 0;
      z-index: var(--task-status-overlay-z-index, 1);
      place-content: center;
      justify-items: center;
      grid-template-columns: min(24em, calc(100% - 2em));
      padding-block: 1em;
      box-sizing: border-box;
      text-align: center;
      pointer-events: none;
      button {
        justify-self: var(--task-status-button-justify, center);
        pointer-events: auto;
      }
    }
  }
</style>
