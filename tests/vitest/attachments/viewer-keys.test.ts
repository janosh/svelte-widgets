import { viewer_keydown, viewer_keys } from '#lib/attachments/index.ts'
import { describe, expect, onTestFinished, test, vi } from 'vite-plus/test'
import { create_element, press_key } from '../index'

const attach_root = (attachment: (node: HTMLElement) => () => void) => {
  const root = create_element()
  const button = document.createElement(`button`)
  const input = document.createElement(`input`)
  root.append(button, input)
  onTestFinished(attachment(root))
  onTestFinished(() => root.remove())
  return { root, button, input }
}
const hover = (node: Element) => node.dispatchEvent(new PointerEvent(`pointerenter`))

describe(`viewer_keys`, () => {
  test(`throws on an uppercase letter binding, which could never fire`, () => {
    expect(() =>
      attach_root(viewer_keys(() => ({ R: () => {}, Escape: () => {} }))),
    ).toThrow(`viewer_keys: bind letters lowercase, got R`)
  })
  // Keys reach the viewer under the pointer (window keydown) or with focus inside it
  test.each([
    [`hovered plain key`, `x`, {}, `hover`, true],
    [`focused plain key`, `x`, {}, `focus`, true],
    [`uppercase letter (Caps Lock)`, `X`, {}, `hover`, true],
    [`Shift+letter`, `X`, { shiftKey: true }, `hover`, false],
    [`Shift+letter under Caps Lock`, `x`, { shiftKey: true }, `hover`, false],
    [`non-letter key by event.key`, `Escape`, {}, `focus`, true],
    [`unhovered viewer`, `x`, {}, `none`, false],
    [`Ctrl chord`, `x`, { ctrlKey: true }, `hover`, false],
    [`autorepeat`, `x`, { repeat: true }, `hover`, false],
    [`IME composition`, `x`, { isComposing: true }, `focus`, false],
    [`unbound key`, `y`, {}, `hover`, false],
  ] as const)(`%s`, (_name, key, init, via, handled) => {
    const action = vi.fn()
    const { root, button } = attach_root(
      viewer_keys(() => ({ x: action, Escape: action })),
    )
    if (via === `hover`) hover(root)
    const event = press_key(via === `focus` ? button : globalThis, key, init)
    expect(action).toHaveBeenCalledTimes(handled ? 1 : 0)
    expect(event.defaultPrevented).toBe(handled)
  })

  test(`typing in a field is left alone and an action returning false keeps the key`, () => {
    const action = vi.fn(() => false)
    const { root, input } = attach_root(
      viewer_keys(() => ({ x: action, Escape: action })),
    )
    press_key(input, `x`)
    expect(action).not.toHaveBeenCalled()
    const escape = press_key(root, `Escape`)
    expect(action).toHaveBeenCalledOnce()
    expect(escape.defaultPrevented).toBe(false)
  })
})

describe(`viewer_keydown`, () => {
  test(`hover_handle narrows what the pointer alone triggers; prevented keys are skipped`, () => {
    const handle = vi.fn(() => true)
    const hover_handle = vi.fn(() => false)
    const { root, button } = attach_root(viewer_keydown(handle, hover_handle))
    hover(root)
    press_key(globalThis, `a`)
    expect([handle.mock.calls.length, hover_handle.mock.calls.length]).toEqual([0, 1])
    // focus path: handle prevents, so the window pass (also hovered) skips the key
    const event = press_key(button, `a`)
    expect(event.defaultPrevented).toBe(true)
    expect([handle.mock.calls.length, hover_handle.mock.calls.length]).toEqual([1, 1])
    // a descendant that already prevented the key keeps it from the viewer
    button.addEventListener(`keydown`, (evt) => evt.preventDefault(), { once: true })
    press_key(button, `a`)
    expect(handle).toHaveBeenCalledOnce()
  })

  test(`cleanup detaches both the focus and the hover listeners`, () => {
    const handle = vi.fn(() => true)
    const root = create_element()
    onTestFinished(() => root.remove())
    const detach = viewer_keydown(handle)(root)
    hover(root)
    detach()
    press_key(root, `a`)
    press_key(globalThis, `a`)
    expect(handle).not.toHaveBeenCalled()
  })
})
