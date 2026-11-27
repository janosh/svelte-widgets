// Prop docs for a generated API reference: name, type, default and `//` comment of every prop
// in each component's `$props()` destructuring, for PropsTable to render (`//` comments, unlike
// JSDoc, never reach IDE hovers). One TypeScript program over all component scripts resolves
// props a component inherits through imported or intersected types (shared prop types,
// Omit<...>, HTMLAttributes) to their declarations. Served by prop_docs_plugin as the
// `virtual:prop-docs` module, so nothing is written to disk.
import { globSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import ts from 'typescript'
import type { Plugin } from 'vite'
import type { ComponentDoc, PropDoc } from './types'

// Each component's merged <script> blocks become a virtual TS file next to it, so relative
// and subpath (`#lib/...`) imports resolve as in the component
const VIRTUAL_SUFFIX = `.props.ts`
const LINT_PRAGMA_RE = /^(?:oxlint|eslint|oxfmt|prettier|@ts-)/
// specifiers of script modules, whose types count (not `./x.css`, `./data.json?raw`, ...)
const SCRIPT_SPEC_RE = /^(?:[^?]*\/)?[^/.?]+(?:\.(?:svelte|[cm]?[jt]s))*$/

// Multi-line source text on one line, minus the padding, trailing commas and leading union
// operator its line breaks left
const one_line = (text: string): string =>
  text
    .replaceAll(/\s+/g, ` `)
    .replaceAll(/(?<open>[([]) /g, `$<open>`)
    .replaceAll(/,? (?<close>[)\]])/g, `$<close>`)
    .replaceAll(`, }`, ` }`)
    .trim()
    .replace(/^[|&] /, ``)

// Plain string literals as '...': the repo writes them in backticks, which read as nested code
// in the rendered table. Template literals with ${...} (template literal types) keep theirs.
const quote_literals = (text: string): string =>
  text.replaceAll(/`(?<text>[^`$\\']*)`/g, `'$<text>'`)

// A type on one line, also without the padding inside <...> and the union operator its line
// breaks left leading a type argument: `Pick< T, | 'a' | 'b' >` -> `Pick<T, 'a' | 'b'>`
const type_line = (text: string): string =>
  quote_literals(
    one_line(text)
      .replaceAll(`< `, `<`)
      .replaceAll(` >`, `>`)
      .replaceAll(/(?<before>[<([]|, ) ?[|&] /g, `$<before>`),
  )

// Source comments are often lowercase fragments: capitalize a leading plain word for the table,
// but not an identifier (`x_axis`, `on_click(...)`) or a JS literal whose case is meaningful
const KEEP_CASE = new Set([`null`, `undefined`, `true`, `false`])
export const sentence_case = (text: string): string => {
  const word = /^[a-z]+(?![\w.(])/.exec(text)?.[0]
  return word && !KEEP_CASE.has(word) ? text[0].toUpperCase() + text.slice(1) : text
}

const comment_lines = (text: string, ranges: readonly ts.CommentRange[]): string[] =>
  ranges
    .filter(({ kind }) => kind === ts.SyntaxKind.SingleLineCommentTrivia)
    .map(({ pos, end }) => text.slice(pos + 2, end).trim())
    .filter((line) => line && !LINT_PRAGMA_RE.test(line))

// `//` lines directly above a node (the block touching it, no blank line in between) and a
// `//` comment trailing it on the same line, after an optional separator
const comment_parts = (node: ts.Node): { above: string[]; trailing: string[] } => {
  const { text } = node.getSourceFile()
  const leading = ts.getLeadingCommentRanges(text, node.pos) ?? []
  let block_start = leading.length
  let next_start = node.getStart()
  while (
    block_start > 0 &&
    !/\n[^\S\n]*\n/.test(text.slice(leading[block_start - 1].end, next_start))
  )
    next_start = leading[--block_start].pos
  const after = `;,`.includes(text[node.end]) ? node.end + 1 : node.end
  return {
    above: comment_lines(text, leading.slice(block_start)),
    trailing: comment_lines(text, ts.getTrailingCommentRanges(text, after) ?? []),
  }
}

// A node's description from comment_parts, minus a leading line of at most three unpunctuated
// words, which heads a group of props rather than describing this one
// (`// Controls`, `// Axis configuration`)
const node_comment = (node: ts.Node): string | undefined => {
  const { above, trailing } = comment_parts(node)
  // also when the prop's own description follows it (`// Component-specific props` then
  // `// Bars grow upward...`): the heading belongs to the group, not this prop
  const heads_group = /^[A-Z][\w-]*(?: [\w-]+){0,2}$/.test(above[0] ?? ``)
  const lines = [...(heads_group ? above.slice(1) : above), ...trailing]
  return lines.length ? lines.join(` `) : undefined
}

const parse = (text: string): ts.SourceFile =>
  ts.createSourceFile(`script.ts`, text, ts.ScriptTarget.ESNext, true)

const is_call_to = (node: ts.Node | undefined, name: string): node is ts.CallExpression =>
  node !== undefined &&
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === name

// The `$props()` declaration and its type (annotation or `$props<T>()` argument)
const find_props = (source: ts.SourceFile) => {
  let found: { declaration: ts.VariableDeclaration; type_node?: ts.TypeNode } | undefined
  const visit = (node: ts.Node): void => {
    if (found) return
    if (ts.isVariableDeclaration(node) && is_call_to(node.initializer, `$props`))
      found = {
        declaration: node,
        type_node: node.type ?? node.initializer.typeArguments?.[0],
      }
    else ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

// TS for a component: its <script> blocks (module first, so the props annotation can use its
// types) plus a default export typed like the component, so `ComponentProps<typeof X>` in other
// components resolves to X's documented props. Generic parameters (`generics="T extends U"`)
// also become top-level aliases of their default or constraint for the annotation to use.
const component_ts = (svelte_source: string): string => {
  // attribute values may contain `>` (generics="T extends Record<K, V>")
  const scripts = [
    ...svelte_source.matchAll(
      /<script\b(?<attrs>(?:[^>"']|"[^"]*"|'[^']*')*)>(?<body>[\s\S]*?)<\/script>/g,
    ),
  ].map(({ groups: { attrs = ``, body = `` } = {} }) => ({
    attrs,
    body,
    is_module: /\bmodule\b/.test(attrs),
  }))
  const body = [
    ...scripts.filter((s) => s.is_module),
    ...scripts.filter((s) => !s.is_module),
  ]
    .map((script) => script.body)
    .join(`\n`)
  const generics = scripts
    .map(({ attrs }) => /\bgenerics="(?<generics>[^"]*)"/.exec(attrs)?.groups?.generics)
    .find(Boolean)
  const lines = [body]
  if (generics) {
    const [alias] = parse(`type _<${generics}> = 0`).statements
    for (const param of ts.isTypeAliasDeclaration(alias)
      ? (alias.typeParameters ?? [])
      : []) {
      const target = param.default ?? param.constraint
      lines.push(`type ${param.name.text} = ${target?.getText() ?? `unknown`}`)
    }
  }
  const props_type = find_props(parse(body))?.type_node?.getText() ?? `{}`
  const type_params = generics ? `<${generics}>` : ``
  lines.push(
    `declare function __component${type_params}(this: void, internals: unknown, props: ${props_type}): {}`,
    `export default __component`,
  )
  return lines.join(`\n`)
}

const find_prop = (checker: ts.TypeChecker, type: ts.Type, name: string) =>
  type.isUnion()
    ? type.types.map((member) => checker.getPropertyOfType(member, name)).find(Boolean)
    : checker.getPropertyOfType(type, name)

// `x as T`, `x satisfies T` and `(x)` without the wrapper: the cast says nothing about the value
const unwrap = (node: ts.Expression): ts.Expression =>
  ts.isAsExpression(node) ||
  ts.isSatisfiesExpression(node) ||
  ts.isParenthesizedExpression(node)
    ? unwrap(node.expression)
    : node

const LITERAL_KINDS = new Set([
  ts.SyntaxKind.NumericLiteral,
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TrueKeyword,
  ts.SyntaxKind.FalseKeyword,
  ts.SyntaxKind.NullKeyword,
])
const is_literal = (node: ts.Expression): boolean =>
  LITERAL_KINDS.has(node.kind) ||
  (ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken &&
    ts.isNumericLiteral(node.operand)) ||
  (ts.isArrayLiteralExpression(node) &&
    node.elements.every((el) => is_literal(unwrap(el))))

// The literal a constant (`DEFAULT_FPS`) or setting (`DEFAULTS.player.fps`) default stands
// for: its declaration's initializer, or the `value` of an object it names (a settings entry
// `{ value, description }`), followed through further constants. Undefined for anything else
// (calls, other objects, arithmetic), which the table shows as written.
const resolve_literal = (
  node: ts.Expression,
  checker: ts.TypeChecker,
  depth = 0,
): string | undefined => {
  const expr = unwrap(node)
  if (is_literal(expr)) return quote_literals(one_line(expr.getText()))
  if (depth > 4 || !(ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr)))
    return undefined
  let symbol = checker.getSymbolAtLocation(
    ts.isPropertyAccessExpression(expr) ? expr.name : expr,
  )
  if (symbol && symbol.flags & ts.SymbolFlags.Alias)
    symbol = checker.getAliasedSymbol(symbol)
  const decl = symbol?.valueDeclaration ?? symbol?.declarations?.[0]
  const init =
    decl && (ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl))
      ? decl.initializer && unwrap(decl.initializer)
      : undefined
  if (!init || !ts.isObjectLiteralExpression(init))
    return init && resolve_literal(init, checker, depth + 1)
  const entry = init.properties.find(
    (prop) => ts.isPropertyAssignment(prop) && prop.name.getText() === `value`,
  )
  return entry && ts.isPropertyAssignment(entry)
    ? resolve_literal(entry.initializer, checker, depth + 1)
    : undefined
}

// `<div>` for a props type naming HTMLAttributes<HTMLDivElement> (or SVGAttributes<...>), else
// `HTML` when it takes svelte/elements' attributes through some other type
const rest_attributes = (
  type_node: ts.TypeNode | undefined,
  props_type: ts.Type | undefined,
  checker: ts.TypeChecker,
): string | undefined => {
  const named = /\b(?:HTML|SVG)Attributes<(?:HTML|SVG)(?<tag>\w*?)Element>/.exec(
    type_node?.getText() ?? ``,
  )
  if (named)
    return `<${{ SVG: `svg`, '': `element` }[named.groups?.tag ?? ``] ?? named.groups?.tag?.toLowerCase()}>`
  const onclick = props_type && find_prop(checker, props_type, `onclick`)
  const from_svelte = onclick?.declarations?.some((decl) =>
    decl.getSourceFile().fileName.includes(`/svelte/elements`),
  )
  return from_svelte ? `HTML` : undefined
}

const component_props = (
  source: ts.SourceFile,
  checker: ts.TypeChecker,
): ComponentDoc => {
  const { declaration, type_node } = find_props(source) ?? {}
  if (!declaration || !ts.isObjectBindingPattern(declaration.name)) return { props: [] }
  const props_type = type_node && checker.getTypeFromTypeNode(type_node)
  const has_rest = declaration.name.elements.some((element) => element.dotDotDotToken)
  const rest = has_rest ? rest_attributes(type_node, props_type, checker) : undefined
  const props = declaration.name.elements
    .filter((element) => !element.dotDotDotToken)
    .map((element) => {
      const name = (element.propertyName ?? element.name)
        .getText()
        .replaceAll(/^['"`]|['"`]$/g, ``)
      const symbol = props_type ? find_prop(checker, props_type, name) : undefined
      // Intersections list a prop's declaration in every member type: prefer the project's own
      // (e.g. BasePlotProps.children) over a library one (HTMLAttributes.children), and among
      // those the first with a comment
      const declarations = symbol?.declarations ?? []
      const own = declarations.filter(
        (decl) => !decl.getSourceFile().fileName.includes(`/node_modules/`),
      )
      const commented = own
        .map((decl) => ({ decl, comment: node_comment(decl) }))
        .find(({ comment }) => comment)
      const member = commented?.decl ?? own[0] ?? declarations[0]
      const written_type =
        member && ts.isPropertySignature(member) ? member.type?.getText() : undefined
      const type =
        written_type ?? (symbol && checker.typeToString(checker.getTypeOfSymbol(symbol)))
      const description = commented?.comment ?? node_comment(element)
      const bindable = is_call_to(element.initializer, `$bindable`)
      const written_init = bindable
        ? element.initializer.arguments[0]
        : element.initializer
      const init = written_init && unwrap(written_init)
      const doc: PropDoc = { name }
      if (type) doc.type = type_line(type)
      if (init) {
        doc.default = quote_literals(one_line(init.getText()))
        const value = resolve_literal(init, checker)
        if (value !== undefined && value !== doc.default) doc.default_value = value
      }
      if (description) doc.description = sentence_case(description)
      if (bindable) doc.bindable = true
      if (symbol && !(symbol.flags & ts.SymbolFlags.Optional)) doc.required = true
      return doc
    })
  return rest ? { props, rest_attributes: rest } : { props }
}

// Parsed files by path, reused while their text is unchanged: re-extracting after an edit (dev
// server) re-parses only what changed rather than every reachable file, TS's libs included
const parsed_files = new Map<string, ts.SourceFile>()
let last_program: ts.Program | undefined

// The `paths` of the tsconfig nearest to `dir` (after `extends`, e.g. SvelteKit's `$lib`),
// absolute so they resolve alike from every component. Extensionless package.json `imports`
// (`#lib/...`) need them too: TypeScript resolves those patterns without trying extensions.
const tsconfig_paths = (dir: string): Record<string, string[]> => {
  const file = ts.findConfigFile(dir, (name) => ts.sys.fileExists(name))
  if (!file) return {}
  const { config, error } = ts.readConfigFile(file, (name) => ts.sys.readFile(name))
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, dirname(file))
  const first_error = error ?? parsed.errors[0]
  if (first_error)
    throw new Error(
      `prop-docs: invalid ${file}: ${ts.flattenDiagnosticMessageText(first_error.messageText, ` `)}`,
    )
  // relative to the (possibly extended) config declaring them
  const { paths = {}, pathsBasePath } = parsed.options
  const base = typeof pathsBasePath === `string` ? pathsBasePath : dirname(file)
  return Object.fromEntries(
    Object.entries(paths).map(([key, targets]) => [
      key,
      targets.map((target) => resolve(base, target)),
    ]),
  )
}

// Prop docs keyed by component name (file basename) for the given .svelte files. Components
// they import are loaded too (lazily, as virtual TS files) to resolve inherited prop types.
// Imports resolve with the tsconfig nearest to the first file. Throws on a component import
// of a script module TypeScript can't resolve: its types would silently read as `any`.
export const extract_prop_docs = (
  files: readonly string[],
): Record<string, ComponentDoc> => {
  // docs are keyed by file name, so a second X.svelte would silently replace the first's
  const by_name = Map.groupBy(files, (file) => basename(file, `.svelte`))
  const clashes = [...by_name.values()].filter((paths) => paths.length > 1)
  if (clashes.length) throw new Error(`Components share a name: ${clashes.join(`; `)}`)
  const virtual_files = new Map<string, string>()
  const virtual_text = (name: string): string => {
    let text = virtual_files.get(name)
    if (text === undefined) {
      text = component_ts(readFileSync(name.slice(0, -VIRTUAL_SUFFIX.length), `utf8`))
      virtual_files.set(name, text)
    }
    return text
  }
  const options: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    allowImportingTsExtensions: true,
    paths: files.length ? tsconfig_paths(dirname(resolve(files[0]))) : {},
    noEmit: true,
    skipLibCheck: true,
    strict: true,
    types: [],
  }
  const host = ts.createCompilerHost(options, true)
  // the default host's own, before the overrides below wrap them
  const file_exists = host.fileExists.bind(host)
  const read_file = host.readFile.bind(host)
  const is_virtual = (name: string): boolean =>
    name.endsWith(`.svelte${VIRTUAL_SUFFIX}`) &&
    file_exists(name.slice(0, -VIRTUAL_SUFFIX.length))
  host.fileExists = (name) => is_virtual(name) || file_exists(name)
  host.readFile = (name) => (is_virtual(name) ? virtual_text(name) : read_file(name))
  host.getSourceFile = (name, language) => {
    const virtual = is_virtual(name)
    const text = virtual ? virtual_text(name) : read_file(name)
    if (text === undefined) return undefined
    const cached = parsed_files.get(name)
    if (cached?.text === text) return cached
    const kind = virtual ? ts.ScriptKind.TS : undefined
    const source = ts.createSourceFile(name, text, language, true, kind)
    parsed_files.set(name, source)
    return source
  }
  // Shared by every import in this program: uncached, each one re-walks its ancestor
  // directories' package.json files (over half the extraction time)
  const resolution_cache = ts.createModuleResolutionCache(
    host.getCurrentDirectory(),
    (name) => host.getCanonicalFileName(name),
    options,
  )
  const unresolved: string[] = []
  // `./X.svelte` and `#lib/.../X.svelte` resolve to X's virtual TS file
  host.resolveModuleNameLiterals = (
    literals,
    containing_file,
    redirected,
    compiler_options,
  ) =>
    literals.map(({ text }) => {
      const resolve_name = (spec: string) =>
        ts.resolveModuleName(
          spec,
          containing_file,
          compiler_options,
          host,
          resolution_cache,
          redirected,
        )
      const virtual = text.endsWith(`.svelte`)
        ? resolve_name(`${text}${VIRTUAL_SUFFIX}`)
        : undefined
      const resolved = virtual?.resolvedModule ? virtual : resolve_name(text)
      if (
        !resolved.resolvedModule &&
        is_virtual(containing_file) &&
        SCRIPT_SPEC_RE.test(text)
      )
        unresolved.push(`${containing_file.slice(0, -VIRTUAL_SUFFIX.length)}: ${text}`)
      return resolved
    })
  const roots = files.map((file) => `${file}${VIRTUAL_SUFFIX}`)
  const program = ts.createProgram(roots, options, host, last_program)
  if (unresolved.length)
    throw new Error(`prop-docs: unresolved component imports:\n${unresolved.join(`\n`)}`)
  last_program = program
  const checker = program.getTypeChecker()
  return Object.fromEntries(
    roots.map((virtual_file) => {
      const source = program.getSourceFile(virtual_file)
      if (!source) throw new Error(`TypeScript program is missing ${virtual_file}`)
      return [
        basename(virtual_file, `.svelte${VIRTUAL_SUFFIX}`),
        component_props(source, checker),
      ]
    }),
  )
}

export const PROP_DOCS_MODULE_ID = `virtual:prop-docs`
const RESOLVED_ID = `\0${PROP_DOCS_MODULE_ID}`

export type PropDocsPluginOptions = {
  root?: string // project root holding `dir`; defaults to Vite's root
  dir?: string // component directory to document, relative to root
}

// `virtual:prop-docs` default-exports a loader per component name importing
// `virtual:prop-docs/<name>` (that component's ComponentDoc), so a page fetches only its own
// components' docs. One shared extraction (seconds for a large library, well under one after
// an edit) runs on the first per-component import. Components are every .svelte file under
// `dir` that calls `$props(`.
export const prop_docs_plugin = ({
  root,
  dir = `src/lib`,
}: PropDocsPluginOptions = {}): Plugin => {
  let project_root = root
  const lib_dir = () => {
    if (!project_root)
      throw new Error(`prop-docs: no root before Vite resolved its config`)
    return `${resolve(project_root, dir)}/`
  }
  const component_files = (): string[] =>
    globSync(`**/*.svelte`, { cwd: lib_dir() })
      .map((path) => `${lib_dir()}${path}`)
      .filter((file) => readFileSync(file, `utf8`).includes(`$props(`))
  let docs: Record<string, ComponentDoc> | undefined
  const extract = () => (docs ??= extract_prop_docs(component_files()))
  return {
    name: `prop-docs`,
    configResolved(config) {
      project_root ??= config.root
    },
    // Dev server: extract once it is up rather than on the first page's prefetch, so that one
    // doesn't wait (blocking, while nothing else is being served yet)
    configureServer(server) {
      server.httpServer?.once(`listening`, () => {
        setTimeout(() => {
          // a failure here (e.g. a file mid-edit) must not crash the server: the first
          // per-component load extracts again and reports it there
          try {
            extract()
          } catch (error) {
            server.config.logger.warn(`prop-docs prewarm failed: ${error}`)
          }
        }, 500)
      })
    },
    resolveId: (id) =>
      id === PROP_DOCS_MODULE_ID || id.startsWith(`${PROP_DOCS_MODULE_ID}/`)
        ? `\0${id}`
        : null,
    load(id) {
      if (id === RESOLVED_ID) {
        const loaders = component_files().map((file) => {
          const name = basename(file, `.svelte`)
          const module_id = JSON.stringify(`${PROP_DOCS_MODULE_ID}/${name}`)
          return `${JSON.stringify(name)}: () => import(${module_id})`
        })
        return `export default {${loaders.join(`,`)}}`
      }
      if (!id.startsWith(`${RESOLVED_ID}/`)) return null
      const name = id.slice(`${RESOLVED_ID}/`.length)
      const component_docs = extract()[name]
      if (!component_docs)
        throw new Error(`No component named ${name} in ${dir} has $props()`)
      return `export default ${JSON.stringify(component_docs)}`
    },
    // A component or a type it imports changed: drop the extraction and invalidate the loaded
    // per-component modules, so their next import re-extracts. Not propagated as an HMR update:
    // it would bubble through the loader index to whatever imports it (a layout) and remount
    // that, so an open table shows the new props after a reload. A created or deleted
    // component changes the index itself, which is updated.
    hotUpdate({ type, file, modules }) {
      if (!file.startsWith(lib_dir()) || !/\.(?:svelte|ts)$/.test(file)) return undefined
      docs = undefined
      const { moduleGraph } = this.environment
      const loaded = [...moduleGraph.idToModuleMap.values()].filter(({ id }) =>
        id?.startsWith(RESOLVED_ID),
      )
      for (const module of loaded) moduleGraph.invalidateModule(module)
      const index = loaded.find(({ id }) => id === RESOLVED_ID)
      return type !== `update` && index ? [...modules, index] : undefined
    },
  }
}
