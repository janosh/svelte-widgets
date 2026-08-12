// Derive EditorBackend line splices from textarea input without re-splitting the whole
// document per keystroke.
//
// INVARIANT: null is always safe; a wrong splice never is. null triggers full set_text;
// a wrong splice silently desynchronizes highlighting, so ambiguous cases bail. The
// backend's expectedTotalLength is the real guard; expectedLineCount is not (types.ts).
//
// Offsets are UTF-16 (selectionStart). Textarea values are LF; the backend restores
// file EOL on save (OpenDocResult.eol).

import { clamp, clamp_integer } from '../utils'

export interface LineIndex {
  lines: string[]
  // Absolute offset of each line's first character, plus a trailing total-length
  // entry, so a line's end is always `starts[idx] + lines[idx].length`.
  starts: number[]
}

export interface LineSplice {
  start_line: number
  removed_count: number
  inserted_lines: string[]
  expected_line_count: number
  // UTF-16 length of next_value itself, not recomputed from the splice.
  expected_total_length: number
}

// A `beforeinput` event captured before the textarea's value changes. A snapshot
// rather than the event keeps this module DOM-free and every case below testable.
export interface BeforeInputSnapshot {
  selection_start: number
  selection_end: number
  input_type: string
  value_length: number
}

// Unchanged code units compared on each side of the edit. A full comparison would
// be O(document); 32 catches essentially every mis-derivation while staying O(1).
const CONTEXT_CHECK_CHARS = 32

// Old-text range replaced by each input type. Undo/redo, IME, drag/drop, spellcheck,
// and unknown types intentionally return null because the snapshot cannot prove them.
type ChangeShape = `replace_selection` | `delete_backward` | `delete_forward`

const INPUT_TYPE_SHAPES: Record<string, ChangeShape | undefined> = Object.assign(
  Object.create(null),
  {
    insertText: `replace_selection`,
    insertFromPaste: `replace_selection`,
    insertFromPasteAsQuotation: `replace_selection`,
    insertFromYank: `replace_selection`,
    insertLineBreak: `replace_selection`,
    insertParagraph: `replace_selection`,
    // Cut and "delete the selection" replace exactly the selected range.
    deleteByCut: `replace_selection`,
    deleteContent: `replace_selection`,
    deleteContentBackward: `delete_backward`,
    deleteWordBackward: `delete_backward`,
    deleteSoftLineBackward: `delete_backward`,
    deleteHardLineBackward: `delete_backward`,
    deleteContentForward: `delete_forward`,
    deleteWordForward: `delete_forward`,
    deleteSoftLineForward: `delete_forward`,
    deleteHardLineForward: `delete_forward`,
  },
)

const refresh_starts = (index: LineIndex, from_line: number): void => {
  const { lines, starts } = index
  const begin = clamp(Math.floor(from_line), 0, lines.length)
  // Start from the previous line; starts[begin] may be the total-length sentinel.
  let offset = begin === 0 ? 0 : starts[begin - 1] + lines[begin - 1].length + 1
  starts.length = lines.length + 1
  for (let line_idx = begin; line_idx < lines.length; line_idx++) {
    starts[line_idx] = offset
    offset += lines[line_idx].length + 1 // +1 for the newline separator
  }
  starts[lines.length] = Math.max(0, offset - 1) // -1: no final separator exists
}

// Public because a host that strips a BOM on open has to write the same one back on
// save; sharing the constant is what keeps the two ends from disagreeing.
export const BOM = `\uFEFF`

// Textarea shape: LF and no BOM. Buffer, line index, and save path must agree or saving
// a CRLF file rewrites every line.
export const editor_text = (raw: string): string =>
  (raw.startsWith(BOM) ? raw.slice(BOM.length) : raw).replaceAll(/\r\n?/g, `\n`)

// Normalize here: indexing raw CRLF/CR text disagrees with the LF textarea length and
// forces every keystroke through full resync.
export const build_line_index = (text: string): LineIndex => {
  const index: LineIndex = { lines: editor_text(text).split(`\n`), starts: [] }
  refresh_starts(index, 0)
  return index
}

export const line_index_text = (index: LineIndex): string => index.lines.join(`\n`)

export const line_index_length = (index: LineIndex): number =>
  index.starts[index.lines.length] ?? 0

// Index of the line containing `offset`. An offset sitting on a newline belongs to
// the line the newline terminates; offsets outside the document clamp to its ends.
export const line_at_offset = (index: LineIndex, offset: number): number => {
  const target = clamp_integer(offset, 0, line_index_length(index))
  let [low, high] = [0, index.lines.length - 1]
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (index.starts[mid] <= target) low = mid
    else high = mid - 1
  }
  return low
}

// Read `[from, to)` of the indexed text without materializing the document.
const read_range = (index: LineIndex, from: number, to: number): string => {
  if (to <= from) return ``
  const last_line = index.lines.length - 1
  let out = ``
  for (let line_idx = line_at_offset(index, from); line_idx <= last_line; line_idx++) {
    const line_start = index.starts[line_idx]
    if (line_start >= to) break
    const line = index.lines[line_idx]
    const chunk = line_idx < last_line ? `${line}\n` : line
    out += chunk.slice(
      Math.max(0, from - line_start),
      Math.min(chunk.length, to - line_start),
    )
  }
  return out
}

