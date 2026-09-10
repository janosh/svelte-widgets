import { createRawSnippet, flushSync, tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { Option } from '$lib'
import type { LoadOptionsParams, LoadOptionsResult, MultiSelectProps } from '$lib/types'
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
// deferred load_options fetch: tests decide exactly when each request settles
type LoadResult = LoadOptionsResult<string>

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
    load_options: { fetch: load.fn, debounce_ms: 10 },
    open: true,
  })
  await vi.runAllTimersAsync()
  return load
}

function reopen() {
  doc_query(`div.multiselect`).dispatchEvent(new MouseEvent(`mouseup`, { bubbles: true }))
}

// Dynamic options loading tests (https://github.com/janosh/svelte-widgets/discussions/342)
describe(`load_options feature`, () => {
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

  test.each([
    [`function shorthand`, null, 50],
    [`default batch on open`, {}, 50],
    [`batch_size config`, { batch_size: 25 }, 25],
    [`minimum batch and debounce`, { batch_size: 1, debounce_ms: 0 }, 1],
    [`fractional debounce`, { debounce_ms: 0.5 }, 50],
    [`on_open=false skips open load`, { on_open: false }, null],
  ])(`load_options initial fetch: %s`, async (_label, config_extra, limit) => {
    const load_options = vi.fn(async () => ({ options: [], has_more: false }))
    mount_multiselect({
      load_options:
        config_extra === null ? load_options : { fetch: load_options, ...config_extra },
      open: true,
    })
    await tick()

    if (limit === null) expect(load_options).not.toHaveBeenCalled()
    else
      expect(load_options).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ search: ``, offset: 0, limit }),
      )
  })

  test.each([
    ...[0, -1, 0.5, NaN, Infinity, null, `1`, false].map(
      (value) => [`batch_size`, value] as const,
    ),
    ...[-1, NaN, Infinity, null, `0`, false].map(
      (value) => [`debounce_ms`, value] as const,
    ),
  ])(`rejects load_options.%s=%s initially and on update`, (field, value) => {
    const load_options = { fetch: vi.fn(async () => ({ options: [], has_more: false })) }
    const invalid_options = { ...load_options, [field]: value }
    const message = `MultiSelect: load_options.${field} must be`
    expect(() => mount_multiselect({ load_options: invalid_options })).toThrow(message)

    const props = $state<MultiSelectProps>({ load_options })
    mount_multiselect(props)
    flushSync()
    props.load_options = invalid_options
    expect(flushSync).toThrow(message)
    expect(load_options.fetch).not.toHaveBeenCalled()
  })

  // local options must not be gated behind the network: a command palette filters its
  // static commands on the first keystroke while remote results are still in flight
  test(`local options match instantly and remote results append behind them`, async () => {
    vi.useFakeTimers()
    const { fn: fetch_fn, resolvers } = deferred_load()
    mount_multiselect({
      options: [`Alpha`, `Beta`],
      load_options: { fetch: fetch_fn, debounce_ms: 500 },
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
    expect(document.querySelector(`ul.options > li.loading-more`)).toBeInstanceOf(
      HTMLLIElement,
    )

    resolvers[1]({ options: [`Remote alpha`], has_more: false })
    await vi.runAllTimersAsync()

    expect(rendered()).toEqual([`Alpha`, `Remote alpha`])
    expect(document.querySelector(`ul.options > li.loading-more`)).toBeNull()
  })

  test.each([
    [
      `triggers another fetch when has_more=true`,
      () =>
        vi
          .fn()
          .mockResolvedValueOnce({ options: mock_data.slice(0, 50), has_more: true })
          .mockResolvedValueOnce({ options: mock_data.slice(50, 100), has_more: false }),
      2,
      { search: ``, offset: 50, limit: 50 },
    ],
    [
      `does not fetch again when has_more=false`,
      () => vi.fn(() => Promise.resolve({ options: [`A`, `B`], has_more: false })),
      1,
      null,
    ],
  ])(
    `scroll pagination: %s`,
    async (_label, make_load_options, expected_calls, last_args) => {
      const load_options = make_load_options()
      mount_multiselect({ load_options, open: true })
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
  test(`auto-fills when small batch_size doesn't overflow dropdown`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount_multiselect({
      load_options: { fetch: load_options, batch_size: 5 },
      open: true,
    })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    // a rendered list that does not overflow
    const ul = doc_query(`ul.options`)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(400)
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(100)

    resolvers[0]({ options: mock_data.slice(0, 5), has_more: true })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(2)

    resolvers[1]({ options: mock_data.slice(5, 10), has_more: false })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(2) // has_more=false stops auto-fill
  })

  test(`auto-fill stops when list becomes scrollable`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount_multiselect({
      load_options: { fetch: load_options, batch_size: 5 },
      open: true,
    })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    // Mock overflow BEFORE resolving so auto-fill sees the list as scrollable
    const ul = doc_query(`ul.options`)
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(500)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(400)

    resolvers[0]({ options: mock_data.slice(0, 5), has_more: true })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(1)
  })

  // the unmount abort lives in a teardown-returning $effect that reads like a missing call
  test(`unmounting aborts the in-flight fetch`, async () => {
    const { fn: load_options } = deferred_load()
    const component = mount_multiselect({ load_options, open: true })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)
    expect(load_options.mock.calls[0][0].signal?.aborted).toBe(false)

    void unmount_component(component)
    await tick()

    expect(load_options.mock.calls[0][0].signal?.aborted).toBe(true)
  })

  test(`a search reset aborts an in-flight pagination request`, async () => {
    const { fn: load_options, resolvers } = await mount_deferred_open()
    resolvers[0]({ options: mock_data.slice(0, 50), has_more: true })
    await vi.runAllTimersAsync()

    mock_scroll_near_bottom(doc_query(`ul.options`))
    await tick()
    expect(load_options).toHaveBeenCalledTimes(2) // pagination now in flight

    const input = get_input()
    await type_search_text(`zz`, input)
    await vi.runAllTimersAsync()

    expect(load_options.mock.calls[1][0].signal?.aborted).toBe(true)
  })

  // a server can report has_more with an empty batch; refetching the same offset makes no
  // progress, and offset 0 means "reset your cursor" in the documented pagination pattern
  test(`auto-fill stops on an empty batch and never reuses offset 0`, async () => {
    const offsets: number[] = []
    const load_options = vi.fn(async ({ offset }: LoadOptionsParams) => {
      offsets.push(offset)
      return { options: [] as string[], has_more: true }
    })
    mount_multiselect({
      load_options: { fetch: load_options, batch_size: 5 },
      open: true,
    })
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
    resolvers[0]({ options: [`Stale Result`], has_more: false })
    await vi.runAllTimersAsync()

    const ul = doc_query(`ul.options`)
    expect(ul.textContent).not.toContain(`Stale Result`)

    resolvers[1]({ options: [`Fresh Result`], has_more: false })
    await vi.runAllTimersAsync()
    expect(ul.textContent).toContain(`Fresh Result`)
  })

  test.each([
    [0, false],
    [50, false],
    [0, true],
    [50, true],
  ])(
    `failed load at offset %s (partial: %s) retries without losing options`,
    async (offset, partial) => {
      const console_error = mock_console_error()
      const { fn: load_options, resolvers, rejectors } = deferred_load()
      const props = $state<MultiSelectProps>({
        load_options,
        open: true,
        search_text: `query`,
        load_error: null,
      })
      mount_multiselect(props)
      await tick()
      const ul = doc_query(`ul.options`)
      const request_idx = offset ? 1 : 0
      const previous = mock_data.slice(0, offset)
      if (offset) {
        resolvers[0]({ options: previous, has_more: true })
        await tick()
        mock_scroll_near_bottom(ul)
        await tick()
      }
      expect(get_input().getAttribute(`aria-busy`)).toBe(`true`)
      const error = new Error(`Server error`)
      const available = partial ? [`Available`] : []
      const visible_options = [...previous, ...available]
      if (partial)
        resolvers[request_idx]({
          options: visible_options,
          has_more: false,
          replace: true,
          error,
        })
      else rejectors[request_idx](error)
      await tick()
      expect(props.load_error).toBe(error)
      if (!partial)
        expect(console_error).toHaveBeenCalledWith(
          `OptionList: load_options error:`,
          error,
        )
      expect(get_input().getAttribute(`aria-busy`)).toBeNull()
      expect(document.querySelector(`.user-msg`)).toBeNull()
      expect(doc_query(`[role="alert"]`).textContent).toBe(`Could not load options`)
      expect(ul.querySelector(`button, [role="alert"]`)).toBeNull()
      const retry = doc_query<HTMLButtonElement>(`[role="alert"] + button`)
      retry.focus()
      await tick()
      expect(document.activeElement).toBe(retry)
      expect(ul.classList.contains(`hidden`)).toBe(false)
      expect(ul.querySelectorAll(`li[role="option"]`)).toHaveLength(
        visible_options.length,
      )
      mock_scroll_near_bottom(ul)
      await tick()
      expect(load_options).toHaveBeenCalledTimes(request_idx + 1)

      retry.click()
      await tick()
      expect(props.load_error).toBeNull()
      expect(load_options).toHaveBeenLastCalledWith(
        expect.objectContaining({
          search: `query`,
          offset: visible_options.length,
          limit: 50,
        }),
      )
      expect(get_input().getAttribute(`aria-busy`)).toBe(`true`)
      const recovered = [...previous, `Recovered`, ...available]
      resolvers[request_idx + 1]({
        options: partial ? recovered : [`Recovered`],
        has_more: false,
        replace: partial,
      })
      await tick()
      expect(
        Array.from(ul.querySelectorAll(`li[role="option"]`), (option) =>
          option.textContent?.trim(),
        ),
      ).toEqual(recovered)
      expect(document.querySelector(`[role="alert"]`)).toBeNull()
      expect(get_input().getAttribute(`aria-busy`)).toBeNull()
    },
  )

  test(`close during fetch clears loading state`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount_multiselect({ load_options, open: true })
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
    resolvers[0]({ options: [`Result`], has_more: false })
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    reopen()
    await tick()
    expect(load_options).toHaveBeenCalledTimes(2)
  })

  test(`scroll after auto-fill cap resets counter and allows more loading`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount_multiselect({
      load_options: { fetch: load_options, batch_size: 5 },
      open: true,
    })
    await tick()
    expect(load_options).toHaveBeenCalledTimes(1)

    const ul = doc_query(`ul.options`)
    vi.spyOn(ul, `clientHeight`, `get`).mockReturnValue(400)
    vi.spyOn(ul, `scrollHeight`, `get`).mockReturnValue(100)

    // resolve batches until the auto-fill cap is reached
    for (let idx = 0; idx < 20; idx++) {
      resolvers[idx]({ options: [`Item ${idx}`], has_more: true })
      await flush_ticks()
    }
    const capped_count = load_options.mock.calls.length
    expect(capped_count).toBe(21) // MAX_AUTO_FILL_ROUNDS rounds plus the on-open load
    // Auto-fill should have stopped at the cap
    resolvers[capped_count - 1]({ options: [`Capped`], has_more: true })
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
    resolvers[capped_count]({ options: [`Post-scroll`], has_more: true })
    await flush_ticks()
    expect(load_options).toHaveBeenCalledTimes(capped_count + 2)
  })

  test(`reopen before stale fetch resolves triggers fresh load`, async () => {
    const { fn: load_options, resolvers } = deferred_load()
    mount_multiselect({ load_options, open: true })
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
    resolvers[0]({ options: [`Stale`], has_more: false })
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)
    expect(doc_query(`ul.options`).textContent).not.toContain(`Stale`)

    resolvers[1]({ options: [`Fresh`], has_more: false })
    await tick()
    expect(doc_query(`ul.options`).textContent).toContain(`Fresh`)
    expect(input.getAttribute(`aria-busy`)).toBeNull()
  })

  // Consumers may ignore signal; report their real errors without corrupting live results.
  test.each([`pending`, `settled`])(
    `stale error leaves the %s request intact`,
    async (state) => {
      const console_error = mock_console_error()
      const { fn: load_options, resolvers, rejectors } = await mount_deferred_open()
      expect(load_options).toHaveBeenCalledTimes(1)

      // new search while the first fetch is pending
      const input = get_input()
      await type_search_text(`test`, input)
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(2)
      expect(load_options.mock.calls[0][0].signal?.aborted).toBe(true)

      if (state === `settled`) {
        resolvers[1]({ options: [`Result A`], has_more: true })
        await vi.runAllTimersAsync()
      }

      const ul = doc_query(`ul.options`)
      const error = new Error(`Stale network error`)
      rejectors[0](error)
      await vi.runAllTimersAsync()

      expect(console_error).toHaveBeenCalledWith(`OptionList: load_options error:`, error)
      expect(document.querySelector(`[role="alert"]`)).toBeNull()
      if (state === `pending`) {
        expect(input.getAttribute(`aria-busy`)).toBe(`true`)
        resolvers[1]({ options: [`Result A`], has_more: true })
        await vi.runAllTimersAsync()
      }
      expect(ul.textContent).toContain(`Result A`)
      // pagination still fires, so has_more survived the stale error
      mock_scroll_near_bottom(ul)
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(3)
    },
  )

  test(`failed initial load retries on close+reopen`, async () => {
    mock_console_error()
    const { fn: load_options, resolvers, rejectors } = deferred_load()
    vi.useFakeTimers()
    // on_open=false so retry requires typing, exposing has_more via pending
    mount_multiselect({
      load_options: { fetch: load_options, on_open: false, debounce_ms: 10 },
      open: true,
    })

    // with on_open=false, typing is what triggers the initial load
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

    resolvers[1]({ options: [`Recovered`], has_more: false })
    await vi.runAllTimersAsync()
    expect(doc_query(`ul.options`).textContent).toContain(`Recovered`)
    expect(input.getAttribute(`aria-busy`)).toBeNull()
  })

  test.each([`results`, `empty`, `error`])(
    `returning to a cleared query with %s reloads after debounce`,
    async (outcome) => {
      mock_console_error()
      const { fn: load_options, resolvers, rejectors } = deferred_load()
      vi.useFakeTimers()
      mount_multiselect({
        load_options: { fetch: load_options, debounce_ms: 100 },
        open: true,
        search_text: `a`,
      })
      await vi.runAllTimersAsync()
      if (outcome === `error`) rejectors[0](new Error(`fail`))
      else
        resolvers[0]({ options: outcome === `results` ? [`Apple`] : [], has_more: false })
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(1)

      const input = get_input()
      await type_search_text(`b`, input)
      await type_search_text(`a`, input)
      await vi.advanceTimersByTimeAsync(99)
      expect(load_options).toHaveBeenCalledOnce()
      await vi.runAllTimersAsync()
      expect(load_options).toHaveBeenCalledTimes(2)
      expect(load_options).toHaveBeenLastCalledWith(
        expect.objectContaining({ search: `a`, offset: 0, limit: 50 }),
      )
      resolvers[1]({ options: [`Apple`], has_more: false })
      await vi.runAllTimersAsync()
      expect(doc_query(`ul.options`).textContent).toContain(`Apple`)
    },
  )
})

