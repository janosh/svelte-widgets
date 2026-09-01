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

// English plural of `noun`. Only the defaults below use it — an override brings its own
// locale's rules, which is why every count-bearing entry is a function.
const plural = (count: number, noun: string) => (count === 1 ? noun : `${noun}s`)

// keyed by ActionState; per-state icons live in ActionButton's separate `icons` prop
export type ActionButtonLabels = {
  ready: string
  pending: string
  success: string
  error: string
}

export const ACTION_BUTTON_LABELS: ActionButtonLabels = {
  ready: `Run`,
  pending: `Working…`,
  success: `Done`,
  error: `Failed`,
}

export type ButtonGroupLabels = {
  // aria-label on the sort-direction button, naming the current order and what a press does
  sort_ascending: string
  sort_descending: string
}

export const BUTTON_GROUP_LABELS: ButtonGroupLabels = {
  sort_ascending: `Sorted ascending, activate to sort descending`,
  sort_descending: `Sorted descending, activate to sort ascending`,
}

export type CodeEditorLabels = {
  // visually hidden hint announced when the textarea takes focus
  keyboard_help: string
}

export const CODE_EDITOR_LABELS: CodeEditorLabels = {
  keyboard_help: `Press Escape, then Tab to move focus away`,
}

export type CodeExampleLabels = {
  show_code: string
  hide_code: string
}

export const CODE_EXAMPLE_LABELS: CodeExampleLabels = {
  show_code: `View code`,
  hide_code: `Close`,
}

export type DiffViewLabels = {
  diffing: (filename: string) => string
  prev_change: string
  next_change: string
  side_by_side: string
  unified: string
  // shown when the word-level refinement budget ran out before the whole diff was refined
  truncated: string
  empty_file: string
  no_changes: string
  identical: (old_label: string, new_label: string, line_count: number) => string
  diff_region: (old_label: string, new_label: string) => string
  // label of the button that expands a collapsed run of unchanged lines
  unchanged_lines: (count: number) => string
}

export const DIFF_VIEW_LABELS: DiffViewLabels = {
  diffing: (filename) => `Diffing ${filename}...`,
  prev_change: `Previous change`,
  next_change: `Next change`,
  side_by_side: `Side by side`,
  unified: `Unified`,
  truncated: `Word-level highlighting is incomplete: the diff hit its refinement budget. Line-level changes are still exact.`,
  empty_file: `Empty file`,
  no_changes: `No changes`,
  identical: (old_label, new_label, line_count) =>
    `${old_label} and ${new_label} are identical (${line_count} ${plural(line_count, `line`)}).`,
  diff_region: (old_label, new_label) => `${old_label} → ${new_label} diff`,
  unchanged_lines: (count) => `⋯ ${count} unchanged ${plural(count, `line`)}`,
}

export type DraggablePaneLabels = {
  reset_position: string
  close_pane: string
}

export const DRAGGABLE_PANE_LABELS: DraggablePaneLabels = {
  reset_position: `Reset pane position`,
  close_pane: `Close pane`,
}

export type FileDetailsLabels = {
  open_all: string
  close_all: string
}

export const FILE_DETAILS_LABELS: FileDetailsLabels = {
  open_all: `Open all`,
  close_all: `Close all`,
}

export type FindBarLabels = {
  // `scope` is the FindBar `label` prop, e.g. 'page' or 'settings'. Names both the
  // search region and, suffixed with an ellipsis, the input placeholder.
  find_in: (scope: string) => string
  prev_match: string
  next_match: string
  // tooltip pairing a step button's label with its keyboard shortcut
  match_shortcut: (match_label: string, shortcut: string) => string
  close: (scope: string) => string
  close_shortcut: string
}

export const FIND_BAR_LABELS: FindBarLabels = {
  find_in: (scope) => `Find in ${scope}`,
  prev_match: `Previous match`,
  next_match: `Next match`,
  match_shortcut: (match_label, shortcut) => `${match_label} (${shortcut})`,
  close: (scope) => `Close ${scope} search`,
  close_shortcut: `Close (Escape)`,
}

