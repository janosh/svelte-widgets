// Default user-facing strings for every widget that renders text of its own.
//
// Each component takes a `labels` prop accepting a partial of its label record, shallow-merged
// over the defaults below, so a caller can translate or reword any string without forking the
// component. Entries that interpolate a count or a name are functions rather than templates so
// locales can control word order and their own plural rules (see https://github.com/janosh/svelte-widgets/issues/451).
//
// Strings already covered by a dedicated prop (MultiSelect's `removeBtnTitle`,
// `noMatchingOptionsMsg`, `selectAllDisabledTitle`, `selectAllOption`, Toc's `title`, ...) are
// deliberately absent, and so are non-string bits of chrome: icons keep their own `icons` prop.
//
// Every record declares its defaults and derives its type from them, so the two cannot drift.

// English plural of `noun`. Only the defaults below use it — an override brings its own
// locale's rules, which is why every count-bearing entry is a function.
const plural = (count: number, noun: string) => (count === 1 ? noun : `${noun}s`)

// keyed by ActionState; per-state icons live in ActionButton's separate `icons` prop
export const ACTION_BUTTON_LABELS = {
  ready: `Run`,
  pending: `Working…`,
  success: `Done`,
  error: `Failed`,
}
export type ActionButtonLabels = typeof ACTION_BUTTON_LABELS

export const BUTTON_GROUP_LABELS = {
  // aria-label on the sort-direction button, naming the current order and what a press does
  sort_ascending: `Sorted ascending, activate to sort descending`,
  sort_descending: `Sorted descending, activate to sort ascending`,
}
export type ButtonGroupLabels = typeof BUTTON_GROUP_LABELS

export const CODE_EDITOR_LABELS = {
  // visually hidden hint announced when the textarea takes focus
  keyboard_help: `Press Escape, then Tab to move focus away`,
}
export type CodeEditorLabels = typeof CODE_EDITOR_LABELS

export const CODE_EXAMPLE_LABELS = {
  show_code: `View code`,
  hide_code: `Close`,
}
export type CodeExampleLabels = typeof CODE_EXAMPLE_LABELS

export const DIFF_VIEW_LABELS = {
  diffing: (filename: string) => `Diffing ${filename}...`,
  prev_change: `Previous change`,
  next_change: `Next change`,
  side_by_side: `Side by side`,
  unified: `Unified`,
  // shown when the word-level refinement budget ran out before the whole diff was refined
  truncated: `Word-level highlighting is incomplete: the diff hit its refinement budget. Line-level changes are still exact.`,
  empty_file: `Empty file`,
  no_changes: `No changes`,
  identical: (old_label: string, new_label: string, line_count: number) =>
    `${old_label} and ${new_label} are identical (${line_count} ${plural(line_count, `line`)}).`,
  diff_region: (old_label: string, new_label: string) =>
    `${old_label} → ${new_label} diff`,
  // label of the button that expands a collapsed run of unchanged lines
  unchanged_lines: (count: number) => `⋯ ${count} unchanged ${plural(count, `line`)}`,
}
export type DiffViewLabels = typeof DIFF_VIEW_LABELS

export const DRAGGABLE_PANE_LABELS = {
  reset_position: `Reset pane position`,
  // close_pane titles both the header's close button and the toggle in its open state
  close_pane: `Close pane`,
  open_pane: `Open pane`,
}
export type DraggablePaneLabels = typeof DRAGGABLE_PANE_LABELS

export const FILE_DETAILS_LABELS = {
  open_all: `Open all`,
  close_all: `Close all`,
}
export type FileDetailsLabels = typeof FILE_DETAILS_LABELS

