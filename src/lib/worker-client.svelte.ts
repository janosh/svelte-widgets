// Client for one persistent Web Worker: identical requests share a promise, each caller
// aborts and follows progress on its own, and errors, cancel or the last unmount end the
// worker. The worker side is serve_worker from `svelte-widgets/worker-serve`.
//
// Wire protocol: every request arrives as `{ id, input, options }`. The worker
// replies with `{ id, result, error }` once, and may post any number of `{ id, progress }`
// messages before that for callers that passed `on_progress`. `error` is null on success,
// else `{ name, message, stack }`; any `result`, undefined included, is then the outcome. With
// `retained_inputs` the request names the `held` inputs, and carries `input` only the first
// time a worker sees it.
import { identity_token, to_error, value_key } from './utils'
import type { WorkerError } from './worker-serve'

interface WorkerClientConfig<Input, Options, Result, Progress> {
  // Names the module in error messages, e.g. `MSD`
  label: string
  // Must inline `new URL('./x-worker.js', import.meta.url)` at the call site: Vite detects
  // workers syntactically and cannot follow the URL through a variable.
  create_worker: () => Worker
  // Main-thread implementation where no worker can be created (see can_create_worker).
  // Receives `undefined` when the caller omitted options, exactly as the worker's compute
  // does, so a defaulted `options = {}` parameter serves both paths. The progress callback
  // stays outside cloneable worker options.
  compute_sync: (
    input: Input,
    options: Options | undefined,
    on_progress?: (progress: Progress) => void,
  ) => Result
  // Plain, structured-cloneable stand-in for `input`, by default the input itself. Svelte 5
  // $state proxies are not cloneable, so callers rebuild field by field rather than deep-
  // snapshotting - a proxied typed array still reads back as its raw buffer, which keeps
  // megabyte payloads cheap.
  build_payload?: (input: Input) => unknown
  // Custom providers contain functions that cannot cross the worker boundary. Such requests
  // still use this client's progress, cancellation and error handling, without deduplication.
  requires_main_thread?: (input: Input, options: Options | undefined) => boolean
  // What makes two in-flight requests with equal options one. `input-identity` (default): the
  // same input object. `unordered-payload`: equal payload contents, the top-level payload
  // array compared as a multiset (nested arrays remain ordered).
  dedupe_by?: `input-identity` | `unordered-payload`
  // How many inputs (by identity, most recently used) the worker keeps between requests, for
  // inputs too heavy to clone per request: an options-only change posts the options alone and
  // the worker reuses what it derived from the input. It holds its own copy, so in-place edits
  // go unseen: pass a new object. Such a client posts one request at a time.
  retained_inputs?: number
}

export interface WorkerRequestOptions<Progress = unknown> {
  // Rejects this caller's promise with the signal's reason (an AbortError by default). The
  // worker itself is only torn down when no other caller still awaits a request on it, since
  // terminating it would lose their results too. One that retains inputs first gets
  // ABANDON_GRACE_MS to finish, so a short compute keeps its inputs.
  signal?: AbortSignal
  // Receives every progress report. Throwing rejects only this caller; other callers
  // keep receiving progress and the result, on both worker and main-thread paths.
  on_progress?: (progress: Progress) => void
}

// The module's async entry point: modules export the client itself (e.g. `compute_vacf_async`)
// rather than wrapping it, so `.cancel` / `.mount` travel with the function.
export type WorkerClient<Input, Options, Result, Progress = unknown> = {
  (
    input: Input,
    options?: Options,
    request_options?: WorkerRequestOptions<Progress>,
  ): Promise<Result>
  // Rejects every in-flight request and terminates the worker
  cancel: (reason?: string) => void
  // A component's claim on the worker, returning its release (`$effect(() => client.mount())`):
  // the worker ends once the last claim is released and nothing is in flight
  mount: () => () => void
  // Whether the live worker retains this input, so a request for it posts no payload
  holds: (input: Input) => boolean
}

// Where Worker is missing (SSR) or a host called disable_workers, jobs run on the main
// thread; a worker that can be constructed but then fails mid-job still rejects its requests
let workers_disabled = false
// For hosts that can't load bundled worker files (file://, a CSP refusing blob: workers):
// call once at startup to run every job on the main thread
export const disable_workers = (): void => {
  workers_disabled = true
}
export const can_create_worker = (): boolean =>
  !workers_disabled && typeof Worker !== `undefined`

