import Toc from '$lib/Toc.svelte'
import Heading from '$lib/Heading.svelte'
import type { CollapseMode, OpenChangeHandler, TocHeadingData } from '$lib/types'
import type { ComponentProps } from 'svelte'
import { createRawSnippet, tick } from 'svelte'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
  vi,
} from 'vite-plus/test'
import { click, doc_query, next_task, press_key, render } from './index'

type TocProps = ComponentProps<typeof Toc>

// observes the DOM (the common case) and flushes the mount's follow-up updates
const mount_toc = async (props: TocProps = {}) => {
  const unmount = render(Toc, { dynamic: true, ...props })
  await tick()
  return unmount
}

const set_body = (html: string) => {
  document.body.innerHTML = html
  for (const [idx, heading] of document.querySelectorAll(`h1,h2,h3,h4,h5,h6`).entries())
    if (!heading.id) heading.id = `fixture-${idx}`
}

const setup_empty_page = () =>
  set_body(`<h1>H1</h1><h2 class="toc-exclude">H2</h2><h5>H5</h5>`)

// `Heading 1`..`Heading n` as h2s with `heading-n` ids. happy-dom gives every heading
// top=0, so the last one starts active.
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

// happy-dom has no layout, so only the component's scrollIntoView call is observable.
const spy_scroll_into_view = () =>
  vi.spyOn(Element.prototype, `scrollIntoView`).mockImplementation(() => {})

const scroll = async () => {
  globalThis.dispatchEvent(new Event(`scroll`))
  await tick()
}

const set_nested_pair = () => set_body(`<h2>Heading 1</h2><h3>Heading 2</h3>`)

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

// only top/bottom/left/right matter; bottom/right collapse onto top/left rather than 0,
// since a negative width or height makes DOMRect swap the edges back
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

const toc_lis = () => [...document.querySelectorAll(`aside.toc > nav > ol > li`)]
const toc_texts = () => toc_lis().map((li) => li.textContent.trim())
const active_text = () => doc_query(`aside.toc li.active`).textContent.trim()

