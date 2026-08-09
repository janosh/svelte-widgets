<script lang="ts">
  import { resolve } from '$app/paths'
  import { slug_to_title, SubpageGrid } from '$lib'
  import { demo_labels } from '../..'

  // card titles and hrefs are derived from the slug so they can't drift from the nav
  const descriptions: Record<string, string> = {
    form: `Form integration and native validation behavior.`,
    'kit-form-actions': `Progressively enhanced SvelteKit form actions.`,
    persistent: `Persist selection across page reloads with sessionStorage.`,
    events: `Event callbacks and payloads.`,
    disabled: `Disabled options and disabled component states.`,
    grouping: `Grouped options, sticky headers, and group actions.`,
    'infinite-scroll': `Incremental loading with loadOptions.`,
    'min-max-select': `Use maxSelect and required constraints.`,
    'input-dropdown': `Single-select editable input with dropdown suggestions.`,
    duplicates: `Handle duplicate labels and options.`,
    'sort-selected': `Keep selected options sorted.`,
    'range-select': `Select visible ranges with Shift-click and Shift+Arrow.`,
    'keep-selected': `Keep selected items visible in dropdown.`,
    'allow-user-options': `Create options from user input.`,
    history: `Undo/redo and selection history behavior.`,
    ui: `Core UI controls and visual states.`,
    'css-classes': `Class-based styling hooks.`,
    snippets: `Custom rendering with snippets.`,
    'parse-labels-as-html': `Render option labels as HTML.`,
    portal: `Portaled dropdown rendering and layering.`,
  }
  // resolve's arg type distributes over the Pathname union, so a slug built at runtime
  // can't match a single arm; every demo route is param-free
  const resolve_path = resolve as (path: string) => string
  const subpages = Object.entries(descriptions).map(
    ([slug, description]): [string, string, string] => [
      demo_labels[`/${slug}`] ?? slug_to_title(slug),
      resolve_path(`/${slug}`),
      description,
    ],
  )
</script>

<SubpageGrid
title="MultiSelect"
subtitle="Keyboard-friendly, accessible multi-select with grouping, async loading, and deep styling hooks."
{subpages}
/>

## Quick start

```svelte
<script>
  import { MultiSelect } from 'svelte-widgets'

  const ui_libs = [`Svelte`, `React`, `Vue`, `Angular`, `...`]

  let selected = $state([])
</script>

Favorite Frontend Tools?

<code>selected = {JSON.stringify(selected)}</code>

<MultiSelect bind:selected options={ui_libs} />
```

## Mental model

| Prop            | Purpose                                                | Value                                                                               |
| --------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `options`       | What users can choose from                             | Array of strings, numbers, or objects with `label` property                         |
| `bind:selected` | Which options users have chosen                        | Always an array: `[]`, `['Apple']` or `['Apple', 'Banana']`                         |
| `bind:value`    | Single-select convenience for the user-selected option | Single item: `'Apple'` (or `null`) if `maxSelect={1}`, otherwise same as `selected` |

### Common Patterns

```svelte
<!-- Multi-select -->
<MultiSelect bind:selected options={['A', 'B', 'C']} />

<!-- Single-select -->
<MultiSelect bind:value options={colors} maxSelect={1} />

<!-- Object options (need 'label' property, can have arbitrary other keys, some like `value`, `disabled`, `preselected`, `style` have special meaning, see type ObjectOption) -->
<MultiSelect
  bind:selected
  options={[
    { label: 'Red', value: '#ff0000' },
    { label: 'Blue', value: '#0000ff' },
  ]}
/>
```

### Troubleshooting

- **Object options not working?** → Add `label` property
- **Dropdown not showing?** → Check you have `options` and not `disabled={true}`
- **Want single item not array?** → Use `bind:value` with `maxSelect={1}`
- **Types confusing?** → Component auto-infers type of `selected` and `value` from your `options` array

## Props

Props ordered by how often you'll reach for them.

> **💡 Tip:** The `Option` type is automatically inferred from your `options` array, or you can import it: `import { type Option } from 'svelte-widgets'`

### Essential Props

