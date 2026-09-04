export type CsvCell = number | string | boolean | null | undefined

// Quote a CSV field per RFC 4180. A lone CR counts: readers treat CR, LF and CRLF alike
// as record separators, so an unquoted CR splits one record into two.
// Preserves cell data, including formula prefixes. Sanitize untrusted spreadsheet exports
// at the call site for the target application; RFC quoting does not prevent formula execution.
export const escape_csv_field = (value: CsvCell): string => {
  const field = String(value ?? ``)
  if (!/[",\n\r]/.test(field)) return field
  return `"${field.replaceAll(`"`, `""`)}"`
}

// One CSV record from its cells
export const csv_line = (cells: readonly CsvCell[]): string =>
  cells.map(escape_csv_field).join(`,`)

// Explicit columns support sparse rows and header-only exports; otherwise use first-row keys.
export function rows_to_csv(
  rows: readonly Record<string, CsvCell>[],
  headers: readonly string[] = Object.keys(rows[0] ?? {}),
): string {
  if (rows.length === 0 && headers.length === 0) return ``
  return [
    csv_line(headers),
    ...rows.map((row) => csv_line(headers.map((key) => row[key]))),
  ].join(`\n`)
}
