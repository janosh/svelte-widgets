import { page } from '$app/state'
import { DemoNav } from '$site'
import CategoryOverview from '$site/CategoryOverview.svelte'
import { mount } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vitest'
import {
  demo_labels,
  demo_nav_routes,
  demo_pages,
  multiselect_recipes,
} from '../../src/routes/(demos)'

const base = `/docs`
const resolver = vi.hoisted(() => ({ relative: false }))
vi.mock(`$app/paths`, () => ({
  resolve: (path: string): string => (resolver.relative ? `.${path}` : `/docs${path}`),
}))
vi.mock(`$app/state`, () => ({ page: { url: new URL(`https://example.com/docs/`) } }))

const page_files = Object.keys(
  import.meta.glob(`../../src/routes/**/+page.{svelte,md}`),
).filter((filename) => filename.includes(`/(demos)/`) && !filename.includes(`/(hide)/`))
const route_of = (filename: string) =>
  filename
    .replace(`../../src/routes`, ``)
    .replaceAll(/\/\([^)]+\)/gu, ``)
    .replace(/\/\+page\.(?:svelte|md)$/u, ``)

test(`DemoNav lists components while recipes remain in the complete searchable catalog`, () => {
  mount(DemoNav, { target: document.body })
  const hrefs = new Set(
    Array.from(document.querySelectorAll(`nav a`), (link) => link.getAttribute(`href`)),
  )
  const expected_pages = page_files.map(route_of)
  expect(expected_pages).toEqual(
    expect.arrayContaining([`/multiselect`, `/ui`, `/range-select`]),
  )
  expect(new Set(demo_pages)).toEqual(new Set(expected_pages))
  expect(demo_pages).toHaveLength(expected_pages.length)
  expect(new Set(multiselect_recipes)).toEqual(
    new Set(
      page_files
        .filter(
          (filename) =>
            filename.includes(`/(multiselect)/`) && route_of(filename) !== `/multiselect`,
        )
        .map(route_of),
    ),
  )
  expect(multiselect_recipes).toContain(`/events`)
  const recipe_set = new Set<string>(multiselect_recipes)
  expect(hrefs).toEqual(
    new Set([
      `${base}/`,
      ...expected_pages
        .filter((route) => !recipe_set.has(route))
        .map((route) => `${base}${route}`),
    ]),
  )
  expect(demo_nav_routes.map(({ label }) => label)).toEqual([
    `Inputs`,
    `Navigation`,
    `Overlays`,
    `Display`,
    `Authoring`,
    `Attachments`,
  ])
  expect(document.querySelectorAll(`.menu > .dropdown`)).toHaveLength(6)
  for (const { name, href, children } of demo_nav_routes) {
    expect(children).toContain(href)
    for (const route of children) {
      expect(
        page_files.some(
          (filename) =>
            filename.startsWith(`../../src/routes/(demos)/(${name})/`) &&
            route_of(filename) === route,
        ),
      ).toBe(true)
    }
  }
  expect(
    document.querySelector(
      `.dropdown[data-href="/docs/inputs"] a[href="/docs/multiselect"]`,
    ),
  ).not.toBeNull()
  expect(
    document.querySelector(`.dropdown[data-href="/docs/navigation"] a[href="/docs/nav"]`),
  ).not.toBeNull()
  expect(demo_labels).toMatchObject({
    '/attachments/tooltip': `tooltip`,
    '/attachments/dismiss-on-outside-press': `dismiss_on_outside_press`,
  })
  for (const [route, label] of Object.entries(demo_labels)) {
    if (recipe_set.has(route)) continue
    const link = document.querySelector(`nav a[href="${base}${route}"]`)
    expect(link?.textContent?.trim()).toBe(label)
    if (route.startsWith(`/attachments/`))
      expect(link?.querySelector(`code`)?.textContent).toBe(label)
    else expect(link?.querySelector(`code`)).toBeNull()
  }
})

test.each([`inputs`, `navigation`, `overlays`, `display`])(
  `%s overview links to its components with descriptions`,
  (name) => {
    mount(CategoryOverview, { target: document.body, props: { name } })
    const category = demo_nav_routes.find((entry) => entry.name === name)
    expect(document.querySelector(`h1`)?.textContent).toBe(category?.label)
    const cards = Array.from(document.querySelectorAll(`.card`))
    expect(cards.map((card) => card.getAttribute(`href`))).toEqual(
      category?.children
        .filter((route) => route !== category.href)
        .map((route) => `${base}${route}`),
    )
    for (const card of cards)
      expect(card.querySelector(`p`)?.textContent?.trim().length).toBeGreaterThan(15)
  },
)

test.each([false, true])(
  `recipe pages mark their MultiSelect parent active with relative paths=%s`,
  (relative) => {
    resolver.relative = relative
    onTestFinished(() => {
      resolver.relative = false
      page.url.pathname = `${base}/`
    })
    page.url.pathname = `${base}/events`
    mount(DemoNav, { target: document.body })
    expect(
      document
        .querySelector(`a[href="${base}/multiselect"]`)
        ?.getAttribute(`aria-current`),
    ).toBe(`page`)
    expect(document.querySelector(`a[href="${base}/events"]`)).toBeNull()
  },
)
