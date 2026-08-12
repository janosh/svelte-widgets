import { mount, tick, unmount } from 'svelte'
import { expect, onTestFinished, test } from 'vite-plus/test'
import { doc_query } from './index'
import TestSheet from './TestSheet.svelte'

test(`Sheet forwards Dialog bindings, attributes, snippets, and controls`, async () => {
  const props = $state({
    open: false,
    class: `consumer-class`,
    closedby: `none`,
    side: `left`,
  })
  const app = mount(TestSheet, { target: document.body, props })
  onTestFinished(() => unmount(app))

  doc_query<HTMLButtonElement>(`[data-testid="sheet-trigger"]`).click()
  await tick()

  const dialog = doc_query<HTMLDialogElement>(`dialog.sheet`)
  expect(dialog.classList.contains(`consumer-class`)).toBe(true)
  expect(dialog.getAttribute(`closedby`)).toBe(`none`)
  expect(dialog.dataset.side).toBe(`left`)
  expect(dialog.getAttribute(`aria-labelledby`)).toBe(`test-sheet-title`)
  expect(doc_query(`[data-testid="sheet-footer"]`).textContent).toBe(`Unsaved changes`)

  doc_query<HTMLButtonElement>(`[data-testid="sheet-action"]`).click()
  await tick()
  expect([props.open, document.querySelector(`dialog.sheet`)]).toEqual([false, null])
})
