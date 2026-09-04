// deno-lint-ignore-file no-await-in-loop
import { createRawSnippet, tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import type { Option } from '$lib'
import type { LoadOptionsParams, MultiSelectProps } from '$lib/types'
import { get_label } from '$lib/utils'
import { doc_query } from './index'
import {
  fresh_key,
  get_input,
  mount_multiselect,
  type_search_text,
  unmount_component,
} from './MultiSelect.test-utils'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
const mock_console_error = () =>
  vi.spyOn(console, `error`).mockImplementation(() => undefined)

// Empty options while loading, disabled, or allowing user options, and the base error
// case, all live in the `accepts empty options in %s mode` matrix in MultiSelect.svelte.test.ts
// deferred loadOptions fetch: tests decide exactly when each request settles
type LoadResult = { options: string[]; hasMore: boolean }

function deferred_load() {
  const resolvers: ((val: LoadResult) => void)[] = []
  const rejectors: ((err: Error) => void)[] = []
  const fn = vi.fn(
    (_params: LoadOptionsParams) =>
      new Promise<LoadResult>((resolve, reject) => {
        resolvers.push(resolve)
        rejectors.push(reject)
      }),
  )
  return { fn, resolvers, rejectors }
}

async function mount_deferred_open() {
  const load = deferred_load()
  vi.useFakeTimers()
  mount_multiselect({
    loadOptions: { fetch: load.fn, debounceMs: 10 },
    open: true,
  })
  await vi.runAllTimersAsync()
  return load
}

function reopen() {
  doc_query(`div.multiselect`).dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
}

// Dynamic options loading tests (https://github.com/janosh/svelte-widgets/discussions/342)
describe(`loadOptions feature`, () => {
  const mock_data = Array.from({ length: 100 }, (_, idx) => `Option ${idx + 1}`)

  async function flush_ticks(count = 4) {
    for (let idx = 0; idx < count; idx++) await tick()
  }

  function mock_scroll_near_bottom(ul: Element) {
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(500)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(200)
    vi.spyOn(ul, `scrollTop`, `get`).mockReturnValue(250) // 500-250-200=50 < 100 threshold
    ul.dispatchEvent(new Event(`scroll`))
  }

  // bare-fn and `{ fetch }` object forms both default to batchSize 50 / onOpen true, so
  // the object form parameterizes all three initial-open cases uniformly
  test.each([
    [`default batch on open`, {}, 1, { search: ``, offset: 0, limit: 50 }],
    [`batchSize config`, { batchSize: 25 }, 1, { search: ``, offset: 0, limit: 25 }],
    [`onOpen=false skips open load`, { onOpen: false }, 0, null],
  ])(
    `loadOptions initial fetch: %s`,
    async (_label, config_extra, expected_calls, expected_args) => {
      const load_options = vi.fn(() => Promise.resolve({ options: [], hasMore: false }))
      mount_multiselect({
        loadOptions: { fetch: load_options, ...config_extra },
        open: true,
      })
      await tick()

      expect(load_options).toHaveBeenCalledTimes(expected_calls)
      if (expected_args) {
        expect(load_options).toHaveBeenCalledWith(expect.objectContaining(expected_args))
      }
    },
  )

  // local options must not be gated behind the network: a command palette filters its
  // static commands on the first keystroke while remote results are still in flight
  test(`local options match instantly and remote results append behind them`, async () => {
    vi.useFakeTimers()
    const { fn: fetch_fn, resolvers } = deferred_load()
    mount_multiselect({
      options: [`Alpha`, `Beta`],
      loadOptions: { fetch: fetch_fn, debounceMs: 500 },
      open: true,
    })
    await vi.runAllTimersAsync()
    await type_search_text(`al`)

    const rendered = () =>
      [...document.querySelectorAll(`ul.options > li[role='option']`)].map((li) =>
        li.textContent?.trim(),
      )
    // no timers advanced and no fetch settled: this row can only be a local option
    expect(rendered()).toEqual([`Alpha`])
    expect(fetch_fn).toHaveBeenCalledOnce() // just the on-open load, typing still debounced

    await vi.runAllTimersAsync() // debounce elapses, fetch fires but never settles
    expect(rendered()).toEqual([`Alpha`])

    resolvers[1]({ options: [`Remote alpha`], hasMore: false })
    await vi.runAllTimersAsync()

    expect(rendered()).toEqual([`Alpha`, `Remote alpha`])
  })

  test(`loadOptions shows loading indicator while loading`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount_multiselect({ loadOptions: load_options, open: true })
    await tick()

    expect(document.querySelector(`ul.options > li.loading-more`)).toBeInstanceOf(
      HTMLLIElement,
    )

    resolvers[0]({ options: [`Test`], hasMore: false })
    await tick()

    expect(document.querySelector(`ul.options > li.loading-more`)).toBeNull()
  })

  test.each([
    [
      `triggers another fetch when hasMore=true`,
      () =>
        vi
          .fn()
          .mockResolvedValueOnce({ options: mock_data.slice(0, 50), hasMore: true })
          .mockResolvedValueOnce({ options: mock_data.slice(50, 100), hasMore: false }),
      2,
      { search: ``, offset: 50, limit: 50 },
    ],
    [
      `does not fetch again when hasMore=false`,
      () => vi.fn(() => Promise.resolve({ options: [`A`, `B`], hasMore: false })),
      1,
      null,
    ],
  ])(
    `scroll pagination: %s`,
    async (_label, make_load_options, expected_calls, last_args) => {
      const load_options = make_load_options()
      mount_multiselect({ loadOptions: load_options, open: true })
      await flush_ticks(2)

      expect(load_options).toHaveBeenCalledTimes(1)

      mock_scroll_near_bottom(doc_query(`ul.options`))
      await tick()

      expect(load_options).toHaveBeenCalledTimes(expected_calls)
      if (last_args) {
        expect(load_options).toHaveBeenLastCalledWith(expect.objectContaining(last_args))
      }
    },
  )

  // https://github.com/janosh/svelte-widgets/issues/412
  test(`auto-fills when small batchSize doesn't overflow dropdown`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount_multiselect({ loadOptions: { fetch: load_options, batchSize: 5 }, open: true })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    // a rendered list that does not overflow
    const ul = doc_query(`ul.options`)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(400)
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(100)

    resolvers[0]({ options: mock_data.slice(0, 5), hasMore: true })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(2)

    resolvers[1]({ options: mock_data.slice(5, 10), hasMore: false })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(2) // hasMore=false stops auto-fill
  })

  test(`auto-fill stops when list becomes scrollable`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount_multiselect({ loadOptions: { fetch: load_options, batchSize: 5 }, open: true })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    // Mock overflow BEFORE resolving so auto-fill sees the list as scrollable
    const ul = doc_query(`ul.options`)
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(500)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(400)

    resolvers[0]({ options: mock_data.slice(0, 5), hasMore: true })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(1)
  })

  // the unmount abort lives in a teardown-returning $effect that reads like a missing call
  test(`unmounting aborts the in-flight fetch`, async () => {
    const { fn: load_options } = deferred_load()
    const component = mount_multiselect({ loadOptions: load_options, open: true })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)
    expect(load_options.mock.calls[0][0].signal?.aborted).toBe(false)

    void unmount_component(component)
    await tick()

    expect(load_options.mock.calls[0][0].signal?.aborted).toBe(true)
  })

  // `signal` is optional, so a consumer may ignore it. Its request then keeps running
  // and can fail for real after being superseded — that must still be reported.
  test(`logs a real failure from a superseded request that ignored signal`, async () => {
    const console_error = mock_console_error()
    const { fn: load_options, rejectors } = await mount_deferred_open()

    const input = get_input()
    await type_search_text(`abc`, input)
    await vi.runAllTimersAsync()
    expect(load_options).toHaveBeenCalledTimes(2)
    expect(load_options.mock.calls[0][0].signal?.aborted).toBe(true)

    rejectors[0](new Error(`HTTP 500 boom`))
    await vi.runAllTimersAsync()

    expect(console_error).toHaveBeenCalledWith(
      `MultiSelect: loadOptions error:`,
      expect.any(Error),
    )
  })

  test(`a search reset aborts an in-flight pagination request`, async () => {
    const { fn: load_options, resolvers } = await mount_deferred_open()
    resolvers[0]({ options: mock_data.slice(0, 50), hasMore: true })
    await vi.runAllTimersAsync()

    mock_scroll_near_bottom(doc_query(`ul.options`))
    await tick()
    expect(load_options).toHaveBeenCalledTimes(2) // pagination now in flight

    const input = get_input()
    await type_search_text(`zz`, input)
    await vi.runAllTimersAsync()

    expect(load_options.mock.calls[1][0].signal?.aborted).toBe(true)
  })

  // a server can report hasMore with an empty batch; refetching the same offset makes no
  // progress, and offset 0 means "reset your cursor" in the documented pagination pattern
  test(`auto-fill stops on an empty batch and never reuses offset 0`, async () => {
    const offsets: number[] = []
    const load_options = vi.fn(async ({ offset }: LoadOptionsParams) => {
      offsets.push(offset)
      return { options: [] as string[], hasMore: true }
    })
    mount_multiselect({ loadOptions: { fetch: load_options, batchSize: 5 }, open: true })
    await tick()

    const ul = doc_query(`ul.options`)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(400)
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(100)
    await flush_ticks(10)

    expect(offsets).toEqual([0])
  })

  test(`stale fetch result discarded when search changes during load`, async () => {
    const { fn: load_options, resolvers } = await mount_deferred_open()
    expect(load_options).toHaveBeenCalledTimes(1)

    const input = get_input()
    await type_search_text(`xyz`, input)
    await vi.runAllTimersAsync()
    expect(load_options).toHaveBeenCalledTimes(2)
    expect(load_options.mock.calls[0][0].signal?.aborted).toBe(true)
    // exact match, not objectContaining: pins that a signal is actually handed over
    expect(load_options).toHaveBeenLastCalledWith({
      search: `xyz`,
      offset: 0,
      limit: 50,
      signal: expect.any(AbortSignal),
    })

    // resolve the stale first request
    resolvers[0]({ options: [`Stale Result`], hasMore: false })
    await vi.runAllTimersAsync()

    const ul = doc_query(`ul.options`)
    expect(ul.textContent).not.toContain(`Stale Result`)

    resolvers[1]({ options: [`Fresh Result`], hasMore: false })
    await vi.runAllTimersAsync()
    expect(ul.textContent).toContain(`Fresh Result`)
  })

  test(`pagination error is logged, clears busy state, and stops further loading`, async () => {
    const console_error = mock_console_error()
    const { fn: load_options, resolvers, rejectors } = deferred_load()
    mount_multiselect({ loadOptions: load_options, open: true })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    resolvers[0]({ options: mock_data.slice(0, 50), hasMore: true })
    await tick()
    const input = get_input()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    const ul = doc_query(`ul.options`)
    mock_scroll_near_bottom(ul)
    await tick()
    expect(load_options).toHaveBeenCalledTimes(2)
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    rejectors[1](new Error(`Server error`))
    await tick()
    expect(console_error).toHaveBeenCalledWith(
      `MultiSelect: loadOptions error:`,
      expect.any(Error),
    )

    // the error sets has_more=false, which both clears pending and blocks pagination
    expect(input.getAttribute(`aria-busy`)).toBeNull()
    mock_scroll_near_bottom(ul)
    await tick()
    expect(load_options).toHaveBeenCalledTimes(2)
  })

  test(`close during fetch clears loading state`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount_multiselect({ loadOptions: load_options, open: true })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    const input = get_input()
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    // close while the fetch is still pending
    input.dispatchEvent(fresh_key(`Escape`))
    await tick()

    expect(input.getAttribute(`aria-busy`)).toBeNull()
    expect(load_options.mock.calls[0][0].signal?.aborted).toBe(true)

    // a stale resolve after close must not corrupt state
    resolvers[0]({ options: [`Result`], hasMore: false })
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    reopen()
    await tick()
    expect(load_options).toHaveBeenCalledTimes(2)
  })

  test(`scroll after auto-fill cap resets counter and allows more loading`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount_multiselect({ loadOptions: { fetch: load_options, batchSize: 5 }, open: true })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    const ul = doc_query(`ul.options`)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(400)
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(100)

    // resolve batches until the auto-fill cap is reached
    for (let idx = 0; idx < 20; idx++) {
      resolvers[idx]({ options: [`Item ${idx}`], hasMore: true })
      await flush_ticks()
    }
    const capped_count = load_options.mock.calls.length
    expect(capped_count).toBe(21) // MAX_AUTO_FILL_ROUNDS rounds plus the on-open load
    // Auto-fill should have stopped at the cap
    resolvers[capped_count - 1]({ options: [`Capped`], hasMore: true })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(capped_count)

    // a user scroll resets the auto-fill counter
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(500)
    vi.spyOn(ul, `scrollTop`, `get`).mockReturnValue(250)
    ul.dispatchEvent(new Event(`scroll`))
    await tick()
    expect(load_options).toHaveBeenCalledTimes(capped_count + 1)

    // auto-fill resumes once the scroll-triggered load resolves, proving the counter reset
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(100)
    resolvers[capped_count]({ options: [`Post-scroll`], hasMore: true })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(capped_count + 2)
  })

  test(`reopen before stale fetch resolves triggers fresh load`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount_multiselect({ loadOptions: load_options, open: true })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    const input = get_input()

    // close while the first fetch is still pending
    input.dispatchEvent(fresh_key(`Escape`))
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    // reopen before the old fetch resolves — the critical timing
    reopen()
    await tick()
    expect(load_options).toHaveBeenCalledTimes(2)
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    // the late resolve must be discarded, not corrupt the new session
    resolvers[0]({ options: [`Stale`], hasMore: false })
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)
    expect(doc_query(`ul.options`).textContent).not.toContain(`Stale`)

    resolvers[1]({ options: [`Fresh`], hasMore: false })
    await tick()
    expect(doc_query(`ul.options`).textContent).toContain(`Fresh`)
    expect(input.getAttribute(`aria-busy`)).toBeNull()
  })

  test(`stale error does not affect current request state`, async () => {
    mock_console_error()
    const { fn: load_options, resolvers, rejectors } = await mount_deferred_open()
    expect(load_options).toHaveBeenCalledTimes(1)

    // new search while the first fetch is pending
    const input = get_input()
    await type_search_text(`test`, input)
    await vi.runAllTimersAsync()
    expect(load_options).toHaveBeenCalledTimes(2)

    // the new fetch succeeds first, with hasMore=true
    resolvers[1]({ options: [`Result A`], hasMore: true })
    await vi.runAllTimersAsync()

    const ul = doc_query(`ul.options`)
    expect(ul.textContent).toContain(`Result A`)

    // the stale fetch errors after that success and must not corrupt hasMore
    rejectors[0](new Error(`Stale network error`))
    await vi.runAllTimersAsync()

    // pagination still fires, so hasMore survived the stale error
    mock_scroll_near_bottom(ul)
    await vi.runAllTimersAsync()
    expect(load_options).toHaveBeenCalledTimes(3)
  })

  test(`failed initial load retries on close+reopen`, async () => {
    mock_console_error()
    const { fn: load_options, resolvers, rejectors } = deferred_load()
    vi.useFakeTimers()
    // onOpen=false so retry requires typing, exposing has_more via pending
    mount_multiselect({
      loadOptions: { fetch: load_options, onOpen: false, debounceMs: 10 },
      open: true,
    })

    // with onOpen=false, typing is what triggers the initial load
    const input = get_input()
    await type_search_text(`q`, input)
    await vi.runAllTimersAsync()
    expect(load_options).toHaveBeenCalledTimes(1)

    rejectors[0](new Error(`Server down`))
    await vi.runAllTimersAsync()

    input.dispatchEvent(fresh_key(`Escape`))
    await vi.runAllTimersAsync()
    reopen()
    await vi.runAllTimersAsync()

    await type_search_text(`q`, input)
    // has_more was reset on close, so aria-busy is true during the debounce
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    await vi.runAllTimersAsync()
    expect(load_options).toHaveBeenCalledTimes(2)

    resolvers[1]({ options: [`Recovered`], hasMore: false })
    await vi.runAllTimersAsync()
    expect(doc_query(`ul.options`).textContent).toContain(`Recovered`)
    expect(input.getAttribute(`aria-busy`)).toBeNull()
  })

  test(`failed search retryable via input change`, async () => {
    mock_console_error()
    const { fn: load_options, resolvers, rejectors } = deferred_load()
    vi.useFakeTimers()
    mount_multiselect({
      loadOptions: { fetch: load_options, debounceMs: 0 },
      open: true,
    })
    await vi.runAllTimersAsync()
    resolvers[0]({ options: [`Apple`], hasMore: false })
    await vi.runAllTimersAsync()
    expect(load_options).toHaveBeenCalledTimes(1)

    // this search fails
    const input = get_input()
    await type_search_text(`x`, input)
    await vi.runAllTimersAsync()
    expect(load_options).toHaveBeenCalledTimes(2)
    rejectors[1](new Error(`fail`))
    await vi.runAllTimersAsync()

    // clearing and retyping the same search must refetch
    await type_search_text(``, input)
    await vi.runAllTimersAsync()
    await type_search_text(`x`, input)
    await vi.runAllTimersAsync()

    expect(load_options).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: `x`, offset: 0, limit: 50 }),
    )
  })
})

