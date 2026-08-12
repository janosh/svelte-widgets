import type { ComponentProps } from 'svelte'
import { mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { create_element, doc_query, pointer_event } from './index'
import TestDialog from './TestDialog.svelte'

describe(`Dialog`, () => {
  type DialogProps = ComponentProps<typeof TestDialog>
  const mounted: Record<string, unknown>[] = []

  afterEach(async () => {
    await Promise.all(mounted.splice(0).map((app) => unmount(app)))
  })

  const mount_dialog = (extra: Partial<DialogProps> = {}) => {
    const props = $state({ ...extra })
    mounted.push(mount(TestDialog, { target: document.body, props }))
    return props
  }
  const unmount_dialog = async () => {
    const app = mounted.pop()
    if (!app) throw new Error(`Dialog test app was not mounted`)
    await unmount(app)
  }
  const trigger = () => doc_query<HTMLButtonElement>(`[data-testid="dialog-trigger"]`)
  const surface = () => document.querySelector<HTMLDialogElement>(`dialog.dialog`)
  const press_dialog_at = (dialog: HTMLDialogElement, client_x = 0, client_y = 0) => {
    dialog.getBoundingClientRect = () =>
      ({ top: 10, right: 110, bottom: 110, left: 10 }) as DOMRect
    dialog.dispatchEvent(pointer_event(`pointerdown`, client_x, client_y))
    dialog.dispatchEvent(pointer_event(`click`, client_x, client_y))
  }

  test(`trigger opens a native surface with header, footer, attributes and binding`, async () => {
    const show_modal = vi.spyOn(HTMLDialogElement.prototype, `showModal`)
    mount_dialog({ id: `profile-dialog`, class: `consumer-class` })
    expect(surface()).toBeNull()
    expect(trigger().getAttribute(`aria-expanded`)).toBe(`false`)
    expect(trigger().getAttribute(`aria-controls`)).toBeNull()

    trigger().click()
    await tick()

    const dialog = doc_query<HTMLDialogElement>(`dialog.dialog`)
    expect(show_modal).toHaveBeenCalledOnce()
    expect(dialog.open).toBe(true)
    expect(dialog.id).toBe(`profile-dialog`)
    expect(dialog.id).toBe(trigger().getAttribute(`aria-controls`))
    expect(dialog.getAttribute(`closedby`)).toBe(`closerequest`)
    expect(dialog.getAttribute(`aria-labelledby`)).toBe(`test-dialog-title`)
    expect(dialog.classList.contains(`consumer-class`)).toBe(true)
    expect(trigger().getAttribute(`aria-expanded`)).toBe(`true`)
    expect(doc_query(`[data-testid="dialog-footer"]`).textContent).toBe(
      `Changes are local`,
    )
    expect(doc_query(`[data-testid="bound-surface"]`).textContent).toBe(dialog.id)
  })

  test.each([
    [`Escape`, `escape`],
    [`the backdrop`, `pointer`],
  ] as const)(
    `%s closes with its reason and restores focus without clobbering later focus`,
    async (_label, via) => {
      const on_close = vi.fn()
      mount_dialog({ on_close })
      trigger().focus()
      trigger().click()
      await tick()

      const dialog = doc_query<HTMLDialogElement>(`dialog.dialog`)
      if (via === `pointer`) {
        press_dialog_at(dialog, 50, 50)
        expect(surface()).toBe(dialog)
        press_dialog_at(dialog)
      } else dialog.dispatchEvent(new Event(`cancel`, { cancelable: true }))
      await tick()

      expect(surface()).toBeNull()
      expect(on_close).toHaveBeenCalledExactlyOnceWith({ via })
      expect(document.activeElement).toBe(trigger())
      expect(trigger().getAttribute(`aria-controls`)).toBeNull()

      const next_target = create_element(`button`)
      next_target.focus()
      await unmount_dialog()
      expect(document.activeElement).toBe(next_target)
    },
  )

  test(`snippet controls and native close report close exactly once`, async () => {
    const on_close = vi.fn()
    const props = mount_dialog({ open: true, on_close })
    await tick()

    doc_query<HTMLButtonElement>(`[data-testid="dialog-action"]`).click()
    await tick()
    expect([props.open, surface(), on_close.mock.calls]).toEqual([
      false,
      null,
      [[{ via: `close` }]],
    ])

    props.open = true
    await tick()
    doc_query<HTMLDialogElement>(`dialog.dialog`).close()
    await tick()
    expect(props.open).toBe(false)
    expect(surface()).toBeNull()
    expect(on_close).toHaveBeenCalledTimes(2)
    expect(on_close).toHaveBeenLastCalledWith({ via: `close` })
  })

  test(`consumer can prevent Escape dismissal`, async () => {
    const on_close = vi.fn()
    const oncancel = vi.fn((event: Event) => event.preventDefault())
    mount_dialog({ open: true, on_close, oncancel })
    await tick()

    const cancel = new Event(`cancel`, { cancelable: true })
    doc_query<HTMLDialogElement>(`dialog.dialog`).dispatchEvent(cancel)
    await tick()

    expect(cancel.defaultPrevented).toBe(true)
    expect(surface()?.open).toBe(true)
    expect(on_close).not.toHaveBeenCalled()
  })

  test(`controlled open=false forwards the native close event`, async () => {
    const onclose = vi.fn()
    const props = mount_dialog({ open: true, onclose })
    await tick()

    props.open = false
    await tick()

    expect(onclose).toHaveBeenCalledOnce()
    expect(surface()).toBeNull()
  })

  test(`dismissal policies can keep backdrop and Escape open`, async () => {
    const on_close = vi.fn()
    mount_dialog({
      open: true,
      close_on_backdrop: false,
      close_on_escape: false,
      on_close,
    })
    await tick()

    const dialog = doc_query<HTMLDialogElement>(`dialog.dialog`)
    press_dialog_at(dialog)
    const cancel = new Event(`cancel`, { cancelable: true })
    dialog.dispatchEvent(cancel)
    await tick()

    expect(surface()).toBe(dialog)
    expect(dialog.open).toBe(true)
    expect(cancel.defaultPrevented).toBe(true)
    expect(on_close).not.toHaveBeenCalled()
  })

  test(`nested dialogs stack, close independently, and restore each opener`, async () => {
    const on_close = vi.fn()
    const on_nested_close = vi.fn()
    mount_dialog({ nested: true, on_close, on_nested_close })
    trigger().focus()
    trigger().click()
    await tick()

    const nested_trigger = doc_query<HTMLButtonElement>(`[data-testid="nested-trigger"]`)
    nested_trigger.focus()
    nested_trigger.click()
    await tick()

    const dialogs = [...document.querySelectorAll<HTMLDialogElement>(`dialog.dialog`)]
    expect(dialogs).toHaveLength(2)
    expect(dialogs.every(({ open }) => open)).toBe(true)
    expect(dialogs[0].contains(dialogs[1])).toBe(true)

    dialogs[1].dispatchEvent(new Event(`cancel`, { cancelable: true }))
    await tick()
    expect(document.querySelectorAll(`dialog.dialog`)).toHaveLength(1)
    expect(dialogs[0].open).toBe(true)
    expect(document.activeElement).toBe(nested_trigger)
    expect(on_nested_close).toHaveBeenCalledExactlyOnceWith({ via: `escape` })
    expect(on_close).not.toHaveBeenCalled()

    dialogs[0].dispatchEvent(new Event(`cancel`, { cancelable: true }))
    await tick()
    expect(surface()).toBeNull()
    expect(document.activeElement).toBe(trigger())
    expect(on_close).toHaveBeenCalledExactlyOnceWith({ via: `escape` })
  })

  test(`unmounting an open dialog restores focus without reporting a close`, async () => {
    const on_close = vi.fn()
    const focus_origin = create_element(`button`)
    focus_origin.focus()
    mount_dialog({ open: true, on_close })
    await tick()
    expect(doc_query<HTMLDialogElement>(`dialog.dialog`).open).toBe(true)

    await unmount_dialog()
    await tick()

    expect(surface()).toBeNull()
    expect(on_close).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(focus_origin)
  })
})
