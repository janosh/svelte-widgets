import type { CmdAction, Option } from './types'
import { is_active_element } from './attachments/shared'
import { DIACRITIC, DIACRITICS, splits_letter } from './internal/diacritics'

let uuid_counter = 0

export const chain_handlers =
  <EventType>(...handlers: (((event: EventType) => unknown) | null | undefined)[]) =>
  (event: EventType): void =>
    handlers.forEach((handler) => handler?.(event))

// UUID for DOM IDs. Fallback is timestamp+counter: unique enough, not secure.
export function get_uuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID()
  const hex = (Date.now().toString(16) + (uuid_counter++).toString(16)).padStart(32, `0`)
  return hex.replaceAll(/(?<=^.{8}|^.{12}|^.{16}|^.{20})/gu, `-`) // 8-4-4-4-12
}

export const is_object = (val: unknown): val is Record<string, unknown> =>
  typeof val === `object` && val !== null

export const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max)

// Returns a detector reporting whether each value differs (===) from the previous call's.
// The first call only records its value and returns false; NaN always counts as changed.
export const make_change_detector = (): ((value: unknown) => boolean) => {
  const unset = Symbol(`unset`)
  let previous: unknown = unset
  return (value: unknown) => {
    const changed = previous !== unset && value !== previous
    previous = value
    return changed
  }
}

export const clamp_integer = (
  value: number,
  minimum: number,
  maximum = Infinity,
  fallback = minimum,
): number =>
  Number.isFinite(value) ? clamp(Math.floor(value), minimum, maximum) : fallback

export const slug_to_title = (slug: string): string =>
  slug
    .replaceAll(`-`, ` `)
    .replaceAll(/(?<![\p{L}\p{M}\p{N}_])\p{L}/gu, (letter) => letter.toUpperCase())

export const has_group = <T extends Option>(opt: T): opt is T & { group: string } =>
  is_object(opt) && typeof opt.group === `string`

// Label of an object option, or the primitive option stringified
export const get_label = (opt: Option) => {
  if (!is_object(opt)) return `${opt}`
  if (opt.label === undefined)
    throw new TypeError(
      `MultiSelect: option object must have a label key, got ${JSON.stringify(opt)}`,
    )
  return opt.label
}

// Unique option key: value ?? label for objects, the primitive itself otherwise
export const get_option_key = (opt: Option): unknown =>
  is_object(opt) ? (opt.value ?? get_label(opt)) : opt

const is_style_key = (name: string): boolean => name === `option` || name === `selected`
// CSS from an option's style (string or {option, selected}); non-empty result ends in `;`
export function get_style(
  option: Option,
  key: `selected` | `option` | null | undefined = null,
) {
  if (key !== null && key !== `selected` && key !== `option`)
    throw new TypeError(`MultiSelect: invalid key=${String(key)} for get_style`)
  if (!is_object(option) || !option.style) return ``
  const { style } = option
  // partial style objects are fine; unknown keys are not
  if (typeof style !== `string` && Object.keys(style).some((name) => !is_style_key(name)))
    throw new TypeError(
      `MultiSelect: option style may only contain "option" and "selected" keys`,
    )
  const css_str = typeof style === `string` ? style : ((key && style[key]) ?? ``)
  const trimmed = css_str.trim()
  return trimmed && !trimmed.endsWith(`;`) ? `${css_str};` : css_str
}

// === Floating geometry ===
// "pick a side that fits, then stay on screen", shared by every floating surface

export type Placement = `top` | `right` | `bottom` | `left`

export type PositionOptions = {
  placement?: Placement | `auto`
  align?: `center` | `start` | `end` // start/end line up the matching anchor/floating edges
  offset?: number // gap between anchor and floating box
  cross_axis_offset?: number // nudge perpendicular to the chosen side
  padding?: number // closest the floating box may come to a viewport edge
  boundary?: { top: number; left: number; right: number; bottom: number }
  fallback_placements?: Placement[] // tried after a fixed placement; restricts `auto`
  // true tries the opposite side then the perpendicular ones; an explicit list keeps e.g.
  // a dropdown from ever landing beside its input
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
  // Only main-axis overflow flips; counting the cross axis (shifting's job) would send an
  // edge-aligned bottom tooltip to the left instead.
  const main_axis_overflow = (side: Placement): number => {
    const needed = side === `top` || side === `bottom` ? floating.height : floating.width
    return Math.max(0, needed - free_space[side])
  }

  // `flip: false` pins the requested side, else least main-axis overflow wins
  const explicit_order = fallback_placements ?? (Array.isArray(flip) ? flip : null)
  const candidate_placements = (): Placement[] => {
    if (flip === false) return [requested]
    if (!explicit_order) return FLIP_ORDER[requested]
    // a named placement stays first choice, its fallbacks queue up behind it
    if (fallback_placements && placement !== `auto`)
      return [requested, ...explicit_order.filter((side) => side !== requested)]
    return explicit_order
  }

  // plain `auto` has no preferred side, so it breaks overflow ties on free space
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
    // oversize boxes reverse the limits; between them overflow is minimal
    left = clamp(left, Math.min(min_left, max_left), Math.max(min_left, max_left))
    top = clamp(top, Math.min(min_top, max_top), Math.max(min_top, max_top))
  }
  return { top, left, placement: chosen }
}