export const FIND_BAR_LABELS = {
  // `scope` is the FindBar `label` prop, e.g. 'page' or 'settings'. Names both the
  // search region and, suffixed with an ellipsis, the input placeholder.
  find_in: (scope: string) => `Find in ${scope}`,
  prev_match: `Previous match`,
  next_match: `Next match`,
  // tooltip pairing a step button's label with its keyboard shortcut
  match_shortcut: (match_label: string, shortcut: string) =>
    `${match_label} (${shortcut})`,
  close: (scope: string) => `Close ${scope} search`,
  close_shortcut: `Close (Escape)`,
}
export type FindBarLabels = typeof FIND_BAR_LABELS

// key names mirror FullscreenButton's `icons` prop, so the two stay overridable in step
export const FULLSCREEN_BUTTON_LABELS = {
  enter: `Enter fullscreen`,
  exit: `Exit fullscreen`,
}
export type FullscreenButtonLabels = typeof FULLSCREEN_BUTTON_LABELS

export const MULTI_SELECT_LABELS = {
  // chip overflow toggle rendered when maxVisibleChips collapses selected chips
  more_chips: (hidden_count: number) => `+${hidden_count} more`,
  show_less: `show less`,
  // aria-label on the <ul> holding selected chips
  selected_options: `selected options`,
  // composed from the removeBtnTitle prop and the option's label
  remove_option: (remove_btn_title: string, option_label: string) =>
    `${remove_btn_title} ${option_label}`,
  // select-all row is inert while selectAllScope is 'matching' and options come from loadOptions
  matching_scope_unavailable: `Matching select-all is only available with local options`,
  group: (group_name: string) => `Group: ${group_name}`,
  group_count: (selected_count: number, total_count: number) =>
    selected_count > 0 ? `(${selected_count}/${total_count})` : `(${total_count})`,
  group_select_all: `Select all`,
  group_deselect_all: `Deselect all`,
  // aria-label on the per-option checkbox in keepSelectedInDropdown='checkboxes' mode
  toggle_option: (option_label: string) => `Toggle ${option_label}`,
  loading_more: `Loading more options`,
  // live-region announcements
  option_selected: (option_label: string) => `${option_label} selected`,
  option_removed: (option_label: string) => `${option_label} removed`,
  options_selected: (count: number) => `${count} ${plural(count, `option`)} selected`,
  options_removed: (count: number) => `${count} ${plural(count, `option`)} removed`,
  options_available: (count: number) => `${count} ${plural(count, `option`)} available`,
  // setCustomValidity text surfaced by the browser on failed form submit
  select_between: (min: number, max: number) =>
    `Please select between ${min} and ${max} options`,
  select_at_least: (min: number) => `Please select at least ${min} options`,
  select_an_option: `Please select an option`,
}
export type MultiSelectLabels = typeof MULTI_SELECT_LABELS

export const NAV_LABELS = {
  toggle_submenu: (route_label: string) => `Toggle ${route_label} submenu`,
}
export type NavLabels = typeof NAV_LABELS

export const SETTINGS_SEARCH_LABELS = {
  clear_search: `Clear settings search`,
  // status-region text when the query matches no setting
  no_matches: (query: string) => `No settings match “${query}”.`,
}
export type SettingsSearchLabels = typeof SETTINGS_SEARCH_LABELS

export const SETTINGS_SECTION_LABELS = {
  explain: `Explain`,
  // aria-label on the Explain toggle; `open` is the state the button is currently in
  explain_toggle: (open: boolean, section_title: string) =>
    `${open ? `Hide` : `Show`} descriptions for ${section_title.toLowerCase()}`,
  reset: `Reset`,
  reset_section: (section_title: string) =>
    `Reset ${section_title.toLowerCase()} to defaults`,
  // title/aria-label of the per-row reset button injected when on_reset_key is set
  reset_key: (setting_key: string) => `Reset ${setting_key} to default`,
}
export type SettingsSectionLabels = typeof SETTINGS_SECTION_LABELS

export const TOAST_LABELS = {
  // visually hidden count of queued toasts waiting behind the visible one
  pending: (count: number) => `${count} more ${plural(count, `notification`)} pending`,
}
export type ToastLabels = typeof TOAST_LABELS
