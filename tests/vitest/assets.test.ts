import { asset_imports } from '$lib/assets'
import { create_markdown, markdown } from '$lib/markdown'
import { decode_source_map, original_position } from '$lib/markdown/source-map'
import { compile, parse, preprocess } from 'svelte/compiler'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { build } from 'vite'
import { describe, expect, onTestFinished, test } from 'vitest'

const transform = async (content: string) => {
  const result = await preprocess(content, asset_imports(), {
    filename: `/src/page.svelte`,
  })
  compile(result.code, { generate: false })
  return result
}

describe(`asset imports`, () => {
  test.each([
    [`img`, `src`],
    [`audio`, `src`],
    [`embed`, `src`],
    [`input`, `src`],
    [`object`, `data`],
    [`source`, `src`],
    [`track`, `src`],
    [`video`, `src`],
    [`video`, `poster`],
    [`image`, `href`],
    [`use`, `href`],
    [`use`, `xlink:href`],
  ])(`imports %s %s`, async (tag, attribute) => {
    const { code } = await transform(`<${tag} ${attribute}="./asset.png" />`)
    expect(code).toContain(`import __widget_asset_0 from "./asset.png?url";`)
    expect(code).toContain(`${attribute}={__widget_asset_0}`)
  })

  test.each([
    `<img src="/public.png">`,
    `<img src="//cdn.org/image.png">`,
    `<img src="https://cdn.org/image.png">`,
    `<img src="data:image/png;base64,abc">`,
    `<img src="blob:abc">`,
    `<img src="?image=1">`,
    `<svg><use href="#symbol" /></svg>`,
    `<script>let image = ''</script><img src={image}><img src="./{image}.png">`,
    `<script>let Image</script><Image src="./image.png" />`,
    `<a href="./route">Page</a>`,
    `<meta content="./not-an-asset">`,
    `<link rel="canonical" href="./page">`,
    `<!-- <img src="./comment.png"> --><script>const example = '<img src="./text.png">'</script>`,
  ])(`preserves %s`, async (source) => {
    expect((await transform(source)).code).toBe(source)
  })

  test.each([
    [
      `<a href="notes.pdf?download=1#page=2" download>PDF</a>`,
      `./notes.pdf?url&no-inline`,
      `?download=1#page=2`,
    ],
    [
      `<a href="../data.csv#table" download="data.csv">Download</a>`,
      `../data.csv?url&no-inline`,
      `#table`,
    ],
    [
      `<img src="./plot.svg?theme=dark&amp;size=2#figure">`,
      `./plot.svg?url&no-inline`,
      `?theme=dark&size=2#figure`,
    ],
  ])(`retains suffixes and boolean attributes in %s`, async (source, path, suffix) => {
    const { code } = await transform(source)
    expect(code).toContain(`from ${JSON.stringify(path)}`)
    expect(code).toContain(`__widget_asset_0 + ${JSON.stringify(suffix)}`)
    if (source.includes(` download`)) expect(code).toContain(` download`)
  })

  test.each([
    `<link disabled rel="stylesheet" href="./style.css">`,
    `<link rel="alternate stylesheet" href="./style.css">`,
    `<link rel="icon shortcut" href="./icon.svg">`,
    `<link itemprop="image" href="./icon.svg">`,
    `<link itemprop="name image" href="./icon.svg">`,
    `<meta property="og:image" content="./cover.png">`,
    `<meta name="twitter:image" content="./cover.png">`,
    `<meta itemprop="image" content="./cover.png">`,
    `<meta itemprop="name image" content="./cover.png">`,
  ])(`handles static head metadata in %s`, async (markup) => {
    const { code } = await transform(`<svelte:head>${markup}</svelte:head>`)
    expect(code).toContain(`={__widget_asset_0}`)
  })

  test.each([`img`, `source`, `link`])(
    `preserves %s srcset candidates and descriptors`,
    async (tag) => {
      const attribute = tag === `link` ? `imagesrcset` : `srcset`
      const { code } = await transform(
        `<${tag} ${tag === `link` ? `rel="preload"` : ``} ${attribute}="  ./small.png 1x,\n  data:image/png;base64,abc 2x, /public.png 3x, ./large.png?size=4&amp;fit=1 4x">`,
      )
      expect(code).toContain(`import __widget_asset_0 from "./small.png?url"`)
      expect(code).toContain(`import __widget_asset_1 from "./large.png?url&no-inline"`)
      expect(code).toContain(
        `"  " + __widget_asset_0 + " 1x,\\n  data:image/png;base64,abc 2x, /public.png 3x, "`,
      )
      expect(code).toContain(`__widget_asset_1 + "?size=4&fit=1" + " 4x"`)
    },
  )

  test(`deduplicates imports with different fragments and handles descriptor-free srcset`, async () => {
    const { code } = await transform(
      `<img src="./icon.svg#first" srcset="./icon.svg#second, ./icon.svg#third,">`,
    )
    expect(code.match(/import /gu)).toHaveLength(1)
    expect(code).toContain(
      `srcset={__widget_asset_0 + "#second" + ", " + __widget_asset_0 + "#third" + ","}`,
    )
  })

  test.each([
    `<script lang="ts">let __widget_asset_0: boolean = true</script>{#if __widget_asset_0}<img src="./image.png">{/if}`,
    `<script module>export const value = 1</script>{#snippet picture()}<img src="./image.png">{/snippet}{@render picture()}`,
  ])(
    `inserts imports without conflicting with authored scripts or blocks`,
    async (source) => {
      const { code } = await transform(source)
      const tree = parse(code, { modern: true })
      expect(tree.instance).not.toBeNull()
      if (source.includes(`__widget_asset_0`)) {
        expect(code).toContain(`import __widget_asset__0 `)
        expect(code).toContain(`let __widget_asset_0: boolean = true`)
      }
    },
  )

  test(`maps retained markup back to original source after inserting imports`, async () => {
    const source = `<img src="./image.png">\n<p>Retained text</p>`
    const { code, map } = await transform(source)
    const before_text = code.slice(0, code.indexOf(`Retained text`)).split(`\n`)
    expect(map).toBeDefined()
    if (
      !map ||
      typeof map !== `object` ||
      !(`mappings` in map) ||
      typeof map.mappings !== `string`
    )
      throw new Error(`Expected asset source map`)
    expect(
      original_position(
        decode_source_map(map.mappings),
        before_text.length - 1,
        before_text.at(-1)?.length ?? 0,
      ),
    ).toEqual({ line: 1, column: 3 })
  })

  test(`imports Markdown images and PDF links after Markdown compilation`, async () => {
    const result = await preprocess(
      `![Figure](./figure.png)\n\n[Notes](./notes.pdf#page=2)`,
      [markdown(create_markdown()), asset_imports()],
      { filename: `/src/page.md` },
    )
    compile(result.code, { generate: false })
    expect(result.code).toContain(`from "./figure.png?url"`)
    expect(result.code).toContain(`from "./notes.pdf?url&no-inline"`)
    expect(result.code).toContain(`href={__widget_asset_1 + "#page=2"}`)
  })

  test(`Vite resolves encoded Markdown paths, dotfiles and literal percent signs`, async () => {
    const directory = await mkdtemp(`${tmpdir()}/widgets-assets-`)
    onTestFinished(() => rm(directory, { recursive: true }))
    const filenames = [`image one.svg`, `東京.svg`, `100%.svg`, `.hidden.svg`]
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"/>`
    await Promise.all(filenames.map((name) => writeFile(`${directory}/${name}`, svg)))
    const source = [
      ...filenames.map((name) => `![Image](<${name}>)`),
      `<img src="./100%.svg">`,
    ].join(`\n`)
    const { code } = await preprocess(
      source,
      [markdown(create_markdown()), asset_imports()],
      { filename: `${directory}/page.md` },
    )
    const script = parse(code, { modern: true }).instance
    if (!script) throw new Error(`Missing asset imports`)
    const declarations = code
      .slice(script.start, script.end)
      .replaceAll(/<\/?script>/gu, ``)
    const entry = `${directory}/entry.js`
    await writeFile(
      entry,
      `${declarations}\nexport default [__widget_asset_0, __widget_asset_1, __widget_asset_2, __widget_asset_3];`,
    )
    const bundle = await build({
      configFile: false,
      root: directory,
      logLevel: `silent`,
      build: { write: false, lib: { entry, formats: [`es`] } },
    })
    if (!Array.isArray(bundle)) throw new Error(`Expected Vite library output`)
    const chunk = bundle[0].output.find((output) => output.type === `chunk`)
    if (!chunk) throw new Error(`Missing bundled asset module`)
    const urls = (
      await import(
        /* @vite-ignore */ `data:text/javascript,${encodeURIComponent(chunk.code)}`
      )
    ).default as unknown
    expect(urls).toEqual(
      filenames.map(() => expect.stringMatching(/^data:image\/svg\+xml[;,]/u)),
    )
  })
})
