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
export type DialogProps = Omit<HTMLDialogAttributes, `children` | `closedby`> & {
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
