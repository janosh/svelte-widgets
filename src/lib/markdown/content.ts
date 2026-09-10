import type { Marked, Token, Tokens } from 'marked'
import type { ContentReference, ReferenceDefinition } from './references.ts'
import {
  fence_info,
  fence_settings,
  type FenceSettings,
  type ExampleOptions,
} from './meta.ts'
import {
  decode_entities,
  has_heading_anchor,
  heading_text,
  slugify_heading,
  unique_heading_id,
} from '../heading-anchors.ts'

import {
  source_locator,
  DiagnosticError,
  error_diagnostics,
  type Diagnostic,
  type SourcePosition,
  type SourceRange,
  type DeepReadonly,
} from './diagnostics.ts'
import type { SourceEdit } from './source-map.ts'

export type { SourcePosition, SourceRange } from './diagnostics.ts'
export type TokenSource = { range: SourceRange; offsets: number[]; fence?: ContentFence }
export type ContentAnalysis = {
  svelte: boolean
  omit_html?: boolean
  positions: Map<Token, TokenSource>
  heading_ids: Map<Token, string>
  unlinked_headings: Set<Token>
  html_edits: Map<Token, SourceEdit[]>
  heading_link?: (id: string) => string
  reserved_ids?: Iterable<string>
  examples?: ExampleOptions
}

export type ContentHeading = DeepReadonly<{
  id: string
  text: string
  depth: number
  range: SourceRange
}>
export type ContentLink = DeepReadonly<{
  url: string
  text: string
  range: SourceRange
  dynamic?: true
}>
export type ContentFence = DeepReadonly<{
  language: string
  info: string
  settings: Readonly<FenceSettings>
  code: string
  range: SourceRange
  code_range: SourceRange
  line_positions: SourcePosition[]
}>
// Only analysis and reference resolution mutate this draft, before publication.
export type ContentManifestDraft<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
> = {
  filename: string
  metadata: Metadata
  headings: ContentHeading[]
  links: ContentLink[]
  assets: ContentLink[]
  fences: ContentFence[]
  anchors: { id: string; range: SourceRange }[]
  text: string
  references: ContentReference[]
  reference_definitions: ReferenceDefinition[]
}
export type ContentManifest<
  Metadata extends Record<string, unknown> = Record<string, unknown>,
> = DeepReadonly<ContentManifestDraft<Metadata>>
export type FrontmatterValidator = (
  metadata: Record<string, unknown>,
  range: SourceRange,
) => Record<string, unknown>

type MappedText = { text: string; offsets: number[] }

