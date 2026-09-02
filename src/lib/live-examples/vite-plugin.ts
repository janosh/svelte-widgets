// Vite plugin resolving virtual modules for example components
import { Buffer } from 'node:buffer'
import process from 'node:process'
import type { HmrContext, Plugin, ViteDevServer } from 'vite'
// Vite's own ESTree parser (native OXC, no extra dependency): acorn's node types and
// start/end offsets, module + latest syntax by default
import { parseSync } from 'vite'
import { EXAMPLE_MODULE_PREFIX } from './mdsvex-transform.ts'

// Matches import paths emitted by mdsvex-transform, e.g. ___live_example___0.svelte
const RE_EXAMPLE_IMPORT = new RegExp(`${EXAMPLE_MODULE_PREFIX}(\\d+)\\.svelte`, `u`)

// replaces text at [start, end)
type Edit = { start: number; end: number; content: string }
type TransformResult = {
  code: string
  map: { mappings: string }
}
const with_empty_map = (code: string): TransformResult => ({
  code,
  map: { mappings: `` },
})

// chars to scan past a property for trailing comma/whitespace (typically just ", ")
const TRAILING_CLEANUP_BOUND = 50

// reverse order so earlier positions stay valid
const apply_edits = (source: string, edits: Edit[]): string =>
  edits
    .toSorted((a, b) => b.start - a.start)
    .reduce(
      (str, { start, end, content }) => str.slice(0, start) + content + str.slice(end),
      source,
    )

function is_record(val: unknown): val is Record<string, unknown> {
  return typeof val === `object` && val !== null
}

type AstNode = Record<string, unknown>

// one walk for both node kinds this plugin rewrites: __live_example_src properties and
// import declarations/expressions
function collect_nodes(tree: unknown): { src_props: AstNode[]; imports: AstNode[] } {
  const src_props: AstNode[] = []
  const imports: AstNode[] = []
  const walk = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(walk)
    if (!is_record(node)) return
    if (
      node.type === `Property` &&
      is_record(node.key) &&
      node.key.name === `__live_example_src`
    ) {
      src_props.push(node)
    } else if (node.type === `ImportDeclaration` || node.type === `ImportExpression`) {
      imports.push(node)
    }
    // most property values are primitives, so only recurse where nesting is possible
    for (const value of Object.values(node)) if (is_record(value)) walk(value)
  }
  walk(tree)
  return { src_props, imports }
}

// Absolute module ID for consistent lookups. Not path.posix.join: it treats /src/... as
// already absolute.
function to_absolute(id: string, cwd: string): string {
  if (id.startsWith(`${cwd}/`) || id === cwd) return id
  return id.startsWith(`/`) ? `${cwd}${id}` : `${cwd}/${id}`
}

