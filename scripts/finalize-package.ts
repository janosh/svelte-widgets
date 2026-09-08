// Normalize module specifiers after svelte-package without rewriting strings or comments.
/// <reference types="node" />
/// <reference lib="es2023.array" />
import { readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { parse } from 'svelte/compiler'
import ts from 'typescript'
import { edit_source, type SourceEdit } from '../src/lib/markdown/source-map.ts'

export const rewrite_imports = (source: string, filename: string): string => {
  const edits: SourceEdit[] = []
  const visit_script = (code: string, offset = 0) => {
    const ast = ts.createSourceFile(filename, code, ts.ScriptTarget.Latest)
    const visit = (node: ts.Node) => {
      const specifier =
        ts.isImportDeclaration(node) || ts.isExportDeclaration(node)
          ? node.moduleSpecifier
          : ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)
            ? node.argument.literal
            : ts.isCallExpression(node) &&
                node.expression.kind === ts.SyntaxKind.ImportKeyword
              ? node.arguments[0]
              : undefined
      ts.forEachChild(node, visit)
      if (!specifier || !ts.isStringLiteralLike(specifier)) return
      const path = specifier.text
      if (!path.startsWith(`./`) && !path.startsWith(`../`)) return
      const text = path.endsWith(`.ts`)
        ? `${path.slice(0, -3)}.js`
        : !extname(path) || (filename.endsWith(`.d.ts`) && path.endsWith(`.svelte`))
          ? `${path}.js`
          : path
      if (text !== path)
        edits.push({
          start: offset + specifier.getStart(ast) + 1,
          end: offset + specifier.end - 1,
          text,
        })
    }
    visit(ast)
  }
  if (filename.endsWith(`.svelte`)) {
    const { instance, module } = parse(source, { modern: true })
    for (const script of [instance, module]) {
      if (!script) continue
      // Svelte includes source offsets on Program nodes but omits them from its types.
      const { start, end } = script.content as typeof script.content & {
        start: number
        end: number
      }
      visit_script(source.slice(start, end), start)
      const generics = script.attributes.find(
        (attribute) => attribute.name === `generics`,
      )
      const value = Array.isArray(generics?.value) ? generics.value[0] : undefined
      if (value?.type === `Text`) {
        const prefix = `type Props<`
        visit_script(`${prefix}${value.raw}> = unknown`, value.start - prefix.length)
      }
    }
  } else visit_script(source)
  return edit_source({ code: source, spans: [] }, edits).code
}

export const finalize_package = async (directory: string): Promise<void> => {
  for (const file of await readdir(directory, { recursive: true, withFileTypes: true })) {
    if (!file.isFile()) continue
    const path = resolve(file.parentPath, file.name)
    if (file.name === `readme.md`) await unlink(path)
    else if (/\.(?:js|ts|svelte)$/.test(file.name)) {
      const source = await readFile(path, `utf8`)
      const output = rewrite_imports(source, file.name)
      if (output !== source) await writeFile(path, output)
    }
  }
}

if (import.meta.main) await finalize_package(resolve(import.meta.dirname, `../dist`))
