<script lang="ts" generics="Option extends import('./types').Option">
  // === Imports ===
  import OptionRows from './internal/OptionRows.svelte'
  import {
    create_option_rows,
    type OptionGroupRow,
    group_options as group_list_options,
    next_option_index,
    option_disabled as is_disabled,
    option_matches,
    option_window,
    validate_option_list_config,
  } from './internal/option-list'
  import { create_option_loader } from './internal/option-loader.svelte'
  import { tick, untrack } from 'svelte'
  import { flip } from 'svelte/animate'
  import { fromAction } from 'svelte/attachments'
  import type { FocusEventHandler } from 'svelte/elements'
  import { SvelteSet } from 'svelte/reactivity'
  import {
    click_outside,
    highlight_matches as attach_highlight_matches,
  } from './attachments/index'
  import CircleSpinner from './CircleSpinner.svelte'
  import Icon from './Icon.svelte'
  import { ChevronDown, ChevronExpand, ChevronRight, Cross, Disabled } from './icons'
  import { merge_defaults, MULTI_SELECT_LABELS } from './labels'
  import { portal_action } from './portal'
  import type {
    GroupedOptions,
    KeyboardShortcuts,
    MultiSelectProps,
    SelectAllScope,
  } from './types'
  import * as utils from './utils'
  import Wiggle from './Wiggle.svelte'

  // === Props ===
  let {
    active_index = $bindable(null),
    active_option = $bindable(null),
    auto_active_first_option = false,
    create_option_msg = `Create this option...`,
    allow_user_options = false,
    allow_empty = false,
    autocomplete = `off`,
    auto_scroll = true,
    breakpoint = 800,
    default_disabled_title = `This option is disabled`,
    disabled = false,
    disabled_input_title = `This input is disabled`,
    duplicate_option_msg = `This option is already selected`,
    duplicates = false,
    keep_selected_in_dropdown = false,
    key = (opt) => utils.get_option_key(opt),
    filter_func = (opt, search_text) => option_matches(opt, search_text, fuzzy),
    fuzzy = true,
    close_dropdown_on_select = false,
    form_input = $bindable(null),
    form_serialize = (selected) => JSON.stringify(selected),
    highlight_matches = true,
    id = null,
    input = $bindable(null),
    input_class = ``,
    input_props = {},
    input_style = null,
    inputmode = null,
    invalid = $bindable(false),
    labels,
    li_active_option_class = ``,
    li_active_user_msg_class = ``,
    li_option_class = ``,
    li_option_style = null,
    li_selected_class = ``,
    li_selected_style = null,
    li_user_msg_class = ``,
    loading = false,
    matching_options = $bindable([]),
    max_options,
    virtual_list = false,
    mode = `multiple`,
    max_select: selection_limit = null,
    max_select_msg = (current, max) => (mode === `multiple` ? `${current}/${max}` : ``),
    max_select_msg_class = ``,
    max_visible_chips = null,
    name = null,
    no_matching_options_msg = `No matching options`,
    open = $bindable(false),
    dismiss_on = `press`,
    options = $bindable([]),
    outer_div = $bindable(null),
    outer_div_class = ``,
    pattern = null,
    placeholder = null,
    remove_all_title = `Remove all`,
    remove_btn_title = `Remove`,
    min_select = null,
    required = false,
    reset_filter_on_add = true,
    parse_paste,
    search_text = $bindable(``),
    value = $bindable(mode === `single` ? null : []),
    sort_selected = false,
    selected_options_draggable = !sort_selected,
    selected_display = `chips`,
    style = null,
    ul_options_class = ``,
    ul_selected_class = ``,
    ul_selected_style = null,
    ul_options_style = null,
    expand_icon,
    expand_icon_position = `left`,
    selected_item,
    children,
    remove_icon,
    before_input,
    after_input,
    spinner,
    disabled_icon,
    option,
    user_msg,
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
    on_add,
    on_create,
    on_remove,
    on_remove_all,
    on_change,
    on_open,
    on_close,
    on_select_all,
    on_range_select,
    on_reorder,
    portal: portal_params = {},
    select_all_option = false,
    select_all_scope = `visible`,
    select_all_disabled_title,
    li_select_all_class = ``,
    load_options,
    load_error = $bindable(null),
    selected_flip_params = { duration: 100 },
    // === Grouping ===
    collapsible_groups = false,
    collapsed_groups = $bindable(new Set<string>()),
    group_select_all = false,
    ungrouped_position = `first`,
    group_sort_order = `none`,
    search_expands_collapsed_groups = false,
    search_matches_groups = false,
    keyboard_expands_collapsed_groups = false,
    sticky_group_headers = false,
    li_group_header_class = ``,
    li_group_header_style = null,
    group_header,
    on_group_toggle,
    on_collapse_all,
    on_expand_all,
    on_search,
    on_max_reached,
    on_duplicate,
    on_parsed_paste,
    on_activate,
    collapse_all_groups = $bindable(),
    expand_all_groups = $bindable(),
    shortcuts = {},
    range_select = false,
    ...rest
  }: MultiSelectProps<Option> = $props()

  const max_select = $derived(mode === `single` ? 1 : selection_limit)
  const selected = $derived<Option[]>(
    Array.isArray(value) ? value : value == null ? [] : [value],
  )
  const set_selection = (items: Option[]) => {
    value = mode === `single` ? (items[0] ?? null) : items
  }

  // every string this component renders on its own, overridable key by key for i18n
  const msg = $derived(merge_defaults(MULTI_SELECT_LABELS, labels))
  // `get_label` returns string | number; coerce once here rather than at each call site
  const label_of = (option_item: Option): string => `${utils.get_label(option_item)}`

  const invalid_config = (message: string): never => {
    throw new TypeError(`MultiSelect: ${message}`)
  }
  const is_integer_at_least = (
    candidate: unknown,
    minimum: number,
  ): candidate is number =>
    typeof candidate === `number` && Number.isInteger(candidate) && candidate >= minimum

  const validate_config = (has_grouped_options = options.some(utils.has_group)): void => {
    if (`selected` in rest) invalid_config(`use value instead of selected`)
    if (!load_options && !options.length) {
      if (!(allow_user_options || loading || disabled || allow_empty))
        invalid_config(`received no options`)
    }
    if (max_select !== null && !is_integer_at_least(max_select, 1)) {
      invalid_config(`max_select must be null or a positive integer, got ${max_select}`)
    }
    if (mode !== `single` && mode !== `multiple`) invalid_config(`unknown mode ${mode}`)
    if (mode === `single` ? Array.isArray(value) : !Array.isArray(value)) {
      invalid_config(
        `value must be ${mode === `single` ? `an option or null` : `an array`} in ${mode} mode`,
      )
    }
    if (mode === `single` && selection_limit !== null)
      invalid_config(`max_select is only available in multiple mode`)
    if (max_select && typeof required === `number` && required > max_select) {
      invalid_config(
        `max_select=${max_select} < required=${required}, which makes valid form submission impossible`,
      )
    }
    if (sort_selected && selected_options_draggable) {
      invalid_config(
        `sort_selected cannot be combined with selected_options_draggable because sorting would overwrite the user's order`,
      )
    }
    if (selected_display === `input` && mode !== `single`) {
      invalid_config(`selected_display="input" requires mode="single"`)
    }
    if (allow_user_options && !create_option_msg && create_option_msg !== null) {
      invalid_config(
        `allow_user_options=${allow_user_options} requires a non-empty create_option_msg or explicit null, got ${create_option_msg}`,
      )
    }
    if (max_visible_chips !== null && !is_integer_at_least(max_visible_chips, 0)) {
      invalid_config(
        `max_visible_chips must be null or a non-negative integer, got ${max_visible_chips}`,
      )
    }
    validate_option_list_config(
      {
        max_options,
        load_options,
        virtual_list,
        sticky_group_headers,
        has_grouped_options,
      },
      `MultiSelect`,
    )
  }

  // Initial props must fail before any synchronization effect can normalize them.
  untrack(validate_config)

  // === Config normalization ===
  // ARIA combobox ids; `$props.id()` survives hydration when the caller omits `id`
  const unique_id = $props.id()
  const base_id = $derived(id ?? `sms-${unique_id}`)
  const listbox_id = $derived(`${base_id}-listbox`)
  const input_display = $derived(selected_display === `input`)
  const multi_select = $derived(mode === `multiple`)

  // used by the default filter_func and by group-name matching
  const text_matches = (search: string, target: string): boolean =>
    fuzzy
      ? utils.fuzzy_match(search, target)
      : target.toLowerCase().includes(search.toLowerCase())

  // Mac uses Cmd for shortcuts, everything else Ctrl
  const is_mac =
    typeof navigator !== `undefined` && /Mac|iPhone|iPad|iPod/u.test(navigator.userAgent)
  const mod_key = is_mac ? `meta` : `ctrl`

  const default_shortcuts: KeyboardShortcuts = {
    select_all: null,
    clear_all: `${mod_key}+backspace`,
    open: null,
    close: null,
  }
  const effective_shortcuts = $derived({ ...default_shortcuts, ...shortcuts })

  const loader = create_option_loader<Option>({
    config: () => load_options,
    query: () => effective_filter_text,
    open: () => open,
    element: () => options_list_el,
    search_text: () => search_text,
    matching_options: () => matching_options,
    on_search: () => on_search,
  })
  $effect(() => {
    load_error = loader.error
  })

  let should_wiggle = $state(false) // wiggle when the user tries to exceed max_select
  let highlighted_idx: number | null = $state(null) // chip index for arrow-key navigation
  // range_select anchor. Plain (non-$state) since only event handlers read it. The anchor
  // can't be matched by reference — matching_options is $bindable, so its elements are
  // re-proxied — hence is_same_option comparing key + label; idx is a relocation hint.
  let range_anchor: { option: Option; idx: number | null } | null = null

  // max_visible_chips: chips beyond the limit collapse into a "+N more" toggle.
  let is_chip_list_expanded = $state(false)
  const visible_chips = $derived(
    max_visible_chips !== null && !is_chip_list_expanded
      ? selected.slice(0, max_visible_chips)
      : selected,
  )
  const hidden_chip_count = $derived(selected.length - visible_chips.length)
  // keyboard chip navigation must never highlight an unrendered chip — auto-expand
  $effect(() => {
    if (highlighted_idx === null) return
    if (max_visible_chips !== null && highlighted_idx >= max_visible_chips)
      is_chip_list_expanded = true
    // Clamp when selected changes externally (parent prop, select_all)
    if (highlighted_idx >= selected.length) {
      highlighted_idx = selected.length > 0 ? selected.length - 1 : null
    }
  })

  // carries an id, not just text: re-assigning the same string leaves the live region's
  // content unchanged, so a repeated identical message would never be announced
  let last_announcement = $state<{ text: string; id: number } | null>(null)
  let announcement_count = 0
  const announce = (text: string) => {
    last_announcement = { text, id: ++announcement_count }
  }

  // Clear after announcement so option counts can be announced again.
  $effect(() => {
    if (!last_announcement) return
    const timer = setTimeout(() => (last_announcement = null), 1000)
    return () => clearTimeout(timer)
  })

  // === Derived collections and indexing ===
  let has_search_text = $derived(search_text.trim().length > 0)
  // cached to avoid repeated .map() calls
  let selected_labels = $derived(selected.map((opt) => utils.get_label(opt)))
  let input_committed_label = $derived(
    input_display && selected[0] !== undefined ? label_of(selected[0]) : null,
  )
  let input_text_is_committed = $derived(
    input_display && search_text === input_committed_label,
  )
  let show_all_input_options = $state(false)
  // whitespace-only input maps to `` (it used to filter out every option while also
  // suppressing the no-match message, leaving a blank dropdown); non-blank input stays raw
  // so filter_func/load_options/highlighting receive exactly what the user typed
  let effective_filter_text = $derived(
    input_text_is_committed || show_all_input_options || !has_search_text
      ? ``
      : search_text,
  )

  const matches_search = (opt: Option, search: string): boolean =>
    filter_func(opt, search) ||
    (search_matches_groups &&
      Boolean(search) &&
      utils.has_group(opt) &&
      text_matches(search, opt.group))

  // `options` and `load_options` compose: local options are filtered client-side and lead
  // the list (no debounce, no request) while remote batches append behind them
  let effective_options = $derived.by(() => {
    const local_options = options
    if (!loader.config) return local_options
    const local_matches = local_options.filter((opt) =>
      matches_search(opt, effective_filter_text),
    )
    return [...local_matches, ...loader.options]
  })
  let form_value = $derived.by(() => {
    // input mode deliberately submits the visible text, committed or draft: the free-text
    // combobox contract, pinned by tests
    if (input_display) return has_search_text ? search_text : null
    return selected.length >= Number(required) ? form_serialize(selected) : null
  })
  let prev_input_committed_label: string | null = null
  // keeps search_text in sync with committed selections, external value changes included.
  // onbeforeinput clears input_committed_label ahead of the browser's text mutation, so
  // this pre-effect only ever resets stale committed text.
  $effect.pre(() => {
    if (input_committed_label !== null && search_text !== input_committed_label) {
      search_text = input_committed_label
    } else if (
      input_display &&
      input_committed_label === null &&
      prev_input_committed_label !== null &&
      search_text === prev_input_committed_label
    ) {
      search_text = ``
    }
    prev_input_committed_label = input_committed_label
  })
  let load_options_pending = $derived(
    Boolean(loader.config) &&
      (loader.loading ||
        (open &&
          loader.has_more &&
          (loader.last_search ?? ``) !== effective_filter_text)),
  )
  // plain Sets for O(1) lookups: these deriveds are rebuilt wholesale, never mutated in
  // place, so reactive collections would buy nothing
  let selected_keys_set = $derived(new Set(selected.map((opt) => key(opt))))
  // duplicate detection: labels as strings (so 123 matches "123"), lowercased when
  // duplicates='case-insensitive'
  const lower_dupes = $derived(duplicates === `case-insensitive`)
  const norm_label = (label: unknown) =>
    lower_dupes ? `${label}`.toLowerCase() : `${label}`
  let selected_labels_set = $derived(new Set(selected_labels.map(norm_label)))
  const is_label_selected = (label: string): boolean =>
    selected_labels_set.has(norm_label(label))
  const is_option_selected = (opt: Option, label: string | number): boolean =>
    has_selected_option(opt) || (lower_dupes && is_label_selected(`${label}`))

  // identity check for bulk/range ops. Compares label too, since a custom `key` may
  // deliberately collapse distinct options onto one key.
  const is_same_option = (opt_a: Option | null | undefined, opt_b: Option): boolean =>
    opt_a != null &&
    key(opt_a) === key(opt_b) &&
    utils.get_label(opt_a) === utils.get_label(opt_b)
  // Key + label is the identity when duplicates are allowed. Count each occurrence once
  // instead of scanning every selected option for every dropdown row or bulk candidate.
  const count_options = (items: Option[]) => {
    const counts = new Map<unknown, Map<string | number, number>>()
    for (const item of items) {
      const item_key = key(item)
      const label = utils.get_label(item)
      // is_same_option uses strict equality, which never matches NaN.
      if (Number.isNaN(item_key) || Number.isNaN(label)) continue
      let label_counts = counts.get(item_key)
      if (!label_counts) counts.set(item_key, (label_counts = new Map()))
      label_counts.set(label, (label_counts.get(label) ?? 0) + 1)
    }
    return counts
  }
  const selected_option_counts = $derived(count_options(selected))
  const has_selected_option = (opt: Option): boolean =>
    duplicates === true
      ? (selected_option_counts.get(key(opt))?.has(utils.get_label(opt)) ?? false)
      : selected_keys_set.has(key(opt))

  const group_options = (items: Option[]) =>
    group_list_options(items, {
      collapsed: collapsed_groups,
      sort: group_sort_order,
      ungrouped: ungrouped_position,
    })
  let grouped_options = $derived(group_options(matching_options))
  // Flatten groups for navigation (excludes options in collapsed groups)
  const flatten_navigable = (groups: GroupedOptions<Option>[]): Option[] =>
    groups.flatMap(({ options: group_opts, collapsed }) =>
      collapsed && collapsible_groups ? [] : group_opts,
    )
  let navigable_options = $derived(flatten_navigable(grouped_options))

  // keyboard nav must stop at max_options: past it aria-activedescendant would point at a
  // non-existent DOM id and Enter could select an option the user can't see
  let visible_navigable_count = $derived(
    Math.min(navigable_options.length, max_options ?? Infinity),
  )
  const rendered_options = $derived(navigable_options.slice(0, visible_navigable_count))
  // `matching` scope needs the full local option set, which remote loading can't provide
  const matching_scope_unavailable = $derived(
    select_all_scope === `matching` && Boolean(load_options),
  )
  const select_all_candidates = $derived(
    (select_all_scope === `matching` && !load_options
      ? matching_options
      : rendered_options
    ).filter((option_item) => !is_disabled(option_item)),
  )

  // === Virtualized dropdown rendering ===
  const has_grouped_options = $derived(
    grouped_options.some(({ group }) => group !== null),
  )
  // flat and grouped lists both virtualize (headers are rows of the same item_height), but
  // validation rejects sticky grouped headers: one scrolled out of the window can't stay pinned
  let options_scroll_top = $state(0)
  let options_client_height = $state(0)
  // happy-dom and SSR report clientHeight 0 — fall back to a 400px viewport estimate
  const virtual_viewport = $derived(
    options_client_height > 0 ? options_client_height : 400,
  )
  const build_rows = create_option_rows<Option>()
  const render_rows = $derived.by(() =>
    build_rows(
      grouped_options,
      render_key_assigner(),
      collapsible_groups,
      visible_navigable_count,
    ),
  )
  // row index per navigable option: keyboard auto-scroll needs row offsets, which diverge
  // from flat option indices once header rows are interleaved
  const option_row_indices = $derived(
    render_rows.flatMap((row, row_idx) => (row.kind === `option` ? [row_idx] : [])),
  )
  // Window of row indices [start, end) to render as DOM nodes
  const virtual_window = $derived(
    render_rows.length
      ? option_window(
          virtual_list,
          options_scroll_top,
          virtual_viewport,
          render_rows.length,
        )
      : null,
  )
  // keys for the dropdown's keyed {#each}: key(opt) for unique options, so filtering keeps
  // DOM nodes stable, but repeats (options=['a', 'a']) would crash Svelte with
  // each_key_duplicate. Repeats get cached symbols — outside the user key namespace (a
  // string suffix could collide with a real 'a-dup-1') and stable across re-derivations.
  const dup_key_cache = new Map<unknown, symbol[]>()
  // One counter per pass, so a key repeated across groups is still disambiguated
  const render_key_assigner = () => {
    const occurrence_counts = new Map<unknown, number>()
    return (option_item: Option): unknown => {
      const base_key = key(option_item)
      const occurrence = occurrence_counts.get(base_key) ?? 0
      occurrence_counts.set(base_key, occurrence + 1)
      if (occurrence === 0) return base_key
      const cached = dup_key_cache.get(base_key) ?? []
      cached[occurrence - 1] ??= Symbol(`sms-dup-${occurrence}`)
      dup_key_cache.set(base_key, cached)
      return cached[occurrence - 1]
    }
  }
  // chips need the same: two selected entries can share a key (`value={['a', 'a']}`).
  // Symbols beat keying by index, which would defeat move detection on reorder.
  let chip_render_keys = $derived.by(() => {
    const next_render_key = render_key_assigner()
    return visible_chips.map(next_render_key)
  })

  // === Grouping ===
  function toggle_group_collapsed(group_name: string) {
    const was_collapsed = collapsed_groups.has(group_name)
    const updated = new SvelteSet(collapsed_groups)
    if (was_collapsed) updated.delete(group_name)
    else updated.add(group_name)
    collapsed_groups = updated
    on_group_toggle?.({ group: group_name, collapsed: !was_collapsed })
  }

  // exposed via bindable props
  collapse_all_groups = () => {
    const groups = grouped_options.flatMap(({ group }) => (group === null ? [] : [group]))
    if (groups.length === 0) return
    collapsed_groups = new SvelteSet(groups)
    on_collapse_all?.({ groups })
  }
  expand_all_groups = () => {
    const groups = [...collapsed_groups]
    if (groups.length === 0) return
    collapsed_groups = new SvelteSet()
    on_expand_all?.({ groups })
  }

  function expand_groups(groups_to_expand: string[]) {
    if (groups_to_expand.length === 0) return
    const updated = new SvelteSet(collapsed_groups)
    for (const group of groups_to_expand) updated.delete(group)
    collapsed_groups = updated
    for (const group of groups_to_expand) {
      on_group_toggle?.({ group, collapsed: false })
    }
  }

  const get_collapsed_with_matches = () =>
    grouped_options.flatMap(({ group, collapsed }) =>
      group !== null && collapsed ? [group] : [],
    )

  // auto-expand groups whose options match. Reacts only to search-text changes, else a
  // group the user collapses mid-search is instantly re-expanded.
  let prev_expand_search = ``
  $effect(() => {
    const search = has_search_text ? search_text : ``
    const search_changed = search !== prev_expand_search
    prev_expand_search = search
    if (
      search_expands_collapsed_groups &&
      collapsible_groups &&
      search &&
      search_changed
    ) {
      untrack(() => expand_groups(get_collapsed_with_matches()))
    }
  })

  const placeholder_text = $derived(
    typeof placeholder === `string` ? placeholder : (placeholder?.text ?? null),
  )
  const placeholder_persistent = $derived(
    typeof placeholder === `object` && placeholder?.persistent === true,
  )

  // Both callers pass a fresh array, so sorting cannot mutate the current selection.
  function sort_selection(items: Option[]): Option[] {
    if (sort_selected === true) {
      items.sort((opt_1, opt_2) => label_of(opt_1).localeCompare(label_of(opt_2)))
    } else if (typeof sort_selected === `function`) items.sort(sort_selected)
    return items
  }

  // Revalidate reactive props and remote option groups after mount.
  $effect(() => validate_config(has_grouped_options))

  const resolved_create_msg = $derived(
    typeof create_option_msg === `function`
      ? create_option_msg({
          search_text,
          selected,
          options: effective_options,
          matching_options,
        }) || null
      : (create_option_msg ?? null),
  )

  // active state of the user-message <li> (dupe / create / no-match)
  let is_user_message_active = $state(false)

  // when loading remotely effective_options is already filtered (locals by matches_search,
  // batches by the server), so only the static list needs filtering here
  const searched_options = $derived(
    load_options
      ? effective_options
      : effective_options.filter((opt) => matches_search(opt, effective_filter_text)),
  )

  $effect.pre(() => {
    matching_options = searched_options.filter(
      (opt) =>
        !selected_keys_set.has(key(opt)) ||
        Boolean(duplicates) ||
        keep_selected_in_dropdown ||
        input_text_is_committed,
    )
  })

  // Range selection includes a selected anchor that has left matching_options, while
  // preserving the grouped/sorted order and collapsed-group visibility of the dropdown.
  const range_navigable_options = $derived(
    flatten_navigable(group_options(searched_options)),
  )

  // plain (non-reactive) trackers: the effect below compares against the previous run
  let previous_active_index = active_index
  let previous_active_option = active_option
  // svelte-ignore state_referenced_locally
  let previous_filter_text = effective_filter_text

  // Keep active state valid and preserve option identity across regrouping/refreshes.
  $effect(() => {
    if (is_user_message_active) {
      if (has_user_message) active_index = visible_navigable_count
      else {
        is_user_message_active = false
        active_index = null
      }
    }
    if (
      active_index !== null &&
      !is_user_message_active &&
      (navigable_options[active_index] === undefined ||
        active_index >= visible_navigable_count)
    ) {
      active_index = null
    }
    const index_changed = active_index !== previous_active_index
    const option_changed = active_option !== previous_active_option
    const filter_changed = effective_filter_text !== previous_filter_text
    if (!index_changed && (!filter_changed || option_changed) && active_option !== null) {
      const previous_option = active_option
      let preserved_idx =
        active_index !== null &&
        Object.is(rendered_options[active_index], previous_option) &&
        !is_disabled(previous_option)
          ? active_index
          : rendered_options.findIndex(
              (candidate) =>
                Object.is(candidate, previous_option) && !is_disabled(candidate),
            )
      if (preserved_idx === -1) {
        const active_key = key(previous_option)
        for (const [candidate_idx, candidate] of rendered_options.entries()) {
          if (key(candidate) !== active_key || is_disabled(candidate)) continue
          if (preserved_idx !== -1) {
            preserved_idx = -1
            break
          }
          preserved_idx = candidate_idx
        }
      }
      active_index = preserved_idx === -1 ? null : preserved_idx
    }
    const current_option = rendered_options[active_index ?? -1]
    const should_auto_activate =
      active_index === null ||
      (!is_user_message_active &&
        (current_option === undefined || is_disabled(current_option))) ||
      (filter_changed && !option_changed)
    // only while open: a collapsed combobox with an active option would select it on
    // Enter instead of reopening, and point aria-activedescendant at a hidden row
    if (auto_active_first_option && open && should_auto_activate) {
      const first_enabled_idx = rendered_options.findIndex(
        (candidate) => !is_disabled(candidate),
      )
      active_index = first_enabled_idx === -1 ? null : first_enabled_idx
      if (first_enabled_idx !== -1) is_user_message_active = false
    }
    active_option = is_user_message_active
      ? null
      : (navigable_options[active_index ?? -1] ?? null)
    previous_active_index = active_index
    previous_active_option = active_option
    previous_filter_text = effective_filter_text
  })

  // mirrors the template's render condition: aria-controls must not name a missing id
  const listbox_rendered = $derived(
    Boolean(
      (has_search_text && no_matching_options_msg) ||
      effective_options.length ||
      load_options,
    ),
  )

  // Selected chips are plain list items, so left/right chip highlighting stays visual.
  const user_message_id = $derived(`${base_id}-user-msg`)
  // the header is presentational, so its options cite this id as their description
  const group_header_id = (group_name: string) =>
    `${base_id}-group-${encodeURIComponent(group_name)}`
  const active_option_id = $derived(
    is_user_message_active
      ? user_message_id
      : active_index !== null && active_index < navigable_options.length
        ? `${base_id}-opt-${active_index}`
        : undefined,
  )

  // false once removing would drop selected below min_select
  const can_remove = $derived(min_select === null || selected.length > min_select)
  // Single mode replaces rather than blocks, so it never counts as at-capacity. Called
  // again after an async on_create resolves.
  const at_max_capacity = () =>
    max_select !== null && mode !== `single` && selected.length >= max_select

  // merges a per-option style with the matching li*Style prop
  const merge_styles = (
    opt: Option,
    style_key: `selected` | `option`,
    extra_style: string | null,
  ) => [utils.get_style(opt, style_key), extra_style].filter(Boolean).join(` `) || null

  function get_option_view(option_item: Option) {
    const {
      label,
      disabled: option_disabled = null,
      title = null,
      selected_title = null,
      disabled_title = default_disabled_title,
    } = utils.is_object(option_item) ? option_item : { label: option_item }
    return {
      disabled: option_disabled,
      title,
      selected_title,
      disabled_title,
      // `active` deliberately stays out of this object: it's the only field tracking
      // `active_index`, and bundling it re-rendered every row on each arrow key
      selected: is_option_selected(option_item, label),
      style: merge_styles(option_item, `option`, li_option_style),
    }
  }

  // === Selection mutations ===
  // keep_selected_in_dropdown mode
  function toggle_option(option_to_toggle: Option, event: Event) {
    if (has_selected_option(option_to_toggle)) {
      if (can_remove) remove(option_to_toggle, event)
    } else void add(option_to_toggle, event)
  }

  // true while an async on_create callback is pending, blocks further create attempts
  let creating_option = $state(false)

  function add(option_to_add: Option, event: Event, from_paste = false) {
    event.stopPropagation()
    if (!is_non_empty_option(option_to_add)) {
      throw new TypeError(
        `MultiSelect: cannot add an empty option, got ${JSON.stringify(option_to_add)}`,
      )
    }
    return add_valid_option(option_to_add, event, from_paste)
  }

  // from_paste skips option reconstruction so parse_paste() objects keep extra fields
  // (value/group/metadata) instead of being stripped
  async function add_valid_option(
    option_to_add: Option,
    event: Event,
    from_paste = false,
  ) {
    if (
      !isNaN(Number(option_to_add)) &&
      (typeof option_to_add !== `string` || option_to_add.trim().length > 0) &&
      typeof selected_labels[0] === `number`
    ) {
      option_to_add = Number(option_to_add) as Option
    }

    // dupe check by key, not reference: Svelte proxies break identity. The label check adds
    // user-typed options, or all of them when duplicates='case-insensitive'.
    const option_key = key(option_to_add)
    const is_from_options = effective_options.some((opt) => key(opt) === option_key)
    const is_user_option =
      !is_from_options &&
      [true, `append`].includes(allow_user_options) &&
      (has_search_text || from_paste)
    const check_label = duplicates === `case-insensitive` || !is_from_options
    // closure so the guard can be re-evaluated after an async on_create resolves
    const is_dupe = () =>
      selected_keys_set.has(key(option_to_add)) ||
      (check_label && is_label_selected(label_of(option_to_add)))
    const is_duplicate = is_dupe()
    const max_reached = at_max_capacity()
    // events for blocked adds (the redundant null check narrows max_select for TS)
    if (max_reached && max_select !== null) {
      should_wiggle = true
      on_max_reached?.({ selected, max_select, attempted_option: option_to_add })
    }
    if (is_duplicate && duplicates !== true) on_duplicate?.({ option: option_to_add })

    if (max_reached || (duplicates !== true && is_duplicate)) return
    // This also prevents adding the same custom option twice in append mode.
    if (is_user_option) {
      if (!(from_paste && typeof option_to_add === `object`)) {
        const label_text = from_paste ? label_of(option_to_add) : search_text
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
      // Fire on_create — return false to reject, return Option to transform
      if (creating_option) return // an async on_create is already pending
      type CreateResult = false | Option | undefined
      let oncreate_result: CreateResult
      let was_async = false
      try {
        const raw_result = on_create?.({ option: option_to_add })
        // await thenables, not just native Promises, else a non-native promise gets added
        // as an option object
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
        // sync throws too: this function is async, so an uncaught throw would surface as an
        // unhandled rejection in non-awaiting event handlers
        const failure = was_async ? `promise rejected` : `threw`
        console.error(`MultiSelect: on_create ${failure}:`, error)
        return
      }
      if (oncreate_result === false) return
      if (is_non_empty_option(oncreate_result)) option_to_add = oncreate_result
      // Transformations and consumer callbacks can change identity or selection synchronously too.
      if (at_max_capacity() || (is_dupe() && duplicates !== true)) {
        return
      }
    }

    // Finish fallible consumer sorting before mutating editor state.
    const next_selected =
      mode === `single` ? [option_to_add] : sort_selection([...selected, option_to_add])
    if (is_user_option && allow_user_options === `append`) {
      if (loader.config) loader.options = [...loader.options, option_to_add]
      else options = [...options, option_to_add]
    }
    if (input_display) search_text = label_of(option_to_add)
    else if (reset_filter_on_add) search_text = ``
    set_selection(next_selected)

    clear_validity()
    handle_dropdown_after_select(event)
    announce(msg.option_selected(label_of(option_to_add)))
    on_add?.({ option: option_to_add, selected })
    on_change?.({ option: option_to_add, type: `add` })
  }

  // at_idx overrides findIndex lookup so duplicates=true removes the correct occurrence
  function remove(option_to_drop: Option, event: Event, at_idx?: number) {
    event.stopPropagation()
    if (selected.length === 0) return
    highlighted_idx = null

    const idx =
      at_idx ??
      selected.findIndex((opt) =>
        duplicates === true
          ? is_same_option(opt, option_to_drop)
          : key(opt) === key(option_to_drop),
      )
    let option_removed = selected[idx]

    if (option_removed === undefined && allow_user_options) {
      // not found but allow_user_options is on, so assume the user created it and rebuild an
      // option object for the event payload
      const is_object_option = typeof effective_options[0] === `object`
      option_removed = (
        is_object_option ? { label: option_to_drop } : option_to_drop
      ) as Option
    }
    if (option_removed === undefined) {
      throw new Error(
        `MultiSelect: cannot remove option ${JSON.stringify(option_to_drop)} because it is not selected`,
      )
    }

    set_selection(selected.filter((_, remove_idx) => remove_idx !== idx))
    clear_validity()
    announce(msg.option_removed(label_of(option_removed)))
    on_remove?.({ option: option_removed, selected })
    on_change?.({ option: option_removed, type: `remove` })
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
      // skipped for FocusEvents, which already focused the input
      input?.focus()
    }
    on_open?.({ event })
  }

  let suppress_next_focus_open = false

  // the removal unmounts the button that ran it, dropping focus to <body>. Hand focus back
  // to the input, but only once Svelte has flushed and only if it was genuinely lost.
  const with_focus_rescue = (handler: (event: Event) => void) => (event: Event) => {
    const button = event.currentTarget
    handler(event)
    void tick().then(() => {
      if (button instanceof HTMLElement && button.isConnected) return
      const active = document.activeElement
      if (!active || active === document.body) focus_input_without_open()
    })
  }

  function focus_input_without_open(only_if_internal = false) {
    const active_element = document.activeElement
    const focus_is_internal =
      active_element instanceof Node &&
      (outer_div?.contains(active_element) || options_list_el?.contains(active_element))
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
    active_index = null
    is_user_message_active = false
    on_close?.({ event })
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
    if (!input_display) search_text = ``
  }

  function handle_invalid() {
    invalid = true
    const min_required = Number(required)
    const validity_msg =
      max_select && max_select > 1 && min_required > 1
        ? msg.select_between(min_required, max_select)
        : min_required > 1
          ? msg.select_at_least(min_required)
          : msg.select_an_option
    form_input?.setCustomValidity(validity_msg)
  }

  function handle_dropdown_after_select(event: Event) {
    const reached_max = selected.length >= (max_select ?? Infinity)
    const window_width = globalThis.innerWidth
    const should_close =
      close_dropdown_on_select === true ||
      close_dropdown_on_select === `retain-focus` ||
      (close_dropdown_on_select === `if-mobile` &&
        window_width &&
        window_width < breakpoint)
    if (reached_max || should_close) {
      close_dropdown(event, close_dropdown_on_select === `retain-focus`)
    } else input?.focus()
  }

  const user_message = $derived.by(
    (): { type: `dupe` | `create` | `no-match`; msg: string } | null => {
      if (!has_search_text || input_text_is_committed || show_all_input_options)
        return null
      if (duplicates !== true && is_label_selected(search_text)) {
        // a blank message must not leave a navigable row that blocks the create row
        return duplicate_option_msg ? { type: `dupe`, msg: duplicate_option_msg } : null
      }
      if (load_options_pending) return null
      if (allow_user_options && resolved_create_msg) {
        return { type: `create`, msg: resolved_create_msg }
      }
      return !load_error && navigable_options.length === 0 && no_matching_options_msg
        ? { type: `no-match`, msg: no_matching_options_msg }
        : null
    },
  )
  const has_user_message = $derived(user_message !== null)

  // === Keyboard and pointer handlers ===
  // navigable_options skips collapsed groups
  async function handle_arrow_navigation(direction: 1 | -1, event?: KeyboardEvent) {
    if (range_select) {
      // anchors on the pre-move position, so an unmodified navigation drops the anchor and
      // the next Shift+Arrow extends from the cursor, not a range navigated away from
      if (!event?.shiftKey) range_anchor = null
      else if (range_anchor === null && active_option) {
        range_anchor = { option: active_option, idx: active_index }
      }
    }

    if (
      keyboard_expands_collapsed_groups &&
      collapsible_groups &&
      collapsed_groups.size > 0
    ) {
      expand_groups(get_collapsed_with_matches())
      await tick()
    }

    // toggle user message when no options match but user can create
    if (user_message?.type === `create` && navigable_options.length === 0) {
      is_user_message_active = !is_user_message_active
      return
    }
    if (active_index === null && navigable_options.length === 0) return

    active_index = next_option_index(
      rendered_options,
      active_index,
      direction,
      has_user_message,
    )
    if (active_index === null) return

    is_user_message_active = has_user_message && active_index === visible_navigable_count
    active_option = is_user_message_active
      ? null
      : (navigable_options[active_index] ?? null)

    if (auto_scroll) {
      await tick()
      if (
        virtual_window &&
        options_list_el &&
        active_index !== null &&
        !is_user_message_active
      ) {
        // the active li may not be rendered in virtual mode, so scroll by row offset rather
        // than scrollIntoView, clamped to [row_bottom - viewport, row_top]
        const { item_height } = virtual_window
        const row_top = (option_row_indices[active_index] ?? active_index) * item_height
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

    // keyboard navigation only, not mouse hover
    on_activate?.({ option: active_option, index: active_index })
    if (event?.shiftKey && range_select && active_option)
      handle_option_interact(active_option, event, active_index)
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

  // keydown on the search input; option/header rows use if_enter_or_space instead
  async function handle_keydown(event: KeyboardEvent) {
    if (disabled) return
    // during an IME composition Enter confirms the composition and arrows move the
    // candidate window, so acting on them would hijack CJK text input
    if (event.isComposing) return
    const chip_navigation_enabled = !input_display && selected.length > 0 && !search_text

    if (
      run_shortcut(
        event,
        `select_all`,
        Boolean(select_all_option) &&
          navigable_options.length > 0 &&
          mode !== `single` &&
          !matching_scope_unavailable,
        () => select_all(event),
      ) ||
      run_shortcut(event, `clear_all`, chip_navigation_enabled, () =>
        remove_all(event),
      ) ||
      run_shortcut(event, `open`, !open, () => open_dropdown(event)) ||
      run_shortcut(event, `close`, open, () => close_and_clear(event))
    )
      return

    if (
      highlighted_idx !== null &&
      ![`ArrowLeft`, `ArrowRight`, `Backspace`].includes(event.key)
    )
      highlighted_idx = null

    // Keep the dropdown available when tabbing forward to its Retry button.
    if (event.key === `Tab` && load_error && !event.shiftKey) return
    if (event.key === `Escape` || event.key === `Tab`) {
      // a closed dropdown has nothing to dismiss, so the key belongs to the enclosing pane
      if (open) event.stopPropagation()
      close_and_clear(event)
    } else if (event.key === `Enter`) {
      event.stopPropagation()
      event.preventDefault() // prevent enter key from triggering form submission

      // != null (not truthiness) so a falsy numeric option like 0 can be selected via Enter
      if (active_option != null) {
        if (is_disabled(active_option)) return
        handle_option_interact(active_option, event, active_index)
      } else if (allow_user_options && has_search_text && !load_options_pending) {
        add(search_text as Option, event)
      } else {
        // no active option and no search text: the dropdown is closed, so Enter opens it
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
    }  // any other keypress while open activates the first matching option
    else if (open && navigable_options.length > 0 && active_index === null) {
      // no stopPropagation/preventDefault here, normal character input must go through
      const first_enabled_idx = rendered_options.findIndex(
        (candidate) => !is_disabled(candidate),
      )
      active_index = first_enabled_idx === -1 ? null : first_enabled_idx
    }
  }

  function remove_all(event: Event) {
    event.stopPropagation()
    highlighted_idx = null

    // keep the first min_select items (all removed when min_select is null)
    const keep_count = min_select ?? 0
    const removed_options = selected.slice(keep_count)
    if (removed_options.length === 0) return

    set_selection(selected.slice(0, keep_count))
    search_text = `` // always clear: reset_filter_on_add only governs adds
    announce(msg.options_removed(removed_options.length))
    on_remove_all?.({ options: removed_options })
    on_change?.({ options: selected, type: `remove_all` })
  }

  function apply_bulk_add(options_to_add: Option[], event: Event): Option[] {
    const unselected = get_unique_bulk_options(options_to_add)
    const remaining = Math.max(0, (max_select ?? Infinity) - selected.length)
    const added = unselected.slice(0, remaining)
    if (added.length > 0) {
      set_selection(sort_selection([...selected, ...added]))
      if (reset_filter_on_add) search_text = ``
      clear_validity()
      handle_dropdown_after_select(event)
      announce(msg.options_selected(added.length))
    }
    if (added.length < unselected.length && max_select !== null) {
      should_wiggle = true
      on_max_reached?.({
        selected,
        max_select,
        attempted_option: unselected[added.length],
      })
    }
    return added
  }

  // used by select_all and group select
  function batch_add_options(
    options_to_add: Option[],
    event: Event,
    scope?: SelectAllScope,
  ) {
    const added = apply_bulk_add(options_to_add, event)
    if (added.length > 0) {
      on_select_all?.({ options: added, scope })
      on_change?.({ options: selected, type: `select_all` })
    }
  }

  function get_unique_bulk_options(options_to_filter: Option[]): Option[] {
    if (duplicates === true) {
      const remaining_selected = new Map(
        [...selected_option_counts].map(([option_key, label_counts]) => [
          option_key,
          new Map(label_counts),
        ]),
      )
      return options_to_filter.filter((option_item) => {
        if (is_disabled(option_item)) return false
        const label_counts = remaining_selected.get(key(option_item))
        const label = utils.get_label(option_item)
        const count = label_counts?.get(label) ?? 0
        if (count === 0) return true
        label_counts?.set(label, count - 1)
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

  function select_all(event: Event) {
    event.stopPropagation()
    batch_add_options(select_all_candidates, event, select_all_scope)
  }

  function get_select_all_disabled_title(
    max_reached: boolean,
    all_selectable_selected: boolean,
  ) {
    // the prop wins even when the matching scope is unavailable: returning that message
    // first meant `null` couldn't suppress the title and nothing could replace it
    if (select_all_disabled_title === null) return ``
    // `max_reached` already implies a non-null max_select; the check re-narrows it for the label
    const default_title = matching_scope_unavailable
      ? msg.matching_scope_unavailable
      : max_reached && max_select !== null && !all_selectable_selected
        ? msg.max_select_reached(max_select)
        : msg.all_options_selected
    // the callback also gets the state behind `default_title`, so it can tell the three
    // disabled reasons apart or wrap the default instead of rebuilding it
    return typeof select_all_disabled_title === `function`
      ? select_all_disabled_title({
          max_reached,
          max_select,
          selected_count: selected.length,
          all_selectable_selected,
          matching_scope_unavailable,
          default_title,
        })
      : (select_all_disabled_title ?? default_title)
  }

  // works even when the group is collapsed
  function toggle_group_selection(
    selectable: Option[],
    all_selected: boolean,
    event: Event,
  ) {
    event.stopPropagation()
    if (all_selected) {
      // never drop below min_select, matching remove_all and per-chip removal
      const keys_to_remove = new Set(selectable.map((opt) => key(opt)))
      const identities_to_remove = duplicates === true ? count_options(selectable) : null
      const max_removals =
        min_select === null ? Infinity : Math.max(0, selected.length - min_select)
      const removed: Option[] = []
      const kept: Option[] = []
      for (const opt of selected) {
        const matches =
          duplicates === true
            ? (identities_to_remove?.get(key(opt))?.has(utils.get_label(opt)) ?? false)
            : keys_to_remove.has(key(opt))
        if (matches && removed.length < max_removals) {
          removed.push(opt)
        } else kept.push(opt)
      }
      if (removed.length === 0) return
      set_selection(kept)
      on_remove_all?.({ options: removed })
      on_change?.({ options: selected, type: `remove_all` })
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

  // true only when a range was actually selected; false tells the caller to do a plain add
  function select_range(
    target: Option,
    event: Event,
    target_idx_hint?: number | null,
  ): boolean {
    if (!multi_select) return false
    const visible_options = range_navigable_options
    // the hint indexes the dropdown rows, an order-preserving subsequence, so the real
    // position is at or after it; searching forward keeps indistinguishable rows on the
    // clicked occurrence. Scan back only if the hint overshot.
    const index_of = (option_to_find: Option, hint?: number | null): number => {
      const from = Math.min(hint ?? 0, visible_options.length)
      const match = (idx: number) => is_same_option(visible_options[idx], option_to_find)
      for (let idx = from; idx < visible_options.length; idx++) if (match(idx)) return idx
      for (let idx = from - 1; idx >= 0; idx--) if (match(idx)) return idx
      return -1
    }
    // a row past max_options or gone from the list can't be a range endpoint; report it
    // unhandled so the caller still does a plain add rather than swallowing the click
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
      on_range_select?.({ added, from: anchor_option, to: target, selected })
      on_change?.({ options: selected, type: `range_select` })
    }
    return true
  }

  // shared click/keyboard/range entry point for selecting an option
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
    // select_range reports false when there's no usable anchor
    if (range_select && extends_range && select_range(opt, event, option_idx)) return
    const selected_before = selected.length
    if (keep_selected_in_dropdown && !input_display) toggle_option(opt, event)
    else void add(opt, event)
    if (!range_select) return
    // anchor only on an add that landed: a rejected add or a toggle-off leaves no sensible
    // anchor, and a later Shift+click would extend from a stale position. max_select===1
    // replaces without growing `selected`, but multi_select is false there anyway.
    range_anchor =
      selected.length > selected_before ? { option: opt, idx: option_idx ?? null } : null
  }

  // === Drag, input, and paste handlers ===
  let drag_idx: number | null = $state(null)
  // chip index captured on dragstart, the authoritative drag source: a drop whose
  // text/plain doesn't match a drag started on THIS instance is foreign (page text, a chip
  // from another MultiSelect) and must not reorder
  let drag_start_idx: number | null = null
  const on_chip_drop = (target_idx: number) => (event: DragEvent) => {
    if (!event.dataTransfer) return
    event.dataTransfer.dropEffect = `move`
    // parseInt yields NaN for empty/foreign drag data; Number('') → 0 would move item 0
    // oxlint-disable-next-line unicorn/prefer-number-coercion
    const start_idx = parseInt(event.dataTransfer.getData(`text/plain`), 10)
    // NaN/mismatched data never equals the index captured on dragstart, so foreign drops
    // fall out here; the length check guards `selected` shrinking mid-drag
    if (start_idx !== drag_start_idx || start_idx >= selected.length) return
    drag_start_idx = null
    const previous = [...selected]
    const new_selected = [...selected]
    const [moved_option] = new_selected.splice(start_idx, 1)
    new_selected.splice(target_idx, 0, moved_option)
    set_selection(new_selected)
    drag_idx = null
    highlighted_idx = null
    on_reorder?.({ options: new_selected, previous })
    on_change?.({ options: new_selected, type: `reorder` })
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

  // shared props for before_input/after_input
  const input_snippet_props = $derived({
    selected,
    disabled,
    invalid,
    id,
    placeholder: placeholder_text,
    open,
    required,
    search_text,
  })

  // Clear the committed input-mode selection while preserving search_text as a draft
  function clear_input_committed_selection() {
    const option_removed = selected[0]
    if (option_removed === undefined) return
    set_selection([])
    clear_validity()
    announce(msg.option_removed(label_of(option_removed)))
    on_remove?.({ option: option_removed, selected })
    on_change?.({ option: option_removed, type: `remove` })
  }

  // clears before the value change so the input_committed_label → search_text sync effect
  // can't clobber the user's draft on the same tick (ordering matters in real browsers)
  const handle_input_beforeinput = () => {
    show_all_input_options = false
    if (input_committed_label !== null) clear_input_committed_selection()
  }

  const handle_input_input = (event: Event) => {
    show_all_input_options = false
    if (!open) open_dropdown(event, false, false)
    // fallback for input events fired without beforeinput (some programmatic value
    // setters); bind:value has already synced search_text
    if (input_committed_label !== null && search_text !== input_committed_label) {
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
    if (close_dropdown_on_select === `retain-focus`) event.preventDefault()
  }

  // patch input.focus() so programmatic focus also opens the dropdown
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
    // a portalled dropdown must not close on blur: its own clicks blur the input, and
    // closing first breaks option selection on touch
    // https://github.com/janosh/svelte-widgets/issues/335
    if (
      !portal_params?.active &&
      (!(event.relatedTarget instanceof Node) ||
        !outer_div?.contains(event.relatedTarget))
    )
      close_dropdown(event)

    onblur?.(event)
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
      // `text.split(',')` yields an empty entry for a trailing separator, and `add` throws
      // on those: the rejection would stop the loop, drop every later entry and skip
      // `on_parsed_paste`. Count them as rejected and carry on.
      if (!is_non_empty_option(parsed_option)) {
        rejected.push(parsed_option)
        continue
      }
      if (at_max_capacity() && max_select !== null) {
        overflow.push(parsed_option, ...parsed.slice(idx + 1))
        should_wiggle = true
        on_max_reached?.({ selected, max_select, attempted_option: parsed_option })
        break
      }
      const before = selected.length
      const before_first = mode === `single` ? selected[0] : undefined
      // add() only suspends on a pending async on_create (creating_option is set
      // synchronously), so awaiting just then keeps on_parsed_paste in the paste's own task
      const add_result = add(parsed_option, event, true)
      if (creating_option) await add_result
      if (
        selected.length > before ||
        (mode === `single` && selected[0] !== before_first)
      ) {
        added.push(parsed_option)
      } else rejected.push(parsed_option)
      if (mode === `single`) {
        overflow.push(...parsed.slice(idx + 1))
        break
      }
    }
    if (!input_display && reset_filter_on_add) search_text = ``
    on_parsed_paste?.({ added, rejected, overflow, raw_text: text })
  }

  // reset form validation when required prop changes
  // https://github.com/janosh/svelte-widgets/issues/285
  $effect.pre(() => {
    void required // register as dependency
    form_input?.setCustomValidity(``)
  })

  function handle_options_scroll(event: Event) {
    if (!(event.target instanceof HTMLElement)) return
    options_scroll_top = event.target.scrollTop
    loader.on_scroll(event)
  }
</script>

{#snippet render_label(opt: Option, idx: number, type: `selected` | `option`)}
  {#if children}
    {@render children({ option: opt, idx, type })}
  {:else}
    {utils.get_label(opt)}
  {/if}
{/snippet}

{#snippet render_expand_icon()}
  <span class="expand-icon" style="display: flex; align-items: center">
    {#if expand_icon}
      {@render expand_icon({ open, disabled })}
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
  icon_props: { option: Option; is_remove_all: false } | { is_remove_all: true },
)}
  {@const rescued = with_focus_rescue(handler)}
  <button
    onclick={rescued}
    onkeydown={if_enter_or_space(rescued)}
    type="button"
    {title}
    class={[`remove`, { 'remove-all': icon_props.is_remove_all }]}
    class:default-icon={!remove_icon}
  >
    {#if remove_icon}
      {@render remove_icon(icon_props)}
    {:else}
      <Icon icon={Cross} style="width: {icon_props.is_remove_all ? 17 : 15}px" />
    {/if}
  </button>
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -- the nested combobox input owns the interactive ARIA semantics -->
<div
  bind:this={outer_div}
  class:disabled
  class:single={mode === `single`}
  class:open
  class:invalid
  class:input-display={input_display}
  class={[`multiselect`, outer_div_class, rest.class]}
  onmouseup={open_dropdown}
  {@attach click_outside({
    enabled: open,
    // a portalled dropdown is no longer a descendant of this div
    inside: [options_list_el],
    dismiss_on,
    callback: (_node, _config, { event }) => close_dropdown(event),
  })}
  title={disabled ? disabled_input_title : null}
  data-id={id}
  tabindex="-1"
  {style}
>
  <!-- hidden control for validation and form submission; its value mirrors the selected
  options in chip mode and the visible text in input mode -->
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
  {#if expand_icon_position === `left`}
    {@render render_expand_icon()}
  {/if}
  <ul
    class={[`selected`, ul_selected_class]}
    aria-label={msg.selected_options}
    style={ul_selected_style}
  >
    {@render before_input?.(input_snippet_props)}
    {#if !input_display}
      {#each visible_chips as option, idx (chip_render_keys[idx])}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -- selected chips stay plain list items; nested buttons handle removal -->
        <li
          id="{base_id}-selected-{idx}"
          class={li_selected_class}
          class:highlighted={highlighted_idx === idx}
          animate:flip={selected_flip_params}
          draggable={selected_options_draggable && !disabled && selected.length > 1}
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
          style={merge_styles(option, `selected`, li_selected_style)}
          onmouseup={can_remove && !disabled
            ? (event) => event.stopPropagation()
            : undefined}
        >
          {#if selected_item}
            {@render selected_item({ option, idx })}
          {:else}
            {@render render_label(option, idx, `selected`)}
          {/if}
          {#if !disabled && can_remove}
            {@render remove_btn(
              (event) => remove(option, event, idx),
              msg.remove_option(remove_btn_title, label_of(option)),
              { option, is_remove_all: false },
            )}
          {/if}
        </li>
      {/each}
      {#if max_visible_chips !== null && selected.length > max_visible_chips}
        <li class="more-chip">
          <button
            type="button"
            class="more-chips"
            aria-expanded={is_chip_list_expanded}
            onclick={(event) => {
              event.stopPropagation()
              is_chip_list_expanded = !is_chip_list_expanded
              // clear a beyond-limit highlight, else the auto-expand effect undoes this
              // collapse instantly and "show less" is a no-op
              if (!is_chip_list_expanded) highlighted_idx = null
            }}
            onmouseup={(event) => event.stopPropagation()}
          >
            {is_chip_list_expanded ? msg.show_less : msg.more_chips(hidden_chip_count)}
          </button>
        </li>
      {/if}
    {/if}
    <input
      {...rest}
      {...input_props}
      class={input_class}
      style={input_style}
      bind:this={input}
      bind:value={search_text}
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
    {@render after_input?.(input_snippet_props)}
  </ul>
  {#if expand_icon_position === `right`}
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
    {#if disabled_icon}
      {@render disabled_icon()}
    {:else}
      <Icon
        icon={Disabled}
        style="width: 14pt; margin: 0 2pt"
        data-name="disabled-icon"
        aria-disabled="true"
      />
    {/if}
  {:else if !input_display && selected.length > 0}
    {#if max_select && (max_select > 1 || max_select_msg)}
      <Wiggle
        bind:wiggle={should_wiggle}
        angle={20}
        class={[`max-select-msg`, max_select_msg_class]}
      >
        {max_select_msg?.(selected.length, max_select)}
      </Wiggle>
    {/if}
    {#if mode !== `single` && selected.length > 1 && can_remove}
      {@render remove_btn(remove_all, remove_all_title, { is_remove_all: true })}
    {/if}
  {/if}

  {#if listbox_rendered}
    <ul
      {@attach fromAction(portal_action, () => ({
        target_node: outer_div,
        open,
        ...portal_params,
      }))}
      {@attach attach_highlight_matches({
        query: effective_filter_text,
        disabled: !highlight_matches,
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
      class={[`options`, ul_options_class, { hidden: !open }]}
      role="listbox"
      aria-multiselectable={multi_select}
      aria-disabled={disabled ? `true` : null}
      bind:this={options_list_el}
      bind:clientHeight={options_client_height}
      style={ul_options_style}
      onscroll={handle_options_scroll}
      onmousedown={prevent_retain_focus_blur}
    >
      {#if select_all_option && effective_options.length > 0 && multi_select}
        {@const max_reached = max_select !== null && selected.length >= max_select}
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
          class={[`select-all`, li_select_all_class, { disabled: all_selected }]}
          onclick={all_selected ? undefined : select_all}
          onkeydown={all_selected ? undefined : if_enter_or_space(select_all)}
          role="option"
          aria-selected={selected.length > 0 && all_selectable_selected}
          aria-disabled={all_selected || undefined}
          title={all_selected ? disabled_title : null}
          tabindex={all_selected ? -1 : 0}
        >
          {typeof select_all_option === `string` ? select_all_option : `Select all`}
        </li>
      {/if}
      <!-- option <li> shared by the virtual and non-virtual render paths. flat_idx comes in
        positionally so duplicate option values still get unique ids/posinset/hover indices -->
      {#snippet option_li(option_item: Option, flat_idx: number, group: string | null)}
        {@const view = get_option_view(option_item)}
        {@const is_active = active_index === flat_idx}
        {@const activate = () => {
          if (view.disabled) return
          // Release the user-message row so it cannot pin active_index during option focus.
          is_user_message_active = false
          active_index = flat_idx
        }}
        <li
          id="{base_id}-opt-{flat_idx}"
          onclick={(event) => handle_option_interact(option_item, event, flat_idx)}
          title={view.disabled
            ? view.disabled_title
            : (view.selected && view.selected_title) || view.title}
          class:selected={view.selected}
          class:active={is_active}
          class:disabled={view.disabled}
          class={[li_option_class, is_active && li_active_option_class]}
          onmousemove={activate}
          onfocus={activate}
          role="option"
          aria-selected={view.selected ? `true` : `false`}
          aria-disabled={view.disabled ? `true` : undefined}
          aria-describedby={group === null ? undefined : group_header_id(group)}
          aria-posinset={flat_idx + 1}
          aria-setsize={visible_navigable_count}
          style={view.style}
          onkeydown={if_enter_or_space((event) =>
            handle_option_interact(option_item, event, flat_idx),
          )}
        >
          {#if keep_selected_in_dropdown === `checkboxes`}
            <!-- suppressing the native toggle leaves the box driven only by `view.selected`;
                 the click still bubbles to the <li>, so a rejected toggle (max_select/min_select
                 reached, disabled option) can't leave the box flipped -->
            <input
              type="checkbox"
              class="option-checkbox"
              checked={view.selected}
              aria-label={msg.toggle_option(label_of(option_item))}
              tabindex="-1"
              onclick={(event) => event.preventDefault()}
            />
          {/if}
          {#if option}
            {@render option({
              option: option_item,
              idx: flat_idx,
              selected: view.selected,
              active: is_active,
              disabled: view.disabled ?? false,
            })}
          {:else}
            {@render render_label(option_item, flat_idx, `option`)}
          {/if}
        </li>
      {/snippet}
      <!-- group header <li> shared by the virtual and non-virtual render paths -->
      {#snippet group_header_li(row: OptionGroupRow<Option>)}
        {@const { group: group_name, options: group_opts, collapsed, selectable } = row}
        {@const all_selected =
          selectable.length > 0 && selectable.every(has_selected_option)}
        {@const selected_count = keep_selected_in_dropdown
          ? group_opts.filter(has_selected_option).length
          : 0}
        {@const handle_toggle = (event: Event) => {
          // the collapse button sits inside the header, whose own click also toggles
          event.stopPropagation()
          if (collapsible_groups) toggle_group_collapsed(group_name)
        }}
        {@const handle_group_select = (event: Event) =>
          toggle_group_selection(selectable, all_selected, event)}
        <!-- a listbox may only own `option`/`group` children, so this row is presentational
            and its options carry the group name via `aria-describedby`. `role="presentation"`
            is dropped if the element is focusable or has a global ARIA attribute, so this
            <li> must have neither — hence the nested <button> and no `aria-label`. -->
        <li
          class={[`group-header`, li_group_header_class]}
          class:collapsible={collapsible_groups}
          class:sticky={sticky_group_headers}
          role="presentation"
          style={li_group_header_style}
          onclick={handle_toggle}
        >
          <!-- a hidden span rather than the <li> itself, so screen readers get the group
              name alone, not the count, select-all button and chevron with it -->
          <span id={group_header_id(group_name)} class="sr-only">
            {msg.group(group_name)}
          </span>
          {#if group_header}
            {@render group_header({
              group: group_name,
              options: group_opts,
              collapsed,
            })}
          {:else}
            <span class="group-label">{group_name}</span>
            <span class="group-count">
              {msg.group_count(selected_count, group_opts.length)}
            </span>
            {#if group_select_all && multi_select}
              {@const group_blocked =
                !all_selected && (at_max_capacity() || selectable.length === 0)}
              <button
                type="button"
                class={[`group-select-all`, { deselect: all_selected }]}
                disabled={group_blocked}
                onclick={handle_group_select}
                onkeydown={if_enter_or_space(handle_group_select)}
              >
                {all_selected ? msg.group_deselect_all : msg.group_select_all}
              </button>
            {/if}
            {#if collapsible_groups}
              <button
                type="button"
                class="group-collapse-toggle"
                aria-expanded={!collapsed}
                aria-label={msg.group(group_name)}
                onclick={handle_toggle}
              >
                <Icon icon={collapsed ? ChevronRight : ChevronDown} style="width: 12px" />
              </button>
            {/if}
          {/if}
        </li>
      {/snippet}
      <OptionRows rows={render_rows} window={virtual_window}>
        {#snippet children(row)}
          {#if row.kind === `option`}
            {@render option_li(row.option, row.flat_idx, row.group)}
          {:else}
            {@render group_header_li(row)}
          {/if}
        {/snippet}
      </OptionRows>
      {#if user_message && user_message.msg}
        {@const { type: msg_type, msg: user_msg_text } = user_message}
        {@const can_add_user_option = msg_type === `create`}
        {@const handle_create = (event: Event) =>
          can_add_user_option && add(search_text as Option, event)}
        <li
          id={user_message_id}
          onclick={handle_create}
          onkeydown={can_add_user_option ? if_enter_or_space(handle_create) : undefined}
          title={msg_type !== `no-match` ? user_msg_text : ``}
          class:active={is_user_message_active}
          onmousemove={() => (is_user_message_active = true)}
          onfocus={() => (is_user_message_active = true)}
          onmouseout={() => (is_user_message_active = false)}
          onblur={() => (is_user_message_active = false)}
          role="option"
          aria-selected="false"
          class={[
            `user-msg`,
            li_user_msg_class,
            is_user_message_active && li_active_user_msg_class,
          ]}
          style:cursor={{
            dupe: `not-allowed`,
            create: `pointer`,
            'no-match': `default`,
          }[msg_type]}
        >
          {#if user_msg}
            {@render user_msg({ search_text, msg_type, msg: user_msg_text })}
          {:else}
            {user_msg_text}
          {/if}
        </li>
      {/if}
      {#if loader.config && loader.loading}
        <li class="loading-more" role="status" aria-label={msg.loading_more}>
          <CircleSpinner />
        </li>
      {/if}
    </ul>
  {/if}
  {#if open && load_error}
    <div class="load-error" style="flex-basis: 100%">
      <span role="alert">{msg.loading_failed}</span>
      <button
        type="button"
        {disabled}
        onclick={with_focus_rescue(() => {
          void loader.load(!loader.options.length)
        })}>{msg.retry}</button
      >
    </div>
  {/if}
  <!-- live region: selection changes, else available option count while open -->
  <div class="sr-only" aria-live="polite" aria-atomic="true">
    {#if last_announcement}
      {#key last_announcement.id}{last_announcement.text}{/key}
    {:else if open}
      {msg.options_available(matching_options.length)}
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

  /* :where() so user class props (outer_div_class, ul_selected_class, li_selected_class) win
     https://github.com/janosh/svelte-widgets/issues/380 */
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
    /* pairs with the light-dark() background so the widget stays readable on dark pages
       that never declare color-scheme. Set --sms-text-color: inherit to blend in instead. */
    color: var(--sms-text-color, light-dark(#222, #eee));
    font-size: var(--sms-font-size, inherit);
    min-height: var(--sms-min-height, 20.5pt);
    margin: var(--sms-margin);
  }
  :where(div.multiselect.open) {
    /* so an open dropdown covers the MultiSelect below it on the page */
    z-index: var(--sms-open-z-index, 4);
  }
  :where(div.multiselect:has(> .load-error)) {
    flex-wrap: wrap;
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
    margin: 1.25pt 2pt;
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
  /* "+N more" toggle, rendered when max_visible_chips collapses overflow */
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

  /* with the placeholder hidden the input must not pad out div.multiselect's width */
  :where(
    div.multiselect:not(.input-display) > ul.selected > input:not(:placeholder-shown)
  ) {
    min-width: 1px; /* Minimal width to remain interactive */
  }

  /* not wrapped in :is(): browser defaults then outweigh it on specificity */
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

  /* :where() so class props (ul_options_class, li_option_class, li_user_msg_class) win */
  :where(ul.options) {
    list-style: none;
    /* the portal manages top/left/width/position when active (fixed while open); these are
       the defaults for the non-portalled and initial states */
    position: absolute;
    top: 100%;
    /* deliberately physical: at width 100% left/right anchoring is identical, and a logical
       inset would resolve to `right` in RTL, over-constraining the portal's fixed `left` */
    left: 0;
    width: 100%;
    z-index: var(--sms-options-z-index, 3);
    overflow: auto;
    transition:
      opacity 0.2s,
      transform 0.2s,
      visibility 0.2s;
    box-sizing: border-box;
    background: var(--sms-options-bg, light-dark(#fcfcfc, #222226));
    /* portalling moves the dropdown to document.body, where it no longer inherits
       div.multiselect's color */
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
    /* fixed keeps the hidden dropdown out of ancestor scrollHeight, which absolute extends */
    position: fixed;
  }
  :where(ul.options > li) {
    padding: var(--sms-options-li-padding, 2pt 1ex);
    cursor: pointer;
    scroll-margin: var(--sms-options-scroll-margin, 100px);
    border-inline-start: 1px solid transparent;
  }
  :where(ul.options .user-msg) {
    /* block so vertical padding applies to the span */
    display: block;
    /* tracks ul.options > li so this row is no taller than an option */
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
  /* keep_selected_in_dropdown='checkboxes' */
  :is(ul.options > li > input.option-checkbox) {
    width: 16px;
    height: 16px;
    margin-inline-end: 6px;
    accent-color: var(--sms-active-color, cornflowerblue);
  }
  /* :where() — has the li_select_all_class prop */
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
  /* :where() — has the li_group_header_class prop */
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
  /* the chevron is a real button now, so it needs the <li>'s own look, not a control's */
  :is(ul.options > li.group-header button.group-collapse-toggle) {
    display: flex;
    align-items: center;
    margin-inline-start: auto;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    cursor: pointer;
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
  :where(ul.options > li.group-header.sticky) {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(
      --sms-group-header-sticky-bg,
      var(--sms-options-bg, light-dark(#fcfcfc, #222226))
    );
  }
  /* indent options so groups read as a hierarchy */
  :where(
    ul.options > li:not(.group-header):not(.select-all):not(.user-msg):not(.loading-more)
  ) {
    padding-inline-start: var(
      --sms-group-item-padding-left,
      var(--sms-group-option-indent, 1.5ex)
    );
  }
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
