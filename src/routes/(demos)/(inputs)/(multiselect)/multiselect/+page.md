<script lang="ts">
  import { SubpageGrid } from 'svelte-widgets'
  import { ListChecks } from 'svelte-widgets/icons'
  import { demo_card } from '#site/paths.ts'
  import { multiselect_recipes } from '../../..'
</script>

<SubpageGrid
title="MultiSelect"
title_icon={ListChecks}
subtitle="Keyboard-friendly, accessible multi-select with grouping, async loading, and deep styling hooks."
subpages={multiselect_recipes.map(demo_card)}
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

<MultiSelect bind:value={selected} options={ui_libs} />
```

## Mental model

| Prop         | Purpose           | Value                                                         |
| ------------ | ----------------- | ------------------------------------------------------------- |
| `options`    | Available choices | Strings, numbers, or objects with a `label`                   |
| `mode`       | Selection shape   | `multiple` (default) or `single`                              |
| `bind:value` | Selected choices  | An array in multiple mode; an option or `null` in single mode |

### Common Patterns

```svelte
<!-- Multi-select -->
<MultiSelect bind:value={selected} options={['A', 'B', 'C']} />

<!-- Single-select -->
<MultiSelect bind:value options={colors} mode="single" />

<!-- Object options need a `label`; keys like `value`, `disabled` and `style` have special meaning (see type ObjectOption), any others are free -->
<MultiSelect
  bind:value={selected}
  options={[
    { label: 'Red', value: '#ff0000' },
    { label: 'Blue', value: '#0000ff' },
  ]}
