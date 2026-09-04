import { GitHubCorner } from '$lib'
import { mount } from 'svelte'
import { expect, test } from 'vitest'
import { doc_query } from './index'

const default_expected = {
  aria_label: `View code on GitHub`,
  class_name: `top-right`,
  color: ``,
  fill: ``,
  target: `_self`,
  title: `View code on GitHub`,
}

test.each([
  [`default props`, {}, {}],
  [
    `custom props`,
    {
      aria_label: `Repo`,
      color: `red`,
      corner: `top-left`,
      fill: `blue`,
      target: `_blank`,
      title: `Source`,
    },
    {
      aria_label: `Repo`,
      class_name: `top-left`,
      color: `red`,
      fill: `blue`,
      target: `_blank`,
      title: `Source`,
    },
  ],
  // with both defaults, aria-label and title coincide, so nothing pins the fallback
  [
    `custom title without aria_label`,
    { title: `Source` },
    {
      aria_label: `Source`,
      title: `Source`,
    },
  ],
] as const)(
  `GitHubCorner renders link with svg and %s`,
  (_label, props, expected_props) => {
    const href = `https://github.com/foo/bar`
    const expected = { ...default_expected, ...expected_props }
    mount(GitHubCorner, { target: document.body, props: { href, ...props } })
    const link = doc_query<HTMLAnchorElement>(`a`)
    expect(link.getAttribute(`href`)).toBe(href)
    expect(link.getAttribute(`aria-label`)).toBe(expected.aria_label)
    expect(link.classList.contains(expected.class_name)).toBe(true)
    expect(link.style.color).toBe(expected.color)
    expect(link.style.fill).toBe(expected.fill)
    expect(link.target).toBe(expected.target)
    expect(link.title).toBe(expected.title)
    expect(link.querySelector(`svg`)).toBeInstanceOf(SVGElement)
    expect(getComputedStyle(link).clipPath).toBe(`polygon(0 0, 100% 0, 100% 100%)`)
  },
)
