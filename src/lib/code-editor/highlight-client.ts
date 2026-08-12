// One open document's ordered conversation with an EditorBackend. The local line
// index advances synchronously with textarea input; backend edits then run FIFO.

import {
  apply_splice,
  build_line_index,
  derive_line_splice,
  line_index_text,
} from './text-delta'
import type { BeforeInputSnapshot, LineIndex, LineSplice } from './text-delta'
import { to_error } from './types'
import type { EditorBackend, OpenDocResult, SpanList } from './types'

export interface HighlightSpansEvent {
  start_line: number
  spans: SpanList[]
}

export interface HighlightClientOptions {
  // Unique per open editor. Sharing ids would let either editor close the other's doc.
  doc_id: string
  filename: string
  // Textarea-normalized initial text (LF, no BOM).
  text: string
  // Optional disk form, used only by open_doc so the backend can detect EOL/BOM.
  raw_text?: string
  backend: EditorBackend
  on_spans?: (event: HighlightSpansEvent) => void
  on_error?: (message: string) => void
  highlight_interval_ms?: number
}

export interface HighlightClient {
  open: () => Promise<OpenDocResult>
  line_index: () => LineIndex
  line_count: () => number
  text: () => string
  handle_input: (before: BeforeInputSnapshot, next_value: string) => LineSplice | null
  set_text: (text: string) => void
  request_highlight: (start_line: number, end_line: number) => void
  highlight_lines: (start_line: number, end_line: number) => Promise<SpanList[]>
  close: () => Promise<void>
  settled: () => Promise<void>
}

const DEFAULT_HIGHLIGHT_INTERVAL_MS = 30

interface QueuedTask {
  kind?: `resync` | `close`
  run: () => Promise<void>
  abort?: (error: Error) => void
}

export const create_highlight_client = (
  options: HighlightClientOptions,
): HighlightClient => {
  const { backend, doc_id, filename, on_spans, on_error } = options
  const highlight_interval_ms =
    options.highlight_interval_ms ?? DEFAULT_HIGHLIGHT_INTERVAL_MS

  let index = build_line_index(options.text)
  let revision = 0
  let opened = false
  let disposed = false
  let queue: QueuedTask[] = []
  let pump_promise: Promise<void> | null = null
  let highlight_timer: ReturnType<typeof setTimeout> | null = null
  let pending_window: { start_line: number; end_line: number } | null = null

  const report = (error: unknown): void => {
    if (!disposed) on_error?.(to_error(error).message)
  }

  const drain = async (): Promise<void> => {
    while (queue.length > 0) await queue.shift()?.run()
  }

  const pump = (): Promise<void> => {
    pump_promise ??= drain().finally(() => {
      pump_promise = null
      // A task can arrive after drain observes an empty queue but before this
      // finally callback runs. Restart so that boundary cannot strand it.
      if (queue.length > 0) void pump()
    })
    return pump_promise
  }

  const closed_error = (): Error =>
    new Error(`Editor document ${doc_id} was closed before the request ran`)

  const enqueue = (task: QueuedTask): void => {
    if (disposed && task.kind !== `close`) {
      task.abort?.(closed_error())
      return
    }
    queue.push(task)
    void pump()
  }

  const enqueue_request = <Result>(call: () => Promise<Result>): Promise<Result> =>
    new Promise<Result>((resolve, reject) => {
      enqueue({
        abort: reject,
        run: async () => {
          try {
            resolve(await call())
          } catch (error) {
            reject(to_error(error))
          }
        },
      })
    })

  const settled = async (): Promise<void> => {
    for (let running = pump_promise; running; running = pump_promise) await running
  }

  const enqueue_resync = (text: string): void => {
    queue = queue.filter((task) => task.kind !== `resync`)
    const args = { docId: doc_id, text }
    enqueue({
      kind: `resync`,
      run: async () => {
        try {
          await backend.set_text(args)
        } catch (error) {
          report(error)
        }
      },
    })
  }

  const enqueue_edit = (splice: LineSplice): void => {
    const args = {
      docId: doc_id,
      startLine: splice.start_line,
      removedCount: splice.removed_count,
      insertedLines: splice.inserted_lines,
      expectedLineCount: splice.expected_line_count,
      expectedTotalLength: splice.expected_total_length,
    }
    enqueue({
      run: async () => {
        try {
          await backend.apply_edit(args)
        } catch {
          // A rejected incremental edit means the buffers diverged. Resync with the
          // latest local document rather than the older text that produced the edit.
          enqueue_resync(line_index_text(index))
        }
      },
    })
  }

  const handle_input = (
    before: BeforeInputSnapshot,
    next_value: string,
  ): LineSplice | null => {
    const splice = derive_line_splice(index, before, next_value)
    revision += 1
    if (splice === null) {
      index = build_line_index(next_value)
      enqueue_resync(next_value)
      return null
    }
    apply_splice(index, splice)
    enqueue_edit(splice)
    return splice
  }

  const set_text = (text: string): void => {
    index = build_line_index(text)
    revision += 1
    enqueue_resync(text)
  }

  const highlight_lines = (start_line: number, end_line: number): Promise<SpanList[]> =>
    enqueue_request(() =>
      backend.highlight_lines({
        docId: doc_id,
        startLine: start_line,
        endLine: end_line,
      }),
    )

  const request_highlight = (start_line: number, end_line: number): void => {
    if (disposed) return
    pending_window = { start_line, end_line }
    if (highlight_timer !== null) return
    highlight_timer = setTimeout(() => {
      highlight_timer = null
      const window = pending_window
      pending_window = null
      if (window === null) return
      const at_revision = revision
      highlight_lines(window.start_line, window.end_line)
        .then((spans) => {
          if (disposed || revision !== at_revision) return
          on_spans?.({ start_line: window.start_line, spans })
        })
        .catch(report)
    }, highlight_interval_ms)
  }

  const close = async (): Promise<void> => {
    if (!disposed) {
      disposed = true
      if (highlight_timer !== null) clearTimeout(highlight_timer)
      highlight_timer = null
      for (const task of queue) task.abort?.(closed_error())
      queue = []
      enqueue({
        kind: `close`,
        run: async () => {
          try {
            await backend.close_doc({ docId: doc_id })
          } catch (error) {
            // Closing a document that never finished opening needs no recovery.
            if (opened) throw to_error(error)
          }
        },
      })
    }
    await settled()
  }

  const open = (): Promise<OpenDocResult> =>
    enqueue_request(async () => {
      const result = await backend.open_doc({
        docId: doc_id,
        filename,
        text: options.raw_text ?? line_index_text(index),
      })
      opened = true
      return result
    })

  return {
    open,
    line_index: () => index,
    line_count: () => index.lines.length,
    text: () => line_index_text(index),
    handle_input,
    set_text,
    request_highlight,
    highlight_lines,
    close,
    settled,
  }
}
