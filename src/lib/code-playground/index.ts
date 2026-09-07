import type { parse as parse_svelte } from 'svelte/compiler'
import type { EditorBackend } from '../code-editor/types.ts'

export type PlaygroundFiles = Record<string, string>
export type PlaygroundProject = { files: PlaygroundFiles; entry: string }
export type PlaygroundBuild = {
  modules: Record<string, string>
  entry: string
  html: string
}
export type PlaygroundCompiler = (project: PlaygroundProject) => Promise<PlaygroundBuild>
export type PlaygroundMessage = {
  channel: string
  kind: 'ready' | 'log' | 'error'
  text: string
}
const max_source_size = 512_000
const max_encoded_size = max_source_size * 8
export const runtime_modules = {
  svelte: `svelte`,
  client: `svelte/internal/client`,
  store: `svelte/store`,
  motion: `svelte/motion`,
  transition: `svelte/transition`,
  easing: `svelte/easing`,
  events: `svelte/events`,
  reactivity: `svelte/reactivity`,
  window: `svelte/reactivity/window`,
  legacy: `svelte/legacy`,
}
const module_id = (path: string): string => `playground:/${path}`
const script_json = (value: unknown): string =>
  JSON.stringify(value).replaceAll(`<`, `\\u003c`)

export const validate_project = (value: unknown): PlaygroundProject => {
  if (
    !value ||
    typeof value !== `object` ||
    !(`files` in value) ||
    !(`entry` in value) ||
    typeof value.entry !== `string` ||
    !value.files ||
    typeof value.files !== `object` ||
    Array.isArray(value.files)
  )
    throw new Error(`Expected playground files and an entry filename`)
  const files: PlaygroundFiles = Object.create(null)
  let size = 0
  const entries = Object.entries(value.files)
  if (!entries.length || entries.length > 32)
    throw new Error(`A playground needs 1–32 files`)
  for (const [path, source] of entries) {
    if (
      !/^[\w.-]+(?:\/[\w.-]+)*$/u.test(path) ||
      path.split(`/`).some((part) => part === `.` || part === `..`) ||
      !/\.(?:svelte|js|mjs|css|html|json)$/u.test(path) ||
      typeof source !== `string`
    )
      throw new Error(`Invalid playground file: ${path}`)
    size += source.length
    files[path] = source
  }
  if (size > max_source_size)
    throw new Error(`Playground source exceeds ${max_source_size} characters`)
  if (
    !Object.hasOwn(files, value.entry) ||
    !/\.(?:svelte|js|mjs|html)$/u.test(value.entry)
  )
    throw new Error(`Missing or unsupported playground entry: ${value.entry}`)
  return { files, entry: value.entry }
}

export const encode_project = (project: PlaygroundProject): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(validate_project(project)))
  let binary = ``
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const encoded = btoa(binary)
    .replaceAll(`+`, `-`)
    .replaceAll(`/`, `_`)
    .replaceAll(`=`, ``)
  if (encoded.length > max_encoded_size)
    throw new Error(`Encoded playground exceeds ${max_encoded_size} characters`)
  return encoded
}
export const decode_project = (encoded: string): PlaygroundProject => {
  if (encoded.length > max_encoded_size || !/^[\w-]+$/u.test(encoded))
    throw new Error(`Invalid encoded playground`)
  const binary = atob(encoded.replaceAll(`-`, `+`).replaceAll(`_`, `/`))
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  const json = new TextDecoder(`utf-8`, { fatal: true }).decode(bytes)
  return validate_project(JSON.parse(json))
}

// The model provides editing and history; syntax highlighting is an optional consumer backend.
export const playground_editor_backend: EditorBackend = {
  open_doc: async ({ uri }) => ({
    language: uri.split(`.`).pop() ?? `text`,
    editable: true,
    highlightable: false,
  }),
  apply_edits: async ({ revision }) => revision,
  set_text: async ({ revision }) => revision,
  highlight_lines: async () => [],
  cancel_highlight: () => undefined,
  close_doc: async () => undefined,
}

const resolve_import = (
  specifier: string,
  filename: string,
  files: PlaygroundFiles,
  imports?: ReadonlySet<string>,
): string => {
  if (Object.values(runtime_modules).includes(specifier)) return specifier
  if (
    [
      `svelte/internal/disclose-version`,
      `svelte/internal/flags/legacy`,
      `svelte/internal/flags/tracing`,
    ].includes(specifier)
  )
    return `svelte/internal/client`
  if (imports?.has(specifier)) return specifier
  if (!specifier.startsWith(`./`) && !specifier.startsWith(`../`))
    throw new Error(
      `${filename}: unsupported import ${JSON.stringify(specifier)}; only local files and the Svelte runtime are supported`,
    )
  const segments = filename.split(`/`).slice(0, -1)
  for (const segment of specifier.split(`/`)) {
    if (segment === `.`) continue
    if (segment === `..`) {
      if (!segments.length)
        throw new Error(`${filename}: import escapes the project: ${specifier}`)
      segments.pop()
    } else segments.push(segment)
  }
  const resolved = segments.join(`/`)
  if (!Object.hasOwn(files, resolved))
    throw new Error(`${filename}: missing imported file ${specifier}`)
  return module_id(resolved)
}

