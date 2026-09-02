import { highlight_matches } from '$lib/attachments'
import type { HighlightRangesOptions } from '$lib/text-search'
import {
  create_burst_debounce,
  create_search_jump,
  DEFAULT_SEGMENT_SELECTOR,
  highlight_ranges,
  observe_text_mutations,
  search_text,
} from '$lib/text-search'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { doc_query, stub_css_highlights } from './index'

const render = (html: string): HTMLElement => {
  document.body.innerHTML = `<main>${html}</main>`
  return doc_query(`main`)
}
const ranges_of = (...args: Parameters<typeof search_text>): Range[] =>
  search_text(...args).map((match) => match.range)

// Endpoints, not range.toString(): a cross-node range can stringify correctly while
// starting in the wrong node at a coincidentally equal offset.
const range_bounds = (range: Range): [string, number, string, number] => [
  range.startContainer.textContent ?? ``,
  range.startOffset,
  range.endContainer.textContent ?? ``,
  range.endOffset,
]

describe(`search_text`, () => {
  it(`matches a query straddling inline element boundaries`, () => {
    const root = render(`<p>Hello <b>wo</b>rld</p>`)

    const matches = search_text(root, `world`)
    const ranges = matches.map((match) => match.range)

    expect(ranges).toHaveLength(1)
    expect(range_bounds(ranges[0])).toEqual([`wo`, 0, `rld`, 3])
    expect(matches[0].element).toBe(doc_query(`p`))
  })

  it.each([
    // cross-node matches the per-text-node highlight_matches attachment cannot make
    [`nested inline children`, `<p><em><b>fo</b></em><i>o</i>d</p>`, `food`, 1],
    [`inline wrappers without a block ancestor`, `<div>fo<b>o</b></div>`, `foo`, 1],
    // segment boundaries, where no visible text is continuous
    [`sibling list items`, `<ul><li>ab</li><li>cd</li></ul>`, `bc`, 0],
    [`sibling table cells`, `<table><tr><td>ab</td><td>cd</td></tr></table>`, `bc`, 0],
    [`sibling blocks`, `<div>ab</div><div>cd</div>`, `bc`, 0],
    [`a line break`, `<p>a<br>b</p>`, `ab`, 0],
    [`a replaced element`, `<p>a<img alt="">b</p>`, `ab`, 0],
    [`a nested block`, `<div>a<div>b</div>c</div>`, `ac`, 0],
    // a block nested in a block ends the outer run on both sides
    [`text after a nested block`, `<div>a<p>b</p>cd</div>`, `cd`, 1],
    // source text never renders, so a hit inside one would scroll the reader to nothing
    [`script source`, `<p>alpha <script>const alpha = 1</script></p>`, `alpha`, 1],
    [`style source`, `<p>gap <style>.gap { gap: 0 }</style></p>`, `gap`, 1],
    [`noscript source`, `<p>hi <noscript>hi there</noscript></p>`, `hi`, 1],
    // skipping the subtree, not breaking on it: `fo` and `od` render as one run
    [`text either side of a script`, `<p>fo<script>x</script>od</p>`, `food`, 1],
    // Unreadable controls/hidden content would produce hits that scroll nowhere.
    [`textarea`, `<p>before<textarea>secret</textarea>after</p>`, `secret`, 0],
    [`select`, `<p>before<select><option>secret</option></select>after</p>`, `secret`, 0],
    [`hidden content`, `<p>before<span hidden>secret</span>after</p>`, `secret`, 0],
    // hidden="until-found" stays searchable, like it does in the browser's own find
    [
      `hidden-until-found`,
      `<p><span hidden="until-found">secret</span></p>`,
      `secret`,
      1,
    ],
    [`text either side of hidden content`, `<p>fo<span hidden>x</span>od</p>`, `food`, 1],
  ])(`%s`, (_desc, html, query, expected_count) => {
    expect(search_text(render(html), query)).toHaveLength(expected_count)
  })

  it(`keeps a segment intact across empty text nodes`, () => {
    // Svelte emits empty text nodes as anchors between elements, so treating one
    // as the end of a segment would break cross-node matching in real components
    const root = render(`<p><b>fo</b>o</p>`)
    doc_query(`p`).lastChild?.before(document.createTextNode(``))

    expect(search_text(root, `foo`)).toHaveLength(1)
  })

  it(`returns nothing for an empty query`, () => {
    expect(search_text(render(`<p>content</p>`), ``)).toEqual([])
  })

  it.each([
    // offsets computed on normalized text must land on the original characters:
    // decomposition/lowercasing expand a char, and 😀 spans two UTF-16 units
    [`length-changing lowercase`, `<p>İİİab</p>`, `ab`, [`İİİab`, 3, `İİİab`, 5]],
    [`length-changing match`, `<p>İ</p>`, `i\u0307`, [`İ`, 0, `İ`, 1]],
    [`astral characters`, `<p>😀ab</p>`, `ab`, [`😀ab`, 2, `😀ab`, 4]],
    [
      `NFC query against NFD source`,
      `<p>Cafe\u0301 noir</p>`,
      `café`,
      [`Cafe\u0301 noir`, 0, `Cafe\u0301 noir`, 5],
    ],
    [
      `NFD query against NFC source`,
      `<p>touché</p>`,
      `touche\u0301`,
      [`touché`, 0, `touché`, 6],
    ],
    [
      `astral prefix before canonical match`,
      `<p>😀éab</p>`,
      `e\u0301a`,
      [`😀éab`, 2, `😀éab`, 4],
    ],
    [
      `case insensitivity`,
      `<p>The TEST case</p>`,
      `test`,
      [`The TEST case`, 4, `The TEST case`, 8],
    ],
    // ΟΔΟΣ lowercases to a final sigma, which readers still search for as σ
    [`final sigma`, `<p>ΟΔΟΣ</p>`, `οδοσ`, [`ΟΔΟΣ`, 0, `ΟΔΟΣ`, 4]],
    [`medial sigma query`, `<p>ΟΔΟΣ</p>`, `οδος`, [`ΟΔΟΣ`, 0, `ΟΔΟΣ`, 4]],
  ])(`maps offsets back through %s`, (_desc, html, query, expected) => {
    const [range, ...rest] = ranges_of(render(html), query)
    expect(rest).toEqual([])
    expect(range_bounds(range)).toEqual(expected)
  })

  it.each([
    [`the full run`, `q\u0301\u0328`, 0],
    [`only reordered marks`, `\u0301\u0328`, 1],
  ])(`maps %s across canonically reordered combining marks`, (_desc, query, start) => {
    const source = `q\u0301\u0328`
    const [range] = ranges_of(render(`<p>${source}</p>`), query)

    expect(range_bounds(range)).toEqual([source, start, source, 3])
    expect(range.toString()).toBe(source.slice(start))
  })

  it(`canonically matches decomposed accents across text nodes`, () => {
    const prefix = `\u0063\u0061\u0066`
    const root = render(`<p>${prefix}<b>e</b>\u0301</p>`)

    const ranges = ranges_of(root, `\u0063\u0061\u0066\u00E9`)

    expect(ranges).toHaveLength(1)
    expect(range_bounds(ranges[0])).toEqual([prefix, 0, `\u0301`, 1])
  })

  it.each([
    [`source-formatted markup`, `form submit`, [`form\n  `, 0, `submit`, 6]],
    [`a padded query`, `  Form   Submit  `, [`form\n  `, 0, `submit`, 6]],
  ])(`collapses whitespace runs in %s`, (_desc, query, expected) => {
    const root = render(`<p>form\n  <b>submit</b></p>`)

    const ranges = ranges_of(root, query)

    expect(ranges).toHaveLength(1)
    expect(range_bounds(ranges[0])).toEqual(expected)
  })

  it(`reports every non-overlapping hit`, () => {
    const root = render(`<p>aaaa</p><p>aa</p>`)
    const [first_paragraph, second_paragraph] = root.querySelectorAll(`p`)

    const matches = search_text(root, `aa`)

    expect(matches.map(({ range }) => [range.startOffset, range.endOffset])).toEqual([
      [0, 2],
      [2, 4],
      [0, 2],
    ])
    expect(matches.map((match) => match.element)).toEqual([
      first_paragraph,
      first_paragraph,
      second_paragraph,
    ])
  })

  // Pins the binary search that replaced a linear scan: a match on every offset-table
  // boundary is where an off-by-one would show up.
  it(`maps every match onto its node in a segment split across many nodes`, () => {
    const texts = Array.from({ length: 30 }, (_unused, idx) => `a${idx}b`)
    const root = render(`<p>${texts.map((text) => `<b>${text}</b>`).join(``)}</p>`)

    // `ba` straddles every boundary between consecutive nodes and nowhere else
    const ranges = ranges_of(root, `ba`)

    expect(ranges.map(range_bounds)).toEqual(
      texts.slice(0, -1).map((text, idx) => [text, text.length - 1, texts[idx + 1], 1]),
    )
  })

  it(`skips rejected subtrees and does not join text across them`, () => {
    const root = render(`<p>ab<span class="skip">XX</span>cd</p>`)
    const node_filter = (node: Node) =>
      node.parentElement?.closest(`.skip`)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT

    expect(search_text(root, `xx`, { node_filter })).toEqual([])
    // rejecting also ends the run, so the surrounding text must not concatenate
    expect(search_text(root, `abcd`, { node_filter })).toEqual([])
    // without the filter the same three text nodes are one continuous segment
    expect(search_text(root, `abxxcd`)).toHaveLength(1)
  })

  it(`honors a custom segment selector`, () => {
    const root = render(`<div class="cell">ab<b>c</b></div><div class="cell">d</div>`)

    // extending the default selector makes each .cell its own segment
    const segment_selector = `${DEFAULT_SEGMENT_SELECTOR}, .cell`
    expect(search_text(root, `abc`, { segment_selector })).toHaveLength(1)
    expect(search_text(root, `abcd`, { segment_selector })).toEqual([])
    // and a selector reaching above them merges the two cells into one segment
    expect(search_text(root, `abcd`, { segment_selector: `main` })).toHaveLength(1)
  })

  it(`creates ranges from the root's own document`, () => {
    const other_doc = document.implementation.createHTMLDocument(`other`)
    other_doc.body.innerHTML = `<main><p>Hello <b>wo</b>rld</p></main>`
    const root = other_doc.body.firstElementChild
    if (!root) throw new Error(`fixture has no root element`)

    const ranges = ranges_of(root, `world`)
    expect(ranges).toHaveLength(1)
    expect(ranges[0].startContainer.ownerDocument).toBe(other_doc)
  })

  it(`fuzzy-matches the shortest non-overlapping ordered subsequences`, () => {
    const root = render(`<p>a----abc a-b-c</p>`)

    expect(ranges_of(root, `abc`).map(String)).toEqual([`abc`])
    expect(ranges_of(root, `abc`, { fuzzy: true }).map(String)).toEqual([`abc`, `a-b-c`])
  })
})

