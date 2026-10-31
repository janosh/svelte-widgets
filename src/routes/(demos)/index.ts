import { slug_to_title } from 'svelte-widgets/utils'
import {
  Compass,
  FileCode,
  Grid2x2,
  Layers,
  Puzzle,
  Tune,
  type IconData,
} from 'svelte-widgets/icons'

const category_info: Record<
  string,
  { title: string; description: string; detail?: string; icon: IconData }
> = {
  inputs: {
    title: `Forms and inputs`,
    description: `Choose values, collect files, and organize settings.`,
    detail: `Includes MultiSelect recipes for async loading, forms, grouping, and custom rendering.`,
    icon: Tune,
  },
  navigation: {
    title: `Navigation and search`,
    description: `Help users move through pages, commands, and trees.`,
    detail: `Command palettes, site search, heading navigation, and page layout essentials.`,
    icon: Compass,
  },
  overlays: {
    title: `Dialogs and overlays`,
    description: `Present dialogs, contextual actions, and notifications.`,
    detail: `Confirmations, prompts, action menus, and queued notifications with dismissal and focus handling.`,
    icon: Layers,
  },
  display: {
    title: `Data and layout`,
    description: `Inspect data, arrange content, and show application state.`,
    icon: Grid2x2,
  },
  authoring: {
    title: `Code and documentation`,
    description: `Write interactive documentation and edit code.`,
    detail: `Live code examples, checked snippets, content manifests, and scientific references.`,
    icon: FileCode,
  },
  attachments: {
    title: `Element attachments`,
    description: `Add reusable behavior to ordinary elements.`,
    icon: Puzzle,
  },
}

export const demo_descriptions: Record<string, string> = {
  '/action-button': `Run asynchronous actions with pending, success, and error feedback.`,
  '/button-group': `Choose one or several values with a segmented control.`,
  '/color-input': `Pick colors with editable hex, opacity, presets, and validation.`,
  '/file-input': `Pick or drop files with validation, cancellation, and retry.`,
  '/multiselect': `Select and search options, with recipes for forms, loading, and styling.`,
  '/range-slider': `Adjust a linear or logarithmic interval using two handles or number fields.`,
  '/settings': `Organize, search, and reset related application settings.`,
  '/command-menu': `Find commands and search site content from a keyboard palette.`,
  '/nav': `Build responsive navigation with dropdowns and keyboard controls.`,
  '/breadcrumbs': `Show the path to the current page with link or callback navigation and collapsing.`,
  '/site-chrome': `Add footers, contributor lists, and lightweight media embeds.`,
  '/toc': `Navigate headings with an automatically generated table of contents.`,
  '/tree-view': `Select nodes and visible ranges in a keyboard-navigable tree with lazy-loaded branches.`,
  '/code-editor': `Edit, search, and replace code with virtualized rendering and undoable transactions.`,
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
  '/table': `Compose column picking, per-column filters, cell-range selection and export into a table.`,
  '/theming': `Every CSS custom property components read, generated from source.`,
  '/virtual-list': `Render a small visible window into a large fixed-height list.`,
  '/wiggle': `Animate a component to draw attention to a change.`,
  '/workbench': `Combine file loading, data inspection, and resizable panels.`,
  '/form': `Form integration and native validation behavior.`,
  '/kit-form-actions': `Progressively enhanced SvelteKit form actions.`,
  '/persistent': `Persist selection across page reloads with sessionStorage.`,
  '/events': `Event callbacks and payloads.`,
  '/disabled': `Disabled options and disabled component states.`,
  '/grouping': `Grouped options, sticky headers, and group actions.`,
  '/infinite-scroll': `Incremental loading with load_options.`,
  '/min-max-select': `Use max_select and required constraints.`,
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
  '/authoring/hot-reload': `Edit a live Markdown example and watch it hot reload.`,
  '/attachments/tooltip': `Top-layer tooltips with automatic placement, delegation and hover/focus interaction.`,
  '/attachments/draggable': `Pointer dragging with handles, axis locks and position callbacks.`,
  '/attachments/resizable': `Edge and corner resize handles with keyboard support and size caps.`,
  '/attachments/sortable': `Click-to-sort table headers with custom comparators and styling.`,
  '/attachments/highlight-matches': `Mark search matches in text using the CSS Custom Highlight API.`,
  '/attachments/click-outside': `Dismiss a surface on an outside press or Escape.`,
  '/attachments/dismiss-on-outside-press': `The imperative form of click_outside, for surfaces built from several elements.`,
  '/attachments/focus-trap': `Keep Tab inside a surface and hand the keyboard back when it closes.`,
  '/attachments/hotkey': `Declarative keybindings scoped to a node or the whole page.`,
  '/attachments/float': `Park an element beside an anchor and keep it there while the page moves.`,
  '/attachments/portal': `Move existing DOM into another container and restore it on teardown.`,
  '/attachments/contrast-color': `Pick a readable foreground from the background painted behind an element.`,
  '/attachments/forward-window-keydown': `Route page-level keys to the viewer under the pointer.`,
  '/attachments/file-drop': `Drag-and-drop files with directory expansion and MIME filtering.`,
  '/attachments/stick-to-bottom': `Keep a streaming log or chat pinned to its end until the reader scrolls away.`,
}

// Source groups determine membership; recipes remain searchable without filling the nav.
export const demo_nav_routes = Object.entries(category_info).map(([name, category]) => ({
  ...category,
  name,
  label: slug_to_title(name),
  href: `/${name}`,
  children: [] as string[],
}))
export const multiselect_recipes: string[] = []
export const demo_pages: string[] = []
for (const filename of Object.keys(import.meta.glob(`./**/+page.{svelte,md}`))) {
  if (filename.includes(`/(hide)/`)) continue
  const parts = /^\.\/\((?<category>[^)]+)\)\/(?<route>.+)\/\+page\.(?:svelte|md)$/u.exec(
    filename,
  )?.groups
  const category = demo_nav_routes.find(({ name }) => name === parts?.category)
  if (!parts || !category)
    throw new Error(`Demo page needs a navigation category: ${filename}`)
  const route = `/${parts.route.replaceAll(/\([^)]+\)\//gu, ``)}`
  demo_pages.push(route)
  if (filename.includes(`/(multiselect)/`) && route !== `/multiselect`)
    multiselect_recipes.push(route)
  else if (route !== category.href) category.children.push(route)
}

for (const { children } of demo_nav_routes) children.sort()
multiselect_recipes.sort()

export const demo_labels: Record<string, string> = {
  '/color-input': `ColorInput`,
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
