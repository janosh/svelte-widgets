import { DemoNav } from '$site'
import { mount } from 'svelte'
import { expect, test, vi } from 'vitest'
import { demo_labels, demo_nav_routes, demo_pages } from '../../src/routes/(demos)'

const base = `/docs`
vi.mock(`$app/paths`, () => ({
  resolve: (path: string): string => `/docs${path}`,
}))
vi.mock(`$app/state`, () => ({ page: { url: { pathname: `/docs/` } } }))

test(`DemoNav contains all base-prefixed demo pages`, () => {
  mount(DemoNav, { target: document.body })

  // Category headers without overview pages are anchors, not pages.
  const hrefs = Array.from(document.querySelectorAll(`nav a`)).flatMap((link) => {
    const href = link.getAttribute(`href`)
    return href && !href.startsWith(`#`) ? [href] : []
  })

  const page_files = Object.keys(
    import.meta.glob(`../../src/routes/**/+page.{svelte,md}`),
  ).filter((filename) => filename.includes(`/(demos)/`) && !filename.includes(`/(hide)/`))
  const expected = [
    `${base}/`,
    ...page_files.map(
      (filename) =>
        `${base}${filename
          .replace(`../../src/routes`, ``)
          .replaceAll(/\/\([^)]+\)/gu, ``)
          .replace(/\/\+page\.(?:svelte|md)$/u, ``)}`,
    ),
  ]
  // A broken glob must not make both sides trivially equal.
  expect(expected).toEqual(
    expect.arrayContaining([`${base}/multiselect`, `${base}/ui`, `${base}/range-select`]),
  )
  expect(new Set(hrefs)).toEqual(new Set(expected))
  expect(hrefs).toHaveLength(expected.length)
  expect(demo_pages.map((route) => `${base}${route}`)).toEqual(hrefs.slice(1))
  expect(demo_nav_routes.map(({ label }) => label)).toEqual([
    `Inputs`,
    `Navigation`,
    `Overlays`,
    `Display`,
    `Authoring`,
    `Attachments`,
  ])
  expect(document.querySelectorAll(`.menu > .dropdown`)).toHaveLength(6)
  for (const { label, children } of demo_nav_routes) {
    const category = label.toLowerCase()
    expect(children.length).toBeGreaterThan(0)
    for (const route of children) {
      const source = `../../src/routes/(demos)/(${category})${route}/+page.`
      expect(page_files.some((filename) => filename.startsWith(source))).toBe(true)
    }
  }
  expect(
    document.querySelector(`.dropdown[data-href="#inputs"] a[href="/docs/multiselect"]`),
  ).not.toBeNull()
  expect(
    document.querySelector(`.dropdown[data-href="#navigation"] a[href="/docs/nav"]`),
  ).not.toBeNull()

  // Nav takes labels from route.label for top-level items but from the href for dropdown
  // children, so the wrong source silently regresses to slug casing (`Multiselect`)
  const link_text = new Set(
    Array.from(document.querySelectorAll(`nav a`), (link) => link.textContent?.trim()),
  )
  expect(demo_labels).toMatchObject({
    '/attachments/tooltip': `tooltip`,
    '/attachments/dismiss-on-outside-press': `dismiss_on_outside_press`,
  })
  for (const [route, label] of Object.entries(demo_labels)) {
    expect(link_text).toContain(label)
    const code = document.querySelector(`nav a[href="${base}${route}"] code`)
    if (route.startsWith(`/attachments/`)) expect(code?.textContent).toBe(label)
    else expect(code).toBeNull()
  }
})