describe(`highlight_ranges`, () => {
  let registry: Map<string, unknown>
  let set_spy: ReturnType<typeof vi.fn>
  let delete_spy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    const stub = stub_css_highlights()
    registry = stub.registry
    set_spy = stub.set_spy
    delete_spy = stub.delete_spy
  })

  const installed_ranges = (css_class = `text-search-match`): Range[] => {
    const highlight = registry.get(css_class)
    if (!(highlight instanceof globalThis.Highlight)) {
      throw new Error(`no highlight installed for ${css_class}, got ${highlight}`)
    }
    const { ranges } = highlight as unknown as { ranges: Range[] }
    return ranges
  }

  const search = (html: string, query: string): Range[] => ranges_of(render(html), query)

  it(`installs matched ranges and removes them on release`, () => {
    const ranges = search(`<p>Hello <b>wo</b>rld</p>`, `world`)

    const release = highlight_ranges(ranges)

    expect(installed_ranges()).toEqual(ranges)
    expect(set_spy).toHaveBeenCalledExactlyOnceWith(
      `text-search-match`,
      expect.any(globalThis.Highlight),
    )
    release?.()
    expect(registry.has(`text-search-match`)).toBe(false)
    expect(delete_spy).toHaveBeenCalledExactlyOnceWith(`text-search-match`)
  })

  it(`unions ranges from several owners until the last releases`, () => {
    const first = search(`<p>alpha</p>`, `alpha`)
    const second = search(`<p>beta</p>`, `beta`)

    const release_first = highlight_ranges(first)
    const release_second = highlight_ranges(second)
    expect(installed_ranges()).toEqual([...first, ...second])

    release_first?.()
    expect(installed_ranges()).toEqual(second)
    release_first?.() // releasing twice must not drop the other owner
    expect(installed_ranges()).toEqual(second)

    release_second?.()
    expect(registry.has(`text-search-match`)).toBe(false)
  })

  it(`keeps separate css classes independent`, () => {
    const first = search(`<p>alpha</p>`, `alpha`)
    const second = search(`<p>beta</p>`, `beta`)

    highlight_ranges(first, { css_class: `one` })
    const release = highlight_ranges(second, { css_class: `two` })

    expect(installed_ranges(`one`)).toEqual(first)
    release?.()
    expect(installed_ranges(`one`)).toEqual(first)
    expect(registry.has(`two`)).toBe(false)
  })

  it(`yields the name to another writer, but reclaims it once vacant`, () => {
    highlight_ranges(search(`<p>alpha</p>`, `alpha`))
    const foreign = new globalThis.Highlight()
    registry.set(`text-search-match`, foreign)

    // someone else holds the name now, so a later sync leaves their highlight alone
    highlight_ranges(search(`<p>beta</p>`, `beta`))
    expect(registry.get(`text-search-match`)).toBe(foreign)

    // an external CSS.highlights.clear() leaves no successor; yielding to nobody
    // would strand the highlight for the page's life
    registry.clear()
    highlight_ranges(search(`<p>gamma</p>`, `gamma`))
    expect(installed_ranges()).toHaveLength(3)
  })

  it(`restores a pre-existing highlight it did not install`, () => {
    const foreign = new globalThis.Highlight()
    registry.set(`text-search-match`, foreign)

    const release = highlight_ranges(search(`<p>alpha</p>`, `alpha`))
    expect(registry.get(`text-search-match`)).not.toBe(foreign)

    release?.()
    expect(registry.get(`text-search-match`)).toBe(foreign)
  })

  // Unlike reclaim-on-write above, release after takeover must preserve the new writer.
  it(`releasing after a takeover leaves the new writer's highlight in place`, () => {
    const ranges = search(`<p>alpha</p>`, `alpha`)
    const release_first = highlight_ranges(ranges)
    const usurper = new globalThis.Highlight()
    registry.set(`text-search-match`, usurper)

    // a second owner joining must not stomp the external writer
    const release_second = highlight_ranges(ranges)
    expect(registry.get(`text-search-match`)).toBe(usurper)

    release_first?.()
    release_second?.()
    expect(registry.get(`text-search-match`)).toBe(usurper)
  })

  it.each<[string, HighlightRangesOptions, () => void]>([
    [`disabled`, { disabled: true }, () => {}],
    [`CSS.highlights is missing`, {}, () => vi.stubGlobal(`CSS`, undefined)],
    [`Highlight is missing`, {}, () => vi.stubGlobal(`Highlight`, undefined)],
  ])(`returns undefined when %s`, (_desc, options, prepare) => {
    const ranges = search(`<p>alpha</p>`, `alpha`)
    prepare()

    expect(highlight_ranges(ranges, options)).toBeUndefined()
    expect(set_spy).not.toHaveBeenCalled()
  })

  // highlight_matches keeps its own owner bookkeeping, so sharing a CSS class must
  // stay safe until both implementations are merged
  it(`unions ranges with the highlight_matches attachment on a shared css class`, () => {
    const root = render(`<p>Hello <b>wo</b>rld</p>`)
    const attachment_cleanup = highlight_matches({
      query: `Hello`,
      css_class: `shared`,
      scroll_to_match: false,
    })(root)
    expect(installed_ranges(`shared`)).toHaveLength(1)

    const release = highlight_ranges(ranges_of(root, `world`), {
      css_class: `shared`,
    })
    // both owners share one store, so the name holds their union, not the last write
    expect(installed_ranges(`shared`)).toHaveLength(2)

    // releasing one owner leaves the other's range installed rather than wiping it
    release?.()
    expect(installed_ranges(`shared`)).toHaveLength(1)
    attachment_cleanup?.()
    expect(registry.has(`shared`)).toBe(false)
  })
})