const find_matching_css_selector = (style_text: string, declaration_pattern: RegExp) => {
  // the selector group is "everything since the previous rule", so a comment above a rule
  // lands inside it and a `:where(` check would read the comment instead of the selector
  for (const { groups } of style_text
    .replaceAll(/\/\*[^]*?\*\//gu, ``)
    .matchAll(/(?<selector>[^{}]+)\{(?<block>[^{}]+)\}/g)) {
    // every component's CSS shares one head, so a generic declaration could match a neighbor
    if (!groups?.selector.includes(`toc`)) continue
    if (declaration_pattern.test(groups.block)) return groups.selector.trim()
  }
  throw new Error(`No CSS block matched ${declaration_pattern}`)
}

// happy-dom drops declarations whose value holds a var() with a fallback, which is how Toc
// expresses indent and font size, so record the cssText Svelte writes and assert on that
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

describe(`Toc`, () => {
  test.each([390, 1200])(
    `supplemental navigation remains usable without headings at width %i`,
    async (width) => {
      const warn_mock = vi.spyOn(console, `warn`).mockImplementation(() => {})
      set_window_width(width)
      setup_empty_page()
      await mount_toc({
        min_items: 5,
        warn_on_empty: true,
        footer: createRawSnippet(() => ({
          render: () =>
            `<details open><summary>Figures and equations</summary><a href="#figure">Figure 1</a></details>`,
        })),
      })
      expect(doc_query(`aside.toc`).hidden).toBe(false)
      expect(warn_mock).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(`Showing table of contents.`),
      )
      const mobile = width < 1000
      if (mobile) await click(`aside.toc > button`)
      expect(toc_texts()).toEqual([])
      for (const selector of [`summary`, `a`]) {
        const control = doc_query(`[data-toc-footer] ${selector}`)
        control.focus()
        for (const key of [`Enter`, ` `, `Tab`, `ArrowDown`])
          expect(press_key(control, key).defaultPrevented).toBe(false)
      }
      if (mobile) {
        const toggle = doc_query(`aside.toc > button`)
        expect(toggle.getAttribute(`aria-expanded`)).toBe(`true`)
        press_key(globalThis, `Escape`)
        await tick()
        expect(toggle.getAttribute(`aria-expanded`)).toBe(`false`)
      }
    },
  )

  test(`renders the title as an excluded h2`, async () => {
    await mount_toc({ title: `Custom title` })
    expect(doc_query(`h2.toc-title.toc-exclude`).textContent).toBe(`Custom title`)
  })

  // undefined heading_selector exercises the component default of `:is(h2, h3, h4)`
  test.each([
    [undefined, [0, 1, 2].map((lvl) => `Heading ${lvl + 2}`)],
    [
      `body > :is(h1, h2, h3, h4, h5, h6)`,
      Array.from({ length: 5 }, (_, lvl) => `Heading ${lvl + 2}`),
    ],
    [`h1`, []],
  ])(
    `ToC lists expected headings for heading_selector='%s'`,
    async (heading_selector, expected_text) => {
      set_body(`
      <h1 class="toc-exclude">Heading 1</h1>
      <h2>Heading 2</h2>
      <h3>Heading 3</h3>
      <h4>Heading 4</h4>
      <h5>Heading 5</h5>
      <h6>Heading 6</h6>
    `)

      await mount_toc({ heading_selector })
      expect(toc_texts()).toEqual(expected_text)
      // Read Svelte's writes: happy-dom drops calc() declarations containing var().
      expect(written_style_values(`margin-left`)).toEqual(
        expected_text.map((_, idx) => expect.stringContaining(`calc(${idx} *`)),
      )
    },
  )

  test.each([
    [`default exclusion`, `toc-exclude`, {}, [`Included heading`]],
    [
      `custom exclusion`,
      `skip-toc`,
      { exclude_selector: `.skip-toc` },
      [`Included heading`],
    ],
    [
      `disabled exclusion`,
      `toc-exclude`,
      { exclude_selector: `` },
      [`Excluded child heading`, `Excluded nested heading`, `Included heading`],
    ],
  ])(
    `%s with custom heading_selector`,
    async (_test_case, class_name, props, expected_headings) => {
      set_body(`
      <section class="${class_name}">
        <h2>Excluded child heading</h2>
        <div><h3>Excluded nested heading</h3></div>
      </section>
      <h2>Included heading</h2>
    `)

      await mount_toc({ heading_selector: `:is(h2, h3)`, ...props })
      expect(toc_texts()).toEqual(expected_headings)
    },
  )

  test(`get_heading_data customizes listed headings but not their DOM ids`, async () => {
    set_body(`<h2>Keep</h2><h3>Skip</h3>`)
    await mount_toc({
      get_heading_data: (node: HTMLHeadingElement) =>
        node.textContent === `Skip` ? null : { id: `custom`, level: 2, title: `Custom` },
      heading_selector: `:is(h2, h3)`,
    })

    expect(toc_texts()).toEqual([`Custom`])
    expect(doc_query(`body > h2`).id).toBe(`fixture-0`)
    expect(doc_query(`aside.toc li > a`).getAttribute(`href`)).toBe(`#fixture-0`)
  })

  // links keep native navigation: plain clicks scroll, modified clicks are left alone
  test.each([
    [`plain click on an encoded fragment`, false, 1],
    [`ctrl+click`, true, 0],
  ])(`%s keeps native link behavior`, async (_, ctrlKey, n_scrolls) => {
    set_body(`<h2 id="sec:1">Section</h2>`)
    const replace_state_mock = vi.spyOn(history, `replaceState`)
    const scroll_into_view_mock = spy_scroll_into_view()
    await mount_toc()

    const link = doc_query(`aside.toc li > a`)
    expect(link.getAttribute(`href`)).toBe(`#sec%3A1`) // a valid percent-encoded URL
    const event = new MouseEvent(`click`, { bubbles: true, cancelable: true, ctrlKey })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(scroll_into_view_mock).toHaveBeenCalledTimes(n_scrolls)
    expect(replace_state_mock).not.toHaveBeenCalled()
  })

  test.each([`second`, `sec:1`, `123`, `part.one`])(
    `static metadata keeps matching item indexes for id=%s`,
    async (id) => {
      set_body(`<h2 id="${id}">DOM title</h2>`)
      const scroll_into_view = spy_scroll_into_view()
      const mounted = mount_toc({
        dynamic: false,
        items: [
          { id: `first`, level: 2, title: `First` },
          { id, level: 3, title: `Manifest title` },
        ],
      })
      // static items render before any effect queries the DOM
      expect(toc_texts()).toEqual([`First`, `Manifest title`])
      await mounted
      expect(active_text()).toBe(`Manifest title`)
      doc_query(`aside.toc li:last-child a`).click()
      expect(scroll_into_view).toHaveBeenCalledOnce()
      expect(active_text()).toBe(`Manifest title`)
    },
  )

  test(`Heading keeps its identity and link synchronized with dynamic props`, async () => {
    const props = $state<ComponentProps<typeof Heading>>({
      id: `initial`,
      level: 2,
      link: true,
    })
    render(Heading, props)
    await tick()
    const heading = doc_query(`h2`)
    expect(heading.querySelector(`a`)?.getAttribute(`href`)).toBe(`#initial`)
    props.id = `changed & id`
    await tick()
    expect(doc_query(`h2`)).toBe(heading)
    expect(heading.id).toBe(props.id)
    expect(heading.querySelectorAll(`a`)).toHaveLength(1)
    expect(heading.querySelector(`a`)?.getAttribute(`href`)).toBe(`#changed%20%26%20id`)
    props.level = 3
    props.link = false
    await tick()
    expect(document.querySelector(`h2`)).toBeNull()
    expect(doc_query(`h3`).id).toBe(props.id)
    expect(document.querySelector(`h3 a`)).toBeNull()
  })

  test(`DOM observation is opt-in`, async () => {
    set_headings(1)
    render(Toc, {})
    await tick()
    document.body.insertAdjacentHTML(`afterbegin`, `<h2 id="later">Later</h2>`)
    await next_task()
    expect(toc_texts()).toEqual([`Heading 1`])
  })

  test(`ignores headings without IDs and never mutates their markup`, async () => {
    document.body.innerHTML = `<h2>No id</h2><h2 id="stable">Stable</h2>`
    await mount_toc()
    expect(doc_query(`body > h2`).outerHTML).toBe(`<h2>No id</h2>`)
    expect(toc_texts()).toEqual([`Stable`])
  })

  test.each([
    {
      desc: `anchor keeps its own click behavior`,
      html: (heading: TocHeadingData) =>
        `<a class="custom-link" href="#${heading.id}">${heading.title}</a>`,
      n_anchors: 1,
      selector: `aside.toc li > a.custom-link`,
      scrolls: false,
    },
    {
      desc: `button keeps its own click behavior`,
      html: (heading: TocHeadingData) =>
        `<button class="custom-button" type="button">${heading.title}</button>`,
      n_anchors: 0,
      selector: `aside.toc li > button.custom-button`,
      scrolls: false,
      checks_keyboard: true,
    },
    {
      desc: `non-interactive span scrolls to the heading`,
      html: (heading: TocHeadingData) =>
        `<span class="plain">${heading.id}:${heading.title}</span>`,
      n_anchors: 0,
      selector: `aside.toc li > span.plain`,
      scrolls: true,
    },
  ])(
    `toc_item $desc`,
    async ({ html, n_anchors, selector, scrolls, checks_keyboard = false }) => {
      set_body(`<h2 id="first">First</h2><h2 id="second">Second</h2>`)
      mock_active_heading(`first`)
      const replace_state_mock = vi.spyOn(history, `replaceState`)
      const scroll_into_view_mock = spy_scroll_into_view()
      const onclick = vi.fn()
      await mount_toc({
        li_props: { onclick, 'data-sveltekit-replacestate': `` },
        toc_item: createRawSnippet<[TocHeadingData]>((heading) => ({
          render: () => html(heading()),
        })),
      })

      const item = doc_query(`aside.toc li`)
      expect(item.textContent).toContain(`First`)
      expect(item.querySelectorAll(`a`)).toHaveLength(n_anchors)
      // the li carries the active state whatever the snippet renders
      expect(item.getAttribute(`aria-current`)).toBe(`location`)
      expect(item.getAttribute(`role`)).toBe(scrolls ? `link` : null)
      expect(item.getAttribute(`tabindex`)).toBe(scrolls ? `0` : null)
      const native_click = HTMLAnchorElement.prototype.click
      function checked_click(this: HTMLAnchorElement) {
        expect(this.closest(`[data-sveltekit-replacestate]`)).toBe(item)
        native_click.call(this)
      }
      vi.spyOn(HTMLAnchorElement.prototype, `click`).mockImplementation(checked_click)

      const event = new MouseEvent(`click`, { bubbles: true, cancelable: true })
      doc_query(selector).dispatchEvent(event)
      expect(onclick).toHaveBeenCalledExactlyOnceWith(event)

      // nested interactive elements keep native behavior; plain content falls to the li
      expect(event.defaultPrevented).toBe(scrolls)
      expect(scroll_into_view_mock).toHaveBeenCalledTimes(scrolls ? 1 : 0)
      expect(replace_state_mock).not.toHaveBeenCalled()

      if (checks_keyboard) {
        const buttons =
          document.querySelectorAll<HTMLButtonElement>(`aside.toc li > button`)
        buttons[0].focus()
        press_key(buttons[0], `ArrowDown`)
        await tick()
        expect(document.activeElement).toBe(buttons[1])
        expect(press_key(buttons[1], `Enter`).defaultPrevented).toBe(false)
        expect(scroll_into_view_mock).not.toHaveBeenCalled()
        expect(replace_state_mock).not.toHaveBeenCalled()
      }
    },
  )

  test(`custom rows inside a focusable wrapper still scroll on click`, async () => {
    set_body(`<h2 id="first">First</h2><h2 id="second">Second</h2>`)
    const scroll_into_view_mock = spy_scroll_into_view()
    await mount_toc({
      toc_item: createRawSnippet<[TocHeadingData]>((heading) => ({
        render: () =>
          `<span class="plain">${heading().title}<button>edit</button></span>`,
      })),
    })
    // e.g. a skip-link target <main tabindex="-1"> or a focus trap's surface: an interactive
    // element outside the row must not turn the row's own clicks into no-ops
    const wrapper = document.createElement(`div`)
    wrapper.tabIndex = -1
    document.body.append(wrapper)
    wrapper.append(doc_query(`aside.toc`))
    doc_query(`aside.toc li > span.plain`).click()
    expect(scroll_into_view_mock).toHaveBeenCalledOnce()
  })

  // the window handler preventDefaults arrows to drive its own list, and a custom toc_item's
  // fields sit inside nav, so the focus guard let them through and stole the caret
  test(`toc_item text fields keep their own arrow keys`, async () => {
    set_body(`<h2 id="first">First</h2><h2 id="second">Second</h2>`)
    mock_active_heading(`first`)
    await mount_toc({
      toc_item: createRawSnippet<[TocHeadingData]>((heading) => ({
        render: () => `<input class="filter" value="${heading().id}">`,
      })),
    })

    const field = doc_query<HTMLInputElement>(`aside.toc li > input.filter`)
    field.focus()
    const event = press_key(field, `ArrowDown`)
    await tick()

    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(field) // the ToC did not move focus off the field
  })

  test(`flash_clicked_headings_for_ms removes the clicked-heading class`, async () => {
    vi.useFakeTimers()
    set_body(`<h2 id="intro">Intro</h2>`)
    await mount_toc({ flash_clicked_headings_for_ms: 10 })

    const heading = doc_query(`#intro`)
    doc_query(`aside.toc li`).click()
    expect(heading.classList.contains(`toc-clicked`)).toBe(true)
    expect(heading.style.getPropertyValue(`--toc-flash-duration`)).toBe(`10ms`)
    vi.advanceTimersByTime(5)
    doc_query(`aside.toc li`).click()
    vi.advanceTimersByTime(5)
    expect(heading.classList.contains(`toc-clicked`)).toBe(true)
    vi.advanceTimersByTime(5)
    expect(heading.classList.contains(`toc-clicked`)).toBe(false)
    expect(heading.style.getPropertyValue(`--toc-flash-duration`)).toBe(``)
  })

  test.each([
    { heading_selector: `[` },
    { exclude_selector: `((` },
    { hide_on_intersect: `[invalid` },
  ])(`throws for invalid selectors %j`, async (props) => {
    await expect(mount_toc(props)).rejects.toThrow(/valid selector/u)
  })

  // no selector below matches anything on setup_empty_page ('h2' only hits the excluded one)
  test.each(
    [undefined, `foobar`, `h2`, `h4`].flatMap((heading_selector) =>
      [true, false].map((auto_hide) => ({ heading_selector, auto_hide })),
    ),
  )(
    `auto_hide=$auto_hide with heading_selector='$heading_selector' on an empty page`,
    async ({ heading_selector, auto_hide }) => {
      setup_empty_page()
      await mount_toc({ heading_selector, auto_hide })

      const node = doc_query(`aside.toc`)
      expect(node.getAttribute(`aria-hidden`)).toBe(String(auto_hide))
      expect(node.classList.contains(`hidden`)).toBe(auto_hide)
      expect(node.getAttribute(`hidden`)).toBe(auto_hide ? `` : null)
    },
  )

  test.each([true, false])(
    `warn_on_empty=%s stays consistent across later mutations`,
    async (warn_on_empty) => {
      const warn_mock = vi.spyOn(console, `warn`).mockImplementation(() => {})
      await mount_toc({ warn_on_empty })
      const msg = `Toc found no headings for heading_selector=':is(h2, h3, h4)' after applying exclude_selector='.toc-exclude'. Hiding table of contents.`
      const expected_calls = warn_on_empty ? [[msg]] : []
      expect(warn_mock.mock.calls).toEqual(expected_calls)

      // both the ToC render and this unrelated mutation notify the observer, but the empty
      // heading set is unchanged, so neither may rebuild and re-warn
      document.body.append(document.createElement(`p`))
      await tick()
      document.body.append(document.createElement(`p`))
      await tick()

      expect(warn_mock.mock.calls).toEqual(expected_calls)
    },
  )

  // :is(h2, h3, h4) matches 3 of levels [1, 2, 3, 4] and none of [1, 5, 6]
  test.each([
    [[1, 2, 3, 4], 1, 3],
    [[1, 2, 3, 4], 3, 3],
    [[1, 2, 3, 4], 4, 0],
    [[1, 5, 6], 1, 0],
  ])(
    `levels=%j with min_items=%s renders %s items`,
    async (levels, min_items, expected) => {
      set_body(levels.map((lvl) => `<h${lvl}>Heading ${lvl}</h${lvl}>`).join(``))

      await mount_toc({ heading_selector: `:is(h2, h3, h4)`, min_items })
      // below min_items the whole nav is dropped rather than rendered empty
      expect(toc_lis()).toHaveLength(expected)
      expect(document.querySelector(`aside.toc nav`) === null).toBe(expected === 0)
    },
  )

  test.each([
    [400, 500, 600],
    [700, 800, 900],
    [999, 1000, 1001],
  ])(
    `small=%i, breakpoint=%i, large=%i resizes between mobile and desktop`,
    async (smaller, breakpoint, larger) => {
      await mount_toc({ breakpoint })
      const node = doc_query(`aside.toc`)
      const modes = () =>
        [`desktop`, `mobile`].filter((cls) => node.classList.contains(cls))
      set_window_width(smaller)
      await tick()
      expect(modes()).toEqual([`mobile`])
      set_window_width(larger)
      await tick()
      expect(modes()).toEqual([`desktop`])
    },
  )

  test(`on_open_change handler receives open state, desktop state, and trigger`, async () => {
    set_window_width(1200)
    set_nested_pair()
    const on_open_change = vi.fn<OpenChangeHandler>()
    const events = () => on_open_change.mock.calls.map(([event]) => event)

    await mount_toc({ on_open_change, open: false })
    expect(events()).toEqual([{ desktop: true, open: false, trigger: `programmatic` }])

    set_window_width(600)
    await tick()
    await click(`aside.toc button`)
    press_key(globalThis, `Escape`)
    await tick()
    // Same-tick open changes should emit each internal trigger separately.
    doc_query(`aside.toc button`).click()
    press_key(globalThis, `Escape`)
    await tick()

    expect(events().slice(1)).toEqual([
      { desktop: false, open: true, trigger: `button` },
      { desktop: false, open: false, trigger: `escape` },
      { desktop: false, open: true, trigger: `button` },
      { desktop: false, open: false, trigger: `escape` },
    ])
  })

  test(`mobile button opens the ToC, cross-fades its icon and centres the active item`, async () => {
    globalThis.innerWidth = 600
    set_headings(2)
    const scroll_to = vi.spyOn(Element.prototype, `scrollTo`)

    await mount_toc({ desktop: false })
    expect(document.querySelector(`aside.toc > nav`)).toBeNull()
    // both glyphs stay mounted so CSS can transition between them
    const shown_icons = () =>
      [...document.querySelectorAll(`aside.toc > button > svg`)].map((svg) =>
        svg.classList.contains(`shown`),
      )
    expect(shown_icons()).toEqual([true, false]) // [closed, open]

    await click(`aside.toc button`)

    expect(shown_icons()).toEqual([false, true])
    expect(active_text()).toBe(`Heading 2`)
    expect(scroll_to).toHaveBeenCalledExactlyOnceWith({
      top: expect.any(Number),
      behavior: `instant`,
    })
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
    // removing an earlier heading shifts every index: the arrow must start from the item
    // rendered for the active heading, not a row captured before the list re-rendered
    [
      `ArrowDown after an earlier heading is removed`,
      4,
      `heading-3`,
      [`ArrowDown`],
      `Heading 4`,
      `heading-1`,
    ],
  ] as const)(`%s`, async (_, count, active_id, keys, expected, removed_id?: string) => {
    set_headings(count)
    set_window_width(600)
    mock_active_heading(active_id)
    const props = $state<TocProps>({
      dynamic: true,
      breakpoint: 10_000,
      open: true,
      active_toc_li: null,
      toc_items: [],
    })
    render(Toc, props)
    await tick()
    if (removed_id) {
      doc_query(`#${removed_id}`).remove()
      await tick()
    }

    for (const key of keys) {
      press_key(globalThis, key)
      await tick()
    }

    const active_li = doc_query(`aside.toc > nav > ol > li.active`)
    expect(active_li.textContent).toBe(expected)
    // the bound row follows the re-rendered list rather than a pre-removal copy
    expect(props.active_toc_li).toBe(active_li)
    expect(props.toc_items?.filter(Boolean)).toHaveLength(count - (removed_id ? 1 : 0))
  })

  test.each([`Enter`, ` `])(
    `desktop arrow keys move focus + selection and %j follows the real link`,
    async (key) => {
      set_headings(2)
      set_window_width(1200)
      mock_active_heading(`heading-1`)
      spy_scroll_into_view()
      const replace_mock = vi.spyOn(history, `replaceState`)
      await mount_toc()

      doc_query(`aside.toc > nav > ol > li.active > a`).focus()
      // dispatch on the focused li (bubbles) to mirror real keyboard usage
      press_key(document.activeElement ?? document.body, `ArrowDown`)
      await tick()

      // selection AND DOM focus move together; otherwise the focused li's own keydown
      // handler would override the arrow-navigation on the next Enter
      const link = doc_query<HTMLAnchorElement>(`aside.toc > nav > ol > li.active > a`)
      expect(link.textContent).toBe(`Heading 2`)
      expect(document.activeElement).toBe(link)

      // Enter activates the arrow-selected Heading 2, not the originally-focused Heading 1
      const click_spy = vi.spyOn(link, `click`)
      expect(press_key(link, key).defaultPrevented).toBe(key === ` `)
      if (key === `Enter`) {
        expect(click_spy).not.toHaveBeenCalled()
        link.click() // happy-dom does not dispatch the browser's default Enter click
      }
      expect(click_spy).toHaveBeenCalledOnce()
      expect(active_text()).toBe(`Heading 2`)
      expect(replace_mock).not.toHaveBeenCalled()
    },
  )

  test(`only the active ToC item carries aria-current="location"`, async () => {
    set_headings(2)
    await mount_toc()
    const links = [...document.querySelectorAll(`aside.toc li > a`)]
    expect(links.map((link) => link.getAttribute(`aria-current`))).toEqual([
      null,
      `location`,
    ])
  })

  // a null key means activate by clicking the first item instead of pressing a key. The
  // behavior passes straight through to scrollIntoView, so each path and value appear once.
  test.each([
    [`space`, ` `, `smooth`, `smooth`],
    [`enter`, `Enter`, `auto`, `auto`],
    [`enter`, `Enter`, undefined, `smooth`], // default scroll_behavior when prop omitted
    [`click`, null, `auto`, `auto`],
  ] as const)(
    `%s with scroll_behavior=%s scrolls with behavior %s`,
    async (_, key, scroll_behavior, expected_behavior) => {
      set_headings(2)
      const scroll_into_view_mock = spy_scroll_into_view()
      const replace_state_mock = vi.spyOn(history, `replaceState`)
      const anchor_click = vi.spyOn(HTMLAnchorElement.prototype, `click`)
      const onclick = vi.fn()

      // an open mobile ToC takes keys without needing focus or hover
      set_window_width(600)
      await mount_toc({ open: true, scroll_behavior, li_props: { onclick } })
      // keys act on the active item, the last heading in happy-dom; a click picks the first
      const item_idx = key === null ? 1 : 2
      const expected_link = doc_query(`aside.toc ol li:nth-child(${item_idx}) > a`)
      if (key === null) doc_query(`aside.toc ol li`).click()
      else press_key(globalThis, key)

      expect(scroll_into_view_mock).toHaveBeenCalledWith({
        behavior: expected_behavior,
        block: `start`,
      })
      expect(anchor_click).toHaveBeenCalledOnce()
      expect(anchor_click.mock.contexts[0]).toBe(expected_link)
      expect(expected_link).toHaveProperty(`hash`, `#heading-${item_idx}`)
      expect(onclick).toHaveBeenCalledOnce()
      expect(replace_state_mock).not.toHaveBeenCalled()
    },
  )

  // a null trigger means the key is absent from react_to_keys, so nothing should happen
  test.each([
    { desc: `Escape closes the mobile ToC`, key: `Escape`, trigger: `escape` },
    { desc: `Tab out of a focused ToC closes it`, key: `Tab`, trigger: `tab` },
    { desc: `an empty react_to_keys ignores Escape`, key: `Escape`, trigger: null },
  ] as const)(`$desc`, async ({ key, trigger }) => {
    set_headings(2)
    set_window_width(600)
    const on_open_change = vi.fn<OpenChangeHandler>()
    const react_to_keys = trigger === null ? [] : [key]
    await mount_toc({ open: true, react_to_keys, on_open_change })
    on_open_change.mockClear()

    if (trigger === `tab`) doc_query(`aside.toc > nav > ol > li.active > a`).focus()
    const key_event = press_key(globalThis, key)
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

  // the hover check used to scan the whole document for :hover on every keystroke
  test.each([
    [`Escape with a focused desktop ToC has nothing to close`, `Escape`, true],
    [`ArrowUp skips a desktop ToC neither hovered nor focused`, `ArrowUp`, false],
  ])(`%s and stays un-prevented`, async (_, key, focused) => {
    set_headings(3)
    await mount_toc()
    const active_before = doc_query(`aside.toc li.active`)
    if (focused) doc_query(`aside.toc li.active > a`).focus()
    const query_spy = vi.spyOn(document, `querySelectorAll`)
    const key_event = press_key(globalThis, key)
    await tick()
    expect(query_spy).not.toHaveBeenCalled()
    expect(key_event.defaultPrevented).toBe(false)
    expect(doc_query(`aside.toc li.active`)).toBe(active_before)
  })

  test(`mutation observer tracks headings added and removed after mount`, async () => {
    set_body(`<div id="content"><h2 id="initial">Initial Heading</h2></div>`)
    const scroll_into_view_mock = spy_scroll_into_view()
    await mount_toc()
    expect(toc_texts()).toEqual([`Initial Heading`])
    const stale_item = doc_query(`aside.toc ol li`)

    doc_query(`#content`).insertAdjacentHTML(
      `beforeend`,
      `<h3 id="added-heading">Added Heading</h3>`,
    )
    await tick()
    expect(toc_texts()).toEqual([`Initial Heading`, `Added Heading`])

    doc_query(`#initial`).remove()
    await tick()
    expect(toc_texts()).toEqual([`Added Heading`])

    // the li captured before the rebuild no longer maps to a live heading, so it can't scroll
    stale_item.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(scroll_into_view_mock).not.toHaveBeenCalled()
  })

  test(`ancestor attribute changes update heading_selector membership`, async () => {
    set_body(
      `<h2 id="a">Alpha</h2><h3 id="b">Beta</h3><h4 id="c">Gamma</h4><main><h5 id="d">Delta</h5></main>`,
    )
    onTestFinished(() => {
      document.body.classList.remove(`deep`)
      delete document.documentElement.dataset.full
    })
    await mount_toc({
      heading_selector: `h2, body.deep h3, [data-full] h4, main.expanded h5`,
    })
    expect(toc_texts()).toEqual([`Alpha`])

    document.body.classList.add(`deep`)
    await tick()
    expect(toc_texts()).toEqual([`Alpha`, `Beta`])
    document.documentElement.dataset.full = ``
    await tick()
    expect(toc_texts()).toEqual([`Alpha`, `Beta`, `Gamma`])
    doc_query(`main`).classList.add(`expanded`)
    await tick()
    expect(toc_texts()).toEqual([`Alpha`, `Beta`, `Gamma`, `Delta`])
  })

  test(`unrelated DOM mutations skip the heading rebuild while real changes don't`, async () => {
    set_body(`<h2 id="a">Alpha</h2><h2 id="b">Beta</h2><p>Original</p>`)
    const get_heading_data = vi.fn((node: HTMLHeadingElement) => ({
      id: node.id,
      level: Number(node.nodeName[1]),
      title: node.textContent ?? ``,
    }))
    await mount_toc({ get_heading_data })
    get_heading_data.mockClear()

    // happy-dom returns all-zero rects, so set_active_heading picks the last heading
    expect(active_text()).toBe(`Beta`)

    // arrange rects so any rebuild's set_active_heading() would switch active to Alpha
    mock_active_heading(`a`)
    // every childList record used to trigger a full-document heading re-query, so any
    // unrelated insertion paid for it. `doc_query` is singular, so it cannot trip this spy.
    const query_spy = vi.spyOn(document, `querySelectorAll`)

    // a heading-less subtree (a toast, a virtualized row) must skip the rebuild,
    // so set_active_heading never runs and active stays put
    const noise = document.createElement(`div`)
    noise.innerHTML = `<span>row</span><span>row</span>`
    document.body.append(noise)
    await tick()
    expect(query_spy).not.toHaveBeenCalled()
    expect(active_text()).toBe(`Beta`)

    noise.remove()
    await tick()
    expect(query_spy).not.toHaveBeenCalled()

    // Text changes outside headings and root style writes must also leave the active item alone.
    onTestFinished(() => {
      document.documentElement.style.removeProperty(`--scroll-y`)
      document.body.removeAttribute(`data-theme`)
    })
    ;(doc_query(`p`).firstChild as Text).data = `Changed`
    document.documentElement.style.setProperty(`--scroll-y`, `10px`)
    await tick()
    expect(query_spy).not.toHaveBeenCalled()
    expect(get_heading_data).not.toHaveBeenCalled()
    expect(active_text()).toBe(`Beta`)

    // <body>/<html> attributes can change selector membership, so they re-query, but an
    // unchanged heading set keeps the active item
    document.body.setAttribute(`data-theme`, `dark`)
    await tick()
    expect(query_spy).toHaveBeenCalled()
    expect(active_text()).toBe(`Beta`)
    query_spy.mockClear()

    // appending a real heading changes the set, so the rebuild runs and active updates
    document.body.insertAdjacentHTML(`beforeend`, `<h2 id="c">Gamma</h2>`)
    await tick()
    expect(query_spy).toHaveBeenCalled()
    expect(active_text()).toBe(`Gamma`)
  })

  test.each([
    [
      `characterData`,
      (heading: HTMLElement) => ((heading.firstChild as Text).data = `New`),
    ],
    [`childList`, (heading: HTMLElement) => (heading.textContent = `New`)],
    [`id attribute`, (heading: HTMLElement) => (heading.id = `new`)],
  ])(`heading %s edits update the ToC`, async (kind, edit) => {
    set_body(`<h2 id="old">Old</h2>`)
    await mount_toc()
    expect(toc_texts()).toEqual([`Old`])

    edit(doc_query(`body > h2`))
    await tick()
    const link = doc_query(`aside.toc li > a`)
    const renamed = kind === `id attribute`
    expect(link.textContent.trim()).toBe(renamed ? `Old` : `New`)
    expect(link.getAttribute(`href`)).toBe(renamed ? `#new` : `#old`)
  })

  test(`selector-driven attribute changes update heading membership`, async () => {
    set_body(`<h2 class="toc-exclude">Alpha</h2><h2>Beta</h2><h5 id="gamma">Gamma</h5>`)
    await mount_toc({ heading_selector: `:is(h2, h5[data-toc-heading])` })
    expect(toc_texts()).toEqual([`Beta`])

    doc_query(`.toc-exclude`).classList.remove(`toc-exclude`)
    doc_query(`#gamma`).setAttribute(`data-toc-heading`, ``)
    await tick()
    expect(toc_texts()).toEqual([`Alpha`, `Beta`, `Gamma`])
  })

  test(`rebinds when a heading element is replaced with identical content`, async () => {
    set_body(`<h2 id="a">Title</h2>`)
    await mount_toc()

    // a framework re-render can swap in a fresh element with the same id/text; the
    // element-identity check must rebuild so clicks target the live (attached) heading
    doc_query(`#a`).outerHTML = `<h2 id="a">Title</h2>`
    const scroll_spy = vi.spyOn(doc_query(`#a`), `scrollIntoView`)
    await tick()

    doc_query(`aside.toc li`).click()
    expect(scroll_spy).toHaveBeenCalled()
  })

  // Tests for issue #50: scroll_target prevents flicker during programmatic scrolling
  // https://github.com/janosh/svelte-toc/issues/50
  describe(`scroll_target behavior`, () => {
    const scroll_mock = vi.fn<Element[`scrollIntoView`]>()

    // unmocked headings all report top=0, so plain detection lands on the last: `Heading 3`
    // means scroll_target was released, `Heading 1` that it still pins the clicked heading
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
      await mount_toc({ open: true })
      expect(active_text()).toBe(`Heading 3`)

      await click(`aside.toc ol li`)
      // the clicked heading goes active at once and survives intermediate scrolls
      expect(active_text()).toBe(`Heading 1`)
      expect(scroll_mock).toHaveBeenCalledOnce()
      await scroll()
      expect(active_text()).toBe(`Heading 1`)

      release()
      await scroll()
      expect(active_text()).toBe(`Heading 3`)
    })

    // a distance to the target that grows past the 50px threshold reads as the user
    // scrolling away; a shrinking one as the smooth scroll still closing in
    test.each([
      [`holds while the smooth scroll closes in`, 2000, [1500, 800, 200], `Heading 1`],
      [`releases when the user scrolls away`, 150, [150, 500], `Heading 3`],
    ] as const)(`scroll_target %s`, async (_, initial_top, tops, expected) => {
      await mount_toc({ open: true })

      let mock_top: number = initial_top
      vi.spyOn(doc_query(`#heading-1`), `getBoundingClientRect`).mockImplementation(() =>
        dom_rect({ top: mock_top }),
      )

      await click(`aside.toc ol li`)
      expect(active_text()).toBe(`Heading 1`)

      for (const top of tops) {
        mock_top = top
        await scroll()
      }
      expect(active_text()).toBe(expected)
    })

    test(`removing scroll target activates a remaining heading`, async () => {
      await mount_toc({ open: true })

      await click(`aside.toc ol li`)
      expect(active_text()).toBe(`Heading 1`)

      doc_query(`#heading-1`).remove()
      await tick()

      expect(active_text()).toBe(`Heading 3`)
    })

    test(`rapid clicks activate last clicked item`, async () => {
      await mount_toc({ open: true })

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

describe(`hide_on_intersect`, () => {
  const mock_bounding_rect = (element: Element, rect: Partial<DOMRect>) =>
    vi.spyOn(element, `getBoundingClientRect`).mockReturnValue(dom_rect(rect))

  const clear_of_toc = { top: 0, bottom: 50, left: 0, right: 1200 }
  const over_toc = { top: 150, bottom: 250, left: 0, right: 1200 }

  // parks the ToC top-right so only a banner's vertical extent decides overlap
  type BannerOptions = {
    target?: (b1: HTMLElement, b2: HTMLElement) => TocProps[`hide_on_intersect`]
    window_width?: number
    b2_rect?: Partial<DOMRect>
  }
  const setup_banners = async ({
    target = () => `.banner`,
    window_width = 1200,
    b2_rect = over_toc,
  }: BannerOptions = {}) => {
    set_body(
      `<h2>Heading 1</h2><div class="banner" id="b1">B1</div><div class="banner" id="b2">B2</div>`,
    )
    globalThis.innerWidth = window_width
    const [b1, b2] = [doc_query(`#b1`), doc_query(`#b2`)]
    await mount_toc({ hide_on_intersect: target(b1, b2), open: true })

    const aside = doc_query(`aside.toc`)
    mock_bounding_rect(aside, { top: 100, bottom: 300, left: 800, right: 1000 })
    mock_bounding_rect(b1, clear_of_toc)
    mock_bounding_rect(b2, b2_rect)
    return { aside, b2 }
  }

  const is_intersecting = (aside: HTMLElement) => aside.classList.contains(`intersecting`)

  test.each<[string, boolean, BannerOptions]>([
    [`hides the ToC when a banner overlaps it`, true, {}],
    [`keeps the ToC when no banner overlaps`, false, { b2_rect: clear_of_toc }],
    [`ignores overlap on mobile`, false, { window_width: 600 }],
    [`accepts an HTMLElement array`, true, { target: (b1, b2) => [b1, b2] }],
    [`ignores a selector matching nothing`, false, { target: () => `.x` }],
  ])(`%s`, async (_, expected, options) => {
    const { aside } = await setup_banners(options)
    await scroll()
    expect(is_intersecting(aside)).toBe(expected)
  })

  test(`re-shows the ToC once the overlap ends`, async () => {
    const { aside, b2 } = await setup_banners()
    await scroll()
    expect(is_intersecting(aside)).toBe(true)
    // opacity: 0 alone leaves the links tabbable, so the subtree must be inert while hidden
    expect(aside.hasAttribute(`inert`)).toBe(true)

    mock_bounding_rect(b2, { top: 500, bottom: 600, left: 0, right: 1200 })
    await scroll()
    expect(is_intersecting(aside)).toBe(false)
    expect(aside.hasAttribute(`inert`)).toBe(false)
  })
})

describe(`Element Prop Bags`, () => {
  // one shared marker covers style pass-through everywhere; class values vary (string/array/
  // object) to cover Svelte's forms. A longhand, since happy-dom would split a shorthand.
  const marker_style = `opacity: 0.5;`

  const prop_bag_cases = [
    {
      element_name: `aside`,
      prop_name: `aside_props`,
      bag: { class: [`custom-class`, { 'custom-object-class': true }] },
      extra_props: { hide: true, auto_hide: false },
      selector: `aside.toc`,
      expected_classes: [`toc`, `custom-class`, `custom-object-class`],
      expected_attributes: { hidden: ``, 'aria-hidden': `true` },
    },
    {
      element_name: `nav`,
      prop_name: `nav_props`,
      bag: { class: `custom-class` },
      selector: `aside.toc nav`,
      expected_classes: [`custom-class`],
    },
    {
      element_name: `title`,
      prop_name: `title_props`,
      bag: { class: { 'custom-class': true } },
      extra_props: { title: `Test Custom Title` },
      selector: `aside.toc nav .toc-title`,
      expected_classes: [`toc-title`, `toc-exclude`, `custom-class`],
    },
    {
      element_name: `ol`,
      prop_name: `ol_props`,
      bag: { class: `custom-class`, start: 3, reversed: true },
      selector: `aside.toc nav ol`,
      expected_classes: [`custom-class`],
      expected_attributes: { start: `3`, reversed: `` },
    },
    {
      element_name: `li`,
      prop_name: `li_props`,
      bag: { class: `custom-class`, onclick: vi.fn<() => void>(), value: 7 },
      selector: `aside.toc nav ol li`,
      expected_classes: [`active`, `custom-class`],
      expected_attributes: { value: `7` },
      setup: () => set_body(`<h2>Single Heading</h2>`),
    },
    {
      element_name: `open button`,
      prop_name: `open_button_props`,
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
      // the button only renders on mobile, and only once there are headings to list
      setup: () => {
        set_nested_pair()
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
      setup = set_nested_pair,
    }) => {
      setup()
      const on_open_change = vi.fn<OpenChangeHandler>()
      const full_bag = { ...bag, style: marker_style, 'data-testid': prop_name }
      await mount_toc({ ...extra_props, on_open_change, [prop_name]: full_bag })
      on_open_change.mockClear()

      const element = doc_query(selector)
      expect(element.getAttribute(`style`)).toContain(marker_style)
      expect(element.getAttribute(`data-testid`)).toBe(prop_name)
      expect([...element.classList]).toEqual(expect.arrayContaining(expected_classes))
      for (const [name, value] of Object.entries(expected_attributes))
        expect(element.getAttribute(name)).toBe(value)
      if (`onclick` in bag) {
        element.dispatchEvent(
          new MouseEvent(`click`, { bubbles: true, cancelable: true }),
        )
        await tick()
        // happy-dom honors `disabled` for dispatched clicks, unlike jsdom
        expect(bag.onclick).toHaveBeenCalledTimes(`disabled` in bag ? 0 : 1)
      }
      // neither the li click nor the prevented button click toggles the panel
      expect(on_open_change).not.toHaveBeenCalled()
    },
  )

  test(`li_props.style preserves generated styles without multiline whitespace`, async () => {
    set_nested_pair()
    await mount_toc({ li_props: { style: `padding-left: 10px;` } })

    const style_attribute = doc_query(`aside.toc nav ol li:nth-child(2)`).getAttribute(
      `style`,
    )
    expect(style_attribute).toContain(`padding-left: 10px;`)
    // happy-dom's parser drops these, so assert on what Svelte wrote, not on the element
    expect(written_style_values(`margin-left`)).toContain(
      `margin-left: calc(1 * var(--toc-indent-per-level, 1em))`,
    )
    expect(written_style_values(`font-size`)).toContain(
      `font-size: max(var(--toc-li-font-size-min, 2ex), calc(var(--toc-li-font-size-base, 3ex) - 1 * var(--toc-li-font-size-step, 0.1ex)))`,
    )
    expect(written_css_texts.join(``)).not.toContain(`\n`)
  })

  // equal specificity, so source order decides: with hover first, an unset --toc-active-bg
  // made `background` invalid on the active row and swallowed its hover fill
  test(`the hover rule is declared after the active rule`, async () => {
    set_headings(1)
    await mount_toc()

    const css = document.head.textContent
    expect(css.indexOf(`--toc-li-hover-bg`)).toBeGreaterThan(
      css.indexOf(`--toc-active-bg`),
    )
  })

  test.each([
    [`aside base rule`, /box-sizing: border-box;/, true],
    [`nav base rule`, /overflow: var\(--toc-overflow, auto\);/, true],
    [`list item base rule`, /color: var\(--toc-li-color\);/, true],
    [`open button base rule`, /bottom: var\(--toc-mobile-btn-bottom, 0\);/, true],
    // https://github.com/janosh/svelte-toc/issues/71
    [
      `ordered list structural rule`,
      /list-style: var\(--toc-ol-list-style, none\);/,
      false,
      /aside\.toc.*> nav.*> ol/,
    ],
    // under `:where()` a host `button { padding }` reset outweighed this and resized the
    // hit target, leaving the toggle a different size from Nav's burger
    [
      `open button box rule`,
      /padding-block: var\(--toc-mobile-btn-padding, [\d.]+rem\);/,
      false,
      /aside\.toc.*> button/,
    ],
  ])(
    `uses expected selector specificity for %s`,
    async (_, declaration_pattern, expects_where, selector_pattern = /.*/) => {
      set_nested_pair()
      await mount_toc()

      const selector_line = find_matching_css_selector(
        document.head.textContent,
        declaration_pattern,
      )
      expect(selector_line.startsWith(`:where(`)).toBe(expects_where)
      expect(selector_line).toMatch(selector_pattern)
    },
  )
})

describe(`collapse_subheadings`, () => {
  // expected_collapsed is a 0/1 mask over the 8 nested headings in document order
  test.each([
    [`collapse disabled`, false, `detail-1-2-1`, [0, 0, 0, 0, 0, 0, 0, 0]],
    [`full nesting with h2 active`, true, `section-1`, [0, 0, 1, 1, 0, 1, 0, 1]],
    [`full nesting with h3 active`, true, `sub-1-1`, [0, 0, 0, 0, 0, 1, 0, 1]],
    [`full nesting with h4 active`, true, `detail-1-1-1`, [0, 0, 0, 0, 0, 1, 0, 1]],
    // deep active under a second-position parent: a preceding uncle's subtree
    // (detail-1-1-*) must stay collapsed, exercising the ancestor-chain walk
    [
      `full nesting, active h4 under second h3`,
      true,
      `detail-1-2-1`,
      [0, 0, 1, 1, 0, 0, 0, 1],
    ],
    // the top level never collapses; everything under the unrelated Section 1 does
    [`full nesting, trailing h3 active`, true, `sub-2-1`, [0, 1, 1, 1, 1, 1, 0, 0]],
    [`h3 threshold with h2 active`, `h3`, `section-1`, [0, 0, 0, 0, 0, 0, 0, 1]],
  ] as const)(`%s`, async (_, mode, active_id, collapsed_mask) => {
    setup_nested_headings()
    mock_active_heading(active_id)
    await mount_toc({ collapse_subheadings: mode })

    // collapsed rows also leave the accessibility tree and the tab order
    const states = toc_lis().map((li) => [
      li.classList.contains(`collapsed`),
      li.getAttribute(`aria-hidden`),
      li.querySelector(`a`)?.getAttribute(`tabindex`),
    ])
    expect(states).toEqual(
      collapsed_mask.map((bit) => (bit ? [true, `true`, `-1`] : [false, null, `0`])),
    )
  })

  test.each([`h9`, `hx`, `3`])(`invalid collapse mode %s throws`, async (mode) => {
    await expect(
      mount_toc({ collapse_subheadings: mode as CollapseMode }),
    ).rejects.toThrow(`Toc received invalid collapse_subheadings='${mode}'`)
  })
})

test.each([`scrollend`, `timeout`, `older unmount`, `newer unmount`])(
  `overlapping TOCs restore root styles on %s`,
  async (completion) => {
    vi.useFakeTimers()
    const { style } = document.documentElement
    style.setProperty(`scroll-behavior`, `auto`, `important`)
    try {
      set_headings(2)
      const unmounts = [await mount_toc(), await mount_toc({ scroll_behavior: `auto` })]
      const panels = document.querySelectorAll(`aside.toc`)
      for (const link of panels[0].querySelectorAll<HTMLAnchorElement>(`li > a`))
        link.click()
      expect(style.scrollBehavior).toBe(`smooth`)
      for (const link of panels[1].querySelectorAll<HTMLAnchorElement>(`li > a`))
        link.click()
      await vi.advanceTimersByTimeAsync(20)
      expect(style.scrollBehavior).toBe(`auto`)
      if (completion === `scrollend`) window.dispatchEvent(new Event(`scrollend`))
      else if (completion === `timeout`) await vi.advanceTimersByTimeAsync(1000)
      else {
        const idx = completion === `older unmount` ? 0 : 1
        await unmounts[idx]()
        expect(style.scrollBehavior).toBe(idx === 0 ? `auto` : `smooth`)
        await unmounts[1 - idx]()
      }
      expect(style.scrollBehavior).toBe(`auto`)
      expect(style.getPropertyPriority(`scroll-behavior`)).toBe(`important`)
    } finally {
      style.removeProperty(`scroll-behavior`)
    }
  },
)
