import type { ComponentProps } from 'svelte'
import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { doc_query } from './index'
import TestSheet from './TestSheet.svelte'

describe(`Sheet`, () => {
  const mounted: Record<string, unknown>[] = []

  afterEach(async () => {
    await Promise.all(mounted.splice(0).map((app) => unmount(app)))
  })

  const mount_sheet = (extra: Partial<ComponentProps<typeof TestSheet>> = {}) => {
    const props = $state({ ...extra })
    mounted.push(mount(TestSheet, { target: document.body, props }))
    return props
  }
  const trigger = () => doc_query<HTMLButtonElement>(`[data-testid="sheet-trigger"]`)

  test(`forwards Dialog bindings, attributes, snippets, and controls`, async () => {
    const on_close = vi.fn()
    const props = mount_sheet({
      open: false,
      id: `settings-sheet`,
      class: `consumer-class`,
      closedby: `none`,
      on_close,
    })

    trigger().click()
    await tick()

    const dialog = doc_query<HTMLDialogElement>(`dialog.sheet`)
    expect(dialog.classList.contains(`consumer-class`)).toBe(true)
    expect(dialog.getAttribute(`closedby`)).toBe(`none`)
    expect(dialog.getAttribute(`aria-labelledby`)).toBe(`test-sheet-title`)
    expect(dialog.id).toBe(`settings-sheet`)
    expect(dialog.id).toBe(trigger().getAttribute(`aria-controls`))
    expect(doc_query(`[data-testid="sheet-footer"]`).textContent).toBe(`Unsaved changes`)

    doc_query<HTMLButtonElement>(`[data-testid="sheet-action"]`).click()
    await tick()
    expect(props.open).toBe(false)
    expect(document.querySelector(`dialog.sheet`)).toBeNull()
    expect(on_close).toHaveBeenCalledWith({ via: `close` })
  })

  test.each([`top`, `right`, `bottom`, `left`] as const)(
    `places the sheet on the %s`,
    async (side) => {
      mount_sheet({ open: true, side })
      await tick()
      expect(doc_query(`.sheet`).dataset.side).toBe(side)
    },
  )
})
