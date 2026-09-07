import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { compile } from 'svelte/compiler'
import type * as TypeScript from 'typescript'
import type { MarkdownDocument } from './index.ts'
import {
  diagnostic_result,
  source_locator,
  type Diagnostic,
  type DiagnosticResult,
} from './diagnostics.ts'
import type { ContentFence, SourcePosition } from './content.ts'
import {
  decode_source_map,
  original_position,
  type DecodedSourceMap,
} from './source-map.ts'

export type SvelteTypeChecker = {
  transform: (
    source: string,
    options: { filename: string; isTsFile: boolean },
  ) => { code: string; map: { mappings: string } }
  // Absolute paths to the transformer's ambient Svelte declarations.
  shims: string[]
}
export type CheckOptions = {
  filename?: string
  // Explicit config path, relative to the document directory. Omit for standalone defaults.
  tsconfig?: string
  // Static checks never execute examples. Only explicitly named assertions can run code.
  assertions?: Record<string, (example: ContentFence) => void | Promise<void>>
  typescript?: typeof TypeScript
  svelte_typechecker?: SvelteTypeChecker
  compiler_options?: TypeScript.CompilerOptions
  typecheck?: boolean
}
export type CheckSummary = { checked: number; asserted: number }
export type CheckResult = DiagnosticResult<CheckSummary> & { value: CheckSummary }

const message = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

const error_location = (error: unknown, key: 'start' | 'end' = 'start') => {
  if (typeof error !== `object` || error === null) return undefined
  const start: unknown = Reflect.get(error, key)
  return typeof start === `object` &&
    start !== null &&
    `line` in start &&
    `column` in start &&
    typeof start.line === `number` &&
    typeof start.column === `number`
    ? { line: start.line - 1, column: start.column }
    : undefined
}

function project_config(compiler: typeof TypeScript, path: string) {
  const errors: TypeScript.Diagnostic[] = []
  const parsed = compiler.getParsedCommandLineOfConfigFile(
    path,
    {},
    {
      useCaseSensitiveFileNames: compiler.sys.useCaseSensitiveFileNames,
      getCurrentDirectory: () => dirname(path),
      readFile: (file) => compiler.sys.readFile(file),
      fileExists: (file) => compiler.sys.fileExists(file),
      // Fences are the roots. Loading a project's include/files would check unrelated code.
      readDirectory: () => [],
      onUnRecoverableConfigFileDiagnostic: (diagnostic) => errors.push(diagnostic),
    },
  )
  errors.push(...(parsed?.errors ?? []))
  const diagnostics = errors
    .filter(({ code }) => code !== 18002 && code !== 18003)
    .map((diagnostic): Diagnostic => {
      const offset = diagnostic.start ?? 0
      return {
        code: `TS${diagnostic.code}`,
        severity: `error`,
        message: compiler.flattenDiagnosticMessageText(diagnostic.messageText, `\n`),
        range: source_locator(
          diagnostic.file?.text ?? ``,
          diagnostic.file?.fileName ?? path,
        )(offset, offset + (diagnostic.length ?? 0)),
      }
    })
  return { options: parsed?.options ?? {}, diagnostics }
}

type CheckedSource = Pick<ContentFence, 'code' | 'range' | 'line_positions'>

const source_position = (
  fence: CheckedSource,
  location?: { line: number; column: number },
): SourcePosition => {
  if (!location) return fence.range.start
  const start = fence.line_positions[location.line]
  if (!start) return fence.range.start
  return {
    ...start,
    column: start.column + location.column,
    offset: start.offset + location.column,
  }
}

