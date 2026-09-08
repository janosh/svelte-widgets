import type {
  CmdAction,
  LoadOptionsParams,
  LoadOptionsResult,
  PageSearchNavigateDetails,
} from './types'
import { slug_to_title } from './utils'

type PagefindSubResult = { title: string; url: string; plain_excerpt: string }

type PagefindResultData = {
  url: string
  plain_excerpt: string
  meta: Record<string, string>
  sub_results: PagefindSubResult[]
}

type PagefindResult = { id: string; data: () => Promise<PagefindResultData> }
type PagefindPage = { result: PagefindResult; actions?: CmdAction[] }

type PagefindApi = {
  search: (query: string) => Promise<{ results: PagefindResult[] } | null>
}

type PagefindSearchCache = {
  query: string
  results: Promise<PagefindPage[]>
  next_result_idx: number
  error?: Error
}

export type PagefindLoaderOptions = {
  load_pagefind?: () => Promise<PagefindApi>
  navigate?: (url: string, details: PageSearchNavigateDetails) => unknown
  pagefind_key?: string
  pagefind_path?: string
  transform_url?: (url: string) => string
}

const MAX_DESCRIPTION_LENGTH = 240

export const strip_html_extension = (url: string): string => {
  const suffix_start = url.search(/[?#]/)
  const [path, suffix] =
    suffix_start < 0 ? [url, ``] : [url.slice(0, suffix_start), url.slice(suffix_start)]
  return `${path.replace(/\/index\.html$/, `/`).replace(/\.html$/, ``)}${suffix}`
}

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

const load_pagefind_actions = async (
  page: PagefindPage,
  query: string,
  get_options: () => PagefindLoaderOptions,
): Promise<CmdAction[]> => {
  if (page.actions) return page.actions
  const result = await page.result.data()
  const page_title = result.meta.title || page_title_from_url(result.url)
  const sections = result.sub_results.length ? result.sub_results : [undefined]

  page.actions = sections.map((section, section_idx) => {
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

    const id = `pagefind:${page.result.id}:${section_idx}:${source_url}`
    const action = () => {
      const { navigate, transform_url } = get_options()
      const current_url = transform_url?.(source_url) ?? source_url
      if (navigate) void navigate(current_url, { query, label, description })
      else globalThis.location.assign(current_url)
    }
    return { id, label, description, action }
  })
  return page.actions
}

export const create_pagefind_loader = (
  pagefind_source: string,
  get_options: () => PagefindLoaderOptions,
) => {
  let pagefind_api_promise: Promise<PagefindApi> | undefined
  let search_cache: PagefindSearchCache | undefined

  return async ({
    search,
    offset,
    limit,
  }: LoadOptionsParams): Promise<LoadOptionsResult<CmdAction>> => {
    const { load_pagefind } = get_options()
    const load_api =
      load_pagefind ??
      (async () => (await import(/* @vite-ignore */ pagefind_source)) as PagefindApi)
    const query = search.trim()
    // fallback_actions are handed to CommandMenu as static options, which match them
    // locally without waiting on Pagefind, so this loader only returns index hits
    if (!query) return { options: [], hasMore: false }
    try {
      if ((offset === 0 && !search_cache?.error) || search_cache?.query !== query) {
        search_cache = {
          query,
          results: (pagefind_api_promise ??= load_api())
            .then((api) => api.search(query))
            .then((response) => (response?.results ?? []).map((result) => ({ result }))),
          next_result_idx: 0,
        }
      }
      const cache = search_cache
      const page_results = await cache.results
      const target_count = offset + limit
      const recovering = cache.error
      let actions = page_results.flatMap((page) => page.actions ?? [])

      while (
        (cache.error || actions.length < target_count) &&
        cache.next_result_idx < page_results.length
      ) {
        const result_batch = page_results.slice(
          cache.next_result_idx,
          cache.next_result_idx + limit,
        )
        const settled_results = await Promise.allSettled(
          result_batch.map((page) => load_pagefind_actions(page, query, get_options)),
        )
        actions = page_results.flatMap((page) => page.actions ?? [])
        const failure = settled_results.find((result) => result.status === `rejected`)
        // Publish successes now; retry fills their gaps without downloading them again.
        cache.error =
          failure &&
          (failure.reason instanceof Error
            ? failure.reason
            : new Error(String(failure.reason)))
        if (cache.error) break
        cache.next_result_idx += result_batch.length
      }
      // Keep visible successes on screen even when recovered sections precede them.
      const options = cache.error || recovering ? actions : actions.slice(0, target_count)
      return {
        options,
        replace: true,
        error: cache.error,
        hasMore:
          actions.length > options.length || cache.next_result_idx < page_results.length,
      }
    } catch (error) {
      if (!search_cache?.error) pagefind_api_promise = undefined
      throw error
    }
  }
}
