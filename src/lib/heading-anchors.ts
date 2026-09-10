// Shared heading text, Markdown IDs, and opt-in dynamic DOM enhancement.

// Quoted attributes may contain `>`; only an unquoted one ends the opening tag.
const heading_attrs = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`
const opening_tag_regex = new RegExp(
  String.raw`<[A-Za-z][^\s/>]*(?<attrs>${heading_attrs})>`,
  `gu`,
)
const heading_attr_regex =
  /(?:^|\s)(?<name>[^\s"'=<>`]+)(?:(?<equals>\s*=\s*)(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|(?<unquoted>[^\s"'=<>`]+))?)?/gu
const html_string_expression_regex = /\{@html\s+(?<json>"(?:\\.|[^"\\])*")\s*\}/gu
const katex_annotation_regex =
  /<annotation\b[^>]*encoding="application\/x-tex"[^>]*>(?<tex>[\s\S]*?)<\/annotation>/iu
function find_svelte_expression_end(str: string, start: number): number {
  let depth = 0
  let quote: string | null = null
  let escaped = false
  for (let idx = start; idx < str.length; idx++) {
    const char = str[idx]
    if (quote) {
      if (escaped) escaped = false
      else if (char === `\\`) escaped = true
      else if (char === quote) quote = null
    } else if (char === `"` || char === `'` || char === `\``) quote = char
    else if (char === `{`) depth++
    else if (char === `}` && --depth === 0) return idx
  }
  return -1
}

// Remove expressions while respecting their JS strings.
function strip_svelte_expressions(str: string): string {
  if (!str.includes(`{`)) return str
  let result = ``
  for (let idx = 0; idx < str.length; idx++) {
    const char = str[idx]
    if (char !== `{`) {
      result += char
      continue
    }
    const expression_end = find_svelte_expression_end(str, idx)
    if (expression_end === -1) return result
    idx = expression_end
  }
  return result
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: `&`,
  lt: `<`,
  gt: `>`,
  quot: `"`,
  apos: `'`,
  nbsp: ` `,
  ensp: `\u2002`,
  emsp: `\u2003`,
  thinsp: `\u2009`,
}

// Markdown escapes `&`, `<`, `{` and friends in text, so `Using {foo}` arrives as
// `Using &#123;foo&#125;`; slugging the raw source would bake `123` into the id.
export const decode_entities = (html: string): string =>
  html.replaceAll(
    /&(?:#x(?<hex>[0-9a-f]+)|#(?<dec>\d+)|(?<name>[a-z]+));/giu,
    (entity, hex?: string, dec?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? entity
      const code_point = hex ? Number.parseInt(hex, 16) : Number(dec)
      return code_point <= 0x10ffff ? String.fromCodePoint(code_point) : entity
    },
  )

const extract_math_sources = (inner: string): string =>
  inner.replaceAll(html_string_expression_regex, (expression, json: string) => {
    let html: unknown
    try {
      html = JSON.parse(json)
    } catch {
      return expression
    }
    if (typeof html !== `string`) return expression
    const tex = katex_annotation_regex.exec(html)?.groups?.tex
    return tex ? decode_entities(tex).replaceAll(/[{}]/gu, ``) : expression
  })

// Shared by heading IDs and the Markdown content manifest. Decode last so escaped tags
// remain text, while rendered markup and dynamic expressions do not enter the slug.
export const heading_text = (inner: string, svelte = true): string => {
  const text = (svelte ? extract_math_sources(inner) : inner).replaceAll(/<[^>]+>/gu, ``)
  return decode_entities(svelte ? strip_svelte_expressions(text) : text).trim()
}

// keeps Unicode letters and marks, normalizes to NFC, and separates on punctuation runs so
// distinct headings don't collapse to one slug
export const slugify_heading = (text: string): string =>
  text
    .toLowerCase()
    .normalize(`NFC`)
    // so `foo.bar` cannot collide with `foobar`
    .replaceAll(/[^\p{L}\p{M}\p{N}_]+/gu, `-`)
    .replaceAll(/^-|-$/gu, ``) // trim leading/trailing dashes

// Ids already in the document, for `unique_heading_id` to avoid. Lazy and memoized: the
// scan is expensive and only needed when a heading actually lacks an id.
export const document_used_ids = (): (() => Set<string>) => {
  let used_ids: Set<string> | undefined
  return () =>
    (used_ids ??= new Set(
      Array.from(document.querySelectorAll<HTMLElement>(`[id]`), ({ id }) => id),
    ))
}

// Allocates and reserves an id in one step. Every heading-id producer shares this `-1`,
// `-2`, ... collision policy, including collisions with already suffixed slugs.
export function unique_heading_id(base_id: string, used_ids: Set<string>): string {
  const base = base_id || `section`
  let id = base
  let suffix = 1
  while (used_ids.has(id)) id = `${base}-${suffix++}`
  used_ids.add(id)
  return id
}

const link_svg = `<svg width="16" height="16" viewBox="0 0 16 16" aria-label="Link to heading" role="img"><path d="M7.775 3.275a.75.75 0 0 0 1.06 1.06l1.25-1.25a2 2 0 1 1 2.83 2.83l-2.5 2.5a2 2 0 0 1-2.83 0 .75.75 0 0 0-1.06 1.06 3.5 3.5 0 0 0 4.95 0l2.5-2.5a3.5 3.5 0 0 0-4.95-4.95l-1.25 1.25zm-4.69 9.64a2 2 0 0 1 0-2.83l2.5-2.5a2 2 0 0 1 2.83 0 .75.75 0 0 0 1.06-1.06 3.5 3.5 0 0 0-4.95 0l-2.5 2.5a3.5 3.5 0 0 0 4.95 4.95l1.25-1.25a.75.75 0 0 0-1.06-1.06l-1.25 1.25a2 2 0 0 1-2.83 0z" fill="currentColor"/></svg>`

// Shared HTML for Markdown output and explicit Svelte headings. Encode the fragment as data.
export const heading_anchor_html = (id?: string, icon_markup = link_svg): string =>
  `<a data-heading-anchor aria-hidden="true"${id ? ` href="#${encodeURIComponent(id)}"` : ``}>${icon_markup}</a>`

export const has_heading_anchor = (inner: string): boolean =>
  [...inner.matchAll(opening_tag_regex)].some(
    (match) =>
      /^<a[\s>]/iu.test(match[0]) &&
      [...(match.groups?.attrs ?? ``).matchAll(heading_attr_regex)].some(
        ({ groups }) =>
          groups?.name.toLowerCase() === `aria-hidden` &&
          (groups.double ?? groups.single ?? groups.unquoted) === `true`,
      ),
  )

export interface HeadingAnchorsOptions {
  // heading selector, default h1-h6 direct or 2nd-level children of the attached node
  selector?: string
  // Assigned via innerHTML, so pass trusted content only; sanitize untrusted input first,
  // e.g. new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement
  icon_svg?: string
}

function add_anchor_to_heading(
  heading: Element,
  get_used_ids: () => Set<string>,
  icon_svg: string,
): void {
  if (
    heading.closest(`a, button`) ||
    heading.getAttribute(`data-heading-anchor`) === `false`
  )
    return
  const existing_anchor =
    heading.querySelector<HTMLAnchorElement>(`a[aria-hidden="true"]`)
  if (existing_anchor && !existing_anchor.hasAttribute(`data-heading-anchor`)) return
  if (!heading.id) {
    // fall back to the text content, for dynamic headings
    const text = [...heading.childNodes]
      .filter((child) => child !== existing_anchor)
      .map((child) => child.textContent ?? ``)
      .join(``)
    const base_id = slugify_heading(text.trim())
    if (!base_id) return
    heading.id = unique_heading_id(base_id, get_used_ids())
  }
  if (existing_anchor) existing_anchor.href = `#${encodeURIComponent(heading.id)}`
  else heading.insertAdjacentHTML(`beforeend`, heading_anchor_html(heading.id, icon_svg))
}

const is_heading = (element: Element): boolean => /^H[1-6]$/u.test(element.tagName)

const get_default_headings = (node: Element): Element[] =>
  [...node.children].flatMap((child) => [child, ...child.children].filter(is_heading))

// adds anchor links to headings within a container
export const heading_anchors =
  (options: HeadingAnchorsOptions = {}) =>
  (node: Element): (() => void) | undefined => {
    if (typeof document === `undefined`) return undefined

    const icon_svg = options.icon_svg ?? link_svg
    const selector = options.selector
    const get_headings = selector
      ? () => Array.from(node.querySelectorAll(selector))
      : () => get_default_headings(node)
    const add_anchors = () => {
      const get_used_ids = document_used_ids()
      for (const heading of get_headings()) {
        add_anchor_to_heading(heading, get_used_ids, icon_svg)
      }
    }
    add_anchors()

    // requery for new headings and keep existing links aligned with dynamic IDs
    const observer = new MutationObserver(() => {
      add_anchors()
      observer.takeRecords()
    })
    observer.observe(node, {
      attributeFilter: [`id`],
      attributes: true,
      childList: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }
