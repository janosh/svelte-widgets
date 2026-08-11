import type { CmdAction, Option } from './types'

let uuid_counter = 0

export const chain_handlers =
  <EventType>(...handlers: (((event: EventType) => unknown) | null | undefined)[]) =>
  (event: EventType): void =>
    handlers.forEach((handler) => handler?.(event))

// Generates a UUID for component IDs. Uses native crypto.randomUUID when available.
// Fallback uses timestamp+counter - sufficient for DOM IDs (uniqueness, not security).
export function get_uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const hex = (Date.now().toString(16) + (uuid_counter++).toString(16)).padStart(32, `0`)
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join(`-`)
}

export const is_object = (val: unknown): val is Record<string, unknown> =>
  typeof val === `object` && val !== null

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

export const slug_to_title = (slug: string): string =>
  slug
    .replaceAll(`-`, ` `)
    .replaceAll(/(?<![\p{L}\p{M}\p{N}_])\p{L}/gu, (letter) => letter.toUpperCase())

export const has_group = <T extends Option>(opt: T): opt is T & { group: string } =>
  is_object(opt) && typeof opt.group === `string`

// Label of an object option, or the primitive option stringified
export const get_label = (opt: Option) => {
  if (is_object(opt)) {
    if (opt.label === undefined) {
      const opt_str = JSON.stringify(opt)
      console.error(`MultiSelect: option is an object but has no label key`, opt_str)
    }
    return opt.label
  }
  return `${opt}`
}

// Unique option key: value ?? label for objects, the primitive itself otherwise
export const get_option_key = (opt: Option): unknown =>
  is_object(opt) ? (opt.value ?? get_label(opt)) : opt

// Extract a CSS string from an option's style (string or {option, selected} object).
// A non-empty result is semicolon-terminated.
export function get_style(
  option: Option,
  key: `selected` | `option` | null | undefined = null,
) {
  let css_str = ``
  if (key !== null && key !== `selected` && key !== `option`) {
    console.error(`MultiSelect: Invalid key=${String(key)} for get_style`)
    return css_str
  }
  if (typeof option === `object` && option.style) {
    if (typeof option.style === `string`) css_str = option.style
    if (typeof option.style === `object`) {
      if (key && key in option.style) css_str = option.style[key] ?? ``
      // partial style objects (e.g. only `selected`) are fine; flag any keys
      // other than the known ones, even when a valid key is also present
      const has_unknown_key = Object.keys(option.style).some(
        (style_key) => style_key !== `option` && style_key !== `selected`,
      )
      if (has_unknown_key) {
        console.error(`MultiSelect: invalid style object for option`, option)
      }
    }
  }
  const trimmed = css_str.trim()
  if (trimmed && !trimmed.endsWith(`;`)) css_str += `;`
  return css_str
}

// === Floating geometry ===
// "Pick a side that fits, then stay on screen", shared by every floating surface.

export type Placement = `top` | `right` | `bottom` | `left`

export type PositionOptions = {
  placement?: Placement | `auto`
  // `start` and `end` line up the corresponding physical anchor and floating edges.
  align?: `center` | `start` | `end`
  offset?: number // gap between anchor and floating box
  cross_axis_offset?: number // nudge perpendicular to the chosen side
  padding?: number // closest the floating box may come to a viewport edge
  boundary?: { top: number; left: number; right: number; bottom: number }
  fallback_placements?: Placement[] // tried after a fixed placement; restricts `auto`
  // `true` tries the opposite side then the perpendicular ones; pass an explicit
  // list to keep a dropdown from ever landing beside its input
  flip?: boolean | Placement[]
  shift?: boolean // slide along the viewport edge rather than overflow it
}

export type PositionResult = { top: number; left: number; placement: Placement }

const FLIP_ORDER: Record<Placement, Placement[]> = {
  bottom: [`bottom`, `top`, `right`, `left`],
  top: [`top`, `bottom`, `right`, `left`],
  right: [`right`, `left`, `bottom`, `top`],
  left: [`left`, `right`, `bottom`, `top`],
}

