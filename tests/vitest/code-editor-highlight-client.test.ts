import { create_highlight_client } from '#lib/code-editor/highlight-client.ts'
import { create_editor_model } from '#lib/code-editor/model.ts'
import type { EditorBackend, SpanList } from '#lib/code-editor/types.ts'
import { expect, test, vi } from 'vite-plus/test'

const OPEN_RESULT = { language: `typescript`, highlightable: true, editable: true }
const setup = (highlight_interval_ms?: number) => {
  const backend = {
    open_doc: vi.fn<EditorBackend[`open_doc`]>(() => Promise.resolve(OPEN_RESULT)),
    apply_edits: vi.fn<EditorBackend[`apply_edits`]>((args) =>
      Promise.resolve(args.revision),
    ),
    set_text: vi.fn<EditorBackend[`set_text`]>((args) => Promise.resolve(args.revision)),
    highlight_lines: vi.fn<EditorBackend[`highlight_lines`]>(({ start_line, end_line }) =>
      Promise.resolve(Array.from({ length: end_line - start_line }, () => [])),
    ),
    cancel_highlight: vi.fn<EditorBackend[`cancel_highlight`]>(),
    close_doc: vi.fn<EditorBackend[`close_doc`]>(() => Promise.resolve()),
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
    highlight_interval_ms,
  })
  return { backend, model, client, spans, errors }
}
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
    current.backend.apply_edits.mock.calls.map(
      ([{ base_revision, revision, edits, expected_length }]) => [
        base_revision,
        revision,
        edits,
        expected_length,
      ],
    ),
  ).toEqual([
    [0, 1, [{ from: 0, to: 0, insert: `a` }], 8],
    [1, 2, [{ from: 1, to: 1, insert: `b` }], 9],
  ])
  expect(current.backend.set_text).not.toHaveBeenCalled()
})

test.each([`reject`, `wrong revision`] as const)(
  `failed edit drops queued edits and recovers latest text after %s`,
  async (failure) => {
    const current = setup()
    const first_result = Promise.withResolvers<number>()
    current.backend.apply_edits.mockReturnValueOnce(first_result.promise)
    await current.client.open()
    edit_model(current, 0, `a`)
    edit_model(current, 1, `b`)
    const resync_result = Promise.withResolvers<number>()
    current.backend.set_text.mockReturnValueOnce(resync_result.promise)
    if (failure === `reject`) first_result.reject(new Error(`desync`))
    else first_result.resolve(99)
    await vi.waitFor(() => expect(current.backend.set_text).toHaveBeenCalledOnce())
    // An edit made while the resync is in flight must apply on top of the snapshot.
    edit_model(current, 2, `c`)
    resync_result.resolve(2)
    await current.client.settled()

    expect(current.backend.set_text).toHaveBeenCalledExactlyOnceWith({
      doc_id: `doc`,
      revision: 2,
      text: `abone\ntwo`,
    })
    expect(current.backend.apply_edits).toHaveBeenCalledTimes(2)
    expect(current.backend.apply_edits).toHaveBeenLastCalledWith(
      expect.objectContaining({
        base_revision: 2,
        edits: [{ from: 2, to: 2, insert: `c` }],
      }),
    )
    expect(current.errors).not.toHaveBeenCalled()
  },
)

test.each([
  [
    `retries a failed resync`,
    true,
    [`resync failed`],
    [{ doc_id: `doc`, request_id: 1, revision: 1, start_line: 0, end_line: 1 }],
  ],
  [
    `is skipped while the backend stays out of sync`,
    false,
    [`resync failed`, `resync failed`],
    [],
  ],
])(
  `a highlight request %s despite a throwing error callback`,
  async (_, resync_recovers, expected_errors, expected_highlights) => {
    vi.useFakeTimers()
    const current = setup()
    vi.spyOn(console, `error`).mockImplementation(() => {})
    current.errors.mockImplementationOnce(() => {
      throw new Error(`error callback failed`)
    })
    current.backend.apply_edits.mockRejectedValue(new Error(`desync`))
    const { set_text } = current.backend
    if (resync_recovers) set_text.mockRejectedValueOnce(new Error(`resync failed`))
    else set_text.mockRejectedValue(new Error(`resync failed`))
    await current.client.open()
    edit_model(current, 0, `a`)
    await current.client.settled()

    current.client.request_highlight(0, 1)
    await vi.runOnlyPendingTimersAsync()
    await current.client.settled()
    expect(current.backend.set_text).toHaveBeenCalledTimes(2)
    expect(current.errors.mock.calls.flat()).toEqual(expected_errors)
    expect(current.backend.highlight_lines.mock.calls.flat()).toEqual(expected_highlights)
    await expect(current.client.close()).resolves.toBeUndefined()
    expect(current.backend.close_doc).toHaveBeenCalledOnce()
  },
)

