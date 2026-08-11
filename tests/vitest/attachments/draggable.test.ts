import { draggable, type DraggableOptions } from '$lib/attachments'
import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import { create_element, mock_rect, pointer_event } from '../index'

describe(`draggable`, () => {
  // fixed positioning makes the attachment read getBoundingClientRect, which mock_rect
  // controls; the offset* fallback path has its own case below
  const create_fixed_box = (
    rect: Parameters<typeof mock_rect>[1] = { left: 10, top: 20 },
  ) => {
    const element = create_element(`div`, { position: `fixed` })
    mock_rect(element, rect)
    return element
  }
  const attach_draggable = (element: HTMLElement, options: DraggableOptions = {}) =>
    onTestFinished(draggable(options)(element) ?? (() => {}))

  it(`handles normal and rejected-capture drag lifecycles`, () => {
    const element = create_fixed_box()
    Object.assign(element.style, {
      right: `3px`,
      bottom: `4px`,
      cursor: `pointer`,
      touchAction: `pan-y`,
    })
    const [on_drag_start, on_drag, on_drag_end] = [vi.fn(), vi.fn(), vi.fn()]

    const cleanup = draggable({ on_drag_start, on_drag, on_drag_end })(element)
    document.body.style.userSelect = `text`
    onTestFinished(() => void document.body.style.removeProperty(`user-select`))
    expect(element.style.cursor).toBe(`grab`)
    expect(element.style.touchAction).toBe(`none`)

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))
    expect(element.style.left).toBe(`10px`)
    expect(element.style.top).toBe(`20px`)
    expect(element.style.cursor).toBe(`grabbing`)
    expect(document.body.style.userSelect).toBe(`none`)
    expect(on_drag_start).toHaveBeenCalledOnce()

    globalThis.dispatchEvent(pointer_event(`pointermove`, 15, 25))
    expect(element.style.left).toBe(`20px`)
    expect(element.style.top).toBe(`40px`)
    expect(element.style.right).toBe(`auto`)
    expect(element.style.bottom).toBe(`auto`)
    expect(on_drag).toHaveBeenCalledOnce()

    globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))
    expect(on_drag_end).toHaveBeenCalledOnce()
    expect(element.style.cursor).toBe(`grab`)
    expect(document.body.style.userSelect).toBe(`text`)

    vi.spyOn(element, `setPointerCapture`).mockImplementation(() => {
      throw new DOMException(`stale pointer`, `NotFoundError`)
    })
    on_drag.mockClear()
    on_drag_end.mockClear()
    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))
    expect(on_drag_end).toHaveBeenCalledOnce()
    expect(element.style.cursor).toBe(`grab`)
    expect(document.body.style.userSelect).toBe(`text`)
    globalThis.dispatchEvent(pointer_event(`pointermove`, 25, 25))
    expect(on_drag).not.toHaveBeenCalled()

    cleanup?.()
    expect(element.style.cursor).toBe(`pointer`)
    expect(element.style.touchAction).toBe(`pan-y`)
  })

  it.each([
    [`x`, [`40px`, `2px`, `auto`, `4px`]],
    [`y`, [`1px`, `60px`, `3px`, `auto`]],
  ] as const)(`locks dragging to the %s axis`, (axis, expected) => {
    const element = create_fixed_box()
    Object.assign(element.style, {
      left: `1px`,
      top: `2px`,
      right: `3px`,
      bottom: `4px`,
    })
    attach_draggable(element, { axis })

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 35, 45))

    expect([
      element.style.left,
      element.style.top,
      element.style.right,
      element.style.bottom,
    ]).toEqual(expected)
    globalThis.dispatchEvent(pointer_event(`pointerup`, 35, 45))
  })

  it(`keeps a fixed node within viewport-coordinate bounds`, () => {
    const element = create_fixed_box()
    attach_draggable(element, {
      bounds: { top: 0, right: 120, bottom: 80, left: 0 },
    })
    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))

    globalThis.dispatchEvent(pointer_event(`pointermove`, 100, 100))
    expect([element.style.left, element.style.top]).toEqual([`20px`, `30px`])

    globalThis.dispatchEvent(pointer_event(`pointermove`, -100, -100))
    expect([element.style.left, element.style.top]).toEqual([`0px`, `0px`])
    globalThis.dispatchEvent(pointer_event(`pointerup`, -100, -100))
  })

  it.each([`parent`, `element`] as const)(
    `contains offset-positioned nodes within a %s bound`,
    (kind) => {
      const parent = create_element()
      mock_rect(parent, { left: 100, top: 200, width: 300, height: 200 })
      const element = create_element(`div`, { position: `absolute` })
      parent.append(element)
      mock_rect(element, { left: 125, top: 235, width: 50, height: 40 })
      Object.defineProperties(element, {
        offsetLeft: { value: 25, configurable: true },
        offsetTop: { value: 35, configurable: true },
      })
      attach_draggable(element, { bounds: kind === `parent` ? `parent` : parent })
      element.dispatchEvent(pointer_event(`pointerdown`, 0, 0))

      globalThis.dispatchEvent(pointer_event(`pointermove`, 500, 500))
      expect([element.style.left, element.style.top]).toEqual([`250px`, `160px`])

      globalThis.dispatchEvent(pointer_event(`pointermove`, -500, -500))
      expect([element.style.left, element.style.top]).toEqual([`0px`, `0px`])
      globalThis.dispatchEvent(pointer_event(`pointerup`, -500, -500))
    },
  )

  it(`ignores element bounds that generate no box`, () => {
    const parent = create_element()
    mock_rect(parent, { left: 0, top: 0, width: 0, height: 0 })
    const element = create_fixed_box()
    parent.append(element)
    attach_draggable(element, { bounds: `parent` })
    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 15, 25))

    expect([element.style.left, element.style.top]).toEqual([`20px`, `40px`])
    globalThis.dispatchEvent(pointer_event(`pointerup`, 15, 25))
  })

  it(`pins the leading edge when the node is larger than its bounds`, () => {
    const element = create_fixed_box({ left: 10, top: 20, width: 150, height: 100 })
    attach_draggable(element, { bounds: new DOMRect(0, 0, 100, 80) })
    element.dispatchEvent(pointer_event(`pointerdown`, 0, 0))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 100, 100))

    expect([element.style.left, element.style.top]).toEqual([`0px`, `0px`])
    globalThis.dispatchEvent(pointer_event(`pointerup`, 100, 100))
  })

  it.each([
    [`a non-primary button`, { button: 2 }],
    [`a second finger`, { isPrimary: false }],
  ])(`does not start dragging from %s`, (_desc, init) => {
    const element = create_fixed_box()
    attach_draggable(element)
    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5, init))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 50, 50))
    expect([element.style.left, element.style.top]).toEqual([``, ``])
  })

  // Either ends the drag: nothing further arrives for a pointer that was canceled or whose
  // capture went away. `lostpointercapture` is dispatched on the capture target, not window.
  it.each([
    [
      `pointercancel`,
      (el: HTMLElement, id: number) =>
        globalThis.dispatchEvent(pointer_event(`pointercancel`, 0, 0, { pointerId: id })),
    ],
    [
      `lostpointercapture`,
      (el: HTMLElement, id: number) =>
        el.dispatchEvent(pointer_event(`lostpointercapture`, 0, 0, { pointerId: id })),
    ],
  ])(`ignores another pointer and ends on %s`, (_end_type, dispatch_end) => {
    const element = create_fixed_box()
    const on_drag_end = vi.fn()
    attach_draggable(element, { on_drag_end })

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5, { pointerId: 3 }))
    expect(element.hasPointerCapture(3)).toBe(true)

    globalThis.dispatchEvent(pointer_event(`pointermove`, 50, 50, { pointerId: 2 }))
    globalThis.dispatchEvent(pointer_event(`pointerup`, 50, 50, { pointerId: 2 }))
    expect([element.style.left, element.style.top]).toEqual([`10px`, `20px`])
    expect(on_drag_end).not.toHaveBeenCalled()

    globalThis.dispatchEvent(pointer_event(`pointermove`, 15, 25, { pointerId: 3 }))
    dispatch_end(element, 3)
    expect(on_drag_end).toHaveBeenCalledOnce()
    expect(document.body.style.userSelect).toBe(``)
    expect(element.hasPointerCapture(3)).toBe(false)
    globalThis.dispatchEvent(pointer_event(`pointermove`, 50, 50, { pointerId: 3 }))
    expect([element.style.left, element.style.top]).toEqual([`20px`, `40px`])
  })

  it(`does not set up dragging when disabled`, () => {
    const element = create_fixed_box()
    const cleanup = draggable({ disabled: true })(element)
    expect(cleanup).toBeUndefined()
    expect(element.style.cursor).toBe(``)

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 50, 50))
    expect([element.style.left, element.style.top]).toEqual([``, ``])
  })

  it(`warns and returns undefined for a missing handle selector`, () => {
    const element = create_element()
    const warn_spy = vi.spyOn(console, `warn`).mockImplementation(() => {})

    const cleanup = draggable({ handle_selector: `.nonexistent` })(element)

    expect(cleanup).toBeUndefined()
    expect(warn_spy).toHaveBeenCalledWith(expect.stringContaining(`.nonexistent`))
    warn_spy.mockRestore()
  })

  it(`drags only when the event originates from handle_selector`, () => {
    const element = create_fixed_box({ left: 0, top: 0 })

    const handle = document.createElement(`div`)
    handle.className = `drag-handle`
    element.append(handle)

    attach_draggable(element, { handle_selector: `.drag-handle` })

    // press on element (not handle) should not start dragging
    element.dispatchEvent(pointer_event(`pointerdown`, 0, 0))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 50, 50))
    expect(element.style.left).toBe(``)
    expect(element.style.top).toBe(``)

    // press on handle should start dragging
    handle.dispatchEvent(pointer_event(`pointerdown`, 0, 0))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 30, 40))
    expect(element.style.left).toBe(`30px`)
    expect(element.style.top).toBe(`40px`)
  })

  it(`ignores a second primary press and cleans up mid-drag`, () => {
    const element = create_fixed_box({ left: 0, top: 0 })

    const cleanup = draggable()(element)
    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5, { pointerId: 1 }))
    expect(document.body.style.userSelect).toBe(`none`)
    expect(element.style.cursor).toBe(`grabbing`)

    // A second primary press must not replace the first pointer follower.
    element.dispatchEvent(pointer_event(`pointerdown`, 8, 8, { pointerId: 2 }))
    cleanup?.() // unmount mid-drag, before any release
    expect(document.body.style.userSelect).toBe(``)
    expect(element.style.cursor).toBe(``)

    globalThis.dispatchEvent(pointer_event(`pointermove`, 100, 100, { pointerId: 1 }))
    expect(element.style.left).toBe(`0px`)
    expect(element.style.top).toBe(`0px`)
  })
})
