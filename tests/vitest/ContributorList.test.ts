import ContributorList from '$lib/ContributorList.svelte'
import { mount, tick } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import { doc_query } from './index'

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
  const mount_list = async (props: Record<string, unknown> = {}) => {
    mount(ContributorList, { target: document.body, props: { contributors, ...props } })
    await tick()
  }
  const hover = (element: Element) => {
    element.dispatchEvent(
      new PointerEvent(`pointerover`, { bubbles: true, pointerType: `mouse` }),
    )
    vi.runAllTimers()
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
    expect([links[0].target, links[0].rel]).toEqual([`_blank`, `noopener noreferrer`])
    expect([avatars[0].alt, avatars[0].width, avatars[0].height]).toEqual([``, 60, 60])

    document.body.innerHTML = ``
    await mount_list({ contributors: [] })
    expect(document.querySelector(`ul`)).not.toBeNull()
    expect(document.querySelector(`li`)).toBeNull()
  })

  test(`hovering an avatar shows the login in a tooltip`, async () => {
    await mount_list()
    expect(document.querySelector(`.custom-tooltip`)).toBeNull()

    hover(doc_query(`ul li a`))
    expect(document.querySelectorAll(`.custom-tooltip`)).toHaveLength(1)
    expect(doc_query(`.tooltip-content`).textContent).toBe(`janosh`)
  })

  test(`tooltip_options reach the attachment`, async () => {
    await mount_list({ tooltip_options: { show_arrow: false, style: `color: teal` } })

    hover(doc_query(`ul li:last-child a`))
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
