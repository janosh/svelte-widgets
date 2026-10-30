import { untrack } from 'svelte'
import { createSubscriber } from 'svelte/reactivity'

type Signal = { subscribe: () => void; notify?: () => void }

// Like SolidJS's createSelector: `is(key)` re-runs a reader only when its own key enters or
// leaves the current key (or set of keys), where `current === key` in every row re-ran all
// N rows per change. A key's signal lives while a reader subscribes. Call during init.
// For one key per reader (a row): an aggregate over many keys (all selected?) should read
// the source directly, as a subscription per key costs more than the lookups it saves.
export const create_key_selector = <Key>(get_current: () => Key | ReadonlySet<Key>) => {
  const signals = new Map<Key, Signal>()
  const as_set = (current: Key | ReadonlySet<Key>) =>
    new Set(current instanceof Set ? current : [current]) // copied: sets mutate in place
  let previous = new Set<Key>()
  let read_early = new Set<Key>() // answered ahead of the effect, maybe since reverted
  $effect.pre(() => {
    const next = as_set(get_current())
    const notify = (key: Key) => signals.get(key)?.notify?.()
    // each flipped key, then early answers a revert made stale (flipped ones already ran)
    for (const key of previous) if (!next.has(key)) notify(key)
    for (const key of next) if (!previous.has(key)) notify(key)
    for (const key of read_early) if (previous.has(key) === next.has(key)) notify(key)
    ;[previous, read_early] = [next, new Set()]
  })
  return (key: Key): boolean => {
    if ($effect.tracking()) {
      let signal = signals.get(key)
      if (!signal) {
        const entry: Signal = {
          subscribe: createSubscriber((notify) => {
            entry.notify = notify
            return () => signals.delete(key)
          }),
        }
        signals.set(key, (signal = entry))
      }
      signal.subscribe()
    }
    // untracked: a SvelteSet's `has` of an absent key would subscribe to the whole set
    const answer = untrack(() => {
      const current = get_current()
      return current instanceof Set ? current.has(key) : current === key
    })
    if (answer !== previous.has(key)) read_early.add(key)
    return answer
  }
}

// The previous row when every field of the rebuilt one equals it, so a keyed each and the
// rows reading it see no change: rebuilding a list re-renders only rows that changed
export const keep_unchanged = <Row extends object>(
  previous: Row | undefined,
  row: Row,
): Row =>
  previous &&
  (Object.keys(row) as (keyof Row)[]).every((key) => previous[key] === row[key])
    ? previous
    : row
