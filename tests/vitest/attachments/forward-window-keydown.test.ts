import { forward_window_keydown } from '$lib/attachments'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { create_element, press_key as dispatch_key } from '../index'

describe(`forward_window_keydown`, () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
    document.body.innerHTML = ``
  })

  const attach = (handled = true, options: { enabled?: boolean } = {}) => {
    const node = create_element()
    const handle = vi.fn(() => handled)
    const cleanup = forward_window_keydown({ handle, ...options })(node)
    if (cleanup) cleanups.push(cleanup)
    return { node, handle, cleanup }
  }

  const hover = (node: Element) =>
    node.dispatchEvent(new PointerEvent(`pointerenter`, { bubbles: false }))
  const unhover = (node: Element) =>
    node.dispatchEvent(new PointerEvent(`pointerleave`, { bubbles: false }))
  const press_key = (key = `f`) => dispatch_key(globalThis, key)

  it(`forwards only while hovered, and never once cleaned up`, () => {
    const { node, handle, cleanup } = attach()

    press_key()
    expect(handle).not.toHaveBeenCalled() // never hovered, so this key is not ours

    hover(node)
    press_key()
    expect(handle).toHaveBeenCalledTimes(1)

    unhover(node)
    press_key()
    expect(handle).toHaveBeenCalledTimes(1)

    hover(node) // hovered again, but the listener is gone
    cleanup?.()
    press_key()
    expect(handle).toHaveBeenCalledTimes(1)
  })

  it(`two hovered-by-turns components never both answer one key`, () => {
    const first = attach()
    const second = attach()

    hover(first.node)
    press_key()
    expect(first.handle).toHaveBeenCalledTimes(1)
    expect(second.handle).not.toHaveBeenCalled()

    unhover(first.node)
    hover(second.node)
    press_key()
    expect(first.handle).toHaveBeenCalledTimes(1)
    expect(second.handle).toHaveBeenCalledTimes(1)
  })

  it(`leaves focused inputs alone but handles keys focused on its root`, () => {
    const { node, handle } = attach()
    hover(node)
    const input = document.createElement(`input`)
    node.append(input)
    input.focus()

    press_key()
    expect(handle).not.toHaveBeenCalled()

    const shadow_input = document.createElement(`input`)
    node.attachShadow({ mode: `open` }).append(shadow_input)
    shadow_input.focus()
    shadow_input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `f`, bubbles: true, composed: true }),
    )
    expect(handle).not.toHaveBeenCalled()

    node.tabIndex = 0
    node.focus()
    const event = press_key()
    expect(handle).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it(`leaves the browser default alone when unhandled`, () => {
    const { node } = attach(false)
    hover(node)
    expect(press_key().defaultPrevented).toBe(false)
  })

  it(`disabled attaches nothing`, () => {
    const { node, handle, cleanup } = attach(true, { enabled: false })

    expect(cleanup).toBeUndefined()
    hover(node)
    press_key()
    expect(handle).not.toHaveBeenCalled()
  })
})
