// The shared worker client's teardown rules were each learned from a bug, so they need
// tests that fail when the rule is removed - deleting `messageerror` or `terminate()` used
// to leave every module's suite green.
import { can_create_worker, create_worker_client } from '#lib/worker-client.svelte.ts'
import { serve_worker, type WorkerError } from '#lib/worker-serve.ts'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
  vi,
} from 'vite-plus/test'

// happy-dom has no Worker. This stand-in records each construction and structured-clones every
// post as a browser would (a function or Svelte $state proxy throws here too); it never replies
// on its own, so tests drive `emit` themselves.
type StubWorkerMessage = { id: number; input: unknown; options?: unknown }
class StubWorker {
  static instances: StubWorker[] = []
  url: string
  posted: { message: StubWorkerMessage }[] = []
  terminated = 0
  private readonly listeners = new Map<string, ((event: unknown) => void)[]>()
  constructor(url: URL | string) {
    this.url = String(url)
    StubWorker.instances.push(this)
  }
  addEventListener(type: string, handler: (event: unknown) => void): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), handler])
  }
  emit(type: string, event: unknown): void {
    for (const handler of this.listeners.get(type) ?? []) handler(event)
  }
  terminate(): void {
    this.terminated++
  }
  postMessage(message: StubWorkerMessage): void {
    this.posted.push({ message: structuredClone(message) })
  }
}
const workers = (): StubWorker[] => StubWorker.instances
const first_post = (worker: StubWorker) => worker.posted[0].message
// A message from the worker about the request it was posted last
const emit_message = (worker: StubWorker | undefined, data: object) =>
  worker?.emit(`message`, { data: { id: worker.posted.at(-1)?.message.id, ...data } })
const reply = (worker: StubWorker | undefined, result: unknown = `done`) =>
  emit_message(worker, { result, error: null })
// The two progress reports make_progress_client's compute_sync makes, then its result
const report_and_reply = (worker: StubWorker) => {
  for (const progress of [0.5, undefined]) emit_message(worker, { progress })
  reply(worker)
}

const base_config = {
  label: `Test`,
  create_worker: () => new Worker(`stub`),
  compute_sync: () => `sync`,
}
const make_client = <Result = string>(
  compute_sync: (
    input: { tag: string },
    options: Record<string, unknown> | undefined,
    on_progress?: (progress: unknown) => void,
  ) => Result = (() => `sync`) as () => Result,
  retained_inputs = 0,
) =>
  create_worker_client<{ tag: string }, Record<string, unknown>, Result>({
    ...base_config,
    compute_sync,
    retained_inputs,
  })

const make_progress_client = () =>
  make_client((_input, _options, on_progress) => {
    on_progress?.(0.5)
    on_progress?.(undefined) // a bare tick is progress too, not a missing result
    return `done`
  })

// Fire in-flight requests that share one input identity; return how many posts were sent
const posted_count = (...options_list: Record<string, unknown>[]): number => {
  const run = make_client()
  const input = { tag: `a` }
  for (const options of options_list) void run(input, options).catch(() => {})
  return workers()[0].posted.length
}

