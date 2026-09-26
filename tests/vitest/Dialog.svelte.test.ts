import { tick, type ComponentProps } from 'svelte'
import { describe, expect, test, vi } from 'vitest'
import { click, create_element, doc_query, render, pointer_event } from './index'
import TestDialog from './TestDialog.svelte'
import { focusable } from '$lib/dialog'

describe(`Dialog`, () => {
  type DialogProps = ComponentProps<typeof TestDialog>
  let unmount_dialog: () => Promise<void>
  const mount_dialog = (extra: Partial<DialogProps> = {}) => {
    const props = $state({ ...extra })
    unmount_dialog = render(TestDialog, props)
    return props
  }
  const item = (test_id: string) =>
    doc_query<HTMLButtonElement>(`[data-testid="${test_id}"]`)
  const trigger = () => item(`dialog-trigger`)
  const surface = () => document.querySelector<HTMLDialogElement>(`dialog.dialog`)
  // jsdom has no `closedby` light dismiss, so this doubles as the no-support fallback test
  const press_dialog_at = (dialog: HTMLDialogElement, client_x = 0, client_y = 0) => {
    dialog.getBoundingClientRect = () =>
      ({ top: 10, right: 110, bottom: 110, left: 10 }) as DOMRect
    dialog.dispatchEvent(pointer_event(`pointerdown`, client_x, client_y))
    dialog.dispatchEvent(pointer_event(`click`, client_x, client_y))
  }
  // Escape as the browser drives it: a cancelable cancel event, then close unless prevented
  const cancel_dialog = (dialog: HTMLDialogElement) => {
    const event = new Event(`cancel`, { cancelable: true })
    dialog.dispatchEvent(event)
    if (!event.defaultPrevented) dialog.close()
  }
  const dismiss = { pointer: press_dialog_at, escape: cancel_dialog }

  test(`trigger opens a native surface with header, footer, attributes and binding`, async () => {
    const show_modal = vi.spyOn(HTMLDialogElement.prototype, `showModal`)
    mount_dialog({
      id: `profile-dialog`,
      class: `consumer-class`,
      backdrop_dim: false,
      backdrop_blur: true,
    })
    expect(surface()).toBeNull()
    expect(trigger().getAttribute(`aria-expanded`)).toBe(`false`)
    expect(trigger().getAttribute(`aria-controls`)).toBeNull()

    await click(trigger())

    const dialog = doc_query<HTMLDialogElement>(`dialog.dialog`)
    expect(show_modal).toHaveBeenCalledOnce()
    expect(dialog.open).toBe(true)
    expect(dialog.id).toBe(`profile-dialog`)
    expect(dialog.id).toBe(trigger().getAttribute(`aria-controls`))
    expect(dialog.getAttribute(`closedby`)).toBe(`any`)
    expect(dialog.getAttribute(`aria-labelledby`)).toBe(`test-dialog-title`)
    expect(dialog.classList.contains(`consumer-class`)).toBe(true)
    expect(dialog.hasAttribute(`data-backdrop-dim`)).toBe(false)
    expect(dialog.hasAttribute(`data-backdrop-blur`)).toBe(true)
    expect(trigger().getAttribute(`aria-expanded`)).toBe(`true`)
    expect(item(`dialog-footer`).textContent).toBe(`Changes are local`)
    expect(item(`bound-surface`).textContent).toBe(dialog.id)
  })

  test.each([
    [`any`, `escape`],
    [`any`, `pointer`],
    [`closerequest`, `escape`],
  ] as const)(
    `closedby=%s closes on %s with its reason and restores focus`,
    async (closedby, via) => {
      const on_close = vi.fn()
      mount_dialog({ closedby, on_close })
      trigger().focus()
      await click(trigger())

      const dialog = doc_query<HTMLDialogElement>(`dialog.dialog`)
      press_dialog_at(dialog, 50, 50) // a press inside the box never dismisses
      await tick()
      expect(surface()).toBe(dialog)
      dismiss[via](dialog)
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

  test(`snippet, native and controlled closes each report once`, async () => {
    const on_close = vi.fn()
    const onclose = vi.fn()
    const props = mount_dialog({ open: false, on_close, onclose })
    const reopen = async () => {
      props.open = true
      await tick()
    }
    trigger().focus()
    await reopen()

    await click(item(`dialog-action`))
    expect([props.open, surface(), on_close.mock.calls]).toEqual([
      false,
      null,
      [[{ via: `close` }]],
    ])

    await reopen()
    doc_query<HTMLDialogElement>(`dialog.dialog`).close()
    await tick()
    expect([props.open, surface()]).toEqual([false, null])
    expect(on_close).toHaveBeenCalledTimes(2)
    expect(on_close).toHaveBeenLastCalledWith({ via: `close` })

    // a controlled close is the consumer's own: it still forwards the native close event
    await reopen()
    props.open = false
    await tick()
    expect(surface()).toBeNull()
    expect([on_close.mock.calls.length, onclose.mock.calls.length]).toEqual([2, 3])
    expect(document.activeElement).toBe(trigger())
  })

  test(`a stale native close cannot close a rapidly reopened dialog`, async () => {
    const props = mount_dialog({ open: true })
    await tick()
    const old_surface = doc_query<HTMLDialogElement>(`dialog.dialog`)

    props.open = false
    await tick()
    props.open = true
    await tick()
    expect(surface()).not.toBe(old_surface)
    old_surface.dispatchEvent(new Event(`close`))
    expect(props.open).toBe(true)
  })

  test.each([
    [`closedby=none`, { closedby: `none` }, `pointer`],
    [`closedby=none`, { closedby: `none` }, `escape`],
    [`closedby=closerequest`, { closedby: `closerequest` }, `pointer`],
    [
      `a preventing oncancel`,
      { oncancel: (event: Event) => event.preventDefault() },
      `escape`,
    ],
  ] as const)(`%s ignores %s dismissal`, async (_label, extra, via) => {
    const on_close = vi.fn()
    mount_dialog({ ...extra, open: true, on_close })
    await tick()

    dismiss[via](doc_query<HTMLDialogElement>(`dialog.dialog`))
    await tick()
    expect(surface()?.open).toBe(true)
    // the ignored dismissal must not leave its reason behind for the next close
    await click(item(`dialog-action`))
    expect(on_close).toHaveBeenCalledExactlyOnceWith({ via: `close` })
  })

  test(`nested dialogs stack, close independently, and restore each opener`, async () => {
    const on_close = vi.fn()
    const on_nested_close = vi.fn()
    mount_dialog({ nested: true, on_close, on_nested_close })
    trigger().focus()
    await click(trigger())

    const nested_trigger = item(`nested-trigger`)
    nested_trigger.focus()
    await click(nested_trigger)

    const dialogs = [...document.querySelectorAll<HTMLDialogElement>(`dialog.dialog`)]
    expect(dialogs).toHaveLength(2)
    expect(dialogs.every(({ open }) => open)).toBe(true)
    expect(dialogs[0].contains(dialogs[1])).toBe(true)

    cancel_dialog(dialogs[1])
    await tick()
    expect(document.querySelectorAll(`dialog.dialog`)).toHaveLength(1)
    expect(dialogs[0].open).toBe(true)
    expect(document.activeElement).toBe(nested_trigger)
    expect(on_nested_close).toHaveBeenCalledExactlyOnceWith({ via: `escape` })
    expect(on_close).not.toHaveBeenCalled()

    cancel_dialog(dialogs[0])
    await tick()
    expect(surface()).toBeNull()
    expect(document.activeElement).toBe(trigger())
    expect(on_close).toHaveBeenCalledExactlyOnceWith({ via: `escape` })
  })

  test(`Sheet forwards Dialog bindings, attributes, snippets, and controls`, async () => {
    const props = mount_dialog({
      open: false,
      sheet: true,
      class: `consumer-class`,
      closedby: `none`,
      side: `left`,
    })
    await click(trigger())

    const dialog = doc_query<HTMLDialogElement>(`dialog.sheet`)
    expect(dialog.classList.contains(`consumer-class`)).toBe(true)
    expect([dialog.getAttribute(`closedby`), dialog.dataset.side]).toEqual([
      `none`,
      `left`,
    ])
    expect(dialog.getAttribute(`aria-labelledby`)).toBe(`test-dialog-title`)
    expect(item(`dialog-footer`).textContent).toBe(`Changes are local`)

    await click(item(`dialog-action`))
    expect([props.open, document.querySelector(`dialog.sheet`)]).toEqual([false, null])
  })

  test(`unmounting an open dialog restores focus without reporting a close`, async () => {
    const on_close = vi.fn()
    const focus_origin = create_element(`button`)
    focus_origin.focus()
    mount_dialog({ open: true, on_close })
    await tick()
    expect(doc_query<HTMLDialogElement>(`dialog.dialog`).open).toBe(true)

    await unmount_dialog()
    expect(surface()).toBeNull()
    expect(on_close).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(focus_origin)
  })
})

test.each([
  [`an HTML element`, () => document.createElement(`button`), true],
  [
    `an SVG element`,
    () => document.createElementNS(`http://www.w3.org/2000/svg`, `circle`),
    true,
  ],
  [`a text node`, () => document.createTextNode(`x`), false],
  [`null`, () => null, false],
])(`focusable returns %s only when it can take focus`, (_desc, make, can_focus) => {
  const target = make()
  expect(focusable(target)).toBe(can_focus ? target : null)
})
