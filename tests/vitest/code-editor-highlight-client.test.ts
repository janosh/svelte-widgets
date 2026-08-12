import { create_highlight_client } from '$lib/code-editor/highlight-client'
import type { HighlightClientOptions } from '$lib/code-editor/highlight-client'
import type {
  ApplyEditArgs,
  BeforeInputSnapshot,
  EditorBackend,
  OpenDocResult,
  SetTextArgs,
  SpanList,
} from '$lib/code-editor'
import { afterEach, expect, test, vi } from 'vite-plus/test'

const DEMO_TEXT = `const first = 1\nconst second = 2`
const OPEN_RESULT: OpenDocResult = {
  language: `TypeScript`,
  lineCount: 2,
  eol: `lf`,
  hadBom: false,
  highlightable: true,
  editable: true,
}

const create_backend = (overrides: Partial<EditorBackend> = {}) => {
  const edits: ApplyEditArgs[] = []
  const resyncs: SetTextArgs[] = []
  const closes: string[] = []
  const backend: EditorBackend = {
    open_doc: (args) => overrides.open_doc?.(args) ?? Promise.resolve(OPEN_RESULT),
    highlight_lines: (args) =>
      overrides.highlight_lines?.(args) ??
      Promise.resolve(Array.from({ length: args.endLine - args.startLine }, () => [])),
    apply_edit: (args) => {
      edits.push(args)
      return overrides.apply_edit?.(args) ?? Promise.resolve(args.expectedLineCount)
    },
    set_text: (args) => {
      resyncs.push(args)
      return overrides.set_text?.(args) ?? Promise.resolve(args.text.split(`\n`).length)
    },
    close_doc: (args) => {
      closes.push(args.docId)
      return overrides.close_doc?.(args) ?? Promise.resolve()
    },
  }
  return { backend, edits, resyncs, closes }
}

const setup = (
  recorder = create_backend(),
  options: Partial<HighlightClientOptions> = {},
) => {
  const client = create_highlight_client({
    doc_id: `doc-1`,
    filename: `demo.ts`,
    text: DEMO_TEXT,
    backend: recorder.backend,
    ...options,
  })
  let value = DEMO_TEXT
  const type_text = (insert: string, at: number) => {
    const before: BeforeInputSnapshot = {
      selection_start: at,
      selection_end: at,
      input_type: `insertText`,
      value_length: value.length,
    }
    value = value.slice(0, at) + insert + value.slice(at)
    return client.handle_input(before, value)
  }
  return { client, recorder, type_text, value: () => value }
}

afterEach(() => vi.useRealTimers())

test(`rapid derivable edits stay ordered and avoid full-document resyncs`, async () => {
  const gate = Promise.withResolvers<OpenDocResult>()
  const recorder = create_backend({ open_doc: () => gate.promise })
  const { client, type_text, value } = setup(recorder)
  void client.open()

  type_text(`a`, 31)
  type_text(`b`, 32)
  type_text(`c`, 33)
  gate.resolve(OPEN_RESULT)
  await client.settled()

  expect(recorder.edits.map((args) => args.insertedLines[0])).toEqual([
    `const second = a2`,
    `const second = ab2`,
    `const second = abc2`,
  ])
  expect(recorder.resyncs).toEqual([])
  expect(client.text()).toBe(value())
})

test(`a rejected incremental edit resyncs with the latest local text`, async () => {
  const gate = Promise.withResolvers<OpenDocResult>()
  const recorder = create_backend({
    open_doc: () => gate.promise,
    apply_edit: () => {
      throw new Error(`backend buffers diverged`)
    },
  })
  const { client, type_text, value } = setup(recorder)
  void client.open()

  type_text(`x`, 0)
  type_text(`y`, 1)
  gate.resolve(OPEN_RESULT)
  await client.settled()

  expect(recorder.edits).toHaveLength(1)
  expect(recorder.resyncs).toEqual([{ docId: `doc-1`, text: value() }])
})

test(`a rejected edit resyncs before an already-queued highlight`, async () => {
  vi.useFakeTimers()
  const edit_result = Promise.withResolvers<number>()
  const order: string[] = []
  const on_spans = vi.fn()
  const recorder = create_backend({
    apply_edit: () => {
      order.push(`edit`)
      return edit_result.promise
    },
    set_text: ({ text }) => {
      order.push(`resync:${text}`)
      return Promise.resolve(text.split(`\n`).length)
    },
    highlight_lines: () => {
      order.push(`highlight`)
      return Promise.resolve([[0, 6]])
    },
  })
  const { client, type_text, value } = setup(recorder, {
    on_spans,
    highlight_interval_ms: 0,
  })

  type_text(`x`, 0)
  client.request_highlight(0, 1)
  await vi.advanceTimersByTimeAsync(0)
  expect(order).toEqual([`edit`])

  edit_result.reject(new Error(`backend buffers diverged`))
  await client.settled()
  await Promise.resolve()

  expect(order).toEqual([`edit`, `resync:${value()}`, `highlight`])
  expect(on_spans).toHaveBeenCalledExactlyOnceWith({
    start_line: 0,
    spans: [[0, 6]],
  })
})

