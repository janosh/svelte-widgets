import {
  apply_splice,
  build_line_index,
  derive_line_splice,
  editor_text,
  line_at_offset,
  line_index_length,
  line_index_text,
} from '$lib/code-editor'
import { expect, test } from 'vite-plus/test'

const snapshot = (text: string, sel_start: number, sel_end: number, input: string) => ({
  selection_start: sel_start,
  selection_end: sel_end,
  input_type: input,
  value_length: text.length,
})

const parse_marked = (marked_text: string): [string, number, number] => {
  if (marked_text.includes(`|`)) {
    const caret = marked_text.indexOf(`|`)
    return [marked_text.replaceAll(`|`, ``), caret, caret]
  }
  const text = marked_text.replaceAll(`[`, ``).replaceAll(`]`, ``)
  return [text, marked_text.indexOf(`[`), marked_text.indexOf(`]`) - 1]
}

const derive_for = (before_marked: string, input_type: string, next_value: string) => {
  const [text, sel_start, sel_end] = parse_marked(before_marked)
  const index = build_line_index(text)
  const before = snapshot(text, sel_start, sel_end, input_type)
  return { index, splice: derive_line_splice(index, before, next_value) }
}

const round_trip = (before_marked: string, input_type: string, next_value: string) => {
  const { index, splice } = derive_for(before_marked, input_type, next_value)
  if (splice === null) throw new Error(`expected a splice for ${input_type}`)

  const expected_lines = next_value.split(`\n`)
  expect(splice.expected_line_count).toBe(expected_lines.length)
  apply_splice(index, splice)
  expect(index.lines).toEqual(expected_lines)
  expect(index.starts).toEqual(build_line_index(next_value).starts)
  return splice
}

test.each([
  [``, [``], [0, 0]],
  [`a`, [`a`], [0, 1]],
  [`a\nb`, [`a`, `b`], [0, 2, 3]],
  [`a\n`, [`a`, ``], [0, 2, 2]],
  [`\n\n`, [``, ``, ``], [0, 1, 2, 2]],
  [`one\ntwo\nthree`, [`one`, `two`, `three`], [0, 4, 8, 13]],
])(`build_line_index indexes %j`, (text, lines, starts) => {
  const index = build_line_index(text)
  expect(index.lines).toEqual(lines)
  expect(index.starts).toEqual(starts)
  expect(line_index_length(index)).toBe(text.length)
  expect(line_index_text(index)).toBe(text)
})

const three_lines = build_line_index(`one\ntwo\nthree`)

test.each([
  [0, 0],
  [3, 0],
  [4, 1],
  [8, 2],
  [13, 2],
  [999, 2],
  [-5, 0],
])(`line_at_offset: offset %s is on line %s`, (offset, line_idx) => {
  expect(line_at_offset(three_lines, offset)).toBe(line_idx)
})

// Textareas are LF-only and BOM-free; any index drift forces full resync.
test.each([
  [`trailing crlf`, `one\r\ntwo\r\n`, [`one`, `two`, ``]],
  [`mixed cr, crlf, lf`, `one\r\ntwo\rthree\nfour`, [`one`, `two`, `three`, `four`]],
  [`a leading BOM`, `\uFEFFone\r\ntwo`, [`one`, `two`]],
  [`a BOM later in the text, which is real content`, `a\uFEFFb`, [`a\uFEFFb`]],
])(`build_line_index normalizes %s to match the textarea`, (_label, text, lines) => {
  const index = build_line_index(text)
  expect(index.lines).toEqual(lines)
  expect(line_index_length(index)).toBe(lines.join(`\n`).length)
  expect(editor_text(text)).toBe(lines.join(`\n`))
})