beforeEach(() => {
  StubWorker.instances = []
  vi.stubGlobal(`Worker`, StubWorker)
})
afterEach(() => {
  vi.unstubAllGlobals()
})
describe(`worker teardown`, () => {
  test.each([
    [`messageerror`, {}, /could not be deserialized/],
    [`error`, { message: `boom`, preventDefault: () => {} }, /boom/],
    // serve_worker's reply when the REQUEST failed to deserialize on the worker side
    [
      `message`,
      {
        data: {
          id: null,
          result: null,
          error: { name: `Error`, message: `bad request` },
        },
      },
      /bad request/,
    ],
  ] as const)(
    `a %s event rejects pending work and terminates the worker`,
    async (event, data, expected) => {
      const run = make_client()
      const input = { tag: `a` }
      const pending = run(input, {})
      const [worker] = workers()
      expect(worker.posted).toHaveLength(1)

      worker.emit(event, data)
      await expect(pending).rejects.toThrow(expected)
      // leaving the worker alive would keep handing out a dead channel
      expect(worker.terminated).toBe(1)

      // the poisoned key must be gone: the same request has to reach a NEW worker
      const retry = run(input, {})
      expect(workers()).toHaveLength(2)
      expect(workers()[1].posted).toHaveLength(1)
      void retry.catch(() => {})
    },
  )

  test(`explicit cancellation rejects pending work and starts the replacement immediately`, async () => {
    const run = make_client()
    const input = { tag: `same` }
    const first = run(input, {})
    const first_worker = workers()[0]

    run.cancel(`superseded`)
    const second = run(input, {})
    await expect(first).rejects.toThrow(`superseded`)
    expect(first_worker.terminated).toBe(1)

    expect(workers()).toHaveLength(2)
    expect(first_post(workers()[1]).input).toEqual(input)
    expect(run(input, {})).toBe(second)
    expect(workers()[1].posted).toHaveLength(1)
    void second.catch(() => {})
  })

  // `retained`: only a retaining worker outlives the abort of its request's last waiter
  test.each([
    [`resolves`, 0],
    [`rejects`, 0],
    [`is abandoned`, 1],
  ] as const)(
    `the worker ends with its last mount, once a request that %s has settled`,
    async (outcome, retained) => {
      const run = make_client(undefined, retained)
      const input = { tag: `a` }
      // a client nobody mounted (direct API use) keeps its idle worker
      request(run, input)
      const [worker] = workers()
      const unmounts = [run.mount(), run.mount()]
      unmounts[0]()
      expect(worker.terminated).toBe(0) // still claimed by the other mount
      const abort = new AbortController()
      const pending = run(input, { step: 1 }, { signal: abort.signal })
      // the last pane unmounting must not reject a request still in flight
      unmounts[1]()
      expect(worker.terminated).toBe(0)
      if (outcome === `resolves`) {
        reply(worker)
        await expect(pending).resolves.toBe(`done`)
      } else if (outcome === `rejects`) {
        emit_message(worker, { error: { name: `Error`, message: `boom` } })
        await expect(pending).rejects.toThrow(`boom`)
      } else {
        abort.abort()
        await expect(pending).rejects.toMatchObject({ name: `AbortError` })
        expect(worker.terminated).toBe(0)
        reply(worker, `stale`)
      }
      expect(worker.terminated).toBe(1)
      // a remount before the work settles cancels that end, until it unmounts in turn
      const next = run(input, { step: 2 })
      const replacement = workers()[1]
      run.mount()()
      const unmount = run.mount()
      reply(replacement)
      await expect(next).resolves.toBe(`done`)
      expect(replacement.terminated).toBe(0)
      unmount()
      expect(replacement.terminated).toBe(1)
      // unmounted again, the client is back to keeping the worker of a direct request
      request(run, input, 3)
      expect(workers().map(({ terminated }) => terminated)).toEqual([1, 1, 0])
    },
  )
})

describe(`request dedupe`, () => {
  const wrap = (values: unknown[]) => values.map((value) => ({ value }))
  // oxfmt-ignore
  test.each([
    [`nested key order`, 1,
      [{ fit: { start: 0.1, end: 0.8 } }, { fit: { end: 0.8, start: 0.1 } }]],
    [`keys that collate equally`, 1,
      [{ 'e\u0301': 1, '\u00E9': 2 }, { '\u00E9': 2, 'e\u0301': 1 }]],
    [`ordered arrays and plain objects`, 3, [
      { value: { alpha: 1 }, values: [1, null] },
      { value: [[`alpha`, 1]], values: [1, null] },
      { value: { alpha: 1 }, values: [null, 1] },
    ]],
    [`primitive types`, 7, wrap([true, false, 1, 1n, `1`, null, undefined])],
    [`special numbers`, 5, wrap([0, -0, NaN, NaN, Infinity, -Infinity])],
  ] as const)(
    `deduplicates %s without conflating distinct options`,
    (_label, count, options) => {
      expect(posted_count(...options)).toBe(count)
    },
  )

  test.each([() => {}, Symbol(`not cloneable`)])(
    `rejects uncloneable primitive %s`,
    async (value) => {
      await expect(make_client()({ tag: `a` }, { value })).rejects.toThrow(
        `Test worker options cannot contain ${typeof value} values`,
      )
      expect(workers()).toHaveLength(0)
    },
  )

  test(`unordered payload dedupe keys by the top-level multiset, nested order kept`, async () => {
    const build_payload = vi.fn((input: object) => input)
    const run = create_worker_client<object, undefined, string>({
      ...base_config,
      build_payload,
      dedupe_by: `unordered-payload`,
    })
    // oxfmt-ignore
    const groups = [
      [[{ a: 1 }, { b: 2 }], [{ b: 2 }, { a: 1 }]], // reordered copies share one post
      [[[1, 2]], [[2, 1]]],
      [[{ a: 1 }], [{ a: 2 }]],
      [[1, 1, 2], [1, 2, 2]], // a multiset, not a set
      [Object.assign([], { 1: 1 }), [undefined, 1]], // a hole is not an undefined item
    ]
    for (const input of groups.flat()) void run(input).catch(() => {})
    const posted = workers()[0].posted.map(({ message }) => message.input)
    expect(posted).toEqual(groups.flatMap((group, idx) => (idx ? group : [group[0]])))
    expect(build_payload).toHaveBeenCalledTimes(10) // once per request, reused for the post
    await expect(run({ tag: `a` })).rejects.toThrow(
      `Test worker unordered payload dedupe requires an array payload`,
    )
  })

  test(`non-plain options use identity`, () => {
    const date = new Date(`2025-01-01T00:00:00Z`)
    const cloned_date = new Date(date)
    expect(posted_count({ value: date }, { value: date }, { value: cloned_date })).toBe(2)
  })

  test(`distinct inputs are never conflated, however alike`, () => {
    const run = make_client()
    void run({ tag: `a` }, {}).catch(() => {})
    void run({ tag: `a` }, {}).catch(() => {})
    // same shape, different object: a content hash would merge these, identity must not
    expect(workers()[0].posted).toHaveLength(2)
  })

  test(`omitted options remain distinct from an explicit empty object`, async () => {
    vi.stubGlobal(`Worker`, undefined)
    const run = make_client((_input, options) =>
      options === undefined ? `default` : `explicit`,
    )
    const input = { tag: `a` }
    await expect(Promise.all([run(input), run(input, {})])).resolves.toEqual([
      `default`,
      `explicit`,
    ])
  })
})

