import type { Option } from './types'

let uuid_counter = 0

export const chain_handlers =
  <EventType>(...handlers: (((event: EventType) => unknown) | null | undefined)[]) =>
  (event: EventType): void =>
    handlers.forEach((handler) => handler?.(event))

// UUID for DOM IDs. randomUUID needs a secure context, so plain-http pages fall back to a
// timestamp+counter in UUID shape: unique enough, not secure.
export const get_uuid = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  (Date.now().toString(16) + (uuid_counter++).toString(16))
    .padStart(32, `0`)
    .replaceAll(/(?<=^.{8}|^.{12}|^.{16}|^.{20})/gu, `-`)

export const is_object = (val: unknown): val is Record<string, unknown> =>
  typeof val === `object` && val !== null

export const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value))

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

// Binary search: first index in [0, count) where `is_past(idx)` holds, else `count`.
// `is_past` must be monotone: false for a prefix, then true for the rest.
export const lower_bound = (count: number, is_past: (idx: number) => boolean): number => {
  let low = 0
  let high = count
  while (low < high) {
    // not `>>> 1`: that wraps for counts past 2^31
    const middle = low + Math.floor((high - low) / 2)
    if (is_past(middle)) high = middle
    else low = middle + 1
  }
  return low
}

// Coerce a thrown value into an Error, keeping the original as `cause`. String() throws for
// null-prototype objects and objects whose toString throws, so those get a generic message.
export const to_error = (value: unknown): Error => {
  if (value instanceof Error) return value
  try {
    return new Error(String(value), { cause: value })
  } catch {
    return new Error(`Thrown value cannot be converted to a string`, { cause: value })
  }
}

// A tag opens with a letter, `/` or `!`: a bare `<[^>]*>` ate the prose between a comparison
// pair, so `T < 300 K and P > 1 bar` read back as `T  1 bar`. Quoted attribute values may
// hold `>` (`title="x>0"`), so they are skipped whole. Outside quotes the run stops at `<`:
// with `[^>"']` every unclosed `<` rescanned to the end of input (quadratic), at the cost of
// reading a malformed `<b c <i>` as text up to the `<i>` tag.
export const HTML_TAG_SRC = String.raw`<(?:/?[a-z]|!)(?:[^<>"']|"[^"]*"|'[^']*')*>`
const HTML_TAG_RE = new RegExp(HTML_TAG_SRC, `gi`)
// Tags only, entities kept, for plain-text uses (titles, search records, lengths). Not a sanitizer:
// a split tag reassembles (`<<b>img onerror=x>` leaves `<img onerror=x>`), so escape_html or
// sanitize the result before it reaches {@html} or any other HTML sink.
export const strip_html = (html: string): string => html.replaceAll(HTML_TAG_RE, ``)

// A decimal literal, typeset Unicode minus (U+2212) included: the one number syntax table
// cells, filters and filter bounds read. Not Number() alone: it reads hex/binary/octal, so a
// "0x1f" ID would read as 31, and blank strings as 0. The mantissa alternatives never
// overlap: `\d+\.?\d*` split a digit run between its two quantifiers in O(n²) ways, so a
// 30k-digit cell ending in a letter took over a second.
export const DECIMAL_SRC = String.raw`[-+−]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][-+−]?\d+)?`

export const HTML_ENTITY_SRC = String.raw`&(?:#(?<dec>\d+)|#x(?<hex>[\da-f]+)|(?<name>[a-z][\da-z]+));`
// Named entities common in science; a Map, so `&constructor;` can't hit Object.prototype
// oxfmt-ignore
const NAMED_ENTITIES = new Map(Object.entries({
  amp: `&`, lt: `<`, gt: `>`, quot: `"`, apos: `'`, nbsp: `\u00A0`, thinsp: `\u2009`,
  ndash: `–`, mdash: `—`, hellip: `…`, minus: `−`, plusmn: `±`, times: `×`, middot: `·`,
  sdot: `⋅`, deg: `°`, prime: `′`, le: `≤`, ge: `≥`, ne: `≠`, asymp: `≈`, infin: `∞`,
  sup2: `²`, sup3: `³`, rarr: `→`, larr: `←`, micro: `µ`, angst: `Å`, Aring: `Å`, aring: `å`,
  Auml: `Ä`, auml: `ä`, Ouml: `Ö`, ouml: `ö`, Uuml: `Ü`, uuml: `ü`, eacute: `é`, egrave: `è`,
  ccedil: `ç`, ntilde: `ñ`, szlig: `ß`, sigmaf: `ς`,
}))
const GREEK_NAMES = `alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega`
for (const [idx, name] of GREEK_NAMES.split(` `).entries()) {
  const letter = `αβγδεζηθικλμνξοπρστυφχψω`[idx]
  NAMED_ENTITIES.set(name, letter)
  NAMED_ENTITIES.set(name[0].toUpperCase() + name.slice(1), letter.toUpperCase())
}
// Visible text of an HTML string without a DOM (SSR-safe). One pass drops tags and decodes
// entities, so `&amp;lt;` reads `&lt;` and `&l<i></i>t;` stays `&lt;` as in a browser. Unknown
// entities stay as written. NUL, surrogate and > U+10FFFF references read U+FFFD as in a browser,
// but &#128;-&#159; stay C1 controls (browsers remap those to Windows-1252: &#128; reads €).
const HTML_TEXT_RE = new RegExp(`${HTML_TAG_SRC}|${HTML_ENTITY_SRC}`, `gi`)
export const html_to_text = (str: string): string =>
  str.replaceAll(HTML_TEXT_RE, (match, dec?: string, hex?: string, name?: string) => {
    if (match.startsWith(`<`)) return ``
    if (name) return NAMED_ENTITIES.get(name) ?? match
    const code = hex ? Number.parseInt(hex, 16) : Number(dec)
    const invalid = code === 0 || (code >= 0xd800 && code <= 0xdfff) || code > 0x10ffff
    return invalid ? `\uFFFD` : String.fromCodePoint(code)
  })

// Escape text for HTML element content and quoted attribute values (also valid XML)
export const escape_html = (text: string): string =>
  text
    .replaceAll(`&`, `&amp;`)
    .replaceAll(`<`, `&lt;`)
    .replaceAll(`>`, `&gt;`)
    .replaceAll(`"`, `&quot;`)
    .replaceAll(`'`, `&#39;`)

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
  if (key !== null && !is_style_key(key))
    throw new TypeError(`MultiSelect: invalid key=${key} for get_style`)
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

export const is_plain_object = (value: unknown): value is Record<string, unknown> => {
  if (typeof value !== `object` || value === null) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// A boolean-or-object option merged over defaults, null when off
export const with_defaults = <Defaults extends object, Config extends object>(
  option: boolean | Config | undefined,
  defaults: Defaults,
): (Defaults & Partial<Config>) | null =>
  option ? { ...defaults, ...(typeof option === `object` ? option : {}) } : null

// Drop the oldest entry (Maps iterate in insertion order) once `cache` holds `limit`, so
// caches keyed by data stay bounded without a wholesale clear recomputing the working set
export const evict_oldest = (cache: Map<unknown, unknown>, limit = 4096): void => {
  if (cache.size < limit) return
  const [oldest] = cache.keys()
  cache.delete(oldest)
}
