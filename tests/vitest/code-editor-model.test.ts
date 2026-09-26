import { create_editor_model } from '$lib/code-editor/model'
import {
  find_editor_matches,
  iterate_editor_matches,
  replace_editor_matches,
  update_editor_matches,
  type EditorSearchOptions,
  type EditorSearchRange,
} from '$lib/code-editor/search'
import type { EditorModel, TextEdit } from '$lib/code-editor/types'
import { expect, test, vi, type MockInstance } from 'vitest'

const model_of = (text: string, history_limit_chars?: number): EditorModel =>
  create_editor_model({ uri: `memory:test`, text, history_limit_chars })
const ranges_of = (matches: Iterable<{ from: number; to: number }>): string =>
  Array.from(matches, ({ from, to }) => `${from}-${to}`).join(` `)
// Lengths of the ranges a spied `model.slice(from = 0, to = length)` read
const sliced_lengths = (spy: MockInstance<EditorModel[`slice`]>, length: number) =>
  spy.mock.calls.map(([from = 0, to = length]) => to - from)
// Deterministic LCG so property tests replay the same edits on every run
const seeded_random = (seed: number) => {
  let rng_state = seed
  return (bound: number): number => {
    rng_state = (Math.imul(rng_state, 1664525) + 1013904223) >>> 0
    return bound <= 0 ? 0 : rng_state % bound
  }
}

