import { ClickFeedback, DragOverlay, Spinner, StatusMessage } from '$lib'
import { flushSync, mount } from 'svelte'
import { describe, expect, test } from 'vite-plus/test'
import { doc_query } from './index'

// Caller classes must preserve the component styling.
describe(`caller class does not replace a component's own class`, () => {
  test.each([
    [`Spinner`, Spinner, {}, `spinner`],
    [`StatusMessage`, StatusMessage, { message: `hi` }, `status-message`],
  ])(`%s`, (_name, Component, props, own_class) => {
    document.body.innerHTML = ``
    mount(Component, {
      target: document.body,
      props: { ...props, class: `caller-class` },
    })
    const el = doc_query(`.${own_class}`)
    expect([...el.classList]).toEqual(expect.arrayContaining([own_class, `caller-class`]))
  })
})

describe(`DragOverlay`, () => {
  test(`renders only when visible, with its default/custom messages and forwarded style`, () => {
    mount(DragOverlay, { target: document.body, props: { visible: false } })
    expect(document.querySelector(`.drag-overlay`)).toBeNull()

    document.body.innerHTML = ``
    mount(DragOverlay, { target: document.body, props: { visible: true } })
    expect(doc_query<HTMLDivElement>(`.drag-overlay`).textContent).toContain(
      `Drop file to load`,
    )

    document.body.innerHTML = ``
    mount(DragOverlay, {
      target: document.body,
      props: { visible: true, message: `Drop it`, style: `z-index: 1` },
    })
    const overlay = doc_query<HTMLDivElement>(`.drag-overlay`)
    expect(overlay.style.zIndex).toBe(`1`)
    expect(overlay.textContent).toContain(`Drop it`)
    expect(overlay.querySelector(`svg`)?.getAttribute(`aria-hidden`)).toBe(`true`)
  })
})

describe(`Spinner`, () => {
  test.each([
    [undefined, null],
    [`Processing...`, `Processing...`],
  ])(
    `text=%j renders a live status region with text %j and forwarded props`,
    (text, expected) => {
      mount(Spinner, {
        target: document.body,
        props: {
          text,
          id: `custom-id`,
          style: `--spinner-size: 60px; --spinner-color: red`,
        },
      })
      const container = doc_query(`.spinner[role="status"][aria-live="polite"]`)
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
    mount(StatusMessage, { target: document.body, props: { message } })
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
      mount(StatusMessage, {
        target: document.body,
        props: {
          message: `Test message`,
          type,
          id: `custom-id`,
          style: `margin-top: 20px`,
        },
      })
      const message_div = doc_query(`.status-message.${type}`)
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
    mount(StatusMessage, {
      target: document.body,
      props: {
        get message() {
          return message
        },
        set message(new_message) {
          message = new_message
        },
        dismissible: true,
        dismiss_label: `Close status`,
      },
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
  let visible = $state(false)
  let position = $state({ x: 12, y: 34 })
  mount(ClickFeedback, {
    target: document.body,
    props: {
      get visible() {
        return visible
      },
      get position() {
        return position
      },
    },
  })
  expect(document.querySelector('.click-feedback')).toBeNull()
  visible = true
  flushSync()
  const feedback = doc_query('.click-feedback')
  expect([
    feedback.style.left,
    feedback.style.top,
    feedback.getAttribute('aria-hidden'),
  ]).toEqual(['12px', '34px', 'true'])
  position = { x: 56, y: 78 }
  flushSync()
  const next = doc_query(`.click-feedback`)
  expect(next).not.toBe(feedback)
  expect([next.style.left, next.style.top]).toEqual(['56px', '78px'])
  position = { x: 56, y: 78 }
  flushSync()
  expect(doc_query(`.click-feedback`)).not.toBe(next)
  visible = false
  flushSync()
  expect(document.querySelector('.click-feedback')).toBeNull()
})
