import type { Snippet } from 'svelte'
import type { HTMLDialogAttributes } from 'svelte/elements'

export type DialogCloseVia = `pointer` | `escape` | `close`
export type DialogCloseDetail = { via: DialogCloseVia }
export type DialogControls = { close: () => void }
export type DialogTriggerProps = {
  onclick: () => void
  'aria-controls': string | undefined
  'aria-expanded': boolean
  'aria-haspopup': `dialog`
}
export type DialogProps = Omit<HTMLDialogAttributes, `children`> & {
  open?: boolean
  backdrop_dim?: boolean // default: true
  backdrop_blur?: boolean // default: false
  // `any` (default): backdrop or Escape; `closerequest`: Escape; `none`: explicit close.
  closedby?: `any` | `closerequest` | `none`
  surface?: HTMLDialogElement | null
  trigger?: Snippet<[DialogTriggerProps]>
  header?: Snippet<[DialogControls]>
  footer?: Snippet<[DialogControls]>
  children: Snippet<[DialogControls]>
  on_close?: (detail: DialogCloseDetail) => void
}

export const is_dialog_backdrop_event = (
  dialog: HTMLDialogElement | null,
  event: MouseEvent,
): boolean => {
  if (event.target !== dialog || !dialog) return false
  const { top, right, bottom, left } = dialog.getBoundingClientRect()
  return (
    event.clientX < left ||
    event.clientX > right ||
    event.clientY < top ||
    event.clientY > bottom
  )
}

// Light dismiss for browsers without `closedby` support: only a primary press that started
// and a release that ended on the ::backdrop count, so a text selection dragged out of the
// box never dismisses. Spread the handlers on the <dialog>; `on_dismiss` decides whether
// the dialog's closedby and open state still call for closing.
export const track_backdrop_dismiss = (
  get_dialog: () => HTMLDialogElement | null,
  on_dismiss: () => void,
) => {
  let press_started = false
  const reset = () => {
    press_started = false
  }
  return {
    get press_started() {
      return press_started
    },
    reset,
    onpointerdown: (event: PointerEvent) => {
      press_started = event.isPrimary && is_dialog_backdrop_event(get_dialog(), event)
    },
    onpointercancel: reset,
    onclick: (event: MouseEvent) => {
      const dismiss = press_started && is_dialog_backdrop_event(get_dialog(), event)
      press_started = false
      if (dismiss) on_dismiss()
    },
  }
}

export const restore_dialog_focus = (
  surface: HTMLDialogElement | null,
  focus_origin: HTMLElement | SVGElement | null,
): void => {
  const active_element = document.activeElement
  if (surface?.contains(active_element) || active_element === document.body)
    focus_origin?.focus()
}
