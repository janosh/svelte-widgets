import ConfirmDialog from '$lib/ConfirmDialog.svelte'
import type { DialogChoice } from '$lib/dialogs.svelte'
import { ask_prompt, dialog_queue, request_choice } from '$lib/dialogs.svelte'
import { type ComponentProps, createRawSnippet, tick } from 'svelte'
import { render } from 'svelte/server'
import { afterEach, expect, test, vi } from 'vitest'
import {
  create_element,
  doc_query,
  render as mount_body,
  next_task,
  pointer_event,
  track,
} from './index'

// happy-dom implements <dialog> (showModal, .open, close, close event) but not Escape
// closing a modal nor a real ::backdrop, so those two are driven as the browser does:
// close() for Escape, a click targeting the dialog element itself for the backdrop

const hosts: (() => Promise<void>)[] = []
afterEach(() => {
  hosts.length = 0
  dialog_queue.length = 0
})

const flush = async () => {
  await tick()
  await next_task()
  await tick()
}

const write_choices: DialogChoice<`cancel` | `write`>[] = [
  { id: `cancel`, label: `Cancel` },
  { id: `write`, label: `Write`, tone: `accent` },
]

const mount_dialog = async (props: ComponentProps<typeof ConfirmDialog> = {}) => {
  hosts.push(mount_body(ConfirmDialog, props))
  await flush()
  return doc_query<HTMLDialogElement>(`dialog.confirm-dialog`)
}
const unmount_host = async (index = -1) => {
  const [unmount] = hosts.splice(index, 1)
  if (!unmount) throw new Error(`No mounted ConfirmDialog at index ${index}`)
  await unmount()
  await flush()
}
const buttons = () => [
  ...document.querySelectorAll<HTMLButtonElement>(`dialog.confirm-dialog button`),
]
const ask = (message: string, title: string) =>
  track(request_choice(message, title, write_choices, `cancel`))
const ask_write = () => ask(`Overwrite?`, `Write files`)
const ask_name = () => track(ask_prompt(`Name?`, `Profile`))

// happy-dom does no layout, so supply the dialog box before pressing its ::backdrop.
const press_backdrop = (dialog: HTMLDialogElement) => {
  dialog.getBoundingClientRect = () =>
    ({ left: 100, top: 100, right: 300, bottom: 200 }) as DOMRect
  dialog.dispatchEvent(pointer_event(`pointerdown`, 10, 10))
  dialog.dispatchEvent(pointer_event(`click`, 10, 10))
  dialog.close() // happy-dom does not implement native closedby="any" light dismissal
}
const submit_form = () =>
  doc_query<HTMLFormElement>(`dialog form`).dispatchEvent(
    new SubmitEvent(`submit`, { bubbles: true, cancelable: true }),
  )
const type_into = (input: HTMLInputElement, value: string) => {
  input.value = value
  input.dispatchEvent(new InputEvent(`input`, { bubbles: true }))
}
const heading = () => doc_query(`dialog h2`).textContent

test(`shows the queued question, closes once drained and ignores a stale close`, async () => {
  const dialog = await mount_dialog({ backdrop_dim: false, backdrop_blur: true })
  // defer the native close event so it can arrive after the next request is queued
  const close_dialog = vi
    .spyOn(dialog, `close`)
    .mockImplementation(() => dialog.removeAttribute(`open`))
  expect(dialog.open).toBe(false)
  expect(dialog.hasAttribute(`data-backdrop-dim`)).toBe(false)
  expect(dialog.hasAttribute(`data-backdrop-blur`)).toBe(true)
  expect(buttons()).toHaveLength(0)

  const answer = ask(`Overwrite src/lib?`, `Write files`)
  await flush()

  expect(dialog.open).toBe(true)
  expect(heading()).toBe(`Write files`)
  expect(doc_query(`dialog p`).textContent).toBe(`Overwrite src/lib?`)
  expect(buttons().map((btn) => btn.textContent?.trim())).toEqual([`Cancel`, `Write`])
  // tone marks the answer to reach for, the dismiss choice stays plain
  expect(buttons().map((btn) => btn.classList.contains(`accent`))).toEqual([false, true])

  buttons()[1].click()
  await flush()
  expect([answer.settled, answer.value]).toEqual([true, `write`])
  expect(close_dialog).toHaveBeenCalledOnce()
  expect(dialog.open).toBe(false)
  expect(buttons()).toHaveLength(0)

  const second = ask(`Second?`, `Second`)
  dialog.dispatchEvent(new Event(`close`))
  await flush()
  expect(second.settled).toBe(false)
  expect(dialog.open).toBe(true)
  expect(heading()).toBe(`Second`)
})

