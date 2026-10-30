// Shared heading text, Markdown IDs, and opt-in dynamic DOM enhancement.
import {
  mask_svelte_expressions,
  strip_svelte_expressions,
} from './internal/svelte-expressions.ts'

// Comments, then tags. Quoted attributes may contain `>`; only an unquoted one ends a tag.
const heading_attrs = String.raw`(?:[^>"']|"[^"]*"|'[^']*')*`
const markup_regex = new RegExp(
  String.raw`<!--[^]*?-->|<\/?[A-Za-z][^\s/>]*(?<attrs>${heading_attrs})>`,
  `gu`,
)
const heading_attr_regex =
  /(?:^|\s)(?<name>[^\s"'=<>`]+)(?:(?<equals>\s*=\s*)(?:"(?<double>[^"]*)"|'(?<single>[^']*)'|(?<unquoted>[^\s"'=<>`]+))?)?/gu
const html_string_expression_regex = /\{@html\s+(?<json>"(?:\\.|[^"\\])*")\s*\}/gu
const tex_annotation_regex =
  /<annotation\b[^>]*encoding="application\/x-tex"[^>]*>(?<tex>[\s\S]*?)<\/annotation>/iu

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

// The HTML parser reads C1 control references &#x80;-&#x9F; as Windows-1252 characters,
// except the five code points that encoding leaves undefined.
const C1_REPLACEMENTS = `€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F\u0090‘’“”•–—˜™š›œ\u009DžŸ`

// Markdown escapes `&`, `<`, `{` and friends in text, so `Using {foo}` arrives as
// `Using &#123;foo&#125;`; slugging the raw source would bake `123` into the id.
export const decode_entities = (html: string): string =>
  html.replaceAll(
    /&(?:#x(?<hex>[0-9a-f]+)|#(?<dec>\d+)|(?<name>[a-z]+));/giu,
    (entity, hex?: string, dec?: string, name?: string) => {
      if (name) return NAMED_ENTITIES[name.toLowerCase()] ?? entity
      const code_point = hex ? Number.parseInt(hex, 16) : Number(dec)
      if (code_point >= 0x80 && code_point <= 0x9f)
        return C1_REPLACEMENTS[code_point - 0x80]
      // NUL, surrogates and out-of-range code points become U+FFFD as in the HTML parser
      // (a lone surrogate would also make encodeURI throw)
      const invalid =
        code_point === 0 ||
        (code_point >= 0xd800 && code_point <= 0xdfff) ||
        code_point > 0x10ffff
      return invalid ? `\uFFFD` : String.fromCodePoint(code_point)
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
    const tex = tex_annotation_regex.exec(html)?.groups?.tex
    // still entity-encoded, so a decoded `<` cannot open a tag before heading_text decodes
    return tex ? tex.replaceAll(/[{}]/gu, ``) : expression
  })

// Shared by heading IDs and the Markdown content manifest. Decode last so escaped tags
// remain text, while rendered markup and dynamic expressions do not enter the slug.
// Expressions go first: a `<` or `>` in their code must not open or end a tag.
export const heading_text = (inner: string, svelte = true): string => {
  const markup = svelte ? strip_svelte_expressions(extract_math_sources(inner)) : inner
  return decode_entities(markup.replaceAll(markup_regex, ``)).trim()
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

// `#id` link that resolves after decodeURI (SvelteKit's prerender crawler, unlike
// encodeURIComponent's `#fig%3Aplot`) and in browsers. Braces become `%7B`/`%7D`, so the
// href stays inert in Svelte markup. Lone surrogates, which encodeURI rejects, become
// U+FFFD as when browsers serialize the URL.
export const fragment_href = (id: string): string => `#${encodeURI(id.toWellFormed())}`

// Shared HTML for Markdown output and explicit Svelte headings. The gap from the heading text
// ships with the markup, so no host stylesheet is needed to keep the icon off the last letter;
// --heading-anchor-gap tunes it.
export const heading_anchor_html = (id?: string, icon_markup = link_svg): string => {
  // `&` is legal in fragments but must not start a character reference in the attribute
  const href = id ? ` href="${fragment_href(id).replaceAll(`&`, `&amp;`)}"` : ``
  return `<a data-heading-anchor aria-hidden="true" style="padding-inline-start: var(--heading-anchor-gap, 0.3em)"${href}>${icon_markup}</a>`
}

// `svelte` masks expressions, so `onclick={() => go()}` cannot end the tag at its `=>`
export const has_heading_anchor = (inner: string, svelte = true): boolean =>
  [...(svelte ? mask_svelte_expressions(inner) : inner).matchAll(markup_regex)].some(
    (match) =>
      /^<a[\s>]/iu.test(match[0]) &&
      [...(match.groups?.attrs ?? ``).matchAll(heading_attr_regex)].some(
        ({ groups }) =>
          groups?.name.toLowerCase() === `aria-hidden` &&
          (groups.double ?? groups.single ?? groups.unquoted) === `true`,
      ),
  )

export interface HeadingAnchorsOptions {
  // heading selector, default h1-h6 direct or 2nd-level children of the attached node. Later
  // DOM changes are picked up when they add an h1-h6 (or a subtree holding one) or set one's id
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
  if (existing_anchor) existing_anchor.href = fragment_href(heading.id)
  else heading.insertAdjacentHTML(`beforeend`, heading_anchor_html(heading.id, icon_svg))
}

const is_heading = (element: Element): boolean => /^H[1-6]$/u.test(element.tagName)
// Only an added subtree holding a heading, or an id written on one, can change the anchors.
// Requerying the container on every other change (a dense plot redrawing thousands of nodes)
// cost ~90 ms of selector matching on a 75k-node page.
const touches_headings = (records: MutationRecord[]): boolean =>
  records.some(({ type, target, addedNodes }) =>
    type === `attributes`
      ? target instanceof Element && is_heading(target)
      : [...addedNodes].some(
          (added) =>
            added instanceof Element &&
            (is_heading(added) || added.querySelector(`h1, h2, h3, h4, h5, h6`) !== null),
        ),
  )

// adds anchor links to headings within a container
export const heading_anchors =
  (options: HeadingAnchorsOptions = {}) =>
  (node: Element): (() => void) => {
    const { selector } = options
    const icon_svg = options.icon_svg ?? link_svg
    const add_anchors = () => {
      const get_used_ids = document_used_ids()
      const headings = selector
        ? node.querySelectorAll(selector)
        : [...node.children].flatMap((child) =>
            [child, ...child.children].filter(is_heading),
          )
      for (const heading of headings)
        add_anchor_to_heading(heading, get_used_ids, icon_svg)
    }
    add_anchors()

    // requery for new headings and keep existing links aligned with dynamic IDs
    const observer = new MutationObserver((records) => {
      if (!touches_headings(records)) return
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
