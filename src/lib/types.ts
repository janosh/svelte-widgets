import type { Snippet } from 'svelte'
import type { FlipParams } from 'svelte/animate'
import type { ClassValue, HTMLAttributes, HTMLInputAttributes } from 'svelte/elements'
import type { DismissConfig } from './attachments/index'
import type { IconData } from './icons/types'
import type { MultiSelectLabels } from './labels'

export type Option = string | number | ObjectOption

export type ActionState = `ready` | `pending` | `success` | `error`
export type ActionButtonContent<State extends ActionState = ActionState> = {
  state: State
  icon?: IconData
  text: string
  disabled: boolean
}
export type ActionButtonSnippetProps<Result = unknown> = ActionButtonContent & {
  result: Result | undefined
  error: unknown
}

export type TabItem<Value extends string = string> = {
  value: Value
  label?: string
  disabled?: boolean
}

export type AccordionItem<Value extends string = string> = TabItem<Value>
export type AccordionValue<Value extends string = string> = Value | Value[] | null

// `option` styles the dropdown list, `selected` the list of selected options
export type OptionStyle = string | { option?: string; selected?: string }

export type ObjectOption = {
  label: string | number // user-displayed text
  value?: unknown // associated value; option identity falls back to label when null or undefined
  title?: string // on-hover tooltip
  disabled?: boolean // make this option unselectable
  preselected?: boolean // make this option selected on page load (before any user interaction)
  disabled_title?: string // override MultiSelect's default_disabled_title for this option
  selected_title?: string // tooltip to display when this option is selected and hovered
  style?: OptionStyle
  group?: string // optional group name for grouping options in dropdown
  [key: string]: unknown // allow any other keys users might want
}

export type CmdAction = {
  // Non-empty string, unique across the menu, including sections and loaded pages.
  // Whitespace-only IDs are invalid. Labels may repeat.
  id: string
  label: string
  action: (label: string) => void
  badge?: string
  description?: string
  disabled?: boolean
  group?: string
  keywords?: string[]
  metadata?: string | string[]
  shortcut?: string
} & Record<string, unknown>

export type PageSearchNavigateDetails = {
  query: string
  label: string
  description: string
}

export type PlaceholderConfig = {
  text: string
  persistent?: boolean // keep placeholder visible even when options are selected
}

export interface OptionListEvents<T extends Option = Option> {
  on_open?: (data: { event: Event }) => unknown
  on_close?: (data: { event: Event }) => unknown
  on_group_toggle?: (data: { group: string; collapsed: boolean }) => unknown
  on_collapse_all?: (data: { groups: string[] }) => unknown
  on_expand_all?: (data: { groups: string[] }) => unknown
  on_search?: (data: { search_text: string; matching_options: T[] }) => unknown // debounced
  on_activate?: (data: { option: T | null; index: number | null }) => unknown // keyboard nav
}

export interface MultiSelectEvents<
  T extends Option = Option,
> extends OptionListEvents<T> {
  on_add?: (data: { option: T; selected: T[] }) => unknown
  on_create?: (data: {
    option: T
  }) => false | T | undefined | Promise<false | T | undefined> // false rejects, T transforms, undefined accepts as-is
  on_remove?: (data: { option: T; selected: T[] }) => unknown
  on_remove_all?: (data: { options: T[] }) => unknown
  on_select_all?: (data: { options: T[]; scope?: SelectAllScope }) => unknown
  on_range_select?: (data: { added: T[]; from: T; to: T; selected: T[] }) => unknown
  on_reorder?: (data: { options: T[]; previous: T[] }) => unknown // drag-and-drop reorder
  on_change?: (data: {
    option?: T
    options?: T[]
    type: `add` | `remove` | `remove_all` | `select_all` | `range_select` | `reorder`
  }) => unknown
  on_max_reached?: (data: {
    selected: T[]
    max_select: number
    attempted_option: T
  }) => unknown // user tried to exceed max_select
  on_duplicate?: (data: { option: T }) => unknown // attempted duplicate when duplicates is false or 'case-insensitive'
  on_parsed_paste?: (data: {
    added: T[]
    rejected: T[]
    overflow: T[]
    raw_text: string
  }) => unknown
}

