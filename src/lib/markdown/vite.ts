import type { PreprocessorGroup } from 'svelte/compiler'
import type { Plugin } from 'vite'
import {
  compile_markdown_with_transform,
  create_markdown,
  assert_ok,
  type MarkdownEngine,
  type MarkdownResult,
} from './index.ts'
import { isolate_prose } from './prose.ts'
import { source_map } from './source-map.ts'

const MODULE_ID = /\.widgets-(?:example-[a-f\d]+-[a-f\d]+-\d+|prose-\d+)\.svelte(?:\?|$)/u

export type MarkdownViteOptions = {
  // Bounded per-integration LRU cache; 0 disables it. In-flight requests are shared.
  highlight_cache_size?: number
}

// Share this instance between the Svelte preprocessor and Vite plugin. Examples are
// registered before Svelte resolves imports; no generated JavaScript needs rewriting.
export function markdown_vite(
  engine: MarkdownEngine,
  settings: MarkdownViteOptions = {},
): {
  preprocess: PreprocessorGroup
  plugin: Plugin
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
  const is_markdown = (filename: string) =>
    (options.extensions ?? [`.md`, `.svx`]).some((extension) =>
      filename.endsWith(extension),
    )
  let development = false
  const compile_file = (content: string, filename: string): Promise<MarkdownResult> => {
    const cached = files.get(filename)
    if (cached?.content === content && cached.result) return cached.result
    const prose = new Map<string, string>()
    const result = cached_engine
      .parse(content, { filename })
      .then((document) =>
        compile_markdown_with_transform(
          assert_ok(document),
          development ? (code) => isolate_prose(code, filename, prose) : undefined,
        ),
      )
      .then(assert_ok)
      .then(
        (compiled) => {
          // A slower obsolete compilation must not overwrite a newer edit's examples.
          if (files.get(filename)?.result !== result) return compiled
          for (const id of modules.keys())
            if (id.startsWith(`${filename}.widgets-`)) modules.delete(id)
          for (const example of compiled.examples) modules.set(example.id, example.source)
          for (const [id, source] of prose) modules.set(id, source)
          return compiled
        },
        (error: unknown) => {
          if (files.get(filename)?.result === result) files.set(filename, { content })
          throw error
        },
      )
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
      configResolved(config) {
        development = config.command === `serve` && !config.isProduction
      },
      resolveId(id) {
        return MODULE_ID.test(id) ? id : undefined
      },
      load(id) {
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
        if (context.type === `delete` || !files.has(filename)) return undefined
        await compile_file(await context.read(), filename)
        // Client and SSR share compilation but load modules independently. Compare
        // against each environment's loaded source, not another environment's update.
        const previous = loaded_sources.get(this.environment)
        const affected = new Set(
          context.modules.filter((module) => !MODULE_ID.test(module.id ?? ``)),
        )
        const graph = this.environment.moduleGraph
        for (const [id, module] of graph.idToModuleMap) {
          if (!id.startsWith(`${filename}.widgets-`)) continue
          const source_id = id.split(`?`)[0]
          if (previous?.get(source_id) === modules.get(source_id)) continue
          // Invalidate cached output without stamping imports as changed yet. Svelte
          // filters identical JS before Vite timestamps the actual CSS/JS updates.
          graph.invalidateModule(module, new Set(), context.timestamp)
          if (modules.has(source_id)) affected.add(module)
          else previous?.delete(source_id)
        }
        // The Svelte hot-update hook must compile components before requesting their
        // derived CSS, whose loader reads the compiler cache. It filters unchanged JS.
        return [...affected].toSorted(
          (left, right) =>
            Number(left.id?.includes(`?`)) - Number(right.id?.includes(`?`)),
        )
      },
      watchChange(id, change) {
        if (change.event !== `delete`) return
        const filename = id.replaceAll(`\\`, `/`)
        files.delete(filename)
        for (const example of modules.keys())
          if (example.startsWith(`${filename}.widgets-`)) modules.delete(example)
        for (const loaded of loaded_sources.values())
          for (const module of loaded.keys())
            if (module.startsWith(`${filename}.widgets-`)) loaded.delete(module)
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
