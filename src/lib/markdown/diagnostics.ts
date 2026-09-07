export type DeepReadonly<Value> = Value extends object
  ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
  : Value

// Compiler-owned data is frozen before publication; frozen descendants can be shared.
export function freeze_data<Value>(value: Value): Value {
  if (value !== null && typeof value === `object` && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) freeze_data(child)
  }
  return value
}

export type SourcePosition = DeepReadonly<{
  filename: string
  // One-based lines/columns; UTF-16 offsets. Range ends are exclusive.
  line: number
  column: number
  offset: number
}>
export type SourceRange = { readonly start: SourcePosition; readonly end: SourcePosition }
export type Diagnostic = {
  code: string
  severity: 'error' | 'warning'
  message: string
  range: SourceRange
  related?: { message: string; range: SourceRange }[]
}
export type DiagnosticResult<Value> =
  | { ok: true; value: Value; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] }

export class DiagnosticError extends Error {
  readonly diagnostics: Diagnostic[]
  constructor(diagnostics: Diagnostic[]) {
    super(
      diagnostics
        .map(
          ({ code, message, range: { start } }) =>
            `${start.filename}:${start.line}:${start.column} [${code}] ${message}`,
        )
        .join(`\n`),
    )
    this.name = 'DiagnosticError'
    this.diagnostics = diagnostics
  }
}

export function assert_ok<Value>(result: DiagnosticResult<Value>): Value {
  if (!result.ok) throw new DiagnosticError(result.diagnostics)
  return result.value
}
export const diagnostic_result = <Value>(
  value: Value,
  diagnostics: Diagnostic[],
): DiagnosticResult<Value> =>
  diagnostics.some(({ severity }) => severity === `error`)
    ? { ok: false, diagnostics }
    : { ok: true, value, diagnostics }

export const source_locator = (source: string, filename: string) => {
  const starts = [0]
  for (let offset = 0; offset < source.length; offset++)
    if (source[offset] === `\n`) starts.push(offset + 1)
  const position = (offset: number): SourcePosition => {
    offset = Math.max(0, Math.min(offset, source.length))
    let low = 0
    let high = starts.length
    while (low + 1 < high) {
      const middle = (low + high) >>> 1
      if (starts[middle] <= offset) low = middle
      else high = middle
    }
    return { filename, offset, line: low + 1, column: offset - starts[low] + 1 }
  }
  return (start: number, end = start): SourceRange => ({
    start: position(start),
    end: position(end),
  })
}

export function error_diagnostics(
  error: unknown,
  code: string,
  range: SourceRange,
): Diagnostic[] {
  if (error instanceof DiagnosticError) return error.diagnostics
  return [
    {
      code,
      severity: `error`,
      message: error instanceof Error ? error.message : String(error),
      range,
    },
  ]
}
