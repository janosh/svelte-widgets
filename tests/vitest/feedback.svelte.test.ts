import { DragOverlay } from '#lib'
import { flushSync } from 'svelte'
import { expect, test } from 'vite-plus/test'
import { doc_query, render } from './index'

test(`DragOverlay renders only when visible, with its default/custom messages and forwarded style`, () => {
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
