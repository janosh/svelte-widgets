import { StatusMessage } from '#lib'
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
    const region = message_div.parentElement
    expect(region?.getAttribute(`role`)).toBe(role)
    expect(region?.getAttribute(`aria-live`)).toBe(aria_live)
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
})

// Screen readers only reliably announce content changes inside a live region that was
// already in the DOM, so both regions are mounted before any message and never re-created
test(`live regions exist before the first message and persist across changes`, () => {
  const props = $state<ComponentProps<typeof StatusMessage>>({ message: undefined })
  render(StatusMessage, props)
  const regions = () => [...document.querySelectorAll(`[aria-live]`)]
  const initial = regions()
  expect(initial.map((region) => region.getAttribute(`role`))).toEqual([
    `status`,
    `alert`,
  ])
  expect(initial.map((region) => region.textContent?.trim())).toEqual([``, ``])
  // boxless, so the empty regions don't take a flex/grid gap in their parent
  expect(initial.map((region) => getComputedStyle(region).display)).toEqual([
    `contents`,
    `contents`,
  ])
  for (const [message, type, text_by_region] of [
    [`Saving`, `info`, [`Saving`, ``]],
    [`Saved`, `success`, [`Saved`, ``]],
    [`Failed`, `error`, [``, `Failed`]],
    [``, `info`, [``, ``]], // an empty message hides it too
    [`Back`, `warning`, [`Back`, ``]],
    [undefined, `error`, [``, ``]],
  ] as const) {
    Object.assign(props, { message, type })
    flushSync()
    expect(regions().every((region, idx) => region === initial[idx])).toBe(true)
    expect(initial.map((region) => region.textContent?.trim())).toEqual(text_by_region)
  }
})
