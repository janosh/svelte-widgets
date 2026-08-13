import ConfirmDialog from '$lib/ConfirmDialog.svelte'
import type { DialogChoice } from '$lib/dialogs.svelte'
import { ask_prompt, dialog_queue, request_choice } from '$lib/dialogs.svelte'
import { type ComponentProps, createRawSnippet, mount, tick, unmount } from 'svelte'
import { render } from 'svelte/server'
import { afterEach, expect, test, vi } from 'vite-plus/test'
import { create_element, doc_query, track } from './index'

// happy-dom implements <dialog>: showModal(), .open, close() and the close event all
// behave, so nothing about the dialog is stubbed here. What it does not implement is
// Escape closing a modal dialog or a real ::backdrop, so those paths are driven the way
// the browser drives them: Escape by close(), a backdrop press by a click whose target
// is the dialog element itself.

const mounted: Record<string, unknown>[] = []
afterEach(async () => {
  await Promise.all(mounted.splice(0).map((app) => unmount(app)))
  dialog_queue.length = 0
})

const flush = async () => {
  await tick()
  await new Promise((resolve) => void setTimeout(resolve, 0))
  await tick()
}

const write_choices: DialogChoice<`cancel` | `write`>[] = [
  { id: `cancel`, label: `Cancel` },
  { id: `write`, label: `Write`, tone: `accent` },
]

const mount_dialog = async (props: ComponentProps<typeof ConfirmDialog> = {}) => {
  mounted.push(mount(ConfirmDialog, { target: document.body, props }))
  await flush()
  return doc_query<HTMLDialogElement>(`dialog.confirm-dialog`)
}
const buttons = () => [
  ...document.querySelectorAll<HTMLButtonElement>(`dialog.confirm-dialog button`),
]
const ask = (message: string, title: string) =>
  track(request_choice(message, title, write_choices, `cancel`))

// happy-dom does no layout, so supply the dialog box before pressing its ::backdrop.
const press_backdrop = (dialog: HTMLDialogElement) => {
  const rect = { left: 100, top: 100, right: 300, bottom: 200, width: 200, height: 100 }
  dialog.getBoundingClientRect = () => rect as DOMRect
  const init = { bubbles: true, clientX: 10, clientY: 10 }
  dialog.dispatchEvent(new PointerEvent(`pointerdown`, { isPrimary: true, ...init }))
  dialog.dispatchEvent(new MouseEvent(`click`, init))
  dialog.close() // happy-dom does not implement native closedby="any" light dismissal
}

test(`shows the queued question and closes once the queue drains`, async () => {
  const dialog = await mount_dialog({ backdrop_dim: false, backdrop_blur: true })
  expect(dialog.open).toBe(false)
  expect(dialog.hasAttribute(`data-backdrop-dim`)).toBe(false)
  expect(dialog.hasAttribute(`data-backdrop-blur`)).toBe(true)
  expect(buttons()).toHaveLength(0)

  const answer = ask(`Overwrite src/lib?`, `Write files`)
  await flush()

  expect(dialog.open).toBe(true)
  expect(doc_query(`dialog h2`).textContent).toBe(`Write files`)
  expect(doc_query(`dialog p`).textContent).toBe(`Overwrite src/lib?`)
  expect(buttons().map((btn) => btn.textContent?.trim())).toEqual([`Cancel`, `Write`])
  // tone marks the answer to reach for, the dismiss choice stays plain
  expect(buttons().map((btn) => btn.classList.contains(`accent`))).toEqual([false, true])

  buttons()[1].click()
  await flush()
  expect([answer.settled, answer.value]).toEqual([true, `write`])
  expect(dialog.open).toBe(false)
  expect(buttons()).toHaveLength(0)
})

test(`a stale native close cannot dismiss a newly queued request`, async () => {
  const dialog = await mount_dialog()
  const close_dialog = vi
    .spyOn(dialog, `close`)
    .mockImplementation(() => dialog.removeAttribute(`open`))
  const first = ask(`First?`, `First`)
  await flush()
  buttons()[1].click()
  await flush()
  expect(first.settled).toBe(true)
  expect(close_dialog).toHaveBeenCalledOnce()

  const second = ask(`Second?`, `Second`)
  dialog.dispatchEvent(new Event(`close`))
  await flush()

  expect(second.settled).toBe(false)
  expect(dialog.open).toBe(true)
  expect(doc_query(`dialog h2`).textContent).toBe(`Second`)
})