// === Keyboard shortcuts ===

// `mod` is Cmd on Apple keyboards and Ctrl everywhere else, so one binding covers both
const primary_modifier = (): `meta` | `ctrl` =>
  /mac|iphone|ipad|ipod/iu.test(globalThis.navigator?.userAgent ?? ``) ? `meta` : `ctrl`

// `,`, `+` and space are spelled out so a combo can always be split on `+`;
// matching needs the literal `event.key` back
const KEY_TOKENS = new Map([
  [`,`, `comma`],
  [`+`, `plus`],
  [` `, `space`],
])
const TOKEN_KEYS = new Map([...KEY_TOKENS].map(([key, token]) => [token, key]))

export function parse_shortcut(shortcut: string): {
  key: string
  ctrl: boolean
  shift: boolean
  alt: boolean
  meta: boolean
} | null {
  const parts = shortcut_parts(shortcut, true)
  if (!parts) return null
  const key = parts.pop() ?? ``
  return {
    key: TOKEN_KEYS.get(key) ?? key,
    ctrl: parts.includes(`ctrl`),
    shift: parts.includes(`shift`),
    alt: parts.includes(`alt`),
    meta: parts.includes(`meta`),
  }
}

export function matches_shortcut(
  event: KeyboardEvent,
  shortcut: string | null | undefined,
): boolean {
  if (!shortcut) return false
  const parsed = parse_shortcut(shortcut)
  if (!parsed) return false
  const { key, ctrl, shift, alt, meta } = parsed
  return (
    event.key.toLowerCase() === key &&
    event.ctrlKey === ctrl &&
    (event.shiftKey === shift || (key === `+` && !shift)) &&
    event.altKey === alt &&
    event.metaKey === meta
  )
}

// Display symbols per segment. Only `mod` is platform-dependent, the rest render alike.
const key_symbols = new Map([
  [`meta`, `⌘`],
  [`shift`, `⇧`],
  [`alt`, `⌥`],
  [`ctrl`, `Ctrl`],
  [`enter`, `↵`],
  [`backspace`, `⌫`],
  [`delete`, `⌦`],
  [`escape`, `Esc`],
  [`arrowup`, `↑`],
  [`arrowdown`, `↓`],
  [`arrowleft`, `←`],
  [`arrowright`, `→`],
  [`comma`, `,`],
  [`plus`, `+`],
  [`space`, `␣`],
])

export function format_shortcut(shortcut: string): string[] {
  const parts = shortcut_parts(shortcut, true)
  if (!parts) throw new TypeError(`Invalid keyboard shortcut: ${shortcut}`)
  return parts.map(
    (part) =>
      key_symbols.get(part) ?? part.replace(/^./u, (first) => first.toUpperCase()),
  )
}

export type Hotkey = {
  keys: string | string[] // e.g. `mod+k`, `ctrl+shift+p`, `Escape`
  handler: (event: KeyboardEvent) => void
  enabled?: boolean
  // bare keys are ignored while typing in a text field (chords always fire);
  // set true for keys that must work either way
  allow_in_inputs?: boolean
  prevent_default?: boolean // default true
}

