<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import { PrevNext } from '#lib'
  import type { Snippet } from 'svelte'
  import {
    current_demo_route,
    demo_link,
    resolve_demo_path as resolve_path,
  } from '#site/paths.ts'
  import { demo_nav_routes, demo_title, multiselect_recipes } from './index'

  let { children }: { children?: Snippet<[]> } = $props()

  const current = $derived(current_demo_route())
  const multiselect_pages = [`/multiselect`, ...multiselect_recipes]
  const is_multiselect = $derived(
    current !== undefined && multiselect_pages.includes(current),
  )
  const category = $derived(
    current &&
      demo_nav_routes.find(
        ({ href, children: routes }) =>
          href === current || routes.includes(is_multiselect ? `/multiselect` : current),
      ),
  )
  const items = $derived(
    (is_multiselect
      ? multiselect_pages
      : category
        ? [category.href, ...category.children]
        : []
    ).map(demo_link),
  )
</script>

<main>
  {#if is_multiselect}
    <nav class="section-navigation" aria-label="Demo section" data-pagefind-ignore>
      <select
        aria-label="MultiSelect guide"
        value={current}
        onchange={(event) => goto(resolve_path(event.currentTarget.value))}
      >
        {#each multiselect_pages as route (route)}
          <option value={route}
            >{route === `/multiselect`
              ? `MultiSelect overview`
              : demo_title(route)}</option
          >
        {/each}
      </select>
    </nav>
  {/if}
  {@render children?.()}

  {#if current}
    {@const style = `max-width: var(--main-max-width); margin: 2em auto`}
    <PrevNext {items} current={page.url.pathname} {style} />
  {/if}
</main>

<style>
  .section-navigation {
    margin: 0 auto 1.5em;
    width: min(100%, var(--main-max-width));
    select {
      max-width: 100%;
      font: inherit;
      padding: 0.3em 0.5em;
    }
  }
  main > :global(h2) {
    margin-top: 2em;
  }
  /* the page title, level with the TOC title beside it */
  main > :global(h2:first-child),
  .section-navigation + :global(h2) {
    margin-top: 0.5em;
  }
</style>
