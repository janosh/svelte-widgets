import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { exports as pkg_exports } from '#root/package.json'
import { expect, test } from 'vite-plus/test'

const root = resolve(import.meta.dirname, `../..`)

// Subpaths whose purpose is to ship Svelte components; every other subpath must stay importable
// where no Svelte compiler runs on .svelte files (web workers, Node scripts, other bundlers)
const COMPONENT_SUBPATHS = new Set([
  `.`,
  `./*.svelte`,
  `./CodeEditor.svelte`,
  `./DiffView.svelte`,
  `./JsonTree.svelte`,
  `./code-editor`,
  `./json-tree`,
  `./table`,
])

// relative imports, re-exports and dynamic imports, with or without bindings
const IMPORT_RE = /(?:from|import)\s*\(?\s*['"](?<spec>\.{1,2}\/[^'"]+)['"]/gu

const resolve_source = (from_dir: string, spec: string): string => {
  const base = resolve(from_dir, spec.replace(/\.js$/u, ``))
  const candidates = [base, `${base}.ts`, `${base}.svelte.ts`, `${base}/index.ts`]
  // a directory import names its index.ts, never the directory itself
  const found = candidates.find((path) =>
    statSync(path, { throwIfNoEntry: false })?.isFile(),
  )
  if (!found) throw new Error(`Unresolved import ${spec} from ${from_dir}`)
  return found
}

// every source file reachable from entry through relative imports
const reachable = (entry: string): Set<string> => {
  const seen = new Set<string>()
  const queue = [entry]
  for (let path = queue.pop(); path; path = queue.pop()) {
    if (seen.has(path)) continue
    seen.add(path)
    if (path.endsWith(`.svelte`) || !/\.(?:ts|js)$/u.test(path)) continue
    for (const { groups } of readFileSync(path, `utf8`).matchAll(IMPORT_RE)) {
      if (groups?.spec) queue.push(resolve_source(dirname(path), groups.spec))
    }
  }
  return seen
}

const pure_subpaths = Object.entries(pkg_exports).flatMap(([subpath, target]) => {
  const dist = `default` in target ? target.default : target.types
  if (COMPONENT_SUBPATHS.has(subpath) || !dist.endsWith(`.js`)) return []
  const source = dist.replace(`./dist/`, `src/lib/`).replace(/\.js$/u, `.ts`)
  return [[subpath, resolve(root, source)]]
})

test(`the component allowlist only names real subpaths`, () => {
  expect([...COMPONENT_SUBPATHS].filter((subpath) => !(subpath in pkg_exports))).toEqual(
    [],
  )
  // an empty list would pass the test below vacuously
  expect(pure_subpaths.length).toBeGreaterThan(20)
})

test.each(pure_subpaths)(`%s reaches no Svelte component`, (_subpath, entry) => {
  const components = [...reachable(entry)]
    .filter((path) => path.endsWith(`.svelte`))
    .map((path) => path.replace(`${root}/`, ``))
  expect(components).toEqual([])
})