// https://github.com/janosh/svelte-widgets/discussions/401
// User messages during async loading: create/no-match suppressed, dupe allowed
test.each([
  {
    name: `createOptionMsg hidden while loading, shown after`,
    props: { allowUserOptions: true, createOptionMsg: `Create this option` },
    initial_options: [`Existing`],
    search: `new tag`,
    while_loading: null,
    after_resolve: `Create this option`,
    resolve_with: [],
  },
  {
    name: `duplicateOptionMsg shown during loading`,
    props: { selected: [`Apple`], duplicateOptionMsg: `Already selected` },
    initial_options: [`Apple`, `Banana`],
    search: `Apple`,
    while_loading: `Already selected`,
    after_resolve: null,
    resolve_with: null,
  },
  {
    name: `noMatchingOptionsMsg hidden while loading, shown after`,
    props: { noMatchingOptionsMsg: `No matches` },
    initial_options: [`Apple`],
    search: `xyz`,
    while_loading: null,
    after_resolve: `No matches`,
    resolve_with: [],
  },
])(
  `$name`,
  async ({
    props,
    initial_options,
    search,
    while_loading,
    after_resolve,
    resolve_with,
  }) => {
    vi.useFakeTimers()
    const { fn: fetch_fn, resolvers } = deferred_load()

    mount_multiselect({
      loadOptions: { fetch: fetch_fn, debounceMs: 0 },
      open: true,
      ...props,
    })
    await vi.runAllTimersAsync()
    resolvers[0]({ options: [...initial_options], hasMore: false })
    await vi.runAllTimersAsync()

    const input = get_input()
    await type_search_text(search, input)
    await vi.runAllTimersAsync()
    expect(fetch_fn.mock.calls.length).toBeGreaterThanOrEqual(2)

    const msg_during = document.querySelector(`.user-msg`)?.textContent?.trim()
    if (while_loading) expect(msg_during).toBe(while_loading)
    else expect(document.querySelector(`.user-msg`)).toBeNull()

    if (resolve_with) {
      resolvers[1]({ options: resolve_with, hasMore: false })
      await vi.runAllTimersAsync()
      expect(document.querySelector(`.user-msg`)?.textContent?.trim()).toBe(after_resolve)
    }
  },
)

