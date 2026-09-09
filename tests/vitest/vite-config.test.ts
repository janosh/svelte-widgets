import { make_config } from '$lib/vite-config'
import { expect, test } from 'vitest'

test(`overrides merge into their section without dropping the rest`, () => {
  const defaults = make_config()
  const merged = make_config({ staged: { '*': `codespell` }, fmt: { printWidth: 95 } })

  expect(merged.staged).toEqual({ ...defaults.staged, '*': `codespell` })
  expect(merged.fmt).toEqual({ ...defaults.fmt, printWidth: 95 })
  expect(merged.lint).toEqual(defaults.lint) // untouched section
  // arrays still replace wholesale — `ignorePatterns: [...]` means exactly that
  expect(
    make_config({ lint: { ignorePatterns: [`static/**`] } }).lint.ignorePatterns,
  ).toEqual([`static/**`])
})

// Lint's object members merge a second level down, unlike every other section.
test.each([
  [`rules`, { 'no-var': `off` }],
  [`options`, { typeCheck: false }],
  [`categories`, { perf: `warn` }],
] as const)(`overriding one lint %s entry keeps the rest`, (member, override) => {
  const defaults = make_config()
  const merged = make_config({ lint: { [member]: override } })

  expect(merged.lint).toEqual({
    ...defaults.lint,
    [member]: { ...defaults.lint[member], ...override },
  })
})

// Importing Vite+ types ties this config to one dependency copy and can overflow TS
// when consumers resolve another, so the public shapes must stay structural.
test(`config types stay independent of vite-plus`, async () => {
  const { default: source } = await import(`$lib/vite-config.ts?raw`)
  expect(source).not.toMatch(/from\s+['"`](?:vite-plus|oxlint)/)
})

test(`a returned config owns its nested state`, () => {
  // Snapshot first; comparing another aliased result after mutation would be vacuous.
  const before = structuredClone(make_config())
  const config = make_config()
  config.lint.rules[`no-var`] = `off` // a nested map
  config.lint.ignorePatterns.push(`LEAKED`) // a nested array
  config.staged[`*`] = `LEAKED` // a sibling section

  expect(make_config()).toEqual(before)
})

const stateful_sources = import.meta.glob(`/src/lib/*.svelte.ts`)
test.each([
  [`clipboard`, () => import(`svelte-widgets/clipboard`)],
  [`dialogs`, () => import(`svelte-widgets/dialogs`)],
  [`find-in-page`, () => import(`svelte-widgets/find-in-page`)],
  [`fullscreen`, () => import(`svelte-widgets/fullscreen`)],
  [`toast-queue`, () => import(`svelte-widgets/toast-queue`)],
  [`theme`, () => import(`svelte-widgets/theme`)],
  [`roving-focus`, () => import(`svelte-widgets/roving-focus`)],
  [`canvas`, () => import(`svelte-widgets/canvas`)],
] as const)(`public %s imports share the live source module`, async (name, load) => {
  expect(await load()).toBe(await stateful_sources[`/src/lib/${name}.svelte.ts`]())
})
