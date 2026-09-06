export type SourceMap = {
  version: 3
  sources: string[]
  sourcesContent: string[]
  names: string[]
  mappings: string
}

const BASE64 = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/`
const vlq = (value: number): string => {
  let encoded = ``
  let remaining = value < 0 ? -value * 2 + 1 : value * 2
  do {
    const digit = remaining % 32
    remaining = Math.floor(remaining / 32)
    encoded += BASE64[digit + (remaining ? 32 : 0)]
  } while (remaining)
  return encoded
}

// Map retained source spans precisely; generated markup has no invented source location.
// Scripts, styles and expressions supply character mappings. This is the only
// edit/mapping machinery the preprocessor needs.
export function source_map(
  source: string,
  code: string,
  filename: string,
  spans: { text: string; offset: number }[],
): SourceMap {
  const positions = new Map<number, number>()
  let search_from = 0
  for (const { text, offset } of spans) {
    const start = code.indexOf(text, search_from)
    if (start === -1 || code.indexOf(text) !== start || code.includes(text, start + 1))
      continue
    for (let idx = 0; idx < text.length; idx++) positions.set(start + idx, offset + idx)
    search_from = start + text.length
  }
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
    const offset = positions.get(idx)
    if (offset !== undefined) {
      let low = 0
      let high = lines.length
      while (low + 1 < high) {
        const middle = (low + high) >>> 1
        if (lines[middle] <= offset) low = middle
        else high = middle
      }
      const column = offset - lines[low]
      mappings += `${has_segment ? `,` : ``}${vlq(generated_column - previous_generated)}A${vlq(low - previous_line)}${vlq(column - previous_column)}`
      previous_generated = generated_column
      previous_line = low
      previous_column = column
      has_segment = true
      mapped = true
    } else if (mapped) {
      mappings += `${has_segment ? `,` : ``}${vlq(generated_column - previous_generated)}`
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
