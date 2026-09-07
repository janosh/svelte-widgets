/* oxlint-disable no-template-curly-in-string -- Literal JavaScript and Svelte fixtures. */
import {
  compile_source as compile_markdown,
  markdown_integration as markdown_vite,
  markdown_preprocessor as markdown,
  render_source as render_markdown,
} from './markdown-helpers'
import {
  assert_ok,
  create_markdown,
  compile_markdown as compile_document,
  render_markdown as render_document,
  DiagnosticError,
} from '$lib/markdown'
import {
  decode_source_map,
  original_position,
  source_map,
} from '$lib/markdown/source-map'
import { compile, preprocess } from 'svelte/compiler'
import { describe, expect, test, vi } from 'vitest'

const compile_page = async (
  source: string,
  options: Parameters<typeof compile_markdown>[1] = {},
) => {
  const result = await compile_markdown(source, {
    filename: `/project/page.md`,
    ...options,
  })
  compile(result.code, { generate: false })
  for (const example of result.examples) compile(example.source, { generate: false })
  return result
}

describe(`Markdown output`, () => {
  test.each([
    [
      `# Title\n\n**bold** and _em_ and ~~gone~~`,
      [
        `<h1 id="title">Title</h1>`,
        `<strong>bold</strong>`,
        `<em>em</em>`,
        `<del>gone</del>`,
      ],
    ],
    [
      `| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] Done\n- [ ] Next`,
      [`<table>`, `<td>1</td>`, `checked=""`, `disabled=""`],
    ],
    [`A & B &amp; &#123; \\{literal\\}`, [`A &amp; B &amp; &#123; &#123;literal&#125;`]],
    [
      '`a > b` `<input>` `&gt;` `&lt;input&gt;`',
      [
        `<code>a &gt; b</code>`,
        `<code>&lt;input&gt;</code>`,
        `<code>&amp;gt;</code>`,
        `<code>&amp;lt;input&amp;gt;</code>`,
      ],
    ],
    [`[link][target]\n\n[target]: /path "Title"`, [`href="/path" title="Title"`]],
    [
      `Visit <https://example.org> or <mailto:hi@example.org>`,
      [`href="https://example.org"`, `href="mailto:hi@example.org"`],
    ],
  ])(`renders %s`, async (source, expected) => {
    const result = await compile_page(source)
    for (const fragment of expected) expect(result.code).toContain(fragment)
  })

  test(`HTML mode retains literal braces without loading Svelte semantics`, async () => {
    expect(await render_markdown(`Hello {name} and <b>HTML</b>`)).toBe(
      `<p>Hello &#123;name&#125; and <b>HTML</b></p>\n`,
    )
    expect(await render_markdown(`\`{code}\` &amp;`)).toBe(
      `<p><code>&#123;code&#125;</code> &amp;</p>\n`,
    )
  })

  test(`typography affects prose, preserving code and attributes`, async () => {
    const { code } = await compile_page(
      `"Hello" -- it's... <span title='plain'>\`"code"\`</span>`,
      { typography: true },
    )
    expect(code).toContain(`“Hello” — it’s…`)
    expect(code).toContain(`title='plain'`)
    expect(code).toContain(`<code>"code"</code>`)
  })
})

