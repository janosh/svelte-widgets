import type { TextMutationOptions, TextSearchNodeFilter } from '../text-search'
import { create_burst_debounce, search_text, sync_owned_highlight } from '../text-search'
import { fuzzy_match_indices } from '../utils'

export type HighlightOptions = {
  query?: string
  disabled?: boolean
  fuzzy?: boolean
  node_filter?: TextSearchNodeFilter
  css_class?: string
  duration_ms?: number
  scroll_to_match?: false | ScrollIntoViewOptions
  // Runs after every highlight pass, also without the CSS Highlight API; a returned
  // function runs before the next pass and on cleanup
  on_highlight?: (context: { node: HTMLElement; ranges: Range[] }) => unknown
  // Re-run on subtree changes: `true` on the mutation microtask, `false` freezes what the
  // DOM held on attach, and an object coalesces bursts (`debounce_ms` after the last
  // mutation, at most `max_wait_ms` after the burst's first)
  observe_mutations?: boolean | TextMutationOptions
}

// Highlights query matches under node, by default re-running when its subtree changes.
export const highlight_matches = (ops: HighlightOptions) => (node: HTMLElement) => {
  const {
    query = ``,
    disabled = false,
    fuzzy = false,
    node_filter = () => NodeFilter.FILTER_ACCEPT,
    css_class = `highlight-match`,
    duration_ms,
    scroll_to_match = { behavior: `smooth`, block: `center` },
    on_highlight,
    observe_mutations = true,
  } = ops

  if (!query.trim() || disabled) return undefined // this instance owns no highlight
  const fuzzy_search = query.trim().toLowerCase().replaceAll(/\s+/gu, ` `)
  // both halves of the CSS Custom Highlight API: a registry without the constructor would
  // throw in sync_owned_highlight
  const highlight_registry =
    typeof globalThis.Highlight === `function` ? globalThis.CSS?.highlights : undefined
  const highlight_owner = Symbol(css_class)
  let did_scroll = false

  // One range per matched code point: fuzzy_match_indices returns source UTF-16 offsets, so
  // a low surrogate folds onto its pair and case-expanded chars (İ) collapse to one index
  const fuzzy_ranges = (text_node: Text): Range[] => {
    const text = text_node.data
    const starts = new Set<number>()
    for (const idx of fuzzy_match_indices(fuzzy_search, text) ?? []) {
      const code_unit = text.charCodeAt(idx)
      starts.add(code_unit >= 0xdc00 && code_unit <= 0xdfff ? idx - 1 : idx)
    }
    return Array.from(starts, (start) => {
      const range = node.ownerDocument.createRange()
      range.setStart(text_node, start)
      range.setEnd(text_node, start + ((text.codePointAt(start) ?? 0) > 0xffff ? 2 : 1))
      return range
    })
  }

  // Substring matches share search_text with FindBar, so they span inline markup
  // (`fo<b>o</b>`) and fold case, Unicode normalization and whitespace the same way
  const find_ranges = (): Range[] => {
    if (!fuzzy) return search_text(node, query, { node_filter }).map(({ range }) => range)
    const walker = node.ownerDocument.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
      acceptNode: node_filter,
    })
    const ranges: Range[] = []
    for (let text_node = walker.nextNode(); text_node; text_node = walker.nextNode())
      if (text_node instanceof Text) ranges.push(...fuzzy_ranges(text_node))
    return ranges
  }

  let is_attached = true
  let effect_cleanup: (() => void) | undefined
  // detach the effect cleanup before running it, so a cleanup that throws or re-enters
  // cleanup() never runs twice
  const run_effect_cleanup = () => {
    const previous = effect_cleanup
    effect_cleanup = undefined
    previous?.()
  }

  const update_highlight = () => {
    if (!is_attached) return
    // on_highlight may write to the DOM; observing its own writes would loop
    observer.disconnect()
    try {
      run_effect_cleanup()
      if (!is_attached) return
      const ranges = find_ranges()
      if (highlight_registry)
        sync_owned_highlight(highlight_registry, css_class, highlight_owner, ranges)
      const first_match = ranges[0]?.startContainer.parentElement
      if (!did_scroll && scroll_to_match && first_match) {
        did_scroll = true
        first_match.scrollIntoView(scroll_to_match)
      }
      const next_cleanup = on_highlight?.({ node, ranges })
      if (typeof next_cleanup === `function`) effect_cleanup = () => next_cleanup()
    } finally {
      if (is_attached && observe_mutations !== false)
        observer.observe(node, { childList: true, subtree: true, characterData: true })
    }
  }

  const debounce = typeof observe_mutations === `object` ? observe_mutations : undefined
  const { trigger, cancel } = create_burst_debounce(update_highlight, debounce)
  const observer = new MutationObserver(debounce ? trigger : update_highlight)
  let timeout: ReturnType<typeof setTimeout> | undefined
  const cleanup = () => {
    if (!is_attached) return
    is_attached = false
    clearTimeout(timeout)
    cancel()
    observer.disconnect()
    try {
      run_effect_cleanup()
    } finally {
      if (highlight_registry)
        sync_owned_highlight(highlight_registry, css_class, highlight_owner)
    }
  }
  try {
    update_highlight()
  } catch (error) {
    cleanup()
    throw error
  }
  if (duration_ms !== undefined && Number.isFinite(duration_ms) && duration_ms >= 0)
    timeout = setTimeout(cleanup, duration_ms)
  return cleanup
}