test(`throttled highlighting coalesces and drops spans from an older revision`, async () => {
  vi.useFakeTimers()
  const response = Promise.withResolvers<SpanList[]>()
  const highlight_lines = vi.fn(() => response.promise)
  const on_spans = vi.fn()
  const { client, type_text } = setup(create_backend({ highlight_lines }), {
    on_spans,
    highlight_interval_ms: 20,
  })

  client.request_highlight(0, 1)
  client.request_highlight(1, 2)
  await vi.advanceTimersByTimeAsync(25)
  type_text(`z`, 0)
  response.resolve([[0, 6]])
  await client.settled()

  expect(highlight_lines).toHaveBeenCalledExactlyOnceWith({
    docId: `doc-1`,
    startLine: 1,
    endLine: 2,
  })
  expect(on_spans).not.toHaveBeenCalled()
})

test(`queue work arriving at the drain boundary is not stranded`, async () => {
  const highlight_lines = vi.fn(() => Promise.resolve<SpanList[]>([[]]))
  const recorder = create_backend({ highlight_lines })
  const { client } = setup(recorder)
  await client.open()

  let second_request: Promise<SpanList[]> | undefined
  const first_request = client.highlight_lines(0, 1)
  void first_request.then(() =>
    queueMicrotask(() => {
      second_request = client.highlight_lines(1, 2)
    }),
  )
  await first_request
  await vi.waitFor(() => expect(highlight_lines).toHaveBeenCalledTimes(2))
  if (!second_request) throw new Error(`Second highlight request was not queued`)

  let close_request: Promise<void> | undefined
  void second_request.then(() =>
    queueMicrotask(() => {
      close_request = client.close()
    }),
  )
  await second_request
  await vi.waitFor(() => expect(close_request).toBeDefined())
  if (!close_request) throw new Error(`Close request was not queued`)
  await close_request
  expect(recorder.closes).toEqual([`doc-1`])
})

test(`close reports a backend cleanup failure after a successful open`, async () => {
  const { client } = setup(
    create_backend({
      close_doc: () => {
        throw new Error(`close failed`)
      },
    }),
  )
  await client.open()

  const close_request = client.close()
  await expect(close_request).rejects.toThrow(`close failed`)
  expect(client.close()).toBe(close_request)
})

test(`close ignores a missing backend document when open never succeeded`, async () => {
  const { client } = setup(
    create_backend({
      open_doc: () => Promise.reject(new Error(`open failed`)),
      close_doc: () => Promise.reject(new Error(`missing document`)),
    }),
  )
  await expect(client.open()).rejects.toThrow(`open failed`)

  await expect(client.close()).resolves.toBeUndefined()
})

test(`close aborts queued and later requests without running them`, async () => {
  const response = Promise.withResolvers<SpanList[]>()
  const highlight_lines = vi.fn(() => response.promise)
  const { client } = setup(create_backend({ highlight_lines }))
  await client.open()

  const running = client.highlight_lines(0, 1)
  const queued = client.highlight_lines(1, 2)
  await vi.waitFor(() => expect(highlight_lines).toHaveBeenCalledOnce())
  const close_request = client.close()

  await expect(queued).rejects.toThrow(`was closed before the request ran`)
  await expect(client.highlight_lines(0, 2)).rejects.toThrow(
    `was closed before the request ran`,
  )
  response.resolve([[]])
  await running
  await close_request
  expect(highlight_lines).toHaveBeenCalledOnce()
})

test(`a running edit failure cannot resync after close starts`, async () => {
  const edit_result = Promise.withResolvers<number>()
  const recorder = create_backend({ apply_edit: () => edit_result.promise })
  const { client, type_text } = setup(recorder)
  await client.open()

  type_text(`x`, 0)
  await vi.waitFor(() => expect(recorder.edits).toHaveLength(1))
  const close_request = client.close()
  edit_result.reject(new Error(`backend buffers diverged`))
  await close_request

  expect(recorder.resyncs).toEqual([])
  expect(recorder.closes).toEqual([`doc-1`])
})

test(`a failed full resync suppresses highlights until a later resync succeeds`, async () => {
  vi.useFakeTimers()
  const on_error = vi.fn()
  const on_spans = vi.fn()
  let resync_fails = true
  const { client, recorder } = setup(
    create_backend({
      set_text: () => {
        if (resync_fails) throw new Error(`resync failed`)
        return Promise.resolve(2)
      },
    }),
    { highlight_interval_ms: 0, on_error, on_spans },
  )
  const next_text = `x${DEMO_TEXT}`

  const splice = client.handle_input(
    {
      selection_start: 0,
      selection_end: 0,
      input_type: `insertText`,
      value_length: DEMO_TEXT.length + 1,
    },
    next_text,
  )
  await client.settled()

  expect(splice).toBeNull()
  expect(client.text()).toBe(next_text)
  expect(recorder.edits).toEqual([])
  expect(recorder.resyncs).toEqual([{ docId: `doc-1`, text: next_text }])
  expect(on_error).toHaveBeenCalledExactlyOnceWith(`resync failed`)

  client.request_highlight(0, 1)
  await vi.advanceTimersByTimeAsync(0)
  await client.settled()
  expect(on_spans).not.toHaveBeenCalled()

  resync_fails = false
  client.set_text(DEMO_TEXT)
  client.request_highlight(0, 1)
  await vi.advanceTimersByTimeAsync(0)
  await client.settled()
  expect(on_spans).toHaveBeenCalledExactlyOnceWith({ start_line: 0, spans: [[]] })
})

test(`a synchronous highlight backend error rejects without stranding the queue`, async () => {
  const { client } = setup(
    create_backend({
      highlight_lines: () => {
        throw new Error(`highlight failed`)
      },
    }),
  )

  await expect(client.highlight_lines(0, 1)).rejects.toThrow(`highlight failed`)
  await expect(client.settled()).resolves.toBeUndefined()
})