test.each([
  [
    `Worker is missing`,
    async () => {
      vi.stubGlobal(`Worker`, undefined)
      return { create_worker_client, can_create_worker }
    },
  ],
  // a file:// custom-elements page, or one whose CSP refuses blob: workers
  [
    `a host called disable_workers`,
    async () => {
      vi.resetModules()
      const fresh = await import(`#lib/worker-client.svelte.ts`)
      expect(fresh.can_create_worker()).toBe(true)
      fresh.disable_workers()
      return fresh
    },
  ],
])(`runs compute_sync on the main thread where %s`, async (_label, load) => {
  const { create_worker_client: create, can_create_worker: can_create } = await load()
  expect(can_create()).toBe(false)
  const progress = vi.fn()
  const run = create<{ tag: string }, undefined, string, number>({
    ...base_config,
    compute_sync: (_input, _options, on_progress) => {
      on_progress?.(0.5)
      return `sync`
    },
  })
  await expect(run({ tag: `a` }, undefined, { on_progress: progress })).resolves.toBe(
    `sync`,
  )
  expect(progress).toHaveBeenCalledExactlyOnceWith(0.5)
  expect(workers()).toHaveLength(0)
})

test(`a throwing compute_sync rejects asynchronously and frees the dedupe key`, async () => {
  vi.stubGlobal(`Worker`, undefined)
  const run = make_client(() => {
    throw new Error(`bad input`)
  })
  const input = { tag: `a` }
  let promise: Promise<unknown> | undefined
  expect(() => (promise = run(input, {}))).not.toThrow()
  await expect(promise).rejects.toThrow(`bad input`)
  // A retry must be a fresh promise, not the settled rejection
  await expect(run(input, {})).rejects.toThrow(`bad input`)
})

test(`worker construction failures reject without moving work onto the main thread`, async () => {
  const create_worker = vi.fn(() => {
    throw new DOMException(`cannot be accessed from origin`, `SecurityError`)
  })
  const compute_sync = vi.fn(({ tag }: { tag: string }) => `sync:${tag}`)
  const run = create_worker_client<{ tag: string }, Record<string, unknown>, string>({
    ...base_config,
    create_worker,
    compute_sync,
  })
  await expect(run({ tag: `a` }, {})).rejects.toThrow(`cannot be accessed from origin`)
  await expect(run({ tag: `b` }, {})).rejects.toThrow(`cannot be accessed from origin`)
  expect(create_worker).toHaveBeenCalledTimes(2)
  expect(compute_sync).not.toHaveBeenCalled()
})

