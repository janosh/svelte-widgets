// Pure EditorState transforms for keyboard commands; nothing here touches a textarea.
// UTF-16 offsets match selectionStart and span offsets in types.ts.
//
// From editor_line_height down: view arithmetic shared with DiffView (no EditorState).

import { clamp } from '../utils'

export interface EditorState {
  text: string
  selection_start: number
  selection_end: number
}

// Insert over the selection. For native undo, use execCommand('insertText') and move
// back `cursor_back` code units; own-undo callers use apply_insertion.
export interface TextInsertion {
  insert_text: string
  cursor_back: number
}

// Contiguous replacement for block commands. Unlike assigning textarea.value, applying
// this via setSelectionRange + execCommand preserves undo, emits `input` for
// derive_line_splice, and avoids rebuilding the whole document.
export interface RangeEdit {
  range_start: number
  range_end: number
  replacement: string
  selection_start: number
  selection_end: number
}

// Whole-line command; `unit` is an indent or comment token.
type BlockCommand = (state: EditorState, unit: string) => RangeEdit | null

// For own-undo callers and tests that need the resulting document.
export const apply_range_edit = (state: EditorState, edit: RangeEdit): EditorState => ({
  text:
    state.text.slice(0, edit.range_start) +
    edit.replacement +
    state.text.slice(edit.range_end),
  selection_start: edit.selection_start,
  selection_end: edit.selection_end,
})

// Clamp programmatic/test selections to prevent corruption; DOM selections are sane.
// A non-finite end collapses at the start.
const clamp_selection = (state: EditorState): [number, number] => {
  const limit = state.text.length
  const offset = (value: number, low: number): number =>
    Number.isFinite(value) ? clamp(Math.floor(value), low, limit) : low
  const start = offset(state.selection_start, 0)
  return [start, offset(state.selection_end, start)]
}

const line_start_offset = (text: string, offset: number): number =>
  offset <= 0 ? 0 : text.lastIndexOf(`\n`, offset - 1) + 1

const line_end_offset = (text: string, offset: number): number => {
  const newline_idx = text.indexOf(`\n`, Math.max(0, offset))
  return newline_idx === -1 ? text.length : newline_idx
}

// Whole lines touched, excluding a selection end exactly at the next line start so
// selecting one full line does not indent the line below.
const touched_line_range = (
  text: string,
  sel_start: number,
  sel_end: number,
): [number, number] => {
  const block_start = line_start_offset(text, sel_start)
  const effective_end =
    sel_end > sel_start && text[sel_end - 1] === `\n` ? sel_end - 1 : sel_end
  return [block_start, line_end_offset(text, effective_end)]
}

const leading_whitespace = (line: string): string => /^[ \t]*/.exec(line)?.[0] ?? ``

// Map a column through a rewrite; positions before its first difference stay fixed.
// Positions inside removed text collapse to that difference.
const map_rewritten_column = (
  line: string,
  next_line: string,
  column: number,
): number => {
  const limit = Math.min(line.length, next_line.length)
  let edit_column = 0
  while (edit_column < limit && line[edit_column] === next_line[edit_column])
    edit_column++
  if (column < edit_column) return column
  return Math.max(edit_column, column + next_line.length - line.length)
}

// Rewrite touched lines as one RangeEdit. make_rewrite sees the full block first;
// null skips a no-op that would collapse selection. Selection endpoints map through
// their own line's edit; preceding line deltas shift only the end's line start.
const rewrite_block = (
  state: EditorState,
  make_rewrite: (lines: string[]) => ((line: string) => string) | null,
): RangeEdit | null => {
  const [sel_start, sel_end] = clamp_selection(state)
  const [block_start, block_end] = touched_line_range(state.text, sel_start, sel_end)
  const lines = state.text.slice(block_start, block_end).split(`\n`)
  const rewrite_line = make_rewrite(lines)
  if (!rewrite_line) return null

  let total_delta = 0
  const next_lines = lines.map((line) => {
    const next_line = rewrite_line(line)
    total_delta += next_line.length - line.length
    return next_line
  })
  // A no-op would cost an undo entry, emit a pointless splice, and swallow the key.
  if (total_delta === 0) return null

  const [first_line, next_first_line] = [lines[0], next_lines[0]]
  const next_start =
    sel_start === block_start && sel_start < sel_end
      ? block_start
      : block_start +
        map_rewritten_column(first_line, next_first_line, sel_start - block_start)
  const last_line_idx = lines.length - 1
  const [last_line, next_last_line] = [lines[last_line_idx], next_lines[last_line_idx]]
  const last_line_start = block_end - last_line.length
  const next_last_line_start =
    last_line_start + total_delta - (next_last_line.length - last_line.length)
  const next_end =
    sel_end > block_end
      ? sel_end + total_delta
      : next_last_line_start +
        map_rewritten_column(last_line, next_last_line, sel_end - last_line_start)
  return {
    range_start: block_start,
    range_end: block_end,
    replacement: next_lines.join(`\n`),
    selection_start: next_start,
    selection_end: Math.max(next_start, next_end),
  }
}

