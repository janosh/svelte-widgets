import { escape_layer } from '#lib/attachments/index.ts'
import { expect, it, onTestFinished, vi } from 'vite-plus/test'
import {
  create_element,
  escape_key,
  press_escape,
  press_key as dispatch_key,
} from '../index'

it(`escape_layer skips handled Escape and captures through stopped propagation`, () => {
  const layer = vi.fn()
  const unregister = escape_layer(layer)
  onTestFinished(unregister)
  const handled = escape_key()
  handled.preventDefault()
  document.dispatchEvent(handled)
  expect(layer).not.toHaveBeenCalled()

  const blocker = create_element()
  const child = document.createElement(`button`)
  blocker.append(child)
  blocker.addEventListener(`keydown`, (event) => event.stopPropagation())
  const event = dispatch_key(child, `Escape`)

  unregister()
  press_escape()
  expect(layer).toHaveBeenCalledExactlyOnceWith(event)
})

// Without `consume` the return decides whether older layers run; `consume` takes the key
// whatever the handler returns, so `() => (open = false)` can't leak it to an outer layer
it.each([
  [false, false, true, false],
  [false, undefined, true, false],
  [false, true, false, false],
  [true, false, false, true],
  [true, undefined, false, true],
] as const)(
  `consume=%s layer returning %s: older layer runs=%s, prevented=%s`,
  (consume, returned, older_runs, prevented) => {
    const older = vi.fn(() => true)
    const newer = vi.fn(() => returned)
    onTestFinished(escape_layer(older))
    onTestFinished(escape_layer(newer, { consume }))
    const event = press_escape()
    expect(newer).toHaveBeenCalledOnce()
    expect(older).toHaveBeenCalledTimes(older_runs ? 1 : 0)
    expect(event.defaultPrevented).toBe(prevented)
  },
)

it(`a while_focused layer stays below a layer a descendant claims on its own focusin`, () => {
  const container = create_element()
  const child = document.createElement(`button`)
  container.append(child)
  const close_container = vi.fn()
  const close_child = vi.fn()
  let release_child: (() => void) | undefined
  child.addEventListener(`focusin`, () => {
    release_child?.()
    release_child = escape_layer(close_child, { consume: true })
  })
  const detach = escape_layer(close_container, {
    consume: true,
    while_focused: container,
  })
  onTestFinished(() => {
    detach()
    release_child?.()
  })
  child.focus()
  dispatch_key(child, `Escape`)
  expect(close_child).toHaveBeenCalledOnce()
  expect(close_container).not.toHaveBeenCalled()
  release_child?.()
  release_child = undefined
  dispatch_key(child, `Escape`)
  expect(close_container).toHaveBeenCalledOnce()
})

it.each([true, false])(
  `a while_focused layer (consume=%s) lets Escape through once focus left without a focusout`,
  (consume) => {
    const outer = vi.fn(() => true)
    const unregister_outer = escape_layer(outer)
    const container = create_element()
    const child = document.createElement(`button`)
    container.append(child)
    const inner = vi.fn(() => true)
    const detach = escape_layer(inner, { consume, while_focused: container })
    onTestFinished(() => {
      detach()
      unregister_outer()
    })
    child.focus()
    // detached first, so no focusout can reach the container (like a display: none hide)
    child.remove()
    expect(press_escape().defaultPrevented).toBe(false)
    expect(inner).not.toHaveBeenCalled()
    expect(outer).toHaveBeenCalledOnce()
  },
)