/>
```

### Troubleshooting

- **Object options not working?** → Add `label` property
- **Dropdown not showing?** → Check you have `options` and not `disabled={true}`
- **Want single item not array?** → Use `bind:value` with `mode="single"`
- **Types confusing?** → The type of `value` is inferred from your `options` array

## Props

Props ordered by how often you'll reach for them.

> **💡 Tip:** The `Option` type is automatically inferred from your `options` array, or you can import it: `import { type Option } from 'svelte-widgets'`

### Essential Props

1. ```ts
   options?: Option[]  // required unless load_options is provided
   ```

   Strings, numbers, or objects with a `label` shown in the dropdown. Optional when `load_options` supplies the dropdown contents; if you pass both, these options are filtered client-side and listed ahead of each loaded batch (see [`load_options`](#advanced-props)).

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

1. `mode: 'multiple' | 'single' = 'multiple'` and bindable `value`

   Multiple mode uses an array, initially `[]`. Single mode uses one option or `null`. Pass initial selections through `value`; option metadata never initializes state.

   ```svelte
   <MultiSelect options={colors} bind:value={selected_colors} />
   <MultiSelect options={colors} mode="single" bind:value={selected_color} />
   ```

1. ```ts
   max_select: number | null = null
   ```

   Caps the number of selected options in multiple mode; `null` means unlimited. Single mode does not accept `max_select`.

   ```svelte
   <!-- Unlimited selection -->
   <MultiSelect options={colors} />

   <!-- Single selection -->
   <MultiSelect options={colors} mode="single" />

   <!-- Max 3 selections -->
   <MultiSelect options={colors} max_select={3} />
   ```

1. ```ts
   placeholder: string | { text: string; persistent?: boolean } | null = null
   ```

   Text shown when no options are selected, or an object whose `persistent: true` keeps it visible alongside selections:

   ```svelte
   <!-- Simple string -->
   <MultiSelect placeholder="Choose..." />

   <!-- Object with persistent option (stays visible even when options selected) -->
   <MultiSelect placeholder={{ text: 'Add items...', persistent: true }} />
   ```

1. ```ts
   disabled: boolean = false
   ```

   Renders the component but blocks interaction.

1. ```ts
   required: boolean | number = false
   ```

   For form validation. `true` requires at least 1 selected option, a number sets the minimum count.

### Commonly Used Props

1. ```ts
   search_text: string = `` // bindable
   ```

   The text the user entered to filter options.

1. ```ts
   open: boolean = false // bindable
   ```

   Whether the dropdown is visible.

1. ```ts
   allow_user_options: boolean | `append` = false
   ```

   Whether users can create new options by typing. `true` = add to selected only, `'append'` = add to both options and selected.

1. ```ts
   loading: boolean = false
   ```

   Shows a loading spinner, e.g. while fetching options.

1. ```ts
   invalid: boolean = false // bindable
   ```

   Adds the `invalid` CSS class. Set automatically when form validation fails and cleared when the selection changes.

### Advanced Props

1. ```ts
   load_options: LoadOptionsFn | LoadOptionsConfig = undefined
   ```

   Lazy loading with infinite scroll for large datasets. Pass a function or a config object:

   ```svelte
   <!-- Function shorthand -->
   <MultiSelect load_options={myFetchFn} />

   <!-- With config -->
   <MultiSelect load_options={{ fetch: myFetchFn, debounce_ms: 500, batch_size: 20 }} />
   ```

   Failed requests show an error and a Retry button. Retry preserves previously loaded options and requests the same page again. Bind `load_error` (`Error | null`) to inspect the failure; it clears on retry or a new search. Customize the messages through `labels.loading_failed` and `labels.retry`.

   The function receives `{ search, offset, limit, signal }` and returns `{ options, has_more, replace?, error? }`. Return `error` to display a partial batch alongside Retry; `replace: true` replaces previously loaded options with an ordered snapshot, useful when retrying missing results. `signal` is an `AbortSignal` that fires when the request is superseded by a newer search or when the component closes or unmounts. Forward it to `fetch` to cancel work in flight:

   ```ts
   import type { LoadOptionsParams, LoadOptionsResult } from 'svelte-widgets'

   async function load_options({
     search,
     offset,
     limit,
     signal,
   }: LoadOptionsParams): Promise<LoadOptionsResult<string>> {
     const query = new URLSearchParams({
       q: search,
       skip: String(offset),
       take: String(limit),
     })
     const response = await fetch(`/api/items?${query}`, { signal })
     if (!response.ok) throw new Error(`Loading items failed: HTTP ${response.status}`)
     const { items, total }: { items: string[]; total: number } = await response.json()
     return { options: items, has_more: offset + items.length < total }
   }
   ```

   The endpoint must return `{ items: string[], total: number }`. HTTP failures throw so the component can offer Retry; a successful empty response `{ items: [], total: 0 }` shows the normal no-matches state. Do not catch failures and turn them into empty results.

   Config options (when passing an object):

   | Key           | Type      | Default | Description                                 |
   | ------------- | --------- | ------- | ------------------------------------------- |
   | `fetch`       | `fn`      | —       | Async function to load options (required)   |
   | `debounce_ms` | `number`  | `300`   | Debounce delay for search queries           |
   | `batch_size`  | `number`  | `50`    | Number of options to load per batch         |
   | `on_open`     | `boolean` | `true`  | Whether to load options when dropdown opens |

   See the [infinite-scroll demo](https://svelte-widgets.janosh.dev/infinite-scroll) for live examples.

   Passing `options` alongside `load_options` filters the static options client-side with `filter_func` and renders them above the loaded batches. Needing neither debounce nor request, they appear on the first keystroke, which lets [`PageSearch`](https://svelte-widgets.janosh.dev/command-menu) match known routes instantly while its Pagefind index is still loading.

1. ```ts
   parse_paste: (text: string) => Option[]
   ```

   Splits pasted text into several options (e.g. `(text) => text.split(/[,\n]/)`), each added as if picked or, with `allow_user_options`, created. See the [allow-user-options demo](allow-user-options).

1. ```ts
   active_index: number | null = null  // bindable
   ```

   Zero-based index of currently active option in the filtered list.

1. ```ts
   active_option: Option | null = null  // bindable
   ```

   Currently active option (hovered or navigated to with arrow keys).

1. ```ts
   create_option_msg: string | ((state: { search_text: string; selected: Option[]; options: Option[]; matching_options: Option[] }) => string) | null = `Create this option...`
   ```

   Message shown when `allow_user_options` lets the user create the typed option. A function receives the component state and returns the message.

1. ```ts
   duplicates: boolean | 'case-insensitive' = false
   ```

   `false` (default) blocks exact duplicates, `true` allows selecting the same option multiple times, `'case-insensitive'` also blocks case variants (e.g. "Apple" blocks "apple").

1. ```ts
   expand_icon_position: 'left' | 'right' | 'none' = 'left'
   ```

   Which side of the input to render the expand icon on, or `'none'` to hide it entirely (applies to both the default chevron and a custom `expand_icon` snippet). Clicking the icon toggles the dropdown.

1. ```ts
   filter_func: (opt: Option, search_text: string) => boolean
   ```

   Custom filter for the search text. Default matches the label (fuzzy or substring, see `fuzzy`).

1. ```ts
   key: (opt: Option) => unknown
   ```

   Generates the identity key for an option. Default: an object's `value` if it defines one, else its `label`; primitives are their own key. No case folding — use `duplicates="case-insensitive"` for that.

1. ```ts
   close_dropdown_on_select: boolean | 'if-mobile' | 'retain-focus' = false
   ```

   `false` (default) keeps the dropdown open for rapid multi-selection, `true` closes it after each selection, `'if-mobile'` only below `breakpoint` screen width, and `'retain-focus'` closes it but keeps the input focused for typing further custom options (see `allow_user_options`).

1. ```ts
   reset_filter_on_add: boolean = true
   ```

   Whether to clear search text when an option is selected.

1. ```ts
   sort_selected: boolean | ((a: Option, b: Option) => number) = false
   ```

   Sorts selected options: `true` with the default sort, or with a custom comparator. Can't be combined with `selected_options_draggable`.

1. ```ts
   portal: { active?: boolean; placement?: 'auto' | 'bottom' | 'top' } = {}
   ```

   With `active: true`, the dropdown renders in `document.body` with fixed positioning, escaping z-index and overflow clipping. Toggling `active` at runtime portals or un-portals in place. `placement` controls which side of the input the dropdown opens on: `'auto'` (default) opens below and flips above when the dropdown would overflow the viewport bottom with more space available above, `'bottom'`/`'top'` force a side.

### Grouping Props

Add a `group` key to option objects to list them under group headers:

```svelte
<script>
  const options = [
    { label: `JavaScript`, group: `Frontend` },
    { label: `TypeScript`, group: `Frontend` },
    { label: `Python`, group: `Backend` },
    { label: `Go`, group: `Backend` },
  ]
