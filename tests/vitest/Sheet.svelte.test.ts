import type { ComponentProps } from 'svelte'
import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { create_element, doc_query, pointer_event } from './index'
import TestSheet from './TestSheet.svelte'

describe(`Sheet`, () => {
  type SheetProps = ComponentProps<typeof TestSheet>
  const mounted: Record<string, unknown>[] = []

  afterEach(async () => {
    await Promise.all(mounted.splice(0).map((app) => unmount(app)))
  })

  const mount_sheet = (extra: Partial<SheetProps> = {}) => {
    const props = $state({ ...extra })
    mounted.push(mount(TestSheet, { target: document.body, props }))
    return props
  }
  const unmount_sheet = async () => {
    const app = mounted.pop()
    if (!app) throw new Error(`Sheet test app was not mounted`)
    await unmount(app)
  }
  const trigger = () => doc_query<HTMLButtonElement>(`[data-testid="sheet-trigger"]`)
  const surface = () => document.querySelector<HTMLDialogElement>(`dialog.sheet`)
  const press_dialog_at = (dialog: HTMLDialogElement, client_x = 0, client_y = 0) => {
    dialog.getBoundingClientRect = () =>
      ({ top: 10, right: 110, bottom: 110, left: 10 }) as DOMRect
    dialog.dispatchEvent(pointer_event(`pointerdown`, client_x, client_y))
    dialog.dispatchEvent(pointer_event(`click`, client_x, client_y))
  }

  test(`trigger opens a native dialog`, async () => {
    const show_modal = vi.spyOn(HTMLDialogElement.prototype, `showModal`)
    mount_sheet({ id: `settings-sheet` })
    expect(surface()).toBeNull()
    expect(trigger().getAttribute(`aria-expanded`)).toBe(`false`)
    expect(trigger().getAttribute(`aria-controls`)).toBeNull()

    trigger().focus()
    trigger().click()
    await tick()

    const dialog = doc_query<HTMLDialogElement>(`dialog.sheet`)
    expect(show_modal).toHaveBeenCalledOnce()
    expect(dialog.closest(`[data-testid="sheet-home"]`)).not.toBeNull()
    expect(dialog.getAttribute(`aria-labelledby`)).toBe(`test-sheet-title`)
    expect(dialog.id).toBe(`settings-sheet`)
    expect(dialog.id).toBe(trigger().getAttribute(`aria-controls`))
    expect(trigger().getAttribute(`aria-expanded`)).toBe(`true`)
    expect(doc_query(`[data-testid="sheet-footer"]`).textContent).toBe(`Unsaved changes`)

    const closed_clone = dialog.cloneNode(true) as HTMLDialogElement
    closed_clone.removeAttribute(`open`)
    document.body.append(closed_clone)
    expect(getComputedStyle(closed_clone).display).toBe(`none`)
    closed_clone.remove()
  })

  test.each([`top`, `right`, `bottom`, `left`] as const)(
    `places the sheet on the %s`,
    async (side) => {
      mount_sheet({ open: true, side })
      await tick()
      expect(doc_query(`.sheet`).dataset.side).toBe(side)
    },
  )

  test.each([
    [`Escape`, `escape`],
    [`the backdrop`, `pointer`],
  ] as const)(
    `%s closes, restores focus once, and leaves later focus alone`,
    async (_label, via) => {
      const on_close = vi.fn()
      mount_sheet({ on_close })
      trigger().focus()
      trigger().click()
      await tick()

      const dialog = doc_query<HTMLDialogElement>(`dialog.sheet`)
      if (via === `pointer`) {
        press_dialog_at(dialog, 50, 50)
        expect(surface()).toBe(dialog)
        press_dialog_at(dialog)
      } else dialog.dispatchEvent(new Event(`cancel`, { cancelable: true }))
      await tick()

      expect(surface()).toBeNull()
      expect(on_close).toHaveBeenCalledWith({ via })
      expect(document.activeElement).toBe(trigger())
      expect(trigger().getAttribute(`aria-controls`)).toBeNull()

      const next_target = create_element(`button`)
      next_target.focus()
      await unmount_sheet()
      expect(document.activeElement).toBe(next_target)
    },
  )

  test(`snippet controls and native dialog.close sync open/on_close`, async () => {
    const on_close = vi.fn()
    const props = mount_sheet({ open: true, on_close })
    await tick()

    doc_query<HTMLButtonElement>(`[data-testid="sheet-action"]`).click()
    await tick()
    expect([props.open, surface(), on_close.mock.calls]).toEqual([
      false,
      null,
      [[{ via: `close` }]],
    ])

    props.open = true
    await tick()
    doc_query<HTMLDialogElement>(`dialog.sheet`).close()
    await tick()
    expect(props.open).toBe(false)
    expect(surface()).toBeNull()
    expect(on_close).toHaveBeenCalledTimes(2)
  })

  // open=false alone must still call dialog.close() before `{#if open}` unmounts
  test(`controlled open=false fires native onclose`, async () => {
    const onclose = vi.fn()
    const dialog_close = vi.spyOn(HTMLDialogElement.prototype, `close`)
    const props = mount_sheet({ open: true, onclose })
    await tick()

    props.open = false
    await tick()
    expect(dialog_close).toHaveBeenCalled()
    expect(onclose).toHaveBeenCalledOnce()
    expect(surface()).toBeNull()
  })

  test(`dismissal options can leave backdrop and Escape to the consumer`, async () => {
    mount_sheet({
      open: true,
      close_on_backdrop: false,
      close_on_escape: false,
    })
    await tick()

    const dialog = doc_query<HTMLDialogElement>(`dialog.sheet`)
    press_dialog_at(dialog)
    const cancel = new Event(`cancel`, { cancelable: true })
    dialog.dispatchEvent(cancel)
    await tick()

    expect(surface()).toBe(dialog)
    expect(dialog.open).toBe(true)
    expect(cancel.defaultPrevented).toBe(true)
  })

  test(`nested native dialogs stack and close independently`, async () => {
    mount_sheet({ open: true, nested: true })
    await tick()

    const dialogs = [...document.querySelectorAll<HTMLDialogElement>(`dialog.sheet`)]
    expect(dialogs).toHaveLength(2)
    expect(dialogs.every(({ open }) => open)).toBe(true)
    expect(dialogs[0].contains(dialogs[1])).toBe(true)

    dialogs[1].dispatchEvent(new Event(`cancel`, { cancelable: true }))
    await tick()
    expect(document.querySelectorAll(`dialog.sheet`)).toHaveLength(1)
    expect(dialogs[0].open).toBe(true)
  })

  test(`unmount removes an open native dialog without reporting a close`, async () => {
    const on_close = vi.fn()
    const focus_origin = create_element(`button`)
    focus_origin.focus()
    mount_sheet({ open: true, on_close })
    await tick()
    const dialog = doc_query<HTMLDialogElement>(`dialog.sheet`)
    expect(dialog.open).toBe(true)

    await unmount_sheet()
    await tick()

    expect(document.querySelector(`dialog.sheet`)).toBeNull()
    expect(on_close).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(focus_origin)
  })
})