// observe_text_mutations wires a MutationObserver into create_burst_debounce, so the
// two share a clock and are exercised together
describe(`observe_text_mutations and create_burst_debounce`, () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // happy-dom delivers mutation records in a microtask that fake timers ignore, so the
  // async advance is needed to run both observer and debounce
  const mutate = async (node: Element, advance_ms: number) => {
    node.append(document.createElement(`span`))
    await vi.advanceTimersByTimeAsync(advance_ms)
  }

  it(`collapses a burst of mutations into one call`, async () => {
    const root = render(`<p>content</p>`)
    const on_mutation = vi.fn()
    const stop = observe_text_mutations(root, on_mutation, { debounce_ms: 50 })

    for (let idx = 0; idx < 3; idx++) await mutate(root, 20)
    expect(on_mutation).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(50)
    expect(on_mutation).toHaveBeenCalledTimes(1)
    stop()
  })

  it(`fires at the max wait ceiling during a sustained burst`, async () => {
    const root = render(`<p>content</p>`)
    const on_mutation = vi.fn()
    const stop = observe_text_mutations(root, on_mutation, {
      debounce_ms: 50,
      max_wait_ms: 120,
    })

    // without the max_wait ceiling these 6 x 20 ms steps would keep resetting the debounce
    for (let idx = 0; idx < 6; idx++) await mutate(root, 20)
    expect(on_mutation).toHaveBeenCalledTimes(1)
    stop()
  })

  it(`stops observing and cancels a pending call after cleanup`, async () => {
    const root = render(`<p>content</p>`)
    const on_mutation = vi.fn()
    const stop = observe_text_mutations(root, on_mutation, { debounce_ms: 50 })

    await mutate(root, 10)
    stop()

    await vi.advanceTimersByTimeAsync(200)
    expect(on_mutation).not.toHaveBeenCalled()

    await mutate(root, 200)
    expect(on_mutation).not.toHaveBeenCalled()
  })

  it(`cancel starts the next burst's max-wait window over`, () => {
    const callback = vi.fn()
    const { trigger, cancel } = create_burst_debounce(callback, {
      debounce_ms: 50,
      max_wait_ms: 120,
    })

    // spend most of one burst's ceiling, then abandon the burst
    trigger()
    vi.advanceTimersByTime(40)
    trigger()
    vi.advanceTimersByTime(40)
    cancel()
    vi.advanceTimersByTime(200)
    expect(callback).not.toHaveBeenCalled()

    // carrying the canceled burst's start forward would leave the ceiling spent,
    // collapsing the debounce to zero
    trigger()
    vi.advanceTimersByTime(49)
    expect(callback).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(callback).toHaveBeenCalledOnce()
  })
})

