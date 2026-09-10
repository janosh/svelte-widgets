<script lang="ts">
  import { goto } from '$app/navigation'
  import { page } from '$app/state'
  import type { Pathname } from '$app/types'
  import { PrevNext } from '$lib'
  import type { Snippet } from 'svelte'
  import { current_demo_route, resolve_demo_path as resolve_path } from '$site/paths'
  import { demo_nav_routes, demo_title, multiselect_recipes } from './index'

  let { children }: { children?: Snippet<[]> } = $props()

  const current = $derived(current_demo_route())
  const multiselect_pages: Pathname[] = [`/multiselect`, ...multiselect_recipes]
  const is_multiselect = $derived(
    current !== undefined && multiselect_pages.includes(current),
  )
  const category = $derived(
    current &&
      demo_nav_routes.find(({ children: routes }) =>
        routes.includes(is_multiselect ? `/multiselect` : current),
      ),
  )
  const items = $derived(
    (is_multiselect ? multiselect_pages : (category?.children ?? [])).map(
      (route): [string, string] => [resolve_path(route), demo_title(route)],
    ),
  )
</script>

<main>
  {#if category && current && current !== category.href}
    <nav class="section-navigation" aria-label="Demo section" data-pagefind-ignore>
      <a href={resolve_path(category.href)}>{category.label}</a>
      {#if is_multiselect}
        <span aria-hidden="true">/</span>
        <label>
          <span class="visually-hidden">MultiSelect guide</span>
          <select
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
        </label>
      {/if}
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
    display: flex;
    align-items: center;
    gap: 0.6em;
    margin: 0 auto 1.5em;
    width: min(100%, var(--main-max-width));
    select {
      max-width: 100%;
      font: inherit;
      padding: 0.3em 0.5em;
    }
    label {
      min-width: 0;
    }
  }
  .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }
  main > :global(h2) {
    margin-top: 2em;
  }
</style>