// Container tokens remove quote/list indentation. Match complete lines within the parent
// rather than searching the whole document, which confuses repeated code and headings.
function locate(
  raw: string,
  parent: MappedText,
  cursor: number,
): MappedText & { end: number } {
  const exact = parent.text.indexOf(raw, cursor)
  if (exact !== -1)
    return {
      text: raw,
      offsets: parent.offsets.slice(exact, exact + raw.length),
      end: exact + raw.length,
    }
  const offsets: number[] = []
  let offset = cursor
  let expanded: MappedText | undefined
  let unescaped: MappedText | undefined
  const transformed_match = (mapped: MappedText, text: string): number => {
    let low = 0
    let high = mapped.offsets.length
    while (low < high) {
      const middle = (low + high) >>> 1
      if (mapped.offsets[middle] < offset) low = middle + 1
      else high = middle
    }
    return mapped.text.indexOf(text, low)
  }
  for (const line of raw.split(/(?<=\n)/u)) {
    const newline = line.endsWith(`\n`)
    const text = newline ? line.slice(0, -1) : line
    const start = text ? parent.text.indexOf(text, offset) : offset
    if (start !== -1) {
      for (let idx = start; idx < start + text.length; idx++)
        offsets.push(parent.offsets[idx])
      offset = start + text.length
    }
    // Marked replaces each list tab with four spaces and removes escaped table separators.
    // Keep a source index for every transformed character, including expanded spaces.
    if (start === -1) {
      if (!expanded) {
        expanded = { text: ``, offsets: [] }
        for (let idx = offset; idx < parent.text.length; idx++) {
          const char = parent.text[idx]
          const replacement = char === `\t` ? `    ` : char
          expanded.text += replacement
          expanded.offsets.push(...Array<number>(replacement.length).fill(idx))
        }
      }
      let transformed = expanded
      let matched = transformed_match(transformed, text)
      if (matched === -1) {
        unescaped ??= {
          text: expanded.text.replaceAll(`\\|`, `|`),
          offsets: expanded.offsets.filter(
            (_, idx) =>
              transformed.text[idx] !== `\\` || transformed.text[idx + 1] !== `|`,
          ),
        }
        transformed = unescaped
        matched = transformed_match(transformed, text)
      }
      if (matched === -1)
        throw new Error(
          `Cannot locate Markdown token ${JSON.stringify(raw.slice(0, 80))}`,
        )
      for (const idx of transformed.offsets.slice(matched, matched + text.length))
        offsets.push(parent.offsets[idx])
      offset = transformed.offsets[matched + text.length - 1] + 1
    }
    if (newline) {
      const end = parent.text.indexOf(`\n`, offset)
      // Marked replaces trailing whitespace in quoted lists with a synthetic newline.
      if (end === -1 && /^[ \t]+$/u.test(parent.text.slice(offset))) {
        offsets.push(parent.offsets[offset])
        offset = parent.text.length
      } else {
        if (end === -1) throw new Error(`Cannot locate Markdown token newline`)
        offsets.push(parent.offsets[end])
        offset = end + 1
      }
    }
  }
  return { text: raw, offsets, end: offset }
}

