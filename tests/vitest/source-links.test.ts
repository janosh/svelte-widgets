import { create_source_links, type SourceSymbols } from '$lib/source-links'
import source_links, {
  repository_url,
  SOURCE_SYMBOLS_MODULE_ID,
} from '$lib/source-links/vite-plugin'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vite-plus/test'

// Run the plugin's resolve + load hooks and evaluate the emitted module
const load_symbols = (root?: string): SourceSymbols => {
  const plugin = source_links(root ? { root } : {})
  const resolve = plugin.resolveId as (id: string) => string | null
  const load = plugin.load as (id: string) => string | null
  expect(resolve(`some-other-module`)).toBeNull()
  const resolved = resolve(SOURCE_SYMBOLS_MODULE_ID)
  if (!resolved) throw new Error(`virtual module not resolved`)
  expect(load(`some-other-module`)).toBeNull()
  const code = load(resolved)
  if (!code) throw new Error(`virtual module not loaded`)
  // one `export const name = <json>` per line
  return Object.fromEntries(
    code.split(`\n`).map((line) => {
      const match = /^export const (?<name>\w+) = (?<json>.*)$/.exec(line)
      if (!match?.groups) throw new Error(`unexpected line in virtual module: ${line}`)
      return [match.groups.name, JSON.parse(match.groups.json) as unknown]
    }),
  ) as SourceSymbols
}

describe(`source_links vite plugin`, () => {
  it(`indexes this repo's source files and exported definitions, pinned to the build commit`, () => {
    const { repo, ref, files, symbols } = load_symbols()
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
    // types and interfaces count as definitions too
    expect(symbols.SourceSymbols).toMatch(/^\/src\/lib\/source-links\/index\.ts#L\d+$/)
  })

  it(`drops names exported from more than one file and non-source files`, () => {
    const root = mkdtempSync(join(tmpdir(), `source-links-`))
    try {
      mkdirSync(join(root, `src/lib/nested`), { recursive: true })
      writeFileSync(
        join(root, `package.json`),
        JSON.stringify({ repository: { url: `git+https://github.com/user/repo.git` } }),
      )
      writeFileSync(
        join(root, `src/lib/a.ts`),
        `export const shared = 1\nexport function only_a() {}\n`,
      )
      writeFileSync(
        join(root, `src/lib/nested/b.ts`),
        `\nexport type shared = number\nexport class OnlyB {}\n`,
      )
      writeFileSync(join(root, `src/lib/a.test.ts`), `export const from_test = 1\n`)
      writeFileSync(join(root, `src/lib/types.d.ts`), `export const from_dts = 1\n`)
      writeFileSync(join(root, `src/lib/Widget.svelte`), `<div />`)
      writeFileSync(join(root, `src/lib/notes.md`), `# not source`)
      const { repo, ref, files, symbols } = load_symbols(root)
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
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
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
    ],
    symbols: {
      make_config: `/src/lib/vite-config.ts#L7`,
      Footer: `/src/lib/other.ts#L1`,
    },
  }
  const { source_location, source_href, link_source_mentions } = create_source_links(data)

  afterEach(() => {
    document.body.innerHTML = ``
  })

  it(`labels reword the generated link title`, async () => {
    const root = document.createElement(`main`)
    root.innerHTML = `<p><code>Footer</code></p>`
    document.body.append(root)
    const detach = create_source_links(data, {
      link_title: (path) => `Quelle: ${path}`,
    }).link_source_mentions(root)
    await new Promise(requestAnimationFrame)

    expect(root.querySelector(`code > a`)?.getAttribute(`title`)).toBe(
      `Quelle: src/lib/Footer.svelte`,
    )
    detach()
  })

  it.each([
    [`Footer`, `/src/lib/Footer.svelte`], // component by bare name beats a same-named export
    [`Footer.svelte`, `/src/lib/Footer.svelte`],
    [` utils.ts `, `/src/lib/utils.ts`],
    [`make_config`, `/src/lib/vite-config.ts#L7`],
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
    const root = document.createElement(`main`)
    root.innerHTML =
      `<p><code>Footer</code> and <code>label</code></p>` +
      `<pre><code>Footer</code></pre><a href="/x"><code>Footer</code></a>`
    document.body.append(root)
    const detach = link_source_mentions(root)
    await new Promise(requestAnimationFrame)
    const links = root.querySelectorAll(`code > a`)
    expect(links).toHaveLength(1)
    expect(links[0].getAttribute(`href`)).toBe(
      `https://github.com/user/repo/blob/abc123/src/lib/Footer.svelte`,
    )
    expect(links[0].getAttribute(`title`)).toBe(`Source: src/lib/Footer.svelte`)
    expect(links[0].textContent).toBe(`Footer`)
    // late-arriving content is picked up too, and a detached root is left alone
    root.insertAdjacentHTML(`beforeend`, `<p><code>make_config</code></p>`)
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    expect(root.querySelectorAll(`code > a`)[1]?.getAttribute(`href`)).toMatch(
      /vite-config\.ts#L7$/,
    )
    detach()
    root.insertAdjacentHTML(`beforeend`, `<p><code>utils.ts</code></p>`)
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    expect(root.querySelectorAll(`code > a`)).toHaveLength(2)
  })

  it(`does not re-link a span once its anchor exists, even after a rescan`, async () => {
    const root = document.createElement(`main`)
    root.innerHTML = `<p><code>Footer</code></p>`
    document.body.append(root)
    const detach = link_source_mentions(root)
    await new Promise(requestAnimationFrame)
    root.append(document.createElement(`span`))
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    expect(root.querySelectorAll(`a`)).toHaveLength(1)
    detach()
  })
})
