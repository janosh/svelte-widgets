<script lang="ts">
  import { page } from '$app/state'
  import { Nav, ThemeToggle } from '$lib'
  import type { ComponentProps } from 'svelte'
  import {
    demo_title,
    demo_pages,
    demo_nav_routes,
    multiselect_recipes,
  } from '../routes/(demos)'
  import { resolve_demo_path as resolve_path } from './paths'

  let props: Partial<ComponentProps<typeof Nav>> = $props()

  const prefixed_routes = [
    resolve_path(`/`),
    ...demo_nav_routes.map((route) => ({
      ...route,
      href: resolve_path(route.href),
      children: route.children.map(resolve_path),
    })),
  ]

  const nav_route_labels: Record<string, string> = { [resolve_path(`/`)]: `Home` }
  const recipe_paths = multiselect_recipes.map(resolve_path)
  const nav_page = $derived(
    recipe_paths.includes(page.url.pathname)
      ? { url: { pathname: resolve_path(`/multiselect`) } }
      : page,
  )
  for (const route of demo_pages) {
    const label = demo_title(route)
    nav_route_labels[resolve_path(route)] = route.startsWith(`/attachments/`)
      ? `<code>${label}</code>`
      : label
  }
</script>

<Nav
  {...props}
  routes={prefixed_routes}
  page={nav_page}
  route_labels={{ ...nav_route_labels, ...props.route_labels }}
>
  <ThemeToggle />
</Nav>
