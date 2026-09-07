export type SourceMap = {
  version: 3
  sources: string[]
  sourcesContent: string[]
  names: string[]
  mappings: string
}

const BASE64 = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/`
export const encode_vlq = (value: number): string => {
  let encoded = ``
  let remaining = value < 0 ? -value * 2 + 1 : value * 2
  do {
    const digit = remaining % 32
    remaining = Math.floor(remaining / 32)
    encoded += BASE64[digit + (remaining ? 32 : 0)]
  } while (remaining)
  return encoded
}

export type SourceSpan = { generated: number; original: number; length: number }
export type MappedSource = { code: string; spans: SourceSpan[] }
export type SourceEdit = { start: number; end: number; text: string }

// Numeric spans survive repeated text. Inserted markup is deliberately unmapped.
export function edit_source(source: MappedSource, edits: SourceEdit[]): MappedSource {
  if (!edits.length) return source
  let code = ``
  const spans: SourceSpan[] = []
  let cursor = 0
  const copy = (end: number) => {
    for (const span of source.spans) {
      const start = Math.max(cursor, span.generated)
      const stop = Math.min(end, span.generated + span.length)
      if (start < stop)
        spans.push({
          generated: code.length + start - cursor,
          original: span.original + start - span.generated,
          length: stop - start,
        })
    }
    code += source.code.slice(cursor, end)
    cursor = end
  }
  for (const edit of edits.toSorted((left, right) => left.start - right.start)) {
    if (edit.start < cursor || edit.end < edit.start || edit.end > source.code.length)
      throw new Error(`Invalid source edit ${edit.start}..${edit.end}`)
    copy(edit.start)
    code += edit.text
    cursor = edit.end
  }
  copy(source.code.length)
  return { code, spans }
}

export function source_map(
  source: string,
  code: string,
  filename: string,
  spans: SourceSpan[],
): SourceMap {
  const ordered_spans = spans.toSorted((left, right) => left.generated - right.generated)
  let span_idx = 0
  const lines = [0]
  for (let idx = 0; idx < source.length; idx++)
    if (source[idx] === `\n`) lines.push(idx + 1)
  let previous_line = 0
  let previous_column = 0
  let generated_column = 0
  let previous_generated = 0
  let has_segment = false
  let mapped = false
  let mappings = ``
  for (let idx = 0; idx < code.length; idx++) {
    while (
      span_idx < ordered_spans.length &&
      idx >= ordered_spans[span_idx].generated + ordered_spans[span_idx].length
    )
      span_idx++
    const span = ordered_spans[span_idx]
    const offset =
      span && idx >= span.generated ? span.original + idx - span.generated : undefined
    if (offset !== undefined) {
      let low = 0
      let high = lines.length
      while (low + 1 < high) {
        const middle = (low + high) >>> 1
        if (lines[middle] <= offset) low = middle
        else high = middle
      }
      const column = offset - lines[low]
      mappings += `${has_segment ? `,` : ``}${encode_vlq(generated_column - previous_generated)}A${encode_vlq(low - previous_line)}${encode_vlq(column - previous_column)}`
      previous_generated = generated_column
      previous_line = low
      previous_column = column
      has_segment = true
      mapped = true
    } else if (mapped) {
      mappings += `${has_segment ? `,` : ``}${encode_vlq(generated_column - previous_generated)}`
      previous_generated = generated_column
      has_segment = true
      mapped = false
    }
    if (code[idx] === `\n`) {
      mappings += `;`
      generated_column = 0
      previous_generated = 0
      has_segment = false
      mapped = false
    } else generated_column++
  }
  return {
    version: 3,
    sources: [filename],
    sourcesContent: [source],
    names: [],
    mappings,
  }
}

export type DecodedSourceMap = {
  column: number
  original?: { line: number; column: number }
}[][]

// Decode once per transform. Unmapped segments terminate the preceding mapping;
// original source/line/column deltas carry across generated lines.
export function decode_source_map(mappings: string): DecodedSourceMap {
  let source_idx = 0
  let original_line = 0
  let original_column = 0
  return mappings.split(`;`).map((line) => {
    let column = 0
    return line
      .split(`,`)
      .filter(Boolean)
      .map((segment) => {
        const values: number[] = []
        let value = 0
        let shift = 0
        for (const char of segment) {
          const digit = BASE64.indexOf(char)
          if (digit === -1) throw new Error(`Invalid source-map digit: ${char}`)
          value += (digit & 31) * 2 ** shift
          if (digit & 32) shift += 5
          else {
            values.push(value & 1 ? -Math.floor(value / 2) : Math.floor(value / 2))
            value = 0
            shift = 0
          }
        }
        if (shift || ![1, 4, 5].includes(values.length))
          throw new Error(`Invalid source-map segment: ${segment}`)
        if (values[0] < 0) throw new Error(`Unsorted source-map segment: ${segment}`)
        column += values[0]
        if (values.length >= 4) {
          source_idx += values[1]
          original_line += values[2]
          original_column += values[3]
        }
        return {
          column,
          original:
            values.length >= 4 && source_idx === 0
              ? { line: original_line, column: original_column }
              : undefined,
        }
      })
  })
}

export function original_position(map: DecodedSourceMap, line: number, column: number) {
  const segments = map[line]
  if (!segments) return undefined
  let low = 0
  let high = segments.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (segments[middle].column <= column) low = middle + 1
    else high = middle
  }
  return segments[low - 1]?.original
}
