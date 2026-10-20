import { readFile } from 'node:fs/promises'
import type { PreprocessorGroup } from 'svelte/compiler'
import type { Plugin } from 'vite'
import {
  compile_markdown,
  create_markdown,
  assert_ok,
  type MarkdownDocument,
  type MarkdownEngine,
  type MarkdownResult,
} from './index.ts'
import { is_markdown_file } from './meta.ts'
import { source_map } from './source-map.ts'
import type { ContentManifest } from './content.ts'

// `page.md?toc` and `page.md?metadata` load as JSON modules from a parse, without
// compiling the page component, so layouts can glob them without bundling every page.
const QUERY_MODULES = [
  {
    query: `toc`,
    prefix: `\0widgets-toc:`,
    emit: ({ manifest }: MarkdownDocument) =>
      manifest.headings.map(({ id, depth, text }) => ({ id, level: depth, title: text })),
  },
  {
    query: `metadata`,
    prefix: `\0widgets-metadata:`,
    emit: ({ metadata }: MarkdownDocument) => metadata,
  },
]
const MODULE_ID = /\.widgets-example-[a-f\d]+-[a-f\d]+-\d+\.svelte(?:\?|$)/u

const drop_examples = (modules: Map<string, string>, filename: string): void => {
  for (const id of modules.keys())
    if (id.startsWith(`${filename}.widgets-`)) modules.delete(id)
}

export type MarkdownViteOptions = {
  // Bounded per-integration LRU cache; 0 disables it. In-flight requests are shared.
  highlight_cache_size?: number
  on_manifest?: (manifest: ContentManifest) => void
}

// Structural copy of Vitest's plugin hook, so these declarations don't depend on vitest.
// Vitest 4 names it experimental_defineCacheKeyGenerator; 3.x has neither.
type CacheKeyGenerator = (
  generator: (module: { id: string }) => false | undefined,
) => void
type VitestCacheHook = {
  configureVitest: (context: {
    defineCacheKeyGenerator?: CacheKeyGenerator
    experimental_defineCacheKeyGenerator?: CacheKeyGenerator
  }) => void
}

