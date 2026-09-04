import { SubpageGrid } from '$lib'
import { Check, ChevronRight, Copy, type IconData } from '$lib/icons'
import MultiSelectPage from '$root/src/routes/(demos)/(multiselect)/multiselect/+page.md'
import { mount } from 'svelte'
import { expect, test, vi } from 'vitest'

// stands in for a configured base path, which is what resolve() prefixes
vi.mock(`$app/paths`, () => ({ resolve: (path: string) => `/docs${path}` }))

test.each([undefined, Check])(
  `renders ordered cards with shared hrefs and fallback_icon=%j`,
  (fallback_icon) => {
    const subpages: [string, string, string, icon?: IconData][] = [
      [`Basics`, `/basics`, `Basics overview`],
      [`Styling`, `/basics`, `Styling overview`, Copy],
    ]
    mount(SubpageGrid, {
      target: document.body,
      props: {
        title: `Demo`,
        subtitle: `Demo subtitle`,
        subpages,
        fallback_icon,
        style: `max-width: 40rem`,
      },
    })

    expect(document.querySelector(`h1`)?.textContent).toBe(`Demo`)
    expect(document.querySelector(`.subtitle`)?.textContent).toBe(`Demo subtitle`)
    expect(document.querySelector(`.subpage-grid`)?.getAttribute(`style`)).toContain(
      `max-width: 40rem`,
    )

    const cards = [...document.querySelectorAll<HTMLAnchorElement>(`nav.grid a.card`)]
    expect(
      cards.map((card) => [
        card.getAttribute(`href`),
        card.querySelector(`h2`)?.textContent,
        card.querySelector(`div > p`)?.textContent,
        card.querySelector(`svg.icon path`)?.getAttribute(`d`),
      ]),
    ).toEqual(
      subpages.map(([page_title, href, description, icon]) => [
        href,
        page_title,
        description,
        (icon ?? fallback_icon ?? ChevronRight).d,
      ]),
    )
  },
)

test(`overview pages link to base-prefixed sibling routes`, () => {
  mount(MultiSelectPage, { target: document.body })

  const hrefs = [...document.querySelectorAll(`nav.grid a`)].map((link) =>
    link.getAttribute(`href`),
  )
  // listing exact routes would break every time a demo moves, so only pin the base prefix
  expect(hrefs.length).toBeGreaterThan(5)
  expect(hrefs.every((href) => href?.startsWith(`/docs/`))).toBe(true)
  expect(hrefs).toContain(`/docs/form`)
})
