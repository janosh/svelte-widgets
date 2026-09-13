// These links only resolve after deployment, so the regular link checker cannot check them.
import * as lib from '$lib'
import * as utils from '$lib/utils'
import { exports as pkg_exports } from '$root/package.json'
import readme from '$root/readme.md?raw'
import markdown_guide from '$lib/markdown/readme.md?raw'
import { expect, test } from 'vitest'

const pages: Record<string, string> = import.meta.glob(
  `../../src/routes/**/+page.{md,svelte}`,
  { query: `?raw`, import: `default`, eager: true },
)

// './(demos)/(display)/extras/+page.md' -> '/extras'
const route_sources = Object.fromEntries(
  Object.entries(pages).map(([file, source]) => [
    file
      .replace(`../../src/routes`, ``)
      .replaceAll(/\/\([^)]+\)/gu, ``)
      .replace(/\/?\+page\.(?:md|svelte)$/u, ``) || `/`,
    source,
  ]),
)

// Compare anchors without duplicating Markdown slug normalization.
const bare = (text: string) => text.replaceAll(/[^a-z0-9]/giu, ``).toLowerCase()

// The Markdown route renders an imported guide rather than authoring its headings locally.
const headings_on = (route: string) =>
  [
    ...(route === `/markdown` ? markdown_guide : (route_sources[route] ?? ``)).matchAll(
      /^#{2,4} (?<text>.+)$|<(?:h[2-4]\s+|Heading\s+[^>]*?)id="(?<id>[^"]+)"/gmu,
    ),
  ].map((match) => bare(match.groups?.id ?? match.groups?.text ?? ``))

const unresolved = (route: string, anchor: string | undefined, label: string) => {
  if (!(route in route_sources)) return `${label}: no such page ${route}`
  if (anchor && !headings_on(route).includes(bare(anchor))) {
    return `${label}: ${route} has no heading for #${anchor}`
  }
  return null
}

const page_links = Object.entries(route_sources)
  .flatMap(([from, source]) =>
    [...source.matchAll(/\[[^\]]*\]\((?<target>[^)\s]+)\)/gu)].map((match) => ({
      from,
      target: match.groups?.target ?? ``,
    })),
  )
  .filter(({ target }) => !/^[a-z]+:/u.test(target))

test(`demo pages link each other with base-relative paths`, () => {
  expect(page_links.length).toBeGreaterThan(10)

  // a leading slash drops the paths.base prefix, which 404s the prerender under the
  // /svelte-widgets base path the site deploys to
  const absolute = page_links.filter(({ target }) => target.startsWith(`/`))
  expect(absolute, `use e.g. attachments#tooltip, not /attachments#tooltip`).toEqual([])
  for (const [route, source] of Object.entries(route_sources))
    expect(source, `${route}: resolve absolute HTML links with $app/paths`).not.toMatch(
      /<a\b[^>]*\bhref="\/(?!\/)/u,
    )
})

test(`demo page links point at a page and heading that exist`, () => {
  const failures = page_links.flatMap(({ from, target }) => {
    const { pathname, hash } = new URL(target, `https://docs.invalid${from}`)
    return unresolved(pathname, hash.slice(1), `${from} link ${target}`) ?? []
  })
  expect(failures).toEqual([])
})

const docs_links = [
  ...`${readme}\n${markdown_guide}`.matchAll(
    /https:\/\/svelte-widgets\.janosh\.dev\/(?<route>[\w/-]+)(?:#(?<anchor>[\w-]+))?/gu,
  ),
].map(({ groups }) => ({ route: `/${groups?.route}`, anchor: groups?.anchor }))

test(`readme and Markdown guide docs links point at a page and heading that exist`, () => {
  expect(docs_links.length).toBeGreaterThan(15)
  expect(docs_links.filter(({ anchor }) => anchor).length).toBeGreaterThan(8)

  const failures = docs_links.flatMap(
    ({ route, anchor }) => unresolved(route, anchor, `readme link`) ?? [],
  )
  expect(failures).toEqual([])
})

test(`every non-component subpath links to its source in the readme export table`, () => {
  expect(pkg_exports).toHaveProperty(`./*.svelte`)
  const subpaths = Object.entries(pkg_exports)
    .filter(([subpath]) => subpath !== `.` && !subpath.endsWith(`.svelte`))
    .map(([subpath, target]) => {
      const source_path = (`default` in target ? target.default : target.types)
        .replace(`./dist/`, `src/lib/`)
        .replace(/\.js$/u, `.ts`)
      return [
        subpath.slice(1),
        `https://github.com/janosh/svelte-widgets/blob/main/${source_path}`,
      ]
    })
  const documented = [
    ...readme.matchAll(/^\|\s+\[`(?<subpath>\/[^`]+)`\]\((?<href>[^)]+)\)\s+\|/gmu),
  ].map((match) => [match.groups?.subpath, match.groups?.href])

  expect(documented).toHaveLength(subpaths.length)
  expect(documented).toEqual(expect.arrayContaining(subpaths))
})

test(`utilities stay on their focused subpath`, () => {
  expect(Object.keys(utils).filter((name) => name in lib)).toEqual([])
  expect(pkg_exports).not.toHaveProperty(`./types`)
})

test(`every exported component links to its source in the readme component table`, () => {
  const components = Object.keys(lib).filter((name) => /^[A-Z]/u.test(name))
  const source_paths = Object.keys(import.meta.glob(`../../src/lib/**/*.svelte`)).map(
    (path) => path.replace(`../../`, ``),
  )
  expect(components.length).toBeGreaterThan(15)

  for (const name of components) {
    const source_path = source_paths.find((path) => path.endsWith(`/${name}.svelte`))
    expect(source_path, `${name} has no source file`).toBeDefined()
    expect(readme, `${name} is missing from the component table`).toContain(
      `| [\`${name}\`](https://github.com/janosh/svelte-widgets/blob/main/${source_path})`,
    )
  }
})
