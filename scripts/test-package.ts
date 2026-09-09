// Build a consumer of the real tarball outside the checkout so development dependencies
// and source aliases cannot hide missing files or undeclared package dependencies.
/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { cp, mkdtempDisposable, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, `..`)
await using directory = await mkdtempDisposable(`${tmpdir()}/svelte-widgets-package-`)
const consumer = directory.path
const run = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: consumer, stdio: `inherit` })

await cp(resolve(root, `tests/package-smoke`), consumer, { recursive: true })

// Bundle actual copied demos, not hand-maintained approximations that can drift from docs.
// These exercise root exports, types, attachments, stateful utilities, and editor CSS.
const demo_ids = new Set([
  `multiselect-form-data`,
  `languages-2`,
  `custom-sort`,
  `attachments-tooltip-styling`,
  `attachments-tooltip-placement`,
  `settings-section`,
  `toast-actions`,
  `code-editor-basic`,
])
const demo_components: string[] = []
const { create_markdown } = await import(`../dist/markdown/index.js`)
const engine = create_markdown({ math: true, references: true, examples: {} })
for (const entry of await readdir(resolve(root, `src/routes/(demos)`), {
  recursive: true,
  withFileTypes: true,
})) {
  if (!entry.isFile() || entry.name !== `+page.md`) continue
  const filename = resolve(entry.parentPath, entry.name)
  const source = await readFile(filename, `utf8`)
  const parsed = await engine.parse(source, { filename })
  if (!parsed.ok)
    throw new Error(
      `Cannot parse demo ${filename}: ${JSON.stringify(parsed.diagnostics)}`,
    )
  for (const fence of parsed.value.manifest.fences) {
    if (!fence.settings.example) continue
    if (/\bdemo-box\b/u.test(fence.code)) {
      throw new Error(
        `Demo ${filename}:${fence.range.start.line} depends on site-only frame styling`,
      )
    }
    if (/from\s+['"]\$(?:lib|site|root)(?:\/|['"])/u.test(fence.code)) {
      throw new Error(
        `Demo ${filename}:${fence.range.start.line} uses a private repository import`,
      )
    }
    const { id } = fence.settings
    if (!id || !demo_ids.delete(id)) continue
    const component = `Demo${demo_components.length}`
    demo_components.push(component)
    await writeFile(resolve(consumer, `${component}.svelte`), fence.code)
  }
}
if (demo_ids.size)
  throw new Error(`Package smoke demos missing: ${[...demo_ids].join(`, `)}`)
const smoke_app = resolve(consumer, `SmokeApp.svelte`)
const smoke_source = (await readFile(smoke_app, `utf8`)).replace(
  `<script lang="ts">`,
  `<script lang="ts">\n${demo_components.map((name) => `import ${name} from './${name}.svelte'`).join(`\n`)}`,
)
await writeFile(
  smoke_app,
  `${smoke_source}\n${demo_components.map((name) => `<${name} />`).join(`\n`)}\n`,
)
const [tarball]: { filename: string }[] = JSON.parse(
  execFileSync(
    `npm`,
    [`pack`, `--ignore-scripts`, `--json`, `--pack-destination`, consumer],
    { cwd: root, encoding: `utf8` },
  ),
)
if (!tarball) throw new Error(`npm pack returned no tarball for ${root}`)

// Reuse the versions under test, but install independent copies in the consumer.
const packages = [`./${tarball.filename}`]
for (const name of [
  `svelte`,
  `vite`,
  `@sveltejs/vite-plugin-svelte`,
  `typescript`,
  `@types/node`,
  `@wooorm/starry-night`,
  `katex`,
]) {
  const { version }: { version: string } = JSON.parse(
    await readFile(resolve(root, `node_modules`, name, `package.json`), `utf8`),
  )
  packages.push(`${name}@${version}`)
}
await writeFile(resolve(consumer, `package.json`), `{"private":true,"type":"module"}`)
run(`npm`, [
  `install`,
  `--no-save`,
  `--ignore-scripts`,
  `--package-lock=false`,
  `--no-audit`,
  `--no-fund`,
  ...packages,
])
run(process.execPath, [`node_modules/typescript/bin/tsc`, `-p`, `tsconfig.json`])
run(process.execPath, [`node_modules/vite/bin/vite.js`, `build`])
