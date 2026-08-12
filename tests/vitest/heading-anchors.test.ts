import {
  heading_anchors,
  heading_ids,
  slugify_heading,
  unique_heading_id,
} from '$lib/heading-anchors'
import { SvelteSet } from 'svelte/reactivity'
import { describe, expect, it } from 'vite-plus/test'
import { doc_query } from './index'

const preprocess = (content: string, filename?: string) =>
  heading_ids().markup({ content, filename })

describe(`slugify_heading`, () => {
  // Compatibility is intentionally Unicode-preserving and NFC-normalized: fragment IDs
  // stay readable, and canonically equivalent spellings still collide as duplicates.
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

describe(`heading_ids preprocessor`, () => {
  // exact VLQ mappings; a lone `AAAA` per line is the identity map for unshifted text
  it.each([
    [`<h2>A</h2>\n<h2>B</h2>`, `AAAA,GAAG,OAAA,OAAO;AACV,GAAG,OAAA,OAAO`],
    [`<div>\n  <h2>N</h2>\n</div>`, `AAAA;AACA,KAAK,OAAA,OAAO;AACZ`],
    [`<p>no heading</p>\n<span>x</span>`, `AAAA;AACA`], // headingless fast path
  ])(`maps original markup before and after inserted IDs in %j`, (source, mappings) => {
    expect(preprocess(source, `Heading.svelte`).map).toEqual({
      version: 3,
      names: [],
      sources: [`Heading.svelte`],
      sourcesContent: [source],
      mappings,
    })
  })

  it.each([
    [`<h6>Sixth Level</h6>`, `<h6 id="sixth-level">Sixth Level</h6>`],
    [`<h1>Title</h1>`, `<h1 id="title">Title</h1>`],
    [`<h2>✨ Styling</h2>`, `<h2 id="styling">✨ Styling</h2>`], // emoji stripped
    [
      `<h2>Multi\nLine\nContent</h2>`,
      `<h2 id="multi-line-content">Multi\nLine\nContent</h2>`,
    ],
    // existing attributes are preserved, the id is inserted first
    [`<h2 data-id="foo">Hello</h2>`, `<h2 id="hello" data-id="foo">Hello</h2>`],
    [
      `<h2 on:click={handler}>Clickable</h2>`,
      `<h2 id="clickable" on:click={handler}>Clickable</h2>`,
    ],
    [
      `<h2 data-label="left > right">Quoted</h2>`,
      `<h2 id="quoted" data-label="left > right">Quoted</h2>`,
    ],
    [
      `</p><h3 title='left > right'>Inline</h3>`,
      `</p><h3 id="inline" title='left > right'>Inline</h3>`,
    ],
    [
      `<h2 title="contains id=foo">Visible</h2>`,
      `<h2 id="visible" title="contains id=foo">Visible</h2>`,
    ],
    [
      `<h2 class={condition ? "id=foo" : "other"}>Visible</h2>`,
      `<h2 id="visible" class={condition ? "id=foo" : "other"}>Visible</h2>`,
    ],
    [
      `<h2>{@html "<span>{</span>"} Details</h2>`,
      `<h2 id="details">{@html "<span>{</span>"} Details</h2>`,
    ],
    // Svelte expressions are stripped from the slug source but kept in the markup
    [`<h2>{first} and {second}</h2>`, `<h2 id="and">{first} and {second}</h2>`],
    [
      `<h2>Result {fn({a: {b: {c: 1}}})}</h2>`,
      `<h2 id="result">Result {fn({a: {b: {c: 1}}})}</h2>`,
    ],
    // unmatched } treated as literal (not dropped) to avoid losing content when depth would go negative
    [`<h2>Price: $100}</h2>`, `<h2 id="price-100">Price: $100}</h2>`],
    // inline headings (mdsvex output)
    [`</p> <h2>Title</h2>`, `</p> <h2 id="title">Title</h2>`],
    [
      `</p><h2>First</h2></section><h3>Second</h3>`,
      `</p><h2 id="first">First</h2></section><h3 id="second">Second</h3>`,
    ],
    [
      `</p><h2>First</h2><h2>Second</h2>`,
      `</p><h2 id="first">First</h2><h2 id="second">Second</h2>`,
    ],
    // text of nested HTML tags contributes to the slug
    [
      `<h2>Using <code>someFunction</code></h2>`,
      `<h2 id="using-somefunction">Using <code>someFunction</code></h2>`,
    ],
  ])(`%s → %s`, (input: string, expected: string) => {
    expect(preprocess(input).code).toBe(expected)
  })

  it.each([
    `<h2 id="">Empty ID</h2>`, // an existing id, even empty, is never replaced
    `<h2 id=>Malformed ID</h2>`,
    `<h2 class="test" id="existing" data-foo="bar">Text</h2>`,
    `<h2>{dynamicOnly}</h2>`, // no static text → no id
    `<h2><span></span></h2>`,
    // leading } preserved in text, but after stripping {test} only } remains which slugifies to empty
    `<h2>}{test}</h2>`,
  ])(`leaves %s unchanged`, (input: string) => {
    expect(preprocess(input).code).toBe(input)
  })

  it.each([
    [`HTML comments`, `<!-- <div id="same"></div><h2>Comment heading</h2> -->`, `same`],
    [`pre`, `<pre><h2>Code sample heading</h2><div id="same"></div></pre>`, `same-1`],
    [
      `script`,
      `<script>const html = '<div id="same"></div><h2>Template heading</h2>'</script>`,
      `same`,
    ],
    [
      `style`,
      `<style>.x::after { content: '<div id="same"></div>' } /* <h2>CSS heading</h2> */</style>`,
      `same`,
    ],
    [
      `textarea`,
      `<textarea><div id="same"></div><h2>Textarea content</h2></textarea>`,
      `same`,
    ],
    [`title`, `<title><div id="same"></div><h2>Title content</h2></title>`, `same`],
  ])(
    `skips headings and handles IDs inside %s`,
    (_label, excluded_content, visible_id) => {
      const source = `${excluded_content}\n<h2>Same</h2>`
      expect(preprocess(source, `Protected.svelte`).code).toBe(
        `${excluded_content}\n<h2 id="${visible_id}">Same</h2>`,
      )
    },
  )

  it.each([`pre`, `script`, `style`, `textarea`, `title`])(
    `does not treat %s-prefixed custom elements as excluded content`,
    (tag) => {
      const custom_tag = `${tag}-custom`
      const source =
        `<${custom_tag}><h2>Visible</h2></${custom_tag}>` +
        `<${tag}><h2>Hidden</h2></${tag}>`
      expect(preprocess(source).code).toBe(
        `<${custom_tag}><h2 id="visible">Visible</h2></${custom_tag}>` +
          `<${tag}><h2>Hidden</h2></${tag}>`,
      )
    },
  )

  it(`handles duplicate headings with -1, -2 suffixes`, () => {
    const result = preprocess(
      `<h2>Foo</h2>\n<h2>Foo</h2>\n<h3>Foo 1</h3>\n<h2>Foo</h2>\n<h2>Bar</h2>\n<h2>Café</h2>\n<h2>Cafe\u0301</h2>`,
    )
    // The already-suffixed Foo 1 cannot collide with the duplicate Foo's `foo-1`.
    // NFC normalization also makes decomposed `Cafe\u0301` a duplicate of `Café`.
    expect(result.code).toBe(
      `<h2 id="foo">Foo</h2>\n<h2 id="foo-1">Foo</h2>\n<h3 id="foo-1-1">Foo 1</h3>\n` +
        `<h2 id="foo-2">Foo</h2>\n<h2 id="bar">Bar</h2>\n<h2 id="café">Café</h2>\n` +
        `<h2 id="café-1">Cafe\u0301</h2>`,
    )
  })

  it.each([
    [`<div id="same"></div>\n<h2>Same</h2>`, `same-1`],
    [`<h2>Foo</h2>\n<custom-card id="foo"></custom-card>`, `foo-1`],
    [`<script id="same"></script>\n<h2>Same</h2>`, `same-1`],
    [`<script id="same"></script><h2>Same</h2>`, `same-1`], // id on excluded host; abutting end
  ])(`reserves static element IDs before generating headings`, (source, expected_id) => {
    expect(preprocess(source).code).toBe(
      source.replace(`<h2>`, `<h2 id="${expected_id}">`),
    )
  })
})

describe(`heading_anchors attachment`, () => {
  // production attaches to <main>; the default selector uses :scope so headings are
  // matched relative to the attached node (h1-h6 as direct or 2nd-level children)
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
      `<h1 id="title">Title</h1><h2 id="one">One</h2><h3 id="two">Two</h3>` +
        `<h4 id="consumer">Four<a aria-hidden="true" href="#custom">custom</a></h4>`,
    )
    heading_anchors()(container)
    heading_anchors()(container) // call twice to test duplicate prevention
    const [managed_heading, consumer_heading] = container.querySelectorAll(`h1, h4`)
    managed_heading.id = `renamed`
    consumer_heading.id = `changed`
    await tick()

    expect(
      [...container.querySelectorAll(anchor_selector)].map((anchor) =>
        anchor.getAttribute(`href`),
      ),
    ).toEqual([`#renamed`, `#one`, `#two`, `#custom`])
  })

  it.each([
    [`sibling headings`, `<h2>Same</h2><h3>Same</h3>`, [`same`, `same-1`]],
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
    // querySelector('#2024-roadmap') throws SyntaxError since CSS ID selectors
    // can't start with an unescaped digit - uniqueness check must use getElementById
    [
      `digit-leading text (invalid as CSS ID selector)`,
      `<h2>2024 Roadmap</h2><h3>2024 Roadmap</h3>`,
      [`2024-roadmap`, `2024-roadmap-1`],
    ],
    // guards get_default_headings ordering: a direct-child heading must be processed
    // before a grandchild in a later sibling, so the duplicate suffix lands on the grandchild
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

    // prove the observer is live first, else the absence of anchors after cleanup
    // is equally explained by the attachment never having worked
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
    const original = globalThis.document
    Object.defineProperty(globalThis, `document`, {
      value: undefined,
      configurable: true,
    })
    try {
      expect(heading_anchors()(dummy)).toBeUndefined()
    } finally {
      Object.defineProperty(globalThis, `document`, {
        value: original,
        configurable: true,
      })
    }
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