test(`viewport and edit cancellation suppress stale spans and highlighting waits for edits`, async () => {
  vi.useFakeTimers()
  const current = setup()
  const first = Promise.withResolvers<SpanList[]>()
  const second = Promise.withResolvers<SpanList[]>()
  const third = Promise.withResolvers<SpanList[]>()
  const edit = Promise.withResolvers<number>()
  current.backend.highlight_lines
    .mockReturnValueOnce(first.promise)
    .mockReturnValueOnce(second.promise)
    .mockReturnValueOnce(third.promise)
  current.backend.apply_edits.mockReturnValue(edit.promise)
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

  const cancelled_ids = current.backend.cancel_highlight.mock.calls.map(
    ([args]) => args.request_id,
  )
  expect(cancelled_ids).toEqual([1, 2])
  expect(current.spans).toHaveBeenCalledExactlyOnceWith({
    start_line: 0,
    revision: 1,
    spans: [[0, 3]],
  })
})

test(`close aborts queued work after a pending open rejects`, async () => {
  const current = setup()
  const open_result = Promise.withResolvers<typeof OPEN_RESULT>()
  current.backend.open_doc.mockReturnValue(open_result.promise)
  const open = current.client.open()
  const close = current.client.close()
  open_result.reject(new Error(`open failed`))
  await expect(open).rejects.toThrow(`open failed`)
  await expect(close).resolves.toBeUndefined()
  expect(current.backend.close_doc).toHaveBeenCalledOnce()
})
test(`close awaits asynchronous highlight cancellation`, async () => {
  const current = setup()
  const cancellation = Promise.withResolvers<undefined>()
  current.backend.highlight_lines.mockReturnValue(new Promise(() => {}))
  current.backend.cancel_highlight.mockReturnValue(cancellation.promise)
  await current.client.open()
  current.client.request_highlight(0, 1)
  await vi.waitFor(() => expect(current.backend.highlight_lines).toHaveBeenCalled())
  const close = current.client.close()
  await Promise.resolve()
  expect(current.backend.close_doc).not.toHaveBeenCalled()
  cancellation.resolve(undefined)
  await close
  expect(current.backend.close_doc).toHaveBeenCalledOnce()
})

test.each([
  [undefined, 30],
  [80, 80],
])(`highlight_interval_ms=%s debounces requests by %i ms`, async (interval, expected) => {
  vi.useFakeTimers()
  const current = setup(interval)
  await current.client.open()
  current.client.request_highlight(0, 1)
  await vi.advanceTimersByTimeAsync(expected - 1)
  // A request inside the debounce window restarts the timer and replaces the viewport.
  current.client.request_highlight(1, 2)
  await vi.advanceTimersByTimeAsync(expected - 1)
  expect(current.backend.highlight_lines).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(current.backend.highlight_lines).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ start_line: 1, end_line: 2 }),
  )
})

test(`close rejects later opens and ignores later edits and highlight requests`, async () => {
  vi.useFakeTimers()
  const current = setup()
  await current.client.open()
  await current.client.close()

  await expect(current.client.open()).rejects.toThrow(
    `Editor document doc was closed before the request ran`,
  )
  edit_model(current, 0, `a`)
  current.client.request_highlight(0, 1)
  expect(vi.getTimerCount()).toBe(0)
  await vi.runAllTimersAsync()
  await current.client.settled()
  expect(current.backend.apply_edits).not.toHaveBeenCalled()
  expect(current.backend.highlight_lines).not.toHaveBeenCalled()
})

