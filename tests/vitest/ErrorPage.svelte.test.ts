import { ErrorPage } from '#lib'
import { flushSync } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'
import { doc_query, render } from './index'

const bugs_url = `https://github.com/owner/repo/issues`
const status_page = `https://status.example.com`
const link = (href: string) =>
  document.querySelector<HTMLAnchorElement>(`a[href="${href}"]`)

test.each([
  [500, `Server down`, `Error 5😵0: Server down`],
  [404, `Not found`, `Error 4😵4: Not found`],
  [503, undefined, `Error 5😵3`],
])(
  `status %d: heading, tab title, issue link only for 5xx`,
  (status, message, heading) => {
    render(ErrorPage, { status, message, name: `site`, bugs_url, class: `extra` })
    const h1 = doc_query(`.error-page.extra h1`)
    expect(h1.textContent?.trim()).toBe(heading)
    expect(h1.getAttribute(`aria-label`)).toBe(heading.replace(`😵`, `0`)) // emoji is visual only
    expect(link(bugs_url) !== null).toBe(status >= 500)
    expect(document.title).toBe(`Error ${status} • site`)
    expect(link(`/`)?.textContent).toBe(`landing page`)
  },
)

test(`home link uses home_href and logo, with no underlined whitespace inside`, () => {
  render(ErrorPage, { status: 404, home_href: `/base/`, logo: `/logo.svg`, name: `Site` })
  const home = link(`/base/`)
  expect(home?.textContent).toBe(`landing page`)
  const img = home?.querySelector(`img`)
  expect([img?.getAttribute(`src`), img?.alt]).toEqual([`/logo.svg`, `Site`])
})

test.each([
  [true, undefined],
  [false, undefined],
  [false, status_page],
])(`online=%j shows the offline note, status page %s`, (online, status_page_url) => {
  vi.spyOn(navigator, `onLine`, `get`).mockReturnValue(online)
  render(ErrorPage, { status: 404, status_page_url })
  flushSync()
  expect(document.body.textContent?.includes(`offline`)).toBe(!online)
  expect(link(status_page) !== null).toBe(status_page_url !== undefined)
})
