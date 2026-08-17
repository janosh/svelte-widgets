// Remark plugin - transforms ```svelte example code blocks into rendered components
import { Buffer } from 'node:buffer'
import path from 'node:path'
import { language_label_html } from '../internal/language-label.ts'
import { hast_to_html } from './hast.ts'
import { starry_night } from './highlighter.ts'

// Escape backticks and template literal syntax for embedding in template literals
const encode_escapes = (src: string) =>
  src.replaceAll(`\``, `\\\``).replaceAll(`\${`, `\\$\{`)

// script/style matchers; may misfire on </script> inside comments or exotic attributes
const RE_SCRIPT_START = /<script\b(?:[^<>"']|"[^"]*"|'[^']*')*>/u
const RE_SCRIPT_BLOCK = /<script[\s\S]*?>[\s\S]*?<\/script>/gu
const RE_STYLE_BLOCK = /<style[\s\S]*?>[\s\S]*?<\/style>/gu

// Parses key=value pairs from a string. Supports strings (with escaped quotes),
// numbers, booleans, and arrays. Note: nested structures in arrays are not supported.
// Bare values (key=foo, key=true, key=-1.5) are captured greedily so invalid JSON
// throws a parse error instead of silently splitting into two bare-word keys.
const RE_PARSE_META = /(?:\w+="(?:[^"\\]|\\.)*"|\w+=\[[^\]]*\]|\w+=[^\s"[\]]+|\w+)/gu

export const EXAMPLE_MODULE_PREFIX = `___live_example___`
export const EXAMPLE_COMPONENT_PREFIX = `LiveExample___`

// Languages that render as live Svelte components
const LIVE_LANGUAGES = new Set([`svelte`, `html`])

interface RemarkMeta {
  Wrapper?: string | [string, string]
  filename?: string
  csr?: boolean
  example?: boolean
  hide_script?: boolean
  hide_style?: boolean
  [key: string]: unknown
}

interface RemarkOptions {
  defaults?: Partial<RemarkMeta>
}

interface RemarkTree {
  type: string
  children: RemarkNode[]
}

interface RemarkNode {
  type: string
  lang?: string
  meta?: string
  value?: string
  children?: RemarkNode[]
}

const visit = (tree: RemarkTree, type: string, callback: (node: RemarkNode) => void) => {
  const walk = (nodes: RemarkNode[]) => {
    for (const node of nodes) {
      if (node.type === type) callback(node)
      if (node.children) walk(node.children)
    }
  }
  walk(tree.children)
}

interface RemarkFile {
  filename: string
  cwd: string
}

const DEFAULT_WRAPPER = `$lib/CodeExample.svelte`

type RemarkTransformer = (tree: RemarkTree, file: RemarkFile) => void

function remark(options: RemarkOptions = {}): RemarkTransformer {
  const { defaults = {} } = options

  return function transformer(tree: RemarkTree, file: RemarkFile): void {
    // csr flag per live example (index = component index); drives the import loop below
    const example_csr: (boolean | undefined)[] = []
    // Deduped wrapper imports: JSON key identifies the wrapper (string path or
    // [module, export] tuple), value holds the generated alias + import statement
    const wrapper_imports = new Map<string, { alias: string; statement: string }>()

    const filename = path.relative(file.cwd, file.filename)

    function get_wrapper_alias(wrapper: string | [string, string]): string {
      const key = JSON.stringify(wrapper)
      let entry = wrapper_imports.get(key)
      if (!entry) {
        const alias = `Example_${wrapper_imports.size}`
        const statement =
          typeof wrapper === `string`
            ? `import ${alias} from "${wrapper}";\n`
            : `import { ${wrapper[1]} as ${alias} } from "${wrapper[0]}";\n`
        entry = { alias, statement }
        wrapper_imports.set(key, entry)
      }
      return entry.alias
    }

    visit(tree, `code`, (node) => {
      const meta: RemarkMeta = {
        Wrapper: DEFAULT_WRAPPER,
        filename,
        ...defaults,
        ...parse_meta(node.meta ?? ``),
      }

      const { csr, example, Wrapper } = meta
      const scope = node.lang ? starry_night.flagToScope(node.lang) : undefined

      // find code blocks with `example` meta in supported languages
      if (example && node.lang && scope) {
        const is_live = LIVE_LANGUAGES.has(node.lang)
        const wrapper_alias = is_live ? get_wrapper_alias(Wrapper ?? DEFAULT_WRAPPER) : ``

        const value = create_example_component(
          node.value ?? ``,
          meta,
          is_live ? example_csr.length : -1,
          node.lang,
          scope,
          wrapper_alias,
        )

        if (is_live) example_csr.push(csr)

        node.type = `paragraph`
        node.children = [{ type: `text`, value }]
        delete node.lang
        delete node.meta
        delete node.value
      }
    })

    // add wrapper + example component imports for each generated example
    let scripts = ``
    for (const { statement } of wrapper_imports.values()) scripts += statement
    for (const [idx, csr] of example_csr.entries()) {
      if (!csr) {
        scripts += `import ${EXAMPLE_COMPONENT_PREFIX}${idx} from "${EXAMPLE_MODULE_PREFIX}${idx}.svelte";\n`
      }
    }

    // Nothing to inject when the file contains no live examples
    if (!scripts) return

    // Try to inject imports into existing script block. Only consider nodes that
    // *start* with <script> — raw HTML nodes merely containing a <script> tag
    // mid-content (e.g. inside {@html `...`}) must not receive the imports.
    let injected = false
    visit(tree, `html`, (node) => {
      if (injected || !node.value) return
      const trimmed = node.value.trimStart()
      if (trimmed.startsWith(`<script`) && RE_SCRIPT_START.test(trimmed)) {
        node.value = node.value.replace(
          RE_SCRIPT_START,
          (opening_tag) => `${opening_tag}\n${scripts}`,
        )
        injected = true
      }
    })

    if (!injected) {
      tree.children.push({ type: `html`, value: `<script>\n${scripts}</script>` })
    }
  }
}

