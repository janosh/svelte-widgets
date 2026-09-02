// Minimal HAST-to-HTML serializer, handling only what starry-night outputs. Dependency-free
// so FileDetails.svelte can import it without highlighter.ts's eager starry-night instance.

// structural type compatible with hast Root/Element/Text
export interface HastNode {
  type: string
  value?: string
  tagName?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

// each replaceAll rebuilds the whole string, and most tokens have nothing to escape
const HAS_ESCAPABLE = /[&<>]/u

// text content only, not attribute values
export const escape_html_text = (str: string): string =>
  HAS_ESCAPABLE.test(str)
    ? str.replaceAll(`&`, `&amp;`).replaceAll(`<`, `&lt;`).replaceAll(`>`, `&gt;`)
    : str

// thousands of nodes per code block, so concatenate rather than array-and-join each
const serialize_children = (children: HastNode[] | undefined): string => {
  let html = ``
  for (const child of children ?? []) html += hast_to_html(child)
  return html
}

export const hast_to_html = (node: HastNode): string => {
  if (node.type === `text`) return escape_html_text(node.value ?? ``)
  if (node.type === `root`) return serialize_children(node.children)
  // comment/doctype/raw nodes would emit malformed `<undefined>` tags
  if (node.type !== `element` || !node.tagName) return ``
  const { tagName, properties, children } = node
  const cls_val = properties?.className
  const cls = Array.isArray(cls_val) ? cls_val.join(` `) : undefined
  const attrs = cls ? ` class="${cls}"` : ``
  return `<${tagName}${attrs}>${serialize_children(children)}</${tagName}>`
}
