import { create_clipboard_feedback } from '$lib/clipboard.svelte'
import { flushSync } from 'svelte'
import { afterAll, afterEach, beforeEach, expect, test, vi } from 'vitest'

// happy-dom has no navigator.clipboard, so writeText is a spy. Timers are faked to keep
// the feedback window assertions exact rather than sleeping through them.
const write_text = vi.fn<(text: string) => Promise<void>>()
vi.stubGlobal(`navigator`, { clipboard: { writeText: write_text } })

beforeEach(() => {
  write_text.mockReset()
  write_text.mockResolvedValue(undefined)
  vi.useFakeTimers()
})
afterEach(() => vi.useRealTimers())
// the stub is file-wide, so it can only go once every test is done
afterAll(() => vi.unstubAllGlobals())

test(`copy writes the text and flags the key for the feedback window`, async () => {
  const { copied, copy } = create_clipboard_feedback(1000)

  expect(await copy(`npm test`, `install-cmd`)).toBe(true)
  expect(write_text).toHaveBeenCalledWith(`npm test`)
  expect([...copied]).toEqual([`install-cmd`])

  await vi.advanceTimersByTimeAsync(999)
  expect([...copied]).toEqual([`install-cmd`])
  await vi.advanceTimersByTimeAsync(1)
  expect([...copied]).toEqual([])

  await copy(`git status`) // key defaults to the text
  expect([...copied]).toEqual([`git status`])
})

// Without the reset, a re-copy would inherit the remainder of the first timer and the
// checkmark would blink out early - the one thing the caller cannot fix from outside.
test(`re-copying a key restarts its timer without touching the others`, async () => {
  const { copied, copy } = create_clipboard_feedback(1000)
  await copy(`a`, `first`)
  await vi.advanceTimersByTimeAsync(800)
  await copy(`b`, `second`)
  await vi.advanceTimersByTimeAsync(100)
  await copy(`a`, `first`) // 900ms into `first`'s original window

  expect([...copied].toSorted()).toEqual([`first`, `second`])
  await vi.advanceTimersByTimeAsync(900)
  expect([...copied]).toEqual([`first`]) // `second` expired on its own schedule
  await vi.advanceTimersByTimeAsync(100)
  expect([...copied]).toEqual([])
})

test(`a failed write throws when no on_error handler is given`, async () => {
  const failure = new Error(`clipboard blocked`)
  write_text.mockRejectedValue(failure)
  const { copied, copy } = create_clipboard_feedback()

  await expect(copy(`x`, `key`)).rejects.toThrow(failure) // never silently swallowed
  expect([...copied]).toEqual([]) // and nothing is flagged as copied
})

test(`on_error takes over the failure and copy reports false`, async () => {
  const failure = new Error(`clipboard blocked`)
  write_text.mockRejectedValue(failure)
  const on_error = vi.fn()
  const { copied, copy } = create_clipboard_feedback(1000, on_error)

  expect(await copy(`x`, `key`)).toBe(false)
  expect(on_error).toHaveBeenCalledWith(failure, `x`)
  expect([...copied]).toEqual([])
})

test(`clear drops one key or all of them, canceling their timers`, async () => {
  const { copied, copy, clear } = create_clipboard_feedback(1000)
  await copy(`a`, `first`)
  await copy(`b`, `second`)

  clear(`first`)
  expect([...copied]).toEqual([`second`])

  await copy(`a`, `first`)
  clear()
  expect([...copied]).toEqual([])
  expect(vi.getTimerCount()).toBe(0) // no timer left to un-flag a key that is gone
})

// A `clear()` that read the flag set would make every later copy re-run its caller's
// effect, so a "reset on unmount" effect would loop against its own cleanup.
test(`clear does not subscribe its calling effect to timer state`, async () => {
  const { copy, clear } = create_clipboard_feedback(1000)
  await copy(`a`, `first`)

  let runs = 0
  const cleanup = $effect.root(() => {
    $effect(() => {
      runs++
      clear()
    })
  })
  flushSync()
  expect(runs).toBe(1)

  await copy(`b`, `second`)
  flushSync()
  expect(runs).toBe(1)

  cleanup()
  clear()
})