function parse_meta(meta: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const part of meta.match(RE_PARSE_META) ?? []) {
    const eq = part.indexOf(`=`)
    const key = eq === -1 ? part : part.slice(0, eq)
    const value = eq === -1 ? `true` : part.slice(eq + 1)
    try {
      result[key] = JSON.parse(value)
    } catch {
      throw new Error(`Unable to parse meta \`${key}=${value}\``)
    }
  }
  return result
}

function format_code(code: string, meta: RemarkMeta): string {
  let result = code
  if (meta.hide_script) result = result.replace(RE_SCRIPT_BLOCK, ``)
  if (meta.hide_style) result = result.replace(RE_STYLE_BLOCK, ``)
  return result.trim()
}

function create_example_component(
  value: string,
  meta: RemarkMeta,
  index: number, // -1 for code-only examples (ts, js, css, ...) without a live component
  lang: string,
  scope: string,
  wrapper_alias: string,
): string {
  const code = format_code(value, meta)
  const tree = starry_night.highlight(code, scope)
  // Convert newlines to &#10; to prevent bundlers from stripping whitespace
  const highlighted = hast_to_html(tree).replaceAll(`\n`, `&#10;`)

  if (index === -1) {
    // Close and reopen <p> to avoid block-in-inline HTML nesting issues
    return `</p><pre class="highlight highlight-${lang}" style="position:relative">${language_label_html(lang)}<code>{@html ${JSON.stringify(
      highlighted,
    )}}</code></pre><p>`
  }

  // Live examples (svelte, html) - render with CodeExample wrapper.
  // JSON.stringify alone produces a valid double-quoted JS string literal for the
  // src={...} expression — escaping backticks/`${` on top of it would double-escape
  // and inject literal backslashes into the runtime src prop.
  const component = `${EXAMPLE_COMPONENT_PREFIX}${index}`
  // base64-encode to prevent preprocessors from modifying the content
  const base64_src = Buffer.from(value, `utf-8`).toString(`base64`)
  const escaped_src = JSON.stringify(code)
  const escaped_meta = encode_escapes(JSON.stringify({ ...meta, lang }))

  return `</p>
  <${wrapper_alias}
    __live_example_src={"${base64_src}"}
    src={${escaped_src}}
    meta={${escaped_meta}}
  >
    {#snippet example()}
      ${
        meta.csr
          ? `{#if typeof window !== 'undefined'}
        {#await import("${EXAMPLE_MODULE_PREFIX}${index}.svelte") then module}
          {@const ${component} = module.default}
          <${component} />
        {/await}
        {/if}`
          : `<${component} />`
      }
    {/snippet}

    {#snippet code()}
      {@html ${JSON.stringify(highlighted)}}
    {/snippet}
  </${wrapper_alias}>
  <p>`
}

export default remark
