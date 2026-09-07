import {
  Renderer,
  type Marked,
  type Token,
  type Tokens,
  type TokenizerAndRendererExtension,
} from 'marked'
import { escape_html_text } from '../highlight/hast.ts'
import { decode_entities } from '../heading-anchors.ts'
import type { ContentManifestDraft, TokenSource } from './content.ts'
import { DiagnosticError, type SourceRange } from './diagnostics.ts'
import { parse_meta } from './meta.ts'

export type Citation = {
  title: string
  authors?: string[]
  year?: string | number
  url?: string
  doi?: string
}
export type ReferenceOptions = {
  bibliography?: Record<string, Citation>
  bibliography_title?: string
}
export type ContentReference = {
  key: string
  kind: 'equation' | 'figure' | 'citation'
  number: number
  target: string
  range: SourceRange
}
// Definitions, including uncited figures/equations, in document order.
export type ReferenceDefinition = Omit<ContentReference, 'kind'> & {
  kind: 'equation' | 'figure'
  caption?: string
  label?: string
}

type ReferenceToken = Token & {
  key?: string
  keys?: string[]
  tex?: string
  image?: Tokens.Image
  meta?: string
}
type Target = Omit<ContentReference, 'range'> & {
  token: Token
  caption?: string
  label?: string
}
const navigation_label = (resolved: Target): string => {
  const label = resolved.label ?? resolved.caption
  return label
    ? `${resolved.number} · ${label}`
    : `${resolved.kind === `figure` ? `Figure` : `Equation`} ${resolved.number}`
}
const escape = (text: string): string =>
  escape_html_text(text)
    .replaceAll(`"`, `&quot;`)
    .replaceAll(`{`, `&#123;`)
    .replaceAll(`}`, `&#125;`)
const citation_url = (citation: Citation): string | undefined =>
  citation.url ??
  (citation.doi === undefined ? undefined : `https://doi.org/${citation.doi}`)
const reference_key = `[A-Za-z0-9][A-Za-z0-9_.:-]*`

