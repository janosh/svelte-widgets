import { anchored_popover, close_before_removal } from '#lib/attachments/index.ts'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'
import { create_element, press_key } from '../index'

const toggle_event = (new_state: `open` | `closed`) =>
  Object.assign(new Event(`beforetoggle`), { newState: new_state })

// trigger button plus a menu holding a focusable option, attached and torn down per test.
// The preset margin and action are what teardown must restore.
const setup = () => {
  const anchor = document.createElement(`button`)
  anchor.popoverTargetAction = `toggle`
  document.body.append(anchor)
  const menu = create_element(`div`, { margin: `3px` })
  const option = document.createElement(`button`)
  menu.append(option)
  const on_close = vi.fn()
  const cleanup = anchored_popover({ anchor, on_close })(menu)
  onTestFinished(() => cleanup?.())
  // popover attribute, the styles it overrides, the trigger's link, and whether it's open
  const state = () => {
    const { popover, style } = menu
    const { popoverTargetAction: action, popoverTargetElement: target } = anchor
    const open = menu.matches(`:popover-open`)
    return [popover, style.margin, style.pointerEvents, style.inset, action, target, open]
  }
  return { anchor, menu, option, on_close, cleanup, state }
}

test(`without an anchor it leaves the node alone, and close_before_removal is a no-op`, () => {
  const node = create_element()
  expect(anchored_popover({ anchor: null, on_close: vi.fn() })(node)).toBeUndefined()
  expect([node.popover, node.matches(`:popover-open`)]).toEqual([null, false])
  expect(close_before_removal(node)).toEqual({})
})

test(`opens an auto popover the anchor invokes, undoing the UA box, and reports closes`, () => {
  const { menu, on_close, state } = setup()
  expect(state()).toEqual([`auto`, `0px`, `auto`, `auto`, `show`, menu, true])
  expect(menu.style.top).not.toBe(``) // float positioned it
  menu.dispatchEvent(toggle_event(`open`))
  expect(on_close).not.toHaveBeenCalled()
  menu.dispatchEvent(toggle_event(`closed`))
  expect(on_close).toHaveBeenCalledOnce()
})

test(`Escape hides the open popover before outer listeners and refocuses the trigger`, () => {
  const { anchor, menu, option } = setup()
  const host_keydown = vi.fn()
  document.body.addEventListener(`keydown`, host_keydown)
  onTestFinished(() => document.body.removeEventListener(`keydown`, host_keydown))
  option.focus()
  expect(press_key(option, `Escape`).defaultPrevented).toBe(true)
  expect(host_keydown).not.toHaveBeenCalled()
  expect([menu.matches(`:popover-open`), document.activeElement]).toEqual([false, anchor])
  // closed, the layer passes Escape on
  const later = press_key(option, `Escape`)
  expect([later.defaultPrevented, host_keydown.mock.calls.length]).toEqual([false, 1])
})

// the outro only hides; teardown undoes all attaching did, since a rerun without an anchor
// leaves the node alone
test.each([
  [`teardown`, [null, `3px`, ``, ``, `toggle`, null, false]],
  [`close_before_removal`, [`auto`, `0px`, `auto`, `auto`, `show`, `menu`, false]],
] as const)(`%s hides silently, leaving %j`, (closer, expected) => {
  const { menu, on_close, cleanup, state } = setup()
  // a real hide fires beforetoggle, which must not reach on_close here
  const native_hide = menu.hidePopover.bind(menu)
  vi.spyOn(menu, `hidePopover`).mockImplementation(() => {
    menu.dispatchEvent(toggle_event(`closed`))
    native_hide()
  })
  if (closer === `teardown`) cleanup?.()
  else expect(close_before_removal(menu)).toEqual({})
  expect(state()).toEqual(expected.map((value) => (value === `menu` ? menu : value)))
  expect(on_close).not.toHaveBeenCalled()
})
