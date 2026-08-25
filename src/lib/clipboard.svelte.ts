import { SvelteSet } from 'svelte/reactivity'

// Headless "recently copied" state for UIs that render their own copy affordances, where
// CopyButton's markup would be in the way: a table of values each with its own checkmark,
// a code block with a copy target per line.

export interface ClipboardFeedback {
  // Keys flagged as copied within the last `duration_ms`. Reactive, so reading it in
  // markup re-renders when a flag comes or goes.
  copied: SvelteSet<string>
  // Writes `text` to the clipboard and flags `key` (the text itself by default). Returns
  // whether the write succeeded; a failure only resolves to false if `on_error` is set to
  // handle it, otherwise it throws.
  copy: (text: string, key?: string) => Promise<boolean>
  // Drops the flag and its pending timer, for one key or all of them.
  clear: (key?: string) => void
}

export const create_clipboard_feedback = (
  duration_ms = 1000,
  on_error?: (error: unknown, text: string) => void,
): ClipboardFeedback => {
  const copied = new SvelteSet<string>()
  // plain Map: timer bookkeeping is not UI state and must not subscribe callers
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  const clear = (key?: string): void => {
    for (const timer_key of key === undefined ? [...timers.keys()] : [key]) {
      clearTimeout(timers.get(timer_key))
      timers.delete(timer_key)
      copied.delete(timer_key)
    }
  }

  const copy = async (text: string, key: string = text): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text)
    } catch (error) {
      if (!on_error) throw error // a silently dropped copy looks identical to a slow one
      on_error(error, text)
      return false
    }
    clearTimeout(timers.get(key)) // a re-copy gets a full window, not the old remainder
    copied.add(key)
    const timer = setTimeout(() => clear(key), duration_ms)
    timers.set(key, timer)
    return true
  }

  return { copied, copy, clear }
}
