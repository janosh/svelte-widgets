import Toc from '$lib/Toc.svelte'
import type { CollapseMode, OpenChangeHandler } from '$lib/types'
import type { ComponentProps } from 'svelte'
import { createRawSnippet, mount, tick, unmount } from 'svelte'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vite-plus/test'
import { doc_query } from './index'

type TocProps = ComponentProps<typeof Toc>

const mounted_components: Record<string, unknown>[] = []

// mounts into document.body and registers for teardown in afterEach
const mount_toc = (props: TocProps = {}) => {
  mounted_components.push(mount(Toc, { target: document.body, props }))
}

const set_body = (html: string) => {
  document.body.innerHTML = html
}

const setup_empty_page = () =>
  set_body(`<h1>H1</h1><h2 class="toc-exclude">H2</h2><h5>H5</h5>`)

// `Heading 1`..`Heading n` as h2s with matching `heading-n` ids, the shape most
// interaction tests want. happy-dom gives every heading top=0, so the last one starts active.
const set_headings = (count: number) =>
  set_body(
    Array.from(
      { length: count },
      (_, idx) => `<h2 id="heading-${idx + 1}">Heading ${idx + 1}</h2>`,
    ).join(``),
  )

const set_window_width = (width: number) => {
  globalThis.innerWidth = width
  globalThis.dispatchEvent(new Event(`resize`))
}

const scroll = async () => {
  globalThis.dispatchEvent(new Event(`scroll`))
  await tick()
}

const ensure_content_for_toc_elements = (
  headings = [`<h2>Content Heading 1</h2>`, `<h3>Content Heading 2</h3>`],
) => set_body(headings.join(`\n`))

const setup_nested_headings = () =>
  set_body(`
      <h2 id="section-1">Section 1</h2>
      <h3 id="sub-1-1">Sub 1.1</h3>
      <h4 id="detail-1-1-1">Detail 1.1.1</h4>
      <h4 id="detail-1-1-2">Detail 1.1.2</h4>
      <h3 id="sub-1-2">Sub 1.2</h3>
      <h4 id="detail-1-2-1">Detail 1.2.1</h4>
      <h2 id="section-2">Section 2</h2>
      <h3 id="sub-2-1">Sub 2.1</h3>
    `)

// only top/bottom/left/right matter to the component, so derive the rest from those.
// bottom/right collapse onto top/left rather than 0, since a negative width or height
// makes DOMRect normalize by swapping the edges back.
const dom_rect = ({
  top = 0,
  left = 0,
  bottom = top,
  right = left,
}: Partial<DOMRect> = {}) =>
  DOMRect.fromRect({ x: left, y: top, width: right - left, height: bottom - top })

// Mock scroll position to make a specific heading "active" (scrolled past viewport top)
const mock_active_heading = (active_id: string) => {
  const headings = Array.from(document.querySelectorAll(`h2, h3, h4`))
  const active_idx = headings.findIndex((heading) => heading.id === active_id)
  headings.forEach((heading, idx) => {
    // Active heading and all before it are scrolled past (negative top)
    const top =
      idx <= active_idx ? -10 * (active_idx - idx + 1) : 100 * (idx - active_idx)
    vi.spyOn(heading, `getBoundingClientRect`).mockReturnValue(dom_rect({ top }))
  })
}

const toc_texts = () =>
  Array.from(document.querySelectorAll(`aside.toc > nav > ol > li`), (li) =>
    li.textContent.trim(),
  )

const get_collapsed_states = () =>
  Array.from(document.querySelectorAll(`aside.toc > nav > ol > li`)).map((li) =>
    li.classList.contains(`collapsed`),
  )

const find_matching_css_selector = (style_text: string, declaration_pattern: RegExp) => {
  for (const { groups } of style_text.matchAll(
    /(?<selector>[^{}]+)\{(?<block>[^{}]+)\}/g,
  )) {
    // every component's CSS lands in the same head here, so a generic declaration like
    // `box-sizing: border-box` would otherwise match a neighbor's rule first
    if (!groups?.selector.includes(`toc`)) continue
    if (declaration_pattern.test(groups.block)) return groups.selector.trim()
  }
  throw new Error(`No CSS block matched ${declaration_pattern}`)
}

beforeAll(() => {
  // Mock enough of the animate API for Svelte transitions.
  Object.defineProperty(Element.prototype, `animate`, {
    configurable: true,
    value: vi.fn<() => { cancel: () => void }>(() => ({ cancel: vi.fn<() => void>() })),
  })
})

// Svelte merges `style:` directives and a spread `style` into one cssText write, and
// happy-dom drops any declaration whose value holds a var() with a fallback, which is how
// Toc expresses indent and font size. The element never shows those styles, so record the
// strings Svelte writes and assert on those instead.
const style_prototype = Object.getPrototypeOf(document.createElement(`div`).style)
const css_text_property = Object.getOwnPropertyDescriptor(style_prototype, `cssText`)
if (!css_text_property?.set) throw new Error(`cssText is not a setter on this DOM`)
const native_css_text_setter = css_text_property.set
let written_css_texts: string[] = []

beforeEach(() => {
  // the shared setup only clears the body, and Toc reads innerWidth for desktop vs mobile
  globalThis.innerWidth = 1024
  written_css_texts = []
  Object.defineProperty(style_prototype, `cssText`, {
    ...css_text_property,
    set(this: CSSStyleDeclaration, value: string) {
      written_css_texts.push(value)
      native_css_text_setter.call(this, value)
    },
  })
})
afterEach(() => {
  Object.defineProperty(style_prototype, `cssText`, css_text_property)
})

// every declaration Svelte wrote for `property`, newest last
const written_style_values = (property: string) =>
  written_css_texts
    .flatMap((css_text) => css_text.split(`;`))
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration.startsWith(`${property}:`))

afterEach(async () => {
  await Promise.all(mounted_components.splice(0).map((component) => unmount(component)))
  vi.restoreAllMocks()
})

