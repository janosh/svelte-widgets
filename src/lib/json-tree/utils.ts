import { build_path, parse_path } from './path'
import type { DiffEntry, JsonValueType } from './types'

type JsonChild = { key: string | number; value: unknown }

// Circular-safe JSON.stringify that keeps Maps, Sets, Errors and RegExps readable instead of
// emitting `{}` for them at any depth
function safe_stringify(val: unknown): string | undefined {
  // Objects JSON.stringify is currently inside, each paired with the value it replaced
  const ancestors: { holder: object; source: object }[] = []
  return JSON.stringify(
    val,
    function (this: object, _key: string, inner: unknown) {
      if (typeof inner === `bigint`) return `${inner}n`
      if (typeof inner === `symbol`) return inner.toString()
      if (typeof inner === `function`) return `[Function: ${inner.name || `anonymous`}]`
      if (typeof inner !== `object` || inner === null) return inner
      while (ancestors.length && ancestors.at(-1)?.holder !== this) ancestors.pop()
      if (ancestors.some(({ source }) => source === inner)) return `[Circular]`
      const type = get_value_type(inner)
      const replaced =
        type === `map` || type === `set`
          ? Array.from(inner as Iterable<unknown>)
          : (format_special_value(inner, type) ?? inner)
      if (typeof replaced === `object`)
        ancestors.push({ holder: replaced, source: inner })
      return replaced
    },
    2,
  )
}

export function get_value_type(value: unknown): JsonValueType {
  if (value === null) return `null`
  const type = typeof value
  // string/number/boolean/symbol/bigint/function map directly to JsonValueType
  if (type !== `object`) return type

  if (Array.isArray(value)) return `array`
  if (value instanceof Date) return `date`
  if (value instanceof RegExp) return `regexp`
  if (value instanceof Map) return `map`
  if (value instanceof Set) return `set`
  if (value instanceof Error) return `error`
  return `object`
}

// Container types whose children render as nodes
export const is_expandable_type = (value_type: JsonValueType): boolean =>
  value_type === `object` ||
  value_type === `array` ||
  value_type === `map` ||
  value_type === `set`

// Scalars compared by value
const is_primitive_type = (value_type: JsonValueType): boolean =>
  value_type === `string` ||
  value_type === `number` ||
  value_type === `boolean` ||
  value_type === `null` ||
  value_type === `undefined` ||
  value_type === `bigint`

export const is_expandable = (value: unknown): boolean =>
  is_expandable_type(get_value_type(value))

export function get_child_count(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value instanceof Map || value instanceof Set) return value.size
  return get_value_type(value) === `object` ? Object.keys(value as object).length : 0
}

// Shared traversal: Map entries become indexed { key, value } objects so non-string keys
// remain expandable; Set members use numeric indices.
export function get_children(value: unknown, sort_keys = false): JsonChild[] {
  if (Array.isArray(value)) return value.map((val, idx) => ({ key: idx, value: val }))
  if (value instanceof Map)
    return Array.from(value, ([key, val], idx) => ({
      key: idx,
      value: { key, value: val },
    }))
  if (value instanceof Set)
    return Array.from(value, (val, idx) => ({ key: idx, value: val }))
  if (get_value_type(value) !== `object`) return []
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (sort_keys) keys.sort()
  return keys.map((key) => ({ key, value: record[key] }))
}

// Strip the verbatim root label before parsing: labels such as `data.json` can contain dots.
// Require a segment boundary so `data.json` does not strip a prefix from `data.jsonl`.
export function relative_path_segments(
  path: string,
  root_label?: string,
): (string | number)[] {
  if (!root_label || !path.startsWith(root_label)) return parse_path(path)
  const rest = path.slice(root_label.length)
  if (rest !== `` && !rest.startsWith(`.`) && !rest.startsWith(`[`))
    return parse_path(path)
  return parse_path(rest)
}

// Resolve a dot/bracket path (optionally prefixed by root_label) against root
export function get_value_at_path(
  root: unknown,
  path: string,
  root_label?: string,
): unknown {
  const segments = relative_path_segments(path, root_label)
  let current = root
  for (const segment of segments) {
    const type = get_value_type(current)
    if (type === `map` || type === `set`) {
      current = get_children(current)[Number(segment)]?.value
    } else if (type === `object` || type === `array`) {
      if (!Object.hasOwn(current as object, segment)) return undefined
      current = (current as Record<string | number, unknown>)[segment]
    } else return undefined
  }
  return current
}

