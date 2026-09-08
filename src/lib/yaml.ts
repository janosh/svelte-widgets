import { CORE_SCHEMA, load } from 'js-yaml'
import type { Plugin } from 'vite'
import { assert_json_node } from './serialization.ts'

export type YamlOptions = {
  // Enrich or validate parsed data at build time; return the data to export.
  transform?: (data: unknown, filename: string) => unknown
}

// Reject values JSON would silently change or omit, including recursive YAML aliases.
function serialize_data(
  data: unknown,
  path: string,
  ancestors = new Set<object>(),
): string {
  assert_json_node(data, path)
  if (data === null || typeof data !== `object`)
    return Object.is(data, -0) ? `-0` : JSON.stringify(data)
  if (ancestors.has(data)) throw new TypeError(`Cyclic YAML alias at ${path}`)
  ancestors.add(data)
  // Computed keys preserve own __proto__ properties in the emitted JavaScript.
  const code = Array.isArray(data)
    ? `[${Array.from(data, (value: unknown, idx) => serialize_data(value, `${path}[${idx}]`, ancestors)).join(`,`)}]`
    : `{${Object.entries(data)
        .map(
          ([key, value]) =>
            `[${JSON.stringify(key)}]:${serialize_data(value, `${path}[${JSON.stringify(key)}]`, ancestors)}`,
        )
        .join(`,`)}}`
  ancestors.delete(data)
  return code
}

// YAML 1.2 core schema keeps dates as strings. Imports expose one default export;
// ?raw and ?url requests remain Vite's responsibility.
export const yaml_plugin = ({ transform }: YamlOptions = {}) =>
  ({
    name: `svelte-widgets-yaml`,
    enforce: `pre`,
    async transform(source: string, filename: string) {
      if (!/\.(?:ya?ml|cff)$/iu.test(filename)) return null
      try {
        let data: unknown = load(source, { filename, schema: CORE_SCHEMA })
        if (transform) data = await transform(data, filename)
        return {
          code: `export default ${serialize_data(data, filename)};`,
          map: { mappings: `` },
        }
      } catch (error) {
        throw new Error(`Cannot load YAML ${filename}: ${String(error)}`, {
          cause: error,
        })
      }
    },
  }) satisfies Plugin
