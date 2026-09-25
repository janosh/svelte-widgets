import { register_escape_layer } from '$lib/attachments'
import CodeEditor from '$lib/code-editor/CodeEditor.svelte'
import { create_editor_model } from '$lib/code-editor/model'
import type {
  ApplyEditsArgs,
  EditorBackend,
  HighlightLinesArgs,
  OpenDocArgs,
} from '$lib/code-editor/types'
import { mount, tick, type ComponentProps, unmount } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vitest'
import { doc_query, press_key, stub_prop } from './index'

const DEMO_TEXT = `const first = 1\nconst second = 2\nconst third = 3`
const OPEN_RESULT = { language: `TypeScript`, highlightable: true, editable: true }
const apply_text = (text: string, edits: ApplyEditsArgs[`edits`]): string => {
  for (const { from, to, insert } of edits)
    text = text.slice(0, from) + insert + text.slice(to)
  return text
}
// Every highlighted line gets `line_spans()`; the spy lets tests queue other answers.
const create_backend = (line_spans: () => number[] = () => []) => {
  const edits: ApplyEditsArgs[] = []
  const opens: OpenDocArgs[] = []
  const closed: string[] = []
  let text = ``
  const highlight_lines = vi.fn(({ start_line, end_line }: HighlightLinesArgs) =>
    Promise.resolve(Array.from({ length: end_line - start_line }, line_spans)),
  )
  const backend: EditorBackend = {
    open_doc: (args) => {
      opens.push(args)
      text = args.text
      return Promise.resolve(OPEN_RESULT)
    },
    apply_edits: (args) => {
      edits.push(args)
      text = apply_text(text, args.edits)
      return Promise.resolve(args.revision)
    },
    set_text: (args) => {
      text = args.text
      return Promise.resolve(args.revision)
    },
    highlight_lines,
    cancel_highlight: () => undefined,
    close_doc: ({ doc_id }) => Promise.resolve(void closed.push(doc_id)),
  }
  return { backend, edits, opens, closed, highlight_lines, get_text: () => text }
}
const numbered_lines = (count: number): string =>
  Array.from({ length: count }, (_unused, line_idx) => `line ${line_idx}`).join(`\n`)