// String form of a non-container value, or null for strings/functions/containers
function format_special_value(value: unknown, type: JsonValueType): string | null {
  if (type === `undefined`) return `undefined`
  if (type === `null`) return `null`
  if (type === `number` || type === `boolean`) return String(value)
  if (type === `bigint`) return `${value}n`
  if (type === `symbol`) return (value as symbol).toString()
  if (type === `date`) {
    const date = value as Date
    return Number.isNaN(date.getTime()) ? `Invalid Date` : date.toISOString()
  }
  if (type === `regexp`) return (value as RegExp).toString()
  if (type === `error`) return `${(value as Error).name}: ${(value as Error).message}`
  return null // not a special type
}

// Clipboard text for a value: strings verbatim, other leaves as displayed, containers as
// indented JSON
export function serialize_for_copy(value: unknown): string {
  const type = get_value_type(value)
  if (type === `string`) return value as string
  if (type === `function`) return (value as (...args: unknown[]) => unknown).toString()
  return format_special_value(value, type) ?? to_json(value)
}

// Valid JSON text for any value (a file export): cycles become "[Circular]", non-JSON leaves
// their display strings, and a bare undefined `null`
export const to_json = (value: unknown): string => safe_stringify(value) ?? `null`

// Inline preview of a collapsed node or leaf
export function format_preview(value: unknown, max_length: number = 50): string {
  const type = get_value_type(value)
  if (type === `array`) return `Array(${(value as unknown[]).length})`
  if (type === `object`) {
    const len = Object.keys(value as object).length
    return `{${len} ${len === 1 ? `key` : `keys`}}`
  }
  if (type === `map`) return `Map(${(value as Map<unknown, unknown>).size})`
  if (type === `set`) return `Set(${(value as Set<unknown>).size})`
  if (type === `string`) {
    const str = value as string
    return str.length > max_length ? `"${str.slice(0, max_length)}..."` : `"${str}"`
  }
  if (type === `function`) {
    return `ƒ ${(value as (...args: unknown[]) => unknown).name || `anonymous`}()`
  }
  return format_special_value(value, type) ?? String(value)
}

// Case-insensitive match of query against a node's key or its displayed leaf text. Paths
// are not matched: every descendant of a matching key (and of the root label) would match.
export function matches_search(
  key: string | number | null,
  value: unknown,
  query: string,
): boolean {
  if (!query) return false
  const lower_query = query.toLowerCase()
  if (key !== null && String(key).toLowerCase().includes(lower_query)) return true
  const type = get_value_type(value)
  if (is_expandable_type(type)) return false
  const text = type === `string` ? (value as string) : format_preview(value)
  return text.toLowerCase().includes(lower_query)
}

// Depth-first pre-order walk in render order. Skip ancestors to terminate cycles while
// visiting shared objects at every path. visit returns false to stop descending.
function walk_tree(
  value: unknown,
  current_path: string,
  sort_keys: boolean,
  visit: (
    value: unknown,
    path: string,
    key: string | number | null,
    depth: number,
  ) => boolean,
): void {
  const seen = new WeakSet<object>()
  const recurse = (
    val: unknown,
    path: string,
    key: string | number | null,
    depth: number,
  ) => {
    if (!visit(val, path, key, depth)) return
    if (!is_expandable(val)) return
    if (seen.has(val as object)) return
    seen.add(val as object)
    for (const child of get_children(val, sort_keys)) {
      recurse(child.value, build_path(path, child.key), child.key, depth + 1)
    }
    seen.delete(val as object)
  }
  recurse(value, current_path, null, 0)
}

// Collect all expandable paths (render order), starting at current_path when non-empty
export function collect_all_paths(
  value: unknown,
  current_path: string = ``,
  max_depth: number = Infinity,
): string[] {
  const paths: string[] = []
  walk_tree(value, current_path, false, (val, path, _key, depth) => {
    if (depth >= max_depth || !is_expandable(val)) return false
    if (path) paths.push(path)
    return true
  })
  return paths
}

