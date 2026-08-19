import { to_error } from './types'
import type {
  EditorBackend,
  EditorModel,
  EditorTransaction,
  OpenDocResult,
  SpanList,
} from './types'

export interface HighlightSpansEvent {
  start_line: number
  revision: number
  spans: SpanList[]
}
export interface HighlightClientOptions {
  doc_id: string
  model: EditorModel
  backend: EditorBackend
  on_spans?: (event: HighlightSpansEvent) => void
  on_error?: (message: string) => void
  highlight_interval_ms?: number
}
interface QueuedTask {
  kind?: `edit` | `resync`
  run: () => Promise<void>
  abort?: (error: Error) => void
}
const DEFAULT_HIGHLIGHT_INTERVAL_MS = 30
export const create_highlight_client = (options: HighlightClientOptions) => {
  const { backend, doc_id, model, on_spans, on_error } = options
  const highlight_interval_ms =
    options.highlight_interval_ms ?? DEFAULT_HIGHLIGHT_INTERVAL_MS
  let disposed = false
  let queue: QueuedTask[] = []
  let queue_head = 0
  let pump_promise: Promise<void> | null = null
  let close_promise: Promise<void> | null = null
  let highlight_timer: ReturnType<typeof setTimeout> | null = null
  let pending_window: { start_line: number; end_line: number } | null = null
  let backend_synced = true
  let active_highlight: { request_id: number; revision: number } | null = null
  let cancellation: Promise<void> = Promise.resolve()
  let next_request_id = 0
  const report = (error: unknown): void => {
    if (!disposed) on_error?.(to_error(error).message)
  }
  const drain = async (): Promise<void> => {
    while (queue_head < queue.length) await queue[queue_head++]?.run()
    queue = []
    queue_head = 0
  }
  const pump = (): Promise<void> => {
    pump_promise ??= drain().finally(() => {
      pump_promise = null
      if (queue.length > 0) void pump()
    })
    return pump_promise
  }
  const closed_error = (): Error =>
    new Error(`Editor document ${doc_id} was closed before the request ran`)
  const enqueue = (task: QueuedTask): void => {
    if (disposed) {
      task.abort?.(closed_error())
      return
    }
    queue.push(task)
    void pump()
  }
  const settled = async (): Promise<void> => {
    for (let running = pump_promise; running; running = pump_promise) await running
  }
  const cancel_highlight = (): void => {
    const active = active_highlight
    active_highlight = null
    if (!active) return
    try {
      const pending = Promise.resolve(
        backend.cancel_highlight({ docId: doc_id, requestId: active.request_id }),
      )
      cancellation = Promise.allSettled([cancellation, pending]).then(() => undefined)
    } catch {
      // Cancellation is best-effort; revision checks still reject the result.
    }
  }
  const enqueue_resync = (): void => {
    if (disposed) return
    backend_synced = false
    const pending = queue
      .splice(queue_head)
      .filter((task) => task.kind !== `resync` && task.kind !== `edit`)
    const task: QueuedTask = {
      kind: `resync`,
      run: async () => {
        const revision = model.revision
        try {
          const applied = await backend.set_text({
            docId: doc_id,
            revision,
            text: model.text(),
          })
          if (applied !== revision)
            throw new Error(
              `Backend resync revision mismatch: expected ${revision}, received ${applied}`,
            )
          backend_synced = true
          const window = pending_window
          if (window && highlight_timer === null)
            request_highlight(window.start_line, window.end_line)
        } catch (error) {
          report(error)
        }
      },
    }
    queue.push(task, ...pending)
    void pump()
  }
  const apply_transaction = (transaction: EditorTransaction): void => {
    cancel_highlight()
    const args = {
      docId: doc_id,
      baseRevision: transaction.base_revision,
      revision: transaction.revision,
      edits: transaction.edits,
      expectedLineCount: model.line_count,
      expectedLength: model.length,
    }
    enqueue({
      kind: `edit`,
      run: async () => {
        try {
          const applied = await backend.apply_edits(args)
          if (applied !== transaction.revision)
            throw new Error(
              `Backend edit revision mismatch: expected ${transaction.revision}, received ${applied}`,
            )
        } catch {
          enqueue_resync()
        }
      },
    })
  }
  const run_highlight = async (): Promise<void> => {
    await settled()
    if (disposed || !backend_synced) return
    const window = pending_window
    pending_window = null
    if (!window) return
    const request_id = ++next_request_id
    const revision = model.revision
    active_highlight = { request_id, revision }
    try {
      const spans = await backend.highlight_lines({
        docId: doc_id,
        requestId: request_id,
        revision,
        startLine: window.start_line,
        endLine: window.end_line,
      })
      const active = active_highlight
      if (
        !disposed &&
        active?.request_id === request_id &&
        active.revision === model.revision
      )
        on_spans?.({ start_line: window.start_line, revision, spans })
    } catch (error) {
      if (active_highlight?.request_id === request_id) report(error)
    } finally {
      if (active_highlight?.request_id === request_id) active_highlight = null
    }
  }
  const request_highlight = (start_line: number, end_line: number): void => {
    if (disposed) return
    pending_window = { start_line, end_line }
    cancel_highlight()
    if (highlight_timer !== null) clearTimeout(highlight_timer)
    highlight_timer = setTimeout(() => {
      highlight_timer = null
      void run_highlight()
    }, highlight_interval_ms)
  }
  const open = (): Promise<OpenDocResult> =>
    new Promise((resolve, reject) => {
      enqueue({
        abort: reject,
        run: async () => {
          try {
            resolve(
              await backend.open_doc({
                docId: doc_id,
                uri: model.uri,
                revision: model.revision,
                text: model.text(),
              }),
            )
          } catch (error) {
            reject(to_error(error))
          }
        },
      })
    })
  const close = (): Promise<void> =>
    (close_promise ??= (async () => {
      disposed = true
      if (highlight_timer !== null) clearTimeout(highlight_timer)
      highlight_timer = null
      pending_window = null
      cancel_highlight()
      for (const task of queue.splice(queue_head)) task.abort?.(closed_error())
      await settled()
      await cancellation
      await backend.close_doc({ docId: doc_id })
    })())
  return {
    open,
    apply_transaction,
    request_highlight,
    close,
    settled,
  }
}