// For bundles starting workers from blob: URLs (inlined workers, a shim importing a
// cross-origin worker script): a CSP keeping blob: out of worker-src fails them with an
// error event, not a throw. Probe once and move jobs to the main thread if refused.
export const check_blob_workers = async (label: string): Promise<void> => {
  if (typeof Worker === `undefined`) return
  const url = URL.createObjectURL(
    new Blob([`postMessage(0)`], { type: `text/javascript` }),
  )
  let worker: Worker | undefined
  const refusal = await new Promise<string | null>((resolve) => {
    worker = new Worker(url, { type: `module` })
    worker.addEventListener(`message`, () => resolve(null))
    worker.addEventListener(`error`, (event) => resolve(event.message || `start failed`))
    setTimeout(resolve, 2000, `no answer within 2 s`) // a host that neither starts nor fails it
  }).catch((error: unknown) => to_error(error).message)
  worker?.terminate()
  URL.revokeObjectURL(url)
  if (refusal === null) return
  console.warn(
    `${label}: running worker jobs on the main thread, blob: workers refused (${refusal})`,
  )
  disable_workers()
}

const abort_error = (signal: AbortSignal, label: string): Error => {
  const error = to_error(signal.reason ?? `${label} worker request aborted`)
  return error === signal.reason ? error : new DOMException(error.message, `AbortError`)
}

// An error thrown in the worker, as the main-thread path would have thrown it: same name and
// message, with the worker's stack since this thread's frames are only the message listener
const from_worker_error = ({ name, message, stack }: WorkerError): Error =>
  Object.assign(new Error(message), { name }, stack ? { stack } : {})

// How long a retaining worker may keep computing a request nobody awaits any more
const ABANDON_GRACE_MS = 1000

export function create_worker_client<
  Input extends object,
  Options,
  Result,
  Progress = unknown,