// https://github.com/janosh/svelte-widgets/pull/403#issuecomment-4106385445
describe(`load_options_pending`, () => {
  beforeEach(() => vi.useFakeTimers())

  test(`typing during the first in-flight load debounces instead of firing immediate fetches`, async () => {
    const { fn: fetch_fn } = deferred_load()

    mount_multiselect({ loadOptions: { fetch: fetch_fn, debounceMs: 200 }, open: true })
    await tick()
    expect(fetch_fn).toHaveBeenCalledTimes(1) // immediate open load, still in-flight

    // typing while the first fetch is still awaiting: pre-fix each keystroke re-entered the
    // first-load branch and fired another immediate load, instead of routing to the debounce
    const input = get_input()
    for (const value of [`a`, `ab`]) {
      await type_search_text(value, input)
    }
    expect(fetch_fn).toHaveBeenCalledTimes(1) // no extra immediate fetches while debouncing

    await vi.advanceTimersByTimeAsync(200)
    expect(fetch_fn).toHaveBeenCalledTimes(2) // exactly one debounced fetch for the latest search
    expect(fetch_fn).toHaveBeenLastCalledWith(expect.objectContaining({ search: `ab` }))
  })

  // onOpen=true loads immediately on open, onOpen=false stays idle until the user types.
  // Either way Enter must wait for the debounce and fetch to settle before creating.
  test.each([true, false])(
    `onOpen=%s: Enter during debounce does not create unwanted option`,
    async (on_open) => {
      const { fn: fetch_fn, resolvers: fetch_resolvers } = deferred_load()
      const oncreate_spy = vi.fn()

      mount_multiselect({
        loadOptions: { fetch: fetch_fn, onOpen: on_open, debounceMs: 300 },
        allowUserOptions: true,
        createOptionMsg: `Create this option`,
        open: true,
        oncreate: oncreate_spy,
      })
      await vi.runAllTimersAsync()

      const input = get_input()
      if (on_open) {
        expect(fetch_fn).toHaveBeenCalledTimes(1)
        fetch_resolvers[0]({ options: [`Apple`, `Banana`], hasMore: false })
        await vi.runAllTimersAsync()
      } else {
        expect(fetch_fn).not.toHaveBeenCalled()
        expect(input.getAttribute(`aria-busy`)).toBeNull() // idle until user types
      }

      await type_search_text(`Cherry`, input)

      expect(input.getAttribute(`aria-busy`)).toBe(`true`)

      input.dispatchEvent(fresh_key(`Enter`))
      await tick()
      expect(oncreate_spy).not.toHaveBeenCalled()
      expect(document.querySelector(`.user-msg`)).toBeNull()

      await vi.runAllTimersAsync()
      fetch_resolvers.at(-1)?.({ options: [], hasMore: false })
      await vi.runAllTimersAsync()

      expect(input.getAttribute(`aria-busy`)).toBeNull()
      expect(document.querySelector(`.user-msg`)?.textContent?.trim()).toBe(
        `Create this option`,
      )

      input.dispatchEvent(fresh_key(`Enter`))
      await tick()
      expect(oncreate_spy).toHaveBeenCalledTimes(1)
    },
  )

  test(`fetch failure unblocks pending state`, async () => {
    const console_error = mock_console_error()
    const fetch_fn = vi
      .fn()
      .mockResolvedValueOnce({ options: [`Apple`], hasMore: false })
      .mockRejectedValue(new Error(`network error`))

    mount_multiselect({
      loadOptions: { fetch: fetch_fn, debounceMs: 0 },
      allowUserOptions: true,
      createOptionMsg: `Create this option`,
      open: true,
    })
    await vi.runAllTimersAsync()

    const input = get_input()
    await type_search_text(`NewThing`, input)
    await vi.runAllTimersAsync()

    expect(input.getAttribute(`aria-busy`)).toBeNull()
    expect(document.querySelector(`.user-msg`)?.textContent?.trim()).toBe(
      `Create this option`,
    )
    expect(console_error).toHaveBeenCalledWith(
      `MultiSelect: loadOptions error:`,
      expect.any(Error),
    )
  })

  test(`late fetch response after close does not corrupt next open`, async () => {
    const { fn: fetch_fn, resolvers: fetch_resolvers } = deferred_load()

    mount_multiselect({
      loadOptions: { fetch: fetch_fn, debounceMs: 0 },
      open: true,
    })
    await vi.runAllTimersAsync()
    fetch_resolvers[0]({ options: [`Apple`], hasMore: false })
    await vi.runAllTimersAsync()
    expect(fetch_fn).toHaveBeenCalledTimes(1)

    // Type to trigger a second fetch, then close before it resolves
    const input = get_input()
    await type_search_text(`Rust`, input)
    await vi.runAllTimersAsync()
    expect(fetch_fn).toHaveBeenCalledTimes(2)

    input.dispatchEvent(fresh_key(`Escape`))
    await tick()

    // the late resolve after close must be discarded
    fetch_resolvers[1]({ options: [`Rust Lang`], hasMore: false })
    await vi.runAllTimersAsync()

    // reopen takes the is_first_load path, loading immediately
    reopen()
    await tick()
    // Fresh load fires immediately; stale path would debounce (not yet called)
    expect(fetch_fn).toHaveBeenCalledTimes(3)
    expect(fetch_fn).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: ``, offset: 0, limit: 50 }),
    )
    // Stale "Rust Lang" result must not leak into the reopened session
    expect(document.querySelector(`ul.options`)?.textContent).not.toContain(`Rust Lang`)
  })
})

