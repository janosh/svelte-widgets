import { build_path, parse_path } from './path'
import type { DiffEntry, JsonValueType } from './types'

type JsonChild = { key: string | number; value: unknown }

// Circular-safe JSON.stringify
function safe_stringify(val: unknown): string {
  const seen = new WeakSet()
  return JSON.stringify(
    val,
    (_key, inner) => {
      if (typeof inner === `object` && inner !== null) {
        if (seen.has(inner)) return `[Circular]`
        seen.add(inner)
      }
      if (typeof inner === `bigint`) return `${inner}n`
      if (typeof inner === `symbol`) return inner.toString()
      // oxlint-disable-next-line @typescript-eslint/prefer-nullish-coalescing -- anonymous fns have name ``
      if (typeof inner === `function`) return `[Function: ${inner.name || `anonymous`}]`
      return inner
    },
    2,
  )
}

export function get_value_type(value: unknown): JsonValueType {
  if (value === null) return `null`
  if (value === undefined) return `undefined`

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

// Types whose String() form is searchable
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
  const type = get_value_type(value)
  if (type === `array`) return (value as unknown[]).length
  if (type === `object`) return Object.keys(value as object).length
  if (type === `map`) return (value as Map<unknown, unknown>).size
  if (type === `set`) return (value as Set<unknown>).size
  return 0
}

// The single definition of what a node's children are, shared by rendering, path lookup,
// search, collapse bookkeeping and diffing so they can never disagree. Map entries are
// wrapped as { key, value } objects under numeric indices so non-string keys stay
// expandable; Set members get numeric indices.
export function get_children(value: unknown, sort_keys = false): JsonChild[] {
  const type = get_value_type(value)
  if (type === `array`)
    return (value as unknown[]).map((val, idx) => ({ key: idx, value: val }))
  if (type === `object`) {
    const record = value as Record<string, unknown>
    const keys = Object.keys(record)
    if (sort_keys) keys.sort()
    return keys.map((key) => ({ key, value: record[key] }))
  }
  if (type === `map`) {
    return Array.from(value as Map<unknown, unknown>, ([key, val], idx) => ({
      key: idx,
      value: { key, value: val },
    }))
  }
  if (type === `set`)
    return Array.from(value as Set<unknown>, (val, idx) => ({ key: idx, value: val }))
  return []
}

// Segments of a tree path relative to the root value. The root node's path is the verbatim
// root_label (JsonBrowser passes filenames like `data.json`), which parse_path would split
// into several segments, so the label is stripped textually before parsing. A path that
// merely starts with the label text (`data.json` vs `data.jsonl`) is left alone.
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
  if (type === `date`) return (value as Date).toISOString()
  if (type === `regexp`) return (value as RegExp).toString()
  if (type === `error`) return `${(value as Error).name}: ${(value as Error).message}`
  return null // not a special type
}

// Clipboard text for a value: strings verbatim, containers as indented JSON
export function serialize_for_copy(value: unknown): string {
  const type = get_value_type(value)
  if (type === `string`) return value as string
  if (type === `function`) return (value as (...args: unknown[]) => unknown).toString()

  const special = format_special_value(value, type)
  if (special !== null) return special

  // Map/Set/Object/Array - try JSON stringify
  const data =
    type === `map`
      ? Array.from((value as Map<unknown, unknown>).entries())
      : type === `set`
        ? Array.from(value as Set<unknown>)
        : value
  try {
    return safe_stringify(data)
  } catch {
    return String(value)
  }
}

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

// Case-insensitive match of query against the path, the key or a primitive value
export function matches_search(
  path: string,
  key: string | number | null,
  value: unknown,
  query: string,
): boolean {
  if (!query) return false

  const lower_query = query.toLowerCase()
  if (path.toLowerCase().includes(lower_query)) return true
  if (key !== null && String(key).toLowerCase().includes(lower_query)) return true
  return (
    is_primitive_type(get_value_type(value)) &&
    String(value).toLowerCase().includes(lower_query)
  )
}

// Depth-first pre-order walk in render order, skipping already-visited objects so cycles
// terminate. visit returns false to stop descending into a node.
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

// Paths whose key, path or primitive value contains query, in render order
export function find_matching_paths(
  value: unknown,
  query: string,
  current_path: string = ``,
  sort_keys = false,
): string[] {
  const matches: string[] = []
  if (!query) return matches
  walk_tree(value, current_path, sort_keys, (val, path, key) => {
    if (matches_search(path, key, val, query)) matches.push(path)
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

// Equality for change detection: NaN equals NaN, containers compare by size only (deep
// changes are detected at the child level)
export function values_equal(val_a: unknown, val_b: unknown): boolean {
  if (val_a === val_b) return true
  if (typeof val_a === `number` && typeof val_b === `number`) {
    return Number.isNaN(val_a) && Number.isNaN(val_b)
  }
  if (val_a === null || val_b === null || typeof val_a !== typeof val_b) return false

  const type = get_value_type(val_a)
  if (type !== get_value_type(val_b)) return false
  if (is_primitive_type(type) || type === `symbol`) return false // strict equality failed above
  if (type === `date`) return (val_a as Date).getTime() === (val_b as Date).getTime()
  if (type === `regexp`)
    return (val_a as RegExp).toString() === (val_b as RegExp).toString()
  if (type === `array`) return (val_a as unknown[]).length === (val_b as unknown[]).length
  if (type === `object`) {
    return Object.keys(val_a as object).length === Object.keys(val_b as object).length
  }
  return false
}

// Typed value of an edited string: numbers, booleans and null are detected, the rest stays text
export function parse_edited_value(text: string): unknown {
  const trimmed = text.trim()
  if (trimmed === `null`) return null
  if (trimmed === `true`) return true
  if (trimmed === `false`) return false
  const num = Number(trimmed)
  if (trimmed !== `` && Number.isFinite(num)) return num
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
  seen = new WeakSet<object>(),
): Map<string, DiffEntry> {
  if (Object.is(old_val, new_val)) return result
  const old_type = get_value_type(old_val)
  const new_type = get_value_type(new_val)
  const mark_changed = () =>
    result.set(current_path, {
      status: `changed`,
      path: current_path,
      old_value: old_val,
      new_value: new_val,
    })

  if (old_type !== new_type) {
    mark_changed()
    return result
  }

  if (is_primitive_type(old_type)) {
    if (!values_equal(old_val, new_val)) mark_changed()
    return result
  }

  // Non-expandable special types (date, regexp, etc): compare string forms
  if (!is_expandable_type(old_type)) {
    if (String(old_val) !== String(new_val)) mark_changed()
    return result
  }

  if (seen.has(old_val as object)) return result // cycle
  seen.add(old_val as object)

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
    if (!old_children.has(key)) {
      result.set(child_path, {
        status: `added`,
        path: child_path,
        new_value: new_children.get(key),
      })
    } else if (!new_children.has(key)) {
      result.set(child_path, {
        status: `removed`,
        path: child_path,
        old_value: old_children.get(key),
      })
    } else {
      compute_diff(old_children.get(key), new_children.get(key), child_path, result, seen)
    }
  }
  return result
}