// Paths whose key or leaf text contains query, in render order
export function find_matching_paths(
  value: unknown,
  query: string,
  current_path: string = ``,
  sort_keys = false,
): string[] {
  const matches: string[] = []
  if (!query) return matches
  walk_tree(value, current_path, sort_keys, (val, path, key) => {
    if (matches_search(key, val, query)) matches.push(path)
    return true
  })
  return matches
}

// Ancestor paths, outermost first: "users[0].name" -> ["users", "users[0]"]
export function get_ancestor_paths(path: string, root_label = ``): string[] {
  const segments = relative_path_segments(path, root_label)
  const ancestors: string[] = root_label && segments.length ? [root_label] : []
  let current = root_label
  for (const segment of segments.slice(0, -1)) {
    current = build_path(current, segment)
    ancestors.push(current)
  }
  return ancestors
}

// Leaf equality for change detection and edits: NaN equals NaN, Dates compare by timestamp,
// RegExps by source and flags. Distinct containers are unequal (JsonTree diffs them per child).
export function values_equal(val_a: unknown, val_b: unknown): boolean {
  if (val_a === val_b || (Number.isNaN(val_a) && Number.isNaN(val_b))) return true
  const type = get_value_type(val_a)
  if (type !== get_value_type(val_b)) return false
  if (type === `date`) return (val_a as Date).getTime() === (val_b as Date).getTime()
  if (type === `regexp`)
    return (val_a as RegExp).toString() === (val_b as RegExp).toString()
  return false
}

// JSON number grammar: Number() also accepts `0x1F`, `+5` and `007`, silently turning hex
// codes and leading-zero IDs (zip codes) into different numbers
const JSON_NUMBER_RE = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/

// Typed value of an edited string: JSON numbers, booleans and null are detected, the rest
// stays text
export function parse_edited_value(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === `null`) return null
  if (trimmed === `true`) return true
  if (trimmed === `false`) return false
  const num = Number(trimmed)
  if (JSON_NUMBER_RE.test(trimmed) && Number.isFinite(num)) return num
  return text
}

// Replace an existing dot/bracket path, copying its ancestors and sharing untouched branches.
export function set_at_path(
  root: unknown,
  path_str: string,
  new_value: unknown,
  root_label?: string,
): unknown {
  const segments = relative_path_segments(path_str, root_label)
  const replace = (current: unknown, depth: number): unknown => {
    if (depth === segments.length) return new_value
    const collection = current instanceof Map || current instanceof Set
    const container = collection
      ? get_children(current).map(({ value }) => value)
      : current
    const key = collection ? Number(segments[depth]) : segments[depth]
    if (!container || typeof container !== `object` || !Object.hasOwn(container, key))
      throw new Error(`Cannot edit missing path ${path_str} at segment ${String(key)}`)
    const record = container as Record<string | number, unknown>
    const copy = Array.isArray(container) ? container.slice() : { ...record }
    // Define an own property so literal __proto__ keys remain data.
    Object.defineProperty(copy, key, {
      value: replace(record[key], depth + 1),
      enumerable: true,
      configurable: true,
      writable: true,
    })
    if (current instanceof Map)
      return new Map(
        (copy as unknown[]).map((entry) => {
          if (
            !entry ||
            typeof entry !== `object` ||
            !(`key` in entry && `value` in entry)
          )
            throw new Error(`Map entry at ${path_str} must contain key and value`)
          return [entry.key, entry.value]
        }),
      )
    if (current instanceof Set) return new Set(copy as unknown[])
    return copy
  }
  return replace(root, 0)
}

const URL_RE = /^https?:\/\/\S+$/

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i
const FUNC_COLOR_RE = /^(?:rgba?|hsla?|oklch|oklab|lch|lab|color)\([^)]*\)$/i

export const is_url = (str: string): boolean => URL_RE.test(str.trim())

// Swatch-worthy CSS color; semicolons are rejected so the value can't inject declarations
export function is_css_color(str: string): boolean {
  const trimmed = str.trim()
  if (trimmed.includes(`;`)) return false
  return HEX_COLOR_RE.test(trimmed) || FUNC_COLOR_RE.test(trimmed)
}