const flush_async = async (): Promise<void> => {
  await tick()
  await Promise.resolve()
  await tick()
}
const before_input = (area: HTMLTextAreaElement, input_type: string): InputEvent => {
  const event = new InputEvent(`beforeinput`, {
    inputType: input_type,
    bubbles: true,
    cancelable: true,
  })
  area.dispatchEvent(event)
  return event
}
const emit_input = (
  area: HTMLTextAreaElement,
  input_type: string,
  selection_start: number,
  selection_end: number,
  insert: string,
  replace_from = selection_start,
  replace_to = selection_end,
): void => {
  area.setSelectionRange(selection_start, selection_end)
  if (before_input(area, input_type).defaultPrevented) return
  area.value = area.value.slice(0, replace_from) + insert + area.value.slice(replace_to)
  const caret = replace_from + insert.length
  area.setSelectionRange(caret, caret)
  area.dispatchEvent(new InputEvent(`input`, { inputType: input_type, bubbles: true }))
}
type EditorProps = ComponentProps<typeof CodeEditor>
const mount_editor = async (
  model = create_editor_model({ uri: `demo.ts`, text: DEMO_TEXT }),
  overrides: Partial<EditorProps> = {},
) => {
  // happy-dom has no text layout. Browser tests compare actual native bidi/font
  // geometry; unit tests emulate fixed-width grapheme cells and two-column tabs.
  const cells = (text: string): number => {
    let width = 0
    for (const { segment } of new Intl.Segmenter(undefined, {
      granularity: `grapheme`,
    }).segment(text))
      width +=
        segment === `\t`
          ? 2 - (width % 2)
          : /\p{Extended_Pictographic}/u.test(segment)
            ? 2
            : 1
    return width
  }
  vi.spyOn(HTMLDivElement.prototype, `getBoundingClientRect`).mockImplementation(
    function (this: HTMLDivElement) {
      return this.hasAttribute(`data-editor-measure`)
        ? new DOMRect(0, 0, 800, 20)
        : new DOMRect()
    },
  )
  vi.spyOn(Range.prototype, `getClientRects`).mockImplementation(function (this: Range) {
    const rect = new DOMRect(
      cells((this.startContainer.textContent ?? ``).slice(0, this.startOffset)),
      0,
      0,
      20,
    )
    return Object.assign([rect], { item: (index: number) => (index === 0 ? rect : null) })
  })
  onTestFinished(
    stub_prop(document, `caretPositionFromPoint`, (column: number) => {
      const node = document.querySelector(`[data-editor-measure]`)?.firstChild
      if (!node) return null
      let offset = 0
      let width = 0
      for (const { segment } of new Intl.Segmenter(undefined, {
        granularity: `grapheme`,
      }).segment(node.textContent ?? ``)) {
        const next_width = cells(
          (node.textContent ?? ``).slice(0, offset + segment.length),
        )
        if ((width + next_width) / 2 >= column) break
        width = next_width
        offset += segment.length
      }
      return { offsetNode: node, offset }
    }),
  )
  const recorder = create_backend()
  const props = $state<EditorProps>({ model, backend: recorder.backend, ...overrides })
  const instance = mount(CodeEditor, { target: document.body, props })
  onTestFinished(() => unmount(instance))
  await flush_async()
  const textarea = doc_query<HTMLTextAreaElement>(`textarea`)
  return { instance, model, props, recorder, textarea }
}
const fill_search = async (value: string, label = `Find`): Promise<HTMLInputElement> => {
  const input = doc_query<HTMLInputElement>(`input[aria-label="${label}"]`)
  input.value = value
  input.dispatchEvent(new InputEvent(`input`, { bubbles: true }))
  await flush_async()
  return input
}
test(`search navigates offscreen matches, refreshes after edits, and preserves focus on Escape`, async () => {
  const lines = Array.from({ length: 2000 }, (_unused, line_idx) =>
    [0, 999, 1999].includes(line_idx) ? `😀foo ${line_idx}` : `line ${line_idx}`,
  )
  const { model, textarea, props } = await mount_editor(
    create_editor_model({ uri: `large.ts`, text: lines.join(`\n`) }),
  )
  const parent_escape = vi.fn(() => true)
  onTestFinished(register_escape_layer(parent_escape))
  textarea.focus()
  expect(press_key(textarea, `f`, { ctrlKey: true }).defaultPrevented).toBe(true)
  await flush_async()
  const input = await fill_search(`foo`)
  expect(document.activeElement).toBe(input)
  expect(doc_query(`[role="status"]`).textContent).toBe(`1 of 3`)
  expect(model.selection).toEqual({ anchor: 2, head: 5 })
  expect(doc_query(`.editor-search-match`).textContent).toBe(`foo`)
  expect(press_key(input, `Enter`, { isComposing: true }).defaultPrevented).toBe(false)
  expect(model.selection).toEqual({ anchor: 2, head: 5 })
  press_key(input, `Enter`)
  await flush_async()
  const middle = model.line(999).from + 2
  expect(model.selection).toEqual({ anchor: middle, head: middle + 3 })
  expect(doc_query(`.content`).scrollTop).toBeGreaterThan(0)
  expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe(`foo`)
  expect(textarea.value.split(`\n`).length).toBeLessThan(50)
  expect(doc_query(`.editor-search-match.current`).textContent).toBe(`foo`)
  press_key(input, `Enter`, { shiftKey: true })
  press_key(input, `Enter`, { shiftKey: true })
  await flush_async()
  expect(model.line_at(model.selection.head).line_idx).toBe(1999)
  press_key(input, `F3`)
  await flush_async()
  expect(model.selection).toEqual({ anchor: 2, head: 5 })
  for (const [label, from] of [
    [`Next match`, middle],
    [`Previous match`, 2],
  ] as const) {
    doc_query<HTMLButtonElement>(`button[aria-label="${label}"]`).click()
    await flush_async()
    expect(model.selection).toEqual({ anchor: from, head: from + 3 })
  }
  model.transact([{ from: 2, to: 5, insert: `bar` }])
  await flush_async()
  expect(doc_query(`[role="status"]`).textContent).toBe(`0 of 2`)
  model.undo()
  await flush_async()
  expect(doc_query(`[role="status"]`).textContent).toBe(`1 of 3`)
  props.model = create_editor_model({ uri: `other.ts`, text: `foo` })
  await flush_async()
  expect(doc_query(`[role="status"]`).textContent).toBe(`0 of 1`)
  press_key(input, `Enter`)
  await flush_async()
  expect(props.model.selection).toEqual({ anchor: 0, head: 3 })
  expect(press_key(input, `Escape`).defaultPrevented).toBe(true)
  await flush_async()
  expect(document.querySelector(`[role="search"]`)).toBeNull()
  expect(document.activeElement).toBe(textarea)
  expect(parent_escape).not.toHaveBeenCalled()
})
test(`replace controls honor case, words, history, backend updates, and read-only changes`, async () => {
  const original = `foo foo_bar FOO`
  const { instance, model, textarea, recorder, props } = await mount_editor(
    create_editor_model({ uri: `replace.ts`, text: original }),
  )
  textarea.focus()
  press_key(textarea, `h`, { ctrlKey: true })
  await flush_async()
  await fill_search(`foo`)
  expect(doc_query(`[role="status"]`).textContent).toBe(`1 of 3`)
  const checkboxes = document.querySelectorAll<HTMLInputElement>(`input[type="checkbox"]`)
  checkboxes[0].click()
  await flush_async()
  expect(doc_query(`[role="status"]`).textContent).toBe(`1 of 2`)
  checkboxes[1].click()
  await flush_async()
  expect(doc_query(`[role="status"]`).textContent).toBe(`1 of 1`)
  const replacement = await fill_search(`bar$&`, `Replacement`)
  expect(press_key(replacement, `Enter`, { isComposing: true }).defaultPrevented).toBe(
    false,
  )
  expect(model.text()).toBe(original)
  press_key(replacement, `Enter`)
  await flush_async()
  expect(model.text()).toBe(`bar$& foo_bar FOO`)
  expect(doc_query(`[role="status"]`).textContent).toBe(`No matches`)
  expect(model.undo()).toBe(true)
  checkboxes[0].click()
  await flush_async()
  expect(instance.replace_all()).toBe(2)
  await flush_async()
  expect([model.text(), recorder.get_text()]).toEqual([
    `bar$& foo_bar bar$&`,
    `bar$& foo_bar bar$&`,
  ])
  expect(model.undo()).toBe(true)
  await flush_async()
  expect(model.text()).toBe(original)
  expect(doc_query(`[role="status"]`).textContent).toBe(`1 of 2`)
  props.read_only = true
  await flush_async()
  expect(document.querySelector(`input[aria-label="Replacement"]`)).toBeNull()
  expect([instance.replace_current(), instance.replace_all()]).toEqual([false, 0])
  expect(instance.find_next()).toBe(true)
  expect(model.selection).toEqual({ anchor: 12, head: 15 })
  expect(model.text()).toBe(original)
})
test.each([5000, 5001])(
  `live search caps navigation and reports truncation without limiting replace all (%s matches)`,
  async (count) => {
    const original = `foo\n`.repeat(count)
    const { instance, model, recorder } = await mount_editor(
      create_editor_model({ uri: `many-matches.ts`, text: original }),
    )
    await instance.open_search(true)
    await fill_search(`foo`)
    const status = doc_query(`[role="status"]`)
    const total = count === 5000 ? `5000` : `5000+ (first 5000 shown)`
    expect(status.textContent).toBe(`1 of ${total}`)
    expect(instance.find_next(-1)).toBe(true)
    await flush_async()
    expect(model.selection).toEqual({ anchor: 19_996, head: 19_999 })
    expect(status.textContent).toBe(`5000 of ${total}`)
    expect(instance.find_next()).toBe(true)
    await flush_async()
    expect(model.selection).toEqual({ anchor: 0, head: 3 })
    expect(status.textContent).toBe(`1 of ${total}`)
    await fill_search(`x`, `Replacement`)
    expect(instance.replace_all()).toBe(count)
    await flush_async()
    expect([model.text(), recorder.get_text()]).toEqual([
      `x\n`.repeat(count),
      `x\n`.repeat(count),
    ])
    expect(status.textContent).toBe(`No matches`)
    expect(model.undo()).toBe(true)
    await flush_async()
    expect(model.text()).toBe(original)
    expect(model.dirty).toBe(false)
    expect(status.textContent).toBe(`1 of ${total}`)
    expect(model.undo()).toBe(false)
  },
)
test(`go-to-line uses validated gutter numbers and reveals a bounded input window`, async () => {
  const { model, instance, textarea } = await mount_editor(
    create_editor_model({ uri: `lines.ts`, text: `line\n`.repeat(2000) }),
  )
  for (const invalid of [0, -1, 1.5, Infinity, NaN, 2002])
    expect(instance.go_to_line(invalid)).toBe(false)
  expect(model.selection).toEqual({ anchor: 0, head: 0 })
  textarea.focus()
  expect(press_key(textarea, `g`, { metaKey: true }).defaultPrevented).toBe(true)
  await flush_async()
  const input = await fill_search(`1999`, `Line number`)
  expect(document.activeElement).toBe(input)
  expect(press_key(input, `Enter`, { isComposing: true }).defaultPrevented).toBe(false)
  expect(model.selection).toEqual({ anchor: 0, head: 0 })
  press_key(input, `Enter`)
  await flush_async()
  expect(model.selection).toEqual({ anchor: 9990, head: 9990 })
  expect(document.activeElement).toBe(textarea)
  expect(Number(textarea.dataset.inputFrom)).toBeGreaterThan(0)
  expect(textarea.value.split(`\n`).length).toBeLessThan(50)
  expect(instance.go_to_line(2001)).toBe(true)
  expect(model.selection.head).toBe(model.length)
  expect(model.revision).toBe(0)
  await instance.open_search()
  doc_query<HTMLButtonElement>(`.editor-search button[aria-label="Go to line"]`).click()
  await flush_async()
  const reopened_input = doc_query<HTMLInputElement>(`input[aria-label="Line number"]`)
  expect(reopened_input.value).toBe(`2001`)
  expect(document.activeElement).toBe(reopened_input)
})
test(`native input, selection, history, commands, and backend deltas share the model`, async () => {
  const on_update = vi.fn()
  const { instance, model, recorder, textarea } = await mount_editor(undefined, {
    on_update,
  })
  expect(textarea.getAttribute(`autocorrect`)).toBe(`off`)
  expect(doc_query(`.gutter`).style.width).toBe(`2ch`)
  const text_spy = vi.spyOn(model, `text`)
  text_spy.mockClear()
  emit_input(textarea, `insertText`, 6, 6, `xy`)
  textarea.dispatchEvent(new CompositionEvent(`compositionstart`, { bubbles: true }))
  emit_input(textarea, `insertText`, 8, 8, `λ`)
  emit_input(textarea, `insertCompositionText`, 9, 9, `lambda`, 8, 9)
  textarea.dispatchEvent(new CompositionEvent(`compositionend`, { bubbles: true }))
  emit_input(textarea, `insertFromComposition`, 14, 14, `lambda`, 8, 14)
  emit_input(textarea, `insertFromPaste`, 14, 14, `!`)
  await flush_async()
  expect(model.text()).toBe(`const xylambda!first = 1\nconst second = 2\nconst third = 3`)
  expect(text_spy).toHaveBeenCalledTimes(1)
  expect(
    recorder.edits.map(({ base_revision, revision, edits }) => [
      base_revision,
      revision,
      edits,
    ]),
  ).toEqual([
    [0, 1, [{ from: 6, to: 6, insert: `xy` }]],
    [1, 2, [{ from: 8, to: 8, insert: `λ` }]],
    [2, 3, [{ from: 8, to: 9, insert: `lambda` }]],
    [3, 4, [{ from: 14, to: 14, insert: `!` }]],
  ])
  expect(recorder.get_text()).toBe(model.text())
  textarea.setSelectionRange(0, 5)
  textarea.dispatchEvent(new Event(`select`))
  expect(model.selection).toEqual({ anchor: 0, head: 5 })
  before_input(textarea, `historyUndo`)
  expect(model.text()).toContain(`xylambdafirst`)
  // instance undo/redo delegate to the model's history
  expect(instance.undo()).toBe(true)
  expect(model.text()).toContain(`xyfirst`)
  expect(
    on_update.mock.calls.filter(([update]) => update.transaction?.source === `undo`),
  ).toHaveLength(2)
  expect(instance.redo()).toBe(true)
  expect(model.redo()).toBe(true)
  textarea.setSelectionRange(0, 0)
  press_key(textarea, `Tab`)
  press_key(textarea, `/`, { metaKey: true })
  press_key(textarea, `Enter`)
  await flush_async()
  expect(textarea.value.startsWith(`  // \n  const`)).toBe(true)
  expect(model.dirty).toBe(true)
  expect(on_update).toHaveBeenCalled()
  textarea.setSelectionRange(textarea.value.length, textarea.value.length)
  const no_op_dedent = press_key(textarea, `Tab`, { shiftKey: true })
  expect([no_op_dedent.defaultPrevented, model.revision]).toEqual([true, 11])
  const parent_escape = vi.fn(() => true)
  const unregister = register_escape_layer(parent_escape)
  onTestFinished(unregister)
  textarea.focus()
  expect(press_key(textarea, `Escape`).defaultPrevented).toBe(true)
  expect(press_key(textarea, `Tab`).defaultPrevented).toBe(false)
  expect(parent_escape).not.toHaveBeenCalled()
})

