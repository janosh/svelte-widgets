import {
  apply_insertion,
  apply_range_edit,
  auto_close_pair,
  auto_indent_newline,
  count_lines,
  dedent_selection,
  editor_line_height,
  indent_selection,
  toggle_line_comment,
  visible_line_window,
} from '$lib/code-editor'
import type { EditorState, RangeEdit } from '$lib/code-editor'
import { line_comment_token } from '$lib/code-editor/languages'
import { expect, test } from 'vite-plus/test'

const state = (text: string, start: number, end = start): EditorState => ({
  text,
  selection_start: start,
  selection_end: end,
})

const marked = ({ text, selection_start: start, selection_end: end }: EditorState) => {
  if (start === end) return `${text.slice(0, start)}|${text.slice(start)}`
  return `${text.slice(0, start)}[${text.slice(start, end)}]${text.slice(end)}`
}

const unmarked = (marked_text: string): EditorState => {
  if (marked_text.includes(`|`)) {
    return state(marked_text.replaceAll(`|`, ``), marked_text.indexOf(`|`))
  }
  const text = marked_text.replaceAll(`[`, ``).replaceAll(`]`, ``)
  return state(text, marked_text.indexOf(`[`), marked_text.indexOf(`]`) - 1)
}

const applied = (before: EditorState, edit: RangeEdit | null): EditorState =>
  edit === null ? before : apply_range_edit(before, edit)

type BlockOp = (before: EditorState, unit: string) => RangeEdit | null

const block_op = (op: BlockOp, before_marked: string, unit: string): string => {
  const before = unmarked(before_marked)
  return marked(applied(before, op(before, unit)))
}

test.each([
  [`.env`, `#`],
  [`.env.local`, `#`],
  [`.bashrc.local`, `#`],
  [`Dockerfile.prod`, `#`],
  [`component.svelte`, `//`],
  [`notes.txt`, null],
])(`line_comment_token detects %s`, (filename, expected) => {
  expect(line_comment_token(filename)).toBe(expected)
})

test.each([
  [9, 14],
  [12, 18],
  [13, 20],
  [Number.NaN, 20],
  [0, 20],
])(`editor_line_height: font size %s gives %s whole pixels`, (font_size, expected) => {
  expect(editor_line_height(font_size)).toBe(expected)
})

test.each([
  [`collapsed mid-line inserts at the cursor`, `foo |bar`, `  `, `foo   |bar`],
  [`ranged selection indents every touched line`, `o[ne\nt]wo`, `  `, `  o[ne\n  t]wo`],
  [`selection anchored at a line start`, `[one\ntwo]`, `  `, `[  one\n  two]`],
  [`blank lines are left alone`, `[one\n\ntwo]`, `  `, `[  one\n\n  two]`],
  [`a selection ending at a line start`, `[one\n]two`, `  `, `[  one\n]two`],
])(`indent_selection: %s`, (_label, before_marked, indent, expected) => {
  expect(block_op(indent_selection, before_marked, indent)).toBe(expected)
})

test(`indent_selection spans only the touched lines, not the document`, () => {
  const text = Array.from({ length: 400 }, (_unused, idx) => `line ${idx}`).join(`\n`)
  const from = text.indexOf(`line 200`)
  const to = text.indexOf(`line 201`) + `line 201`.length
  const edit = indent_selection(state(text, from, to), `  `)

  expect(edit).not.toBeNull()
  expect(edit?.range_start).toBe(from)
  expect(edit?.range_end).toBe(to)
  expect(edit?.replacement).toBe(`  line 200\n  line 201`)
})

test.each([
  [`collapsed selection dedents its line`, `    foo|`, `  `, `  foo|`],
  [`partial indent is removed entirely`, `  x|`, `    `, `x|`],
  [`a tab indent unit removes one column`, `[    one]`, `\t`, `[   one]`],
  [`mixed tabs and spaces`, `[\tone\n  two\nthree]`, `  `, `[one\ntwo\nthree]`],
  [`deeper indent loses one unit`, `[      one\n    two]`, `  `, `[    one\n  two]`],
  [`selection start never slides before its line`, `  [one\n  two]`, `  `, `[one\ntwo]`],
])(`dedent_selection: %s`, (_label, before_marked, indent, expected) => {
  expect(block_op(dedent_selection, before_marked, indent)).toBe(expected)
})

test(`toggle_line_comment survives a block larger than the argument limit`, () => {
  const lines = Array.from(
    { length: 200_000 },
    (_unused, idx) => `${` `.repeat(idx % 4)}x`,
  )
  const text = lines.join(`\n`)
  const edit = toggle_line_comment(state(text, 0, text.length), `#`)

  // Minimum indent is 0, so all lines are commented at column 0.
  expect(edit?.replacement.split(`\n`).at(-1)).toBe(`# ${lines.at(-1)}`)
})

test.each([
  [`uses the shallowest indentation`, `[  one\n    two]`, `#`, `[  # one\n  #   two]`],
  [`uncomments when every line is commented`, `[# one\n  # two]`, `#`, `[one\n  two]`],
  [`a mixed block gets commented`, `[// one\ntwo]`, `//`, `[// // one\n// two]`],
  [`uncommenting tolerates a missing space`, `[//one\n// two]`, `//`, `[one\ntwo]`],
  [`blank lines are skipped, not counted`, `[one\n\ntwo]`, `#`, `[# one\n\n# two]`],
  [`collapsed selection toggles the caret's line`, `one\nt|wo`, `#`, `one\n# t|wo`],
  [
    `selection endpoints before the comment column stay before it`,
    `  [  one\n  ]  two`,
    `#`,
    `  [  # one\n  ]  # two`,
  ],
])(`toggle_line_comment: %s`, (_label, before_marked, token, expected) => {
  expect(block_op(toggle_line_comment, before_marked, token)).toBe(expected)
})

