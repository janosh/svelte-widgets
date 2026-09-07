import adapter from '@sveltejs/adapter-static'
import type { Adapter } from '@sveltejs/kit'
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { Window } from 'happy-dom'
import * as pagefind from 'pagefind'
import {
  assert_valid_content,
  type ContentManifest,
} from '../src/lib/markdown/content.ts'
import { source_locator } from '../src/lib/markdown/diagnostics.ts'

// Inspect inert HTML; never execute a page's scripts or fetch its resources during builds.
export function prepare_page(
  html: string,
  url: string,
  filename: string,
  authored?: ContentManifest,
) {
  const window = new Window({
    settings: {
      enableJavaScriptEvaluation: false,
      disableJavaScriptFileLoading: true,
      disableCSSFileLoading: true,
    },
  })
  const document = new window.DOMParser().parseFromString(html, `text/html`)
  const locate = source_locator(html, filename)
  const offsets = new Map<string, number>()
  const range = (attribute: string, value: string) => {
    const text = `${attribute}="${value.replaceAll(`&`, `&amp;`).replaceAll(`"`, `&quot;`)}"`
    const offset = html.indexOf(text, offsets.get(text) ?? 0)
    offsets.set(text, offset + text.length)
    return locate(offset)
  }
  const authored_anchors = [...(authored?.anchors ?? [])]
  // Match authored URLs to rendered URLs for precise Markdown diagnostics. Runtime-only
  // links (including native Svelte pages) point into the emitted HTML instead.
  const links = (
    selector: string,
    attributes: string[],
    authored_links = authored?.links,
  ) =>
    [...document.querySelectorAll(selector)].flatMap((element) => {
      if (element.closest(`[data-content-ignore]`)) return []
      return attributes.flatMap((attribute) => {
        const value = element.getAttribute(attribute)
        if (value === null) return []
        return [
          {
            url: value,
            text: element.textContent,
            range:
              authored_links?.find((link) => link.url === value)?.range ??
              range(attribute, value),
          },
        ]
      })
    })
  const manifest: ContentManifest = {
    filename: decodeURIComponent(url),
    metadata: authored?.metadata ?? {},
    headings: [],
    fences: [],
    references: [],
    text: ``,
    anchors: [...document.querySelectorAll(`[id]`)].map(({ id }) => {
      const idx = authored_anchors.findIndex((anchor) => anchor.id === id)
      const original = idx === -1 ? undefined : authored_anchors.splice(idx, 1)[0]
      return { id, range: original?.range ?? range(`id`, id) }
    }),
    links: links(`a[href], area[href]`, [`href`]),
    assets: [
      ...links(`[src], [poster]`, [`src`, `poster`], authored?.assets),
      ...links(`link[rel="stylesheet"]`, [`href`], authored?.assets),
    ],
  }
  const meta: Record<string, string> = {}
  for (const key of [`title`, `description`, `categories`]) {
    const value = authored?.metadata[key]
    if (typeof value === `string`) meta[key] = value
    else if (Array.isArray(value) && value.every((item) => typeof item === `string`))
      meta[key] = value.join(`, `)
  }
  let metadata_html = ``
  for (const [key, value] of Object.entries(meta)) {
    const element = document.createElement(`meta`)
    element.setAttribute(`data-pagefind-meta`, `${key}[content]`)
    element.setAttribute(`content`, value)
    metadata_html += element.outerHTML
    document.head.append(element)
  }
  // Keep Svelte's hydration markers and serialized data byte-for-byte on disk.
  const enriched_html = html.replace(`</head>`, `${metadata_html}</head>`)
  const records: pagefind.CustomRecord[] = []
  for (const element of document.querySelectorAll(`figure[id], .equation[id]`)) {
    if (
      !element.closest(`[data-pagefind-body]`) ||
      element.closest(`[data-pagefind-ignore], pre, details`)
    )
      continue
    const caption = element.querySelector(`figcaption`)?.textContent
    const label =
      caption ?? element.querySelector(`.equation-number`)?.getAttribute(`aria-label`)
    if (!label) continue
    const content =
      caption ??
      [
        label,
        element.getAttribute(`aria-label`),
        element.querySelector(`annotation[encoding="application/x-tex"]`)?.textContent,
      ]
        .filter(Boolean)
        .join(` `)
    records.push({
      url: `${url}#${encodeURIComponent(element.id)}`,
      content,
      language: document.documentElement.lang || `en`,
      meta: {
        ...meta,
        title: `${meta.title ?? document.querySelector(`h1`)?.textContent ?? document.title} — ${label}`,
      },
    })
    // Removing only from the index copy also prevents automatic image_alt metadata
    // from re-indexing a figure caption despite data-pagefind-ignore.
    element.remove()
  }
  const indexed_html = document.documentElement.outerHTML
  window.close()
  return { html: enriched_html, indexed_html, manifest, records }
}

