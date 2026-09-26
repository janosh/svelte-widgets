import { draggable, type DraggableOptions } from '$lib/attachments'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
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
  // cleanup also ends any drag a test leaves active
  const attach_draggable = (element: HTMLElement, options: DraggableOptions = {}) =>
    onTestFinished(draggable(options)(element) ?? (() => {}))
  const move = (x: number, y: number, init: PointerEventInit = {}) =>
    globalThis.dispatchEvent(pointer_event(`pointermove`, x, y, init))
  const drag = (element: Element, from: number[], to: number[]) => {
    element.dispatchEvent(pointer_event(`pointerdown`, from[0], from[1]))
    move(to[0], to[1])
  }
  const position = ({ style }: HTMLElement) => [style.left, style.top]
  const with_offsets = (element: HTMLElement) =>
    Object.defineProperties(element, {
      offsetLeft: { value: 25, configurable: true },
      offsetTop: { value: 35, configurable: true },
    })

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
    expect([element.style.cursor, element.style.touchAction]).toEqual([`grab`, `none`])

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5))
    expect(position(element)).toEqual([`10px`, `20px`])
    expect(element.style.cursor).toBe(`grabbing`)
    expect(document.body.style.userSelect).toBe(`none`)
    expect(on_drag_start).toHaveBeenCalledOnce()

    move(15, 25)
    const { left, top, right, bottom } = element.style
    expect([left, top, right, bottom]).toEqual([`20px`, `40px`, `auto`, `auto`])
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
    move(25, 25)
    expect(on_drag).not.toHaveBeenCalled()

    cleanup?.()
    expect([element.style.cursor, element.style.touchAction]).toEqual([
      `pointer`,
      `pan-y`,
    ])
  })

  it.each([
    [`x`, [`40px`, `2px`, `auto`, `4px`]],
    [`y`, [`1px`, `60px`, `3px`, `auto`]],
  ] as const)(`locks dragging to the %s axis`, (axis, expected) => {
    const element = create_fixed_box()
    Object.assign(element.style, { left: `1px`, top: `2px`, right: `3px`, bottom: `4px` })
    attach_draggable(element, { axis })

    drag(element, [5, 5], [35, 45])
    const { left, top, right, bottom } = element.style
    expect([left, top, right, bottom]).toEqual(expected)
  })

  it(`keeps a fixed node within viewport-coordinate bounds`, () => {
    const element = create_fixed_box()
    attach_draggable(element, { bounds: { top: 0, right: 120, bottom: 80, left: 0 } })

    drag(element, [5, 5], [100, 100])
    expect(position(element)).toEqual([`20px`, `30px`])
    move(-100, -100)
    expect(position(element)).toEqual([`0px`, `0px`])
  })

  it.each([`parent`, `element`] as const)(
    `contains offset-positioned nodes within a %s bound`,
    (kind) => {
      const parent = create_element()
      mock_rect(parent, { left: 100, top: 200, width: 300, height: 200 })
      const element = create_element(`div`, { position: `absolute` })
      parent.append(element)
      mock_rect(element, { left: 125, top: 235, width: 50, height: 40 })
      with_offsets(element)
      attach_draggable(element, { bounds: kind === `parent` ? `parent` : parent })

      drag(element, [0, 0], [500, 500])
      expect(position(element)).toEqual([`250px`, `160px`])
      move(-500, -500)
      expect(position(element)).toEqual([`0px`, `0px`])
    },
  )

  it.each([`relative`, `static`] as const)(
    `drags an in-flow %s node from its insets, not its offset`,
    (css_position) => {
      const element = with_offsets(
        create_element(`div`, { position: css_position, left: `5px` }),
      )
      attach_draggable(element)

      drag(element, [0, 0], [10, 10])
      expect(element.style.position).toBe(`relative`)
      expect(position(element)).toEqual([`15px`, `10px`])
    },
  )

  it(`ignores element bounds that generate no box`, () => {
    const parent = create_element()
    mock_rect(parent, { left: 0, top: 0, width: 0, height: 0 })
    const element = create_fixed_box()
    parent.append(element)
    attach_draggable(element, { bounds: `parent` })

    drag(element, [5, 5], [15, 25])
    expect(position(element)).toEqual([`20px`, `40px`])
  })

  it(`pins the leading edge when the node is larger than its bounds`, () => {
    const element = create_fixed_box({ left: 10, top: 20, width: 150, height: 100 })
    attach_draggable(element, { bounds: new DOMRect(0, 0, 100, 80) })

    drag(element, [0, 0], [100, 100])
    expect(position(element)).toEqual([`0px`, `0px`])
  })

  it.each([
    [`a non-primary button`, { button: 2 }],
    [`a second finger`, { isPrimary: false }],
  ])(`does not start dragging from %s`, (_desc, init) => {
    const element = create_fixed_box()
    attach_draggable(element)
    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5, init))
    move(50, 50)
    expect(position(element)).toEqual([``, ``])
  })

  // either ends the drag: nothing more arrives for a canceled pointer or one whose capture
  // went away; `lostpointercapture` fires on the capture target, not window
  it.each([
    [
      `pointercancel`,
      (_el: HTMLElement, init: PointerEventInit) =>
        globalThis.dispatchEvent(pointer_event(`pointercancel`, 0, 0, init)),
    ],
    [
      `lostpointercapture`,
      (el: HTMLElement, init: PointerEventInit) =>
        el.dispatchEvent(pointer_event(`lostpointercapture`, 0, 0, init)),
    ],
  ])(`ignores another pointer and ends on %s`, (_end_type, dispatch_end) => {
    const element = create_fixed_box()
    const on_drag_end = vi.fn()
    attach_draggable(element, { on_drag_end })
    const [first, second] = [{ pointerId: 3 }, { pointerId: 2 }]

    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5, first))
    expect(element.hasPointerCapture(3)).toBe(true)

    move(50, 50, second)
    globalThis.dispatchEvent(pointer_event(`pointerup`, 50, 50, second))
    expect(position(element)).toEqual([`10px`, `20px`])
    expect(on_drag_end).not.toHaveBeenCalled()

    move(15, 25, first)
    dispatch_end(element, first)
    expect(on_drag_end).toHaveBeenCalledOnce()
    expect(document.body.style.userSelect).toBe(``)
    expect(element.hasPointerCapture(3)).toBe(false)
    move(50, 50, first)
    expect(position(element)).toEqual([`20px`, `40px`])
  })

  it(`does not set up dragging when disabled`, () => {
    const element = create_fixed_box()
    expect(draggable({ disabled: true })(element)).toBeUndefined()
    expect(element.style.cursor).toBe(``)

    drag(element, [5, 5], [50, 50])
    expect(position(element)).toEqual([``, ``])
  })

  it(`warns and returns undefined for a missing handle selector`, () => {
    const warn_spy = vi.spyOn(console, `warn`).mockImplementation(() => {})

    expect(
      draggable({ handle_selector: `.nonexistent` })(create_element()),
    ).toBeUndefined()
    expect(warn_spy).toHaveBeenCalledWith(expect.stringContaining(`.nonexistent`))
  })

  it(`drags only when the event originates from handle_selector`, () => {
    const element = create_fixed_box({ left: 0, top: 0 })
    const handle = document.createElement(`div`)
    handle.className = `drag-handle`
    element.append(handle)
    attach_draggable(element, { handle_selector: `.drag-handle` })

    drag(element, [0, 0], [50, 50])
    expect(position(element)).toEqual([``, ``])

    drag(handle, [0, 0], [30, 40])
    expect(position(element)).toEqual([`30px`, `40px`])
  })

  it(`ignores a second primary press and cleans up mid-drag`, () => {
    const element = create_fixed_box({ left: 0, top: 0 })
    const cleanup = draggable()(element)
    element.dispatchEvent(pointer_event(`pointerdown`, 5, 5, { pointerId: 1 }))
    expect(document.body.style.userSelect).toBe(`none`)
    expect(element.style.cursor).toBe(`grabbing`)

    // a second primary press must not replace the first pointer follower
    element.dispatchEvent(pointer_event(`pointerdown`, 8, 8, { pointerId: 2 }))
    cleanup?.() // unmount mid-drag, before any release
    expect([document.body.style.userSelect, element.style.cursor]).toEqual([``, ``])

    move(100, 100, { pointerId: 1 })
    expect(position(element)).toEqual([`0px`, `0px`])
  })
})