test(`renders a typed rich body snippet`, async () => {
  await mount_dialog()
  const body = createRawSnippet(() => ({
    render: () => `<strong data-testid="rich-body">Three files will be removed</strong>`,
  }))
  void request_choice(
    { kind: `snippet`, snippet: body },
    `Remove files`,
    write_choices,
    `cancel`,
  )
  await flush()

  expect(doc_query(`[data-testid="rich-body"]`).textContent).toBe(
    `Three files will be removed`,
  )
  expect(document.querySelector(`dialog .message`)).toBeNull()
})

test(`prompt validation stays open, reports the error, then resolves the value`, async () => {
  const oninput = vi.fn()
  const dialog = await mount_dialog({
    input_props: {
      class: `prompt-field`,
      style: `font-size: 1.1em`,
      maxlength: 12,
      placeholder: `host fallback`,
      'aria-describedby': `consumer-hint`,
      oninput,
    },
  })
  const answer = track(
    ask_prompt(`Name this workspace`, `New workspace`, {
      initial_value: `draft`,
      input_label: `Workspace name`,
      placeholder: `my-workspace`,
      confirm_label: `Create`,
      validate: (value) => (value.trim() ? undefined : `Enter a workspace name`),
    }),
  )
  await flush()

  const input = doc_query<HTMLInputElement>(`dialog input`)
  expect(dialog.open).toBe(true)
  expect(document.activeElement).toBe(input)
  expect([input.value, input.placeholder]).toEqual([`draft`, `my-workspace`])
  expect(input.classList.contains(`prompt-field`)).toBe(true)
  expect([input.type, input.style.fontSize, input.maxLength]).toEqual([
    `text`,
    `1.1em`,
    12,
  ])
  expect(input.getAttribute(`aria-describedby`)).toBe(`consumer-hint`)
  expect(doc_query(`dialog label span`).textContent).toBe(`Workspace name`)
  expect(buttons().map((btn) => btn.textContent?.trim())).toEqual([`Cancel`, `Create`])

  type_into(input, ` `)
  submit_form()
  await flush()
  expect(answer.settled).toBe(false)
  expect(dialog.open).toBe(true)
  const alert = doc_query(`[role="alert"]`)
  expect(alert.textContent?.trim()).toBe(`Enter a workspace name`)
  expect(input.getAttribute(`aria-invalid`)).toBe(`true`)
  expect(input.getAttribute(`aria-describedby`)).toBe(`consumer-hint ${alert.id}`)

  type_into(input, `widgets`)
  await tick()
  expect(document.querySelector(`[role="alert"]`)).toBeNull()
  expect(input.getAttribute(`aria-invalid`)).toBeNull()
  expect(input.getAttribute(`aria-describedby`)).toBe(`consumer-hint`)
  expect(oninput).toHaveBeenCalledTimes(2)
  submit_form()
  await flush()
  expect([answer.settled, answer.value]).toEqual([true, `widgets`])
  expect(dialog.open).toBe(false)
})

