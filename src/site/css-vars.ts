// Extracts the CSS custom properties library components read, to document the theming
// surface without hand-maintained tables. Files READ `--x` via `var(--x, fallback)` or
// `getPropertyValue(`--x`)` and SET it in a stylesheet (`--x: value`, a default only on a
// root rule: top level, outside at-rules, one compound selector, else `scoped`) or at
// runtime (`style:--x={...}`, inline `--x:`, `setProperty(`--x`, ...)`). Reads are
// documented per group (component, attachment or library subdir) with a note when the
// group sets them at runtime or derives them from other variables. Variables read without
// a note by at least `shared_min_groups` groups are shared tokens.
import { posix } from 'node:path'

type CssVarRead = {
  name: string
  // text after the first top-level comma in `var()`, null without one or for JS reads
  fallback: string | null
  // CSS property (or custom property) the read feeds, when statically derivable
  property: string | null
}
type CssVarSet = {
  name: string
  value: string
  kind: `stylesheet` | `scoped` | `runtime`
}
type FileCssVars = { reads: CssVarRead[]; sets: CssVarSet[] }

export const shared_min_groups = 3

const lib_prefix_re = /^.*?src\/lib\//u
// a single compound selector: no combinator, selector list or attribute qualifier
const root_selector_re = /^[^\s,>+~[@]+$/u
const collapse = (text: string) =>
  text
    .replaceAll(/\s+/gu, ` `)
    .replaceAll(/\( | \)/gu, (match) => match.trim())
    .trim()
// Blank comments out with spaces so later offsets and boundaries stay intact
const blank = (match: string) => match.replaceAll(/[^\n]/gu, ` `)
const sorted_unique = (values: Iterable<string>) =>
  [...new Set(values)].toSorted((left, right) => left.localeCompare(right))

// Index of the first char in `stops` at paren depth 0 from `start`, or of the `)` that
// closes an enclosing paren, or -1 when neither occurs
function scan(text: string, start: number, stops: string): number {
  let depth = 0
  for (let idx = start; idx < text.length; idx++) {
    const char = text[idx]
    if (char === `(`) depth++
    else if (char === `)` && --depth < 0) return idx
    else if (depth === 0 && stops.includes(char)) return idx
  }
  return -1
}

// The property whose value contains offset `idx`: the `prop:` after the nearest
// declaration boundary, else the markup attribute the value sits in on the same line.
// Single-quoted strings and `"` inside values (e.g. `url("…") var(--x)`) aren't treated
// as boundaries correctly; the library has neither.
function property_at(text: string, idx: number): string | null {
  const before = text.slice(0, idx)
  const boundary = Math.max(
    ...[`;`, `{`, `}`, `\``, `"`].map((ch) => before.lastIndexOf(ch)),
  )
  const declaration = /^\s*-{0,2}[a-z][\w-]*(?=\s*:(?!:))/iu.exec(
    before.slice(boundary + 1),
  )
  if (declaration) return declaration[0].trim()
  const line = before.slice(before.lastIndexOf(`\n`) + 1)
  // `style:prop={...}`, a component's `--prop="..."` or a plain prop like `size="..."`
  return /[\w-]+(?==["{][^=]*$)/u.exec(line)?.[0] ?? null
}

function find_reads(text: string): CssVarRead[] {
  const reads: CssVarRead[] = []
  for (const { index } of text.matchAll(/\bvar\(/gu)) {
    const name_end = scan(text, index + 4, `,`)
    const close_idx = text[name_end] === `,` ? scan(text, name_end + 1, ``) : name_end
    const name = text.slice(index + 4, name_end).trim()
    // dynamic names like var(${name}) can't be resolved statically
    if (close_idx < 0 || !/^--[\w-]+$/u.test(name)) continue
    const fallback =
      name_end === close_idx ? null : collapse(text.slice(name_end + 1, close_idx))
    reads.push({ name, fallback, property: property_at(text, index) })
  }
  return reads
}

// `--x: value` declarations; the value runs to the next top-level `;`, `}` or closing
// quote, and for runtime (inline) styles also to the end of the line
function find_declarations(text: string, source: `stylesheet` | `runtime`): CssVarSet[] {
  const sets: CssVarSet[] = []
  // preludes of the blocks enclosing `cursor` (only meaningful in stylesheets)
  const scopes: string[] = []
  let [cursor, prelude_start] = [0, 0]
  for (const match of text.matchAll(/(?<![\w-])--[\w-]+(?=\s*:(?!:))/gu)) {
    for (; cursor < match.index; cursor++) {
      const char = text[cursor]
      if (char === `{`) scopes.push(text.slice(prelude_start, cursor).trim())
      else if (char === `}`) scopes.pop()
      if (`{};`.includes(char)) prelude_start = cursor + 1
    }
    const is_root = scopes.length === 1 && root_selector_re.test(scopes[0])
    const start = text.indexOf(`:`, match.index) + 1
    const end = scan(text, start, source === `runtime` ? `;}"\`\n` : `;}"\``)
    sets.push({
      name: match[0],
      value: collapse(text.slice(start, end < 0 ? text.length : end)),
      kind: source === `stylesheet` && !is_root ? `scoped` : source,
    })
  }
  return sets
}

const names = (text: string, re: RegExp) => [...text.matchAll(re)].map(([name]) => name)
const runtime_set = (name: string): CssVarSet => ({ name, value: ``, kind: `runtime` })

// Reads and sets in one `.svelte`, `.css` or `.ts` source. Svelte `<style>` blocks
// extract like `.css` files, the rest (markup and script) like `.ts` files.
export function extract_css_vars(source: string, filename: string): FileCssVars {
  if (filename.endsWith(`.css`)) {
    const css = source.replaceAll(/\/\*[\s\S]*?\*\//gu, blank)
    return { reads: find_reads(css), sets: find_declarations(css, `stylesheet`) }
  }
  const styles: FileCssVars[] = []
  const code = filename.endsWith(`.svelte`)
    ? source
        .replaceAll(/<!--[\s\S]*?-->/gu, blank)
        .replaceAll(/<style[^>]*>(?<css>[\s\S]*?)<\/style>/gu, (_match, css: string) => {
          styles.push(extract_css_vars(css, `.css`))
          return ``
        })
    : source
  const js_reads = names(code, /(?<=getPropertyValue\(\s*[`'"])--[\w-]+(?=[`'"])/gu)
  return {
    reads: [
      ...styles.flatMap(({ reads }) => reads),
      ...find_reads(code),
      ...js_reads.map((name) => ({ name, fallback: null, property: null })),
    ],
    sets: [
      ...styles.flatMap(({ sets }) => sets),
      ...find_declarations(code, `runtime`),
      // `setProperty(`--x`, ...)` in script, `style:--x={...}` on elements and
      // `--x="..."` passed to child components
      ...names(code, /(?<=setProperty\(\s*[`'"])--[\w-]+(?=[`'"])/gu).map(runtime_set),
      ...names(code, /(?<=style:|\s)--[\w-]+(?==)/gu).map(runtime_set),
    ],
  }
}

// `src/lib/Nav.svelte` -> `Nav`, `src/lib/attachments/tooltip.ts` -> `tooltip`,
// `src/lib/json-tree/JsonNode.svelte` -> `json-tree`: feature subdirs document as one unit,
// while attachments and internal sub-components are independent per file
export function css_var_group(path: string): string {
  const segments = path.replace(lib_prefix_re, ``).split(`/`)
  if (segments.length > 1 && ![`attachments`, `internal`].includes(segments[0]))
    return segments[0]
  return segments[segments.length - 1].replace(/(?:\.svelte)?\.(?:svelte|ts|css)$/u, ``)
}

// `internal/*` files and top-level `.ts` modules aren't documented on their own: their
// variables belong to every group importing them (transitively). Without importers they
// form their own group.
function owner_groups(sources: Record<string, string>): (path: string) => string[] {
  const importers = new Map<string, string[]>()
  for (const [path, source] of Object.entries(sources))
    for (const specifier of names(source, /(?<=\bimport\b[^'"`;]*?['"`])\.[^'"`]+/gu)) {
      const target = posix.join(posix.dirname(path), specifier)
      for (const candidate of [target, `${target}.ts`, `${target}.svelte.ts`])
        importers.set(candidate, [...(importers.get(candidate) ?? []), path])
    }
  const is_helper = (path: string) => /src\/lib\/(?:internal\/|[^/]+\.ts$)/u.test(path)
  const owners = (path: string, seen: Set<string>): string[] => {
    const parents = (importers.get(path) ?? []).filter((parent) => !seen.has(parent))
    if (!is_helper(path) || parents.length === 0) return [css_var_group(path)]
    return parents.flatMap((parent) => owners(parent, new Set([...seen, path])))
  }
  return (path) => [...new Set(owners(path, new Set([path])))]
}

// Group per-file extraction results, note how each variable is set and pull out the
// shared tokens (see rule at top).
export function collect_css_vars(sources: Record<string, string>) {
  const by_group = new Map<string, FileCssVars & { files: string[] }>()
  const owners_of = owner_groups(sources)
  for (const [path, source] of Object.entries(sources)) {
    const { reads, sets } = extract_css_vars(source, path)
    if (reads.length + sets.length === 0) continue
    for (const group_name of owners_of(path)) {
      const group = by_group.get(group_name) ?? { files: [], reads: [], sets: [] }
      by_group.set(group_name, group)
      group.files.push(path.replace(lib_prefix_re, ``))
      group.reads.push(...reads)
      group.sets.push(...sets)
    }
  }

  // groups that only set variables (e.g. on child components) document nothing
  const groups = [...by_group]
    .filter(([, { reads }]) => reads.length > 0)
    .toSorted(([left], [right]) => left.localeCompare(right))
    .map(([name, { files, reads, sets }]) => ({
      name,
      files: files.toSorted(),
      shared: new Array<string>(),
      vars: sorted_unique(reads.map((read) => read.name)).map((var_name) => {
        const var_reads = reads.filter((read) => read.name === var_name)
        const own_sets = sets.filter((set) => set.name === var_name)
        const inputs = sorted_unique(
          own_sets.flatMap(({ value }) => names(value, /(?<=var\()--[\w-]+/gu)),
        )
        return {
          name: var_name,
          fallbacks: sorted_unique(var_reads.flatMap(({ fallback }) => fallback ?? [])),
          declared: sorted_unique(
            own_sets.flatMap(({ kind, value }) => (kind === `stylesheet` ? value : [])),
          ),
          properties: sorted_unique(var_reads.flatMap(({ property }) => property ?? [])),
          // why the variable may not take a consumer's value, empty when public
          note: own_sets.some(({ kind }) => kind === `runtime`)
            ? `set by component at runtime`
            : inputs.length
              ? `derived from ${inputs.join(`, `)}`
              : ``,
        }
      }),
    }))

  const public_reads = groups.flatMap((group) =>
    group.vars.flatMap((entry) => (entry.note ? [] : [{ group, entry }])),
  )
  const shared = []
  for (const name of sorted_unique(public_reads.map(({ entry }) => entry.name))) {
    const readers = public_reads.filter(({ entry }) => entry.name === name)
    if (readers.length < shared_min_groups) continue
    shared.push({
      name,
      properties: sorted_unique(readers.flatMap(({ entry }) => entry.properties)),
      groups: readers.map(({ group }) => group.name).toSorted(),
    })
    for (const { group } of readers) {
      group.shared.push(name)
      group.vars = group.vars.filter((entry) => entry.name !== name)
    }
  }
  return { groups, shared }
}
