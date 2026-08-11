import { register_escape_layer } from '$lib/attachments'
import { expect, it, vi } from 'vite-plus/test'
import { create_element, escape_key, press_key as dispatch_key } from '../index'

it(`register_escape_layer skips handled Escape and captures through stopped propagation`, () => {
  const layer = vi.fn()
  const unregister = register_escape_layer(layer)
  try {
    const handled = escape_key()
    handled.preventDefault()
    document.dispatchEvent(handled)
    expect(layer).not.toHaveBeenCalled()

    const blocker = create_element()
    const child = document.createElement(`button`)
    blocker.append(child)
    blocker.addEventListener(`keydown`, (event) => event.stopPropagation())
    const event = dispatch_key(child, `Escape`)
    expect(layer).toHaveBeenCalledWith(event)
  } finally {
    unregister()
  }
})
