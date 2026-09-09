import type { Pathname } from '$app/types'
import { slug_to_title } from 'svelte-widgets/utils'

const category_info = {
  inputs: [`Inputs`, `Choose values, collect files, and organize settings.`],
  navigation: [`Navigation`, `Help users move through pages, commands, and trees.`],
  overlays: [`Overlays`, `Present dialogs, contextual actions, and notifications.`],
  display: [`Display`, `Inspect data, arrange content, and show application state.`],
  authoring: [`Authoring`, `Write interactive documentation and edit code.`],
  attachments: [`Attachments`, `Add reusable behavior to ordinary elements.`],
} as const

export const demo_descriptions: Record<string, string> = {
  '/action-button': `Run asynchronous actions with pending, success, and error feedback.`,
  '/button-group': `Choose one or several values with a segmented control.`,
  '/file-input': `Pick or drop files with validation, cancellation, and retry.`,
  '/multiselect': `Select and search options, with recipes for forms, loading, and styling.`,
  '/range-slider': `Adjust a numeric interval using two handles or number fields.`,
  '/settings': `Organize, search, and reset related application settings.`,
  '/command-menu': `Find commands and search site content from a keyboard palette.`,
  '/nav': `Build responsive navigation with dropdowns and keyboard controls.`,
  '/site-chrome': `Add footers, contributor lists, and lightweight media embeds.`,
  '/toc': `Navigate headings with an automatically generated table of contents.`,
  '/tree-view': `Explore a keyboard-navigable tree with lazy-loaded branches.`,
  '/dialogs': `Queue confirmations, choices, and text prompts.`,
  '/popover': `Show contextual content and action menus beside their triggers.`,
  '/toast': `Display queued notifications with priorities and deduplication.`,
  '/draggable-pane': `Move and resize floating panels.`,
  '/extras': `Explore small utilities for themes, icons, and source viewers.`,
  '/fullscreen': `Expand a selected part of the page into fullscreen.`,
  '/icons': `Browse and search the bundled SVG icons.`,
  '/json-tree': `Inspect, search, edit, and compare structured data.`,
  '/masonry': `Arrange variable-height content into balanced columns.`,
  '/patterns': `Compose dialogs, sheets, tabs, accordions, and in-page search.`,
  '/split-pane': `Resize adjacent panels with pointer and keyboard controls.`,
  '/virtual-list': `Render a small visible window into a large fixed-height list.`,
  '/wiggle': `Animate a component to draw attention to a change.`,
  '/workbench': `Combine file loading, data inspection, and resizable panels.`,
  '/form': `Form integration and native validation behavior.`,
  '/kit-form-actions': `Progressively enhanced SvelteKit form actions.`,
  '/persistent': `Persist selection across page reloads with sessionStorage.`,
  '/events': `Event callbacks and payloads.`,
  '/disabled': `Disabled options and disabled component states.`,
  '/grouping': `Grouped options, sticky headers, and group actions.`,
  '/infinite-scroll': `Incremental loading with loadOptions.`,
  '/min-max-select': `Use maxSelect and required constraints.`,
  '/input-dropdown': `Single-select editable input with dropdown suggestions.`,
  '/duplicates': `Handle duplicate labels and options.`,
  '/sort-selected': `Keep selected options sorted.`,
  '/range-select': `Select visible ranges with Shift-click and Shift+Arrow.`,
  '/keep-selected': `Keep selected items visible in dropdown.`,
  '/allow-user-options': `Create options from user input.`,
  '/ui': `Core UI controls and visual states.`,
  '/css-classes': `Class-based styling hooks.`,
  '/snippets': `Custom rendering with snippets.`,
  '/portal': `Portaled dropdown rendering and layering.`,
}

// Source groups determine membership; recipes remain searchable without filling the nav.
export const demo_nav_routes = Object.entries(category_info).map(
  ([name, [label, description]]) => ({
    name,
    label,
    description,
    href: `/${name}` as Pathname,
    children: [] as Pathname[],
  }),
)
export const multiselect_recipes: Pathname[] = []
export const demo_pages: Pathname[] = []
for (const filename of Object.keys(import.meta.glob(`./**/+page.{svelte,md}`))) {
  if (filename.includes(`/(hide)/`)) continue
  const parts = /^\.\/\((?<category>[^)]+)\)\/(?<route>.+)\/\+page\.(?:svelte|md)$/u.exec(
    filename,
  )?.groups
  const category = demo_nav_routes.find(({ name }) => name === parts?.category)
  if (!parts || !category)
    throw new Error(`Demo page needs a navigation category: ${filename}`)
  const route = `/${parts.route.replaceAll(/\([^)]+\)\//gu, ``)}` as Pathname
  demo_pages.push(route)
  if (filename.includes(`/(multiselect)/`) && route !== `/multiselect`)
    multiselect_recipes.push(route)
  else category.children.push(route)
}

for (const { href, children } of demo_nav_routes) {
  children.sort((left_route, right_route) => {
    if (left_route === href) return -1
    if (right_route === href) return 1
    return left_route.localeCompare(right_route)
  })
}
multiselect_recipes.sort()

export const demo_labels: Record<string, string> = {
  '/multiselect': `MultiSelect`,
  '/range-slider': `RangeSlider`,
  '/command-menu': `CommandMenu`,
  '/action-button': `ActionButton`,
  '/file-input': `FileInput`,
  '/tree-view': `TreeView`,
  '/json-tree': `JsonTree`,
  '/split-pane': `SplitPane`,
  '/virtual-list': `VirtualList`,
  '/code-editor': `CodeEditor / DiffView`,
  '/ui': `UI`,
  '/css-classes': `CSS Classes`,
  '/kit-form-actions': `Form Actions`,
  '/min-max-select': `Min/Max`,
  '/allow-user-options': `User Options`,
  ...Object.fromEntries(
    demo_pages
      .filter((route) => route.startsWith(`/attachments/`))
      .map((route) => [route, route.slice(`/attachments/`.length).replaceAll(`-`, `_`)]),
  ),
}

export const demo_title = (route: string): string =>
  demo_labels[route] ?? slug_to_title(route.split(`/`).at(-1) ?? route)
