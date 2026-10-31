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

// A press on the ::backdrop targets the dialog itself but lands outside its box
const is_backdrop_press = (
  dialog: HTMLDialogElement | null,
  event: MouseEvent,
): boolean => {
  if (!dialog || event.target !== dialog) return false
  const { top, right, bottom, left } = dialog.getBoundingClientRect()
  const { clientX: x, clientY: y } = event
  return x < left || x > right || y < top || y > bottom
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
      press_started = event.isPrimary && is_backdrop_press(get_dialog(), event)
    },
    onpointercancel: reset,
    onclick: (event: MouseEvent) => {
      const dismiss = press_started && is_backdrop_press(get_dialog(), event)
      reset()
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
