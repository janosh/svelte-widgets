<h1 align="center">
  <img src="https://raw.githubusercontent.com/janosh/svelte-widgets/HEAD/src/site/favicon.svg" alt="Svelte Widgets" height="60" width="60">
  <br class="hide-in-docs"> Svelte Widgets
</h1>

<h4 align="center">

[![CI](https://github.com/janosh/svelte-widgets/actions/workflows/ci.yml/badge.svg)](https://github.com/janosh/svelte-widgets/actions/workflows/ci.yml)
[![NPM version](https://img.shields.io/npm/v/svelte-widgets?logo=NPM&color=purple)](https://npmjs.com/package/svelte-widgets)
[![Needs Svelte version](https://img.shields.io/npm/dependency-version/svelte-widgets/peer/svelte?color=teal&logo=Svelte&label=Svelte)](https://github.com/sveltejs/svelte/blob/-/packages/svelte/CHANGELOG.md)
[![Playground](https://img.shields.io/badge/Svelte-Playground-blue?label=Try%20it!)](https://svelte.dev/playground/a5a14b8f15d64cb083b567292480db05)
[![Open in StackBlitz](https://img.shields.io/badge/Open%20in-StackBlitz-darkblue?logo=stackblitz)](https://stackblitz.com/github/janosh/svelte-widgets)

</h4>

<p align="center"><strong>
  Keyboard-friendly, accessible and highly customizable Svelte components.
  <a class="hide-in-docs" href="https://svelte-widgets.janosh.dev">View the docs</a>
</strong></p>

## 🧩 &thinsp; Components

Every component is a named export from the package root and has a direct subpath import (`svelte-widgets/Toc.svelte`) so bundlers can skip the rest.

| Component                                                                                                  | What it does                                                                                     | Docs                                                                   |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [`MultiSelect`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/MultiSelect.svelte)             | Keyboard-friendly multi/single select with grouping, async loading and deep style hooks          | [docs](https://svelte-widgets.janosh.dev/multiselect)                  |
| [`CommandMenu`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/CommandMenu.svelte)             | Command palette with fuzzy search, hotkeys, recents and async actions                            | [docs](https://svelte-widgets.janosh.dev/command-menu)                 |
| [`PageSearch`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/PageSearch.svelte)               | Pagefind-backed site search built on `CommandMenu`                                               | [docs](https://svelte-widgets.janosh.dev/command-menu#pagesearch)      |
| [`Popover`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Popover.svelte)                     | Floating surface that positions, dismisses and traps focus for you                               | [docs](https://svelte-widgets.janosh.dev/popover)                      |
| [`ActionMenu`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ActionMenu.svelte)               | Action list opened from a trigger or right-click, with complete menu keyboard semantics          | [docs](https://svelte-widgets.janosh.dev/popover#actionmenu)           |
| [`ConfirmDialog`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ConfirmDialog.svelte)         | Promise-based dialog queue, so two racing prompts can't share one answer                         | [docs](https://svelte-widgets.janosh.dev/dialogs)                      |
| [`Dialog`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Dialog.svelte)                       | Native modal with composable sections, close reasons and nested-dialog handling                  | [docs](https://svelte-widgets.janosh.dev/patterns#dialog)              |
| [`DraggablePane`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/DraggablePane.svelte)         | Floating panel you can drag by its header, resize and reset to its anchor                        | [docs](https://svelte-widgets.janosh.dev/draggable-pane)               |
| [`ColorInput`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ColorInput.svelte)               | Color picker with editable hex, optional opacity, presets, validation, and commit events         | [docs](https://svelte-widgets.janosh.dev/color-input)                  |
| [`NumberRangeInput`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/NumberRangeInput.svelte)   | Paired number and range inputs with linear or logarithmic scales and explicit commits            | [docs](https://svelte-widgets.janosh.dev/settings#numberrangeinput)    |
| [`RangeSlider`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/RangeSlider.svelte)             | Two-handle linear or logarithmic interval slider with numeric fields, RTL, and keyboard controls | [docs](https://svelte-widgets.janosh.dev/range-slider)                 |
| [`SplitPane`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/SplitPane.svelte)                 | Resizable panes with ratio or pixel bounds and collapse support                                  | [docs](https://svelte-widgets.janosh.dev/split-pane)                   |
| [`DockedSidebar`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/DockedSidebar.svelte)         | Resizable sidebar docked beside a main pane, fitting its content and stacking when narrow        | [docs](https://svelte-widgets.janosh.dev/split-pane#dockedsidebar)     |
| [`SequenceControls`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/SequenceControls.svelte)   | Previous/play/next buttons, step input with slider and FPS input for a sequence player           | [docs](https://svelte-widgets.janosh.dev/sequence-controls)            |
| [`VirtualList`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/VirtualList.svelte)             | Fixed-height row virtualization                                                                  | [docs](https://svelte-widgets.janosh.dev/virtual-list)                 |
| [`FileInput`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/FileInput.svelte)                 | File picker and drop zone with validation, cancellation and retry                                | [docs](https://svelte-widgets.janosh.dev/file-input)                   |
| [`ExportDestination`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ExportDestination.svelte) | File name field and destination (downloads, folder or Save As) for a `FileExportState`           | [docs](https://svelte-widgets.janosh.dev/file-input#exportdestination) |
| [`TreeView`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/TreeView.svelte)                   | Keyboard-navigable tree with multiple selection, visible ranges, lazy loading, and custom nodes  | [docs](https://svelte-widgets.janosh.dev/tree-view)                    |
| [`JsonTree`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/json-tree/JsonTree.svelte)         | Searchable JSON inspector with editing, copying and diffs                                        | [docs](https://svelte-widgets.janosh.dev/json-tree)                    |
| [`Progress`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Progress.svelte)                   | Accessible determinate or indeterminate progress                                                 | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`TaskStatus`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/TaskStatus.svelte)               | Task progress, spinner or overlay status with caller-owned cancellation and retry                | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`SettingsGroup`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/SettingsGroup.svelte)         | Collapsible or static group of related settings or controls                                      | [docs](https://svelte-widgets.janosh.dev/settings#settingsgroup)       |
| [`SettingsSearch`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/SettingsSearch.svelte)       | Settings-row filter that expands matching groups and restores their prior state                  | [docs](https://svelte-widgets.janosh.dev/settings#settingssearch)      |
| [`SettingsSection`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/SettingsSection.svelte)     | Titled settings region with explicit changed keys, resets, descriptions and grid layout          | [docs](https://svelte-widgets.janosh.dev/settings#settingssection)     |
| [`Sheet`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Sheet.svelte)                         | Dialog-based modal edge panel with side placement and shared dismissal policies                  | [docs](https://svelte-widgets.janosh.dev/patterns#sheet)               |
| [`Tabs`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Tabs.svelte)                           | Controlled ARIA tabs with automatic or manual keyboard activation                                | [docs](https://svelte-widgets.janosh.dev/patterns#tabs)                |
| [`Accordion`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Accordion.svelte)                 | Single or multi-open disclosure group with snippet-rendered content                              | [docs](https://svelte-widgets.janosh.dev/patterns#accordion)           |
| [`FindBar`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/FindBar.svelte)                     | In-DOM find-in-page bar that highlights, counts and steps through matches                        | [docs](https://svelte-widgets.janosh.dev/patterns#findbar)             |
| [`CodeBlock`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/CodeBlock.svelte)                 | Read-only code with cancellable highlighting, escaped tokens or trusted HTML                     | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`StatGrid`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/StatGrid.svelte)                   | Responsive statistic tiles with units, hints and accessible changes                              | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`Spinner`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Spinner.svelte)                     | Loading indicator, a status region unless decorative                                             | [docs](https://svelte-widgets.janosh.dev/extras#spinner)               |
| [`StatusMessage`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/StatusMessage.svelte)         | Dismissible info, success, warning or error feedback                                             | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`EmptyState`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/EmptyState.svelte)               | Polite "no data" placeholder, inline or overlaid on empty axes or a blank canvas                 | [docs](https://svelte-widgets.janosh.dev/workbench#layout-primitives)  |
| [`KeyValueList`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/KeyValueList.svelte)           | One-line term/value rows that ellipsize long values                                              | [docs](https://svelte-widgets.janosh.dev/workbench#layout-primitives)  |
| [`InfoCard`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/InfoCard.svelte)                   | Grid of label/value rows with units, number formatting and hidden empty rows                     | [docs](https://svelte-widgets.janosh.dev/extras#infocard)              |
| [`ShortcutsList`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ShortcutsList.svelte)         | Collapsible list of keyboard shortcuts with platform-aware key symbols                           | [docs](https://svelte-widgets.janosh.dev/extras#shortcutslist)         |
| [`ColumnPicker`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/table/ColumnPicker.svelte)     | Grouped, searchable show/hide menu for table columns                                             | [docs](https://svelte-widgets.janosh.dev/table)                        |
| [`ColumnFilter`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/table/ColumnFilter.svelte)     | Per-column range, checklist or substring filter for table headers                                | [docs](https://svelte-widgets.janosh.dev/table)                        |
| [`GlassChip`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/GlassChip.svelte)                 | Frosted label overlaid on a canvas, plot or image                                                | [docs](https://svelte-widgets.janosh.dev/workbench#layout-primitives)  |
| [`Tag`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Tag.svelte)                             | Badge, link, toggle or removable chip with variants and auto-contrast text                       | [docs](https://svelte-widgets.janosh.dev/extras#tag)                   |
| [`InfoTag`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/InfoTag.svelte)                     | Label/value pill that copies its value, with semantic variants and a hover popover               | [docs](https://svelte-widgets.janosh.dev/extras#infotag)               |
| [`LiveMessage`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/LiveMessage.svelte)             | Visually hidden live region announcing a changing message                                        | [docs](https://svelte-widgets.janosh.dev/workbench#layout-primitives)  |
| [`DragOverlay`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/DragOverlay.svelte)             | Drop-target overlay with an optional message                                                     | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`CodeEditor`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/CodeEditor.svelte)   | Virtualized code editor with model-wide search, undoable replacement, and go-to-line             | [docs](https://svelte-widgets.janosh.dev/code-editor#codeeditor)       |
| [`DiffView`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/DiffView.svelte)       | Virtualized side-by-side and unified diffs with an injectable backend                            | [docs](https://svelte-widgets.janosh.dev/code-editor)                  |
| [`Toast`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Toast.svelte)                         | Notification queue with priorities, dedupe and pause-on-hover                                    | [docs](https://svelte-widgets.janosh.dev/toast)                        |
| [`Nav`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Nav.svelte)                             | Navigation bar with dropdowns, pinning and active-route styling                                  | [docs](https://svelte-widgets.janosh.dev/nav)                          |
| [`Breadcrumbs`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Breadcrumbs.svelte)             | Breadcrumb trail with link or callback navigation and an expandable collapsed middle             | [docs](https://svelte-widgets.janosh.dev/breadcrumbs)                  |
| [`Heading`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Heading.svelte)                     | Native Svelte heading with an explicit ID and server-rendered anchor                             | [docs](https://svelte-widgets.janosh.dev/toc)                          |
| [`Toc`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Toc.svelte)                             | Manifest-backed table of contents with optional dynamic heading tracking                         | [docs](https://svelte-widgets.janosh.dev/toc)                          |
| [`Masonry`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Masonry.svelte)                     | Column-balancing masonry grid with SSR support and virtualization                                | [docs](https://svelte-widgets.janosh.dev/masonry)                      |
| [`Footer`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Footer.svelte)                       | Centered row of icon links, sized and themed with `--footer-*`                                   | [docs](https://svelte-widgets.janosh.dev/site-chrome#footer)           |
| [`ErrorPage`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ErrorPage.svelte)                 | SvelteKit error-page body with status-aware notes and an offline hint                            | [docs](https://svelte-widgets.janosh.dev/site-chrome)                  |
| [`ActionButton`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ActionButton.svelte)           | Async action button with pending, success and error feedback                                     | [docs](https://svelte-widgets.janosh.dev/action-button)                |
| [`CopyButton`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/CopyButton.svelte)               | Copy-to-clipboard button with success and error feedback                                         | [docs](https://svelte-widgets.janosh.dev/action-button#copybutton)     |
| [`ButtonGroup`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ButtonGroup.svelte)             | Segmented control over a set of options, single or multi select                                  | [docs](https://svelte-widgets.janosh.dev/button-group)                 |
| [`FullscreenButton`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/FullscreenButton.svelte)   | Fullscreen toggle scoped to one wrapper, so viewers don't fight over the flag                    | [docs](https://svelte-widgets.janosh.dev/fullscreen)                   |
| [`ThemeToggle`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ThemeToggle.svelte)             | Light/dark/system theme cycler with persistence and cross-tab synchronization                    | [docs](https://svelte-widgets.janosh.dev/extras#themetoggle)           |
| [`ThemeScript`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ThemeScript.svelte)             | Inline `<head>` script restoring the stored theme before first paint                             | [docs](https://svelte-widgets.janosh.dev/extras)                       |
| [`Toggle`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Toggle.svelte)                       | Accessible switch with a bindable `checked`                                                      | [docs](https://svelte-widgets.janosh.dev/extras#toggle)                |
| [`CodeExample`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/CodeExample.svelte)             | Collapsible source viewer used by the live examples                                              | [docs](https://svelte-widgets.janosh.dev/extras#codeexample)           |
| [`LazyMount`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/LazyMount.svelte)                 | Mounts a component or snippet once it nears the viewport, holding its height                     | [docs](https://svelte-widgets.janosh.dev/extras#lazymount)             |
| [`PropsTable`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/PropsTable.svelte)               | Collapsible prop reference generated from a component's `$props()`                               | [docs](https://svelte-widgets.janosh.dev/extras#propstable)            |
| [`FileDetails`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/FileDetails.svelte)             | Collapsible `<details>` viewer for a set of files                                                | [docs](https://svelte-widgets.janosh.dev/extras#filedetails)           |
| [`PrevNext`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/PrevNext.svelte)                   | Previous/next links for sequential pages                                                         | [docs](https://svelte-widgets.janosh.dev/extras#prevnext)              |
| [`SubpageGrid`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/SubpageGrid.svelte)             | Card grid linking to child pages                                                                 | [docs](https://svelte-widgets.janosh.dev/extras#subpagegrid)           |
| [`Icon`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Icon.svelte)                           | Inline SVG icon from the bundled set                                                             | [docs](https://svelte-widgets.janosh.dev/extras#icon)                  |
| [`GitHubCorner`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/GitHubCorner.svelte)           | The classic corner ribbon link                                                                   | [docs](https://svelte-widgets.janosh.dev/extras#githubcorner)          |
| [`ContributorList`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ContributorList.svelte)     | Avatar row of GitHub contributors                                                                | [docs](https://svelte-widgets.janosh.dev/site-chrome#contributorlist)  |
| [`LiteYouTubeEmbed`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/LiteYouTubeEmbed.svelte)   | YouTube poster that only loads the player iframe once clicked                                    | [docs](https://svelte-widgets.janosh.dev/site-chrome#liteyoutubeembed) |

Nineteen [attachments](https://svelte-widgets.janosh.dev/attachments) work on any element: eighteen come from `svelte-widgets/attachments`, while `heading_anchors` has its own subpath. `dismiss_on_outside_press` is the lower-level multi-surface primitive behind `click_outside`.

```svelte
<script>
  import { CommandMenu, MultiSelect, Popover, Tabs, Toc } from 'svelte-widgets'
</script>
```

## 💡 &thinsp; Features

- **Lightweight components:** core widgets need only Svelte; Markdown uses Marked and js-yaml, while math and syntax highlighting use optional peers
- **Keyboard friendly:** every interactive component is fully operable without a mouse
- **Bindable:** component state is exposed through `$bindable` props, so you can both read it and drive it from the outside
- **Themeable:** CSS variables with sensible defaults on every element, plus prop bags to spread arbitrary attributes onto internals
- **SSR-safe:** components support server rendering; browser-only helpers run on the client
- **Typed:** props, snippets and events are inferred from the data you pass

## 🧪 &thinsp; Coverage

The [unit CI job](https://github.com/janosh/svelte-widgets/actions/workflows/ci.yml) reports current coverage and enforces the thresholds in [`vite.config.ts`](https://github.com/janosh/svelte-widgets/blob/main/vite.config.ts).

## 🔨 &thinsp; Installation

```sh
npm install -D svelte-widgets
```

## Migrating to 1.8

Custom library APIs use snake_case. Native DOM handlers such as `onclick`, `oninput`, and `onchange` keep their browser names and receive DOM events. In particular, replace MultiSelect's former custom `onchange` with `on_change` to keep receiving selection details.

| Previous API                                                                    | Replacement                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom props and snippets such as `searchText`, `maxSelect`, `selectedItem`     | `search_text`, `max_select`, `selected_item`; apply snake_case throughout custom props and snippet fields                                                                                                     |
| MultiSelect `onchange`, `onadd`, `onremove`                                     | `on_change`, `on_add`, `on_remove`; native `onchange` receives a DOM event                                                                                                                                    |
| `loadOptions`, `debounceMs`, `batchSize`, result `hasMore`                      | `load_options`, `debounce_ms`, `batch_size`, result `has_more`                                                                                                                                                |
| Editor backend fields such as `docId`, `requestId`, `startLine`, `oldText`      | `doc_id`, `request_id`, `start_line`, `old_text`; update both request and response payloads                                                                                                                   |
| Optional, numeric, or repeated command action IDs                               | Required, unique, nonempty string IDs across each menu, including sections and loaded pages; convert numeric IDs explicitly and resolve collisions. `CmdSection.selected` is a string or `null` when supplied |
| `CommandMenu.onadd` and selection/creation controls                             | `on_execute({ action })`; command menus execute one action without retaining selection                                                                                                                        |
| MultiSelect `history`, `undo`, `redo`, `canUndo`, `canRedo`, `onundo`, `onredo` | Manage selection history in the caller using `bind:value`                                                                                                                                                     |
| MultiSelect `parseLabelsAsHtml`, `activeOptionFallbackKey`                      | Use `option` / `selected_item` snippets for custom rendering and a stable `key` function for option identity                                                                                                  |
| `NumberRangeInput.schema`                                                       | Pass explicit `min`, `max`, and `step` values from the schema                                                                                                                                                 |
| `print_element(node, { single_page, page_width_mm, px_per_inch, filename })`    | `print_page({ filename })` prints the whole page; use `@media print` CSS for visibility and pagination                                                                                                        |
| `/live-examples`, `/live-examples/create-highlighter`, `/katex`                 | `/markdown`, `/markdown/vite`, `/highlight`; see the [Markdown migration guide](https://svelte-widgets.janosh.dev/markdown#migration)                                                                         |

Command IDs are compared exactly, without coercion or trimming. Empty and whitespace-only strings are rejected; action labels and section titles may repeat. Preserve a section object when reordering it to retain its rendered nodes.

## Migrating to 1.9

- Nav, PrevNext, Footer, and SubpageGrid share named link fields: `{ href, label, target?, rel?, title? }`. PrevNext takes link objects; SubpageGrid adds `description` and optional `icon`. String/tuple routes and `external` are removed; use native `target`/`rel`.
- Nav uses `pathname`, `bind:open`, and one `item({ route, is_active })` content snippet for every link and group heading; Nav owns the enclosing anchor or span. Replace `page`, `route_labels`, `tooltips`, and `link`; put plain-text labels and tooltip options on each route. Groups explicitly list child link objects and optionally have their own href. Disabled is boolean; separators are separate `{ separator: true }` entries. Only the most specific matching link gets `aria-current="page"`: `/docs` stays current on its subpages unless the nav also links that subpage, and disabled links never claim it.
- PrevNext uses `as` and `labels` instead of `node` and `titles`. Nonempty lists require a matching `current` href. Supply router attributes through `link_props`.
- ActionMenu uses `on_execute({ action, section })` instead of `on_select(action, section)`; custom action types flow through callbacks and snippets. Import `CmdSection<Action>` from the package root instead of `utils`. CommandMenu accepts initially empty actions.
- NumberRangeInput requires numeric bounds and a numeric step or `"any"`. Use `label` for its accessible name, `title` for the tooltip, and native `data-key` instead of `setting`.
- MultiSelect uses `bind:value` alone: `mode="single"` takes one option or `null`, and the default `mode="multiple"` takes an array. Empty options are valid without an `allow_empty` flag; remove that prop.
- ButtonGroup, Accordion, and TreeView use `mode="single" | "multiple"`, `bind:value`, and `on_change(value)`. Single mode (the default) uses one value or `null`; multiple mode uses an array. ButtonGroup no longer accepts record or tuple options: pass an array of strings or `{ value, label?, ... }` objects. `ButtonGroupOption` is exported from the package root.
- SettingsSection takes `changed_keys` and `on_reset_key(key)`. Value comparison and reset defaults belong to the caller. Put descriptions on rows with `data-description`; the `setting_metadata` prop is removed.
- Dialog and Sheet use only `closedby="any" | "closerequest" | "none"` for dismissal. The default `any` allows backdrop and Escape; `closerequest` allows Escape; `none` requires an explicit close action. Remove `close_on_backdrop` and `close_on_escape`.
- `init_theme()` initializes and follows system and storage changes, returning a cleanup function. It replaces `listen_theme_storage()`; `resolve_theme_mode` and `system_preference` are internal. ThemeToggle starts and stops its own watcher.
- Shortcut parsing, formatting, matching, and rebinding share one grammar, including modifier aliases. Invalid shortcuts return `null` from `parse_shortcut` and `normalize_combo`, never match key events, and throw from `format_shortcut`. Invalid default shortcuts throw during override validation.
- The unused `utils.values_equal` export is removed. Shared Vite config returns independently owned nested settings, including overrides.
- Tooltips accept plain text and hover/focus triggers. Use Popover for formatted content, controls, and application-controlled visibility.
- Native Svelte headings use `Heading` with an explicit ID; remove `heading_ids()` from preprocessors. Toc consumes `items` metadata or discovers existing IDs with `dynamic`; invalid selectors and collapse modes throw.
- CodeEditor's `RangeEdit` is `TextEdit & EditorSelection`: rename `range_start`/`range_end`/`replacement`/`selection_start`/`selection_end` to `from`/`to`/`insert`/`anchor`/`head`. Custom `EditorModel` implementations add `checkpoint()` and accept an optional state id in `mark_saved(state_id?)`.
- JsonTree's `matches_search(key, value, query)` drops the path argument, and its `values_equal` treats different arrays or objects of the same size as unequal.
- MultiSelect's bound `collapsed_groups` is a plain `Set`: assign a new one instead of mutating it. Virtual-list `item_height` overrides row heights set through `li_option_props.style`.
- `fuzzy_match` throws on `null`/`undefined` instead of returning `false`, and `heading_anchors()` always returns its cleanup function.

## Migrating to 1.13

- Options and props named `enabled` are now `disabled`, with an unchanged default: `dismiss_on_outside_press` (and ActionMenu's `dismiss`), `float`, `focus_trap`, `hotkey`, `forward_window_keydown`, and each `Hotkey` binding.
- `*_class` and `*_style` props are now `*_props` objects of element attributes (`ElementProps<E>`: class, style, `data-*`, aria, title; event handlers stay internal). MultiSelect and CommandMenu: `li_option_props`, `ul_options_props`, `li_group_header_props`, `li_selected_props`, `ul_selected_props`, `li_user_msg_props`, `max_select_msg_props`, `li_select_all_props`; use `input_props` for `input_class`/`input_style` and the root `class` for `outer_div_class`. `li_active_option_class` and `li_active_user_msg_class` stay, since they style a state. DataTable `scroll_style` is `scroll_props` (its `style` makes the container the scroller) and `root_style` is removed in favor of `style`. DraggablePane `icon_style` is `icon_props`.
- Open and close callbacks are split and report why as `{ via }`. Tooltip `on_open_change(open, detail)` is `on_open({ via })` (`pointer`, `focus`) and `on_close({ via })` (`pointer`, `blur`, `escape`, `visibility`). Toc `on_open_change` is `on_open` and `on_close` with `{ via, desktop }`, renaming via `button` to `trigger`, `outside-click` to `pointer` and `toc-item` to `select`. DraggablePane's close via `toggle` is `trigger` and `button` is `close`. MultiSelect `on_open` and Nav `on_open`/`on_close` gain a `{ via }` argument. Toc and Nav no longer report their initial state on mount. The `OpenChangeVia`, `OpenChangeEvent` and `OpenChangeHandler` types are replaced by per-component `*OpenVia`/`*CloseVia` types. Every overlay with a bindable `open` now reports both ways: Dialog (and Sheet), Popover and DraggablePane gain `on_open`; ActionMenu, CommandMenu (forwarded by PageSearch), ColumnFilter and ColumnPicker gain `on_open` and `on_close`. Each `*CloseVia` gains `programmatic`, so a change through the bound `open` is now reported (Dialog's `on_close` used to skip it), and exhaustive matches over these unions need that case. These callbacks now run after the DOM update rather than synchronously inside the triggering event, and opening and closing within one tick reports nothing. FindBar's `on_close` receives `{ via: 'close' | 'escape' }`.
- `watch_dark_mode(element, on_change)` takes the element first and requires it. `watch_theme()` is `init_theme()`. `create_flash()` exposes `.current` instead of `.value`.
- URL params: `valid_query_param` is `string_from_param`; `sort_from_param(params, key, default_sort, valid_columns?)` and `sort_url_entry(key, sort, default_sort)` take the key first and require it.
- `fallback_placements` is removed from `compute_position`, `float` and tooltip options: pass `flip: Placement[]` (with `placement: 'auto'` the candidates, otherwise the fallbacks after the preferred placement).
- `ClickFeedback` is removed. Call `copy_text(text, { anchor })` from `svelte-widgets/browser`, which writes the clipboard, shows a toast beside the anchor and announces it to screen readers. JsonTree and DataTable use it too, so their copy feedback is a `.copy-toast` instead of JsonTree's `.copy-feedback`.
- CSS variables: `-border-radius` suffixes are `-radius` (e.g. `--sms-radius`, `--pane-radius`, `--toc-li-radius`), `-background` suffixes are `-bg` (`--toggle-bg`, `--theme-toggle-bg`, `--toggle-knob-after-bg`), and `--accent`/`--accent-hover` are `--accent-color`/`--accent-hover-color`.
- Heading anchors that appear on hover now come from an opt-in stylesheet: `import 'svelte-widgets/heading-anchors.css'`.
- DraggablePane styles the labels, buttons, inputs and selects inside its pane, so pane controls look different unless you override them.

## 🚚 &thinsp; Migrating from `svelte-multiselect`

This package was called `svelte-multiselect` up to v11 ([#432](https://github.com/janosh/svelte-widgets/pull/432)). Swap it out:

```sh
npm uninstall svelte-multiselect && npm install -D svelte-widgets
```

Then rewrite the imports. Matching on the opening quote (all three kinds) keeps prose and GitHub URLs untouched, and covers every subpath along with the bare import. It skips `.md` deliberately: in markdown a backtick-quoted mention is usually prose, not an import.

```sh
find src -type f \( -name '*.svelte' -o -name '*.ts' -o -name '*.js' \) -exec perl -pi -e "s{(['\"\`])svelte-multiselect}{\$1svelte-widgets}g" {} +
```

Three things the rewrite cannot do for you: `CmdPalette` is now `CommandMenu` and `PagefindPalette` is now `PageSearch` ([#428](https://github.com/janosh/svelte-widgets/pull/428)), and `click_outside` changed shape (it dismisses on `pointerdown`, and `exclude`/`include` merged into one `inside` option) ([#431](https://github.com/janosh/svelte-widgets/pull/431)). See the [changelog](changelog.md) for the details.

Coming from `svelte-toc` or `svelte-bricks` instead? Those are now `Toc` and `Masonry` here ([#432](https://github.com/janosh/svelte-widgets/pull/432)), so the same swap applies with `import { Toc } from 'svelte-widgets'` and `import { Masonry } from 'svelte-widgets'`.

## 📦 &thinsp; Subpath exports

Components have direct `.svelte` entry points, and headless/build-time APIs have focused subpaths:

```ts
import {
  anchored_popover, // native auto popover floated beside the button that invokes it
  auto_update_position, // coalesce floating-position updates and clean up listeners
  click_outside, // dismiss a surface when a press lands outside it
  draggable,
  float, // park an element next to an anchor and keep it there
  focus_trap, // keep Tab inside a surface, hand focus back when it closes
  highlight_matches,
  hotkey, // declarative keybindings, `mod` maps to Cmd or Ctrl
  escape_layer, // add a handler to the shared LIFO Escape stack, optionally while focused
  sortable,
  tooltip,
  create_wiggle, // spring shake to flag a change, e.g. a rejected input
} from 'svelte-widgets/attachments'
import { get_label, make_change_detector } from 'svelte-widgets/utils'
import { compute_position } from 'svelte-widgets/position' // pick a side that fits, stay on screen
import { fuzzy_match } from 'svelte-widgets/match'
import { format_shortcut } from 'svelte-widgets/shortcuts'
import { heading_anchors } from 'svelte-widgets/heading-anchors'
```

| Subpath                                                                                                               | API                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| [`/attachments`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/attachments/index.ts)                     | Element attachments and dismissal primitives                                                           |
| [`/canvas`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/canvas.svelte.ts)                              | Canvas sizing, DPR tracking, coalesced redraws and freehand image markup                               |
| [`/format`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/format.ts)                                     | `format_num` (d3-style specs incl. SI prefixes, or options), byte sizes and CSV                        |
| [`/roving-focus`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/roving-focus.svelte.ts)                  | One keyboard tab stop across available HTML or SVG items, including nested groups                      |
| [`/table`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/table/index.ts)                                 | Column picker, column filters, cell-range selection and table export                                   |
| [`/code-editor`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/index.ts)                     | Backend-agnostic editing, diff rendering and primitives                                                |
| [`/code-editor/editor.css`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/editor.css)        | Shared syntax-token and diff-view styles                                                               |
| [`/browser`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/browser/index.ts)                             | Clipboard feedback, downloads, export destinations, printing, storage, URL params, polling, fullscreen |
| [`/dialogs`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/dialogs.svelte.ts)                            | Queued choice, confirmation and prompt requests                                                        |
| [`/effects`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/effects.svelte.ts)                            | Reduced motion, delayed busy flags, on-screen state, pulses, self-written props                        |
| [`/figure-export`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/figure-export.ts)                       | Standalone SVG and DPI-tagged PNG export of live SVG, HTML and canvas figures                          |
| [`/file-drop`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/file-drop.ts)                               | Directory expansion and accept filtering                                                               |
| [`/find-in-page`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/find-in-page.svelte.ts)                  | Reactive find-in-page cursor behind `FindBar`                                                          |
| [`/heading-anchors`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/heading-anchors.ts)                   | Heading text/ID helpers, slugger and anchor attachment                                                 |
| [`/heading-anchors.css`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/heading-anchors.css)              | Reveals heading anchor links on hover and focus                                                        |
| [`/icons`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/icons.ts)                                       | Dynamic icon registry                                                                                  |
| [`/icons/builders`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/icons/builders.ts)                     | `markup_icon` / `path_icon` for drawing glyphs in the icon set's 24x24 frame                           |
| [`/json-tree`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/json-tree/index.ts)                         | JSON inspector component and types                                                                     |
| [`/json-tree/path`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/json-tree/path.ts)                     | Dot/bracket path formatting and resolution                                                             |
| [`/json-tree/utils`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/json-tree/utils.ts)                   | JSON traversal, immutable path edits, search and diff helpers                                          |
| [`/labels`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/labels.ts)                                     | Default UI strings for i18n, incl. attachments & helpers                                               |
| [`/highlight`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/highlight/index.ts)                         | Lazy default and custom grammar highlighters                                                           |
| [`/highlight/theme.css`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/highlight/theme.css)              | Syntax colors that follow the page's `color-scheme`                                                    |
| [`/markdown`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/index.ts)                           | Markdown-to-Svelte preprocessor and direct HTML renderer                                               |
| [`/markdown/vite`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/vite.ts)                       | Live code examples with virtual modules and hot reload                                                 |
| [`/markdown/content`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/content.ts)                 | Content manifests, typed frontmatter, link validation, TOC and search records                          |
| [`/markdown/check`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/check.ts)                     | Node-only syntax, type and assertion checks for documentation examples                                 |
| [`/markdown/mermaid`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/mermaid.ts)                 | Client-side Mermaid rendering and theme sync for `mermaid: true` diagrams                              |
| [`/source-links`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/source-links/index.ts)                   | Link inline code mentions of your source to GitHub                                                     |
| [`/source-links/vite-plugin`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/source-links/vite-plugin.ts) | Vite plugin emitting the file/export index those links use                                             |
| [`/source-links/virtual`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/source-links/virtual.d.ts)       | Types for the plugin's `virtual:source-symbols` module                                                 |
| [`/prop-docs/vite-plugin`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/prop-docs/vite-plugin.ts)       | Vite plugin extracting `$props()` docs for `PropsTable`                                                |
| [`/prop-docs/virtual`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/prop-docs/virtual.d.ts)             | Types for the plugin's `virtual:prop-docs` modules                                                     |
| [`/text-search`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/text-search.ts)                           | Text ranges, highlighting and search-jump helpers                                                      |
| [`/sequence-player`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/sequence-player.svelte.ts)            | Playback state, seeking, FPS snapping and keyboard shortcuts for ordered frames                        |
| [`/theme`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/theme.svelte.ts)                                | Headless light/dark/system state, color-scheme reads and watching, color tokens                        |
| [`/theme-core`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/theme-core.ts)                             | `/theme` minus its reactive state, for bundles without the Svelte compiler                             |
| [`/toast-queue`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/toast-queue.svelte.ts)                    | Toast reducer and reactive store                                                                       |
| [`/utils`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/utils.ts)                                       | Error coercion, HTML text/escaping, option helpers, change detection, value keys                       |
| [`/position`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/position.ts)                                 | `compute_position`: flip and shift geometry for floating surfaces                                      |
| [`/shortcuts`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/shortcuts.ts)                               | Shortcut parsing, matching, display, rebinding and focus stepping                                      |
| [`/match`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/match.ts)                                       | Fuzzy and term matching (`create_term_matcher`), command filters                                       |
| [`/virtual`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/virtual.ts)                                   | Visible-window calculation for fixed-size items                                                        |
| [`/vite-config`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/vite-config.ts)                           | This repository's Vite Plus configuration helper                                                       |
| [`/worker-client`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/worker-client.svelte.ts)                | Persistent Web Worker client with request dedupe, abort, progress, sync fallback                       |
| [`/worker-serve`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/worker-serve.ts)                         | Worker-side half of the `/worker-client` protocol, free of Svelte runtime code                         |
| [`/assets`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/assets.ts)                                     | Svelte preprocessor for relative media, responsive images and downloads                                |
| [`/yaml`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/yaml.ts)                                         | YAML parsing, serialization, and Vite imports with build-time transformation                           |

[`create_canvas_surface()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/canvas.svelte.ts#L11) owns both layers' inline CSS dimensions and restores them on cleanup. Supply `height()` or give the parent a definite height; draw callbacks receive CSS-pixel coordinates and isolated context state. [`create_roving_focus()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/roving-focus.svelte.ts#L37) keeps nested groups independent and observes DOM eligibility changes, including hidden panels and disabled items.

`StatGrid` changes are neutral by default; set an item's `delta_tone` to `positive` or `negative` when the change has that meaning. [`rows_to_csv(rows, columns)`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/format.ts#L390) accepts explicit readonly columns for sparse rows or header-only exports. URL validators accept native Sets or record keys; present empty strings remain valid when allowed.

`CodeEditor` and `DiffView` take host-supplied `EditorBackend` and `DiffBackend` implementations, either through their `backend` props or once per app with [`set_editor_backend()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/types.ts#L180) and [`set_diff_backend()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/types.ts#L182). Import `svelte-widgets/code-editor/editor.css` alongside them for the token palette and shared line metrics. The editor takes a host-owned `model={create_editor_model({ uri, text })}` whose rope, UTF-16 selection, transactions, dirty checkpoint, and bounded history remain usable at 100 MB / 1,000,000 lines. Saving is an optional callback, so file reads, persistence, conflicts and draft policy remain in the host. The editable DOM uses a viewport-sized textarea; explicit selections may expand that window, while scroll height remains subject to browser limits. Both backend contracts are runtime-agnostic and can call a native process, worker, WASM module or server route.

Run the opt-in, hardware-sensitive editor stress target locally with `RUN_LARGE_EDITOR_TESTS=1 npx vitest run tests/vitest/code-editor-model.test.ts`; normal CI deliberately skips it.

Use [`markdown()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/index.ts#L944) for Markdown pages with YAML frontmatter, embedded Svelte, GFM tables and task lists. Enable `math` to render TeX as MathML via Temml. Markdown renders heading IDs and anchor links in the initial HTML; use the `Heading` component with an explicit `id` for native Svelte pages:

```ts
import { create_markdown, markdown } from 'svelte-widgets/markdown'
import { asset_imports } from 'svelte-widgets/assets'

export default {
  extensions: [`.svelte`, `.md`],
  preprocess: [markdown(create_markdown({ math: true })), asset_imports()],
}
```

```svelte
<script lang="ts">
  import { Heading, Toc } from 'svelte-widgets'

  const headings = [{ id: `overview`, title: `Overview`, level: 2 }]
</script>

<Toc items={headings} />
<Heading id="overview">Overview</Heading>
```

Heading links render in the initial HTML. Reveal them with `opacity` on hover or focus so their space stays reserved. `Heading` takes `level`, `id`, an optional decorative `icon`, and `link={false}` to suppress a link. Markdown owns its generated IDs and anchors; [`create_markdown({ heading_links: false })`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/index.ts#L867) emits IDs alone. `Toc` consumes heading metadata for its initial render; opt into `dynamic` for DOM-discovered content. The optional [`heading_anchors()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/heading-anchors.ts#L198) attachment enhances dynamically inserted headings. Anchors carry their gap from the heading text inline as `padding-inline-start: var(--heading-anchor-gap, 0.3em)`; set `--heading-anchor-gap` to tune it.

Use `engine.render(source, { filename })` for HTML strings, or parse once with `engine.parse(source, { dialect: "markdown" })` and pass the document to [`render_markdown()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/index.ts#L937) when you also need its manifest. Set `frontmatter: false` in [`create_markdown()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/index.ts#L867) for embedded data fields whose leading `---` should remain Markdown. Access frontmatter as `metadata.title`; fence settings are validated during parsing. Use [`check_document(document, options)`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/check.ts#L460) from `/markdown/check` for one-shot documentation checks. Use [`assert_ok()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/diagnostics.ts#L49) to unwrap results at build boundaries and [`markdown_vite(engine)`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/vite.ts#L58) for runnable code fences. See the [Markdown API](https://svelte-widgets.janosh.dev/markdown) for configuration and migration details. Import a Temml stylesheet such as `temml/dist/Temml-Local.css` once when enabling math. Enable `mermaid` to render ` ```mermaid ` fences as diagrams in the browser via the optional Mermaid peer.

[`asset_imports()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/assets.ts#L75) resolves relative media URLs, `srcset` candidates, PDF links and download links through Vite, preserving query strings and fragments. Place it after Markdown preprocessing so authored Markdown images are included. Dynamic URLs, component props, public-root paths and external URLs remain unchanged. Filenames containing `#` or `?` must be renamed because Vite interprets those characters as URL delimiters, even when encoded in the authored URL.

Import `parse_yaml()` and `stringify_yaml()` from `svelte-widgets/yaml`. Both use YAML 1.2 core schema (dates stay strings) and accept js-yaml options, such as `{ lineWidth: -1 }` to disable wrapping. Parsing returns `unknown`; narrow it before use. Serialization discards comments and original formatting.

Add [`yaml_plugin()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/yaml.ts) to Vite's `plugins` to import `.yaml`, `.yml` and YAML citation files (`.cff`) as default-exported data. It uses the same core-schema parser. Destructure the default export instead of using named imports. An optional `transform(data, filename)` callback can validate or asynchronously enrich data at build time, including rendering Markdown fields; return the data to export. The plugin additionally rejects cycles and non-JSON values with filename context. Vite handles explicit `?raw` and `?url` imports.

`Popover` and `ActionMenu` use the browser Popover API for top-layer rendering, light dismissal and Escape handling, while `float` supplies placement. Explicit custom dismissal policies still use `click_outside`. Dialog-like popovers can add `focus_trap`; action menus use Arrow/Home/End navigation and close on Tab so browser focus continues in page order.

```svelte
<script lang="ts">
  import { ActionMenu, Popover } from 'svelte-widgets'

  const actions = [{ label: `Reload`, action: () => location.reload() }]
</script>

<Popover placement="bottom" align="start">
  {#snippet trigger(props)}
    <button {...props}>Options</button>
  {/snippet}
  <p>Anything you like in here.</p>
</Popover>

<ActionMenu {actions}>
  {#snippet trigger(props)}
    <button {...props}>Page actions</button>
  {/snippet}
</ActionMenu>

<ActionMenu {actions}>
  <div>Right-click anywhere in this region</div>
</ActionMenu>
```

See the [Markdown guide](https://svelte-widgets.janosh.dev/markdown) for highlighting and runnable examples.

Docs that mention source files or exports in inline code (`` `Footer` ``, `` `make_config` ``) can link them to the GitHub line they live on, pinned to the commit the site was built from. Add the plugin to `vite.config.ts`, reference its virtual-module types from `src/app.d.ts` and attach the linker to the element that wraps your pages:

```ts
// vite.config.ts
import source_links from 'svelte-widgets/source-links/vite-plugin'
export default { plugins: [sveltekit(), source_links()] } // indexes src/lib by default

// src/app.d.ts
/// <reference types="svelte-widgets/source-links/virtual" />

// src/site/source-links.ts
import { create_source_links } from 'svelte-widgets/source-links'
import * as source_symbols from 'virtual:source-symbols'
export const { link_source_mentions, source_href } = create_source_links(source_symbols)
```

```svelte
<main {@attach link_source_mentions}>{@render children()}</main>
```

Unambiguous source names and function calls link: a file name or bare component name (`Footer`, `utils.ts`) points at the file, while an exported definition (`make_config`) or call (`make_config({ build: {} })`) points at its definition line. Arguments can include nested calls, objects, and line breaks. Overload declarations in one file share the first declaration's link; names defined in several files (`index.ts`) or that aren't source (`label`) are left alone. `source_href(name)` accepts the same names and calls for use in your own markup.

## 🆕 &thinsp; Changelog

[View the changelog](changelog.md).

## 🙏 &thinsp; Contributing

Here are some steps to [get you started](contributing.md) if you'd like to contribute to this project!