describe(`Toc`, () => {
  test(`renders default title element`, () => {
    mount_toc({ title: `Custom title` })

    const title_node = doc_query(`h2`)
    expect(title_node.textContent).toBe(`Custom title`)
    expect(title_node.classList.contains(`toc-title`)).toBe(true)
    expect(title_node.classList.contains(`toc-exclude`)).toBe(true)
  })

  // undefined headingSelector exercises the component default of `:is(h2, h3, h4)`
  test.each([
    [undefined, [0, 1, 2].map((lvl) => `Heading ${lvl + 2}`)],
    [
      `body > :is(h1, h2, h3, h4, h5, h6)`,
      Array.from({ length: 5 }, (_, lvl) => `Heading ${lvl + 2}`),
    ],
    [`h1`, []],
  ])(
    `ToC lists expected headings for headingSelector='%s'`,
    async (headingSelector, expected_text) => {
      set_body(`
      <h1 class="toc-exclude">Heading 1</h1>
      <h2>Heading 2</h2>
      <h3>Heading 3</h3>
      <h4>Heading 4</h4>
      <h5>Heading 5</h5>
      <h6>Heading 6</h6>
    `)

      mount_toc({ headingSelector })
      await tick()

      const toc_list = doc_query(`aside.toc > nav > ol`)
      expect(toc_list.children).toHaveLength(expected_text.length)
      expect(toc_list.textContent.trim()).toBe(expected_text.join(``))
    },
  )

  test.each([
    [`default exclusion`, `toc-exclude`, {}, [`Included heading`]],
    [
      `custom exclusion`,
      `skip-toc`,
      { excludeSelector: `.skip-toc` },
      [`Included heading`],
    ],
    [
      `disabled exclusion`,
      `toc-exclude`,
      { excludeSelector: `` },
      [`Excluded child heading`, `Excluded nested heading`, `Included heading`],
    ],
  ])(
    `%s with custom headingSelector`,
    async (_test_case, class_name, props, expected_headings) => {
      set_body(`
      <section class="${class_name}">
        <h2>Excluded child heading</h2>
        <div><h3>Excluded nested heading</h3></div>
      </section>
      <h2>Included heading</h2>
    `)

      mount_toc({ headingSelector: `:is(h2, h3)`, ...props })
      await tick()

      const toc_list = doc_query(`aside.toc > nav > ol`)
      expect(toc_list.children).toHaveLength(expected_headings.length)
      expect(toc_list.textContent.trim()).toBe(expected_headings.join(``))
    },
  )

  test(`getHeadingData customizes listed headings`, async () => {
    set_body(`<h2>Keep</h2><h3>Skip</h3>`)
    const replace_state_mock = vi.spyOn(history, `replaceState`)
    mount_toc({
      getHeadingData: (node: HTMLHeadingElement) =>
        node.textContent === `Skip` ? null : { id: `custom`, level: 2, title: `Custom` },
      headingSelector: `:is(h2, h3)`,
    })
    await tick()

    const toc_items = document.querySelectorAll(`aside.toc li`)
    expect(toc_items).toHaveLength(1)
    const toc_item = toc_items[0]
    expect(toc_item.textContent).toBe(`Custom`)
    expect(doc_query(`body > h2`).id).toBe(`custom`)
    expect(toc_item.querySelector(`a`)?.getAttribute(`href`)).toBe(`#custom`)
    expect(document.querySelector(`#custom`)).toBe(doc_query(`body > h2`))

    toc_item.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(replace_state_mock).toHaveBeenCalledWith({}, ``, `#custom`)
  })

  test(`replaceState uses the raw id while the link href is URL-encoded`, async () => {
    set_body(`<h2 id="sec:1">Section</h2>`)
    const replace_state_mock = vi.spyOn(history, `replaceState`)
    vi.spyOn(Element.prototype, `scrollIntoView`).mockImplementation(() => {})

    mount_toc()
    await tick()

    // the <a href> is a valid percent-encoded URL string
    expect(doc_query(`aside.toc li > a`).getAttribute(`href`)).toBe(`#sec%3A1`)

    // but the history fragment must match the DOM id exactly (no encoding) so it resolves
    // directly via getElementById rather than the browser's percent-decode fallback
    doc_query(`aside.toc li > a`).dispatchEvent(
      new MouseEvent(`click`, { bubbles: true }),
    )
    expect(replace_state_mock).toHaveBeenCalledWith({}, ``, `#sec:1`)
  })

  test(`existing heading ids stay the fragment target over getHeadingData ids`, async () => {
    set_body(`<h2 id="real">Keep</h2>`)

    mount_toc({
      getHeadingData: (node: HTMLHeadingElement) => ({
        id: `custom`,
        level: 2,
        title: node.textContent ?? ``,
      }),
    })
    await tick()

    expect(doc_query(`body > h2`).id).toBe(`real`)
    expect(doc_query(`aside.toc li > a`).getAttribute(`href`)).toBe(`#real`)
  })

  test.each([
    {
      description: `shares Unicode slugs and -1 duplicate suffixes`,
      html: `<div id="déjà-vu"></div><h2>Déjà vu!</h2><h2>Déjà vu?</h2><h3 id="custom-id">Custom</h3>`,
      expected_ids: [`déjà-vu-1`, `déjà-vu-2`, `custom-id`],
      expected_hrefs: [`#d%C3%A9j%C3%A0-vu-1`, `#d%C3%A9j%C3%A0-vu-2`, `#custom-id`],
    },
    {
      description: `avoids collisions with already suffixed slugs`,
      html: `<h2>Foo</h2><h2>Foo</h2><h3>Foo 1</h3>`,
      expected_ids: [`foo`, `foo-1`, `foo-1-1`],
      expected_hrefs: [`#foo`, `#foo-1`, `#foo-1-1`],
    },
  ])(`autoIds $description`, async ({ html, expected_ids, expected_hrefs }) => {
    set_body(html)
    mount_toc()
    await tick()

    expect(
      [...document.querySelectorAll<HTMLHeadingElement>(`body > :is(h2, h3)`)].map(
        ({ id }) => id,
      ),
    ).toEqual(expected_ids)
    expect(
      [...document.querySelectorAll<HTMLAnchorElement>(`aside.toc li > a`)].map(
        (anchor) => anchor.getAttribute(`href`),
      ),
    ).toEqual(expected_hrefs)
  })

  test(`autoIds=false leaves headings without ids or hrefs`, async () => {
    set_body(`<h2>No id</h2>`)

    mount_toc({ autoIds: false })
    await tick()

    expect(doc_query(`body > h2`).id).toBe(``)
    expect(doc_query(`aside.toc li > a`).hasAttribute(`href`)).toBe(false)
  })

  test(`slugifyHeading customizes generated ids`, async () => {
    set_body(`<h2>First</h2><h2>Second</h2>`)

    mount_toc({
      slugifyHeading: (_heading: HTMLHeadingElement, idx: number) => `section-${idx}`,
    })
    await tick()

    expect(
      [...document.querySelectorAll<HTMLHeadingElement>(`body > h2`)].map(
        (heading) => heading.id,
      ),
    ).toEqual([`section-0`, `section-1`])
  })

  test(`tocItem snippet replaces default link content`, async () => {
    set_body(`<h2 id="intro">Intro</h2>`)

    mount_toc({
      tocItem: createRawSnippet<[HTMLHeadingElement]>((heading) => ({
        render: () =>
          `<span class="custom-toc-item">${heading().id}:${heading().textContent}</span>`,
      })),
    })
    await tick()

    const item = doc_query(`aside.toc li`)
    expect(item.getAttribute(`tabindex`)).toBe(`0`)
    expect(item.getAttribute(`role`)).toBe(`link`)
    expect(item.getAttribute(`aria-current`)).toBe(`location`)
    expect(item.querySelector(`a`)).toBeNull()
    expect(item.querySelector(`.custom-toc-item`)?.textContent).toBe(`intro:Intro`)
  })

  test.each([
    {
      desc: `anchor keeps its own click behavior`,
      html: (heading: HTMLHeadingElement) =>
        `<a class="custom-link" href="#${heading.id}">${heading.textContent}</a>`,
      n_anchors: 1,
      selector: `aside.toc li > a.custom-link`,
      scrolls: false,
    },
    {
      desc: `button keeps its own click behavior`,
      html: (heading: HTMLHeadingElement) =>
        `<button class="custom-button" type="button">${heading.textContent}</button>`,
      n_anchors: 0,
      selector: `aside.toc li > button.custom-button`,
      scrolls: false,
      checks_keyboard: true,
    },
    {
      desc: `non-interactive span scrolls to the heading`,
      html: (heading: HTMLHeadingElement) =>
        `<span class="plain">${heading.textContent}</span>`,
      n_anchors: 0,
      selector: `aside.toc li > span.plain`,
      scrolls: true,
    },
  ])(
    `tocItem $desc`,
    async ({ html, n_anchors, selector, scrolls, checks_keyboard = false }) => {
      set_body(`<h2 id="first">First</h2><h2 id="second">Second</h2>`)
      mock_active_heading(`first`)
      const replace_state_mock = vi.spyOn(history, `replaceState`)
      const scroll_into_view_mock = vi.fn<Element[`scrollIntoView`]>()
      vi.spyOn(Element.prototype, `scrollIntoView`).mockImplementation(
        scroll_into_view_mock,
      )

      mount_toc({
        tocItem: createRawSnippet<[HTMLHeadingElement]>((heading) => ({
          render: () => html(heading()),
        })),
      })
      await tick()

      const item = doc_query(`aside.toc li`)
      expect(item.querySelectorAll(`a`)).toHaveLength(n_anchors)
      expect(item.getAttribute(`role`)).toBe(scrolls ? `link` : null)
      expect(item.getAttribute(`tabindex`)).toBe(scrolls ? `0` : null)

      const event = new MouseEvent(`click`, { bubbles: true, cancelable: true })
      doc_query(selector).dispatchEvent(event)

      // a nested interactive element keeps native behavior (no preventDefault, no scroll);
      // plain content falls through to the li handler which scrolls and updates the fragment
      expect(event.defaultPrevented).toBe(scrolls)
      expect(scroll_into_view_mock).toHaveBeenCalledTimes(scrolls ? 1 : 0)
      expect(replace_state_mock.mock.calls).toEqual(scrolls ? [[{}, ``, `#first`]] : [])

      if (checks_keyboard) {
        const buttons =
          document.querySelectorAll<HTMLButtonElement>(`aside.toc li > button`)
        buttons[0].focus()
        buttons[0].dispatchEvent(
          new KeyboardEvent(`keydown`, { key: `ArrowDown`, bubbles: true }),
        )
        await tick()

        expect(document.activeElement).toBe(buttons[1])

        const enter_event = new KeyboardEvent(`keydown`, {
          key: `Enter`,
          bubbles: true,
          cancelable: true,
        })
        buttons[1].dispatchEvent(enter_event)

        expect(enter_event.defaultPrevented).toBe(false)
        expect(scroll_into_view_mock).not.toHaveBeenCalled()
        expect(replace_state_mock).not.toHaveBeenCalled()
      }
    },
  )

  test(`modified clicks on ToC links keep native browser behavior`, async () => {
    set_body(`<h2 id="intro">Intro</h2>`)
    const replace_state_mock = vi.spyOn(history, `replaceState`)
    const scroll_into_view_mock = vi.fn<Element[`scrollIntoView`]>()
    vi.spyOn(Element.prototype, `scrollIntoView`).mockImplementation(
      scroll_into_view_mock,
    )

    mount_toc()
    await tick()

    const event = new MouseEvent(`click`, {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
    })
    doc_query(`aside.toc li > a`).dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(replace_state_mock).not.toHaveBeenCalled()
    expect(scroll_into_view_mock).not.toHaveBeenCalled()
  })

  test(`flash_clicked_headings_for_ms removes the clicked-heading class`, async () => {
    vi.useFakeTimers()
    try {
      set_body(`<h2 id="intro">Intro</h2>`)

      mount_toc({ flash_clicked_headings_for_ms: 10 })
      await tick()

      const heading = doc_query(`#intro`)
      doc_query(`aside.toc li`).click()
      expect(heading.classList.contains(`toc-clicked`)).toBe(true)

      vi.advanceTimersByTime(10)
      expect(heading.classList.contains(`toc-clicked`)).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  // Each case needs its own invalid selector: happy-dom throws the first time it parses
  // one, then caches the failure and lets later querySelector calls for the same string
  // return null, which would hide the invalidity from Toc's validation
  test.each([
    [`headingSelector`, `[`, { headingSelector: `[` }],
    [`excludeSelector`, `((`, { excludeSelector: `((` }],
  ])(`warns once and hides for invalid %s`, async (selector_name, selector, props) => {
    set_body(`<h2>Visible heading</h2>`)
    const warn_mock = vi.spyOn(console, `warn`).mockImplementation(() => {})

    mount_toc({ warnOnEmpty: true, ...props })
    await tick()

    expect(warn_mock).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining(`invalid ${selector_name}='${selector}'`),
    )
    expect(doc_query(`aside.toc`).getAttribute(`hidden`)).toBe(``)
  })

  // no selector below matches anything on setup_empty_page ('h2' only hits the excluded one)
  test.each(
    [undefined, `foobar`, `h2`, `h4`].flatMap((headingSelector) =>
      [true, false].map((autoHide) => ({ headingSelector, autoHide })),
    ),
  )(
    `autoHide=$autoHide with headingSelector='$headingSelector' on an empty page`,
    async ({ headingSelector, autoHide }) => {
      setup_empty_page()
      mount_toc({ headingSelector, autoHide })
      await tick()

      const node = doc_query(`aside.toc`)
      expect(node.getAttribute(`aria-hidden`)).toBe(String(autoHide))
      expect(node.classList.contains(`hidden`)).toBe(autoHide)
      expect(node.getAttribute(`hidden`)).toBe(autoHide ? `` : null)
    },
  )

  test(`warnOnEmpty=true warns exactly once, even across later mutations`, async () => {
    const warn_mock = vi.spyOn(console, `warn`).mockImplementation(() => {})
    mount_toc({ warnOnEmpty: true })
    await tick()
    const msg = `Toc found no headings for headingSelector=':is(h2, h3, h4)' after applying excludeSelector='.toc-exclude'. Hiding table of contents.`
    expect(warn_mock).toHaveBeenCalledExactlyOnceWith(msg)

    // rendering the ToC itself and any later unrelated childList mutation both notify the
    // MutationObserver. the empty heading set is unchanged, so neither may rebuild and re-warn
    document.body.append(document.createElement(`p`))
    await tick()
    document.body.append(document.createElement(`p`))
    await tick()

    expect(warn_mock).toHaveBeenCalledExactlyOnceWith(msg)
  })

  test(`no console.warn when warnOnEmpty=false`, () => {
    const warn_mock = vi.spyOn(console, `warn`).mockImplementation(() => {})
    mount_toc({ warnOnEmpty: false })
    expect(warn_mock).not.toHaveBeenCalled()
  })

  test(`subheadings are indented`, async () => {
    set_body(`
      <h1>Heading 1</h1>
      <h2>Heading 2</h2>
      <h3>Heading 3</h3>
      <h4>Heading 4</h4>
    `)

    mount_toc()
    await tick()

    const toc_list = doc_query(`aside.toc > nav > ol`)
    expect(toc_list.children).toHaveLength(3)

    // Indent is applied via CSS calc with --toc-indent-per-level variable. happy-dom's
    // parser rejects calc() wrapping var(), so the value never lands on the element and
    // the styles Toc sets have to be read off setProperty instead.
    expect(written_style_values(`margin-left`)).toEqual([
      expect.stringContaining(`calc(0 *`),
      expect.stringContaining(`calc(1 *`),
      expect.stringContaining(`calc(2 *`),
    ])
  })

  // :is(h2, h3, h4) matches 3 of levels [1, 2, 3, 4] and none of [1, 5, 6]
  test.each([
    [[1, 2, 3, 4], 1, 3],
    [[1, 2, 3, 4], 3, 3],
    [[1, 2, 3, 4], 4, 0],
    [[1, 5, 6], 1, 0],
  ])(
    `levels=%j with minItems=%s renders %s items`,
    async (levels, minItems, expected) => {
      set_body(levels.map((lvl) => `<h${lvl}>Heading ${lvl}</h${lvl}>`).join(``))

      mount_toc({ headingSelector: `:is(h2, h3, h4)`, minItems })
      await tick()

      // below minItems the whole nav is dropped rather than rendered empty
      expect(document.querySelectorAll(`aside.toc > nav > ol > li`)).toHaveLength(
        expected,
      )
      expect(document.querySelector(`aside.toc nav`) === null).toBe(expected === 0)
    },
  )

  test.each([
    [400, 500, 600],
    [700, 800, 900],
    [999, 1000, 1001],
  ])(
    `should handle custom breakpoint with small=%i, breakpoint=%i, large=%i`,
    async (smaller, breakpoint, larger) => {
      mount_toc({ breakpoint })

      set_window_width(larger)

      const node = doc_query(`aside.toc`)
      expect(node.className).toContain(`desktop`)
      expect(node.className).not.toContain(`mobile`)

      set_window_width(smaller)
      await tick()

      expect(node.className).not.toContain(`desktop`)
      expect(node.className).toContain(`mobile`)
    },
  )

  test(`onOpenChange handler receives open state, desktop state, and trigger`, async () => {
    set_window_width(1200)
    ensure_content_for_toc_elements()
    const on_open_change = vi.fn<OpenChangeHandler>()

    mount_toc({ onOpenChange: on_open_change, open: false })
    await tick()

    expect(on_open_change).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ desktop: true, open: false, trigger: `programmatic` }),
    )

    set_window_width(600)
    await tick()
    doc_query(`aside.toc button`).click()
    await tick()

    expect(on_open_change).toHaveBeenCalledTimes(2)
    expect(on_open_change).toHaveBeenCalledWith(
      expect.objectContaining({ desktop: false, open: true, trigger: `button` }),
    )

    globalThis.dispatchEvent(new KeyboardEvent(`keydown`, { key: `Escape` }))
    await tick()
    on_open_change.mockClear()

    // Same-tick open changes should emit each internal trigger separately.
    doc_query(`aside.toc button`).click()
    globalThis.dispatchEvent(new KeyboardEvent(`keydown`, { key: `Escape` }))
    await tick()

    expect(on_open_change).toHaveBeenCalledTimes(2)
    expect(on_open_change).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ desktop: false, open: true, trigger: `button` }),
    )
    expect(on_open_change).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ desktop: false, open: false, trigger: `escape` }),
    )
  })

  test(`mobile button opens the ToC`, async () => {
    globalThis.innerWidth = 600
    set_headings(2)

    mount_toc({ desktop: false })
    expect(document.querySelector(`aside.toc > nav`)).toBeNull()

    doc_query(`aside.toc button`).click()
    await tick()

    expect(document.querySelector(`aside.toc > nav`)).not.toBeNull()
  })

  test(`active heading is scrolled into view and highlighted when opening ToC on mobile`, async () => {
    set_headings(100)
    globalThis.innerWidth = 600

    mount_toc({ open: true })
    await tick()

    expect(doc_query(`aside.toc ol li.active`).textContent.trim()).toBe(`Heading 100`)
  })

  // arrows walk the visible list and stop at its ends rather than wrapping
  test.each([
    [
      `ArrowDown then ArrowUp returns to the start`,
      4,
      `heading-1`,
      [`ArrowDown`, `ArrowUp`],
      `Heading 1`,
    ],
    [`ArrowDown moves to the next item`, 4, `heading-1`, [`ArrowDown`], `Heading 2`],
    [`ArrowDown holds at the last item`, 2, `heading-2`, [`ArrowDown`], `Heading 2`],
    [`ArrowUp holds at the first item`, 2, `heading-1`, [`ArrowUp`], `Heading 1`],
  ] as const)(`%s`, async (_, count, active_id, keys, expected) => {
    set_headings(count)
    set_window_width(600)
    mock_active_heading(active_id)
    mount_toc({ breakpoint: 10_000, desktop: false, open: true })
    await tick()

    for (const key of keys) {
      globalThis.dispatchEvent(new KeyboardEvent(`keydown`, { key }))
      await tick()
    }

    expect(doc_query(`aside.toc > nav > ol > li.active`).textContent).toBe(expected)
  })

  test(`desktop (focused, no hover) arrow keys move focus + selection and Enter follows`, async () => {
    set_headings(2)
    set_window_width(1200)
    mock_active_heading(`heading-1`)
    vi.spyOn(Element.prototype, `scrollIntoView`).mockImplementation(() => {})
    const replace_mock = vi.spyOn(history, `replaceState`)

    mount_toc()
    await tick()

    doc_query(`aside.toc > nav > ol > li.active > a`).focus()
    // dispatch on the focused li (bubbles) to mirror real keyboard usage
    document.activeElement?.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `ArrowDown`, bubbles: true }),
    )
    await tick()

    // selection AND DOM focus move together; otherwise the focused li's own keydown
    // handler would override the arrow-navigation on the next Enter
    const active = doc_query(`aside.toc > nav > ol > li.active`)
    expect(active.textContent).toBe(`Heading 2`)
    expect(document.activeElement).toBe(active.querySelector(`a`))

    // Enter activates the arrow-selected Heading 2, not the originally-focused Heading 1
    document.activeElement?.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `Enter`, bubbles: true }),
    )
    expect(doc_query(`aside.toc > nav > ol > li.active`).textContent).toBe(`Heading 2`)
    expect(replace_mock).toHaveBeenCalledWith({}, ``, `#heading-2`)
  })

  test(`only the active ToC item carries aria-current="location"`, async () => {
    set_body(`<h2 id="a">Heading 1</h2><h2 id="b">Heading 2</h2>`)
    mount_toc()
    await tick()

    const links = document.querySelectorAll<HTMLAnchorElement>(`aside.toc li > a`)
    expect(doc_query(`aside.toc li.active > a`).getAttribute(`aria-current`)).toBe(
      `location`,
    )
    for (const link of links) {
      if (!link.closest(`li`)?.classList.contains(`active`)) {
        expect(link.getAttribute(`aria-current`)).toBeNull()
      }
    }
  })

  // a null key means activate by clicking the first item instead of pressing a key
  test.each([
    [`space`, ` `, `smooth`, `smooth`],
    [`enter`, `Enter`, `smooth`, `smooth`],
    [`space`, ` `, `auto`, `auto`],
    [`enter`, `Enter`, `auto`, `auto`],
    [`enter`, `Enter`, undefined, `smooth`], // default scrollBehavior when prop omitted
    [`click`, null, `auto`, `auto`],
    [`click`, null, `smooth`, `smooth`],
  ] as const)(
    `%s with scrollBehavior=%s scrolls with behavior %s`,
    async (_, key, scrollBehavior, expected_behavior) => {
      set_headings(2)

      const scroll_into_view_mock = vi.fn<Element[`scrollIntoView`]>()
      vi.spyOn(Element.prototype, `scrollIntoView`).mockImplementation(
        scroll_into_view_mock,
      )
      const replace_state_mock = vi.spyOn(history, `replaceState`)

      // breakpoint above the happy-dom window width forces mobile mode, where open=true is
      // enough for keys to be handled (no hover check)
      mount_toc({ open: true, breakpoint: 2000, scrollBehavior })
      await tick()

      // keys act on the active item, the last heading in happy-dom; a click picks the first
      if (key === null) doc_query(`aside.toc ol li`).click()
      else globalThis.dispatchEvent(new KeyboardEvent(`keydown`, { key }))

      expect(scroll_into_view_mock).toHaveBeenCalledWith({
        behavior: expected_behavior,
        block: `start`,
      })
      const expected_hash = key === null ? `#heading-1` : `#heading-2`
      expect(replace_state_mock).toHaveBeenCalledWith({}, ``, expected_hash)
    },
  )

  // a null trigger means the key is absent from reactToKeys, so nothing should happen
  test.each([
    { desc: `Escape closes the mobile ToC`, key: `Escape`, trigger: `escape` },
    { desc: `Tab out of a focused ToC closes it`, key: `Tab`, trigger: `tab` },
    { desc: `an empty reactToKeys ignores Escape`, key: `Escape`, trigger: null },
  ] as const)(`$desc`, async ({ key, trigger }) => {
    set_headings(2)
    set_window_width(600)
    const on_open_change = vi.fn<OpenChangeHandler>()

    const reactToKeys = trigger === null ? [] : [key]
    mount_toc({ open: true, reactToKeys, onOpenChange: on_open_change })
    await tick()
    on_open_change.mockClear()

    if (trigger === `tab`) doc_query(`aside.toc > nav > ol > li.active > a`).focus()
    const key_event = new KeyboardEvent(`keydown`, { key, cancelable: true })
    globalThis.dispatchEvent(key_event)
    await tick()

    // Tab must stay un-prevented so focus still leaves the ToC
    expect(key_event.defaultPrevented).toBe(trigger === `escape`)
    if (trigger === null) expect(on_open_change).not.toHaveBeenCalled()
    else {
      expect(on_open_change).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ desktop: false, open: false, trigger }),
      )
    }
  })

  test(`Escape with a focused desktop ToC has nothing to close and stays un-prevented`, async () => {
    set_headings(2)
    mount_toc()
    await tick()
    doc_query(`aside.toc > nav > ol > li.active > a`).focus()

    const key_event = new KeyboardEvent(`keydown`, { key: `Escape`, cancelable: true })
    globalThis.dispatchEvent(key_event)
    expect(key_event.defaultPrevented).toBe(false)
  })

  test(`mutation observer tracks headings added and removed after mount`, async () => {
    set_body(`<div id="content"><h2 id="initial">Initial Heading</h2></div>`)
    const scroll_into_view_mock = vi.fn<Element[`scrollIntoView`]>()
    vi.spyOn(Element.prototype, `scrollIntoView`).mockImplementation(
      scroll_into_view_mock,
    )

    mount_toc()
    await tick()
    expect(toc_texts()).toEqual([`Initial Heading`])
    const stale_item = doc_query(`aside.toc ol li`)

    const new_heading = document.createElement(`h3`)
    new_heading.textContent = `Added Heading`
    doc_query(`#content`).append(new_heading)
    await tick()
    expect(toc_texts()).toEqual([`Initial Heading`, `Added Heading`])

    doc_query(`#initial`).remove()
    await tick()
    expect(toc_texts()).toEqual([`Added Heading`])

    // the li captured before the rebuild no longer maps to a live heading, so it can't scroll
    stale_item.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(scroll_into_view_mock).not.toHaveBeenCalled()
  })

  test(`unrelated DOM mutations skip the heading rebuild while real changes don't`, async () => {
    set_body(`<h2 id="a">Alpha</h2><h2 id="b">Beta</h2>`)
    mount_toc()
    await tick()

    // happy-dom returns all-zero rects, so set_active_heading picks the last heading
    expect(doc_query(`aside.toc li.active`).textContent.trim()).toBe(`Beta`)

    // arrange rects so any rebuild's set_active_heading() would switch active to Alpha
    mock_active_heading(`a`)

    // appending a non-heading is an unrelated mutation: the skip must avoid rebuilding
    // (and re-running set_active_heading), so the active heading stays put
    document.body.append(document.createElement(`p`))
    await tick()
    expect(doc_query(`aside.toc li.active`).textContent.trim()).toBe(`Beta`)

    // appending a real heading changes the set, so the rebuild runs and active updates
    const new_heading = document.createElement(`h2`)
    new_heading.id = `c`
    new_heading.textContent = `Gamma`
    document.body.append(new_heading)
    await tick()
    expect(doc_query(`aside.toc li.active`).textContent.trim()).toBe(`Gamma`)
  })

  test.each([
    {
      desc: `text-node data edits (characterData) update the ToC`,
      mutate: (heading: HTMLElement) => {
        ;(heading.firstChild as Text).data = `Changed`
      },
      expected: `Changed`,
    },
    {
      desc: `in-place textContent edits (childList) update the ToC`,
      mutate: (heading: HTMLElement) => {
        heading.textContent = `Changed`
      },
      expected: `Changed`,
    },
  ])(`heading $desc`, async ({ mutate, expected }) => {
    set_body(`<h2 id="a">Original</h2>`)
    mount_toc()
    await tick()
    expect(doc_query(`aside.toc li`).textContent.trim()).toBe(`Original`)

    mutate(doc_query(`#a`))
    await tick()
    expect(doc_query(`aside.toc li`).textContent.trim()).toBe(expected)
  })

  test(`unrelated text-node data edits do not rebuild active heading`, async () => {
    set_body(`<h2 id="a">Alpha</h2><h2 id="b">Beta</h2><p>Original</p>`)
    const get_heading_data = vi.fn((node: HTMLHeadingElement) => ({
      id: node.id,
      level: Number(node.nodeName[1]),
      title: node.textContent ?? ``,
    }))
    mount_toc({ getHeadingData: get_heading_data })
    await tick()
    get_heading_data.mockClear()

    expect(doc_query(`aside.toc li.active`).textContent.trim()).toBe(`Beta`)
    mock_active_heading(`a`)

    ;(doc_query(`p`).firstChild as Text).data = `Changed`
    document.body.setAttribute(`data-theme`, `dark`)
    await tick()

    expect(doc_query(`aside.toc li.active`).textContent.trim()).toBe(`Beta`)
    expect(get_heading_data).not.toHaveBeenCalled()
  })

  test(`heading id attribute changes update link targets`, async () => {
    set_body(`<h2 id="old">Title</h2>`)
    mount_toc()
    await tick()

    expect(doc_query(`aside.toc li > a`).getAttribute(`href`)).toBe(`#old`)

    doc_query(`body > h2`).id = `new`
    await tick()

    expect(doc_query(`aside.toc li > a`).getAttribute(`href`)).toBe(`#new`)
  })

  test(`selector-driven attribute changes update heading membership`, async () => {
    set_body(`<h2 class="toc-exclude">Alpha</h2><h2>Beta</h2><h5 id="gamma">Gamma</h5>`)
    mount_toc({ headingSelector: `:is(h2, h5[data-toc-heading])` })
    await tick()
    expect(doc_query(`aside.toc ol`).textContent).toBe(`Beta`)

    doc_query(`.toc-exclude`).classList.remove(`toc-exclude`)
    doc_query(`#gamma`).setAttribute(`data-toc-heading`, ``)
    await tick()

    expect(doc_query(`aside.toc ol`).textContent).toBe(`AlphaBetaGamma`)
  })

  test(`rebinds when a heading element is replaced with identical content`, async () => {
    set_body(`<h2 id="a">Title</h2>`)
    mount_toc()
    await tick()

    // a framework re-render can swap in a fresh element with the same id/text; the
    // element-identity check must rebuild so clicks target the live (attached) heading
    const replacement = document.createElement(`h2`)
    replacement.id = `a`
    replacement.textContent = `Title`
    const scroll_spy = vi.fn()
    replacement.scrollIntoView = scroll_spy
    doc_query(`#a`).replaceWith(replacement)
    await tick()

    doc_query(`aside.toc li`).click()
    expect(scroll_spy).toHaveBeenCalled()
  })

  // Tests for issue #50: scroll_target prevents flicker during programmatic scrolling
  // https://github.com/janosh/svelte-toc/issues/50
  describe(`scroll_target behavior`, () => {
    const active_text = () => doc_query(`aside.toc ol li.active`).textContent.trim()
    const scroll_mock = vi.fn<Element[`scrollIntoView`]>()

    // happy-dom reports top=0 for every unmocked heading, so plain scroll detection lands
    // on the last one. `Heading 3` therefore means scroll_target was released, `Heading 1`
    // that it still pins the clicked heading.
    beforeEach(() => {
      set_headings(3)
      scroll_mock.mockClear()
      vi.spyOn(Element.prototype, `scrollIntoView`).mockImplementation(scroll_mock)
    })

    test.each([
      [`scrollend`, () => globalThis.dispatchEvent(new Event(`scrollend`))],
      [`the fallback timeout`, () => vi.advanceTimersByTime(1000)],
    ])(`%s releases scroll_target back to scroll detection`, async (_, release) => {
      vi.useFakeTimers() // keeps the fallback dormant unless a case advances it
      try {
        mount_toc({ open: true })
        await tick()
        expect(active_text()).toBe(`Heading 3`)

        doc_query(`aside.toc ol li`).click()
        await tick()
        // the clicked heading goes active at once and survives intermediate scrolls
        expect(active_text()).toBe(`Heading 1`)
        expect(scroll_mock).toHaveBeenCalledOnce()
        await scroll()
        expect(active_text()).toBe(`Heading 1`)

        release()
        await scroll()
        expect(active_text()).toBe(`Heading 3`)
      } finally {
        vi.useRealTimers()
      }
    })

    // a distance to the target that grows past the 50px threshold reads as the user
    // scrolling away; a shrinking one as the smooth scroll still closing in
    test.each([
      [`holds while the smooth scroll closes in`, 2000, [1500, 800, 200], `Heading 1`],
      [`releases when the user scrolls away`, 150, [150, 500], `Heading 3`],
    ] as const)(`scroll_target %s`, async (_, initial_top, tops, expected) => {
      mount_toc({ open: true })
      await tick()

      let mock_top: number = initial_top
      vi.spyOn(doc_query(`#heading-1`), `getBoundingClientRect`).mockImplementation(() =>
        dom_rect({ top: mock_top }),
      )

      doc_query(`aside.toc ol li`).click()
      await tick()
      expect(active_text()).toBe(`Heading 1`)

      for (const top of tops) {
        mock_top = top
        await scroll()
      }
      expect(active_text()).toBe(expected)
    })

    test(`removing scroll target activates a remaining heading`, async () => {
      mount_toc({ open: true })
      await tick()

      doc_query(`aside.toc ol li`).click()
      await tick()
      expect(active_text()).toBe(`Heading 1`)

      doc_query(`#heading-1`).remove()
      await tick()

      expect(active_text()).toBe(`Heading 3`)
    })

    test(`rapid clicks activate last clicked item`, async () => {
      mount_toc({ open: true })
      await tick()

      const items = document.querySelectorAll<HTMLLIElement>(`aside.toc ol li`)
      items[2].click()
      items[0].click()
      items[1].click()
      await tick()

      expect(active_text()).toBe(`Heading 2`)
      expect(scroll_mock).toHaveBeenCalledTimes(3)
    })
  })
})

