import {
  heading_anchors,
  heading_anchor_html,
  slugify_heading,
  unique_heading_id,
} from '$lib/heading-anchors'
import Heading from '$lib/Heading.svelte'
import { createRawSnippet, flushSync, mount, unmount } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
import { describe, expect, it, onTestFinished } from 'vitest'
import { doc_query, stub_prop } from './index'

describe(`slugify_heading`, () => {
  // Unicode-preserving and NFC-normalized: IDs stay readable, equivalent spellings collide
  it.each([
    [`  Déjà vu / 東京  `, `déjà-vu-東京`],
    [`foo.bar`, `foo-bar`],
    [`foobar`, `foobar`],
    [`Cafe\u0301`, `café`],
    [`H\u0331`, `ẖ`],
    [`✨ ---`, ``],
  ])(`slugify_heading(%j) -> %j`, (input, expected) => {
    expect(slugify_heading(input)).toBe(expected)
  })

  it(`allocates and reserves suffixed collisions`, () => {
    const used_ids = new SvelteSet<string>()
    expect(
      [`foo`, `foo`, `foo-1`].map((base_id) => unique_heading_id(base_id, used_ids)),
    ).toEqual([`foo`, `foo-1`, `foo-1-1`])
    expect([...used_ids]).toEqual([`foo`, `foo-1`, `foo-1-1`])
    expect(unique_heading_id(``, new SvelteSet([`section`]))).toBe(`section-1`)
  })
})

describe(`Heading`, () => {
  it.each([1, 2, 6] as const)(
    `renders an explicit h%i with one encoded anchor`,
    (level) => {
      const component = mount(Heading, {
        target: document.body,
        props: {
          id: `a&b%20c`,
          level,
          children: createRawSnippet(() => ({ render: () => `<span>Diatomics</span>` })),
        },
      })
      onTestFinished(() => unmount(component))
      const heading = doc_query(`h${level}`)
      expect(heading.id).toBe(`a&b%20c`)
      expect(heading.textContent).toBe(`Diatomics`)
      expect(heading.querySelectorAll(`a`)).toHaveLength(1)
      expect(heading.querySelector(`a`)?.getAttribute(`href`)).toBe(`#a%26b%2520c`)
    },
  )
  it(`supports link-free headings and rejects missing identity`, () => {
    const component = mount(Heading, {
      target: document.body,
      props: { id: `title`, link: false },
    })
    onTestFinished(() => unmount(component))
    expect(doc_query(`h2`).querySelector(`a`)).toBeNull()
    expect(() =>
      flushSync(() => mount(Heading, { target: document.body, props: { id: ` ` } })),
    ).toThrow(`Heading requires a nonempty id`)
  })
})

