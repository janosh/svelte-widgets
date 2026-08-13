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
  close_on_backdrop?: boolean
  close_on_escape?: boolean
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

export const restore_dialog_focus = (
  surface: HTMLDialogElement | null,
  focus_origin: HTMLElement | SVGElement | null,
): void => {
  const active_element = document.activeElement
  if (surface?.contains(active_element) || active_element === document.body)
    focus_origin?.focus()
}
