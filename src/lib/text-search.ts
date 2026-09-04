// Find across DOM node boundaries by matching concatenated text within block elements.

// Block elements define match segments regardless of nested inline markup.
export const DEFAULT_SEGMENT_SELECTOR =
  `p, li, td, th, pre, blockquote, h1, h2, h3, h4, h5, h6, button, label, ` +
  `[role="row"], [role="cell"]`

// No visible text crosses line breaks or replaced elements.
const BREAK_SELECTOR = `br, hr, input, textarea, select, img, canvas, svg, video, audio, iframe`

// Inline wrappers do not split otherwise unsegmented text.
const INLINE_SELECTOR =
  `a, abbr, b, bdi, bdo, cite, code, data, del, dfn, em, i, ins, kbd, mark, q, ` +
  `ruby, s, samp, small, span, strong, sub, sup, time, u, var`

// Avoid layout-sensitive getComputedStyle checks; cheap hidden content is excluded,
// while hidden="until-found" stays searchable like native find-in-page.
const NON_RENDERED_SELECTOR = `script, style, noscript, [hidden]:not([hidden="until-found" i])`
const FORM_CONTROL_SELECTOR = `textarea, select`

// Return a NodeFilter constant to accept or reject a text node.
export type TextSearchNodeFilter = (node: Node) => number

export type TextSearchOptions = {
  // Ordered subsequences highlight their shortest greedy span.
  fuzzy?: boolean
  node_filter?: TextSearchNodeFilter
  segment_selector?: string
}

// One hit: its range and containing block element.
export type TextMatch = { element: Element; range: Range }

type SegmentNode = { node: Text; start: number; end: number }
type TextSegment = { element: Element; nodes: SegmentNode[]; text: string }

const text_segments = (
  root: Element,
  node_filter: TextSearchNodeFilter,
  segment_selector: string,
): TextSegment[] => {
  if (root.closest(`${NON_RENDERED_SELECTOR}, ${FORM_CONTROL_SELECTOR}`)) return []
  const segments: TextSegment[] = []
  const break_selector = `${segment_selector}, ${BREAK_SELECTOR}`
  let segment: TextSegment | undefined

  const visit = (node: Node): void => {
    if (node instanceof Text) {
      // Svelte emits empty text anchors; they must not split segments.
      if (!node.data) return
      const parent = node.parentElement
      if (!parent || node_filter(node) !== NodeFilter.FILTER_ACCEPT) {
        segment = undefined
        return
      }
      const enclosing = parent.closest(segment_selector)
      let element: Element = parent
      if (enclosing && root.contains(enclosing)) element = enclosing
      else {
        // Climb inline wrappers so <div>fo<b>o</b></div> remains one segment.
        while (element !== root && element.matches(INLINE_SELECTOR)) {
          const next_element = element.parentElement
          if (!next_element) break
          element = next_element
        }
      }
      if (segment?.element !== element) {
        segment = { element, nodes: [], text: `` }
        segments.push(segment)
      }
      const start = segment.text.length
      segment.text += node.data
      segment.nodes.push({ node, start, end: segment.text.length })
      return
    }
    // Source text is invisible, but surrounding rendered text stays continuous.
    if (node instanceof Element && node.matches(NON_RENDERED_SELECTOR)) return
    const is_break =
      node !== root && node instanceof Element && node.matches(break_selector)
    if (is_break) segment = undefined
    if (!(node instanceof Element && node.matches(FORM_CONTROL_SELECTOR))) {
      for (const child of node.childNodes) visit(child)
    }
    if (is_break) segment = undefined
  }

  visit(root)
  return segments
}

type MatchBounds = { start: number; end: number }
type NormalizedText = { text: string; offsets: MatchBounds[] }

const WHITESPACE = /\s/u

// maps each normalized unit back to source bounds despite case/decomposition expansion,
// astral UTF-16 pairs and collapsed whitespace
type NormalizedToken = MatchBounds & { char: string }

