// Readme links to API symbols point at the line defining them on GitHub. Lines shift with
// every edit, so the `#L` anchors are derived from each symbol's current definition rather
// than maintained by hand: `node scripts/readme-links.ts` rewrites them, readme.test.ts fails
// on stale ones, and the pre-commit hook runs the rewrite when src/lib changes.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Matches [`name(args)`](<repo>/blob/main/src/lib/<file>#L<line>) with <repo> the GitHub URL
const link_re =
  /(?<head>\[`(?<name>[\w$]+)[^\]]*\]\(https:\/\/github\.com\/janosh\/svelte-widgets\/blob\/main\/(?<file>src\/lib\/[^)#]+)#L)(?<line>\d+)\)/gu

// 1-based line of the first exported declaration of `name`, including destructured consts
// like `export const [set_editor_backend, resolve_editor_backend] =`
export const definition_line = (source: string, name: string): number | undefined => {
  const ident = name.replaceAll(`$`, String.raw`\$`)
  const declaration = new RegExp(
    String.raw`^export (?:default )?(?:async )?(?:function\*?|const|let|class|type|interface|enum) (?:\[[^\]]*\b${ident}\b|${ident}\b)`,
    `u`,
  )
  const idx = source.split(`\n`).findIndex((line) => declaration.test(line))
  return idx === -1 ? undefined : idx + 1
}

// Rewrite every anchor to its symbol's definition line. Links whose symbol has no exported
// declaration in the linked file throw: there is no correct line to point them at.
export const sync_readme_links = (
  doc: string,
  source_of: (file: string) => string | undefined,
): { text: string; stale: string[] } => {
  const stale: string[] = []
  const missing: string[] = []
  const text = doc.replaceAll(
    link_re,
    (match, head: string, name: string, file: string, line: string) => {
      const target = definition_line(source_of(file) ?? ``, name)
      if (target === undefined) missing.push(`${file}#L${line} (${name})`)
      else if (String(target) !== line)
        stale.push(`${file}#L${line} -> #L${target} (${name})`)
      return target === undefined ? match : `${head}${target})`
    },
  )
  if (missing.length)
    throw new Error(
      `No exported definition for readme source links: ${missing.join(`, `)}`,
    )
  return { text, stale }
}

if (import.meta.main) {
  const root = resolve(import.meta.dirname, `..`)
  for (const readme of [`readme.md`, `src/lib/markdown/readme.md`]) {
    const path = resolve(root, readme)
    const { text, stale } = sync_readme_links(readFileSync(path, `utf8`), (file) =>
      readFileSync(resolve(root, file), `utf8`),
    )
    if (stale.length) {
      writeFileSync(path, text)
      console.info(`${readme}: ${stale.join(`, `)}`)
    }
  }
}
