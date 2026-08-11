<h1 align="center">
  <img src="https://raw.githubusercontent.com/janosh/svelte-widgets/HEAD/src/site/favicon.svg" alt="Svelte Widgets" height="60" width="60">
  <br class="hide-in-docs"> Svelte Widgets
</h1>

<h4 align="center">

[![Tests](https://github.com/janosh/svelte-widgets/actions/workflows/test.yml/badge.svg)](https://github.com/janosh/svelte-widgets/actions/workflows/test.yml)
[![GitHub Pages](https://github.com/janosh/svelte-widgets/actions/workflows/gh-pages.yml/badge.svg)](https://github.com/janosh/svelte-widgets/actions/workflows/gh-pages.yml)
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

Every component is a named export from the package root, and every one also has a direct
subpath import (`svelte-widgets/Toc.svelte`) so bundlers can skip the rest.

| Component          | What it does                                                                             | Docs                                                                   |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `MultiSelect`      | Keyboard-friendly multi/single select with grouping, async loading and deep style hooks  | [docs](https://svelte-widgets.janosh.dev/multiselect)                  |
| `CommandMenu`      | Command palette with fuzzy search, hotkeys, recents and async actions                    | [docs](https://svelte-widgets.janosh.dev/command-menu)                 |
| `PageSearch`       | Pagefind-backed site search built on `CommandMenu`                                       | [docs](https://svelte-widgets.janosh.dev/command-menu#pagesearch)      |
| `Popover`          | Floating surface that positions, dismisses and traps focus for you                       | [docs](https://svelte-widgets.janosh.dev/popover)                      |
| `ActionMenu`       | Action list opened from a trigger or right-click, with complete menu keyboard semantics  | [docs](https://svelte-widgets.janosh.dev/popover#actionmenu)           |
| `ConfirmDialog`    | Promise-based dialog queue, so two racing prompts can't share one answer                 | [docs](https://svelte-widgets.janosh.dev/dialogs)                      |
| `DraggablePane`    | Floating panel you can drag by its header, resize and reset to its anchor                | [docs](https://svelte-widgets.janosh.dev/draggable-pane)               |
| `NumberRangeInput` | Paired number and range inputs bound to one value, with optional schema defaults         | [docs](https://svelte-widgets.janosh.dev/settings#numberrangeinput)    |
| `SettingsGroup`    | Collapsible group for organizing related settings sections                               | [docs](https://svelte-widgets.janosh.dev/settings#settingsgroup)       |
| `SettingsSearch`   | Settings-row filter that expands matching groups and restores their prior state          | [docs](https://svelte-widgets.janosh.dev/settings#settingssearch)      |
| `SettingsSection`  | Titled settings region with change tracking, resets, descriptions and shared-grid layout | [docs](https://svelte-widgets.janosh.dev/settings#settingssection)     |
| `Sheet`            | Native modal edge panel with backdrop dismissal and focus restoration                    | [docs](https://svelte-widgets.janosh.dev/patterns#sheet)               |
| `Tabs`             | Controlled ARIA tabs with automatic or manual keyboard activation                        | [docs](https://svelte-widgets.janosh.dev/patterns#tabs)                |
| `Accordion`        | Single or multi-open disclosure group with snippet-rendered content                      | [docs](https://svelte-widgets.janosh.dev/patterns#accordion)           |
| `FindBar`          | In-DOM find-in-page bar that highlights, counts and steps through matches                | [docs](https://svelte-widgets.janosh.dev/patterns#findbar)             |
| `DiffView`         | Virtualized side-by-side and unified diffs with an injectable backend                    | [docs](https://svelte-widgets.janosh.dev/code-editor)                  |
| `Toast`            | Notification queue with priorities, dedupe and pause-on-hover                            | [docs](https://svelte-widgets.janosh.dev/toast)                        |
| `Nav`              | Navigation bar with dropdowns, pinning and active-route styling                          | [docs](https://svelte-widgets.janosh.dev/nav)                          |
| `Toc`              | Sticky table of contents that finds and tracks its own headings                          | [docs](https://svelte-widgets.janosh.dev/toc)                          |
| `Masonry`          | Column-balancing masonry grid with SSR support and virtualization                        | [docs](https://svelte-widgets.janosh.dev/masonry)                      |
| `Footer`           | Centered row of icon links, sized and themed with `--footer-*`                           | [docs](https://svelte-widgets.janosh.dev/site-chrome#footer)           |
| `ActionButton`     | Async action button with pending, success and error feedback                             | [docs](https://svelte-widgets.janosh.dev/action-button)                |
| `CopyButton`       | Copy-to-clipboard button with success and error feedback                                 | [docs](https://svelte-widgets.janosh.dev/action-button#copybutton)     |
| `ButtonGroup`      | Segmented control over a set of options, single or multi select                          | [docs](https://svelte-widgets.janosh.dev/button-group)                 |
| `FullscreenButton` | Fullscreen toggle scoped to one wrapper, so viewers don't fight over the flag            | [docs](https://svelte-widgets.janosh.dev/fullscreen)                   |
| `ThemeToggle`      | Light/dark/system theme cycler with persistence and cross-tab synchronization            | [docs](https://svelte-widgets.janosh.dev/extras#themetoggle)           |
| `Toggle`           | Accessible switch with a bindable `checked`                                              | [docs](https://svelte-widgets.janosh.dev/extras#toggle)                |
| `CodeExample`      | Collapsible source viewer used by the live examples                                      | [docs](https://svelte-widgets.janosh.dev/extras#codeexample)           |
| `FileDetails`      | Collapsible `<details>` viewer for a set of files                                        | [docs](https://svelte-widgets.janosh.dev/extras#filedetails)           |
| `PrevNext`         | Previous/next links for sequential pages                                                 | [docs](https://svelte-widgets.janosh.dev/extras#prevnext)              |
| `SubpageGrid`      | Card grid linking to child pages                                                         | [docs](https://svelte-widgets.janosh.dev/extras#subpagegrid)           |
| `Icon`             | Inline SVG icon from the bundled set                                                     | [docs](https://svelte-widgets.janosh.dev/extras#icon)                  |
| `GitHubCorner`     | The classic corner ribbon link                                                           | [docs](https://svelte-widgets.janosh.dev/extras#githubcorner)          |
| `CircleSpinner`    | Minimal loading spinner                                                                  | [docs](https://svelte-widgets.janosh.dev/extras#circlespinner)         |
| `ContributorList`  | Avatar row of GitHub contributors, grayscale until hover                                 | [docs](https://svelte-widgets.janosh.dev/site-chrome#contributorlist)  |
| `LiteYouTubeEmbed` | YouTube poster that only loads the player iframe once clicked                            | [docs](https://svelte-widgets.janosh.dev/site-chrome#liteyoutubeembed) |
| `Wiggle`           | Spring-animated shake wrapper                                                            | [docs](https://svelte-widgets.janosh.dev/wiggle)                       |

Fifteen [attachments](https://svelte-widgets.janosh.dev/attachments) work on any element: fourteen come from `svelte-widgets/attachments`, while `heading_anchors` has its own subpath. `dismiss_on_outside_press` is the lower-level multi-surface primitive behind `click_outside`.

```svelte
<script>
  import { CommandMenu, MultiSelect, Popover, Tabs, Toc } from 'svelte-widgets'
</script>
```

<slot name="examples" />

## 💡 &thinsp; Features

- **No run-time deps:** every component needs only Svelte as a peer dependency
- **Keyboard friendly:** every interactive component is fully operable without a mouse
- **Bindable:** component state is exposed through `$bindable` props, so you can both read it and drive it from the outside
- **Themeable:** CSS variables with sensible defaults on every element, plus prop bags to spread arbitrary attributes onto internals
- **SSR-safe:** nothing touches `window` or `localStorage` before mount
- **Typed:** props, snippets and events are inferred from the data you pass

## 🧪 &thinsp; Coverage

| Statements                                                                         | Branches                                                                       | Lines                                                                    |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| ![Statements](https://img.shields.io/badge/statements-93%25-yellow.svg?style=flat) | ![Branches](https://img.shields.io/badge/branches-87%25-yellow.svg?style=flat) | ![Lines](https://img.shields.io/badge/lines-94%25-yellow.svg?style=flat) |

## 🔨 &thinsp; Installation

```sh
npm install --dev svelte-widgets
```

## 🚚 &thinsp; Migrating from `svelte-multiselect`

This package was called `svelte-multiselect` up to v11 ([#432](https://github.com/janosh/svelte-widgets/pull/432)). Swap it out:

```sh
npm uninstall svelte-multiselect && npm install -D svelte-widgets
```

Then rewrite the imports. Matching on the opening quote (all three kinds) keeps prose and GitHub URLs untouched, and covers every subpath along with the bare import. It skips `.md` deliberately: in markdown a backtick-quoted mention is usually prose, not an import.

```sh
find src -type f \( -name '*.svelte' -o -name '*.ts' -o -name '*.js' \) -exec perl -pi -e "s{(['\"\`])svelte-multiselect}{\$1svelte-widgets}g" {} +
```

Three things the rewrite cannot do for you: `CmdPalette` is now `CommandMenu` and
`PagefindPalette` is now `PageSearch` ([#428](https://github.com/janosh/svelte-widgets/pull/428)), and `click_outside` changed shape (it dismisses on
`pointerdown`, and `exclude`/`include` merged into one `inside` option) ([#431](https://github.com/janosh/svelte-widgets/pull/431)). See the
[changelog](changelog.md) for the details.

Coming from `svelte-toc` or `svelte-bricks` instead? Those are now `Toc` and `Masonry`
here ([#432](https://github.com/janosh/svelte-widgets/pull/432)), so the same swap applies with `import { Toc } from 'svelte-widgets'` and
`import { Masonry } from 'svelte-widgets'`.

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

| Subpath                             | API                                                        |
| ----------------------------------- | ---------------------------------------------------------- |
| `/attachments`                      | Element attachments and dismissal primitives               |
| `/clipboard`                        | Clipboard feedback state                                   |
| `/code-editor`                      | Backend-agnostic diff rendering and editor primitives      |
| `/code-editor/editor.css`           | Shared syntax-token and diff-view styles                   |
| `/dialogs`                          | Queued choice, confirmation and prompt requests            |
| `/file-drop`                        | Directory expansion and accept filtering                   |
| `/find-in-page`                     | Reactive find-in-page cursor behind `FindBar`              |
| `/fullscreen`                       | Shared fullscreen state                                    |
| `/heading-anchors`                  | Heading ID preprocessor, slugger and anchor attachment     |
| `/icons`                            | Dynamic icon registry                                      |
| `/katex`                            | KaTeX before/after preprocessor pair                       |
| `/live-examples`                    | mdsvex live-example transform, Vite plugin and highlighter |
| `/live-examples/create-highlighter` | Lightweight custom grammar highlighter factory             |
| `/print`                            | Element printing                                           |
| `/storage`                          | Non-throwing localStorage, persisted choices and MRU lists |
| `/text-search`                      | Text ranges, highlighting and search-jump helpers          |
| `/theme`                            | Headless light/dark/system state                           |
| `/toast-queue`                      | Toast reducer and reactive store                           |
| `/types`                            | Shared component/action types                              |
| `/utils`                            | Positioning, fuzzy matching, hotkeys and general helpers   |
| `/vite-config`                      | This repository's Vite Plus configuration helper           |

`DiffView` takes a host-supplied `DiffBackend`, either through its `backend` prop or once per app with `set_diff_backend()`. Import `svelte-widgets/code-editor/editor.css` alongside it for the token palette and shared line metrics. The backend contract is runtime-agnostic, so the implementation can call a native process, worker, WASM module or server route.

For `$…$` and `$$…$$` math in mdsvex, wrap mdsvex with `katex_preprocess()` and run `heading_ids()` last:

```ts
import { mdsvex } from 'mdsvex'
import { heading_ids } from 'svelte-widgets/heading-anchors'
import { katex_preprocess } from 'svelte-widgets/katex'

const katex = katex_preprocess()
export default {
  preprocess: [katex.before, mdsvex({ extensions: [`.md`] }), katex.after, heading_ids()],
}
```

Import `katex/dist/katex.min.css` once in the app so the generated markup is styled.

`Popover` and `ActionMenu` both use `float` for placement and `click_outside` for dismissal (on the press, so a right-click closes it too). Dialog-like popovers can add `focus_trap`; action menus use Arrow/Home/End navigation and close on Tab so browser focus continues in page order.

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

See [src/lib/live-examples/readme.md](https://github.com/janosh/svelte-widgets/blob/-/src/lib/live-examples/readme.md) for optional live-example helpers.

## 🆕 &thinsp; Changelog

[View the changelog](changelog.md).

## 🙏 &thinsp; Contributing

Here are some steps to [get you started](contributing.md) if you'd like to contribute to this project!