describe(`Svelte integration`, () => {
  test.each([
    `{#if ready}\n# Hello {name}\n{:else}\nNope\n{/if}`,
    `{#each items as { name, value }}\n**{name}**: {value}\n{/each}`,
    `{#await promise}\nLoading\n{:then { title }}\n# {title}\n{:catch error}\n{error.message}\n{/await}`,
    '{#snippet item(value)}\n**{value}**\n{/snippet}\n{@render item(1)}',
    '{(/}/).test("}") ? `value ${1 + 2}` : "none"}',
    '<script lang="ts">let value: number = 1</script>\n\n<span title={value > 1 ? "a" : "b"}>{value}</span>\n\n<style>span { color: red }</style>',
  ])(`preserves %s`, async (source) => {
    const result = await compile_page(source)
    expect(result.map.sourcesContent).toEqual([source])
    expect(result.map.mappings).not.toBe(``)
  })

  test(`frontmatter merges into a module script and remains available to the template`, async () => {
    const result = await compile_page(
      `---\ntitle: "A </script> title"\ndate: 2026-09-06\nflags: [true, false]\n---\n<script module>export const answer = 42</script>\n<script>let value = 1</script>\n\n# {metadata.title} {value}`,
    )
    expect(result.metadata).toEqual({
      title: `A </script> title`,
      date: `2026-09-06`,
      flags: [true, false],
    })
    expect(result.code.match(/<script module>/gu)).toHaveLength(1)
    expect(result.code).toContain(`export const metadata`)
    expect(result.code).not.toContain(`const { title, date, flags }`)
    const empty = await compile_page(`---\n---\n# Empty`)
    expect(empty.metadata).toEqual({})
    expect(empty.code).toContain(`export const metadata`)
    const scoped = await compile_page(
      `---\ntitle: Frontmatter\nawait: keyword\nmetadata: nested\n---\n<script>const title = "Local"</script>\n\n{title} {metadata.title} {metadata.await} {metadata.metadata}`,
    )
    expect(scoped.code).toContain(`const title = "Local"`)
    expect(scoped.code).toContain(`{metadata.title}`)
    expect(scoped.code).not.toContain(`const {`)
  })

  test(`source maps distinguish retained characters from generated markup`, async () => {
    expect(
      source_map(`abc\ndef`, `<p>abc</p>\n<p>def</p>`, `page.md`, [
        { generated: 3, original: 0, length: 3 },
        { generated: 14, original: 4, length: 3 },
      ]),
    ).toEqual({
      version: 3,
      sources: [`page.md`],
      sourcesContent: [`abc\ndef`],
      names: [],
      mappings: `GAAA,CAAC,CAAC,C;GACF,CAAC,CAAC,C`,
    })
    const ambiguous = await compile_page('`{name}` then {name}')
    expect(ambiguous.code).toContain(`<code>&#123;name&#125;</code> then {name}`)
    expect(ambiguous.map.mappings.replaceAll(`;`, ``)).not.toBe(``)
    expect(
      source_map(`{name}`, `{name} {name}`, `page.md`, [
        { generated: 7, original: 0, length: 6 },
      ]).mappings,
    ).toBe(`OAAA,CAAC,CAAC,CAAC,CAAC,CAAC`)
  })

  test(`preserves Svelte expressions in link and image destinations`, async () => {
    const { code } = await compile_page(
      `[Paper]({paper.URL}) ![Image](/assets/{name}.png)\n\n[Details](<{base + '/details'}>)`,
    )
    expect(code).toContain(`href="{paper.URL}"`)
    expect(code).toContain(`src="/assets/{name}.png"`)
    expect(code).toContain(`href="{base + '/details'}"`)
  })

  test.each([
    `---\ntitle: A`,
    `---\n- a\n- b\n---`,
    `---\ntitle: A\ntitle: B\n---`,
    `---\nnumber: .inf\n---`,
    `{invalid`,
  ])(`reports filename for invalid input %s`, async (source) => {
    await expect(compile_markdown(source, { filename: `broken.md` })).rejects.toThrow(
      `broken.md:`,
    )
  })

  test(`preprocessor filters extensions and composes with Svelte`, async () => {
    const processor = markdown()
    expect(
      (await preprocess(`# Hello`, processor, { filename: `page.svelte` })).code,
    ).toBe(`# Hello`)
    expect(
      (await preprocess(`# Hello`, processor, { filename: `page.md` })).code,
    ).toContain(`<h1 id="hello">Hello</h1>`)
  })
})

