export type ExampleOptions = {
  wrapper?: string | readonly [string, string]
  collapsible?: boolean
  hide_script?: boolean
  hide_style?: boolean
  code_above?: boolean
  csr?: boolean
}
export type FenceSettings = ExampleOptions & {
  example?: boolean
  check?: boolean
  test?: string
  id?: string
  title?: string
  repl?: string
  github?: string
}

const boolean_keys = [
  `example`,
  `check`,
  `csr`,
  `hide_script`,
  `hide_style`,
  `collapsible`,
  `code_above`,
] as const
const string_keys = [`test`, `id`, `title`, `repl`, `github`] as const
const setting_keys = new Set<string>([...boolean_keys, ...string_keys, `wrapper`])

// Defaults and authored settings share one schema; all consumers use this analyzed value.
export function fence_settings(
  info: string,
  defaults: ExampleOptions = {},
): Readonly<FenceSettings> {
  const raw: Record<string, unknown> = { ...defaults, ...parse_meta(info) }
  for (const key of Object.keys(raw))
    if (!setting_keys.has(key)) throw new Error(`Unknown code fence option: ${key}`)
  const settings: FenceSettings = {}
  for (const key of boolean_keys) {
    const value = raw[key]
    if (value === undefined) continue
    if (typeof value !== `boolean`)
      throw new Error(`Code fence option ${key} must be boolean`)
    settings[key] = value
  }
  for (const key of string_keys) {
    const value = raw[key]
    if (value === undefined) continue
    if (typeof value !== `string` || !value.trim())
      throw new Error(`Code fence option ${key} must be a nonempty string`)
    settings[key] = value
  }
  const { wrapper } = raw
  if (wrapper !== undefined) {
    if (typeof wrapper === `string` && wrapper.trim()) settings.wrapper = wrapper
    else if (
      Array.isArray(wrapper) &&
      wrapper.length === 2 &&
      typeof wrapper[0] === `string` &&
      wrapper[0].trim() &&
      typeof wrapper[1] === `string` &&
      /^[A-Za-z_$][\w$]*$/u.test(wrapper[1])
    )
      settings.wrapper = Object.freeze([wrapper[0], wrapper[1]] as const)
    else throw new Error(`Invalid example wrapper: ${JSON.stringify(wrapper)}`)
  }
  return Object.freeze(settings)
}

// Marked unescapes token.lang as Markdown. JSON metadata needs the authored escapes
// and internal whitespace, so recover the info string from the fence's raw header.
export function fence_info(token: { raw: string; lang?: string }): {
  language: string
  info: string
} {
  const header =
    /^ {0,3}(?:`{3,}|~{3,})(?<info>[^\r\n]*)/u.exec(token.raw)?.[1] ?? token.lang ?? ``
  const match = /^\s*(?<language>\S+)(?:\s+(?<info>[\s\S]*))?$/u.exec(header.trim())
  return { language: match?.[1] ?? ``, info: match?.[2] ?? `` }
}

export function parse_meta(source: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  let rest = source.trim()
  while (rest) {
    const key = /^(?<key>[a-zA-Z_]\w*)(?<assignment>=|(?=\s|$))/u.exec(rest)
    if (!key) throw new Error(`Invalid code fence metadata: ${rest}`)
    if (Object.hasOwn(result, key[1]))
      throw new Error(`Duplicate code fence option: ${key[1]}`)
    rest = rest.slice(key[0].length)
    let value: unknown = true
    if (key[2]) {
      let end = 0
      let depth = 0
      let quoted = false
      for (; end < rest.length; end++) {
        const char = rest[end]
        if (quoted && char === `\\`) end++
        else if (char === `"`) quoted = !quoted
        else if (!quoted) {
          if (!depth && /\s/u.test(char)) break
          if (char === `[` || char === `{`) depth++
          if (char === `]` || char === `}`) depth--
        }
      }
      try {
        value = JSON.parse(rest.slice(0, end))
      } catch (cause) {
        throw new Error(
          `Invalid JSON for code fence option ${key[1]}: ${rest.slice(0, end)}`,
          { cause },
        )
      }
      rest = rest.slice(end)
    }
    Object.defineProperty(result, key[1], { value, enumerable: true })
    rest = rest.trimStart()
  }
  return result
}

// Deterministic module names, independent of a fence's position. This is an identity
// hash, not a security primitive; the compiler checks collisions before emitting imports.
export function example_key(source: string): string {
  let first = 2166136261
  let second = 2246822507
  for (let idx = 0; idx < source.length; idx++) {
    const code = source.charCodeAt(idx)
    first = Math.imul(first ^ code, 16777619)
    second = Math.imul(second ^ code, 3266489909)
  }
  return `${(first >>> 0).toString(16)}-${(second >>> 0).toString(16)}`
}