// Dynamic options loading (https://github.com/janosh/svelte-widgets/discussions/342)
export interface LoadOptionsParams {
  search: string
  offset: number
  limit: number
  signal?: AbortSignal
}

export interface LoadOptionsResult<T extends Option = Option> {
  options: T[]
  has_more: boolean
  replace?: boolean // Replace loaded options with an ordered snapshot instead of appending.
  error?: Error // Display partial results alongside Retry.
}

export type LoadOptionsFn<T extends Option = Option> = (
  params: LoadOptionsParams,
) => Promise<LoadOptionsResult<T>>

export interface LoadOptionsConfig<T extends Option = Option> {
  fetch: LoadOptionsFn<T>
  debounce_ms?: number // default: 300
  batch_size?: number // default: 50
  on_open?: boolean // default: true
}

export type LoadOptions<T extends Option = Option> =
  | LoadOptionsFn<T>
  | LoadOptionsConfig<T>

export type FormSerialize<T extends Option = Option> = (selected: T[]) => string | null

// passed to before_input+after_input snippets
type InputSnippetProps<T extends Option = Option> = Pick<
  MultiSelectProps<T>,
  `selected` | `disabled` | `invalid` | `id` | `open` | `required` | `search_text`
> & { placeholder: string | null }
type UserMsgProps = {
  search_text: string
  msg_type: false | `dupe` | `create` | `no-match`
  msg: null | string
}
export type GroupHeaderProps<T extends Option = Option> = {
  group: string
  options: T[]
  collapsed: boolean
}

// shape of one option group in the dropdown
export type GroupedOptions<T extends Option = Option> = {
  group: string | null
  options: T[]
  collapsed: boolean
}

export interface OptionListSnippets<T extends Option = Option> {
  // icon marking the input as expandable into a dropdown; placed by expand_icon_position
  expand_icon?: Snippet<[{ open: boolean; disabled: boolean }]>
  children?: Snippet<[{ option: T; idx: number; type: `option` | `selected` }]>
  before_input?: Snippet<[InputSnippetProps<T>]>
  after_input?: Snippet<[InputSnippetProps<T>]>
  spinner?: Snippet
  disabled_icon?: Snippet
  option?: Snippet<
    [{ option: T; idx: number; selected: boolean; active: boolean; disabled: boolean }]
  >
  group_header?: Snippet<[GroupHeaderProps<T>]>
}

export interface MultiSelectSnippets<
  T extends Option = Option,
> extends OptionListSnippets<T> {
  selected_item?: Snippet<[{ option: T; idx: number }]>
  remove_icon?: Snippet<
    [{ option: T; is_remove_all: false } | { option?: undefined; is_remove_all: true }]
  >
  user_msg?: Snippet<[UserMsgProps]>
}

export interface PortalParams {
  target_node?: HTMLElement | null
  // portal the dropdown to document.body; honored at runtime, so toggling portals or
  // un-portals the open dropdown in place
  active?: boolean
  // `auto` (default) sits below the input and flips above when it would overflow the
  // viewport bottom and there is more space above
  placement?: `auto` | `bottom` | `top`
}

export type SelectAllScope = `visible` | `matching`

// Why the select-all row is disabled, handed to `select_all_disabled_title`. The booleans name
// the reason; `default_title` lets a callback wrap the default instead of rebuilding it.
export interface SelectAllDisabledState {
  max_reached: boolean
  max_select: number | null
  selected_count: number
  all_selectable_selected: boolean
  matching_scope_unavailable: boolean
  default_title: string
}

type InputEventProp = Extract<keyof HTMLInputAttributes, `on${string}`>
export type InputProps = Omit<HTMLInputAttributes, InputEventProp>

