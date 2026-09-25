import { StatusMessage } from '$lib'
import { flushSync } from 'svelte'
import { expect, test } from 'vitest'
import { doc_query, render } from './index'

test.each([
  { type: `success`, role: `status`, aria_live: `polite` },
  { type: `info`, role: `status`, aria_live: `polite` },
  { type: `error`, role: `alert`, aria_live: `assertive` },
  { type: `warning`, role: `status`, aria_live: `polite` },
] as const)(
  `renders $type message with role=$role aria-live=$aria_live and forwarded attributes`,
  ({ type, role, aria_live }) => {
    render(StatusMessage, {
      message: `Test message`,
      type,
      id: `custom-id`,
      class: `caller-class`,
      style: `margin-top: 20px`,
    })
    const message_div = doc_query(`.status-message.${type}.caller-class`)
    expect(message_div.textContent?.trim()).toBe(`Test message`)
    expect(message_div.getAttribute(`role`)).toBe(role)
    expect(message_div.getAttribute(`aria-live`)).toBe(aria_live)
    expect(message_div.id).toBe(`custom-id`)
    expect(message_div.style.marginTop).toBe(`20px`)
    expect(message_div.querySelector(`button`)).toBeNull()
  },
)

test(`dismissible button clears the bound message`, () => {
  let message = $state<string | undefined>(`Test message`)
  render(StatusMessage, {
    get message() {
      return message
    },
    set message(new_message) {
      message = new_message
    },
    dismissible: true,
    dismiss_label: `Close status`,
  })
  const button = doc_query(`.status-message button[aria-label="Close status"]`)
  expect(button.textContent?.trim()).toBe(`✕`)
  expect(button.getAttribute(`type`)).toBe(`button`)
  const current_message = () => message
  button.click()
  flushSync()
  expect(current_message()).toBeUndefined()
  expect(document.querySelector(`.status-message`)).toBeNull()
})

test(`follows message updates and defaults the dismiss label`, () => {
  const props = $state({ message: `Saving`, dismissible: true })
  render(StatusMessage, props)
  const message_div = doc_query(`.status-message`)
  expect(message_div.querySelector(`button`)?.getAttribute(`aria-label`)).toBe(
    `Dismiss message`,
  )
  props.message = `Saved`
  flushSync()
  expect(message_div.textContent).toContain(`Saved`)
  props.message = ``
  flushSync()
  expect(document.querySelector(`.status-message`)).toBeNull()
})
