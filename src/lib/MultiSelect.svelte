<!-- eslint-disable-next-line @stylistic/quotes -- TS generics require string literals -->
<script lang="ts" generics="Option extends import('./types').Option">
  // === Imports ===
  import { tick, untrack } from 'svelte'
  import { flip } from 'svelte/animate'
  import { fromAction } from 'svelte/attachments'
  import type { FocusEventHandler } from 'svelte/elements'
  import { SvelteSet } from 'svelte/reactivity'
  import { click_outside, highlight_matches } from './attachments/index'
  import CircleSpinner from './CircleSpinner.svelte'
  import Icon from './Icon.svelte'
  import { ChevronDown, ChevronExpand, ChevronRight, Cross, Disabled } from './icons'
  import { portal_action } from './portal'
  import type {
    GroupedOptions,
    KeyboardShortcuts,
    LoadOptionsConfig,
    MultiSelectProps,
    SelectAllScope,
  } from './types'
  import * as utils from './utils'
  import Wiggle from './Wiggle.svelte'

  // === Props ===
  let {
    activeIndex = $bindable(null),
    activeOption = $bindable(null),
    activeOptionFallbackKey: active_option_fallback_key,
    autoActiveFirstOption = false,
    createOptionMsg = `Create this option...`,
    allowUserOptions = false,
    allowEmpty = false,
    autocomplete = `off`,
    autoScroll = true,
    breakpoint = 800,
    defaultDisabledTitle = `This option is disabled`,
    disabled = false,
    disabledInputTitle = `This input is disabled`,
    duplicateOptionMsg = `This option is already selected`,
    duplicates = false,
    keepSelectedInDropdown = false,
    key = (opt) => utils.get_option_key(opt),
    filterFunc = (opt, searchText) =>
      !searchText || text_matches(searchText, `${utils.get_label(opt)}`),
    fuzzy = true,
    closeDropdownOnSelect = false,
    form_input = $bindable(null),
    formSerialize: form_serialize = (selected) => JSON.stringify(selected),
    highlightMatches = true,
    id = null,
    input = $bindable(null),
    inputClass = ``,
    inputProps = {},
    inputStyle = null,
    inputmode = null,
    invalid = $bindable(false),
    liActiveOptionClass = ``,
    liActiveUserMsgClass = ``,
    liOptionClass = ``,
    liOptionStyle = null,
    liSelectedClass = ``,
    liSelectedStyle = null,
    liUserMsgClass = ``,
    loading = false,
    matchingOptions = $bindable([]),
    maxOptions,
    virtualList = false,
    maxSelect = $bindable(null),
    maxSelectMsg = (current, max) => (max > 1 ? `${current}/${max}` : ``),
    maxSelectMsgClass = ``,
    maxVisibleChips = null,
    name = null,
    noMatchingOptionsMsg = `No matching options`,
    open = $bindable(false),
    dismiss_on = `press`,
    options = $bindable(),
    outerDiv = $bindable(null),
    outerDivClass = ``,
    parseLabelsAsHtml = false,
    pattern = null,
    placeholder = null,
    removeAllTitle = `Remove all`,
    removeBtnTitle = `Remove`,
    minSelect = null,
    required = false,
    resetFilterOnAdd = true,
    parse_paste,
    searchText = $bindable(``),
    value = $bindable(null),
    selected = $bindable(
      value !== null && value !== undefined
        ? Array.isArray(value)
          ? value
          : [value]
        : (options
            ?.filter((opt) => typeof opt === `object` && opt !== null && opt?.preselected)
            .slice(0, maxSelect ?? undefined) ?? []),
    ),
    sortSelected = false,
    selectedOptionsDraggable = !sortSelected,
    selectedDisplay: selected_display = `chips`,
    style = null,
    ulOptionsClass = ``,
    ulSelectedClass = ``,
    ulSelectedStyle = null,
    ulOptionsStyle = null,
    expandIcon,
    expandIconPosition = `left`,
    selectedItem,
    children,
    removeIcon,
    beforeInput,
    afterInput,
    spinner,
    disabledIcon,
    option,
    userMsg,
    onblur,
    onclick,
    onfocus,
    oninput,
    onkeydown,
    onkeyup,
    onmousedown,
    onmouseenter,
    onmouseleave,
    ontouchcancel,
    ontouchend,
    ontouchmove,
    ontouchstart,
    onadd,
    oncreate,
    onremove,
    onremoveAll,
    onchange,
    onopen,
    onclose,
    onselectAll,
    onrangeSelect,
    onreorder,
    portal: portal_params = {},
    selectAllOption = false,
    selectAllScope = `visible`,
    selectAllDisabledTitle,
    liSelectAllClass = ``,
    loadOptions,
    selectedFlipParams = { duration: 100 },
    // === Grouping ===
    collapsibleGroups = false,
    collapsedGroups = $bindable(new Set<string>()),
    groupSelectAll = false,
    ungroupedPosition = `first`,
    groupSortOrder = `none`,
    searchExpandsCollapsedGroups = false,
    searchMatchesGroups = false,
    keyboardExpandsCollapsedGroups = false,
    stickyGroupHeaders = false,
    liGroupHeaderClass = ``,
    liGroupHeaderStyle = null,
    groupHeader,
    ongroupToggle,
    oncollapseAll,
    onexpandAll,
    onsearch,
    onmaxreached,
    onduplicate,
    onparsed_paste,
    onactivate,
    collapseAllGroups = $bindable(),
    expandAllGroups = $bindable(),
    shortcuts = {},
    // Selection history for undo/redo (enabled by default, set to false or 0 to disable)
    history = true,
    undo = $bindable(),
    redo = $bindable(),
    canUndo = $bindable(false),
    canRedo = $bindable(false),
    onundo,
    onredo,
    rangeSelect = false,
    ...rest
  }: MultiSelectProps<Option> = $props()

  // === Config normalization ===
  // ARIA combobox ids; `$props.id()` survives hydration when the caller omits `id`
  const unique_id = $props.id()
  const base_id = $derived(id ?? `sms-${unique_id}`)
  const listbox_id = $derived(`${base_id}-listbox`)
  const input_display = $derived(selected_display === `input` && maxSelect === 1)
  const multi_select = $derived(maxSelect === null || maxSelect > 1) // can hold 2+ selections

  // Shared fuzzy/substring text matching (used by the default filterFunc and group-name matching)
  const text_matches = (search: string, target: string): boolean =>
    fuzzy
      ? utils.fuzzy_match(search, target)
      : target.toLowerCase().includes(search.toLowerCase())

  // Platform detection for keyboard shortcuts (Mac uses Cmd, others use Ctrl)
  const is_mac =
    typeof navigator !== `undefined` && /Mac|iPhone|iPad|iPod/u.test(navigator.userAgent)
  const mod_key = is_mac ? `meta` : `ctrl`

  // Default shortcuts
  const default_shortcuts: KeyboardShortcuts = {
    select_all: null,
    clear_all: `${mod_key}+backspace`,
    open: null,
    close: null,
    undo: `${mod_key}+z`,
    redo: `${mod_key}+shift+z`,
  }
  const effective_shortcuts = $derived({ ...default_shortcuts, ...shortcuts })

  // Extract loadOptions config into single derived object (supports both simple function and config object)
  const load_options_config = $derived.by(() => {
    if (!loadOptions) return null
    const load_config: LoadOptionsConfig<Option> =
      typeof loadOptions === `function` ? { fetch: loadOptions } : loadOptions
    return {
      fetch: load_config.fetch,
      debounce_ms: load_config.debounceMs ?? 300,
      batch_size: load_config.batchSize ?? 50,
      should_fetch_on_open: load_config.onOpen ?? true,
    }
  })

  // === Selection and value sync ===
  // Sync selected ↔ value bidirectionally. Use untrack to prevent each effect from
  // reacting to changes in the "destination" value, and utils.values_equal to prevent
  // infinite loops with reactive wrappers that clone arrays. See issue #309.
  $effect.pre(() => {
    const new_value = maxSelect === 1 ? (selected[0] ?? null) : selected
    const old_value = untrack(() => value)
    if (!utils.values_equal(old_value, new_value)) value = new_value
  })
  $effect.pre(() => {
    const new_selected = Array.isArray(value)
      ? value
      : maxSelect === 1 && value != null
        ? [value]
        : []
    const old_selected = untrack(() => selected)
    if (!utils.values_equal(old_selected, new_selected)) selected = new_selected
  })

  let should_wiggle = $state(false) // controls wiggle animation when user tries to exceed maxSelect
  let should_ignore_hover = $state(false) // ignore mouseover during keyboard navigation to prevent scroll-triggered hover
  let highlighted_idx: number | null = $state(null) // index of highlighted selected item for arrow key navigation
  // rangeSelect anchor bookkeeping. A plain (non-$state) var since it's only read inside
  // event handlers, never in the template or a derived. Note the anchor can't be matched
  // by reference: matchingOptions is $bindable, so its elements are re-proxied and never
  // === the caller's objects. That's why is_same_option compares key + label. idx is the
  // last known position, a hint for relocating the option after the list shifts.
  let range_anchor: { option: Option; idx: number | null } | null = null

  // maxVisibleChips: chips beyond the limit collapse into a "+N more" toggle.
  // chip_limit normalizes invalid values to null (error logged in the validation
  // effect) so they can't leak a nonsensical "+N more" chip into the template.
  let is_chip_list_expanded = $state(false)
  const chip_limit = $derived(
    maxVisibleChips !== null && Number.isInteger(maxVisibleChips) && maxVisibleChips >= 0
      ? maxVisibleChips
      : null,
  )
  const visible_chips = $derived(
    chip_limit !== null && !is_chip_list_expanded
      ? selected.slice(0, chip_limit)
      : selected,
  )
  const hidden_chip_count = $derived(selected.length - visible_chips.length)
  // keyboard chip navigation must never highlight an unrendered chip — auto-expand
  $effect(() => {
    if (highlighted_idx === null) return
    if (chip_limit !== null && highlighted_idx >= chip_limit) is_chip_list_expanded = true
    // Clamp when selected changes externally (undo/redo, parent prop, select_all)
    if (highlighted_idx >= selected.length) {
      highlighted_idx = selected.length > 0 ? selected.length - 1 : null
    }
  })

  // Carries an id, not just text: assigning the same string twice leaves the live
  // region's content unchanged, so a repeated identical message (two equal-sized range
  // selections in a row, say) would never be announced. The id keys the rendered node.
  let last_announcement = $state<{ text: string; id: number } | null>(null)
  let announcement_count = 0
  const announce = (text: string) => {
    last_announcement = { text, id: ++announcement_count }
  }
  const announce_bulk = (count: number, verb: `selected` | `removed`) =>
    announce(`${count} option${count === 1 ? `` : `s`} ${verb}`)

  // Clear after announcement so option counts can be announced again.
  $effect(() => {
    if (!last_announcement) return
    const timer = setTimeout(() => (last_announcement = null), 1000)
    return () => clearTimeout(timer)
  })

  // History tracking for undo/redo
  const max_history = $derived(
    history === true
      ? 50
      : typeof history === `number` && Number.isFinite(history)
        ? Math.max(0, Math.floor(history))
        : 0,
  )
  let history_stack = $state<Option[][]>([])
  let history_index = $state(-1) // -1 = no history yet
  let prev_selected: Option[] | null = null // null = uninitialized, sync on first run

  // Track changes to selected via $effect (catches internal + external changes)
  $effect(() => {
    // Disabled unless max_history > 0 (handles false, 0, negative, non-finite inputs)
    if (!(max_history > 0)) {
      // Clear history when disabled so re-enabling starts fresh
      history_stack = []
      history_index = -1
      // Don't read `selected` here to avoid creating unnecessary reactive dependency
      prev_selected = null
      return
    }
    // Initialize prev_selected on first run to avoid phantom undo from [] → initial selection
    if (prev_selected === null) {
      prev_selected = [...selected]
      return
    }
    // Ignore duplicate reactive updates.
    if (utils.values_equal(selected, prev_selected)) return

    const next_stack = history_stack.slice(0, history_index + 1)
    if (next_stack.length === 0) next_stack.push([...prev_selected])
    next_stack.push([...selected])
    history_stack = next_stack.slice(-max_history)
    history_index = history_stack.length - 1
    prev_selected = [...selected]
  })

  // keep the bindable canUndo/canRedo props in sync
  $effect(() => {
    canUndo = max_history > 0 && !disabled && history_index > 0
    canRedo = max_history > 0 && !disabled && history_index < history_stack.length - 1
  })

  function move_history(offset: -1 | 1, callback: typeof onundo) {
    const next_index = history_index + offset
    if (
      max_history <= 0 ||
      disabled ||
      next_index < 0 ||
      next_index >= history_stack.length
    )
      return false
    const previous = [...selected]
    history_index = next_index
    selected = [...history_stack[history_index]]
    prev_selected = [...selected] // sync tracker to prevent $effect re-recording
    callback?.({ previous, current: selected })
    return true
  }

  undo = () => move_history(-1, onundo)
  redo = () => move_history(1, onredo)

  // Debounced onsearch event - fires 150ms after search text stops changing
  let search_initialized = false
  $effect(() => {
    const current_search = searchText
    // Skip initial mount - only fire on actual user input
    if (!search_initialized) {
      search_initialized = true
      return
    }
    if (!onsearch) return // cleanup handles any pending timer

    const timer = setTimeout(() => {
      // Optional chaining in case onsearch is removed while timer is pending
      onsearch?.({ searchText: current_search, matchingOptions })
    }, 150)
    return () => clearTimeout(timer)
  })

  // Internal state for loadOptions feature
  let loaded_options = $state<Option[]>([])
  let [load_options_has_more, is_loading_options] = $state([true, false])
  let load_options_last_search: string | null = $state(null) // null = nothing dispatched yet
  let load_request_id = 0 // monotonic counter to invalidate stale in-flight fetches
  let load_abort_controller: AbortController | null = null
  let previous_load_options_fetch: LoadOptionsConfig<Option>[`fetch`] | null = null
  let auto_fill_count = 0
  const MAX_AUTO_FILL_ROUNDS = 20

  // === Derived collections and indexing ===
  let has_search_text = $derived(searchText.trim().length > 0)
  // Cache selected labels to avoid repeated .map() calls (keys are mapped once into the Set below)
  let selected_labels = $derived(selected.map((opt) => utils.get_label(opt)))
  let input_committed_label = $derived(
    input_display && selected[0] !== undefined ? `${utils.get_label(selected[0])}` : null,
  )
  let input_text_is_committed = $derived(
    input_display && searchText === input_committed_label,
  )
  let show_all_input_options = $state(false)
  // whitespace-only input maps to `` (it previously filtered out every option while
  // also suppressing the no-match message = blank dropdown); non-blank input stays
  // raw so filterFunc/loadOptions/highlighting receive exactly what the user typed
  let effective_filter_text = $derived(
    input_text_is_committed || show_all_input_options || !has_search_text
      ? ``
      : searchText,
  )

  // Check if option matches search text (label or optionally group name)
  const matches_search = (opt: Option, search: string): boolean =>
    filterFunc(opt, search) ||
    (searchMatchesGroups &&
      Boolean(search) &&
      utils.has_group(opt) &&
      text_matches(search, opt.group))

  // `options` and `loadOptions` compose instead of competing: local options are filtered
  // client-side and lead the list, so they render with no debounce and no request while
  // remote batches append behind them (e.g. PageSearch matching routes as you type).
  let effective_options = $derived.by(() => {
    const local_options = options ?? []
    if (!load_options_config) return local_options
    const local_matches = local_options.filter((opt) =>
      matches_search(opt, effective_filter_text),
    )
    return [...local_matches, ...loaded_options]
  })
  let form_value = $derived.by(() => {
    // input mode intentionally submits the visible text, committed or draft
    // (free-text combobox contract, pinned by tests)
    if (input_display) return has_search_text ? searchText : null
    return selected.length >= Number(required) ? form_serialize(selected) : null
  })
  let prev_input_committed_label: string | null = null
  // Keep searchText in sync with committed selections, including external value changes.
  // onbeforeinput calls clear_input_committed_selection(), which clears input_committed_label
  // before browser text mutation so this pre-effect only resets stale committed text.
  $effect.pre(() => {
    if (input_committed_label !== null && searchText !== input_committed_label) {
      searchText = input_committed_label
    } else if (
      input_display &&
      input_committed_label === null &&
      prev_input_committed_label !== null &&
      searchText === prev_input_committed_label
    ) {
      searchText = ``
    }
    prev_input_committed_label = input_committed_label
  })
  // has_more check: errors (has_more=false) clear pending state
  let load_options_pending = $derived(
    Boolean(load_options_config) &&
      (is_loading_options ||
        (open &&
          load_options_has_more &&
          (load_options_last_search ?? ``) !== effective_filter_text)),
  )
  // Sets for O(1) lookups (used in template, has_user_message, group_header_state, batch
  // operations). Plain (non-reactive) collections suffice for all these deriveds:
  // they're rebuilt wholesale on change, never mutated in place.
  let selected_keys_set = $derived(new Set(selected.map((opt) => key(opt))))
  // Selected labels normalized to strings (numeric labels like 123 match "123"),
  // lowercased when duplicates='case-insensitive' — for duplicate detection
  const lower_dupes = $derived(duplicates === `case-insensitive`)
  const norm_label = (label: unknown) =>
    lower_dupes ? `${label}`.toLowerCase() : `${label}`
  let selected_labels_set = $derived(new Set(selected_labels.map(norm_label)))
  const is_label_selected = (label: string): boolean =>
    selected_labels_set.has(norm_label(label))
  const is_option_selected = (opt: Option, label: string | number): boolean =>
    selected_keys_set.has(key(opt)) || (lower_dupes && is_label_selected(`${label}`))

  const is_disabled = (opt: Option): boolean =>
    Boolean(utils.is_object(opt) && opt.disabled)

  // Identity check for bulk/range operations. Compares label too since a custom `key`
  // may deliberately collapse distinct options (e.g. duplicates sharing one key).
  const is_same_option = (opt_a: Option | null | undefined, opt_b: Option): boolean =>
    opt_a != null &&
    key(opt_a) === key(opt_b) &&
    utils.get_label(opt_a) === utils.get_label(opt_b)

  // Check if option index is within the maxOptions visibility limit
  const is_option_visible = (idx: number) => idx >= 0 && idx < visible_navigable_count

  // non-disabled options, limited to those rendered under maxOptions unless
  // skip_visibility_check (collapsed groups select their full contents)
  const get_selectable_options = (
    opts: Option[],
    skip_visibility_check = false,
  ): Option[] =>
    opts.filter(
      (opt) =>
        !is_disabled(opt) &&
        (skip_visibility_check || is_option_visible(navigable_index_map.get(opt) ?? -1)),
    )

  // Group options by their `group` key in the same order used by the dropdown.
  const group_options = (options_to_group: Option[]): GroupedOptions<Option>[] => {
    const groups_map = new Map<string, Option[]>()
    const ungrouped: Option[] = []

    for (const opt of options_to_group) {
      if (utils.has_group(opt)) {
        const existing = groups_map.get(opt.group)
        if (existing) existing.push(opt)
        else groups_map.set(opt.group, [opt])
      } else {
        ungrouped.push(opt)
      }
    }

    let grouped = [...groups_map.entries()].map(([group, options_in_group]) => ({
      group,
      options: options_in_group,
      collapsed: collapsedGroups.has(group),
    }))

    if (groupSortOrder && groupSortOrder !== `none`) {
      grouped = grouped.toSorted((group_a, group_b) => {
        if (typeof groupSortOrder === `function`) {
          return groupSortOrder(group_a.group, group_b.group)
        }
        const cmp = group_a.group.localeCompare(group_b.group)
        return groupSortOrder === `desc` ? -cmp : cmp
      })
    }

    if (ungrouped.length === 0) return grouped

    const ungrouped_entry = {
      group: null,
      options: ungrouped,
      collapsed: false,
    }
    return ungroupedPosition === `first`
      ? [ungrouped_entry, ...grouped]
      : [...grouped, ungrouped_entry]
  }
  let grouped_options = $derived(group_options(matchingOptions))
  // Flatten groups for navigation (excludes options in collapsed groups)
  const flatten_navigable = (groups: GroupedOptions<Option>[]): Option[] =>
    groups.flatMap(({ options: group_opts, collapsed }) =>
      collapsed && collapsibleGroups ? [] : group_opts,
    )
  let navigable_options = $derived(flatten_navigable(grouped_options))

  // O(1) index lookups for get_selectable_options. Duplicate option values collapse to
  // their last index, fine here since duplicates are value-interchangeable.
  let navigable_index_map = $derived(
    new Map(navigable_options.map((opt, idx) => [opt, idx])),
  )

  // Number of options rendered in the dropdown: maxOptions hides options
  // beyond the limit, so keyboard navigation must not activate them (otherwise
  // aria-activedescendant would point at a non-existent DOM id and Enter could
  // select an option the user can't see)
  let visible_navigable_count = $derived(
    Math.min(navigable_options.length, maxOptions ?? Infinity),
  )
  const rendered_options = $derived(navigable_options.slice(0, visible_navigable_count))
  // `matching` scope needs the full local option set, which remote loading can't provide
  const matching_scope_unavailable = $derived(
    selectAllScope === `matching` && Boolean(loadOptions),
  )
  const select_all_candidates = $derived(
    (selectAllScope === `matching` && !loadOptions
      ? matchingOptions
      : rendered_options
    ).filter((option_item) => !is_disabled(option_item)),
  )

  // === Virtualized dropdown rendering (flat/ungrouped option lists only) ===
  const virtual_config = $derived.by(() => {
    if (!virtualList) return null
    const { itemHeight: item_height_prop = 30, overscan: overscan_prop = 10 } =
      typeof virtualList === `object` ? virtualList : {}
    // clamp to sane values: itemHeight <= 0 would break the window division
    const item_height =
      Number.isFinite(item_height_prop) && item_height_prop > 0 ? item_height_prop : 30
    const overscan =
      Number.isFinite(overscan_prop) && overscan_prop >= 0 ? overscan_prop : 10
    return { item_height, overscan }
  })
  const has_grouped_options = $derived(
    grouped_options.some(({ group }) => group !== null),
  )
  // Virtualization supports flat and grouped lists (headers become rows of the same
  // itemHeight). stickyGroupHeaders is the exception: a sticky header scrolled out
  // of the render window can't stay pinned, so fall back to full rendering (see
  // console.warn in the validation effect below).
  const is_virtual_list_enabled = $derived(
    Boolean(virtual_config) && !(stickyGroupHeaders && has_grouped_options),
  )
  let warned_virtual_grouped = false // only warn once per component instance
  let options_scroll_top = $state(0)
  let options_client_height = $state(0)
  // happy-dom and SSR report clientHeight 0 — fall back to a 400px viewport estimate
  const virtual_viewport = $derived(
    options_client_height > 0 ? options_client_height : 400,
  )
  // Rows eligible for rendering: group headers interleaved with their options
  // (maxOptions hides options past the limit, collapsed groups keep only their header)
  type RenderRow =
    | { kind: `option`; option: Option; flat_idx: number; render_key: unknown }
    | { kind: `header`; group_idx: number; render_key: unknown }
  // stable symbols as header render keys: can't collide with user option keys.
  // Cache is bounded by distinct group names seen over the component's life, so
  // symbols stay stable when filtering temporarily removes a group.
  const header_key_cache = new Map<string, symbol>()
  const header_key = (group: string): symbol => {
    const header_symbol = header_key_cache.get(group) ?? Symbol(`sms-header-${group}`)
    header_key_cache.set(group, header_symbol)
    return header_symbol
  }
  const render_rows = $derived.by((): RenderRow[] => {
    const rows: RenderRow[] = []
    let flat_idx = 0
    grouped_options.forEach(({ group, options: group_items, collapsed }, group_idx) => {
      if (group !== null) {
        rows.push({ kind: `header`, group_idx, render_key: header_key(group) })
      }
      if (collapsed && collapsibleGroups) return
      group_items.forEach((option_item, local_idx) => {
        if (flat_idx < visible_navigable_count) {
          rows.push({
            kind: `option`,
            option: option_item,
            flat_idx,
            render_key: option_render_keys[group_idx][local_idx],
          })
        }
        flat_idx++
      })
    })
    return rows
  })
  // row index of each navigable option (keyboard auto-scroll needs row offsets,
  // which diverge from flat option indices once header rows are interleaved)
  const option_row_indices = $derived.by(() => {
    const indices: number[] = []
    render_rows.forEach((row, row_idx) => {
      if (row.kind === `option`) indices[row.flat_idx] = row_idx
    })
    return indices
  })
  // Window of row indices [start, end) to render as DOM nodes
  const virtual_window = $derived.by(() => {
    if (!is_virtual_list_enabled || !virtual_config) return null
    const { item_height, overscan } = virtual_config
    // clamp stale scroll offsets (e.g. after filtering shrinks the list) into valid range
    const max_scroll = Math.max(0, render_rows.length * item_height - virtual_viewport)
    const scroll_top = Math.min(options_scroll_top, max_scroll)
    const start = Math.max(0, Math.floor(scroll_top / item_height) - overscan)
    const end = Math.min(
      render_rows.length,
      Math.ceil((scroll_top + virtual_viewport) / item_height) + overscan,
    )
    return { start, end, item_height }
  })
  const render_window = $derived(render_rows.length > 0 ? virtual_window : null)
  const visible_render_rows = $derived(
    render_window
      ? render_rows.slice(render_window.start, render_window.end)
      : render_rows,
  )
  // Measure the dropdown viewport when it opens so the window matches the real
  // scroll area (clientHeight is 0 before open and in happy-dom/SSR)
  $effect(() => {
    if (!is_virtual_list_enabled || !open || !options_list_el) return
    const list_el = options_list_el
    tick().then(() => (options_client_height = list_el.clientHeight))
  })

  // Render keys for the dropdown's keyed {#each}: identical to key(opt) for unique
  // options (keeps DOM nodes stable when the list is filtered) but disambiguates
  // repeated keys (e.g. options=['a', 'a'] or case-variant labels sharing a value)
  // so Svelte can't crash with each_key_duplicate on unsanitized options arrays.
  // Repeat occurrences get stable cached symbols: outside the user key namespace
  // (a string suffix could collide with a real key like 'a-dup-1') and stable
  // across re-derivations so keyed DOM nodes aren't recreated.
  const dup_key_cache = new Map<unknown, symbol[]>()
  // nested arrays aligned with grouped_options: option_render_keys[group_idx][local_idx]
  let option_render_keys = $derived.by(() => {
    const occurrence_counts = new Map<unknown, number>()
    return grouped_options.map(({ options: group_items }) =>
      group_items.map((option_item) => {
        const base_key = key(option_item)
        const occurrence = occurrence_counts.get(base_key) ?? 0
        occurrence_counts.set(base_key, occurrence + 1)
        if (occurrence === 0) return base_key
        const cached = dup_key_cache.get(base_key) ?? []
        cached[occurrence - 1] ??= Symbol(`sms-dup-${occurrence}`)
        dup_key_cache.set(base_key, cached)
        return cached[occurrence - 1]
      }),
    )
  })

  // Pre-computed group header state (avoids repeated calculations in template)
  type GroupHeaderState = {
    all_selected: boolean
    selected_count: number
    selectable: Option[]
  }
  let group_header_state = $derived.by(() => {
    const state = new Map<string, GroupHeaderState>()
    for (const { group, options: group_items, collapsed } of grouped_options) {
      if (group === null) continue
      const selectable = get_selectable_options(group_items, collapsed)
      const all_selected =
        selectable.length > 0 &&
        selectable.every((opt) => selected_keys_set.has(key(opt)))
      const selected_count = keepSelectedInDropdown
        ? group_items.filter((opt) => selected_keys_set.has(key(opt))).length
        : 0
      state.set(group, { all_selected, selected_count, selectable })
    }
    return state
  })

  // === Grouping ===
  // Update collapsedGroups state: 'add' adds groups, 'delete' removes groups, 'set' replaces all
  function update_collapsed_groups(
    action: `add` | `delete` | `set`,
    groups: string | Iterable<string>,
  ) {
    const items = typeof groups === `string` ? [groups] : [...groups]
    if (action === `set`) collapsedGroups = new SvelteSet(items)
    else {
      const updated = new SvelteSet(collapsedGroups)
      for (const group of items) updated[action](group)
      collapsedGroups = updated
    }
  }

  function toggle_group_collapsed(group_name: string) {
    const was_collapsed = collapsedGroups.has(group_name)
    update_collapsed_groups(was_collapsed ? `delete` : `add`, group_name)
    ongroupToggle?.({ group: group_name, collapsed: !was_collapsed })
  }

  // Collapse/expand all groups (exposed via bindable props)
  collapseAllGroups = () => {
    const groups = grouped_options.flatMap(({ group }) => (group === null ? [] : [group]))
    if (groups.length === 0) return
    update_collapsed_groups(`set`, groups)
    oncollapseAll?.({ groups })
  }
  expandAllGroups = () => {
    const groups = [...collapsedGroups]
    if (groups.length === 0) return
    update_collapsed_groups(`set`, [])
    onexpandAll?.({ groups })
  }

  function expand_groups(groups_to_expand: string[]) {
    if (groups_to_expand.length === 0) return
    update_collapsed_groups(`delete`, groups_to_expand)
    for (const group of groups_to_expand) {
      ongroupToggle?.({ group, collapsed: false })
    }
  }

  // Get names of collapsed groups that have matching options
  const get_collapsed_with_matches = () =>
    grouped_options.flatMap(({ group, collapsed }) => (group && collapsed ? [group] : []))

  // Auto-expand collapsed groups when search matches their options. Only reacts
  // to search-text changes (via prev_expand_search + untrack) so a group the
  // user manually collapses mid-search isn't instantly re-expanded.
  let prev_expand_search = ``
  $effect(() => {
    const search = has_search_text ? searchText : ``
    const search_changed = search !== prev_expand_search
    prev_expand_search = search
    if (searchExpandsCollapsedGroups && collapsibleGroups && search && search_changed) {
      untrack(() => expand_groups(get_collapsed_with_matches()))
    }
  })

  // Normalize placeholder prop (supports string or { text, persistent } object)
  const placeholder_text = $derived(
    typeof placeholder === `string` ? placeholder : (placeholder?.text ?? null),
  )
  const placeholder_persistent = $derived(
    typeof placeholder === `object` && placeholder?.persistent === true,
  )

  // Sort selected per the sortSelected prop (used by add() and apply_bulk_add())
  function sort_selected(items: Option[]): Option[] {
    if (sortSelected === true) {
      return items.toSorted((opt_1, opt_2) =>
        `${utils.get_label(opt_1)}`.localeCompare(`${utils.get_label(opt_2)}`),
      )
    }
    if (typeof sortSelected === `function`) return items.toSorted(sortSelected)
    return items
  }

  untrack(() => {
    if (!loadOptions && !((options?.length ?? 0) > 0)) {
      if (allowUserOptions || loading || disabled || allowEmpty) {
        options = [] // initializing as array avoids errors when component mounts
      } else {
        console.error(`MultiSelect: received no options`)
      }
    }
  })
  if (maxSelect !== null && maxSelect < 1) {
    console.error(
      `MultiSelect: maxSelect must be null or positive integer, got ${maxSelect}`,
    )
  }
  if (!Array.isArray(selected)) {
    console.error(`MultiSelect: selected prop should always be an array, got ${selected}`)
  }
  $effect(() => {
    if (maxSelect && typeof required === `number` && required > maxSelect) {
      console.error(
        `MultiSelect: maxSelect=${maxSelect} < required=${required}, makes it impossible for users to submit a valid form`,
      )
    }
    if (parseLabelsAsHtml && allowUserOptions) {
      console.warn(
        `MultiSelect: don't combine parseLabelsAsHtml and allowUserOptions. It's susceptible to XSS attacks!`,
      )
    }
    if (sortSelected && selectedOptionsDraggable) {
      console.warn(
        `MultiSelect: sortSelected and selectedOptionsDraggable should not be combined as any ` +
          `user re-orderings of selected options will be undone by sortSelected on component re-renders.`,
      )
    }
    if (selected_display === `input` && maxSelect !== 1) {
      console.error(
        `MultiSelect: selectedDisplay="input" requires maxSelect={1}, got maxSelect=${maxSelect}. ` +
          `Falling back to chip display.`,
      )
    }
    if (allowUserOptions && !createOptionMsg && createOptionMsg !== null) {
      console.error(
        `MultiSelect: allowUserOptions=${allowUserOptions} but createOptionMsg=${createOptionMsg} is falsy. ` +
          `This prevents the "Add option" <span> from showing up, resulting in a confusing user experience.`,
      )
    }
    if (
      maxOptions &&
      (typeof maxOptions !== `number` || maxOptions < 0 || maxOptions % 1 !== 0)
    ) {
      console.error(
        `MultiSelect: maxOptions must be undefined or a positive integer, got ${maxOptions}`,
      )
    }
    if (
      maxVisibleChips !== null &&
      (!Number.isInteger(maxVisibleChips) || maxVisibleChips < 0)
    ) {
      console.error(
        `MultiSelect: maxVisibleChips must be null or a non-negative integer, got ${maxVisibleChips}`,
      )
    }
    // short-circuit keeps has_grouped_options out of this effect's dependencies
    // unless the sticky+virtual combo is on and the warning hasn't fired yet
    if (
      virtualList &&
      stickyGroupHeaders &&
      !warned_virtual_grouped &&
      has_grouped_options
    ) {
      warned_virtual_grouped = true
      console.warn(
        `MultiSelect: virtualList does not support stickyGroupHeaders (a sticky header ` +
          `scrolled out of the render window can't stay pinned). Falling back to ` +
          `non-virtual rendering.`,
      )
    }
  })

  // Resolve createOptionMsg to a string (supports string, function, or null)
  const resolved_create_msg = $derived.by(() => {
    if (createOptionMsg === null || createOptionMsg === undefined) return null
    if (typeof createOptionMsg === `function`) {
      const msg = createOptionMsg({
        searchText,
        selected,
        options: effective_options,
        matchingOptions,
      })
      return msg || null // coerce empty string to null so truthiness checks work
    }
    return createOptionMsg
  })

  // active state of the user-message <li> (dupe / create / no-match)
  let is_user_message_active = $state(false)

  // effective_options is pre-filtered when loading remotely (local options by
  // matches_search, remote batches by the server), so only filter the static list here
  const search_matches = (opt: Option): boolean =>
    Boolean(loadOptions) || matches_search(opt, effective_filter_text)

  $effect.pre(() => {
    matchingOptions = effective_options.filter(
      (opt) =>
        (!selected_keys_set.has(key(opt)) ||
          Boolean(duplicates) ||
          keepSelectedInDropdown ||
          input_text_is_committed) &&
        search_matches(opt),
    )
  })

  // Range selection includes a selected anchor that has left matchingOptions, while
  // preserving the grouped/sorted order and collapsed-group visibility of the dropdown.
  const searched_options = $derived(effective_options.filter(search_matches))
  const range_navigable_options = $derived(
    flatten_navigable(group_options(searched_options)),
  )

  // plain (non-reactive) trackers: the effect below compares against the previous run
  let previous_active_index = activeIndex
  let previous_active_option = activeOption
  // svelte-ignore state_referenced_locally
  let previous_filter_text = effective_filter_text

  // Keep active state valid and preserve option identity across regrouping/refreshes.
  $effect(() => {
    if (is_user_message_active) {
      if (has_user_message) activeIndex = visible_navigable_count
      else {
        is_user_message_active = false
        activeIndex = null
      }
    }
    if (
      activeIndex !== null &&
      !is_user_message_active &&
      (navigable_options[activeIndex] === undefined ||
        activeIndex >= visible_navigable_count)
    ) {
      activeIndex = null
    }
    const index_changed = activeIndex !== previous_active_index
    const option_changed = activeOption !== previous_active_option
    const filter_changed = effective_filter_text !== previous_filter_text
    if (!index_changed && (!filter_changed || option_changed) && activeOption !== null) {
      const previous_option = activeOption
      let preserved_idx =
        activeIndex !== null &&
        Object.is(rendered_options[activeIndex], previous_option) &&
        !is_disabled(previous_option)
          ? activeIndex
          : rendered_options.findIndex(
              (candidate) =>
                Object.is(candidate, previous_option) && !is_disabled(candidate),
            )
      const find_unique_idx = (get_key: (option: Option) => unknown) => {
        const active_key = get_key(previous_option)
        let matching_idx = -1
        for (const [candidate_idx, candidate] of rendered_options.entries()) {
          if (get_key(candidate) !== active_key || is_disabled(candidate)) continue
          if (matching_idx !== -1) return -1
          matching_idx = candidate_idx
        }
        return matching_idx
      }
      if (preserved_idx === -1) preserved_idx = find_unique_idx(key)
      if (preserved_idx === -1 && active_option_fallback_key)
        preserved_idx = find_unique_idx(active_option_fallback_key)
      activeIndex = preserved_idx === -1 ? null : preserved_idx
    }
    const current_option = rendered_options[activeIndex ?? -1]
    const should_auto_activate =
      activeIndex === null ||
      (!is_user_message_active &&
        (current_option === undefined || is_disabled(current_option))) ||
      (filter_changed && !option_changed)
    if (autoActiveFirstOption && should_auto_activate) {
      const first_enabled_idx = rendered_options.findIndex(
        (candidate) => !is_disabled(candidate),
      )
      activeIndex = first_enabled_idx === -1 ? null : first_enabled_idx
      if (first_enabled_idx !== -1) is_user_message_active = false
    }
    activeOption = is_user_message_active
      ? null
      : (navigable_options[activeIndex ?? -1] ?? null)
    previous_active_index = activeIndex
    previous_active_option = activeOption
    previous_filter_text = effective_filter_text
  })

  // Whether the options <ul> is in the DOM at all — aria-controls must not
  // reference a non-existent id (mirrors the template's render condition)
  const listbox_rendered = $derived(
    Boolean(
      (has_search_text && noMatchingOptionsMsg) ||
      effective_options.length ||
      loadOptions,
    ),
  )

  // Selected chips are plain list items, so left/right chip highlighting stays visual.
  const user_message_id = $derived(`${base_id}-user-msg`)
  const active_option_id = $derived(
    is_user_message_active
      ? user_message_id
      : activeIndex !== null && activeIndex < navigable_options.length
        ? `${base_id}-opt-${activeIndex}`
        : undefined,
  )

  // false once removing would drop selected below minSelect
  const can_remove = $derived(minSelect === null || selected.length > minSelect)
  // maxSelect = 1 replaces the current option instead of blocking, so it never counts
  // as at-capacity (used by add() and paste; re-evaluated after async oncreate resolves)
  const at_max_capacity = () =>
    maxSelect !== null && maxSelect !== 1 && selected.length >= maxSelect

  // Merge per-option style (string or {option, selected} object) with the li*Style prop
  const merge_styles = (
    opt: Option,
    style_key: `selected` | `option`,
    extra_style: string | null,
  ) => [utils.get_style(opt, style_key), extra_style].filter(Boolean).join(` `) || null

  function get_option_view(option_item: Option, flat_idx: number) {
    const {
      label,
      disabled: option_disabled = null,
      title = null,
      selectedTitle = null,
      disabledTitle = defaultDisabledTitle,
    } = utils.is_object(option_item) ? option_item : { label: option_item }
    return {
      disabled: option_disabled,
      title,
      selectedTitle,
      disabledTitle,
      active: activeIndex === flat_idx,
      selected: is_option_selected(option_item, label),
      style: merge_styles(option_item, `option`, liOptionStyle),
    }
  }

  // === Selection mutations ===
  // toggle an option between selected and unselected states (for keepSelectedInDropdown mode)
  function toggle_option(option_to_toggle: Option, event: Event) {
    const is_currently_selected = selected_keys_set.has(key(option_to_toggle))

    if (is_currently_selected) {
      if (can_remove) remove(option_to_toggle, event)
    } else void add(option_to_toggle, event)
  }

  // true while an async oncreate callback is pending, blocks further create attempts
  let creating_option = $state(false)

  // from_paste: when true, skip option reconstruction so parse_paste() objects
  // are preserved as-is (extra fields like value/group/metadata aren't stripped)
  async function add(option_to_add: Option, event: Event, from_paste = false) {
    event.stopPropagation()
    if (
      !isNaN(Number(option_to_add)) &&
      (typeof option_to_add !== `string` || option_to_add.trim().length > 0) &&
      typeof selected_labels[0] === `number`
    ) {
      option_to_add = Number(option_to_add) as Option
    }

    // dupe check by key (not reference — Svelte proxies break identity); the label check
    // additionally applies to user-typed options, or to all when duplicates='case-insensitive'
    const option_key = key(option_to_add)
    const is_from_options = effective_options.some((opt) => key(opt) === option_key)
    const check_label = duplicates === `case-insensitive` || !is_from_options
    // closure so the guard can be re-evaluated after an async oncreate resolves
    const is_dupe = () =>
      selected_keys_set.has(key(option_to_add)) ||
      (check_label && is_label_selected(`${utils.get_label(option_to_add)}`))
    const is_duplicate = is_dupe()
    const max_reached = at_max_capacity()
    // Fire events for blocked add attempts (redundant null check narrows maxSelect for TS)
    if (max_reached && maxSelect !== null) {
      should_wiggle = true
      onmaxreached?.({ selected, maxSelect, attemptedOption: option_to_add })
    }
    if (is_duplicate && duplicates !== true) onduplicate?.({ option: option_to_add })

    if (max_reached || (duplicates !== true && is_duplicate)) return
    if (
      !is_from_options && // first check if we find option in the options list
      // this has the side-effect of not allowing to user to add the same
      // custom option twice in append mode
      [true, `append`].includes(allowUserOptions) &&
      (has_search_text || from_paste)
    ) {
      if (!(from_paste && typeof option_to_add === `object`)) {
        const label_text = from_paste ? `${utils.get_label(option_to_add)}` : searchText
        if (typeof effective_options[0] === `object`) {
          option_to_add = { label: label_text } as Option
        } else if (
          [`number`, `undefined`].includes(typeof effective_options[0]) &&
          label_text.trim().length > 0 &&
          !isNaN(Number(label_text))
        ) {
          option_to_add = Number(label_text) as Option
        } else {
          option_to_add = label_text as Option
        }
      }
      // Fire oncreate — return false to reject, return Option to transform
      if (creating_option) return // ignore create attempts while an async oncreate is pending
      type CreateResult = false | Option | undefined
      let oncreate_result: CreateResult
      let was_async = false
      try {
        const raw_result = oncreate?.({ option: option_to_add })
        // await thenables (not just native Promises) so results from non-native
        // promise implementations aren't added as option objects
        if (typeof (raw_result as PromiseLike<unknown>)?.then === `function`) {
          was_async = true
          creating_option = true
          try {
            oncreate_result = await (raw_result as PromiseLike<CreateResult>)
          } finally {
            creating_option = false
          }
        } else oncreate_result = raw_result as CreateResult
      } catch (error) {
        // sync throws are caught too: add() is async, so an uncaught throw would
        // surface as an unhandled rejection in non-awaiting event handlers
        const failure = was_async ? `promise rejected` : `threw`
        console.error(`MultiSelect: oncreate ${failure}:`, error)
        return
      }
      if (oncreate_result === false) return
      if (is_non_empty_option(oncreate_result)) option_to_add = oncreate_result
      // re-check guards after awaiting: selected may have changed meanwhile
      if (was_async && (at_max_capacity() || (is_dupe() && duplicates !== true))) {
        return
      }
      if (allowUserOptions === `append`) {
        if (load_options_config) loaded_options = [...loaded_options, option_to_add]
        else options = [...(options ?? []), option_to_add]
      }
    }

    if (!is_non_empty_option(option_to_add)) {
      console.error(`MultiSelect: encountered falsy option`, option_to_add)
      return
    }
    if (input_display) searchText = `${utils.get_label(option_to_add)}`
    else if (resetFilterOnAdd) searchText = ``
    // for maxSelect = 1 we always replace current option with new one
    selected =
      maxSelect === 1 ? [option_to_add] : sort_selected([...selected, option_to_add])

    clear_validity()
    handle_dropdown_after_select(event)
    announce(`${utils.get_label(option_to_add)} selected`)
    onadd?.({ option: option_to_add, selected })
    onchange?.({ option: option_to_add, type: `add` })
  }

  // at_idx overrides findIndex lookup so duplicates=true removes the correct occurrence
  function remove(option_to_drop: Option, event: Event, at_idx?: number) {
    event.stopPropagation()
    if (selected.length === 0) return
    highlighted_idx = null

    const idx = at_idx ?? selected.findIndex((opt) => key(opt) === key(option_to_drop))
    let option_removed = selected[idx]

    if (option_removed === undefined && allowUserOptions) {
      // if option with label could not be found but allowUserOptions is truthy,
      // assume it was created by user and create corresponding option object
      // on the fly for use as event payload
      const is_object_option = typeof effective_options[0] === `object`
      option_removed = (
        is_object_option ? { label: option_to_drop } : option_to_drop
      ) as Option
    }
    if (option_removed === undefined) {
      console.error(
        `MultiSelect: can't remove option ${JSON.stringify(option_to_drop)}, not found in selected list`,
      )
      return
    }

    selected = selected.filter((_, remove_idx) => remove_idx !== idx)
    clear_validity()
    announce(`${utils.get_label(option_removed)} removed`)
    onremove?.({ option: option_removed, selected })
    onchange?.({ option: option_removed, type: `remove` })
  }

  function open_dropdown(event: Event, focus_input = true, stop_propagation = true) {
    if (stop_propagation) event.stopPropagation()

    if (disabled) return
    const clicked_expand_icon =
      event.target instanceof Element && event.target.closest(`.expand-icon`)
    if (clicked_expand_icon) {
      if (open) return close_dropdown(event) // expand icon toggles the dropdown
      if (input_display) show_all_input_options = true
    }
    if (open) return
    open = true
    if (focus_input && !(event instanceof FocusEvent)) {
      // avoid double-focusing input when event that opened dropdown was already input FocusEvent
      input?.focus()
    }
    onopen?.({ event })
  }

  let suppress_next_focus_open = false

  function focus_input_without_open(only_if_internal = false) {
    const active_element = document.activeElement
    const focus_is_internal =
      active_element instanceof Node &&
      (outerDiv?.contains(active_element) || options_list_el?.contains(active_element))
    if (!input || active_element === input || (only_if_internal && !focus_is_internal))
      return
    suppress_next_focus_open = true
    try {
      input.focus()
    } finally {
      suppress_next_focus_open = false
    }
  }

  function close_dropdown(event: Event, retain_focus = false) {
    if (!open) return
    const focus_before_onclose = document.activeElement
    open = false
    show_all_input_options = false
    if (!retain_focus) input?.blur()
    activeIndex = null
    is_user_message_active = false
    onclose?.({ event })
    const active_element = document.activeElement
    const focus_changed_by_onclose = active_element !== focus_before_onclose
    if (retain_focus && !focus_changed_by_onclose) {
      focus_input_without_open()
      tick().then(() => focus_input_without_open(true))
    }
  }

  function clear_validity() {
    invalid = false
    form_input?.setCustomValidity(``)
  }

  // close dropdown and (in chip mode) clear the search draft — Escape/Tab + close shortcut
  function close_and_clear(event: Event) {
    close_dropdown(event)
    if (!input_display) searchText = ``
  }

  function handle_invalid() {
    invalid = true
    const min_required = Number(required)
    const msg =
      maxSelect && maxSelect > 1 && min_required > 1
        ? `Please select between ${required} and ${maxSelect} options`
        : min_required > 1
          ? `Please select at least ${required} options`
          : `Please select an option`
    form_input?.setCustomValidity(msg)
  }

  function handle_dropdown_after_select(event: Event) {
    const reached_max = selected.length >= (maxSelect ?? Infinity)
    const window_width = globalThis.innerWidth
    const should_close =
      closeDropdownOnSelect === true ||
      closeDropdownOnSelect === `retain-focus` ||
      (closeDropdownOnSelect === `if-mobile` && window_width && window_width < breakpoint)
    if (reached_max || should_close) {
      close_dropdown(event, closeDropdownOnSelect === `retain-focus`)
    } else input?.focus()
  }

  const user_message = $derived.by(
    (): { type: `dupe` | `create` | `no-match`; msg: string } | null => {
      if (!has_search_text || input_text_is_committed || show_all_input_options)
        return null
      if (duplicates !== true && is_label_selected(searchText)) {
        // a blank message must not leave a navigable row that blocks the create row
        return duplicateOptionMsg ? { type: `dupe`, msg: duplicateOptionMsg } : null
      }
      if (load_options_pending) return null
      if (allowUserOptions && resolved_create_msg) {
        return { type: `create`, msg: resolved_create_msg }
      }
      return navigable_options.length === 0 && noMatchingOptionsMsg
        ? { type: `no-match`, msg: noMatchingOptionsMsg }
        : null
    },
  )
  const has_user_message = $derived(user_message !== null)

  // === Keyboard and pointer handlers ===
  // Handle arrow key navigation through options (uses navigable_options to skip collapsed groups)
  async function handle_arrow_navigation(direction: 1 | -1, event?: KeyboardEvent) {
    should_ignore_hover = true
    if (rangeSelect) {
      // Anchors on the pre-move position, so an unmodified navigation drops the anchor
      // and the next Shift+Arrow extends from where the cursor now is, not from a range
      // the user has since navigated away from.
      if (!event?.shiftKey) range_anchor = null
      else if (range_anchor === null && activeOption) {
        range_anchor = { option: activeOption, idx: activeIndex }
      }
    }

    if (keyboardExpandsCollapsedGroups && collapsibleGroups && collapsedGroups.size > 0) {
      expand_groups(get_collapsed_with_matches())
      await tick()
    }

    // toggle user message when no options match but user can create
    if (user_message?.type === `create` && navigable_options.length === 0) {
      is_user_message_active = !is_user_message_active
      return
    }
    if (activeIndex === null && navigable_options.length === 0) return // nothing to navigate

    // Navigate rendered, enabled options with wrap-around. The user-message row
    // remains navigable when present.
    const total = visible_navigable_count + (has_user_message ? 1 : 0)
    const start_idx = activeIndex ?? (direction === 1 ? -1 : 0)
    activeIndex = null
    for (let offset = 1; offset <= total; offset++) {
      const next_idx = (start_idx + direction * offset + total) % total
      const is_user_message = has_user_message && next_idx === visible_navigable_count
      const next_option = navigable_options[next_idx]
      if (is_user_message || (next_option !== undefined && !is_disabled(next_option))) {
        activeIndex = next_idx
        break
      }
    }
    if (activeIndex === null) return

    is_user_message_active = has_user_message && activeIndex === visible_navigable_count
    activeOption = is_user_message_active
      ? null
      : (navigable_options[activeIndex] ?? null)

    if (autoScroll) {
      await tick()
      if (
        virtual_window &&
        options_list_el &&
        activeIndex !== null &&
        !is_user_message_active
      ) {
        // In virtual mode the active li may not be rendered: scroll by row offset
        // instead of scrollIntoView. Clamp scroll so the active row lies within
        // [row_bottom - viewport, row_top] (no-op when already in view).
        const { item_height } = virtual_window
        const row_top = (option_row_indices[activeIndex] ?? activeIndex) * item_height
        const next_scroll_top = Math.min(
          Math.max(options_scroll_top, row_top + item_height - virtual_viewport),
          row_top,
        )
        if (next_scroll_top !== options_scroll_top) {
          options_list_el.scrollTop = next_scroll_top
          // scrollTop assignment doesn't fire scroll events in happy-dom, sync state directly
          options_scroll_top = next_scroll_top
        }
      } else
        options_list_el?.querySelector(`li.active`)?.scrollIntoView({ block: `nearest` })
    }

    // Fire onactivate for keyboard navigation only (not mouse hover)
    onactivate?.({ option: activeOption, index: activeIndex })
    if (event?.shiftKey && rangeSelect && activeOption)
      handle_option_interact(activeOption, event, activeIndex)
  }

  function run_shortcut(
    event: KeyboardEvent,
    shortcut_key: keyof KeyboardShortcuts,
    condition: boolean,
    action: () => void,
  ): boolean {
    if (!condition || !utils.matches_shortcut(event, effective_shortcuts[shortcut_key])) {
      return false
    }
    event.preventDefault()
    event.stopPropagation()
    action()
    return true
  }

  // keydown on the search input; option/header rows handle their own keys via
  // if_enter_or_space
  async function handle_keydown(event: KeyboardEvent) {
    if (disabled) return // Block all keyboard handling when disabled
    // Ignore keys while an IME composition is in progress: Enter confirms the
    // composition (not the active option) and arrow keys navigate the IME
    // candidate window, so acting on them would hijack CJK text input
    if (event.isComposing) return
    const chip_navigation_enabled = !input_display && selected.length > 0 && !searchText

    if (
      run_shortcut(
        event,
        `select_all`,
        Boolean(selectAllOption) &&
          navigable_options.length > 0 &&
          maxSelect !== 1 &&
          !matching_scope_unavailable,
        () => select_all(event),
      ) ||
      run_shortcut(event, `clear_all`, chip_navigation_enabled, () =>
        remove_all(event),
      ) ||
      run_shortcut(event, `open`, !open, () => open_dropdown(event)) ||
      run_shortcut(event, `close`, open, () => close_and_clear(event)) ||
      run_shortcut(event, `undo`, canUndo, () => undo?.()) ||
      run_shortcut(event, `redo`, canRedo, () => redo?.())
    )
      return

    // Clear selected-item highlight for any key except arrow/backspace navigation
    if (
      highlighted_idx !== null &&
      ![`ArrowLeft`, `ArrowRight`, `Backspace`].includes(event.key)
    )
      highlighted_idx = null

    if (event.key === `Escape` || event.key === `Tab`) {
      event.stopPropagation()
      close_and_clear(event)
    } else if (event.key === `Enter`) {
      event.stopPropagation()
      event.preventDefault() // prevent enter key from triggering form submission

      // != null (not truthiness) so falsy options like 0 or `` can be selected via Enter
      if (activeOption != null) {
        if (is_disabled(activeOption)) return
        handle_option_interact(activeOption, event, activeIndex)
      } else if (allowUserOptions && has_search_text && !load_options_pending) {
        // user entered text but no options match, so if allowUserOptions is truthy, we create new option
        add(searchText as Option, event)
      } else {
        // no active option and no search text means the options dropdown is closed
        // in which case enter means open it
        open_dropdown(event)
      }
    } else if (event.key === `ArrowLeft` && chip_navigation_enabled) {
      event.preventDefault()
      highlighted_idx =
        highlighted_idx === null ? selected.length - 1 : Math.max(0, highlighted_idx - 1)
    } else if (event.key === `ArrowRight` && highlighted_idx !== null) {
      event.preventDefault()
      highlighted_idx = highlighted_idx < selected.length - 1 ? highlighted_idx + 1 : null
    } else if (event.key === `ArrowDown` || event.key === `ArrowUp`) {
      event.stopPropagation()
      event.preventDefault()
      if (!open) open_dropdown(event, false)
      await handle_arrow_navigation(event.key === `ArrowUp` ? -1 : 1, event)
    } else if (event.key === `Backspace` && chip_navigation_enabled) {
      event.stopPropagation()
      if (can_remove) {
        const prev_highlighted = highlighted_idx
        const target_idx = prev_highlighted ?? selected.length - 1
        const target = selected[target_idx]
        if (target !== undefined) remove(target, event, target_idx)
        if (prev_highlighted !== null) {
          highlighted_idx =
            selected.length === 0 ? null : Math.min(prev_highlighted, selected.length - 1)
        }
      }
    }  // make first matching option active on any keypress while open (if no special case matched)
    else if (open && navigable_options.length > 0 && activeIndex === null) {
      // Don't stop propagation or prevent default here, allow normal character input
      const first_enabled_idx = rendered_options.findIndex(
        (candidate) => !is_disabled(candidate),
      )
      activeIndex = first_enabled_idx === -1 ? null : first_enabled_idx
    }
  }

  function remove_all(event: Event) {
    event.stopPropagation()
    highlighted_idx = null

    // keep the first minSelect items (all removed when minSelect is null)
    const keep_count = minSelect ?? 0
    const removed_options = selected.slice(keep_count)
    if (removed_options.length === 0) return

    selected = selected.slice(0, keep_count)
    searchText = `` // always clear on remove all (resetFilterOnAdd only applies to add operations)
    announce_bulk(removed_options.length, `removed`)
    onremoveAll?.({ options: removed_options })
    onchange?.({ options: selected, type: `removeAll` })
  }

  function apply_bulk_add(options_to_add: Option[], event: Event): Option[] {
    const unselected = get_unique_bulk_options(options_to_add)
    const remaining = Math.max(0, (maxSelect ?? Infinity) - selected.length)
    const added = unselected.slice(0, remaining)
    if (added.length > 0) {
      selected = sort_selected([...selected, ...added])
      if (resetFilterOnAdd) searchText = ``
      clear_validity()
      handle_dropdown_after_select(event)
      announce_bulk(added.length, `selected`)
    }
    if (added.length < unselected.length && maxSelect !== null) {
      should_wiggle = true
      onmaxreached?.({ selected, maxSelect, attemptedOption: unselected[added.length] })
    }
    return added
  }

  // Batch-add options to selection (used by select_all and group select).
  function batch_add_options(
    options_to_add: Option[],
    event: Event,
    scope?: SelectAllScope,
  ) {
    const added = apply_bulk_add(options_to_add, event)
    if (added.length > 0) {
      onselectAll?.({ options: added, scope })
      onchange?.({ options: selected, type: `selectAll` })
    }
  }

  function get_unique_bulk_options(options_to_filter: Option[]): Option[] {
    if (duplicates === true) {
      const remaining_selected = [...selected]
      return options_to_filter.filter((option_item) => {
        if (is_disabled(option_item)) return false
        const selected_idx = remaining_selected.findIndex((selected_option) =>
          is_same_option(selected_option, option_item),
        )
        if (selected_idx === -1) return true
        remaining_selected.splice(selected_idx, 1)
        return false
      })
    }
    const seen_keys = new Set(selected_keys_set)
    const seen_labels = new Set(selected_labels_set)
    return options_to_filter.filter((option_item) => {
      const option_key = key(option_item)
      const option_label = norm_label(utils.get_label(option_item))
      if (
        is_disabled(option_item) ||
        seen_keys.has(option_key) ||
        (lower_dupes && seen_labels.has(option_label))
      )
        return false
      seen_keys.add(option_key)
      seen_labels.add(option_label)
      return true
    })
  }

  // Batch-add options for top-level "Select all" (selectAllScope picks the candidates)
  function select_all(event: Event) {
    event.stopPropagation()
    batch_add_options(select_all_candidates, event, selectAllScope)
  }

  function get_select_all_disabled_title(
    max_reached: boolean,
    all_selectable_selected: boolean,
  ) {
    if (matching_scope_unavailable) {
      return `Matching select-all is only available with local options`
    }
    if (selectAllDisabledTitle === null) return ``
    const default_title =
      max_reached && !all_selectable_selected
        ? `Maximum of ${maxSelect} options selected`
        : `All options already selected`
    return typeof selectAllDisabledTitle === `function`
      ? selectAllDisabledTitle({
          max_reached,
          maxSelect,
          selected_count: selected.length,
        })
      : (selectAllDisabledTitle ?? default_title)
  }

  // Toggle group selection: works even when group is collapsed
  // If all selectable options are selected, deselect them; otherwise select all
  function toggle_group_selection(
    selectable: Option[],
    all_selected: boolean,
    event: Event,
  ) {
    event.stopPropagation()
    if (all_selected) {
      // Deselect options in this group, but never drop below minSelect
      // (consistent with remove_all and per-chip removal)
      const keys_to_remove = new Set(selectable.map((opt) => key(opt)))
      const max_removals =
        minSelect === null ? Infinity : Math.max(0, selected.length - minSelect)
      const removed: Option[] = []
      const kept: Option[] = []
      for (const opt of selected) {
        if (keys_to_remove.has(key(opt)) && removed.length < max_removals) {
          removed.push(opt)
        } else kept.push(opt)
      }
      if (removed.length === 0) return
      selected = kept
      onremoveAll?.({ options: removed })
      onchange?.({ options: selected, type: `removeAll` })
      return
    }
    batch_add_options(selectable, event)
  }

  const is_non_empty_option = (
    candidate: Option | null | undefined,
  ): candidate is Option =>
    candidate !== null && candidate !== undefined && candidate !== ``

  const if_enter_or_space =
    (handler: (event: KeyboardEvent) => void) => (event: KeyboardEvent) => {
      if (event.key === `Enter` || event.code === `Space`) {
        event.preventDefault()
        handler(event)
      }
    }

  // Returns true only when a range was actually selected; false tells the caller to
  // fall back to an ordinary add.
  function select_range(
    target: Option,
    event: Event,
    target_idx_hint?: number | null,
  ): boolean {
    if (!multi_select) return false
    const visible_options = range_navigable_options
    // hint indexes the dropdown rows, an order-preserving subsequence of visible_options,
    // so the real position is at or after it — searching forward from there keeps
    // indistinguishable rows on the clicked occurrence. Scan back only if it overshot.
    const index_of = (option_to_find: Option, hint?: number | null): number => {
      const from = Math.min(hint ?? 0, visible_options.length)
      const match = (idx: number) => is_same_option(visible_options[idx], option_to_find)
      for (let idx = from; idx < visible_options.length; idx++) if (match(idx)) return idx
      for (let idx = from - 1; idx >= 0; idx--) if (match(idx)) return idx
      return -1
    }
    // A row the user can't see (past maxOptions) or that has left the list can't be a
    // range endpoint. Report it unhandled so the caller still performs an ordinary add
    // rather than swallowing the interaction.
    if (!rendered_options.some((item) => is_same_option(item, target))) return false
    const target_idx = index_of(target, target_idx_hint)
    if (target_idx === -1) return false
    const anchor_idx = range_anchor ? index_of(range_anchor.option, range_anchor.idx) : -1
    if (anchor_idx < 0) {
      range_anchor = null
      return false
    }
    event.stopPropagation()
    const candidates = visible_options.slice(
      Math.min(anchor_idx, target_idx),
      Math.max(anchor_idx, target_idx) + 1,
    )
    const added = apply_bulk_add(candidates, event)
    const anchor_option = visible_options[anchor_idx]
    range_anchor = { option: anchor_option, idx: anchor_idx }
    if (added.length > 0) {
      onrangeSelect?.({ added, from: anchor_option, to: target, selected })
      onchange?.({ options: selected, type: `rangeSelect` })
    }
    return true
  }

  // Shared click/keyboard/range entry point for selecting an option
  const handle_option_interact = (
    opt: Option,
    event: MouseEvent | KeyboardEvent,
    option_idx?: number | null,
  ) => {
    if (is_disabled(opt)) return
    // only Shift-click and Shift+Arrow extend a range, not e.g. Shift+Enter
    const extends_range =
      event.shiftKey &&
      (!(`key` in event) || event.key === `ArrowUp` || event.key === `ArrowDown`)
    // select_range reports false when there's no usable anchor, so no need to check here
    if (rangeSelect && extends_range && select_range(opt, event, option_idx)) return
    const selected_before = selected.length
    if (keepSelectedInDropdown && !input_display) toggle_option(opt, event)
    else void add(opt, event)
    if (!rangeSelect) return
    // Anchor only on an add that landed. A rejected one (maxSelect reached, duplicate
    // refused) or a toggle-off leaves no sensible anchor, so drop it rather than let a
    // later Shift+click extend from a stale position. maxSelect===1 replaces without
    // growing selected, but multi_select is false there so ranges never run.
    range_anchor =
      selected.length > selected_before ? { option: opt, idx: option_idx ?? null } : null
  }

  // === Drag, input, and paste handlers ===
  let drag_idx: number | null = $state(null)
  // chip index captured on dragstart: the authoritative drag source. Drops whose
  // text/plain doesn't match a drag started on THIS instance are foreign (dragged
  // page text/links, chips from another MultiSelect) and must not reorder.
  let drag_start_idx: number | null = null
  // event handlers enable dragging to reorder selected options
  const on_chip_drop = (target_idx: number) => (event: DragEvent) => {
    if (!event.dataTransfer) return
    event.dataTransfer.dropEffect = `move`
    // parseInt yields NaN for empty/foreign drag data; Number('') → 0 would move item 0
    // oxlint-disable-next-line unicorn/prefer-number-coercion
    const start_idx = parseInt(event.dataTransfer.getData(`text/plain`), 10)
    // Reject foreign drops: NaN/mismatched data never equals the index captured on
    // dragstart (which also rules out NaN and negatives). The length check guards
    // against `selected` shrinking mid-drag — splicing out of range corrupts it.
    if (start_idx !== drag_start_idx || start_idx >= selected.length) return
    drag_start_idx = null
    const previous = [...selected]
    const new_selected = [...selected]
    const [moved_option] = new_selected.splice(start_idx, 1)
    new_selected.splice(target_idx, 0, moved_option)
    selected = new_selected
    drag_idx = null
    highlighted_idx = null
    onreorder?.({ options: new_selected, previous })
    onchange?.({ options: new_selected, type: `reorder` })
  }

  const on_chip_drag_start = (idx: number) => (event: DragEvent) => {
    if (!event.dataTransfer) return
    // only allow moving, not copying (also affects the cursor during drag)
    event.dataTransfer.effectAllowed = `move`
    event.dataTransfer.dropEffect = `move`
    event.dataTransfer.setData(`text/plain`, `${idx}`)
    drag_start_idx = idx
  }

  let options_list_el = $state<HTMLUListElement>()

  // shared props for beforeInput/afterInput
  const input_snippet_props = $derived({
    selected,
    disabled,
    invalid,
    id,
    placeholder: placeholder_text,
    open,
    required,
    searchText,
  })

  // Clear the committed input-mode selection while preserving searchText as a draft
  function clear_input_committed_selection() {
    const option_removed = selected[0]
    if (option_removed === undefined) return
    selected = []
    clear_validity()
    announce(`${utils.get_label(option_removed)} removed`)
    onremove?.({ option: option_removed, selected })
    onchange?.({ option: option_removed, type: `remove` })
  }

  // Clear committed selection BEFORE the value change so the
  // input_committed_label → searchText sync effect can't clobber the user's
  // draft on the same tick (ordering matters in real browsers).
  const handle_input_beforeinput = () => {
    show_all_input_options = false
    if (input_committed_label !== null) clear_input_committed_selection()
  }

  const handle_input_input = (event: Event) => {
    show_all_input_options = false
    if (!open) open_dropdown(event, false, false)
    // Fallback for input events fired without beforeinput (e.g. some
    // programmatic value setters); bind:value has already synced searchText.
    if (input_committed_label !== null && searchText !== input_committed_label) {
      clear_input_committed_selection()
    }
    oninput?.(event as Parameters<NonNullable<typeof oninput>>[0])
  }

  const handle_input_focus: FocusEventHandler<HTMLInputElement> = (event) => {
    highlighted_idx = null
    if (!suppress_next_focus_open) open_dropdown(event)
    onfocus?.(event)
  }

  const prevent_retain_focus_blur = (event: MouseEvent) => {
    if (closeDropdownOnSelect === `retain-focus`) event.preventDefault()
  }

  // Override input's focus method to ensure dropdown opens on programmatic focus
  // https://github.com/janosh/svelte-widgets/issues/289
  $effect(() => {
    if (!input) return

    const orig_focus = input.focus.bind(input)

    input.focus = (focus_options?: FocusOptions) => {
      orig_focus(focus_options)
      if (!suppress_next_focus_open && !disabled && !open) {
        open_dropdown(new FocusEvent(`focus`, { bubbles: true }))
      }
    }

    return () => {
      if (input) input.focus = orig_focus
    }
  })

  const handle_input_blur: FocusEventHandler<HTMLInputElement> = (event) => {
    // For portalled dropdowns, don't close on blur since clicks on portalled elements
    // will cause blur but we want to allow the click to register first
    // (otherwise mobile touch event is unable to select options https://github.com/janosh/svelte-widgets/issues/335)
    if (
      !portal_params?.active &&
      (!(event.relatedTarget instanceof Node) || !outerDiv?.contains(event.relatedTarget))
    )
      close_dropdown(event)

    onblur?.(event) // Call original handler (if any passed as component prop)
  }

  async function handle_paste(event: ClipboardEvent) {
    if (!parse_paste) return
    const text = event.clipboardData?.getData(`text/plain`)
    if (!text) return
    const parsed = parse_paste(text)
    if (parsed.length === 0) return
    event.preventDefault()
    const added: Option[] = []
    const rejected: Option[] = []
    const overflow: Option[] = []
    for (const [idx, parsed_option] of parsed.entries()) {
      if (at_max_capacity() && maxSelect !== null) {
        overflow.push(parsed_option, ...parsed.slice(idx + 1))
        should_wiggle = true
        onmaxreached?.({ selected, maxSelect, attemptedOption: parsed_option })
        break
      }
      const before = selected.length
      const before_first = maxSelect === 1 ? selected[0] : undefined
      // add() only suspends when an async oncreate is pending (creating_option set
      // synchronously) — awaiting only then keeps the sync paste path synchronous
      // so onparsed_paste still fires in the same task as the paste event
      const add_result = add(parsed_option, event, true)
      if (creating_option) await add_result
      if (selected.length > before || (maxSelect === 1 && selected[0] !== before_first)) {
        added.push(parsed_option)
      } else rejected.push(parsed_option)
      if (maxSelect === 1) {
        overflow.push(...parsed.slice(idx + 1))
        break
      }
    }
    if (!input_display && resetFilterOnAdd) searchText = ``
    onparsed_paste?.({ added, rejected, overflow, raw_text: text })
  }

  // reset form validation when required prop changes
  // https://github.com/janosh/svelte-widgets/issues/285
  $effect.pre(() => {
    void required // register as dependency so validity resets when it changes
    form_input?.setCustomValidity(``)
  })

  // === Async loadOptions ===
  // Retire the in-flight fetch: bump the id so its result is discarded, abort it so
  // consumers forwarding `signal` can bail, and drop the now-meaningless loading flag.
  function cancel_in_flight_load() {
    load_request_id++
    load_abort_controller?.abort()
    is_loading_options = false
  }

  // Captures search at call time to avoid race conditions. reset=true bypasses the
  // loading mutex so search changes can start a new fetch even while a previous one is
  // in-flight; the request_id discards stale results and the old request is aborted.
  async function load_dynamic_options(reset: boolean) {
    if (
      !load_options_config ||
      // paginating from nothing repeats the first page, and would hand out offset 0 on
      // a non-reset load, which the documented cursor pattern reads as "reset"
      (!reset && (is_loading_options || !load_options_has_more || !loaded_options.length))
    )
      return
    if (reset) {
      auto_fill_count = 0
      load_abort_controller?.abort()
    }
    const search = effective_filter_text
    const offset = reset ? 0 : loaded_options.length
    const request_id = ++load_request_id
    const abort_controller = new AbortController()
    load_abort_controller = abort_controller
    load_options_last_search = search
    is_loading_options = true
    let batch_length = 0
    try {
      const result = await load_options_config.fetch({
        search,
        offset,
        limit: load_options_config.batch_size,
        signal: abort_controller.signal,
      })
      if (request_id !== load_request_id) return // stale request, discard
      batch_length = result.options.length
      loaded_options = reset ? result.options : [...loaded_options, ...result.options]
      load_options_has_more = result.hasMore
    } catch (error) {
      // A consumer forwarding `signal` rejects with AbortError once we cancel, which is
      // self-inflicted. One that ignores `signal` still reports genuine failures while
      // superseded, so only swallow errors that are actually aborts.
      if (abort_controller.signal.aborted && (error as Error)?.name === `AbortError`) {
        return
      }
      console.error(`MultiSelect: loadOptions error:`, error)
      // a superseded request must not clobber the live request's state
      if (request_id === load_request_id) load_options_has_more = false
    } finally {
      // Only clear loading if this is still the active request — a newer
      // reset call may have started while this one was in-flight
      if (request_id === load_request_id) {
        is_loading_options = false
        if (load_abort_controller === abort_controller) load_abort_controller = null
      }
    }
    // Auto-fill: if the loaded batch doesn't overflow the dropdown, the scrollbar
    // won't appear and onscroll can never fire. Keep loading until scrollable or done.
    // An empty batch means the next request would be identical, so stop instead of
    // spinning to MAX_AUTO_FILL_ROUNDS against a server that reports hasMore anyway.
    // This also keeps offset=0 meaning "reset": non-reset loads always have options.
    if (
      request_id !== load_request_id ||
      batch_length === 0 ||
      !load_options_has_more ||
      !open ||
      !options_list_el ||
      auto_fill_count >= MAX_AUTO_FILL_ROUNDS
    )
      return
    await tick()
    if (
      request_id !== load_request_id ||
      !open ||
      !options_list_el ||
      options_list_el.clientHeight <= 0 ||
      options_list_el.scrollHeight > options_list_el.clientHeight
    )
      return
    auto_fill_count++
    load_dynamic_options(false)
  }

  // Single effect handles initial load + search changes.
  $effect(() => {
    const config = load_options_config
    if (!config) {
      cancel_in_flight_load()
      previous_load_options_fetch = null
      return
    }
    const fetch_changed = config.fetch !== previous_load_options_fetch
    previous_load_options_fetch = config.fetch

    let debounce_timer: ReturnType<typeof setTimeout> | undefined
    const clear_loaded_batch = () => {
      loaded_options = []
      load_options_has_more = true
    }
    // debounce a fresh load so the UI doesn't refetch on every keystroke
    const schedule_load = () => {
      debounce_timer = setTimeout(
        () => void load_dynamic_options(true),
        config.debounce_ms,
      )
    }

    // Reset when closed or when the loader changes under the current query.
    if (!open || fetch_changed) {
      cancel_in_flight_load()
      load_options_last_search = null
      clear_loaded_batch()
    }
    if (!open) return

    const search = effective_filter_text
    // First load = nothing dispatched yet for this open: no completed search AND none in
    // flight. Read loading via untrack so its synchronous set inside load_dynamic_options
    // can't re-trigger this effect — otherwise keystrokes during the still-awaiting first
    // fetch would fire repeated immediate loads instead of taking the debounce path.
    const is_first_load =
      load_options_last_search === null && !untrack(() => is_loading_options)
    if (is_first_load) {
      if (config.should_fetch_on_open) void load_dynamic_options(true)
      else if (search) schedule_load()
    } else if (search !== load_options_last_search) {
      // Subsequent loads: abort the superseded fetch and clear stale results
      // immediately, then debounce the new search
      cancel_in_flight_load()
      clear_loaded_batch()
      schedule_load()
    }
    return () => clearTimeout(debounce_timer)
  })
  // Abort any in-flight fetch on unmount so callers passing `signal` to fetch can bail
  $effect(() => () => cancel_in_flight_load())

  function handle_options_scroll(event: Event) {
    if (!(event.target instanceof HTMLElement)) return
    const { scrollTop, scrollHeight, clientHeight } = event.target
    options_scroll_top = scrollTop // drives virtual window re-derivation
    if (!load_options_config || is_loading_options || !load_options_has_more) return
    auto_fill_count = 0
    if (scrollHeight - scrollTop - clientHeight <= 100) load_dynamic_options(false)
  }