describe(`code and math`, () => {
  test(`awaits custom highlighting and keeps JavaScript-like content literal`, async () => {
    const calls: string[] = []
    const result = await compile_page('```js\nconst text = `${value}`\n```', {
      highlight: async (code, lang) => {
        calls.push(lang)
        return `<b>${code}</b>`
      },
    })
    expect(calls).toEqual([`js`])
    expect(result.code).toContain(`{@html`)
    expect(result.code).toContain('`${value}`')
  })

  test(`renders math while excluding code, escapes, attributes and scripts`, async () => {
    const source =
      '<script>const currency = "$5 and $10"</script>\n\n$x^2$\n\n$$\nx+y\n$$\n\n`$code$` \\$escaped$ <span title="$attribute$">text</span>\n\n```txt\n$fenced$\n```'
    const { code } = await compile_page(source, { math: true })
    expect(code.match(/class=\\"katex\\"/gu)).toHaveLength(2)
    expect(code).toContain(`$attribute$`)
    expect(code).toContain(`$code$`)
    expect(code).toContain(`$escaped$`)
    expect(code).toContain(`$fenced$`)
    expect(await render_markdown(`$x$`, { math: true })).toContain(`<span class="katex">`)
  })

  test(`live examples register source before imports resolve and hide only real script/style blocks`, async () => {
    const instance = markdown_vite({ examples: { hide_style: true } })
    const source =
      '<script module>export const value = 1</script>\n\n```svelte example id="test"\n<script>let count = 0</script>\n<button onclick={() => count++}>{count}</button>\n<style>button { color: red }</style>\n```'
    const result = await preprocess(source, instance.preprocess, {
      filename: `/project/page.md`,
    })
    compile(result.code, { generate: false })
    expect(result.code).not.toContain(`__live_example_src`)
    expect(result.code).not.toContain(`button { color: red }`)
    expect(result.code).toContain(`<script>import`)
    const load = instance.plugin.load
    if (typeof load !== `function`) throw new Error(`Expected load hook`)
    const module_id = /"(?<id>\/project\/page\.md\.widgets-example-[^"]+)"/u.exec(
      result.code,
    )?.[1]
    if (!module_id) throw new Error(`Missing example import`)
    const loaded = await load.call({} as never, module_id)
    expect(loaded).toMatchObject({
      code: expect.stringContaining(`button { color: red }`),
      map: { sourcesContent: [expect.stringContaining(`button { color: red }`)] },
    })
    expect(await load.call({} as never, `${module_id}?svelte&type=style`)).toBeUndefined()
    await preprocess(`# Removed`, instance.preprocess, { filename: `/project/page.md` })
    expect(() => load.call({} as never, module_id)).toThrow(`not registered`)
  })

  test(`CSR examples use dynamic imports, ordinary code fences do not create components`, async () => {
    const result = await compile_page(
      '```svelte example csr\n<p>Hello</p>\n```\n\n```js example\nconst value = 1\n```',
      { examples: {} },
    )
    expect(result.examples).toHaveLength(1)
    expect(result.code).toContain(`{#await import(`)
    expect(result.code).not.toContain(`import WidgetsLiveExample`)
    await expect(
      preprocess('```svelte example\n<p>Hi</p>\n```', markdown({ examples: {} }), {
        filename: `page.md`,
      }),
    ).rejects.toThrow(`markdown_vite`)
  })

  test.each([
    `example csr="yes"`,
    `example hide_style=1`,
    `example wrapper=[1,2]`,
    `example wrapper=["pkg","not-valid-name"]`,
    `example malformed=[no]`,
    `example invalid!`,
    `example id=1`,
    `example id=""`,
    `example id="a" id="b"`,
  ])(`rejects invalid example options %s`, async (meta) => {
    await expect(
      compile_markdown(`\`\`\`svelte ${meta}\n<p>Hello</p>\n\`\`\``, { examples: {} }),
    ).rejects.toThrow(`document.md:`)
  })

  test(`concurrent highlighting keeps source order and deduplicates wrappers`, async () => {
    const slow = Promise.withResolvers<string>()
    const second = Promise.withResolvers<undefined>()
    const source =
      '```svelte example\n<p>First</p>\n```\n\n```svelte example\n<p>Second</p>\n```'
    const pending = compile_page(source, {
      examples: {},
      highlight: (code) => {
        if (code.includes(`First`)) return slow.promise
        second.resolve(undefined)
        return `<b>Second</b>`
      },
    })
    await second.promise
    slow.resolve(`<b>First</b>`)
    const result = await pending
    expect(result.examples.map(({ source: example_source }) => example_source)).toEqual([
      `<p>First</p>`,
      `<p>Second</p>`,
    ])
    expect(result.code.match(/import \{ CodeExample as/gu)).toHaveLength(1)
    expect(result.code.indexOf(result.examples[0].id)).toBeLessThan(
      result.code.indexOf(result.examples[1].id),
    )
  })

  test(`fence metadata handles delimiters and escaped quotes inside JSON values`, async () => {
    const result = await compile_page(
      '```svelte example wrapper=["./Wrapper].svelte", "Wrapper"] id="quoted\\\" id"\n<p>Example</p>\n```',
      { examples: {} },
    )
    expect(result.code).toContain(`from "./Wrapper].svelte"`)
    expect(result.examples).toHaveLength(1)
  })
})