describe(`hideOnIntersect`, () => {
  const mock_bounding_rect = (element: Element, rect: Partial<DOMRect>) =>
    vi.spyOn(element, `getBoundingClientRect`).mockReturnValue(dom_rect(rect))

  const clear_of_toc = { top: 0, bottom: 50, left: 0, right: 1200 }
  const over_toc = { top: 150, bottom: 250, left: 0, right: 1200 }

  // parks the ToC in the top-right corner so only a banner's vertical extent decides
  // overlap, then leaves b1 clear of it and b2 wherever the case wants it
  const setup_banners = async (
    target: (b1: HTMLElement, b2: HTMLElement) => TocProps[`hideOnIntersect`],
    {
      window_width = 1200,
      b2_rect = over_toc,
    }: { window_width?: number; b2_rect?: Partial<DOMRect> } = {},
  ) => {
    set_body(
      `<h2>Heading 1</h2><div class="banner" id="b1">B1</div><div class="banner" id="b2">B2</div>`,
    )
    globalThis.innerWidth = window_width
    const [b1, b2] = [doc_query(`#b1`), doc_query(`#b2`)]

    mount_toc({ hideOnIntersect: target(b1, b2), open: true })
    await tick()

    const aside = doc_query(`aside.toc`)
    mock_bounding_rect(aside, { top: 100, bottom: 300, left: 800, right: 1000 })
    mock_bounding_rect(b1, clear_of_toc)
    mock_bounding_rect(b2, b2_rect)
    return { aside, b2 }
  }

  const is_intersecting = (aside: HTMLElement) => aside.classList.contains(`intersecting`)

  type IntersectCase = {
    desc: string
    target?: (b1: HTMLElement, b2: HTMLElement) => TocProps[`hideOnIntersect`]
    window_width?: number
    b2_rect?: Partial<DOMRect>
    expected: boolean
    warns?: boolean
  }

  test.each<IntersectCase>([
    { desc: `hides the ToC when a banner overlaps it`, expected: true },
    {
      desc: `keeps the ToC when no banner overlaps`,
      b2_rect: clear_of_toc,
      expected: false,
    },
    { desc: `ignores overlap on mobile`, window_width: 600, expected: false },
    {
      desc: `accepts an HTMLElement array`,
      target: (b1, b2) => [b1, b2],
      expected: true,
    },
    { desc: `ignores a selector matching nothing`, target: () => `.x`, expected: false },
    {
      desc: `warns once for an invalid selector`,
      target: () => `[`,
      expected: false,
      warns: true,
    },
  ])(
    `$desc`,
    async ({ target = () => `.banner`, expected, warns, window_width, b2_rect }) => {
      const warn_mock = vi.spyOn(console, `warn`).mockImplementation(() => {})
      const { aside } = await setup_banners(target, { window_width, b2_rect })
      await scroll()

      expect(is_intersecting(aside)).toBe(expected)
      if (warns) {
        expect(warn_mock).toHaveBeenCalledExactlyOnceWith(
          expect.stringContaining(`invalid hideOnIntersect='['`),
        )
      } else expect(warn_mock).not.toHaveBeenCalled()
    },
  )

  test(`re-shows the ToC once the overlap ends`, async () => {
    const { aside, b2 } = await setup_banners(() => `.banner`)
    await scroll()
    expect(is_intersecting(aside)).toBe(true)
    // opacity: 0 alone would leave the links tabbable while aria-hidden hides them from
    // assistive tech, so the subtree has to be inert for as long as it is invisible
    expect(aside.hasAttribute(`inert`)).toBe(true)

    mock_bounding_rect(b2, { top: 500, bottom: 600, left: 0, right: 1200 })
    await scroll()
    expect(is_intersecting(aside)).toBe(false)
    expect(aside.hasAttribute(`inert`)).toBe(false)
  })
})