// A CSP-refused blob: worker fires `error` instead of throwing (Chrome), so the probe reads
// both, releases its worker and blob URL either way, and moves jobs off workers only if refused
test.each([
  [`message`, null],
  [`error`, `refused by CSP`],
  [`throw`, `Worker is not a constructor`],
  [`silence`, `no answer within 2 s`],
])(
  `check_blob_workers when the probe worker answers with %s`,
  async (outcome, refusal) => {
    vi.resetModules()
    const fresh = await import(`#lib/worker-client.svelte.ts`)
    // `new` on an arrow throws, as a worker constructor refusing outright would
    if (outcome === `throw`) vi.stubGlobal(`Worker`, () => {})
    const revoke = vi.spyOn(URL, `revokeObjectURL`)
    const warn = vi.spyOn(console, `warn`).mockImplementation(() => {})
    vi.useFakeTimers()
    const checked = fresh.check_blob_workers(`Host`)
    if (outcome === `silence`) vi.advanceTimersByTime(2000)
    else workers()[0]?.emit(outcome, { message: refusal })
    await checked
    vi.useRealTimers()
    const [revoked, warned] = [[...revoke.mock.calls], [...warn.mock.calls]]
    revoke.mockRestore()
    warn.mockRestore()
    expect(revoked).toEqual([[expect.stringMatching(/^blob:/)]])
    expect(workers().map(({ url, terminated }) => [url, terminated])).toEqual(
      outcome === `throw` ? [] : [[revoked[0][0], 1]],
    )
    const warning = `Host: running worker jobs on the main thread, blob: workers refused`
    expect(warned).toEqual(refusal ? [[`${warning} (${refusal})`]] : [])
    expect(fresh.can_create_worker()).toBe(refusal === null)
  },
)

test(`a failed post frees the key before an immediate retry`, async () => {
  const run = make_client()
  const input = { tag: `a` }
  // A class instance uses identity for the key but can still fail structured clone.
  const options = {
    value: new (class Options {
      callback = () => `not cloneable`
    })(),
  }
  const first = run(input, options)
  Reflect.deleteProperty(options.value, `callback`)
  const second = run(input, options)
  expect(second).not.toBe(first)
  await expect(first).rejects.toMatchObject({ name: `DataCloneError` })
  expect(workers()[0].posted).toHaveLength(1)
  reply(workers()[0])
  await expect(second).resolves.toBe(`done`)
})

test.each([
  [`abort`, /abort/i, 0],
  [`cancel`, /cancel/i, 0],
  [`progress`, null, 1],
  [`progress-error`, /progress failed/, 0],
  [`progress-abort`, /abort/i, 0],
  [`progress-cancel`, /cancel/i, 0],
  [`error`, /provider failed/, 1],
] as const)(
  `main-thread-only requests share the client lifecycle: %s`,
  async (action, expected_error, provider_calls) => {
    const provider = vi.fn(() => {
      if (action === `error`) throw new Error(`provider failed`)
      return `done`
    })
    const build_payload = vi.fn(() => {
      throw new Error(`must not clone a provider`)
    })
    const run = create_worker_client({
      label: `Provider`,
      create_worker: () => new Worker(`stub`),
      compute_sync: (
        input: { provider: () => string },
        _options: { provider: () => string } | undefined,
        on_progress?: (value: number) => void,
      ) => {
        on_progress?.(1)
        return input.provider()
      },
      build_payload,
      requires_main_thread: () => true,
    })
    const controller = new AbortController()
    const on_progress = vi.fn(() => {
      if (action === `progress-error`) throw new Error(`progress failed`)
      if (action === `progress-abort`) controller.abort()
      if (action === `progress-cancel`) run.cancel()
    })
    const pending = run(
      { provider },
      { provider },
      { signal: controller.signal, on_progress },
    )
    if (action === `abort`) controller.abort()
    else if (action === `cancel`) run.cancel()
    if (expected_error) await expect(pending).rejects.toThrow(expected_error)
    else {
      await expect(pending).resolves.toBe(`done`)
      expect(on_progress).toHaveBeenCalledExactlyOnceWith(1)
    }
    expect(provider).toHaveBeenCalledTimes(provider_calls)
    expect(build_payload).not.toHaveBeenCalled()
    expect(workers()).toHaveLength(0)
  },
)

