import {
  decode_entities,
  fragment_href,
  has_heading_anchor,
  heading_anchors,
  heading_anchor_html,
  heading_text,
  slugify_heading,
  unique_heading_id,
} from '#lib/heading-anchors.ts'
import Heading from '#lib/Heading.svelte'
import { Check } from '#lib/icons.ts'
import { describe, expect, it, vi } from 'vite-plus/test'
import { doc_query, next_task, render, raw_snippet } from './index'

describe(`fragment_href`, () => {
  it.each([
    // fragment-legal characters stay literal so decodeURI-based matchers find the id
    [`fig:plot`, `#fig:plot`],
    [`a@b!$&'()*+,;=/?c`, `#a@b!$&'()*+,;=/?c`],
    [`dash-dot.under_tilde~`, `#dash-dot.under_tilde~`],
    // characters a fragment can't hold are percent-encoded
    [`two words`, `#two%20words`],
    [`a"b<c>d\`e`, `#a%22b%3Cc%3Ed%60e`],
    [`100%`, `#100%25`],
    [`a#b`, `#a#b`], // literal: decodeURI never restores %23
    [`übersicht`, `#%C3%BCbersicht`],
    [`a{b}`, `#a%7Bb%7D`], // inert in Svelte markup
  ])(`%s -> %s`, (id, expected) => {
    expect(fragment_href(id)).toBe(expected)
    // round-trips through the URL parser browsers use for location.hash
    expect(decodeURIComponent(new URL(expected, `https://x.test`).hash.slice(1))).toBe(id)
    // what SvelteKit's prerender crawler compares the id against
    expect(decodeURI(expected.slice(1))).toBe(id)
  })

  it(`replaces lone surrogates, which encodeURI rejects, like the URL serializer`, () => {
    expect(fragment_href(`x\uD800y`)).toBe(new URL(`#x\uD800y`, `https://x.test`).hash)
  })
})

describe(`decode_entities`, () => {
  const c1_codes = Array.from({ length: 32 }, (_, idx) => 0x80 + idx)
  it.each([
    [`a&amp;b &lt;c&gt;`, `a&b <c>`],
    [`&#123;x&#x7D;`, `{x}`],
    [`&unknown;`, `&unknown;`],
    // HTML maps these numeric references to U+FFFD, so manifest and DOM ids agree
    [`&#0;`, `\uFFFD`],
    [`&#xD800;`, `\uFFFD`],
    [`&#x110000;`, `\uFFFD`],
    // C1 references take their Windows-1252 meaning; undefined ones decode to themselves
    [
      c1_codes.map((code) => `&#x${code.toString(16)};`).join(``),
      new TextDecoder(`windows-1252`).decode(Uint8Array.from(c1_codes)),
    ],
    [`&#128;&#X9F;&#159;`, `€ŸŸ`],
  ])(`%s -> %s`, (html, expected) => {
    expect(decode_entities(html)).toBe(expected)
    const template = document.createElement(`template`)
    template.innerHTML = html
    expect(template.content.textContent).toBe(expected)
  })
})

describe(`heading_text`, () => {
  const tex = `<math><annotation encoding="application/x-tex">\\frac{a}{b} &amp; c</annotation></math>`
  it.each([
    // expressions drop out, including braces inside their JS strings
    [`Hello {name} world`, true, `Hello  world`],
    [`A {"}"} B {'{'} C {\`}\`} D {"\\"}"} E`, true, `A  B  C  D  E`],
    [`Open {unclosed`, true, `Open`],
    // tags drop out before decoding, so escaped tags stay text
    [`<em>a</em> &lt;b&gt; &#123;c&#125;`, true, `a <b> {c}`],
    [`{name} <b>x</b>`, false, `{name} x`],
    // a `>` in quotes, comments or expressions ends no tag, and a `<` in code opens none
    [`a <span title="b>c">d</span>`, false, `a d`],
    [`a <!-- b > c --> d`, false, `a  d`],
    [`a <span class={b > c ? 'x' : 'y'}>d</span>`, true, `a d`],
    [`a {b<c} <em>d</em>`, true, `a  d`],
    // braces in regex literals and comments aren't structural; `/` after an operand divides
    [`A {v && /[}]/.test(v) ? 'Yes' : 'No'} B {/if} C`, true, `A  B  C`],
    [`A {x /* } */ + 1} B {(a)/2} C`, true, `A  B  C`],
    // rendered math contributes its TeX source, other {@html} strings drop out
    [`E {@html ${JSON.stringify(tex)}}`, true, `E \\fracab & c`],
    [
      `{@html ${JSON.stringify(tex.replace(`&amp;`, `&lt;`))}} <em>d</em>`,
      true,
      `\\fracab < c d`,
    ],
    [`x {@html "<b>y</b>"} y {@html "\\x"} z`, true, `x  y  z`],
  ])(`heading_text(%j, %s) -> %j`, (inner, svelte, expected) => {
    expect(heading_text(inner, svelte)).toBe(expected)
  })
})

