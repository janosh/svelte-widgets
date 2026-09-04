<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'

  let {
    message = $bindable(),
    type = `info`,
    dismissible = false,
    dismiss_label = `Dismiss message`,
    ...rest
  }: {
    message?: string
    type?: `info` | `error` | `warning` | `success`
    dismissible?: boolean
    dismiss_label?: string
  } & Omit<HTMLAttributes<HTMLDivElement>, `children`> = $props()
</script>

{#if message}
  <div
    role={type === `error` ? `alert` : `status`}
    aria-live={type === `error` ? `assertive` : `polite`}
    {...rest}
    class={[`status-message`, type, rest.class]}
  >
    {message}
    {#if dismissible}
      <button
        type="button"
        onclick={() => (message = undefined)}
        aria-label={dismiss_label}
      >
        ✕
      </button>
    {/if}
  </div>
{/if}

<style>
  .status-message {
    display: flex;
    align-items: center;
    gap: 1em;
    border-radius: var(--border-radius, 3pt);
    backdrop-filter: blur(8px);
    &.info {
      border: 2px dashed var(--text-color-muted, #ccc);
      background: transparent;
      color: var(--text-color-muted, light-dark(#666, #bbb));
      padding: 2em;
    }
    &:is(.error, .success, .warning) {
      background: color-mix(in srgb, var(--message-color) 10%, transparent);
      color: var(--message-color);
      padding: 0.5em 1em;
    }
    &.error {
      --message-color: var(--error-color, light-dark(#b91c1c, #f87171));
      border: var(--error-border, 1px solid #ef4444);
    }
    &.success {
      --message-color: var(--success-color, light-dark(#2e7d32, #81c784));
      border: 1px solid var(--message-color);
    }
    &.warning {
      --message-color: var(--warning-color, light-dark(#9a4d00, #ffb74d));
      border: var(--warning-border, 1px solid #fb8c00);
    }
  }
  button {
    flex: none;
    display: grid;
    place-items: center;
    margin-left: auto;
    box-sizing: border-box;
    width: 1.6em;
    height: 1.6em;
    padding: 0;
    background: var(--btn-bg, #ddd);
    border: 1px solid var(--border-color, #bbb);
    border-radius: 50%;
    cursor: pointer;
    &:hover {
      background: var(--btn-bg-hover, #ccc);
    }
  }
</style>