test(`save preserves disk format, external transactions sync, and model replacement reopens`, async () => {
  const first = create_editor_model({
    uri: `file:///first.ts`,
    text: `\uFEFFone\r\ntwo\r\n`,
  })
  const on_save = vi
    .fn()
    .mockRejectedValueOnce(new Error(`disk full`))
    .mockResolvedValue(undefined)
  const { instance, props, recorder, textarea } = await mount_editor(first, { on_save })
  expect([textarea.value, recorder.opens[0].text]).toEqual([`one\ntwo\n`, `one\ntwo\n`])
  emit_input(textarea, `insertText`, 0, 0, `!`)
  await expect(instance.save()).resolves.toBe(false)
  expect(doc_query(`[role="alert"]`).textContent).toBe(`disk full`)
  await expect(instance.save()).resolves.toBe(true)
  expect(on_save.mock.calls.map(([text]) => text)).toEqual([
    `\uFEFF!one\r\ntwo\r\n`,
    `\uFEFF!one\r\ntwo\r\n`,
  ])
  expect(first.dirty).toBe(false)
  first.set_selection({ anchor: 5, head: 1 })
  await flush_async()
  expect([textarea.selectionStart, textarea.selectionEnd]).toEqual([1, 5])
  expect(textarea.selectionDirection).toBe(`backward`)
  first.set_selection({ anchor: 6, head: 6 })
  await flush_async()
  expect(doc_query(`.gutter-line.active`).textContent).toBe(`2`)
  first.transact([{ from: 1, to: 4, insert: `ONE` }], { source: `external` })
  await flush_async()
  expect(textarea.value).toBe(`!ONE\ntwo\n`)
  const second = create_editor_model({ uri: `file:///second.ts`, text: `replacement` })
  props.model = second
  await flush_async()
  expect([textarea.value, recorder.opens.at(-1)?.uri, recorder.closed.length]).toEqual([
    `replacement`,
    `file:///second.ts`,
    1,
  ])
  const deferred = Promise.withResolvers<undefined>()
  on_save.mockImplementationOnce(() => deferred.promise)
  second.transact([{ from: 11, to: 11, insert: `!` }])
  const save = instance.save()
  second.transact([{ from: 12, to: 12, insert: `?` }])
  const third = create_editor_model({ uri: `memory:third`, text: `x` })
  third.transact([{ from: 1, to: 1, insert: `y` }])
  props.model = third
  await flush_async()
  emit_input(textarea, `formatBold`, 0, 0, ``)
  await flush_async()
  expect(doc_query(`[role="alert"]`).textContent).toBe(
    `Unsupported editor input type formatBold`,
  )
  deferred.resolve(undefined)
  await expect(save).resolves.toBe(true)
  expect([second.dirty, third.dirty]).toEqual([true, true])
  expect(doc_query(`[role="alert"]`).textContent).toBe(
    `Unsupported editor input type formatBold`,
  )
})