// key names mirror FullscreenButton's `icons` prop, so the two stay overridable in step
export type FullscreenButtonLabels = {
  enter: string
  exit: string
}

export const FULLSCREEN_BUTTON_LABELS: FullscreenButtonLabels = {
  enter: `Enter fullscreen`,
  exit: `Exit fullscreen`,
}

export type MultiSelectLabels = {
  // chip overflow toggle rendered when maxVisibleChips collapses selected chips
  more_chips: (hidden_count: number) => string
  show_less: string
  // aria-label on the <ul> holding selected chips
  selected_options: string
  // composed from the removeBtnTitle prop and the option's label
  remove_option: (remove_btn_title: string, option_label: string) => string
  // select-all row is inert while selectAllScope is 'matching' and options come from loadOptions
  matching_scope_unavailable: string
  group: (group_name: string) => string
  group_count: (selected_count: number, total_count: number) => string
  group_select_all: string
  group_deselect_all: string
  // aria-label on the per-option checkbox in keepSelectedInDropdown='checkboxes' mode
  toggle_option: (option_label: string) => string
  loading_more: string
  // live-region announcements
  option_selected: (option_label: string) => string
  option_removed: (option_label: string) => string
  options_selected: (count: number) => string
  options_removed: (count: number) => string
  options_available: (count: number) => string
  // setCustomValidity text surfaced by the browser on failed form submit
  select_between: (min: number, max: number) => string
  select_at_least: (min: number) => string
  select_an_option: string
}

export const MULTI_SELECT_LABELS: MultiSelectLabels = {
  more_chips: (hidden_count) => `+${hidden_count} more`,
  show_less: `show less`,
  selected_options: `selected options`,
  remove_option: (remove_btn_title, option_label) =>
    `${remove_btn_title} ${option_label}`,
  matching_scope_unavailable: `Matching select-all is only available with local options`,
  group: (group_name) => `Group: ${group_name}`,
  group_count: (selected_count, total_count) =>
    selected_count > 0 ? `(${selected_count}/${total_count})` : `(${total_count})`,
  group_select_all: `Select all`,
  group_deselect_all: `Deselect all`,
  toggle_option: (option_label) => `Toggle ${option_label}`,
  loading_more: `Loading more options`,
  option_selected: (option_label) => `${option_label} selected`,
  option_removed: (option_label) => `${option_label} removed`,
  options_selected: (count) => `${count} ${plural(count, `option`)} selected`,
  options_removed: (count) => `${count} ${plural(count, `option`)} removed`,
  options_available: (count) => `${count} ${plural(count, `option`)} available`,
  select_between: (min, max) => `Please select between ${min} and ${max} options`,
  select_at_least: (min) => `Please select at least ${min} options`,
  select_an_option: `Please select an option`,
}

export type NavLabels = {
  toggle_submenu: (route_label: string) => string
}

export const NAV_LABELS: NavLabels = {
  toggle_submenu: (route_label) => `Toggle ${route_label} submenu`,
}

export type SettingsSearchLabels = {
  clear_search: string
}

export const SETTINGS_SEARCH_LABELS: SettingsSearchLabels = {
  clear_search: `Clear settings search`,
}

export type SettingsSectionLabels = {
  explain: string
  // aria-label on the Explain toggle; `open` is the state the button is currently in
  explain_toggle: (open: boolean, section_title: string) => string
  reset: string
  reset_section: (section_title: string) => string
}

export const SETTINGS_SECTION_LABELS: SettingsSectionLabels = {
  explain: `Explain`,
  explain_toggle: (open, section_title) =>
    `${open ? `Hide` : `Show`} descriptions for ${section_title.toLowerCase()}`,
  reset: `Reset`,
  reset_section: (section_title) => `Reset ${section_title.toLowerCase()} to defaults`,
}

export type ToastLabels = {
  // visually hidden count of queued toasts waiting behind the visible one
  pending: (count: number) => string
}

export const TOAST_LABELS: ToastLabels = {
  pending: (count) => `${count} more ${plural(count, `notification`)} pending`,
}
