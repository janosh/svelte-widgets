import { ClickFeedback, DragOverlay } from '$lib'
import { flushSync } from 'svelte'
import { describe, expect, test } from 'vitest'
import { doc_query, render } from './index'

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
