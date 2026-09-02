import { DemoNav } from '$site'
import { mount } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'
import { demo_labels, routes } from '../../src/routes/(demos)'

const base = `/docs`
vi.mock(`$app/paths`, () => ({
  resolve: (path: string): string => `/docs${path}`,
}))
vi.mock(`$app/state`, () => ({ page: { url: { pathname: `/docs/` } } }))

test(`DemoNav contains all base-prefixed demo pages`, () => {
  mount(DemoNav, { target: document.body })

  // group headers like #basics are anchors, not pages
  const hrefs = Array.from(document.querySelectorAll(`nav a`)).flatMap((link) => {
    const href = link.getAttribute(`href`)
    return href && !href.startsWith(`#`) ? [href] : []
  })

  const expected = [`${base}/`, ...routes.map(({ route }) => `${base}${route}`)]
  // a broken glob would empty `routes` and make both sides trivially equal
  expect(expected).toEqual(
    expect.arrayContaining([`${base}/multiselect`, `${base}/ui`, `${base}/range-select`]),
  )
  expect(new Set(hrefs)).toEqual(new Set(expected))

  // Nav takes labels from route.label for top-level items but from the href for dropdown
  // children, so the wrong source silently regresses to slug casing (`Multiselect`)
  const link_text = new Set(
    Array.from(document.querySelectorAll(`nav a`), (link) => link.textContent?.trim()),
  )
  for (const label of Object.values(demo_labels)) expect(link_text).toContain(label)
})
