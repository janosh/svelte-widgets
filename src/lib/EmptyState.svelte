<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  // `children` takes precedence over the plain-text `message`.
  // `overlay` lays it over a still-rendered parent (empty plot axes, a blank canvas) without
  // blocking that parent's pointer events. A polite status region unless `role` says otherwise.
  let {
    message = `No data to display`,
    overlay = false,
    role = `status`,
    children,
    ...rest
  }: {
    message?: string
    overlay?: boolean
    children?: Snippet
  } & HTMLAttributes<HTMLDivElement> = $props()
</script>

<div {...rest} {role} class={[`empty-state`, rest.class, { overlay }]}>
  {#if children}
    {@render children()}
  {:else}
    <span class="message">{message}</span>
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* safe: content taller than a short parent scrolls instead of clipping at both ends */
    justify-content: safe center;
    overflow-y: auto;
    flex: 1;
    width: 100%;
    height: 100%;
    min-height: inherit;
    text-align: center;
    box-sizing: border-box;
    &.overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    > :global(*) {
      max-width: var(--empty-state-max-width, 500px);
    }
    :global(p),
    .message {
      color: var(--text-color-muted, light-dark(#666, #bbb));
      margin: 0;
    }
    :global(h3) {
      margin: 0 0 0.5em;
    }
  }
</style>
