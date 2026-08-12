import { repository } from '$root/package.json'
import Layout from '$root/src/routes/+layout.svelte'
import { mount, tick, unmount } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'
import { doc_query } from './index'

// explicit type or the inferred `id: string` rejects the 404 case's null below
const mocks = vi.hoisted<{ page: { route: { id: string | null }; url: URL } }>(() => ({
  page: { route: { id: `/` }, url: new URL(`https://x.co/`) },
}))

vi.mock(`$app/environment`, () => ({ browser: false }))
vi.mock(`$app/navigation`, () => ({ afterNavigate: () => {}, goto: async () => {} }))
vi.mock(`$app/paths`, () => ({
  asset: (path: string) => path,
  resolve: (path: string) => path,
}))
vi.mock(`$app/state`, () => ({ page: mocks.page }))

const mount_layout = () => {
  const app = mount(Layout, { target: document.body })
  onTestFinished(() => unmount(app))
}

const edit_href = (route_id: string | null, pathname: string) => {
  mocks.page.route.id = route_id
  mocks.page.url = new URL(`https://x.co${pathname}`)
  mount_layout()
  return doc_query<HTMLAnchorElement>(`footer a[href*="/blob/-/"]`).getAttribute(`href`)
}

test.each([
  // the root pages render markdown from the repo root, not their wrapper component
  [`/`, `/`, `readme.md`],
  [`/changelog`, `/changelog`, `changelog.md`],
  [
    `/(demos)/(multiselect)/multiselect`,
    `/multiselect`,
    `src/routes/(demos)/(multiselect)/multiselect/+page.md`,
  ],
  // a 404 has no route id, so it must not fall into the `/` entry (readme.md)
  [null, `/no-such-page`, `src/routes`],
])(`footer edit link for route %s points at %s`, (route_id, pathname, source) => {
  expect(edit_href(route_id, pathname)).toBe(`${repository}/blob/-/${source}`)
})

test(`command search includes custom demo labels`, async () => {
  mocks.page.route.id = `/`
  mocks.page.url = new URL(`https://x.co/`)
  const app = mount(Layout, { target: document.body })
  onTestFinished(async () => {
    await unmount(app, { outro: false })
    document.body.replaceChildren()
  })

  window.dispatchEvent(
    new KeyboardEvent(`keydown`, { key: `k`, metaKey: true, bubbles: true }),
  )
  await tick()

  const input = doc_query<HTMLInputElement>(`input[aria-label="Site search"]`)
  input.value = `diffview`
  input.dispatchEvent(new InputEvent(`input`, { bubbles: true }))
  await tick()

  const labels = Array.from(document.querySelectorAll(`li[role="option"]`), (option) =>
    option.textContent?.trim(),
  )
  expect(labels).toContain(`CodeEditor / DiffView`)
})