// Viewport coordinates by default; callers add scroll offsets when positioning absolutely.
export function compute_position(
  anchor: { top: number; left: number; bottom: number; right: number },
  floating: { width: number; height: number },
  options: PositionOptions = {},
): PositionResult {
  const {
    placement = `bottom`,
    align = `center`,
    offset = 0,
    cross_axis_offset = 0,
    padding = 0,
    boundary = {
      top: 0,
      left: 0,
      right: globalThis.innerWidth,
      bottom: globalThis.innerHeight,
    },
    fallback_placements,
    flip = true,
    shift = true,
  } = options
  const requested = placement === `auto` ? `bottom` : placement
  const cross_position = (start: number, end: number, size: number): number => {
    if (align === `start`) return start + cross_axis_offset
    if (align === `end`) return end - size + cross_axis_offset
    return start + (end - start - size) / 2 + cross_axis_offset
  }
  const cross_x = cross_position(anchor.left, anchor.right, floating.width)
  const cross_y = cross_position(anchor.top, anchor.bottom, floating.height)

  const coords: Record<Placement, { top: number; left: number }> = {
    top: { top: anchor.top - floating.height - offset, left: cross_x },
    bottom: { top: anchor.bottom + offset, left: cross_x },
    left: { top: cross_y, left: anchor.left - floating.width - offset },
    right: { top: cross_y, left: anchor.right + offset },
  }

  // Room between the anchor and the boundary on each side, gap already deducted.
  const free_space: Record<Placement, number> = {
    top: anchor.top - boundary.top - padding - offset,
    bottom: boundary.bottom - padding - anchor.bottom - offset,
    left: anchor.left - boundary.left - padding - offset,
    right: boundary.right - padding - anchor.right - offset,
  }
  // Only the main axis decides a flip: cross-axis overflow is what shifting is for, and
  // letting it count would make an edge-aligned bottom tooltip jump to the left instead.
  const main_axis_overflow = (side: Placement): number => {
    const needed = side === `top` || side === `bottom` ? floating.height : floating.width
    return Math.max(0, needed - free_space[side])
  }

  // `flip: false` pins the requested side; otherwise the first candidate with the least
  // main-axis overflow wins.
  const explicit_order = fallback_placements ?? (Array.isArray(flip) ? flip : null)
  const candidate_placements = (): Placement[] => {
    if (flip === false) return [requested]
    if (!explicit_order) return FLIP_ORDER[requested]
    // A named placement stays the first choice, its fallbacks only queue up behind it.
    if (fallback_placements && placement !== `auto`) {
      return [requested, ...explicit_order.filter((side) => side !== requested)]
    }
    return explicit_order
  }

  // Plain `auto` has no preferred side, so it breaks overflow ties by picking the roomiest.
  const rank_by_space = flip !== false && placement === `auto` && !explicit_order
  let chosen = requested
  let least_overflow = Infinity
  let greatest_space = -Infinity
  for (const candidate of candidate_placements()) {
    const candidate_overflow = main_axis_overflow(candidate)
    if (
      candidate_overflow < least_overflow ||
      (rank_by_space &&
        candidate_overflow === least_overflow &&
        free_space[candidate] > greatest_space)
    ) {
      chosen = candidate
      least_overflow = candidate_overflow
      greatest_space = free_space[candidate]
    }
  }

  let { top, left } = coords[chosen]
  if (shift) {
    const min_left = boundary.left + padding
    const max_left = boundary.right - floating.width - padding
    const min_top = boundary.top + padding
    const max_top = boundary.bottom - floating.height - padding
    // Oversize boxes have reversed limits; the interval between them has minimum overflow.
    left = clamp(left, Math.min(min_left, max_left), Math.max(min_left, max_left))
    top = clamp(top, Math.min(min_top, max_top), Math.max(min_top, max_top))
  }
  return { top, left, placement: chosen }
}

// === Keyboard shortcuts ===

// `mod` is Cmd on Apple keyboards and Ctrl everywhere else, so one binding covers both
const is_apple_platform = (): boolean =>
  /mac|iphone|ipad|ipod/iu.test(globalThis.navigator?.userAgent ?? ``)