export function scientific_references(
  options: ReferenceOptions,
  render_math: ((tex: string) => string) | undefined,
) {
  const targets = new Map<string, Target>()
  const cited: (Target & { citation: Citation })[] = []
  const uses: ReferenceToken[] = []
  const issues: { token: Token; message: string; related?: Token }[] = []
  let bibliography_token: Token | undefined
  let bibliography_html = ``
  const figure_pattern = new RegExp(
    `^ {0,3}(?<image>!\\[[^\\n]*\\]\\([^\\n]*\\))[ \\t]*\\{#(?<key>fig:${reference_key})(?<meta>[ \\t][^\\n]*?)?\\}[ \\t]*(?:\\n|$)`,
    `u`,
  )
  const equation_pattern = new RegExp(
    `^ {0,3}\\$\\$[ \\t]+\\{#(?<key>eq:${reference_key})(?<meta>[ \\t][^\\n]*?)?\\}[ \\t]*\\n(?<tex>[^]*?)\\n {0,3}\\$\\$[ \\t]*(?:\\n|$)`,
    `u`,
  )
  const citation_pattern = new RegExp(
    `^\\[@(?<keys>${reference_key}(?:[ \\t]*;[ \\t]*@${reference_key})*)\\]`,
    `u`,
  )
  const link = (key: string): string => {
    const resolved = targets.get(key)
    if (!resolved) return escape(key)
    const label =
      resolved.kind === `equation`
        ? `Equation (${resolved.number})`
        : resolved.kind === `figure`
          ? `Figure ${resolved.number}`
          : `[${resolved.number}]`
    return `<a class="reference reference-${resolved.kind}" href="#${escape(resolved.target)}">${label}</a>`
  }
  const extensions: TokenizerAndRendererExtension[] = [
    {
      name: `reference_equation`,
      level: `block`,
      start: (text) => text.search(/\n {0,3}\$\$[ \t]+\{#eq:/u),
      tokenizer(text) {
        const match = equation_pattern.exec(text)
        if (!match?.groups) return undefined
        return { type: `reference_equation`, raw: match[0], ...match.groups }
      },
      renderer(token) {
        const reference = token as ReferenceToken
        const resolved = targets.get(reference.key ?? ``)
        if (!resolved || !render_math) return ``
        return `<div class="equation" id="${escape(resolved.target)}" data-reference-label="${escape(navigation_label(resolved))}">${render_math(reference.tex ?? ``)}<a class="equation-number" href="#${escape(resolved.target)}" aria-label="Equation ${resolved.number}">(${resolved.number})</a></div>\n`
      },
    },
    {
      name: `reference_figure`,
      level: `block`,
      start: (text) => text.search(/\n {0,3}!\[/u),
      tokenizer(text) {
        const match = figure_pattern.exec(text)
        if (!match?.groups) return undefined
        const { image: source, key, meta } = match.groups
        const images = this.lexer.inlineTokens(source)
        const image = images[0]
        if (images.length !== 1 || image?.type !== `image`)
          throw new Error(`Labeled figures require one Markdown image: ${source}`)
        return { type: `reference_figure`, raw: match[0], key, meta, image }
      },
      renderer(token) {
        const reference = token as ReferenceToken
        const resolved = targets.get(reference.key ?? ``)
        if (!resolved || !reference.image) return ``
        const text: Tokens.Text = {
          type: `text`,
          raw: reference.image.text,
          text: reference.image.text,
        }
        const image = Renderer.prototype.image.call(this.parser.renderer, {
          ...reference.image,
          tokens: [text],
        })
        const caption = Renderer.prototype.text.call(this.parser.renderer, text)
        return `<figure id="${escape(resolved.target)}" data-reference-label="${escape(navigation_label(resolved))}">${image}<figcaption><a href="#${escape(resolved.target)}">Figure ${resolved.number}.</a> ${caption}</figcaption></figure>\n`
          .replaceAll(`{`, `&#123;`)
          .replaceAll(`}`, `&#125;`)
      },
    },
    {
      name: `reference_use`,
      level: `inline`,
      start: (text) => text.indexOf(`[@`),
      tokenizer(text) {
        if (this.lexer.state.inRawBlock || this.lexer.state.inLink) return undefined
        const match = citation_pattern.exec(text)
        if (match)
          return {
            type: `reference_use`,
            raw: match[0],
            keys: match[1].split(/[ \t]*;[ \t]*@/u),
          }
        return undefined
      },
      renderer: (token) => ((token as ReferenceToken).keys ?? []).map(link).join(`, `),
    },
    {
      name: `reference_bibliography`,
      level: `block`,
      start: (text) => text.search(/\n {0,3}:::[ \t]+bibliography[ \t]*(?:\n|$)/u),
      tokenizer(text) {
        const match = /^ {0,3}:::[ \t]+bibliography[ \t]*(?:\n|$)/u.exec(text)
        return match ? { type: `reference_bibliography`, raw: match[0] } : undefined
      },
      renderer: () => bibliography_html,
    },
  ]

  const resolve = (tokens: Token[], parser: Marked): void => {
    let equations = 0
    let figures = 0
    void parser.walkTokens(tokens, (token) => {
      const reference = token as ReferenceToken
      if (token.type === `reference_equation` || token.type === `reference_figure`) {
        const key = reference.key ?? ``
        const kind = token.type === `reference_equation` ? `equation` : `figure`
        let label: string | undefined
        try {
          const metadata = parse_meta(reference.meta ?? ``)
          for (const name of Object.keys(metadata))
            if (name !== `label`) throw new Error(`Unknown reference option: ${name}`)
          if (metadata.label !== undefined) {
            if (typeof metadata.label !== `string` || !metadata.label.trim())
              throw new Error(`Reference label must be a nonempty string`)
            label = metadata.label
          }
        } catch (error) {
          issues.push({ token, message: `Invalid metadata for ${key}: ${String(error)}` })
        }
        if (targets.has(key))
          issues.push({
            token,
            message: `Duplicate reference label ${key}`,
            related: targets.get(key)?.token,
          })
        else
          targets.set(key, {
            key,
            kind,
            number: kind === `equation` ? ++equations : ++figures,
            target: key,
            token,
            ...(label === undefined ? {} : { label }),
            ...(reference.image
              ? { caption: decode_entities(reference.image.text) }
              : {}),
          })
        if (kind === `equation` && !render_math)
          issues.push({ token, message: `Labeled equation ${key} requires math: true` })
      } else if (token.type === `reference_use`) uses.push(reference)
      else if (token.type === `reference_bibliography`) {
        if (bibliography_token)
          issues.push({ token, message: `Only one bibliography directive is allowed` })
        bibliography_token = token
      }
    })
    for (const token of uses) {
      for (const key of token.keys ?? []) {
        if (targets.has(key)) continue
        const citation = Object.hasOwn(options.bibliography ?? {}, key)
          ? options.bibliography?.[key]
          : undefined
        if (key.startsWith(`eq:`) || key.startsWith(`fig:`) || !citation) {
          issues.push({ token, message: `Unresolved reference ${key}` })
          continue
        }
        if (
          typeof citation.title !== `string` ||
          !citation.title.trim() ||
          (citation.authors !== undefined &&
            (!Array.isArray(citation.authors) ||
              citation.authors.some((author) => typeof author !== `string`))) ||
          (citation.year !== undefined &&
            typeof citation.year !== `string` &&
            typeof citation.year !== `number`) ||
          (typeof citation.year === `number` && !Number.isFinite(citation.year)) ||
          (citation.url !== undefined && typeof citation.url !== `string`) ||
          (citation.doi !== undefined && typeof citation.doi !== `string`)
        ) {
          issues.push({ token, message: `Invalid bibliography record ${key}` })
          continue
        }
        const resolved: Target = {
          key,
          kind: `citation`,
          number: cited.length + 1,
          target: `cite:${key}`,
          token: bibliography_token ?? token,
        }
        targets.set(key, resolved)
        cited.push({ ...resolved, citation })
      }
    }
    const entries = cited
      .map((resolved) => {
        const { citation } = resolved
        let url = citation_url(citation)
        if (url !== undefined) {
          try {
            const parsed = new URL(url)
            if (parsed.protocol !== `http:` && parsed.protocol !== `https:`)
              throw new Error(`Unsupported protocol`)
          } catch {
            issues.push({
              token: resolved.token,
              message: `Invalid bibliography URL for ${resolved.key}: ${url}`,
            })
            url = undefined
          }
        }
        const title = url
          ? `<a href="${escape(url)}">${escape(citation.title)}</a>`
          : escape(citation.title)
        const authors = citation.authors?.length
          ? `${escape(citation.authors.join(`, `))}. `
          : ``
        const year =
          citation.year === undefined ? `` : ` (${escape(String(citation.year))})`
        return `<li id="${escape(resolved.target)}" value="${resolved.number}">${authors}${title}${year}.</li>`
      })
      .join(`\n`)
    if (entries)
      bibliography_html = `<section class="bibliography" aria-labelledby="bibliography"><h2 id="bibliography">${escape(options.bibliography_title ?? `References`)}</h2><ol>${entries}</ol></section>\n`
  }

  const update_manifest = (
    manifest: ContentManifestDraft,
    positions: Map<Token, TokenSource>,
  ): void => {
    const at = (token: Token): SourceRange => {
      const position = positions.get(token)?.range
      if (!position) throw new Error(`Missing source position for ${token.type}`)
      return position
    }
    const ids = new Set(manifest.anchors.map(({ id }) => id))
    for (const { token, ...resolved } of targets.values()) {
      if (ids.has(resolved.target))
        issues.push({ token, message: `Duplicate anchor #${resolved.target}` })
      ids.add(resolved.target)
      const range = at(token)
      manifest.anchors.push({ id: resolved.target, range })
      if (resolved.kind !== `citation`)
        manifest.reference_definitions.push({ ...resolved, kind: resolved.kind, range })
      const reference = token as ReferenceToken
      if (reference.image)
        manifest.assets.push({
          url: decode_entities(reference.image.href),
          text: decode_entities(reference.image.text),
          range,
        })
      if (resolved.kind === `citation`) {
        const citation = options.bibliography?.[resolved.key]
        const url = citation && citation_url(citation)
        if (url)
          manifest.links.push({
            url,
            text: citation?.title ?? resolved.key,
            range,
          })
      }
    }
    const bibliography_source = bibliography_token ?? cited[0]?.token
    if (bibliography_html && bibliography_source) {
      if (ids.has(`bibliography`))
        issues.push({
          token: bibliography_source,
          message: `Duplicate anchor #bibliography`,
        })
      const range = at(bibliography_source)
      manifest.anchors.push({ id: `bibliography`, range })
      manifest.headings.push({
        id: `bibliography`,
        text: options.bibliography_title ?? `References`,
        depth: 2,
        range,
      })
      if (bibliography_token)
        manifest.headings = manifest.headings.toSorted(
          (left, right) => left.range.start.offset - right.range.start.offset,
        )
    }
    for (const token of uses)
      for (const key of token.keys ?? []) {
        const resolved = targets.get(key)
        if (!resolved) continue
        const range = at(token)
        manifest.references.push({
          key,
          kind: resolved.kind,
          number: resolved.number,
          target: resolved.target,
          range,
        })
        manifest.links.push({ url: `#${resolved.target}`, text: key, range })
      }
    if (issues.length)
      throw new DiagnosticError(
        issues.map(({ token, message, related }) => ({
          code: `reference`,
          severity: `error`,
          message,
          range: at(token),
          ...(related
            ? { related: [{ message: `First definition`, range: at(related) }] }
            : {}),
        })),
      )
  }
  return {
    extensions,
    resolve,
    update_manifest,
    bibliography: () => (bibliography_token ? `` : bibliography_html),
    reserved_ids: () =>
      [...targets.values()]
        .map(({ target: resolved }) => resolved)
        .concat(bibliography_html ? [`bibliography`] : []),
  }
}
