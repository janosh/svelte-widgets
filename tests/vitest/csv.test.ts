import { escape_csv_field, rows_to_csv } from '$lib/csv'
import { describe, expect, test } from 'vite-plus/test'

describe(`rows_to_csv`, () => {
  test(`explicit readonly columns preserve sparse fields and empty export headers`, () => {
    const columns = [`last`, `first`] as const
    expect(rows_to_csv([{ first: 1 }, { last: 2 }], columns)).toBe(`last,first\n,1\n2,`)
    expect(rows_to_csv([], columns)).toBe(`last,first`)
  })
  test.each([
    [[], ``],
    [
      [
        { active: true, missing: undefined },
        { active: false, missing: null },
      ],
      `active,missing\ntrue,\nfalse,`,
    ],
    [
      [
        { y_key: `X`, A: 1, B: 2 },
        { y_key: `Y`, A: 3, B: null },
      ],
      `y_key,A,B\nX,1,2\nY,3,`,
    ],
    [
      [{ y_key: `Fe,O`, A: `He"Ne`, B: `line1\nline2` }],
      `y_key,A,B\n"Fe,O","He""Ne","line1\nline2"`,
    ],
  ])(`serializes %j`, (rows, expected) => {
    expect(rows_to_csv(rows)).toBe(expected)
  })

  test.each([
    [`plain`, `plain`],
    [42, `42`],
    [-42, `-42`],
    [`=1+2`, `=1+2`],
    [`+123`, `+123`],
    [`-123`, `-123`],
    [`@name`, `@name`],
    [true, `true`],
    [false, `false`],
    [null, ``],
    [undefined, ``],
    [`a,b`, `"a,b"`],
    [`say "hi"`, `"say ""hi"""`],
    [`line1\rline2`, `"line1\rline2"`],
  ])(`escape_csv_field(%j) = %j`, (value, expected) => {
    expect(escape_csv_field(value)).toBe(expected)
  })
})
