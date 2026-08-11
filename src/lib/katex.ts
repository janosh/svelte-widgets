// Svelte preprocessor that turns $…$ / $$…$$ into {@html katex…}.
// Runs as a before/after pair around mdsvex: before stashes rendered KaTeX behind
// placeholders (so markdown cannot mangle URLs/braces inside the HTML), after
// expands them to {@html …}. This also avoids remark-math@3 (mdsvex's unified v9
// cannot load remark-math@4+).

import { Buffer } from 'node:buffer'
import { randomUUID as random_uuid } from 'node:crypto'
import { renderToString as render_to_string } from 'katex'
import type { KatexOptions } from 'katex'

export type { KatexOptions } from 'katex'

type MarkupArgs = { content: string; filename?: string }

const MATH_FILE = /\.(?:md|svx)$/u
// Pandoc-style inline math: no space/{ after open $, no space before close, no digit after.
// Rejects `${…}` template literals; `$state` / `$lib` have no closing $ on the same span.
const INLINE_MATH =
  /(?<![\\$])\$(?![\s${])(?<tex>(?:\\.|[^\\\n$])+?)(?<![\s\\])\$(?![\d$])/gu
const DISPLAY_BLOCK_MATH =
  /^ {0,3}\$\$[ \t]*\r?\n(?<tex>[\s\S]+?)\r?\n {0,3}\$\$[ \t]*\r?$/gmu
const DISPLAY_INLINE_MATH = /(?<![\\$])\$\$(?<tex>[^\r\n]+?)\$\$(?!\$)/gu

// Private-use sentinels survive markdown; a per-instance nonce prevents source collisions.
const [SLOT_OPEN, SLOT_CLOSE] = [`\uE000`, `\uE001`]

// Fences first (they wrap <script> in live examples), then indented code, comments,
// script/style outside fences and inline code. Overlaps can nest placeholders.
const PROTECT_PATTERNS = [
  /^ {0,3}(?<fence>`{3,})[^\r\n]*(?:\r?\n(?:[\s\S]*?^ {0,3}\k<fence>`*[ \t]*\r?$|[\s\S]*(?![\s\S]))|(?![\s\S]))/gmu,
  /^ {0,3}(?<fence>~{3,})[^\r\n]*(?:\r?\n(?:[\s\S]*?^ {0,3}\k<fence>~*[ \t]*\r?$|[\s\S]*(?![\s\S]))|(?![\s\S]))/gmu,
  /^(?: {4,}|\t)[^\r\n]*(?:\r?\n|$)/gmu,
  /<!--[\s\S]*?-->/gu,
  /<(?<tag>script|style)\b[^>]*>[\s\S]*?<\/\k<tag>>/giu,
  /(?<ticks>`+)(?!`)[\s\S]*?(?<!`)\k<ticks>(?!`)/gu,
]

const restore = (text: string, parts: string[], part_token: string): string => {
  const part_re = new RegExp(`${part_token}(?<idx>\\d+)\\0`, `gu`)
  let restored = text
  while (restored.includes(part_token)) {
    restored = restored.replace(part_re, (_, idx: string) => {
      const part = parts[Number(idx)]
      if (part === undefined) throw new Error(`Missing protected KaTeX part ${idx}`)
      return part
    })
  }
  return restored
}

export function katex_preprocess(options: KatexOptions = {}) {
  // Wire as `[katex.before, mdsvex(…), katex.after, …]` — if after runs before
  // mdsvex, markdown linkifies xmlns URLs and smart-quotes the `{@html}` payload.
  const nonce = random_uuid()
  const part_token = `\0katex-${nonce}-`
  const slot_token = `${SLOT_OPEN}katex-${nonce}-`
  const slot_re = new RegExp(
    `${slot_token}(?<encoded_html>[A-Za-z0-9_-]+)${SLOT_CLOSE}`,
    `gu`,
  )
  const before = {
    name: `katex-before`,
    markup({ content, filename }: MarkupArgs) {
      if (filename !== undefined && !MATH_FILE.test(filename)) return { code: content }
      if (!content.includes(`$`)) return { code: content }

      const slot = (tex: string, display_mode: boolean): string => {
        const html = render_to_string(tex.trim(), {
          ...options,
          displayMode: display_mode,
        })
        return `${slot_token}${Buffer.from(html).toString(`base64url`)}${SLOT_CLOSE}`
      }

      const protected_ranges = PROTECT_PATTERNS.flatMap((pattern) =>
        Array.from(content.matchAll(pattern), (match) => ({
          end: match.index + match[0].length,
          start: match.index,
        })),
      )
      const parts: string[] = []
      const stash = (match: string) => {
        parts.push(match)
        return `${part_token}${parts.length - 1}\0`
      }
      let text = content.replace(
        DISPLAY_BLOCK_MATH,
        (match, tex: string, offset: number) =>
          protected_ranges.some(({ end, start }) => start <= offset && offset < end)
            ? match
            : slot(tex, true),
      )
      for (const pattern of PROTECT_PATTERNS) text = text.replace(pattern, stash)

      text = text
        .replace(DISPLAY_INLINE_MATH, (_match, tex: string) => slot(tex, true))
        .replace(INLINE_MATH, (_match, tex: string) => slot(tex, false))
      return { code: restore(text, parts, part_token) }
    },
  }

  const after = {
    name: `katex-after`,
    markup({ content }: MarkupArgs) {
      return {
        code: content.replace(
          slot_re,
          (_, encoded_html: string) =>
            `{@html ${JSON.stringify(Buffer.from(encoded_html, `base64url`).toString())}}`,
        ),
      }
    },
  }

  return { before, after }
}
