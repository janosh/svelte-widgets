// One in-app prompt for every question the app must ask before proceeding: mount a single
// ConfirmDialog high in the tree and any code below can ask without its own modal. Requests
// queue rather than overlap, else a click meant for one prompt answers the next.

import type { Snippet } from 'svelte'
import { DIALOG_LABELS } from './labels'

export interface DialogChoice<Id extends string = string> {
  id: Id
  label: string
  // marks the answer to reach for: reads as the default without being what Escape picks
  tone?: `accent` | `danger`
}

export type DialogBody =
  | { kind: `text`; text: string }
  | {
      kind: `snippet`
      // the queue stores only the callable, so the declaring component owns the snippet's
      // scope and must stay mounted until this request settles
      snippet: Snippet
    }

export type DialogBodyInput = string | DialogBody

interface DialogRequestBase {
  title: string
  body: DialogBody
}

export interface ChoiceDialogRequest extends DialogRequestBase {
  kind: `choice`
  choices: DialogChoice[]
  // answer for a dismissal (Escape, backdrop click); always the safe one, since dismissing
  // is not consent
  dismiss_id: string
  resolve: (id: string) => void
}

export type PromptValidator = (value: string) => string | undefined
export type PromptSubmitResult =
  | { status: `submitted` }
  | { status: `invalid`; message: string }
  | { status: `no_prompt` }

export interface PromptDialogRequest extends DialogRequestBase {
  kind: `prompt`
  initial_value: string
  placeholder: string
  input_label: string
  confirm_label: string
  cancel_label: string
  validate: PromptValidator | null
  resolve: (value: string | null) => void
}

export type DialogRequest = ChoiceDialogRequest | PromptDialogRequest

export interface PromptOptions {
  initial_value?: string
  placeholder?: string
  input_label?: string
  confirm_label?: string
  cancel_label?: string
  validate?: PromptValidator
}

const normalize_body = (body: DialogBodyInput): DialogBody =>
  typeof body === `string` ? { kind: `text`, text: body } : body

// Questions waiting for an answer, oldest first. Only the head is on screen.
export const dialog_queue = $state<DialogRequest[]>([])

export const request_choice = <Id extends string>(
  body: DialogBodyInput,
  title: string,
  choices: DialogChoice<Id>[],
  dismiss_id: Id,
): Promise<Id> =>
  new Promise<Id>((resolve) => {
    dialog_queue.push({
      kind: `choice`,
      title,
      body: normalize_body(body),
      choices,
      dismiss_id,
      // the heterogeneous queue holds the widened `string`; only a choice's id or
      // `dismiss_id` comes back, and both are `Id`
      resolve: (id: string) => resolve(id as Id),
    })
  })

// Resolves the on-screen request; a no-op on an empty queue, which keeps the dialog's own
// close from answering the next question.
export const answer_dialog = (id: string): void => {
  const request = dialog_queue[0]
  if (request?.kind !== `choice`) return
  if (!request.choices.some((choice) => choice.id === id))
    throw new Error(
      `Unknown dialog answer "${id}"; expected ${request.choices.map((choice) => choice.id).join(`, `)}`,
    )
  dialog_queue.shift()
  request.resolve(id)
}

export const submit_prompt = (value: string): PromptSubmitResult => {
  const request = dialog_queue[0]
  if (request?.kind !== `prompt`) return { status: `no_prompt` }
  const validation_error = request.validate?.(value)
  // empty counts as valid, so a validator can return a conditional error string directly
  if (validation_error) return { status: `invalid`, message: validation_error }
  dialog_queue.shift()
  request.resolve(value)
  return { status: `submitted` }
}

const dismiss_request = (request: DialogRequest | undefined): void => {
  if (!request) return
  if (request.kind === `choice`) request.resolve(request.dismiss_id)
  else request.resolve(null)
}

export const dismiss_dialog = (): void => dismiss_request(dialog_queue.shift())

// Safely settle queued callers when their dialog host is torn down.
export const dismiss_all_dialogs = (): void => {
  for (const request of dialog_queue.splice(0)) dismiss_request(request)
}

export const ask_confirm = async (
  body: DialogBodyInput,
  title: string,
  confirm_label = DIALOG_LABELS.confirm,
  cancel_label = DIALOG_LABELS.cancel,
): Promise<boolean> =>
  (await request_choice(
    body,
    title,
    [
      { id: `cancel`, label: cancel_label },
      { id: `ok`, label: confirm_label, tone: `accent` },
    ],
    `cancel`,
  )) === `ok`

export const ask_prompt = (
  body: DialogBodyInput,
  title: string,
  {
    initial_value = ``,
    placeholder = ``,
    input_label = DIALOG_LABELS.prompt_input,
    confirm_label = DIALOG_LABELS.confirm,
    cancel_label = DIALOG_LABELS.cancel,
    validate,
  }: PromptOptions = {},
): Promise<string | null> =>
  new Promise<string | null>((resolve) => {
    dialog_queue.push({
      kind: `prompt`,
      title,
      body: normalize_body(body),
      initial_value,
      placeholder,
      input_label,
      confirm_label,
      cancel_label,
      validate: validate ?? null,
      resolve,
    })
  })