describe(`has_heading_anchor`, () => {
  it.each([
    [`<a aria-hidden="true" href="#x">`, true],
    [`<A ARIA-HIDDEN='true'>`, true],
    // a quoted `>` does not end the tag, and unquoted values count
    [`<a title="a > b" aria-hidden=true>`, true],
    [`x <a aria-hidden = "true">`, true],
    [`<a aria-hidden="false">`, false],
    [`<a aria-hidden>`, false],
    [`<a data-x="aria-hidden=true">`, false],
    [`<abbr aria-hidden="true">`, false],
    [`<span aria-hidden="true">`, false],
    [`<!-- <a aria-hidden="true"> -->`, false],
    // Svelte expressions cannot end the tag; plain HTML braces are literal
    [`<a onclick={() => go()} aria-hidden="true">`, true],
    [`<a data-x="{" aria-hidden="true" data-y="}">`, false],
    [`<a data-x="{" aria-hidden="true" data-y="}">`, true, false],
  ])(`has_heading_anchor(%j) -> %s`, (inner, expected, svelte = true) => {
    expect(has_heading_anchor(inner, svelte)).toBe(expected)
  })
})

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
    const used_ids = new Set<string>()
    expect(
      [`foo`, `foo`, `foo-1`].map((base_id) => unique_heading_id(base_id, used_ids)),
    ).toEqual([`foo`, `foo-1`, `foo-1-1`])
    expect([...used_ids]).toEqual([`foo`, `foo-1`, `foo-1-1`])
    expect(unique_heading_id(``, new Set([`section`]))).toBe(`section-1`)
  })
})

describe(`Heading`, () => {
  it(`escapes & as a character reference inside the anchor attribute`, () => {
    const template = document.createElement(`template`)
    template.innerHTML = heading_anchor_html(`a&lt;b`)
    // without &amp; the parser would decode `&lt;` and link to `#a<b`
    expect(template.content.querySelector(`a`)?.getAttribute(`href`)).toBe(`#a&lt;b`)
  })
  it.each([1, 2, 6] as const)(
    `renders an explicit h%i with one encoded anchor`,
    (level) => {
      render(Heading, {
        id: `a&b%20c`,
        level,
        icon: level === 2 ? Check : undefined,
        children: raw_snippet(`<span>Diatomics</span>`),
      })
      const heading = doc_query(`h${level}`)
      expect(heading.id).toBe(`a&b%20c`)
      expect(heading.textContent).toBe(`Diatomics`)
      expect(heading.querySelectorAll(`a`)).toHaveLength(1)
      expect(heading.querySelector(`a`)?.getAttribute(`href`)).toBe(`#a&b%2520c`)
      const icon = heading.querySelector(`:scope > svg`)
      if (level === 2) {
        expect(icon).toBe(heading.firstElementChild)
        expect(icon?.getAttribute(`aria-hidden`)).toBe(`true`)
        expect(icon?.querySelector(`path`)?.getAttribute(`d`)).toBe(Check.d)
      } else expect(icon).toBeNull()
    },
  )
  it(`supports link-free headings and rejects missing identity`, () => {
    render(Heading, { id: `title`, link: false, icon: Check })
    expect(doc_query(`h2`).querySelector(`a`)).toBeNull()
    expect(doc_query(`h2 > svg`).getAttribute(`aria-hidden`)).toBe(`true`)
    expect(() => render(Heading, { id: ` ` })).toThrow(`Heading requires a nonempty id`)
  })
})

