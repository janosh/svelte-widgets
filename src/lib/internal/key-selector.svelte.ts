import { untrack } from 'svelte'
import { createSubscriber } from 'svelte/reactivity'

type Signal = { subscribe: () => void; notify?: () => void }

// Like SolidJS's createSelector: `is(key)` re-runs a reader only when its own key enters or
// leaves the current key (or set of keys), where `current === key` in every row re-ran all
// N rows per change. A key's signal lives while a reader subscribes. Call during init.
export const create_key_selector = <Key>(get_current: () => Key | ReadonlySet<Key>) => {
  const signals = new Map<Key, Signal>()
  const as_set = (current: Key | ReadonlySet<Key>) =>
    new Set(current instanceof Set ? current : [current]) // copied: sets mutate in place
  let previous = new Set<Key>()
  let read_early = new Set<Key>() // answered ahead of the effect, maybe since reverted
  $effect.pre(() => {
    const next = as_set(get_current())
    for (const key of new Set([...previous, ...next, ...read_early]))
      if (read_early.has(key) || previous.has(key) !== next.has(key))
        signals.get(key)?.notify?.()
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
