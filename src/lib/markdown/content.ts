import { Lexer, type Marked, type Token, type Tokens } from 'marked'
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
  mask_svelte_expressions,
  opening_tag_end,
} from '../internal/svelte-expressions.ts'

import {
  source_locator,
  DiagnosticError,
  error_diagnostics,
  make_diagnostic,
  type Diagnostic,
  type SourcePosition,
  type SourceRange,
  type DeepReadonly,
} from './diagnostics.ts'
import type { SourceEdit } from './source-map.ts'
import { escape_attribute } from '../highlight/hast.ts'

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
  // Whether a link URL holds a Svelte expression; omitted URLs are static.
  url_expression?: (link: Tokens.Link | Tokens.Image) => boolean
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

export const table_cells = ({ header, rows }: Tokens.Table): Tokens.TableCell[] => [
  ...header,
  ...rows.flat(),
]
// Nested tokens in document order, including list items and table cells
export const child_tokens = (token: Token): Token[] =>
  token.type === `list`
    ? (token as Tokens.List).items
    : token.type === `table`
      ? table_cells(token as Tokens.Table).flatMap((cell) => cell.tokens)
      : `tokens` in token && Array.isArray(token.tokens)
        ? token.tokens
        : []
// Same document order as Marked's walkTokens, which concatenates callback results per
// token and so grows quadratically with the number of top-level blocks.
export function walk_tokens(
  tokens: readonly Token[],
  visit: (token: Token) => void,
): void {
  for (const token of tokens) {
    visit(token)
    walk_tokens(child_tokens(token), visit)
  }
}