// Worker replies and compute_sync outcomes settle alike: a thrown error keeps its name and
// message, and its worker-side stack when the reply carries one
test.each([
  [null, null], // An explicit null is a valid result, not a missing one.
  [undefined, null], // and so is undefined: a compute may return nothing
  [null, { name: `Error`, message: `boom`, stack: `Error: boom\n    at worker.js:1:1` }],
  [null, { name: `TypeError`, message: `` }], // an empty message is still an error
  [null, { name: `AbortError`, message: `stopped` }],
] as const)(`handles result=%s, error=%j on both threads`, async (result, error) => {
  for (const use_worker of [true, false]) {
    if (!use_worker) vi.stubGlobal(`Worker`, undefined)
    const input = { tag: `a` }
    const run = make_client<null | undefined>(() => {
      if (error) throw Object.assign(new Error(error.message), error)
      return result
    })
    const pending = run(input, {})
    if (use_worker) {
      expect(first_post(workers()[0]).input).toEqual(input) // build_payload's default
      emit_message(workers()[0], { result, error })
    }
    if (!error) await expect(pending).resolves.toBe(result)
    else {
      const thrown: unknown = await pending.catch((err: unknown) => err)
      expect(thrown).toBeInstanceOf(Error)
      expect(thrown).toMatchObject({ stack: expect.stringContaining(`at `), ...error })
    }
  }
})