const resolve_mod = (shortcut: string): string =>
  shortcut.replaceAll(/\bmod\b/giu, is_apple_platform() ? `meta` : `ctrl`)

// `,`, `+` and space are spelled out in a combo string so it can always be split on
// `+`; matching needs the literal `event.key` back.
const KEY_TOKENS: Record<string, string> = { ',': `comma`, '+': `plus`, ' ': `space` }
const TOKEN_KEYS: Record<string, string> = { comma: `,`, plus: `+`, space: ` ` }

function split_shortcut(shortcut: string): string[] {
  const parts = shortcut
    .toLowerCase()
    .split(`+`)
    .map((part) => part.trim())

  if (parts.at(-1) === `` && parts.at(-2) === ``) parts.splice(-2, 2, `+`)
  return parts
}

export function parse_shortcut(shortcut: string): {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
} {
  const parts = split_shortcut(resolve_mod(shortcut))
  const last = parts.pop() ?? ``
  const key = TOKEN_KEYS[last] ?? last
  const ctrl = parts.includes(`ctrl`)
  const shift = parts.includes(`shift`)
  const alt = parts.includes(`alt`)
  const meta = parts.includes(`meta`) || parts.includes(`cmd`)
  return { key, ctrl, shift, alt, meta }
}

export function matches_shortcut(
  event: KeyboardEvent,
  shortcut: string | null | undefined,
): boolean {
  if (!shortcut) return false
  const { key, ctrl, shift, alt, meta } = parse_shortcut(shortcut)
  // Require non-empty key to prevent "ctrl+" from matching any key with ctrl pressed
  if (!key) return false
  return (
    event.key.toLowerCase() === key &&
    event.ctrlKey === ctrl &&
    (event.shiftKey === shift || (key === `+` && !shift)) &&
    event.altKey === alt &&
    event.metaKey === meta
  )
}

// Shortcut segments as display symbols.
// Only `mod` reads the platform; every other segment renders the same everywhere.
const key_symbols: Record<string, string> = {
  meta: `⌘`,
  cmd: `⌘`,
  shift: `⇧`,
  alt: `⌥`,
  ctrl: `Ctrl`,
  enter: `↵`,
  backspace: `⌫`,
  delete: `⌦`,
  escape: `Esc`,
  arrowup: `↑`,
  arrowdown: `↓`,
  arrowleft: `←`,
  arrowright: `→`,
  comma: `,`,
  plus: `+`,
  space: `␣`,
}

export const format_shortcut = (shortcut: string): string[] =>
  split_shortcut(resolve_mod(shortcut)).map((part) => {
    const key_segment = part.trim().toLowerCase()
    // title-case unknown multi-char segments, upper-case single chars (empty stays empty)
    const title_case = key_segment.charAt(0).toUpperCase() + key_segment.slice(1)
    return (
      key_symbols[key_segment] ??
      (key_segment.length > 1 ? title_case : key_segment.toUpperCase())
    )
  })

export type Hotkey = {
  keys: string | string[] // e.g. `mod+k`, `ctrl+shift+p`, `Escape`
  handler: (event: KeyboardEvent) => void
  enabled?: boolean
  // Bare keys are ignored while typing in a text field, where they are just
  // characters. Chords always fire. Set true for keys that must work either way.
  allow_in_inputs?: boolean
  prevent_default?: boolean // default true
}

// Runs the first binding whose shortcut matches and reports whether one fired.
// Shared by the `hotkey` attachment and components that own a window listener.
export function run_hotkeys(event: KeyboardEvent, bindings: Hotkey[]): boolean {
  if (event.isComposing) return false // mid-IME the keystroke belongs to the editor
  // Outside a chord a bare key in a text field is ordinary typing, not a shortcut
  const typing = !is_modifier_chord(event) && is_editable_event_target(event.target)
  for (const binding of bindings) {
    if (binding.enabled === false) continue
    const keys = Array.isArray(binding.keys) ? binding.keys : [binding.keys]
    if (!keys.some((key) => matches_shortcut(event, key))) continue
    if (typing && !binding.allow_in_inputs) continue
    if (binding.prevent_default !== false) event.preventDefault()
    binding.handler(event)
    return true
  }
  return false
}

