import { dismiss_on_outside_press } from '$lib/attachments'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { create_element, escape_key } from '../index'

describe(`dismiss_on_outside_press`, () => {
  const cleanups: (() => void)[] = []
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

  const press = (target: Element) =>
    target.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))

  const listen = (options: Parameters<typeof dismiss_on_outside_press>[0] = {}) => {
    const callback = vi.fn()
    const cleanup = dismiss_on_outside_press({ callback, ...options })
    cleanups.push(cleanup)
    return { callback, cleanup }
  }

  // One listener over several disjoint menus in a panel, which is exactly what the
  // attachment cannot express: a wrapper around them all would count every press
  // between them as inside.
  it(`without a node, inside alone decides membership`, () => {
    const panel = create_element()
    const [menu_a, menu_b] = [create_element(), create_element()]
    const panel_filler = create_element()
    for (const menu of [menu_a, menu_b]) menu.className = `header-menu-root`
    panel.append(menu_a, panel_filler, menu_b)

    // dismiss does not bubble, so this negative assertion requires capture.
    const document_listener = vi.fn()
    document.addEventListener(`dismiss`, document_listener, true)
    cleanups.push(() => document.removeEventListener(`dismiss`, document_listener, true))
    const { callback } = listen({ inside: [`.header-menu-root`] })

    press(menu_a)
    press(menu_b)
    expect(callback).not.toHaveBeenCalled()

    // between the two menus but still inside the panel: an attached surface would
    // have to count this as inside, a node-less listener must not
    press(panel_filler)
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toMatchObject({ via: `pointer` })
    expect(document_listener).not.toHaveBeenCalled()
  })

  it(`escape reports focus_inside from the inside selectors alone`, () => {
    const menu = create_element()
    menu.className = `header-menu-root`
    const focusable = document.createElement(`button`)
    menu.append(focusable)
    focusable.focus()

    const { callback } = listen({ inside: [`.header-menu-root`], escape: true })
    document.dispatchEvent(escape_key())

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][0]).toMatchObject({ focus_inside: true, via: `escape` })
  })

  it(`disabled registers no listener and returns a callable cleanup`, () => {
    const { callback, cleanup } = listen({ enabled: false })

    press(create_element())
    expect(callback).not.toHaveBeenCalled()
    expect(() => cleanup()).not.toThrow()
  })
})