describe(`per-request options`, () => {
  test.each(
    [true, false].flatMap((shared) =>
      [true, false].flatMap((use_worker) =>
        [new Error(`progress failed`), Object.create(null), { toString: null }].map(
          (error) => ({ use_worker, shared, error }),
        ),
      ),
    ),
  )(
    `throwing progress rejects only its caller (worker=$use_worker, shared=$shared)`,
    async ({ use_worker, shared, error }) => {
      if (!use_worker) vi.stubGlobal(`Worker`, undefined)
      const run = make_progress_client()
      const input = { tag: `a` }
      const throwing = vi.fn(() => {
        throw error
      })
      const failed = run(input, {}, { on_progress: throwing })
      const progress = vi.fn()
      const kept = shared ? run(input, {}, { on_progress: progress }) : undefined
      if (use_worker) {
        const [worker] = workers()
        expect(() => emit_message(worker, { progress: 0.5 })).not.toThrow()
        expect(worker.terminated).toBe(shared ? 0 : 1)
        emit_message(worker, { progress: undefined })
        reply(worker)
      }
      if (error instanceof Error) await expect(failed).rejects.toBe(error)
      else
        await expect(failed).rejects.toMatchObject({
          cause: error,
          message: `Thrown value cannot be converted to a string`,
        })
      expect(throwing).toHaveBeenCalledExactlyOnceWith(0.5)
      if (kept) {
        await expect(kept).resolves.toBe(`done`)
        expect(progress.mock.calls).toEqual([[0.5], [undefined]])
      }
      // Failed/finished subscriptions must not poison this input's dedupe key.
      const retry = run(input, {})
      if (use_worker) reply(workers().at(-1))
      await expect(retry).resolves.toBe(`done`)
      run.cancel()
    },
  )

  test.each([true, false])(
    `progress defers new subscriptions and skips cancelled ones (worker=%s)`,
    async (use_worker) => {
      if (!use_worker) vi.stubGlobal(`Worker`, undefined)
      const run = make_progress_client()
      const input = { tag: `reentrant` }
      const controller = new AbortController()
      const seen: unknown[] = []
      const joined: Promise<string>[] = []
      const on_progress = (progress: unknown) => {
        seen.push(progress)
        controller.abort()
        // Cap the old live-Set loop so a regression fails instead of hanging the suite.
        if (progress === 0.5 && seen.length < 5)
          joined.push(run(input, {}, { on_progress }))
      }
      const pending = run(input, {}, { on_progress })
      const cancelled_progress = vi.fn()
      const { signal } = controller
      const cancelled = run(input, {}, { signal, on_progress: cancelled_progress })
      if (use_worker) report_and_reply(workers()[0])
      await expect(cancelled).rejects.toMatchObject({ name: `AbortError` })
      await expect(Promise.all([pending, ...joined])).resolves.toEqual([`done`, `done`])
      expect(seen).toEqual([0.5, undefined, undefined])
      expect(cancelled_progress).not.toHaveBeenCalled()
    },
  )

  test.each(
    [false, true].flatMap((shared_options) =>
      [true, false].map((use_worker) => ({ use_worker, shared_options })),
    ),
  )(
    `progress reaches every shared caller (worker=$use_worker, shared options=$shared_options)`,
    async ({ use_worker, shared_options }) => {
      if (!use_worker) vi.stubGlobal(`Worker`, undefined)
      const run = make_progress_client()
      const input = { tag: `a` }
      const seen: unknown[][] = [[], []]
      const options = { on_progress: (progress: unknown) => seen[0].push(progress) }
      const first = run(input, {}, options)
      const second = run(
        input,
        {},
        shared_options ? options : { on_progress: (progress) => seen[1].push(progress) },
      )
      if (use_worker) {
        expect(workers()[0].posted).toHaveLength(1)
        report_and_reply(workers()[0])
      }
      await expect(Promise.all([first, second])).resolves.toEqual([`done`, `done`])
      expect(seen).toEqual(
        shared_options
          ? [[0.5, 0.5, undefined, undefined], []]
          : [
              [0.5, undefined],
              [0.5, undefined],
            ],
      )
    },
  )

  test.each([
    [`same options and explicit reason`, {}, {}, new Error(`superseded`)],
    [`changed options and default reason`, { lag: 1 }, { lag: 2 }, undefined],
    [`unprintable abort reason`, {}, {}, Object.create(null)],
  ] as const)(
    `aborting the only waiter frees its key and creates one replacement: %s`,
    async (_label, options, next_options, reason) => {
      const run = make_client()
      const input = { tag: `a` }
      const controller = new AbortController()
      const aborted = run(input, options, { signal: controller.signal })
      const [old_worker] = workers()
      controller.abort(reason)
      await expect(aborted).rejects.toEqual(
        reason instanceof Error
          ? reason
          : expect.objectContaining({ name: `AbortError` }),
      )
      expect(old_worker.terminated).toBe(1)
      expect(old_worker.posted).toHaveLength(1)
      // Abort leaves no unused replacement; the next request creates exactly one.
      expect(workers()).toHaveLength(1)
      const kept = run(input, next_options)
      expect(workers()).toHaveLength(2)
      const worker = workers()[1]
      expect(worker.terminated).toBe(0)
      expect(worker.posted).toHaveLength(1)
      expect(first_post(worker).options).toEqual(next_options)
      reply(worker)
      await expect(kept).resolves.toBe(`done`)
    },
  )

  test(`a reply from the terminated worker does not settle the replacement's request`, async () => {
    const run = make_client()
    const controller = new AbortController()
    const aborted = run({ tag: `a` }, {}, { signal: controller.signal })
    controller.abort()
    await expect(aborted).rejects.toMatchObject({ name: `AbortError` })
    const kept = run({ tag: `b` }, {})
    const [old_worker, worker] = workers()
    // a late reply for the aborted id (real workers never deliver after terminate, but the
    // id must be forgotten regardless) leaves the live request pending
    reply(old_worker, `stale`)
    old_worker.emit(`error`, { message: `stale error`, preventDefault: () => {} })
    old_worker.emit(`messageerror`, {})
    emit_message(old_worker, { id: null, error: { name: `Error`, message: `stale` } })
    let settled = false
    void kept.then(() => (settled = true))
    await Promise.resolve()
    expect(settled).toBe(false)
    reply(worker)
    await expect(kept).resolves.toBe(`done`)
  })

  test.each([true, false])(
    `aborting one waiter preserves the other (progress=%s)`,
    async (progress) => {
      const run = make_client()
      const input = { tag: `a` }
      const controller = new AbortController()
      const on_progress = vi.fn()
      const aborted = run(input, {}, { signal: controller.signal, on_progress })
      const kept = run(input, {}, progress ? { on_progress } : {})
      const [worker] = workers()
      controller.abort(new Error(`no longer needed`))
      await expect(aborted).rejects.toThrow(`no longer needed`)
      expect(worker.terminated).toBe(0)
      emit_message(worker, { progress: 0.5 })
      if (progress) expect(on_progress).toHaveBeenCalledExactlyOnceWith(0.5)
      else expect(on_progress).not.toHaveBeenCalled()
      reply(worker)
      await expect(kept).resolves.toBe(`done`)
    },
  )

  test(`aborting after the result arrived is a no-op`, async () => {
    const run = make_client()
    const controller = new AbortController()
    const pending = run({ tag: `a` }, {}, { signal: controller.signal })
    const [worker] = workers()
    reply(worker)
    controller.abort()
    await expect(pending).resolves.toBe(`done`)
    expect(worker.terminated).toBe(0)
  })

  test(`an already-aborted signal rejects without posting`, async () => {
    const run = make_client()
    const signal = AbortSignal.abort()
    await expect(run({ tag: `a` }, {}, { signal })).rejects.toMatchObject({
      name: `AbortError`,
    })
    expect(workers()[0]?.posted ?? []).toHaveLength(0)
  })
})

