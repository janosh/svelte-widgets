import { anchored_popover, close_before_removal } from '#lib/attachments/index.ts'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'
import { create_element, press_key } from '../index'

const toggle_event = (new_state: `open` | `closed`) =>
  Object.assign(new Event(`beforetoggle`), { newState: new_state })

// trigger button plus a menu holding a focusable option, attached and torn down per test
const setup = () => {
  const anchor = document.createElement(`button`)
  document.body.append(anchor)
  const menu = create_element()
  const option = document.createElement(`button`)
  menu.append(option)
  const on_close = vi.fn()
  const cleanup = anchored_popover({ anchor, on_close })(menu)
  onTestFinished(() => cleanup?.())
  return { anchor, menu, option, on_close, cleanup }
}

test(`without an anchor it leaves the node alone`, () => {
  const node = create_element()
  expect(anchored_popover({ anchor: null, on_close: vi.fn() })(node)).toBeUndefined()
  expect([node.popover, node.matches(`:popover-open`)]).toEqual([null, false])
})

test(`shows an auto popover the anchor invokes, undoing the UA popover box`, () => {
  const { anchor, menu } = setup()
  expect(menu.popover).toBe(`auto`)
  expect(menu.matches(`:popover-open`)).toBe(true)
  expect([anchor.popoverTargetElement, anchor.popoverTargetAction]).toEqual([
    menu,
    `show`,
  ])
  const { pointerEvents, inset, margin } = menu.style
  expect([pointerEvents, inset, margin]).toEqual([`auto`, `auto`, `0px`])
  // float positioned it
  expect(menu.style.top).not.toBe(``)
})

test.each([
  [`closed`, 1],
  [`open`, 0],
] as const)(`beforetoggle to %s reports %i close(s)`, (new_state, n_calls) => {
  const { menu, on_close } = setup()
  menu.dispatchEvent(toggle_event(new_state))
  expect(on_close).toHaveBeenCalledTimes(n_calls)
})

test(`Escape hides the open popover before outer listeners and refocuses the trigger`, () => {
  const { anchor, menu, option } = setup()
  const host_keydown = vi.fn()
  document.body.addEventListener(`keydown`, host_keydown)
  onTestFinished(() => document.body.removeEventListener(`keydown`, host_keydown))
  option.focus()
  const event = press_key(option, `Escape`)
  expect(event.defaultPrevented).toBe(true)
  expect(host_keydown).not.toHaveBeenCalled()
  expect(menu.matches(`:popover-open`)).toBe(false)
  expect(document.activeElement).toBe(anchor)
  // closed, the layer passes Escape on
  const later = press_key(option, `Escape`)
  expect([later.defaultPrevented, host_keydown.mock.calls.length]).toEqual([false, 1])
})

test.each([`teardown`, `close_before_removal`] as const)(
  `%s hides silently and the trigger stops invoking it`,
  (closer) => {
    const { anchor, menu, on_close, cleanup } = setup()
    // a real hide fires beforetoggle, which must not reach on_close here
    const native_hide = menu.hidePopover.bind(menu)
    vi.spyOn(menu, `hidePopover`).mockImplementation(() => {
      menu.dispatchEvent(toggle_event(`closed`))
      native_hide()
    })
    if (closer === `teardown`) cleanup?.()
    else expect(close_before_removal(menu)).toEqual({})
    expect(menu.matches(`:popover-open`)).toBe(false)
    expect(on_close).not.toHaveBeenCalled()
    expect(anchor.popoverTargetElement).toBe(closer === `teardown` ? null : menu)
  },
)

test(`close_before_removal on a non-popover node is a no-op`, () => {
  expect(close_before_removal(create_element())).toEqual({})
})