>(
  config: WorkerClientConfig<Input, Options, Result, Progress>,
): WorkerClient<Input, Options, Result, Progress> {
  const {
    label,
    create_worker,
    compute_sync,
    build_payload = (input: Input): unknown => input,
    requires_main_thread,
    dedupe_by = `input-identity`,
    retained_inputs = 0,
  } = config

  interface Request {
    key: string
    // postMessage id; null for sync fallbacks, which never enter `pending`
    id: number | null
    promise: Promise<Result>
    post?: () => void // cleared once sent
    resolve: (data: Result) => void
    reject: (err: Error) => void
    // Each caller owns one subscription, even when callbacks or options are shared.
    waiters: Set<{
      on_progress?: (progress: Progress) => void
      reject: (error: Error) => void
    }>
  }

  let worker: Worker | null = null
  let next_id = 0
  const pending = new Map<number, Request>()
  const pending_by_key = new Map<string, Request>()
  let held_tokens: number[] = [] // inputs (by token) the live worker retains, oldest first
  let busy = false // retaining clients only: the one posted request is still unanswered
  let n_mounts = 0
  let end_when_idle = false // the last mounted component left with work still in flight
  let abandon_timer: ReturnType<typeof setTimeout> | undefined

  const terminate_worker = (): void => {
    worker?.terminate()
    worker = null
    held_tokens = [] // a replacement worker starts empty: every input is sent afresh
    busy = false
    clearTimeout(abandon_timer)
    abandon_timer = undefined
    // that end has now happened: unmounted, the client keeps its next worker like an unmounted one
    if (pending.size === 0) end_when_idle = false
  }
  const post_next = (): void => {
    for (const queued of pending.values()) if (!busy) queued.post?.()
  }
  // Past the grace, restarting the worker (and sending the next input again) beats waiting on
  // work nobody wants, and a compute that never returns cannot hold the client forever
  const end_abandoned_work = (): void => {
    abandon_timer = undefined
    if (!busy || [...pending.values()].some((request) => !request.post)) return
    terminate_worker()
    post_next()
  }
  // Also the teardown path for worker `error`/`messageerror` events and id-less error replies
  const cancel = (reason = `${label} worker request cancelled`): void => {
    const error = new Error(reason)
    for (const request of pending_by_key.values()) request.reject(error)
    terminate_worker()
  }

  // Identity for the input, canonical serialization (value_key) for the options. Hashing
  // megabytes of positions would cost more than the compute, so identity stands in for
  // contents; a partial content fingerprint is not a safe substitute, since two inputs
  // differing only in a field it omits (labels, ids) would share one promise and the second
  // caller would get the first one's result.
  const options_key_of = (options: unknown): string => {
    try {
      return value_key(options, true)
    } catch (error) {
      throw new TypeError(`${label} worker options ${to_error(error).message}`, {
        cause: error,
      })
    }
  }
  const payload_key_of = (payload: unknown): string => {
    if (!Array.isArray(payload)) {
      throw new TypeError(
        `${label} worker unordered payload dedupe requires an array payload`,
      )
    }
    // map keeps holes, which sort last and stringify as null, unlike any item's key
    return JSON.stringify(payload.map((item) => value_key(item)).toSorted())
  }
  // Remove requests synchronously when they settle, so an immediate retry cannot join a
  // failed postMessage and abandoned computations cannot keep delivering progress.
  const forget = (request: Request): void => {
    if (pending_by_key.get(request.key) === request) pending_by_key.delete(request.key)
    if (request.id !== null && pending.get(request.id) === request)
      pending.delete(request.id)
    request.waiters.clear()
  }
  const track = (key: string, identifier: number | null): Request => {
    const { promise, resolve, reject } = Promise.withResolvers<Result>()
    const request: Request = {
      key,
      id: identifier,
      promise,
      resolve: (result) => {
        forget(request)
        resolve(result)
      },
      reject: (error) => {
        forget(request)
        reject(error)
      },
      waiters: new Set(),
    }
    pending_by_key.set(key, request)
    if (identifier !== null) pending.set(identifier, request)
    return request
  }

  // Terminate the worker unless it still has requests in flight, which other callers await
  const end_if_idle = (): void => {
    if (pending.size === 0) terminate_worker()
  }
  const mount = (): (() => void) => {
    n_mounts++
    end_when_idle = false
    return () => {
      end_when_idle = --n_mounts === 0
      if (end_when_idle) end_if_idle()
    }
  }
  // Hand one caller a view of a (possibly shared) request that honours its own signal and
  // progress callback without affecting the other callers
  const join = (
    request: Request,
    { signal, on_progress }: WorkerRequestOptions<Progress>,
  ): Promise<Result> => {
    const waiter = { on_progress, reject: request.reject }
    request.waiters.add(waiter)
    if (!signal && !on_progress) return request.promise
    const { promise, resolve, reject } = Promise.withResolvers<Result>()
    waiter.reject = (error) => {
      if (!request.waiters.delete(waiter)) return
      if (request.waiters.size === 0) {
        // Drop abandoned work; construct the next worker on demand, without an idle replacement.
        // A retaining worker instead gets a grace to finish what it started: terminating it
        // drops its inputs, so an options edit mid-compute would send the whole input again.
        request.reject(error)
        if (!retained_inputs) end_if_idle()
        else abandon_timer ??= setTimeout(end_abandoned_work, ABANDON_GRACE_MS)
      }
      reject(error)
    }
    const on_abort = () => {
      if (signal) waiter.reject(abort_error(signal, label))
    }
    signal?.addEventListener(`abort`, on_abort, { once: true })
    // Settled requests no longer need the caller's abort listener.
    void request.promise.then(resolve, reject)
    return promise.finally(() => signal?.removeEventListener(`abort`, on_abort))
  }

  const report_progress = (request: Request, progress: Progress): void => {
    // New subscriptions start with the next report; aborts during this report take effect now.
    const current_waiters = [...request.waiters]
    for (const waiter of current_waiters) {
      if (!request.waiters.has(waiter)) continue
      try {
        waiter.on_progress?.(progress)
      } catch (error) {
        waiter.reject(to_error(error))
      }
    }
  }

  // Constructor failures reject the request instead of silently moving expensive work onto
  // the UI thread. Environments that cannot create workers use compute_sync.
  function ensure_worker(): Worker | null {
    if (!can_create_worker()) return null
    if (worker) return worker
    const active_worker = create_worker()
    worker = active_worker
    worker.addEventListener(`message`, ({ data }) => {
      if (worker !== active_worker) return
      const { id: identifier, result, error, progress } = data
      // serve_worker's own `messageerror` reply: the request that failed to deserialize
      // on the worker side has no id, so nothing can be settled individually
      if (identifier === null) {
        cancel(error?.message ?? `${label} worker reported an error with no request id`)
        return
      }
      const request = pending.get(identifier)
      // by key, not value: a bare `report_progress()` tick is progress, not a missing result
      if (Object.hasOwn(data, `progress`)) {
        if (request) report_progress(request, progress)
        return
      }
      // serve_worker sends `error: null` on success, where any result (a compute may return
      // undefined) resolves as it does on the main thread
      if (error != null) request?.reject(from_worker_error(error))
      else request?.resolve(result)
      // The reply, even to an abandoned request, frees a retaining worker for the next one
      busy = false
      clearTimeout(abandon_timer)
      abandon_timer = undefined
      post_next()
      if (end_when_idle) end_if_idle()
    })
    // Both handlers must tear the worker down: an unsettled `pending` entry leaves every
    // caller awaiting forever, and its key stays in `pending_by_key` so each identical
    // retry is handed the same promise that will never settle.
    worker.addEventListener(`error`, (event) => {
      event.preventDefault()
      if (worker !== active_worker) return
      cancel(event.message || `${label} worker initialization error`)
    })
    // A response that fails to deserialize never reaches the `message` handler
    worker.addEventListener(`messageerror`, () => {
      if (worker !== active_worker) return
      cancel(`${label} worker sent a message that could not be deserialized`)
    })
    return worker
  }

  // Never throw synchronously: key construction and worker startup errors also reject.
  const client = (
    input: Input,
    options?: Options,
    request_options: WorkerRequestOptions<Progress> = {},
  ): Promise<Result> => {
    try {
      const { signal } = request_options
      if (signal?.aborted) return Promise.reject(abort_error(signal, label))
      const main_thread = requires_main_thread?.(input, options) ?? false
      // Content-keyed clients build once before the lookup and reuse that same snapshot for
      // postMessage. Identity-keyed clients defer payload construction until a cache miss.
      const content_keyed = !main_thread && dedupe_by === `unordered-payload`
      const keyed_payload = content_keyed ? build_payload(input) : undefined
      const input_key = content_keyed
        ? payload_key_of(keyed_payload)
        : `input:${identity_token(input)}`
      const request_key = main_thread
        ? `main:${++next_id}`
        : `${input_key.length}:${input_key}${options_key_of(options)}`
      const existing = pending_by_key.get(request_key)
      if (existing) return join(existing, request_options)

      const wkr = main_thread ? null : ensure_worker()
      const token = identity_token(input)
      // The options the request key was built from: a snapshot for requests a worker can take,
      // whether or not one does, and live for main-thread-only ones, whose providers (functions,
      // class instances) a snapshot would strip
      const posted_options = main_thread ? options : $state.snapshot(options)
      const request = track(request_key, wkr ? ++next_id : null)
      const promise = join(request, request_options)
      if (wkr) {
        request.post = () => {
          request.post = undefined
          // What the worker retains once this request lands, this input last
          const held = [...held_tokens.filter((kept) => kept !== token), token]
          held.splice(0, held.length - retained_inputs)
          const send_input = !held_tokens.includes(token)
          try {
            // Copied, never transferred: the same input is posted again later (to a replacement
            // worker when retained), and a transferred typed-array buffer would be detached.
            // null if disable_workers ran while this waited behind a busy retaining worker
            const target = ensure_worker()
            if (!target)
              throw new Error(
                `${label} workers were disabled before this request was sent`,
              )
            target.postMessage({
              id: request.id,
              input: send_input ? (keyed_payload ?? build_payload(input)) : undefined,
              options: posted_options,
              held: retained_inputs > 0 ? held : undefined,
            }) // oxlint-disable-line unicorn/require-post-message-target-origin
            // Only once posted: a payload that failed to clone never reached the worker
            held_tokens = held
            busy = retained_inputs > 0
          } catch (err) {
            request.reject(to_error(err))
          }
        }
        // Behind a busy retaining worker it waits unsent: abandoned by then, it costs nothing
        if (!busy) request.post()
      } else {
        Promise.resolve()
          .then(() => {
            // An abort/cancel in this tick must prevent queued main-thread work from starting.
            if (pending_by_key.get(request.key) !== request) return
            // a snapshot of plain options only drops reactivity, whatever Snapshot<> types
            const result = compute_sync(
              input,
              posted_options as Options | undefined,
              (progress) => {
                report_progress(request, progress)
                // A synchronous progress boundary can stop work abandoned by its last caller.
                if (!request.waiters.size)
                  throw new Error(`${label} request has no subscribers`)
              },
            )
            request.resolve(result)
          })
          .catch((err: unknown) => request.reject(to_error(err)))
      }
      return promise
    } catch (err) {
      return Promise.reject(to_error(err))
    }
  }
  const holds = (input: Input): boolean => held_tokens.includes(identity_token(input))
  return Object.assign(client, { cancel, mount, holds })
}