test.each([`abort`, `cancel`] as const)(
  `%s prevents queued synchronous computation`,
  async (action) => {
    vi.stubGlobal(`Worker`, undefined)
    const compute_sync = vi.fn(() => `done`)
    const run = make_client(compute_sync)
    const controller = new AbortController()
    const pending = run({ tag: `a` }, {}, { signal: controller.signal })
    if (action === `abort`) controller.abort()
    else run.cancel()
    await expect(pending).rejects.toThrow(/abort|cancel/i)
    expect(compute_sync).not.toHaveBeenCalled()
  },
)

test(`a request queued behind a retaining worker rejects once workers are disabled`, async () => {
  vi.resetModules()
  const fresh = await import(`#lib/worker-client.svelte.ts`)
  const run = fresh.create_worker_client<{ tag: string }, { step: number }, string>({
    ...base_config,
    retained_inputs: 1,
  })
  const input = { tag: `a` }
  const [first, queued] = [0, 1].map((step) => run(input, { step }))
  fresh.disable_workers()
  reply(workers()[0])
  await expect(first).resolves.toBe(`done`)
  await expect(queued).rejects.toThrow(
    `Test workers were disabled before this request was sent`,
  )
  expect(workers()[0].posted).toHaveLength(1)
  await expect(run(input, { step: 2 })).resolves.toBe(`sync`)
})

// Retained inputs: a heavy input (position stream, band grid) crosses once and later requests
// name its identity token. Per post: `+` when it carried the input, then the tags of those held
const posts = (worker: StubWorker): string[] => {
  const tags = new Map<number | undefined, unknown>()
  return worker.posted.map(({ message }) => {
    const { input, held = [] } = message as { input?: { tag: string }; held?: number[] }
    if (input) tags.set(held.at(-1), input.tag)
    return `${input ? `+` : ``}${held.map((token) => tags.get(token)).join(``)}`
  })
}
// a retaining client posts one request at a time, so each is answered before the next
const request = (
  run: ReturnType<typeof make_client>,
  input: { tag: string },
  step = 0,
) => {
  void run(input, { step }).catch(() => {})
  reply(workers().at(-1))
}

test(`a retained input is sent once, named afterwards, and dropped once least recently used`, async () => {
  const run = make_client(undefined, 2)
  // an input whose post failed is not counted as held
  const uncloneable = { tag: `d`, callback: (): string => `not cloneable` }
  await expect(run(uncloneable, {})).rejects.toMatchObject({ name: `DataCloneError` })
  expect(run.holds(uncloneable)).toBe(false)
  const inputs = { a: { tag: `a` }, b: { tag: `b` }, c: { tag: `c` } }
  const order = [`a`, `a`, `b`, `a`, `c`, `b`, `a`] as const
  for (const [step, tag] of order.entries()) request(run, inputs[tag], step)
  // c evicts b (a was used since), then a makes room for b's return: both re-sent
  expect(posts(workers()[0])).toEqual([`+a`, `a`, `+ab`, `ba`, `+ac`, `+cb`, `+ba`])
  expect(Object.values(inputs).map(run.holds)).toEqual([true, true, false])
})

