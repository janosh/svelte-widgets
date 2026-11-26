// Worker-side half of the create_worker_client protocol (see worker-client.svelte.ts): each
// request arrives as `{ id, input, options }`, any number of `{ id, progress }` messages may
// follow, and exactly one `{ id, result, error }` reply ends it, `error` being null or a
// WorkerError. A request that cannot be deserialized never reaches `message`, so
// `messageerror` answers with `{ id: null, error }` and the client fails every pending
// request rather than leaving one awaiting forever. Kept apart from the client so worker
// bundles do not pull Svelte runtime code.
// Dedicated workers' postMessage takes no targetOrigin (that is Window.postMessage), so
// unicorn's require-post-message-target-origin is a false positive here.
// oxlint-disable eslint-plugin-unicorn/require-post-message-target-origin
import { to_error } from './utils'

export type WorkerRequest<Input, Options> = {
  id: number
  options: Options
  input?: Input // absent when the worker already holds it
  held?: number[] // retaining clients only: tokens of the inputs to keep, this request's last
}

// What survives of a thrown error on the way to the client, which rebuilds an Error from it
export type WorkerError = { name: string; message: string; stack?: string }
export const to_worker_error = (err: unknown): WorkerError => {
  const { name, message, stack } = to_error(err)
  // never empty: `throw new Error()` must not read as success
  return { name, message: message || `${name} thrown without a message`, stack }
}

// The input a request carries or names. Handing back the same object per token keeps identity-
// keyed caches of derived state (unwrapped positions, upsampled grids) alive between requests.
export function create_input_store<Input>() {
  const inputs = new Map<number, Input>()
  return ({ input, held = [] }: { input?: Input; held?: number[] }): Input => {
    const token = held.at(-1)
    if (token !== undefined) {
      if (input !== undefined) inputs.set(token, input)
      for (const kept of inputs.keys()) if (!held.includes(kept)) inputs.delete(kept)
      input = inputs.get(token)
    }
    if (input !== undefined) return input
    throw new Error(`worker holds no input ${token} (${inputs.size} held)`)
  }
}

// The compute callback's own parameter types drive the request type; both `Input` and
// `Options` are inferred from it, so they are not unnecessary despite appearing once.
// `options` is `undefined` when the caller omitted them, exactly as the client's
// `compute_sync` receives it, so one `options = {}` parameter serves both paths.
// oxlint-disable-next-line typescript-eslint/no-unnecessary-type-parameters
export function serve_worker<Input, Options, Result>(
  compute: (
    input: Input,
    options: Options | undefined,
    report_progress: (progress: unknown) => void,
  ) => Result,
  // Buffers inside `result` to move rather than copy back to the main thread. Never a buffer of
  // the input: a retaining worker keeps it for later requests, and moving it would detach it,
  // so they would silently compute on zero-length arrays
  transferables: (result: Result) => Transferable[] = () => [],
): void {
  const input_of = create_input_store<Input>()
  self.addEventListener(
    `message`,
    ({ data }: MessageEvent<WorkerRequest<Input, Options>>) => {
      const { id: identifier, options } = data
      try {
        const result = compute(input_of(data), options, (progress) =>
          self.postMessage({ id: identifier, progress }),
        )
        self.postMessage(
          { id: identifier, result, error: null },
          { transfer: transferables(result) },
        )
      } catch (err) {
        self.postMessage({ id: identifier, result: null, error: to_worker_error(err) })
      }
    },
  )
  self.addEventListener(`messageerror`, () => {
    const message = `worker received a request that could not be deserialized`
    self.postMessage({ id: null, result: null, error: { name: `Error`, message } })
  })
}
