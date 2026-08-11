import type { Pathname } from '$app/types'
import { slug_to_title } from '$lib/utils'

// Labels that slug_to_title (and the nav's capitalize fallback) can't derive, keyed by
// unresolved route path. Shared by DemoNav's nav labels and the layout's page titles.
export const demo_labels: Record<string, string> = {
  '/multiselect': `MultiSelect`,
  '/command-menu': `CommandMenu`,
  '/action-button': `ActionButton`,
  '/code-editor': `DiffView`,
  '/ui': `UI`,
  '/css-classes': `CSS Classes`,
  '/kit-form-actions': `Form Actions`,
  '/min-max-select': `Min/Max`,
  '/allow-user-options': `User Options`,
  '/parse-labels-as-html': `HTML Labels`,
  // attachments are named after their exports, so the nav shows the exact snake_case
  // symbol rather than slug_to_title's "Click Outside"
  ...Object.fromEntries(
    [
      `tooltip`,
      `draggable`,
      `resizable`,
      `sortable`,
      `highlight_matches`,
      `click_outside`,
      `dismiss_on_outside_press`,
      `backdrop_dismiss`,
      `focus_trap`,
      `hotkey`,
      `float`,
      `portal`,
      `contrast_color`,
      `forward_window_keydown`,
      `file_drop`,
    ].map((name) => [`/attachments/${name.replaceAll(`_`, `-`)}`, name]),
  ),
}

export const routes = Object.keys(import.meta.glob(`./**/+page.{svelte,md}`))
  .filter((filename) => !filename.includes(`/(hide)/`))
  .map((filename) => {
    const segments = filename.split(`/`)
    const group =
      segments.find((segment) => segment.startsWith(`(`))?.slice(1, -1) ?? `other`
    const parts = segments.filter((part) => !part.startsWith(`(`)) // remove hidden route segments
    const route = `/${parts.slice(1, -1).join(`/`)}` as Pathname
    return { group, route }
  })

if (routes.length < 3) {
  console.error(`Too few demo routes found: ${routes.length}`)
}

const groups = [...new Set(routes.map(({ group }) => group))].toSorted()

export const demo_nav_routes = groups.map((group) => {
  const overview_route = `/${group}` as Pathname
  const children = routes
    .filter((route) => route.group === group)
    .map(({ route }) => route)
    .toSorted((left_route, right_route) => {
      if (left_route === overview_route) return -1
      if (right_route === overview_route) return 1
      return left_route.localeCompare(right_route)
    })
  // a group holding a single page is that page, so link straight to it rather than
  // opening a dropdown whose only entry repeats its parent
  return {
    href: children[0],
    // Nav keys its labels prop on route.label when set, so a group label has to be
    // correct here; the labels prop only reaches the dropdown children.
    label: demo_labels[overview_route] ?? slug_to_title(group),
    ...(children.length > 1 && { children }),
  }
})

export const demo_pages = demo_nav_routes.flatMap(
  ({ href, children }) => children ?? [href],
)
