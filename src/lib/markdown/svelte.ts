import { parse, type AST } from 'svelte/compiler'
import type { SourceEdit } from './source-map.ts'

// Let Svelte parse JavaScript, including regexes, templates and TypeScript. Candidate
// closing braces are cheap to find; only Svelte decides whether they close the tag.
export function read_expression(source: string): string | undefined {
  if (!source.startsWith(`{`)) return undefined
  const closing = /^\{\/(?:if|each|await|key|snippet)\s*\}/u.exec(source)
  if (closing) return closing[0]
  const block = /^\{#(?<block>if|each|await|key|snippet)\b/u.exec(source)?.[1]
  const branch = /^\{:(?<branch>else|then|catch)\b/u.exec(source)?.[1]
  const prefix = branch === `else` ? `{#if true}` : branch ? `{#await promise}` : ``
  const suffix = block
    ? `{/${block}}`
    : branch === `else`
      ? `{/if}`
      : branch
        ? `{/await}`
        : ``
  let end = source.indexOf(`}`)
  let last_error: unknown
  while (end !== -1) {
    const raw = source.slice(0, end + 1)
    try {
      parse(`<script lang="ts"></script>${prefix}${raw}${suffix}`, { modern: true })
      return raw
    } catch (error) {
      last_error = error
    }
    end = source.indexOf(`}`, end + 1)
  }
  throw new Error(`Invalid Svelte expression: ${source.slice(0, 100)}`, {
    cause: last_error,
  })
}

export function read_tag(source: string): string | undefined {
  // URI autolinks belong to Markdown, including schemes with no // (mailto:, tel:).
  if (/^<[A-Za-z][\w+.-]*:[^\s<>]*>/u.test(source) && !source.startsWith(`<svelte:`))
    return undefined
  if (source.startsWith(`<!--`)) {
    const end = source.indexOf(`-->`)
    if (end === -1) throw new Error(`Unclosed HTML comment`)
    return source.slice(0, end + 3)
  }
  const match = /^<\/?(?<tag>[a-zA-Z][\w:.-]*)(?=[\s/>])/u.exec(source)
  if (!match) return undefined
  let quote = ``
  for (let idx = match[0].length; idx < source.length; idx++) {
    const char = source[idx]
    if (char === `{`) {
      const expression = read_expression(source.slice(idx))
      if (expression) idx += expression.length - 1
    } else if (quote) {
      if (char === quote) quote = ``
    } else if (char === `"` || char === `'`) quote = char
    else if (char === `>`) {
      if (/^<(?:script|style|code|pre|textarea)\b/u.test(source)) {
        const close = `</${match[1]}>`
        const end = source.indexOf(close, idx + 1)
        if (end === -1) throw new Error(`Unclosed ${match[1]} tag`)
        return source.slice(0, end + close.length)
      }
      return source.slice(0, idx + 1)
    }
  }
  throw new Error(`Unclosed Svelte tag: ${source.slice(0, 100)}`)
}

export function script_edits(
  code: string,
  imports: string,
  metadata?: Record<string, unknown>,
  tree?: AST.Root,
): SourceEdit[] {
  if (!imports && metadata === undefined) return []
  tree ??= parse(code, { modern: true })
  const declaration =
    metadata !== undefined
      ? `export const metadata = JSON.parse(${JSON.stringify(JSON.stringify(metadata)).replaceAll(`<`, `\\u003c`)});\n`
      : ``
  const script_start = (start: number) =>
    start +
    (/^<script\b(?:[^>"']|"[^"]*"|'[^']*')*>/u.exec(code.slice(start))?.[0].length ?? 0)
  const edits: SourceEdit[] = []
  for (const [node, text, attributes] of [
    [tree.instance, imports, ``],
    [tree.module, declaration, ` module`],
  ] as const) {
    if (!text) continue
    const offset = node ? script_start(node.start) : 0
    edits.unshift({
      start: offset,
      end: offset,
      text: node ? text : `<script${attributes}>${text}</script>\n`,
    })
  }
  return edits
}

export function visible_code(
  source: string,
  hide_script?: boolean,
  hide_style?: boolean,
): string {
  if (!hide_script && !hide_style) return source
  const tree = parse(source, { modern: true })
  const ranges = [
    hide_script && tree.instance,
    hide_script && tree.module,
    hide_style && tree.css,
  ]
    .filter((node) => node !== false && node != null)
    .toSorted((left, right) => right.start - left.start)
  for (const { start, end } of ranges) source = source.slice(0, start) + source.slice(end)
  return source.trim()
}
