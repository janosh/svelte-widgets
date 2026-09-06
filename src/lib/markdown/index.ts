import { CORE_SCHEMA, load } from 'js-yaml'
import {
  Marked,
  Renderer,
  type Token,
  type Tokens,
  type TokenizerAndRendererExtension,
} from 'marked'
import type { KatexOptions } from 'katex'

import type { PreprocessorGroup } from 'svelte/compiler'
import { escape_html_text } from '../highlight/hast.ts'
import { source_map, type SourceMap } from './source-map.ts'
import type * as SvelteSyntax from './svelte.ts'

export type { KatexOptions } from 'katex'

export type ExampleOptions = {
  wrapper?: string | [string, string]
  collapsible?: boolean
  hide_script?: boolean
  hide_style?: boolean
  code_above?: boolean
  csr?: boolean
}
export type MarkdownOptions = {
  extensions?: string[]
  // Return the HTML inside <code>. Omit for plain, escaped code.
  highlight?: (code: string, language: string) => string | Promise<string>
  math?: boolean | KatexOptions
  typography?: boolean
  examples?: ExampleOptions
}
export type MarkdownFile = { filename?: string }
export type LiveExample = { id: string; source: string }
export type MarkdownResult = {
  code: string
  metadata: Record<string, unknown>
  examples: LiveExample[]
  map: SourceMap
}

const escape_braces = (text: string): string =>
  text.replaceAll(`{`, `&#123;`).replaceAll(`}`, `&#125;`)
const script_json = (value: unknown): string =>
  JSON.stringify(value).replaceAll(`<`, `\\u003c`)
