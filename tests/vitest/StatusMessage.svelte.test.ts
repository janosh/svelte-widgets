import { StatusMessage } from '$lib'
import { flushSync, type ComponentProps } from 'svelte'
import { expect, test } from 'vite-plus/test'
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

test(`follows message and label updates, and dismissing clears the bound message`, () => {
  const props = $state<ComponentProps<typeof StatusMessage>>({
    message: `Saving`,
    dismissible: true,
  })
  render(StatusMessage, props)
  const button = doc_query(`.status-message button[aria-label="Dismiss message"]`)
  expect([button.textContent?.trim(), button.getAttribute(`type`)]).toEqual([
    `✕`,
    `button`,
  ])
  props.message = `Saved`
  props.dismiss_label = `Close status`
  flushSync()
  expect(doc_query(`.status-message`).textContent).toContain(`Saved`)
  expect(button.getAttribute(`aria-label`)).toBe(`Close status`)
  button.click()
  flushSync()
  expect(props.message).toBeUndefined()
  expect(document.querySelector(`.status-message`)).toBeNull()
  props.message = `Back`
  flushSync()
  expect(document.querySelector(`.status-message`)).not.toBeNull()
  props.message = `` // an empty message hides it too
  flushSync()
  expect(document.querySelector(`.status-message`)).toBeNull()
})
