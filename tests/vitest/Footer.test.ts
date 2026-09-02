import Footer from '$lib/Footer.svelte'
import { GitHub } from '$lib/icons'
import type { FooterLink } from '$lib/types'
import { createRawSnippet, mount } from 'svelte'
import { describe, expect, test } from 'vite-plus/test'
import { doc_query } from './index'

describe(`Footer`, () => {
  const raw = (html: string) => createRawSnippet(() => ({ render: () => html }))
  const mount_footer = (props: Record<string, unknown> = {}) =>
    mount(Footer, { target: document.body, props })
  const anchors = () =>
    Array.from(document.querySelectorAll<HTMLAnchorElement>(`footer nav a`))

  test.each([
    [`plain link`, { href: `/changelog`, label: `Changelog` }, false, null, null, null],
    [
      `icon link`,
      { href: `/repo`, label: `GitHub`, icon: GitHub },
      true,
      null,
      null,
      null,
    ],
    [
      `external link`,
      { href: `https://example.com`, label: `Docs`, external: true },
      false,
      `_blank`,
      `noopener noreferrer`,
      null,
    ],
    [
      `titled link`,
      { href: `/rss.xml`, label: `RSS`, title: `Be notified of new releases` },
      false,
      null,
      null,
      `Be notified of new releases`,
    ],
  ] as [string, FooterLink, boolean, string | null, string | null, string | null][])(
    `renders a %s`,
    (_desc, link, has_icon, target, rel, title) => {
      mount_footer({ links: [link] })

      const anchor = doc_query<HTMLAnchorElement>(`footer nav a`)
      expect(anchor.getAttribute(`href`)).toBe(link.href)
      expect(anchor.textContent?.trim()).toBe(link.label)
      expect(Boolean(anchor.querySelector(`svg`))).toBe(has_icon)
      expect(anchor.getAttribute(`target`)).toBe(target)
      expect(anchor.getAttribute(`rel`)).toBe(rel)
      expect(anchor.getAttribute(`title`)).toBe(title)
    },
  )

  test(`renders every link in order and drops the nav when there are none`, () => {
    const links: FooterLink[] = [
      { href: `/issues`, label: `Issues` },
      { href: `/contact`, label: `Contact` },
      { href: `/changelog`, label: `Changelog` },
    ]
    mount_footer({ links })
    expect(anchors().map((anchor) => anchor.getAttribute(`href`))).toEqual([
      `/issues`,
      `/contact`,
      `/changelog`,
    ])

    document.body.innerHTML = ``
    mount_footer()
    expect(document.querySelector(`footer`)).not.toBeNull()
    expect(document.querySelector(`footer nav`)).toBeNull()
  })

  // href is no identity: two links may point at one page under different labels, and a
  // colliding each key would throw each_key_duplicate, taking down the whole nav
  test(`renders links sharing an href`, () => {
    mount_footer({
      links: [
        { href: `/repo`, label: `GitHub`, icon: GitHub },
        { href: `/repo`, label: `Source` },
      ],
    })

    expect(anchors().map((anchor) => anchor.textContent?.trim())).toEqual([
      `GitHub`,
      `Source`,
    ])
  })

  test(`renders children after the nav in source order`, () => {
    mount_footer({
      links: [{ href: `/issues`, label: `Issues` }],
      children: raw(
        `<small><img src="/favicon.svg" alt="Logo" /><span data-testid="copyright">© 2026</span></small>`,
      ),
    })

    const kids = Array.from(doc_query(`footer`).children).map((el) => el.tagName)
    expect(kids).toEqual([`NAV`, `SMALL`])
    expect(doc_query(`[data-testid="copyright"]`).textContent).toBe(`© 2026`)
  })

  test(`an item snippet replaces the default anchor`, () => {
    const item = createRawSnippet<[{ link: FooterLink }]>((get_params) => ({
      render: () => `<a href="${get_params().link.href}" data-custom>custom</a>`,
    }))
    mount_footer({
      links: [{ href: `/issues`, label: `Issues`, icon: GitHub }],
      item,
    })

    expect(anchors().map((anchor) => anchor.textContent)).toEqual([`custom`])
    expect(doc_query(`footer nav a`).hasAttribute(`data-custom`)).toBe(true)
    expect(document.querySelector(`footer svg`)).toBeNull()
  })
})
