import {
  compile_playground,
  decode_project,
  encode_project,
  is_playground_message,
  preview_document,
  validate_project,
} from '$lib/code-playground'
import { expect, test } from 'vitest'

const project = {
  entry: `App.svelte`,
  files: {
    'App.svelte': `<script>import Child from './Child.svelte'; import './theme.css'; import {title} from './data.js'</script><Child {title}/>`,
    'Child.svelte': `<script>let {title} = $props()</script><h1>{title}</h1>`,
    'data.js': `export {default as title} from './title.json'`,
    'title.json': `"Hello λ 👋"`,
    'theme.css': `h1{color:red}`,
  },
}

test(`compiles and links Svelte, JavaScript, JSON, CSS and literal dynamic imports`, async () => {
  const build = await compile_playground(project)
  expect(build.entry).toBe(`playground:entry`)
  expect(build.modules[`playground:/App.svelte`]).toContain(`"playground:/Child.svelte"`)
  expect(build.modules[`playground:/data.js`]).toContain(`"playground:/title.json"`)
  expect(build.modules[`playground:/theme.css`]).toContain(`style.textContent`)
  expect(build.modules[`playground:/title.json`]).toContain(`Hello λ 👋`)
  const json_source = `{"__proto__":{"nested":true},"negative_zero":-0,"large":1e400}`
  const json_build = await compile_playground({
    entry: `main.js`,
    files: { 'main.js': `import data from './data.json'`, 'data.json': json_source },
  })
  // Execute generated JSON code to verify runtime semantics, including own __proto__.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const data = new Function(
    json_build.modules[`playground:/data.json`].replace(`export default`, `return`),
  )()
  expect(data).toEqual(JSON.parse(json_source))
  expect(Object.hasOwn(data, `__proto__`)).toBe(true)
  expect(Object.getPrototypeOf(data)).toBe(Object.prototype)
  const dynamic = await compile_playground({
    entry: `entry.js`,
    files: {
      'entry.js': `const text = "import './absent.js'"; import('./child.js'); export * from './child.js'`,
      'child.js': `export function Widget() { this.constructor = new.target }`,
    },
  })
  expect(dynamic.modules[`playground:/entry.js`]).toContain(`"import './absent.js'"`)
  expect(
    dynamic.modules[`playground:/entry.js`].match(/playground:\/child.js/gu),
  ).toHaveLength(2)
  // Constructor metadata must survive the import rewrite unchanged.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const Widget = new Function(
    `${dynamic.modules[`playground:/child.js`].replace(`export `, ``)}; return Widget`,
  )()
  expect(new Widget().constructor).toBe(Widget)
})

test.each([
  [`missing dependency`, `import './missing.js'`, /missing imported file/u],
  [`external dependency`, `import 'react'`, /unsupported import/u],
  [`dynamic dependency`, `import(name)`, /literal filename/u],
  [`outside project`, `import '../outside.js'`, /escapes the project/u],
  [`module metadata`, `console.log(import.meta.url)`, /import.meta/u],
  [
    `wrong import type`,
    `import data from './data.json' with {type:'css'}`,
    /literal JSON type/u,
  ],
  [`dynamic import options`, `import('./data.json', options)`, /literal JSON type/u],
  [
    `effectful import options`,
    `import('./data.json', {get with() { return {type:'json'} }})`,
    /literal JSON type/u,
  ],
  [
    `extra import options`,
    `import('./data.json', {with:{type:'json'}, extra: sideEffect()})`,
    /literal JSON type/u,
  ],
])(`rejects %s with useful diagnostics`, async (_name, source, message) => {
  await expect(
    compile_playground({ files: { 'main.js': source }, entry: `main.js` }),
  ).rejects.toThrow(message)
})

test.each([
  `import data from './data.json' with {type:'json'};`,
  `export {default as data} from './data.json' with {'type':'json'};`,
  `export * from './data.json' with {type:'json'};`,
  `const data = import('./data.json', {with:{type:'json'}});`,
])(`links JSON attributes as JavaScript: %s`, async (source) => {
  const build = await compile_playground({
    entry: `main.js`,
    files: { 'main.js': source, 'data.json': `42` },
  })
  expect(build.modules[`playground:/main.js`]).toContain(`"playground:/data.json"`)
  expect(build.modules[`playground:/main.js`]).not.toMatch(/with|type/u)
})

test(`HTML entries run inline and local module scripts and styles`, async () => {
  const build = await compile_playground({
    entry: `index.html`,
    files: {
      'index.html': `<link rel="stylesheet" href="./theme.css"><h1>Hello</h1><script type="module" src="./main.js"></script><script type="module">console.log('inline')</script>`,
      'theme.css': `h1{color:red}`,
      'main.js': `document.querySelector('h1').textContent = 'Updated'`,
    },
  })
  expect(build.html).toContain(`<h1>Hello</h1>`)
  expect(build.html).not.toContain(`<script`)
  expect(build.modules[build.entry]).toContain(`playground:/theme.css`)
  expect(build.modules[build.entry]).toContain(`playground:/main.js`)
  expect(Object.values(build.modules).join(`\n`)).toContain(`console.log('inline')`)
  await expect(
    compile_playground({
      entry: `index.html`,
      files: { 'index.html': `<script>alert(1)</script>` },
    }),
  ).rejects.toThrow(`type="module"`)
})

test(`share state round-trips Unicode and validates untrusted projects`, () => {
  expect(decode_project(encode_project(project))).toEqual(project)
  const boundary_project = {
    entry: `main.js`,
    files: { 'main.js': `\u0000`.repeat(511_000) },
  }
  expect(decode_project(encode_project(boundary_project))).toEqual(boundary_project)
  boundary_project.files[`main.js`] = `\u0000`.repeat(512_000)
  expect(() => encode_project(boundary_project)).toThrow(`Encoded playground exceeds`)
  expect(() => decode_project(`!invalid`)).toThrow(`Invalid encoded`)
  for (const value of [
    null,
    { files: {}, entry: `main.js` },
    { files: { '../main.js': `` }, entry: `../main.js` },
    { files: { 'main.js': 42 }, entry: `main.js` },
    { files: { 'main.js': `` }, entry: `missing.js` },
    { files: { 'main.js': `x`.repeat(512_001) }, entry: `main.js` },
  ])
    expect(() => validate_project(value)).toThrow(/./u)
})

test(`preview boot escapes source and validates bounded channel messages`, () => {
  const document = preview_document(
    {
      modules: { main: `console.log('</script><script>attack</script>')` },
      entry: `main`,
      html: `<p>Preview</p>`,
    },
    `export const runtime = 1`,
    `secret`,
  )
  expect(document.match(/<script/gu)).toHaveLength(1)
  expect(document).toContain(`\\u003c/script>`)
  expect(document).toContain(`connect-src 'none'`)
  expect(
    is_playground_message({ channel: `secret`, kind: `log`, text: `hello` }, `secret`),
  ).toBe(true)
  for (const data of [
    null,
    { channel: `wrong`, kind: `ready`, text: `` },
    { channel: `secret`, kind: `unknown`, text: `` },
    { channel: `secret`, kind: { toString: null, valueOf: null }, text: `` },
    { channel: `secret`, kind: `log`, text: `x`.repeat(10_001) },
  ])
    expect(is_playground_message(data, `secret`)).toBe(false)
})