const smart_quotes = (text: string): string =>
  text
    .replaceAll(`...`, `…`)
    .replaceAll(/(?<!-)--(?!-)/gu, `—`)
    .replaceAll(/(?<space>^|[\s([{])"/gu, `$1“`)
    .replaceAll(`"`, `”`)
    .replaceAll(/(?<space>^|[\s([{])'/gu, `$1‘`)
    .replaceAll(`'`, `’`)

function frontmatter(source: string): {
  body: string
  metadata?: Record<string, unknown>
} {
  const match =
    /^\uFEFF?---[ \t]*\r?\n(?<yaml>(?:[^\n]*\n)*?)(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/u.exec(
      source,
    )
  if (!match) {
    if (/^\uFEFF?---[ \t]*\r?\n/u.test(source))
      throw new Error(`Unclosed YAML frontmatter`)
    return { body: source }
  }
  const value: unknown = load(`---\n${match[1]}`, { schema: CORE_SCHEMA })
  if (
    value !== undefined &&
    value !== null &&
    (typeof value !== `object` || Array.isArray(value))
  )
    throw new Error(`Frontmatter must be a mapping`)
  // Serialization rejects cyclic aliases and normalizes the exported metadata contract.
  const serialized = JSON.stringify(value ?? {}, (_key, item: unknown) => {
    if (typeof item === `number` && !Number.isFinite(item))
      throw new Error(`Frontmatter numbers must be finite: ${item}`)
    return item
  })
  return {
    body: source.slice(match[0].length),
    metadata: JSON.parse(serialized) as Record<string, unknown>,
  }
}

function parse_meta(source: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let rest = source.trim()
  while (rest) {
    const key =
      /^(?<key>[a-zA-Z_]\w*)(?:=(?<value>"(?:[^"\\]|\\.)*"|\[[^\]]*\]|[^\s]+))?(?:\s+|$)/u.exec(
        rest,
      )
    if (!key) throw new Error(`Invalid code fence metadata: ${rest}`)
    result[key[1]] = key[2] === undefined ? true : JSON.parse(key[2])
    rest = rest.slice(key[0].length)
  }
  return result
}

async function process_markdown(
  source: string,
  options: MarkdownOptions,
  filename: string,
  syntax?: typeof SvelteSyntax,
): Promise<Omit<MarkdownResult, 'map'> & { spans: { text: string; offset: number }[] }> {
  const { body, metadata } = frontmatter(source)
  const math = options.math ? await import(`katex`) : undefined
  const examples: LiveExample[] = []
  const imports: string[] = []
  const wrappers = new Map<string, string>()
  const spans: { text: string; offset: number }[] = []
  const code_html = new Map<Token, string>()
  const retained: string[] = []
  // Collision-free placeholders avoid re-parsing expressions as Markdown or typography.
  let sentinel = `\uE000widgets`
  while (source.includes(sentinel)) sentinel += `_`
  const retain = (text: string): string => `${sentinel}${retained.push(text) - 1}\uE001`
  const url_attribute = (url: string): string => {
    let result = ``
    let cursor = 0
    while (cursor < url.length) {
      const start = url.indexOf(`{`, cursor)
      const end = start === -1 ? url.length : start
      result += encodeURI(url.slice(cursor, end)).replaceAll(`%25`, `%`)
      if (start === -1 || !syntax) break
      const expression = syntax.read_expression(url.slice(start))
      if (!expression) throw new Error(`Invalid URL expression: ${url}`)
      result += retain(expression)
      cursor = start + expression.length
    }
    return result
  }
  const html = (text: string): string => (syntax ? `{@html ${script_json(text)}}` : text)
  const extensions: TokenizerAndRendererExtension[] = []
  if (syntax) {
    const read = (text: string) => syntax.read_expression(text) ?? syntax.read_tag(text)
    extensions.push(
      {
        name: `svelte_block`,
        level: `block`,
        start: (text) => text.search(/\n(?=\{[#:/@]|<(?:script|style|svelte:|[A-Z]))/u),
        tokenizer(text) {
          if (!/^(?:\{[#:/@]|<(?:script|style|svelte:|[A-Z]))/u.test(text))
            return undefined
          const raw = read(text)
          if (raw) return { type: `svelte_block`, raw, text: retain(raw) }
          return undefined
        },
        renderer: (token) => String(token.text),
      },
      {
        name: `svelte_inline`,
        level: `inline`,
        start: (text) => text.search(/[<{]/u),
        tokenizer(text) {
          const raw = read(text)
          if (raw) return { type: `svelte_inline`, raw, text: retain(raw) }
          return undefined
        },
        renderer: (token) => String(token.text),
      },
    )
  }
  if (math) {
    const render_math = (tex: string, displayMode: boolean) =>
      html(
        math.renderToString(tex.trim(), {
          ...(typeof options.math === `object` ? options.math : {}),
          displayMode,
        }),
      )
    extensions.push(
      {
        name: `math_block`,
        level: `block`,
        start: (text) => text.search(/\n {0,3}\$\$/u),
        tokenizer(text) {
          const match =
            /^ {0,3}\$\$[ \t]*\n(?<tex>[\s\S]*?)\n {0,3}\$\$[ \t]*(?:\n|$)/u.exec(text)
          if (match)
            return {
              type: `math_block`,
              raw: match[0],
              text: render_math(match[1], true),
            }
          return undefined
        },
        renderer: (token) => `${String(token.text)}\n`,
      },
      {
        name: `math_inline`,
        level: `inline`,
        start: (text) => text.indexOf(`$`),
        tokenizer(text) {
          if (this.lexer.state.inRawBlock) return undefined
          const display = /^\$\$(?<tex>[^\n]+?)\$\$(?!\$)/u.exec(text)
          const inline =
            /^\$(?![\s${])(?<tex>(?:\\.|[^\\\n$])+?)(?<![\s\\])\$(?![\d$])/u.exec(text)
          const match = display ?? inline
          if (match)
            return {
              type: `math_inline`,
              raw: match[0],
              text: render_math(match[1], Boolean(display)),
            }
          return undefined
        },
        renderer: (token) => String(token.text),
      },
    )
  }
  const parser = new Marked({
    gfm: true,
    extensions,
    renderer: {
      link(token) {
        const result = Renderer.prototype.link.call(this, token)
        if (!syntax || !token.href.includes(`{`)) return result
        // Marked URI-encodes braces. Preserve authored Svelte URL expressions instead.
        return result.replace(
          /href="[^"]*"/u,
          () => `href="${url_attribute(token.href)}"`,
        )
      },
      image(token) {
        const result = Renderer.prototype.image.call(this, token)
        if (!syntax || !token.href.includes(`{`)) return result
        return result.replace(/src="[^"]*"/u, () => `src="${url_attribute(token.href)}"`)
      },
      code(token) {
        return code_html.get(token) ?? ``
      },
      codespan({ text }) {
        return `<code>${escape_braces(escape_html_text(text))}</code>`
      },
      text(token) {
        if (`tokens` in token && token.tokens)
          return this.parser.parseInline(token.tokens)
        const text =
          options.typography && token.type !== `escape`
            ? smart_quotes(token.text)
            : token.text
        return escape_braces(Renderer.prototype.text.call(this, { ...token, text }))
      },
    },
  })
  const tokens = parser.lexer(body)
  const code_tokens: Tokens.Code[] = []
  void parser.walkTokens(tokens, (token) => {
    if (token.type === `code`) code_tokens.push(token as Tokens.Code)
  })
  // Assign module IDs and imports in source order before asynchronous highlighting.
  await Promise.all(
    code_tokens.map(async (token, idx) => {
      const [language = ``, ...info] = (token.lang ?? ``).split(/\s+/u)
      const meta: Record<string, unknown> = options.examples
        ? { ...options.examples, ...parse_meta(info.join(` `)) }
        : {}
      for (const key of [
        `example`,
        `csr`,
        `hide_script`,
        `hide_style`,
        `collapsible`,
        `code_above`,
      ]) {
        if (meta[key] !== undefined && typeof meta[key] !== `boolean`)
          throw new Error(`Code fence option ${key} must be boolean`)
      }
      const live = Boolean(meta.example) && (language === `svelte` || language === `html`)
      let display_code = token.text
      let wrapper_alias = ``
      let component = ``
      let module_id = ``
      if (live) {
        if (!syntax) throw new Error(`Live examples require Svelte output`)
        display_code = syntax.visible_code(
          token.text,
          meta.hide_script === true,
          meta.hide_style === true,
        )
        const wrapper = meta.wrapper ?? [`svelte-widgets`, `CodeExample`]
        const key = JSON.stringify(wrapper)
        let alias = wrappers.get(key)
        if (alias === undefined) {
          alias = `WidgetsExampleWrapper${wrappers.size}`
          if (typeof wrapper === `string`)
            imports.push(`import ${alias} from ${script_json(wrapper)};\n`)
          else if (
            Array.isArray(wrapper) &&
            wrapper.length === 2 &&
            wrapper.every((part) => typeof part === `string`) &&
            /^[A-Za-z_$][\w$]*$/u.test(wrapper[1])
          )
            imports.push(
              `import { ${wrapper[1]} as ${alias} } from ${script_json(wrapper[0])};\n`,
            )
          else throw new Error(`Invalid example wrapper: ${key}`)
          wrappers.set(key, alias)
        }
        wrapper_alias = alias
        component = `WidgetsLiveExample${idx}`
        module_id = `${filename}.widgets-example-${idx}.svelte`
        examples.push({ id: module_id, source: token.text })
        if (!meta.csr)
          imports.push(`import ${component} from ${script_json(module_id)};\n`)
      }
      const highlighted = options.highlight
        ? await options.highlight(display_code, language)
        : escape_html_text(display_code)
      if (!live) {
        const language_class = escape_braces(
          escape_html_text(language).replaceAll(`"`, `&quot;`),
        )
        code_html.set(
          token,
          `<pre class="highlight${language ? ` highlight-${language_class}` : ``}"><code>${html(`${highlighted}\n`)}</code></pre>\n`,
        )
        return undefined
      }
      const example = meta.csr
        ? `{#if typeof window !== 'undefined'}{#await import(${script_json(module_id)}) then module}{@const ${component} = module.default}<${component} />{/await}{/if}`
        : `<${component} />`
      code_html.set(
        token,
        `<${wrapper_alias} src={${script_json(display_code)}} meta={${script_json({ ...meta, lang: language })}}>{#snippet example()}${example}{/snippet}{#snippet code()}${html(highlighted)}{/snippet}</${wrapper_alias}>\n`,
      )
      return undefined
    }),
  )
  let code = parser.parser(tokens)
  let source_cursor = 0
  code = code.replaceAll(
    new RegExp(`${sentinel}(\\d+)\uE001`, `gu`),
    (_match, index: string) => {
      const text = retained[Number(index)]
      const offset = source.indexOf(text, source_cursor)
      // Marked does not expose token offsets. Repeated text is ambiguous (it may also
      // occur inside a code fence), so omit its mapping instead of guessing a location.
      if (
        offset !== -1 &&
        source.indexOf(text) === offset &&
        !source.includes(text, offset + 1)
      ) {
        const opening = /^<script\b(?:[^>"']|"[^"]*"|'[^']*')*>/u.exec(text)?.[0]
        if (opening) {
          spans.push(
            { text: opening, offset },
            { text: text.slice(opening.length), offset: offset + opening.length },
          )
        } else spans.push({ text, offset })
        source_cursor = offset + text.length
      }
      return text
    },
  )
  if (syntax) code = syntax.inject_scripts(code, imports.join(``), metadata)
  return { code, metadata: metadata ?? {}, examples, spans }
}

export async function compile_markdown(
  source: string,
  options: MarkdownOptions & MarkdownFile = {},
): Promise<MarkdownResult> {
  const filename = options.filename ?? `document.md`
  try {
    const { spans, ...result } = await process_markdown(
      source,
      options,
      filename,
      await import('./svelte.ts'),
    )
    return { ...result, map: source_map(source, result.code, filename, spans) }
  } catch (cause) {
    throw new Error(
      `${filename}: ${cause instanceof Error ? cause.message : String(cause)}`,
      { cause },
    )
  }
}

// Trusted authored Markdown -> HTML, without loading the Svelte compiler or interpreting
// braces. Raw HTML is retained; this function is not an HTML sanitizer.
export async function render_markdown(
  source: string,
  options: Omit<MarkdownOptions, 'examples' | 'extensions'> = {},
): Promise<string> {
  return (await process_markdown(source, options, `document.md`)).code
}

export function markdown(options: MarkdownOptions = {}): PreprocessorGroup {
  return {
    name: `widgets-markdown`,
    async markup({ content, filename }) {
      if (
        !filename ||
        !(options.extensions ?? [`.md`, `.svx`]).some((extension) =>
          filename.endsWith(extension),
        )
      )
        return undefined
      const result = await compile_markdown(content, { ...options, filename })
      if (result.examples.length)
        throw new Error(`${filename}: use markdown_vite() for live examples`)
      return result
    },
  }
}
