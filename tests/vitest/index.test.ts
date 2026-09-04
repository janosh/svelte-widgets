import * as lib from '$lib'
import * as attachments from '$lib/attachments'
import { expect, test } from 'vite-plus/test'

test(`src/lib/index.ts does not re-export attachments`, () => {
  const attachment_names = Object.keys(attachments)
  // without this, an empty attachments module would satisfy the filter vacuously
  expect(attachment_names).toContain(`tooltip`)
  expect(attachment_names.filter((export_name) => export_name in lib)).toEqual([])
})

test(`src/lib/index.ts re-exports all Svelte components`, () => {
  const components = Object.entries(
    import.meta.glob(
      [`$lib/*.svelte`, `$lib/code-editor/*.svelte`, `$lib/json-tree/JsonTree.svelte`],
      { eager: true, import: `default` },
    ),
  ).map(
    ([path, component]) =>
      [path.slice(path.lastIndexOf(`/`) + 1, -7), component] as const,
  )
  expect(components.map(([name]) => name)).toEqual(
    expect.arrayContaining([`MultiSelect`, `CodeEditor`, `DiffView`, `JsonTree`]),
  )
  for (const [name, component] of components) expect(lib).toHaveProperty(name, component)
})

// Svelte types `class` as ClassValue, so consumers may pass arrays/objects; interpolating
// one into a string renders `[object Object]` instead of letting Svelte's clsx resolve it
test(`no component interpolates a class prop into a class string`, () => {
  const sources = import.meta.glob<string>(`$lib/**/*.svelte`, {
    eager: true,
    query: `?raw`,
    import: `default`,
  })
  // an empty glob would make the filter below trivially true
  expect(Object.keys(sources).length).toBeGreaterThan(20)
  // a mustache in a quoted attribute, or a template literal
  const interpolates_class = /class=(?:"[^"]*\{[^}"]*|\{`[^`]*\$\{[^}]*)\bclass\b/u
  const offenders = Object.entries(sources)
    .filter(([, source]) => interpolates_class.test(source))
    .map(([path]) => path.split(`/`).pop())
  expect(offenders).toEqual([])
})
