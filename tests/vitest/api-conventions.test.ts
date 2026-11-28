// Guards the naming conventions settled for every component API, read from the same prop
// schemas the docs render (prop-docs), so a regression fails here instead of in review
import { extract_prop_docs } from '#lib/prop-docs/vite-plugin.ts'
import { globSync, readFileSync } from 'node:fs'
import { expect, test } from 'vite-plus/test'

// the only *_class props: a class toggled per row by state, which a props object can't express
const CLASS_PROP_EXCEPTIONS = new Set([
  `li_active_option_class`,
  `li_active_user_msg_class`,
])

const lib_files = (pattern: string) => globSync(`src/lib/${pattern}`).toSorted()
const components = lib_files(`**/*.svelte`).filter((file) =>
  readFileSync(file, `utf8`).includes(`$props(`),
)
const docs = Object.entries(extract_prop_docs(components))
const props = docs.flatMap(([component, { props: list }]) =>
  list.map((prop) => ({ ...prop, id: `${component}.${prop.name}` })),
)

// single-line type aliases anywhere in src/lib, to look through `(detail: SomeDetail) => void`
const type_aliases = new Map(
  lib_files(`**/*.{ts,svelte}`).flatMap((file) =>
    [
      ...readFileSync(file, `utf8`).matchAll(/\btype (?<name>\w+)\s*=\s*(?<body>.+)$/gmu),
    ].map(({ groups }) => [groups?.name, groups?.body] as const),
  ),
)
const names_via = (type = ``): boolean =>
  /\bvia\b/u.test(type) ||
  [...type.matchAll(/\b[A-Z]\w*/gu)].some(([name]) =>
    /\bvia\??:/u.test(type_aliases.get(name) ?? ``),
  )

test(`prop schemas are read for every component`, () => {
  expect(docs).toHaveLength(components.length)
  expect(props.length).toBeGreaterThan(500)
})

test.each([
  [
    `no *_class or *_style props: element props objects carry class and style`,
    (name: string) => /_(?:class|style)$/u.test(name) && !CLASS_PROP_EXCEPTIONS.has(name),
  ],
  [
    `no positive opt-outs like enabled: write them as disabled = false`,
    (name: string) => /^enabled$|_enabled$|^enable_/u.test(name),
  ],
])(`%s`, (_rule, violates) => {
  expect(props.filter(({ name }) => violates(name)).map(({ id }) => id)).toEqual([])
})

test(`on_open and on_close callbacks say what caused them through { via }`, () => {
  const callbacks = props.filter(({ name }) => name === `on_open` || name === `on_close`)
  expect(callbacks.length).toBeGreaterThan(10)
  expect(callbacks.filter(({ type }) => !names_via(type)).map(({ id }) => id)).toEqual([])
})

test(`CSS custom properties use the -bg and -radius suffixes`, () => {
  const offenders = lib_files(`**/*.{svelte,ts,css}`).flatMap((file) =>
    [
      ...readFileSync(file, `utf8`).matchAll(/--[\w-]+-(?:background|border-radius)\b/gu),
    ].map(([name]) => `${file}: ${name}`),
  )
  expect(offenders).toEqual([])
})