test.each<[string, string, string, boolean]>([
  [`al|pha\nbeta`, `insertText`, `alxpha\nbeta`, true],
  [`alpha|\nbeta`, `insertFromPaste`, `alpha1\n2\nbeta`, true],
  [`alpha|\nbeta`, `insertLineBreak`, `alpha\n\nbeta`, true],
  [`car|t\nbeta`, `deleteContentBackward`, `cat\nbeta`, true],
  [`alp|ha\nbeta`, `deleteContentForward`, `alpa\nbeta`, true],
  [`alpha|\nbeta`, `deleteWordBackward`, `\nbeta`, true],
  [`[alpha]\nbeta`, `deleteByCut`, `\nbeta`, true],
  [`[alpha]\nbeta`, `deleteContent`, `\nbeta`, true],
  [`al|pha\nbeta`, `historyUndo`, `alpha\nbeta!`, false],
  [`al|pha\nbeta`, `insertCompositionText`, `alxpha\nbeta`, false],
  [`al|pha\nbeta`, `constructor`, `alxpha\nbeta`, false],
  [`al|pha\nbeta`, `toString`, `alxpha\nbeta`, false],
  [`al|pha\nbeta`, `valueOf`, `alxpha\nbeta`, false],
])(`derive_line_splice %s + %s`, (before_marked, input_type, next_value, derivable) => {
  const { splice } = derive_for(before_marked, input_type, next_value)
  expect(splice === null).toBe(!derivable)
  if (derivable) round_trip(before_marked, input_type, next_value)
})

test.each<[string, string, string, string]>([
  [`typed at the very start`, `|alpha\nbeta`, `insertText`, `xalpha\nbeta`],
  [`typed at the very end`, `alpha\nbeta|`, `insertText`, `alpha\nbetax`],
  [`typed into an empty document`, `|`, `insertText`, `a`],
  [`typed on a trailing empty line`, `a\n|`, `insertText`, `a\nb`],
  [`a newline mid-line splits it`, `al|pha\nbeta`, `insertLineBreak`, `al\npha\nbeta`],
  [`a newline at the end appends an empty line`, `abc|`, `insertLineBreak`, `abc\n`],
  [`paste over 3 selected lines`, `on[e\ntwo\nt]hree`, `insertFromPaste`, `onX\nYhree`],
  [`deletes 3 lines`, `o[ne\ntwo\nthre]e\nfour`, `deleteContentBackward`, `oe\nfour`],
  [`backspace at a line start joins`, `one\n|two`, `deleteContentBackward`, `onetwo`],
  [`forward delete at a line end joins`, `one|\ntwo`, `deleteContentForward`, `onetwo`],
  [`backspace emptying the document`, `a|`, `deleteContentBackward`, ``],
  [`cutting a whole line`, `one\n[two\n]three`, `deleteByCut`, `one\nthree`],
  [`deleting the final newline`, `one\n|`, `deleteContentBackward`, `one`],
  [`backspace over an astral character`, `a😀|b`, `deleteContentBackward`, `ab`],
  [`deleting to a line start`, `[one\ntwo\n]three`, `deleteContentBackward`, `three`],
  [`paste replacing the whole document`, `[one\ntwo]`, `insertFromPaste`, `a\nb\nc\nd`],
])(`round trips: %s`, (_label, before_marked, input_type, next_value) => {
  const splice = round_trip(before_marked, input_type, next_value)
  expect(splice.expected_total_length).toBe(next_value.length)
})

test(`a mid-document edit only splices the lines it touched`, () => {
  const text = Array.from({ length: 500 }, (_unused, idx) => `line ${idx}`).join(`\n`)
  const caret = text.indexOf(`line 250`) + 4
  const before_marked = `${text.slice(0, caret)}|${text.slice(caret)}`
  const next_value = `${text.slice(0, caret)}X${text.slice(caret)}`
  const splice = round_trip(before_marked, `insertText`, next_value)

  expect(splice).toMatchObject({
    start_line: 250,
    removed_count: 1,
    inserted_lines: [`lineX 250`],
    expected_line_count: 500,
  })
})

test.each<[string, string, string, string]>([
  [`a delete that grew the text`, `al|pha`, `deleteContentBackward`, `alphaxx`],
  [`text after caret changed`, `|hello\nworld`, `insertText`, `goodbye\nworld`],
  [`text before caret changed`, `one\ntwo\n|three`, `insertText`, `ONE\ntwo\nXthree`],
])(`derive_line_splice bails out on %s`, (_label, before_marked, input_type, next) => {
  expect(derive_for(before_marked, input_type, next).splice).toBeNull()
})

