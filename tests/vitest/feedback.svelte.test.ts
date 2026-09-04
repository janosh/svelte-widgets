import { ClickFeedback, DragOverlay, Spinner, StatusMessage } from '$lib'
import { flushSync, mount, unmount, type Component } from 'svelte'
import { describe, expect, onTestFinished, test } from 'vitest'
import { doc_query } from './index'

const render = <Props extends Record<string, unknown>>(
  component: Component<Props>,
  props: Props,
) => {
  const instance = mount(component, { target: document.body, props })
  onTestFinished(() => unmount(instance))
  flushSync()
}

describe(`DragOverlay`, () => {
  test(`renders only when visible, with its default/custom messages and forwarded style`, () => {
    const props = $state({
      visible: false,
      message: undefined as string | undefined,
      style: `z-index: 1`,
      class: `caller-class`,
    })
    render(DragOverlay, props)
    expect(document.querySelector(`.drag-overlay`)).toBeNull()

    props.visible = true
    flushSync()
    const overlay = doc_query(`.drag-overlay.caller-class`)
    expect(overlay.textContent).toContain(`Drop file to load`)

    props.message = `Drop it`
    flushSync()
    expect(overlay.style.zIndex).toBe(`1`)
    expect(overlay.textContent).toContain(`Drop it`)
    expect(overlay.querySelector(`svg`)?.getAttribute(`aria-hidden`)).toBe(`true`)
    props.visible = false
    flushSync()
    expect(document.querySelector(`.drag-overlay`)).toBeNull()
  })
})

describe(`Spinner`, () => {
  test.each([
    [undefined, null],
    [`Processing...`, `Processing...`],
  ])(
    `text=%j renders a live status region with text %j and forwarded props`,
    (text, expected) => {
      render(Spinner, {
        text,
        id: `custom-id`,
        class: `caller-class`,
        style: `--spinner-size: 60px; --spinner-color: red`,
      })
      const container = doc_query(
        `.spinner.caller-class[role="status"][aria-live="polite"]`,
      )
      expect(container.hasAttribute(`aria-busy`)).toBe(false)
      expect(container.getAttribute(`aria-label`)).toBe(text ? null : `Loading`)
      expect(container.id).toBe(`custom-id`)
      expect(container.style.getPropertyValue(`--spinner-size`)).toBe(`60px`)
      expect(container.style.getPropertyValue(`--spinner-color`)).toBe(`red`)
      // The decorative spinner is separate from the accessible status text.
      expect(container.children).toHaveLength(expected === null ? 1 : 2)
      expect(container.querySelector(`span`)?.textContent ?? null).toBe(expected)
    },
  )
})

describe(`StatusMessage`, () => {
  test.each([``, undefined])(`renders nothing when message is %j`, (message) => {
    render(StatusMessage, { message })
    expect(document.querySelector(`.status-message`)).toBeNull()
  })

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
})

test('ClickFeedback follows visibility and viewport position', () => {
  const props = $state({ visible: false, position: { x: 12, y: 34 } })
  render(ClickFeedback, props)
  expect(document.querySelector('.click-feedback')).toBeNull()
  props.visible = true
  flushSync()
  const feedback = doc_query('.click-feedback')
  expect([
    feedback.style.left,
    feedback.style.top,
    feedback.getAttribute('aria-hidden'),
  ]).toEqual(['12px', '34px', 'true'])
  props.position = { x: 56, y: 78 }
  flushSync()
  const next = doc_query(`.click-feedback`)
  expect(next).not.toBe(feedback)
  expect([next.style.left, next.style.top]).toEqual(['56px', '78px'])
  props.position = { x: 56, y: 78 }
  flushSync()
  expect(doc_query(`.click-feedback`)).not.toBe(next)
  props.visible = false
  flushSync()
  expect(document.querySelector('.click-feedback')).toBeNull()
})
