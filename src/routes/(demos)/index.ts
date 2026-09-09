import type { Pathname } from '$app/types'

// Folder names determine membership; this list only sets the top-level order.
const categories = new Map<string, { label: string; children: Pathname[] }>(
  [`Inputs`, `Navigation`, `Overlays`, `Display`, `Authoring`, `Attachments`].map(
    (label) => [label.toLowerCase(), { label, children: [] }],
  ),
)

for (const filename of Object.keys(import.meta.glob(`./**/+page.{svelte,md}`))) {
  if (filename.includes(`/(hide)/`)) continue
  const parts = /^\.\/\((?<category>[^)]+)\)\/(?<route>.+)\/\+page\.(?:svelte|md)$/u.exec(
    filename,
  )?.groups
  const category = parts && categories.get(parts.category)
  if (!parts || !category)
    throw new Error(`Demo page needs a navigation category: ${filename}`)
  category.children.push(`/${parts.route}` as Pathname)
}

export const demo_nav_routes = Array.from(
  categories,
  ([category, { label, children }]) => {
    if (!children.length) throw new Error(`Empty demo category: ${category}`)
    const overview_route = `/${category}` as Pathname
    children.sort((left_route, right_route) => {
      if (left_route === overview_route) return -1
      if (right_route === overview_route) return 1
      return left_route.localeCompare(right_route)
    })
    return {
      // A hash identifies a menu-only category without inventing a page URL.
      href: children.includes(overview_route) ? overview_route : `#${category}`,
      label,
      children,
    }
  },
)

export const demo_pages = demo_nav_routes.flatMap(({ children }) => children)

// Labels slug_to_title cannot derive, shared by navigation, page titles and search.
export const demo_labels: Record<string, string> = {
  '/multiselect': `MultiSelect`,
  '/range-slider': `RangeSlider`,
  '/command-menu': `CommandMenu`,
  '/action-button': `ActionButton`,
  '/code-editor': `CodeEditor / DiffView`,
  '/ui': `UI`,
  '/css-classes': `CSS Classes`,
  '/kit-form-actions': `Form Actions`,
  '/min-max-select': `Min/Max`,
  '/allow-user-options': `User Options`,
  // Attachment slugs encode their exported snake_case names.
  ...Object.fromEntries(
    demo_pages
      .filter((route) => route.startsWith(`/attachments/`))
      .map((route) => [route, route.slice(`/attachments/`.length).replaceAll(`-`, `_`)]),
  ),
}