test(`undoing mid-save edits back to the written text reads clean`, async () => {
  const pending = Promise.withResolvers<undefined>()
  const on_save = vi.fn(() => pending.promise)
  const { instance, model, textarea } = await mount_editor(undefined, { on_save })
  emit_input(textarea, `insertText`, 0, 0, `!`)
  const save = instance.save()
  // typed, so it would merge into the `!` undo group without the save's checkpoint
  emit_input(textarea, `insertText`, 1, 1, `?`)
  pending.resolve(undefined)
  await expect(save).resolves.toBe(true)
  expect(on_save).toHaveBeenCalledWith(`!${DEMO_TEXT}`, expect.anything())
  expect(model.dirty).toBe(true)
  expect([model.undo(), model.text(), model.dirty]).toEqual([
    true,
    `!${DEMO_TEXT}`,
    false,
  ])
  expect([model.undo(), model.dirty]).toEqual([true, true])
})

test(`typing with the find panel open patches matches near the edit`, async () => {
  const model = create_editor_model({
    uri: `memory:find-typing`,
    text: numbered_lines(100_000),
  })
  // Spied before mounting: the component reads the model through its props proxy.
  const slice_spy = vi.spyOn(model, `slice`)
  const { instance } = await mount_editor(model)
  await instance.open_search()
  await fill_search(`line 9`)
  expect(doc_query(`[role="status"]`).textContent).toBe(`1 of 5000+ (first 5000 shown)`)
  await fill_search(`line 99999`)
  slice_spy.mockClear()
  const caret = model.line(50_000).from
  model.transact([{ from: caret, to: caret, insert: `line 99999 ` }])
  await flush_async()
  const sliced = slice_spy.mock.calls.reduce(
    (total, [start = 0, end = model.length]) => total + end - start,
    0,
  )
  // A rescan would read all ~1 MB; the patch reads the edit's neighborhood plus rows.
  expect(sliced).toBeLessThan(20_000)
  // The selected match shifted past the new one, and navigation wraps onto it.
  expect(doc_query(`[role="status"]`).textContent).toBe(`2 of 2`)
  expect(instance.find_next()).toBe(true)
  expect(model.selection).toEqual({ anchor: caret, head: caret + 10 })
})