test.each([`edit`, `resync`] as const)(
  `%s failing after close neither resyncs again nor reports`,
  async (stage) => {
    const current = setup()
    const pending = Promise.withResolvers<number>()
    const { apply_edits, set_text } = current.backend
    if (stage === `edit`) apply_edits.mockReturnValue(pending.promise)
    else apply_edits.mockRejectedValue(new Error(`desync`))
    set_text.mockReturnValue(pending.promise)
    await current.client.open()
    edit_model(current, 0, `a`)
    await vi.waitFor(() =>
      expect(stage === `edit` ? apply_edits : set_text).toHaveBeenCalledOnce(),
    )
    const close = current.client.close()
    pending.reject(new Error(`${stage} failed`))
    await close
    expect(set_text).toHaveBeenCalledTimes(stage === `edit` ? 0 : 1)
    expect(current.errors).not.toHaveBeenCalled()
  },
)

test(`resync keeps a queued open and drops queued edits`, async () => {
  const current = setup()
  const first_edit = Promise.withResolvers<number>()
  current.backend.apply_edits.mockReturnValueOnce(first_edit.promise)
  edit_model(current, 0, `a`)
  edit_model(current, 1, `b`)
  const reopen = current.client.open()
  first_edit.reject(new Error(`desync`))
  await expect(reopen).resolves.toEqual(OPEN_RESULT)
  await current.client.settled()

  expect(current.backend.apply_edits).toHaveBeenCalledOnce()
  expect(current.backend.set_text).toHaveBeenCalledExactlyOnceWith({
    doc_id: `doc`,
    revision: 2,
    text: `abone\ntwo`,
  })
  expect(current.backend.open_doc).toHaveBeenCalledOnce()
})

test.each([0, 1, 2, 3, 4, 5])(
  `edit enqueued %i microtasks after an open settles is still applied`,
  async (depth) => {
    const current = setup()
    const defer = async (remaining: number): Promise<void> => {
      if (remaining > 0) return Promise.resolve().then(() => defer(remaining - 1))
      edit_model(current, 0, `a`)
    }
    await current.client.open().then(() => defer(depth))
    await current.client.settled()
    expect(current.backend.apply_edits).toHaveBeenCalledOnce()
  },
)

test.each([
  [
    `coalesce to the latest viewport`,
    false,
    [expect.objectContaining({ start_line: 1, end_line: 2, revision: 1 })],
  ],
  [`never run after close`, true, []],
])(
  `highlight requests queued behind an edit %s`,
  async (_, close_first, expected_calls) => {
    vi.useFakeTimers()
    const current = setup()
    const edit = Promise.withResolvers<number>()
    current.backend.apply_edits.mockReturnValue(edit.promise)
    await current.client.open()
    edit_model(current, 0, `a`)
    current.client.request_highlight(0, 1)
    await vi.runOnlyPendingTimersAsync()
    current.client.request_highlight(1, 2)
    await vi.runOnlyPendingTimersAsync()
    const done = close_first ? current.client.close() : current.client.settled()
    edit.resolve(1)
    await done
    await vi.waitFor(() =>
      expect(current.spans).toHaveBeenCalledTimes(expected_calls.length),
    )
    expect(current.backend.highlight_lines.mock.calls.flat()).toEqual(expected_calls)
  },
)

test.each([
  [`current`, [`highlight failed`], 0],
  [`superseded`, [], 1],
])(
  `a rejected %s highlight request reports %j`,
  async (which, expected_errors, span_calls) => {
    vi.useFakeTimers()
    const current = setup()
    const first = Promise.withResolvers<SpanList[]>()
    current.backend.highlight_lines.mockReturnValueOnce(first.promise)
    await current.client.open()
    current.client.request_highlight(0, 1)
    await vi.runOnlyPendingTimersAsync()
    expect(current.backend.highlight_lines).toHaveBeenCalledOnce()
    if (which === `superseded`) current.client.request_highlight(1, 2)
    first.reject(new Error(`highlight failed`))
    await vi.runOnlyPendingTimersAsync()
    await current.client.settled()
    expect(current.errors.mock.calls.flat()).toEqual(expected_errors)
    expect(current.spans).toHaveBeenCalledTimes(span_calls)
  },
)
