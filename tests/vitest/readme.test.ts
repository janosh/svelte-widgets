// These links only resolve after deployment, so the regular link checker cannot check them.
import * as lib from '$lib'
import * as utils from '$lib/utils'
import { exports as pkg_exports } from '$root/package.json'
import readme from '$root/readme.md?raw'
import { expect, test } from 'vite-plus/test'

const pages: Record<string, string> = import.meta.glob(
  `../../src/routes/**/+page.{md,svelte}`,
  { query: `?raw`, import: `default`, eager: true },
)

// './(demos)/(extras)/extras/+page.md' -> '/extras'
const route_sources = Object.fromEntries(
  Object.entries(pages).map(([file, source]) => [
    file
      .replace(`../../src/routes`, ``)
      .replaceAll(/\/\([^)]+\)/gu, ``)
      .replace(/\/?\+page\.(?:md|svelte)$/u, ``) || `/`,
    source,
  ]),
)

// Avoid duplicating heading_ids' full slug rules.
const bare = (text: string) => text.replaceAll(/[^a-z0-9]/giu, ``).toLowerCase()

const headings_on = (route: string) =>
  [...(route_sources[route] ?? ``).matchAll(/^#{2,4} (?<text>.+)$/gmu)].map((match) =>
    bare(match.groups?.text ?? ``),
  )

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
})

test(`demo page links point at a page and heading that exist`, () => {
  const failures = page_links.flatMap(({ from, target }) => {
    const [page, anchor] = target.split(`#`)
    return unresolved(page ? `/${page}` : from, anchor, `${from} link ${target}`) ?? []
  })
  expect(failures).toEqual([])
})

const docs_links = [
  ...readme.matchAll(
    /https:\/\/svelte-widgets\.janosh\.dev\/(?<route>[\w-]+)(?:#(?<anchor>[\w-]+))?/gu,
  ),
].map((match) => ({
  route: `/${match.groups?.route}`,
  anchor: match.groups?.anchor,
}))

test(`readme docs links point at a page and heading that exist`, () => {
  expect(docs_links.length).toBeGreaterThan(15)
  expect(docs_links.filter(({ anchor }) => anchor).length).toBeGreaterThan(8)

  const failures = docs_links.flatMap(
    ({ route, anchor }) => unresolved(route, anchor, `readme link`) ?? [],
  )
  expect(failures).toEqual([])
})

test(`every non-component subpath appears in the readme export table`, () => {
  expect(pkg_exports).toHaveProperty(`./*.svelte`)
  const subpaths = Object.keys(pkg_exports)
    .filter((subpath) => subpath !== `.` && !subpath.endsWith(`.svelte`))
    .map((subpath) => subpath.slice(1))
  const documented = [...readme.matchAll(/^\|\s+`(?<subpath>\/[^`]+)`\s+\|/gmu)].flatMap(
    (match) => match.groups?.subpath ?? [],
  )

  expect(documented.toSorted()).toEqual(subpaths.toSorted())
})

test(`utilities stay on their focused subpath`, () => {
  expect(Object.keys(utils).filter((name) => name in lib)).toEqual([])
  expect(pkg_exports).not.toHaveProperty(`./types`)
})

test(`every exported component appears in the readme component table`, () => {
  const components = Object.keys(lib).filter((name) => /^[A-Z]/u.test(name))
  expect(components.length).toBeGreaterThan(15)

  for (const name of components) {
    expect(readme, `${name} is missing from the component table`).toContain(
      `| \`${name}\``,
    )
  }
})
