import { parse, type AST } from 'svelte/compiler'
import { script_edits } from './svelte.ts'
import { edit_source, type MappedSource, type SourceEdit } from './source-map.ts'

const static_node = (node: AST.Fragment['nodes'][number]): boolean => {
  if (node.type === `Text` || node.type === `Comment`) return true
  if (node.type === `HtmlTag`)
    return node.expression.type === `Literal` && typeof node.expression.value === `string`
  return (
    node.type === `RegularElement` &&
    node.attributes.every(
      (attribute) =>
        attribute.type === `Attribute` &&
        (attribute.value === true ||
          (Array.isArray(attribute.value) &&
            attribute.value.every((value) => value.type === `Text`))),
    ) &&
    node.fragment.nodes.every(static_node)
  )
}

// During development, isolate static prose from the page's live examples. Empty gaps
// get modules too, so inserting a paragraph updates a child without replacing its parent.
// Authored expressions remain in scope; scoped CSS requires the original component tree.
export function isolate_prose(
  source: MappedSource,
  filename: string,
  modules: Map<string, string>,
): MappedSource {
  const { code } = source
  const ast = parse(code, { modern: true })
  if (ast.css || ast.options || !code.includes(`.widgets-example-`)) return source
  const nodes: { start: number; end: number }[] = ast.fragment.nodes.filter(
    (node) =>
      !(
        static_node(node) &&
        (node.type !== `Text` || !node.data.trim()) &&
        (node.type !== `RegularElement` ||
          /^(?:h[1-6]|p|table|blockquote|pre|ul|ol|hr|div|figure|section)$/u.test(
            node.name,
          ))
      ),
  )
  for (const script of [ast.instance, ast.module]) if (script) nodes.push(script)
  nodes.sort((left, right) => left.start - right.start)
  const imports: string[] = []
  const edits: SourceEdit[] = []
  let cursor = 0
  const gap = (end: number) => {
    const index = imports.length
    const id = `${filename}.widgets-prose-${index}.svelte`
    const alias = `WidgetsProse${index}`
    modules.set(id, code.slice(cursor, end))
    imports.push(
      `import ${alias} from ${JSON.stringify(id).replaceAll(`<`, `\\u003c`)};\n`,
    )
    edits.push({ start: cursor, end, text: `<${alias} />` })
  }
  for (const node of nodes) {
    gap(node.start)
    cursor = node.end
  }
  gap(code.length)
  const output = edit_source(source, edits)
  return edit_source(output, script_edits(output.code, imports.join(``)))
}