export default function live_examples_plugin(
  options: { extensions?: string[] } = {},
): Plugin[] {
  const { extensions = [`.svelte.md`, `.md`, `.svx`] } = options

  // extracted examples: virtual id -> svelte source
  const virtual_files = new Map<string, string>()

  let vite_server: ViteDevServer | undefined
  let pending_hmr_file: string | null = null
  const cwd = process.cwd().replaceAll(`\\`, `/`)

  // Pre-enforced so resolveId beats vite-plugin-svelte's load-compiled-css:resolveId and
  // derived CSS modules get the component's absolute path, which its cache lookup needs.
  const resolve_plugin: Plugin = {
    name: `live-examples-resolve`,
    enforce: `pre`,
    resolveId(id: string): string | undefined {
      return id.includes(EXAMPLE_MODULE_PREFIX) ? to_absolute(id, cwd) : undefined
    },
  }

  const main_plugin: Plugin = {
    name: `live-examples-plugin`,

    configureServer(server) {
      vite_server = server
    },

    load(id: string): string | undefined {
      if (!id.includes(EXAMPLE_MODULE_PREFIX)) return undefined

      const [base_id, query = ``] = id.split(`?`)

      // Leave derived requests (CSS, scripts) to vite-plugin-svelte. Must precede the
      // virtual_files lookup, else CSS requests get Svelte source back.
      if (/type=(?<type>style|script|module)/u.test(query)) return undefined

      const src = virtual_files.get(base_id)
      if (src !== undefined) return src

      const msg = `Example src not found for ${id}`
      if (process.env.NODE_ENV === `production`) {
        throw new Error(msg)
      }
      // in dev, warn and return an error component so the issue is visible
      this.warn(msg)
      return `<script>console.error(${JSON.stringify(
        msg,
      )})</script><p style="color:red">${msg}</p>`
    },

    transform(code: string, id: string): TransformResult | undefined {
      // strip Vite's ?query (HMR, styles, ...) before the extension check
      const base_id = id.split(`?`)[0]

      const is_example_module = id.includes(EXAMPLE_MODULE_PREFIX)
      const is_markdown = extensions.some((ext) => base_id.endsWith(ext))
      if (!is_example_module && !is_markdown) return undefined

      // only the main markdown file; matches ?svelte&type= and SSR's ?inline&svelte&type=
      if (id.includes(`svelte&type=`)) return with_empty_map(code)

      if (is_markdown) {
        // parseSync reports errors instead of throwing (unlike acorn), which matters
        // because Svelte syntax the JS parser can't handle just skips the transform
        const { program: tree, errors } = parseSync(`file.js`, code)
        if (errors.length > 0) return with_empty_map(code)
        const edits: Edit[] = []
        const { src_props, imports } = collect_nodes(tree)
        const invalidate_virtual_modules = (virtual_id: string) => {
          const server = vite_server
          if (!server) return
          for (const module_id of [
            virtual_id,
            base_id,
            `${virtual_id}?svelte&type=style&lang.css`,
          ]) {
            const mod = server.moduleGraph.getModuleById(module_id)
            if (mod) server.moduleGraph.invalidateModule(mod)
          }

          // full reload during HMR only: reloadModule alone doesn't suffice, since
          // vite-plugin-svelte skips CSS-only changes when the JS output is identical
          if (pending_hmr_file !== base_id) return
          pending_hmr_file = null
          setTimeout(() => {
            server.hot.send({ type: `full-reload`, path: `*` })
          }, 200)
        }

        for (const [idx, prop] of src_props.entries()) {
          const prop_value = prop.value
          if (!is_record(prop_value)) continue
          if (prop_value.type !== `Literal` || typeof prop_value.value !== `string`)
            continue

          const src = Buffer.from(prop_value.value, `base64`).toString(`utf-8`)

          // base_id, without query params, keeps virtual file IDs consistent
          const virtual_id = `${base_id}${EXAMPLE_MODULE_PREFIX}${idx}.svelte`

          if (src !== virtual_files.get(virtual_id)) {
            virtual_files.set(virtual_id, src)
            // after updating the source, so load() serves the new content
            invalidate_virtual_modules(virtual_id)
          }

          // Remove the property (including trailing comma/whitespace)
          if (typeof prop.start === `number` && typeof prop.end === `number`) {
            let end = prop.end
            const max_end = Math.min(prop.end + TRAILING_CLEANUP_BOUND, code.length)
            while (end < max_end && /[\s,]/u.test(code[end])) end++
            edits.push({ start: prop.start, end, content: `` })
          }
        }

        // clear even when no examples changed; a stale flag forces a needless full reload
        if (pending_hmr_file === base_id) pending_hmr_file = null

        // Update import paths (static and dynamic) to use virtual file IDs
        for (const import_node of imports) {
          const source = import_node.source
          if (!is_record(source) || typeof source.value !== `string`) continue
          const match = RE_EXAMPLE_IMPORT.exec(source.value)
          if (
            match &&
            typeof source.start === `number` &&
            typeof source.end === `number`
          ) {
            const virtual_id = `${base_id}${EXAMPLE_MODULE_PREFIX}${match[1]}.svelte`
            edits.push({
              start: source.start + 1,
              end: source.end - 1,
              content: virtual_id,
            })
          }
        }

        return with_empty_map(apply_edits(code, edits))
      }

      return with_empty_map(code)
    },

    handleHotUpdate(ctx: HmrContext) {
      const file = ctx.file.replaceAll(`\\`, `/`)
      if (extensions.some((ext) => file.endsWith(ext))) {
        pending_hmr_file = file
      }
      // No virtual modules here: the parent .md is not re-transformed yet, so they'd load
      // stale content. The transform hook invalidates and reloads once virtual_files is up
      // to date.
      return ctx.modules
    },
  }

  return [resolve_plugin, main_plugin]
}