export const indent_selection: BlockCommand = (state, indent) => {
  const [sel_start, sel_end] = clamp_selection(state)
  if (indent === ``) return null
  // Collapsed Tab inserts at the caret, including mid-line.
  if (sel_start === sel_end) {
    const caret = sel_start + indent.length
    return {
      range_start: sel_start,
      range_end: sel_start,
      replacement: indent,
      selection_start: caret,
      selection_end: caret,
    }
  }
  // Indenting an empty line would leave trailing whitespace behind.
  return rewrite_block(state, () => (line) => (line === `` ? line : indent + line))
}

// Leading whitespace removed by one dedent. A tab is one full level even in mixed files.
const dedent_width = (line: string, indent: string): number => {
  if (line.startsWith(`\t`)) return 1
  const unit_width = indent.includes(`\t`) ? 1 : Math.max(1, indent.length)
  let width = 0
  while (width < unit_width && line[width] === ` `) width++
  return width
}

// Dedent is always whole-line; short indents lose what they have, never non-whitespace.
export const dedent_selection: BlockCommand = (state, indent) =>
  rewrite_block(state, () => (line) => line.slice(dedent_width(line, indent)))

// Comment all if any line is uncommented; otherwise uncomment all. Leave blanks alone.
export const toggle_line_comment: BlockCommand = (state, token) => {
  if (token === ``) return null

  return rewrite_block(state, (lines) => {
    // Find the shallowest indent without spreading huge selections into Math.min.
    let all_commented = true
    let comment_column = Infinity
    for (const line of lines) {
      if (line.trim() === ``) continue
      all_commented &&= line.trimStart().startsWith(token)
      comment_column = Math.min(comment_column, leading_whitespace(line).length)
    }
    if (!Number.isFinite(comment_column)) return null

    return (line) => {
      if (line.trim() === ``) return line
      if (!all_commented) {
        return `${line.slice(0, comment_column)}${token} ${line.slice(comment_column)}`
      }
      const indent_width = leading_whitespace(line).length
      const rest = line.slice(indent_width + token.length)
      // Commenting inserted one space after the token, so uncommenting takes it
      // back; a line the user typed without that space is unaffected.
      return line.slice(0, indent_width) + (rest.startsWith(` `) ? rest.slice(1) : rest)
    }
  })
}

type CharMap = Record<string, string | undefined>
const OPENER_TO_CLOSER: CharMap = { '(': `)`, '[': `]`, '{': `}` }

// Enter keeps current indentation, adding one level after an opener. A matching closer
// after the caret moves to its own outer-indented line, leaving the caret between.
export const auto_indent_newline = (
  state: EditorState,
  indent: string,
): TextInsertion => {
  const [sel_start, sel_end] = clamp_selection(state)
  // Use text before the caret so Enter inside leading whitespace stays sane.
  const before_cursor = state.text.slice(
    line_start_offset(state.text, sel_start),
    sel_start,
  )
  const base_indent = leading_whitespace(before_cursor)
  const last_char = before_cursor.trimEnd().at(-1) ?? ``
  const closer = OPENER_TO_CLOSER[last_char]
  // `:` opens Python/YAML blocks and also benefits brace-language labels/object keys.
  const opens = Boolean(closer) || last_char === `:`
  const inner_indent = opens ? base_indent + indent : base_indent

  if (closer !== undefined && state.text[sel_end] === closer) {
    return {
      insert_text: `\n${inner_indent}\n${base_indent}`,
      cursor_back: base_indent.length + 1,
    }
  }
  return { insert_text: `\n${inner_indent}`, cursor_back: 0 }
}

