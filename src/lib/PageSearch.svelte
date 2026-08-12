<script module lang="ts">
  import type {
    CmdAction,
    LoadOptionsParams,
    LoadOptionsResult,
    PageSearchNavigateDetails,
  } from './types'
  import { clamp_integer, slug_to_title } from './utils'

  type PagefindSubResult = { title: string; url: string; plain_excerpt: string }

  type PagefindResultData = {
    url: string
    plain_excerpt: string
    meta: Record<string, string>
    sub_results: PagefindSubResult[]
  }

  type PagefindResult = { id: string; data: () => Promise<PagefindResultData> }

  type PagefindApi = {
    search: (query: string) => Promise<{ results: PagefindResult[] } | null>
  }

  type PagefindSearchCache = {
    query: string
    results: Promise<PagefindResult[]>
    actions: CmdAction[]
    next_result_idx: number
  }

  type PagefindLoaderOptions = {
    load_pagefind?: () => Promise<PagefindApi>
    navigate?: (url: string, details: PageSearchNavigateDetails) => unknown
    pagefind_key?: string
    pagefind_path?: string
    transform_url?: (url: string) => string
  }

  const MAX_DESCRIPTION_LENGTH = 240

  const strip_html_extension = (url: string): string => {
    const suffix_start = url.search(/[?#]/)
    const [path, suffix] =
      suffix_start < 0 ? [url, ``] : [url.slice(0, suffix_start), url.slice(suffix_start)]
    return `${path.replace(/\/index\.html$/, `/`).replace(/\.html$/, ``)}${suffix}`
  }

  // fresh object per call: the returned array is assigned into MultiSelect's $state, and
  // a shared one would hand every instance the same (deeply proxied) array
  const no_results = (): LoadOptionsResult<CmdAction> => ({ options: [], hasMore: false })

  const decode_html_entities = (text: string): string => {
    const textarea = document.createElement(`textarea`)
    textarea.innerHTML = text
    return textarea.value
  }

  const page_title_from_url = (url: string): string => {
    const path = url
      .split(/[?#]/)[0]
      .replace(/(?:\/index)?\.html$/, ``)
      .replace(/\/+$/, ``)
    if (!path) return `Home`
    const final_segment = path.slice(path.lastIndexOf(`/`) + 1)
    return slug_to_title(decodeURIComponent(final_segment))
  }

  const pagefind_result_to_actions = (
    result_id: string,
    query: string,
    result: PagefindResultData,
    get_options: () => PagefindLoaderOptions,
  ): CmdAction[] => {
    const page_title = result.meta.title || page_title_from_url(result.url)
    const sections = result.sub_results.length ? result.sub_results : [undefined]

    return sections.map((section, section_idx) => {
      const source_url = section?.url ?? result.url
      const section_title = section?.title.trim()
      const label =
        section_title && section_title !== page_title
          ? `${page_title} › ${section_title}`
          : page_title
      const full_description = decode_html_entities(
        section?.plain_excerpt ?? result.plain_excerpt,
      )
        .replaceAll(/\s+/g, ` `)
        .trim()
      const description =
        full_description.length > MAX_DESCRIPTION_LENGTH
          ? `${full_description.slice(0, MAX_DESCRIPTION_LENGTH - 1).trimEnd()}…`
          : full_description

      const id = `pagefind:${result_id}:${section_idx}:${source_url}`
      const action = () => {
        const { navigate, transform_url } = get_options()
        const current_url = transform_url?.(source_url) ?? source_url
        if (navigate) void navigate(current_url, { query, label, description })
        else globalThis.location.assign(current_url)
      }
      return { id, label, description, action }
    })
  }

  const create_pagefind_loader = (get_options: () => PagefindLoaderOptions) => {
    let pagefind_api_promise: Promise<PagefindApi> | undefined
    let search_cache: PagefindSearchCache | undefined
    let previous_pagefind_source: string | undefined
    let pagefind_generation = 0

    return async ({
      search,
      offset,
      limit,
    }: LoadOptionsParams): Promise<LoadOptionsResult<CmdAction>> => {
      const {
        load_pagefind,
        pagefind_key = ``,
        pagefind_path = `/pagefind/pagefind.js`,
      } = get_options()
      // Key the cache on the source, not on closure identity: an inline load_pagefind
      // arrow gets a fresh identity every render, and treating that as a source change
      // would re-import pagefind and re-run the search on each keystroke. Callers that
      // swap between custom loaders over different indexes distinguish them with
      // pagefind_key, since their identity alone can't tell one index from another.
      const pagefind_source = load_pagefind
        ? `custom-loader:${pagefind_key}`
        : pagefind_path
      if (pagefind_source !== previous_pagefind_source) {
        pagefind_api_promise = undefined
        search_cache = undefined
        previous_pagefind_source = pagefind_source
        pagefind_generation++
      }
      const generation = pagefind_generation
      const load_api =
        load_pagefind ??
        (async () => (await import(/* @vite-ignore */ pagefind_path)) as PagefindApi)
      const query = search.trim()
      // fallback_actions are handed to CommandMenu as static options, which match them
      // locally without waiting on Pagefind, so this loader only returns index hits
      if (!query) return no_results()
      try {
        if (offset === 0 || search_cache?.query !== query) {
          search_cache = {
            query,
            results: (async () => {
              const pagefind_api = await (pagefind_api_promise ??= load_api())
              return (await pagefind_api.search(query))?.results ?? []
            })(),
            actions: [],
            next_result_idx: 0,
          }
        }
        const cache = search_cache
        const page_results = await cache.results
        if (page_results.length === 0) return no_results()
        const target_count = offset + limit

        while (
          cache.actions.length < target_count &&
          cache.next_result_idx < page_results.length
        ) {
          const result_batch = page_results.slice(
            cache.next_result_idx,
            cache.next_result_idx + limit,
          )
          cache.next_result_idx += result_batch.length
          const settled_results = await Promise.allSettled(
            result_batch.map(async (result) =>
              pagefind_result_to_actions(
                result.id,
                query,
                await result.data(),
                get_options,
              ),
            ),
          )
          for (const result of settled_results) {
            if (result.status === `fulfilled`) cache.actions.push(...result.value)
          }
        }
        if (cache.actions.length === 0) return no_results()

        return {
          options: cache.actions.slice(offset, target_count),
          hasMore:
            cache.actions.length > target_count ||
            cache.next_result_idx < page_results.length,
        }
      } catch {
        // only retire our own loader promise: the source may have switched while this
        // request was in flight, and the newer one has already installed its own
        if (generation === pagefind_generation) pagefind_api_promise = undefined
        return no_results()
      }
    }
  }
</script>

<script lang="ts">
  import type { ComponentProps } from 'svelte'
  import CommandMenu from './CommandMenu.svelte'

  type Props = Omit<
    ComponentProps<typeof CommandMenu>,
    | `actions`
    | `dialog`
    | `input`
    | `loadOptions`
    | `max_recent`
    | `open`
    | `recent_actions_key`
  > &
    PagefindLoaderOptions & {
      batch_size?: number
      debounce_ms?: number
      dialog?: HTMLDialogElement | null
      // matched locally, so these stay searchable while the Pagefind index loads
      fallback_actions?: CmdAction[]
      input?: HTMLInputElement | null
      open?: boolean
      strip_html_suffix?: boolean
    }

  let {
    fallback_actions = [],
    load_pagefind,
    navigate,
    pagefind_key,
    pagefind_path,
    transform_url,
    strip_html_suffix = false,
    batch_size = 12,
    debounce_ms = 120,
    fuzzy = false,
    open = $bindable(false),
    dialog = $bindable(null),
    input = $bindable(null),
    ...rest
  }: Props = $props()

  const load_options = create_pagefind_loader(() => ({
    load_pagefind,
    navigate,
    pagefind_key,
    pagefind_path,
    transform_url: (url) => {
      const normalized_url = strip_html_suffix ? strip_html_extension(url) : url
      return transform_url?.(normalized_url) ?? normalized_url
    },
  }))
</script>

<CommandMenu
  actions={fallback_actions}
  bind:open
  bind:dialog
  bind:input
  {fuzzy}
  aria_label="Site search"
  loadOptions={{
    fetch: load_options,
    debounceMs: debounce_ms,
    batchSize: clamp_integer(batch_size, 1, Infinity, 12),
  }}
  placeholder="Search every page..."
  noMatchingOptionsMsg="No matching pages"
  {...rest}
/>