test.each([`canceled by another listener`, `not followed by input`] as const)(
  `a beforeinput %s does not block selection sync`,
  async (mode) => {
    const { model, textarea } = await mount_editor()
    if (mode === `canceled by another listener`) {
      const cancel = (event: Event): void => event.preventDefault()
      document.addEventListener(`beforeinput`, cancel)
      onTestFinished(() => document.removeEventListener(`beforeinput`, cancel))
      expect(before_input(textarea, `insertText`).defaultPrevented).toBe(true)
    } else {
      // a no-op Backspace at offset 0: the browser fires beforeinput but no input
      textarea.setSelectionRange(0, 0)
      expect(before_input(textarea, `deleteContentBackward`).defaultPrevented).toBe(false)
      await new Promise((resolve) => void setTimeout(resolve, 0))
    }
    textarea.setSelectionRange(2, 4)
    textarea.dispatchEvent(new Event(`select`))
    expect(model.selection).toEqual({ anchor: 2, head: 4 })
  },
)

test.each([`read-only`, `unsupported input`, `rejected command`] as const)(
  `%s restores the model value`,
  async (mode) => {
    const on_error = vi.fn()
    const { model, textarea, recorder } = await mount_editor(undefined, {
      read_only: mode === `read-only`,
      on_error,
    })
    const input_events = vi.fn()
    textarea.addEventListener(`input`, input_events)
    if (mode === `rejected command`) {
      vi.spyOn(model, `transact`).mockImplementationOnce(() => {
        throw new Error(`rejected command`)
      })
      press_key(textarea, `Tab`)
    } else
      emit_input(textarea, mode === `read-only` ? `insertText` : `formatBold`, 0, 0, `!`)
    await flush_async()
    expect([textarea.value, model.text(), recorder.edits]).toEqual([
      DEMO_TEXT,
      DEMO_TEXT,
      [],
    ])
    expect(input_events).toHaveBeenCalledTimes(mode === `unsupported input` ? 1 : 0)
    // Native input can arrive without a cancelable beforeinput event.
    if (mode === `read-only`) {
      textarea.value = `unexpected native update`
      textarea.dispatchEvent(new InputEvent(`input`, { bubbles: true }))
      expect(textarea.value).toBe(DEMO_TEXT)
      expect(model.text()).toBe(DEMO_TEXT)
    }
    expect(on_error).toHaveBeenCalledTimes(mode === `read-only` ? 0 : 1)
    if (mode === `unsupported input`)
      expect(on_error).toHaveBeenCalledWith(`Unsupported editor input type formatBold`)
    if (mode === `rejected command`)
      expect(on_error).toHaveBeenCalledWith(`rejected command`)
  },
)

test.each([`historyUndo`, `historyRedo`])(
  `read-only blocks native %s`,
  async (input_type) => {
    const { model, props, textarea } = await mount_editor()
    emit_input(textarea, `insertText`, 0, 0, `!`)
    if (input_type === `historyRedo`) model.undo()
    props.read_only = true
    await tick()
    const text = model.text()
    const revision = model.revision
    const event = before_input(textarea, input_type)
    expect([
      event.defaultPrevented,
      model.text(),
      textarea.value,
      model.revision,
    ]).toEqual([true, text, text, revision])
  },
)

test.each([
  [`deleteContentBackward`, 2, 2, ``, 1, 2, `ac`],
  [`deleteWordBackward`, 2, 2, ``, 0, 2, `c`],
  [`deleteHardLineBackward`, 2, 2, ``, 0, 2, `c`],
  [`deleteContentForward`, 1, 1, ``, 1, 2, `ac`],
  [`deleteWordForward`, 1, 1, ``, 1, 3, `a`],
  [`deleteHardLineForward`, 1, 1, ``, 1, 3, `a`],
  [`deleteEntireSoftLine`, 1, 1, ``, 0, 3, ``],
  [`deleteByCut`, 1, 2, ``, 1, 2, `ac`],
  [`insertReplacementText`, 1, 2, `X`, 1, 2, `aXc`],
  [`insertReplacementText`, 3, 3, `acb`, 0, 3, `acb`],
  [`insertLineBreak`, 1, 1, `\n`, 1, 1, `a\nbc`],
] as const)(
  `%s derives one bounded transaction`,
  async (input_type, selection_start, selection_end, insert, from, to, expected) => {
    const model = create_editor_model({ uri: `memory:input`, text: `abc` })
    const { textarea } = await mount_editor(model)
    emit_input(textarea, input_type, selection_start, selection_end, insert, from, to)
    expect(model.text()).toBe(expected)
  },
)

