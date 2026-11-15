import type { CmdAction } from './types'
import { DIACRITIC, DIACRITICS, splits_letter } from './internal/diacritics'

// replaceAll rebuilds the whole string, so skip it when there is nothing to normalize
const HAS_COLLAPSIBLE_WHITESPACE = /\s\s|[^\S ]/u
const HAS_NON_PLAIN_WHITESPACE = /[^\S ]/u

// Lowercase both; collapse runs in the search and map every target whitespace char to a
// space, which keeps target indices aligned with the lowercased target.
const fuzzy_fold = (search_text: string, target_text: string): [string, string] => {
  let search = search_text.toLowerCase()
  if (HAS_COLLAPSIBLE_WHITESPACE.test(search)) search = search.replaceAll(/\s+/gu, ` `)
  let target = target_text.toLowerCase()
  if (HAS_NON_PLAIN_WHITESPACE.test(target)) target = target.replaceAll(/\s/gu, ` `)
  return [search, target]
}

// Case-insensitive subsequence match: indices in target_text where search_text's chars
// appear in order, or null if any is missing. An empty search matches with no indices.
export function fuzzy_match_indices(
  search_text: string,
  target_text: string,
): number[] | null {
  const [search, target] = fuzzy_fold(search_text, target_text)
  let target_offsets: number[] | undefined
  if (target.length !== target_text.length) {
    target_offsets = []
    let source_offset = 0
    for (const character of target_text) {
      const normalized = character.toLowerCase()
      for (let unit_idx = 0; unit_idx < normalized.length; unit_idx++) {
        // keep UTF-16 indices for astral chars while folding extra case-folded units
        // (İ -> i + combining dot) back onto their one source unit
        target_offsets.push(source_offset + Math.min(unit_idx, character.length - 1))
      }
      source_offset += character.length
    }
  }

  // greedy leftmost match; pos only moves forward, so scanning stays linear
  const indices: number[] = []
  let pos = -1
  // Match whole code points, but return one source index per UTF-16 unit for rendering.
  for (const character of search) {
    pos = target.indexOf(character, pos + 1)
    if (pos === -1) return null
    for (let unit_idx = 0; unit_idx < character.length; unit_idx++)
      indices.push(target_offsets?.[pos + unit_idx] ?? pos + unit_idx)
    pos += character.length - 1
  }
  return indices
}

// True if search is a subsequence of target, e.g. "tageoo" matches "tasks/geo-opt"
export function fuzzy_match(search_text: string, target_text: string): boolean {
  // Filtering needs no source offsets or highlighted indices, even when case folding
  // expands a character. Only the rendering helper pays for those allocations.
  const [search, target] = fuzzy_fold(search_text, target_text)
  let offset = 0
  for (const character of search) {
    offset = target.indexOf(character, offset)
    if (offset === -1) return false
    offset += character.length
  }
  return true
}

export const format_cmd_metadata = (metadata: CmdAction[`metadata`]): string =>
  Array.isArray(metadata) ? metadata.join(` · `) : (metadata ?? ``)

const NON_ASCII = /\P{ASCII}/u
// lowercase with final sigma as medial
const fold_case = (text: string): string => text.toLowerCase().replaceAll(`ς`, `σ`)
// Both forms compare composed (NFC), so a decomposed mark can neither come from another
// letter nor let か match the start of が.
const strip_diacritics = (text: string): string =>
  text.normalize(`NFD`).replace(DIACRITICS, ``).normalize(`NFC`)

// Splits query into whitespace terms once; the returned predicate is true when every term
// occurs in text (as an ordered subsequence with fuzzy), ignoring case. Like search_text, a
// term without diacritics ignores them (`cafe` matches `café`) while an accented term
// requires them. A blank query matches everything. `split: false` keeps the query as one
// term, collapsing whitespace runs in query and text to single spaces (MultiSelect options).
export function create_term_matcher(
  query: string,
  { fuzzy = false, split = true }: { fuzzy?: boolean; split?: boolean } = {},
): (text: string) => boolean {
  const terms = (split ? query.trim().split(/\s+/) : [query.replaceAll(/\s+/g, ` `)])
    .filter(Boolean)
    .map((term) => {
      const folded = fold_case(term)
      const keep_marks = DIACRITIC.test(folded.normalize(`NFD`))
      const normalized = keep_marks ? folded.normalize(`NFC`) : strip_diacritics(folded)
      return { term: normalized, chars: Array.from(normalized), keep_marks }
    })
  // A hit may not stop before a mark NFC couldn't compose, which belongs to its letter
  // (क vs क़); fuzzy hits apply that to every matched char.
  const occurs = ({ term, chars }: (typeof terms)[number], text: string): boolean => {
    if (!fuzzy) {
      for (let idx = text.indexOf(term); idx >= 0; idx = text.indexOf(term, idx + 1))
        if (!splits_letter(text, idx + term.length)) return true
      return false
    }
    let offset = 0
    for (const [char_idx, char] of chars.entries()) {
      let position = text.indexOf(char, offset)
      while (
        position !== -1 &&
        splits_letter(text, position + char.length, chars[char_idx + 1])
      )
        position = text.indexOf(char, position + 1)
      if (position === -1) return false
      offset = position + char.length
    }
    return true
  }
  return (text) => {
    if (!split) text = text.replaceAll(/\s+/g, ` `)
    // ASCII has no case expansion or diacritics to fold
    if (!NON_ASCII.test(text)) {
      const lower = text.toLowerCase()
      return terms.every((term) => occurs(term, lower))
    }
    const folded = fold_case(text)
    let marked: string | undefined
    let plain: string | undefined
    return terms.every((term) =>
      occurs(
        term,
        term.keep_marks
          ? (marked ??= folded.normalize(`NFC`))
          : (plain ??= strip_diacritics(folded)),
      ),
    )
  }
}

// Prepare query terms once for a batch; action fields remain live between calls.
export function create_cmd_action_filter(
  search: string,
  fuzzy = true,
): (action: CmdAction) => boolean {
  const matches = create_term_matcher(search, { fuzzy })
  return (action) =>
    matches(
      [
        action.label,
        action.description,
        action.badge,
        action.group,
        action.shortcut,
        action.keywords?.join(` `),
        format_cmd_metadata(action.metadata),
      ]
        .filter(Boolean)
        .join(` `),
    )
}
