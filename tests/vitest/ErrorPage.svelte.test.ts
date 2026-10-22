import { ErrorPage } from '#lib'
import { flushSync } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'
import { doc_query, render } from './index'

const bugs_url = `https://github.com/owner/repo/issues`

test.each([
  [500, `Server down`, `Error 5😵0: Server down`, true],
  [404, `Not found`, `Error 4😵4: Not found`, false],
  [503, undefined, `Error 5😵3`, true],
])(
  `status %d renders heading and shows the issue link only for 5xx`,
  (status, message, heading, issue_link) => {
    render(ErrorPage, { status, message, name: `site`, bugs_url, class: `extra` })
    expect(doc_query(`.error-page.extra h1`).textContent?.trim()).toBe(heading)
    expect(document.querySelector(`a[href="${bugs_url}"]`) !== null).toBe(issue_link)
    expect(document.title).toBe(`Error ${status} • site`)
    expect(doc_query(`a[href="/"]`).textContent).toBe(`landing page`)
  },
)

test(`home link uses home_href and logo`, () => {
  render(ErrorPage, { status: 404, home_href: `/base/`, logo: `/logo.svg`, name: `Site` })
  const home = doc_query<HTMLAnchorElement>(`a[href="/base/"]`)
  // no whitespace inside the underlined link: the logo's margin spaces it from the text
  expect(home.textContent).toBe(`landing page`)
  expect(home.querySelector(`img`)?.getAttribute(`src`)).toBe(`/logo.svg`)
  expect(home.querySelector(`img`)?.alt).toBe(`Site`)
})

test.each([
  [true, false, false],
  [false, true, false],
  [false, true, true],
])(
  `navigator.onLine=%j shows offline note: %j (status page: %j)`,
  (online, note, with_status_page) => {
    vi.spyOn(navigator, `onLine`, `get`).mockReturnValue(online)
    const status_page_url = with_status_page ? `https://status.example.com` : undefined
    render(ErrorPage, { status: 404, status_page_url })
    flushSync()
    expect(document.body.textContent?.includes(`offline`)).toBe(note)
    expect(document.querySelector(`a[href="https://status.example.com"]`) !== null).toBe(
      with_status_page,
    )
  },
)
