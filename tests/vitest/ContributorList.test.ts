import ContributorList from '$lib/ContributorList.svelte'
import { type ComponentProps, mount, tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { doc_query, hover } from './index'

describe(`ContributorList`, () => {
  const contributors = [
    {
      login: `janosh`,
      avatar_url: `https://avatars.gh/1`,
      html_url: `https://gh/janosh`,
    },
    {
      login: `octocat`,
      avatar_url: `https://avatars.gh/2`,
      html_url: `https://gh/octocat`,
    },
  ]
  // attachments are applied in an effect, so the tooltip isn't live until a flush
  const mount_list = async (
    props: Partial<ComponentProps<typeof ContributorList>> = {},
  ) => {
    mount(ContributorList, { target: document.body, props: { contributors, ...props } })
    await tick()
  }
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  test(`renders one linked avatar per contributor`, async () => {
    await mount_list()

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

  test(`hovering an avatar shows the login in a tooltip`, async () => {
    await mount_list()
    expect(document.querySelector(`.custom-tooltip`)).toBeNull()

    hover(doc_query(`ul li a`))
    vi.runAllTimers()
    expect(doc_query(`.tooltip-content`).textContent).toBe(`janosh`)
  })

  test(`tooltip_options reach the attachment`, async () => {
    await mount_list({ tooltip_options: { show_arrow: false, style: `color: teal` } })

    hover(doc_query(`ul li:last-child a`))
    vi.runAllTimers()
    expect(doc_query(`.tooltip-content`).textContent).toBe(`octocat`)
    expect(doc_query(`.custom-tooltip`).style.color).toBe(`teal`)
    expect(document.querySelector(`.custom-tooltip-arrow`)).toBeNull()
  })

  // sizing only the width would leave the 60px height attribute, i.e. an oval avatar
  test(`--contributor-avatar-size drives both avatar dimensions`, async () => {
    await mount_list({ style: `--contributor-avatar-size: 40px` })

    const { width, height, borderRadius } = getComputedStyle(doc_query(`ul li img`))
    expect([width, height, borderRadius]).toEqual([`40px`, `40px`, `50%`])
  })
})
