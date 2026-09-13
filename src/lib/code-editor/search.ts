import type { EditorModel, TextEdit } from './types'

export type EditorSearchOptions = { case_sensitive?: boolean; whole_word?: boolean }
export type EditorMatch = Pick<TextEdit, `from` | `to`>

// Literal, non-overlapping UTF-16 ranges, including matches across lines and rope chunks.
// Keep only a window in memory: searching does not flatten a large document into a string.
export const find_editor_matches = (
  model: Pick<EditorModel, `slice` | `length`>,
  query: string,
  { case_sensitive = false, whole_word = false }: EditorSearchOptions = {},
): EditorMatch[] => {
  query = query.replaceAll(/\r\n?/g, `\n`)
  if (!query) return []
  const window_size = 32 * 1024
  const matches: EditorMatch[] = []
  // Native literal matching skips quickly over large documents for ordinary queries.
  // Bound the expression size; long queries use the linear matcher below.
  if (query.length <= 1024) {
    const word_char = `[\\p{L}\\p{M}\\p{N}_$]`
    const literal = query.replaceAll(/[.*+?^${}()|[\]\\]/g, `\\$&`)
    const pattern = new RegExp(
      whole_word ? `(?<!${word_char})${literal}(?!${word_char})` : literal,
      case_sensitive ? `gu` : `giu`,
    )
    let cursor = 0
    while (cursor < model.length) {
      const boundary = Math.min(model.length, cursor + window_size)
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
        matches.push({ from, to })
        next_cursor = Math.max(next_cursor, to)
      }
      cursor = next_cursor
    }
    return matches
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
  let previous_word = false
  matched = 0
  let character_idx = 0
  let cursor = 0
  while (cursor < model.length) {
    const boundary = Math.min(model.length, cursor + window_size)
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
      if (
        whole_word &&
        (preceding_words[start_idx] ||
          word_char.test(text.slice(cursor - window_from, cursor - window_from + 2)))
      ) {
        matched = prefixes[matched - 1]
      } else {
        matches.push({ from, to: cursor })
        matched = 0
      }
    }
  }
  return matches
}

// Replacement text is literal. Each edit uses coordinates left by the preceding edit,
// and the entire batch is one undo step in the model's existing history.
export const replace_editor_matches = (
  model: EditorModel,
  query: string,
  replacement: string,
  options?: EditorSearchOptions,
): number => {
  const matches = find_editor_matches(model, query, options)
  if (matches.length === 0) return 0
  const insert = replacement.replaceAll(/\r\n?/g, `\n`)
  let shift = 0
  const edits = matches.map(({ from, to }) => {
    const edit = { from: from + shift, to: to + shift, insert }
    shift += insert.length - (to - from)
    return edit
  })
  model.transact(edits, { source: `command` })
  return matches.length
}
