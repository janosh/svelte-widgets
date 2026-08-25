// Vite plugin behind `virtual:source-symbols`: the repository URL, the commit the site is
// built from, every source file under `dir` and the line of every exported definition, so
// docs can turn inline code mentions into pinned GitHub links (see ./index.ts).
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import process from 'node:process'
import type { Plugin } from 'vite'

export const SOURCE_SYMBOLS_MODULE_ID = `virtual:source-symbols`
const RESOLVED_ID = `\0${SOURCE_SYMBOLS_MODULE_ID}`
// .svelte and .ts sources, minus tests and declaration files
const is_source_file = (name: string): boolean =>
  /\.(?:svelte|ts)$/.test(name) && !/\.(?:test|d)\.ts$/.test(name)
const EXPORT_DEFINITION_RE =
  /^export (?:async function|function|abstract class|class|const|let|interface|type|enum) (?<name>[A-Za-z_$][\w$]*)/

// `repository` as package.json allows it: a URL string, a `{ url }` record (often with a
// `git+` prefix and `.git` suffix) or a GitHub shorthand like `user/repo`
export const repository_url = (repository: unknown): string => {
  const raw =
    typeof repository === `string` ? repository : (repository as { url?: unknown })?.url
  if (typeof raw !== `string` || !raw) {
    throw new Error(
      `package.json needs a "repository" so source links know where to point`,
    )
  }
  if (/^[\w.-]+\/[\w.-]+$/.test(raw)) return `https://github.com/${raw}`
  return raw.replace(/^git\+/, ``).replace(/\.git$/, ``)
}

export type SourceLinksPluginOptions = {
  root?: string // project root holding package.json and `dir`; defaults to the cwd
  dir?: string // source directory to index, relative to root
}

export default function source_links({
  root = process.cwd(),
  dir = `src/lib`,
}: SourceLinksPluginOptions = {}): Plugin {
  return {
    name: `vite-plugin-source-links`,
    resolveId: (id) => (id === SOURCE_SYMBOLS_MODULE_ID ? RESOLVED_ID : null),
    load(id) {
      if (id !== RESOLVED_ID) return null
      const pkg = JSON.parse(readFileSync(join(root, `package.json`), `utf-8`)) as {
        repository?: unknown
      }
      const files: string[] = []
      // name -> location, or null once two files define the same name (ambiguous: never linked)
      const symbols = new Map<string, string | null>()
      for (const entry of readdirSync(join(root, dir), {
        recursive: true,
        withFileTypes: true,
      })) {
        if (!entry.isFile() || !is_source_file(entry.name)) continue
        const file = join(entry.parentPath, entry.name)
        const path = `/${relative(root, file).replaceAll(`\\`, `/`)}`
        files.push(path)
        if (!file.endsWith(`.ts`)) continue
        for (const [idx, line] of readFileSync(file, `utf-8`).split(`\n`).entries()) {
          const name = EXPORT_DEFINITION_RE.exec(line)?.groups?.name
          if (name) symbols.set(name, symbols.has(name) ? null : `${path}#L${idx + 1}`)
        }
      }
      let ref = `main`
      try {
        ref = execSync(`git rev-parse HEAD`, { cwd: root, stdio: `pipe` })
          .toString()
          .trim()
      } catch {
        // no git (tarball build): links follow main instead of a pinned commit
      }
      const unique = Object.fromEntries(
        [...symbols].filter(([, location]) => location !== null),
      )
      return [
        `export const repo = ${JSON.stringify(repository_url(pkg.repository))}`,
        `export const ref = ${JSON.stringify(ref)}`,
        `export const files = ${JSON.stringify(files.toSorted())}`,
        `export const symbols = ${JSON.stringify(unique)}`,
      ].join(`\n`)
    },
  }
}