// O(1) check around the edit catches stale indices or edits landing elsewhere. It
// cannot prove correctness; the suffix shifts by `delta` in next_value.
const context_matches = (
  index: LineIndex,
  next_value: string,
  region_start: number,
  region_end: number,
  delta: number,
): boolean => {
  const unchanged = (from: number, to: number, shift: number): boolean =>
    read_range(index, from, to) === next_value.slice(from + shift, to + shift)
  const prefix_from = Math.max(0, region_start - CONTEXT_CHECK_CHARS)
  const suffix_to = Math.min(line_index_length(index), region_end + CONTEXT_CHECK_CHARS)
  return (
    unchanged(prefix_from, region_start, 0) && unchanged(region_end, suffix_to, delta)
  )
}

const is_offset = (value: number, limit: number): boolean =>
  Number.isInteger(value) && value >= 0 && value <= limit

// Derive the line splice that turns the indexed text into `next_value`, or `null`
// when it cannot be derived with certainty (see the invariant on top). The index
// is NOT updated; call `apply_splice` once the backend has accepted.
export const derive_line_splice = (
  index: LineIndex,
  before: BeforeInputSnapshot,
  next_value: string,
): LineSplice | null => {
  const shape = INPUT_TYPE_SHAPES[before.input_type]
  if (shape === undefined) return null

  const old_length = line_index_length(index)
  // A length mismatch means the index describes a different document than the
  // textarea did at `beforeinput`, indicating a missed event or programmatic write.
  if (before.value_length !== old_length) return null
  if (
    !is_offset(before.selection_start, old_length) ||
    !is_offset(before.selection_end, old_length) ||
    before.selection_start > before.selection_end
  )
    return null

  const [sel_start, sel_end] = [before.selection_start, before.selection_end]
  const delta = next_value.length - old_length

  // A selected range is the deletion. At a collapsed caret, length delta gives the
  // extent, including deleteWord* without encoding word rules.
  let [region_start, region_end] = [sel_start, sel_end]
  if (sel_start === sel_end && shape !== `replace_selection`) {
    if (delta > 0) return null // a "delete" that grew the document: give up
    if (shape === `delete_backward`) region_start = sel_end + delta
    else region_end = sel_start - delta
  }
  if (region_start < 0 || region_end > old_length || region_start > region_end) {
    return null
  }
  // The replacement run cannot be shorter than nothing.
  if (region_end - region_start + delta < 0) return null

  // Widen to whole lines: the backend's unit of edit is a line.
  const start_line = line_at_offset(index, region_start)
  const end_line = line_at_offset(index, region_end)
  const block_start = index.starts[start_line]
  const new_block_end = index.starts[end_line] + index.lines[end_line].length + delta
  if (new_block_end < block_start || new_block_end > next_value.length) return null
  // Rewritten block ends must remain line boundaries or later lines shift.
  if (block_start > 0 && next_value[block_start - 1] !== `\n`) return null
  if (new_block_end < next_value.length && next_value[new_block_end] !== `\n`) {
    return null
  }
  if (!context_matches(index, next_value, region_start, region_end, delta)) return null

  // Slice only the affected range, never the rest of the document.
  const inserted_lines = next_value.slice(block_start, new_block_end).split(`\n`)
  const removed_count = end_line - start_line + 1
  return {
    start_line,
    removed_count,
    inserted_lines,
    // Predicted from the index rather than from `next_value.split('\n')`, which
    // would reintroduce the O(document) cost this module avoids.
    expected_line_count: index.lines.length - removed_count + inserted_lines.length,
    expected_total_length: next_value.length,
  }
}

// Splicing more than this many items at once via `Array.prototype.splice` would pass
// them as function arguments and can overflow the call stack, so rebuild the array
// instead. Only a huge paste gets here.
const SPLICE_SPREAD_LIMIT = 10_000

// Mutate when safe, otherwise rebuild; callers always reassign. Shared with the token
// array so its spread limit cannot drift from the line index.
export const splice_within_limits = <Item>(
  target: Item[],
  start: number,
  removed_count: number,
  items: Item[],
): Item[] => {
  if (items.length <= SPLICE_SPREAD_LIMIT) {
    target.splice(start, removed_count, ...items)
    return target
  }
  return [...target.slice(0, start), ...items, ...target.slice(start + removed_count)]
}

// Mutate the index and recompute offsets from the splice point only; no string re-split.
export const apply_splice = (index: LineIndex, splice: LineSplice): LineIndex => {
  const start_line = clamp(Math.floor(splice.start_line), 0, index.lines.length)
  const removed_count = clamp(
    Math.floor(splice.removed_count),
    0,
    index.lines.length - start_line,
  )
  index.lines = splice_within_limits(
    index.lines,
    start_line,
    removed_count,
    splice.inserted_lines,
  )
  // `''.split('\n')` is `['']`, so a document always has at least one line;
  // preserve that even if a caller hands us a splice that empties the array.
  if (index.lines.length === 0) index.lines.push(``)
  refresh_starts(index, start_line)
  return index
}