test.each([
  [`stale line index`, 2, 2, 7],
  [`selection beyond the document`, 99, 99, 0],
  [`inverted selection`, 4, 1, 0],
])(`derive_line_splice bails out on %s`, (_label, sel_start, sel_end, length_bias) => {
  const before = snapshot(`alpha`, sel_start, sel_end, `insertText`)
  before.value_length += length_bias
  expect(derive_line_splice(build_line_index(`alpha`), before, `alphax`)).toBeNull()
})

const splice_of = (
  start_line: number,
  removed_count: number,
  inserted_lines: string[],
  expected_line_count: number,
) => ({
  start_line,
  removed_count,
  inserted_lines,
  expected_line_count,
  expected_total_length: 0,
})

test.each([
  [
    `clamps a splice reaching past the end`,
    splice_of(99, 99, [`three`], 3),
    `one\ntwo\nthree`,
  ],
  [`leaves at least one line`, splice_of(0, 2, [], 1), ``],
])(`apply_splice %s`, (_label, splice, expected_text) => {
  const index = build_line_index(`one\ntwo`)
  apply_splice(index, splice)
  expect(index.lines).toEqual(expected_text.split(`\n`))
  expect(index.starts).toEqual(build_line_index(expected_text).starts)
  expect(line_index_text(index)).toBe(expected_text)
})

test(`apply_splice handles a paste far larger than the argument spread limit`, () => {
  const index = build_line_index(`head\ntail`)
  const rows = Array.from({ length: 50_000 }, (_unused, idx) => `row ${idx}`)
  apply_splice(index, splice_of(1, 1, rows, 50_001))
  expect(index.lines).toHaveLength(50_001)
  expect(line_index_length(index)).toBe(line_index_text(index).length)
})

const UINT32 = 2 ** 32

const make_rng = (seed: number): ((bound: number) => number) => {
  let rng_state = seed % UINT32
  return (bound: number): number => {
    rng_state = (rng_state * 1664525 + 1013904223) % UINT32
    return bound <= 0 ? 0 : rng_state % bound
  }
}

test(`property: 400 random edits round trip through derive + apply`, () => {
  const random = make_rng(20_260_725)
  const pastes = [`x`, `foo`, `\n`, `a\nb`, `  `, `}\n`, `one two three`, ``]
  let text = `alpha beta\n  gamma\n\ndelta epsilon\nzeta`
  const index = build_line_index(text)

  for (let step = 0; step < 400; step++) {
    const bound_a = random(text.length + 1)
    const bound_b = random(text.length + 1)
    const [sel_start, sel_end] = [Math.min(bound_a, bound_b), Math.max(bound_a, bound_b)]
    const has_range = sel_start !== sel_end

    let input_type: string
    let next_value: string
    const kind = random(6)
    if (kind < 2) {
      input_type = random(2) === 0 ? `insertText` : `insertFromPaste`
      next_value =
        text.slice(0, sel_start) + pastes[random(pastes.length)] + text.slice(sel_end)
    } else if (kind === 2) {
      input_type = `insertLineBreak`
      next_value = `${text.slice(0, sel_start)}\n${text.slice(sel_end)}`
    } else if (kind === 3) {
      input_type = random(2) === 0 ? `deleteContentBackward` : `deleteWordBackward`
      const removed = has_range ? 0 : Math.min(sel_start, 1 + random(6))
      next_value = text.slice(0, sel_start - removed) + text.slice(sel_end)
    } else if (kind === 4) {
      input_type = `deleteContentForward`
      const removed = has_range ? 0 : Math.min(text.length - sel_end, random(4))
      next_value = text.slice(0, sel_start) + text.slice(sel_end + removed)
    } else {
      if (!has_range) continue
      input_type = `deleteByCut`
      next_value = text.slice(0, sel_start) + text.slice(sel_end)
    }

    const before = snapshot(text, sel_start, sel_end, input_type)
    const splice = derive_line_splice(index, before, next_value)
    expect(
      splice,
      `step ${step}: ${input_type} at ${sel_start}..${sel_end}`,
    ).not.toBeNull()
    if (splice === null) return

    const expected_lines = next_value.split(`\n`)
    expect(splice.expected_line_count).toBe(expected_lines.length)
    apply_splice(index, splice)
    expect(index.lines).toEqual(expected_lines)
    expect(index.starts).toEqual(build_line_index(next_value).starts)
    text = next_value
  }
})