describe(`create_search_jump`, () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it(`marks and scrolls the target, then clears itself`, () => {
    const root = render(`<p>first</p><p>second</p>`)
    const [first, second] = Array.from(root.querySelectorAll(`p`))
    first.scrollIntoView = vi.fn()
    second.scrollIntoView = vi.fn()
    const on_clear = vi.fn()
    const jump = create_search_jump({ duration_ms: 500, on_clear })

    jump.start(first)
    expect(first.classList.contains(`search-match-jump`)).toBe(true)
    expect(first.scrollIntoView).toHaveBeenCalledExactlyOnceWith({
      block: `center`,
      inline: `nearest`,
    })

    // a second jump unmarks the previous element without reporting a clear
    jump.start(second)
    expect(first.classList.contains(`search-match-jump`)).toBe(false)
    expect(second.classList.contains(`search-match-jump`)).toBe(true)
    expect(on_clear).not.toHaveBeenCalled()

    vi.advanceTimersByTime(500)
    expect(second.classList.contains(`search-match-jump`)).toBe(false)
    expect(on_clear).toHaveBeenCalledTimes(1)
  })

  it(`clear() always notifies, removes the mark early, and cancels the timeout`, () => {
    const root = render(`<p>first</p>`)
    const paragraph = doc_query(`p`)
    paragraph.scrollIntoView = vi.fn()
    const on_clear = vi.fn()
    const jump = create_search_jump({ class_name: `flash`, on_clear })

    jump.clear()
    expect(on_clear).toHaveBeenCalledOnce()
    jump.start(paragraph)
    jump.clear()
    expect(paragraph.classList.contains(`flash`)).toBe(false)
    expect(on_clear).toHaveBeenCalledTimes(2)

    vi.advanceTimersByTime(5000)
    expect(on_clear).toHaveBeenCalledTimes(2)
    expect(root.querySelector(`.flash`)).toBeNull()
  })

  it.each([
    [`a separate scroll target`, true, false],
    [`scrolling disabled`, false, true],
  ])(`supports %s`, (_desc, use_scroll_target, disable_scroll) => {
    render(`<p id="match">first</p><section id="wrapper"></section>`)
    const [match, wrapper] = [doc_query(`#match`), doc_query(`#wrapper`)]
    match.scrollIntoView = vi.fn()
    wrapper.scrollIntoView = vi.fn()
    const jump = create_search_jump()

    jump.start(match, {
      scroll_target: use_scroll_target ? wrapper : undefined,
      scroll: disable_scroll ? false : { block: `start` },
    })

    // the class always lands on the match, never on the scroll target
    expect(match.classList.contains(`search-match-jump`)).toBe(true)
    expect(wrapper.classList.contains(`search-match-jump`)).toBe(false)
    expect(match.scrollIntoView).not.toHaveBeenCalled()
    expect(wrapper.scrollIntoView).toHaveBeenCalledTimes(use_scroll_target ? 1 : 0)
  })

  it(`tolerates a null element`, () => {
    const on_clear = vi.fn()
    const jump = create_search_jump({ on_clear })

    jump.start(null)
    vi.advanceTimersByTime(2000)
    expect(document.querySelector(`.search-match-jump`)).toBeNull()
    expect(on_clear).toHaveBeenCalledOnce() // a jump to nothing still ends like any other
  })
})
