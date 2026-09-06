import type { PreprocessorGroup } from 'svelte/compiler'
import type { Plugin } from 'vite'
import { compile_markdown, type MarkdownOptions, type MarkdownResult } from './index.ts'
import { source_map } from './source-map.ts'

const EXAMPLE_ID = /\.widgets-example-\d+\.svelte(?:\?|$)/u

// Share this instance between the Svelte preprocessor and Vite plugin. Examples are
// registered before Svelte resolves imports; no generated JavaScript needs rewriting.
export function markdown_vite(options: MarkdownOptions = {}): {
  preprocess: PreprocessorGroup
  plugin: Plugin
} {
  const files = new Map<string, { content: string; result: Promise<MarkdownResult> }>()
  const examples = new Map<string, string>()
  const is_markdown = (filename: string) =>
    (options.extensions ?? [`.md`, `.svx`]).some((extension) =>
      filename.endsWith(extension),
    )
  const compile_file = (content: string, filename: string): Promise<MarkdownResult> => {
    const cached = files.get(filename)
    if (cached?.content === content) return cached.result
    const result = compile_markdown(content, { ...options, filename }).then(
      (compiled) => {
        // A slower obsolete compilation must not overwrite a newer edit's examples.
        if (files.get(filename)?.result !== result) return compiled
        for (const id of examples.keys())
          if (id.startsWith(`${filename}.widgets-example-`)) examples.delete(id)
        for (const example of compiled.examples) examples.set(example.id, example.source)
        return compiled
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
        return compile_file(content, filename.replaceAll(`\\`, `/`))
      },
    },
    plugin: {
      name: `widgets-markdown-examples`,
      enforce: `pre`,
      resolveId(id) {
        return EXAMPLE_ID.test(id) ? id : undefined
      },
      load(id) {
        if (!EXAMPLE_ID.test(id) || id.includes(`?`)) return undefined
        const source = examples.get(id)
        if (source === undefined) throw new Error(`Live example not registered: ${id}`)
        // The source has no physical file. Embed it so downstream Svelte maps can
        // resolve original positions without reading a nonexistent virtual filename.
        return {
          code: source,
          map: source_map(source, source, id, [{ text: source, offset: 0 }]),
        }
      },
      async hotUpdate(context) {
        const filename = context.file.replaceAll(`\\`, `/`)
        if (!is_markdown(filename)) return undefined
        await compile_file(await context.read(), filename)
        const affected = new Set(context.modules)
        const graph = this.environment.moduleGraph
        for (const [id, module] of graph.idToModuleMap) {
          if (!id.startsWith(`${filename}.widgets-example-`)) continue
          // Invalidate cached output without stamping imports as changed yet. Svelte
          // filters identical JS before Vite timestamps the actual CSS/JS updates.
          graph.invalidateModule(module, new Set(), context.timestamp)
          if (examples.has(id.split(`?`)[0])) affected.add(module)
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
        files.delete(id)
        for (const example of examples.keys())
          if (example.startsWith(`${id}.widgets-example-`)) examples.delete(example)
      },
      closeBundle() {
        files.clear()
        examples.clear()
      },
    },
  }
}
