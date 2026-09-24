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
import { afterEach, expect, test } from 'vitest'
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
  // a stray answer to an empty queue must not be spent on the request that arrives next
  expect(() => answer_dialog(`yes`)).not.toThrow()
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
  [`ok`, true, [`Delete it?`, `Careful`, `Delete`]],
  [`cancel`, false, [`Delete it?`, `Careful`, `Delete`]],
  // A translated confirm dialog must not keep an English cancel button.
  [`cancel`, false, [`Löschen?`, `Achtung`, `Löschen`, `Abbrechen`]],
] as const)(
  `ask_confirm maps %s to %s with labels %j`,
  async (answer_id, expected, args) => {
    const [body, title, confirm_label, cancel_label] = args
    const confirmed = track(ask_confirm(body, title, confirm_label, cancel_label))
    await flush()

    expect(dialog_queue[0]).toMatchObject({
      dismiss_id: `cancel`, // Escape must never mean yes
      choices: [
        { id: `cancel`, label: cancel_label ?? `Cancel` },
        { id: `ok`, label: confirm_label, tone: `accent` },
      ],
    })

    answer_dialog(answer_id)
    await flush()
    expect([confirmed.settled, confirmed.value]).toEqual([true, expected])
  },
)

test(`ask_prompt validates before resolving and keeps its typed options`, async () => {
  const options = {
    initial_value: `draft`,
    placeholder: `my-project`,
    input_label: `Project name`,
    confirm_label: `Create`,
    cancel_label: `Never mind`,
  }
  const prompted = track(
    ask_prompt(`Choose a project name`, `New project`, {
      ...options,
      validate: (value) => (value.trim() ? undefined : `A name is required`),
    }),
  )
  const request = dialog_queue[0]
  expect(request).toMatchObject({
    kind: `prompt`,
    body: { kind: `text`, text: `Choose a project name` },
    ...options,
  })

  const message = `A name is required`
  expect(submit_prompt(`   `)).toEqual({ status: `invalid`, message })
  await flush()
  expect(prompted.settled).toBe(false)
  expect(dialog_queue[0]).toBe(request)

  expect(submit_prompt(`widgets`)).toEqual({ status: `submitted` })
  await flush()
  expect([prompted.settled, prompted.value]).toEqual([true, `widgets`])
  expect(dialog_queue).toHaveLength(0)
  expect(submit_prompt(`late`)).toEqual({ status: `no_prompt` })

  // an empty validation message counts as valid
  const optional = track(ask_prompt(`Optional`, `Prompt`, { validate: () => `` }))
  expect(submit_prompt(`accepted`)).toEqual({ status: `submitted` })
  await flush()
  expect([optional.settled, optional.value]).toEqual([true, `accepted`])
})

test(`prompts ignore choice answers and dismiss to null ahead of the next choice`, async () => {
  const prompt = track(ask_prompt(`Name?`, `Profile`))
  const choice = track(request_choice(`Continue?`, `Next`, yes_no, `no`))

  // a choice answer must not submit the prompt at the queue head
  answer_dialog(`unexpected`)
  await flush()
  expect(prompt.settled).toBe(false)
  expect(dialog_queue[0]?.kind).toBe(`prompt`)

  dismiss_dialog()
  await flush()
  expect([prompt.settled, prompt.value]).toEqual([true, null])
  expect(choice.settled).toBe(false)
  expect(dialog_queue[0]?.kind).toBe(`choice`)

  answer_dialog(`yes`)
  await flush()
  expect([choice.settled, choice.value]).toEqual([true, `yes`])
})
