import { create_source_links, type SourceSymbols } from '$lib/source-links'
import source_links, {
  repository_url,
  SOURCE_SYMBOLS_MODULE_ID,
} from '$lib/source-links/vite-plugin'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, onTestFinished } from 'vitest'
import { create_element, temp_dir } from './index'

// Run the plugin's resolve + load hooks and evaluate the emitted module
const load_symbols = async (root?: string): Promise<SourceSymbols> => {
  const plugin = source_links({ root })
  const resolve = plugin.resolveId as (id: string) => string | null
  const load = plugin.load as (id: string) => string | null
  expect(resolve(`some-other-module`)).toBeNull()
  const resolved = resolve(SOURCE_SYMBOLS_MODULE_ID)
  if (!resolved) throw new Error(`virtual module not resolved`)
  expect(load(`some-other-module`)).toBeNull()
  const code = load(resolved)
  if (!code) throw new Error(`virtual module not loaded`)
  return import(/* @vite-ignore */ `data:text/javascript,${encodeURIComponent(code)}`)
}

describe(`source_links vite plugin`, () => {
  it(`indexes this repo's source files and exported definitions, pinned to the build commit`, async () => {
    const data = await load_symbols()
    const { repo, ref, files, symbols } = data
    expect(repo).toBe(`https://github.com/janosh/svelte-widgets`)
    expect(ref).toMatch(/^(?:[0-9a-f]{40}|main)$/)
    expect(files).toContain(`/src/lib/Footer.svelte`)
    expect(files).toContain(`/src/lib/source-links/vite-plugin.ts`)
    expect(files).toEqual(files.toSorted())
    expect(files.some((file) => /\.(?:test|d)\.ts$/.test(file))).toBe(false)
    expect(symbols.make_config).toMatch(/^\/src\/lib\/vite-config\.ts#L\d+$/)
    expect(symbols.create_source_links).toMatch(
      /^\/src\/lib\/source-links\/index\.ts#L\d+$/,
    )
    expect(
      create_source_links(data).source_href(`create_markdown({ math: true })`),
    ).toMatch(/\/src\/lib\/markdown\/index\.ts#L\d+$/)
    // types and interfaces count as definitions too
    expect(symbols.SourceSymbols).toMatch(/^\/src\/lib\/source-links\/index\.ts#L\d+$/)
  })

  it(`keeps overloads in one file, dropping cross-file duplicates and non-source files`, async () => {
    const root = await temp_dir(`source-links-`)
    mkdirSync(join(root, `src/lib/nested`), { recursive: true })
    for (const [path, content] of Object.entries({
      'package.json': JSON.stringify({
        repository: { url: `git+https://github.com/user/repo.git` },
      }),
      'src/lib/a.ts': `export const shared = 1
export function only_a(value: string): string
export function only_a(value: number): number
export function only_a(value: string | number) { return value }
`,
      'src/lib/nested/b.ts': `\nexport type shared = number\nexport class OnlyB {}\n`,
      'src/lib/a.test.ts': `export const from_test = 1\n`,
      'src/lib/types.d.ts': `export const from_dts = 1\n`,
      'src/lib/Widget.svelte': `<div />`,
      'src/lib/notes.md': `# not source`,
    })) {
      writeFileSync(join(root, path), content)
    }
    const { repo, ref, files, symbols } = await load_symbols(root)
    expect(repo).toBe(`https://github.com/user/repo`)
    expect(ref).toBe(`main`) // no git repository in a temp dir
    expect(files).toEqual([
      `/src/lib/Widget.svelte`,
      `/src/lib/a.ts`,
      `/src/lib/nested/b.ts`,
    ])
    expect(symbols).toEqual({
      only_a: `/src/lib/a.ts#L2`,
      OnlyB: `/src/lib/nested/b.ts#L3`,
    })
  })

  it.each([
    [`https://github.com/user/repo`, `https://github.com/user/repo`],
    [`git+https://github.com/user/repo.git`, `https://github.com/user/repo`],
    [{ url: `git+ssh://git@github.com/user/repo.git` }, `https://github.com/user/repo`],
    [`git@gitlab.com:group/repo.git`, `https://gitlab.com/group/repo`],
    [`user/repo`, `https://github.com/user/repo`],
  ])(`normalizes repository %j to %s`, (repository, expected) => {
    expect(repository_url(repository)).toBe(expected)
  })

  it.each([undefined, ``, { url: 42 }])(
    `rejects a missing repository (%j)`,
    (repository) => {
      expect(() => repository_url(repository)).toThrow(`"repository"`)
    },
  )
})

describe(`create_source_links`, () => {
  const data: SourceSymbols = {
    repo: `https://github.com/user/repo`,
    ref: `abc123`,
    files: [
      `/src/lib/Footer.svelte`,
      `/src/lib/utils.ts`,
      `/src/lib/index.ts`,
      `/src/lib/nested/index.ts`,
      `/src/lib/Shared.svelte`,
      `/src/lib/nested/Shared.svelte`,
    ],
    symbols: {
      make_config: `/src/lib/vite-config.ts#L7`,
      Footer: `/src/lib/other.ts#L1`,
      Shared: `/src/lib/other.ts#L2`,
    },
  }
  const { source_location, source_href, link_source_mentions } = create_source_links(data)

  // A scan's DOM mutations schedule another scan, so wait for both frames.
  const rescan = async () => {
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
  }

  // the anchor adopts the span's text nodes, so a reactive `<code>{name}</code>` rewrites
  // text inside the generated link; skipping spans that already hold one froze the old name
  it(`re-resolves a link whose code span text changed, and unwraps it when it stops matching`, async () => {
    const root = create_element(`main`)
    const code = document.createElement(`code`)
    // held across rescans: the anchor adopts this very node
    const text = document.createTextNode(`Footer`)
    code.append(text)
    root.append(code)
    onTestFinished(
      create_source_links(data, {
        link_title: (path) => `Quelle: ${path}`,
      }).link_source_mentions(root),
    )

    for (const [name, path] of [
      [`Footer`, `/src/lib/Footer.svelte`],
      [`utils.ts`, `/src/lib/utils.ts`],
      [`make_config({ build: {} })`, `/src/lib/vite-config.ts#L7`],
      [`label(options)`, undefined], // no longer matches: unwrap the anchor
    ] as const) {
      text.textContent = name
      await rescan()
      const link = code.querySelector(`a`)
      expect(link?.getAttribute(`href`)).toBe(
        path && `${data.repo}/blob/${data.ref}${path}`,
      )
      expect(link?.getAttribute(`title`)).toBe(path && `Quelle: ${path.slice(1)}`)
      expect(code.querySelectorAll(`a`)).toHaveLength(path ? 1 : 0)
      expect(code.textContent).toBe(name)
      expect(code.contains(text)).toBe(true) // Svelte still owns this text node
    }
  })

  it.each([
    [`Footer`, `/src/lib/Footer.svelte`], // component by bare name beats a same-named export
    [`Footer.svelte`, `/src/lib/Footer.svelte`],
    [` utils.ts `, `/src/lib/utils.ts`],
    [`make_config`, `/src/lib/vite-config.ts#L7`],
    [`make_config()`, `/src/lib/vite-config.ts#L7`],
    [`make_config({ build: { target: 'esnext' } })`, `/src/lib/vite-config.ts#L7`],
    [
      ` make_config (\n  { plugins: [plugin({ nested: true })] },\n) `,
      `/src/lib/vite-config.ts#L7`,
    ],
    [`make_config(')')`, `/src/lib/vite-config.ts#L7`],
    [`make_config({`, undefined],
    [`make_config(options).build`, undefined],
    [`other(make_config(options))`, undefined],
    [`config.make_config(options)`, undefined],
    [`utils.ts(options)`, undefined],
    [`label(options)`, undefined],
    [`Shared(options)`, undefined], // ambiguous component names stay ambiguous in calls
    [`index.ts`, undefined], // one per folder: ambiguous
    [`label`, undefined], // a prop, not a file
    [`utils`, undefined], // only .svelte files link by bare name
  ])(`resolves %j to %j`, (name, location) => {
    expect(source_location(name)).toBe(location)
    expect(source_href(name)).toBe(
      location && `https://github.com/user/repo/blob/abc123${location}`,
    )
  })

  it(`links matching code spans in place, skipping pre blocks and existing links`, async () => {
    const root = create_element(`main`)
    root.innerHTML =
      `<p><code>Footer</code> and <code>label(options)</code></p>` +
      `<pre><code>make_config(options)</code></pre>` +
      `<a href="/x"><code>make_config(options)</code></a>` +
      `<code><a href="/custom">make_config(options)</a></code>`
    const detach = link_source_mentions(root)
    onTestFinished(detach)
    await new Promise(requestAnimationFrame)
    const links = root.querySelectorAll(`code > a[data-source-link]`)
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute(`href`)).toBe(
      `https://github.com/user/repo/blob/abc123/src/lib/Footer.svelte`,
    )
    expect(links[0].getAttribute(`title`)).toBe(`Source: src/lib/Footer.svelte`)
    expect(links[0].textContent).toBe(`Footer`)
    root.append(document.createElement(`span`))
    await rescan()
    expect(root.querySelectorAll(`code > a[data-source-link]`)).toHaveLength(1)
    expect(root.querySelector(`code > a`)).toBe(links[0])
    expect(root.querySelector(`a[href="/x"]`)?.textContent).toBe(`make_config(options)`)
    expect(root.querySelector(`a[href="/custom"]`)?.textContent).toBe(
      `make_config(options)`,
    )
    // late-arriving content is picked up too, and a detached root is left alone
    root.insertAdjacentHTML(
      `beforeend`,
      `<p><code>make_config({ plugins: [] })</code></p>`,
    )
    await rescan()
    const call_link = root.querySelectorAll(`code > a[data-source-link]`)[1]
    expect(call_link?.getAttribute(`href`)).toMatch(/vite-config\.ts#L7$/)
    expect(call_link?.textContent).toBe(`make_config({ plugins: [] })`)
    detach()
    root.insertAdjacentHTML(`beforeend`, `<p><code>utils.ts</code></p>`)
    await rescan()
    expect(root.querySelectorAll(`code > a[data-source-link]`)).toHaveLength(2)
  })
})
