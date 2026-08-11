import { click_outside } from '$lib/attachments'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { create_element, escape_key, stub_prop } from '../index'

describe(`click_outside`, () => {
  const dispatch_press = (
    target: Element,
    path: EventTarget[] = [],
    kind = `pointerdown`,
    init: PointerEventInit = {},
  ) => {
    // a real PointerEvent so the scrollbar guard (MouseEvent-only) actually runs here, and
    // primary by default because the constructor's own default reads as a second finger.
    // A click gets detail: 1, which is how the dismissal tells a pointer click from a
    // keyboard or programmatic one — a bare Event would be judged as the latter.
    const event = kind.startsWith(`pointer`)
      ? new PointerEvent(kind, { bubbles: true, isPrimary: true, ...init })
      : new MouseEvent(kind, { bubbles: true, detail: 1, ...init })
    Object.defineProperty(event, `target`, { value: target })
    Object.defineProperty(event, `composedPath`, {
      value: () =>
        path.length > 0
          ? path
          : [target, document.body, document.documentElement, document, globalThis],
    })
    document.dispatchEvent(event)
    return event
  }

  // returns the event so callers can assert on identity or defaultPrevented
  const press_escape = (init: KeyboardEventInit = {}) => {
    const event = escape_key(init)
    document.dispatchEvent(event)
    return event
  }

  // document.body.innerHTML = '' leaves click_outside's document capture listeners
  // and Escape layers behind, which would decide later tests' assertions
  const cleanups: (() => void)[] = []
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

  // attaches click_outside to a fresh element wired to a spy callback
  const attach_outside = (config: Parameters<typeof click_outside>[0] = {}) => {
    const element = create_element()
    const callback = vi.fn()
    const cleanup = click_outside({ callback, ...config })(element)
    if (cleanup) cleanups.push(cleanup)
    return { element, callback, cleanup }
  }

  it(`disabled suppresses outside presses`, () => {
    const { callback } = attach_outside({ enabled: false })
    dispatch_press(create_element())
    expect(callback).not.toHaveBeenCalled()
  })

  it(`inside selectors keep matching regions from dismissing (single, multiple, nested)`, () => {
    const [modal, popover, nested] = [
      create_element(),
      create_element(),
      create_element(),
    ]
    modal.className = `modal`
    popover.className = `popover`
    modal.append(nested)

    const { callback } = attach_outside({ inside: [`.modal`, `.popover`] })

    dispatch_press(modal)
    dispatch_press(popover)
    dispatch_press(nested)
    expect(callback).not.toHaveBeenCalled()

    // control: proves the silence above is the inside list, not a dead listener
    dispatch_press(create_element())
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it(`triggers on clicks landing on SVG elements outside the node`, () => {
    const { callback } = attach_outside()

    const svg = document.createElementNS(`http://www.w3.org/2000/svg`, `svg`)
    document.body.append(svg)
    dispatch_press(svg)

    expect(callback).toHaveBeenCalledTimes(1)
  })

  it(`dispatches a custom event without a callback`, () => {
    const element = create_element()
    const listener = vi.fn()
    element.addEventListener(`dismiss`, listener)
    const cleanup = click_outside({})(element) // no callback
    if (cleanup) cleanups.push(cleanup)
    dispatch_press(create_element())
    expect(listener).toHaveBeenCalled()
  })

  it(`dismisses only on outside presses and stops after cleanup`, () => {
    const { element, callback, cleanup } = attach_outside()
    dispatch_press(element)
    expect(callback).not.toHaveBeenCalled()

    const outside = create_element()
    const event = dispatch_press(outside)
    expect(callback).toHaveBeenCalledTimes(1)
    // the press comes along so consumers can forward it to their own onclose
    expect(callback.mock.calls[0][2]).toEqual({
      focus_inside: false,
      via: `pointer`,
      event,
    })

    // right-clicks and OS-captured drags never send this click, hence pointerdown
    outside.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    expect(callback).toHaveBeenCalledTimes(1)

    cleanup?.()
    dispatch_press(outside)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  // Same selector, another instance's trigger: it must not shield this surface. The
  // function form is resolved per press, for a `bind:this` still null at setup — a
  // plain `scope` prop would have been captured null forever.
  it.each([`element`, `function`] as const)(
    `scope as %s confines inside selectors to one subtree`,
    (kind) => {
      const [own_scope, own_trigger, other_trigger] = [
        create_element(),
        create_element(),
        create_element(),
      ]
      own_trigger.className = `trigger`
      other_trigger.className = `trigger`
      own_scope.append(own_trigger)

      let scope_el: Element | null = kind === `element` ? own_scope : null
      const { callback } = attach_outside({
        inside: [`.trigger`],
        scope: kind === `element` ? own_scope : () => scope_el,
      })

      if (kind === `function`) {
        // unconstrained while null, so the selector still shields every match
        dispatch_press(other_trigger)
        expect(callback).not.toHaveBeenCalled()
        scope_el = own_scope
      }

      dispatch_press(own_trigger)
      expect(callback).not.toHaveBeenCalled()
      dispatch_press(other_trigger)
      expect(callback).toHaveBeenCalledTimes(1)
    },
  )

  it(`an element in inside counts as part of the surface`, () => {
    const portalled = create_element() // sibling in body, no longer a descendant
    const nested = document.createElement(`button`)
    portalled.append(nested)

    // null entries are the norm: the portal target binds after the first render
    const { callback } = attach_outside({ inside: [null, portalled] })

    dispatch_press(portalled)
    dispatch_press(nested)
    expect(callback).not.toHaveBeenCalled()

    dispatch_press(create_element())
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it(`Escape is opt-in, dismisses only the top layer, and stops page handlers`, () => {
    const without_escape = attach_outside()
    const page_handler = vi.fn()
    document.addEventListener(`keydown`, page_handler)
    cleanups.push(() => document.removeEventListener(`keydown`, page_handler))

    expect(press_escape().defaultPrevented).toBe(false)
    expect(without_escape.callback).not.toHaveBeenCalled()
    expect(page_handler).toHaveBeenCalledOnce()
    page_handler.mockClear()

    const outer = attach_outside({ escape: true })
    const inner = attach_outside({ escape: true })

    const event = press_escape()
    expect(inner.callback).toHaveBeenCalledTimes(1)
    expect(outer.callback).not.toHaveBeenCalled()
    expect(page_handler).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)

    // with the inner surface gone, the next Escape reaches the one behind it
    inner.cleanup?.()
    press_escape()
    expect(inner.callback).toHaveBeenCalledTimes(1)
    expect(outer.callback).toHaveBeenCalledTimes(1)
    outer.cleanup?.()
    press_escape()
    expect(page_handler).toHaveBeenCalledTimes(1)
  })

  it(`ignores a press on the page scrollbar`, () => {
    const { callback } = attach_outside()

    // no layout in the test DOM, so give the root a client box the gutter sits outside of
    const root = document.documentElement
    cleanups.push(
      stub_prop(root, `clientWidth`, 800),
      stub_prop(root, `clientHeight`, 600),
    )
    const press = (clientX: number, clientY: number) =>
      document.body.dispatchEvent(
        new PointerEvent(`pointerdown`, { bubbles: true, clientX, clientY }),
      )

    press(820, 300) // vertical scrollbar gutter
    press(400, 620) // horizontal scrollbar gutter
    expect(callback).not.toHaveBeenCalled()

    press(400, 300) // control: same target inside the client box does dismiss
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it(`ignores Escape that is only ending an IME composition`, () => {
    const { callback, cleanup } = attach_outside({ escape: true })

    press_escape({ isComposing: true })
    expect(callback).not.toHaveBeenCalled()

    press_escape()
    expect(callback).toHaveBeenCalledTimes(1)
    cleanup?.()
  })

  it(`tolerates an empty inside selector instead of throwing on every press`, () => {
    // a trailing empty entry makes the joined selector invalid, which would throw
    // out of the capture listener for every press anywhere on the page
    const { callback, cleanup } = attach_outside({ inside: [`.modal`, ``] })

    expect(() => dispatch_press(create_element())).not.toThrow()
    expect(callback).toHaveBeenCalledTimes(1)
    cleanup?.()
  })

  it.each([true, false])(`escape reports focus_inside=%s`, (focus_inside) => {
    const { element, callback, cleanup } = attach_outside({ escape: true })
    const inner = create_element()
    element.append(inner)
    const focus_target = focus_inside ? inner : create_element()
    focus_target.setAttribute(`tabindex`, `0`)
    focus_target.focus()

    const event = press_escape()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback.mock.calls[0][2]).toEqual({ focus_inside, via: `escape`, event })
    cleanup?.()
  })

  // A surface living inside a shadow tree: document.activeElement reports the host,
  // which the surface does not contain, so only descending the chain finds the focus
  it(`escape sees focus on a node that shares the surface's shadow tree`, () => {
    const host = create_element()
    const surface = document.createElement(`div`)
    const inner = document.createElement(`button`)
    surface.append(inner)
    host.attachShadow({ mode: `open` }).append(surface)
    inner.focus()

    const callback = vi.fn()
    const cleanup = click_outside({ callback, escape: true })(surface)
    if (cleanup) cleanups.push(cleanup)
    const event = press_escape()

    expect(callback.mock.calls[0][2]).toEqual({
      focus_inside: true,
      via: `escape`,
      event,
    })
  })

  // Dragging or resizing the surface can release past its edge, and the browser then
  // reports the click on a common ancestor — outside. Only a gesture that both starts
  // and ends outside is a dismissal, else a resize would close what it was resizing.
  it(`dismiss_on: 'release' waits for clicks and ignores gestures started inside`, () => {
    const { element, callback } = attach_outside({ dismiss_on: `release` })
    const outside = create_element()

    dispatch_press(outside)
    expect(callback).not.toHaveBeenCalled()
    dispatch_press(outside, [], `click`)
    expect(callback).toHaveBeenCalledTimes(1)
    callback.mockClear()

    dispatch_press(element)
    dispatch_press(create_element(), [], `click`)
    expect(callback).not.toHaveBeenCalled()

    // the verdict is spent on that click, so the next outside click dismisses as usual
    dispatch_press(create_element(), [], `click`)
    expect(callback).toHaveBeenCalledTimes(1)

    // the OS claiming a gesture ends it without a click, so that verdict must not linger
    // for the next click either
    dispatch_press(element)
    dispatch_press(element, [], `pointercancel`)
    dispatch_press(create_element(), [], `click`)
    expect(callback).toHaveBeenCalledTimes(2)

    // nor may a right-click inside, which fires no click of its own at all
    dispatch_press(element, [], `pointerdown`, { button: 2 })
    dispatch_press(create_element(), [], `click`)
    expect(callback).toHaveBeenCalledTimes(3)
  })

  // A press inside can end without any click at all — released off-screen, or the OS taking
  // over for a native drag. The verdict must not then be applied to a click that carries no
  // pointer of its own: keyboard Enter and .click() both report detail 0.
  it(`dismiss_on: 'release' still dismisses on a keyboard-driven click`, () => {
    const { element, callback } = attach_outside({ dismiss_on: `release` })
    const outside = create_element()

    dispatch_press(element) // pointerdown inside that never produces a click
    outside.dispatchEvent(new MouseEvent(`click`, { bubbles: true, detail: 0 }))

    expect(callback).toHaveBeenCalledTimes(1)
  })

  // Capture phase is what makes dismissal unsuppressable, and its price is running before
  // the pressed control's own handler — so a control that toggles the surface from its click
  // handler belongs in `inside`; `release` cannot reorder that one for it (a control bound to
  // the state is the case `release` does fix, see DraggablePane's checkbox tests)
  it(`dismisses from the capture phase, ahead of the pressed control's handler`, () => {
    const order: string[] = []
    const { callback } = attach_outside({ dismiss_on: `release` })
    callback.mockImplementation(() => order.push(`dismiss`))
    const control = create_element(`button`)
    control.addEventListener(`click`, (event) => {
      event.stopPropagation() // cannot suppress a dismissal that already ran
      order.push(`control`)
    })

    control.dispatchEvent(new PointerEvent(`click`, { bubbles: true }))
    expect(order).toEqual([`dismiss`, `control`])
  })
})