1. ```ts
   options?: Option[]  // required unless loadOptions is provided
   ```

   Array of strings, numbers, or objects that users can select from. Objects must have a `label` property that will be displayed in the dropdown. Optional when `loadOptions` supplies the dropdown contents; if you pass both, these options are filtered client-side and listed ahead of each loaded batch (see [`loadOptions`](#advanced-props)).

   ```svelte
   <!-- Simple options -->
   <MultiSelect options={['Red', 'Green', 'Blue']} />

   <!-- Object options -->
   <MultiSelect
     options={[
       { label: 'Red', value: '#ff0000', hex: true },
       { label: 'Green', value: '#00ff00', hex: true },
     ]}
   />
   ```

1. ```ts
   selected: Option[] = []  // bindable
   ```

   **Your main state variable.** Array of currently selected options. Use `bind:selected` for two-way binding.

   ```svelte
   <script>
     let selected = $state(['Red']) // Preselect Red
   </script>

   <MultiSelect bind:selected options={colors} />
   ```

1. ```ts
   value: Option | Option[] | null = null  // bindable
   ```

   **Alternative to `selected`.** When `maxSelect={1}`, `value` is the single selected item (not an array). Otherwise, `value` equals `selected`.

   ```svelte
   <!-- Single-select: value = 'Red' (not ['Red']) -->
   <MultiSelect bind:value options={colors} maxSelect={1} />

   <!-- Multi-select: value = ['Red', 'Blue'] (same as selected) -->
   <MultiSelect bind:value options={colors} />
   ```

1. ```ts
   maxSelect: number | null = null
   ```

   **Controls selection behavior.** `null` = unlimited, `1` = single select, `2+` = limited multi-select.

   ```svelte
   <!-- Unlimited selection -->
   <MultiSelect options={colors} />

   <!-- Single selection -->
   <MultiSelect options={colors} maxSelect={1} />

   <!-- Max 3 selections -->
   <MultiSelect options={colors} maxSelect={3} />
   ```

1. ```ts
   placeholder: string | { text: string; persistent?: boolean } | null = null
   ```

   Text shown when no options are selected. Can be a simple string or an object with extended options:

   ```svelte
   <!-- Simple string -->
   <MultiSelect placeholder="Choose..." />

   <!-- Object with persistent option (stays visible even when options selected) -->
   <MultiSelect placeholder={{ text: 'Add items...', persistent: true }} />
   ```

1. ```ts
   disabled: boolean = false
   ```

   Disables the component. Users can't interact with it, but it's still rendered.

1. ```ts
   required: boolean | number = false
   ```

   For form validation. `true` means at least 1 option required, numbers specify exact minimum.

### Commonly Used Props

1. ```ts
   searchText: string = `` // bindable
   ```

   The text user entered to filter options. Bindable for external control.

1. ```ts
   open: boolean = false // bindable
   ```

   Whether the dropdown is visible. Bindable for external control.

1. ```ts
   allowUserOptions: boolean | `append` = false
   ```

   Whether users can create new options by typing. `true` = add to selected only, `'append'` = add to both options and selected.

1. ```ts
   allowEmpty: boolean = false
   ```

   Whether to allow the component to exist with no options. If `false`, shows console error when no options provided (unless `loading`, `disabled`, or `allowUserOptions` is `true`).

1. ```ts
   loading: boolean = false
   ```

   Shows a loading spinner. Useful when fetching options asynchronously.

1. ```ts
   invalid: boolean = false // bindable
   ```

   Marks the component as invalid (adds CSS class). Automatically set during form validation.

### Advanced Props

1. ```ts
   loadOptions: LoadOptionsFn | LoadOptionsConfig = undefined
   ```

   **Dynamic loading for large datasets.** Enables lazy loading / infinite scroll instead of passing static `options`. Pass either a function or an object with config:

   ```svelte
   <!-- Function shorthand -->
   <MultiSelect loadOptions={myFetchFn} />

   <!-- With config -->
   <MultiSelect loadOptions={{ fetch: myFetchFn, debounceMs: 500, batchSize: 20 }} />
   ```

   The function receives `{ search, offset, limit, signal }` and must return `{ options, hasMore }`. `signal` is an `AbortSignal` that fires when the request is superseded by a newer search or when the component closes or unmounts. Forward it to `fetch` to cancel work in flight:

   ```ts
   async function load_options(params) {
     const { search, offset, limit, signal } = params
     const response = await fetch(`/api/items?q=${search}&skip=${offset}&take=${limit}`, {
       signal,
     })
     const { items, total } = await response.json()
     return { options: items, hasMore: offset + limit < total }
   }
   ```

   Config options (when passing an object):

   | Key          | Type      | Default | Description                                 |
   | ------------ | --------- | ------- | ------------------------------------------- |
   | `fetch`      | `fn`      | —       | Async function to load options (required)   |
   | `debounceMs` | `number`  | `300`   | Debounce delay for search queries           |
   | `batchSize`  | `number`  | `50`    | Number of options to load per batch         |
   | `onOpen`     | `boolean` | `true`  | Whether to load options when dropdown opens |

   Features automatic state management, debounced search, infinite scroll pagination, and loading indicators. See the [infinite-scroll demo](https://svelte-widgets.janosh.dev/infinite-scroll) for live examples.

   Passing `options` alongside `loadOptions` combines both sources: the static options are filtered client-side with `filterFunc` and rendered above the loaded batches. Since they need neither the debounce nor a request, they appear on the first keystroke, which is what lets [`PageSearch`](https://svelte-widgets.janosh.dev/command-menu) match known routes instantly while its Pagefind index is still loading.

1. ```ts
   activeIndex: number | null = null  // bindable
   ```

   Zero-based index of currently active option in the filtered list.

1. ```ts
   activeOption: Option | null = null  // bindable
   ```

   Currently active option (hovered or navigated to with arrow keys).

1. ```ts
   createOptionMsg: string | ((state: { searchText: string; selected: Option[]; options: Option[]; matchingOptions: Option[] }) => string) | null = `Create this option...`
   ```

   Message shown when `allowUserOptions` is enabled and user can create a new option. Can be a static string or a function that receives component state and returns a dynamic message.

1. ```ts
   duplicates: boolean | 'case-insensitive' = false
   ```

   Controls duplicate detection. `false` (default) blocks exact duplicates. `true` allows selecting the same option multiple times. `'case-insensitive'` blocks case variants (e.g. "Apple" blocks "apple").

1. ```ts
   expandIconPosition: 'left' | 'right' | 'none' = 'left'
   ```

   Which side of the input to render the expand icon on, or `'none'` to hide it entirely (applies to both the default chevron and a custom `expandIcon` snippet). Clicking the icon toggles the dropdown.

<!-- deno-fmt-ignore -->

1. ```ts
   filterFunc: (opt: Option, searchText: string) => boolean
   ```

   Custom function to filter options based on search text. Default filters by label.

<!-- deno-fmt-ignore -->

1. ```ts
   key: (opt: Option) => unknown
   ```

   Generates the identity key for an option. Default: an object's `value` if it defines one, else its `label`; primitives are their own key. No case folding — use `duplicates="case-insensitive"` for that.

1. ```ts
   closeDropdownOnSelect: boolean | 'if-mobile' | 'retain-focus' = false
   ```

   Whether to close dropdown after selection. `false` (default) keeps dropdown open for rapid multi-selection. `true` closes after each selection. `'if-mobile'` closes on mobile devices only (screen width below `breakpoint`). `'retain-focus'` closes dropdown but keeps input focused for rapid typing to create custom options from text input (see `allowUserOptions`).

1. ```ts
   resetFilterOnAdd: boolean = true
   ```

   Whether to clear search text when an option is selected.

1. ```ts
   sortSelected: boolean | ((a: Option, b: Option) => number) = false
   ```

   Whether/how to sort selected options. `true` uses default sort, function enables custom sorting.

1. ```ts
   portal: { target_node?: HTMLElement; active?: boolean; placement?: 'auto' | 'bottom' | 'top' } = {}
   ```

   Configuration for portal rendering. When `active: true`, the dropdown is rendered at document.body level with fixed positioning. Useful for avoiding z-index and overflow issues. `active` is honored at runtime, so toggling it portals/un-portals in place. `placement` controls which side of the input the dropdown opens on: `'auto'` (default) opens below and flips above when the dropdown would overflow the viewport bottom with more space available above, `'bottom'`/`'top'` force a side.

### Grouping Props

Group related options together with visual headers. Add a `group` key to your option objects:

```svelte
<script>
  const options = [
    { label: `JavaScript`, group: `Frontend` },
    { label: `TypeScript`, group: `Frontend` },
    { label: `Python`, group: `Backend` },
    { label: `Go`, group: `Backend` },
  ]
</script>

<MultiSelect {options} collapsibleGroups groupSelectAll />
```

See the [grouping demo](https://svelte-widgets.janosh.dev/grouping) for live examples.

1. ```ts
   collapsibleGroups: boolean = false
   ```

   Enable click-to-collapse groups. When `true`, users can click group headers to hide/show options in that group.

1. ```ts
   collapsedGroups: Set<string> = new Set()
   ```

   Bindable set of collapsed group names. Use `bind:collapsedGroups` to control which groups are collapsed externally or to persist collapse state.

1. ```ts
   groupSelectAll: boolean = false
   ```

   Add a "Select all" button to each group header, allowing users to select all options in a specific group at once.

1. ```ts
   ungroupedPosition: 'first' | 'last' = 'first'
   ```

   Where to render options that don't have a `group` key. `'first'` places them at the top, `'last'` at the bottom.

1. ```ts
   groupSortOrder: 'none' | 'asc' | 'desc' | ((a: string, b: string) => number) = 'none'
   ```

   Sort groups alphabetically (`'asc'` or `'desc'`) or with a custom comparator function. Default `'none'` preserves order of first occurrence.

1. ```ts
   searchExpandsCollapsedGroups: boolean = false
   ```

   When `true`, collapsed groups automatically expand when the search query matches options within them.

1. ```ts
   searchMatchesGroups: boolean = false
   ```

   When `true`, the search query also matches against group names, not just option labels. If a group name matches, all options in that group are shown.

1. ```ts
   keyboardExpandsCollapsedGroups: boolean = false
   ```

   When `true`, collapsed groups automatically expand when the user navigates into them with arrow keys.

1. ```ts
   stickyGroupHeaders: boolean = false
   ```

   When `true`, group headers stick to the top of the dropdown while scrolling through their options.

1. ```ts
   collapseAllGroups: () => void  // bindable
   ```

   Programmatically collapse all groups. Use with `bind:collapseAllGroups` to get a callable function.

1. ```ts
   expandAllGroups: () => void  // bindable
   ```

   Programmatically expand all groups. Use with `bind:expandAllGroups` to get a callable function.

1. ```ts
   liGroupHeaderClass: string = ''
   ```

   CSS class applied to group header `<li>` elements.

1. ```ts
   liGroupHeaderStyle: string | null = null
   ```

   Inline style for group header elements.

1. ```ts
   groupHeader: Snippet<[{ group: string; options: T[]; collapsed: boolean }]>
   ```

   Custom snippet for rendering group headers. Receives the group name, array of options in that group, and whether the group is collapsed.

1. ```ts
   ongroupToggle: (data: { group: string; collapsed: boolean }) => void
   ```

   Callback fired when a group is collapsed or expanded. Receives the group name and its new collapsed state.

### Form & Accessibility Props

1. ```ts
   id: string | null = null
   ```

   Applied to the `<input>` for associating with `<label>` elements.

1. ```ts
   name: string | null = null
   ```

   Form field name for form submission. When selected options are displayed as chips (the default display mode), they submit as `JSON.stringify(selected)`. Prefer stable object `value` fields for server processing, or customize serialization with `formSerialize`.

1. ```ts
   formSerialize: (selected: Option[]) => string | null = JSON.stringify
   ```

   Customizes the submitted value in chip mode. For object options, use `formSerialize={(selected) => selected.map(({ value }) => value).join(',')}`. For primitive options, use `formSerialize={(selected) => selected.join(',')}`.

1. ```ts
   autocomplete: string = 'off'
   ```

   Browser autocomplete behavior. Usually `'on'` or `'off'`.

1. ```ts
   inputmode: string | null = null
   ```

   Hint for mobile keyboard type (`'numeric'`, `'tel'`, `'email'`, etc.). Set to `'none'` to hide keyboard.

1. ```ts
   pattern: string | null = null
   ```

   Regex pattern for input validation.

### UI and Behavior Props

1. ```ts
   maxOptions: number | undefined = undefined
   ```

   Limit number of options shown in dropdown. `undefined` = no limit.

1. ```ts
   maxVisibleChips: number | null = null
   ```

   Max number of selected chips to render before collapsing the rest into a `+N more` toggle chip (click to expand/collapse). `null` renders all chips. Keyboard chip navigation auto-expands so hidden chips can't be highlighted invisibly. Ignored in `selectedDisplay="input"` mode.

1. ```ts
   selectedDisplay: 'chips' | 'input' = 'chips'
   ```

   How selected options are shown. `'chips'` renders them as removable tags inside the input. `'input'` writes the selected label straight into the text input (combobox/datalist style) and is only valid with `maxSelect={1}`; other values log a config error and fall back to chips. See the [input-dropdown demo](https://svelte-widgets.janosh.dev/input-dropdown).

1. ```ts
   virtualList: boolean | { itemHeight?: number; overscan?: number } = false
   ```

   Virtualized dropdown rendering for large option lists: only rows near the scroll viewport are rendered as DOM nodes. Pass `true` for defaults or an object to tune `itemHeight` (px per row, default 30, also applies to group headers) and `overscan` (extra rows rendered above/below the visible window, default 10). Grouped options are supported except in combination with `stickyGroupHeaders`, which falls back to full rendering with a console warning.

1. ```ts
   minSelect: number | null = null
   ```

   Minimum selections required before remove buttons appear.

1. ```ts
   autoScroll: boolean = true
   ```

   Whether to keep active option in view when navigating with arrow keys.

1. ```ts
   breakpoint: number = 800
   ```

   Screen width (px) that separates 'mobile' from 'desktop' behavior.

1. ```ts
   fuzzy: boolean = true
   ```

   Whether to use fuzzy matching for filtering options. When `true` (default), matches non-consecutive characters (e.g., "ga" matches "Grapes" and "Green Apple"). When `false`, uses substring matching only.

1. ```ts
   highlightMatches: boolean = true
   ```

   Whether to highlight matching text in dropdown options.

1. ```ts
   keepSelectedInDropdown: false | 'plain' | 'checkboxes' = false
   ```

   Controls whether selected options remain visible in dropdown. `false` (default) hides selected options. `'plain'` shows them with visual distinction. `'checkboxes'` prefixes each option with a checkbox.

1. ```ts
   selectAllOption: boolean | string = false
   ```

   Adds a "Select All" option at the top of the dropdown. `true` shows default label, or pass a custom string label.

1. ```ts
   selectAllScope: 'visible' | 'matching' = 'visible'
   ```

   Which options "Select All" adds. `'visible'` (default) adds only the rows the dropdown currently renders, i.e. options in expanded groups up to the `maxOptions` limit (virtualization doesn't narrow the scope). `'matching'` adds every option matching the current search, including those in collapsed groups and beyond `maxOptions`. `'matching'` requires local `options` and is disabled when `loadOptions` is set, since the component can't know the full remote result set.

1. ```ts
   rangeSelect: boolean = false
   ```

   Whether Shift-click and Shift+Arrow select an inclusive range of options. The first plain click (or the option active before Shift+Arrow) sets the anchor, then the range spans from the anchor to the shift-targeted option. Disabled options are skipped, `maxSelect` is respected, and the whole range counts as a single undo step. Off by default since enabling it changes what Shift-click does for existing consumers.

1. ```ts
   liSelectAllClass: string = ''
   ```

   CSS class applied to the "Select All" `<li>` element.

1. ```ts
   parseLabelsAsHtml: boolean = false
   ```

   Whether to render option labels as HTML. **Warning:** Don't combine with `allowUserOptions` (XSS risk).

1. ```ts
   selectedOptionsDraggable: boolean = !sortSelected
   ```

   Whether selected options can be reordered by dragging.

1. ```ts
   selectedFlipParams: FlipParams = { duration: 100 }
   ```

   Animation parameters for the [Svelte flip animation](https://svelte.dev/docs/svelte/svelte-animate) when reordering selected options via drag-and-drop. Set `{ duration: 0 }` to disable animation. Accepts `duration`, `delay`, and `easing` properties.

### Keyboard Shortcuts

1. ```ts
   shortcuts: Partial<KeyboardShortcuts> = {}
   ```

   Override default keyboard shortcuts. Shortcut format: `"modifier+...+key"` where modifiers can be `ctrl`, `shift`, `alt`, `meta`, `cmd`. Set a shortcut to `null` to disable it. Custom shortcuts take precedence over built-in key handlers (Enter, Escape, ArrowUp/Down, Backspace).

   Available shortcuts and their defaults:

   | Key          | Default                                 | Action                                                                                                                               |
   | ------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
   | `select_all` | `null`                                  | Select all visible options. Opt in with `{ select_all: 'ctrl+a' }` — off by default so it doesn't hijack the browser's native Ctrl+A |
   | `clear_all`  | `'meta+backspace'` / `'ctrl+backspace'` | Deselect all options (only while chips are present and the search box is empty)                                                      |
   | `open`       | `null`                                  | Open dropdown                                                                                                                        |
   | `close`      | `null`                                  | Close dropdown (Escape works by default)                                                                                             |
   | `undo`       | `'meta+z'` / `'ctrl+z'`                 | Undo last selection change (platform-aware)                                                                                          |
   | `redo`       | `'meta+shift+z'` / `'ctrl+shift+z'`     | Redo last undone change (platform-aware)                                                                                             |

### Selection History (Undo/Redo)

1. ```ts
   history: boolean | number = true
   ```

   Enable selection history for undo/redo support. `true` (default) stores up to 50 states. Pass a number to set a custom maximum. `false` or `0` disables history. Note: you need at least `history=2` for a single undo (history=1 effectively disables it).

1. ```ts
   undo: () => boolean // bindable
   ```

   Undo the last selection change. Returns `true` if undo was performed. Use with `bind:undo` to get a callable function.

1. ```ts
   redo: () => boolean // bindable
   ```

   Redo the last undone selection change. Returns `true` if redo was performed. Use with `bind:redo` to get a callable function.

1. ```ts
   canUndo: boolean // bindable
   ```

   Whether an undo operation is available. Use with `bind:canUndo` for UI indicators (e.g. disabling an undo button).

1. ```ts
   canRedo: boolean // bindable
   ```

   Whether a redo operation is available. Use with `bind:canRedo` for UI indicators (e.g. disabling a redo button).

### Message Props

1. ```ts
   noMatchingOptionsMsg: string = 'No matching options'
   ```

   Message when search yields no results.

1. ```ts
   duplicateOptionMsg: string = 'This option is already selected'
   ```

   Message when user tries to create duplicate option.

1. ```ts
   defaultDisabledTitle: string = 'This option is disabled'
   ```

   Tooltip for disabled options.

1. ```ts
   disabledInputTitle: string = 'This input is disabled'
   ```

   Tooltip when component is disabled.

1. ```ts
   removeAllTitle: string = 'Remove all'
   ```

   Tooltip for remove-all button.

1. ```ts
   removeBtnTitle: string = 'Remove'
   ```

   Tooltip for individual remove buttons.

<!-- deno-fmt-ignore -->

1. ```ts
   maxSelectMsg: ((current: number, max: number) => string) | null = (current, max) =>
     max > 1 ? `${current}/${max}` : ``
   ```

   Renders a `2/5` counter next to the input. The default returns an empty string when `maxSelect <= 1`. `null` = no message.

### DOM Element References (bindable)

These give you access to DOM elements after the component mounts:

1. ```ts
   input: HTMLInputElement | null = null  // bindable
   ```

   Handle to the main `<input>` DOM element.

1. ```ts
   form_input: HTMLInputElement | null = null  // bindable
   ```

   Handle to the hidden form input used for validation.

1. ```ts
   outerDiv: HTMLDivElement | null = null  // bindable
   ```

   Handle to the outer wrapper `<div>` element.

### Styling Props

For custom styling with CSS frameworks or one-off styles:

1. ```ts
   style: string | null = null
   ```

   CSS rules for the outer wrapper div.

1. ```ts
   inputStyle: string | null = null
   ```

   CSS rules for the main input element.

1. ```ts
   ulSelectedStyle: string | null = null
   ```

   CSS rules for the selected options list.

1. ```ts
   ulOptionsStyle: string | null = null
   ```

   CSS rules for the dropdown options list.

1. ```ts
   liSelectedStyle: string | null = null
   ```

   CSS rules for selected option list items.

1. ```ts
   liOptionStyle: string | null = null
   ```

   CSS rules for dropdown option list items.

### CSS Class Props

For use with CSS frameworks like Tailwind:

1. ```ts
   outerDivClass: string = ''
   ```

   CSS class for outer wrapper div.

1. ```ts
   inputClass: string = ''
   ```

   CSS class for main input element.

1. ```ts
   ulSelectedClass: string = ''
   ```

   CSS class for selected options list.

1. ```ts
   ulOptionsClass: string = ''
   ```

   CSS class for dropdown options list.

1. ```ts
   liSelectedClass: string = ''
   ```

   CSS class for selected option items.

1. ```ts
   liOptionClass: string = ''
   ```

   CSS class for dropdown option items.

1. ```ts
   liActiveOptionClass: string = ''
   ```

   CSS class for the currently active dropdown option.

1. ```ts
   liUserMsgClass: string = ''
   ```

   CSS class for user messages (no matches, create option, etc.).

1. ```ts
   liActiveUserMsgClass: string = ''
   ```

   CSS class for active user messages.

1. ```ts
   maxSelectMsgClass: string = ''
   ```

   CSS class for the "X of Y selected" message.

### Read-only Props (bindable)

These reflect internal component state:

1. ```ts
   matchingOptions: Option[] = []  // bindable
   ```

   Currently filtered options based on search text.

### Bindable Props

`selected`, `value`, `searchText`, `open`, `maxSelect`, `activeIndex`, `activeOption`, `invalid`, `input`, `outerDiv`, `form_input`, `options`, `matchingOptions`, `collapsedGroups`, `collapseAllGroups`, `expandAllGroups`, `undo`, `redo`, `canUndo`, `canRedo`

## Snippets

`MultiSelect.svelte` accepts the following named snippets:

1. `#snippet option({ option, idx, selected, active, disabled })`: Customize rendering of dropdown options. Receives the `option`, its zero-indexed position (`idx`) in the dropdown, whether it is `selected`, `active` (keyboard-highlighted), and `disabled`.
1. `#snippet selectedItem({ option, idx })`: Customize rendering of selected items. Receives as props an `option` and the zero-indexed position (`idx`) it has in the list of selected items.
1. `#snippet children({ option, idx, type })`: Convenience snippet that applies to both dropdown options AND selected items. Use this when you want the same custom rendering for both. Takes precedence if `option` or `selectedItem` are not provided. `type` is `'selected'` when rendering a selected pill and `'option'` when rendering a dropdown item, allowing conditional styling/content by context.
1. `#snippet spinner()`: Custom spinner component to display when in `loading` state. Receives no props.
1. `#snippet disabledIcon()`: Custom icon to display inside the input when in `disabled` state. Receives no props. Use an empty `{#snippet disabledIcon()}{/snippet}` to remove the default disabled icon.
1. `#snippet expandIcon({ open, disabled })`: Allows setting a custom icon to indicate to users that the Multiselect text input field is expandable into a dropdown list. `open` is `true` if the dropdown is visible and `false` if hidden. `disabled` reflects the component's disabled state. Use the `expandIconPosition` prop to control which side of the input the icon renders on.
1. `#snippet removeIcon({ option, isRemoveAll })`: Custom icon to display as remove button. Used both by per-option remove buttons (`isRemoveAll: false`, `option` is the item being removed) and the 'remove all' button (`isRemoveAll: true`, `option` is `undefined`).
1. `#snippet userMsg({ searchText, msgType, msg })`: Displayed like a dropdown item when the list is empty and user is allowed to create custom options based on text input (or if the user's text input clashes with an existing option). Receives props:
   - `searchText`: The text user typed into search input.
   - `msgType: false | 'create' | 'dupe' | 'no-match'`: `'dupe'` means user input is a duplicate of an existing option. `'create'` means user is allowed to convert their input into a new option not previously in the dropdown. `'no-match'` means user input doesn't match any dropdown items and users are not allowed to create new options. `false` means none of the above.
   - `msg`: Will be [`duplicateOptionMsg`](#message-props) or [`createOptionMsg`](#advanced-props) based on whether user input is a duplicate or can be created as new option. Note this snippet replaces the default UI for displaying these messages so the snippet needs to render them instead (unless purposely not showing a message).
1. `#snippet beforeInput({ selected, disabled, invalid, id, placeholder, open, required, searchText })`: Placed before the selected chips and search input. For arbitrary content like a search icon or prefix badge.
1. `#snippet afterInput({ selected, disabled, invalid, id, placeholder, open, required, searchText })`: Placed after the search input. For arbitrary content like icons or temporary messages. Can serve as a more dynamic, more customizable alternative to the `placeholder` prop.

Example using several snippets:

```svelte
<MultiSelect options={[`Red`, `Green`, `Blue`, `Yellow`, `Purple`]}>
  {#snippet children({ idx, option, type })}
    <span style="display: flex; align-items: center; gap: 6pt">
      <span
        style:background={`${option}`}
        style="border-radius: 50%; width: 1em; height: 1em"
      ></span>
      {#if type === `option`}{idx + 1}{/if}
      {option}
    </span>
  {/snippet}
  {#snippet spinner()}
    <CustomSpinner />
  {/snippet}
  {#snippet removeIcon({ isRemoveAll })}
    <strong>{isRemoveAll ? `Clear` : `X`}</strong>
  {/snippet}
</MultiSelect>
```

## Events

`MultiSelect.svelte` provides the following event callback props:

1. ```ts
   onadd={({ option, selected }) => console.log(option, selected)}
   ```

   Triggers when a new option is selected. `option` is the newly selected option, `selected` is the updated array of all selected options.

1. ```ts
   oncreate={({ option }) => console.log(option)}
   ```

   Triggers when a user creates a new option (when `allowUserOptions` is enabled). The created option is provided as `option`. Doubles as a validation hook: return `false` to reject the option, return a replacement option to transform it, or `undefined` to accept it as-is. May be async — paste handling awaits it.

1. ```ts
   onremove={({ option, selected }) => console.log(option, selected)}
   ```

   Triggers when a single selected option is removed. `option` is the removed option, `selected` is the updated array of remaining selected options.

1. ```ts
   onremoveAll={({ options }) => console.log(options)}
   ```

   Triggers when all selected options are removed. The `options` payload gives the options that were removed (might not be all if `minSelect` is set).

1. ```ts
   onselectAll={({ options, scope }) => console.log(options, scope)}
   ```

   Triggers when the "Select All" option is clicked (requires `selectAllOption` to be enabled). The `options` payload contains the options that were added. `scope` is the active [`selectAllScope`](#ui-and-behavior-props) for the top-level "Select All", and `undefined` when a group's own select-all fired the event.

1. ```ts
   onrangeSelect={({ added, from, to, selected }) => console.log(added, from, to)}
   ```

   Triggers when a Shift-click or Shift+Arrow selects a range (requires `rangeSelect`). `added` are the newly selected options (already excluding disabled, duplicate and over-`maxSelect` ones), `from` is the anchor option, `to` is the shift-targeted option, and `selected` is the resulting selection.

1. ```ts
   onreorder={({ options, previous }) => console.log(options, previous)}
   ```

   Triggers when selected options are reordered via drag-and-drop (enabled by default when `sortSelected` is false). `options` is the newly ordered array, `previous` is the array before reordering.

1. ```ts
   onchange={({ type, option, options }) => console.log(type, option ?? options)}
   ```

   Triggers when an option is either added (selected) or removed from selected, all selected options are removed at once, a range is selected, or selected options are reordered via drag-and-drop. `type` is one of `'add' | 'remove' | 'removeAll' | 'selectAll' | 'rangeSelect' | 'reorder'` and payload will be `option: Option` or `options: Option[]`, respectively.

1. ```ts
   onopen={({ event }) => console.log(`Dropdown opened by`, event)}
   ```

   Triggers when the dropdown list of options appears. `event` is the DOM's `FocusEvent`, `KeyboardEvent` or `ClickEvent` that triggered the open.

1. ```ts
   onclose={({ event }) => console.log(`Dropdown closed by`, event)}
   ```

   Triggers when the dropdown list of options disappears. `event` is the DOM's `FocusEvent`, `KeyboardEvent` or `ClickEvent` that triggered the close.

1. ```ts
   onsearch={({ searchText, matchingOptions }) => console.log(searchText, matchingOptions.length)}
   ```

   Triggers (debounced, 150ms) when the search text changes. Useful for analytics or loading remote options. `searchText` is the current input value, `matchingOptions` is the array of options matching the search.

1. ```ts
   onmaxreached={({ selected, maxSelect, attemptedOption }) => console.log(attemptedOption)}
   ```

   Triggers when a user tries to select more options than `maxSelect` allows. Useful for showing feedback. Does not fire for `maxSelect=1` (which uses replace behavior).

1. ```ts
   onduplicate={({ option }) => console.log(`Duplicate:`, option)}
   ```

   Triggers when a user tries to add an already-selected option (when `duplicates=false`). Useful for showing feedback to the user.

1. ```ts
   onactivate={({ option, index }) => console.log(`Active:`, option, index)}
   ```

   Triggers during keyboard navigation (ArrowUp/ArrowDown) through options. `option` is the newly active option, `index` is its position. Does not fire on mouse hover.

1. ```ts
   oncollapseAll={({ groups }) => console.log(`Collapsed:`, groups)}
   ```

   Triggers when all groups are collapsed (e.g. via `collapseAllGroups()`). `groups` lists the group names that were collapsed.

1. ```ts
   onexpandAll={({ groups }) => console.log(`Expanded:`, groups)}
   ```

   Triggers when all groups are expanded (e.g. via `expandAllGroups()`). `groups` lists the group names that were expanded.

1. ```ts
   onundo={({ previous, current }) => console.log(`Undo:`, previous, `→`, current)}
   ```

   Triggers when an undo operation restores a previous selection state. `previous` is the selection before undo, `current` is the restored selection.

1. ```ts
   onredo={({ previous, current }) => console.log(`Redo:`, previous, `→`, current)}
   ```

   Triggers when a redo operation re-applies a previously undone selection change. `previous` is the selection before redo, `current` is the new selection.

The following example shows an alert whenever one or more options are added or removed:

```svelte
<MultiSelect
  onchange={({ type, option, options }) => {
    if (type === 'add') alert(`You added ${option}`)
    if (type === 'remove') alert(`You removed ${option}`)
    if (type === 'removeAll') alert(`You removed ${options}`)
    if (type === 'selectAll') alert(`You selected all: ${options}`)
    if (type === 'reorder') alert(`New order: ${options}`)
  }}
/>
```

> Note: Depending on the data passed to the component the `option(s)` payload will either be objects or simple strings/numbers.

This component also forwards these DOM events from the `<input>` node: `blur`, `click`, `focus`, `input`, `keydown`, `keyup`, `mousedown`, `mouseenter`, `mouseleave`, `touchcancel`, `touchend`, `touchmove`, `touchstart`. Note `onchange` is _not_ forwarded — it's reused as the custom selection-change callback documented above. Registering listeners for the forwarded events works the same:

```svelte
<MultiSelect
  options={[1, 2, 3]}
  onkeyup={(event) => console.log('key', event.target.value)}
/>
```

## TypeScript

The type of `options` is inferred automatically from the data you pass. E.g.

```ts
const obj_options = [
  { label: `foo`, value: 42 },
  { label: `bar`, value: 69 },
]
// type Option = { label: string, value: number }
const str_options = [`foo`, `bar`]
// type Option = string
const num_options = [42, 69]
// type Option = number
```

The inferred type of `Option` is used to enforce type-safety on derived props like `selected` as well as snippets. E.g. you'll get an error when trying to use a snippet that expects a string if your options are objects (see [this comment](https://github.com/janosh/svelte-widgets/pull/189/files#r1058853697) for example screenshots).

You can also import [the types this component uses](https://github.com/janosh/svelte-widgets/blob/main/src/lib/index.ts) for downstream applications:

```ts
import {
  LoadOptions, // Dynamic option loading callback
  LoadOptionsConfig,
  LoadOptionsFn,
  LoadOptionsParams,
  LoadOptionsResult,
  FormSerialize, // Type signature for custom form serialization
  MultiSelectEvents,
  MultiSelectSnippets,
  ObjectOption,
  Option,
} from 'svelte-widgets'
```

## Styling

There are 3 ways to style this component. The simplified DOM structure below shows which elements each option affects:

```svelte
<div class="multiselect">
  <ul class="selected">
    <li>Selected 1</li>
    <li>Selected 2</li>
  </ul>
  <ul class="options">
    <li>Option 1</li>
    <li>Option 2</li>
  </ul>
</div>
```

### With CSS variables

If you only want to make small adjustments, you can pass the following CSS variables directly to the component as props or define them in a `:global()` CSS context. All variables have sensible defaults defined inside `MultiSelect.svelte` itself.

Minimal example that changes the background color of the options dropdown:

```svelte
<MultiSelect --sms-options-bg="white" />
```

- `div.multiselect`
  - `border: var(--sms-border, 1px solid light-dark(lightgray, #555))`: Change this to e.g. to `1px solid red` to indicate this form field is in an invalid state.
  - `border-radius: var(--sms-border-radius, 3pt)`
  - `padding: var(--sms-padding, 0 3pt)`
  - `background: var(--sms-bg, light-dark(white, #222226))`
  - `color: var(--sms-text-color, light-dark(#222, #eee))`: Text color. Defaults to a theme-aware color paired with `--sms-bg` so the component stays readable on dark pages that never declare `color-scheme` (where `light-dark()` falls back to light). Set `--sms-text-color: inherit` to blend with the surrounding page instead.
  - `min-height: var(--sms-min-height, 22pt)`
  - `width: var(--sms-width)`
  - `max-width: var(--sms-max-width)`
  - `margin: var(--sms-margin)`
  - `font-size: var(--sms-font-size, inherit)`
- `div.multiselect.open`
  - `z-index: var(--sms-open-z-index, 4)`: Increase this if needed to ensure the dropdown list is displayed atop all other page elements.
- `div.multiselect:focus-within`
  - `border: var(--sms-focus-border, 1px solid var(--sms-active-color, cornflowerblue))`: Border when component has focus. Defaults to `--sms-active-color` which in turn defaults to `cornflowerblue`.
- `div.multiselect.disabled`
  - `background: var(--sms-disabled-bg, light-dark(lightgray, #444))`: Background when in disabled state.
- `div.multiselect input::placeholder`
  - `color: var(--sms-placeholder-color)`
  - `opacity: var(--sms-placeholder-opacity)`
- `div.multiselect > ul.selected > li`
  - `background: var(--sms-selected-bg, light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.15)))`: Background of selected options.
  - `padding: var(--sms-selected-li-padding, 0 2pt 0 5pt)`: Padding of selected options.
  - `color: var(--sms-selected-text-color, var(--sms-text-color, light-dark(#222, #eee)))`: Text color for selected options.
- `ul.selected > li button:hover, button.remove-all:hover, button:focus`
  - `color: var(--sms-remove-btn-hover-color, inherit)`: Color of the remove-icon buttons for removing all or individual selected options when in `:focus` or `:hover` state.
  - `background: var(--sms-remove-btn-hover-bg, light-dark(rgba(0, 0, 0, 0.2), rgba(255, 255, 255, 0.2)))`: Background for hovered remove buttons.
- `div.multiselect > ul.options`
  - `background: var(--sms-options-bg, light-dark(#fcfcfc, #222226))`: Background of dropdown list.
  - `color: var(--sms-text-color, light-dark(#222, #eee))`: Text color of dropdown options. Paired with `--sms-options-bg` since the dropdown is portalled to `document.body` and no longer inherits the component's text color.
  - `max-height: var(--sms-options-max-height, 50vh)`: Maximum height of options dropdown.
  - `overscroll-behavior: var(--sms-options-overscroll, none)`: Whether scroll events bubble to parent elements when reaching the top/bottom of the options dropdown. See [MDN](https://developer.mozilla.org/docs/Web/CSS/overscroll-behavior).
  - `z-index: var(--sms-options-z-index, 3)`: Z-index for the dropdown options list.
  - `box-shadow: var(--sms-options-shadow, light-dark(0 0 14pt -8pt black, 0 0 14pt -4pt rgba(0, 0, 0, 0.8)))`: Box shadow of dropdown list.
  - `border: var(--sms-options-border, 1px solid light-dark(lightgray, #555))`
  - `border-width: var(--sms-options-border-width, 1px)`
  - `border-radius: var(--sms-options-border-radius, 1ex)`
  - `padding: var(--sms-options-padding, 0)`
  - `margin: var(--sms-options-margin, 6pt 0 0 0)`
- `div.multiselect > ul.options > li`
  - `padding: var(--sms-options-li-padding, 2pt 1ex)`: Padding of each option in the dropdown list.
  - `scroll-margin: var(--sms-options-scroll-margin, 100px)`: Top/bottom margin to keep between dropdown list items and top/bottom screen edge when auto-scrolling list to keep items in view.
- `div.multiselect > ul.options > li.selected`
  - `background: var(--sms-li-selected-plain-bg, light-dark(rgba(0, 123, 255, 0.1), rgba(100, 180, 255, 0.2)))`: Background of selected list items in options pane.
  - `border-left: var(--sms-li-selected-plain-border, 1px solid var(--sms-active-color, cornflowerblue))`: Left border of selected list items in options pane.
- `div.multiselect > ul.options > li.active`
  - `background: var(--sms-li-active-bg, var(--sms-active-color, light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.15))))`: Background of active options. Options in the dropdown list become active either by mouseover or by navigating to them with arrow keys. Selected options become active when `selectedOptionsDraggable=true` and an option is being dragged to a new position. Note the active option in that case is not the dragged option but the option under it whose place it will take on drag end.
- `div.multiselect > ul.options > li.disabled`
  - `background: var(--sms-li-disabled-bg, light-dark(#f5f5f6, #2a2a2a))`: Background of disabled options in the dropdown list.
  - `color: var(--sms-li-disabled-text, light-dark(#b8b8b8, #666))`: Text color of disabled option in the dropdown list.
- `div.multiselect > ul.options > li.select-all`
  - `border-bottom: var(--sms-select-all-border-bottom, 1px solid light-dark(lightgray, #555))`: Bottom border separating "Select All" from regular options.
  - `font-weight: var(--sms-select-all-font-weight, 500)`: Font weight of "Select All" text.
  - `color: var(--sms-select-all-color, inherit)`: Text color of "Select All" option.
  - `background: var(--sms-select-all-bg, transparent)`: Background of "Select All" option.
  - `margin-bottom: var(--sms-select-all-margin-bottom, 2pt)`: Space below "Select All" option.
  - `background (hover): var(--sms-select-all-hover-bg, ...)`: Background of "Select All" on hover. Falls back to `--sms-li-active-bg` then `--sms-active-color`.
- `div.multiselect > ul.options > li.group-header`
  - `font-weight: var(--sms-group-header-font-weight, 600)`: Font weight of group headers.
  - `font-size: var(--sms-group-header-font-size, 0.9em)`: Font size of group headers.
  - `color: var(--sms-group-header-color, light-dark(#666, #aaa))`: Text color of group headers.
  - `background: var(--sms-group-header-bg, transparent)`: Background of group headers.
  - `padding: var(--sms-group-header-padding, 2pt 1ex)`: Padding around group header text.
  - `text-transform: var(--sms-group-header-text-transform, uppercase)`: Text transform for group headers.
  - `letter-spacing: var(--sms-group-header-letter-spacing, 0.5px)`: Letter spacing for group headers.
  - `margin-top: var(--sms-group-header-margin-top, 4pt)`: Top margin for group headers (except the first).
  - `border-top: var(--sms-group-header-border-top, 1px solid light-dark(#eee, #333))`: Top border for group headers (except the first).
  - `background (hover): var(--sms-group-header-hover-bg, light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05)))`: Background of collapsible group headers on hover.
  - `background (sticky): var(--sms-group-header-sticky-bg, ...)`: Background when `stickyGroupHeaders` is enabled. Falls back to `--sms-options-bg`.
- `div.multiselect > ul.options > li` (grouped options)
  - `padding-left: var(--sms-group-item-padding-left, var(--sms-group-option-indent, 1.5ex))`: Indentation for options within a group.
- Group chevron icon
  - `transition: transform var(--sms-group-collapse-duration, 0.15s) ease-out`: Animation duration for group collapse/expand chevron rotation.
- Group "Select/Deselect All" button
  - `background (hover): var(--sms-group-select-all-hover-bg, light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1)))`: Background of per-group select-all button on hover.
  - `color (deselect): var(--sms-group-deselect-color, light-dark(#c44, #f77))`: Text color of "Deselect All" button (when all group options are already selected).
- `::highlight(sms-search-matches)`: applies to search results in dropdown list that match the current search query if `highlightMatches=true`. These styles [cannot be set via CSS variables](https://stackoverflow.com/a/56799215). Instead, use a new rule set. For example:

  ```css
  ::highlight(sms-search-matches) {
    color: orange;
    background: rgba(0, 0, 0, 0.15);
    text-decoration: underline;
  }
  ```

### With CSS frameworks

The second method allows you to pass in custom classes to the important DOM elements of this component to target them with frameworks like [Tailwind CSS](https://tailwindcss.com).

- `outerDivClass`: wrapper `div` enclosing the whole component
- `ulSelectedClass`: list of selected options
- `liSelectedClass`: selected list items
- `ulOptionsClass`: available options listed in the dropdown when component is in `open` state
- `liOptionClass`: list items selectable from dropdown list
- `liActiveOptionClass`: the currently active dropdown list item (i.e. hovered or navigated to with arrow keys)
- `liSelectAllClass`: the "Select All" option at the top of the dropdown (when `selectAllOption` is enabled)
- `liUserMsgClass`: user message (last child of dropdown list when no options match user input)
- `liActiveUserMsgClass`: user message when active (i.e. hovered or navigated to with arrow keys)
- `maxSelectMsgClass`: small span toward the right end of the input field displaying to the user how many of the allowed number of options they've already selected

This simplified version of the DOM structure of the component shows where these classes are inserted:

```svelte
<div class="multiselect {outerDivClass}">
  <input class={inputClass} />
  <ul class="selected {ulSelectedClass}">
    <li class={liSelectedClass}>Selected 1</li>
    <li class={liSelectedClass}>Selected 2</li>
  </ul>
  <span class="max-select-msg {maxSelectMsgClass}">2/5</span>
  <ul class="options {ulOptionsClass}">
    <li class="select-all {liSelectAllClass}">Select all</li>
    <li class={liOptionClass}>Option 1</li>
    <li class="{liOptionClass} {liActiveOptionClass}">Option 2 (currently active)</li>
    ...
    <li class="{liUserMsgClass} {liActiveUserMsgClass}">Create this option...</li>
  </ul>
</div>
```

### With global CSS

The following `:global()` CSS selectors provide fine-grained control over every part of the component. `ul.selected` is the list of currently selected options rendered inside the component's input whereas `ul.options` is the list of available options that slides out when the component is in its `open` state. See also [simplified DOM structure](#styling).

```css
:global(div.multiselect) {
  /* top-level wrapper div */
}
:global(div.multiselect.open) {
  /* top-level wrapper div when dropdown open */
}
:global(div.multiselect.disabled) {
  /* top-level wrapper div when in disabled state */
}
:global(div.multiselect > ul.selected) {
  /* selected list */
}
:global(div.multiselect > ul.selected > li) {
  /* selected list items */
}
:global(div.multiselect button) {
  /* target all buttons in this component */
}
:global(div.multiselect > ul.selected > li button, button.remove-all) {
  /* buttons to remove a single or all selected options at once */
}
:global(div.multiselect > input[autocomplete]) {
  /* input inside the top-level wrapper div */
}
:global(div.multiselect > ul.options) {
  /* dropdown options */
}
:global(div.multiselect > ul.options > li) {
  /* dropdown list items */
}
:global(div.multiselect > ul.options > li.selected) {
  /* selected options in the dropdown list */
}
:global(div.multiselect > ul.options > li:not(.selected):hover) {
  /* unselected but hovered options in the dropdown list */
}
:global(div.multiselect > ul.options > li.active) {
  /* active means item was navigated to with up/down arrow keys */
  /* ready to be selected by pressing enter */
}
:global(div.multiselect > ul.options > li.disabled) {
  /* options with disabled key set to true (see props above) */
}
:global(div.multiselect > ul.options > li.select-all) {
  /* the "Select All" option at the top of the dropdown */
}
```
