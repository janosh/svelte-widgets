import { highlight_matches } from '$lib/attachments'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  onTestFinished,
  vi,
} from 'vite-plus/test'
import { stub_css_highlights } from '../index'

describe(`highlight_matches`, () => {
  let mock_element: HTMLElement
  let mock_css_highlights: Map<string, unknown>
  let clear_highlights_spy: ReturnType<typeof vi.fn>
  let set_highlights_spy: ReturnType<typeof vi.fn>
  let delete_highlights_spy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    mock_element = document.createElement(`div`)
    const stub = stub_css_highlights()
    mock_css_highlights = stub.registry
    clear_highlights_spy = stub.clear_spy
    set_highlights_spy = stub.set_spy
    delete_highlights_spy = stub.delete_spy
  })

  // the timing cases below opt into fake timers individually, so undo it centrally
  afterEach(() => vi.useRealTimers())

  const get_highlight_ranges = (): Range[] => {
    const highlight = mock_css_highlights.get(`highlight-match`) as
      | { ranges?: Range[] }
      | undefined
    if (!Array.isArray(highlight?.ranges)) throw new Error(`Expected highlight ranges`)
    return highlight.ranges
  }

  it.each([
    [`whitespace-only query`, ` \t\n `, `a b`, false, undefined, undefined],
    [
      `case insensitive`,
      `test`,
      `<p>Test with TEST and TeSt</p>`,
      false,
      [`Test`, `TEST`, `TeSt`],
      undefined,
    ],
    [
      `no cross-node match`,
      `bc`,
      `<ul><li>ab</li><li>cd</li></ul>`,
      false,
      [],
      undefined,
    ],
    [`no matches`, `xyz`, `<p>Content without search term</p>`, false, [], undefined],
    [
      `fuzzy no matches`,
      `xyz`,
      `<p>Content without search term</p>`,
      true,
      [],
      undefined,
    ],
    [
      `skip with node_filter`,
      `test`,
      `<div>Test content</div><li class="user-msg">Test hidden</li>`,
      false,
      [`Test`],
      (node: Node) =>
        node?.parentElement?.closest(`li.user-msg`)
          ? NodeFilter.FILTER_REJECT
          : NodeFilter.FILTER_ACCEPT,
    ],
  ])(`%s`, (_desc, query, html_content, fuzzy, expected_matches, node_filter) => {
    mock_element.innerHTML = html_content
    const cleanup = highlight_matches({ query, fuzzy, node_filter })(mock_element)

    expect(mock_css_highlights.size).toBe(expected_matches === undefined ? 0 : 1)
    expect(clear_highlights_spy).not.toHaveBeenCalled()
    if (expected_matches !== undefined) {
      expect(set_highlights_spy).toHaveBeenCalledWith(
        `highlight-match`,
        expect.any(Object),
      )
      expect(get_highlight_ranges().map((range) => range.toString())).toEqual(
        expected_matches,
      )
    }
    cleanup?.()
  })

  it(`normalizes query and source whitespace without shifting ranges`, () => {
    mock_element.textContent = `form\n submit`
    const cleanup = highlight_matches({ query: ` form  submit ` })(mock_element)

    expect(get_highlight_ranges().map((range) => range.toString())).toEqual([
      `form\n submit`,
    ])
    cleanup?.()
  })

  it.each([
    [`CSS is missing`, () => vi.stubGlobal(`CSS`, undefined)],
    [`Highlight is missing`, () => vi.stubGlobal(`Highlight`, undefined)],
  ])(`runs range effects when %s`, (_desc, prepare) => {
    prepare()
    mock_element.textContent = `PageSearch result`
    const on_highlight = vi.fn()

    const cleanup = highlight_matches({ query: `PageSearch`, on_highlight })(mock_element)

    expect(on_highlight).toHaveBeenCalledExactlyOnceWith({
      node: mock_element,
      ranges: [expect.any(Range)],
    })
    expect(set_highlights_spy).not.toHaveBeenCalled()
    cleanup?.()
  })

  it.each([
    [`disabled scrolling`, false, undefined],
    [
      `custom scrolling`,
      { behavior: `instant`, block: `start`, inline: `nearest` },
      { behavior: `instant`, block: `start`, inline: `nearest` },
    ],
  ] as const)(`supports %s`, (_description, scroll_to_match, expected_options) => {
    mock_element.textContent = `PageSearch result`
    const scroll_into_view = vi.fn()
    mock_element.scrollIntoView = scroll_into_view

    const cleanup = highlight_matches({
      query: `PageSearch`,
      scroll_to_match,
    })(mock_element)

    expect(scroll_into_view.mock.calls).toEqual(
      expected_options ? [[expected_options]] : [],
    )
    cleanup?.()
  })

  it(`fuzzy highlighting marks matching characters in order`, () => {
    mock_element.innerHTML = `<p>allow-user-options</p>`

    const cleanup = highlight_matches({ query: `auo`, fuzzy: true })(mock_element)
    if (cleanup) onTestFinished(cleanup)

    const ranges = get_highlight_ranges()
    expect(ranges.map((range) => [range.startOffset, range.endOffset])).toEqual([
      [0, 1],
      [6, 7],
      [11, 12],
    ])
  })

  // 'İ' (U+0130) lowercases to 2 UTF-16 units, so ranges must map back to the ORIGINAL
  // offsets: in 'İİİab' the naive 'a'/'b' offsets are 6/7, the original ones 3/4
  it.each([
    [`substring`, false],
    [`fuzzy`, true],
  ])(
    `%s highlighting maps offsets back to original text when lowercasing changes length`,
    (_desc, fuzzy) => {
      mock_element.innerHTML = `<p>İİİab</p>`

      const cleanup = highlight_matches({ query: `ab`, fuzzy })(mock_element)
      if (cleanup) onTestFinished(cleanup)
      const ranges = get_highlight_ranges()
      const offsets = ranges.map((range) => [range.startOffset, range.endOffset])
      // substring: one 'ab' range; fuzzy: single-char ranges for 'a' and 'b'
      expect(offsets).toEqual(
        fuzzy
          ? [
              [3, 4],
              [4, 5],
            ]
          : [[3, 5]],
      )
    },
  )

  it.each([
    [`astral character`, `😀x`, `😀`, [[0, 2]]],
    [`length-changing lowercase`, `İx`, `İ`, [[0, 1]]],
  ] as const)(
    `fuzzy highlighting keeps each %s range whole`,
    (_description, text, query, expected) => {
      mock_element.textContent = text

      const cleanup = highlight_matches({ query, fuzzy: true })(mock_element)
      if (cleanup) onTestFinished(cleanup)

      expect(
        get_highlight_ranges().map((range) => [range.startOffset, range.endOffset]),
      ).toEqual(expected)
    },
  )

  it(`updates highlights when matching text is inserted`, async () => {
    const scroll_into_view = vi.fn()
    mock_element.scrollIntoView = scroll_into_view
    const effect_cleanup = vi.fn()
    const on_highlight = vi.fn(() => effect_cleanup)
    const cleanup = highlight_matches({ query: `PageSearch`, on_highlight })(mock_element)
    expect(scroll_into_view).not.toHaveBeenCalled()
    expect(on_highlight).toHaveBeenCalledExactlyOnceWith({
      node: mock_element,
      ranges: [],
    })
    mock_element.textContent = `PageSearch excerpt`
    await Promise.resolve()

    expect(mock_css_highlights.get(`highlight-match`)).toMatchObject({
      ranges: [expect.any(Range)],
    })
    expect(scroll_into_view).toHaveBeenCalledExactlyOnceWith({
      behavior: `smooth`,
      block: `center`,
    })
    expect(on_highlight).toHaveBeenCalledTimes(2)
    expect(effect_cleanup).toHaveBeenCalledOnce()
    cleanup?.()
    mock_element.textContent = `PageSearch updated excerpt`
    await Promise.resolve()

    expect(effect_cleanup).toHaveBeenCalledTimes(2)
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
  })

  it(`supports timed highlights and opt-in range effects`, async () => {
    vi.useFakeTimers()
    mock_element.textContent = `PageSearch result`
    const effect_cleanup = vi.fn()

    const cleanup = highlight_matches({
      query: `PageSearch`,
      duration_ms: 50,
      on_highlight: () => effect_cleanup,
    })(mock_element)

    await vi.advanceTimersByTimeAsync(50)
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
    expect(effect_cleanup).toHaveBeenCalledOnce()

    cleanup?.()
    expect(effect_cleanup).toHaveBeenCalledOnce()
  })

  it(`removes highlights when range effect setup or cleanup throws`, () => {
    mock_element.textContent = `PageSearch result`

    expect(() =>
      highlight_matches({
        query: `PageSearch`,
        on_highlight: () => {
          throw new Error(`effect failed`)
        },
      })(mock_element),
    ).toThrow(`effect failed`)
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)

    const cleanup = highlight_matches({
      query: `PageSearch`,
      on_highlight: () => () => {
        throw new Error(`cleanup failed`)
      },
    })(mock_element)
    expect(() => cleanup?.()).toThrow(`cleanup failed`)
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
  })

  it(`stays disposed when range effect cleanup removes the attachment`, async () => {
    mock_element.textContent = `PageSearch result`
    let cleanup: (() => void) | undefined
    const on_highlight = vi.fn(() => () => cleanup?.())
    cleanup = highlight_matches({ query: `PageSearch`, on_highlight })(mock_element)

    mock_element.textContent = `Updated PageSearch result`
    await Promise.resolve()

    expect(on_highlight).toHaveBeenCalledOnce()
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
  })

  it(`aggregates same-name highlights across attached elements`, () => {
    const second_element = document.createElement(`div`)
    const other_highlight = { external: true }
    mock_css_highlights.set(`other-highlight`, other_highlight)
    mock_element.textContent = `First match`
    second_element.textContent = `Second match`

    const cleanup_first = highlight_matches({ query: `match` })(mock_element)
    const cleanup_second = highlight_matches({ query: `match` })(second_element)

    expect(mock_css_highlights.get(`highlight-match`)).toMatchObject({
      ranges: [expect.any(Range), expect.any(Range)],
    })
    cleanup_first?.()
    expect(mock_css_highlights.get(`highlight-match`)).toMatchObject({
      ranges: [expect.any(Range)],
    })
    cleanup_second?.()
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
    expect(mock_css_highlights.get(`other-highlight`)).toBe(other_highlight)
    expect(delete_highlights_spy).toHaveBeenCalledWith(`highlight-match`)
  })

  it.each([
    [`restores a pre-existing`, `keep`],
    [`preserves a later replacement`, `replace`],
    [`respects a later deletion of the`, `delete`],
  ])(`%s same-name highlight`, (_description, external_action) => {
    const previous = { external: `previous` }
    const replacement = { external: `replacement` }
    mock_css_highlights.set(`highlight-match`, previous)
    mock_element.textContent = `match`

    const cleanup = highlight_matches({ query: `match` })(mock_element)
    if (external_action === `replace`)
      mock_css_highlights.set(`highlight-match`, replacement)
    if (external_action === `delete`) mock_css_highlights.delete(`highlight-match`)
    cleanup?.()

    expect(mock_css_highlights.get(`highlight-match`)).toBe(
      external_action === `replace`
        ? replacement
        : external_action === `keep`
          ? previous
          : undefined,
    )
  })

  it(`observe_mutations: false freezes the highlight at attach time`, async () => {
    mock_element.textContent = `nothing here`
    const cleanup = highlight_matches({
      query: `PageSearch`,
      observe_mutations: false,
    })(mock_element)

    mock_element.textContent = `PageSearch excerpt`
    await Promise.resolve()

    expect(get_highlight_ranges()).toHaveLength(0)
    cleanup?.()
  })

  // flush the MutationObserver microtask before advancing timers, or the burst never arms
  // the debounce; afterEach restores real timers since max_wait keys off Date.now()
  it(`debounced observation coalesces a burst into one re-run`, async () => {
    vi.useFakeTimers()
    mock_element.textContent = `nothing here`
    const on_highlight = vi.fn()
    const cleanup = highlight_matches({
      query: `line`,
      on_highlight,
      observe_mutations: { debounce_ms: 50, max_wait_ms: 1000 },
    })(mock_element)
    expect(on_highlight).toHaveBeenCalledTimes(1) // the initial run

    for (const idx of [1, 2, 3]) {
      mock_element.append(document.createTextNode(` line ${idx}`))
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(20) // shorter than debounce_ms
    }
    expect(on_highlight).toHaveBeenCalledTimes(1) // still nothing but the initial run

    await vi.advanceTimersByTimeAsync(50)
    expect(on_highlight).toHaveBeenCalledTimes(2)
    expect(get_highlight_ranges()).toHaveLength(3)
    cleanup?.()
  })

  it(`max_wait_ms forces a re-run through a burst that never pauses`, async () => {
    vi.useFakeTimers()
    mock_element.textContent = `nothing here`
    const on_highlight = vi.fn()
    const cleanup = highlight_matches({
      query: `line`,
      on_highlight,
      observe_mutations: { debounce_ms: 50, max_wait_ms: 120 },
    })(mock_element)

    // a mutation every 40 ms would reset a plain debounce forever
    for (const idx of [1, 2, 3, 4]) {
      mock_element.append(document.createTextNode(` line ${idx}`))
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(40)
    }

    expect(on_highlight).toHaveBeenCalledTimes(2) // initial run plus the capped one
    cleanup?.()
  })

  it(`cleanup drops a pending debounced re-run`, async () => {
    vi.useFakeTimers()
    mock_element.textContent = `nothing here`
    const on_highlight = vi.fn()
    const cleanup = highlight_matches({
      query: `line`,
      on_highlight,
      observe_mutations: { debounce_ms: 50 },
    })(mock_element)

    mock_element.append(document.createTextNode(` line 1`))
    await Promise.resolve()
    await vi.advanceTimersByTimeAsync(10)
    expect(vi.getTimerCount()).toBe(1)

    cleanup?.()
    // disarmed, not merely ignored: a live timer pins the closure and node's event loop
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(100)

    expect(on_highlight).toHaveBeenCalledTimes(1)
    expect(mock_css_highlights.has(`highlight-match`)).toBe(false)
  })
})