// Marked rewrites some container text before tokenizing the children: it expands tabs to the
// next multiple of four columns after a blockquote's `>` when a tab follows it (tabs after `> `
// stay tabs) and in a list item's first-line marker and continuation indentation, and drops
// the backslash of `\|` in table cells and of `\[` and `\]` in link and image labels (its
// outputLink regex). Each rewrites one container level, since a nested container's raw is
// already in its parent's coordinates.
const QUOTE_PREFIX = / {0,3}>(?: |\t[ \t]*)?/uy
const ITEM_FIRST_PREFIX = / {0,3}(?:[-*+]|\d{1,9}[.)])[ \t]*/uy
const INDENT = /[ \t]*/uy
// A lazy continuation line that would read as a setext underline: Marked's blockquote and list
// item tokenizers indent it to four spaces so it stays paragraph text. Padding ahead of its
// real spaces where Marked did not is harmless, since lines match as substrings.
const LAZY_UNDERLINE_INDENT = / {0,3}(?=(?:=+|-+)[ \t]*(?:\n|$))/uy
// Whether the character at `index` follows an odd run of backslashes
export function escaped_at(text: string, index: number): boolean {
  let start = index
  while (text[start - 1] === `\\`) start--
  return (index - start) % 2 === 1
}
// Column of the next tab stop-expanded character after `text`, starting at `column`
const expanded_column = (text: string, column = 0): number => {
  for (const char of text) column = char === `\t` ? column + 4 - (column % 4) : column + 1
  return column
}
// End of a link or image raw's label, the only text Marked unescapes brackets in: the first
// capture of the rule that built the link (inline, full, collapsed or shortcut reference)
const { gfm } = Lexer.rules.inline
const LABEL_RULES = [gfm.link, gfm.reflink, gfm.nolink]
function label_end(raw: string): number {
  for (const rule of LABEL_RULES) {
    const label = rule.exec(raw)?.[1]
    if (label !== undefined) return raw.indexOf(`[`) + 1 + label.length
  }
  return raw.length
}
// The text Marked hands the children of `owner` (autolinks keep their backslashes), mapped to
// source offsets: the parent itself unless something is rewritten
function child_view(parent: MappedText, owner?: Token): MappedText {
  const { text } = parent
  const kind = owner?.type ?? ``
  const unescaped =
    kind === `table`
      ? `|`
      : /^(?:link|image)$/u.test(kind) && !(owner as Tokens.Link).autolink
        ? `[]`
        : undefined
  const expands_tabs = kind === `blockquote` || kind === `list_item`
  if (!expands_tabs && !(unescaped && /\\/u.test(text))) return parent
  const unescape_end = kind === `table` ? text.length : unescaped ? label_end(text) : 0
  // a list item's content column (Marked's R): continuation lines indented less are lazy and
  // keep their tabs
  let content_column = 0
  if (kind === `list_item`) {
    ITEM_FIRST_PREFIX.lastIndex = 0
    const [prefix = ``] = ITEM_FIRST_PREFIX.exec(text) ?? []
    const marker = prefix.trimEnd().length
    const gap = expanded_column(prefix.slice(marker), marker) - marker
    content_column =
      marker + (/^[^\n]*\S/u.test(text.slice(prefix.length)) && gap <= 4 ? gap : 1)
  }
  const view: MappedText = { text: ``, offsets: [] }
  let column = 0
  let prefix_end = 0
  let marker_end = 0
  for (let idx = 0; idx < text.length; idx++) {
    if (expands_tabs && column === 0 && idx > 0) {
      LAZY_UNDERLINE_INDENT.lastIndex = idx
      const indent = LAZY_UNDERLINE_INDENT.exec(text)?.[0]
      for (let pad = indent?.length ?? 4; pad < 4; pad++) {
        view.text += ` `
        view.offsets.push(parent.offsets[idx])
      }
    }
    const char = text[idx]
    if (expands_tabs && column === 0) {
      const prefix =
        kind === `blockquote` ? QUOTE_PREFIX : idx ? INDENT : ITEM_FIRST_PREFIX
      prefix.lastIndex = idx
      const prefix_text = prefix.exec(text)?.[0] ?? ``
      prefix_end = idx + prefix_text.length
      const lazy =
        kind === `list_item` &&
        idx > 0 &&
        ![`\n`, undefined].includes(text[prefix_end]) &&
        expanded_column(text.slice(idx, prefix_end)) < content_column
      if (lazy) prefix_end = idx
      marker_end = lazy ? idx : idx + prefix_text.trimEnd().length
    }
    // Marked strips quote and item markers, so no child can sit on one
    if (idx < marker_end) {
      column++
      continue
    }
    if (char === `\t` && idx < prefix_end) {
      const width = 4 - (column % 4)
      view.text += ` `.repeat(width)
      for (let space = 0; space < width; space++) view.offsets.push(parent.offsets[idx])
      column += width
      continue
    }
    // escaped and target characters never overlap, so one pass mirrors Marked's regexes. A
    // table pipe after an even backslash run is a cell separator that keeps every backslash.
    if (
      char === `\\` &&
      idx + 1 < unescape_end &&
      unescaped?.includes(text[idx + 1] ?? `\n`) &&
      (kind !== `table` || escaped_at(text, idx + 1))
    )
      continue
    view.text += char
    view.offsets.push(parent.offsets[idx])
    column = char === `\n` ? 0 : column + 1
  }
  return view
}