describe(`incremental Markdown compilation`, () => {
  const fence = (code: string, meta = ``) =>
    `\`\`\`svelte example ${meta}\n${code}\n\`\`\``

  test(`hot updates ignore unrelated and deleted inputs while retrying failed pages`, async () => {
    const docs = markdown_vite({ examples: {} })
    const update = docs.plugin.hotUpdate
    const remove = docs.plugin.watchChange
    if (typeof update !== `function` || typeof remove !== `function`)
      throw new Error(`Expected Vite hooks`)
    const source = fence(`<p>Fixed example</p>`, `id="fixed"`)
    const read = vi.fn(async () => source)
    const environment = {
      moduleGraph: { idToModuleMap: new Map(), invalidateModule: vi.fn() },
    }
    const hot_update = (file: string, type = `update`) =>
      update.call(
        { environment } as never,
        { file, type, read, modules: [], timestamp: 1 } as never,
      )
    await expect(
      hot_update(`/project/.svelte-kit/__package__/markdown/readme.md`),
    ).resolves.toBeUndefined()
    expect(read).not.toHaveBeenCalled()

    const filename = `/project/failed.md`
    await expect(
      preprocess(fence(`<p>Broken metadata</p>`, `id=""`), docs.preprocess, { filename }),
    ).rejects.toThrow(`Code fence option id`)
    await expect(hot_update(filename)).resolves.toEqual([])
    expect(read).toHaveBeenCalledOnce()
    const fixed = await preprocess(source, docs.preprocess, { filename })
    expect(fixed.code).toContain(`widgets-example-`)

    read.mockClear()
    await expect(hot_update(filename, `delete`)).resolves.toBeUndefined()
    await remove.call({} as never, filename, { event: `delete` })
    await expect(hot_update(filename)).resolves.toBeUndefined()
    expect(read).not.toHaveBeenCalled()
  })

  test(`development prose modules preserve parent code and keep authored scope and styles`, async () => {
    const docs = markdown_vite({ examples: {} })
    const configure = docs.plugin.configResolved
    const load = docs.plugin.load
    if (typeof configure !== `function` || typeof load !== `function`)
      throw new Error(`Expected Vite hooks`)
    await configure.call({} as never, { command: `serve`, isProduction: false } as never)
    const render = (source: string) =>
      preprocess(source, docs.preprocess, { filename: `/project/page.md` })
    const example = fence(`<p>Example</p>`, `id="example"`)
    const initial = await render(example)
    const edited = await render(
      `# Added heading\n\nNew paragraph\n\n\`\`\`js\nconst value = 1\n\`\`\`\n\n${example}`,
    )
    expect(edited.code).toBe(initial.code)
    const ids = [
      ...edited.code.matchAll(/"(?<id>[^"\n]+\.widgets-prose-\d+\.svelte)"/gu),
    ].map((match) => match[1])
    expect(ids.length).toBeGreaterThan(0)
    const prose = await Promise.all(ids.map(async (id) => load.call({} as never, id)))
    expect(prose).toContainEqual(
      expect.objectContaining({
        code: expect.stringContaining(`<h1 id="added-heading">Added heading</h1>`),
      }),
    )
    for (const module of prose) {
      if (!module || typeof module === `string`) throw new Error(`Expected source module`)
      compile(module.code, { generate: false })
    }
    const dynamic = await render(
      `<script>const title = "Scoped"</script>\n\n# {title}\n\n${example}`,
    )
    expect(dynamic.code).toContain(`<h1>{title}</h1>`)
    const styled = await render(`<style>p { color: red }</style>\n\nText\n\n${example}`)
    expect(styled.code).not.toContain(`widgets-prose-`)
    expect(styled.code).toContain(`<p>Text</p>`)
    const configured = await render(
      `<svelte:options runes={true} />\n\nText\n\n${example}`,
    )
    expect(configured.code).not.toContain(`widgets-prose-`)
  })

  test.each([`C:/project/page.md`, `C:\\project\\page.md`])(
    `deleting %s removes registered modules and cached compilations`,
    async (filename) => {
      const docs = markdown_vite({ examples: {} })
      const load = docs.plugin.load
      const remove = docs.plugin.watchChange
      if (typeof load !== `function` || typeof remove !== `function`)
        throw new Error(`Expected Vite hooks`)
      const source = fence(`<p>Example</p>`, `id="example"`)
      const render = () => preprocess(source, docs.preprocess, { filename })
      const result = await render()
      const id = /"(?<id>C:\/[^"\n]+\.widgets-example-[^"\n]+)"/u.exec(result.code)?.[1]
      if (!id) throw new Error(`Missing example module`)
      expect(await load.call({} as never, id)).toMatchObject({ code: `<p>Example</p>` })
      await remove.call({} as never, filename, { event: `delete` })
      expect(() => load.call({} as never, id)).toThrow(`not registered`)
      await render()
      expect(await load.call({} as never, id)).toMatchObject({ code: `<p>Example</p>` })
    },
  )

  test(`shares pending work beyond cache capacity and does not repopulate a closed cache`, async () => {
    const first = Promise.withResolvers<string>()
    const second = Promise.withResolvers<string>()
    const highlight = vi.fn((code: string) =>
      code === `first` ? first.promise : second.promise,
    )
    const docs = markdown_vite({ highlight, highlight_cache_size: 1 })
    const render = (code: string, filename: string) =>
      preprocess(`\`\`\`txt\n${code}\n\`\`\``, docs.preprocess, { filename })
    const requests = [
      render(`first`, `first.md`),
      render(`second`, `second.md`),
      render(`first`, `third.md`),
    ]
    await vi.waitFor(() => expect(highlight).toHaveBeenCalledTimes(2))
    const close = docs.plugin.closeBundle
    if (typeof close !== `function`) throw new Error(`Expected closeBundle hook`)
    await close.call({} as never)
    first.resolve(`first`)
    second.resolve(`second`)
    await Promise.all(requests)
    await render(`first`, `first.md`)
    expect(highlight).toHaveBeenCalledTimes(3)
  })

  test(`example identities survive prose, preceding fences and explicit-id edits`, async () => {
    const source = fence(`<p>Original</p>`)
    const initial = await compile_page(source, { examples: {} })
    const edited = await compile_page(
      `# New prose\n\n${fence(`<b>New example</b>`)}\n\n${source}`,
      { examples: {} },
    )
    expect(edited.examples[1].id).toBe(initial.examples[0].id)
    const duplicates = await compile_page(`${source}\n\n${source}`, { examples: {} })
    expect(new Set(duplicates.examples.map(({ id }) => id)).size).toBe(2)
    const named = await compile_page(fence(`<p>First</p>`, `id="counter"`), {
      examples: {},
    })
    const renamed = await compile_page(fence(`<p>Changed</p>`, `id="counter"`), {
      examples: {},
    })
    expect(renamed.examples[0].id).toBe(named.examples[0].id)
    await expect(
      compile_page(
        `${fence(`<p>First</p>`, `id="counter"`)}\n\n${fence(`<p>Second</p>`, `id="counter"`)}`,
        { examples: {} },
      ),
    ).rejects.toThrow(`Duplicate example id: counter`)
  })

  test(`shares concurrent highlight work, reuses unchanged fences, and evicts least-recently-used entries`, async () => {
    const highlight = vi.fn(
      async (code: string, language: string) => `${language}:${code}`,
    )
    const docs = markdown_vite({ highlight, highlight_cache_size: 2 })
    const render = (code: string, filename = `page.md`) =>
      preprocess(`\`\`\`txt\n${code}\n\`\`\``, docs.preprocess, { filename })
    await Promise.all([render(`first`), render(`first`, `other.md`)])
    expect(highlight).toHaveBeenCalledTimes(1)
    await render(`second`)
    await render(`first`)
    await render(`third`)
    await render(`second`)
    expect(highlight.mock.calls.map(([code]) => code)).toEqual([
      `first`,
      `second`,
      `third`,
      `second`,
    ])
    await preprocess(`# Prose changed\n\n\`\`\`txt\nsecond\n\`\`\``, docs.preprocess, {
      filename: `page.md`,
    })
    expect(highlight).toHaveBeenCalledTimes(4)
    const close = docs.plugin.closeBundle
    if (typeof close !== `function`) throw new Error(`Expected closeBundle hook`)
    await close.call({} as never)
    await render(`second`)
    expect(highlight).toHaveBeenCalledTimes(5)
  })

  test(`retries rejected highlights and validates cache configuration`, async () => {
    const highlight = vi
      .fn()
      .mockRejectedValueOnce(new Error(`temporary failure`))
      .mockResolvedValue(`ok`)
    const docs = markdown_vite({ highlight })
    const source = '```txt\nsource\n```'
    const render = () => preprocess(source, docs.preprocess, { filename: `page.md` })
    await expect(render()).rejects.toThrow(`temporary failure`)
    const update = docs.plugin.hotUpdate
    if (typeof update !== `function`) throw new Error(`Expected hotUpdate hook`)
    const environment = { moduleGraph: { idToModuleMap: new Map() } }
    await update.call(
      { environment } as never,
      {
        file: `page.md`,
        type: `update`,
        read: async () => source,
        modules: [],
        timestamp: 0,
      } as never,
    )
    await expect(render()).resolves.toMatchObject({ code: expect.stringContaining(`ok`) })
    expect(highlight).toHaveBeenCalledTimes(2)
    for (const value of [-1, 1.5, Infinity, NaN])
      expect(() => markdown_vite({ highlight_cache_size: value })).toThrow(
        `highlight_cache_size`,
      )
    const uncached = markdown_vite({ highlight, highlight_cache_size: 0 })
    await preprocess('```txt\nsource\n```\n\n```txt\nsource\n```', uncached.preprocess, {
      filename: `other.md`,
    })
    expect(highlight).toHaveBeenCalledTimes(4)
  })
})