// Check explicitly opted-in fences. The caller supplies execution and assertion semantics.
export async function check_examples(
  fences: readonly ContentFence[],
  options: CheckOptions = {},
): Promise<CheckResult> {
  const diagnostics: Diagnostic[] = []
  const selected = fences.filter(
    ({ settings }) => settings.check === true || settings.test !== undefined,
  )
  const report = (
    fence: CheckedSource,
    code: string,
    error: unknown,
    location?: { line: number; column: number },
    severity: 'error' | 'warning' = `error`,
    end_location?: { line: number; column: number },
  ) => {
    const start = source_position(fence, location)
    diagnostics.push({
      range: {
        start,
        end: end_location
          ? source_position(fence, end_location)
          : location
            ? start
            : fence.range.end,
      },
      code,
      message: message(error),
      severity,
    })
  }
  const report_compile_error = (fence: CheckedSource, error: unknown) =>
    report(
      fence,
      `compile`,
      error,
      error_location(error),
      `error`,
      error_location(error, `end`),
    )
  const filename = resolve(
    options.filename ?? fences[0]?.range.start.filename ?? `document.md`,
  )
  const root = dirname(filename)
  const require_tool = createRequire(`${root}/package.json`)
  const files = new Map<
    string,
    {
      fence: CheckedSource
      code: string
      mappings?: DecodedSourceMap
    }
  >()
  const shims = new Set<string>()
  let compiler = options.typescript
  let svelte_checker = options.svelte_typechecker
  const transform_component = (
    fence: CheckedSource,
    component_filename: string,
  ): void => {
    if (!svelte_checker) {
      try {
        const { svelte2tsx } = require_tool(`svelte2tsx`) as {
          svelte2tsx: SvelteTypeChecker['transform']
        }
        svelte_checker = {
          transform: svelte2tsx,
          shims: [
            require_tool.resolve(`svelte2tsx/svelte-shims-v4.d.ts`),
            require_tool.resolve(`svelte2tsx/svelte-jsx-v4.d.ts`),
          ],
        }
      } catch (error) {
        throw new Error(
          `Svelte type checking requires svelte2tsx in ${filename}; install the documentation toolchain or pass options.svelte_typechecker`,
          { cause: error },
        )
      }
    }
    for (const shim of svelte_checker.shims) shims.add(shim)
    const { code, map } = svelte_checker.transform(fence.code, {
      filename: component_filename,
      isTsFile: true,
    })
    files.set(`${component_filename}.ts`, {
      fence,
      code,
      mappings: decode_source_map(map.mappings),
    })
  }
  const example_counts = new Map<string, number>()
  for (const fence of selected) {
    const document_filename = resolve(options.filename ?? fence.range.start.filename)
    const idx = example_counts.get(document_filename) ?? 0
    example_counts.set(document_filename, idx + 1)
    const language = fence.language.toLowerCase()
    const component = language === `svelte` || language === `html`
    const javascript = language === `js` || language === `javascript`
    if (!component && !javascript && language !== `ts` && language !== `typescript`) {
      report(fence, `language`, `Unsupported checked fence language: ${fence.language}`)
      continue
    }
    const example_filename = `${document_filename}.example-${idx}.${component ? `svelte` : javascript ? `js` : `ts`}`
    try {
      if (component) {
        const result = compile(fence.code, {
          filename: example_filename,
          generate: false,
        })
        for (const warning of result.warnings)
          report(
            fence,
            warning.code,
            warning.message,
            error_location(warning),
            `warning`,
            error_location(warning, `end`),
          )
      }
      if (component && options.typecheck === false) continue
      if (!compiler) {
        try {
          compiler = require_tool(`typescript`) as typeof TypeScript
        } catch (error) {
          throw new Error(
            `Type checking requires TypeScript in ${filename}; install it in the documentation project or pass options.typescript`,
            { cause: error },
          )
        }
      }
      if (typeof compiler.createProgram !== `function`)
        throw new Error(
          `Type checking requires the TypeScript 5/6 compiler API; found TypeScript ${compiler.version} in ${filename}. Install TypeScript 6 or pass options.typescript with a compatible compiler`,
        )
      if (component) transform_component(fence, example_filename)
      else files.set(example_filename, { fence, code: fence.code })
    } catch (error) {
      report_compile_error(fence, error)
    }
  }
  if (compiler && files.size) {
    const compiler_api = compiler
    const config =
      options.tsconfig === undefined
        ? undefined
        : project_config(compiler, resolve(root, options.tsconfig))
    if (config?.diagnostics.length) {
      diagnostics.push(...config.diagnostics)
      return { ok: false, diagnostics, value: { checked: selected.length, asserted: 0 } }
    }
    const settings: TypeScript.CompilerOptions = {
      moduleDetection: compiler.ModuleDetectionKind.Force,
      skipLibCheck: true,
      allowJs: true,
      checkJs: true,
      ...(config?.options ?? {
        target: compiler.ScriptTarget.ESNext,
        module: compiler.ModuleKind.ESNext,
        moduleResolution: compiler.ModuleResolutionKind.Bundler,
        strict: true,
        types: [],
      }),
      ...options.compiler_options,
      // Explicit aliases belong to the document directory, not an inherited config directory.
      ...(options.compiler_options?.paths ? { pathsBasePath: root } : {}),
      // Fences form a virtual checking program, not the project's output/build graph.
      rootDir: undefined,
      composite: false,
      incremental: false,
      tsBuildInfoFile: undefined,
      noEmit: true,
    }
    const host = compiler.createCompilerHost(settings)
    host.getCurrentDirectory = () => root
    const file_exists = host.fileExists.bind(host)
    // TypeScript probes this arbitrary-extension declaration name for .svelte imports.
    host.fileExists = (path) =>
      file_exists(path) ||
      (path.endsWith(`.d.svelte.ts`) &&
        file_exists(path.replace(/\.d\.svelte\.ts$/u, `.svelte`)))
    // Both unresolved imports and TypeScript diagnostics use this same authored location.
    const report_source = (
      source: TypeScript.SourceFile | undefined,
      offset: number,
      code: string,
      text: string,
      length = 0,
    ): void => {
      const entry = source && files.get(source.fileName)
      if (source && entry) {
        const authored = (position: number) => {
          const { line, character } = source.getLineAndCharacterOfPosition(position)
          return entry.mappings === undefined
            ? { line, column: character }
            : original_position(entry.mappings, line, character)
        }
        report(
          entry.fence,
          code,
          text,
          authored(offset),
          `error`,
          authored(offset + length),
        )
      } else {
        diagnostics.push({
          range: source_locator(source?.text ?? ``, source?.fileName ?? filename)(
            offset,
            offset + length,
          ),
          severity: `error`,
          code,
          message: text,
        })
      }
    }
    host.getSourceFile = (path, language_version, on_error) => {
      const entry = files.get(path)
      let source_text: string | undefined
      try {
        source_text = entry?.code ?? host.readFile(path)
      } catch (error) {
        on_error?.(message(error))
        return undefined
      }
      if (source_text === undefined) return undefined
      const source = compiler_api.createSourceFile(
        path,
        source_text,
        language_version,
        true,
      )
      // Imported components attach ambient declarations without shifting source maps.
      if (entry?.mappings !== undefined)
        source.referencedFiles = [
          ...source.referencedFiles,
          ...[...shims].map((file_name) => ({ fileName: file_name, pos: 0, end: 0 })),
        ]
      return source
    }
    // Resolve local components to their checked virtual modules, rather than the
    // permissive ambient *.svelte declaration that loses all prop types.
    host.resolveModuleNameLiterals = (
      names,
      containing_file,
      redirected_reference,
      resolver_options,
      containing_source,
    ) =>
      names.map((literal) => {
        const name = literal.text
        const resolution = compiler_api.resolveModuleName(
          name,
          containing_file,
          resolver_options,
          host,
          undefined,
          redirected_reference,
          compiler_api.getModeForUsageLocation(
            containing_source,
            literal,
            resolver_options,
          ),
        )
        const resolved_filename = resolution.resolvedModule?.resolvedFileName
        const component_filename =
          resolved_filename?.endsWith(`.d.svelte.ts`) && !file_exists(resolved_filename)
            ? resolved_filename.replace(/\.d\.svelte\.ts$/u, `.svelte`)
            : name.startsWith(`.`) && name.endsWith(`.svelte`)
              ? resolve(dirname(containing_file), name)
              : undefined
        // Ambient *.svelte declarations must not make missing aliases/packages pass.
        if (name.endsWith(`.svelte`) && !resolved_filename && !component_filename)
          report_source(
            containing_source,
            literal.getStart(containing_source),
            `import`,
            `Cannot resolve imported Svelte component: ${name}`,
          )
        if (!component_filename) return resolution
        const virtual_filename = `${component_filename}.ts`
        if (!files.has(virtual_filename)) {
          const source = host.readFile(component_filename)
          if (source === undefined) {
            diagnostics.push({
              range: source_locator(``, component_filename)(0),
              severity: `error`,
              code: `import`,
              message: `Cannot read imported Svelte component: ${component_filename}`,
            })
            return { resolvedModule: undefined }
          }
          const locate = source_locator(source, component_filename)
          let offset = 0
          const line_positions = source.split(`\n`).map((line) => {
            const position = locate(offset).start
            offset += line.length + 1
            return position
          })
          const imported_fence: CheckedSource = {
            code: source,
            range: locate(0, source.length),
            line_positions,
          }
          try {
            compile(source, { filename: component_filename, generate: false })
            transform_component(imported_fence, component_filename)
          } catch (error) {
            report_compile_error(imported_fence, error)
            return { resolvedModule: undefined }
          }
        }
        return {
          resolvedModule: {
            resolvedFileName: virtual_filename,
            extension: compiler_api.Extension.Ts,
          },
        }
      })
    const program = compiler.createProgram([...files.keys(), ...shims], settings, host)
    const type_diagnostics =
      options.typecheck === false
        ? [...program.getOptionsDiagnostics(), ...program.getSyntacticDiagnostics()]
        : compiler.getPreEmitDiagnostics(program)
    for (const diagnostic of type_diagnostics) {
      if (diagnostic.category !== compiler.DiagnosticCategory.Error) continue
      report_source(
        diagnostic.file,
        diagnostic.start ?? 0,
        `TS${diagnostic.code}`,
        compiler.flattenDiagnosticMessageText(diagnostic.messageText, `\n`),
        diagnostic.length,
      )
    }
  }
  let asserted = 0
  // Assertions only run after the entire batch has passed static validation.
  if (!diagnostics.some(({ severity }) => severity === `error`)) {
    for (const fence of selected) {
      const assertion = fence.settings.test
      if (!assertion) continue
      const run = Object.hasOwn(options.assertions ?? {}, assertion)
        ? options.assertions?.[assertion]
        : undefined
      if (!run) report(fence, `assertion`, `Missing assertion runner: ${assertion}`)
      else {
        try {
          await run(fence)
          asserted++
        } catch (error) {
          report(fence, `assertion`, `${assertion}: ${message(error)}`)
        }
      }
    }
  }
  const value = { checked: selected.length, asserted }
  return { ...diagnostic_result(value, diagnostics), value }
}

export const check_document = (
  document: MarkdownDocument,
  options: CheckOptions = {},
): Promise<CheckResult> =>
  check_examples(document.manifest.fences, { ...options, filename: document.filename })
