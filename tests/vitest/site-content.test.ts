import type { Builder } from '@sveltejs/kit'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import * as pagefind from 'pagefind'
import { expect, test, vi } from 'vitest'
import { prepare_page, site_adapter } from '../../scripts/site-content.ts'
import { assert_valid_content, validate_content } from '$lib/markdown/content'
import { compile_source, render_source } from './markdown-helpers'

vi.mock(`@sveltejs/adapter-static`, () => ({ default: () => ({ adapt: vi.fn() }) }))
vi.mock(`pagefind`, () => ({ createIndex: vi.fn(), close: vi.fn() }))

const page_html = (content: string) =>
  `<html lang="en"><head><title>Site</title><meta data-pagefind-default-meta="title[content]" content="Fallback"></head><body><main data-pagefind-body>${content}</main></body></html>`

test(`uses rendered anchors, authored locations, and ignores only marked demo links`, async () => {
  const { manifest } = await compile_source(
    `# Guide\n\n[Native](/docs/native#missing)\n\n![Plot](/docs/absent.svg)`,
    { filename: `/project/guide.md` },
  )
  const page = prepare_page(
    page_html(
      `<h1 id="guide">Guide</h1><a href="/docs/native#missing">Native</a><img src="/docs/absent.svg"><a href="/intentional" data-content-ignore>Demo</a><h2 id="duplicate">First</h2>\n<h2 id="duplicate">Second</h2>`,
    ),
    `/docs/guide`,
    `build/guide.html`,
    manifest,
  )
  const native = prepare_page(
    page_html(`<h2 id="native">Native</h2>`),
    `/docs/native`,
    `build/native.html`,
  )
  const diagnostics = validate_content([page.manifest, native.manifest], { assets: [] })
  expect(diagnostics).toMatchObject([
    {
      code: `duplicate_anchor`,
      range: { start: { filename: `build/guide.html`, line: 2 } },
    },
    {
      code: `missing_fragment`,
      range: { start: { filename: `/project/guide.md`, line: 3 } },
    },
    {
      code: `missing_asset`,
      range: { start: { filename: `/project/guide.md`, line: 5 } },
    },
  ])
  const fixed = prepare_page(
    page_html(`<a href="/docs/native#native">Native</a><img src="/docs/plot.svg">`),
    `/docs/guide`,
    `build/guide.html`,
  )
  expect(() =>
    assert_valid_content([fixed.manifest, native.manifest], {
      assets: [`/docs/plot.svg`],
    }),
  ).not.toThrow()
})

test(`enriches metadata and indexes scientific targets once without changing hydration markup`, async () => {
  const source = `---\ntitle: 'Authored <title>'\ndescription: 'A "description"'\ncategories: [Science, Examples]\n---\n# Guide\n\n![Phase diagram](/plot.svg){#fig:plot}\n\n$$ {#eq:energy}\nE = mc^2\n$$\n\nSee [@fig:plot], again [@fig:plot].`
  const options = { math: true, references: true }
  const { manifest } = await compile_source(source, options)
  const html = page_html(
    `<!--[-->${await render_source(source, options)}<details><figure id="hidden"><figcaption>Hidden</figcaption></figure></details><!--]--><script>globalThis.executed = true</script>`,
  )
  const page = prepare_page(html, `/base/science`, `build/science.html`, manifest)
  expect(page.html).toContain(`content="Authored <title>"`)
  expect(page.html).toContain(
    `data-pagefind-meta="description[content]" content="A &quot;description&quot;"`,
  )
  expect(page.html).toContain(
    `data-pagefind-meta="categories[content]" content="Science, Examples"`,
  )
  expect(page.html.slice(page.html.indexOf(`<body>`))).toBe(
    html.slice(html.indexOf(`<body>`)),
  )
  expect(page.indexed_html).not.toContain(`id="fig:plot"`)
  expect(page.indexed_html).not.toContain(`Phase diagram`)
  expect(page.indexed_html).toContain(`<h1 id="guide">`)
  expect(globalThis).not.toHaveProperty(`executed`)
  expect(page.records).toEqual([
    {
      url: `/base/science#fig%3Aplot`,
      content: `Figure 1. Phase diagram`,
      language: `en`,
      meta: {
        title: `Authored <title> — Figure 1. Phase diagram`,
        description: `A "description"`,
        categories: `Science, Examples`,
      },
    },
    {
      url: `/base/science#eq%3Aenergy`,
      content: `Equation 1 E = mc^2`,
      language: `en`,
      meta: {
        title: `Authored <title> — Equation 1`,
        description: `A "description"`,
        categories: `Science, Examples`,
      },
    },
  ])
})