export interface OptionListProps<T extends Option = Option>
  extends
    OptionListEvents<T>,
    OptionListSnippets<T>,
    Omit<HTMLAttributes<HTMLDivElement>, `children` | `placeholder`> {
  active_index?: number | null
  active_option?: T | null
  auto_active_first_option?: boolean
  autocomplete?: HTMLInputAttributes[`autocomplete`]
  auto_scroll?: boolean
  breakpoint?: number // wider screens count as desktop, narrower as mobile
  default_disabled_title?: string
  disabled?: boolean
  disabled_input_title?: string
  expand_icon_position?: `left` | `right` | `none`
  // Unique option key, default value ?? label for objects and the primitive otherwise.
  // Dupe detection also checks labels, so a second "Apple" is blocked unless duplicates=true.
  key?: (opt: T) => unknown
  filter_func?: (opt: T, search_text: string) => boolean
  fuzzy?: boolean // fuzzy (default) vs substring matching
  close_dropdown_on_select?: boolean | `if-mobile` | `retain-focus`
  form_input?: HTMLInputElement | null
  form_serialize?: FormSerialize<T>
  highlight_matches?: boolean
  id?: string | null
  input?: HTMLInputElement | null
  input_class?: ClassValue
  input_props?: InputProps
  input_style?: string | null
  inputmode?: HTMLInputAttributes[`inputmode`] | null
  invalid?: boolean
  // i18n overrides, shallow-merged over MULTI_SELECT_LABELS (see labels.ts)
  labels?: Partial<MultiSelectLabels>
  li_active_option_class?: ClassValue
  li_option_class?: ClassValue
  li_option_style?: string | null
  loading?: boolean
  matching_options?: T[]
  max_options?: number | undefined
  // Render only rows near the scroll viewport. `item_height` (px, default 30, group headers
  // included) and `overscan` (extra rows each side, default 10) tune it. Groups work, but
  // not with sticky_group_headers: a header outside the render window cannot stay pinned.
  virtual_list?: boolean | { item_height?: number; overscan?: number }
  name?: string | null
  no_matching_options_msg?: string
  open?: boolean
  // Mostly reaches portalled dropdowns: an outside press blurs the focused input, which
  // already closes an in-place dropdown before any click. See dismiss_on_outside_press.
  dismiss_on?: DismissConfig[`dismiss_on`]
  options?: T[] // static options, or omit when using load_options
  outer_div?: HTMLDivElement | null
  outer_div_class?: ClassValue
  pattern?: string | null
  placeholder?: string | PlaceholderConfig | null
  required?: boolean | number
  reset_filter_on_add?: boolean
  search_text?: string
  style?: string | null
  ul_options_class?: ClassValue
  ul_options_style?: string | null
  portal?: PortalParams
  load_options?: LoadOptions<T>
  load_error?: Error | null // bindable, cleared on retry or a new search
  // Option grouping feature (https://github.com/janosh/svelte-widgets/issues/135)
  collapsible_groups?: boolean // enable click-to-collapse groups
  collapsed_groups?: Set<string> // externally controlled collapsed state (bindable)
  ungrouped_position?: `first` | `last` // where to render options without a group
  // group order: 'none' (default, source order), alphabetical 'asc'/'desc', or a comparator
  group_sort_order?: `none` | `asc` | `desc` | ((a: string, b: string) => number)
  search_expands_collapsed_groups?: boolean // auto-expand collapsed groups when search matches their options
  search_matches_groups?: boolean // include group name in search matching
  keyboard_expands_collapsed_groups?: boolean // auto-expand collapsed groups when navigating with arrow keys
  sticky_group_headers?: boolean // keep group headers visible at top when scrolling
  li_group_header_class?: ClassValue // CSS class for group header <li>
  li_group_header_style?: string | null // inline style for group headers
  // Programmatic group control (exposed via bindable)
  collapse_all_groups?: () => void
  expand_all_groups?: () => void
  // Keyboard shortcuts for common actions
  shortcuts?: Partial<KeyboardShortcuts>
}

