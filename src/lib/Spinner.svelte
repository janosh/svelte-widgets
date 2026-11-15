<script lang="ts">
  import type { HTMLAttributes } from 'svelte/elements'

  let {
    text,
    status = true,
    color,
    size,
    duration,
    style,
    ...rest
  }: {
    text?: string
    // a polite live region named `Loading` (or by `text`); false makes it pure decoration
    // (aria-hidden) for controls that announce their own busy state, e.g. via aria-busy
    status?: boolean
    // plain CSS strings, so any unit works; unset ones fall back to --spinner-* properties
    color?: string
    size?: string
    duration?: string
  } & Omit<HTMLAttributes<HTMLSpanElement>, `children`> = $props()

  // appended rather than style: directives, which would erase a caller's own --spinner-*
  // in `style` whenever the matching prop is unset
  const custom_props = $derived(
    Object.entries({ color, size, duration })
      .filter(([, value]) => value)
      .map(([key, value]) => `--spinner-${key}: ${value}`),
  )
</script>

<span
  role={status ? `status` : undefined}
  aria-live={status ? `polite` : undefined}
  aria-label={status && !text ? `Loading` : undefined}
  aria-hidden={status ? undefined : `true`}
  {...rest}
  class={[`spinner`, rest.class]}
  style={[style, ...custom_props].filter(Boolean).join(`; `) || undefined}
>
  <span class="circle"></span>
  {#if text}<span>{text}</span>{/if}
</span>

<style>
  .spinner {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    vertical-align: middle;
    margin: var(--spinner-margin, 0 3pt);
  }
  .circle {
    flex-shrink: 0;
    box-sizing: border-box;
    width: var(--spinner-size, 1em);
    height: var(--spinner-size, 1em);
    border: var(--spinner-border-width, calc(var(--spinner-size, 1em) / 5)) solid
      var(--spinner-color, cornflowerblue);
    border-right-color: transparent;
    border-radius: 50%;
    animation: var(--spinner-duration, 1.5s) linear infinite spin;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .circle {
      animation: none;
    }
  }
</style>