// True when the event came from a text-entry control, where a bare key is typing
export const is_editable_event_target = (target: EventTarget | null): boolean =>
  target instanceof Element &&
  target.closest(
    `input, textarea, select, [contenteditable]:not([contenteditable="false"])`,
  ) !== null

// Alt/Ctrl/Meta make a keystroke a chord. Shift is excluded: it types capitals.
export const is_modifier_chord = (event: KeyboardEvent): boolean =>
  event.altKey || event.ctrlKey || event.metaKey

// Move focus within a list of items, wrapping at both ends, and hand back what took it
// so a radio group can carry its selection along. Returns undefined when the key is not
// a navigation key or the list is empty, in which case the event is left untouched.
// Left/Right are opt-in: a vertical menu should leave them to the page.
// Focus entering from outside gives idx -1, where each key still lands where it implies
// — Home and a forward step on the first item, End and a backward step on the last.
export function step_focus<T extends HTMLElement>(
  event: KeyboardEvent,
  items: T[],
  { horizontal = false }: { horizontal?: boolean } = {},
): T | undefined {
  const { key } = event
  const back = key === `ArrowUp` || (horizontal && key === `ArrowLeft`)
  const forward = key === `ArrowDown` || (horizontal && key === `ArrowRight`)
  if (!back && !forward && key !== `Home` && key !== `End`) return undefined
  const count = items.length
  if (count === 0) return undefined
  event.preventDefault()
  const idx = items.findIndex((item) => item === document.activeElement)
  let next = count - 1 // End, and a backward step from outside the list
  if (key === `Home`) next = 0
  else if (forward) next = (idx + 1) % count
  else if (back) next = (Math.max(idx, 0) - 1 + count) % count
  const target = items[next]
  target?.focus()
  return target
}

// === Shortcut rebinding ===
// The reverse of parse_shortcut, for UIs that let users record their own shortcuts.
// Combos come back in one canonical spelling: modifiers in a fixed order, `mod` for
// the platform's primary modifier, and no segment that would break a split on `+`.

const MODIFIER_ORDER = [`mod`, `meta`, `ctrl`, `alt`, `shift`]
// other spellings users and `event.key` produce for the modifiers named above
const MODIFIER_ALIASES: Record<string, string> = {
  cmd: `meta`,
  command: `meta`,
  control: `ctrl`,
  option: `alt`,
}
const canonical_modifier = (part: string): string => MODIFIER_ALIASES[part] ?? part
const is_modifier = (part: string): boolean =>
  MODIFIER_ORDER.includes(canonical_modifier(part))

// `event.key` values that are a modifier in their own right, never a combo's key
const MODIFIER_EVENT_KEYS = new Set(
  `meta control alt altgraph shift capslock fn`.split(` `),
)

// Canonical combo for a keydown, e.g. `mod+shift+t`; null for a pure-modifier press.
// `mod` stands in for Cmd on Apple and Ctrl elsewhere, so one recorded combo works on
// both and round-trips through matches_shortcut. Pass mod: false to record the
// physical modifier instead, which a combo bound to one platform wants.
export function event_to_combo(
  event: KeyboardEvent,
  { mod = true }: { mod?: boolean } = {},
): string | null {
  const key = event.key.toLowerCase()
  if (MODIFIER_EVENT_KEYS.has(key)) return null
  const held: Record<string, boolean> = {
    meta: event.metaKey,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
  }
  const primary = is_apple_platform() ? `meta` : `ctrl`
  if (mod && held[primary]) {
    held[primary] = false
    held.mod = true
  }
  const mods = MODIFIER_ORDER.filter((name) => held[name])
  return [...mods, KEY_TOKENS[key] ?? key].join(`+`)
}

