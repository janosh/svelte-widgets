// Decode backend SpanList (types.ts). UTF-16 offsets index JS strings directly; the
// backend never emits a boundary inside a surrogate pair.
//
// Malformed spans are a backend bug, but throwing would blank the editor; fall back to
// unstyled text.

import { clamp_integer } from '../utils'
import { CLASS_MASK, EMPHASIS_BIT, TOKEN_CLASS_NAMES } from './types'
import type { SpanList, TokenClassName } from './types'

export interface DecodedSpan {
  start: number // inclusive, UTF-16 code units
  end: number // exclusive, UTF-16 code units
  class_name: TokenClassName
  emphasized: boolean
}

const PLAIN: TokenClassName = `plain`

// Gap-free ranges covering [0, line_length). Empty lines yield []; unusable spans on a
// non-empty line yield one Plain span, so renderers need no unhighlighted special case.
export const decode_spans = (spans: SpanList, line_length: number): DecodedSpan[] => {
  const length = clamp_integer(line_length, 0)
  if (length === 0) return []

  if (!Array.isArray(spans) || spans.length < 2)
    return [{ start: 0, end: length, class_name: PLAIN, emphasized: false }]
  // A trailing odd element is a truncated pair with no class; drop it.
  const pair_count = Math.floor(spans.length / 2)

  const decoded: DecodedSpan[] = []
  let start = clamp_integer(spans[0], 0, length)
  // A first span starting past 0 would silently drop the line's prefix, so paint
  // the prefix as Plain rather than losing characters.
  if (start > 0) {
    decoded.push({ start: 0, end: start, class_name: PLAIN, emphasized: false })
  }
  for (let pair_idx = 0; pair_idx < pair_count; pair_idx++) {
    const end =
      pair_idx + 1 < pair_count
        ? clamp_integer(spans[(pair_idx + 1) * 2], start, length, start)
        : length
    if (end <= start) continue // zero-width span, nothing to render
    const raw_packed = spans[pair_idx * 2 + 1]
    const packed = Number.isFinite(raw_packed) ? Math.floor(raw_packed) : 0
    decoded.push({
      start,
      end,
      // An out-of-range class index means the two sides of the wire contract
      // drifted; render the text unstyled instead of crashing the line.
      class_name: TOKEN_CLASS_NAMES[packed & CLASS_MASK] ?? PLAIN,
      emphasized: (packed & EMPHASIS_BIT) !== 0,
    })
    start = end
  }
  // Non-empty lines always yield a span; prefix gaps are filled above.
  return decoded
}

export interface RenderedToken {
  start: number // doubles as the keyed-each identity
  text: string
  css: string
}

// Shared editor/diff tokenization; UTF-16 slicing stays in one place.
export const render_tokens = (text: string, spans: SpanList): RenderedToken[] =>
  decode_spans(spans, text.length).map((span) => ({
    start: span.start,
    text: text.slice(span.start, span.end),
    css: css_class_for(span.class_name, span.emphasized),
  }))

// tok-<name> maps to --tok-<name> in editor.css; tok-emph gets intra-line diff color
// from its row. code-editor-tokens.test.ts guards CSS class drift.
export const css_class_for = (class_name: TokenClassName, emphasized: boolean): string =>
  emphasized ? `tok-${class_name} tok-emph` : `tok-${class_name}`
