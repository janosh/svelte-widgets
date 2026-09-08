import { parse, type AST, type PreprocessorGroup } from 'svelte/compiler'
import { edit_source, source_map, type SourceEdit } from './markdown/source-map.ts'
import { script_edits } from './markdown/svelte.ts'

const media_attributes: Record<string, string[]> = {
  audio: [`src`],
  embed: [`src`],
  img: [`src`, `srcset`],
  input: [`src`],
  object: [`data`],
  source: [`src`, `srcset`],
  track: [`src`],
  video: [`src`, `poster`],
  image: [`href`, `xlink:href`],
  use: [`href`, `xlink:href`],
}
const asset_rel = new Set([
  `stylesheet`,
  `icon`,
  `mask-icon`,
  `apple-touch-icon`,
  `apple-touch-icon-precomposed`,
  `apple-touch-startup-image`,
  `manifest`,
  `prefetch`,
  `preload`,
])
const asset_itemprop = new Set(
  `image logo screenshot thumbnailurl contenturl downloadurl duringmedia
embedurl installurl layoutimage`.split(/\s+/u),
)
const asset_meta = new Set(
  `msapplication-tileimage msapplication-square70x70logo msapplication-square150x150logo
msapplication-wide310x150logo msapplication-square310x310logo msapplication-config
twitter:image og:image og:image:url og:image:secure_url og:audio og:audio:secure_url
og:video og:video:secure_url vk:image`.split(/\s+/u),
)

const static_text = (attribute?: AST.Attribute): string | undefined => {
  const value = attribute?.value
  return Array.isArray(value) && value.length === 1 && value[0].type === `Text`
    ? value[0].data
    : undefined
}

// Escape tag delimiters too: a URL must never be able to close an injected script.
const literal = (value: string): string =>
  JSON.stringify(value).replaceAll(`<`, `\\u003c`)

// URL tokens extend to whitespace, so commas inside data URLs are not separators.
// Keep descriptors and whitespace verbatim; only candidate URLs become expressions.
function srcset_expression(value: string, resolve: (url: string) => string | undefined) {
  const parts: string[] = []
  let cursor = 0
  let copied = 0
  while (cursor < value.length) {
    while (/[\s,]/u.test(value[cursor] ?? ``)) cursor++
    const start = cursor
    while (cursor < value.length && !/\s/u.test(value[cursor])) cursor++
    let end = cursor
    while (value[end - 1] === `,`) end--
    const expression = resolve(value.slice(start, end))
    if (expression) {
      if (start > copied) parts.push(literal(value.slice(copied, start)))
      parts.push(expression)
      copied = end
    }
    if (end === cursor) {
      let depth = 0
      while (cursor < value.length) {
        const char = value[cursor++]
        if (char === `(`) depth++
        else if (char === `)`) depth--
        else if (char === `,` && depth === 0) break
      }
    }
  }
  if (!parts.length) return undefined
  if (copied < value.length) parts.push(literal(value.slice(copied)))
  return parts.join(` + `)
}

// Run after Markdown preprocessing. Static relative URLs become Vite URL imports;
// public paths, schemes, fragments, components and dynamic expressions stay literal.
export function asset_imports(): PreprocessorGroup {
  return {
    name: `svelte-widgets-assets`,
    markup({ content, filename = `component.svelte` }) {
      const tree = parse(content, { modern: true, filename })
      const edits: SourceEdit[] = []
      const imports = new Map<string, string>()
      let prefix = `__widget_asset_`
      while (content.includes(prefix)) prefix += `_`
      const resolve = (value: string): string | undefined => {
        const url = value.trim()
        if (!url || /^(?:[/#?]|[a-z][\w+.-]*:)/iu.test(url)) return undefined
        const suffix_start = url.search(/[?#]/u)
        // Imports use filesystem names; decode URL escapes but keep literal percent signs.
        const path = (suffix_start < 0 ? url : url.slice(0, suffix_start)).replaceAll(
          /(?:%[\da-f]{2})+/giu,
          (encoded) => {
            try {
              return decodeURIComponent(encoded)
            } catch (cause) {
              throw new Error(
                `Invalid UTF-8 escape in asset URL ${JSON.stringify(value)} in ${filename}: encode a literal "%" as "%25".`,
                { cause },
              )
            }
          },
        )
        if (/[?#]/u.test(path))
          throw new Error(
            `Cannot import asset ${JSON.stringify(value)} in ${filename}: Vite treats "#" and "?" in filenames as URL delimiters. Rename the file.`,
          )
        const suffix = suffix_start < 0 ? `` : url.slice(suffix_start)
        // Appending a query or fragment to an inlined data URL corrupts its payload.
        const specifier = `${/^\.{1,2}\//u.test(path) ? path : `./${path}`}?url${suffix ? `&no-inline` : ``}`
        let name = imports.get(specifier)
        if (!name) {
          name = `${prefix}${imports.size}`
          imports.set(specifier, name)
        }
        return suffix ? `${name} + ${literal(suffix)}` : name
      }
      const visit = (value: unknown): void => {
        if (!value || typeof value !== `object`) return
        if (Array.isArray(value)) {
          value.forEach(visit)
          return
        }
        if (`type` in value && value.type === `RegularElement`) {
          const node = value as AST.RegularElement
          const attributes = node.attributes.filter(
            (attribute): attribute is AST.Attribute => attribute.type === `Attribute`,
          )
          const text = (name: string): string =>
            static_text(attributes.find((attribute) => attribute.name === name))
              ?.trim()
              .toLowerCase() ?? ``
          const has_token = (name: string, allowed: Set<string>): boolean =>
            text(name)
              .split(/\s+/u)
              .some((token) => allowed.has(token))
          let names = media_attributes[node.name] ?? []
          if (
            node.name === `a` &&
            (attributes.some((attribute) => attribute.name === `download`) ||
              /\.pdf(?:[?#]|$)/iu.test(text(`href`)))
          )
            names = [`href`]
          if (node.name === `link`) {
            if (has_token(`rel`, asset_rel)) names = [`href`, `imagesrcset`]
            else if (has_token(`itemprop`, asset_itemprop)) names = [`href`]
          }
          if (
            node.name === `meta` &&
            (asset_meta.has(text(`name`)) ||
              asset_meta.has(text(`property`)) ||
              has_token(`itemprop`, asset_itemprop))
          )
            names = [`content`]
          for (const attribute of attributes) {
            if (!names.includes(attribute.name)) continue
            const attribute_value = static_text(attribute)
            if (!attribute_value) continue
            const expression = attribute.name.endsWith(`srcset`)
              ? srcset_expression(attribute_value, resolve)
              : resolve(attribute_value)
            if (expression)
              edits.push({
                start: attribute.start,
                end: attribute.end,
                text: `${attribute.name}={${expression}}`,
              })
          }
        }
        for (const [key, child] of Object.entries(value)) {
          if (![`attributes`, `expression`, `name_loc`, `loc`].includes(key)) visit(child)
        }
      }
      visit(tree.fragment)
      if (!edits.length) return { code: content }
      const declarations = [...imports]
        .map(([path, name]) => `import ${name} from ${literal(path)};\n`)
        .join(``)
      edits.push(...script_edits(content, declarations, undefined, tree))
      const { code, spans } = edit_source(
        {
          code: content,
          spans: [{ generated: 0, original: 0, length: content.length }],
        },
        edits,
      )
      return { code, map: source_map(content, code, filename, spans) }
    },
  }
}
