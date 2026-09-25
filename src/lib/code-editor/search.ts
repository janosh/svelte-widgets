import type { EditorModel, TextEdit } from './types'

export type EditorSearchOptions = { case_sensitive?: boolean; whole_word?: boolean }
export type EditorMatch = Pick<TextEdit, `from` | `to`>
// Restricts a scan to matches starting in [from, to), as if scanning began at `from`.
export type EditorSearchRange = { from?: number; to?: number }
type SearchModel = Pick<EditorModel, `slice` | `length`>

// Literal, non-overlapping UTF-16 ranges, including matches across lines and rope chunks.
// Yield lazily from bounded windows so callers can stop without scanning the full model.
export function* iterate_editor_matches(
  model: SearchModel,
  query: string,
  { case_sensitive = false, whole_word = false }: EditorSearchOptions = {},
  range: EditorSearchRange = {},
): Generator<EditorMatch, void, unknown> {
  query = query.replaceAll(/\r\n?/g, `\n`)
  if (!query) return
  const window_size = 32 * 1024
  const limit = Math.min(model.length, range.to ?? model.length)
  let start = Math.max(0, range.from ?? 0)
  // Never begin inside a surrogate pair; a match found from its high half starts earlier.
  if (start > 0 && (model.slice(start - 1, start + 1).codePointAt(0) ?? 0) > 0xffff)
    start -= 1
  // Native literal matching skips quickly over large documents for ordinary queries.
  // Bound the expression size; long queries use the linear matcher below.
  if (query.length <= 1024) {
    const word_char = `[\\p{L}\\p{M}\\p{N}_$]`
    const literal = query.replaceAll(/[.*+?^${}()|[\]\\]/g, `\\$&`)
    const pattern = new RegExp(
      whole_word ? `(?<!${word_char})${literal}(?!${word_char})` : literal,
      case_sensitive ? `gu` : `giu`,
    )
    let cursor = start
    while (cursor < limit) {
      const boundary = Math.min(limit, cursor + window_size)
      const window_from = Math.max(0, cursor - 2)
      const text = model.slice(
        window_from,
        Math.min(model.length, boundary + query.length + 2),
      )
      pattern.lastIndex = cursor - window_from
      let next_cursor = boundary
      let match: RegExpExecArray | null
      while ((match = pattern.exec(text))) {
        const from = window_from + match.index
        if (from >= boundary) break
        // A Unicode expression may back up into a pair split at the window boundary.
        if (from < cursor) continue
        const to = window_from + pattern.lastIndex
        yield { from, to }
        next_cursor = Math.max(next_cursor, to)
      }
      cursor = next_cursor
    }
    return
  }
  const characters = Array.from(query)
  const patterns = new Map<string, RegExp>()
  const equal = (left: string, right: string): boolean => {
    if (left === right) return true
    if (case_sensitive) return false
    let pattern = patterns.get(left)
    if (!pattern) {
      // Let the engine perform Unicode simple folding, including sigma and long s.
      const literal = left.replaceAll(/[.*+?^${}()|[\]\\]/g, `\\$&`)
      pattern = new RegExp(`^${literal}$`, `iu`)
      patterns.set(left, pattern)
    }
    return pattern.test(right)
  }
  // KMP retains the matching suffix after a mismatch instead of rescanning a long
  // repeated prefix at every position. Both preprocessing and scanning are linear.
  const prefixes = new Uint32Array(characters.length)
  let matched = 0
  for (let idx = 1; idx < characters.length; idx++) {
    while (matched > 0 && !equal(characters[matched], characters[idx]))
      matched = prefixes[matched - 1]
    if (equal(characters[matched], characters[idx])) matched += 1
    prefixes[idx] = matched
  }
  const starts = new Float64Array(characters.length)
  const preceding_words = new Uint8Array(whole_word ? characters.length : 0)
  const word_char = /^[\p{L}\p{M}\p{N}_$]/u
  // A match can start before `limit` and end up to one query length after it.
  const scan_end = Math.min(model.length, limit + query.length)
  // Seed the word check with the code point before a mid-document start.
  const preceding = Array.from(
    start > 0 ? model.slice(Math.max(0, start - 2), start) : ``,
  )
  let previous_word = whole_word && word_char.test(preceding.at(-1) ?? ``)
  matched = 0
  let character_idx = 0
  let cursor = start
  while (cursor < scan_end) {
    const boundary = Math.min(scan_end, cursor + window_size)
    const window_from = cursor
    // Complete a split surrogate pair and retain the following code point for word checks.
    const text = model.slice(cursor, Math.min(model.length, boundary + 3))
    for (const character of text) {
      if (cursor >= boundary) break
      const ring_idx = character_idx % characters.length
      starts[ring_idx] = cursor
      if (whole_word) {
        preceding_words[ring_idx] = Number(previous_word)
        previous_word = word_char.test(character)
      }
      cursor += character.length
      character_idx += 1
      while (matched > 0 && !equal(characters[matched], character))
        matched = prefixes[matched - 1]
      if (equal(characters[matched], character)) matched += 1
      if (matched !== characters.length) continue
      const start_idx = (character_idx - characters.length) % characters.length
      const from = starts[start_idx]
      if (from >= limit) return
      if (
        whole_word &&
        (preceding_words[start_idx] ||
          word_char.test(text.slice(cursor - window_from, cursor - window_from + 2)))
      ) {
        matched = prefixes[matched - 1]
      } else {
        yield { from, to: cursor }
        matched = 0
      }
    }
  }
}

