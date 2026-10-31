// Table serializers for downloads and clipboard copy. The text formats all work from one
// plain-text matrix (`TableMatrix`), so CSV, TSV, Markdown and LaTeX can't drift apart; JSON
// reads raw row values instead, keeping numbers, booleans and nesting.
import { csv_line } from '../csv'
import type { TableMatrix } from './types'

export type TableTextFormat = `csv` | `tsv` | `md` | `tex`

// TSV skips quoting, so the tabs and newlines that would split a cell collapse to spaces
export const tsv_cell = (text: string): string => text.replaceAll(/[\t\r\n]+/g, ` `)

export type JsonColumn = { id: string; key?: string }

// One object per row keyed by stable column IDs, so repeated or renamed headers never
// overwrite values. `key` (default: `id`) names the row property to read; `to_value` maps
// each value first, e.g. to strip markup from HTML cells.
export const table_to_json = <Column extends JsonColumn>(
  rows: readonly Record<string, unknown>[],
  columns: readonly Column[],
  to_value: (val: unknown, column: Column) => unknown = (val) => val,
): string =>
  JSON.stringify(
    rows.map((row) =>
      Object.fromEntries(
        columns.map((column) => [
          column.id,
          to_value(row[column.key ?? column.id], column),
        ]),
      ),
    ),
    null,
    2,
  )

// Per-column alignment token: numeric columns right-aligned, missing entries left
const align = ({ headers, numeric }: TableMatrix, right: string, left: string) =>
  headers.map((_header, idx) => (numeric?.[idx] ? right : left))

// GitHub-flavoured Markdown. Escapes entity-like `&` and `<` (before adding <br>) so decoded
// `<b>` or `&lt;` stays text, backslash before `|` (or it would re-escape the one added
// there), and turns newlines into <br>: a literal line break would end the row mid-cell.
const escape_md = (text: string) =>
  text
    .replaceAll(/&(?=#?[\da-z]+;)/gi, `&amp;`)
    .replaceAll(`<`, `&lt;`)
    .replaceAll(`\\`, `\\\\`)
    .replaceAll(`|`, `\\|`)
    .replaceAll(/\r\n?|\n/g, `<br>`)

// One pass over a character map: escaping in stages would re-escape the backslashes and
// braces of the replacements themselves.
const TEX_ESCAPES: Record<string, string> = {
  '\\': `\\textbackslash{}`,
  '^': `\\textasciicircum{}`,
  '~': `\\textasciitilde{}`,
  '&': `\\&`,
  '%': `\\%`,
  $: `\\$`,
  '#': `\\#`,
  _: `\\_`,
  '{': `\\{`,
  '}': `\\}`,
}
const escape_tex = (text: string) =>
  text.replaceAll(/[\\^~&%$#_{}]/g, (char) => TEX_ESCAPES[char])

// CSV (RFC 4180 via csv_line), TSV (cells flattened by tsv_cell), GitHub-flavoured Markdown
// or a LaTeX booktabs tabular, numeric columns right-aligned in the last two
export const table_to_text = (matrix: TableMatrix, format: TableTextFormat): string => {
  const { headers, rows } = matrix
  if (format === `csv`) return [headers, ...rows].map(csv_line).join(`\n`)
  if (format === `tsv`)
    return [headers, ...rows].map((cells) => cells.map(tsv_cell).join(`\t`)).join(`\n`)
  if (format === `md`) {
    const line = (cells: string[]) => `| ${cells.map(escape_md).join(` | `)} |`
    return [headers, align(matrix, `---:`, `:---`), ...rows].map(line).join(`\n`)
  }
  const line = (cells: string[]) =>
    `  ${cells.map((cell) => escape_tex(tsv_cell(cell))).join(` & `)} \\\\`
  return [
    `\\begin{tabular}{${align(matrix, `r`, `l`).join(``)}}`,
    `  \\toprule`,
    line(headers),
    `  \\midrule`,
    ...rows.map(line),
    `  \\bottomrule`,
    `\\end{tabular}`,
  ].join(`\n`)
}