const normalize_with_offsets = (source: string): NormalizedText => {
  let text = ``
  const offsets: MatchBounds[] = []
  let source_idx = 0
  let in_whitespace = false
  const tokens: NormalizedToken[] = []

  const flush_tokens = (): void => {
    if (tokens.length === 0) return
    const token_queues: Record<string, NormalizedToken[]> = {}
    const queue_offsets: Record<string, number> = {}
    for (const token of tokens) (token_queues[token.char] ??= []).push(token)
    const normalized = tokens
      .map((token) => token.char)
      .join(``)
      .normalize(`NFD`)
    for (const char of normalized) {
      const queue_offset = queue_offsets[char] ?? 0
      const token = token_queues[char][queue_offset]
      queue_offsets[char] = queue_offset + 1
      text += char
      offsets.push(token)
      if (char.length === 2) offsets.push(token)
    }
    tokens.length = 0
  }

  for (const char of source) {
    const next_idx = source_idx + char.length
    if (WHITESPACE.test(char)) {
      flush_tokens()
      // Collapse whitespace; trimmed queries cannot start or end inside the remainder.
      if (!in_whitespace) {
        text += ` `
        offsets.push({ start: source_idx, end: next_idx })
        in_whitespace = true
      }
    } else {
      in_whitespace = false
      // Readers treat final and medial sigma as equivalent.
      const normalized_char = char.toLowerCase().replaceAll(`ς`, `σ`).normalize(`NFD`)
      for (const normalized_code_point of normalized_char) {
        tokens.push({
          char: normalized_code_point,
          start: source_idx,
          end: next_idx,
        })
      }
    }
    source_idx = next_idx
  }
  flush_tokens()
  return { text, offsets }
}

// Binary-search cumulative node ends to avoid quadratic scans over tokenized blocks.
const node_reaching = (nodes: SegmentNode[], min_end: number): SegmentNode => {
  let [low, high] = [0, nodes.length - 1]
  while (low < high) {
    const mid = (low + high) >> 1
    if (nodes[mid].end >= min_end) high = mid
    else low = mid + 1
  }
  const found = nodes[low]
  // offsets come from the segment's own text, so they always land inside it
  if (!found || found.end < min_end) {
    throw new Error(`No text node reaches offset ${min_end} of ${nodes.at(-1)?.end}`)
  }
  return found
}

// start and end are offsets into the segment's concatenated text
const range_for_match = (
  { element, nodes }: TextSegment,
  start: number,
  end: number,
): Range => {
  // a match ending exactly on a node boundary stays in that node rather than
  // opening a zero-length tail in the next one
  const start_node = node_reaching(nodes, start + 1)
  const end_node = node_reaching(nodes, end)
  const range = element.ownerDocument.createRange()
  range.setStart(start_node.node, start - start_node.start)
  range.setEnd(end_node.node, end - end_node.start)
  return range
}

const match_bounds = (text: string, query: string, fuzzy: boolean): MatchBounds[] => {
  const matches: MatchBounds[] = []
  if (!fuzzy) {
    let match_idx = text.indexOf(query)
    while (match_idx >= 0) {
      const end = match_idx + query.length
      matches.push({ start: match_idx, end })
      match_idx = text.indexOf(query, end)
    }
    return matches
  }

  // Find compact, non-overlapping ordered subsequences. The forward pass discovers
  // the earliest end, then the backward pass tightens the start before scanning on.
  const query_chars = Array.from(query)
  let search_from = 0

  while (search_from < text.length) {
    let cursor = search_from
    for (const query_char of query_chars) {
      const position = text.indexOf(query_char, cursor)
      if (position === -1) return matches
      cursor = position + query_char.length
    }

    const end = cursor
    let start = end
    for (let char_idx = query_chars.length - 1; char_idx >= 0; char_idx--) {
      const query_char = query_chars[char_idx]
      start = text.lastIndexOf(query_char, start - query_char.length)
    }
    matches.push({ start, end })
    search_from = end
  }
  return matches
}

