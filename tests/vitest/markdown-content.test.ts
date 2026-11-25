import {
  assert_ok,
  create_markdown,
  compile_markdown as emit_document,
  render_markdown,
  content_toc,
  content_search_record,
  validate_content,
  assert_valid_content,
} from '#lib/markdown/index.ts'
import { compile_source as compile_markdown } from './markdown-helpers'
import spec_cases from './fixtures/markdown-spec-cases.json' with { type: 'json' }
import { describe, expect, test } from 'vite-plus/test'

const document_manifest = async (source: string, filename = `/guide.md`) =>
  (await compile_markdown(source, { filename })).manifest

describe(`Markdown content manifests`, () => {
  test.each([
    `> - [Next](/next) `,
    `> - [Next](/next) \n\n`,
    `> > - [Next](/next)  \n\n`,
    `> - [Next](/next)\t\n\n`,
  ])(`maps quoted lists with trailing whitespace: %j`, async (source) => {
    const { code, manifest } = await compile_markdown(source)
    expect(code).toContain(`<li><a href="/next">Next</a></li>`)
    expect(manifest.links).toMatchObject([
      { url: `/next`, range: { start: { line: 1, column: source.indexOf(`[`) + 1 } } },
    ])
  })

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
      if (typeof metadata.title !== `string`)
        throw new TypeError(`title must be a string`)
      return Object.setPrototypeOf(
        {
          ...metadata,
          title: metadata.title.trim(),
          negative_zero: -0,
          nested: Object.setPrototypeOf({ label: `value` }, null),
        },
        null,
      )
    }
    const result = await compile_markdown(`---\ntitle: '  Guide  '\n---\n# Title`, {
      validate_frontmatter,
    })
    expect(result.metadata).toEqual({
      title: `Guide`,
      negative_zero: 0,
      nested: { label: `value` },
    })
    expect(Object.getPrototypeOf(result.metadata)).toBe(Object.prototype)
    expect(Object.getPrototypeOf(result.metadata.nested)).toBe(Object.prototype)
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
    const [escaped] = (await document_manifest(String.raw`[Static](/docs/\{value\})`))
      .links
    expect(escaped.url).toBe(`/docs/{value}`)
    expect(escaped.dynamic).toBeUndefined()
    expect(validate_content([result.manifest])).toEqual([])
    expect(content_search_record(result.manifest).text).toContain(
      `Text with bold and code.`,
    )
    expect(result.manifest.text.match(/Unique list content/gu)).toHaveLength(1)
    expect(result.manifest.text.match(/Unique table content/gu)).toHaveLength(1)
    expect(result.code).toContain(`id="hello-world-1"`)
  })

  test(`a > inside a Svelte expression ends no tag`, async () => {
    const { code, manifest } = await compile_markdown(
      `<h2 onclick={() => go()}>Title</h2>\n\n<Button onclick={() => go()} />\n\n## Later <a onclick={() => go()} aria-hidden="true" href="#later">#</a>\n\n## Last\n\n<img onload={() => go()} src="./pic.png">\n\n<textarea placeholder={a > b} id="notes"></textarea>\n\n<textarea data={[{ x: 1 }].length > 0} id="deep"></textarea>`,
    )
    expect(manifest.headings.map(({ id, text }) => [id, text])).toEqual([
      [`title`, `Title`],
      [`later`, `Later #`],
      [`last`, `Last`],
    ])
    expect(code).toContain(
      `<h2 onclick={() => go()} id="title">Title<a data-heading-anchor`,
    )
    expect(code).toContain(`href="#later">#</a></h2>`)
    // a self-closing <Button /> is no open interactive container
    expect(code).toContain(`<h2 id="last">Last<a data-heading-anchor`)
    expect(manifest.assets.map(({ url }) => url)).toEqual([`./pic.png`])
    expect(manifest.anchors.map(({ id }) => id)).toEqual(
      expect.arrayContaining([`notes`, `deep`]),
    )
  })

  test.each([`markdown`, `svelte`] as const)(
    `link and image text resolves escapes and emphasis in the %s dialect`,
    async (dialect) => {
      const source = `[a \\*b\\* *c* \\{d\\}](/x)\n\n![a \\*b\\* *c* \\{d\\}](/x.png)`
      const { manifest } = assert_ok(await create_markdown().parse(source, { dialect }))
      expect(manifest.links.map(({ text }) => text)).toEqual([`a *b* c {d}`])
      expect(manifest.assets.map(({ text }) => text)).toEqual([`a *b* c {d}`])
    },
  )

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
      `<h2 id="set-x">Set {x}<a data-heading-anchor`,
    )
    // braces in plain HTML attributes cannot hide an authored anchor
    const authored = `## A <a data-x="{" aria-hidden="true" data-y="}">#</a>`
    expect(assert_ok(await create_markdown().render(authored))).not.toContain(
      `data-heading-anchor`,
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
    { value: 1n },
    { value: Symbol(`unsupported`) },
    { value: Array(1) },
    { value: () => `lost` },
    { value: new Date(0) },
    { value: new Map() },
    { value: { toJSON: () => `changed` } },
  ])(`rejects validator output that JSON cannot preserve: %s`, async (metadata) => {
    const result = await create_markdown({ validate_frontmatter: () => metadata }).parse(
      `# Title`,
    )
    expect(result).toMatchObject({ ok: false, diagnostics: [{ code: `frontmatter` }] })
  })

  test.each([`style`, `script`, `textarea`, `title`])(
    `reserves the %s element's own ID while ignoring its raw contents`,
    async (tag) => {
      const result = await compile_markdown(
        `# Title\n\n<${tag} data-x="a > b" id="title">${tag === `script` || tag === `style` ? `` : `<h2 id="fake">Fake</h2>`}</${tag}>`,
      )
      expect(result.manifest.headings.map(({ id }) => id)).toEqual([`title-1`])
      expect(result.manifest.anchors.map(({ id }) => id)).toEqual([`title`, `title-1`])
      expect(result.code).toContain(`<h1 id="title-1">Title<a data-heading-anchor`)
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
    const versioned = await document_manifest(
      `# API\n\n[Missing section](#missing)`,
      `/v1.2`,
    )
    expect(validate_content([versioned], { assets: [] })).toMatchObject([
      { code: `missing_fragment`, message: `Missing fragment #missing in /v1.2` },
    ])
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
    expect(diagnostics.map(({ code, message }) => [code, message])).toEqual([
      [`duplicate_anchor`, `Duplicate anchor #duplicate`],
      [`duplicate_anchor`, `Duplicate anchor #duplicate`],
      [`missing_fragment`, `Missing fragment #absent in /guide.md`],
      [`missing_document`, `Missing document /missing.md`],
      [`invalid_url`, `Invalid URL "./%zz"`],
      [`missing_asset`, `Missing asset /missing.png`],
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
    // the tab after 3 spaces fills one column to the tab stop, and the item strips 2 of the 4,
    // so the code line starts at the third space
    [`- \`\`\`txt\n   \talpha\tb\n   \`\`\``, [2], [3]],
    // a lazy underline keeps its real spaces, padded ahead of them to four
    [`- \`\`\`\n   ---\n  \`\`\``, [2], [3]],
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
    // Marked expands a tab after `>` or a list marker to the next tab stop
    [`>\t[Link](next.md)`, 1, 3],
    [`- >\t[Link](next.md)`, 1, 5],
    // Marked 18.3 also expands one after `> `, and after a fence in a top-level quote
    [`> \t[Link](next.md)`, 1, 4],
    [`> ~~~\n> \tx\n> ~~~\n> \t[Link](next.md)`, 4, 4],
    // after a lazy line, Marked hands a list the quote's later lines with their markers
    [`> - y\nb\n  > [Link](next.md)`, 3, 5],
    [`> - y\nb\n  > - z\nc\n    > [Link](next.md)`, 5, 7],
    // unexpanded, as Marked appends them before its tab pre-pass
    [`> * y\na\n  > x\n> * z\nb\n  >\t[Link](next.md)`, 6, 5],
    // not a later stripped copy of that line (here in an indented code block)
    [`> - y\nb\n  > [Link](next.md)\n>\n>       > [Link](next.md)`, 3, 5],
    // an escaped bracket in an image alt shifts every later offset by its dropped backslash
    [`![a\\]b](i.png) [Link](next.md)`, 1, 16],
    // a lazy continuation line, indented less than the item's content, keeps its tab
    [`10.  a\n\tfoo [Link](next.md)`, 2, 6],
    // a task checkbox's raw ends in a space whatever whitespace follows it
    [`- [ ]\t[Link](next.md)`, 1, 7],
    // a nested list's own tab is expanded by its item, not by the outer one
    [`- a\n\t-\t[Link](next.md)`, 2, 4],
    // the expanded first line must not jump to a later, literal copy of its text
    [`>\ta\n>\n>   a\n> [Link](next.md)`, 4, 3],
    // the table strips only \\| and the image alt only \\]
    [`| ![a\\]\\|b](i.png) [Link](next.md) |\n|---|`, 1, 20],
    // a pipe after an even backslash run separates cells and keeps both backslashes
    [`| a\\\\| [Link](next.md) |\n|---|---|`, 1, 8],
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

  // a tab after a container marker fills to the next multiple of four columns, so its child
  // tokens start with that many spaces, which locate() must map back to the one tab
  test.each([
    `> \tcode`,
    // Marked 18.2+ keeps a tab after `> ` (or after a second space) as a tab
    `>  \tcode`,
    `> - a\n> \tb`,
    `>\t- item`,
    `> >\tcode`,
    `>\t-\t\tcode`,
    `- a\n\n\t-\tb\n\n\t\t[L](n.md)`,
    // Marked doubles the newline after an indented lazy line in its inline text raw
    `> quoted text\n    continued\nlazy`,
    // a later lazy copy of a line must not capture an earlier child
    `> a\n> b\n>\n> c\na\nb\n>\tx`,
    // Marked 18.3 expands a quote's tabs per line until a list item or fence starts a line;
    // the same markers mid-line start nothing
    `> a - b\n> \tcode`,
    '> a ``` b\n> \tcode',
    // each group of quote lines (a lazy line ends one) starts fresh: a list item or fence in
    // an earlier group no longer stops the expansion
    `> a\n> 2) b\nlazy\n> \tc`,
    `> - a\nlazy\n> \tcode`,
    // but lines continuing a group's trailing nested quote stay unexpanded
    `> > a\nlazy\n> > \tb`,
    `> > a\nlazy\n> > \t[L](n.md)`,
    `> > a\nlazy\n> >\t[L](n.md)`,
    `> > a\nlazy\n> > \tb\n> \tc`,
  ])(`renders a tab after a container marker: %j`, async (source) => {
    const result = await create_markdown().render(source, { filename: `/guide.md` })
    expect(result.diagnostics).toEqual([])
  })

  // Marked strips the backslash of \[ and \] in link and image labels before tokenizing them,
  // so locate() must undo that to map their text back to the source (svelte-widgets#476)
  test.each([
    [`[a\\]b](https://example.com)`, `<p><a href="https://example.com">a]b</a></p>`],
    [
      `[arr\\[0\\]](https://example.com)`,
      `<p><a href="https://example.com">arr[0]</a></p>`,
    ],
    [`![alt \\[x\\]](img.png)`, `<p><img src="img.png" alt="alt [x]"></p>`],
    // CommonMark #550 and #194: Marked unescapes the label only, never its closing bracket
    [`[a\\\\](https://example.com)`, `<p><a href="https://example.com">a\\</a></p>`],
    [`[bar\\\\]: /uri\n\n[bar\\\\]`, `<p><a href="/uri">bar\\</a></p>`],
    [
      `[Foo*bar\\]]:my_(url) 'title (with parens)'\n\n[Foo*bar\\]]`,
      `<p><a href="my_(url)" title="title (with parens)">Foo*bar]</a></p>`,
    ],
    // a code span in the label is one unit, so its `]` does not close the label
    [`[\`]\` \\[](/uri)`, `<p><a href="/uri"><code>]</code> [</a></p>`],
    [`![\`]\` \\[](/i.png)`, `<p><img src="/i.png" alt="] ["></p>`],
    // ...but not inside a nested bracket group, which Marked matches first
    [`[[\`[\`]] \\[](/uri)`, `<p><a href="/uri">[<code>[</code>]] [</a></p>`],
    [`![[\`[\`]] \\[](/i.png)`, `<p><img src="/i.png" alt="[[]] ["></p>`],
    // autolinks never pass through outputLink, so their text keeps the backslash
    [
      `<https://x.com/a\\]b>`,
      `<p><a href="https://x.com/a%5C%5Db">https://x.com/a\\]b</a></p>`,
    ],
    // both transforms at once: the tab after `>` and the escaped bracket
    [
      `>\t[a\\]b](https://example.com)`,
      // Marked keeps the two columns the tab fills past `> `
      `<blockquote>\n<p>  <a href="https://example.com">a]b</a></p>\n</blockquote>`,
    ],
  ])(`renders escaped brackets in link and image labels: %s`, async (source, html) => {
    const result = await create_markdown().render(source, { filename: `/guide.md` })
    expect(result).toMatchObject({ ok: true, value: `${html}\n` })
  })
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
  // an unknown key with invalid JSON is a typo, not another tool's text
  `label=Demo`,
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

// a range ends before trailing whitespace, which Marked keeps in nested raws only
test.each([
  [`# H\n\nx`, `# H`],
  [`> # H\n> z`, `# H`],
  [`- # H\n  z`, `# H`],
  [`> H\n> ===\n> z`, `H\n> ===`],
])(`heading range in %j`, async (source, heading) => {
  const { headings } = await document_manifest(source)
  const [{ range }] = headings
  expect(source.slice(range.start.offset, range.end.offset)).toBe(heading)
})

// The inputs of every CommonMark 0.31.2 example and the GFM table, strikethrough and autolink
// examples (spec.commonmark.org, github/cmark-gfm). locate() mirrors Marked's text rewrites, so
// a Marked upgrade that changes one fails here. Frontmatter is not CommonMark, so it is off.
test(`parses every CommonMark and GFM spec example`, async () => {
  const engine = create_markdown({ frontmatter: false })
  const failures: string[] = []
  for (const { markdown, source } of spec_cases) {
    const result = await engine.parse(markdown, {
      filename: `/spec.md`,
      dialect: `markdown`,
    })
    if (!result.ok) failures.push(`${source}: ${result.diagnostics[0]?.message}`)
    // a link starts at `[`, `![`, an autolink's `<`, a bare URL or an HTML href attribute
    else
      for (const { range } of result.value.manifest.links)
        if (!/^(?:[[!<\w]|\s+href=)/u.test(markdown.slice(range.start.offset)))
          failures.push(`${source}: link starts at ${range.start.offset}`)
  }
  expect(failures).toEqual([])
})
