import type { Attachment } from 'svelte/attachments'
import { files_from_data_transfer, filter_accepted_files } from '../file-drop'

export interface FileDropOptions {
  accept?: string
  multiple?: boolean
  // Read on every event, so a getter toggles it without recreating the attachment. A disabled
  // zone shows the no-drop cursor and leaves drops to drop zones around it.
  disabled?: boolean
  // Aborted by a newer accepted drop (unless queue) or when the attachment is
  // recreated/destroyed.
  on_files: (files: File[], signal: AbortSignal) => unknown
  // Opts into link drags: a drop carrying no files delivers its text/uri-list entries
  // instead (only the first unless multiple), with the same abort semantics as on_files.
  on_urls?: (urls: string[], signal: AbortSignal) => unknown
  // Deliver every drop in drop order, each once the previous callback settles, instead of
  // a newer drop superseding the one before it
  queue?: boolean
  on_drag_active?: (active: boolean, event?: DragEvent) => void
  on_error?: (error: unknown) => unknown
}

// Headless file-drop handling. The data attribute exposes the callback's state to CSS, and
// the depth counter keeps child-to-child drags from flickering inactive. Directory expansion
// and its errors live in file-drop. A drop that an inner target or a capture-phase handler
// already default-prevented counts as claimed: it resets the drag state but delivers nothing.
export const file_drop =
  (options: FileDropOptions): Attachment<HTMLElement> =>
  (node): (() => void) | undefined => {
    const {
      accept = ``,
      multiple = false,
      on_files,
      on_urls,
      queue = false,
      on_drag_active,
      on_error,
    } = options

    const previous_drag_active = node.getAttribute(`data-drag-active`)
    node.removeAttribute(`data-drag-active`)
    let drag_depth = 0
    let drag_active = false
    let drop_generation = 0
    let callback_controller: AbortController | undefined
    let queue_tail: Promise<void> = Promise.resolve()

    // items is an array-like DataTransferItemList, unlike the plain types array
    const carries_files = (data_transfer: DataTransfer): boolean =>
      data_transfer.types.includes(`Files`) ||
      data_transfer.files.length > 0 ||
      Array.from(data_transfer.items).some((item) => item.kind === `file`)
    const carries_drop = (data_transfer: DataTransfer): boolean =>
      carries_files(data_transfer) ||
      (on_urls !== undefined && data_transfer.types.includes(`text/uri-list`))
    // RFC 2483: one URI per line, `#` lines are comments
    const read_urls = (data_transfer: DataTransfer): string[] => {
      const urls = data_transfer
        .getData(`text/uri-list`)
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith(`#`))
      return multiple ? urls : urls.slice(0, 1)
    }
    const set_drag_active = (active: boolean, event?: DragEvent) => {
      if (active === drag_active) return
      drag_active = active
      node.toggleAttribute(`data-drag-active`, active)
      on_drag_active?.(active, event)
    }
    const reset_drag = (event?: DragEvent) => {
      drag_depth = 0
      set_drag_active(false, event)
    }
    const on_dragenter = (event: DragEvent) => {
      if (!event.dataTransfer || !carries_drop(event.dataTransfer)) return
      event.preventDefault()
      // counted even while disabled, so enabling mid-drag keeps the depth balanced
      drag_depth += 1
      if (!options.disabled) set_drag_active(true, event)
    }
    const on_dragover = (event: DragEvent) => {
      if (!event.dataTransfer || !carries_drop(event.dataTransfer)) return
      // an inner zone already accepted this drag: a disabled outer one must not veto it
      if (event.defaultPrevented && options.disabled) return
      // preventDefault alone leaves the browser guessing at the cursor, often `move`
      event.dataTransfer.dropEffect = options.disabled ? `none` : `copy`
      event.preventDefault()
    }
    const on_dragleave = (event: DragEvent) => {
      drag_depth = Math.max(0, drag_depth - 1)
      if (drag_depth === 0) set_drag_active(false, event)
    }
    // DataTransfer is only readable during dispatch: getData directly, entries before the
    // first await inside files_from_data_transfer, so this must start in the drop event
    const read_drop = async (data_transfer: DataTransfer) => {
      const urls =
        on_urls && !carries_files(data_transfer) ? read_urls(data_transfer) : []
      return {
        urls,
        dropped: urls.length ? [] : await files_from_data_transfer(data_transfer),
      }
    }
    // Teardown, and outside queue mode a newer drop, bumps drop_generation, silencing this
    // drop's late results
    const deliver = async (read: ReturnType<typeof read_drop>, generation: number) => {
      let controller: AbortController | undefined
      try {
        const { urls, dropped } = await read
        if (generation !== drop_generation) return
        const accepted = filter_accepted_files(dropped, accept, multiple)
        if (accepted.length === 0 && urls.length === 0) return
        callback_controller?.abort()
        // aborting can run consumer code that drops again or tears down
        if (generation !== drop_generation) return
        controller = new AbortController()
        callback_controller = controller
        try {
          if (on_urls && urls.length) await on_urls(urls, controller.signal)
          else await on_files(accepted, controller.signal)
        } finally {
          if (callback_controller === controller) callback_controller = undefined
        }
      } catch (error) {
        if (controller ? controller.signal.aborted : generation !== drop_generation)
          return
        // A consumer's handler failing must not itself become an unhandled rejection
        try {
          if (on_error) await on_error(error)
          else globalThis.reportError(error)
        } catch (reporting_error) {
          globalThis.reportError(reporting_error)
        }
      }
    }
    // Capture phase, so an inner drop target that stops propagation can't leave it active
    const on_drop_capture = (event: DragEvent) => reset_drag(event)
    const on_drop = (event: DragEvent) => {
      const { dataTransfer: data_transfer } = event
      if (event.defaultPrevented || options.disabled) return
      if (!data_transfer || !carries_drop(data_transfer)) return
      event.preventDefault()
      const read = read_drop(data_transfer)
      if (!queue) {
        void deliver(read, ++drop_generation)
        return
      }
      // its turn handles a failed read; until then it would count as unhandled
      read.catch(() => undefined)
      // deliver never rejects, so one failing drop can't stall the queue
      const generation = drop_generation
      queue_tail = queue_tail.then(() => deliver(read, generation))
    }
    const event_controller = new AbortController()
    const { signal } = event_controller
    node.addEventListener(`dragenter`, on_dragenter, { signal })
    node.addEventListener(`dragover`, on_dragover, { signal })
    node.addEventListener(`dragleave`, on_dragleave, { signal })
    node.addEventListener(`drop`, on_drop_capture, { signal, capture: true })
    node.addEventListener(`drop`, on_drop, { signal })
    globalThis.addEventListener(`dragend`, reset_drag, { signal })

    return () => {
      drop_generation += 1
      callback_controller?.abort()
      callback_controller = undefined
      event_controller.abort()
      reset_drag()
      if (previous_drag_active === null) node.removeAttribute(`data-drag-active`)
      else node.setAttribute(`data-drag-active`, previous_drag_active)
    }
  }
