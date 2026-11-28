<script lang="ts">
  import { page } from '$app/state'
  import { Nav, ThemeToggle } from '#lib'
  import { demo_nav_routes, multiselect_recipes } from '../routes/(demos)'
  import { demo_link, resolve_demo_path as resolve_path } from './paths'

  const prefixed_routes = [
    { href: resolve_path(`/`), label: `Home` },
    ...demo_nav_routes.map((route) => ({
      ...route,
      href: resolve_path(route.href),
      children: route.children.map(demo_link),
    })),
  ]

  const recipe_paths = multiselect_recipes.map(resolve_path)
  const pathname = $derived(
    recipe_paths.includes(page.url.pathname)
      ? resolve_path(`/multiselect`)
      : page.url.pathname,
  )
</script>

<Nav routes={prefixed_routes} {pathname}>
  {#snippet item({ route })}
    {#if route.href?.includes(`/attachments/`)}
      <code>{route.label}</code>
    {:else}
      {route.label}
    {/if}
  {/snippet}
  <ThemeToggle />
</Nav>