const source_bounds = (
  offsets: MatchBounds[],
  start: number,
  end: number,
): MatchBounds => {
  let source_start = offsets[start].start
  let source_end = offsets[start].end
  for (let offset_idx = start + 1; offset_idx < end; offset_idx++) {
    source_start = Math.min(source_start, offsets[offset_idx].start)
    source_end = Math.max(source_end, offsets[offset_idx].end)
  }
  return { start: source_start, end: source_end }
}

// `search_text` re-normalizes every segment per keystroke, char by char with a token per
// code point, though the result depends only on the segment's own text. Bounded memoization
// keeps typing off every word in the document; the result is read-only, so sharing is safe.
const NORMALIZE_CACHE_LIMIT = 512
const normalize_cache = new Map<string, NormalizedText>()
const normalize_cached = (source: string): NormalizedText => {
  const cached = normalize_cache.get(source)
  if (cached) {
    normalize_cache.delete(source) // reinsert to refresh its LRU position
    normalize_cache.set(source, cached)
    return cached
  }
  const normalized = normalize_with_offsets(source)
  normalize_cache.set(source, normalized)
  if (normalize_cache.size > NORMALIZE_CACHE_LIMIT) {
    const oldest = normalize_cache.keys().next().value
    if (oldest !== undefined) normalize_cache.delete(oldest)
  }
  return normalized
}

// every occurrence of query under root, case- and whitespace-insensitively
export const search_text = (
  root: Element,
  query: string,
  options: TextSearchOptions = {},
): TextMatch[] => {
  const {
    fuzzy = false,
    node_filter = () => NodeFilter.FILTER_ACCEPT,
    segment_selector = DEFAULT_SEGMENT_SELECTOR,
  } = options
  const normalized_query = normalize_with_offsets(query).text.trim()
  if (!normalized_query) return []

  const matches: TextMatch[] = []
  for (const segment of text_segments(root, node_filter, segment_selector)) {
    const { text, offsets } = normalize_cached(segment.text)
    for (const { start, end } of match_bounds(text, normalized_query, fuzzy)) {
      const source = source_bounds(offsets, start, end)
      matches.push({
        element: segment.element,
        range: range_for_match(segment, source.start, source.end),
      })
    }
  }
  return matches
}

export type HighlightRangesOptions = { css_class?: string; disabled?: boolean }

type OwnedHighlight = {
  owners: Map<symbol, readonly Range[]>
  previous?: Highlight
  installed?: Highlight
}

// Unions package-owned ranges by registry and name; releasing the last owner restores the
// previous highlight, and outside writers keep ownership.
const owned_highlights = new WeakMap<HighlightRegistry, Map<string, OwnedHighlight>>()

// Callers handle feature detection; a missing Highlight constructor throws.
export const sync_owned_highlight = (
  registry: HighlightRegistry,
  css_class: string,
  owner: symbol,
  ranges?: readonly Range[],
): void => {
  let classes = owned_highlights.get(registry)
  if (!classes) {
    if (!ranges) return
    classes = new Map()
    owned_highlights.set(registry, classes)
  }
  let highlight_entry = classes.get(css_class)
  if (!highlight_entry) {
    if (!ranges) return
    highlight_entry = { owners: new Map(), previous: registry.get(css_class) }
    classes.set(css_class, highlight_entry)
  }
  if (ranges) highlight_entry.owners.set(owner, ranges)
  else highlight_entry.owners.delete(owner)
  const current = registry.get(css_class)
  if (highlight_entry.owners.size === 0) {
    classes.delete(css_class)
    if (current !== highlight_entry.installed) return
    if (highlight_entry.previous) registry.set(css_class, highlight_entry.previous)
    else registry.delete(css_class)
    return
  }
  // yield to another writer, but reclaim a name merely cleared from the registry
  if (highlight_entry.installed && current && current !== highlight_entry.installed)
    return
  highlight_entry.installed = new Highlight(
    ...[...highlight_entry.owners.values()].flat(),
  )
  registry.set(css_class, highlight_entry.installed)
}

