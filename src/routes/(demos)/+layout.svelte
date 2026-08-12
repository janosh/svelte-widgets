<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import type { Pathname } from '$app/types'
  import { heading_anchors, PrevNext } from '$lib'
  import type { Snippet } from 'svelte'
  import { demo_pages } from './index'

  let { children }: { children?: Snippet<[]> } = $props()

  // resolve's arg type distributes over the Pathname union, so a dynamic route can't
  // match a single arm; every demo page is param-free
  const resolve_path = resolve as (path: Pathname) => string
  const demo_paths = demo_pages.map(resolve_path)
</script>

<main {@attach heading_anchors()}>
  {@render children?.()}

  {#if demo_paths.includes(page.url.pathname)}
    {@const style = `max-width: var(--main-max-width); margin: 2em auto`}
    <PrevNext items={demo_paths} current={page.url.pathname} onkeyup={null} {style} />
  {/if}
</main>

<style>
  main > :global(h2) {
    margin-top: 2em;
  }
  /* Frames a live example so it reads as a surface rather than page background. Size,
     padding and layout stay inline: every demo needs its own. */
  main :global(.demo-box) {
    /* The column is a flex container, where auto inline margins would shrink a box to its
       content. An explicit width keeps it at its own max-width and centers the leftovers. */
    box-sizing: border-box;
    width: 100%;
    margin-inline: auto;
    border: 1px solid gray;
    border-radius: 5pt;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.3);
  }
</style>
