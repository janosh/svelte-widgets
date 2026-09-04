import {
  css_class_for,
  decode_spans,
  EMPHASIS_BIT,
  TOKEN_CLASS_NAMES,
} from '$lib/code-editor'
import type { DecodedSpan, SpanList } from '$lib/code-editor'
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const span = (
  start: number,
  end: number,
  class_name: DecodedSpan[`class_name`] = `plain`,
  emphasized = false,
): DecodedSpan => ({ start, end, class_name, emphasized })

// Fail on unknown names so renames cannot silently test the fallback.
const token_id = (name: string): number => {
  const idx = TOKEN_CLASS_NAMES.indexOf(name as (typeof TOKEN_CLASS_NAMES)[number])
  if (idx === -1) throw new Error(`no token class named ${name}`)
  return idx
}

const [KEYWORD, STRING, COMMENT] = [`keyword`, `string`, `comment`].map(token_id)

describe(`decode_spans`, () => {
  test.each<[string, SpanList, number, DecodedSpan[]]>([
    [`empty span list covers the line as plain`, [], 5, [span(0, 5)]],
    [`empty line decodes to nothing at all`, [], 0, []],
    [`negative line length yields no spans`, [0, KEYWORD], -4, []],
    [`non-integer line length yields no spans`, [0, KEYWORD], Number.NaN, []],
    [`single span runs to the end of the line`, [0, KEYWORD], 3, [span(0, 3, `keyword`)]],
    [`plain prefix before a span`, [2, COMMENT], 5, [span(0, 2), span(2, 5, `comment`)]],
    [
      `full multi-span line tiles without gaps`,
      [0, KEYWORD, 3, 0, 4, STRING],
      10,
      [span(0, 3, `keyword`), span(3, 4), span(4, 10, `string`)],
    ],
    [
      `emphasis bit decodes alongside the class`,
      [0, EMPHASIS_BIT | STRING, 4, STRING],
      8,
      [span(0, 4, `string`, true), span(4, 8, `string`)],
    ],
    [`out-of-range class`, [0, 99, 2, KEYWORD], 4, [span(0, 2), span(2, 4, `keyword`)]],
    [`starts past the line end collapse to plain`, [20, KEYWORD], 5, [span(0, 5)]],
    [
      // Clamping non-monotonic starts collapses the earlier span to zero width.
      `non-monotonic starts still tile the line`,
      [5, COMMENT, 2, KEYWORD],
      10,
      [span(0, 5), span(5, 10, `keyword`)],
    ],
    [`trailing element without a class`, [0, KEYWORD, 9], 8, [span(0, 8, `keyword`)]],
  ])(`%s`, (_label, spans, line_length, expected) => {
    expect(decode_spans(spans, line_length)).toEqual(expected)
  })

  test(`decoded offsets index the JS string directly (UTF-16 code units)`, () => {
    const line = `let x = "😀"` // the emoji occupies two UTF-16 code units
    const decoded = decode_spans([0, KEYWORD, 3, 0, 8, STRING], line.length)
    const sliced = decoded.map(({ start, end }) => line.slice(start, end))
    expect(sliced).toEqual([`let`, ` x = `, `"😀"`])
  })
})

test.each([
  [`keyword`, false, `tok-keyword`],
  [`string`, true, `tok-string tok-emph`],
] as const)(`css_class_for %s emphasized=%s`, (class_name, emphasized, expected) => {
  expect(css_class_for(class_name, emphasized)).toBe(expected)
})

test(`editor CSS styles every token and defines readable dark defaults`, () => {
  const editor_css = readFileSync(`src/lib/code-editor/editor.css`, `utf-8`)

  for (const class_name of TOKEN_CLASS_NAMES) {
    expect(editor_css).toMatch(new RegExp(`\\.tok-${class_name}\\s*\\{`))
  }
  for (const row_class of [`insert`, `delete`]) {
    expect(editor_css).toMatch(new RegExp(`\\.diff-row-${row_class} \\.tok-emph\\s*\\{`))
  }
  const dark_palette =
    /:root\[data-theme='dark'\],[\s\S]*?\n}/.exec(editor_css)?.[0] ?? ``
  expect(dark_palette).toContain(
    `--editor-gutter-active-color: var(--text-color, #c9d1d9);`,
  )
  expect(dark_palette).toContain(`--tok-plain: var(--text-color, #c9d1d9);`)
})