export function content_manifest(
  source: string,
  body: string,
  filename: string,
  metadata: Record<string, unknown>,
  tokens: Token[],
  parser: Marked,
  restore: (text: string) => string,
  {
    svelte,
    omit_html,
    positions,
    heading_ids,
    unlinked_headings,
    html_edits,
    heading_link,
    reserved_ids = [],
    examples,
  }: ContentAnalysis,
): ContentManifestDraft {
  const range = source_locator(source, filename)
  const manifest: ContentManifestDraft = {
    filename,
    metadata,
    headings: [],
    links: [],
    assets: [],
    fences: [],
    anchors: [],
    text: ``,
    references: [],
    reference_definitions: [],
  }
  const headings: (Omit<ContentHeading, 'id'> & {
    id?: string
    token: Token
    insertion?: number
    link_insertion?: number
  })[] = []
  const prose: string[] = []
  const body_offset = source.length - body.length
  const offsets: number[] = []
  let normalized = ``
  for (let idx = 0; idx < body.length; idx++) {
    if (body[idx] === `\r` && body[idx + 1] === `\n`) continue
    normalized += body[idx] === `\r` ? `\n` : body[idx]
    offsets.push(body_offset + idx)
  }
  const html_attributes =
    /\s+(?<name>[^\s"'=<>`]+)(?:\s*=\s*(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|(?<bare>[^\s"'=<>`]+)))?/gu
  const interactive_containers: string[] = []
  const scan_html = (mapped: MappedText, token: Token) => {
    // Raw element contents are not Markdown or navigable document headings.
    const visible = mapped.text.replaceAll(
      /<!--[^]*?-->|(?<opening><(?<excluded>script|style|textarea|title)\b[^>]*>)[^]*?<\/\k<excluded>\s*>/giu,
      (match: string, opening: string | undefined) =>
        (opening ?? ``) + ` `.repeat(match.length - (opening?.length ?? 0)),
    )
    const lower_visible = visible.toLowerCase()
    const pre_ranges = [...visible.matchAll(/<pre\b[^>]*>[^]*?<\/pre\s*>/giu)].map(
      (match) => ({ start: match.index, end: match.index + match[0].length }),
    )
    for (const match of visible.matchAll(
      /<(?<closing>\/?)(?<tag>[a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>/giu,
    )) {
      const tag = match[2].toLowerCase()
      const in_pre = pre_ranges.some(
        ({ start, end }) => match.index > start && match.index < end,
      )
      if (!in_pre && (tag === `a` || tag === `button`)) {
        if (match[1]) {
          const ancestor = interactive_containers.lastIndexOf(tag)
          if (ancestor !== -1) interactive_containers.splice(ancestor)
        } else if (!/\/\s*>$/u.test(match[0])) interactive_containers.push(tag)
      }
      if (match[1]) continue
      let links_enabled = true
      let id: string | undefined
      for (const attr of match[0].matchAll(html_attributes)) {
        const name = attr[1].toLowerCase()
        const value = attr[2] ?? attr[3] ?? attr[4] ?? ``
        if (svelte && value.includes(`{`)) {
          if (name === `id`) id = value
          continue
        }
        const url = decode_entities(value)
        const attr_offset = match.index + attr.index
        const at = range(
          mapped.offsets[attr_offset] ?? body_offset,
          (mapped.offsets[attr_offset + attr[0].length - 1] ?? body_offset) + 1,
        )
        if (name === `data-heading-anchor`) links_enabled = url !== `false`
        if (name === `id`) {
          id = url
          manifest.anchors.push({ id, range: at })
        } else if (!in_pre && (name === `href` || name === `src` || name === `poster`)) {
          const target =
            name === `href` && tag !== `link` ? manifest.links : manifest.assets
          target.push({ url, text: ``, range: at })
        }
      }
      if (/^h[1-6]$/u.test(tag) && !(svelte && id?.includes(`{`)) && !in_pre) {
        const start = match.index + match[0].length
        const end = lower_visible.indexOf(`</${tag}>`, start)
        if (end !== -1)
          headings.push({
            id,
            depth: Number(tag[1]),
            text: heading_text(visible.slice(start, end), svelte),
            range: range(
              mapped.offsets[match.index] ?? body_offset,
              (mapped.offsets[end + tag.length + 2] ?? body_offset) + 1,
            ),
            token,
            link_insertion:
              heading_link &&
              links_enabled &&
              !has_heading_anchor(visible.slice(start, end)) &&
              interactive_containers.length === 0
                ? end
                : undefined,
            insertion: id === undefined ? match.index + match[0].length - 1 : undefined,
          })
      }
    }
  }
  const inline_text = (children: Token[]): string =>
    heading_text(restore(parser.Parser.parseInline(children, parser.defaults)), svelte)
  const visit = (children: Token[], parent: MappedText) => {
    let cursor = 0
    for (const token of children) {
      const mapped = locate(token.raw, parent, cursor)
      cursor = mapped.end
      const at = range(
        mapped.offsets[0] ?? parent.offsets[cursor] ?? source.length,
        (mapped.offsets.at(-1) ?? source.length - 1) + 1,
      )
      const token_source: TokenSource = { range: at, offsets: mapped.offsets }
      positions.set(token, token_source)
      if (token.type === `code`) {
        const code = token as Tokens.Code
        if (/^ {0,3}(?:`{3,}|~{3,})/u.test(code.raw)) {
          const first_newline = mapped.text.indexOf(`\n`)
          const code_map = locate(code.text, mapped, first_newline + 1)
          let offset = 0
          const line_positions = code.text.split(`\n`).map((line) => {
            const result = range(
              code_map.offsets[offset] ??
                mapped.offsets[first_newline + 1] ??
                at.start.offset,
            ).start
            offset += line.length + 1
            return result
          })
          const { language, info } = fence_info(code)
          let settings: Readonly<FenceSettings>
          try {
            settings = fence_settings(info, examples)
          } catch (error) {
            throw new DiagnosticError(error_diagnostics(error, `fence`, at))
          }
          const fence: ContentFence = {
            language,
            info,
            settings,
            code: code.text,
            range: at,
            code_range: {
              start: line_positions[0],
              end: range((code_map.offsets.at(-1) ?? line_positions[0].offset - 1) + 1)
                .start,
            },
            line_positions,
          }
          token_source.fence = fence
          manifest.fences.push(fence)
        }
        continue
      }
      if (token.type === `heading`) {
        if (interactive_containers.length) unlinked_headings.add(token)
        const heading = token as Tokens.Heading
        const text = inline_text(heading.tokens)
        headings.push({ depth: heading.depth, text, range: at, token })
        prose.push(text)
      }
      if (token.type === `link` || token.type === `image`) {
        const link = token as Tokens.Link | Tokens.Image
        const target = token.type === `link` ? manifest.links : manifest.assets
        target.push({
          url: decode_entities(link.href),
          text: heading_text(link.text, svelte),
          range: at,
          ...(svelte && link.href.includes(`{`) ? { dynamic: true as const } : {}),
        })
      }
      if (token.type === `html` && !omit_html) scan_html(mapped, token)
      if (token.type === `svelte_block` || token.type === `svelte_inline`) {
        scan_html(mapped, token)
        continue
      }
      if (
        (token.type === `paragraph` || (token.type === `text` && `tokens` in token)) &&
        `text` in token &&
        typeof token.text === `string`
      ) {
        prose.push(
          `tokens` in token && Array.isArray(token.tokens)
            ? inline_text(token.tokens)
            : heading_text(restore(token.text), svelte),
        )
      }
      if (token.type === `list`) visit((token as Tokens.List).items, mapped)
      else if (token.type === `table`) {
        const table = token as Tokens.Table
        const cells = [...table.header, ...table.rows.flat()]
        for (const cell of cells) prose.push(inline_text(cell.tokens))
        visit(
          cells.flatMap((cell) => cell.tokens),
          mapped,
        )
      } else if (`tokens` in token && Array.isArray(token.tokens))
        visit(token.tokens, mapped)
    }
  }
  visit(tokens, { text: normalized, offsets })
  const used_ids = new Set([...manifest.anchors.map(({ id }) => id), ...reserved_ids])
  for (const heading of headings.toSorted(
    (left, right) => left.range.start.offset - right.range.start.offset,
  )) {
    const base = slugify_heading(heading.text)
    if (heading.id === undefined && !base) continue
    const id = heading.id ?? unique_heading_id(base, used_ids)
    const { token, insertion, link_insertion, ...content } = heading
    manifest.headings.push({ ...content, id })
    if (insertion !== undefined || link_insertion !== undefined) {
      const edits = html_edits.get(token) ?? []
      if (insertion !== undefined)
        edits.push({
          start: insertion,
          end: insertion,
          text: ` id="${id.replaceAll(`&`, `&amp;`).replaceAll(`"`, `&quot;`)}"`,
        })
      if (link_insertion !== undefined && heading_link)
        edits.push({
          start: link_insertion,
          end: link_insertion,
          text: heading_link(id),
        })
      html_edits.set(token, edits)
    } else if (token.type === `heading`) heading_ids.set(token, id)
    if (heading.id === undefined) manifest.anchors.push({ id, range: heading.range })
  }
  manifest.text = prose.join(`\n`)
  return manifest
}

// File inventories contain literal paths, while Markdown URLs contain percent escapes.
// Encode path segments before URL normalization so '%' and '#' in filenames stay literal.
const file_url = (path: string): URL =>
  new URL(
    path.replaceAll(`\\`, `/`).split(`/`).map(encodeURIComponent).join(`/`),
    `https://content.invalid/`,
  )
const canonical_path = (path: string): string =>
  decodeURIComponent(file_url(path).pathname)
const document_key = (path: string): string =>
  path
    .replace(/\.(?:md|svx|html)$/u, ``)
    .replace(/\/index$/u, `/`)
    .replace(/\/$/u, ``)

export function validate_content(
  manifests: readonly ContentManifest[],
  options: { assets?: Iterable<string> } = {},
): Diagnostic[] {
  const diagnostics: Diagnostic[] = []
  const report = (
    code: string,
    message: string,
    range: SourceRange,
    related?: Diagnostic['related'],
  ) =>
    diagnostics.push({
      code,
      message,
      severity: `error`,
      range,
      ...(related && { related }),
    })
  const documents = new Map<
    string,
    { filename: string; anchors: Map<string, SourceRange> }
  >()
  const assets =
    options.assets === undefined
      ? undefined
      : new Set([...options.assets].map(canonical_path))
  for (const manifest of manifests) {
    const key = document_key(canonical_path(manifest.filename))
    const previous = documents.get(key)
    if (previous)
      report(
        `duplicate_document`,
        `Duplicate document route ${key}`,
        source_locator(``, manifest.filename)(0),
        [{ message: `First document`, range: source_locator(``, previous.filename)(0) }],
      )
    const ids = new Map<string, SourceRange>()
    for (const anchor of manifest.anchors) {
      const previous_range = ids.get(anchor.id)
      if (previous_range)
        report(`duplicate_anchor`, `Duplicate anchor #${anchor.id}`, anchor.range, [
          { message: `First definition`, range: previous_range },
        ])
      else ids.set(anchor.id, anchor.range)
    }
    if (!previous) documents.set(key, { filename: manifest.filename, anchors: ids })
  }
  for (const manifest of manifests) {
    const asset_links = new Set(manifest.assets)
    const base = file_url(manifest.filename)
    for (const link of [...manifest.links, ...manifest.assets]) {
      if (/^(?:[a-z][\w+.-]*:|\/\/)/iu.test(link.url) || link.dynamic) continue
      let url: URL
      let path: string
      let fragment: string
      try {
        url = new URL(link.url, base)
        // Reject invalid escapes and normalize encoded source paths before lookup.
        path = decodeURIComponent(url.pathname)
        fragment = decodeURIComponent(url.hash.slice(1))
      } catch {
        report(`invalid_url`, `Invalid URL ${JSON.stringify(link.url)}`, link.range)
        continue
      }
      const target = documents.get(document_key(path))
      const is_asset =
        asset_links.has(link) ||
        (!target && /\.[^/.]+$/u.test(path) && !/\.(?:md|svx|html)$/u.test(path))
      if (is_asset) {
        if (assets && !assets.has(path))
          report(`missing_asset`, `Missing asset ${path}`, link.range)
      } else if (!target)
        report(`missing_document`, `Missing document ${path}`, link.range)
      else if (url.hash && !target.anchors.has(fragment))
        report(
          `missing_fragment`,
          `Missing fragment ${url.hash} in ${target.filename}`,
          link.range,
        )
    }
  }
  return diagnostics
}

export function assert_valid_content(
  manifests: readonly ContentManifest[],
  options: Parameters<typeof validate_content>[1] = {},
): void {
  const diagnostics = validate_content(manifests, options)
  if (diagnostics.length) throw new DiagnosticError(diagnostics)
}

// Reuse the manifest for flat TOCs and search indexes; feed generators can read its metadata.
export const content_toc = (manifest: ContentManifest): ContentHeading[] =>
  manifest.headings.map((heading) => ({ ...heading }))
export const content_search_record = (manifest: ContentManifest) => ({
  filename: manifest.filename,
  title:
    typeof manifest.metadata.title === `string`
      ? manifest.metadata.title
      : (manifest.headings[0]?.text ?? manifest.filename),
  text: manifest.text,
  headings: manifest.headings.map(({ id, text }) => ({ id, text })),
})