// Runs the first matching binding and reports whether one fired. Shared by the `hotkey`
// attachment and components that own a window listener.
export function run_hotkeys(event: KeyboardEvent, bindings: Hotkey[]): boolean {
  if (event.isComposing) return false // mid-IME the keystroke belongs to the editor
  // outside a chord, a bare key in a text field is typing, not a shortcut
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

// event came from a text-entry control, where a bare key is typing
export const is_editable_event_target = (target: EventTarget | null): boolean => {
  if (!(target instanceof Element)) return false
  if (target.closest(`input, textarea, select`)) return true
  // Only valid values override inheritance; a false island stops an editable ancestor.
  const editable = target.closest(
    `[contenteditable=""], [contenteditable="true" i], [contenteditable="plaintext-only" i], [contenteditable="false" i]`,
  )
  return (
    editable !== null &&
    editable.getAttribute(`contenteditable`)?.toLowerCase() !== `false`
  )
}

// Alt/Ctrl/Meta make a keystroke a chord. Shift is excluded: it types capitals.
export const is_modifier_chord = (event: KeyboardEvent): boolean =>
  event.altKey || event.ctrlKey || event.metaKey

// Move focus within items, wrapping at both ends, returning the newly focused item so a
// radio group can carry its selection along; undefined (event untouched) for a non-nav key
// or empty list. Left/Right are opt-in so vertical menus leave them to the page. Focus from
// outside gives idx -1: forward/Home land on the first item, backward/End on the last.
export function step_focus<T extends HTMLElement>(
  event: KeyboardEvent,
  items: T[],
  { horizontal = false }: { horizontal?: boolean } = {},
): T | undefined {
  if (event.defaultPrevented || event.isComposing || is_modifier_chord(event))
    return undefined
  const { key } = event
  const back = key === `ArrowUp` || (horizontal && key === `ArrowLeft`)
  const forward = key === `ArrowDown` || (horizontal && key === `ArrowRight`)
  if (!back && !forward && key !== `Home` && key !== `End`) return undefined
  const count = items.length
  if (count === 0) return undefined
  event.preventDefault()
  const idx = items.findIndex(is_active_element)
  let next = count - 1 // End, and a backward step from outside the list
  if (key === `Home`) next = 0
  else if (forward) next = (idx + 1) % count
  else if (back) next = (Math.max(idx, 0) - 1 + count) % count
  const target = items[next]
  target?.focus()
  return target
}

// === Shortcut rebinding ===
// Reverse of parse_shortcut, for UIs recording user shortcuts. Canonical spelling:
// modifiers in fixed order, `mod` for the platform primary, nothing that breaks a `+` split.

const MODIFIER_ORDER = [`mod`, `meta`, `ctrl`, `alt`, `shift`]
// other spellings users and `event.key` produce for the modifiers above
const MODIFIER_ALIASES = new Map([
  [`cmd`, `meta`],
  [`command`, `meta`],
  [`control`, `ctrl`],
  [`option`, `alt`],
])

// `event.key` values that are a modifier in their own right, never a combo's key
const MODIFIER_EVENT_KEYS = new Set(
  `meta control alt altgraph shift capslock fn`.split(` `),
)

// Canonical combo for a keydown, e.g. `mod+shift+t`; null for a pure-modifier press.
// `mod` keeps one recording working on both platforms; mod: false records the physical
// modifier instead, for a combo deliberately bound to one platform.
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
  const primary = primary_modifier()
  if (mod && held[primary]) {
    held[primary] = false
    held.mod = true
  }
  const mods = MODIFIER_ORDER.filter((name) => held[name])
  return [...mods, KEY_TOKENS.get(key) ?? key].join(`+`)
}

// Parsing, formatting, matching and conflict detection all use this grammar.
function shortcut_parts(combo: string, resolve_mod = false): string[] | null {
  const primary = primary_modifier()
  const segments = combo
    .toLowerCase()
    .split(`+`)
    .map((part) => part.trim())
  // a trailing `++` is the plus key itself
  if (segments.at(-1) === `` && segments.at(-2) === ``) segments.splice(-2, 2, `+`)
  const parts = segments.map((part) => {
    const name = MODIFIER_ALIASES.get(part) ?? part
    return resolve_mod && name === `mod` ? primary : name
  })
  if (parts.includes(``)) return null
  const keys = parts.filter((part) => !MODIFIER_ORDER.includes(part))
  if (keys.length !== 1 || MODIFIER_EVENT_KEYS.has(keys[0])) return null
  const key = KEY_TOKENS.get(keys[0]) ?? keys[0]
  return [...MODIFIER_ORDER.filter((name) => parts.includes(name)), key]
}