// Rough serialized byte size; subtrees past max_depth count a flat 10 so large trees stay cheap
export function estimate_byte_size(
  value: unknown,
  max_depth: number = 4,
  current_depth: number = 0,
): number {
  if (current_depth >= max_depth) return 10
  const type = get_value_type(value)
  if (type === `null`) return 4
  if (type === `undefined`) return 9
  if (type === `boolean`) return value ? 4 : 5
  if (type === `number` || type === `bigint`) return String(value).length
  if (type === `string`) return (value as string).length + 2
  if (type === `symbol`) return (value as symbol).toString().length
  if (type === `function`) return 20
  if (type === `date`) return 24
  if (type === `regexp`) return (value as RegExp).toString().length
  if (type === `error`) {
    return `${(value as Error).name}: ${(value as Error).message}`.length
  }
  // Collections: 2 bracket bytes plus each child with a per-entry overhead (object keys
  // `"key": `, Map keys a flat 10, array/Set separators 1)
  const child_size = (val: unknown) =>
    estimate_byte_size(val, max_depth, current_depth + 1)
  let size = 2
  if (type === `object`) {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      size += key.length + 4 + child_size(val)
    }
  } else if (type === `map`) {
    for (const val of (value as Map<unknown, unknown>).values())
      size += child_size(val) + 10
  } else for (const val of value as Iterable<unknown>) size += child_size(val) + 1
  return size
}

// A child removed between compare_value and value, rendered struck through under its parent
export interface GhostEntry {
  key: string | number
  value: unknown
  path: string
}

// parent path -> removed children, so an expanded node reads its ghosts in O(1)
export function build_ghost_map(
  diff_map: Map<string, DiffEntry>,
  root_label = ``,
): Map<string, GhostEntry[]> {
  const ghost_map = new Map<string, GhostEntry[]>()
  for (const [diff_path, entry] of diff_map) {
    if (entry.status !== `removed`) continue
    const segments = relative_path_segments(diff_path, root_label)
    if (segments.length === 0) continue
    const parent_path = segments.slice(0, -1).reduce<string>(build_path, root_label)
    const key = segments[segments.length - 1]
    const ghosts = ghost_map.get(parent_path) ?? []
    ghosts.push({ key, value: entry.old_value, path: diff_path })
    ghost_map.set(parent_path, ghosts)
  }
  return ghost_map
}

// path -> DiffEntry for every path that differs between old_val and new_val
export function compute_diff(
  old_val: unknown,
  new_val: unknown,
  current_path: string = ``,
  result = new Map<string, DiffEntry>(),
  seen = new WeakMap<object, WeakSet<object>>(),
): Map<string, DiffEntry> {
  if (Object.is(old_val, new_val)) return result
  const old_type = get_value_type(old_val)
  const new_type = get_value_type(new_val)
  if (old_type !== new_type || !is_expandable_type(old_type)) {
    // Date strings omit milliseconds; compare the full timestamp instead.
    const equal =
      old_type === new_type &&
      (old_type === `date`
        ? Object.is((old_val as Date).getTime(), (new_val as Date).getTime())
        : is_primitive_type(old_type)
          ? values_equal(old_val, new_val)
          : String(old_val) === String(new_val))
    if (!equal)
      result.set(current_path, {
        status: `changed`,
        path: current_path,
        old_value: old_val,
        new_value: new_val,
      })
    return result
  }

  const compared = seen.get(old_val as object) ?? new WeakSet<object>()
  if (compared.has(new_val as object)) return result // cyclic pair
  compared.add(new_val as object)
  seen.set(old_val as object, compared)

  // Objects diff by key; arrays, Maps and Sets diff by index (Map entries wrapped as
  // { key, value }, matching how get_children renders them)
  const old_children = new Map(
    get_children(old_val).map(({ key, value }) => [key, value]),
  )
  const new_children = new Map(
    get_children(new_val).map(({ key, value }) => [key, value]),
  )
  for (const key of new Set([...old_children.keys(), ...new_children.keys()])) {
    const child_path = build_path(current_path, key)
    const existed = old_children.has(key)
    if (existed && new_children.has(key)) {
      compute_diff(old_children.get(key), new_children.get(key), child_path, result, seen)
    } else {
      result.set(child_path, {
        status: existed ? `removed` : `added`,
        path: child_path,
        ...(existed
          ? { old_value: old_children.get(key) }
          : { new_value: new_children.get(key) }),
      })
    }
  }
  compared.delete(new_val as object)
  return result
}