export function site_adapter(manifests: Map<string, ContentManifest>): Adapter {
  const static_adapter = adapter()
  return {
    ...static_adapter,
    async adapt(builder) {
      await static_adapter.adapt(builder)
      const { base } = builder.config.kit.paths
      const output = `build`
      const pages = await Promise.all(
        [...builder.prerendered.pages].map(async ([url, { file }]) => {
          // Kit's own route patterns handle groups, escaped segments and prerendered params.
          const route = builder.routes.find(({ pattern }) =>
            pattern.test(
              (url.slice(base.length) || `/`).split(`%25`).map(decodeURI).join(`%25`),
            ),
          )
          const authored =
            route && manifests.get(resolve(`src/routes`, `.${route.id}/+page.md`))
          const filename = `${output}/${file}`
          return {
            url,
            filename,
            ...prepare_page(await readFile(filename, `utf8`), url, filename, authored),
          }
        }),
      )
      const inventory = pages.map(({ url, manifest }) => ({
        ...manifest,
        links: manifest.links.map((link) => {
          let target = new URL(link.url, `https://content.invalid${url}`)
          const visited = new Set<string>()
          while (target.origin === `https://content.invalid`) {
            const redirect = builder.prerendered.redirects.get(target.pathname)
            if (!redirect) break
            if (visited.has(target.pathname))
              throw new Error(`Redirect loop: ${link.url} in ${url}`)
            visited.add(target.pathname)
            const next = new URL(redirect.location, target)
            next.hash ||= target.hash
            target = next
          }
          return visited.size
            ? {
                ...link,
                url:
                  target.origin === `https://content.invalid`
                    ? `${target.pathname}${target.search}${target.hash}`
                    : target.href,
              }
            : link
        }),
      }))
      const assets = (await readdir(output, { recursive: true, withFileTypes: true }))
        .filter((entry) => entry.isFile())
        .map(
          (entry) => `${base}/${relative(output, resolve(entry.parentPath, entry.name))}`,
        )
      assert_valid_content(inventory, { assets })
      const check = ({ errors }: { errors: string[] }) => {
        if (errors.length) throw new Error(`Pagefind: ${errors.join(`\n`)}`)
      }
      try {
        const result = await pagefind.createIndex({
          excludeSelectors: [`pre`, `details`],
        })
        check(result)
        if (!result.index) throw new Error(`Pagefind did not create an index`)
        const { index } = result
        for (const page of pages) {
          // The browser API prepends the index's deployment base itself.
          const index_url = page.url.slice(base.length) || `/`
          await writeFile(page.filename, page.html)
          check(await index.addHTMLFile({ url: index_url, content: page.indexed_html }))
          for (const record of page.records)
            check(
              await index.addCustomRecord({
                ...record,
                url: index_url + record.url.slice(page.url.length),
              }),
            )
        }
        check(await index.writeFiles({ outputPath: `${output}/pagefind` }))
        builder.log.success(`Validated and indexed ${pages.length} pages`)
      } finally {
        await pagefind.close()
      }
    },
  }
}
