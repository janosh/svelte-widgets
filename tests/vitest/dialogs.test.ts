import type { DialogChoice } from '$lib/dialogs.svelte'
import {
  answer_dialog,
  ask_confirm,
  ask_prompt,
  dialog_queue,
  dismiss_all_dialogs,
  dismiss_dialog,
  request_choice,
  submit_prompt,
} from '$lib/dialogs.svelte'
import { afterEach, expect, test } from 'vite-plus/test'
import { track } from './index'

afterEach(dismiss_all_dialogs)

// An answer can take several microtask hops to reach track (`ask_confirm` awaits
// `request_choice` before mapping the id to a boolean). A macrotask drains them all.
const flush = () => new Promise((resolve) => void setTimeout(resolve, 0))

const yes_no: DialogChoice<`yes` | `no`>[] = [
  { id: `no`, label: `No` },
  { id: `yes`, label: `Yes`, tone: `accent` },
]

test(`request_choice queues a request and resolves it with the answer`, async () => {
  const answer = track(request_choice(`Overwrite?`, `Confirm`, yes_no, `no`))

  expect(dialog_queue).toHaveLength(1)
  expect(dialog_queue[0]).toMatchObject({
    kind: `choice`,
    title: `Confirm`,
    body: { kind: `text`, text: `Overwrite?` },
    dismiss_id: `no`,
    choices: yes_no,
  })
  await flush()
  expect(answer.settled).toBe(false) // nothing resolves until someone answers

  expect(() => answer_dialog(`maybe`)).toThrow(`Unknown dialog answer "maybe"`)
  expect(dialog_queue).toHaveLength(1)
  answer_dialog(`yes`)
  await flush()
  expect([answer.settled, answer.value]).toEqual([true, `yes`])
  expect(dialog_queue).toHaveLength(0)
})

// The whole point of the queue: one answer belongs to exactly one question.
test(`a single answer resolves only the request it was given for`, async () => {
  const first = track(request_choice(`First?`, `One`, yes_no, `no`))
  const second = track(request_choice(`Second?`, `Two`, yes_no, `no`))
  expect(dialog_queue.map((request) => request.title)).toEqual([`One`, `Two`])

  answer_dialog(`yes`)
  await flush()
  expect([first.settled, first.value]).toEqual([true, `yes`])
  expect(second.settled).toBe(false)
  expect(dialog_queue.map((request) => request.title)).toEqual([`Two`])

  answer_dialog(`no`)
  await flush()
  expect([second.settled, second.value]).toEqual([true, `no`])
})

test(`answering an empty queue resolves nothing and does not throw`, async () => {
  expect(() => answer_dialog(`yes`)).not.toThrow()

  // a stray answer must not be spent on the request that arrives next
  const answer = track(request_choice(`Late?`, `Late`, yes_no, `no`))
  await flush()
  expect(answer.settled).toBe(false)
  expect(dialog_queue).toHaveLength(1)
})

test(`dismiss_all_dialogs settles every request with its own dismiss id`, async () => {
  const first = track(request_choice(`First?`, `One`, yes_no, `no`))
  const second = track(request_choice(`Second?`, `Two`, yes_no, `yes`))
  const prompt = track(ask_prompt(`Name?`, `Profile`))

  dismiss_all_dialogs()
  await flush()
  expect([first.settled, first.value]).toEqual([true, `no`])
  expect([second.settled, second.value]).toEqual([true, `yes`])
  expect([prompt.settled, prompt.value]).toEqual([true, null])
  expect(dialog_queue).toHaveLength(0)
})

test.each([
  [`ok`, true],
  [`cancel`, false],
] as const)(`ask_confirm maps %s to %s`, async (answer_id, expected) => {
  const confirmed = track(ask_confirm(`Delete it?`, `Careful`, `Delete`))
  await flush()

  const request = dialog_queue[0]
  if (request?.kind !== `choice`) throw new Error(`Expected a choice request`)
  expect(request.dismiss_id).toBe(`cancel`) // Escape must never mean yes
  expect(request.choices).toEqual([
    { id: `cancel`, label: `Cancel` },
    { id: `ok`, label: `Delete`, tone: `accent` },
  ])

  answer_dialog(answer_id)
  await flush()
  expect([confirmed.settled, confirmed.value]).toEqual([true, expected])
})

// ask_prompt has always exposed cancel_label; ask_confirm baked it in, so a translated
// confirm dialog was stuck with an English left button.
test(`ask_confirm takes a cancel label too`, async () => {
  track(ask_confirm(`Löschen?`, `Achtung`, `Löschen`, `Abbrechen`))
  await flush()

  const request = dialog_queue[0]
  if (request?.kind !== `choice`) throw new Error(`Expected a choice request`)
  expect(request.choices.map((choice) => choice.label)).toEqual([`Abbrechen`, `Löschen`])
})

test(`ask_prompt validates before resolving and keeps its typed options`, async () => {
  const prompted = track(
    ask_prompt(`Choose a project name`, `New project`, {
      initial_value: `draft`,
      placeholder: `my-project`,
      input_label: `Project name`,
      confirm_label: `Create`,
      cancel_label: `Never mind`,
      validate: (value) => (value.trim() ? undefined : `A name is required`),
    }),
  )

  const request = dialog_queue[0]
  if (request?.kind !== `prompt`) throw new Error(`Expected a prompt request`)
  expect(request).toMatchObject({
    body: { kind: `text`, text: `Choose a project name` },
    initial_value: `draft`,
    placeholder: `my-project`,
    input_label: `Project name`,
    confirm_label: `Create`,
    cancel_label: `Never mind`,
  })

  expect(submit_prompt(`   `)).toEqual({
    status: `invalid`,
    message: `A name is required`,
  })
  await flush()
  expect(prompted.settled).toBe(false)
  expect(dialog_queue[0]).toBe(request)

  expect(submit_prompt(`widgets`)).toEqual({ status: `submitted` })
  await flush()
  expect([prompted.settled, prompted.value]).toEqual([true, `widgets`])
  expect(dialog_queue).toHaveLength(0)
  expect(submit_prompt(`late`)).toEqual({ status: `no_prompt` })
})

test(`an empty validation message accepts and submits the prompt`, async () => {
  const prompted = track(
    ask_prompt(`Optional validation`, `Prompt`, { validate: () => `` }),
  )

  expect(submit_prompt(`accepted`)).toEqual({ status: `submitted` })
  await flush()
  expect([prompted.settled, prompted.value]).toEqual([true, `accepted`])
})

test(`prompt dismissal returns null without consuming a following choice`, async () => {
  const prompt = track(ask_prompt(`Name?`, `Profile`))
  const choice = track(request_choice(`Continue?`, `Next`, yes_no, `no`))

  dismiss_dialog()
  await flush()
  expect([prompt.settled, prompt.value]).toEqual([true, null])
  expect(choice.settled).toBe(false)
  expect(dialog_queue[0]?.kind).toBe(`choice`)

  answer_dialog(`yes`)
  await flush()
  expect([choice.settled, choice.value]).toEqual([true, `yes`])
})

test(`choice answers cannot accidentally submit the prompt at the queue head`, async () => {
  const prompt = track(ask_prompt(`Name?`, `Profile`))

  answer_dialog(`unexpected`)
  await flush()
  expect(prompt.settled).toBe(false)
  expect(dialog_queue[0]?.kind).toBe(`prompt`)
})
