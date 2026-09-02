import { SubpageGrid } from '$lib'
import { Check, ChevronRight, Copy, type IconData } from '$lib/icons'
import MultiSelectPage from '$root/src/routes/(demos)/(multiselect)/multiselect/+page.md'
import { mount } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'

// stands in for a configured base path, which is what resolve() prefixes
vi.mock(`$app/paths`, () => ({ resolve: (path: string) => `/docs${path}` }))

test(`renders tuple subpages in order with default and per-page icons`, () => {
  const subpages: [string, string, string, icon?: IconData][] = [
    [`Basics`, `/basics`, `Basics overview`],
    [`Styling`, `/styling`, `Styling overview`, Copy],
  ]
  mount(SubpageGrid, {
    target: document.body,
    props: {
      title: `Demo`,
      subtitle: `Demo subtitle`,
      subpages,
      style: `max-width: 40rem`,
    },
  })

  expect(document.querySelector(`h1`)?.textContent).toBe(`Demo`)
  expect(document.querySelector(`.subtitle`)?.textContent).toBe(`Demo subtitle`)
  expect(document.querySelector(`.subpage-grid`)?.getAttribute(`style`)).toContain(
    `max-width: 40rem`,
  )

  const cards = [...document.querySelectorAll<HTMLAnchorElement>(`nav.grid a.card`)]
  expect(cards).toHaveLength(subpages.length)
  // whole table at once: a dropped card or swapped title/description shows up
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
      (icon ?? ChevronRight).d,
    ]),
  )
})

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

test(`fallback_icon replaces the default icon`, () => {
  mount(SubpageGrid, {
    target: document.body,
    props: {
      title: `Demo`,
      subtitle: `sub`,
      subpages: [
        [`Plain`, `/plain`, `no icon`],
        [`Explicit`, `/explicit`, `per-page icon`, Copy],
      ],
      fallback_icon: Check,
    },
  })

  expect(
    [...document.querySelectorAll(`svg.icon path`)].map((path) => path.getAttribute(`d`)),
  ).toEqual([Check.d, Copy.d])
})

// an href is a destination, not an identity: two cards may point at one page under
// different titles, and a bare href key would throw each_key_duplicate
test(`renders cards sharing an href`, () => {
  const subpages: [string, string, string][] = [
    [`Basics`, `/guide`, `Start here`],
    [`Advanced`, `/guide`, `Same page, deeper`],
  ]
  mount(SubpageGrid, {
    target: document.body,
    props: { title: `Demo`, subtitle: `Demo subtitle`, subpages },
  })

  expect(
    [...document.querySelectorAll(`nav.grid a.card h2`)].map((h2) => h2.textContent),
  ).toEqual([`Basics`, `Advanced`])
})
