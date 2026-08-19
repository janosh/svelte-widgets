import { create_editor_model } from '$lib/code-editor/model'
import type { EditorModel, TextEdit } from '$lib/code-editor/types'
import { expect, test } from 'vite-plus/test'

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
test(`normalizes disk text and indexes lines with UTF-16 offsets`, () => {
  const model = create_editor_model({
    uri: `file:///demo.ts`,
    text: `\uFEFFa😀\r\nb\r\n`,
  })
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
  const model = create_editor_model({ uri: `memory:test`, text: `${chunk}\nend` })
  const selection = { anchor: chunk.length + 4, head: chunk.length + 4 }
  const updates: unknown[] = []
  const listener = (update: unknown): void => void updates.push(update)
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
  const model = create_editor_model({
    uri: `memory:history`,
    text: `abc`,
    history_limit_chars: 2,
  })
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
test(`history barriers and unrecorded edits cannot replay stale state`, () => {
  const model = create_editor_model({ uri: `memory:barriers`, text: `` })
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
  const backward = create_editor_model({ uri: `memory:timestamp`, text: `` })
  type_text(backward, `a`, 10_000)
  type_text(backward, `b`, 0)
  expect([backward.undo(), backward.text()]).toEqual([true, `a`])
})
test.each([`backspace`, `delete`] as const)(`%s groups replay as one update`, (key) => {
  const model = create_editor_model({ uri: `memory:${key}`, text: `abc` })
  const edits =
    key === `backspace`
      ? [
          { from: 2, to: 3, insert: `` },
          { from: 1, to: 2, insert: `` },
        ]
      : [
          { from: 0, to: 1, insert: `` },
          { from: 0, to: 1, insert: `` },
        ]
  for (const [edit_idx, edit] of edits.entries())
    model.transact([edit], {
      selection: { anchor: edit.from, head: edit.from },
      history_group: key,
      timestamp: edit_idx,
    })
  const updates: unknown[] = []
  model.subscribe((update) => updates.push(update))
  expect([model.undo(), model.text(), updates.length]).toEqual([true, `abc`, 1])
})
test(`composition replacement retains the pre-composition undo text`, () => {
  const model = create_editor_model({ uri: `memory:composition`, text: `selected` })
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
  const model = create_editor_model({ uri: `memory:group`, text: `` })
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
  const model = create_editor_model({ uri: `memory:invalid`, text: `abc` })
  expect(() => model.transact(edits)).toThrow(/Invalid edit/u)
  expect(model.text()).toBe(`abc`)
})
test(`invalid resulting selections leave the model unchanged`, () => {
  const model = create_editor_model({ uri: `memory:invalid-selection`, text: `abc` })
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
test(`property: random edits, lines, undo, and redo match a string oracle`, () => {
  let rng_state = 20_260_819
  const random = (bound: number): number => {
    rng_state = (Math.imul(rng_state, 1664525) + 1013904223) >>> 0
    return bound <= 0 ? 0 : rng_state % bound
  }
  let expected = `alpha\nbeta😀\ngamma`
  const model = create_editor_model({ uri: `memory:property`, text: expected })
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
  }
  for (let state_idx = states.length - 2; state_idx >= 0; state_idx--)
    expect([model.undo(), model.text()]).toEqual([true, states[state_idx]])
  for (let state_idx = 1; state_idx < states.length; state_idx++)
    expect([model.redo(), model.text()]).toEqual([true, states[state_idx]])
})
test.skipIf(!process.env.RUN_LARGE_EDITOR_TESTS)(
  `100MB / 1M-line model stress target`,
  () => {
    const line = `${`x`.repeat(99)}\n`
    const started = performance.now()
    const text = `${line.repeat(999_999)}${`x`.repeat(99)}`
    const model = create_editor_model({ uri: `memory:large`, text })
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