// Canonical form of a combo written by hand or read back from storage; null for junk
// (no key, several keys, or a lone modifier). Bare keys like `escape` are valid here
// because run_hotkeys accepts them; require_modifier rejects them for rebinding UIs,
// where an unmodified key would swallow ordinary typing.
export function normalize_combo(
  combo: string,
  { require_modifier = false }: { require_modifier?: boolean } = {},
): string | null {
  const parts = split_shortcut(combo).filter(Boolean)
  const mods = new Set(parts.filter(is_modifier).map(canonical_modifier))
  const keys = parts.filter((part) => !is_modifier(part))
  if (keys.length !== 1 || (require_modifier && mods.size === 0)) return null
  const key = KEY_TOKENS[keys[0]] ?? keys[0]
  if (MODIFIER_EVENT_KEYS.has(key)) return null
  return [...MODIFIER_ORDER.filter((name) => mods.has(name)), key].join(`+`)
}

// `mod` is Cmd on Apple and Ctrl everywhere else, so `mod+k` and the platform's own
// spelling of the same chord are one shortcut and have to collide. Conflicts are judged
// on this resolved form; what gets stored stays in the canonical `mod` spelling.
const resolve_combo = (combo: string): string => {
  const primary = is_apple_platform() ? `meta` : `ctrl`
  const parts = combo.split(`+`)
  const mods = new Set(
    parts.filter(is_modifier).map((part) => {
      const name = canonical_modifier(part)
      return name === `mod` ? primary : name
    }),
  )
  const keys = parts.filter((part) => !is_modifier(part))
  return [...MODIFIER_ORDER.filter((name) => mods.has(name)), ...keys].join(`+`)
}

// Validates stored `action id -> combo` overrides against a map of defaults, dropping
// unknown ids, junk combos and overrides that merely restate the default. Overrides
// that would leave two actions on one combo are dropped too, so an override can never
// shadow another action's shortcut.
export function sanitize_shortcut_overrides(
  value: unknown,
  defaults: Record<string, string>,
): Record<string, string> {
  if (!is_object(value)) return {}
  const canonical_defaults = Object.fromEntries(
    Object.entries(defaults).map(([id, combo]) => [id, normalize_combo(combo) ?? combo]),
  )
  const overrides: Record<string, string> = {}
  for (const [action_id, combo] of Object.entries(value)) {
    if (!(action_id in canonical_defaults) || typeof combo !== `string`) continue
    const normalized = normalize_combo(combo)
    if (normalized && normalized !== canonical_defaults[action_id]) {
      overrides[action_id] = normalized
    }
  }
  // dropping an override reinstates its default, which can collide in turn, so repeat
  for (;;) {
    const effective = Object.values({ ...canonical_defaults, ...overrides }).map(
      resolve_combo,
    )
    const conflicting = Object.keys(overrides).filter((id) => {
      const resolved = resolve_combo(overrides[id])
      return effective.indexOf(resolved) !== effective.lastIndexOf(resolved)
    })
    if (conflicting.length === 0) return overrides
    for (const id of conflicting) Reflect.deleteProperty(overrides, id)
  }
}

// Compare arrays/values for equality to avoid unnecessary updates.
// Prevents infinite loops when value/selected are bound to reactive wrappers
// that clone arrays on assignment (e.g. Superforms, Svelte stores). See issue #309.
// Treats null/undefined/[] as equivalent empty states to prevent extra updates on init (#369).
export function values_equal(val1: unknown, val2: unknown): boolean {
  if (val1 === val2) return true
  const is_empty = (val: unknown) =>
    val === null || val === undefined || (Array.isArray(val) && val.length === 0)
  if (is_empty(val1) && is_empty(val2)) return true
  if (Array.isArray(val1) && Array.isArray(val2)) {
    return val1.length === val2.length && val1.every((item, idx) => item === val2[idx])
  }
  return false
}

// replaceAll rebuilds the whole string, so skip it when there is nothing to normalize
const HAS_COLLAPSIBLE_WHITESPACE = /\s\s|[^\S ]/u
const HAS_NON_PLAIN_WHITESPACE = /[^\S ]/u