// Container tokens remove quote/list indentation. Match complete lines within the parent
// rather than searching the whole document, which confuses repeated code and headings.
function locate(
  raw: string,
  parent: MappedText,
  cursor: number,
): MappedText & { end: number } {
  const offsets: number[] = []
  let offset = cursor
  for (const line of raw.split(/(?<=\n)/u)) {
    const newline = line.endsWith(`\n`)
    const text = newline ? line.slice(0, -1) : line
    if (text) {
      const start = parent.text.indexOf(text, offset)
      if (start === -1)
        throw new Error(
          `Cannot locate Markdown token ${JSON.stringify(raw.slice(0, 80))}`,
        )
      for (let idx = start; idx < start + text.length; idx++)
        offsets.push(parent.offsets[idx])
      offset = start + text.length
    }
    if (newline) {
      const end = parent.text.indexOf(`\n`, offset)
      // Marked doubles the newline after an indented lazy line in its inline text raw
      if (
        !text &&
        offsets.length &&
        /\S/u.test(parent.text.slice(offset, end === -1 ? undefined : end))
      ) {
        offsets.push(offsets[offsets.length - 1])
        continue
      }
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
    url_expression,
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
  // Comments and raw element contents are not Markdown or navigable document headings, so
  // they're blanked. A raw element keeps its opening tag, which ends at the first `>`
  // outside quotes and Svelte expressions.
  const raw_start = /<!--|<(?<tag>script|style|textarea|title)\b/giu
  const blank_raw_elements = (text: string): string => {
    let [blanked, cursor] = [``, 0]
    for (const { index, groups } of text.matchAll(raw_start)) {
      if (index < cursor) continue
      const tag = groups?.tag
      const body_start = tag ? opening_tag_end(text, index, svelte) : index
      if (body_start === -1) continue
      const closing = tag ? new RegExp(String.raw`<\/${tag}\s*>`, `iu`) : /-->/u
      const close = closing.exec(text.slice(body_start))
      if (!close) continue
      const end = body_start + close.index + close[0].length
      blanked += text.slice(cursor, body_start) + ` `.repeat(end - body_start)
      cursor = end
    }
    return blanked + text.slice(cursor)
  }
  const interactive_containers: string[] = []
  const scan_html = (mapped: MappedText, token: Token) => {
    const visible = blank_raw_elements(mapped.text)
    // Same-length masks keep a `>` or quote in `onclick={() => go()}` from ending a tag,
    // so attribute and heading offsets index `visible` unchanged
    const markup = svelte ? mask_svelte_expressions(visible) : visible
    const lower_markup = markup.toLowerCase()
    const pre_ranges = [...markup.matchAll(/<pre\b[^>]*>[^]*?<\/pre\s*>/giu)].map(
      (match) => ({ start: match.index, end: match.index + match[0].length }),
    )
    for (const match of markup.matchAll(
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
        const end = lower_markup.indexOf(`</${tag}>`, start)
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
              !has_heading_anchor(visible.slice(start, end), svelte) &&
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
  const visit = (children: Token[], parent: MappedText, owner?: Token) => {
    const view = child_view(parent, owner)
    let cursor = 0
    for (const token of children) {
      // Marked builds a task checkbox's raw as `[ ] ` whatever whitespace follows it
      const raw = token.type === `checkbox` ? token.raw.trimEnd() : token.raw
      const mapped = locate(raw, view, cursor)
      cursor = mapped.end
      // ends before any trailing whitespace, which Marked keeps in nested raws (`# H\n` in a
      // quote) but strips at the top level
      const at = range(
        mapped.offsets[0] ?? view.offsets[cursor] ?? source.length,
        (mapped.offsets[token.raw.trimEnd().length - 1] ??
          mapped.offsets.at(-1) ??
          source.length - 1) + 1,
      )
      const token_source: TokenSource = { range: at, offsets: mapped.offsets }
      positions.set(token, token_source)
      if (token.type === `code`) {
        const code = token as Tokens.Code
        if (code.codeBlockStyle !== `indented`) {
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
          text: inline_text(link.tokens),
          range: at,
          ...(url_expression?.(link) ? { dynamic: true as const } : {}),
        })
      }
      if (token.type === `html` && !omit_html) scan_html(mapped, token)
      if (token.type === `svelte_block` || token.type === `svelte_inline`) {
        scan_html(mapped, token)
        continue
      }
      if (
        (token.type === `paragraph` || token.type === `text`) &&
        `tokens` in token &&
        Array.isArray(token.tokens)
      )
        prose.push(inline_text(token.tokens))
      if (token.type === `table`)
        for (const cell of table_cells(token as Tokens.Table))
          prose.push(inline_text(cell.tokens))
      visit(child_tokens(token), mapped, token)
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
      const insert = (start: number, text: string) =>
        edits.push({ start, end: start, text })
      if (insertion !== undefined) insert(insertion, ` id="${escape_attribute(id)}"`)
      if (link_insertion !== undefined && heading_link)
        insert(link_insertion, heading_link(id))
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
      ...make_diagnostic(code, message, range),
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
