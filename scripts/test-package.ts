// Build a consumer of the real tarball outside the checkout so development dependencies
// and source aliases cannot hide missing files or undeclared package dependencies.
/// <reference types="node" />
import { execFileSync } from 'node:child_process'
import { cp, mkdtempDisposable, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, `..`)
await using directory = await mkdtempDisposable(`${tmpdir()}/svelte-widgets-package-`)
const consumer = directory.path
const run = (command: string, args: string[]) =>
  execFileSync(command, args, { cwd: consumer, stdio: `inherit` })

await cp(resolve(root, `tests/package-smoke`), consumer, { recursive: true })
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
