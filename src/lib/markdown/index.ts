import { example_key, fence_info, type ExampleOptions } from './meta.ts'
import { scientific_references, type ReferenceOptions } from './references.ts'
import { CORE_SCHEMA, load, YAMLException } from 'js-yaml'
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
import {
  source_map,
  edit_source,
  type SourceMap,
  type SourceSpan,
  type SourceEdit,
  type MappedSource,
} from './source-map.ts'
import {
  assert_ok,
  DiagnosticError,
  diagnostic_result,
  error_diagnostics,
  source_locator,
  freeze_data,
  type DeepReadonly,
  type DiagnosticResult,
} from './diagnostics.ts'
import type * as Katex from 'katex'
import {
  content_manifest,
  type ContentManifest,
  type FrontmatterValidator,
  type TokenSource,
} from './content.ts'

export { assert_ok, DiagnosticError } from './diagnostics.ts'
export type { Diagnostic, DiagnosticResult, SourceRange } from './diagnostics.ts'
export type { Citation, ContentReference, ReferenceOptions } from './references.ts'

export {
  assert_valid_content,
  content_search_record,
  content_toc,
  validate_content,
} from './content.ts'
export type {
  ContentFence,
  ContentHeading,
  ContentLink,
  ContentManifest,
  FrontmatterValidator,
  SourcePosition,
} from './content.ts'

export type { KatexOptions } from 'katex'

export type { ExampleOptions, FenceSettings } from './meta.ts'
export type MarkdownOptions = {
  extensions?: string[]
  // Return the HTML inside <code>. Omit for plain, escaped code.
  highlight?: (code: string, language: string) => string | Promise<string>
  math?: boolean | KatexOptions
  references?: boolean | ReferenceOptions
  typography?: boolean
  examples?: ExampleOptions
  validate_frontmatter?: FrontmatterValidator
}
export type MarkdownFile = { filename?: string }
export type LiveExample = { id: string; source: string }
export type MarkdownResult<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly code: string
  readonly metadata: DeepReadonly<Metadata>
  readonly examples: DeepReadonly<LiveExample[]>
  readonly map: DeepReadonly<SourceMap>
  readonly manifest: ContentManifest<Metadata>
}

export type MarkdownDocument<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly source: string
  readonly filename: string
  readonly dialect: 'markdown' | 'svelte'
  readonly metadata: DeepReadonly<Metadata>
  readonly manifest: ContentManifest<Metadata>
}
export type MarkdownInput = MarkdownFile & { dialect?: 'markdown' | 'svelte' }
export type MarkdownEngine<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly options: MarkdownOptions
  parse: (
    source: string,
    input?: MarkdownInput,
  ) => Promise<DiagnosticResult<MarkdownDocument<Metadata>>>
}
type PreparedDocument = {
  code: string
  examples: LiveExample[]
  map: SourceMap
}
const prepared_documents = new WeakMap<
  MarkdownDocument,
  () => Promise<PreparedDocument>
>()

// KaTeX options can contain callbacks and cyclic token/lexer graphs. Retain callbacks
// and prototypes while copying data so later configuration edits cannot alter a document.
const copy_options = <Value>(
  value: Value,
  copies = new WeakMap<object, object>(),
): Value => {
  if (value === null || typeof value !== `object`) return value
  const existing = copies.get(value)
  if (existing) return existing as Value
  const copy: object = Array.isArray(value)
    ? []
    : Object.create(Object.getPrototypeOf(value))
  copies.set(value, copy)
  for (const [key, entry] of Object.entries(value))
    Object.defineProperty(copy, key, {
      value: copy_options(entry, copies),
      enumerable: true,
      writable: true,
      configurable: true,
    })
  return copy as Value
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

function serialize_metadata(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== `object` || Array.isArray(value))
    throw new Error(`Frontmatter must be a mapping`)
  const serialized = JSON.stringify(
    value,
    function (this: Record<string, unknown>, key: string, item: unknown) {
      const original: unknown = this[key]
      if (
        !Object.is(original, item) ||
        (typeof item === `object` &&
          item !== null &&
          !Array.isArray(item) &&
          Object.getPrototypeOf(item) !== Object.prototype &&
          Object.getPrototypeOf(item) !== null) ||
        ![`object`, `string`, `boolean`, `number`].includes(typeof item)
      )
        throw new Error(`Frontmatter value at ${JSON.stringify(key)} must be JSON data`)
      if (typeof item === `number` && !Number.isFinite(item))
        throw new Error(`Frontmatter numbers must be finite: ${item}`)
      return item
    },
  )
  return JSON.parse(serialized) as Record<string, unknown>
}

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
  const header = source.slice(0, source.indexOf(`\n`) + 1)
  const value: unknown = load(header + match[1], { schema: CORE_SCHEMA })
  return {
    body: source.slice(match[0].length),
    metadata: serialize_metadata(value ?? {}),
  }
}

