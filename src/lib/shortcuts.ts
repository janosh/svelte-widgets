import { is_object } from './utils'
import { is_active_element, is_composing } from './attachments/shared'

// `mod` is Cmd on Apple keyboards and Ctrl everywhere else, so one binding covers both
const primary_modifier = (): `meta` | `ctrl` =>
  /mac|iphone|ipad|ipod/iu.test(globalThis.navigator?.userAgent ?? ``) ? `meta` : `ctrl`

// `,`, `+` and space are spelled out so a combo always splits on `+`; TOKEN_KEYS maps back
const KEY_TOKENS = new Map([
  [`,`, `comma`],
  [`+`, `plus`],
  [` `, `space`],
])
const TOKEN_KEYS = new Map([...KEY_TOKENS].map(([key, token]) => [token, key]))

export function parse_shortcut(shortcut: string) {
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
  const parsed = shortcut ? parse_shortcut(shortcut) : null
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
  [`pageup`, `PgUp`],
  [`pagedown`, `PgDn`],
  [`arrowup`, `↑`],
  [`arrowdown`, `↓`],
  [`arrowleft`, `←`],
  [`arrowright`, `→`],
  [`comma`, `,`],
  [`plus`, `+`],
  [`space`, `␣`],
])

export const format_shortcut = (shortcut: string): string[] =>
  resolved_parts(shortcut).map(
    (part) =>
      key_symbols.get(part) ?? part.replace(/^./u, (first) => first.toUpperCase()),
  )

export type Hotkey = {
  keys: string | string[] // e.g. `mod+k`, `ctrl+shift+p`, `Escape`
  handler: (event: KeyboardEvent) => void
  enabled?: boolean
  // bare keys are ignored while typing in a text field (chords always fire);
  // set true for keys that must work either way
  allow_in_inputs?: boolean
  prevent_default?: boolean // default true
}

// Runs the first matching binding and reports whether one fired
export function run_hotkeys(event: KeyboardEvent, bindings: Hotkey[]): boolean {
  if (is_composing(event)) return false // mid-IME the keystroke belongs to the editor
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
  return editable ? !editable.matches(`[contenteditable="false" i]`) : false
}

// Alt/Ctrl/Meta make a keystroke a chord. Shift is excluded: it types capitals.
export const is_modifier_chord = (event: KeyboardEvent): boolean =>
  event.altKey || event.ctrlKey || event.metaKey

// A link click the browser handles itself (new tab or window, download), so skip in-page routing
export const is_modified_click = (event: MouseEvent): boolean =>
  event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey

// Move focus within items, wrapping at both ends, returning the newly focused item so a
// radio group can carry its selection along; undefined (event untouched) for a non-nav key
// or empty list. Left/Right are opt-in so vertical menus leave them to the page. Focus from
// outside gives idx -1: forward/Home land on the first item, backward/End on the last.
export function step_focus<T extends HTMLElement>(
  event: KeyboardEvent,
  items: T[],
  { horizontal = false }: { horizontal?: boolean } = {},
): T | undefined {
  if (event.defaultPrevented || is_composing(event) || is_modifier_chord(event))
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

// shortcut_parts with `mod` resolved, throwing on junk
function resolved_parts(combo: string): string[] {
  const parts = shortcut_parts(combo, true)
  if (!parts) throw new TypeError(`Invalid keyboard shortcut: ${combo}`)
  return parts
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
const resolve_combo = (combo: string): string => resolved_parts(combo).join(`+`)

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
    if (normalized && normalized !== canonical_defaults[action_id])
      entries.push([action_id, normalized])
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
