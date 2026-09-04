import {
  auto_close_pair,
  auto_indent_newline,
  create_editor_model,
  dedent_selection,
  indent_selection,
  toggle_line_comment,
  visible_line_window,
} from '$lib/code-editor'
import type { EditorState, RangeEdit } from '$lib/code-editor'
import { expect, test } from 'vitest'

const state = (
  text: string,
  selection_start: number,
  selection_end = selection_start,
): EditorState => ({
  model: create_editor_model({ uri: `memory:test`, text }),
  selection_start,
  selection_end,
})
const marked_state = (marked: string): EditorState => {
  const caret = marked.indexOf(`|`)
  if (caret !== -1) return state(marked.replace(`|`, ``), caret)
  const selection_start = marked.indexOf(`[`)
  return state(marked.replaceAll(/[[\]]/g, ``), selection_start, marked.indexOf(`]`) - 1)
}
const apply = (before: EditorState, edit: RangeEdit | null): string => {
  if (!edit) return before.model.text()
  const {
    range_start: from,
    range_end: to,
    replacement: insert,
    selection_start: anchor,
    selection_end: head,
  } = edit
  before.model.transact([{ from, to, insert }], {
    selection: { anchor, head },
    add_to_history: false,
  })
  const text = before.model.text()
  return anchor === head
    ? `${text.slice(0, anchor)}|${text.slice(anchor)}`
    : `${text.slice(0, anchor)}[${text.slice(anchor, head)}]${text.slice(head)}`
}
type BlockCommand = (state: EditorState, unit: string) => RangeEdit | null
const run = (command: BlockCommand, marked: string, unit: string): string => {
  const before = marked_state(marked)
  return apply(before, command(before, unit))
}

test.each<[string, BlockCommand, string, string, string]>([
  [`collapsed indent`, indent_selection, `foo |bar`, `  `, `foo   |bar`],
  [`range indent`, indent_selection, `o[ne\nt]wo`, `  `, `  o[ne\n  t]wo`],
  [`blank indent`, indent_selection, `[one\n\ntwo]`, `  `, `[  one\n\n  two]`],
  [`line-start end`, indent_selection, `[one\n]two`, `  `, `[  one\n]two`],
  [`dedent`, dedent_selection, `[      one\n\ttwo]`, `  `, `[    one\ntwo]`],
  [
    `shallow comment`,
    toggle_line_comment,
    `[  one\n    two]`,
    `#`,
    `[  # one\n  #   two]`,
  ],
  [`uncomment`, toggle_line_comment, `[# one\n  #two]`, `#`, `[one\n  two]`],
  [`mixed comment`, toggle_line_comment, `[// one\ntwo]`, `//`, `[// // one\n// two]`],
  // An indent of whitespace outside [ \t] used to slice into the token, leaving `/ one`
  [
    `uncomment past an exotic indent`,
    toggle_line_comment,
    `[ // one\n// two]`,
    `//`,
    `[ one\ntwo]`,
  ],
])(`block command: %s`, (_label, command, before, unit, expected) => {
  expect(run(command, before, unit)).toBe(expected)
})

test(`block commands slice only touched lines and handle very large blocks`, () => {
  const lines = Array.from(
    { length: 200_000 },
    (_unused, line_idx) => `${` `.repeat(line_idx % 4)}x`,
  )
  const text = lines.join(`\n`)
  const from = lines.slice(0, 100_000).join(`\n`).length + 1
  expect(indent_selection(state(text, from, from + 1), `  `)?.replacement).toBe(`  x`)
  expect(
    toggle_line_comment(state(text, 0, text.length), `#`)
      ?.replacement.split(`\n`)
      .at(-1),
  ).toBe(`# ${lines.at(-1)}`)
})

test.each([
  [`  foo|`, `  `, `  foo\n  |`],
  [`if (x) {|`, `  `, `if (x) {\n  |`],
  [`  if {|`, `  `, `  if {\n    |`],
  [`def run():|`, `    `, `def run():\n    |`],
  [`  a: 1|`, `  `, `  a: 1\n  |`],
  [`if (x) {|}`, `  `, `if (x) {\n  |\n}`],
  [`  fn() {|}`, `  `, `  fn() {\n    |\n  }`],
])(`auto-indent %s`, (marked, indent, expected) => {
  const before = marked_state(marked)
  expect(apply(before, auto_indent_newline(before, indent))).toBe(expected)
})

test.each([
  [`foo|`, `(`, `foo(|)`],
  [`x|  `, `[`, `x[|]  `],
  [`say |`, `"`, `say "|"`],
  [`foo(|)`, `)`, `foo()|`],
  [`"|"`, `"`, `""|`],
  [String.raw`"\|"`, `"`, null],
  [String.raw`"\|`, `"`, null],
  [String.raw`"\\|"`, `"`, String.raw`"\\"|`],
  [String.raw`"\\\|"`, `"`, null],
  [`|foo`, `(`, null],
  [`don|`, `'`, null],
  [`'|`, `'`, null],
  [`|foo`, `)`, null],
  [`[foo] bar`, `(`, null],
])(`auto-close %s + %s`, (marked, typed, expected) => {
  const before = marked_state(marked)
  const edit = auto_close_pair(before, typed)
  expect(edit ? apply(before, edit) : null).toBe(expected)
})

test.each([
  [0, 100, 20, 1000, 2, [0, 8]],
  [1000, 100, 20, 1000, 3, [47, 59]],
  [100_000, 100, 20, 10, 0, [10, 10]],
  [-500, 100, 20, 10, 0, [0, 6]],
  [0, 0, 20, 0, 4, [0, 0]],
  [500, 0, 20, 100, 0, [25, 26]],
  [Number.NaN, Number.NaN, 20, 30, 1, [0, 2]],
])(`visible line window %#`, (scroll, height, row_height, count, overscan, expected) => {
  const { start, end } = visible_line_window(scroll, height, row_height, count, overscan)
  expect([start, end]).toEqual(expected)
})
