import { tick, untrack } from 'svelte'
import type { LoadOptions, LoadOptionsConfig, Option, OptionListProps } from '../types'

// Owns cancellation, pagination, retry and query scheduling for option-based controls.
export function create_option_loader<T extends Option>(get: {
  config: () => LoadOptions<T> | undefined
  query: () => string
  open: () => boolean
  element: () => HTMLElement | undefined
  search_text: () => string
  matching_options: () => T[]
  on_search: () => OptionListProps<T>[`on_search`]
}) {
  // Notify only after a change, using the latest matches/callback when the timer fires.
  let search_initialized = false
  $effect(() => {
    const search_text = get.search_text()
    if (!search_initialized) {
      search_initialized = true
      return undefined
    }
    if (!get.on_search()) return undefined
    const timer = setTimeout(
      () => get.on_search()?.({ search_text, matching_options: get.matching_options() }),
      150,
    )
    return () => clearTimeout(timer)
  })
  const load_options = $derived(get.config())
  const effective_filter_text = $derived(get.query())
  const open = $derived(get.open())
  const options_list_el = $derived(get.element())
  // normalizes the function-or-config-object prop into one shape
  const load_options_config = $derived.by(() => {
    if (!load_options) return null
    const load_config: LoadOptionsConfig<T> =
      typeof load_options === `function` ? { fetch: load_options } : load_options
    return {
      fetch: load_config.fetch,
      debounce_ms: load_config.debounce_ms ?? 300,
      batch_size: load_config.batch_size ?? 50,
      should_fetch_on_open: load_config.on_open ?? true,
    }
  })

  const loader = $state({
    options: [] as T[],
    has_more: true,
    loading: false,
    last_search: null as string | null, // null = nothing dispatched yet
    error: null as Error | null,
    get config() {
      return load_options_config
    },
    load: load_dynamic_options,
    on_scroll: handle_options_scroll,
  })
  let load_request_id = 0 // monotonic counter to invalidate stale in-flight fetches
  let load_abort_controller: AbortController | null = null
  let previous_load_options_fetch: LoadOptionsConfig<T>[`fetch`] | null = null
  let auto_fill_count = 0
  const MAX_AUTO_FILL_ROUNDS = 20

  function cancel_in_flight_load() {
    load_request_id++
    load_abort_controller?.abort()
    loader.loading = false
  }

  // captures `search` at call time. reset=true bypasses the loading mutex so a new search
  // can start mid-flight; request_id discards the stale result and the old fetch is aborted.
  async function load_dynamic_options(reset: boolean) {
    if (
      !load_options_config ||
      // paginating from nothing repeats the first page and hands out offset 0, which the
      // documented cursor pattern reads as "reset"
      (!reset &&
        (loader.loading || (!loader.has_more && !loader.error) || !loader.options.length))
    )
      return
    if (reset) {
      auto_fill_count = 0
      load_abort_controller?.abort()
    }
    const search = effective_filter_text
    const offset = reset ? 0 : loader.options.length
    const request_id = ++load_request_id
    const abort_controller = new AbortController()
    load_abort_controller = abort_controller
    loader.last_search = search
    loader.loading = true
    loader.error = null
    let batch_length = 0
    try {
      const result = await load_options_config.fetch({
        search,
        offset,
        limit: load_options_config.batch_size,
        signal: abort_controller.signal,
      })
      if (request_id !== load_request_id) return // stale request, discard
      batch_length = result.options.length - (result.replace ? offset : 0)
      loader.options =
        reset || result.replace ? result.options : [...loader.options, ...result.options]
      loader.has_more = result.has_more
      loader.error = result.error ?? null
    } catch (error) {
      // a consumer forwarding `signal` rejects with a self-inflicted AbortError on cancel,
      // but one ignoring `signal` still reports real failures — so swallow aborts only
      if (abort_controller.signal.aborted && (error as Error)?.name === `AbortError`) {
        return
      }
      console.error(`OptionList: load_options error:`, error)
      // a superseded request must not clobber the live request's state
      if (request_id === load_request_id) {
        loader.error = error instanceof Error ? error : new Error(String(error))
      }
    } finally {
      // only the active request may clear loading; a newer reset may have started meanwhile
      if (request_id === load_request_id) {
        loader.loading = false
        if (load_abort_controller === abort_controller) load_abort_controller = null
      }
    }
    // auto-fill: a batch that doesn't overflow the dropdown yields no scrollbar, so onscroll
    // can never fire — keep loading until scrollable or done. An empty batch stops it, since
    // the next request would be identical (and it keeps offset=0 meaning "reset").
    if (
      request_id !== load_request_id ||
      batch_length <= 0 ||
      loader.error ||
      !loader.has_more ||
      !open ||
      !options_list_el ||
      auto_fill_count >= MAX_AUTO_FILL_ROUNDS
    )
      return
    await tick()
    if (
      request_id !== load_request_id ||
      !open ||
      !options_list_el ||
      options_list_el.clientHeight <= 0 ||
      options_list_el.scrollHeight > options_list_el.clientHeight
    )
      return
    auto_fill_count++
    void load_dynamic_options(false)
  }

  // Single effect handles initial load + search changes.
  $effect(() => {
    const config = load_options_config
    if (!config) {
      loader.error = null
      cancel_in_flight_load()
      previous_load_options_fetch = null
      return undefined
    }
    const fetch_changed = config.fetch !== previous_load_options_fetch
    previous_load_options_fetch = config.fetch

    const clear_loaded_batch = () => {
      loader.options = []
      loader.has_more = true
      loader.error = null
    }
    // Reset when closed or when the loader changes under the current query.
    if (!open || fetch_changed) {
      cancel_in_flight_load()
      loader.last_search = null
      clear_loaded_batch()
    }
    if (!open) return undefined

    const search = effective_filter_text
    // first load = nothing dispatched yet for this open (none completed, none in flight).
    // untrack the loading flag, else its synchronous set re-triggers this effect and
    // keystrokes during the first fetch fire immediate loads instead of debouncing.
    const is_first_load = loader.last_search === null && !untrack(() => loader.loading)
    if (is_first_load && config.should_fetch_on_open) {
      void load_dynamic_options(true)
      return undefined
    }
    // Returning to a cleared query still needs a fetch; unchanged results/errors wait
    // for explicit retry. Don't subscribe to completion and rerun the scheduling effect.
    const unchanged_search =
      search === loader.last_search &&
      untrack(
        () =>
          loader.loading || loader.options.length > 0 || !loader.has_more || loader.error,
      )
    if (is_first_load ? !search : unchanged_search) return undefined
    if (!is_first_load) {
      // abort the superseded fetch and clear stale results now, then debounce the new search
      cancel_in_flight_load()
      clear_loaded_batch()
    }
    const debounce_timer = setTimeout(
      () => void load_dynamic_options(true),
      config.debounce_ms,
    )
    return () => clearTimeout(debounce_timer)
  })
  // abort on unmount so callers forwarding `signal` can bail
  $effect(() => () => cancel_in_flight_load())

  function handle_options_scroll(event: Event) {
    if (!(event.target instanceof HTMLElement)) return
    const { scrollTop, scrollHeight, clientHeight } = event.target
    if (!load_options_config || loader.loading || loader.error || !loader.has_more) return
    auto_fill_count = 0
    if (scrollHeight - scrollTop - clientHeight <= 100) void load_dynamic_options(false)
  }
  return loader
}
