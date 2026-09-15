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

| Component                                                                                                | What it does                                                                                     | Docs                                                                   |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| [`MultiSelect`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/MultiSelect.svelte)           | Keyboard-friendly multi/single select with grouping, async loading and deep style hooks          | [docs](https://svelte-widgets.janosh.dev/multiselect)                  |
| [`CommandMenu`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/CommandMenu.svelte)           | Command palette with fuzzy search, hotkeys, recents and async actions                            | [docs](https://svelte-widgets.janosh.dev/command-menu)                 |
| [`PageSearch`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/PageSearch.svelte)             | Pagefind-backed site search built on `CommandMenu`                                               | [docs](https://svelte-widgets.janosh.dev/command-menu#pagesearch)      |
| [`Popover`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Popover.svelte)                   | Floating surface that positions, dismisses and traps focus for you                               | [docs](https://svelte-widgets.janosh.dev/popover)                      |
| [`ActionMenu`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ActionMenu.svelte)             | Action list opened from a trigger or right-click, with complete menu keyboard semantics          | [docs](https://svelte-widgets.janosh.dev/popover#actionmenu)           |
| [`ConfirmDialog`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ConfirmDialog.svelte)       | Promise-based dialog queue, so two racing prompts can't share one answer                         | [docs](https://svelte-widgets.janosh.dev/dialogs)                      |
| [`Dialog`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Dialog.svelte)                     | Native modal with composable sections, close reasons and nested-dialog handling                  | [docs](https://svelte-widgets.janosh.dev/patterns#dialog)              |
| [`DraggablePane`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/DraggablePane.svelte)       | Floating panel you can drag by its header, resize and reset to its anchor                        | [docs](https://svelte-widgets.janosh.dev/draggable-pane)               |
| [`ColorInput`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ColorInput.svelte)             | Color picker with editable hex, optional opacity, presets, validation, and commit events         | [docs](https://svelte-widgets.janosh.dev/color-input)                  |
| [`NumberRangeInput`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/NumberRangeInput.svelte) | Paired number and range inputs with linear or logarithmic scales and explicit commits            | [docs](https://svelte-widgets.janosh.dev/settings#numberrangeinput)    |
| [`RangeSlider`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/RangeSlider.svelte)           | Two-handle linear or logarithmic interval slider with numeric fields, RTL, and keyboard controls | [docs](https://svelte-widgets.janosh.dev/range-slider)                 |
| [`SplitPane`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/SplitPane.svelte)               | Resizable panes with ratio or pixel bounds and collapse support                                  | [docs](https://svelte-widgets.janosh.dev/split-pane)                   |
| [`VirtualList`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/VirtualList.svelte)           | Fixed-height row virtualization                                                                  | [docs](https://svelte-widgets.janosh.dev/virtual-list)                 |
| [`FileInput`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/FileInput.svelte)               | File picker and drop zone with validation, cancellation and retry                                | [docs](https://svelte-widgets.janosh.dev/file-input)                   |
| [`TreeView`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/TreeView.svelte)                 | Keyboard-navigable tree with multiple selection, visible ranges, lazy loading, and custom nodes  | [docs](https://svelte-widgets.janosh.dev/tree-view)                    |
| [`JsonTree`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/json-tree/JsonTree.svelte)       | Searchable JSON inspector with editing, copying and diffs                                        | [docs](https://svelte-widgets.janosh.dev/json-tree)                    |
| [`Progress`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Progress.svelte)                 | Accessible determinate or indeterminate progress                                                 | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`TaskStatus`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/TaskStatus.svelte)             | Task progress and errors with caller-owned cancellation and retry                                | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`SettingsGroup`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/SettingsGroup.svelte)       | Collapsible group for organizing related settings sections                                       | [docs](https://svelte-widgets.janosh.dev/settings#settingsgroup)       |
| [`SettingsSearch`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/SettingsSearch.svelte)     | Settings-row filter that expands matching groups and restores their prior state                  | [docs](https://svelte-widgets.janosh.dev/settings#settingssearch)      |
| [`SettingsSection`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/SettingsSection.svelte)   | Titled settings region with explicit changed keys, resets, descriptions and grid layout          | [docs](https://svelte-widgets.janosh.dev/settings#settingssection)     |
| [`Sheet`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Sheet.svelte)                       | Dialog-based modal edge panel with side placement and shared dismissal policies                  | [docs](https://svelte-widgets.janosh.dev/patterns#sheet)               |
| [`Tabs`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Tabs.svelte)                         | Controlled ARIA tabs with automatic or manual keyboard activation                                | [docs](https://svelte-widgets.janosh.dev/patterns#tabs)                |
| [`Accordion`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Accordion.svelte)               | Single or multi-open disclosure group with snippet-rendered content                              | [docs](https://svelte-widgets.janosh.dev/patterns#accordion)           |
| [`FindBar`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/FindBar.svelte)                   | In-DOM find-in-page bar that highlights, counts and steps through matches                        | [docs](https://svelte-widgets.janosh.dev/patterns#findbar)             |
| [`CodeBlock`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/CodeBlock.svelte)               | Read-only code with cancellable highlighting, escaped tokens or trusted HTML                     | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`StatGrid`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/StatGrid.svelte)                 | Responsive statistic tiles with units, hints and accessible changes                              | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`Spinner`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Spinner.svelte)                   | Loading status with optional text                                                                | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`StatusMessage`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/StatusMessage.svelte)       | Dismissible info, success, warning or error feedback                                             | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`DragOverlay`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/DragOverlay.svelte)           | Drop-target overlay with an optional message                                                     | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`ClickFeedback`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ClickFeedback.svelte)       | Positioned transient confirmation icon                                                           | [docs](https://svelte-widgets.janosh.dev/workbench)                    |
| [`CodeEditor`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/CodeEditor.svelte) | Virtualized code editor with model-wide search, undoable replacement, and go-to-line             | [docs](https://svelte-widgets.janosh.dev/code-editor#codeeditor)       |
| [`DiffView`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/DiffView.svelte)     | Virtualized side-by-side and unified diffs with an injectable backend                            | [docs](https://svelte-widgets.janosh.dev/code-editor)                  |
| [`Toast`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Toast.svelte)                       | Notification queue with priorities, dedupe and pause-on-hover                                    | [docs](https://svelte-widgets.janosh.dev/toast)                        |
| [`Nav`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Nav.svelte)                           | Navigation bar with dropdowns, pinning and active-route styling                                  | [docs](https://svelte-widgets.janosh.dev/nav)                          |
| [`Heading`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Heading.svelte)                   | Native Svelte heading with an explicit ID and server-rendered anchor                             | [docs](https://svelte-widgets.janosh.dev/toc)                          |
| [`Toc`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Toc.svelte)                           | Manifest-backed table of contents with optional dynamic heading tracking                         | [docs](https://svelte-widgets.janosh.dev/toc)                          |
| [`Masonry`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Masonry.svelte)                   | Column-balancing masonry grid with SSR support and virtualization                                | [docs](https://svelte-widgets.janosh.dev/masonry)                      |
| [`Footer`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Footer.svelte)                     | Centered row of icon links, sized and themed with `--footer-*`                                   | [docs](https://svelte-widgets.janosh.dev/site-chrome#footer)           |
| [`ActionButton`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ActionButton.svelte)         | Async action button with pending, success and error feedback                                     | [docs](https://svelte-widgets.janosh.dev/action-button)                |
| [`CopyButton`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/CopyButton.svelte)             | Copy-to-clipboard button with success and error feedback                                         | [docs](https://svelte-widgets.janosh.dev/action-button#copybutton)     |
| [`ButtonGroup`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ButtonGroup.svelte)           | Segmented control over a set of options, single or multi select                                  | [docs](https://svelte-widgets.janosh.dev/button-group)                 |
| [`FullscreenButton`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/FullscreenButton.svelte) | Fullscreen toggle scoped to one wrapper, so viewers don't fight over the flag                    | [docs](https://svelte-widgets.janosh.dev/fullscreen)                   |
| [`ThemeToggle`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ThemeToggle.svelte)           | Light/dark/system theme cycler with persistence and cross-tab synchronization                    | [docs](https://svelte-widgets.janosh.dev/extras#themetoggle)           |
| [`Toggle`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Toggle.svelte)                     | Accessible switch with a bindable `checked`                                                      | [docs](https://svelte-widgets.janosh.dev/extras#toggle)                |
| [`CodeExample`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/CodeExample.svelte)           | Collapsible source viewer used by the live examples                                              | [docs](https://svelte-widgets.janosh.dev/extras#codeexample)           |
| [`FileDetails`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/FileDetails.svelte)           | Collapsible `<details>` viewer for a set of files                                                | [docs](https://svelte-widgets.janosh.dev/extras#filedetails)           |
| [`PrevNext`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/PrevNext.svelte)                 | Previous/next links for sequential pages                                                         | [docs](https://svelte-widgets.janosh.dev/extras#prevnext)              |
| [`SubpageGrid`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/SubpageGrid.svelte)           | Card grid linking to child pages                                                                 | [docs](https://svelte-widgets.janosh.dev/extras#subpagegrid)           |
| [`Icon`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Icon.svelte)                         | Inline SVG icon from the bundled set                                                             | [docs](https://svelte-widgets.janosh.dev/extras#icon)                  |
| [`GitHubCorner`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/GitHubCorner.svelte)         | The classic corner ribbon link                                                                   | [docs](https://svelte-widgets.janosh.dev/extras#githubcorner)          |
| [`CircleSpinner`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/CircleSpinner.svelte)       | Minimal loading spinner                                                                          | [docs](https://svelte-widgets.janosh.dev/extras#circlespinner)         |
| [`ContributorList`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/ContributorList.svelte)   | Avatar row of GitHub contributors                                                                | [docs](https://svelte-widgets.janosh.dev/site-chrome#contributorlist)  |
| [`LiteYouTubeEmbed`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/LiteYouTubeEmbed.svelte) | YouTube poster that only loads the player iframe once clicked                                    | [docs](https://svelte-widgets.janosh.dev/site-chrome#liteyoutubeembed) |
| [`Wiggle`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/Wiggle.svelte)                     | Spring-animated shake wrapper                                                                    | [docs](https://svelte-widgets.janosh.dev/wiggle)                       |

Fifteen [attachments](https://svelte-widgets.janosh.dev/attachments) work on any element: fourteen come from `svelte-widgets/attachments`, while `heading_anchors` has its own subpath. `dismiss_on_outside_press` is the lower-level multi-surface primitive behind `click_outside`.

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

Additional API changes:

- MultiSelect uses `bind:value` alone: `mode="single"` takes one option or `null`, and the default `mode="multiple"` takes an array. Empty options are valid without an `allow_empty` flag; remove that prop.
- ButtonGroup, Accordion, and TreeView use `mode="single" | "multiple"`, `bind:value`, and `on_change(value)`. Single mode (the default) uses one value or `null`; multiple mode uses an array. ButtonGroup no longer accepts record or tuple options: pass an array of strings or `{ value, label?, ... }` objects. `ButtonGroupOption` is exported from the package root.
- SettingsSection takes `changed_keys` and `on_reset_key(key)`. Value comparison and reset defaults belong to the caller. Put descriptions on rows with `data-description`; the `setting_metadata` prop is removed.
- Dialog and Sheet use only `closedby="any" | "closerequest" | "none"` for dismissal. The default `any` allows backdrop and Escape; `closerequest` allows Escape; `none` requires an explicit close action. Remove `close_on_backdrop` and `close_on_escape`.
- `watch_theme()` initializes and follows system and storage changes, returning a cleanup function. It replaces `listen_theme_storage()`; `resolve_theme_mode` and `system_preference` are internal. ThemeToggle starts and stops its own watcher.
- Shortcut parsing, formatting, matching, and rebinding share one grammar, including modifier aliases. Invalid shortcuts return `null` from `parse_shortcut` and `normalize_combo`, never match key events, and throw from `format_shortcut`. Invalid default shortcuts throw during override validation.
- The unused `utils.values_equal` export is removed. Shared Vite config returns independently owned nested settings, including overrides.
- Tooltips accept plain text and hover/focus triggers. Use Popover for formatted content, controls, and application-controlled visibility.
- Native Svelte headings use `Heading` with an explicit ID; remove `heading_ids()` from preprocessors. Toc consumes `items` metadata or discovers existing IDs with `dynamic`; invalid selectors and collapse modes throw.

Command IDs are compared exactly, without coercion or trimming. Empty and whitespace-only strings are rejected; action labels and section titles may repeat. Preserve a section object when reordering it to retain its rendered nodes.

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
  auto_update_position, // coalesce floating-position updates and clean up listeners
  click_outside, // dismiss a surface when a press lands outside it
  draggable,
  float, // park an element next to an anchor and keep it there
  focus_trap, // keep Tab inside a surface, hand focus back when it closes
  highlight_matches,
  hotkey, // declarative keybindings, `mod` maps to Cmd or Ctrl
  register_escape_layer, // add a handler to the shared LIFO Escape stack
  sortable,
  tooltip,
} from 'svelte-widgets/attachments'
import { compute_position, fuzzy_match, get_label } from 'svelte-widgets/utils'
import { heading_anchors } from 'svelte-widgets/heading-anchors'
```

| Subpath                                                                                                               | API                                                                               |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`/attachments`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/attachments/index.ts)                     | Element attachments and dismissal primitives                                      |
| [`/canvas`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/canvas.svelte.ts)                              | Parent content-box sizing, DPR tracking and coalesced canvas redraws              |
| [`/csv`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/csv.ts)                                           | CSV escaping and row serialization with optional explicit columns                 |
| [`/format`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/format.ts)                                     | Binary byte-size formatting                                                       |
| [`/roving-focus`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/roving-focus.svelte.ts)                  | One keyboard tab stop across available HTML or SVG items, including nested groups |
| [`/stats`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/stats.ts)                                       | Statistic value and change formatting                                             |
| [`/url-params`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/url-params.ts)                             | Typed query validation and URL updates that omit defaults                         |
| [`/clipboard`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/clipboard.svelte.ts)                        | Clipboard feedback state                                                          |
| [`/code-editor`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/index.ts)                     | Backend-agnostic editing, diff rendering and primitives                           |
| [`/code-editor/editor.css`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/editor.css)        | Shared syntax-token and diff-view styles                                          |
| [`/dialogs`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/dialogs.svelte.ts)                            | Queued choice, confirmation and prompt requests                                   |
| [`/file-drop`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/file-drop.ts)                               | Directory expansion and accept filtering                                          |
| [`/find-in-page`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/find-in-page.svelte.ts)                  | Reactive find-in-page cursor behind `FindBar`                                     |
| [`/fullscreen`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/fullscreen.svelte.ts)                      | Shared fullscreen state                                                           |
| [`/heading-anchors`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/heading-anchors.ts)                   | Heading text/ID helpers, slugger and anchor attachment                            |
| [`/image-markup`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/image-markup.ts)                         | Image-fit geometry and canvas rendering of freehand annotation strokes            |
| [`/icons`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/icons.ts)                                       | Dynamic icon registry                                                             |
| [`/json-tree`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/json-tree/index.ts)                         | JSON inspector component and types                                                |
| [`/json-tree/path`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/json-tree/path.ts)                     | Dot/bracket path formatting and resolution                                        |
| [`/json-tree/utils`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/json-tree/utils.ts)                   | JSON traversal, immutable path edits, search and diff helpers                     |
| [`/labels`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/labels.ts)                                     | Default UI strings for i18n, incl. attachments & helpers                          |
| [`/highlight`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/highlight/index.ts)                         | Lazy default and custom grammar highlighters                                      |
| [`/markdown`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/index.ts)                           | Markdown-to-Svelte preprocessor and direct HTML renderer                          |
| [`/markdown/vite`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/vite.ts)                       | Live code examples with virtual modules and hot reload                            |
| [`/markdown/content`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/content.ts)                 | Content manifests, typed frontmatter, link validation, TOC and search records     |
| [`/markdown/check`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/check.ts)                     | Node-only syntax, type and assertion checks for documentation examples            |
| [`/print`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/print.ts)                                       | Page printing with a suggested PDF filename                                       |
| [`/source-links`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/source-links/index.ts)                   | Link inline code mentions of your source to GitHub                                |
| [`/source-links/vite-plugin`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/source-links/vite-plugin.ts) | Vite plugin emitting the file/export index those links use                        |
| [`/source-links/virtual`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/source-links/virtual.d.ts)       | Types for the plugin's `virtual:source-symbols` module                            |
| [`/storage`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/storage.ts)                                   | Non-throwing localStorage, persisted choices and MRU lists                        |
| [`/text-search`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/text-search.ts)                           | Text ranges, highlighting and search-jump helpers                                 |
| [`/theme`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/theme.svelte.ts)                                | Headless light/dark/system state                                                  |
| [`/toast-queue`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/toast-queue.svelte.ts)                    | Toast reducer and reactive store                                                  |
| [`/utils`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/utils.ts)                                       | Positioning, fuzzy matching, hotkeys and general helpers                          |
| [`/virtual`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/virtual.ts)                                   | Visible-window calculation for fixed-size items                                   |
| [`/vite-config`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/vite-config.ts)                           | This repository's Vite Plus configuration helper                                  |
| [`/assets`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/assets.ts)                                     | Svelte preprocessor for relative media, responsive images and downloads           |
| [`/yaml`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/yaml.ts)                                         | Vite YAML loader with build-time data transformation                              |

[`create_canvas_surface()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/canvas.svelte.ts#L10) owns both layers' inline CSS dimensions and restores them on cleanup. Supply `height()` or give the parent a definite height; draw callbacks receive CSS-pixel coordinates and isolated context state. [`create_roving_focus()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/roving-focus.svelte.ts#L22) keeps nested groups independent and observes DOM eligibility changes, including hidden panels and disabled items.

`StatGrid` changes are neutral by default; set an item's `delta_tone` to `positive` or `negative` when the change has that meaning. `ClickFeedback` restarts when given a fresh `position` object, even at identical coordinates. [`rows_to_csv(rows, columns)`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/csv.ts#L18) accepts explicit readonly columns for sparse rows or header-only exports. URL validators accept native Sets or record keys; present empty strings remain valid when allowed.

`CodeEditor` and `DiffView` take host-supplied `EditorBackend` and `DiffBackend` implementations, either through their `backend` props or once per app with [`set_editor_backend()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/types.ts#L173) and [`set_diff_backend()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/code-editor/types.ts#L175). Import `svelte-widgets/code-editor/editor.css` alongside them for the token palette and shared line metrics. The editor takes a host-owned `model={create_editor_model({ uri, text })}` whose rope, UTF-16 selection, transactions, dirty checkpoint, and bounded history remain usable at 100 MB / 1,000,000 lines. Saving is an optional callback, so file reads, persistence, conflicts and draft policy remain in the host. The editable DOM uses a viewport-sized textarea; explicit selections may expand that window, while scroll height remains subject to browser limits. Both backend contracts are runtime-agnostic and can call a native process, worker, WASM module or server route.

Run the opt-in, hardware-sensitive editor stress target locally with `RUN_LARGE_EDITOR_TESTS=1 npx vitest run tests/vitest/code-editor-model.test.ts`; normal CI deliberately skips it.

Use [`markdown()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/index.ts#L698) for Markdown pages with YAML frontmatter, embedded Svelte, GFM tables and task lists. Enable `math` for KaTeX. Markdown renders heading IDs and anchor links in the initial HTML; use the `Heading` component with an explicit `id` for native Svelte pages:

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

Heading links render in the initial HTML. Reveal them with `opacity` on hover or focus so their space stays reserved. `Heading` takes `level`, `id`, an optional decorative `icon`, and `link={false}` to suppress a link. Markdown owns its generated IDs and anchors; [`create_markdown({ heading_links: false })`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/index.ts#L613) emits IDs alone. `Toc` consumes heading metadata for its initial render; opt into `dynamic` for DOM-discovered content. The optional [`heading_anchors()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/heading-anchors.ts#L181) attachment enhances dynamically inserted headings.

Use `engine.render(source, { filename })` for HTML strings, or parse once with `engine.parse(source, { dialect: "markdown" })` and pass the document to [`render_markdown()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/index.ts#L691) when you also need its manifest. Set `frontmatter: false` in [`create_markdown()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/index.ts#L613) for embedded data fields whose leading `---` should remain Markdown. Access frontmatter as `metadata.title`; fence settings are validated during parsing. Use [`check_document(document, options)`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/check.ts#L466) from `/markdown/check` for one-shot documentation checks. Use [`assert_ok()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/diagnostics.ts#L49) to unwrap results at build boundaries and [`markdown_vite(engine)`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/markdown/vite.ts#L25) for runnable code fences. See the [Markdown API](https://svelte-widgets.janosh.dev/markdown) for configuration and migration details. Import `katex/dist/katex.min.css` once when enabling math.

[`asset_imports()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/assets.ts#L82) resolves relative media URLs, `srcset` candidates, PDF links and download links through Vite, preserving query strings and fragments. Place it after Markdown preprocessing so authored Markdown images are included. Dynamic URLs, component props, public-root paths and external URLs remain unchanged. Filenames containing `#` or `?` must be renamed because Vite interprets those characters as URL delimiters, even when encoded in the authored URL.

Add [`yaml_plugin()`](https://github.com/janosh/svelte-widgets/blob/main/src/lib/yaml.ts#L36) from `svelte-widgets/yaml` to Vite's `plugins` to import `.yaml`, `.yml` and YAML citation files (`.cff`) as default-exported data. Its YAML 1.2 core schema keeps dates as strings. Destructure the default export instead of using named imports. An optional `transform(data, filename)` callback can validate or asynchronously enrich data at build time, including rendering Markdown fields; return the data to export. Invalid YAML, cycles and non-JSON values fail with filename context. Vite handles explicit `?raw` and `?url` imports.

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