const type_text = (
  model: EditorModel,
  insert: string,
  timestamp: number,
  history_group = `insert`,
): void => {
  const from = model.length
  const head = from + insert.length
  model.transact([{ from, to: from, insert }], {
    selection: { anchor: head, head },
    source: `input`,
    history_group,
    timestamp,
  })
}
// Expected matches as space-separated `from-to` UTF-16 ranges.
test.each([
  [`foo FOO food foo_bar`, `foo`, {}, `0-3 4-7 8-11 13-16`],
  [`foo FOO food foo_bar`, `foo`, { whole_word: true }, `0-3 4-7`],
  [`foo FOO food foo_bar`, `foo`, { case_sensitive: true, whole_word: true }, `0-3`],
  [`😀İi\u212AkΣςσ`, `k`, {}, `4-5 5-6`],
  [`😀İi\u212AkΣςσ`, `σ`, {}, `6-7 7-8 8-9`],
  [`a\u0301 a_ a$ a😀 a`, `a`, { whole_word: true }, `9-10 13-14`],
  [`a.*[x] aXXx a.*[x]`, `a.*[x]`, {}, `0-6 12-18`],
  [`first\n  next first next`, `first\r\n  next`, {}, `0-12`],
  [`ſSsS`, `sS`, {}, `0-2 2-4`],
  [`İıiI`, `i`, {}, `2-3 3-4`],
  [`𐐀𐐨𐐀`, `𐐨𐐨`, {}, `0-4`],
  [`x-- --`, `--`, { whole_word: true }, `4-6`],
  [`\uD800 😀 \uDC00`, `\uD800`, {}, `0-1`],
  [`aaaaa`, `aa`, {}, `0-2 2-4`],
  [`text`, ``, {}, ``],
  [``, `text`, {}, ``],
] satisfies [string, string, EditorSearchOptions, string][])(
  `literal model search: %j for %j with %j`,
  (text, query, options, expected) => {
    const matches = find_editor_matches(model_of(text), query, options)
    expect(ranges_of(matches)).toBe(expected)
  },
)
// Whole-string RegExp oracle for chunked model search.
const regex_matches = (
  text: string,
  query: string,
  { whole_word = false, case_sensitive = false }: EditorSearchOptions,
) => {
  const word_char = `[\\p{L}\\p{M}\\p{N}_$]`
  const pattern = new RegExp(
    whole_word ? `(?<!${word_char})${query}(?!${word_char})` : query,
    case_sensitive ? `gu` : `giu`,
  )
  return Array.from(text.matchAll(pattern), (match) => ({
    from: match.index,
    to: match.index + match[0].length,
  }))
}
const option_grid = [false, true].flatMap((whole_word) =>
  [false, true].map((case_sensitive) => ({ whole_word, case_sensitive })),
)
test.each(option_grid)(
  `chunked searches agree with whole-string matches (%o)`,
  (options) => {
    for (let padding = 0; padding < 12; padding++) {
      const text = `${` `.repeat(32 * 1024 - padding)}😀foo𐐀 foo_bar\nFOO😀 foo\n${`x`.repeat(70_000)} foo\uD800`
      const model = model_of(text)
      for (const query of [`foo`, `😀foo`, `FOO😀 foo`, `foo\n`, `𐐨`, `\uD800`])
        expect(find_editor_matches(model, query, options)).toEqual(
          regex_matches(text, query, options),
        )
    }
  },
)
test.each([`ab`, `aa`, `a😀`, `\na`, `A`.repeat(1030)])(
  `property: incremental match updates equal a full rescan for %#`,
  (query) => {
    const random = seeded_random(20_260_924)
    const long = query.length > 1024
    const pieces = long
      ? [`a`.repeat(1030), `A`, ` `, `b`]
      : // runs of `a` make an edit shift the pairing of repeated matches past its reach
        [`a`, `aaaa`, `b`, `A`, ` `, `\n`, `😀`, `_`]
    const piece = () => pieces[random(pieces.length)]
    for (const options of option_grid) {
      const text = Array.from({ length: long ? 40 : 400 }, piece).join(``)
      const model = model_of(text)
      let matches = find_editor_matches(model, query, options)
      // the long query takes the linear matcher; fewer steps keep it under CI's timeout
      for (let step = 0; step < (long ? 30 : 150); step++) {
        const edits: TextEdit[] = []
        let offset = 0
        for (let edit_idx = random(3) + 1; edit_idx > 0; edit_idx--) {
          const from = offset + random(Math.max(1, (model.length - offset) >> 1))
          if (from > model.length) break
          const to = Math.min(model.length, from + random(6))
          const insert = Array.from({ length: random(3) }, piece).join(``)
          edits.push({ from, to, insert })
          offset = from + insert.length
        }
        // Keep edits valid in the sequential coordinates each one leaves behind.
        let length = model.length
        const valid = edits.filter(({ from, to, insert }) => {
          if (to > length) return false
          length += insert.length - (to - from)
          return true
        })
        if (valid.length === 0) continue
        model.transact(valid, { add_to_history: false })
        matches = update_editor_matches(model, query, matches, valid, options)
        expect(matches).toEqual(find_editor_matches(model, query, options))
      }
    }
  },
)
test.each([
  // re-pairing a repeated run keeps scanning past the edit's reach
  [`a`.repeat(10), `aa`, {}, { from: 0, to: 1, insert: `` }, `0-2 2-4 4-6 6-8`],
  // swapping the low half of 𝛁 (non-word) for 𝛀's (a letter) voids the whole word before it
  [`a\u{1D6C1}`, `a`, { whole_word: true }, { from: 2, to: 3, insert: `\uDEC0` }, ``],
] satisfies [string, string, EditorSearchOptions, TextEdit, string][])(
  `incremental update %#: %j for %j with %j after %j`,
  (text, query, options, edit, expected) => {
    const model = model_of(text)
    const matches = find_editor_matches(model, query, options)
    const { edits } = model.transact([edit])
    expect(ranges_of(update_editor_matches(model, query, matches, edits, options))).toBe(
      expected,
    )
  },
)
test(`an edit rescans only its neighborhood of a large document`, () => {
  const text = `foo bar baz\n`.repeat(200_000)
  const model = model_of(text)
  const matches = find_editor_matches(model, `bar`)
  const from = model.line(100_000).from
  const transaction = model.transact([{ from, to: from, insert: `bar ` }])
  const slice_spy = vi.spyOn(model, `slice`)
  const updated = update_editor_matches(model, `bar`, matches, transaction.edits)
  const sliced = sliced_lengths(slice_spy, model.length)
  expect(sliced.reduce((total, length) => total + length, 0)).toBeLessThan(100)
  expect(updated).toHaveLength(200_001)
  expect(updated[100_000]).toEqual({ from, to: from + 3 })
})
test(`long literal queries verify overlapping candidates without RegExp size limits`, () => {
  const query = `${`😀x`.repeat(15_000)}end`
  const text = `😀x${query} ${query}`
  const model = model_of(text)
  const from = 3
  expect(find_editor_matches(model, query)).toEqual([
    { from, to: from + query.length },
    { from: from + query.length + 1, to: text.length },
  ])
})
test.each([3, 1026])(
  `match iteration stops scanning when the caller stops (query length %s)`,
  (length) => {
    const query = length === 3 ? `foo` : `😀${`a`.repeat(length - 2)}`
    const text = `${`${query} `.repeat(6000)}${`tail `.repeat(20_000)}`
    const model = model_of(text)
    const slice_spy = vi.spyOn(model, `slice`)
    const iterator = iterate_editor_matches(model, query)
    expect(slice_spy).not.toHaveBeenCalled()
    const matches: ReturnType<typeof find_editor_matches> = []
    let truncated = false
    for (const match of iterator) {
      if (matches.length === 5000) {
        truncated = true
        break
      }
      matches.push(match)
    }
    expect(truncated).toBe(true)
    expect(matches).toEqual(
      Array.from({ length: 5000 }, (_unused, idx) => ({
        from: idx * (query.length + 1),
        to: idx * (query.length + 1) + query.length,
      })),
    )
    expect(slice_spy.mock.calls.length).toBeLessThanOrEqual(
      Math.ceil((5001 * (query.length + 1)) / (32 * 1024)),
    )
    expect(
      Math.max(...slice_spy.mock.calls.map(([_from, to = model.length]) => to)),
    ).toBeLessThan(model.length)
    expect(iterator.next()).toEqual({ done: true, value: undefined })
    expect(find_editor_matches(model, query)).toHaveLength(6000)
  },
)
test.each([1023, 1024, 1025])(
  `search dispatch preserves Unicode boundaries at query length %s`,
  (length) => {
    const query = `😀${`a`.repeat(length - 4)}𐐨`
    for (const padding of [0, 1, 2, 3]) {
      const text = `${` `.repeat(32 * 1024 - padding)}x${query} ${query.toUpperCase()} ${query}`
      const model = model_of(text)
      for (const options of option_grid) {
        const slice_spy = vi.spyOn(model, `slice`)
        expect(find_editor_matches(model, query, options)).toEqual(
          regex_matches(text, query, options),
        )
        expect(Math.max(...sliced_lengths(slice_spy, model.length))).toBeLessThanOrEqual(
          32 * 1024 + (length <= 1024 ? length + 4 : 3),
        )
        slice_spy.mockRestore()
      }
    }
  },
)
test.each([-1, 0, 1])(
  `long whole-word search checks the code point following a window boundary (%s)`,
  (offset) => {
    const query = `a`.repeat(1025)
    const text = `${` `.repeat(32 * 1024 - query.length + offset)}${query}𐐀 ${query}😀`
    const model = model_of(text)
    const from = 32 * 1024 + offset + 3
    expect(find_editor_matches(model, query, { whole_word: true })).toEqual([
      { from, to: from + query.length },
    ])
  },
)
test.each([`late`, `middle`, `match`, `whole_word`] as const)(
  `long repetitive search has linear matching work: %s`,
  (position) => {
    const query =
      position === `whole_word`
        ? `a`.repeat(1025)
        : position === `middle`
          ? `${`a`.repeat(15_000)}b${`a`.repeat(5000)}`
          : `${`a`.repeat(20_000)}b`
    const text = `${`a`.repeat(100_000)}${position === `match` ? `b` : ``}`
    const model = model_of(text)
    const slice_spy = vi.spyOn(model, `slice`)
    const regex_test = RegExp.prototype.test
    let comparisons = 0
    const spy = vi.spyOn(RegExp.prototype, `test`).mockImplementation(function (
      this: RegExp,
      value: string,
    ) {
      comparisons += 1
      return regex_test.call(this, value)
    })
    let matches: ReturnType<typeof find_editor_matches>
    try {
      matches = find_editor_matches(model, query, {
        whole_word: position === `whole_word`,
      })
    } finally {
      spy.mockRestore()
    }
    expect(matches).toEqual(position === `match` ? [{ from: 80_000, to: 100_001 }] : [])
    // Matching and prefix preprocessing visit each input position a bounded number of times.
    // Counting engine calls catches repeated chunk verification without a timing limit.
    expect(comparisons).toBeLessThanOrEqual(3 * (text.length + query.length))
    // Rejected word boundaries must not trigger extra rope traversals per candidate.
    expect(slice_spy.mock.calls.length).toBeLessThanOrEqual(
      Math.ceil(text.length / (32 * 1024)),
    )
  },
)
test(`search reaches 100k offscreen lines without flattening the model`, () => {
  const text = Array.from(
    { length: 100_000 },
    (_unused, line_idx) => `😀 line ${line_idx + 1}`,
  ).join(`\n`)
  const model = model_of(text)
  const text_spy = vi.spyOn(model, `text`)
  const slice_spy = vi.spyOn(model, `slice`)
  const query = `line 99999`
  const from = model.line(99_998).from + 3
  expect(find_editor_matches(model, query)).toEqual([{ from, to: from + query.length }])
  expect(text_spy).not.toHaveBeenCalled()
  expect(Math.max(...sliced_lengths(slice_spy, model.length))).toBeLessThanOrEqual(
    32 * 1024 + query.length + 4,
  )
})
test(`replace all uses literal text and one undoable transaction with mapped selections`, () => {
  const text = `😀foo foo_bar Foo\nfoo`
  const model = model_of(text)
  const selection = { anchor: model.length, head: 2 }
  model.set_selection(selection)
  const updates = vi.fn()
  model.subscribe(updates)
  expect(replace_editor_matches(model, `foo`, `$&\r\n`, { whole_word: true })).toBe(3)
  expect(model.text()).toBe(`😀$&\n foo_bar $&\n\n$&\n`)
  expect(updates).toHaveBeenCalledTimes(1)
  expect(updates.mock.calls[0][0].transaction.source).toBe(`command`)
  expect(updates.mock.calls[0][0].transaction.edits).toHaveLength(3)
  expect(model.undo()).toBe(true)
  expect([model.text(), model.selection, model.dirty]).toEqual([text, selection, false])
  expect(model.redo()).toBe(true)
  const revision = model.revision
  expect(replace_editor_matches(model, `missing`, ``)).toBe(0)
  expect(model.revision).toBe(revision)
})
test(`normalizes disk text and indexes lines with UTF-16 offsets`, () => {
  const model = model_of(`\uFEFFa😀\r\nb\r\n`)
  expect([
    model.text(),
    model.disk_text(),
    model.length,
    model.line_count,
    model.eol,
    model.had_bom,
  ]).toEqual([`a😀\nb\n`, `\uFEFFa😀\r\nb\r\n`, 6, 3, `crlf`, true])
  expect([model.line(0), model.line_at(3), model.line(2)]).toEqual([
    { line_idx: 0, from: 0, to: 3, text: `a😀` },
    { line_idx: 0, from: 0, to: 3, text: `a😀` },
    { line_idx: 2, from: 6, to: 6, text: `` },
  ])
})
test(`transactions span rope chunks and map inverse edits exactly`, () => {
  const chunk = `x`.repeat(32 * 1024)
  const model = model_of(`${chunk}\nend`)
  const selection = { anchor: chunk.length + 4, head: chunk.length + 4 }
  const updates: unknown[] = []
  const listener = (update: unknown): void => void updates.push(update)
  // Duplicate subscriptions are independent; unsubscribe removes only its registration.
  const unsubscribe = model.subscribe(listener)
  model.subscribe(listener)
  model.transact(
    [
      { from: chunk.length - 1, to: chunk.length + 1, insert: `A\nB` },
      { from: chunk.length + 2, to: chunk.length + 4, insert: `!` },
    ],
    { selection, source: `external` },
  )
  expect(model.slice(chunk.length - 3)).toBe(`xxA\nB!d`)
  expect([model.revision, model.line_count, model.selection, model.dirty]).toEqual([
    1,
    2,
    selection,
    true,
  ])
  unsubscribe()
  expect(model.undo()).toBe(true)
  expect(model.text()).toBe(`${chunk}\nend`)
  expect(model.redo()).toBe(true)
  expect(model.slice(chunk.length - 3)).toBe(`xxA\nB!d`)
  expect(updates).toHaveLength(4)
})
test(`typing groups, saved checkpoints, redo invalidation, and history limits compose`, () => {
  const model = model_of(`abc`, 2)
  type_text(model, `x`, 0)
  type_text(model, `y`, 100)
  expect([model.undo(), model.text()]).toEqual([true, `abc`])
  expect(model.redo()).toBe(true)
  model.mark_saved()
  type_text(model, `z`, 500)
  expect([model.text(), model.dirty]).toEqual([`abcxyz`, true])
  expect(model.undo()).toBe(true)
  expect([model.text(), model.dirty]).toEqual([`abcxy`, false])
  expect(model.undo()).toBe(false)
  model.transact([{ from: 0, to: 1, insert: `A` }], { source: `command` })
  expect(model.redo()).toBe(false)
  expect(model.text()).toBe(`Abcxy`)
})
test(`mark_saved accepts the checkpoint id of text written before later edits`, () => {
  const model = model_of(`a`)
  type_text(model, `b`, 0)
  const written = model.checkpoint()
  expect(model.checkpoint()).toBe(written)
  // within the typing merge interval: without the checkpoint `c` would join `b`'s group
  type_text(model, `c`, 100)
  const updates = vi.fn()
  model.subscribe(updates)
  model.mark_saved(written)
  // Still dirty, so listeners hear nothing until undo reaches the written text.
  expect([model.dirty, updates.mock.calls.length]).toEqual([true, 0])
  // Saving an older id leaves the current typing group open: `d` still joins `c`.
  type_text(model, `d`, 200)
  expect([model.undo(), model.text(), model.dirty, model.checkpoint()]).toEqual([
    true,
    `ab`,
    false,
    written,
  ])
  expect([model.redo(), model.text(), model.dirty]).toEqual([true, `abcd`, true])
  const latest = model.checkpoint()
  for (const invalid of [-1, 0.5, latest + 1])
    expect(() => model.mark_saved(invalid)).toThrow(`Invalid state_id=${invalid}`)
})
test(`history barriers and unrecorded edits cannot replay stale state`, () => {
  const model = model_of(``)
  type_text(model, `a`, 0)
  model.undo()
  model.redo()
  type_text(model, `b`, 100)
  expect([model.undo(), model.text()]).toEqual([true, `a`])
  model.transact([{ from: 0, to: 1, insert: `x` }], { add_to_history: false })
  expect([model.undo(), model.redo(), model.text(), model.dirty]).toEqual([
    false,
    false,
    `x`,
    true,
  ])
  type_text(model, `y`, 1, ``)
  type_text(model, `z`, 2, ``)
  expect([model.undo(), model.text()]).toEqual([true, `x`])
  const backward = model_of(``)
  type_text(backward, `a`, 10_000)
  type_text(backward, `b`, 0)
  expect([backward.undo(), backward.text()]).toEqual([true, `a`])
})
test.each([
  [`backspace`, [2, 1]],
  [`delete`, [0, 0]],
])(`%s groups replay as one update`, (key, starts) => {
  const model = model_of(`abc`)
  for (const [edit_idx, from] of starts.entries())
    model.transact([{ from, to: from + 1, insert: `` }], {
      selection: { anchor: from, head: from },
      history_group: key,
      timestamp: edit_idx,
    })
  const updates: unknown[] = []
  model.subscribe((update) => updates.push(update))
  expect([model.undo(), model.text(), updates.length]).toEqual([true, `abc`, 1])
})
test(`composition replacement retains the pre-composition undo text`, () => {
  const model = model_of(`selected`)
  model.transact([{ from: 0, to: 8, insert: `λ` }], {
    history_group: `composition-1`,
    timestamp: 0,
  })
  model.transact([{ from: 0, to: 1, insert: `lambda` }], {
    history_group: `composition-1`,
    timestamp: 1000,
  })
  expect([model.undo(), model.text(), model.redo(), model.text()]).toEqual([
    true,
    `selected`,
    true,
    `lambda`,
  ])
})
test(`a large typing group undoes in one immutable transaction`, () => {
  const model = model_of(``)
  for (let offset = 0; offset < 1000; offset++) type_text(model, `x`, offset)
  const updates: unknown[] = []
  model.subscribe((update) => updates.push(update))
  expect([model.undo(), model.text(), updates.length]).toEqual([true, ``, 1])
  const transaction = model.transact([{ from: 0, to: 0, insert: `a` }])
  expect(() => {
    ;(transaction.edits as unknown as { insert: string }[])[0].insert = `mutated`
  }).toThrow(/read only|Cannot assign/u)
  expect([model.undo(), model.redo(), model.text()]).toEqual([true, true, `a`])
})
test.each([
  [
    `overlapping edits`,
    [
      { from: 1, to: 3, insert: `` },
      { from: 2, to: 2, insert: `x` },
    ],
  ],
  [`reversed range`, [{ from: 2, to: 1, insert: `` }]],
  [`past the end`, [{ from: 3, to: 4, insert: `` }]],
  [`carriage return`, [{ from: 0, to: 0, insert: `\r` }]],
  [`CRLF`, [{ from: 0, to: 0, insert: `\r\n` }]],
] satisfies [string, TextEdit[]][])('rejects %s', (_label, edits) => {
  const model = model_of(`abc`)
  expect(() => model.transact(edits)).toThrow(/Invalid edit/u)
  expect(model.text()).toBe(`abc`)
})
test(`omitted selections map through sequential edits`, () => {
  const model = model_of(`abcdef`)
  model.set_selection({ anchor: 1, head: 5 })
  model.transact([
    { from: 0, to: 2, insert: `XYZ` },
    { from: 4, to: 5, insert: `` },
  ])
  expect([model.text(), model.selection]).toEqual([`XYZcef`, { anchor: 3, head: 5 }])
  model.transact([{ from: 0, to: 6, insert: `` }])
  expect(model.selection).toEqual({ anchor: 0, head: 0 })
})
test(`invalid resulting selections leave the model unchanged`, () => {
  const model = model_of(`abc`)
  expect(() =>
    model.transact([{ from: 0, to: 1, insert: `` }], {
      selection: { anchor: 3, head: 3 },
    }),
  ).toThrow(`Invalid selection anchor=3 for length 2`)
  expect([model.text(), model.revision, model.dirty]).toEqual([`abc`, 0, false])
  expect(() =>
    model.set_selection({ anchor: 1 } as unknown as { anchor: number; head: number }),
  ).toThrow(/Invalid selection head/u)
  expect(() =>
    model.transact([{ from: 0, to: 0, insert: `x` }], { timestamp: Infinity }),
  ).toThrow(`Invalid history timestamp=Infinity`)
  expect(model.text()).toBe(`abc`)
})
test.each([1, 6000])(
  `property: random edits, lines, undo, and redo match a string oracle (%i initial lines)`,
  (initial_lines) => {
    const random = seeded_random(20_260_819)
    let expected = `${`line😀\n`.repeat(initial_lines)}end`
    const model = model_of(expected)
    const states = [expected]
    for (let step_idx = 0; step_idx < 400; step_idx++) {
      const bound_a = random(expected.length + 1)
      const bound_b = random(expected.length + 1)
      const from = Math.min(bound_a, bound_b)
      const to = Math.max(bound_a, bound_b)
      const insert = [``, `x`, `\n`, `two`, `😀`][random(5)]
      expected = expected.slice(0, from) + insert + expected.slice(to)
      const caret = from + insert.length
      model.transact([{ from, to, insert }], {
        selection: { anchor: caret, head: caret },
        source: `external`,
        timestamp: step_idx * 1000,
      })
      states.push(expected)
      const line_idx = random(model.line_count)
      expect(model.line(line_idx).text).toBe(expected.split(`\n`)[line_idx])
      const offset = random(expected.length + 1)
      expect(model.line_at(offset).line_idx).toBe(
        expected.slice(0, offset).split(`\n`).length - 1,
      )
    }
    for (let state_idx = states.length - 2; state_idx >= 0; state_idx--)
      expect([model.undo(), model.text()]).toEqual([true, states[state_idx]])
    for (let state_idx = 1; state_idx < states.length; state_idx++)
      expect([model.redo(), model.text()]).toEqual([true, states[state_idx]])
  },
)
test.skipIf(!process.env.RUN_LARGE_EDITOR_TESTS)(
  `100MB / 1M-line model stress target`,
  () => {
    const line = `${`x`.repeat(99)}\n`
    const started = performance.now()
    const text = `${line.repeat(999_999)}${`x`.repeat(99)}`
    const model = model_of(text)
    expect(model.line_count).toBe(1_000_000)
    const build_ms = performance.now() - started
    const edit_started = performance.now()
    for (let edit_idx = 0; edit_idx < 1000; edit_idx++) {
      const from = [0, Math.floor(model.length / 2), model.length][edit_idx % 3]
      model.transact([{ from, to: from, insert: `x` }], { add_to_history: false })
    }
    const edit_ms = performance.now() - edit_started
    const lookup_started = performance.now()
    for (let lookup_idx = 0; lookup_idx < 10_000; lookup_idx++)
      model.line((lookup_idx * 7919) % model.line_count)
    const lookup_ms = performance.now() - lookup_started
    const replace_started = performance.now()
    model.transact([{ from: 0, to: model.length, insert: `` }], {
      add_to_history: false,
    })
    const replace_ms = performance.now() - replace_started
    console.info(`CodeEditor 100 MB stress timings`, {
      build_ms,
      edit_ms,
      lookup_ms,
      replace_ms,
    })
    expect(build_ms).toBeLessThan(3000)
    expect(edit_ms).toBeLessThan(250)
    expect(lookup_ms).toBeLessThan(250)
    expect(replace_ms).toBeLessThan(250)
  },
)
// Mixed line endings use the majority style to avoid rewriting every line on save.
test.each([
  [`one CRLF among many LFs stays lf`, `a\nb\r\nc\nd\ne\n`, `lf`],
  [`mostly CRLF stays crlf`, `a\r\nb\r\nc\nd\r\n`, `crlf`],
  [`pure LF stays lf`, `a\nb\n`, `lf`],
  [`pure CRLF stays crlf`, `a\r\nb\r\n`, `crlf`],
  [`BOM is excluded from CRLF counts`, `\uFEFFa\nb\r\n`, `lf`],
  [`bare carriage returns do not count as CRLF`, `a\rb\nc\r\n`, `lf`],
  [`bare CR contributes to a tied majority`, `a\r\nb\r\nc\nd\r`, `lf`],
  [`bare CR can outweigh CRLF`, `a\rb\rc\rd\r\ne\r\n`, `lf`],
  [`empty text stays lf`, ``, `lf`],
])(`%s`, (_case, text, expected_eol) => {
  const model = model_of(text)
  expect(model.eol).toBe(expected_eol)
  const normalized = text.replaceAll(/\r\n?/g, `\n`)
  expect(model.disk_text()).toBe(
    expected_eol === `lf` ? normalized : normalized.replaceAll(`\n`, `\r\n`),
  )
})

const long_query = `a`.repeat(1030)
test.each([
  [`aa😀a`, `a`, { from: 5 }, ``],
  [`aa😀a`, `a`, { from: 6 }, ``],
  [`aa😀a`, `a`, { from: 10 }, ``],
  // a start inside a surrogate pair backs up to the pair's high half
  [`ab😀c`, `😀`, { from: 3 }, `2-4`],
  [`abab`, `ab`, { from: 1, to: 3 }, `2-4`],
  [long_query.repeat(2), long_query, { to: 1030 }, `0-1030`],
] satisfies [string, string, EditorSearchRange, string][])(
  `scan range %#: matches of %j starting in %j`,
  (text, query, range, expected) => {
    const matches = iterate_editor_matches(model_of(text), query, {}, range)
    expect(ranges_of(matches)).toBe(expected)
  },
)
