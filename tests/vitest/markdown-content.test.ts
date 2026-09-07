import {
  assert_ok,
  create_markdown,
  compile_markdown as emit_document,
  render_markdown,
  content_toc,
  content_search_record,
  validate_content,
  assert_valid_content,
} from '$lib/markdown'
import { compile_source as compile_markdown } from './markdown-helpers'
import { describe, expect, test } from 'vitest'

const document_manifest = async (source: string, filename = `/guide.md`) =>
  (await compile_markdown(source, { filename })).manifest

describe(`Markdown content manifests`, () => {
  test(`extracts nested content once with original positions and rendered heading IDs`, async () => {
    const source = `---\r\ntitle: Guide\r\n---\r\n# Hello **world**\r\n\r\n> ## Hello world\r\n>\r\n> \`\`\`ts\r\n> const value = 1\r\n> \`\`\`\r\n\r\n- [Next][next]\r\n\r\n  \`\`\`ts\r\n  const value = 1\r\n  \`\`\`\r\n\r\n![Plot](./plot%20one.svg)\r\n\r\n[next]: ./next.md#target\r\n\r\n<div id="hello-world"></div>\r\n<h2>Raw &amp; title</h2>\r\n<pre><h2 id="ignored">Not a heading</h2></pre>`
    const result = await compile_markdown(source, { filename: `/guide.md` })
    const { manifest } = result
    expect(manifest.metadata).toEqual({ title: `Guide` })
    expect(manifest.headings.map(({ id }) => id)).toEqual([
      `hello-world-1`,
      `hello-world-2`,
      `raw-title`,
    ])
    for (const { id } of manifest.headings) expect(result.code).toContain(`id="${id}"`)
    expect(manifest.links).toMatchObject([
      { url: `./next.md#target`, range: { start: { line: 12, column: 3 } } },
    ])
    expect(manifest.assets).toMatchObject([{ url: `./plot%20one.svg` }])
    expect(manifest.fences).toMatchObject([
      {
        language: `ts`,
        code: `const value = 1`,
        range: { start: { line: 8, column: 3 } },
        code_range: { start: { line: 9, column: 3 } },
      },
      {
        language: `ts`,
        code: `const value = 1`,
        range: { start: { line: 14, column: 3 } },
        code_range: { start: { line: 15, column: 3 } },
      },
    ])
    for (const fence of manifest.fences)
      expect(
        source.slice(
          fence.code_range.start.offset,
          fence.code_range.start.offset + fence.code.length,
        ),
      ).toBe(fence.code)
    expect(content_toc(manifest)).toEqual(manifest.headings)
    expect(content_search_record(manifest)).toMatchObject({
      title: `Guide`,
      filename: `/guide.md`,
    })
    expect(manifest.text).not.toContain(`const value`)
  })

  test(`validates normalized metadata and reports callback failures with a filename`, async () => {
    const validate_frontmatter = (metadata: Record<string, unknown>) => {
      if (typeof metadata.title !== `string`) throw new Error(`title must be a string`)
      return { ...metadata, title: metadata.title.trim() }
    }
    const result = await compile_markdown(`---\ntitle: '  Guide  '\n---\n# Title`, {
      validate_frontmatter,
    })
    expect(result.metadata.title).toBe(`Guide`)
    expect(result.manifest.metadata).toBe(result.metadata)
    await expect(
      compile_markdown(`# Title`, { filename: `bad.md`, validate_frontmatter }),
    ).rejects.toThrow(`bad.md:1:1 [frontmatter] title must be a string`)
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    const invalid = await create_markdown({ validate_frontmatter: () => cyclic }).parse(
      `# Title`,
    )
    expect(invalid).toMatchObject({ ok: false, diagnostics: [{ code: `frontmatter` }] })
  })

  test(`uses rendered text and ignores dynamic links and markup inside code`, async () => {
    const result = await compile_markdown(
      `<script>let value = 'dynamic'</script>\n\n# Hello {value} **world**\n\n[Dynamic](/docs/{value})\n\n<div title="id='fake' src='fake.png'" data-id="fake"></div>\n<pre><span id="hello-world"></span></pre>\n<h2 id="a&amp;b">Explicit</h2>\n\n# A b\n\nText with **bold** and \`code\`.\n\n- Unique **list** content\n\n| Heading |\n| --- |\n| Unique table content |`,
    )
    expect(result.manifest.headings.map(({ id }) => id)).toEqual([
      `hello-world-1`,
      `a&b`,
      `a-b`,
    ])
    expect(result.manifest.assets).toEqual([])
    expect(result.manifest.anchors.map(({ id }) => id)).not.toContain(`fake`)
    expect(result.manifest.links[0].url).toBe(`/docs/{value}`)
    expect(result.manifest.links[0].dynamic).toBe(true)
    expect(validate_content([result.manifest])).toEqual([])
    expect(content_search_record(result.manifest).text).toContain(
      `Text with bold and code.`,
    )
    expect(result.manifest.text.match(/Unique list content/gu)).toHaveLength(1)
    expect(result.manifest.text.match(/Unique table content/gu)).toHaveLength(1)
    expect(result.code).toContain(`id="hello-world-1"`)
  })

  test(`plain Markdown keeps literal braces in headings, IDs, links, and search text`, async () => {
    const source = `<h2>Set {x}</h2>\n<h2 id="set{x}">Explicit</h2>\n\n[Jump](#set%7Bx%7D)\n\n<a href="./missing{literal}.md">Broken {link}</a>\n\n[Broken {link}](./missing{literal}.md)\n\n![Plot](./plot{literal}.svg)`
    const document = assert_ok(
      await create_markdown().parse(source, { dialect: `markdown` }),
    )
    const { manifest } = document
    expect(manifest.headings.map(({ id, text }) => ({ id, text }))).toEqual([
      { id: `set-x`, text: `Set {x}` },
      { id: `set{x}`, text: `Explicit` },
    ])
    expect(assert_ok(await render_markdown(document))).toContain(
      `<h2 id="set-x">Set {x}</h2>`,
    )
    expect(manifest.links).toHaveLength(3)
    expect(manifest.links[2].text).toBe(`Broken {link}`)
    expect(manifest.text).toContain(`Broken {link}`)
    expect(validate_content([manifest], { assets: [] }).map(({ code }) => code)).toEqual([
      `missing_document`,
      `missing_document`,
      `missing_asset`,
    ])
  })

  test.each([
    { value: Infinity },
    { value: NaN },
    { value: undefined },
    { value: () => `lost` },
    { value: new Date(0) },
    { value: new Map() },
    { value: { toJSON: () => `changed` } },
  ])(`rejects validator output that JSON cannot preserve: %j`, async (metadata) => {
    const result = await create_markdown({ validate_frontmatter: () => metadata }).parse(
      `# Title`,
    )
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: `frontmatter` }] })
  })

  test.each([`style`, `script`, `textarea`, `title`])(
    `reserves the %s element's own ID while ignoring its raw contents`,
    async (tag) => {
      const result = await compile_markdown(
        `# Title\n\n<${tag} id="title">${tag === `script` || tag === `style` ? `` : `<h2 id="fake">Fake</h2>`}</${tag}>`,
      )
      expect(result.manifest.headings.map(({ id }) => id)).toEqual([`title-1`])
      expect(result.manifest.anchors.map(({ id }) => id)).toEqual([`title`, `title-1`])
      expect(result.code).toContain(`<h1 id="title-1">Title</h1>`)
    },
  )

  test.each([`/docs/`, `C:\\docs\\`])(
    `resolves encoded links against literal file inventories under %s`,
    async (directory) => {
      const guide = await document_manifest(
        `[Percent](./100%25.md#target) [Hash](./a%23b.md)\n\n![Plot](./100%25.svg)`,
        `${directory}guide.md`,
      )
      const target = await document_manifest(`# Target`, `${directory}100%.md`)
      const hash = await document_manifest(`# Hash`, `${directory}a#b.md`)
      expect(
        validate_content([guide, target, hash], {
          assets: [`${directory}100%.svg`],
        }),
      ).toEqual([])
    },
  )

  test(`checks cross-document fragments, assets, duplicate anchors and invalid URLs`, async () => {
    const guide = await document_manifest(
      `# Guide\n\n[Next](./next.md#target) [Home](#guide) [External](https://example.org/missing)\n\n![Image](./plot%20one.svg)`,
    )
    const next = await document_manifest(`# Target`, `/next.md`)
    expect(validate_content([guide, next], { assets: [`/plot one.svg`] })).toEqual([])
    const duplicates = await Promise.all(
      [`/guide.html`, `/guide/index.svx`].map((filename) =>
        document_manifest(`# Other`, filename),
      ),
    )
    const origin = { filename: `/guide.md`, line: 1, column: 1, offset: 0 }
    expect(validate_content([guide, ...duplicates, next])).toEqual(
      duplicates.map(({ filename }) => ({
        code: `duplicate_document`,
        message: `Duplicate document route /guide`,
        severity: `error`,
        range: { start: { ...origin, filename }, end: { ...origin, filename } },
        related: [{ message: `First document`, range: { start: origin, end: origin } }],
      })),
    )
    const broken = await document_manifest(
      `<div id="duplicate"></div>\n<div id="duplicate"></div>\n<div id="duplicate"></div>\n\n[Lost](#absent) [Missing](missing.md) [Invalid](./%zz)\n\n![Absent](missing.png)`,
    )
    const diagnostics = validate_content([broken], { assets: [] })
    expect(diagnostics.map(({ message }) => message)).toEqual([
      `Duplicate anchor #duplicate`,
      `Duplicate anchor #duplicate`,
      `Missing fragment #absent in /guide.md`,
      `Missing document /missing.md`,
      `Invalid URL "./%zz"`,
      `Missing asset /missing.png`,
    ])
    expect(diagnostics.map(({ code }) => code)).toEqual([
      `duplicate_anchor`,
      `duplicate_anchor`,
      `missing_fragment`,
      `missing_document`,
      `invalid_url`,
      `missing_asset`,
    ])
    expect(diagnostics.slice(0, 2)).toMatchObject(
      broken.anchors.slice(1).map(({ range }) => ({
        range,
        related: [{ range: broken.anchors[0].range }],
      })),
    )
    expect(() => assert_valid_content([broken], { assets: [] })).toThrow(`/guide.md:2:`)
  })

  test.each([
    [`> - \`\`\`js\n>   first()\n>   second()\n>   \`\`\``, [2, 3], [5, 5]],
    [`\`\`\`js\nfirst()\n\`\`\`\n\n\`\`\`js\nfirst()\n\`\`\``, [2], [1]],
    [`\`\`\`js\n\`\`\``, [2], [1]],
    [`- \`\`\`js\n\tconst value = 1\n\t\`\`\``, [2], [1]],
    [`- \`\`\`txt\n\t\\|\n\t\`\`\``, [2], [1]],
    [`- \`\`\`txt\n\tone\n\tlonger\tline\n\tone\n\t\`\`\``, [2, 3, 4], [1, 1, 1]],
    [`- \`\`\`txt\n   \talpha\tb\n   \`\`\``, [2], [3]],
  ])(`maps fence lines in %s`, async (source, lines, columns) => {
    const { fences } = await document_manifest(source)
    expect(fences[0].line_positions.map(({ line }) => line)).toEqual(lines)
    expect(fences[0].line_positions.map(({ column }) => column)).toEqual(columns)
  })

  test.each([
    `test="quoted\\" assertion"`,
    `test="two  spaces"`,
    `check title="back\\\\slash"`,
  ])(`preserves authored JSON metadata %s in nested fences`, async (info) => {
    const { fences } = await document_manifest(
      `> \`\`\`js ${info}\n> const value = 1\n> \`\`\``,
    )
    expect(fences[0]).toMatchObject({ language: `js`, info })
  })

  test.each([
    [`- first\n\t[Link](next.md)`, 2, 2],
    [`| some \\| text [Link](next.md) |\n|---|\n| body |`, 1, 16],
  ])(
    `maps links through normalized container text in %s`,
    async (source, line, column) => {
      const manifest = await document_manifest(source)
      expect(manifest.links).toMatchObject([
        { url: `next.md`, range: { start: { line, column } } },
      ])
      expect(source.slice(manifest.links[0].range.start.offset)).toMatch(/^\[Link\]/u)
    },
  )
})

