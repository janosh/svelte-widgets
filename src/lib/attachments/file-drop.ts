import type { Attachment } from 'svelte/attachments'
import { files_from_data_transfer, filter_accepted_files } from '../file-drop'

export interface FileDropOptions {
  accept?: string
  multiple?: boolean
  disabled?: boolean
  // Aborted by a newer accepted drop or when the attachment is recreated/destroyed.
  on_files: (files: File[], signal: AbortSignal) => unknown
  on_drag_active?: (active: boolean, event?: DragEvent) => void
  on_error?: (error: unknown) => unknown
}

// Headless file-drop handling. The data attribute gives CSS consumers the same state
// the callback receives, while the depth counter prevents child-to-child drags from
// flickering inactive. Directory expansion and its explicit errors live in file-drop.
export const file_drop =
  (options: FileDropOptions): Attachment<HTMLElement> =>
  (node): (() => void) | undefined => {
    const {
      accept = ``,
      multiple = false,
      disabled = false,
      on_files,
      on_drag_active,
      on_error,
    } = options

    const previous_drag_active = node.getAttribute(`data-drag-active`)
    node.removeAttribute(`data-drag-active`)
    let drag_depth = 0
    let drag_active = false
    let drop_generation = 0
    let callback_controller: AbortController | undefined

    // items is an array-like DataTransferItemList, unlike the plain types array
    const carries_files = (data_transfer: DataTransfer): boolean =>
      data_transfer.types.includes(`Files`) ||
      data_transfer.files.length > 0 ||
      Array.from(data_transfer.items).some((item) => item.kind === `file`)
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
      if (!event.dataTransfer || !carries_files(event.dataTransfer)) return
      event.preventDefault()
      if (disabled) return
      drag_depth += 1
      set_drag_active(true, event)
    }
    const on_dragover = (event: DragEvent) => {
      if (!event.dataTransfer || !carries_files(event.dataTransfer)) return
      // preventDefault alone leaves the browser guessing at the cursor, often `move`
      event.dataTransfer.dropEffect = disabled ? `none` : `copy`
      event.preventDefault()
    }
    const on_dragleave = (event: DragEvent) => {
      if (!drag_active) return
      drag_depth = Math.max(0, drag_depth - 1)
      if (drag_depth === 0) set_drag_active(false, event)
    }
    const on_drop = (event: DragEvent) => {
      const { dataTransfer: data_transfer } = event
      if (!data_transfer || !carries_files(data_transfer)) return
      event.preventDefault()
      reset_drag(event)
      if (disabled) return

      const generation = ++drop_generation
      let delivery_controller: AbortController | undefined
      void files_from_data_transfer(data_transfer)
        .then(async (dropped) => {
          if (generation !== drop_generation) return
          const accepted = filter_accepted_files(dropped, accept, multiple)
          if (accepted.length === 0) return
          callback_controller?.abort()
          if (generation !== drop_generation) return
          delivery_controller = new AbortController()
          callback_controller = delivery_controller
          await on_files(accepted, delivery_controller.signal)
          if (callback_controller === delivery_controller) callback_controller = undefined
        })
        .catch(async (error: unknown) => {
          if (callback_controller === delivery_controller) callback_controller = undefined
          if (delivery_controller?.signal.aborted) return
          if (!delivery_controller && generation !== drop_generation) return
          // A consumer's handler failing must not itself become an unhandled rejection
          try {
            if (on_error) await on_error(error)
            else globalThis.reportError(error)
          } catch (reporting_error) {
            globalThis.reportError(reporting_error)
          }
        })
    }
    const event_controller = new AbortController()
    const { signal } = event_controller
    node.addEventListener(`dragenter`, on_dragenter, { signal })
    node.addEventListener(`dragover`, on_dragover, { signal })
    node.addEventListener(`dragleave`, on_dragleave, { signal })
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
