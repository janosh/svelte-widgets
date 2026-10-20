// Svelte `{expression}` scanning shared by heading text, heading-anchor detection and the
// Markdown content manifest. Braces, quotes and `>` inside an expression's JS strings
// belong to the expression, not to the surrounding markup.

// A `/` here starts a regex literal (an expression may begin); elsewhere it divides
const regex_preceders = `(,=:[!&|?{};+-*%<>~^`

// Index of the last character of the string, comment or regex literal starting at `idx`,
// `idx` itself when none starts there, or -1 when it never ends. Template literals'
// `${}` holes are scanned as plain string text.
function literal_end(str: string, idx: number, prev: string): number {
  const [char, next] = [str[idx], str[idx + 1]]
  if (char === `/` && next === `/`) return str.indexOf(`\n`, idx)
  if (char === `/` && next === `*`) {
    const close = str.indexOf(`*/`, idx + 2)
    return close === -1 ? -1 : close + 1
  }
  const regex = char === `/` && regex_preceders.includes(prev)
  if (!regex && !`"'\``.includes(char)) return idx
  let in_class = false
  for (let pos = idx + 1; pos < str.length; pos++) {
    const current = str[pos]
    if (current === `\\`) pos++
    else if (regex && (current === `[` || current === `]`)) in_class = current === `[`
    else if (current === char && !in_class) return pos
  }
  return -1
}

// Index of the `}` closing the expression opened at `start`, or -1 when unclosed. Braces
// in JS strings, comments and regex literals (`{/[}]/.test(x)}`) aren't structural.
function find_svelte_expression_end(str: string, start: number): number {
  let depth = 1
  // `{/if}` closes a block: a `/` right after the opening brace starts no regex
  let prev = `)`
  for (let idx = start + 1; idx < str.length; idx++) {
    const end = literal_end(str, idx, prev)
    if (end === -1) return -1
    if (end > idx) {
      idx = end
      prev = `)` // a literal is an operand, so a `/` after it divides
      continue
    }
    const char = str[idx]
    if (char === `{`) depth++
    else if (char === `}` && --depth === 0) return idx
    if (!/\s/u.test(char)) prev = char
  }
  return -1
}

// End (after `>`) of the HTML opening tag starting at `start`, or -1 when unterminated. A `>`
// inside a quoted value or, with `svelte`, an `{expression}` at any depth doesn't end it.
export function opening_tag_end(str: string, start: number, svelte: boolean): number {
  let quote: string | undefined
  for (let idx = start + 1; idx < str.length; idx++) {
    const char = str[idx]
    if (quote) {
      if (char === quote) quote = undefined
    } else if (char === `"` || char === `'`) quote = char
    else if (svelte && char === `{`) {
      idx = find_svelte_expression_end(str, idx)
      if (idx === -1) return -1
    } else if (char === `>`) return idx + 1
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