describe(`Element Prop Bags`, () => {
  // shared marker so one assertion covers style pass-through for every element. the class
  // values deliberately vary (string / array / object) to cover Svelte's class forms.
  // a longhand: the `style:` directives on these elements make happy-dom re-serialize
  // the whole declaration, which would expand a shorthand like `outline` into parts
  const marker_style = `opacity: 0.5;`

  const prop_bag_cases = [
    {
      element_name: `aside`,
      prop_name: `asideProps`,
      bag: { class: [`custom-class`, { 'custom-object-class': true }] },
      extra_props: { hide: true, autoHide: false },
      selector: `aside.toc`,
      expected_classes: [`toc`, `custom-class`, `custom-object-class`],
      expected_attributes: { hidden: ``, 'aria-hidden': `true` },
    },
    {
      element_name: `nav`,
      prop_name: `navProps`,
      bag: { class: `custom-class` },
      selector: `aside.toc nav`,
      expected_classes: [`custom-class`],
    },
    {
      element_name: `title`,
      prop_name: `titleProps`,
      bag: { class: { 'custom-class': true } },
      extra_props: { title: `Test Custom Title` },
      selector: `aside.toc nav .toc-title`,
      expected_classes: [`toc-title`, `toc-exclude`, `custom-class`],
    },
    {
      element_name: `ol`,
      prop_name: `olProps`,
      bag: { class: `custom-class`, start: 3, reversed: true },
      selector: `aside.toc nav ol`,
      expected_classes: [`custom-class`],
      expected_attributes: { start: `3`, reversed: `` },
    },
    {
      element_name: `li`,
      prop_name: `liProps`,
      bag: { class: `custom-class`, onclick: vi.fn<() => void>(), value: 7 },
      selector: `aside.toc nav ol li`,
      expected_classes: [`active`, `custom-class`],
      expected_attributes: { value: `7` },
      expected_open_changes: 0,
      setup: () => set_body(`<h2>Single Heading</h2>`),
    },
    {
      element_name: `open button`,
      prop_name: `openButtonProps`,
      bag: {
        class: `custom-class`,
        disabled: true,
        onclick: vi.fn<(event: MouseEvent) => void>((event) => event.preventDefault()),
        type: `button`,
      },
      extra_props: { desktop: false },
      selector: `aside.toc > button`,
      expected_classes: [`custom-class`],
      expected_attributes: {
        'aria-label': `Open table of contents`,
        disabled: ``,
        type: `button`,
      },
      expected_open_changes: 0,
      // the button only renders on mobile, and only once there are headings to list
      setup: () => {
        ensure_content_for_toc_elements()
        set_window_width(500)
      },
    },
  ]

  test.each(prop_bag_cases)(
    `applies $element_name prop bag attributes`,
    async ({
      prop_name,
      bag,
      extra_props = {},
      selector,
      expected_classes,
      expected_attributes = {},
      expected_open_changes,
      setup = ensure_content_for_toc_elements,
    }) => {
      setup()
      const has_user_click = `onclick` in bag
      const user_click = has_user_click ? bag.onclick : vi.fn<() => void>()
      const on_open_change = vi.fn<OpenChangeHandler>()
      const expected_open_change_count = expected_open_changes ?? (has_user_click ? 1 : 0)
      const full_bag = { ...bag, style: marker_style, 'data-testid': prop_name }

      mount_toc({
        ...extra_props,
        ...(has_user_click ? { onOpenChange: on_open_change } : {}),
        [prop_name]: full_bag,
      })
      await tick()
      on_open_change.mockClear()

      const element = doc_query(selector)
      expect(element.getAttribute(`style`)).toContain(marker_style)
      expect(element.getAttribute(`data-testid`)).toBe(prop_name)
      for (const cls of expected_classes) {
        expect(element.classList.contains(cls)).toBe(true)
      }
      for (const [attribute, value] of Object.entries(expected_attributes)) {
        expect(element.getAttribute(attribute)).toBe(value)
      }
      if (`onclick` in bag) {
        element.dispatchEvent(
          new MouseEvent(`click`, { bubbles: true, cancelable: true }),
        )
        await tick()
      }
      // happy-dom honors `disabled` for dispatched clicks, so a disabled control
      // never sees the event that jsdom would have delivered
      const is_disabled = `disabled` in bag && bag.disabled === true
      expect(user_click).toHaveBeenCalledTimes(has_user_click && !is_disabled ? 1 : 0)
      expect(on_open_change).toHaveBeenCalledTimes(expected_open_change_count)
    },
  )

  test(`liProps.style preserves generated styles without multiline whitespace`, async () => {
    ensure_content_for_toc_elements([
      `<h2>Parent Heading</h2>`,
      `<h3>Nested Heading</h3>`,
    ])

    mount_toc({ liProps: { style: `padding-left: 10px;` } })
    await tick()

    const style_attribute = doc_query(`aside.toc nav ol li:nth-child(2)`).getAttribute(
      `style`,
    )
    expect(style_attribute).toContain(`padding-left: 10px;`)
    // the generated declarations survive the merge but not happy-dom's parser, so they
    // are asserted on what Svelte wrote rather than on the element
    expect(written_style_values(`margin-left`)).toContain(
      `margin-left: calc(1 * var(--toc-indent-per-level, 1em))`,
    )
    expect(written_style_values(`font-size`)).toContain(
      `font-size: max(var(--toc-li-font-size-min, 2ex), calc(var(--toc-li-font-size-base, 3ex) - 1 * var(--toc-li-font-size-step, 0.1ex)))`,
    )
    expect(written_css_texts.join(``)).not.toContain(`\n`)
  })

  test.each([
    {
      rule_name: `aside base rule`,
      declaration_pattern: /box-sizing: border-box;/,
      expects_where: true,
    },
    {
      rule_name: `nav base rule`,
      declaration_pattern: /overflow: var\(--toc-overflow, auto\);/,
      expects_where: true,
    },
    {
      rule_name: `list item base rule`,
      declaration_pattern: /color: var\(--toc-li-color\);/,
      expects_where: true,
    },
    {
      rule_name: `open button base rule`,
      declaration_pattern: /bottom: var\(--toc-mobile-btn-bottom, 0\);/,
      expects_where: true,
    },
    {
      // https://github.com/janosh/svelte-toc/issues/71
      rule_name: `ordered list structural rule`,
      declaration_pattern: /list-style: var\(--toc-ol-list-style, none\);/,
      expects_where: false,
      selector_pattern: /aside\.toc.*> nav.*> ol/,
    },
  ])(
    `uses expected selector specificity for $rule_name`,
    async ({ declaration_pattern, expects_where, selector_pattern = /.*/ }) => {
      set_body(`<h2>Heading 1</h2><h3>Heading 2</h3>`)

      mount_toc()
      await tick()

      const selector_line = find_matching_css_selector(
        document.head.textContent,
        declaration_pattern,
      )
      expect(selector_line.startsWith(`:where(`)).toBe(expects_where)
      expect(selector_line).toMatch(selector_pattern)
    },
  )
})

