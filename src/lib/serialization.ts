// Escape script delimiters when embedding JSON in generated Svelte or JavaScript.
export const script_json = (value: unknown): string =>
  JSON.stringify(value).replaceAll(`<`, `\\u003c`)

type JsonNode = null | string | boolean | number | unknown[] | Record<string, unknown>

// Validate one node; callers own recursion, cycle detection and output encoding.
// Frontmatter accepts null-prototype mappings before normalizing them through JSON.
export function assert_json_node(
  value: unknown,
  path: string,
  allow_null_prototype = false,
): asserts value is JsonNode {
  if (value === null || typeof value === `string` || typeof value === `boolean`) return
  if (typeof value === `number` && Number.isFinite(value)) return
  if (
    typeof value === `object` &&
    (Array.isArray(value) ||
      Object.getPrototypeOf(value) === Object.prototype ||
      (allow_null_prototype && Object.getPrototypeOf(value) === null))
  )
    return
  throw new TypeError(`Unsupported JSON value at ${path} (type ${typeof value})`)
}
