// Reactive query, matches, cursor, highlights, and mutation observer. Call refresh and
// observe from separate effects so query updates do not restart observation.

import { untrack } from 'svelte'
import { merge_labels, FIND_BAR_LABELS, type FindBarLabels } from './labels'
import {
  create_search_jump,
  highlight_ranges,
  observe_text_mutations,
  search_text,
  type TextMatch,
} from './text-search'

// Skip invisible UI; search_text already excludes source, hidden content, and controls.
const IGNORED_SELECTOR = `[aria-hidden="true"], .sr-only`

export type FindOptions = {
  // Restrict matches to selected regions.
  only_within?: string
  // Further selectors to exclude, on top of the defaults rather than instead of them.
  also_ignore?: string
  // Runs before search; hide non-matches here because search_text skips [hidden].
  before_search?: (query: string) => void
  // Only `no_matches` and `match_position` are read here — the rest name FindBar's chrome.
  // Sharing one record lets FindBar hand its merged labels straight through.
  labels?: Partial<FindBarLabels>
}

// Getter keeps caller props live rather than freezing a creation-time snapshot.
export const create_find_state = (get_options: () => FindOptions = () => ({})) => {
  const make_node_filter = () => {
    const { only_within, also_ignore } = get_options()
    const selector = also_ignore
      ? `${IGNORED_SELECTOR}, ${also_ignore}`
      : IGNORED_SELECTOR
    return (node: Node): number => {
      const parent = node.parentElement
      if (only_within && !parent?.closest(only_within)) return NodeFilter.FILTER_REJECT
      return parent?.closest(selector)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    }
  }

  let query = $state(``)
  let occurrences = $state<TextMatch[]>([])
  let current_idx = $state(-1)
  let release: (() => void) | undefined
  const jump = create_search_jump()

  // Wraps at both ends, for any idx: `% length` alone goes negative below -length
  const jump_to = (idx: number): void => {
    const count = occurrences.length
    if (count === 0) return
    current_idx = ((idx % count) + count) % count
    const match = occurrences[current_idx]?.element
    // Open collapsed <details> ancestors so the match can scroll into view.
    let collapsed = match?.closest<HTMLDetailsElement>(`details:not([open])`) ?? null
    while (collapsed) {
      collapsed.open = true
      collapsed =
        collapsed.parentElement?.closest<HTMLDetailsElement>(`details:not([open])`) ??
        null
    }
    jump.start(match ?? null)
  }

  // Without a cursor, forward starts first and backward wraps to last.
  const step = (direction: -1 | 1): void =>
    jump_to(current_idx < 0 && direction < 0 ? -1 : current_idx + direction)

  // Pass root per call so late-mounted/swapped containers are never searched stale.
  const refresh = (root?: Element | null): void => {
    const { before_search } = get_options()
    before_search?.(query.trim())
    // Preserve cursor by element and ordinal because ranges are rebuilt.
    const [previous, previous_idx, ordinal_within_element] = untrack(() => {
      const current = occurrences[current_idx]
      const ordinal = current
        ? occurrences
            .slice(0, current_idx)
            .filter((hit) => hit.element === current.element).length
        : 0
      return [current, current_idx, ordinal] as const
    })
    const next_occurrences = root
      ? search_text(root, query, { node_filter: make_node_filter() })
      : []
    occurrences = next_occurrences
    // Keep the same hit across re-search when it survives.
    const same_element = next_occurrences.flatMap((hit, hit_idx) =>
      previous && hit.element === previous.element ? [hit_idx] : [],
    )
    const preserved_idx =
      same_element[Math.min(ordinal_within_element, same_element.length - 1)]
    current_idx = preserved_idx ?? Math.min(previous_idx, next_occurrences.length - 1)
    release?.()
    release = highlight_ranges(
      next_occurrences.map((hit) => hit.range),
      {
        css_class: `find-match`,
        disabled: !root,
      },
    )
  }

  // Re-search after DOM mutations settle; returns an effect teardown.
  const observe = (root: Element): (() => void) => {
    const stop = observe_text_mutations(root, () => {
      if (!query.trim()) return
      const had_matches = occurrences.length > 0
      refresh(root)
      // Select the first hit after an empty result.
      if (!had_matches && occurrences.length > 0) jump_to(0)
    })
    return () => {
      stop()
      jump.clear()
    }
  }

  return {
    get query(): string {
      return query
    },
    // A new query invalidates the old cursor.
    set query(next: string) {
      jump.clear()
      query = next
      current_idx = -1
    },
    // Elements aligned with occurrences, repeated per hit.
    get matches(): readonly Element[] {
      return occurrences.map((hit) => hit.element)
    },
    // Empty while idle so aria-live stays quiet.
    get status(): string {
      if (!query.trim()) return ``
      const msg = merge_labels(FIND_BAR_LABELS, get_options().labels)
      if (occurrences.length === 0) return msg.no_matches
      return msg.match_position(Math.max(0, current_idx) + 1, occurrences.length)
    },
    jump_to,
    step,
    refresh,
    observe,
    // Drop this owner's ranges from the shared registry.
    release_highlight: (): void => {
      release?.()
      release = undefined
    },
  }
}

export type FindState = ReturnType<typeof create_find_state>
