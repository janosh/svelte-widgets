import { mkdtempDisposable, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'
import { finalize_package, rewrite_imports } from '../../scripts/finalize-package.ts'

test.each([`'`, `"`, `\``])(`rewrites dynamic imports quoted with %s only`, (quote) => {
  const source = `const load = () => import(${quote}./factory.ts${quote});
const example = ${quote}./factory.ts${quote};
// import(${quote}./comment.ts${quote})`
  expect(rewrite_imports(source, `index.js`)).toBe(
    source.replace(`./factory.ts`, `./factory.js`),
  )
})

test.each([
  [
    `index.js`,
    `export { default } from './Menu.svelte'; import './setup'; import type { Value } from '../types.ts'`,
    `export { default } from './Menu.svelte'; import './setup.js'; import type { Value } from '../types.js'`,
  ],
  [
    `index.d.ts`,
    `export { default } from './Menu.svelte'; type Props = import('./Menu.svelte').Props`,
    `export { default } from './Menu.svelte.js'; type Props = import('./Menu.svelte.js').Props`,
  ],
  [
    `Menu.svelte`,
    `<script module>export { value } from './shared'</script><script lang="ts" generics="Value extends import('./types').Value">import './setup.ts'</script><p>import('./example.ts')</p>`,
    `<script module>export { value } from './shared.js'</script><script lang="ts" generics="Value extends import('./types.js').Value">import './setup.js'</script><p>import('./example.ts')</p>`,
  ],
  [
    `index.js`,
    `import "external"; import "./data.json"; import "./asset.svg?raw"; import(\`./\${name}.ts\`)`,
    `import "external"; import "./data.json"; import "./asset.svg?raw"; import(\`./\${name}.ts\`)`,
  ],
])(`normalizes %s module specifiers`, (filename, source, expected) => {
  expect(rewrite_imports(source, filename)).toBe(expected)
  expect(rewrite_imports(expected, filename)).toBe(expected)
})

test(`finalizes nested package files and removes only Markdown guides`, async () => {
  await using directory = await mkdtempDisposable(`${tmpdir()}/widgets-package-test-`)
  const nested = resolve(directory.path, `nested`)
  await mkdir(nested)
  for (const [name, source] of [
    [`index.js`, `export * from './value'`],
    [`readme.md`, `Guide`],
    [`other-readme.md`, `Keep`],
  ])
    await writeFile(resolve(nested, name), source)
  await finalize_package(directory.path)
  expect((await readdir(nested)).toSorted()).toEqual([`index.js`, `other-readme.md`])
  expect(await readFile(resolve(nested, `index.js`), `utf8`)).toBe(
    `export * from './value.js'`,
  )
})
