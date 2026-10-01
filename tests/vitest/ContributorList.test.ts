import ContributorList from '$lib/ContributorList.svelte'
import type { ComponentProps } from 'svelte'
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import { doc_query, hover, render } from './index'

describe(`ContributorList`, () => {
  const contributors = [`janosh`, `octocat`].map((login, idx) => ({
    login,
    avatar_url: `https://avatars.gh/${idx + 1}`,
    html_url: `https://gh/${login}`,
  }))
  const mount_list = (props: Partial<ComponentProps<typeof ContributorList>> = {}) =>
    render(ContributorList, { contributors, ...props })
  beforeEach(() => vi.useFakeTimers())

  test(`renders one linked avatar per contributor`, () => {
    mount_list()

    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>(`ul li a`))
    const avatars = Array.from(document.querySelectorAll<HTMLImageElement>(`ul li img`))
    // the login names the link, since the avatar it wraps is decorative
    expect(links.map((link) => [link.href, link.getAttribute(`aria-label`)])).toEqual([
      [`https://gh/janosh`, `janosh`],
      [`https://gh/octocat`, `octocat`],
    ])
    expect(avatars.map((img) => img.getAttribute(`src`))).toEqual([
      `https://avatars.gh/1`,
      `https://avatars.gh/2`,
    ])
    // chrome shared by every row: profiles are off-site, and an intrinsic size keeps
    // lazy avatars from reflowing the row as they land
    const { target, rel } = links[0]
    const { alt, width, height, loading } = avatars[0]
    expect([target, rel]).toEqual([`_blank`, `noopener noreferrer`])
    expect([alt, width, height, loading]).toEqual([``, 60, 60, `lazy`])
  })

  test(`hovering an avatar shows its login with tooltip_options applied`, () => {
    mount_list({ tooltip_options: { show_arrow: false, style: `color: teal` } })
    expect(document.querySelector(`.custom-tooltip`)).toBeNull()

    hover(doc_query(`ul li:last-child a`))
    vi.runAllTimers()
    expect(doc_query(`.tooltip-content`).textContent).toBe(`octocat`)
    expect(doc_query(`.custom-tooltip`).style.color).toBe(`teal`)
    expect(document.querySelector(`.custom-tooltip-arrow`)).toBeNull()
  })

  // sizing only the width would leave the 60px height attribute, i.e. an oval avatar
  test(`--contributor-avatar-size drives both avatar dimensions`, () => {
    mount_list({ style: `--contributor-avatar-size: 40px` })

    const { width, height, borderRadius } = getComputedStyle(doc_query(`ul li img`))
    expect([width, height, borderRadius]).toEqual([`40px`, `40px`, `50%`])
  })
})