// Nodes come from the Svelte compiler, which supplies offsets for every syntax node.
type SyntaxNode = {
  type?: string
  start: number
  end: number
  value?: unknown
  source?: SyntaxNode
  meta?: SyntaxNode
  key?: SyntaxNode
  properties?: SyntaxNode[]
  attributes?: { key: SyntaxNode; value: SyntaxNode }[]
  options?: SyntaxNode
  [key: string]: unknown
}
const rewrite_imports = (
  source: string,
  filename: string,
  files: PlaygroundFiles,
  parse: typeof parse_svelte,
  imports?: ReadonlySet<string>,
): string => {
  const prefix = `<script module>`
  const parsed = parse(
    `${prefix}${source.replaceAll(/<\/script/giu, ` /script`)}</script>`,
    { modern: true },
  )
  const edits: { start: number; end: number; text: string }[] = []
  const property_value = (
    node: SyntaxNode | undefined,
    key: string,
  ): SyntaxNode | undefined => {
    const property =
      node?.type === `ObjectExpression` && node.properties?.length === 1
        ? node.properties[0]
        : undefined
    if (
      property?.type === `Property` &&
      !property.computed &&
      !property.method &&
      property.kind === `init` &&
      (property.key?.name ?? property.key?.value) === key
    )
      return property.value as SyntaxNode
    return undefined
  }
  const visit = (value: unknown): void => {
    if (!value || typeof value !== `object`) return
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    const node = value as SyntaxNode
    if (node.type === `ImportExpression` && typeof node.source?.value !== `string`)
      throw new Error(`${filename}: dynamic imports require a literal filename`)
    if (node.type === `MetaProperty` && node.meta?.name === `import`)
      throw new Error(`${filename}: import.meta is unavailable in playground modules`)
    if (
      !node.source ||
      ![
        `ImportDeclaration`,
        `ExportNamedDeclaration`,
        `ExportAllDeclaration`,
        `ImportExpression`,
      ].includes(node.type ?? ``)
    ) {
      Object.values(node).forEach(visit)
      return
    }
    const { value: specifier, start, end } = node.source
    if (typeof specifier !== `string`) return
    const dynamic = node.type === `ImportExpression`
    const attributes = node.attributes
    let replacement_end = end
    let suffix = ``
    if (attributes?.length || node.options) {
      const type = dynamic
        ? property_value(property_value(node.options, `with`), `type`)?.value
        : attributes?.length === 1 &&
            (attributes[0].key.name ?? attributes[0].key.value) === `type`
          ? attributes[0].value.value
          : undefined
      if (!specifier.endsWith(`.json`) || type !== `json`)
        throw new Error(
          `${filename}: import attributes must be a literal JSON type on a .json file`,
        )
      // JSON becomes JavaScript. Remove only validated, side-effect-free attributes.
      replacement_end = node.end - (dynamic ? 1 : 0)
      suffix = dynamic ? `` : `;`
    }
    edits.push({
      start: start - prefix.length,
      end: replacement_end - prefix.length,
      text: JSON.stringify(resolve_import(specifier, filename, files, imports)) + suffix,
    })
  }
  visit(parsed.module?.content)
  for (const edit of edits.toSorted((left, right) => right.start - left.start))
    source = source.slice(0, edit.start) + edit.text + source.slice(edit.end)
  return source
}

