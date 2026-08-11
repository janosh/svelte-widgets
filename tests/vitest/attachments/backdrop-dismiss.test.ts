import { backdrop_dismiss } from '$lib/attachments'
import { describe, expect, it, vi } from 'vite-plus/test'
import { create_element, mock_rect, pointer_event } from '../index'

describe(`backdrop_dismiss`, () => {
  it(`closes or invokes a callback only after a primary outside gesture`, () => {
    const dialog = create_element(`dialog`) as HTMLDialogElement
    mock_rect(dialog, { left: 10, top: 10, width: 100, height: 100 })
    const close = vi.spyOn(dialog, `close`).mockImplementation(() => undefined)
    const cleanup = backdrop_dismiss()(dialog)
    const dispatch = (
      type: `pointerdown` | `pointercancel` | `click`,
      client_x: number,
      client_y: number,
      init: PointerEventInit = {},
    ) => dialog.dispatchEvent(pointer_event(type, client_x, client_y, init))

    dispatch(`pointerdown`, 50, 50)
    dispatch(`click`, 5, 5)
    dispatch(`pointerdown`, 5, 5)
    dispatch(`click`, 50, 50)
    dispatch(`pointerdown`, 5, 5, { button: 2 })
    dispatch(`click`, 5, 5)
    dispatch(`pointerdown`, 5, 5, { isPrimary: false })
    dispatch(`click`, 5, 5)
    dispatch(`pointerdown`, 5, 5)
    dispatch(`pointercancel`, 5, 5)
    dispatch(`click`, 5, 5)
    expect(close).not.toHaveBeenCalled()

    dispatch(`pointerdown`, 5, 5)
    dispatch(`click`, 5, 5)
    expect(close).toHaveBeenCalledOnce()
    cleanup?.()
    close.mockClear()

    const callback = vi.fn()
    const callback_cleanup = backdrop_dismiss(callback)(dialog)
    dispatch(`pointerdown`, 5, 5)
    dispatch(`click`, 5, 5)

    expect(callback).toHaveBeenCalledOnce()
    expect(close).not.toHaveBeenCalled()
    callback_cleanup?.()
  })
})
