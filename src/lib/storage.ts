// Best-effort localStorage: disabled/private/full stores become no-ops so in-memory UI
// state still works. Also provides persisted choices and MRU lists.

import { clamp_integer, is_object } from './utils'

// Single catch-all for storage failures; callers retain working state in memory.
const guarded = <Result>(access: () => Result, fallback: Result): Result => {
  try {
    return access()
  } catch {
    return fallback
  }
}

export const storage_get = (key: string): string | null =>
  guarded(() => globalThis.localStorage?.getItem(key) ?? null, null)

export const storage_set = (key: string, value: string): void =>
  guarded(() => globalThis.localStorage?.setItem(key, value), undefined)

export const storage_remove = (key: string): void =>
  guarded(() => globalThis.localStorage?.removeItem(key), undefined)

// Parsed storage is untrusted; callers must narrow before use.
export const storage_get_json = (key: string, fallback: unknown): unknown =>
  guarded((): unknown => JSON.parse(storage_get(key) ?? ``), fallback)

export const storage_set_json = (key: string, value: object): void => {
  const serialized = guarded(() => JSON.stringify(value), undefined)
  if (serialized !== undefined) storage_set(key, serialized)
}

const is_finite_number = (value: unknown): value is number =>
  typeof value === `number` && Number.isFinite(value)

// Persisted panel size; null when missing/invalid so callers use their default.
export const storage_get_size = (key: string): { w: number; h: number } | null => {
  const size: unknown = storage_get_json(key, null)
  if (!is_object(size)) return null
  const { w, h } = size
  return is_finite_number(w) && is_finite_number(h) ? { w, h } : null
}

// Stored option while valid, otherwise fallback. Pair with storage_set on change.
export const persisted_choice = <T extends string>(
  key: string,
  options: readonly T[],
  fallback: T,
): T => {
  const stored = storage_get(key)
  return options.find((option) => option === stored) ?? fallback
}

type RecentListConfig<T> = {
  storage_key: string
  max_items: number // non-negative integer
  key_of: (item: T) => string
  // Drop invalid or stale entries on load.
  is_valid: (value: unknown) => value is T
}

// Persisted MRU list deduped by key_of. Methods take/return lists; callers own state.
export const create_recent_list = <T>(config: RecentListConfig<T>) => {
  const { storage_key, max_items, key_of, is_valid } = config
  if (!Number.isInteger(max_items) || max_items < 0) {
    throw new RangeError(`max_items must be a non-negative integer, got ${max_items}`)
  }
  const persist = (items: T[]): T[] => {
    storage_set_json(storage_key, items)
    return items
  }
  const without = (items: T[], key: string): T[] =>
    items.filter((candidate) => key_of(candidate) !== key)
  return {
    load: (): T[] => {
      const parsed: unknown = storage_get_json(storage_key, [])
      if (!Array.isArray(parsed)) return []
      const seen_keys = new Set<string>()
      return parsed
        .filter(is_valid)
        .filter((item) => {
          const key = key_of(item)
          if (seen_keys.has(key)) return false
          seen_keys.add(key)
          return true
        })
        .slice(0, max_items)
    },
    remember: (item: T, items: T[]): T[] =>
      persist([item, ...without(items, key_of(item))].slice(0, max_items)),
    forget: (key: string, items: T[]): T[] => persist(without(items, key)),
    // Re-insert a just-forgotten item at its original position (undo support)
    restore: (item: T, index: number, items: T[]): T[] => {
      const rest = without(items, key_of(item))
      const clamped = clamp_integer(index, 0, rest.length)
      return persist(
        [...rest.slice(0, clamped), item, ...rest.slice(clamped)].slice(0, max_items),
      )
    },
  }
}