test.each([
  [`start`, 1],
  [`end`, 1],
  [`start`, 64],
  [`end`, 64],
] as const)(
  `replacement at input %s with %i characters respects context bounds`,
  async (edge, length) => {
    const text = `${`a`.repeat(80)}\n`.repeat(400)
    const model = create_editor_model({ uri: `memory:replacement`, text })
    const on_error = vi.fn()
    const { textarea, recorder } = await mount_editor(model, { on_error })
    const selection = model.line(100).from + 40
    model.set_selection({ anchor: selection, head: selection })
    await tick()
    const input_from = Number(textarea.dataset.inputFrom)
    const value = textarea.value
    expect(input_from).toBeGreaterThan(0)
    expect(input_from + value.length).toBeLessThan(model.length)
    const caret = edge === `start` ? length : value.length - length
    const from = edge === `start` ? 0 : caret
    const to = edge === `start` ? caret : value.length
    emit_input(textarea, `insertReplacementText`, caret, caret, `X`, from, to)
    await flush_async()
    if (length === 64) {
      expect(on_error).toHaveBeenCalledWith(`Replacement exceeds 32-character context`)
      expect(model.text()).toBe(text)
      expect(textarea.value).toBe(value)
      expect(recorder.edits).toEqual([])
    } else {
      expect(on_error).not.toHaveBeenCalled()
      const expected = `${text.slice(0, input_from + from)}X${text.slice(input_from + to)}`
      expect(model.text()).toBe(expected)
      expect(recorder.get_text()).toBe(expected)
    }
  },
)

test.each([
  [{ keyboard_help: `Escape, dann Tab` }, `Escape, dann Tab`],
  [{}, `Press Escape, then Tab to move focus away`],
])(`labels %o override the keyboard hint`, async (labels, expected) => {
  const { textarea } = await mount_editor(undefined, { labels })
  const help = doc_query(`.sr-only`)
  expect(help.textContent).toBe(expected)
  expect(textarea.getAttribute(`aria-describedby`)).toBe(help.id)
})

test(`an edit keeps downstream tokens painted as stale until re-highlighted`, async () => {
  let packed_class = 6 // keyword
  const recorder = create_backend(() => [0, packed_class])
  const { highlight_lines } = recorder
  const model = create_editor_model({
    uri: `memory:invalidate`,
    text: `alpha\nbeta\ngamma`,
  })
  await mount_editor(model, { backend: recorder.backend })
  await vi.waitFor(() => expect(highlight_lines).toHaveBeenCalled())
  await flush_async()
  const line_classes = () =>
    Array.from(
      document.querySelectorAll(`.token-layer .line`),
      (line) => line.querySelector(`span`)?.classList.item(0) ?? ``,
    )
  expect(line_classes()).toEqual(Array(3).fill(`tok-keyword`))

  // Opening a block comment changes later lines without changing the line count. Rows
  // keep their stale spans instead of flashing unstyled, then take the fresh ones.
  packed_class = 1 // comment
  const line_start = model.line(1).from
  model.transact([{ from: line_start, to: line_start, insert: `/*` }])
  await tick()
  expect(line_classes()).toEqual(Array(3).fill(`tok-keyword`))
  await vi.waitFor(() => expect(highlight_lines).toHaveBeenCalledTimes(2))
  await flush_async()
  expect(line_classes()).toEqual(Array(3).fill(`tok-comment`))

  // A line split shifts downstream spans; the new line has none until re-highlight.
  packed_class = 6
  const split_at = model.line(1).from
  model.transact([{ from: split_at, to: split_at, insert: `\n` }])
  await tick()
  expect(line_classes()).toEqual([`tok-comment`, ``, `tok-plain`, `tok-comment`])
  await vi.waitFor(() => expect(highlight_lines).toHaveBeenCalledTimes(3))
  await flush_async()
  expect(line_classes()).toEqual([`tok-keyword`, ``, `tok-keyword`, `tok-keyword`])

  // Joining lines drops the swallowed line's spans without overwriting the edited line.
  packed_class = 1
  model.transact([{ from: model.line(1).to, to: model.line(3).from, insert: `` }])
  await tick()
  expect(line_classes()).toEqual(Array(2).fill(`tok-keyword`))
})

test(`a scroll that widens the overlay measures and refreshes the input once`, async () => {
  const { textarea } = await mount_editor()
  let width_reads = 0
  function scroll_width(this: Element) {
    return this === textarea ? ++width_reads && 640 : 0
  }
  vi.spyOn(Element.prototype, `scrollWidth`, `get`).mockImplementation(scroll_width)
  // happy-dom clamps scrollTop to its zero layout height
  const scrollport = doc_query<HTMLDivElement>(`.content`)
  let scroll_top = 0
  Object.defineProperty(scrollport, `scrollTop`, {
    configurable: true,
    get: () => scroll_top,
    set: (value: number) => void (scroll_top = value),
  })
  scroll_top = 40
  scrollport.dispatchEvent(new Event(`scroll`))
  await flush_async()
  expect(doc_query<HTMLDivElement>(`.scroll-space`).style.width).toBe(`640px`)
  expect(width_reads).toBe(1)
})