describe(`heading_anchors attachment`, () => {
  // The opt-in dynamic attachment selects h1-h6 that are
  // direct or 2nd-level children of the attached node
  const create_container = (html = ``) => {
    document.body.innerHTML = `<main>${html}</main>`
    return doc_query(`main`)
  }
  const anchor_selector = `a[aria-hidden="true"]`
  const tick = () => new Promise((resolve) => void setTimeout(resolve, 0))

  it.each([`h2`, `h6`])(`adds anchor as last child of %s`, (tag: string) => {
    const container = create_container(`<${tag} id="test">T <span>x</span></${tag}>`)
    heading_anchors()(container)
    const anchor = container.querySelector(`${tag} ${anchor_selector}`)
    expect(anchor).toBeInstanceOf(HTMLAnchorElement)
    expect(anchor?.getAttribute(`href`)).toBe(`#test`)
    // appended after existing children rather than prepended or replacing them
    expect(container.querySelector(tag)?.lastElementChild).toBe(anchor)
  })

  it(`keeps managed anchors unique and synced without rewriting consumer links`, async () => {
    const container = create_container(
      `<h1 id="title">Title${heading_anchor_html(`title`)}</h1><h2 id="one">One</h2><h3 id="two">Two</h3>` +
        `<h4 id="consumer">Four<a aria-hidden="true" href="#custom">custom</a></h4>`,
    )
    const original_anchor = container.querySelector(`h1 a`)
    heading_anchors()(container)
    heading_anchors()(container) // call twice to test duplicate prevention
    const [managed_heading, consumer_heading] = container.querySelectorAll(`h1, h4`)
    expect(container.querySelector(`h1 a`)).toBe(original_anchor)
    managed_heading.id = `renamed%20&`
    consumer_heading.id = `changed`
    await tick()

    expect(
      [...container.querySelectorAll(anchor_selector)].map((anchor) =>
        anchor.getAttribute(`href`),
      ),
    ).toEqual([`#renamed%2520%26`, `#one`, `#two`, `#custom`])
  })

  it.each([
    [`sibling headings`, `<h2>Same</h2><h3>Same</h3>`, [`same`, `same-1`]],
    [
      `SSR placeholder with custom icon text`,
      `<h2>Title${heading_anchor_html(undefined, `<svg><text>Link</text></svg>`)}</h2>`,
      [`title`],
    ],
    [
      `Unicode sibling headings`,
      `<h2>Über Café</h2><h3>Über Café</h3>`,
      [`über-café`, `über-café-1`],
    ],
    [
      `duplicate colliding with a suffixed slug`,
      `<h2>Foo</h2><h3>Foo</h3><h2>Foo 1</h2>`,
      [`foo`, `foo-1`, `foo-1-1`],
    ],
    [
      `generated ID colliding with an existing element`,
      `<div id="same"></div><h2>Same</h2>`,
      [`same-1`],
    ],
    // a CSS ID selector can't start with a digit, so uniqueness must use getElementById
    [
      `digit-leading text (invalid as CSS ID selector)`,
      `<h2>2024 Roadmap</h2><h3>2024 Roadmap</h3>`,
      [`2024-roadmap`, `2024-roadmap-1`],
    ],
    // guards get_default_headings ordering: the direct child must be processed first, so
    // the duplicate suffix lands on the later sibling's grandchild
    [
      `direct child before a later sibling's grandchild`,
      `<h2>Dup</h2><div><h3>Dup</h3></div>`,
      [`dup`, `dup-1`],
    ],
  ])(`auto-generates unique ids: %s`, (_desc, html, expected_ids) => {
    const container = create_container(html)
    // a throw here fails the test on its own, so no not.toThrow() wrapper needed
    heading_anchors()(container)
    const ids = Array.from(container.querySelectorAll(`h2, h3`)).map((el) => el.id)
    expect(ids).toEqual(expected_ids)
    expect(container.querySelectorAll(anchor_selector)).toHaveLength(expected_ids.length)
  })

  it(`skips headings with no usable text`, () => {
    const container = create_container(`<h2></h2>`)
    heading_anchors()(container)
    const heading = doc_query(`h2`)
    expect(heading.querySelector(`a`)).toBeNull()
    expect(heading.id).toBe(``) // no id invented for text-less headings
  })

  it(`adds anchors to dynamically inserted headings`, async () => {
    const container = create_container()
    heading_anchors()(container)
    const wrapper = document.createElement(`div`)
    wrapper.innerHTML = `<h3 id="dynamic">X</h3>`
    container.append(wrapper)
    // the anchor must arrive via the observer callback, not synchronously
    expect(container.querySelector(anchor_selector)).toBeNull()
    await tick()
    expect(container.querySelector(`h3 ${anchor_selector}`)?.getAttribute(`href`)).toBe(
      `#dynamic`,
    )
  })

  it(`cleanup disconnects observer and stops processing`, async () => {
    const container = create_container()
    const cleanup = heading_anchors({ selector: `h2` })(container)

    // prove the observer is live first, else no anchors after cleanup proves nothing
    const before_cleanup = document.createElement(`h2`)
    before_cleanup.id = `before`
    container.append(before_cleanup)
    await tick()
    expect(before_cleanup.querySelector(anchor_selector)).not.toBeNull()

    cleanup?.()

    const heading = document.createElement(`h2`)
    heading.id = `after`
    container.append(heading)
    await tick()
    expect(heading.querySelector(anchor_selector)).toBeNull()
  })

  it(`custom selector filters headings`, () => {
    const container = create_container(
      `<h2 id="plain">Plain</h2><h2 id="anchored" class="anchored">Anchored</h2>`,
    )
    heading_anchors({ selector: `h2.anchored` })(container)
    expect(container.querySelector(`#plain ${anchor_selector}`)).toBeNull()
    expect(container.querySelector(`#anchored ${anchor_selector}`)).toBeInstanceOf(
      HTMLAnchorElement,
    )
  })

  it(`icon_svg customizes icon, default has aria-label`, () => {
    const container = create_container(`<h2 id="t1">T1</h2><h3 id="t2">T2</h3>`)
    heading_anchors({ selector: `#t1`, icon_svg: `<svg class="custom"></svg>` })(
      container,
    )
    heading_anchors({ selector: `#t2` })(container)
    expect(container.querySelector(`#t1 ${anchor_selector} .custom`)).toBeInstanceOf(
      Element,
    )
    // custom icon replaces the default one rather than being added alongside it
    expect(container.querySelectorAll(`#t1 svg`)).toHaveLength(1)
    expect(container.querySelector(`#t1 svg[aria-label]`)).toBeNull()
    expect(container.querySelector(`#t2 ${anchor_selector}`)?.innerHTML).toContain(
      `aria-label`,
    )
  })

  it(`returns undefined in SSR (no document)`, () => {
    const dummy = document.createElement(`div`)
    onTestFinished(stub_prop(globalThis, `document`, undefined))
    expect(heading_anchors()(dummy)).toBeUndefined()
  })

  const deeply_nested = `<div><section><h2 id="deep">X</h2></section></div>`
  it.each<[string, string, string | undefined, string | null]>([
    // the default selector uses :scope, so it reaches direct children and grandchildren only
    [`direct child`, `<h2 id="dc">X</h2>`, undefined, `#dc`],
    [`2nd-level (grandchild)`, `<div><h2 id="gc">X</h2></div>`, undefined, `#gc`],
    [`3rd-level (too deep)`, deeply_nested, undefined, null],
    [`3rd-level via custom selector`, deeply_nested, `h2`, `#deep`],
    // an explicit id is used verbatim, even when the heading text is only whitespace
    [`whitespace text with id`, `<h2 id="spaces">   </h2>`, undefined, `#spaces`],
  ])(`anchors a heading: %s`, (_desc, html, selector, expected_href) => {
    const container = create_container(html)
    heading_anchors({ selector })(container)
    const href = container.querySelector(anchor_selector)?.getAttribute(`href`) ?? null
    expect(href).toBe(expected_href)
  })
})
