import { create_highlight_client } from '$lib/code-editor/highlight-client'
import { create_editor_model } from '$lib/code-editor/model'
import type { ApplyEditsArgs, EditorBackend, SetTextArgs } from '$lib/code-editor/types'
import { afterEach, expect, test, vi } from 'vite-plus/test'

const OPEN_RESULT = { language: `typescript`, highlightable: true, editable: true }
const setup = () => {
  const edits: Parameters<EditorBackend[`apply_edits`]>[0][] = []
  const resyncs: Parameters<EditorBackend[`set_text`]>[0][] = []
  const cancellations: Parameters<EditorBackend[`cancel_highlight`]>[0][] = []
  const backend: EditorBackend = {
    open_doc: () => Promise.resolve(OPEN_RESULT),
    apply_edits: (args) => {
      edits.push(args)
      return Promise.resolve(args.revision)
    },
    set_text: (args) => {
      resyncs.push(args)
      return Promise.resolve(args.revision)
    },
    highlight_lines: ({ startLine, endLine }) =>
      Promise.resolve(Array.from({ length: endLine - startLine }, () => [])),
    cancel_highlight: (args) => void cancellations.push(args),
    close_doc: () => Promise.resolve(),
  }
  const model = create_editor_model({ uri: `file:///demo.ts`, text: `one\ntwo` })
  const spans = vi.fn()
  const errors = vi.fn()
  const client = create_highlight_client({
    doc_id: `doc`,
    model,
    backend,
    on_spans: spans,
    on_error: errors,
    highlight_interval_ms: 0,
  })
  return { backend, model, client, edits, resyncs, cancellations, spans, errors }
}
afterEach(() => vi.useRealTimers())
const edit_model = (
  current: ReturnType<typeof setup>,
  from: number,
  insert: string,
): void => {
  const caret = from + insert.length
  const transaction = current.model.transact([{ from, to: from, insert }], {
    selection: { anchor: caret, head: caret },
    source: `input`,
  })
  current.client.apply_transaction(transaction)
}

test(`opens once and sends ordered revisioned edits without resync`, async () => {
  const current = setup()
  await current.client.open()
  edit_model(current, 0, `a`)
  edit_model(current, 1, `b`)
  await current.client.settled()

  expect(
    current.edits.map(({ baseRevision, revision, edits, expectedLength }) => [
      baseRevision,
      revision,
      edits,
      expectedLength,
    ]),
  ).toEqual([
    [0, 1, [{ from: 0, to: 0, insert: `a` }], 8],
    [1, 2, [{ from: 1, to: 1, insert: `b` }], 9],
  ])
  expect(current.resyncs).toEqual([])
})

test.each([`reject`, `wrong revision`] as const)(
  `failed edit drops queued edits and recovers latest text after %s`,
  async (failure) => {
    const current = setup()
    const first_result = Promise.withResolvers<number>()
    current.backend.apply_edits = vi
      .fn()
      .mockImplementationOnce(() => first_result.promise)
      .mockImplementation((args: ApplyEditsArgs) => Promise.resolve(args.revision))
    await current.client.open()
    edit_model(current, 0, `a`)
    edit_model(current, 1, `b`)
    const resync_result = Promise.withResolvers<number>()
    current.backend.set_text = vi.fn((args: SetTextArgs) => {
      current.resyncs.push(args)
      return resync_result.promise
    })
    if (failure === `reject`) first_result.reject(new Error(`desync`))
    else first_result.resolve(99)
    await vi.waitFor(() => expect(current.resyncs).toHaveLength(1))
    // An edit made while the resync is in flight must apply on top of the snapshot.
    edit_model(current, 2, `c`)
    resync_result.resolve(2)
    await current.client.settled()

    expect(current.resyncs).toEqual([{ docId: `doc`, revision: 2, text: `abone\ntwo` }])
    expect(current.backend.apply_edits).toHaveBeenCalledTimes(2)
    expect(current.backend.apply_edits).toHaveBeenLastCalledWith(
      expect.objectContaining({
        baseRevision: 2,
        edits: [{ from: 2, to: 2, insert: `c` }],
      }),
    )
    expect(current.errors).not.toHaveBeenCalled()
  },
)

