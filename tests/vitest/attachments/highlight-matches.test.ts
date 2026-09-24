import { highlight_matches } from '$lib/attachments'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { stub_css_highlights } from '../index'

describe(`highlight_matches`, () => {
  let node: HTMLElement
  let registry: Map<string, unknown>
  let set_spy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    node = document.createElement(`div`)
    ;({ registry, set_spy } = stub_css_highlights())
  })

  const ranges = (): Range[] =>
    (registry.get(`highlight-match`) as { ranges: Range[] } | undefined)?.ranges ?? []
  const offsets = () => ranges().map((range) => [range.startOffset, range.endOffset])

  it.each([
    [
      `case insensitive`,
      `test`,
      `<p>Test with TEST and TeSt</p>`,
      [`Test`, `TEST`, `TeSt`],
    ],
    // substring matches come from search_text, so they span inline markup
    [
      `across inline markup`,
      `foo bar`,
      `<p>fo<b>o</b> <code>bar</code></p>`,
      [`foo bar`],
    ],
    [
      `node_filter`,
      `test`,
      `<p>Test content</p><p class="skip">Test hidden</p>`,
      [`Test`],
    ],
  ])(`highlights substring matches: %s`, (_desc, query, html, expected) => {
    node.innerHTML = html
    const node_filter = (text: Node) =>
      text.parentElement?.closest(`.skip`)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    const cleanup = highlight_matches({ query, node_filter })(node)
    expect(ranges().map(String)).toEqual(expected)
    cleanup?.()
    expect(registry.has(`highlight-match`)).toBe(false)
  })

  it.each([
    [`whitespace-only query`, { query: ` \t\n ` }],
    [`disabled`, { query: `a`, disabled: true }],
  ])(`owns no highlight for a %s`, (_desc, options) => {
    node.textContent = `a b`
    expect(highlight_matches(options)(node)).toBeUndefined()
    expect(set_spy).not.toHaveBeenCalled()
  })

  // fuzzy ranges cover whole code points: astral pairs stay together and chars whose
  // lowercase grows (İ -> i + dot) map back to their one source unit
  it.each([
    [
      `allow-user-options`,
      `auo`,
      [
        [0, 1],
        [6, 7],
        [11, 12],
      ],
    ],
    [
      `İİİab`,
      `ab`,
      [
        [3, 4],
        [4, 5],
      ],
    ],
    [`😀x`, `😀`, [[0, 2]]],
    [`İx`, `İ`, [[0, 1]]],
    [`Content without search term`, `xyz`, []],
  ])(`fuzzy highlighting of %p for %p marks %j`, (text, query, expected) => {
    node.textContent = text
    highlight_matches({ query, fuzzy: true })(node)
    expect(offsets()).toEqual(expected)
  })

  it.each([
    [`default scrolling`, undefined, [[{ behavior: `smooth`, block: `center` }]]],
    [`disabled scrolling`, false, []],
    [`custom scrolling`, { block: `start` }, [[{ block: `start` }]]],
  ] as const)(`supports %s`, (_desc, scroll_to_match, expected_calls) => {
    node.textContent = `PageSearch result`
    node.scrollIntoView = vi.fn()
    highlight_matches({ query: `PageSearch`, scroll_to_match })(node)
    expect(vi.mocked(node.scrollIntoView).mock.calls).toEqual(expected_calls)
  })

  it.each([
    [`CSS is missing`, () => vi.stubGlobal(`CSS`, undefined)],
    [`Highlight is missing`, () => vi.stubGlobal(`Highlight`, undefined)],
  ])(
    `still scrolls and runs on_highlight without installing a highlight when %s`,
    (_desc, prepare) => {
      prepare()
      node.textContent = `PageSearch result`
      node.scrollIntoView = vi.fn()
      const on_highlight = vi.fn()
      highlight_matches({ query: `PageSearch`, on_highlight })(node)?.()
      expect(node.scrollIntoView).toHaveBeenCalledOnce()
      expect(on_highlight).toHaveBeenCalledExactlyOnceWith({
        node,
        ranges: [expect.any(Range)],
      })
      expect(set_spy).not.toHaveBeenCalled()
    },
  )

  it(`re-highlights inserted text, scrolls once, and stops after cleanup`, async () => {
    node.scrollIntoView = vi.fn()
    const effect_cleanup = vi.fn()
    const on_highlight = vi.fn(() => effect_cleanup)
    const cleanup = highlight_matches({ query: `PageSearch`, on_highlight })(node)
    expect(ranges()).toEqual([])

    node.textContent = `PageSearch excerpt`
    await Promise.resolve() // MutationObserver records arrive in a microtask
    expect(ranges().map(String)).toEqual([`PageSearch`])
    node.append(` and PageSearch again`)
    await Promise.resolve()
    expect(ranges()).toHaveLength(2)
    expect(node.scrollIntoView).toHaveBeenCalledOnce()
    // each pass runs the previous pass's effect cleanup first
    expect([on_highlight.mock.calls.length, effect_cleanup.mock.calls.length]).toEqual([
      3, 2,
    ])

    cleanup?.()
    node.textContent = `PageSearch updated`
    await Promise.resolve()
    expect(registry.has(`highlight-match`)).toBe(false)
    expect([on_highlight.mock.calls.length, effect_cleanup.mock.calls.length]).toEqual([
      3, 3,
    ])
  })

  const fail = (message: string) => () => {
    throw new Error(message)
  }
  it.each([
    [`setup`, fail(`setup failed`)],
    [`cleanup`, () => fail(`cleanup failed`)],
  ])(`removes the highlight when on_highlight %s throws`, (stage, on_highlight) => {
    node.textContent = `PageSearch result`
    // attaching then cleaning up surfaces either failure
    expect(() =>
      highlight_matches({ query: `PageSearch`, on_highlight })(node)?.(),
    ).toThrow(`${stage} failed`)
    expect(registry.has(`highlight-match`)).toBe(false)
  })

  it(`stays disposed when the effect cleanup removes the attachment`, async () => {
    node.textContent = `PageSearch result`
    let cleanup: (() => void) | undefined
    const on_highlight = vi.fn(() => () => cleanup?.())
    cleanup = highlight_matches({ query: `PageSearch`, on_highlight })(node)
    node.textContent = `Updated PageSearch result`
    await Promise.resolve()
    expect(on_highlight).toHaveBeenCalledOnce()
    expect(registry.has(`highlight-match`)).toBe(false)
  })

  it(`observe_mutations: false freezes the highlight at attach time`, async () => {
    node.textContent = `nothing here`
    highlight_matches({ query: `PageSearch`, observe_mutations: false })(node)
    node.textContent = `PageSearch excerpt`
    await Promise.resolve()
    expect(ranges()).toEqual([])
  })

  // flush the MutationObserver microtask before advancing timers, or the burst never arms
  it(`debounced observation coalesces a burst and cleanup drops a pending re-run`, async () => {
    vi.useFakeTimers()
    onTestFinished(() => void vi.useRealTimers())
    const on_highlight = vi.fn()
    const attach = () =>
      highlight_matches({
        query: `line`,
        on_highlight,
        observe_mutations: { debounce_ms: 50 },
      })(node)
    const append_line = async (idx: number) => {
      node.append(` line ${idx}`)
      await Promise.resolve()
      await vi.advanceTimersByTimeAsync(20) // shorter than debounce_ms
    }
    const cleanup = attach()
    for (const idx of [1, 2, 3]) await append_line(idx)
    expect(on_highlight).toHaveBeenCalledOnce() // just the initial pass
    await vi.advanceTimersByTimeAsync(50)
    expect(on_highlight).toHaveBeenCalledTimes(2)
    expect(ranges()).toHaveLength(3)

    await append_line(4)
    cleanup?.()
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(100)
    expect(on_highlight).toHaveBeenCalledTimes(2)
  })

  it(`duration_ms removes the highlight on its own`, () => {
    vi.useFakeTimers()
    onTestFinished(() => void vi.useRealTimers())
    node.textContent = `PageSearch result`
    highlight_matches({ query: `PageSearch`, duration_ms: 50 })(node)
    expect(ranges()).toHaveLength(1)
    vi.advanceTimersByTime(50)
    expect(registry.has(`highlight-match`)).toBe(false)
  })

  const previous = { external: `previous` }
  const replacement = { external: `replacement` }
  it.each([
    [`restores a pre-existing`, () => {}, previous],
    [
      `preserves a later replacement of the`,
      () => registry.set(`highlight-match`, replacement),
      replacement,
    ],
    [
      `respects a later deletion of the`,
      () => registry.delete(`highlight-match`),
      undefined,
    ],
  ])(`%s same-name highlight on cleanup`, (_desc, external_write, expected) => {
    registry.set(`highlight-match`, previous)
    node.textContent = `match`
    const cleanup = highlight_matches({ query: `match` })(node)
    external_write()
    cleanup?.()
    expect(registry.get(`highlight-match`)).toBe(expected)
  })
})