async function prepare_document(
  source: string,
  options: MarkdownOptions,
  filename: string,
  dialect: 'markdown' | 'svelte',
): Promise<MarkdownDocument> {
  const syntax = dialect === `svelte` ? await import('./svelte.ts') : undefined
  const locate = source_locator(source, filename)
  let body = source
  let metadata: Record<string, unknown> | undefined
  try {
    const parsed = frontmatter(source)
    body = parsed.body
    metadata = options.validate_frontmatter
      ? serialize_metadata(
          options.validate_frontmatter(
            parsed.metadata ?? {},
            locate(0, source.length - body.length),
          ),
        )
      : parsed.metadata
  } catch (error) {
    const mark = error instanceof YAMLException ? error.mark : undefined
    const offset = mark?.position ?? 0
    throw new DiagnosticError(
      error_diagnostics(
        error,
        `frontmatter`,
        locate(offset, mark ? offset + 1 : source.length - (body ?? source).length),
      ),
    )
  }
  let math: typeof Katex | undefined
  const examples: LiveExample[] = []
  const imports: string[] = []
  const wrappers = new Map<string, string>()
  const example_keys = new Map<string, { identity: string; count: number }>()
  const positions = new Map<Token, TokenSource>()
  const heading_ids = new Map<Token, string>()
  const html_edits = new Map<Token, SourceEdit[]>()
  const code_html = new Map<Token, string>()
  const retained: MappedSource[] = []
  // Collision-free placeholders avoid re-parsing expressions as Markdown or typography.
  let sentinel = `\uE000widgets`
  while (source.includes(sentinel)) sentinel += `_`
  const retain = (text: string, spans: SourceSpan[] = []): string =>
    `${sentinel}${retained.push({ code: text, spans }) - 1}\uE001`
  const url_attribute = (token: Tokens.Link | Tokens.Image): string => {
    const url = token.href
    let raw_cursor = token.raw.indexOf(`](`) + 2
    let result = ``
    let cursor = 0
    while (cursor < url.length) {
      const start = url.indexOf(`{`, cursor)
      const end = start === -1 ? url.length : start
      result += encodeURI(url.slice(cursor, end)).replaceAll(`%25`, `%`)
      if (start === -1 || !syntax) break
      const expression = syntax.read_expression(url.slice(start))
      if (!expression) throw new Error(`Invalid URL expression: ${url}`)
      const raw_start = token.raw.indexOf(expression, raw_cursor)
      const offsets = positions.get(token)?.offsets
      const spans: SourceSpan[] = []
      if (raw_start !== -1 && offsets) {
        for (let idx = 0; idx < expression.length; idx++)
          spans.push({ generated: idx, original: offsets[raw_start + idx], length: 1 })
        raw_cursor = raw_start + expression.length
      }
      result += retain(expression, spans)
      cursor = start + expression.length
    }
    return result
  }
  const html = (text: string): string => (syntax ? `{@html ${script_json(text)}}` : text)
  const render_math = options.math
    ? (tex: string, displayMode: boolean) =>
        html(
          math
            ? math.renderToString(tex.trim(), {
                ...(typeof options.math === `object` ? options.math : {}),
                displayMode,
              })
            : escape_html_text(tex.trim()),
        )
    : undefined
  const references = options.references
    ? scientific_references(
        typeof options.references === `object` ? options.references : {},
        render_math ? (tex) => render_math(tex, true) : undefined,
      )
    : undefined
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
  if (render_math) {
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
              tex: match[1],
            }
          return undefined
        },
        renderer: (token) => `${render_math(String(token.tex), true)}\n`,
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
              tex: match[1],
              display: Boolean(display),
            }
          return undefined
        },
        renderer: (token) => render_math(String(token.tex), Boolean(token.display)),
      },
    )
  }
  if (references) extensions.push(...references.extensions)
  const parser = new Marked({
    gfm: true,
    extensions,
    renderer: {
      heading(token) {
        const id = heading_ids.get(token)
        return `<h${token.depth}${id ? ` id="${escape_html_text(id).replaceAll(`"`, `&quot;`)}"` : ``}>${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`
      },
      html(token) {
        const mapped = mapped_token(token)
        return retain(mapped.code, mapped.spans)
      },
      link(token) {
        const result = Renderer.prototype.link.call(this, token)
        if (!syntax || !token.href.includes(`{`)) return result
        // Marked URI-encodes braces. Preserve authored Svelte URL expressions instead.
        return result.replace(/href="[^"]*"/u, () => `href="${url_attribute(token)}"`)
      },
      image(token) {
        const result = Renderer.prototype.image.call(this, token)
        if (!syntax || !token.href.includes(`{`)) return result
        return result.replace(/src="[^"]*"/u, () => `src="${url_attribute(token)}"`)
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
  const mapped_token = (token: Token): MappedSource => {
    const offsets = positions.get(token)?.offsets ?? []
    const spans: SourceSpan[] = []
    for (let idx = 0; idx < offsets.length; idx++) {
      const previous = spans.at(-1)
      if (previous && previous.original + previous.length === offsets[idx])
        previous.length++
      else spans.push({ generated: idx, original: offsets[idx], length: 1 })
    }
    return edit_source({ code: token.raw, spans }, html_edits.get(token) ?? [])
  }
  const restore_text = (text: string) =>
    text.replaceAll(
      new RegExp(`${sentinel}(\\d+)\uE001`, `gu`),
      (_match, index: string) => retained[Number(index)].code,
    )
  const tokens = parser.lexer(body)
  references?.resolve(tokens, parser)
  const manifest = content_manifest(
    source,
    body,
    filename,
    metadata ?? {},
    tokens,
    parser,
    restore_text,
    {
      svelte: dialect === `svelte`,
      positions,
      heading_ids,
      html_edits,
      reserved_ids: references?.reserved_ids(),
      examples: options.examples,
    },
  )
  references?.update_manifest(manifest, positions)
  const code_tokens: Tokens.Code[] = []
  for (const [token] of positions) {
    if (token.type === `code`) code_tokens.push(token as Tokens.Code)
    if (token.type !== `svelte_block` && token.type !== `svelte_inline`) continue
    const index = Number(String(token.text).slice(sentinel.length, -1))
    retained[index] = mapped_token(token)
  }
  const document: MarkdownDocument = freeze_data({
    source,
    filename,
    dialect,
    metadata: manifest.metadata,
    manifest,
  })
  // Validate fence settings and assign identities during analysis, before rendering.
  const render_fences = code_tokens.map((token) => {
    try {
      const fence = positions.get(token)?.fence
      const { language } = fence ?? fence_info(token)
      const meta = fence?.settings ?? {}
      const live =
        Boolean(options.examples && meta.example) &&
        (language === `svelte` || language === `html`)
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
          else
            imports.push(
              `import { ${wrapper[1]} as ${alias} } from ${script_json(wrapper[0])};\n`,
            )
          wrappers.set(key, alias)
        }
        wrapper_alias = alias
        const identity =
          meta.id === undefined ? `${language}\0${token.text}` : `id:${meta.id}`
        const identity_key = example_key(identity)
        const existing = example_keys.get(identity_key)
        if (existing && existing.identity !== identity)
          throw new Error(
            `Example identity collision; assign distinct explicit id values`,
          )
        if (existing && meta.id !== undefined)
          throw new Error(`Duplicate example id: ${meta.id}`)
        const occurrence = existing?.count ?? 0
        example_keys.set(identity_key, { identity, count: occurrence + 1 })
        component = `WidgetsLiveExample_${identity_key.replaceAll(`-`, `_`)}_${occurrence}`
        module_id = `${filename}.widgets-example-${identity_key}-${occurrence}.svelte`
        examples.push({ id: module_id, source: token.text })
        if (!meta.csr)
          imports.push(`import ${component} from ${script_json(module_id)};\n`)
      }
      return async () => {
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
      }
    } catch (error) {
      throw new DiagnosticError(
        error_diagnostics(error, `fence`, positions.get(token)?.range ?? locate(0)),
      )
    }
  })
  let pending: Promise<PreparedDocument> | undefined
  const emit = async () => {
    math = options.math ? await import('katex') : undefined
    const rendered_fences = await Promise.allSettled(
      render_fences.map((render) => render()),
    )
    const diagnostics = rendered_fences.flatMap((result, idx) =>
      result.status === `rejected`
        ? error_diagnostics(
            result.reason,
            `highlight`,
            positions.get(code_tokens[idx])?.range ?? locate(0),
          )
        : [],
    )
    if (diagnostics.length) throw new DiagnosticError(diagnostics)
    const rendered = parser.parser(tokens) + (references?.bibliography() ?? ``)
    let mapped: MappedSource = { code: ``, spans: [] }
    let cursor = 0
    for (const match of rendered.matchAll(new RegExp(`${sentinel}(\\d+)\uE001`, `gu`))) {
      mapped.code += rendered.slice(cursor, match.index)
      const retained_source = retained[Number(match[1])]
      mapped.spans.push(
        ...retained_source.spans.map((span) => ({
          ...span,
          generated: mapped.code.length + span.generated,
        })),
      )
      mapped.code += retained_source.code
      cursor = match.index + match[0].length
    }
    mapped.code += rendered.slice(cursor)
    if (syntax)
      mapped = edit_source(
        mapped,
        syntax.script_edits(mapped.code, imports.join(``), metadata),
      )
    return {
      code: mapped.code,
      examples,
      map: source_map(source, mapped.code, filename, mapped.spans),
    }
  }
  prepared_documents.set(document, () => (pending ??= emit()))
  return document
}

export function create_markdown<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
>(
  options: MarkdownOptions & {
    validate_frontmatter: (...args: Parameters<FrontmatterValidator>) => Metadata
  },
): MarkdownEngine<Metadata>
export function create_markdown(options?: MarkdownOptions): MarkdownEngine
export function create_markdown(options: MarkdownOptions = {}): MarkdownEngine {
  return {
    options,
    async parse(source, { filename = `document.md`, dialect = `svelte` } = {}) {
      try {
        const document = await prepare_document(
          source,
          copy_options(options),
          filename,
          dialect,
        )
        return diagnostic_result(document, [])
      } catch (error) {
        return {
          ok: false,
          diagnostics: error_diagnostics(
            error,
            `markdown`,
            source_locator(source, filename)(0, source.length),
          ),
        }
      }
    },
  }
}

export const compile_markdown = <Metadata extends Record<string, unknown>>(
  document: MarkdownDocument<Metadata>,
): Promise<DiagnosticResult<MarkdownResult<Metadata>>> =>
  emit_document(document, `svelte`)

async function emit_document<Metadata extends Record<string, unknown>>(
  document: MarkdownDocument<Metadata>,
  dialect: MarkdownDocument['dialect'],
): Promise<DiagnosticResult<MarkdownResult<Metadata>>> {
  if (document.dialect !== dialect)
    return {
      ok: false,
      diagnostics: error_diagnostics(
        new Error(
          dialect === `svelte`
            ? `Svelte compilation requires a Svelte document`
            : `HTML rendering requires a Markdown document`,
        ),
        `dialect`,
        source_locator(document.source, document.filename)(0),
      ),
    }
  const emit = prepared_documents.get(document)
  if (!emit) throw new Error(`Document was not created by create_markdown().parse()`)
  try {
    const prepared = await emit()
    return diagnostic_result(
      freeze_data({
        code: prepared.code,
        metadata: document.metadata,
        examples: prepared.examples,
        manifest: document.manifest,
        map: prepared.map,
      }),
      [],
    )
  } catch (error) {
    return {
      ok: false,
      diagnostics: error_diagnostics(
        error,
        `render`,
        source_locator(document.source, document.filename)(0, document.source.length),
      ),
    }
  }
}
export async function render_markdown(
  document: MarkdownDocument,
): Promise<DiagnosticResult<string>> {
  const result = await emit_document(document, `markdown`)
  return result.ok ? { ...result, value: result.value.code } : result
}

export function markdown(engine: MarkdownEngine): PreprocessorGroup {
  return {
    name: `widgets-markdown`,
    async markup({ content, filename }) {
      if (
        !filename ||
        !(engine.options.extensions ?? [`.md`, `.svx`]).some((extension) =>
          filename.endsWith(extension),
        )
      )
        return undefined
      const document = assert_ok(await engine.parse(content, { filename }))
      const result = assert_ok(await compile_markdown(document))
      if (result.examples.length)
        throw new Error(`${filename}: use markdown_vite() for live examples`)
      return result
    },
  }
}
