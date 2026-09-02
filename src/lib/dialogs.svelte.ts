// One in-app prompt for every question the app has to ask before proceeding. Mount a
// single ConfirmDialog high in the tree and any code below can ask without owning a
// modal of its own. Requests queue rather than overlap: two prompts racing in one modal
// would leave the second answered by a click meant for the first.

import type { Snippet } from 'svelte'
import { DIALOG_LABELS } from './labels'

export interface DialogChoice<Id extends string = string> {
  id: Id
  label: string
  // Set on the answer to reach for, so it reads as the default without being the one a
  // stray Escape picks.
  tone?: `accent` | `danger`
}

export type DialogBody =
  | { kind: `text`; text: string }
  | {
      kind: `snippet`
      // The declaring component retains ownership of the snippet's scope and must stay
      // mounted until this request settles. The queue stores only the callable reference.
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
  // Answer used when the dialog is dismissed rather than answered (Escape, a click on
  // the backdrop). Always the safe one: dismissing is not consent.
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
      // The queue is heterogeneous, so it holds the widened `string` form. Only a
      // choice's own id or `dismiss_id` ever comes back, and both are `Id`.
      resolve: (id: string) => resolve(id as Id),
    })
  })

// Resolves the request on screen. A no-op once the queue is empty, which is what keeps
// the dialog's own close from answering the next question.
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
  // Empty means valid: validators can directly return a conditional error string
  // without having to convert their empty success branch to `undefined`.
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
