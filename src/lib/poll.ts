// Interval polling that, by default, pauses while the page is hidden and catches up when the
// reader returns. Framework-agnostic: call it from onMount or an $effect and hand the returned
// stop function back as the cleanup.

export interface PollOptions {
  interval_ms: number
  // Delay before the first timed run; one interval by default, 0 to run right away
  first_delay_ms?: number
  // Keep timed runs going while the document is hidden. Timers still stall while the machine
  // sleeps, so returning catches up either way.
  while_hidden?: boolean
  // Returning to the page runs the task only once its last run (or the start) is at least
  // this old. 0 (the default) always runs, interval_ms runs only an overdue task.
  catch_up_after_ms?: number
  // Treat window focus as a return too, e.g. to pick up an edit made in another app. Focus and
  // visibilitychange often fire together, so pair this with a catch_up_after_ms above 0 or a
  // task that settles at once runs twice.
  catch_up_on_focus?: boolean
}

// The task gets a signal that aborts on stop, for cancelling in-flight requests. Returning (or
// resolving to) false marks a run that skipped its work, so it does not reset the catch-up age.
export type PollTask = (signal: AbortSignal) => unknown

// Returns the stop function, whose run_now() runs the task at once and restarts the interval
// (e.g. for a refresh button). A run never overlaps the previous one: ticks, returns and
// run_now() landing before its result settles are skipped, so abort or time out hung requests
// through the signal or polling stalls. The interval re-arms before the task runs, so a task
// that throws or rejects does not stop the loop; the error surfaces as an unhandled rejection,
// unless it comes after stop.
export const start_polling = (
  task: PollTask,
  options: PollOptions,
): (() => void) & { run_now: () => void } => {
  const {
    interval_ms,
    first_delay_ms = interval_ms,
    while_hidden = false,
    catch_up_after_ms = 0,
    catch_up_on_focus = false,
  } = options
  if (!(interval_ms > 0 && Number.isFinite(interval_ms))) {
    throw new RangeError(
      `start_polling: interval_ms must be a positive finite number, got ${interval_ms}`,
    )
  }
  const controller = new AbortController()
  const { signal } = controller
  let in_flight = false
  let last_run_ms = Date.now()
  let timer = setTimeout(tick, first_delay_ms)

  function run(): void {
    clearTimeout(timer)
    timer = setTimeout(tick, interval_ms)
    if (in_flight) return
    in_flight = true
    const started_ms = Date.now()
    // The executor calls the task at once and turns a synchronous throw into a rejection
    void new Promise((resolve) => {
      resolve(task(signal))
    })
      .then(
        (value) => {
          if (value !== false) last_run_ms = started_ms
        },
        (error: unknown) => {
          if (!signal.aborted) throw error // the stop that aborted it caused it
        },
      )
      .finally(() => {
        in_flight = false
      })
  }
  function tick(): void {
    if (while_hidden || !document.hidden) run()
    else timer = setTimeout(tick, interval_ms)
  }
  const on_return = (): void => {
    if (!document.hidden && Date.now() - last_run_ms >= catch_up_after_ms) run()
  }

  document.addEventListener(`visibilitychange`, on_return, { signal })
  if (catch_up_on_focus) globalThis.addEventListener(`focus`, on_return, { signal })
  const stop = (): void => {
    controller.abort()
    clearTimeout(timer)
  }
  return Object.assign(stop, { run_now: run })
}
