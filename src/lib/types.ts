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
  value?: unknown // associated value, can be anything incl. objects (defaults to label if undefined)
  title?: string // on-hover tooltip
  disabled?: boolean // make this option unselectable
  preselected?: boolean // make this option selected on page load (before any user interaction)
  disabledTitle?: string // override the default disabledTitle = 'This option is disabled'
  selectedTitle?: string // tooltip to display when this option is selected and hovered
  style?: OptionStyle
  group?: string // optional group name for grouping options in dropdown
  [key: string]: unknown // allow any other keys users might want
}

export type CmdAction = {
  id?: string | number
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

export interface MultiSelectEvents<T extends Option = Option> {
  onadd?: (data: { option: T; selected: T[] }) => unknown
  oncreate?: (data: {
    option: T
  }) => false | T | undefined | Promise<false | T | undefined> // false rejects, T transforms, undefined accepts as-is
  onremove?: (data: { option: T; selected: T[] }) => unknown
  onremoveAll?: (data: { options: T[] }) => unknown
  onselectAll?: (data: { options: T[]; scope?: SelectAllScope }) => unknown
  onrangeSelect?: (data: { added: T[]; from: T; to: T; selected: T[] }) => unknown
  onreorder?: (data: { options: T[]; previous: T[] }) => unknown // drag-and-drop reorder
  onchange?: (data: {
    option?: T
    options?: T[]
    type: `add` | `remove` | `removeAll` | `selectAll` | `rangeSelect` | `reorder`
  }) => unknown
  onopen?: (data: { event: Event }) => unknown
  onclose?: (data: { event: Event }) => unknown
  ongroupToggle?: (data: { group: string; collapsed: boolean }) => unknown
  oncollapseAll?: (data: { groups: string[] }) => unknown
  onexpandAll?: (data: { groups: string[] }) => unknown
  onsearch?: (data: { searchText: string; matchingOptions: T[] }) => unknown // debounced
  onmaxreached?: (data: {
    selected: T[]
    maxSelect: number
    attemptedOption: T
  }) => unknown // user tried to exceed maxSelect
  onduplicate?: (data: { option: T }) => unknown // user tried to add a dupe (duplicates=false)
  onparsed_paste?: (data: {
    added: T[]
    rejected: T[]
    overflow: T[]
    raw_text: string
  }) => unknown
  onactivate?: (data: { option: T | null; index: number | null }) => unknown // keyboard nav
  onundo?: (data: { previous: T[]; current: T[] }) => unknown
  onredo?: (data: { previous: T[]; current: T[] }) => unknown
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
  hasMore: boolean
}

export type LoadOptionsFn<T extends Option = Option> = (
  params: LoadOptionsParams,
) => Promise<LoadOptionsResult<T>>

export interface LoadOptionsConfig<T extends Option = Option> {
  fetch: LoadOptionsFn<T>
  debounceMs?: number // default: 300
  batchSize?: number // default: 50
  onOpen?: boolean // default: true
}

export type LoadOptions<T extends Option = Option> =
  | LoadOptionsFn<T>
  | LoadOptionsConfig<T>

export type FormSerialize<T extends Option = Option> = (selected: T[]) => string | null

// passed to beforeInput+afterInput snippets
type InputSnippetProps<T extends Option = Option> = Pick<
  MultiSelectProps<T>,
  `selected` | `disabled` | `invalid` | `id` | `open` | `required` | `searchText`
> & { placeholder: string | null }
type UserMsgProps = {
  searchText: string
  msgType: false | `dupe` | `create` | `no-match`
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

export interface MultiSelectSnippets<T extends Option = Option> {
  // icon marking the input as expandable into a dropdown; placed by expandIconPosition
  expandIcon?: Snippet<[{ open: boolean; disabled: boolean }]>
  selectedItem?: Snippet<[{ option: T; idx: number }]>
  children?: Snippet<[{ option: T; idx: number; type: `option` | `selected` }]>
  removeIcon?: Snippet<
    [{ option: T; isRemoveAll: false } | { option?: undefined; isRemoveAll: true }]
  >
  beforeInput?: Snippet<[InputSnippetProps<T>]>
  afterInput?: Snippet<[InputSnippetProps<T>]>
  spinner?: Snippet
  disabledIcon?: Snippet
  option?: Snippet<
    [{ option: T; idx: number; selected: boolean; active: boolean; disabled: boolean }]
  >
  userMsg?: Snippet<[UserMsgProps]>
  groupHeader?: Snippet<[GroupHeaderProps<T>]>
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

// Why the select-all row is disabled, handed to `selectAllDisabledTitle`. The booleans name
// the reason; `default_title` lets a callback wrap the default instead of rebuilding it.
export interface SelectAllDisabledState {
  max_reached: boolean
  maxSelect: number | null
  selected_count: number
  all_selectable_selected: boolean
  matching_scope_unavailable: boolean
  default_title: string
}

type InputEventProp = Extract<keyof HTMLInputAttributes, `on${string}`>
export type InputProps = Omit<HTMLInputAttributes, InputEventProp>

export interface MultiSelectProps<T extends Option = Option>
  extends
    MultiSelectEvents<T>,
    MultiSelectSnippets<T>,
    Omit<
      HTMLAttributes<HTMLDivElement>,
      `children` | `onchange` | `onclose` | `placeholder`
    > {
  activeIndex?: number | null
  activeOption?: T | null
  activeOptionFallbackKey?: (option: T) => unknown
  autoActiveFirstOption?: boolean
  createOptionMsg?:
    | string
    | ((state: {
        searchText: string
        selected: T[]
        options: T[]
        matchingOptions: T[]
      }) => string)
    | null
  allowUserOptions?: boolean | `append`
  allowEmpty?: boolean // added for https://github.com/janosh/svelte-widgets/issues/192
  autocomplete?: HTMLInputAttributes[`autocomplete`]
  autoScroll?: boolean
  breakpoint?: number // wider screens count as desktop, narrower as mobile
  defaultDisabledTitle?: string
  disabled?: boolean
  disabledInputTitle?: string
  duplicateOptionMsg?: string
  // false (default) blocks dupes case-sensitively, true allows all, 'case-insensitive'
  // also blocks case variants
  duplicates?: boolean | `case-insensitive`
  expandIconPosition?: `left` | `right` | `none`
  // keep selected options in the dropdown, marked either by a left border and background
  // ('plain') or a checkbox prefix ('checkboxes')
  keepSelectedInDropdown?: false | `plain` | `checkboxes`
  // Unique option key, default value ?? label for objects and the primitive otherwise.
  // Dupe detection also checks labels, so a second "Apple" is blocked unless duplicates=true.
  key?: (opt: T) => unknown
  filterFunc?: (opt: T, searchText: string) => boolean
  fuzzy?: boolean // fuzzy (default) vs substring matching
  closeDropdownOnSelect?: boolean | `if-mobile` | `retain-focus`
  form_input?: HTMLInputElement | null
  formSerialize?: FormSerialize<T>
  highlightMatches?: boolean
  id?: string | null
  input?: HTMLInputElement | null
  inputClass?: ClassValue
  inputProps?: InputProps
  inputStyle?: string | null
  inputmode?: HTMLInputAttributes[`inputmode`] | null
  invalid?: boolean
  // i18n overrides, shallow-merged over MULTI_SELECT_LABELS (see labels.ts)
  labels?: Partial<MultiSelectLabels>
  liActiveOptionClass?: ClassValue
  liActiveUserMsgClass?: ClassValue
  liOptionClass?: ClassValue
  liOptionStyle?: string | null
  liSelectedClass?: ClassValue
  liSelectedStyle?: string | null
  liUserMsgClass?: ClassValue
  loading?: boolean
  matchingOptions?: T[]
  maxOptions?: number | undefined
  // Render only rows near the scroll viewport. `itemHeight` (px, default 30, group headers
  // included) and `overscan` (extra rows each side, default 10) tune it. Groups work, but
  // not with stickyGroupHeaders: a header outside the render window cannot stay pinned.
  virtualList?: boolean | { itemHeight?: number; overscan?: number }
  maxSelect?: number | null // null means there is no upper limit for selected.length
  maxSelectMsg?: ((current: number, max: number) => string) | null
  maxSelectMsgClass?: ClassValue
  // Chips rendered before the rest collapse into a "+N more" toggle; null (default) renders
  // all. Ignored for selectedDisplay="input"; keyboard chip navigation auto-expands.
  maxVisibleChips?: number | null
  name?: string | null
  noMatchingOptionsMsg?: string
  open?: boolean
  // Mostly reaches portalled dropdowns: an outside press blurs the focused input, which
  // already closes an in-place dropdown before any click. See dismiss_on_outside_press.
  dismiss_on?: DismissConfig[`dismiss_on`]
  options?: T[] // static options, or omit when using loadOptions
  outerDiv?: HTMLDivElement | null
  outerDivClass?: ClassValue
  parseLabelsAsHtml?: boolean // combining with allowUserOptions throws (XSS risk)
  pattern?: string | null
  placeholder?: string | PlaceholderConfig | null
  removeAllTitle?: string
  removeBtnTitle?: string
  minSelect?: number | null // null means there is no lower limit for selected.length
  required?: boolean | number
  resetFilterOnAdd?: boolean
  parse_paste?: (text: string) => T[]
  searchText?: string
  selected?: T[] // don't allow more than maxSelect preselected options
  // 'chips' (default) renders selected options as tags; 'input' requires maxSelect === 1
  selectedDisplay?: `chips` | `input`
  sortSelected?: boolean | ((op1: T, op2: T) => number)
  selectedOptionsDraggable?: boolean
  rangeSelect?: boolean
  style?: string | null
  ulOptionsClass?: ClassValue
  ulSelectedClass?: ClassValue
  ulSelectedStyle?: string | null
  ulOptionsStyle?: string | null
  value?: T | T[] | null
  portal?: PortalParams
  // Select all feature
  selectAllOption?: boolean | string // enable select all; if string, use as label
  selectAllScope?: SelectAllScope
  selectAllDisabledTitle?: string | ((state: SelectAllDisabledState) => string) | null
  liSelectAllClass?: ClassValue // CSS class for the select all <li>
  loadOptions?: LoadOptions<T>
  // flip animation for selected options; { duration: 0 } disables
  // (https://github.com/janosh/svelte-widgets/issues/356)
  selectedFlipParams?: FlipParams
  // Option grouping feature (https://github.com/janosh/svelte-widgets/issues/135)
  collapsibleGroups?: boolean // enable click-to-collapse groups
  collapsedGroups?: Set<string> // externally controlled collapsed state (bindable)
  groupSelectAll?: boolean // per-group header select/deselect-all toggle
  ungroupedPosition?: `first` | `last` // where to render options without a group
  // group order: 'none' (default, source order), alphabetical 'asc'/'desc', or a comparator
  groupSortOrder?: `none` | `asc` | `desc` | ((a: string, b: string) => number)
  searchExpandsCollapsedGroups?: boolean // auto-expand collapsed groups when search matches their options
  searchMatchesGroups?: boolean // include group name in search matching
  keyboardExpandsCollapsedGroups?: boolean // auto-expand collapsed groups when navigating with arrow keys
  stickyGroupHeaders?: boolean // keep group headers visible at top when scrolling
  liGroupHeaderClass?: ClassValue // CSS class for group header <li>
  liGroupHeaderStyle?: string | null // inline style for group headers
  // Programmatic group control (exposed via bindable)
  collapseAllGroups?: () => void
  expandAllGroups?: () => void
  // Keyboard shortcuts for common actions
  shortcuts?: Partial<KeyboardShortcuts>
  // Undo/redo history size: true (default) = 50 states, a number sets the max, false/0 is
  // off. Undo needs 2 states, so history=1 disables it in effect.
  history?: boolean | number
  undo?: () => boolean // bindable
  redo?: () => boolean // bindable
  canUndo?: boolean // bindable, read-only
  canRedo?: boolean // bindable, read-only
}

// "modifier+...+key" with modifiers ctrl, shift, alt, meta, cmd (e.g. 'ctrl+shift+a');
// null disables. Evaluated BEFORE built-in handlers (Enter, Escape, arrows, Backspace), so
// shortcuts={{ open: 'enter' }} deliberately overrides Enter's select.
export interface KeyboardShortcuts {
  select_all?: string | null // default: null (opt-in, e.g. 'ctrl+a')
  clear_all?: string | null // default: 'ctrl+backspace' (meta+backspace on Mac)
  open?: string | null // default: null (use existing behavior)
  close?: string | null // default: null (Escape already works)
  undo?: string | null // default: platform-aware (meta+z on Mac, ctrl+z elsewhere)
  redo?: string | null // default: platform-aware (meta+shift+z on Mac, ctrl+shift+z elsewhere)
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
