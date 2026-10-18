import { register_escape_layer } from '#lib/attachments/index.ts'
import {
  claim_escape,
  claim_escape_while_focused,
  hold_escape_while_focused,
} from '#lib/attachments/shared.ts'
import { expect, it, onTestFinished, vi } from 'vite-plus/test'
import {
  create_element,
  escape_key,
  press_escape,
  press_key as dispatch_key,
} from '../index'

it(`register_escape_layer skips handled Escape and captures through stopped propagation`, () => {
  const layer = vi.fn()
  const unregister = register_escape_layer(layer)
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

it(`claim_escape_while_focused stays below a layer a descendant claims on its own focusin`, () => {
  const container = create_element()
  const child = document.createElement(`button`)
  container.append(child)
  const close_container = vi.fn()
  const close_child = vi.fn()
  let release_child: (() => void) | undefined
  child.addEventListener(`focusin`, () => {
    release_child?.()
    release_child = claim_escape(close_child)
  })
  const detach = claim_escape_while_focused(close_container)(container)
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

it.each([`claim`, `hold`] as const)(
  `%s_escape_while_focused lets Escape through once focus left without a focusout`,
  (kind) => {
    const outer = vi.fn(() => true)
    const unregister_outer = register_escape_layer(outer)
    const container = create_element()
    const child = document.createElement(`button`)
    container.append(child)
    const inner = vi.fn()
    const attach =
      kind === `claim`
        ? claim_escape_while_focused(inner)
        : hold_escape_while_focused(() => (inner(), true))
    const detach = attach(container)
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
