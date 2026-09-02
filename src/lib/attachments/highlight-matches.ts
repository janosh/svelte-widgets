import type { TextMutationOptions, TextSearchNodeFilter } from '../text-search'
import { create_burst_debounce, sync_owned_highlight } from '../text-search'
import { fuzzy_match_indices } from '../utils'

export type HighlightOptions = {
  query?: string
  disabled?: boolean
  fuzzy?: boolean
  node_filter?: TextSearchNodeFilter
  css_class?: string
  duration_ms?: number
  scroll_to_match?: false | ScrollIntoViewOptions
  on_highlight?: (context: { node: HTMLElement; ranges: Range[] }) => unknown
  // Re-run on subtree changes, so consumers need no observer of their own. `true` re-runs
  // on the mutation microtask, `false` freezes at what the DOM held on attach. An object
  // coalesces bursts (`debounce_ms` after the last mutation, at most `max_wait_ms` after
  // the burst's first), so a stream of appended log lines still refreshes steadily.
  observe_mutations?: boolean | TextMutationOptions
}

const HAS_NON_ASCII = /\P{ASCII}/u

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

  const search = query.trim().toLowerCase().replaceAll(/\s+/gu, ` `)
  if (!search || disabled) return undefined // this instance owns no highlight
  // both halves of the CSS Custom Highlight API: a registry without the constructor would
  // throw in sync_owned_highlight
  const highlight_registry =
    typeof globalThis.Highlight === `function` ? globalThis.CSS?.highlights : undefined
  const highlight_owner = Symbol(css_class)
  const substring_pattern = new RegExp(
    search.replaceAll(/[.*+?^${}()|[\]\\]/gu, `\\$&`).replaceAll(` `, `\\s+`),
    `gu`,
  )
  let is_attached = true
  let did_scroll = false
  let effect_cleanup: (() => void) | undefined
  let timeout: ReturnType<typeof setTimeout> | undefined

  const find_ranges = (text_node: Node): Range[] => {
    const original_text = text_node.textContent
    if (!original_text) return []
    const text = original_text.toLowerCase()

    // Offsets are computed on lowercased text but applied to the original node, and
    // lowercasing can grow chars (İ → i̇) while astral ones span two UTF-16 units. Map each
    // lowered unit to its whole original code point so ranges never shift or split a char.
    const node_length = original_text.length
    let original_starts: number[] | null = null
    let original_ends: number[] | null = null
    // skip for ASCII, which is never astral nor length-changing when lowercased
    const needs_offset_map =
      HAS_NON_ASCII.test(original_text) &&
      Array.from(original_text).some(
        (char) => char.length > 1 || char.toLowerCase().length !== char.length,
      )
    if (needs_offset_map) {
      original_starts = []
      original_ends = []
      let original_idx = 0
      for (const character of original_text) {
        const original_end = original_idx + character.length
        const lowered_length = character.toLowerCase().length
        original_starts.push(...Array<number>(lowered_length).fill(original_idx))
        original_ends.push(...Array<number>(lowered_length).fill(original_end))
        original_idx = original_end
      }
    }
    const make_range = (start: number, end: number): Range[] => {
      const original_start = original_starts
        ? (original_starts[start] ?? node_length)
        : start
      const original_end = original_ends ? (original_ends[end - 1] ?? node_length) : end
      if (original_start >= node_length) return []
      const range = node.ownerDocument.createRange()
      range.setStart(text_node, original_start)
      range.setEnd(text_node, Math.min(original_end, node_length))
      return [range]
    }

    if (fuzzy) {
      // null means not all characters matched, so highlight nothing
      const matching_indices = fuzzy_match_indices(search, text)
      const unique_ranges = new Map<string, Range>()
      for (const index of matching_indices ?? []) {
        const [range] = make_range(index, index + 1)
        if (range) unique_ranges.set(`${range.startOffset}:${range.endOffset}`, range)
      }
      return [...unique_ranges.values()]
    }
    return [...text.matchAll(substring_pattern)].flatMap((match) =>
      make_range(match.index, match.index + match[0].length),
    )
  }

  const update_highlight = () => {
    if (!is_attached) return
    observer.disconnect()
    try {
      const previous_cleanup = effect_cleanup
      effect_cleanup = undefined
      previous_cleanup?.()
      if (!is_attached) return
      const tree_walker = node.ownerDocument.createTreeWalker(
        node,
        NodeFilter.SHOW_TEXT,
        { acceptNode: node_filter },
      )
      const ranges: Range[] = []
      let text_node = tree_walker.nextNode()
      while (text_node) {
        ranges.push(...find_ranges(text_node))
        text_node = tree_walker.nextNode()
      }
      if (highlight_registry)
        sync_owned_highlight(highlight_registry, css_class, highlight_owner, ranges)
      const first_match = ranges[0]?.startContainer.parentElement
      if (!did_scroll && scroll_to_match && first_match) {
        did_scroll = true
        first_match.scrollIntoView(scroll_to_match)
      }
      const next_effect_cleanup = on_highlight?.({ node, ranges })
      effect_cleanup =
        typeof next_effect_cleanup === `function`
          ? () => next_effect_cleanup()
          : undefined
    } finally {
      if (is_attached && observe_mutations !== false)
        observer.observe(node, { childList: true, subtree: true, characterData: true })
    }
  }

  const debounce = typeof observe_mutations === `object` ? observe_mutations : undefined
  const { trigger, cancel } = create_burst_debounce(update_highlight, debounce)

  const observer = new MutationObserver(debounce ? trigger : update_highlight)
  const cleanup = () => {
    if (!is_attached) return
    is_attached = false
    if (timeout !== undefined) clearTimeout(timeout)
    cancel()
    observer.disconnect()
    const final_effect_cleanup = effect_cleanup
    effect_cleanup = undefined
    try {
      final_effect_cleanup?.()
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
  if (duration_ms !== undefined && Number.isFinite(duration_ms) && duration_ms >= 0) {
    timeout = setTimeout(cleanup, duration_ms)
  }

  return cleanup
}