</script>

<MultiSelect {options} collapsible_groups group_select_all />
```

See the [grouping demo](https://svelte-widgets.janosh.dev/grouping) for live examples.

1. ```ts
   collapsible_groups: boolean = false
   ```

   Clicking a group header hides or shows its options.

1. ```ts
   collapsed_groups: Set<string> = new Set()
   ```

   Bindable set of collapsed group names, to control or persist collapse state.

1. ```ts
   group_select_all: boolean = false
   ```

   Adds a "Select all" button to each group header.

1. ```ts
   ungrouped_position: 'first' | 'last' = 'first'
   ```

   Whether options without a `group` key render at the top or bottom.

1. ```ts
   group_sort_order: 'none' | 'asc' | 'desc' | ((a: string, b: string) => number) = 'none'
   ```

   Sort groups alphabetically (`'asc'` or `'desc'`) or with a custom comparator function. Default `'none'` preserves order of first occurrence.

1. ```ts
   search_expands_collapsed_groups: boolean = false
   ```

   Expands collapsed groups when the search matches options in them.

1. ```ts
   search_matches_groups: boolean = false
   ```

   The search also matches group names; a matching group shows all its options.

1. ```ts
   keyboard_expands_collapsed_groups: boolean = false
   ```

   Expands collapsed groups when arrow-key navigation enters them.

1. ```ts
   sticky_group_headers: boolean = false
   ```

   Group headers stick to the top of the dropdown while scrolling through their options.

1. ```ts
   collapse_all_groups: () => void  // bindable
   ```

   Collapses all groups. Get it with `bind:collapse_all_groups`.

1. ```ts
   expand_all_groups: () => void  // bindable
   ```

   Expands all groups. Get it with `bind:expand_all_groups`.

1. ```ts
   group_header: Snippet<[{ group: string; options: T[]; collapsed: boolean }]>
   ```

   Custom group header rendering.

1. ```ts
   on_group_toggle: (data: { group: string; collapsed: boolean }) => void
   ```

   Fires when a group is collapsed or expanded, with its new state.

### Form & Accessibility Props

1. ```ts
   id: string | null = null
   ```

   Applied to the `<input>` for associating with `<label>` elements.

1. ```ts
   name: string | null = null
   ```

   Form field name for form submission. When selected options are displayed as chips (the default display mode), they submit as `JSON.stringify(selected)`. Prefer stable object `value` fields for server processing, or customize serialization with `form_serialize`.

1. ```ts
   form_serialize: (selected: Option[]) => string | null = JSON.stringify
   ```

   Customizes the submitted value in chip mode. For object options, use `form_serialize={(selected) => selected.map(({ value }) => value).join(',')}`. For primitive options, use `form_serialize={(selected) => selected.join(',')}`.

1. ```ts
   autocomplete: string = 'off'
   ```

   The input's `autocomplete` attribute.

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
   max_options: number | undefined = undefined
   ```

   Max number of options shown in the dropdown. `undefined` = no limit.

1. ```ts
   max_visible_chips: number | null = null
   ```

   Max number of selected chips to render before collapsing the rest into a `+N more` toggle chip (click to expand/collapse). `null` renders all chips. Keyboard chip navigation auto-expands so hidden chips can't be highlighted invisibly. Ignored in `selected_display="input"` mode.