test.each<[string, string, BlockOp, BlockOp, string]>([
  [`indent then dedent`, `one\n  two\n\nthree`, indent_selection, dedent_selection, `  `],
  [
    `comment then uncomment`,
    `  one\n    two\n\nthree`,
    toggle_line_comment,
    toggle_line_comment,
    `#`,
  ],
])(`%s round-trips a mixed block`, (_label, text, op, inverse, unit) => {
  const original = state(text, 0, text.length)
  const changed = applied(original, op(original, unit))
  expect(changed.text).not.toBe(original.text)
  expect(applied(changed, inverse(changed, unit)).text).toBe(original.text)
})

test.each([
  [`indenting with an empty indent unit`, indent_selection, `[one\ntwo]`, ``],
  [`dedenting lines that have no indentation`, dedent_selection, `[one\ntwo]`, `  `],
  [`commenting a whitespace-only selection`, toggle_line_comment, `[  \n  ]`, `#`],
  [`commenting in a language with no comment token`, toggle_line_comment, `[one]`, ``],
])(`%s returns nothing to do`, (_label, op, before_marked, unit) => {
  expect(op(unmarked(before_marked), unit)).toBeNull()
})

test.each([
  [`carries the current indentation`, `  foo|`, `  `, `\n  `, 0],
  [`no indentation to carry`, `foo|`, `  `, `\n`, 0],
  [`opens a deeper level after a brace`, `if (x) {|`, `  `, `\n  `, 0],
  [`indented brace opens one level deeper`, `  if {|`, `  `, `\n    `, 0],
  [`trailing whitespace after the opener is ignored`, `foo(  |`, `  `, `\n  `, 0],
  [`python colon opens a level`, `def run():|`, `    `, `\n    `, 0],
  [`a colon that is not the last character does not open`, `  a: 1|`, `  `, `\n  `, 0],
  [`caret inside the leading whitespace`, `  |  foo`, `  `, `\n  `, 0],
  [`closer after the caret moves to its own line`, `if (x) {|}`, `  `, `\n  \n`, 1],
  [`indented brace expansion`, `  fn() {|}`, `  `, `\n    \n  `, 3],
  [`a closer that does not match the opener`, `foo(|]`, `  `, `\n  `, 0],
])(`auto_indent_newline: %s`, (_label, before, indent, insert_text, cursor_back) => {
  expect(auto_indent_newline(unmarked(before), indent)).toEqual({
    insert_text,
    cursor_back,
  })
})

test.each([
  [`  fn() {|}`, `  `, `  fn() {\n    |\n  }`],
  [`  one [two]`, `  `, `  one \n  |`],
])(`auto_indent_newline: applying the insertion for %s`, (marked_text, indent, want) => {
  const before = unmarked(marked_text)
  const after = apply_insertion(before, auto_indent_newline(before, indent))
  expect(marked(after)).toBe(want)
})

test.each([
  [`closes a bracket at the end of the line`, `foo|`, `(`, `foo(|)`],
  [`closes a brace before whitespace`, `x|  `, `[`, `x[|]  `],
  [`closes a quote after a space`, `say |`, `"`, `say "|"`],
  [`types over an existing closer`, `foo(|)`, `)`, `foo()|`],
  [`types over an existing quote`, `"|"`, `"`, `""|`],
])(`auto_close_pair: %s`, (_label, before_marked, typed, expected) => {
  const result = auto_close_pair(unmarked(before_marked), typed)
  expect(result).not.toBeNull()
  expect(marked(result as EditorState)).toBe(expected)
})

test.each([
  [`before a word character`, `|foo`, `(`],
  [`apostrophe after a word character`, `don|`, `'`],
  [`quote directly after the same quote`, `'|`, `'`],
  [`a closer with something else ahead`, `|foo`, `)`],
  [`an ordinary character`, `foo|`, `a`],
  [`a multi-character string`, `foo|`, `()`],
  [`a ranged selection`, `[foo] bar`, `(`],
])(`auto_close_pair does not close %s`, (_label, before_marked, typed) => {
  expect(auto_close_pair(unmarked(before_marked), typed)).toBeNull()
})

test.each([
  [`at the top of the document`, 0, 100, 20, 1000, 2, [0, 8]],
  [`mid-document`, 1000, 100, 20, 1000, 3, [47, 59]],
  [`scrolled past the end`, 100_000, 100, 20, 10, 0, [10, 10]],
  [`negative scroll behaves like the top`, -500, 100, 20, 10, 0, [0, 6]],
  [`zero lines`, 0, 100, 20, 0, 4, [0, 0]],
  [`zero viewport still renders the caret's row`, 500, 0, 20, 100, 0, [25, 26]],
  [`unmeasured viewport`, 0, 0, 20, 1000, 8, [0, 9]],
  [`non-finite inputs`, Number.NaN, Number.NaN, 20, 30, 1, [0, 2]],
])(`visible_line_window %s`, (_label, scroll, view, height, count, over, window) => {
  const [start, end] = window
  expect(visible_line_window(scroll, view, height, count, over)).toEqual({ start, end })
})

test.each([
  [`empty text has no lines at all`, ``, 0],
  [`a line without a terminator`, `a`, 1],
  [`a trailing newline terminates its line`, `a\n`, 1],
  [`a blank last line is a line`, `a\n\n`, 2],
  [`CRLF is one break, not two`, `a\r\nb\r\n`, 2],
  [`a lone CR is a break too`, `a\rb`, 2],
  [`a file of only newlines`, `\n\n\n`, 3],
])(`count_lines: %s`, (_label, text, expected) => {
  expect(count_lines(text)).toBe(expected)
})