test.each([``, `/docs`])(
  `build integration resolves grouped, nested and parameterized routes with base %j`,
  async (base) => {
    const directory = await mkdtemp(`${tmpdir()}/widgets-site-`)
    const previous = process.cwd()
    const index = {
      addHTMLFile: vi.fn().mockResolvedValue({ errors: [] }),
      addCustomRecord: vi.fn().mockResolvedValue({ errors: [] }),
      writeFiles: vi.fn().mockResolvedValue({ errors: [] }),
      addDirectory: vi.fn(),
      getFiles: vi.fn(),
      deleteIndex: vi.fn(),
    }
    vi.mocked(pagefind.createIndex).mockResolvedValue({ errors: [], index })
    try {
      process.chdir(directory)
      await mkdir(`build`)
      await writeFile(
        `build/guide.html`,
        page_html(
          `<h1 id="guide">Guide</h1><a href="${base}/old#keyboard">Native</a><figure id="fig:plot"><img src="${base}/plot.svg"><figcaption>Phase diagram</figcaption></figure>`,
        ),
      )
      await writeFile(`build/native.html`, page_html(`<h2 id="keyboard">Keyboard</h2>`))
      await writeFile(`build/plot.svg`, `<svg/>`)
      const source = resolve(`src/routes/(docs)/nested/[slug]/+page.md`)
      const { manifest } = await compile_source(
        `---\ntitle: Nested guide\n---\n# Guide`,
        { filename: source },
      )
      const builder = {
        config: { kit: { paths: { base }, files: { routes: `src/routes` } } },
        routes: [
          { id: `/(docs)/nested/[slug]`, pattern: /^\/nested\/[^/]+\/?$/u },
          { id: `/(native)/native`, pattern: /^\/native\/?$/u },
        ],
        prerendered: {
          pages: new Map([
            [`${base}/nested/guide`, { file: `guide.html` }],
            [`${base}/native`, { file: `native.html` }],
          ]),
          redirects: new Map([[`${base}/old`, { location: `${base}/native` }]]),
        },
        log: { success: vi.fn() },
      } as unknown as Builder
      await site_adapter(new Map([[source, manifest]])).adapt(builder)
      expect(index.addHTMLFile).toHaveBeenCalledTimes(2)
      expect(index.addDirectory).not.toHaveBeenCalled()
      expect(index.addHTMLFile).toHaveBeenCalledWith({
        url: `/nested/guide`,
        content: expect.stringContaining(`content="Nested guide"`),
      })
      expect(await readFile(`build/guide.html`, `utf8`)).toContain(
        `data-pagefind-meta="title[content]" content="Nested guide"`,
      )
      expect(index.writeFiles).toHaveBeenCalledWith({ outputPath: `build/pagefind` })
      expect(index.addCustomRecord).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ url: `/nested/guide#fig%3Aplot` }),
      )
      expect(pagefind.close).toHaveBeenCalled()
      // Native anchors participate in validation before any new index is published.
      await writeFile(`build/native.html`, page_html(`<h2 id="renamed">Renamed</h2>`))
      await expect(
        site_adapter(new Map([[source, manifest]])).adapt(builder),
      ).rejects.toThrow(`Missing fragment #keyboard`)
      expect(index.writeFiles).toHaveBeenCalledTimes(1)
    } finally {
      process.chdir(previous)
      await rm(directory, { recursive: true })
    }
  },
)
