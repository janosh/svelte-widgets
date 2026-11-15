import { SvelteSet } from 'svelte/reactivity'

// Headless "recently copied" state for UIs rendering their own copy affordances, where
// CopyButton's markup is in the way: a value table with a checkmark per row, a code block
// with a copy target per line.

export interface ClipboardFeedback {
  // keys copied within the last `duration_ms`; reactive, so markup re-renders on change
  copied: SvelteSet<string>
  // Writes `text` and flags `key` (the text itself by default), returning whether the write
  // succeeded. A failure resolves false only when `on_error` handles it, else it throws.
  copy: (text: string, key?: string) => Promise<boolean>
  // drops the flag and its pending timer, for one key or all
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