// Apply without execCommand; keeps caret arithmetic in one place.
export const apply_insertion = (
  state: EditorState,
  insertion: TextInsertion,
): EditorState => {
  const [sel_start, sel_end] = clamp_selection(state)
  const caret =
    sel_start +
    insertion.insert_text.length -
    clamp(insertion.cursor_back, 0, insertion.insert_text.length)
  return {
    text:
      state.text.slice(0, sel_start) + insertion.insert_text + state.text.slice(sel_end),
    selection_start: caret,
    selection_end: caret,
  }
}

const CLOSER_TO_OPENER: CharMap = { ')': `(`, ']': `[`, '}': `{` }
const QUOTE_CHARS = `\`'"`
// Unicode-aware so auto-close is not "smarter" inside non-ASCII identifiers.
const WORD_CHAR_RE = /[\p{L}\p{N}_$]/u

// Handle type-over or pair insertion; null delegates normal insertion to the browser.
export const auto_close_pair = (
  state: EditorState,
  typed: string,
): EditorState | null => {
  if (typed.length !== 1) return null
  const [sel_start, sel_end] = clamp_selection(state)
  // Selected text is replaced normally; wrapping is not supported.
  if (sel_start !== sel_end) return null

  const next_char = state.text.slice(sel_start, sel_start + 1)
  const prev_char = sel_start > 0 ? state.text[sel_start - 1] : ``
  // Both outcomes below leave the caret one code unit past where it started.
  const advanced = { selection_start: sel_start + 1, selection_end: sel_start + 1 }

  // Existing closer: advance instead of doubling it.
  const is_quote = QUOTE_CHARS.includes(typed)
  if (next_char === typed && (CLOSER_TO_OPENER[typed] !== undefined || is_quote))
    return { text: state.text, ...advanced }

  const closer = OPENER_TO_CLOSER[typed] ?? (is_quote ? typed : undefined)
  if (closer === undefined) return null
  // Do not auto-close before a word: `|foo` + `(` must not become `()foo`.
  if (WORD_CHAR_RE.test(next_char)) return null
  // Apostrophes: `don|` + `'` must stay `don't`, and `''` must not become `'''`.
  // Only quotes need this. `foo(` is a normal call.
  if (is_quote && (prev_char === typed || WORD_CHAR_RE.test(prev_char))) {
    return null
  }

  const text =
    state.text.slice(0, sel_start) + typed + closer + state.text.slice(sel_start)
  return { text, ...advanced }
}

// Shared whole-pixel row height for editor and DiffView. Fractional heights round
// differently in stacked textarea/token layers and drift over long files.
export const editor_line_height = (font_size: number): number => {
  // Non-positive/NaN uses the default; 1px rows would make virtualization render all.
  const size = Number.isFinite(font_size) && font_size > 0 ? font_size : 13
  return Math.max(1, Math.round(size * 1.5))
}

// Backend line convention: CRLF/CR → LF; a trailing newline terminates its line without
// adding a blank. Shared so displayed counts match DiffResult.
export const split_text_lines = (text: string): string[] => {
  const lines = text.replaceAll(/\r\n?/g, `\n`).split(`\n`)
  if (lines.length > 1 && lines.at(-1) === ``) lines.pop()
  return lines
}

// Same convention, but empty text is zero lines, matching DiffResult.newLineCount.
export const count_lines = (text: string): number =>
  text === `` ? 0 : split_text_lines(text).length

export interface LineWindow {
  start: number // inclusive line index
  end: number // exclusive line index
}

const non_negative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0

// Visible indices for virtualization. line_height ≥ 1; a zero-height viewport still
// returns one partial row plus overscan for initial measurement.
export const visible_line_window = (
  scroll_top: number,
  viewport_height: number,
  line_height: number,
  line_count: number,
  overscan = 0,
): LineWindow => {
  const count = Math.floor(non_negative(line_count))
  if (count === 0) return { start: 0, end: 0 }
  const rows = Math.floor(non_negative(overscan))
  const first_visible = Math.floor(non_negative(scroll_top) / line_height)
  // Include a possible partial row at the bottom.
  const visible_rows = Math.ceil(non_negative(viewport_height) / line_height) + 1
  const start = clamp(first_visible - rows, 0, count)
  return { start, end: clamp(first_visible + visible_rows + rows, start, count) }
}
