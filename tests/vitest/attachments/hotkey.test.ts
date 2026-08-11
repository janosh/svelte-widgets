import { hotkey } from '$lib/attachments'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { create_element, stub_prop } from '../index'

describe(`hotkey`, () => {
  const keydown = (target: EventTarget, key: string, modifiers = {}) => {
    const event = new KeyboardEvent(`keydown`, {
      key,
      bubbles: true,
      cancelable: true,
      ...modifiers,
    })
    target.dispatchEvent(event)
    return event
  }

  // a global binding outlives document.body.innerHTML = '', so dispose every one
  const cleanups: (() => void)[] = []
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))
  const attach_hotkey = (
    options: Parameters<typeof hotkey>[0],
    node = create_element(),
  ) => {
    const cleanup = hotkey(options)(node)
    if (cleanup) cleanups.push(cleanup)
    return { node, cleanup }
  }

  it(`fires on its own node, or anywhere in its document when global`, () => {
    const handler = vi.fn()
    const { node, cleanup } = attach_hotkey({ bindings: [{ keys: `ctrl+k`, handler }] })

    const event = keydown(node, `k`, { ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)

    keydown(create_element(), `k`, { ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)

    cleanup?.()
    keydown(node, `k`, { ctrlKey: true })
    expect(handler).toHaveBeenCalledTimes(1)

    // `global` is the opt-out: that binding answers from anywhere on the page
    const foreign_doc = document.implementation.createHTMLDocument()
    const foreign_node = foreign_doc.createElement(`div`)
    foreign_doc.body.append(foreign_node)
    const anywhere = vi.fn()
    attach_hotkey(
      { bindings: [{ keys: `ctrl+j`, handler: anywhere }], global: true },
      foreign_node,
    )
    keydown(document, `j`, { ctrlKey: true })
    expect(anywhere).not.toHaveBeenCalled()
    keydown(foreign_node, `j`, { ctrlKey: true })
    expect(anywhere).toHaveBeenCalledTimes(1)
  })

  it(`leaves bare keys to text fields unless told otherwise`, () => {
    const input = create_element(`input`)
    const [typed, forced, chord] = [vi.fn(), vi.fn(), vi.fn()]
    attach_hotkey({
      global: true,
      bindings: [
        { keys: `/`, handler: typed },
        { keys: `?`, handler: forced, allow_in_inputs: true },
        { keys: `ctrl+/`, handler: chord },
      ],
    })

    keydown(input, `/`)
    expect(typed).not.toHaveBeenCalled() // the user is typing a slash

    keydown(input, `?`)
    expect(forced).toHaveBeenCalledTimes(1)

    keydown(input, `/`, { ctrlKey: true })
    expect(chord).toHaveBeenCalledTimes(1) // a chord is never typing
  })

  it(`runs the first enabled match only and can leave the default alone`, () => {
    const [off, first, second] = [vi.fn(), vi.fn(), vi.fn()]
    const { node } = attach_hotkey({
      bindings: [
        { keys: `ctrl+k`, handler: off, enabled: false },
        { keys: [`ctrl+j`, `ctrl+k`], handler: first, prevent_default: false },
        { keys: `ctrl+k`, handler: second },
      ],
    })

    const event = keydown(node, `k`, { ctrlKey: true })
    expect(off).not.toHaveBeenCalled()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it.each([
    [`Macintosh; Intel Mac OS X 10_15`, { metaKey: true }, { ctrlKey: true }],
    [`X11; Linux x86_64`, { ctrlKey: true }, { metaKey: true }],
  ])(`mod follows the platform (%s)`, (user_agent, matching, other) => {
    cleanups.push(stub_prop(globalThis.navigator, `userAgent`, user_agent))
    const handler = vi.fn()
    const { node } = attach_hotkey({ bindings: [{ keys: `mod+k`, handler }] })

    keydown(node, `k`, other)
    expect(handler).not.toHaveBeenCalled()

    keydown(node, `k`, matching)
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it(`stays quiet mid IME composition and when disabled`, () => {
    const node = create_element()
    const handler = vi.fn()
    const { cleanup } = attach_hotkey(
      { bindings: [{ keys: `ctrl+k`, handler }], enabled: false },
      node,
    )
    expect(cleanup).toBeUndefined()
    keydown(node, `k`, { ctrlKey: true })
    expect(handler).not.toHaveBeenCalled()

    attach_hotkey({ bindings: [{ keys: `Enter`, handler }] }, node)
    keydown(node, `Enter`, { isComposing: true })
    expect(handler).not.toHaveBeenCalled()
    keydown(node, `Enter`)
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