export const compile_playground: PlaygroundCompiler = async (project) => {
  const { files, entry } = validate_project(project)
  const { compile, parse } = await import('svelte/compiler')
  const modules: Record<string, string> = Object.create(null)
  const imports = new Set(Object.keys(files).map(module_id))
  let html = ``
  let entry_module = module_id(entry)
  for (const [filename, source] of Object.entries(files)) {
    let code = source
    if (filename.endsWith(`.svelte`))
      code = compile(source, {
        filename,
        generate: `client`,
        css: `injected`,
        dev: false,
      }).js.code
    else if (filename.endsWith(`.css`))
      code = `const style = document.createElement('style'); style.textContent = ${JSON.stringify(source)}; document.head.append(style);`
    else if (filename.endsWith(`.json`)) {
      JSON.parse(source)
      code = `export default JSON.parse(${JSON.stringify(source)});`
    } else if (filename.endsWith(`.html`)) {
      if (filename !== entry) code = `export default ${JSON.stringify(source)};`
      else {
        const template = document.createElement(`template`)
        template.innerHTML = source
        const content = template.content
        const scripts: string[] = []
        for (const script of content.querySelectorAll(`script`)) {
          if (script.type !== `module`)
            throw new Error(`${filename}: scripts must use type="module"`)
          const specifier = script.getAttribute(`src`)
          const resolved =
            specifier === null
              ? `${module_id(filename)}?script=${scripts.length}`
              : resolve_import(specifier, filename, files)
          if (specifier === null) {
            imports.add(resolved)
            modules[resolved] = rewrite_imports(
              script.textContent ?? ``,
              filename,
              files,
              parse,
            )
          }
          scripts.push(`await import(${JSON.stringify(resolved)});`)
          script.remove()
        }
        for (const link of content.querySelectorAll(`link[rel="stylesheet"]`)) {
          const resolved = resolve_import(
            link.getAttribute(`href`) ?? ``,
            filename,
            files,
          )
          scripts.push(`import ${JSON.stringify(resolved)};`)
          link.remove()
        }
        html = template.innerHTML
        code = scripts.join(`\n`)
      }
    }
    // Generated asset modules contain no imports. Only authored JS and compiled Svelte
    // need linking; HTML script/style imports were resolved during extraction above.
    modules[module_id(filename)] = /\.(?:svelte|m?js)$/u.test(filename)
      ? rewrite_imports(code, filename, files, parse, imports)
      : code
  }
  if (entry.endsWith(`.svelte`)) {
    entry_module = `playground:entry`
    modules[entry_module] =
      `import { mount } from 'svelte'; import App from ${JSON.stringify(module_id(entry))}; mount(App, { target: document.getElementById('playground-root') });`
    html = `<div id="playground-root"></div>`
  }
  return { modules, entry: entry_module, html }
}

export const preview_document = (
  build: PlaygroundBuild,
  runtime_source: string,
  channel: string,
): string => {
  // Modules are created inside the opaque-origin frame. All URLs die with that document.
  const boot = `
const channel = ${script_json(channel)};
const send = (kind, text = '') => parent.postMessage({channel, kind, text: String(text).slice(0, 10000)}, '*');
const format = value => { try { return typeof value === 'string' ? value : JSON.stringify(value) ?? String(value) } catch { return String(value) } };
for (const level of ['log', 'info', 'warn', 'error']) { const original = console[level]; console[level] = (...args) => { send(level === 'error' ? 'error' : 'log', args.map(format).join(' ')); original.apply(console, args) }; }
addEventListener('error', event => send('error', event.message));
addEventListener('unhandledrejection', event => send('error', event.reason?.message ?? event.reason));
document.body.insertAdjacentHTML('afterbegin', ${script_json(build.html)});
const modules = ${script_json(build.modules)};
const runtime_url = URL.createObjectURL(new Blob([${script_json(runtime_source)}], {type: 'text/javascript'}));
const runtime = await import(runtime_url);
for (const [name, specifier] of Object.entries(${script_json(runtime_modules)})) {
  modules[specifier] = 'import * as runtime from ' + JSON.stringify(runtime_url) + ';' + Object.keys(runtime[name]).map((key, index) => 'const value_' + index + ' = runtime[' + JSON.stringify(name) + '][' + JSON.stringify(key) + ']; export { value_' + index + ' as ' + key + ' };').join('');
}
const imports = Object.fromEntries(Object.entries(modules).map(([id, code]) => [id, URL.createObjectURL(new Blob([code], {type: 'text/javascript'}))]));
const map = document.createElement('script'); map.type = 'importmap'; map.textContent = JSON.stringify({imports}); document.head.append(map);
import(${script_json(build.entry)}).then(() => send('ready')).catch(error => send('error', error.message));
`
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><style>body{font-family:system-ui,sans-serif;margin:1rem;color:#222;background:white}button,input,select,textarea{font:inherit}</style></head><body><script type="module">${boot}</script></body></html>`
}

export const is_playground_message = (
  value: unknown,
  channel: string,
): value is PlaygroundMessage => {
  if (!value || typeof value !== `object`) return false
  const message = value as Record<string, unknown>
  return (
    message.channel === channel &&
    typeof message.kind === `string` &&
    [`ready`, `log`, `error`].includes(message.kind) &&
    typeof message.text === `string` &&
    message.text.length <= 10_000
  )
}