describe(`heading_anchors attachment`, () => {
  const create_container = (html = ``) => {
    document.body.innerHTML = `<main>${html}</main>`
    return doc_query(`main`)
  }
  const anchor_selector = `a[aria-hidden="true"]`

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
    await next_task()

    expect(
      [...container.querySelectorAll(anchor_selector)].map((anchor) =>
        anchor.getAttribute(`href`),
      ),
    ).toEqual([`#renamed%2520&`, `#one`, `#two`, `#custom`])
    // managed anchors carry their gap from the heading text, consumer links are left alone
    expect(
      [...container.querySelectorAll<HTMLElement>(anchor_selector)].map(
        (anchor) => anchor.style.paddingInlineStart,
      ),
    ).toEqual([...Array(3).fill(`var(--heading-anchor-gap, 0.3em)`), ``])
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
    // guards default heading ordering: the direct child must be processed first, so
    // the duplicate suffix lands on the later sibling's grandchild
    [
      `direct child before a later sibling's grandchild`,
      `<h2>Dup</h2><div><h3>Dup</h3></div>`,
      [`dup`, `dup-1`],
    ],
  ])(`auto-generates unique ids: %s`, (_desc, html, expected_ids) => {
    const container = create_container(html)
    heading_anchors()(container)
    const ids = Array.from(container.querySelectorAll(`h2, h3`)).map((el) => el.id)
    expect(ids).toEqual(expected_ids)
    expect(container.querySelectorAll(anchor_selector)).toHaveLength(expected_ids.length)
  })

  it(`anchors dynamically inserted headings until cleanup`, async () => {
    const container = create_container()
    const cleanup = heading_anchors()(container)
    const insert_heading = async (id: string) => {
      container.insertAdjacentHTML(`beforeend`, `<div><h3 id="${id}">X</h3></div>`)
      // the anchor must arrive via the observer callback, not synchronously
      expect(container.querySelector(`#${id} ${anchor_selector}`)).toBeNull()
      await next_task()
      return container.querySelector(`#${id} ${anchor_selector}`)?.getAttribute(`href`)
    }

    expect(await insert_heading(`before`)).toBe(`#before`)
    // setting a heading's text replaces its anchor, which comes back
    const before = container.querySelector(`#before`)
    if (before) before.textContent = `Renamed`
    await next_task()
    expect(
      container.querySelector(`#before ${anchor_selector}`)?.getAttribute(`href`),
    ).toBe(`#before`)
    // an empty heading gets its anchor once text arrives
    container.insertAdjacentHTML(`beforeend`, `<div><h3 class="late"></h3></div>`)
    await next_task()
    const late = container.querySelector(`h3.late`)
    if (late) late.textContent = `Late`
    await next_task()
    expect(
      container.querySelector(`#late ${anchor_selector}`)?.getAttribute(`href`),
    ).toBe(`#late`)
    cleanup()
    expect(await insert_heading(`after`)).toBeUndefined()
  })

  // DOM churn without headings (a plot redrawing its marks) must not requery the container:
  // on a 75k-node page each requery cost ~0.5 ms of selector matching, ~90 ms per page load
  it(`skips the requery for mutations that touch no heading`, async () => {
    const container = create_container(`<section><h2 id="kept">Kept</h2></section>`)
    const selector = `:scope > * > h2`
    const cleanup = heading_anchors({ selector })(container)
    const query = vi.spyOn(container, `querySelectorAll`)
    const plot = document.createElement(`svg`)
    container.append(plot)
    for (let idx = 0; idx < 20; idx++) plot.append(document.createElement(`circle`))
    plot.id = `plot`
    await next_task()
    expect(query).not.toHaveBeenCalled()

    container.insertAdjacentHTML(
      `beforeend`,
      `<section><h2 id="added">Added</h2></section>`,
    )
    await next_task()
    expect(query).toHaveBeenCalledWith(selector)
    expect(
      container.querySelector(`#added ${anchor_selector}`)?.getAttribute(`href`),
    ).toBe(`#added`)
    cleanup()
  })

  it(`icon_svg customizes icon, default has aria-label`, () => {
    const container = create_container(`<h2 id="t1">T1</h2><h3 id="t2">T2</h3>`)
    heading_anchors({ selector: `#t1`, icon_svg: `<svg class="custom"></svg>` })(
      container,
    )
    heading_anchors({ selector: `#t2` })(container)
    expect(container.querySelector(`#t1 ${anchor_selector} .custom`)).not.toBeNull()
    // custom icon replaces the default one rather than being added alongside it
    expect(container.querySelectorAll(`#t1 svg`)).toHaveLength(1)
    expect(container.querySelector(`#t1 svg[aria-label]`)).toBeNull()
    expect(container.querySelector(`#t2 ${anchor_selector}`)?.innerHTML).toContain(
      `aria-label`,
    )
  })

  const deeply_nested = `<div><section><h2 id="deep">X</h2></section></div>`
  it.each<[string, string, string | undefined, string | null]>([
    // the default selector reaches h1-h6 among direct children and grandchildren only
    [`direct child`, `<h2 id="dc">X</h2>`, undefined, `#dc`],
    [`2nd-level (grandchild)`, `<div><h2 id="gc">X</h2></div>`, undefined, `#gc`],
    [`3rd-level (too deep)`, deeply_nested, undefined, null],
    [`3rd-level via custom selector`, deeply_nested, `h2`, `#deep`],
    // an explicit id is used verbatim, even when the heading text is only whitespace
    [`whitespace text with id`, `<h2 id="spaces">   </h2>`, undefined, `#spaces`],
    [`text-less heading without id`, `<h2></h2>`, undefined, null],
    // headings inside interactive elements or opted out stay unlinked
    [`inside a link`, `<a href="/x"><h2 id="in-link">X</h2></a>`, undefined, null],
    [`inside a button`, `<button><h2>X</h2></button>`, undefined, null],
    [`opted out`, `<h2 id="out" data-heading-anchor="false">X</h2>`, undefined, null],
    [`h6 with children`, `<h6 id="test">T <span>x</span></h6>`, undefined, `#test`],
    [
      `custom selector skipping other headings`,
      `<h2 id="plain">Plain</h2><h2 id="anchored" class="anchored">Anchored</h2>`,
      `h2.anchored`,
      `#anchored`,
    ],
  ])(`anchors a heading: %s`, (_desc, html, selector, expected_href) => {
    const container = create_container(html)
    heading_anchors({ selector })(container)
    const anchor = container.querySelector(anchor_selector)
    expect(anchor?.getAttribute(`href`) ?? null).toBe(expected_href)
    // appended after existing children rather than prepended or replacing them
    if (anchor) expect(anchor.parentElement?.lastElementChild).toBe(anchor)
  })
})