// Share this instance between the Svelte preprocessor and Vite plugin. Examples are
// registered before Svelte resolves imports; no generated JavaScript needs rewriting.
export function markdown_vite(
  engine: MarkdownEngine,
  settings: MarkdownViteOptions = {},
): {
  preprocess: PreprocessorGroup
  plugin: Plugin & VitestCacheHook
} {
  const options = engine.options
  const { highlight } = options
  const { highlight_cache_size = 256 } = settings
  if (!Number.isSafeInteger(highlight_cache_size) || highlight_cache_size < 0)
    throw new Error(
      `highlight_cache_size must be a nonnegative safe integer: ${highlight_cache_size}`,
    )
  const highlights = new Map<string, string>()
  const pending_highlights = new Map<string, Promise<string>>()
  const cached_engine = create_markdown({
    ...options,
    highlight:
      highlight &&
      ((code, language) => {
        if (!highlight_cache_size) return highlight(code, language)
        const key = JSON.stringify([language, code])
        const cached = highlights.get(key)
        if (cached !== undefined) {
          highlights.delete(key)
          highlights.set(key, cached)
          return cached
        }
        const existing = pending_highlights.get(key)
        if (existing) return existing
        // Pending work is already retained by its callers. Keep it outside the LRU
        // so a burst larger than the cache cannot start duplicate computations.
        const pending = Promise.resolve()
          .then(() => highlight(code, language))
          .then(
            (result) => {
              if (pending_highlights.get(key) !== pending) return result
              pending_highlights.delete(key)
              highlights.set(key, result)
              if (highlights.size > highlight_cache_size) {
                const oldest = highlights.keys().next().value
                if (oldest !== undefined) highlights.delete(oldest)
              }
              return result
            },
            (error: unknown) => {
              if (pending_highlights.get(key) === pending) pending_highlights.delete(key)
              throw error
            },
          )
        pending_highlights.set(key, pending)
        return pending
      }),
  })
  // Keep failed inputs eligible for HMR retries without retaining a rejected promise.
  const files = new Map<string, { content: string; result?: Promise<MarkdownResult> }>()
  const modules = new Map<string, string>()
  const loaded_sources = new Map<object, Map<string, string>>()
  const is_markdown = (filename: string) => is_markdown_file(options.extensions, filename)
  const compile_file = (content: string, filename: string): Promise<MarkdownResult> => {
    const cached = files.get(filename)
    if (cached?.content === content && cached.result) return cached.result
    const result = cached_engine
      .parse(content, { filename })
      .then((document) => compile_markdown(assert_ok(document)))
      .then(assert_ok)
      .then((compiled) => {
        // A slower obsolete compilation must not overwrite a newer edit's examples.
        if (files.get(filename)?.result !== result) return compiled
        settings.on_manifest?.(compiled.manifest)
        drop_examples(modules, filename)
        for (const example of compiled.examples) modules.set(example.id, example.source)
        return compiled
      })
      .catch((error: unknown) => {
        if (files.get(filename)?.result === result) files.set(filename, { content })
        throw error
      })
    files.set(filename, { content, result })
    return result
  }
  return {
    preprocess: {
      name: `widgets-markdown`,
      async markup({ content, filename }) {
        if (!filename || !is_markdown(filename)) return undefined
        const normalized = filename.replaceAll(`\\`, `/`)
        return compile_file(content, normalized)
      },
    },
    plugin: {
      name: `widgets-markdown-examples`,
      enforce: `pre`,
      // Examples register while their page compiles, so a page served from Vitest's module
      // cache would leave its example modules unregistered ("Markdown module not registered")
      configureVitest(context) {
        const define =
          context.defineCacheKeyGenerator ?? context.experimental_defineCacheKeyGenerator
        define?.(({ id }) => (is_markdown(id.split(`?`)[0]) ? false : undefined))
      },
      resolveId(id, importer) {
        const [filename, query] = id.split(`?`)
        const params = new URLSearchParams(query)
        const queries = QUERY_MODULES.filter((module) => params.has(module.query))
        if (queries.length && is_markdown(filename)) {
          if (queries.length > 1)
            throw new Error(`Import one of ?toc or ?metadata at a time: ${id}`)
          const [{ prefix }] = queries
          return this.resolve(filename, importer, { skipSelf: true }).then((resolved) =>
            resolved ? `${prefix}${resolved.id}.js` : undefined,
          )
        }
        if (!MODULE_ID.test(id)) return undefined
        const root = this.environment.config.root
          .replaceAll(`\\`, `/`)
          .replace(/\/$/u, ``)
        // Vite supplies root/index.html as the importer for top-level URL requests.
        // The graph distinguishes URLs from absolute IDs even when the root path repeats.
        if (
          this.environment.mode === `dev` &&
          (!importer || importer.replaceAll(`\\`, `/`) === `${root}/index.html`)
        ) {
          const source_id = this.environment.moduleGraph.urlToModuleMap.get(filename)?.id
          if (source_id && modules.has(source_id))
            return `${source_id}${id.slice(filename.length)}`
        }
        if (modules.has(filename)) return id
        // SvelteKit requests SSR styles relative to the Vite root. Virtual files do not
        // exist on disk, so Vite cannot resolve them to the compiler's absolute cache key.
        return modules.has(`${root}${filename}`) ? `${root}${id}` : id
      },
      load(id) {
        const query_module = QUERY_MODULES.find(({ prefix }) => id.startsWith(prefix))
        if (query_module) {
          const filename = id.slice(query_module.prefix.length, -3)
          this.addWatchFile(filename)
          return readFile(filename, `utf8`)
            .then((content) => cached_engine.parse(content, { filename }))
            .then(assert_ok)
            .then(
              (document) =>
                `export default ${JSON.stringify(query_module.emit(document))};`,
            )
        }
        if (!MODULE_ID.test(id) || id.includes(`?`)) return undefined
        const source = modules.get(id)
        if (source === undefined) throw new Error(`Markdown module not registered: ${id}`)
        if (this.environment) {
          let loaded = loaded_sources.get(this.environment)
          if (!loaded) loaded_sources.set(this.environment, (loaded = new Map()))
          loaded.set(id, source)
        }
        // The source has no physical file. Embed it so downstream Svelte maps can
        // resolve original positions without reading a nonexistent virtual filename.
        return {
          code: source,
          map: source_map(source, source, id, [
            { generated: 0, original: 0, length: source.length },
          ]),
        }
      },
      async hotUpdate(context) {
        const filename = context.file.replaceAll(`\\`, `/`)
        const graph = this.environment.moduleGraph
        const query_ids = new Set(
          QUERY_MODULES.map(({ prefix }) => `${prefix}${filename}.js`),
        )
        if (
          context.type === `delete` ||
          (!files.has(filename) &&
            ![...query_ids].some((id) => graph.idToModuleMap.has(id)))
        )
          return undefined
        if (files.has(filename)) await compile_file(await context.read(), filename)
        // Client and SSR share compilation but load modules independently. Compare
        // against each environment's loaded source, not another environment's update.
        const previous = loaded_sources.get(this.environment)
        const affected = new Set(
          context.modules.filter((module) => !MODULE_ID.test(module.id ?? ``)),
        )
        // Forget removed sources only after the loop so every module of a removed
        // example (script and style, in any graph order) is invalidated.
        const removed = new Set<string>()
        for (const [id, module] of graph.idToModuleMap) {
          if (query_ids.has(id)) {
            graph.invalidateModule(module, new Set(), context.timestamp)
            affected.add(module)
            continue
          }
          if (!id.startsWith(`${filename}.widgets-`)) continue
          const source_id = id.split(`?`)[0]
          if (previous?.get(source_id) === modules.get(source_id)) continue
          // Invalidate cached output without stamping imports as changed yet. Svelte
          // filters identical JS before Vite timestamps the actual CSS/JS updates.
          graph.invalidateModule(module, new Set(), context.timestamp)
          if (modules.has(source_id)) affected.add(module)
          else removed.add(source_id)
        }
        for (const source_id of removed) previous?.delete(source_id)
        // The Svelte hot-update hook must compile components before requesting their
        // derived CSS, whose loader reads the compiler cache. It filters unchanged JS.
        return [...affected].toSorted(
          (left, right) =>
            Number(left.id?.includes(`?`) ?? false) -
            Number(right.id?.includes(`?`) ?? false),
        )
      },
      watchChange(id, change) {
        if (change.event !== `delete`) return
        const filename = id.replaceAll(`\\`, `/`)
        files.delete(filename)
        drop_examples(modules, filename)
        for (const loaded of loaded_sources.values()) drop_examples(loaded, filename)
      },
      closeBundle() {
        files.clear()
        modules.clear()
        loaded_sources.clear()
        highlights.clear()
        pending_highlights.clear()
      },
    },
  }
}