// https://github.com/janosh/svelte-widgets/discussions/401
// User messages during async loading: create/no-match suppressed, dupe allowed
test.each([
  {
    name: `create_option_msg hidden while loading, shown after`,
    props: { allow_user_options: true, create_option_msg: `Create this option` },
    initial_options: [`Existing`],
    search: `new tag`,
    while_loading: null,
    after_resolve: `Create this option`,
    resolve_with: [],
  },
  {
    name: `duplicate_option_msg shown during loading`,
    props: { value: [`Apple`], duplicate_option_msg: `Already selected` },
    initial_options: [`Apple`, `Banana`],
    search: `Apple`,
    while_loading: `Already selected`,
    after_resolve: null,
    resolve_with: null,
  },
  {
    name: `no_matching_options_msg hidden while loading, shown after`,
    props: { no_matching_options_msg: `No matches` },
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
      load_options: { fetch: fetch_fn, debounce_ms: 0 },
      open: true,
      ...props,
    })
    await vi.runAllTimersAsync()
    resolvers[0]({ options: [...initial_options], has_more: false })
    await vi.runAllTimersAsync()

    const input = get_input()
    await type_search_text(search, input)
    await vi.runAllTimersAsync()
    expect(fetch_fn.mock.calls.length).toBeGreaterThanOrEqual(2)

    const msg_during = document.querySelector(`.user-msg`)?.textContent?.trim()
    if (while_loading) expect(msg_during).toBe(while_loading)
    else expect(document.querySelector(`.user-msg`)).toBeNull()

    if (resolve_with) {
      resolvers[1]({ options: resolve_with, has_more: false })
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

    mount_multiselect({ load_options: { fetch: fetch_fn, debounce_ms: 200 }, open: true })
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

  // on_open=true loads immediately on open, on_open=false stays idle until the user types.
  // Either way Enter must wait for the debounce and fetch to settle before creating.
  test.each([true, false])(
    `on_open=%s: Enter during debounce does not create unwanted option`,
    async (on_open) => {
      const { fn: fetch_fn, resolvers: fetch_resolvers } = deferred_load()
      const oncreate_spy = vi.fn()

      mount_multiselect({
        load_options: { fetch: fetch_fn, on_open, debounce_ms: 300 },
        allow_user_options: true,
        create_option_msg: `Create this option`,
        open: true,
        on_create: oncreate_spy,
      })
      await vi.runAllTimersAsync()

      const input = get_input()
      if (on_open) {
        expect(fetch_fn).toHaveBeenCalledTimes(1)
        fetch_resolvers[0]({ options: [`Apple`, `Banana`], has_more: false })
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
      fetch_resolvers.at(-1)?.({ options: [], has_more: false })
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
      .mockResolvedValueOnce({ options: [`Apple`], has_more: false })
      .mockRejectedValue(new Error(`network error`))

    mount_multiselect({
      load_options: { fetch: fetch_fn, debounce_ms: 0 },
      allow_user_options: true,
      create_option_msg: `Create this option`,
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
      `OptionList: load_options error:`,
      expect.any(Error),
    )
  })

  test(`late fetch response after close does not corrupt next open`, async () => {
    const { fn: fetch_fn, resolvers: fetch_resolvers } = deferred_load()

    mount_multiselect({
      load_options: { fetch: fetch_fn, debounce_ms: 0 },
      open: true,
    })
    await vi.runAllTimersAsync()
    fetch_resolvers[0]({ options: [`Apple`], has_more: false })
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
    fetch_resolvers[1]({ options: [`Rust Lang`], has_more: false })
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

describe(`async on_create`, () => {
  type OncreateResult = false | Option | undefined

  const submit_create = async (text: string) => {
    const input = await type_search_text(text)
    input.dispatchEvent(fresh_key(`Enter`))
    await tick()
    return input
  }

  test(`resolving undefined adds typed option after resolve, spinner shown only while pending`, async () => {
    const { promise, resolve } = Promise.withResolvers<OncreateResult>()
    const on_create = vi.fn(() => promise)
    const on_add = vi.fn()
    const spinner = createRawSnippet(() => ({
      render: () => `<span class="custom-spinner">creating</span>`,
    }))
    const props = $state<MultiSelectProps>({
      options: [`foo`, `bar`],
      value: [],
      allow_user_options: true,
      on_create,
      on_add,
      spinner,
    })
    mount_multiselect(props)

    const input = await type_search_text(`new async option`)
    expect(document.querySelector(`.custom-spinner`)).toBeNull()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    input.dispatchEvent(fresh_key(`Enter`))
    await tick()

    expect(on_create).toHaveBeenCalledTimes(1)
    expect(on_create).toHaveBeenCalledWith({ option: `new async option` })
    // while the promise is pending: spinner visible, input busy, nothing added yet
    expect(doc_query(`.custom-spinner`).textContent).toBe(`creating`)
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)
    expect(props.value).toEqual([])
    expect(on_add).not.toHaveBeenCalled()

    resolve(undefined)
    await promise
    await tick()

    expect(document.querySelector(`.custom-spinner`)).toBeNull()
    expect(input.getAttribute(`aria-busy`)).toBeNull()
    expect(props.value).toEqual([`new async option`])
    expect(on_add).toHaveBeenCalledTimes(1)
    expect(on_add).toHaveBeenCalledWith({
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
      const { promise, resolve } = Promise.withResolvers<OncreateResult>()
      const on_add = vi.fn()
      const props = $state<MultiSelectProps>({
        options: [`foo`, `bar`],
        value: [],
        allow_user_options: true,
        on_create: () => promise,
        on_add,
      })
      mount_multiselect(props)

      await submit_create(`fresh-opt`)

      resolve(resolved_value)
      await promise
      await tick()

      expect(props.value).toEqual(expected_selected)
      expect(on_add).toHaveBeenCalledTimes(expected_onadd_calls)
      expect(console_error).not.toHaveBeenCalled()
    },
  )

  test(`non-native thenable on_create result is awaited, not added as an option`, async () => {
    const on_add = vi.fn()
    // custom thenable (e.g. from a non-native promise implementation): must be
    // awaited like a Promise instead of being treated as an option object
    const thenable = {
      // oxlint-disable-next-line unicorn/no-thenable -- deliberately testing thenable handling
      then: (resolve: (value: OncreateResult) => void) => resolve(`from-thenable`),
    }
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      value: [],
      allow_user_options: true,
      on_create: () => thenable as unknown as OncreateResult,
      on_add,
    })
    mount_multiselect(props)

    await submit_create(`typed-text`)
    await tick() // extra microtask hop for the thenable resolution

    expect(props.value).toEqual([`from-thenable`])
    expect(on_add).toHaveBeenCalledTimes(1)
  })

  test(`on_create throwing synchronously adds nothing and logs console.error`, async () => {
    const console_error = mock_console_error()
    const on_add = vi.fn()
    const sync_error = new Error(`validation blew up`)
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      value: [],
      allow_user_options: true,
      on_create: () => {
        throw sync_error
      },
      on_add,
    })
    mount_multiselect(props)

    await submit_create(`doomed-opt`)

    expect(props.value).toEqual([])
    expect(on_add).not.toHaveBeenCalled()
    expect(console_error).toHaveBeenCalledWith(
      `MultiSelect: on_create threw:`,
      sync_error,
    )
  })

  test(`rejecting adds nothing and logs console.error`, async () => {
    const console_error = mock_console_error()
    const { promise, reject } = Promise.withResolvers<OncreateResult>()
    const on_add = vi.fn()
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      value: [],
      allow_user_options: true,
      on_create: () => promise,
      on_add,
    })
    mount_multiselect(props)

    const input = await submit_create(`doomed-opt`)
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    const rejection = new Error(`backend validation failed`)
    reject(rejection)
    await promise.catch(() => {})
    await tick()

    expect(props.value).toEqual([])
    expect(on_add).not.toHaveBeenCalled()
    expect(console_error).toHaveBeenCalledTimes(1)
    expect(console_error).toHaveBeenCalledWith(
      `MultiSelect: on_create promise rejected:`,
      rejection,
    )
    // busy state must reset even on rejection
    expect(input.getAttribute(`aria-busy`)).toBeNull()
  })

  test(`double Enter while async create is pending adds only one option`, async () => {
    const { promise, resolve } = Promise.withResolvers<OncreateResult>()
    const on_create = vi.fn(() => promise)
    const props = $state<MultiSelectProps>({
      options: [`foo`],
      value: [],
      allow_user_options: true,
      on_create,
    })
    mount_multiselect(props)

    const input = await submit_create(`only-once`)
    input.dispatchEvent(fresh_key(`Enter`)) // second Enter while first create pending
    await tick()

    expect(on_create).toHaveBeenCalledTimes(1)

    resolve(undefined)
    await promise
    await tick()

    expect(props.value).toEqual([`only-once`])
  })

  test.each<[string, MultiSelectProps[`on_create`], Option[], Option[]?]>([
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
    `sync on_create regression: %s`,
    async (_label, on_create, expected_selected, selected = []) => {
      const props = $state<MultiSelectProps>({
        options: [`foo`],
        value: selected,
        allow_user_options: true,
        on_create,
      })
      mount_multiselect(props)

      await submit_create(`sync-opt`)

      expect(props.value).toEqual(expected_selected)
    },
  )
})
