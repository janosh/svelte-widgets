<script lang="ts">
  import { page } from '$app/state'
  import { Nav, ThemeToggle } from '$lib'
  import type { ComponentProps } from 'svelte'
  import { demo_title, demo_nav_routes, multiselect_recipes } from '../routes/(demos)'
  import { resolve_demo_path as resolve_path } from './paths'

  let props: Partial<ComponentProps<typeof Nav>> = $props()

  const prefixed_routes = [
    { href: resolve_path(`/`), label: `Home` },
    ...demo_nav_routes.map((route) => ({
      ...route,
      href: resolve_path(route.href),
      children: route.children.map((child) => ({
        href: resolve_path(child),
        label: demo_title(child),
      })),
    })),
  ]

  const recipe_paths = multiselect_recipes.map(resolve_path)
  const pathname = $derived(
    recipe_paths.includes(page.url.pathname)
      ? resolve_path(`/multiselect`)
      : page.url.pathname,
  )
</script>

<Nav {...props} routes={prefixed_routes} {pathname}>
  {#snippet item({ route })}
    {#if route.href?.includes(`/attachments/`)}
      <code>{route.label}</code>
    {:else}
      {route.label}
    {/if}
  {/snippet}
  <ThemeToggle />
</Nav>
