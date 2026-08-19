import { register_escape_layer } from '$lib/attachments'
import CodeEditor from '$lib/code-editor/CodeEditor.svelte'
import { create_editor_model } from '$lib/code-editor/model'
import type { ApplyEditsArgs, EditorBackend, OpenDocArgs } from '$lib/code-editor/types'
import { mount, tick, type ComponentProps, unmount } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'
import { doc_query, press_key } from './index'

const DEMO_TEXT = `const first = 1\nconst second = 2\nconst third = 3`
const OPEN_RESULT = { language: `TypeScript`, highlightable: true, editable: true }
const apply_text = (text: string, edits: ApplyEditsArgs[`edits`]): string => {
  for (const { from, to, insert } of edits)
    text = text.slice(0, from) + insert + text.slice(to)
  return text
}
const create_backend = () => {
  const edits: ApplyEditsArgs[] = []
  const opens: OpenDocArgs[] = []
  const closed: string[] = []
  let text = ``
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
    highlight_lines: ({ startLine, endLine }) =>
      Promise.resolve(Array.from({ length: endLine - startLine }, () => [])),
    cancel_highlight: () => undefined,
    close_doc: ({ docId }) => Promise.resolve(void closed.push(docId)),
  }
  return { backend, edits, opens, closed, get_text: () => text }
}
const flush_async = async (): Promise<void> => {
  await tick()
  await Promise.resolve()
  await tick()
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
  area.dispatchEvent(
    new InputEvent(`beforeinput`, {
      inputType: input_type,
      bubbles: true,
      cancelable: true,
    }),
  )
  area.value = area.value.slice(0, replace_from) + insert + area.value.slice(replace_to)
  const caret = replace_from + insert.length
  area.setSelectionRange(caret, caret)
  area.dispatchEvent(new InputEvent(`input`, { inputType: input_type, bubbles: true }))
}
const mount_editor = async (
  model = create_editor_model({ uri: `demo.ts`, text: DEMO_TEXT }),
  overrides: Partial<ComponentProps<typeof CodeEditor>> = {},
) => {
  const recorder = create_backend()
  const props = $state({ model, backend: recorder.backend, ...overrides })
  const instance = mount(CodeEditor, { target: document.body, props })
  onTestFinished(() => unmount(instance))
  await flush_async()
  const textarea = doc_query<HTMLTextAreaElement>(`textarea`)
  return { instance, model, props, recorder, textarea }
}
test(`native input, selection, history, commands, and backend deltas share the model`, async () => {
  const on_update = vi.fn()
  const { instance, model, recorder, textarea } = await mount_editor(undefined, {
    on_update,
  })
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
    recorder.edits.map(({ baseRevision, revision, edits }) => [
      baseRevision,
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
  textarea.dispatchEvent(
    new InputEvent(`beforeinput`, {
      inputType: `historyUndo`,
      bubbles: true,
      cancelable: true,
    }),
  )
  expect(model.text()).toContain(`xylambdafirst`)
  expect(instance.undo()).toBe(true)
  expect(model.text()).toContain(`xyfirst`)
  expect(
    on_update.mock.calls.filter(([update]) => update.transaction?.source === `undo`),
  ).toHaveLength(2)
  expect(instance.redo()).toBe(true)
  expect(instance.redo()).toBe(true)
  textarea.setSelectionRange(0, 0)
  press_key(textarea, `Tab`)
  press_key(textarea, `/`, { metaKey: true })
  press_key(textarea, `Enter`)
  await flush_async()
  expect(textarea.value.startsWith(`  // \n  const`)).toBe(true)
  expect(model.dirty).toBe(true)
  expect(on_update).toHaveBeenCalled()
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
test.each([`read-only`, `unsupported input`, `rejected command`] as const)(
  `%s restores the model value`,
  async (mode) => {
    const on_error = vi.fn()
    const { model, textarea, recorder } = await mount_editor(undefined, {
      read_only: mode === `read-only`,
      on_error,
    })
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
    expect(on_error).toHaveBeenCalledTimes(mode === `read-only` ? 0 : 1)
    if (mode === `unsupported input`)
      expect(on_error).toHaveBeenCalledWith(`Unsupported editor input type formatBold`)
    if (mode === `rejected command`)
      expect(on_error).toHaveBeenCalledWith(`rejected command`)
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
test(`token cache keeps viewport-touched lines when evicting beyond 2048`, async () => {
  const recorder = create_backend()
  const model = create_editor_model({
    uri: `memory:tokens`,
    text: Array.from({ length: 2050 }, (_unused, line_idx) => `line ${line_idx}`).join(
      `\n`,
    ),
  })
  const highlight_lines = vi
    .fn()
    .mockResolvedValueOnce(Array.from({ length: 2048 }, () => [0, 6]))
    .mockImplementation(({ startLine, endLine }) =>
      Promise.resolve(Array.from({ length: endLine - startLine }, () => [0, 6])),
    )
  recorder.backend.highlight_lines = highlight_lines
  const { textarea } = await mount_editor(model, { backend: recorder.backend })
  await vi.waitFor(() => expect(highlight_lines).toHaveBeenCalledOnce())
  await flush_async()
  model.set_selection({ anchor: 1, head: 1 })
  await flush_async()
  textarea.scrollTop = 2049 * 20
  textarea.dispatchEvent(new Event(`scroll`))
  await vi.waitFor(() => expect(highlight_lines).toHaveBeenCalledTimes(2))
  textarea.scrollTop = 0
  textarea.dispatchEvent(new Event(`scroll`))
  await tick()
  expect(highlight_lines).toHaveBeenCalledTimes(2)
  expect(doc_query(`.token-layer .line span`).classList.contains(`tok-keyword`)).toBe(
    true,
  )
})