// terminating the busy worker (as non-retaining clients do) would re-send the whole input on
// every options edit made during a compute, so it gets a grace of 1000 ms to finish
test.each([`unmount`, `cancel`] as const)(
  `requests abandoned mid-compute keep the retaining worker for a grace, only the latest follows, and a worker replaced after %s is sent the input again`,
  async (end_worker) => {
    vi.useFakeTimers()
    onTestFinished(() => void vi.useRealTimers())
    const run = make_client(undefined, 1)
    const input = { tag: `a` }
    const controllers = [0, 1, 2].map(() => new AbortController())
    const superseded = controllers.map(({ signal }, step) =>
      run(input, { step }, { signal }),
    )
    for (const controller of controllers) controller.abort()
    await expect(Promise.all(superseded)).rejects.toMatchObject({ name: `AbortError` })
    const latest = run(input, { step: 3 })
    const [worker] = workers()
    // progress of the abandoned compute is dropped; its reply frees the worker
    emit_message(worker, { progress: 0.5 })
    const state = [worker.terminated, run.holds(input), posts(worker)]
    expect(state).toEqual([0, true, [`+a`]])
    reply(worker, `stale`)
    expect(posts(worker)).toEqual([`+a`, `a`])
    expect(worker.posted[1].message.options).toEqual({ step: 3 })
    reply(worker)
    await expect(latest).resolves.toBe(`done`)
    // the reply came within the grace, so nothing ends once that has passed
    vi.advanceTimersByTime(2000)
    expect([worker.terminated, run.holds(input)]).toEqual([0, true])
    // idle again, so an unmount ends the worker, and its replacement starts empty
    if (end_worker === `unmount`) run.mount()()
    else run.cancel()
    expect([worker.terminated, run.holds(input)]).toEqual([1, false])
    for (const step of [4, 5]) request(run, input, step)
    const replacement = workers()[1]
    expect(posts(replacement)).toEqual([`+a`, `a`])
    // posts (or queues) a request for `abort` to take its only caller from
    const abandoned = (step: number) => {
      const controller = new AbortController()
      void run(input, { step }, { signal: controller.signal }).catch(() => {})
      return () => controller.abort()
    }
    // a request another caller still awaits is not abandoned: no grace runs out on it
    const leave = abandoned(6)
    const wanted = run(input, { step: 6 })
    leave()
    vi.advanceTimersByTime(1000)
    expect(replacement.terminated).toBe(0)
    reply(replacement)
    await expect(wanted).resolves.toBe(`done`)
    // a reply within the grace ends it: the request posted next has a full grace of its own
    const [abandon_posted, abandon_next] = [abandoned(7), abandoned(8)]
    abandon_posted()
    vi.advanceTimersByTime(600)
    reply(replacement) // posts the next, naming the input
    abandon_next()
    const queued = run(input, { step: 9 })
    vi.advanceTimersByTime(999) // 599 ms past the first grace
    expect([replacement.terminated, workers().length]).toEqual([0, 2])
    expect(posts(replacement).slice(3)).toEqual([`a`, `a`])
    // past it the worker is ended, and the waiting request goes to a new one with its input
    vi.advanceTimersByTime(1)
    const third = workers()[2]
    expect([replacement.terminated, posts(third)]).toEqual([1, [`+a`]])
    reply(third)
    await expect(queued).resolves.toBe(`done`)
    // with nothing waiting, a worker that never replies is still freed
    abandoned(10)()
    vi.advanceTimersByTime(999)
    expect([third.terminated, run.holds(input)]).toEqual([0, true])
    vi.advanceTimersByTime(1)
    expect([third.terminated, run.holds(input), workers().length]).toEqual([1, false, 3])
  },
)

test(`serve_worker replies with results, message-less errors and an id-less deserialization error, on the inputs a client retains`, () => {
  // Stand in for the worker global scope: record listeners and posted replies
  const listeners = new Map<string, (event: unknown) => void>()
  const posted: { result: number[] | null; error: WorkerError | null }[] = []
  vi.stubGlobal(`self`, {
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      listeners.set(type, handler),
    postMessage: (message: (typeof posted)[number]) => posted.push(message),
  })
  serve_worker((input: number[]) => {
    // oxlint-disable-next-line eslint-plugin-unicorn/error-message -- message-less on purpose
    if (input[0] < 0) throw new TypeError()
    return input
  })
  const send = (data: object) =>
    listeners.get(`message`)?.({ data: { options: {}, ...data } })
  const [kept, other] = [[21], [42]]
  send({ id: 7, input: kept })
  // a message-less error still replies with a non-empty error
  send({ id: 8, input: [-1] })
  listeners.get(`messageerror`)?.({})
  // a retained input crosses once: later requests name its token until the client drops it
  send({ id: 9, input: kept, held: [5] })
  send({ id: 10, input: other, held: [5, 6] })
  for (const held of [[6, 5], [6], [5], undefined]) send({ id: 11, held })
  const no_message = `TypeError thrown without a message`
  const stack = expect.stringMatching(/^TypeError[^]*worker-client\.test\.ts/) // the throw site
  const undecodable = expect.stringMatching(/could not be deserialized/)
  expect(posted.slice(0, 3)).toEqual([
    { id: 7, result: kept, error: null },
    { id: 8, result: null, error: { name: `TypeError`, message: no_message, stack } },
    { id: null, result: null, error: { name: `Error`, message: undecodable } },
  ])
  // the very object each time, so identity-keyed caches of what was derived from it survive
  const replies = posted.slice(3).map(({ result, error }) => result ?? error?.message)
  const no_input = [5, undefined].map(
    (token) => `worker holds no input ${token} (0 held)`,
  )
  expect(replies).toEqual([kept, other, kept, other, ...no_input])
  expect(replies[2]).toBe(kept)
})