describe(`async oncreate`, () => {
  type OncreateResult = false | Option | undefined

  // manually-controlled promise so tests decide exactly when oncreate settles
  function make_deferred<T>() {
    let resolve_fn: (value: T) => void = () => {}
    let reject_fn: (reason: unknown) => void = () => {}
    const promise = new Promise<T>((resolve, reject) => {
      resolve_fn = resolve
      reject_fn = reject
    })
    return { promise, resolve_fn, reject_fn }
  }
  const submit_create = async (text: string) => {
    const input = await type_search_text(text)
    input.dispatchEvent(fresh_key(`Enter`))
    await tick()
    return input
  }

  test(`resolving undefined adds typed option after resolve, spinner shown only while pending`, async () => {
    const { promise, resolve_fn } = make_deferred<OncreateResult>()
    const oncreate = vi.fn(() => promise)
    const onadd = vi.fn()
    const spinner = createRawSnippet(() => ({
      render: () => `<span class="custom-spinner">creating</span>`,
    }))
    const props = $state<MultiSelectProps>({
      options: [`foo`, `bar`],
      selected: [],
      allowUserOptions: true,
      oncreate,
      onadd,
      spinner,
    })
    mount_multiselect(props)

    const input = await type_search_text(`new async option`)
    expect(document.querySelector(`.custom-spinner`)).toBeNull()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    input.dispatchEvent(fresh_key(`Enter`))
    await tick()

    expect(oncreate).toHaveBeenCalledTimes(1)
    expect(oncreate).toHaveBeenCalledWith({ option: `new async option` })
    // while the promise is pending: spinner visible, input busy, nothing added yet
    expect(doc_query(`.custom-spinner`).textContent).toBe(`creating`)
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)
    expect(props.selected).toEqual([])
    expect(onadd).not.toHaveBeenCalled()

    resolve_fn(undefined)
    await promise
    await tick()

    expect(document.querySelector(`.custom-spinner`)).toBeNull()
    expect(input.getAttribute(`aria-busy`)).toBeNull()
    expect(props.selected).toEqual([`new async option`])
    expect(onadd).toHaveBeenCalledTimes(1)
    expect(onadd).toHaveBeenCalledWith({
      option: `new async option`,
      selected: [`new async option`],
    })
  })

  test.each<[string, OncreateResult, Option[], number]>([
    [`a transformed option replaces the original`, `TRANSFORMED`, [`TRANSFORMED`], 1],
    [`false aborts the add`, false, [], 0],
  ])(
    `resolving %s`,
    async (_label, resolved_value, expected_selected, expected_onadd_calls) => {
      const console_error = mock_console_error()
      const { promise, resolve_fn } = make_deferred<OncreateResult>()
      const onadd = vi.fn()
      const props = $state<MultiSelectProps>({
        options: [`foo`, `bar`],
        selected: [],
        allowUserOptions: true,
        oncreate: () => promise,
        onadd,
      })
      mount_multiselect(props)

      await submit_create(`fresh-opt`)

      resolve_fn(resolved_value)
      await promise
      await tick()

      expect(props.selected).toEqual(expected_selected)
      expect(onadd).toHaveBeenCalledTimes(expected_onadd_calls)
      expect(console_error).not.toHaveBeenCalled()
    },
  )

  test(`non-native thenable oncreate result is awaited, not added as an option`, async () => {
    const onadd = vi.fn()
    // custom thenable (e.g. from a non-native promise implementation): must be
    // awaited like a Promise instead of being treated as an option object
    const thenable = {
      // oxlint-disable-next-line unicorn/no-thenable -- deliberately testing thenable handling
      then: (resolve: (value: OncreateResult) => void) => resolve(`from-thenable`),
    }
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      selected: [],
      allowUserOptions: true,
      oncreate: () => thenable as unknown as OncreateResult,
      onadd,
    })
    mount_multiselect(props)

    await submit_create(`typed-text`)
    await tick() // extra microtask hop for the thenable resolution

    expect(props.selected).toEqual([`from-thenable`])
    expect(onadd).toHaveBeenCalledTimes(1)
  })

  test(`oncreate throwing synchronously adds nothing and logs console.error`, async () => {
    const console_error = mock_console_error()
    const onadd = vi.fn()
    const sync_error = new Error(`validation blew up`)
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      selected: [],
      allowUserOptions: true,
      oncreate: () => {
        throw sync_error
      },
      onadd,
    })
    mount_multiselect(props)

    await submit_create(`doomed-opt`)

    expect(props.selected).toEqual([])
    expect(onadd).not.toHaveBeenCalled()
    expect(console_error).toHaveBeenCalledWith(`MultiSelect: oncreate threw:`, sync_error)
  })

  test(`rejecting adds nothing and logs console.error`, async () => {
    const console_error = mock_console_error()
    const { promise, reject_fn } = make_deferred<OncreateResult>()
    const onadd = vi.fn()
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      selected: [],
      allowUserOptions: true,
      oncreate: () => promise,
      onadd,
    })
    mount_multiselect(props)

    const input = await submit_create(`doomed-opt`)
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    const rejection = new Error(`backend validation failed`)
    reject_fn(rejection)
    await promise.catch(() => {})
    await tick()

    expect(props.selected).toEqual([])
    expect(onadd).not.toHaveBeenCalled()
    expect(console_error).toHaveBeenCalledTimes(1)
    expect(console_error).toHaveBeenCalledWith(
      `MultiSelect: oncreate promise rejected:`,
      rejection,
    )
    // busy state must reset even on rejection
    expect(input.getAttribute(`aria-busy`)).toBeNull()
  })

  test(`double Enter while async create is pending adds only one option`, async () => {
    const { promise, resolve_fn } = make_deferred<OncreateResult>()
    const oncreate = vi.fn(() => promise)
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      selected: [],
      allowUserOptions: true,
      oncreate,
    })
    mount_multiselect(props)

    const input = await submit_create(`only-once`)
    input.dispatchEvent(fresh_key(`Enter`)) // second Enter while first create pending
    await tick()

    expect(oncreate).toHaveBeenCalledTimes(1)

    resolve_fn(undefined)
    await promise
    await tick()

    expect(props.selected).toEqual([`only-once`])
  })

  test.each<[string, MultiSelectProps[`oncreate`], Option[], Option[]?]>([
    [`returning false blocks the option`, () => false, []],
    [
      `returning an option transforms it`,
      ({ option }) => `${get_label(option)}`.toUpperCase(),
      [`SYNC-OPT`],
    ],
    [`returning undefined keeps the original option`, () => undefined, [`sync-opt`]],
    [`returning empty string keeps the original option`, () => ``, [`sync-opt`]],
    [`transforming to a selected option is rejected`, () => `foo`, [`foo`], [`foo`]],
  ])(
    `sync oncreate regression: %s`,
    async (_label, oncreate, expected_selected, selected = []) => {
      const props = $state<MultiSelectProps>({
        options: [`foo`],
        selected,
        allowUserOptions: true,
        oncreate,
      })
      mount_multiselect(props)

      await submit_create(`sync-opt`)

      expect(props.selected).toEqual(expected_selected)
    },
  )
})