// Registers ranges and returns their release; same-name callers share the union. Returns
// undefined where CSS Custom Highlights are unavailable.
export const highlight_ranges = (
  ranges: readonly Range[],
  options: HighlightRangesOptions = {},
): (() => void) | undefined => {
  const { css_class = `text-search-match`, disabled = false } = options
  const registry = globalThis.CSS?.highlights
  if (disabled || !registry || typeof globalThis.Highlight !== `function`)
    return undefined
  const owner = Symbol(css_class)
  sync_owned_highlight(registry, css_class, owner, ranges)
  return () => sync_owned_highlight(registry, css_class, owner)
}

export type TextMutationOptions = {
  debounce_ms?: number
  // ceiling on how long a sustained burst can postpone the callback
  max_wait_ms?: number
}

// Fires debounce_ms after the last trigger but no later than max_wait_ms after the burst's
// first, so a never-pausing stream cannot defer the callback indefinitely.
export const create_burst_debounce = (
  callback: () => void,
  { debounce_ms = 75, max_wait_ms = debounce_ms * 4 }: TextMutationOptions = {},
) => {
  let timeout: ReturnType<typeof setTimeout> | undefined
  let burst_started_at: number | undefined

  // also resets the max-wait window for the next burst
  const cancel = (): void => {
    clearTimeout(timeout)
    timeout = undefined
    burst_started_at = undefined
  }
  const trigger = (): void => {
    const now_ms = Date.now()
    burst_started_at ??= now_ms
    clearTimeout(timeout)
    const remaining_max_wait = Math.max(0, max_wait_ms - (now_ms - burst_started_at))
    timeout = setTimeout(
      () => {
        cancel()
        callback()
      },
      Math.min(debounce_ms, remaining_max_wait),
    )
  }
  return { trigger, cancel }
}

// Call on_mutation after the DOM under root stops changing.
export const observe_text_mutations = (
  root: Node,
  on_mutation: () => void,
  options: TextMutationOptions = {},
): (() => void) => {
  const { trigger, cancel } = create_burst_debounce(on_mutation, options)
  const observer = new MutationObserver(trigger)
  observer.observe(root, { childList: true, characterData: true, subtree: true })

  return () => {
    observer.disconnect()
    cancel()
  }
}

export type SearchJumpOptions = {
  class_name?: string
  duration_ms?: number
  // runs when the flash ends, whether by timeout or an explicit clear()
  on_clear?: () => void
}

export type SearchJumpStartOptions = {
  scroll_target?: Element | null
  scroll?: false | ScrollIntoViewOptions
}

export type SearchJump = {
  start: (element: Element | null, options?: SearchJumpStartOptions) => void
  clear: () => void
}

// Scroll to a match and mark it temporarily for CSS animation.
export const create_search_jump = (options: SearchJumpOptions = {}): SearchJump => {
  const { class_name = `search-match-jump`, duration_ms = 2000, on_clear } = options
  let marked: Element | null = null
  let timeout: ReturnType<typeof setTimeout> | undefined

  const clear_visual = (): void => {
    clearTimeout(timeout)
    timeout = undefined
    marked?.classList.remove(class_name)
    marked = null
  }
  const clear = (): void => {
    clear_visual()
    on_clear?.()
  }
  const start = (element: Element | null, opts: SearchJumpStartOptions = {}): void => {
    const { scroll_target = element, scroll = { block: `center`, inline: `nearest` } } =
      opts
    clear_visual()
    marked = element
    if (element) {
      // reading layout between removing and re-adding the class restarts the CSS
      // animation when the same element is jumped to twice in a row
      element.classList.remove(class_name)
      element.getBoundingClientRect()
      element.classList.add(class_name)
    }
    if (scroll) scroll_target?.scrollIntoView(scroll)
    timeout = setTimeout(clear, duration_ms)
  }
  return { clear, start }
}