test(`token cache keeps viewport-touched lines when evicting beyond 2048`, async () => {
  const recorder = create_backend(() => [0, 6])
  const { highlight_lines } = recorder
  highlight_lines.mockResolvedValueOnce(Array.from({ length: 2048 }, () => [0, 6]))
  const model = create_editor_model({ uri: `memory:tokens`, text: numbered_lines(2050) })
  await mount_editor(model, { backend: recorder.backend })
  await vi.waitFor(() => expect(highlight_lines).toHaveBeenCalledOnce())
  await flush_async()
  model.set_selection({ anchor: 1, head: 1 })
  await flush_async()
  const scrollport = doc_query<HTMLDivElement>(`.content`)
  scrollport.scrollTop = 2049 * 20
  scrollport.dispatchEvent(new Event(`scroll`))
  await vi.waitFor(() => expect(highlight_lines).toHaveBeenCalledTimes(2))
  scrollport.scrollTop = 0
  scrollport.dispatchEvent(new Event(`scroll`))
  await tick()
  expect(highlight_lines).toHaveBeenCalledTimes(2)
  expect(doc_query(`.token-layer .line span`).classList.contains(`tok-keyword`)).toBe(
    true,
  )
})

test(`viewport input maps edits, IME, external updates, and history to document offsets`, async () => {
  const model = create_editor_model({
    uri: `memory:large-input`,
    text: numbered_lines(100_000),
  })
  const { textarea } = await mount_editor(model)
  const scrollport = doc_query<HTMLDivElement>(`.content`)
  const text_spy = vi.spyOn(model, `text`)
  const slice_spy = vi.spyOn(model, `slice`)
  const offset = () => Number(textarea.dataset.inputFrom)
  scrollport.scrollTop = 50_000 * 20
  scrollport.dispatchEvent(new Event(`scroll`))
  await tick()
  expect(offset()).toBeGreaterThan(0)
  expect(textarea.value.split(`\n`).length).toBeLessThan(30)
  expect(model.selection).toEqual({ anchor: 0, head: 0 })

  const caret = model.line(50_000).from + 5
  model.set_selection({ anchor: caret, head: caret })
  await tick()
  emit_input(textarea, `insertText`, caret - offset(), caret - offset(), `!`)
  expect(model.slice(caret, caret + 1)).toBe(`!`)
  expect(model.selection).toEqual({ anchor: caret + 1, head: caret + 1 })
  await tick()
  textarea.dispatchEvent(new CompositionEvent(`compositionstart`, { bubbles: true }))
  const composition_offset = offset()
  emit_input(
    textarea,
    `insertCompositionText`,
    caret + 1 - offset(),
    caret + 1 - offset(),
    `λ`,
  )
  scrollport.scrollTop = 60_000 * 20
  scrollport.dispatchEvent(new Event(`scroll`))
  await tick()
  expect(offset()).toBe(composition_offset)
  emit_input(
    textarea,
    `insertCompositionText`,
    caret + 2 - offset(),
    caret + 2 - offset(),
    `lambda`,
    caret + 1 - offset(),
    caret + 2 - offset(),
  )
  textarea.dispatchEvent(new CompositionEvent(`compositionend`, { bubbles: true }))
  await flush_async()
  expect(model.slice(caret, caret + 7)).toBe(`!lambda`)
  expect(model.undo()).toBe(true)
  expect(model.slice(caret, caret + 2)).toBe(`!5`)
  expect(model.redo()).toBe(true)
  model.transact([{ from: caret, to: caret + 1, insert: `?` }])
  await tick()
  expect(textarea.value).toContain(`line ?lambda50000`)
  expect(text_spy).not.toHaveBeenCalled()
  expect(
    Math.max(...slice_spy.mock.calls.map(([from = 0, to = model.length]) => to - from)),
  ).toBeLessThan(1000)
})

test(`document navigation and backward selections expand and release the input window`, async () => {
  const model = create_editor_model({
    uri: `memory:navigation`,
    text: `abcdefghij\n`.repeat(200),
  })
  const { textarea, props } = await mount_editor(model)
  press_key(textarea, `End`, { ctrlKey: true })
  await tick()
  expect(model.selection).toEqual({ anchor: model.length, head: model.length })
  expect(Number(textarea.dataset.inputFrom)).toBeGreaterThan(0)
  press_key(textarea, `Home`, { ctrlKey: true, shiftKey: true })
  expect(model.selection).toEqual({ anchor: model.length, head: 0 })
  expect(textarea.value).toBe(model.text())
  expect(textarea.selectionDirection).toBe(`backward`)
  press_key(textarea, `Home`, { ctrlKey: true })
  expect(textarea.value.length).toBeLessThan(200)
  press_key(textarea, `PageDown`)
  expect(model.selection.head).toBe(11)
  press_key(textarea, `End`)
  expect(model.selection.head).toBe(21)
  press_key(textarea, `Home`, { shiftKey: true })
  expect(model.selection).toEqual({ anchor: 21, head: 11 })
  press_key(textarea, `PageUp`, { shiftKey: true })
  expect(model.selection).toEqual({ anchor: 21, head: 0 })
  press_key(textarea, `PageUp`)
  expect(model.selection).toEqual({ anchor: 0, head: 0 })
  props.read_only = true
  await tick()
  press_key(textarea, `a`, { metaKey: true })
  expect(model.selection).toEqual({ anchor: 0, head: model.length })
  expect(textarea.value).toBe(model.text())
})