test(`analyzes typed fence settings once, including defaults and explicit false`, async () => {
  const engine = create_markdown({ examples: { collapsible: true, hide_style: true } })
  const source =
    '```svelte example check test="counter" collapsible=false id="demo"\n<p>Example</p>\n```'
  const document = assert_ok(await engine.parse(source))
  const { settings } = document.manifest.fences[0]
  expect(settings).toEqual({
    example: true,
    check: true,
    test: `counter`,
    collapsible: false,
    hide_style: true,
    id: `demo`,
  })
  expect(Object.isFrozen(settings)).toBe(true)
  const output = assert_ok(await emit_document(document))
  expect(output.manifest.fences[0].settings).toBe(settings)
  expect(output.code).toContain('"collapsible":false')
})

test.each([
  `unsupported`,
  `check="yes"`,
  `test=true`,
  `collapsible=1`,
  `id=" "`,
  `wrapper=["", "Wrapper"]`,
])(
  `rejects invalid settings during analysis without enabling rendering: %s`,
  async (info) => {
    const result = await create_markdown().parse(`\n\n\`\`\`js ${info}\nx\n\`\`\``, {
      filename: `settings.md`,
    })
    expect(result).toMatchObject({
      ok: false,
      diagnostics: [
        { code: `fence`, range: { start: { filename: `settings.md`, line: 3 } } },
      ],
    })
  },
)