// why the queue exists: a double-click's second half would otherwise answer the prompt
// that replaced the first
test(`one click cannot answer two racing requests`, async () => {
  const dialog = await mount_dialog()
  const first = ask(`Delete node_modules?`, `First`)
  const second = ask(`Delete .git?`, `Second`)
  await flush()

  expect(heading()).toBe(`First`)
  const stale_write_button = buttons()[1]

  stale_write_button.click()
  await flush()
  expect([first.settled, first.value]).toEqual([true, `write`])
  expect(second.settled).toBe(false)
  expect(heading()).toBe(`Second`) // dialog stayed up

  // the second question reuses the same choice ids, so without {#key request} Svelte
  // keep these DOM nodes and the stale click would answer a question nobody read
  const fresh_write_button = buttons()[1]
  expect(fresh_write_button).not.toBe(stale_write_button)
  expect(stale_write_button.isConnected).toBe(false)

  stale_write_button.click() // second half of the double-click
  await flush()
  expect(second.settled).toBe(false)
  expect(dialog.open).toBe(true)

  fresh_write_button.click()
  await flush()
  expect([second.settled, second.value]).toEqual([true, `write`])
  expect(dialog.open).toBe(false)
})

// dismissing is not consent: both paths must answer dismiss_id, never the accented choice
const escape = (dialog: HTMLDialogElement) => dialog.close()
test.each([
  [`Escape on a choice`, escape, ask_write, `cancel`],
  [`a backdrop click on a choice`, press_backdrop, ask_write, `cancel`],
  [`Escape on a prompt`, escape, ask_name, null],
] as const)(
  `%s resolves with its dismiss value`,
  async (_desc, dismiss, ask_fn, expected) => {
    const dialog = await mount_dialog()
    const answer = ask_fn()
    await flush()

    dismiss(dialog)
    await flush()
    expect([answer.settled, answer.value]).toEqual([true, expected])
    expect(dialog.open).toBe(false)
  },
)

// answering removes the focused button, so without a hand-off the next question comes up
// with the keyboard on <body>, outside the trap
test(`focus enters each question and returns to the opener`, async () => {
  const trigger = create_element(`button`)
  const dialog = await mount_dialog()
  trigger.focus()

  ask(`First?`, `First`)
  await flush()
  expect(document.activeElement).toBe(buttons()[0])

  buttons()[0].click()
  await flush()
  expect(document.activeElement).toBe(trigger)

  ask(`Second?`, `Second`)
  await flush()
  const second_question_buttons = buttons()
  ask(`Third?`, `Third`)
  await flush()
  expect(document.activeElement).toBe(second_question_buttons[0])

  second_question_buttons[0].click()
  await flush()
  expect(document.activeElement).toBe(buttons()[0]) // moved on to the third question

  const elsewhere = create_element(`button`)
  elsewhere.focus()
  dialog.close()
  await flush()
  expect(document.activeElement).toBe(elsewhere)
})

test(`unmount safely dismisses every queued request`, async () => {
  await mount_dialog()
  const first = ask_write()
  const second = ask_name()
  await flush()

  const elsewhere = create_element(`button`)
  elsewhere.focus()
  await unmount_host()

  expect([first.settled, first.value]).toEqual([true, `cancel`])
  expect([second.settled, second.value]).toEqual([true, null])
  expect(dialog_queue).toHaveLength(0)
  expect(document.activeElement).toBe(elsewhere)
})

test(`only the last mounted host dismisses queued requests`, async () => {
  await mount_dialog()
  await mount_dialog()
  const answer = ask_write()
  await flush()

  await unmount_host(0)
  expect(answer.settled).toBe(false)
  expect(dialog_queue).toHaveLength(1)
  expect(doc_query<HTMLDialogElement>(`dialog.confirm-dialog`).open).toBe(true)

  await unmount_host()
  expect([answer.settled, answer.value]).toEqual([true, `cancel`])
})

test(`SSR rendering does not settle the shared browser queue`, async () => {
  const answer = ask_write()

  render(ConfirmDialog)
  await flush()

  expect(answer.settled).toBe(false)
  expect(dialog_queue).toHaveLength(1)
})
