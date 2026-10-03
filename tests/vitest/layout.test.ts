import { repository } from '#root/package.json'
import Layout from '#root/src/routes/+layout.svelte'
import { tick } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'
import { doc_query, fire_input, press_key, render } from './index'

// explicit type or the inferred `id: string` rejects the 404 case's null below
const mocks = vi.hoisted<{ page: { route: { id: string | null }; url: URL } }>(() => ({
  page: { route: { id: `/` }, url: new URL(`https://x.co/`) },
}))

vi.mock(`$app/navigation`, () => ({ afterNavigate: () => {}, goto: async () => {} }))
vi.mock(`$app/paths`, () => ({
  asset: (path: string) => `/${path}`,
  resolve: (path: string) => `/${path}`,
}))
vi.mock(`$app/state`, () => ({ page: mocks.page }))

const render_layout = (route_id: string | null, pathname: string) => {
  mocks.page.route.id = route_id
  mocks.page.url = new URL(`https://x.co${pathname}`)
  render(Layout, {})
}

test.each([
  [`/`, `/`, `src/routes/+page.svelte`],
  // Changelog content comes from the repo root, not its wrapper component.
  [`/changelog`, `/changelog`, `changelog.md`],
  [
    `/(demos)/(inputs)/(multiselect)/multiselect`,
    `/multiselect`,
    `src/routes/(demos)/(inputs)/(multiselect)/multiselect/+page.md`,
  ],
  // A 404 has no route id, so it must not fall into the landing-page entry.
  [null, `/no-such-page`, `src/routes`],
])(`footer edit link for route %s points at %s`, (route_id, pathname, source) => {
  render_layout(route_id, pathname)
  expect(doc_query(`footer a[href*="/blob/-/"]`).getAttribute(`href`)).toBe(
    `${repository}/blob/-/${source}`,
  )
})

test(`command search includes custom demo labels`, async () => {
  render_layout(`/`, `/`)
  press_key(window, `k`, { metaKey: true })
  await tick()
  const input = doc_query<HTMLInputElement>(`input[aria-label="Site search"]`)
  await fire_input(input, `diffview`, `input`)

  const labels = Array.from(document.querySelectorAll(`li[role="option"]`), (option) =>
    option.textContent?.trim(),
  )
  expect(labels).toContain(`CodeEditor / DiffView`)
})
