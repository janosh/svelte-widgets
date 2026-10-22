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
    label: string | Snippet // a snippet allows markup such as sub/superscripts
    value?: number
    max?: number
    // show a spinner instead of an indeterminate bar while `value` is unknown (decoration
    // inside the live region, not a second region)
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

  const label_id = $props.id()
  const running = $derived(state === `running`)
  const spin = $derived(spinner && running && value === undefined)
</script>

{#snippet message()}
  {#if spin}<Spinner
      {...spinner_props}
      role={null}
      aria-live={null}
      aria-label={null}
    />{/if}
  <span id={label_id}
    >{#if typeof label === `string`}{label}{:else}{@render label()}{/if}</span
  >
{/snippet}

<div {...rest} class={[`task-status`, rest.class, { overlay }]} data-state={state}>
  <!-- Both regions stay mounted while this does, as in StatusMessage: a live region inserted
  together with its content is announced by only some screen readers, so keep TaskStatus
  mounted across a task's states rather than inside {#if loading}. Errors interrupt. -->
  <div class="message">
    <div role="status" aria-live="polite">
      {#if state !== `error`}{@render message()}{/if}
    </div>
    <div role="alert" aria-live="assertive">
      {#if state === `error`}{@render message()}{/if}
    </div>
  </div>
  {#if running && !spin}
    <Progress {value} {max} aria-labelledby={label_id} />
  {/if}
  {@render children?.()}
  {#if running && on_cancel}
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
    .message > div {
      display: flex;
      align-items: center;
      gap: 0.5em;
      overflow-wrap: anywhere;
    }
    :global(.spinner) {
      margin: 0;
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