// Case-insensitive subsequence match: returns the indices in target_text where
// the characters of search_text appear in order, or null if not all characters
// can be matched. An empty search matches with no indices.
export function fuzzy_match_indices(
  search_text: string,
  target_text: string,
): number[] | null {
  // collapse runs in the search; map every whitespace char in the target to a space
  let search = search_text.toLowerCase()
  if (HAS_COLLAPSIBLE_WHITESPACE.test(search)) search = search.replaceAll(/\s+/gu, ` `)
  let target = target_text.toLowerCase()
  if (HAS_NON_PLAIN_WHITESPACE.test(target)) target = target.replaceAll(/\s/gu, ` `)

  // Greedy leftmost match; pos only moves forward, so scanning stays linear.
  const indices: number[] = []
  let pos = -1
  // by code unit, not for...of: code points emit one index per astral char, two expected
  // oxlint-disable-next-line typescript/prefer-for-of
  for (let search_idx = 0; search_idx < search.length; search_idx++) {
    pos = target.indexOf(search[search_idx], pos + 1)
    if (pos === -1) return null
    indices.push(pos)
  }
  return indices
}

// True if search is a subsequence of target, e.g. "tageoo" matches "tasks/geo-opt"
export function fuzzy_match(search_text: string, target_text: string): boolean {
  // guard null/undefined inputs (fuzzy_match_indices would throw on .toLowerCase())
  if (search_text == null || target_text == null) return false
  // empty search matches everything, empty target matches nothing - both already
  // handled by fuzzy_match_indices (empty search -> [], else vs empty target -> null)
  return fuzzy_match_indices(search_text, target_text) !== null
}

// A titled run of actions for ActionMenu, optionally a radio group: `selected` matches
// an action's `id ?? label`, null being a group with nothing chosen yet. Left off, the
// section is a plain heading and its items stay ordinary menu items.
export type CmdSection = {
  title: string
  actions: CmdAction[]
  selected?: string | number | null
}

export const format_cmd_metadata = (metadata: CmdAction[`metadata`]): string =>
  Array.isArray(metadata) ? metadata.join(` · `) : (metadata ?? ``)

export function cmd_action_matches(
  action: CmdAction,
  search: string,
  fuzzy = true,
): boolean {
  const terms = search.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const searchable_text = [
    action.label,
    action.description,
    action.badge,
    action.group,
    action.shortcut,
    action.keywords?.join(` `),
    format_cmd_metadata(action.metadata),
  ]
    .filter(Boolean)
    .join(` `)
    .toLowerCase()
  return terms.every((term) =>
    fuzzy ? fuzzy_match(term, searchable_text) : searchable_text.includes(term),
  )
}

// Coalesces subtree mutations into one refresh per microtask, including mutations caused by
// `refresh` itself. Callers perform their own initial refresh.
// Svelte updates a reactive `{value}` by writing the text node's `nodeValue`, which is a
// characterData mutation and fires no childList record — so text that changes in place is
// invisible to an observer that does not opt in.
export function observe_subtree(
  root: Element,
  attribute_filter: string[],
  refresh: () => void,
  watch_text = false,
): () => void {
  let queued = false
  let disposed = false
  const observer = new MutationObserver(() => {
    if (queued || disposed) return
    queued = true
    queueMicrotask(() => {
      queued = false
      if (!disposed) refresh()
    })
  })
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: attribute_filter,
    characterData: watch_text,
  })
  return () => {
    disposed = true
    observer.disconnect()
  }
}

// === Masonry ===
export const order_options = [
  `balanced`, // Rebalances all items to shortest columns (items may jump)
  // New items go to the shortest column and placed items stay put, except when the
  // column count grows: assignments reset so the new columns get used
  `balanced-stable`,
  `row-first`, // Round-robin: 1->2->3->1->2->3...
  `column-sequential`, // Purely sequential: first N items in col 1, next N in col 2
  `column-balanced`, // Height-aware: fill col 1 to target height, then col 2, etc.
] as const
export type MasonryOrder = (typeof order_options)[number]
