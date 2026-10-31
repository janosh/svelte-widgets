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
  // sync task runs twice.
  catch_up_on_focus?: boolean
}

// The task gets a signal that aborts on stop, for cancelling in-flight requests. Returning (or
// resolving to) false marks a run that skipped its work, so it does not reset the catch-up age.
export type PollTask = (signal: AbortSignal) => unknown

// Calling it stops polling; run_now() runs at once, or right after a run still in flight
// settles, and re-arms the interval from there.
export type Poller = (() => void) & { run_now: () => void }

// A task returning a promise never overlaps itself: ticks that land while it is pending are
// skipped (the interval stays armed), while run_now() and returns queue one run for when it
// settles, so they never end on data fetched before them. The interval re-arms before the
// task runs, so a task that throws or rejects does not stop the loop; the error surfaces
// uncaught, as from a bare setTimeout, unless it comes after stop.
export const start_polling = (task: PollTask, options: PollOptions): Poller => {
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
  let in_flight = false
  let queued = false // a run_now() or return that landed while in flight
  let last_run_ms = Date.now()
  let timer = setTimeout(tick, first_delay_ms)

  function run(): void {
    if (controller.signal.aborted) return
    if (in_flight) {
      queued = true
      return
    }
    clearTimeout(timer)
    timer = setTimeout(tick, interval_ms)
    const started_ms = Date.now()
    const settle = (value: unknown): void => {
      if (value !== false) last_run_ms = started_ms
    }
    const result = task(controller.signal)
    if (!(result instanceof Promise)) return settle(result)
    in_flight = true
    void result
      .then(settle, (error: unknown) => {
        if (!controller.signal.aborted) throw error // the stop that aborted it caused it
      })
      .finally(() => {
        in_flight = false
        if (queued) {
          queued = false
          run()
        }
      })
  }
  function tick(): void {
    if (!in_flight && (while_hidden || !document.hidden)) run()
    else timer = setTimeout(tick, interval_ms)
  }
  const on_return = (): void => {
    if (!document.hidden && Date.now() - last_run_ms >= catch_up_after_ms) run()
  }

  document.addEventListener(`visibilitychange`, on_return)
  if (catch_up_on_focus) globalThis.addEventListener(`focus`, on_return)
  const stop = (): void => {
    controller.abort()
    clearTimeout(timer)
    document.removeEventListener(`visibilitychange`, on_return)
    globalThis.removeEventListener(`focus`, on_return)
  }
  return Object.assign(stop, { run_now: run })
}
