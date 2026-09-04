import { register_escape_layer } from '$lib/attachments'
import { expect, it, onTestFinished, vi } from 'vitest'
import { create_element, escape_key, press_key as dispatch_key } from '../index'

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
  document.dispatchEvent(escape_key())
  expect(layer).toHaveBeenCalledExactlyOnceWith(event)
})
