import { clamp, clamp_integer } from '../utils'
import type { EditorModel } from './types'

export type EditorState = {
  model: EditorModel
  selection_start: number
  selection_end: number
}
export interface RangeEdit {
  range_start: number
  range_end: number
  replacement: string
  selection_start: number
  selection_end: number
}
const range_edit = (
  range_start: number,
  range_end: number,
  replacement: string,
  selection_start: number,
  selection_end = selection_start,
): RangeEdit => ({ range_start, range_end, replacement, selection_start, selection_end })
type BlockCommand = (state: EditorState, unit: string) => RangeEdit | null
const clamp_selection = (state: EditorState): [number, number] => {
  const limit = state.model.length
  const start = clamp_integer(state.selection_start, 0, limit)
  return [start, clamp_integer(state.selection_end, start, limit)]
}
const touched_line_range = (
  model: EditorModel,
  sel_start: number,
  sel_end: number,
): [number, number] => {
  const block_start = model.line_at(sel_start).from
  const effective_end =
    sel_end > sel_start && model.slice(sel_end - 1, sel_end) === `\n`
      ? sel_end - 1
      : sel_end
  return [block_start, model.line_at(effective_end).to]
}
// Every whitespace character trimStart() would take except the line terminators, so the
// commented-ness test and the width the uncomment slices off agree. Counting only [ \t]
// let an exotic indent (a non-breaking space, a form feed) shift the slice into the token
// and leave half of it behind.
const leading_whitespace = (line: string): string => /^[^\S\r\n]*/u.exec(line)?.[0] ?? ``
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
  const [block_start, block_end] = touched_line_range(state.model, sel_start, sel_end)
  const lines = state.model.slice(block_start, block_end).split(`\n`)
  const rewrite_line = make_rewrite(lines)
  if (!rewrite_line) return null
  let total_delta = 0
  const next_lines = lines.map((line) => {
    const next_line = rewrite_line(line)
    total_delta += next_line.length - line.length
    return next_line
  })
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
  return range_edit(
    block_start,
    block_end,
    next_lines.join(`\n`),
    next_start,
    Math.max(next_start, next_end),
  )
}
export const indent_selection: BlockCommand = (state, indent) => {
  const [sel_start, sel_end] = clamp_selection(state)
  if (indent === ``) return null
  if (sel_start === sel_end) {
    const caret = sel_start + indent.length
    return range_edit(sel_start, sel_start, indent, caret)
  }
  return rewrite_block(state, () => (line) => (line === `` ? line : indent + line))
}
const dedent_width = (line: string, indent: string): number => {
  if (line.startsWith(`\t`)) return 1
  const unit_width = indent.includes(`\t`) ? 1 : Math.max(1, indent.length)
  let width = 0
  while (width < unit_width && line[width] === ` `) width++
  return width
}
export const dedent_selection: BlockCommand = (state, indent) =>
  rewrite_block(state, () => (line) => line.slice(dedent_width(line, indent)))
export const toggle_line_comment: BlockCommand = (state, token) => {
  if (token === ``) return null
  return rewrite_block(state, (lines) => {
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
      if (!all_commented)
        return `${line.slice(0, comment_column)}${token} ${line.slice(comment_column)}`
      const indent_width = leading_whitespace(line).length
      const rest = line.slice(indent_width + token.length)
      return line.slice(0, indent_width) + (rest.startsWith(` `) ? rest.slice(1) : rest)
    }
  })
}
type CharMap = Record<string, string | undefined>
const OPENER_TO_CLOSER: CharMap = { '(': `)`, '[': `]`, '{': `}` }
export const auto_indent_newline = (state: EditorState, indent: string): RangeEdit => {
  const [sel_start, sel_end] = clamp_selection(state)
  const before_cursor = state.model.slice(state.model.line_at(sel_start).from, sel_start)
  const base_indent = leading_whitespace(before_cursor)
  const last_char = before_cursor.trimEnd().at(-1) ?? ``
  const closer = OPENER_TO_CLOSER[last_char]
  const inner_indent = closer || last_char === `:` ? base_indent + indent : base_indent
  const closes_pair =
    closer !== undefined &&
    sel_end < state.model.length &&
    state.model.slice(sel_end, sel_end + 1) === closer
  const replacement = closes_pair
    ? `\n${inner_indent}\n${base_indent}`
    : `\n${inner_indent}`
  const caret =
    sel_start + replacement.length - (closes_pair ? base_indent.length + 1 : 0)
  return range_edit(sel_start, sel_end, replacement, caret)
}
const CLOSER_TO_OPENER: CharMap = { ')': `(`, ']': `[`, '}': `{` }
const QUOTE_CHARS = `\`'"`
const WORD_CHAR_RE = /[\p{L}\p{N}_$]/u
export const auto_close_pair = (state: EditorState, typed: string): RangeEdit | null => {
  if (typed.length !== 1) return null
  const [sel_start, sel_end] = clamp_selection(state)
  if (sel_start !== sel_end) return null
  const next_char =
    sel_start < state.model.length ? state.model.slice(sel_start, sel_start + 1) : ``
  const prev_char = sel_start > 0 ? state.model.slice(sel_start - 1, sel_start) : ``
  const is_quote = QUOTE_CHARS.includes(typed)
  if (next_char === typed && (CLOSER_TO_OPENER[typed] !== undefined || is_quote))
    return range_edit(sel_start, sel_start, ``, sel_start + 1)
  const closer = OPENER_TO_CLOSER[typed] ?? (is_quote ? typed : undefined)
  if (closer === undefined) return null
  if (WORD_CHAR_RE.test(next_char)) return null
  if (is_quote && (prev_char === typed || WORD_CHAR_RE.test(prev_char))) return null
  return range_edit(sel_start, sel_start, typed + closer, sel_start + 1)
}
export const editor_font_size = (font_size: number): number =>
  Number.isFinite(font_size) && font_size > 0 ? font_size : 13
export const editor_line_height = (font_size: number): number =>
  Math.max(1, Math.round(editor_font_size(font_size) * 1.5))
export const split_text_lines = (text: string): string[] => {
  const lines = text.replaceAll(/\r\n?/g, `\n`).split(`\n`)
  if (lines.length > 1 && lines.at(-1) === ``) lines.pop()
  return lines
}
export const count_lines = (text: string): number =>
  text === `` ? 0 : split_text_lines(text).length
export type LineWindow = { start: number; end: number }
const non_negative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0
export const visible_line_window = (
  scroll_top: number,
  viewport_height: number,
  line_height: number,
  line_count: number,
  overscan = 0,
): LineWindow => {
  const count = clamp_integer(line_count, 0)
  if (count === 0) return { start: 0, end: 0 }
  const rows = clamp_integer(overscan, 0)
  const first_visible = Math.floor(non_negative(scroll_top) / line_height)
  const visible_rows = Math.ceil(non_negative(viewport_height) / line_height) + 1
  const start = clamp(first_visible - rows, 0, count)
  return { start, end: clamp(first_visible + visible_rows + rows, start, count) }
}
