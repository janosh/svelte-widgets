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

// single CSS string or an object with optional 'option' and 'selected' keys,
// which only apply to the dropdown list and list of selected options, respectively
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

// placeholder can be a simple string or object with extended options
export type PlaceholderConfig = {
  text: string
  persistent?: boolean // keep placeholder visible even when options are selected
}

// custom events created by MultiSelect
export interface MultiSelectEvents<T extends Option = Option> {
  onadd?: (data: { option: T; selected: T[] }) => unknown
  oncreate?: (data: {
    option: T
  }) => false | T | undefined | Promise<false | T | undefined> // return false to reject, return T to transform, undefined to accept as-is (sync or async)
  onremove?: (data: { option: T; selected: T[] }) => unknown
  onremoveAll?: (data: { options: T[] }) => unknown
  onselectAll?: (data: { options: T[]; scope?: SelectAllScope }) => unknown
  onrangeSelect?: (data: { added: T[]; from: T; to: T; selected: T[] }) => unknown
  onreorder?: (data: { options: T[]; previous: T[] }) => unknown // fires when selected options are reordered via drag-and-drop
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
  onsearch?: (data: { searchText: string; matchingOptions: T[] }) => unknown // fires (debounced) when search text changes
  onmaxreached?: (data: {
    selected: T[]
    maxSelect: number
    attemptedOption: T
  }) => unknown // fires when user tries to exceed maxSelect
  onduplicate?: (data: { option: T }) => unknown // fires when user tries to add duplicate (when duplicates=false)
  onparsed_paste?: (data: {
    added: T[]
    rejected: T[]
    overflow: T[]
    raw_text: string
  }) => unknown
  onactivate?: (data: { option: T | null; index: number | null }) => unknown // fires on keyboard navigation through options
  // History/undo-redo events
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
  // custom icon indicating the input is expandable into a dropdown (position controlled by expandIconPosition prop)
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
  // portal the dropdown to document.body; honored at runtime, so toggling
  // portals/un-portals the open dropdown in place
  active?: boolean
  // `auto` (default): below the input, flips above when the dropdown would overflow
  //   the viewport bottom and there's more space above
  // `bottom`: always below the input
  // `top`: always above the input
  placement?: `auto` | `bottom` | `top`
}

export type SelectAllScope = `visible` | `matching`

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
  breakpoint?: number // any screen with more horizontal pixels is considered desktop, below is mobile
  defaultDisabledTitle?: string
  disabled?: boolean
  disabledInputTitle?: string
  duplicateOptionMsg?: string
  // Controls duplicate detection: false (default, case-sensitive), true (allow all), 'case-insensitive' (block case variants)
  duplicates?: boolean | `case-insensitive`
  // Where to render the expand icon, or 'none' to hide it.
  expandIconPosition?: `left` | `right` | `none`
  // keepSelectedInDropdown controls whether selected options remain in dropdown: false (default),
  // 'plain' (left border and background color to differentiate selected options),
  // 'checkboxes' (each option is prefixed by a checkbox).
  keepSelectedInDropdown?: false | `plain` | `checkboxes`
  // Function to generate unique keys for options. Default: value ?? label for objects, primitive for strings/numbers.
  // Duplicate detection also checks labels, so typing "Apple" when any "Apple" is selected is blocked (unless duplicates=true).
  key?: (opt: T) => unknown
  filterFunc?: (opt: T, searchText: string) => boolean
  fuzzy?: boolean // whether to use fuzzy matching (default: true) or substring matching (false)
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
  // Override any string MultiSelect renders itself, for i18n. Shallow-merged over
  // MULTI_SELECT_LABELS; see labels.ts for the full set and their defaults.
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
  // Virtualized dropdown rendering for large option lists: only rows near the scroll
  // viewport are rendered as DOM nodes. Pass true for defaults or { itemHeight, overscan }
  // to tune row height (px, default 30, applies to group headers too) and extra rows
  // rendered above/below the visible window (default 10). Grouped options are supported,
  // but combining them with stickyGroupHeaders is invalid because a virtualized header that
  // has left the render window cannot remain pinned.
  virtualList?: boolean | { itemHeight?: number; overscan?: number }
  maxSelect?: number | null // null means there is no upper limit for selected.length
  maxSelectMsg?: ((current: number, max: number) => string) | null
  maxSelectMsgClass?: ClassValue
  // Max selected chips rendered before the rest collapse into a "+N more" toggle
  // chip (click to expand/collapse). null (default) renders all chips. Ignored in
  // selectedDisplay="input" mode. Keyboard chip navigation auto-expands.
  maxVisibleChips?: number | null
  name?: string | null
  noMatchingOptionsMsg?: string
  open?: boolean
  // Mostly reaches portalled dropdowns: with the input focused, a press outside blurs it and
  // that closes an in-place dropdown before any click. See dismiss_on_outside_press.
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
  // Defaults to 'chips', which renders selected options as tags. 'input' is only
  // valid with maxSelect === 1; other maxSelect values are rejected.
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
  selectAllDisabledTitle?:
    | string
    | ((state: {
        max_reached: boolean
        maxSelect: number | null
        selected_count: number
      }) => string)
    | null
  liSelectAllClass?: ClassValue // CSS class for the select all <li>
  loadOptions?: LoadOptions<T>
  // Animation parameters for selected options flip animation (https://github.com/janosh/svelte-widgets/issues/356)
  // Set { duration: 0 } to disable animation
  selectedFlipParams?: FlipParams
  // Option grouping feature (https://github.com/janosh/svelte-widgets/issues/135)
  collapsibleGroups?: boolean // enable click-to-collapse groups
  collapsedGroups?: Set<string> // externally controlled collapsed state (bindable)
  groupSelectAll?: boolean // add "select all" action per group header (toggles between select/deselect)
  ungroupedPosition?: `first` | `last` // where to render options without a group
  groupSortOrder?: `none` | `asc` | `desc` | ((a: string, b: string) => number) // group ordering, default 'none' (source order); 'asc'/'desc' sort alphabetically or pass a comparator
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
  // Selection history for undo/redo support (enabled by default)
  // true (default) = 50 max states, number = custom max, false/0 = disabled
  // Note: need at least 2 states for undo (history=2 allows 1 undo, history=1 effectively disables)
  history?: boolean | number
  undo?: () => boolean // bindable method to undo last selection change
  redo?: () => boolean // bindable method to redo last undone change
  canUndo?: boolean // bindable read-only state for UI indicators
  canRedo?: boolean // bindable read-only state for UI indicators
}

// Keyboard shortcuts for MultiSelect actions.
// Shortcut format: "modifier+...+key" where modifiers can be: ctrl, shift, alt, meta, cmd
// Examples: 'ctrl+a', 'ctrl+shift+a', 'meta+a', 'cmd+a', 'alt+s'
// Set to null to disable a shortcut.
//
// PRECEDENCE: Custom shortcuts are evaluated BEFORE built-in key handlers (Enter, Escape,
// ArrowUp/Down, Backspace). This means if you set shortcuts={{ open: 'enter' }}, the Enter
// key will open the dropdown instead of selecting the active option (intentional to allow full customization).
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

// NavRoute shorthand formats:
// - string: path only ("/about")
// - [string, string]: [path, custom_label] ("/about", "About Us")
// - [string, string[]]: [parent_path, child_paths] ("/docs", ["/docs/intro"])
// - NavRouteObject: full object with all options
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