</script>

{#snippet render_label(opt: Option, idx: number, type: `selected` | `option`)}
  {#if children}
    {@render children({ option: opt, idx, type })}
  {:else if parseLabelsAsHtml}
    {@html utils.get_label(opt)}
  {:else}
    {utils.get_label(opt)}
  {/if}
{/snippet}

{#snippet render_expand_icon()}
  <span class="expand-icon" style="display: flex; align-items: center">
    {#if expandIcon}
      {@render expandIcon({ open, disabled })}
    {:else}
      <Icon
        icon={ChevronExpand}
        style="width: 15px; min-width: 1em; padding: 0 1pt; cursor: pointer"
      />
    {/if}
  </span>
{/snippet}

<!-- shared by per-chip remove buttons and the remove-all button -->
{#snippet remove_btn(
  handler: (event: Event) => void,
  title: string,
  icon_props: { option: Option; isRemoveAll: false } | { isRemoveAll: true },
)}
  <button
    onclick={handler}
    onkeydown={if_enter_or_space(handler)}
    type="button"
    {title}
    class={[`remove`, { 'remove-all': icon_props.isRemoveAll }]}
    class:default-icon={!removeIcon}
  >
    {#if removeIcon}
      {@render removeIcon(icon_props)}
    {:else}
      <Icon icon={Cross} style="width: {icon_props.isRemoveAll ? 17 : 15}px" />
    {/if}
  </button>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -- the nested combobox input owns the interactive ARIA semantics -->
<div
  bind:this={outerDiv}
  class:disabled
  class:single={maxSelect === 1}
  class:open
  class:invalid
  class:input-display={input_display}
  class={[`multiselect`, outerDivClass, rest.class]}
  onmouseup={open_dropdown}
  {@attach click_outside({
    enabled: open,
    // a portalled dropdown is no longer a descendant of this div
    inside: [options_list_el],
    dismiss_on,
    callback: (_node, _config, { event }) => close_dropdown(event),
  })}
  title={disabled ? disabledInputTitle : null}
  data-id={id}
  tabindex="-1"
  {style}
>
  <!-- form control input invisible to the user, used for validation and form submission -->
  <!-- value mirrors selected options in chip mode and visible text in input mode -->
  <input
    {name}
    required={Boolean(required)}
    value={form_value}
    tabindex="-1"
    aria-hidden="true"
    class="form-control"
    bind:this={form_input}
    oninvalid={handle_invalid}
  />
  {#if expandIconPosition === `left`}
    {@render render_expand_icon()}
  {/if}
  <ul
    class={[`selected`, ulSelectedClass]}
    aria-label="selected options"
    style={ulSelectedStyle}
  >
    {@render beforeInput?.(input_snippet_props)}
    {#if !input_display}
      {#each visible_chips as option, idx (duplicates ? `${key(option)}-${idx}` : key(option))}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -- selected chips stay plain list items; nested buttons handle removal -->
        <li
          id="{base_id}-selected-{idx}"
          class={liSelectedClass}
          class:highlighted={highlighted_idx === idx}
          animate:flip={selectedFlipParams}
          draggable={selectedOptionsDraggable && !disabled && selected.length > 1}
          ondragstart={on_chip_drag_start(idx)}
          ondragover={(event) => {
            event.preventDefault() // needed for ondrop to fire
          }}
          ondrop={on_chip_drop(idx)}
          ondragenter={() => (drag_idx = idx)}
          ondragend={() => {
            drag_idx = null
            drag_start_idx = null
          }}
          class:active={drag_idx === idx}
          style={merge_styles(option, `selected`, liSelectedStyle)}
          onmouseup={can_remove && !disabled
            ? (event) => event.stopPropagation()
            : undefined}
        >
          {#if selectedItem}
            {@render selectedItem({ option, idx })}
          {:else}
            {@render render_label(option, idx, `selected`)}
          {/if}
          {#if !disabled && can_remove}
            {@render remove_btn(
              (event) => remove(option, event, idx),
              `${removeBtnTitle} ${utils.get_label(option)}`,
              { option, isRemoveAll: false },
            )}
          {/if}
        </li>
      {/each}
      {#if chip_limit !== null && selected.length > chip_limit}
        <li class="more-chip">
          <button
            type="button"
            class="more-chips"
            aria-expanded={is_chip_list_expanded}
            onclick={(event) => {
              event.stopPropagation()
              is_chip_list_expanded = !is_chip_list_expanded
              // clear a beyond-limit highlight, else the auto-expand effect would
              // instantly undo this collapse (making "show less" a no-op)
              if (!is_chip_list_expanded) highlighted_idx = null
            }}
            onmouseup={(event) => event.stopPropagation()}
          >
            {is_chip_list_expanded ? `show less` : `+${hidden_chip_count} more`}
          </button>
        </li>
      {/if}
    {/if}
    <input
      {...rest}
      {...inputProps}
      class={inputClass}
      style={inputStyle}
      bind:this={input}
      bind:value={searchText}
      {id}
      {disabled}
      {autocomplete}
      {inputmode}
      {pattern}
      placeholder={selected.length === 0 || input_display || placeholder_persistent
        ? placeholder_text
        : null}
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={listbox_rendered ? listbox_id : undefined}
      aria-activedescendant={active_option_id}
      aria-busy={loading || load_options_pending || creating_option || null}
      aria-invalid={invalid ? `true` : null}
      ondrop={(event) => event.preventDefault()}
      onpaste={handle_paste}
      onbeforeinput={handle_input_beforeinput}
      oninput={handle_input_input}
      onmouseup={open_dropdown}
      onkeydown={(event) => {
        handle_keydown(event) // internal logic first, then forwarded handler
        onkeydown?.(event)
      }}
      onfocus={handle_input_focus}
      onblur={handle_input_blur}
      {onclick}
      {onkeyup}
      {onmousedown}
      {onmouseenter}
      {onmouseleave}
      {ontouchcancel}
      {ontouchend}
      {ontouchmove}
      {ontouchstart}
    />
    {@render afterInput?.(input_snippet_props)}
  </ul>
  {#if expandIconPosition === `right`}
    {@render render_expand_icon()}
  {/if}
  {#if loading || creating_option}
    {#if spinner}
      {@render spinner()}
    {:else}
      <CircleSpinner />
    {/if}
  {/if}
  {#if disabled}
    {#if disabledIcon}
      {@render disabledIcon()}
    {:else}
      <Icon
        icon={Disabled}
        style="width: 14pt; margin: 0 2pt"
        data-name="disabled-icon"
        aria-disabled="true"
      />
    {/if}
  {:else if !input_display && selected.length > 0}
    {#if maxSelect && (maxSelect > 1 || maxSelectMsg)}
      <Wiggle
        bind:wiggle={should_wiggle}
        angle={20}
        class={[`max-select-msg`, maxSelectMsgClass]}
      >
        {maxSelectMsg?.(selected.length, maxSelect)}
      </Wiggle>
    {/if}
    {#if maxSelect !== 1 && selected.length > 1 && can_remove}
      {@render remove_btn(remove_all, removeAllTitle, { isRemoveAll: true })}
    {/if}
  {/if}

  {#if listbox_rendered}
    <ul
      {@attach fromAction(portal_action, () => ({
        target_node: outerDiv,
        open,
        ...portal_params,
      }))}
      {@attach highlight_matches({
        query: effective_filter_text,
        disabled: !highlightMatches,
        fuzzy,
        css_class: `sms-search-matches`,
        scroll_to_match: false,
        // don't highlight text in the "Create this option..." message
        node_filter: (node) =>
          node?.parentElement?.closest(`li.user-msg`)
            ? NodeFilter.FILTER_REJECT
            : NodeFilter.FILTER_ACCEPT,
      })}
      id={listbox_id}
      class={[`options`, ulOptionsClass, { hidden: !open }]}
      role="listbox"
      aria-multiselectable={multi_select}
      aria-disabled={disabled ? `true` : null}
      bind:this={options_list_el}
      style={ulOptionsStyle}
      onscroll={handle_options_scroll}
      onmousedown={prevent_retain_focus_blur}
      onmousemove={() => (should_ignore_hover = false)}
    >
      {#if selectAllOption && effective_options.length > 0 && multi_select}
        {@const max_reached = maxSelect !== null && selected.length >= maxSelect}
        {@const all_selectable_selected = select_all_candidates.every((opt) =>
          is_option_selected(opt, utils.get_label(opt)),
        )}
        {@const all_selected =
          max_reached || matching_scope_unavailable || all_selectable_selected}
        {@const disabled_title = get_select_all_disabled_title(
          max_reached,
          all_selectable_selected,
        )}
        <li
          class={[`select-all`, liSelectAllClass, { disabled: all_selected }]}
          onclick={all_selected ? undefined : select_all}
          onkeydown={all_selected ? undefined : if_enter_or_space(select_all)}
          role="option"
          aria-selected={selected.length > 0 && all_selectable_selected}
          aria-disabled={all_selected || undefined}
          title={all_selected ? disabled_title : null}
          tabindex={all_selected ? -1 : 0}
        >
          {typeof selectAllOption === `string` ? selectAllOption : `Select all`}
        </li>
      {/if}
      <!-- option <li> markup shared by the virtual and non-virtual render paths.
        flat_idx is passed positionally so duplicate option values still get
        unique DOM ids / aria-posinset / hover indices -->
      {#snippet option_li(option_item: Option, flat_idx: number)}
        {@const view = get_option_view(option_item, flat_idx)}
        <li
          id="{base_id}-opt-{flat_idx}"
          onclick={(event) => handle_option_interact(option_item, event, flat_idx)}
          title={view.disabled
            ? view.disabledTitle
            : (view.selected && view.selectedTitle) || view.title}
          class:selected={view.selected}
          class:active={view.active}
          class:disabled={view.disabled}
          class={[liOptionClass, view.active && liActiveOptionClass]}
          onmouseover={() => {
            if (!view.disabled && !should_ignore_hover) activeIndex = flat_idx
          }}
          onfocus={() => {
            if (!view.disabled) activeIndex = flat_idx
          }}
          role="option"
          aria-selected={view.selected ? `true` : `false`}
          aria-disabled={view.disabled ? `true` : undefined}
          aria-posinset={flat_idx + 1}
          aria-setsize={visible_navigable_count}
          style={view.style}
          onkeydown={if_enter_or_space((event) =>
            handle_option_interact(option_item, event, flat_idx),
          )}
        >
          {#if keepSelectedInDropdown === `checkboxes`}
            <input
              type="checkbox"
              class="option-checkbox"
              checked={view.selected}
              aria-label="Toggle {utils.get_label(option_item)}"
              tabindex="-1"
            />
          {/if}
          {#if option}
            {@render option({
              option: option_item,
              idx: flat_idx,
              selected: view.selected,
              active: view.active,
              disabled: view.disabled ?? false,
            })}
          {:else}
            {@render render_label(option_item, flat_idx, `option`)}
          {/if}
        </li>
      {/snippet}
      <!-- spacers keep scrollHeight equal to the full list height so the scrollbar
        behaves as if all options were rendered -->
      {#snippet virtual_spacer(height: number)}
        <li
          aria-hidden="true"
          style="height: {height}px; padding: 0; margin: 0; visibility: hidden"
        ></li>
      {/snippet}
      <!-- group header <li> shared by the virtual and non-virtual render paths -->
      {#snippet group_header_li(group_idx: number)}
        {@const {
          group: group_name,
          options: group_opts,
          collapsed,
        } = grouped_options[group_idx]}
        {#if group_name !== null}
          {@const { all_selected, selected_count, selectable } = group_header_state.get(
            group_name,
          ) ?? { all_selected: false, selected_count: 0, selectable: [] }}
          {@const handle_toggle = () =>
            collapsibleGroups && toggle_group_collapsed(group_name)}
          {@const handle_group_select = (event: Event) =>
            toggle_group_selection(selectable, all_selected, event)}
          <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
          <li
            class={[`group-header`, liGroupHeaderClass]}
            class:collapsible={collapsibleGroups}
            class:sticky={stickyGroupHeaders}
            role={collapsibleGroups ? `button` : `presentation`}
            aria-expanded={collapsibleGroups ? !collapsed : undefined}
            aria-label="Group: {group_name}"
            style={liGroupHeaderStyle}
            onclick={handle_toggle}
            onkeydown={if_enter_or_space(handle_toggle)}
            tabindex={collapsibleGroups ? 0 : -1}
          >
            {#if groupHeader}
              {@render groupHeader({
                group: group_name,
                options: group_opts,
                collapsed,
              })}
            {:else}
              <span class="group-label">{group_name}</span>
              <span class="group-count">
                ({selected_count > 0
                  ? `${selected_count}/${group_opts.length}`
                  : group_opts.length})
              </span>
              {#if groupSelectAll && multi_select}
                {@const group_blocked =
                  !all_selected && (at_max_capacity() || selectable.length === 0)}
                <button
                  type="button"
                  class={[`group-select-all`, { deselect: all_selected }]}
                  disabled={group_blocked}
                  onclick={handle_group_select}
                  onkeydown={if_enter_or_space(handle_group_select)}
                >
                  {all_selected ? `Deselect all` : `Select all`}
                </button>
              {/if}
              {#if collapsibleGroups}
                <Icon
                  icon={collapsed ? ChevronRight : ChevronDown}
                  style="width: 12px; margin-inline-start: auto"
                />
              {/if}
            {/if}
          </li>
        {/if}
      {/snippet}
      {#if render_window}
        {@render virtual_spacer(render_window.start * render_window.item_height)}
      {/if}
      {#each visible_render_rows as row (row.render_key)}
        {#if row.kind === `option`}
          {@render option_li(row.option, row.flat_idx)}
        {:else}
          {@render group_header_li(row.group_idx)}
        {/if}
      {/each}
      {#if render_window}
        {@render virtual_spacer(
          (render_rows.length - render_window.end) * render_window.item_height,
        )}
      {/if}
      {#if user_message && user_message.msg}
        {@const { type: msgType, msg } = user_message}
        {@const can_add_user_option = msgType === `create`}
        {@const handle_create = (event: Event) =>
          can_add_user_option && add(searchText as Option, event)}
        <li
          id={user_message_id}
          onclick={handle_create}
          onkeydown={can_add_user_option ? if_enter_or_space(handle_create) : undefined}
          title={msgType !== `no-match` ? msg : ``}
          class:active={is_user_message_active}
          onmouseover={() => !should_ignore_hover && (is_user_message_active = true)}
          onfocus={() => (is_user_message_active = true)}
          onmouseout={() => (is_user_message_active = false)}
          onblur={() => (is_user_message_active = false)}
          role="option"
          aria-selected="false"
          class={[
            `user-msg`,
            liUserMsgClass,
            is_user_message_active && liActiveUserMsgClass,
          ]}
          style:cursor={{
            dupe: `not-allowed`,
            create: `pointer`,
            'no-match': `default`,
          }[msgType]}
        >
          {#if userMsg}
            {@render userMsg({ searchText, msgType, msg })}
          {:else}
            {msg}
          {/if}
        </li>
      {/if}
      {#if load_options_config && is_loading_options}
        <li class="loading-more" role="status" aria-label="Loading more options">
          <CircleSpinner />
        </li>
      {/if}
    </ul>
  {/if}
  <!-- live region: selection changes, else available option count while open -->
  <div class="sr-only" aria-live="polite" aria-atomic="true">
    {#if last_announcement}
      {#key last_announcement.id}{last_announcement.text}{/key}
    {:else if open}
      {matchingOptions.length} option{matchingOptions.length === 1 ? `` : `s`} available
    {/if}
  </div>
</div>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  /* Use :where() for elements with user-overridable class props (outerDivClass, ulSelectedClass, liSelectedClass)
     so user-provided classes take precedence. See: https://github.com/janosh/svelte-widgets/issues/380 */
  :where(div.multiselect) {
    position: relative;
    align-items: center;
    display: flex;
    cursor: text;
    box-sizing: border-box;
    border: var(--sms-border, 1px solid light-dark(lightgray, #555));
    border-radius: var(--sms-border-radius, 3pt);
    background: var(--sms-bg, light-dark(white, #222226));
    width: var(--sms-width);
    max-width: var(--sms-max-width);
    padding: var(--sms-padding, 0 3pt);
    /* pair the default text color with the light-dark() background so the widget
       stays readable on dark pages that never declare color-scheme (light-dark()
       falls back to light there). Set --sms-text-color: inherit to blend with the
       page instead. */
    color: var(--sms-text-color, light-dark(#222, #eee));
    font-size: var(--sms-font-size, inherit);
    min-height: var(--sms-min-height, 22pt);
    margin: var(--sms-margin);
  }
  :where(div.multiselect.open) {
    /* increase z-index when open to ensure the dropdown of one <MultiSelect />
    displays above that of another slightly below it on the page */
    z-index: var(--sms-open-z-index, 4);
  }
  :where(div.multiselect:focus-within) {
    border: var(--sms-focus-border, 1px solid var(--sms-active-color, cornflowerblue));
  }
  :where(div.multiselect.disabled) {
    background: var(--sms-disabled-bg, light-dark(lightgray, #444));
    cursor: not-allowed;
  }

  :where(div.multiselect > ul.selected) {
    display: flex;
    flex: 1;
    padding: 0;
    margin: 0;
    flex-wrap: wrap;
  }
  :where(div.multiselect.input-display > ul.selected) {
    flex-wrap: nowrap;
  }
  :where(div.multiselect > ul.selected > li) {
    align-items: center;
    border-radius: 3pt;
    display: flex;
    margin: 2pt;
    line-height: normal;
    transition: 0.3s;
    white-space: nowrap;
    background: var(
      --sms-selected-bg,
      light-dark(rgba(100, 120, 140, 0.15), rgba(120, 170, 255, 0.2))
    );
    padding: var(--sms-selected-li-padding, 0 2pt 0 5pt);
    color: var(--sms-selected-text-color, var(--sms-text-color, light-dark(#222, #eee)));
  }
  :where(div.multiselect > ul.selected > li[draggable='true']) {
    cursor: grab;
  }
  :where(div.multiselect > ul.selected > li.active) {
    background: var(
      --sms-li-active-bg,
      var(--sms-active-color, light-dark(rgba(0, 0, 0, 0.15), rgba(255, 255, 255, 0.15)))
    );
  }
  :where(div.multiselect > ul.selected > li).highlighted {
    outline: 2px solid var(--sms-active-color, cornflowerblue);
  }
  :is(div.multiselect button) {
    border-radius: 50%;
    aspect-ratio: 1; /* ensure circle, not ellipse */
    display: flex;
    align-items: center;
    justify-content: center;
    transition: 0.2s;
    color: inherit;
    background: transparent;
    border: none;
    cursor: pointer;
    outline: none;
    padding: 0;
    margin: 0; /* CSS reset */
    margin-inline-start: 2pt;
  }
  :is(div.multiselect button.default-icon) {
    min-height: 0; /* let aspect-ratio win over content sizing */
    overflow: hidden;
  }
  :is(div.multiselect button.remove-all) {
    margin: 0 2pt;
    padding: 0;
  }
  :is(div.multiselect button.remove-all:not(.default-icon)) {
    border-radius: 3pt;
    aspect-ratio: auto;
    padding: 0 2pt;
  }
  /* "+N more" chip toggle rendered when maxVisibleChips collapses overflow */
  :is(div.multiselect li.more-chip button.more-chips) {
    border-radius: 3pt;
    aspect-ratio: auto;
    padding: 0 4pt;
    margin: 0;
    font-size: inherit;
    white-space: nowrap;
  }
  :is(ul.selected > li button:hover, button.remove-all:hover, button:focus) {
    color: var(--sms-remove-btn-hover-color, inherit);
    background: var(
      --sms-remove-btn-hover-bg,
      light-dark(rgba(0, 0, 0, 0.2), rgba(255, 255, 255, 0.2))
    );
  }

  :is(div.multiselect input) {
    margin: auto 0; /* CSS reset */
    padding: 0; /* CSS reset */
  }
  :where(div.multiselect > ul.selected > input) {
    border: none;
    outline: none;
    background: none;
    /* this + next line fix https://github.com/janosh/svelte-widgets/issues/12 */
    flex: 1;
    min-width: 2em;
    /* ensure input uses text color and not --sms-selected-text-color */
    color: var(--sms-text-color, light-dark(#222, #eee));
    font-size: inherit;
    cursor: inherit; /* needed for disabled state */
    border-radius: 0; /* reset ul.selected > li */
  }
  :where(div.multiselect.input-display > ul.selected > input) {
    width: 100%;
    min-width: 0;
  }

  /* When options are selected, placeholder is hidden in which case we minimize input width to avoid adding unnecessary width to div.multiselect */
  :where(
    div.multiselect:not(.input-display) > ul.selected > input:not(:placeholder-shown)
  ) {
    min-width: 1px; /* Minimal width to remain interactive */
  }

  /* don't wrap ::placeholder rules in :is() as it seems to be overpowered by browser defaults i.t.o. specificity */
  div.multiselect > ul.selected > input::placeholder {
    padding-inline-start: 5pt;
    color: var(--sms-placeholder-color);
    opacity: var(--sms-placeholder-opacity);
  }
  :is(div.multiselect > input.form-control) {
    width: 2em;
    position: absolute;
    background: transparent;
    border: none;
    outline: none;
    z-index: -1;
    opacity: 0;
    pointer-events: none;
  }

  /* Use :where() for ul.options elements with class props (ulOptionsClass, liOptionClass, liUserMsgClass) */
  :where(ul.options) {
    list-style: none;
    /* top, left, width, position are managed by portal when active */
    /* but provide defaults for non-portaled or initial state */
    position: absolute; /* Default, overridden by portal to fixed when open */
    top: 100%;
    /* deliberately physical: with width 100% left/right anchoring is identical, and
       a logical inset would resolve to `right` in RTL, conflicting with the portal's
       physical `left` positioning (over-constrained fixed element) */
    left: 0;
    width: 100%;
    /* Default z-index if not portaled/overridden by portal */
    z-index: var(--sms-options-z-index, 3);
    overflow: auto;
    transition:
      opacity 0.2s,
      transform 0.2s,
      visibility 0.2s;
    box-sizing: border-box;
    background: var(--sms-options-bg, light-dark(#fcfcfc, #222226));
    /* pair text with the light-dark() background: when portalled the dropdown is
       moved to document.body and no longer inherits div.multiselect's color */
    color: var(--sms-text-color, light-dark(#222, #eee));
    max-height: var(--sms-options-max-height, 50vh);
    overscroll-behavior: var(--sms-options-overscroll, none);
    box-shadow: var(
      --sms-options-shadow,
      light-dark(0 0 14pt -3pt rgba(0, 0, 0, 0.2), 0 0 14pt -4pt rgba(0, 0, 0, 0.8))
    );
    border: var(--sms-options-border, 1px solid light-dark(lightgray, #555));
    border-width: var(--sms-options-border-width, 1px);
    border-radius: var(--sms-options-border-radius, 1ex);
    padding: var(--sms-options-padding, 0);
    margin: var(--sms-options-margin, 6pt 0 0 0);
  }
  :where(ul.options:not(:has(li))) {
    visibility: hidden;
    height: 0;
    overflow: hidden;
    padding: 0;
    margin: 0;
    border: none;
  }
  :where(ul.options.hidden) {
    visibility: hidden;
    opacity: 0;
    transform: translateY(50px);
    pointer-events: none;
    /* position: fixed prevents the hidden dropdown from contributing to
       ancestor scrollHeight (unlike position: absolute which extends it) */
    position: fixed;
  }
  :where(ul.options > li) {
    padding: var(--sms-options-li-padding, 2pt 1ex);
    cursor: pointer;
    scroll-margin: var(--sms-options-scroll-margin, 100px);
    border-inline-start: 1px solid transparent;
  }
  :where(ul.options .user-msg) {
    /* block needed so vertical padding applies to span */
    display: block;
    /* vertical padding tracks ul.options > li so this row is no taller than an option */
    padding: 2pt 2ex;
  }
  :where(ul.options > li.selected) {
    background: var(
      --sms-li-selected-plain-bg,
      light-dark(rgba(0, 123, 255, 0.1), rgba(100, 180, 255, 0.2))
    );
    border-inline-start: var(
      --sms-li-selected-plain-border,
      1px solid var(--sms-active-color, cornflowerblue)
    );
  }
  :where(ul.options > li.active) {
    background: var(
      --sms-li-active-bg,
      var(
        --sms-active-color,
        light-dark(rgba(70, 70, 140, 0.2), rgba(120, 170, 170, 0.2))
      )
    );
  }
  :where(ul.options > li.disabled) {
    cursor: not-allowed;
    background: var(--sms-li-disabled-bg, light-dark(#f5f5f6, #2a2a2a));
    color: var(--sms-li-disabled-text, light-dark(#b8b8b8, #666));
  }
  /* keepSelectedInDropdown='checkboxes' */
  :is(ul.options > li > input.option-checkbox) {
    width: 16px;
    height: 16px;
    margin-inline-end: 6px;
    accent-color: var(--sms-active-color, cornflowerblue);
  }
  /* Select all option styling - has liSelectAllClass prop */
  :where(ul.options > li.select-all) {
    border-bottom: var(
      --sms-select-all-border-bottom,
      1px solid light-dark(lightgray, #555)
    );
    font-weight: var(--sms-select-all-font-weight, 500);
    color: var(--sms-select-all-color, inherit);
    background: var(--sms-select-all-bg, transparent);
    margin-bottom: var(--sms-select-all-margin-bottom, 2pt);
  }
  :where(ul.options > li.select-all.disabled),
  :is(ul.options > li.group-header button.group-select-all:disabled) {
    opacity: 0.4;
    cursor: not-allowed;
  }
  :where(ul.options > li.select-all:hover:not(.disabled)) {
    background: var(
      --sms-select-all-hover-bg,
      var(
        --sms-li-active-bg,
        var(
          --sms-active-color,
          light-dark(rgba(70, 70, 140, 0.2), rgba(120, 170, 255, 0.2))
        )
      )
    );
  }
  /* Group header styling - has liGroupHeaderClass prop */
  :where(ul.options > li.group-header) {
    display: flex;
    align-items: center;
    font-weight: var(--sms-group-header-font-weight, 600);
    font-size: var(--sms-group-header-font-size, 0.9em);
    color: var(--sms-group-header-color, light-dark(#666, #aaa));
    background: var(--sms-group-header-bg, transparent);
    padding: var(--sms-group-header-padding, 2pt 1ex);
    cursor: default;
    border-inline-start: none;
    text-transform: var(--sms-group-header-text-transform, uppercase);
    letter-spacing: var(--sms-group-header-letter-spacing, 0.5px);
  }
  :where(ul.options > li.group-header:not(:first-child)) {
    margin-top: var(--sms-group-header-margin-top, 4pt);
    border-top: var(--sms-group-header-border-top, 1px solid light-dark(#eee, #333));
  }
  :where(ul.options > li.group-header.collapsible) {
    cursor: pointer;
  }
  :where(ul.options > li.group-header.collapsible:hover) {
    background: var(
      --sms-group-header-hover-bg,
      light-dark(rgba(0, 0, 0, 0.05), rgba(255, 255, 255, 0.05))
    );
  }
  :is(ul.options > li.group-header .group-label) {
    flex: 1;
  }
  :is(ul.options > li.group-header .group-count) {
    opacity: 0.6;
    font-size: 0.9em;
    font-weight: normal;
    margin-inline-start: 4pt;
  }
  /* Sticky group headers when enabled */
  :where(ul.options > li.group-header.sticky) {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(
      --sms-group-header-sticky-bg,
      var(--sms-options-bg, light-dark(#fcfcfc, #222226))
    );
  }
  /* Indent grouped options for visual hierarchy */
  :where(
    ul.options > li:not(.group-header):not(.select-all):not(.user-msg):not(.loading-more)
  ) {
    padding-inline-start: var(
      --sms-group-item-padding-left,
      var(--sms-group-option-indent, 1.5ex)
    );
  }
  /* group chevron collapse/expand animation */
  :is(ul.options > li.group-header) :global(svg) {
    transition: transform var(--sms-group-collapse-duration, 0.15s) ease-out;
  }
  :is(ul.options > li.group-header button.group-select-all) {
    font-size: 0.9em;
    font-weight: normal;
    text-transform: none;
    color: var(--sms-active-color, cornflowerblue);
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 2pt 4pt;
    margin-inline-start: 8pt;
    border-radius: 3pt;
    aspect-ratio: auto; /* override global button aspect-ratio: 1 */
  }
  :is(ul.options > li.group-header button.group-select-all:hover:not(:disabled)) {
    background: var(
      --sms-group-select-all-hover-bg,
      light-dark(rgba(0, 0, 0, 0.1), rgba(255, 255, 255, 0.1))
    );
  }
  :is(ul.options > li.group-header button.group-select-all.deselect) {
    color: var(--sms-group-deselect-color, light-dark(#c44, #f77));
  }
  :where(div.multiselect) :global(:where(span.max-select-msg)) {
    padding: 0 3pt;
  }
  :global(::highlight(sms-search-matches)) {
    color: light-dark(#1a8870, #6cc9a8);
  }
  /* infinite-scroll loading indicator */
  :is(ul.options > li.loading-more) {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 8pt;
    cursor: default;
  }
</style>