describe(`collapseSubheadings`, () => {
  test(`all items visible when collapseSubheadings=false`, async () => {
    setup_nested_headings()
    mount_toc()
    await tick()

    expect(get_collapsed_states()).toEqual(Array.from({ length: 8 }, () => false))
  })

  // Parameterized test for collapse behavior with different modes and active headings
  test.each([
    // [description, mode, active_id, expected_collapsed_states]
    [
      `full nesting with h2 active`,
      true,
      `section-1`,
      [false, false, true, true, false, true, false, true],
    ],
    [
      `full nesting with h3 active`,
      true,
      `sub-1-1`,
      [false, false, false, false, false, true, false, true],
    ],
    [
      `full nesting with h4 active`,
      true,
      `detail-1-1-1`,
      [false, false, false, false, false, true, false, true],
    ],
    [
      // deep active under a second-position parent: a preceding uncle's subtree
      // (detail-1-1-*) must stay collapsed, exercising the ancestor-chain walk
      `full nesting with deep active under second h3`,
      true,
      `detail-1-2-1`,
      [false, false, true, true, false, false, false, true],
    ],
    [
      `h3 threshold with h2 active`,
      `h3`,
      `section-1`,
      [false, false, false, false, false, false, false, true],
    ],
  ] as const)(`%s`, async (_, mode, active_id, expected) => {
    setup_nested_headings()
    mock_active_heading(active_id)
    mount_toc({ collapseSubheadings: mode })
    await tick()

    expect(get_collapsed_states()).toEqual(expected)
  })

  test(`collapsed items have aria-hidden=true and unfocusable links`, async () => {
    setup_nested_headings()
    mock_active_heading(`section-1`)
    mount_toc({ collapseSubheadings: true })
    await tick()

    const items = document.querySelectorAll<HTMLLIElement>(`aside.toc > nav > ol > li`)
    const collapsed = items[2]
    const visible = items[0]

    expect(collapsed.getAttribute(`aria-hidden`)).toBe(`true`)
    expect(collapsed.querySelector(`a`)?.getAttribute(`tabindex`)).toBe(`-1`)
    expect(visible.getAttribute(`aria-hidden`)).toBeNull()
    expect(visible.querySelector(`a`)?.getAttribute(`tabindex`)).toBe(`0`)
  })

  test.each([`h9`, `hx`, `3`])(
    `invalid collapseSubheadings='%s' warns once and collapses nothing`,
    async (mode) => {
      setup_nested_headings()
      mock_active_heading(`section-1`)
      const warn_mock = vi.spyOn(console, `warn`).mockImplementation(() => {})

      // CollapseMode forbids these, so the cast stands in for an untyped JS caller
      mount_toc({ collapseSubheadings: mode as CollapseMode })
      await tick()

      expect(warn_mock).toHaveBeenCalledExactlyOnceWith(
        `Toc received invalid collapseSubheadings='${mode}'. Not collapsing subheadings.`,
      )
      // falling back to Infinity alone would still collapse, since the template and the
      // active-index lookup only test the mode for truthiness
      expect(get_collapsed_states()).toEqual(Array.from({ length: 8 }, () => false))
      expect(doc_query(`aside.toc`).classList.contains(`collapsible`)).toBe(false)
    },
  )

  test(`unmocked mount expands only the active heading's ancestor chain`, async () => {
    setup_nested_headings()
    // no rect mock: happy-dom reports top=0 for every heading, so set_active_heading walks
    // last-to-first and stops immediately, making the trailing h3 (Sub 2.1) active
    mount_toc({ collapseSubheadings: true })
    await tick()

    // both h2s stay open (top level never collapses) plus Sub 2.1 as the active item;
    // everything under the unrelated Section 1 subtree collapses
    expect(get_collapsed_states()).toEqual([
      false, // Section 1 (h2, top level)
      true, // Sub 1.1
      true, // Detail 1.1.1
      true, // Detail 1.1.2
      true, // Sub 1.2
      true, // Detail 1.2.1
      false, // Section 2 (h2, top level)
      false, // Sub 2.1 (active)
    ])
  })
})
