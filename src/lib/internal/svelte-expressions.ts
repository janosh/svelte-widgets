// Svelte `{expression}` scanning shared by heading text, heading-anchor detection and the
// Markdown content manifest. Braces, quotes and `>` inside an expression's JS strings
// belong to the expression, not to the surrounding markup.

// Index of the `}` closing the expression opened at `start`, or -1 when unclosed
function find_svelte_expression_end(str: string, start: number): number {
  let depth = 0
  let quote: string | undefined
  for (let idx = start; idx < str.length; idx++) {
    const char = str[idx]
    if (quote) {
      if (char === `\\`) idx++ // skip the escaped character
      else if (char === quote) quote = undefined
    } else if (char === `"` || char === `'` || char === `\``) quote = char
    else if (char === `{`) depth++
    else if (char === `}` && --depth === 0) return idx
  }
  return -1
}

// Stripping drops an unclosed expression with the rest of the text. Masking keeps the text's
// length so offsets stay valid, and leaves an unclosed expression as authored.
function replace_svelte_expressions(str: string, mask: boolean): string {
  let result = ``
  let cursor = 0
  for (let start = str.indexOf(`{`); start !== -1; start = str.indexOf(`{`, cursor)) {
    result += str.slice(cursor, start)
    const end = find_svelte_expression_end(str, start)
    if (end === -1) return mask ? result + str.slice(start) : result
    if (mask) result += `{${`_`.repeat(end - start - 1)}}`
    cursor = end + 1
  }
  return result + str.slice(cursor)
}

export const strip_svelte_expressions = (str: string): string =>
  replace_svelte_expressions(str, false)

// Same-length `{___}` placeholders, so tag and attribute patterns cannot end a tag at a `>`
// in `onclick={() => go()}` or a quote in `title="{a ? "x" : "y"}"`.
export const mask_svelte_expressions = (str: string): string =>
  replace_svelte_expressions(str, true)
