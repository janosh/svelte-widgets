<script lang="ts">
  import { resolve } from '$app/paths'
  import { page } from '$app/state'
  import { Nav, ThemeToggle } from '$lib'
  import type { ComponentProps } from 'svelte'
  import { demo_labels, demo_nav_routes } from '../routes/(demos)'

  let props: Partial<ComponentProps<typeof Nav>> = $props()

  // resolve's arg type distributes over the Pathname union, so a route read out of the
  // demo list can't match a single arm; every demo route is param-free
  const resolve_path = resolve as (path: string) => string
  const prefixed_routes = [`/`, ...demo_nav_routes].map((route) =>
    typeof route === `string`
      ? resolve_path(route)
      : {
          ...route,
          href: route.href.startsWith(`#`) ? route.href : resolve_path(route.href),
          children: route.children.map(resolve_path),
        },
  )

  const nav_route_labels: Record<string, string> = { [resolve_path(`/`)]: `Home` }
  for (const [route, label] of Object.entries(demo_labels)) {
    nav_route_labels[resolve_path(route)] = route.startsWith(`/attachments/`)
      ? `<code>${label}</code>`
      : label
  }
</script>

<Nav
  {...props}
  routes={prefixed_routes}
  {page}
  route_labels={{ ...nav_route_labels, ...(props.route_labels ?? {}) }}
>
  <ThemeToggle />
</Nav>
