import { SubpageGrid, type Subpage } from '$lib'
import { Check, ChevronRight, Copy } from '$lib/icons'
import MultiSelectPage from '$root/src/routes/(demos)/(inputs)/(multiselect)/multiselect/+page.md'
import { mount } from 'svelte'
import { expect, test, vi } from 'vitest'

// stands in for a configured base path, which is what resolve() prefixes
vi.mock(`$app/paths`, () => ({ resolve: (path: string) => `/docs${path}` }))
vi.mock(`$app/state`, () => ({ page: { url: new URL(`https://example.com/docs/`) } }))

test.each([undefined, Check])(
  `renders ordered cards with shared hrefs and fallback_icon=%j`,
  (fallback_icon) => {
    const subpages: Subpage[] = [
      { label: `Basics`, href: `/basics`, description: `Basics overview` },
      {
        label: `Styling`,
        href: `/basics`,
        description: `Styling overview`,
        icon: Copy,
        target: `_blank`,
        rel: `noreferrer`,
        title: `Open styling`,
      },
    ]
    mount(SubpageGrid, {
      target: document.body,
      props: {
        title: `Demo`,
        subtitle: `Demo subtitle`,
        subpages,
        fallback_icon,
        title_icon: fallback_icon,
        style: `max-width: 40rem`,
      },
    })

    expect(document.querySelector(`h1`)?.textContent).toBe(`Demo`)
    const title_icon = document.querySelector(`h1 svg.heading-icon`)
    if (fallback_icon) {
      expect(title_icon?.getAttribute(`aria-hidden`)).toBe(`true`)
      expect(title_icon?.querySelector(`path`)?.getAttribute(`d`)).toBe(fallback_icon.d)
    } else expect(title_icon).toBeNull()
    expect(document.querySelector(`.subtitle`)?.textContent).toBe(`Demo subtitle`)
    expect(document.querySelector(`.subpage-grid`)?.getAttribute(`style`)).toContain(
      `max-width: 40rem`,
    )

    const cards = [...document.querySelectorAll<HTMLAnchorElement>(`nav.grid a.card`)]
    expect([cards[1].target, cards[1].rel, cards[1].title]).toEqual([
      `_blank`,
      `noreferrer`,
      `Open styling`,
    ])
    expect(
      cards.map((card) => [
        card.getAttribute(`href`),
        card.querySelector(`h2`)?.textContent,
        card.querySelector(`div > p`)?.textContent,
        card.querySelector(`svg.icon path`)?.getAttribute(`d`),
      ]),
    ).toEqual(
      subpages.map(({ label, href, description, icon }) => [
        href,
        label,
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
