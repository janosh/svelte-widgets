/* oxlint-disable no-template-curly-in-string -- Literal JavaScript and Svelte fixtures. */
import { compile_markdown, markdown, render_markdown } from '$lib/markdown'
import { markdown_vite } from '$lib/markdown/vite'
import { source_map } from '$lib/markdown/source-map'
import { compile, preprocess } from 'svelte/compiler'
import { describe, expect, test } from 'vitest'

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
      [`<h1>Title</h1>`, `<strong>bold</strong>`, `<em>em</em>`, `<del>gone</del>`],
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
      `---\ntitle: "A </script> title"\ndate: 2026-09-06\nflags: [true, false]\n---\n<script module>export const answer = 42</script>\n<script>let value = 1</script>\n\n# {title} {value}`,
    )
    expect(result.metadata).toEqual({
      title: `A </script> title`,
      date: `2026-09-06`,
      flags: [true, false],
    })
    expect(result.code.match(/<script module>/gu)).toHaveLength(1)
    expect(result.code).toContain(`export const metadata`)
    expect(result.code).toContain(`const { title, date, flags } = metadata`)
    const empty = await compile_page(`---\n---\n# Empty`)
    expect(empty.metadata).toEqual({})
    expect(empty.code).toContain(`export const metadata`)
  })

  test(`source maps distinguish retained characters from generated markup`, async () => {
    expect(
      source_map(`abc\ndef`, `<p>abc</p>\n<p>def</p>`, `page.md`, [
        { text: `abc`, offset: 0 },
        { text: `def`, offset: 4 },
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
    expect(ambiguous.map.mappings.replaceAll(`;`, ``)).toBe(``)
    expect(
      source_map(`{name}`, `{name} {name}`, `page.md`, [{ text: `{name}`, offset: 0 }])
        .mappings,
    ).toBe(``)
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
    ).toContain(`<h1>Hello</h1>`)
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
    const loaded = await load.call(
      {} as never,
      `/project/page.md.widgets-example-0.svelte`,
    )
    expect(loaded).toMatchObject({
      code: expect.stringContaining(`button { color: red }`),
      map: { sourcesContent: [expect.stringContaining(`button { color: red }`)] },
    })
    expect(
      await load.call(
        {} as never,
        `/project/page.md.widgets-example-0.svelte?svelte&type=style`,
      ),
    ).toBeUndefined()
    await preprocess(`# Removed`, instance.preprocess, { filename: `/project/page.md` })
    expect(() =>
      load.call({} as never, `/project/page.md.widgets-example-0.svelte`),
    ).toThrow(`not registered`)
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
    expect(result.code.indexOf(`WidgetsLiveExample0`)).toBeLessThan(
      result.code.indexOf(`WidgetsLiveExample1`),
    )
  })
})