test.each([
  [`ArrowUp`, 2, 0],
  [`ArrowDown`, 7, 9],
  [`PageUp`, 2, 0],
  [`PageDown`, 7, 9],
] as const)(
  `%s reaches the document boundary from offset %s`,
  async (key, start, head) => {
    const model = create_editor_model({ uri: `memory:boundary`, text: `abcd\nefgh` })
    const { textarea } = await mount_editor(model)
    for (const shift_key of [false, true]) {
      model.set_selection({ anchor: start, head: start })
      press_key(textarea, key, { shiftKey: shift_key })
      expect(model.selection).toEqual({ anchor: shift_key ? start : head, head })
    }
  },
)

test(`vertical navigation keeps a preferred column and respects external selections`, async () => {
  const model = create_editor_model({
    uri: `memory:columns`,
    text: `abcdefghij\nx\nabcdefghij\nA🧪B`,
  })
  const { textarea } = await mount_editor(model)
  model.set_selection({ anchor: 8, head: 8 })
  press_key(textarea, `ArrowDown`)
  expect(model.selection.head).toBe(12)
  press_key(textarea, `ArrowDown`, { shiftKey: true })
  expect(model.selection).toEqual({ anchor: 12, head: 21 })
  model.set_selection({ anchor: 15, head: 15 })
  press_key(textarea, `ArrowDown`)
  expect(model.selection.head).toBe(25)
  press_key(textarea, `ArrowUp`)
  expect(model.selection.head).toBe(15)
  model.set_selection({ anchor: 8, head: 8 })
  press_key(textarea, `ArrowDown`)
  expect(model.selection.head).toBe(12)
  press_key(textarea, `PageDown`)
  expect(model.selection.head).toBe(14) // page keys use the actual, clamped column
  press_key(textarea, `ArrowUp`)
  expect(model.selection.head).toBe(12)
})

test.each([
  [`ab\n\tx`, 2, 4],
  [`\tx\nab`, 1, 5],
  [`a\u0301a\u0301a\u0301\n123456`, 6, 10],
  [`👩‍💻\n123456`, 5, 8],
  [`12\na\u0301a\u0301a\u0301`, 2, 7],
  [`12\n👩‍💻x`, 2, 8],
  [`a\u0301\t\n123456`, 3, 6],
])(
  `vertical movement follows tab stops and grapheme widths in %j`,
  async (text, start, expected) => {
    const model = create_editor_model({ uri: `memory:columns`, text })
    const { textarea } = await mount_editor(model)
    model.set_selection({ anchor: start, head: start })
    press_key(textarea, `ArrowDown`)
    expect(model.selection.head).toBe(expected)
  },
)

test(`mouse selection retains its anchor and supports word and line selection`, async () => {
  const model = create_editor_model({ uri: `memory:pointer`, text: `alpha\nbeta\ngamma` })
  const { textarea } = await mount_editor(model)
  const port = doc_query<HTMLDivElement>(`.content`)
  vi.spyOn(port, `getBoundingClientRect`).mockReturnValue(new DOMRect(0, 0, 100, 60))
  Object.defineProperty(port, `clientHeight`, { value: 60 })
  port.scrollTop = 0
  port.dispatchEvent(new Event(`scroll`))
  textarea.style.paddingLeft = `8px`
  textarea.setPointerCapture = vi.fn()
  textarea.dispatchEvent(
    new PointerEvent(`pointerdown`, {
      bubbles: true,
      button: 0,
      pointerType: `mouse`,
      pointerId: 1,
      clientX: 9,
      clientY: 5,
    }),
  )
  textarea.dispatchEvent(
    new PointerEvent(`pointermove`, {
      bubbles: true,
      pointerId: 1,
      clientX: 10,
      clientY: 25,
    }),
  )
  textarea.dispatchEvent(new PointerEvent(`pointerup`, { bubbles: true, pointerId: 1 }))
  expect(model.selection).toEqual({ anchor: 1, head: 8 })
  textarea.dispatchEvent(
    new MouseEvent(`click`, { bubbles: true, detail: 2, clientX: 10, clientY: 5 }),
  )
  expect(model.selection).toEqual({ anchor: 0, head: 5 })
  textarea.dispatchEvent(
    new MouseEvent(`click`, { bubbles: true, detail: 3, clientX: 10, clientY: 5 }),
  )
  expect(model.selection).toEqual({ anchor: 0, head: 6 })
})

test(`host selection changes reveal both horizontal edges`, async () => {
  const model = create_editor_model({ uri: `memory:horizontal`, text: `a`.repeat(1000) })
  const { textarea } = await mount_editor(model)
  const port = doc_query<HTMLDivElement>(`.content`)
  Object.defineProperties(port, {
    clientWidth: { value: 300 },
    clientHeight: { value: 60 },
  })
  Object.defineProperties(textarea, {
    clientWidth: { value: 1200 },
    scrollWidth: { value: 1200 },
  })
  textarea.style.padding = `0 8px`
  vi.spyOn(port, `getBoundingClientRect`).mockReturnValue(new DOMRect(0, 0, 300, 60))
  vi.spyOn(textarea, `getBoundingClientRect`).mockImplementation(
    () => new DOMRect(-port.scrollLeft, 0, 1200, 40),
  )
  model.set_selection({ anchor: 900, head: 900 })
  expect(port.scrollLeft).toBeGreaterThan(600)
  model.set_selection({ anchor: 0, head: 0 })
  expect(port.scrollLeft).toBe(0)
})