// Canonical form of a hand-written or stored combo; null for junk (no key, several keys,
// lone modifier). Bare keys like `escape` pass since run_hotkeys accepts them;
// require_modifier rejects them for rebinding UIs, where they'd swallow ordinary typing.
export function normalize_combo(
  combo: string,
  { require_modifier = false }: { require_modifier?: boolean } = {},
): string | null {
  const parts = shortcut_parts(combo)
  if (!parts || (require_modifier && parts.length === 1)) return null
  return parts.join(`+`)
}

// `mod+k` and the platform's own spelling of that chord are one shortcut and must collide,
// so conflicts are judged on this resolved form; storage keeps the `mod` spelling.
const resolve_combo = (combo: string): string => {
  const parts = shortcut_parts(combo, true)
  if (!parts) throw new TypeError(`Invalid keyboard shortcut: ${combo}`)
  return parts.join(`+`)
}

// Validate stored `action id -> combo` overrides against defaults, dropping unknown ids,
// junk combos, ones restating the default, and ones that would shadow another action.
export function sanitize_shortcut_overrides(
  value: unknown,
  defaults: Record<string, string>,
): Record<string, string> {
  const canonical_defaults = Object.fromEntries(
    Object.entries(defaults).map(([id, combo]) => {
      const normalized = normalize_combo(combo)
      if (!normalized) throw new TypeError(`Invalid shortcut for action ${id}: ${combo}`)
      return [id, normalized]
    }),
  )
  if (!is_object(value)) return {}
  const entries: [string, string][] = []
  for (const [action_id, combo] of Object.entries(value)) {
    if (!Object.hasOwn(canonical_defaults, action_id) || typeof combo !== `string`)
      continue
    const normalized = normalize_combo(combo)
    if (normalized && normalized !== canonical_defaults[action_id]) {
      entries.push([action_id, normalized])
    }
  }
  const overrides = Object.fromEntries(entries)
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

// replaceAll rebuilds the whole string, so skip it when there is nothing to normalize
const HAS_COLLAPSIBLE_WHITESPACE = /\s\s|[^\S ]/u
const HAS_NON_PLAIN_WHITESPACE = /[^\S ]/u

// Lowercase both; collapse runs in the search and map every target whitespace char to a
// space, which keeps target indices aligned with the lowercased target.
const fuzzy_fold = (search_text: string, target_text: string): [string, string] => {
  let search = search_text.toLowerCase()
  if (HAS_COLLAPSIBLE_WHITESPACE.test(search)) search = search.replaceAll(/\s+/gu, ` `)
  let target = target_text.toLowerCase()
  if (HAS_NON_PLAIN_WHITESPACE.test(target)) target = target.replaceAll(/\s/gu, ` `)
  return [search, target]
}

// Case-insensitive subsequence match: indices in target_text where search_text's chars
// appear in order, or null if any is missing. An empty search matches with no indices.
export function fuzzy_match_indices(
  search_text: string,
  target_text: string,
): number[] | null {
  const [search, target] = fuzzy_fold(search_text, target_text)
  let target_offsets: number[] | undefined
  if (target.length !== target_text.length) {
    target_offsets = []
    let source_offset = 0
    for (const character of target_text) {
      const normalized = character.toLowerCase()
      for (let unit_idx = 0; unit_idx < normalized.length; unit_idx++) {
        // keep UTF-16 indices for astral chars while folding extra case-folded units
        // (İ -> i + combining dot) back onto their one source unit
        target_offsets.push(source_offset + Math.min(unit_idx, character.length - 1))
      }
      source_offset += character.length
    }
  }

  // greedy leftmost match; pos only moves forward, so scanning stays linear
  const indices: number[] = []
  let pos = -1
  // Match whole code points, but return one source index per UTF-16 unit for rendering.
  for (const character of search) {
    pos = target.indexOf(character, pos + 1)
    if (pos === -1) return null
    for (let unit_idx = 0; unit_idx < character.length; unit_idx++)
      indices.push(target_offsets?.[pos + unit_idx] ?? pos + unit_idx)
    pos += character.length - 1
  }
  return indices
}

// True if search is a subsequence of target, e.g. "tageoo" matches "tasks/geo-opt"
export function fuzzy_match(search_text: string, target_text: string): boolean {
  // Filtering needs no source offsets or highlighted indices, even when case folding
  // expands a character. Only the rendering helper pays for those allocations.
  const [search, target] = fuzzy_fold(search_text, target_text)
  let offset = 0
  for (const character of search) {
    offset = target.indexOf(character, offset)
    if (offset === -1) return false
    offset += character.length
  }
  return true
}

export const format_cmd_metadata = (metadata: CmdAction[`metadata`]): string =>
  Array.isArray(metadata) ? metadata.join(` · `) : (metadata ?? ``)

export const cmd_action_matches = (
  action: CmdAction,
  search: string,
  fuzzy = true,
): boolean => create_cmd_action_filter(search, fuzzy)(action)

const NON_ASCII = /\P{ASCII}/u
// lowercase with final sigma as medial
const fold_case = (text: string): string => text.toLowerCase().replaceAll(`ς`, `σ`)
// Both forms compare composed (NFC), so a decomposed mark can neither come from another
// letter nor let か match the start of が.
const strip_diacritics = (text: string): string =>
  text.normalize(`NFD`).replace(DIACRITICS, ``).normalize(`NFC`)

// Splits query into whitespace terms once; the returned predicate is true when every term
// occurs in text (as an ordered subsequence with fuzzy), ignoring case. Like search_text, a
// term without diacritics ignores them (`cafe` matches `café`) while an accented term
// requires them. A blank query matches everything. `split: false` keeps the query as one
// term, collapsing whitespace runs in query and text to single spaces (MultiSelect options).
export function create_term_matcher(
  query: string,
  { fuzzy = false, split = true }: { fuzzy?: boolean; split?: boolean } = {},
): (text: string) => boolean {
  const terms = (split ? query.trim().split(/\s+/) : [query.replaceAll(/\s+/g, ` `)])
    .filter(Boolean)
    .map((term) => {
      const folded = fold_case(term)
      const keep_marks = DIACRITIC.test(folded.normalize(`NFD`))
      const normalized = keep_marks ? folded.normalize(`NFC`) : strip_diacritics(folded)
      return { term: normalized, chars: Array.from(normalized), keep_marks }
    })
  // A hit may not stop before a mark NFC couldn't compose, which belongs to its letter
  // (क vs क़); fuzzy hits apply that to every matched char.
  const occurs = ({ term, chars }: (typeof terms)[number], text: string): boolean => {
    if (!fuzzy) {
      for (let idx = text.indexOf(term); idx >= 0; idx = text.indexOf(term, idx + 1))
        if (!splits_letter(text, idx + term.length)) return true
      return false
    }
    let offset = 0
    for (const [char_idx, char] of chars.entries()) {
      let position = text.indexOf(char, offset)
      while (
        position !== -1 &&
        splits_letter(text, position + char.length, chars[char_idx + 1])
      )
        position = text.indexOf(char, position + 1)
      if (position === -1) return false
      offset = position + char.length
    }
    return true
  }
  return (text) => {
    if (!split) text = text.replaceAll(/\s+/g, ` `)
    // ASCII has no case expansion or diacritics to fold
    if (!NON_ASCII.test(text)) {
      const lower = text.toLowerCase()
      return terms.every((term) => occurs(term, lower))
    }
    const folded = fold_case(text)
    let marked: string | undefined
    let plain: string | undefined
    return terms.every((term) =>
      occurs(
        term,
        term.keep_marks
          ? (marked ??= folded.normalize(`NFC`))
          : (plain ??= strip_diacritics(folded)),
      ),
    )
  }
}

// Prepare query terms once for a batch; action fields remain live between calls.
export function create_cmd_action_filter(
  search: string,
  fuzzy = true,
): (action: CmdAction) => boolean {
  const matches = create_term_matcher(search, { fuzzy })
  return (action) =>
    matches(
      [
        action.label,
        action.description,
        action.badge,
        action.group,
        action.shortcut,
        action.keywords?.join(` `),
        format_cmd_metadata(action.metadata),
      ]
        .filter(Boolean)
        .join(` `),
    )
}

// Coalesces subtree mutations (including ones `refresh` causes) into one refresh per
// microtask; callers do their own initial refresh. watch_text is needed because Svelte
// updates a reactive `{value}` via the text node's `nodeValue`, a characterData mutation
// that fires no childList record.
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
  `balanced`, // rebalances all items to shortest columns (items may jump)
  // new items go to the shortest column, placed items stay put; a growing column count
  // resets assignments so the new columns get used
  `balanced-stable`,
  `row-first`, // round-robin: 1->2->3->1->2->3...
  `column-sequential`, // first N items in col 1, next N in col 2
  `column-balanced`, // height-aware: fill col 1 to target height, then col 2, etc.
] as const
export type MasonryOrder = (typeof order_options)[number]