describe(`document pipeline`, () => {
  test(`published documents and emitted artifacts own deeply immutable data`, async () => {
    const input = { title: `Guide`, nested: { tags: [`original`] } }
    const engine = create_markdown({ examples: {}, validate_frontmatter: () => input })
    const document = assert_ok(
      await engine.parse(`# Heading\n\n\`\`\`svelte example\n<p>Demo</p>\n\`\`\``),
    )
    input.nested.tags.push(`external`)
    expect(document.metadata.nested.tags).toEqual([`original`])
    expect(document.metadata).toBe(document.manifest.metadata)
    expect(Object.isFrozen(document)).toBe(true)
    expect(Reflect.set(document.metadata.nested.tags, `0`, `changed`)).toBe(false)
    expect(Reflect.set(document.manifest.headings[0], `text`, `changed`)).toBe(false)
    expect(Reflect.set(document.manifest.headings[0].range.start, `offset`, 100)).toBe(
      false,
    )
    expect(Reflect.set(document.manifest.fences[0].line_positions[0], `line`, 100)).toBe(
      false,
    )
    expect(() =>
      Reflect.apply(Array.prototype.pop, document.manifest.headings, []),
    ).toThrow(TypeError)
    const first = assert_ok(await compile_document(document))
    expect(Reflect.set(first, `code`, `changed`)).toBe(false)
    expect(Reflect.set(first.map.sources, `0`, `changed`)).toBe(false)
    expect(Reflect.set(first.examples[0], `source`, `changed`)).toBe(false)
    const second = assert_ok(await compile_document(document))
    expect(second).toEqual(first)
    expect(second.manifest).toBe(document.manifest)
    expect(second.metadata).toBe(document.metadata)
    expect(second.manifest.headings[0].text).toBe(`Heading`)
    expect(second.code).toContain(`<h1 id="heading">Heading</h1>`)
  })

  test(`decoded maps preserve gaps, duplicate columns, other sources, and signed deltas`, () => {
    const decoded = decode_source_map(`AAAA,AACA,C;ACCA,EDDA;`)
    expect(original_position(decoded, 0, -1)).toBeUndefined()
    expect(original_position(decoded, 0, 0)).toEqual({ line: 1, column: 0 })
    expect(original_position(decoded, 0, 1)).toBeUndefined()
    expect(original_position(decoded, 1, 0)).toBeUndefined()
    expect(original_position(decoded, 1, 2)).toEqual({ line: 1, column: 0 })
    expect(original_position(decoded, 1, 100)).toEqual({ line: 1, column: 0 })
    expect(original_position(decoded, 2, 0)).toBeUndefined()
    expect(original_position(decoded, 3, 0)).toBeUndefined()
    for (const mappings of [`!`, `g`, `AA`, `D`])
      expect(() => decode_source_map(mappings)).toThrow(/source-map/u)
  })

  test(`deferred rendering owns its options, including nested math and citation data`, async () => {
    const katex = await import('katex')
    const macros: Record<string, string | object> = { '\\value': `x` }
    katex.renderToString(`\\gdef\\stored{z}`, { macros })
    const options = {
      typography: false,
      math: { macros, trust: () => false },
      references: {
        bibliography: {
          paper: { title: `Original paper`, authors: [`Original author`] },
        },
      },
      highlight: vi.fn(async () => `original highlight`),
    }
    const engine = create_markdown(options)
    const source = `"Hello" $\\value$ $\\stored$ [@paper]\n\n\`\`\`txt\ncode\n\`\`\``
    const first = assert_ok(await engine.parse(source, { dialect: `markdown` }))
    options.typography = true
    options.math.macros[`\\value`] = `y`
    options.references.bibliography.paper.title = `Changed paper`
    options.references.bibliography.paper.authors[0] = `Changed author`
    const original_highlight = options.highlight
    options.highlight = vi.fn(async () => `changed highlight`)
    const second = assert_ok(await engine.parse(source, { dialect: `markdown` }))
    const first_html = assert_ok(await render_document(first))
    const second_html = assert_ok(await render_document(second))
    for (const text of [
      `&quot;Hello&quot;`,
      `Original paper`,
      `Original author`,
      `original highlight`,
      `>x</span>`,
      `>z</span>`,
    ])
      expect(first_html).toContain(text)
    for (const text of [
      `“Hello”`,
      `Changed paper`,
      `Changed author`,
      `changed highlight`,
      `>y</span>`,
    ])
      expect(second_html).toContain(text)
    expect(original_highlight).toHaveBeenCalledTimes(1)
    expect(options.highlight).toHaveBeenCalledTimes(1)
  })

  test(`analysis defers highlighting and emission is shared across concurrent callers`, async () => {
    const highlight = vi.fn(async (code: string) => code)
    const engine = create_markdown({
      highlight,
      examples: {},
      validate_frontmatter: (metadata) => ({ title: String(metadata.title) }),
    })
    const document = assert_ok(
      await engine.parse(
        '---\ntitle: Guide\n---\n# Guide\n\n```svelte example id="demo"\n<p>Demo</p>\n```',
        { filename: 'guide.md' },
      ),
    )
    expect(highlight).not.toHaveBeenCalled()
    expect(document.manifest.fences).toHaveLength(1)
    expect(document.metadata).toEqual({ title: `Guide` })
    const results = await Promise.all([
      compile_document(document),
      compile_document(document),
    ])
    expect(highlight).toHaveBeenCalledTimes(1)
    for (const result of results) {
      const output = assert_ok(result)
      expect(output.manifest).toBe(document.manifest)
      expect(output.examples).toHaveLength(1)
      expect(output.code).toContain('<h1 id="guide">Guide</h1>')
    }
    const bad = await engine.parse('```svelte example csr="yes"\n<p/>\n```', {
      filename: 'bad.md',
    })
    expect(bad).toMatchObject({
      ok: false,
      diagnostics: [{ code: `fence`, range: { start: { filename: `bad.md`, line: 1 } } }],
    })
    expect(highlight).toHaveBeenCalledTimes(1)
    expect(() => assert_ok(bad)).toThrow(DiagnosticError)
  })

  test(`dialects fail explicitly and highlighter failures retain every fence range`, async () => {
    const engine = create_markdown({
      highlight: () => {
        throw new Error(`Highlight unavailable`)
      },
    })
    const source = '```js\none\n```\n\n```js\ntwo\n```'
    const document = assert_ok(await engine.parse(source, { filename: `broken.md` }))
    const output = await compile_document(document)
    expect(output.ok).toBe(false)
    expect(
      output.diagnostics.map(({ code, range }) => [
        code,
        range.start.line,
        range.end.offset,
      ]),
    ).toEqual([
      [`highlight`, 1, 13],
      [`highlight`, 5, source.length],
    ])
    expect(await render_document(document)).toMatchObject({
      ok: false,
      diagnostics: [{ code: `dialect` }],
    })
    const html_document = assert_ok(
      await create_markdown().parse(`# Title {literal}`, { dialect: `markdown` }),
    )
    expect(assert_ok(await render_document(html_document))).toContain(
      `&#123;literal&#125;`,
    )
    expect(await compile_document(html_document)).toMatchObject({
      ok: false,
      diagnostics: [{ code: `dialect` }],
    })
  })

  test.each([
    ['{name} and {name}', [0, 11]],
    ['> {name}\n>\n> {name}', [2, 13]],
    ['`{name}` then {name}', [14]],
    ['[Link]({name}) ![Image]({name})', [7, 24]],
  ])(`maps each authored expression separately in %s`, async (source, offsets) => {
    const document = assert_ok(
      await create_markdown().parse(source, { filename: `repeated.md` }),
    )
    const output = assert_ok(await compile_document(document))
    const matches = [...output.code.matchAll(/\{name\}/gu)]
    expect(matches).toHaveLength(offsets.length)
    expect(output.map).toEqual(
      source_map(
        source,
        output.code,
        `repeated.md`,
        matches.map((match, idx) => ({
          generated: match.index,
          original: offsets[idx],
          length: 6,
        })),
      ),
    )
  })
})

test.each([`---\n`, `---  \r\n`, `\uFEFF---  \r\n`])(
  `YAML diagnostic offsets preserve the authored header %j`,
  async (header) => {
    const source = `${header}title: one\r\ntitle: two\r\n---\r\n# Page`
    const result = await create_markdown().parse(source, { filename: `metadata.md` })
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        {
          code: `frontmatter`,
          range: {
            start: {
              filename: `metadata.md`,
              line: 3,
              column: 1,
              offset: source.indexOf(`title: two`),
            },
          },
        },
      ],
    })
  },
)
