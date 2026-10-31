import { start_polling } from '#lib/poll.ts'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'

const set_hidden = (hidden: boolean): void => {
  Object.defineProperty(document, `hidden`, { configurable: true, value: hidden })
  document.dispatchEvent(new Event(`visibilitychange`))
}
const focus_window = () => globalThis.dispatchEvent(new Event(`focus`))

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, `hidden`, { configurable: true, value: false })
})

// Coming back runs at once and re-arms the interval, so that run is not followed by the
// interval's own a moment later; hidden ticks skip, and stopping ends both triggers.
test(`runs on an interval while visible and once on return, never twice in a row`, async () => {
  const task = vi.fn()
  const stop = start_polling(task, { interval_ms: 60_000 })
  await vi.advanceTimersByTimeAsync(60_000)
  expect(task).toHaveBeenCalledTimes(1)
  set_hidden(true)
  await vi.advanceTimersByTimeAsync(119_000) // ticks while hidden skip
  expect(task).toHaveBeenCalledTimes(1)
  set_hidden(false)
  expect(task).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(59_999)
  expect(task).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(task).toHaveBeenCalledTimes(3)
  stop()
  set_hidden(false)
  await vi.advanceTimersByTimeAsync(120_000)
  expect(task).toHaveBeenCalledTimes(3)
})

test(`the task receives a signal that aborts on stop`, () => {
  const task = vi.fn()
  const stop = start_polling(task, { interval_ms: 1000 })
  vi.advanceTimersByTime(1000)
  const [signal] = task.mock.calls[0] as [AbortSignal]
  expect(signal.aborted).toBe(false)
  stop()
  expect(signal.aborted).toBe(true)
})

test.each([0, 500])(
  `first_delay_ms=%s sets only the first timed run`,
  async (first_delay_ms) => {
    const task = vi.fn()
    const stop = start_polling(task, { interval_ms: 10_000, first_delay_ms })
    await vi.advanceTimersByTimeAsync(first_delay_ms)
    expect(task).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(9999)
    expect(task).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(task).toHaveBeenCalledTimes(2)
    stop()
  },
)

// Collects the unhandled rejections `run` causes, in place of vitest's own reporter
const collect_rejections = async (run: () => Promise<unknown>): Promise<string[]> => {
  const reported: string[] = []
  const listeners = process.listeners(`unhandledRejection`)
  process.removeAllListeners(`unhandledRejection`)
  process.on(`unhandledRejection`, (error: Error) => reported.push(error.message))
  try {
    await run()
    vi.useRealTimers() // node reports unhandled rejections after a real macrotask
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
  } finally {
    process.removeAllListeners(`unhandledRejection`)
    for (const listener of listeners) process.on(`unhandledRejection`, listener)
  }
  return reported
}

// The interval re-arms before the task runs, so a task that throws or rejects keeps polling.
test.each([
  [
    `throwing`,
    () => {
      throw new Error(`poll failed`)
    },
  ],
  [`rejecting`, () => Promise.reject(new Error(`poll failed`))],
])(
  `a %s task surfaces each error unhandled and keeps the loop going`,
  async (_desc, fail) => {
    const task = vi.fn(fail)
    const stop = start_polling(task, { interval_ms: 1000 })
    const reported = await collect_rejections(() => vi.advanceTimersByTimeAsync(2000))
    expect(task).toHaveBeenCalledTimes(2)
    expect(reported).toEqual([`poll failed`, `poll failed`])
    stop()
  },
)

// Ticks, returns and run_now() landing while a run is pending skip; the interval stays armed.
test(`an async task never overlaps itself, and its rejection after stop is ignored`, async () => {
  const pending: PromiseWithResolvers<unknown>[] = []
  const task = vi.fn(() => {
    pending.push(Promise.withResolvers())
    return pending.at(-1)?.promise
  })
  const stop = start_polling(task, { interval_ms: 1000 })
  await vi.advanceTimersByTimeAsync(3000) // ticks at 2 s and 3 s land while the first is pending
  set_hidden(true)
  set_hidden(false)
  stop.run_now()
  expect(task).toHaveBeenCalledOnce()
  pending[0].resolve(undefined)
  await vi.advanceTimersByTimeAsync(500)
  stop.run_now() // runs at once and restarts the interval from 3.5 s
  expect(task).toHaveBeenCalledTimes(2)
  pending[1].resolve(undefined)
  await vi.advanceTimersByTimeAsync(999)
  expect(task).toHaveBeenCalledTimes(2)
  await vi.advanceTimersByTimeAsync(1)
  expect(task).toHaveBeenCalledTimes(3)
  stop()
  const reported = await collect_rejections(async () =>
    pending[2].reject(new DOMException(`aborted`, `AbortError`)),
  )
  expect(reported).toEqual([])
})

// A loop that runs while hidden still catches up on return; focus counts as a return only
// when asked, gated by the catch-up age.
test(`while_hidden runs hidden ticks; catch_up_after_ms gates returns and focus`, async () => {
  const task = vi.fn()
  const stop = start_polling(task, {
    interval_ms: 60_000,
    first_delay_ms: 1000,
    while_hidden: true,
    catch_up_after_ms: 30_000,
    catch_up_on_focus: true,
  })
  set_hidden(true)
  await vi.advanceTimersByTimeAsync(1000)
  expect(task).toHaveBeenCalledOnce()
  set_hidden(false) // the last run is fresh: no catch-up
  focus_window()
  expect(task).toHaveBeenCalledOnce()
  await vi.advanceTimersByTimeAsync(30_000)
  focus_window()
  expect(task).toHaveBeenCalledTimes(2)
  // a run returning false skipped its work, so it leaves the catch-up age running
  task.mockReturnValue(false)
  await vi.advanceTimersByTimeAsync(60_000)
  expect(task).toHaveBeenCalledTimes(3)
  focus_window() // the last real run was 60 s ago
  expect(task).toHaveBeenCalledTimes(4)
  stop()
})

test.each([
  [`focus is ignored without catch_up_on_focus`, false, 0],
  [`focus catches up with catch_up_on_focus`, true, 1],
])(`%s`, (_desc, catch_up_on_focus, expected_calls) => {
  const task = vi.fn()
  const stop = start_polling(task, { interval_ms: 60_000, catch_up_on_focus })
  focus_window()
  expect(task).toHaveBeenCalledTimes(expected_calls)
  stop()
})

test(`catch_up_after_ms = interval_ms only catches up an overdue task`, async () => {
  const task = vi.fn()
  const stop = start_polling(task, { interval_ms: 10_000, catch_up_after_ms: 10_000 })
  await vi.advanceTimersByTimeAsync(4000)
  set_hidden(false)
  expect(task).not.toHaveBeenCalled()
  set_hidden(true)
  await vi.advanceTimersByTimeAsync(30_000)
  set_hidden(false)
  expect(task).toHaveBeenCalledOnce()
  stop()
})

test.each([0, -1, Number.NaN, Infinity])(`interval_ms=%s throws`, (interval_ms) => {
  expect(() => start_polling(() => {}, { interval_ms })).toThrow(/interval_ms must be/u)
})