// The public collecting helper remains exhaustive; only the editor UI caps its results.
export const find_editor_matches = (
  model: SearchModel,
  query: string,
  options?: EditorSearchOptions,
): EditorMatch[] => Array.from(iterate_editor_matches(model, query, options))

// First index whose match satisfies `after`, for sorted non-overlapping matches.
const first_index = (
  matches: readonly EditorMatch[],
  after: (match: EditorMatch) => boolean,
): number => {
  let low = 0
  let high = matches.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (after(matches[middle])) high = middle
    else low = middle + 1
  }
  return low
}

// Matches of the model after `edits` (sequential, as in EditorTransaction), given the
// matches of the text before them. Rescans only the edits' reach and reuses the shifted
// matches beyond it; only a match newly straddling that reach (repetitive text) scans on
// until both match lists agree again.
export const update_editor_matches = (
  model: SearchModel,
  query: string,
  matches: readonly EditorMatch[],
  edits: readonly TextEdit[],
  options?: EditorSearchOptions,
): EditorMatch[] => {
  const [first, last] = [edits[0], edits.at(-1)]
  if (!first || !last) return [...matches]
  // Literal matches keep the query's length; lookaround peeks two code units further.
  const reach = query.replaceAll(/\r\n?/g, `\n`).length + 2
  let delta = 0
  for (const { from, to, insert } of edits) delta += insert.length - (to - from)
  const edit_end = last.from + last.insert.length
  const window_from = Math.max(0, first.from - reach)
  const resync = Math.min(model.length, edit_end + reach)
  const kept_count = first_index(matches, ({ to }) => to > window_from)
  // A match straddling the window was the old scan's cursor there; restart at its start.
  const scan_from = Math.min(window_from, matches[kept_count]?.from ?? window_from)
  const result = matches.slice(0, kept_count)
  for (const match of iterate_editor_matches(model, query, options, {
    from: scan_from,
    to: resync,
  }))
    result.push(match)
  const shifted = matches
    .slice(first_index(matches, ({ from }) => from >= edit_end - delta))
    .map(({ from, to }) => ({ from: from + delta, to: to + delta }))
  let tail_idx = first_index(shifted, ({ from }) => from >= resync)
  // Both scans resume identically past `resync` once their cursors coincide there.
  const cursor_after = (list: readonly EditorMatch[], end: number): number =>
    Math.max(resync, end > 0 ? list[end - 1].to : 0)
  const new_cursor = cursor_after(result, result.length)
  if (new_cursor === cursor_after(shifted, tail_idx))
    return result.concat(shifted.slice(tail_idx))
  for (const match of iterate_editor_matches(model, query, options, {
    from: new_cursor,
  })) {
    while (tail_idx < shifted.length && shifted[tail_idx].from < match.from) tail_idx++
    if (shifted[tail_idx]?.from === match.from)
      return result.concat(shifted.slice(tail_idx))
    result.push(match)
  }
  return result
}

// Replacement text is literal. Each edit uses coordinates left by the preceding edit,
// and the entire batch is one undo step in the model's existing history.
export const replace_editor_matches = (
  model: EditorModel,
  query: string,
  replacement: string,
  options?: EditorSearchOptions,
): number => {
  const insert = replacement.replaceAll(/\r\n?/g, `\n`)
  const edits: TextEdit[] = []
  let shift = 0
  for (const { from, to } of iterate_editor_matches(model, query, options)) {
    edits.push({ from: from + shift, to: to + shift, insert })
    shift += insert.length - (to - from)
  }
  if (edits.length === 0) return 0
  model.transact(edits, { source: `command` })
  return edits.length
}