test(`a highlight request retries a failed resync despite a throwing error callback`, async () => {
  vi.useFakeTimers()
  const current = setup()
  vi.spyOn(console, `error`).mockImplementation(() => {})
  current.errors.mockImplementationOnce(() => {
    throw new Error(`error callback failed`)
  })
  const close_doc = vi.spyOn(current.backend, `close_doc`)
  current.backend.apply_edits = vi.fn(() => Promise.reject(new Error(`desync`)))
  current.backend.set_text = vi
    .fn()
    .mockRejectedValueOnce(new Error(`resync failed`))
    .mockImplementation((args) => Promise.resolve(args.revision))
  current.backend.highlight_lines = vi.fn(() => Promise.resolve([[]]))
  await current.client.open()
  edit_model(current, 0, `a`)
  await current.client.settled()

  current.client.request_highlight(0, 1)
  await vi.runOnlyPendingTimersAsync()
  await current.client.settled()
  expect(current.backend.highlight_lines).toHaveBeenCalledExactlyOnceWith({
    docId: `doc`,
    requestId: 1,
    revision: 1,
    startLine: 0,
    endLine: 1,
  })
  expect(current.errors).toHaveBeenCalledWith(`resync failed`)
  await expect(current.client.close()).resolves.toBeUndefined()
  expect(close_doc).toHaveBeenCalledOnce()
})

test(`viewport and edit cancellation suppress stale spans and highlighting waits for edits`, async () => {
  vi.useFakeTimers()
  const current = setup()
  const first = Promise.withResolvers<number[][]>()
  const second = Promise.withResolvers<number[][]>()
  const third = Promise.withResolvers<number[][]>()
  const edit = Promise.withResolvers<number>()
  current.backend.highlight_lines = vi
    .fn()
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockReturnValueOnce(third.promise)
  current.backend.apply_edits = () => edit.promise
  await current.client.open()
  current.client.request_highlight(0, 1)
  await vi.waitFor(() => expect(current.backend.highlight_lines).toHaveBeenCalledOnce())
  current.client.request_highlight(1, 2)
  first.resolve([[0, 1]])
  await vi.waitFor(() => expect(current.backend.highlight_lines).toHaveBeenCalledTimes(2))
  edit_model(current, 0, `x`)
  current.client.request_highlight(0, 2)
  second.resolve([[0, 2]])
  await vi.runOnlyPendingTimersAsync()
  expect(current.backend.highlight_lines).toHaveBeenCalledTimes(2)
  edit.resolve(1)
  await current.client.settled()
  await vi.waitFor(() => expect(current.backend.highlight_lines).toHaveBeenCalledTimes(3))
  third.resolve([[0, 3]])
  await vi.waitFor(() => expect(current.spans).toHaveBeenCalledOnce())

  expect(current.cancellations.map(({ requestId }) => requestId)).toEqual([1, 2])
  expect(current.spans).toHaveBeenCalledWith({
    start_line: 0,
    revision: 1,
    spans: [[0, 3]],
  })
})

test(`close aborts queued work after a pending open rejects`, async () => {
  const current = setup()
  const open_result = Promise.withResolvers<typeof OPEN_RESULT>()
  current.backend.open_doc = () => open_result.promise
  const close_doc = vi.spyOn(current.backend, `close_doc`)
  const open = current.client.open()
  const close = current.client.close()
  open_result.reject(new Error(`open failed`))
  await expect(open).rejects.toThrow(`open failed`)
  await expect(close).resolves.toBeUndefined()
  expect(close_doc).toHaveBeenCalledOnce()
})

test(`close awaits asynchronous highlight cancellation`, async () => {
  const current = setup()
  const highlight = Promise.withResolvers<number[][]>()
  const cancellation = Promise.withResolvers<undefined>()
  current.backend.highlight_lines = vi.fn(() => highlight.promise)
  current.backend.cancel_highlight = () => cancellation.promise
  const close_doc = vi.spyOn(current.backend, `close_doc`)
  await current.client.open()
  current.client.request_highlight(0, 1)
  await vi.waitFor(() => expect(current.backend.highlight_lines).toHaveBeenCalled())
  const close = current.client.close()
  await Promise.resolve()
  expect(close_doc).not.toHaveBeenCalled()
  cancellation.resolve(undefined)
  await close
  expect(close_doc).toHaveBeenCalledOnce()
})