1. ```ts
   selected_display: 'chips' | 'input' = 'chips'
   ```

   How selected options are shown. `'chips'` renders them as removable tags inside the input. `'input'` writes the selected label straight into the text input (combobox/datalist style) and requires `mode="single"`; other values throw a configuration error. See the [input-dropdown demo](https://svelte-widgets.janosh.dev/input-dropdown).

1. ```ts
   virtual_list: boolean | { item_height?: number; overscan?: number } = false
   ```

   Virtualized dropdown rendering for large option lists: only rows near the scroll viewport are rendered as DOM nodes. Pass `true` for defaults or an object to tune `item_height` (px per row, default 30, also applies to group headers; rendered rows are pinned to this height) and `overscan` (extra rows rendered above/below the visible window, default 10). Grouped options are supported, but combining them with `sticky_group_headers` throws a configuration error.

1. ```ts
   min_select: number | null = null
   ```

   Remove buttons disappear once removing would drop the selection below this count.

1. ```ts
   auto_active_first_option: boolean = false
   ```

   Makes the first enabled option active whenever the open dropdown has no valid active option or the search changes, so Enter selects it.

1. ```ts
   dismiss_on: 'press' | 'release' = 'press'
   ```

   When an outside press closes a portalled dropdown: on `pointerdown` or after the click. An in-place dropdown already closes when the press blurs the input.

1. ```ts
   auto_scroll: boolean = true
   ```

   Keeps the active option in view during arrow-key navigation.

1. ```ts
   breakpoint: number = 800
   ```

   Screen width (px) that separates 'mobile' from 'desktop' behavior.

1. ```ts
   fuzzy: boolean = true
   ```

   `true` (default) matches non-consecutive characters (e.g. "ga" matches "Grapes" and "Green Apple"), `false` substrings only.

1. ```ts
   highlight_matches: boolean = true
   ```

   Highlights the matched text in dropdown options.

1. ```ts
   keep_selected_in_dropdown: false | 'plain' | 'checkboxes' = false
   ```

   `false` (default) hides selected options from the dropdown, `'plain'` keeps them marked by a left border and background, `'checkboxes'` prefixes every option with a checkbox.

1. ```ts
   labels: Partial<MultiSelectLabels> = {}
   ```

   Overrides for the strings MultiSelect renders itself, merged over the `MULTI_SELECT_LABELS` defaults exported from `svelte-widgets/labels`. Covers the `+N more` / `show less` chip toggle, group headers, the three disabled select-all titles, screen-reader announcements and form-validity messages. Entries that interpolate a count or a label are functions, so a locale controls its own word order and plural rules. A key set to `undefined` falls back to its default, so `condition ? translation : undefined` is safe. Strings a dedicated prop supplies outright (`remove_btn_title`, `no_matching_options_msg`, ...) are not part of this record. Every other component that renders text of its own takes the same prop.

   ```svelte
   <MultiSelect
     {options}
     max_visible_chips={3}
     labels={{
       more_chips: (hidden) => `+${hidden} weitere`,
       show_less: `weniger anzeigen`,
     }}
   />
   ```

1. ```ts
   select_all_option: boolean | string = false
   ```

   Adds a "Select All" row at the top of the dropdown; a string sets its label.

1. ```ts
   select_all_scope: 'visible' | 'matching' = 'visible'
   ```

   Which options "Select All" adds. `'visible'` (default) adds only the rows the dropdown currently renders, i.e. options in expanded groups up to the `max_options` limit (virtualization doesn't narrow the scope). `'matching'` adds every option matching the current search, including those in collapsed groups and beyond `max_options`. `'matching'` requires local `options` and is disabled when `load_options` is set, since the component can't know the full remote result set.

1. ```ts
   select_all_disabled_title: string | ((state: SelectAllDisabledState) => string) | null
   ```

   Tooltip of the disabled "Select All" row. A function receives why it is disabled (`max_reached`, `all_selectable_selected`, `matching_scope_unavailable`, counts) and the `default_title`; `null` shows none.

1. ```ts
   range_select: boolean = false
   ```

   Shift-click and Shift+Arrow select an inclusive range from the anchor (the last plain click, or the option active before Shift+Arrow) to the targeted option, skipping disabled options and respecting `max_select`. Off by default since it changes what Shift-click does.

1. ```ts
   selected_options_draggable: boolean = !sort_selected
   ```

   Whether selected options can be reordered by dragging. Must be `false` when `sort_selected` is set.

1. ```ts
   selected_flip_params: FlipParams = { duration: 100 }
   ```

   `duration`, `delay` and `easing` of the [flip animation](https://svelte.dev/docs/svelte/svelte-animate) when selected options reorder. `{ duration: 0 }` disables it.

### Keyboard Shortcuts

1. ```ts
   shortcuts: Partial<KeyboardShortcuts> = {}
   ```

   Overrides the default keyboard shortcuts. Format: `"modifier+...+key"` where modifiers can be `ctrl`, `shift`, `alt`, `meta`, `cmd`. Set a shortcut to `null` to disable it. Custom shortcuts take precedence over built-in key handlers (Enter, Escape, ArrowUp/Down, Backspace).

   Available shortcuts and their defaults:

   | Key          | Default                                 | Action                                                                                                                               |
   | ------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
   | `select_all` | `null`                                  | Select all visible options. Opt in with `{ select_all: 'ctrl+a' }` — off by default so it doesn't hijack the browser's native Ctrl+A |
   | `clear_all`  | `'meta+backspace'` / `'ctrl+backspace'` | Deselect all options (only while chips are present and the search box is empty)                                                      |
   | `open`       | `null`                                  | Open dropdown                                                                                                                        |
   | `close`      | `null`                                  | Close dropdown (Escape works by default)                                                                                             |

### Message Props

1. ```ts
   no_matching_options_msg: string = 'No matching options'
   ```

   Message when the search, or an empty query, yields no options (e.g. a faceted filter whose `load_options` returns nothing). With `allow_user_options`, nothing shows until the user types. Set to `''` to never show it.

1. ```ts
   duplicate_option_msg: string = 'This option is already selected'
   ```

   Message when the typed text duplicates a selected option.

1. ```ts
   default_disabled_title: string = 'This option is disabled'
   ```

   Tooltip for disabled options (an option's own `disabled_title` overrides it).

1. ```ts
   disabled_input_title: string = 'This input is disabled'
   ```

   Tooltip when the component is disabled.

1. ```ts
   remove_all_title: string = 'Remove all'
   ```

   Tooltip for the remove-all button.

1. ```ts
   remove_btn_title: string = 'Remove'
   ```

   Tooltip for individual remove buttons.

1. ```ts
   max_select_msg: ((current: number, max: number) => string) | null = (current, max) =>
     mode === `multiple` ? `${current}/${max}` : ``
   ```

   Renders a `2/5` counter next to the input while options are selected and `max_select` is set. The default is empty in single mode. `null` = no message.

### DOM Element References (bindable)

1. ```ts
   input: HTMLInputElement | null = null  // bindable
   ```

   The search `<input>`.

1. ```ts
   form_input: HTMLInputElement | null = null  // bindable
   ```

   The hidden input used for validation and form submission.

1. ```ts
   outer_div: HTMLDivElement | null = null  // bindable
   ```

   The outer wrapper `<div>`.

### Inner Element Props

Each inner element takes an object of HTML attributes (`class`, `style`, `data-*`, `title`, ...) for CSS frameworks like Tailwind or one-off styles. They spread before the component's own attributes, so internal roles, ARIA state and event handlers (not accepted here) win, while `class` merges with the internal classes. See [Inner Element Props](css-classes) for an example.

1. ```ts
   style: string | null = null
   ```

   CSS rules for the outer wrapper div (its classes come from `class`).

1. ```ts
   input_props: Omit<HTMLInputAttributes, `on${string}`> = {}
   ```

   Attributes for the search `<input>`.

1. ```ts
   ul_selected_props: ElementProps<HTMLUListElement> = {}
   li_selected_props: ElementProps<HTMLLIElement> = {}
   ```

   The selected options list and its chips. `li_selected_props.style` merges after each option's own `style.selected`.

1. ```ts
   ul_options_props: ElementProps<HTMLUListElement> = {}
   li_option_props: ElementProps<HTMLLIElement> = {}
   ```

   The dropdown list and its options. The active option (hovered or arrow-keyed) gets class `active`, plus `li_active_option_class` if set. `li_option_props.style` merges after each option's own `style.option`.

1. ```ts
   li_group_header_props: ElementProps<HTMLLIElement> = {}
   li_select_all_props: ElementProps<HTMLLIElement> = {}
   li_user_msg_props: ElementProps<HTMLLIElement> = {}
   ```

   Group headers, the "Select all" row (with `select_all_option`) and the user message row (no matches, create option, duplicate), which gets class `active`, plus `li_active_user_msg_class` if set, while active.

1. ```ts
   max_select_msg_props: ElementProps<HTMLSpanElement> = {}
   ```

   The `max_select_msg` counter.

### Read-only Props (bindable)

1. ```ts
   matching_options: Option[] = []  // bindable
   ```

   The options matching the current search text.

### Bindable Props

`value`, `search_text`, `open`, `active_index`, `active_option`, `invalid`, `input`, `outer_div`, `form_input`, `options`, `matching_options`, `collapsed_groups`, `collapse_all_groups`, `expand_all_groups`, `load_error`

## Snippets

`MultiSelect.svelte` accepts the following named snippets:

1. `#snippet option({ option, idx, selected, active, disabled })`: Renders a dropdown option. `idx` is its zero-based position in the dropdown, `active` means keyboard-highlighted.
1. `#snippet selected_item({ option, idx })`: Renders a selected chip. `idx` is its zero-based position among the selected options.
1. `#snippet children({ option, idx, type })`: Fallback for both dropdown options and selected chips when `option` or `selected_item` is not provided. `type` is `'option'` or `'selected'` for context-specific rendering.
1. `#snippet spinner()`: Replaces the spinner shown while `loading`.
1. `#snippet disabled_icon()`: Replaces the icon shown while `disabled`. An empty `{#snippet disabled_icon()}{/snippet}` removes it.
1. `#snippet expand_icon({ open, disabled })`: Replaces the icon marking the input as expandable into a dropdown. `expand_icon_position` sets its side.
1. `#snippet remove_icon({ option, is_remove_all })`: Replaces the remove button icon, both per option (`is_remove_all: false`, `option` is the item being removed) and on the remove-all button (`is_remove_all: true`, `option` is `undefined`).
1. `#snippet user_msg({ search_text, msg_type, msg })`: Rendered like a dropdown item when the typed text can be created as an option, duplicates a selected one, or matches nothing. Receives:
   - `search_text`: The text typed into the search input.
   - `msg_type: 'create' | 'dupe' | 'no-match'`: `'dupe'` means the input duplicates a selected option, `'create'` that it can become a new option, `'no-match'` that it matches nothing and can't be created. Without any of these the snippet doesn't render.
   - `msg`: [`duplicate_option_msg`](#message-props), [`create_option_msg`](#advanced-props) or `no_matching_options_msg` to match `msg_type`. The snippet replaces the default message UI, so it must render `msg` itself.
1. `#snippet before_input({ selected, disabled, invalid, id, placeholder, open, required, search_text })`: Content before the selected chips and search input, like a search icon or prefix badge.
1. `#snippet after_input({ selected, disabled, invalid, id, placeholder, open, required, search_text })`: Content after the search input, like icons or temporary messages; a more dynamic alternative to `placeholder`.

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
  {#snippet remove_icon({ is_remove_all })}
    <strong>{is_remove_all ? `Clear` : `X`}</strong>
  {/snippet}
</MultiSelect>
```

## Events

`MultiSelect.svelte` provides the following event callback props:

1. ```ts
   on_add={({ option, selected }) => console.log(option, selected)}
   ```

   Fires when an option is selected, with the updated `selected` array.

1. ```ts
   on_create={({ option }) => console.log(option)}
   ```

   Fires when the user creates an option (requires `allow_user_options`). Doubles as a validation hook: return `false` to reject the option, return a replacement option to transform it, or `undefined` to accept it as-is. May be async — paste handling awaits it.

1. ```ts
   on_remove={({ option, selected }) => console.log(option, selected)}
   ```

   Fires when one selected option is removed, with the remaining `selected` array.

1. ```ts
   on_remove_all={({ options }) => console.log(options)}
   ```

   Fires when selected options are removed at once (remove-all button, `clear_all` shortcut or a group's deselect-all). `options` are the removed ones (not all of them if `min_select` is set).

1. ```ts
   on_select_all={({ options, scope }) => console.log(options, scope)}
   ```

   Fires when "Select All" is clicked (requires `select_all_option` or `group_select_all`). `options` are the added ones. `scope` is the active [`select_all_scope`](#ui-and-behavior-props) for the top-level "Select All", and `undefined` when a group's own select-all fired the event.

1. ```ts
   on_range_select={({ added, from, to, selected }) => console.log(added, from, to)}
   ```

   Fires when Shift-click or Shift+Arrow selects a range (requires `range_select`). `added` are the newly selected options (already excluding disabled, duplicate and over-`max_select` ones), `from` is the anchor option, `to` is the shift-targeted option, and `selected` is the resulting selection.

1. ```ts
   on_reorder={({ options, previous }) => console.log(options, previous)}
   ```

   Fires when selected options are reordered by drag-and-drop (see `selected_options_draggable`), with the new and `previous` order.

1. ```ts
   on_change={({ type, option, options }) => console.log(type, option ?? options)}
   ```

   Fires on every selection change. `type` is `'add' | 'remove' | 'remove_all' | 'select_all' | 'range_select' | 'reorder'`; `add` and `remove` carry `option`, the others `options`.

1. ```ts
   on_open={({ via }) => console.log(`Dropdown opened via`, via)}
   ```

   Fires when the dropdown opens. `via` is `'pointer' | 'trigger' | 'focus' | 'keyboard' | 'input' | 'shortcut'`: `pointer` a click on the already focused input or elsewhere on the component (a first click on an unfocused input reports `focus`), `trigger` the expand icon, `focus` focusing the input (also programmatically), `keyboard` Enter or an arrow key, `input` typing and `shortcut` the `open` hotkey.

1. ```ts
   on_close={({ via }) => console.log(`Dropdown closed via`, via)}
   ```

   Fires when the dropdown closes. `via` is `'escape' | 'tab' | 'shortcut' | 'select' | 'blur' | 'pointer' | 'trigger' | 'disabled'`: `select` covers `close_dropdown_on_select` and reaching `max_select`, `pointer` a press outside, `trigger` the expand icon, `shortcut` the `close` hotkey and `disabled` disabling an open dropdown.

1. ```ts
   on_parsed_paste={({ added, rejected, overflow, raw_text }) => console.log(added, rejected)}
   ```

   Fires after a paste handled by `parse_paste`: `added` were selected, `rejected` were empty, disabled, duplicate or not creatable, `overflow` didn't fit under `max_select` (or past the first in single mode).

1. ```ts
   on_search={({ search_text, matching_options }) => console.log(search_text, matching_options.length)}
   ```

   Fires 150 ms after the search text stops changing, e.g. for analytics.

1. ```ts
   on_max_reached={({ selected, max_select, attempted_option }) => console.log(attempted_option)}
   ```

   Fires when the user tries to select more options than `max_select` allows. Never fires in single mode, which replaces the selection instead.

1. ```ts
   on_duplicate={({ option }) => console.log(`Duplicate:`, option)}
   ```

   Fires when the user tries to add an already-selected option (unless `duplicates` is `true`).

1. ```ts
   on_activate={({ option, index }) => console.log(`Active:`, option, index)}
   ```

   Fires when arrow-key navigation moves the active option (`null` on the user message row). Not on mouse hover.

1. ```ts
   on_collapse_all={({ groups }) => console.log(`Collapsed:`, groups)}
   ```

   Fires when all groups are collapsed (e.g. via `collapse_all_groups()`), listing the collapsed group names.

1. ```ts
   on_expand_all={({ groups }) => console.log(`Expanded:`, groups)}
   ```

   Fires when all groups are expanded (e.g. via `expand_all_groups()`), listing the expanded group names.

Alert on every selection change:

```svelte
<MultiSelect
  on_change={({ type, option, options }) => {
    if (type === 'add') alert(`You added ${option}`)
    if (type === 'remove') alert(`You removed ${option}`)
    if (type === 'remove_all') alert(`You removed ${options}`)
    if (type === 'select_all') alert(`You selected all: ${options}`)
    if (type === 'reorder') alert(`New order: ${options}`)
  }}
/>
```

The `option(s)` payloads are objects or strings/numbers, matching your `options`.

Other attributes and DOM event handlers (e.g. `onkeyup`, `onclick`) are spread onto the search `<input>`, so native events reach your handlers alongside `on_change`:

```svelte
<MultiSelect
  options={[1, 2, 3]}
  onkeyup={(event) => console.log('key', event.target.value)}
/>
```

## TypeScript

The `Option` type is inferred from the data you pass:

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

It types `value` and the snippet props, so e.g. a snippet expecting strings errors when your options are objects (see [this comment](https://github.com/janosh/svelte-widgets/pull/189/files#r1058853697) for example screenshots).

The [types it uses](https://github.com/janosh/svelte-widgets/blob/-/src/lib/index.ts) are exported too:

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

For small adjustments, pass these CSS variables to the component as props or set them in a `:global()` rule. E.g. the dropdown background:

```svelte
<MultiSelect --sms-options-bg="white" />
```

- `div.multiselect`
  - `border: var(--sms-border, 1px solid light-dark(lightgray, #555))`: E.g. `1px solid red` to mark the field invalid.
  - `border-radius: var(--sms-radius, 3pt)`
  - `padding: var(--sms-padding, 0 3pt)`
  - `background: var(--sms-bg, light-dark(white, #222226))`
  - `color: var(--sms-text-color, light-dark(#222, #eee))`: Theme-aware default paired with `--sms-bg`, so the component stays readable on dark pages that never declare `color-scheme` (where `light-dark()` falls back to light). Set `inherit` to blend with the page instead.
  - `min-height: var(--sms-min-height, 20.5pt)`
  - `width: var(--sms-width)`
  - `max-width: var(--sms-max-width)`
  - `margin: var(--sms-margin)`
  - `font-size: var(--sms-font-size, inherit)`
- `div.multiselect.open`
  - `z-index: var(--sms-open-z-index, 4)`: Raise it if the open dropdown ends up below other page elements.
- `div.multiselect:focus-within`
  - `border: var(--sms-focus-border, 1px solid var(--sms-active-color, cornflowerblue))`: Border while focused.
- `div.multiselect.disabled`
  - `background: var(--sms-disabled-bg, light-dark(lightgray, #444))`
- `div.multiselect input::placeholder`
  - `color: var(--sms-placeholder-color)`
  - `opacity: var(--sms-placeholder-opacity)`
- `div.multiselect > ul.selected > li`
  - `background: var(--sms-selected-bg, light-dark(rgba(100, 120, 140, 0.15), rgba(120, 170, 255, 0.2)))`
  - `padding: var(--sms-selected-li-padding, 0 2pt 0 5pt)`
  - `color: var(--sms-selected-text-color, var(--sms-text-color, light-dark(#222, #eee)))`
- `ul.selected > li button:hover, button.remove-all:hover, button:focus`
  - `color: var(--sms-remove-btn-hover-color, inherit)`: Color of the remove-one and remove-all buttons on hover or focus.
  - `background: var(--sms-remove-btn-hover-bg, light-dark(rgba(0, 0, 0, 0.2), rgba(255, 255, 255, 0.2)))`
- `div.multiselect > ul.options`
  - `background: var(--sms-options-bg, light-dark(#fcfcfc, #222226))`
  - `color: var(--sms-text-color, light-dark(#222, #eee))`: Set on the dropdown itself since a portalled dropdown (see `portal`) no longer inherits the component's text color.
  - `max-height: var(--sms-options-max-height, 50vh)`
  - `overscroll-behavior: var(--sms-options-overscroll, none)`: Whether scrolling chains to the page at the dropdown's top/bottom. See [MDN](https://developer.mozilla.org/docs/Web/CSS/overscroll-behavior).
  - `z-index: var(--sms-options-z-index, 3)`
  - `box-shadow: var(--sms-options-shadow, 0 0 14pt -3pt light-dark(rgba(0, 0, 0, 0.2), transparent), 0 0 14pt -4pt light-dark(transparent, rgba(0, 0, 0, 0.8)))`
  - `border: var(--sms-options-border, 1px solid light-dark(lightgray, #555))`
  - `border-width: var(--sms-options-border-width, 1px)`
  - `border-radius: var(--sms-options-radius, 1ex)`
  - `padding: var(--sms-options-padding, 0)`
  - `margin: var(--sms-options-margin, 6pt 0 0 0)`
- `div.multiselect > ul.options > li`
  - `padding: var(--sms-options-li-padding, 2pt 1ex)`
  - `scroll-margin: var(--sms-options-scroll-margin, 100px)`: Gap kept between the active option and the screen edge when auto-scrolling it into view.
- `div.multiselect > ul.options > li.selected`
  - `background: var(--sms-li-selected-plain-bg, light-dark(rgba(0, 123, 255, 0.1), rgba(100, 180, 255, 0.2)))`: Selected options kept in the dropdown (`keep_selected_in_dropdown`).
  - `border-inline-start: var(--sms-li-selected-plain-border, 1px solid var(--sms-active-color, cornflowerblue))`
- `div.multiselect > ul.options > li.active`
  - `background: var(--sms-li-active-bg, var(--sms-active-color, light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.15))))`: Options become active on hover or arrow-key navigation. During a chip drag, the chip under the dragged one (whose place it takes on drop) is active too.
- `div.multiselect > ul.options > li.disabled`
  - `background: var(--sms-li-disabled-bg, light-dark(#f5f5f6, #2a2a2a))`
  - `color: var(--sms-li-disabled-text, light-dark(#b8b8b8, #666))`
- `div.multiselect > ul.options > li.select-all`
  - `border-bottom: var(--sms-select-all-border-bottom, 1px solid light-dark(lightgray, #555))`
  - `font-weight: var(--sms-select-all-font-weight, 500)`
  - `color: var(--sms-select-all-color, inherit)`
  - `background: var(--sms-select-all-bg, transparent)`
  - `margin-bottom: var(--sms-select-all-margin-bottom, 2pt)`
  - `background (hover): var(--sms-select-all-hover-bg, ...)`: Falls back to `--sms-li-active-bg`, then `--sms-active-color`.
- `div.multiselect > ul.options > li.group-header`
  - `font-weight: var(--sms-group-header-font-weight, 600)`
  - `font-size: var(--sms-group-header-font-size, 0.9em)`
  - `color: var(--sms-group-header-color, light-dark(#666, #aaa))`
  - `background: var(--sms-group-header-bg, transparent)`
  - `padding: var(--sms-group-header-padding, 2pt 1ex)`
  - `text-transform: var(--sms-group-header-text-transform, uppercase)`
  - `letter-spacing: var(--sms-group-header-letter-spacing, 0.5px)`
  - `margin-top: var(--sms-group-header-margin-top, 4pt)`: All but the first header.
  - `border-top: var(--sms-group-header-border-top, 1px solid light-dark(#eee, #333))`: All but the first header.
  - `background (hover): var(--sms-group-header-hover-bg, light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05)))`: Collapsible headers on hover.
  - `background (sticky): var(--sms-group-header-sticky-bg, ...)`: With `sticky_group_headers`. Falls back to `--sms-options-bg`.
- `div.multiselect > ul.options > li` (grouped options)
  - `padding-left: var(--sms-group-item-padding-left, var(--sms-group-option-indent, 1.5ex))`: Indent of grouped options.
- Group chevron icon
  - `transition: transform var(--sms-group-collapse-duration, 0.15s) ease-out`: Rotation of the collapse chevron.
- Group "Select/Deselect All" button
  - `background (hover): var(--sms-group-select-all-hover-bg, light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1)))`: On hover.
  - `color (deselect): var(--sms-group-deselect-color, light-dark(#c44, #f77))`: Once all group options are selected and the button deselects.
- `::highlight(sms-search-matches)`: The matched text in dropdown options with `highlight_matches`. It [can't read CSS variables](https://stackoverflow.com/a/56799215), so style it with a rule:

  ```css
  ::highlight(sms-search-matches) {
    color: orange;
    background: rgba(0, 0, 0, 0.15);
    text-decoration: underline;
  }
  ```

### With CSS frameworks

Pass classes for frameworks like [Tailwind CSS](https://tailwindcss.com) through the `*_props` objects under [Inner Element Props](#inner-element-props). Where they land:

```svelte
<div class="multiselect {class}">
  <ul {...ul_selected_props} class="selected {ul_selected_props.class}">
    <li {...li_selected_props}>Selected 1</li>
    <li {...li_selected_props}>Selected 2</li>
  </ul>
  <input {...input_props} />
  <span {...max_select_msg_props} class="max-select-msg {max_select_msg_props.class}">2/5</span>
  <ul {...ul_options_props} class="options {ul_options_props.class}">
    <li {...li_select_all_props} class="select-all {li_select_all_props.class}">Select all</li>
    <li {...li_option_props}>Option 1</li>
    <li {...li_option_props} class="{li_option_props.class} active">
      Option 2 (currently active)
    </li>
    ...
    <li {...li_user_msg_props} class="user-msg {li_user_msg_props.class} active">
      Create this option...
    </li>
  </ul>
</div>
```

### With global CSS

These `:global()` selectors reach every part of the component. `ul.selected` holds the selected chips inside the input, `ul.options` the dropdown. See also the [simplified DOM structure](#styling).

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
