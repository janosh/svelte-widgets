<!-- Small frosted-glass text overlay annotating visual content (a canvas, plot or image)
  without obscuring it. Position it inside a positioned parent via --glass-chip-* properties. -->
<script lang="ts">
  import type { Snippet } from 'svelte'
  import type { HTMLAttributes } from 'svelte/elements'

  let { children, ...rest }: HTMLAttributes<HTMLDivElement> & { children: Snippet } =
    $props()
</script>

<div {...rest} class={[`glass-chip`, rest.class]}>
  {@render children()}
</div>

<style>
  .glass-chip {
    position: absolute;
    top: var(--glass-chip-top, 10px);
    left: var(--glass-chip-left, 10px);
    z-index: var(--glass-chip-z, 2);
    /* own compositing layer, or WebKit can paint an underlying WebGL canvas over it */
    will-change: transform;
    max-width: var(--glass-chip-max-width, calc(100% - 20px));
    padding: 4px 8px;
    border-radius: 6px;
    background: var(--glass-chip-bg, transparent);
    backdrop-filter: blur(8px);
    color: var(--text-color, inherit);
    font-size: var(--glass-chip-font-size, 0.85em);
    text-align: start; /* not a centered parent's */
  }
</style>