test(`renders a typed rich body snippet`, async () => {
  const dialog = await mount_dialog()
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

  expect(dialog.open).toBe(true)
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
  expect(buttons().map((button) => button.textContent?.trim())).toEqual([
    `Cancel`,
    `Create`,
  ])

  input.value = ` `
  input.dispatchEvent(new InputEvent(`input`, { bubbles: true }))
  doc_query<HTMLFormElement>(`dialog form`).dispatchEvent(
    new SubmitEvent(`submit`, { bubbles: true, cancelable: true }),
  )
  await flush()
  expect(answer.settled).toBe(false)
  expect(dialog.open).toBe(true)
  const alert = doc_query(`[role="alert"]`)
  expect(alert.textContent?.trim()).toBe(`Enter a workspace name`)
  expect(input.getAttribute(`aria-invalid`)).toBe(`true`)
  expect(input.getAttribute(`aria-describedby`)).toBe(`consumer-hint ${alert.id}`)

  input.value = `widgets`
  input.dispatchEvent(new InputEvent(`input`, { bubbles: true }))
  await tick()
  expect(document.querySelector(`[role="alert"]`)).toBeNull()
  expect(input.getAttribute(`aria-invalid`)).toBeNull()
  expect(input.getAttribute(`aria-describedby`)).toBe(`consumer-hint`)
  expect(oninput).toHaveBeenCalledTimes(2)
  doc_query<HTMLFormElement>(`dialog form`).dispatchEvent(
    new SubmitEvent(`submit`, { bubbles: true, cancelable: true }),
  )
  await flush()
  expect([answer.settled, answer.value]).toEqual([true, `widgets`])
  expect(dialog.open).toBe(false)
})

test(`dismissing a prompt returns null`, async () => {
  const dialog = await mount_dialog()
  const answer = track(ask_prompt(`Name?`, `Profile`))
  await flush()

  dialog.close()
  await flush()
  expect([answer.settled, answer.value]).toEqual([true, null])
})

// The reason the queue exists. Two prompts racing in one modal would leave the second
// answered by a click meant for the first, and a double-click is how that happens.
test(`one click cannot answer two racing requests`, async () => {
  const dialog = await mount_dialog()
  const first = ask(`Delete node_modules?`, `First`)
  const second = ask(`Delete .git?`, `Second`)
  await flush()

  expect(doc_query(`dialog h2`).textContent).toBe(`First`)
  const stale_write_button = buttons()[1]

  stale_write_button.click()
  await flush()
  expect([first.settled, first.value]).toEqual([true, `write`])
  expect(second.settled).toBe(false)
  expect(doc_query(`dialog h2`).textContent).toBe(`Second`) // dialog stayed up

  // The second question offers the same choice ids, so without the {#key request} block
  // Svelte reuses these DOM nodes and the second half of a double-click lands on the
  // button that now answers a question nobody read.
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

// Dismissing is not consent: both paths have to answer with dismiss_id, never with the
// accented choice a stray key would otherwise reach.
test.each([
  [`Escape`, (dialog: HTMLDialogElement) => dialog.close()],
  [`a backdrop click`, press_backdrop],
])(`%s resolves with dismiss_id`, async (_desc, dismiss) => {
  const dialog = await mount_dialog()
  const answer = ask(`Overwrite?`, `Write files`)
  await flush()

  dismiss(dialog)
  await flush()

  expect([answer.settled, answer.value]).toEqual([true, `cancel`])
  expect(dialog.open).toBe(false)
})

// Answering removes the button that had focus. Without a hand-off the next question
// comes up with the keyboard on <body>, outside the trap.
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
  const first = ask(`Overwrite?`, `Write files`)
  const second = track(ask_prompt(`Name?`, `Profile`))
  await flush()

  const elsewhere = create_element(`button`)
  elsewhere.focus()
  const app = mounted.pop()
  if (!app) throw new Error(`ConfirmDialog test app was not mounted`)
  await unmount(app)
  await flush()

  expect([first.settled, first.value]).toEqual([true, `cancel`])
  expect([second.settled, second.value]).toEqual([true, null])
  expect(dialog_queue).toHaveLength(0)
  expect(document.activeElement).toBe(elsewhere)
})

test(`only the last mounted host dismisses queued requests`, async () => {
  const first_app = mount(ConfirmDialog, { target: document.body })
  const second_app = mount(ConfirmDialog, { target: document.body })
  mounted.push(first_app, second_app)
  const answer = ask(`Overwrite?`, `Write files`)
  await flush()

  await unmount(first_app)
  mounted.splice(mounted.indexOf(first_app), 1)
  await flush()
  expect(answer.settled).toBe(false)
  expect(dialog_queue).toHaveLength(1)
  expect(doc_query<HTMLDialogElement>(`dialog.confirm-dialog`).open).toBe(true)

  await unmount(second_app)
  mounted.splice(mounted.indexOf(second_app), 1)
  await flush()
  expect([answer.settled, answer.value]).toEqual([true, `cancel`])
})

test(`SSR rendering does not settle the shared browser queue`, async () => {
  const answer = ask(`Overwrite?`, `Write files`)

  render(ConfirmDialog)
  await flush()

  expect(answer.settled).toBe(false)
  expect(dialog_queue).toHaveLength(1)
})