export interface MultiSelectProps<T extends Option = Option>
  extends OptionListProps<T>, MultiSelectEvents<T>, MultiSelectSnippets<T> {
  create_option_msg?:
    | string
    | ((state: {
        search_text: string
        selected: T[]
        options: T[]
        matching_options: T[]
      }) => string)
    | null
  allow_user_options?: boolean | `append`
  allow_empty?: boolean // allow an empty options array without loading, disabled, or user-option mode
  duplicate_option_msg?: string
  // false (default) blocks dupes case-sensitively, true allows all, 'case-insensitive'
  // also blocks case variants
  duplicates?: boolean | `case-insensitive`
  // keep selected options in the dropdown, marked either by a left border and background
  // ('plain') or a checkbox prefix ('checkboxes')
  keep_selected_in_dropdown?: false | `plain` | `checkboxes`
  li_active_user_msg_class?: ClassValue
  li_selected_class?: ClassValue
  li_selected_style?: string | null
  li_user_msg_class?: ClassValue
  max_select?: number | null // null means there is no upper limit for selected.length
  max_select_msg?: ((current: number, max: number) => string) | null
  max_select_msg_class?: ClassValue
  // Chips rendered before the rest collapse into a "+N more" toggle; null (default) renders
  // all. Ignored for selected_display="input"; keyboard chip navigation auto-expands.
  max_visible_chips?: number | null
  remove_all_title?: string
  remove_btn_title?: string
  min_select?: number | null // null means there is no lower limit for selected.length
  parse_paste?: (text: string) => T[]
  selected?: T[] // don't allow more than max_select preselected options
  // 'chips' (default) renders selected options as tags; 'input' requires max_select === 1
  selected_display?: `chips` | `input`
  sort_selected?: boolean | ((op1: T, op2: T) => number)
  selected_options_draggable?: boolean
  range_select?: boolean
  ul_selected_class?: ClassValue
  ul_selected_style?: string | null
  value?: T | T[] | null
  // Select all feature
  select_all_option?: boolean | string // enable select all; if string, use as label
  select_all_scope?: SelectAllScope
  select_all_disabled_title?: string | ((state: SelectAllDisabledState) => string) | null
  li_select_all_class?: ClassValue // CSS class for the select all <li>
  // flip animation for selected options; { duration: 0 } disables
  // (https://github.com/janosh/svelte-widgets/issues/356)
  selected_flip_params?: FlipParams
  group_select_all?: boolean // per-group header select/deselect-all toggle
}

// "modifier+...+key" with modifiers ctrl, shift, alt, meta, cmd (e.g. 'ctrl+shift+a');
// null disables. Evaluated BEFORE built-in handlers (Enter, Escape, arrows, Backspace), so
// shortcuts={{ open: 'enter' }} deliberately overrides Enter's select.
export interface KeyboardShortcuts {
  select_all?: string | null // default: null (opt-in, e.g. 'ctrl+a')
  clear_all?: string | null // default: 'ctrl+backspace' (meta+backspace on Mac)
  open?: string | null // default: null (use existing behavior)
  close?: string | null // default: null (Escape already works)
}

// Nav component types
export type NavRouteObject = {
  label?: string // custom label (default: derived from href)
  children?: string[] // sub-routes for dropdown
  disabled?: boolean | string // true or tooltip message
  separator?: boolean // render as visual divider after this item
  align?: `left` | `right` // default: `left`
  external?: boolean // add target="_blank" rel="noopener noreferrer"
  tooltip?: string // on-hover tooltip (takes precedence over top-level tooltips prop)
  class?: ClassValue // custom CSS class
  style?: string // custom inline style
  [key: string]: unknown // allow additional custom properties
} & ({ href: string } | { separator: true; href?: string })

// shorthands: "/about", ["/about", "About Us"], ["/docs", ["/docs/intro"]]
export type NavRoute = string | [string, string] | [string, string[]] | NavRouteObject

// === Toc ===
export type CollapseMode = boolean | `h${2 | 3 | 4 | 5 | 6}`
export type OpenChangeTrigger =
  | `button`
  | `escape`
  | `outside-click`
  | `programmatic`
  | `tab`
  | `toc-item`
export type OpenChangeEvent = {
  open: boolean
  desktop: boolean
  trigger: OpenChangeTrigger
}
export type OpenChangeHandler = (event: OpenChangeEvent) => void
export type SlugifyHeading = (node: HTMLHeadingElement, idx: number) => string
export type TocHeadingData = { id: string; level: number; title: string }

// === Footer ===
export interface FooterLink {
  href: string
  label: string
  icon?: IconData
  title?: string
  external?: boolean // adds target=_blank and rel=noopener noreferrer
}

// === ContributorList ===
// structural, so a GitHub API response satisfies it without a cast
export interface Contributor {
  login: string
  avatar_url: string
  html_url: string
}

export type FileRejection = { file: File; reason: `type` | `size` | `count` }

export type TreeNode = {
  id: string
  label: string
  children?: readonly TreeNode[]
  load?: (signal: AbortSignal) => Promise<readonly TreeNode[]>
  disabled?: boolean
}
