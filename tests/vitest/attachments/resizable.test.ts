import type { ResizableOptions } from '$lib/attachments'
import { resizable } from '$lib/attachments'
import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import {
  create_element,
  mock_rect,
  pointer_event,
  press_key as dispatch_key,
} from '../index'

describe(`resizable`, () => {
  // every case resizes the same 200x150 box unless it needs its own position
  const create_box = (rect = { left: 0, top: 0, width: 200, height: 150 }) => {
    const element = create_element(`div`, { width: `200px`, height: `150px` })
    mock_rect(element, rect)
    return element
  }
  const attach_resizable = (element: HTMLElement, options: ResizableOptions = {}) =>
    onTestFinished(resizable(options)(element) ?? (() => {}))
  // the handle the browser hit-tests, in place of coordinates near an edge
  const handle_of = (box: HTMLElement, attribute: string, value: string) => {
    const handle = box.querySelector<HTMLElement>(`[${attribute}="${value}"]`)
    if (!handle) throw new Error(`no ${value} ${attribute} on ${box.outerHTML}`)
    return handle
  }
  const grip = (box: HTMLElement, edge = `right`) =>
    handle_of(box, `data-resize-edge`, edge)
  const corner_grip = (box: HTMLElement, corner = `bottom-right`) =>
    handle_of(box, `data-resize-corner`, corner)

  it(`cleans up when pointer capture is rejected`, () => {
    const element = create_box()
    const [on_resize, on_resize_end] = [vi.fn(), vi.fn()]
    attach_resizable(element, { on_resize, on_resize_end })
    vi.spyOn(element, `setPointerCapture`).mockImplementation(() => {
      throw new DOMException(`stale pointer`, `NotFoundError`)
    })

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    expect(document.body.style.userSelect).toBe(``)
    expect(on_resize_end).toHaveBeenCalledOnce()

    globalThis.dispatchEvent(pointer_event(`pointermove`, 400, 75))
    expect(on_resize).not.toHaveBeenCalled()
  })

  // `touch-action` has no per-region form, so each strip is a real element carrying its own
  // — and its cursor, which needs no hover handler now
  it.each([
    [`right`, `ew-resize`, `width`, [`top`, `bottom`], `vertical`, `200`],
    [`bottom`, `ns-resize`, `height`, [`left`, `right`], `horizontal`, `150`],
    [`left`, `ew-resize`, `width`, [`top`, `bottom`], `vertical`, `200`],
    [`top`, `ns-resize`, `height`, [`left`, `right`], `horizontal`, `150`],
  ] as const)(
    `the %s strip grabs %s`,
    (edge, cursor, thickness, across, orientation, value) => {
      const element = create_box()
      attach_resizable(element, { edges: [edge], handle_size: 20 })
      const handle = grip(element, edge)
      const { style } = handle

      expect([style.cursor, style.touchAction, style.position]).toEqual([
        cursor,
        `none`,
        `absolute`,
      ])
      // pinned at both ends of the cross axis, so neither corner of the edge is dead
      expect([style[thickness], style[edge], style[across[0]], style[across[1]]]).toEqual(
        [`20px`, `0px`, `0px`, `0px`],
      )
      expect([
        handle.tabIndex,
        handle.getAttribute(`role`),
        handle.getAttribute(`aria-orientation`),
        handle.getAttribute(`aria-valuemin`),
        // an uncapped axis has no infinite aria value, so it reports the largest safe one
        handle.getAttribute(`aria-valuemax`),
        handle.getAttribute(`aria-valuenow`),
        handle.getAttribute(`aria-label`),
      ]).toEqual([
        0,
        `separator`,
        orientation,
        `50`,
        `${Number.MAX_SAFE_INTEGER}`,
        value,
        `Resize from ${edge} edge`,
      ])
    },
  )

  it(`reports a functional width cap below the minimum as both aria limits`, () => {
    const element = create_box()
    attach_resizable(element, { edges: [`right`], max_width: () => 30 })
    const handle = grip(element)

    expect([
      handle.getAttribute(`aria-valuemin`),
      handle.getAttribute(`aria-valuemax`),
    ]).toEqual([`30`, `30`])
  })

  // Absolute children anchor to the padding box, so a strip flush with its edge sits inside
  // the border, leaving the visible edge — grabbable back when this hit-tested — dead.
  it(`offsets each strip outward by the border it covers`, () => {
    const element = create_box()
    element.style.borderStyle = `solid`
    element.style.borderWidth = `4px 6px 8px 10px` // top right bottom left
    attach_resizable(element, { edges: [`right`, `bottom`] })

    const right = grip(element, `right`).style
    expect([right.right, right.top, right.bottom]).toEqual([`-6px`, `-4px`, `-8px`])
    const bottom = grip(element, `bottom`).style
    expect([bottom.bottom, bottom.left, bottom.right]).toEqual([`-8px`, `-10px`, `-6px`])
  })

  it(`preserves content-box dimensions at zero pointer delta`, () => {
    const element = create_box()
    Object.assign(element.style, {
      boxSizing: `content-box`,
      padding: `10px 12px`,
      border: `3px solid`,
    })
    mock_rect(element, { left: 0, top: 0, width: 230, height: 176 })
    const on_resize = vi.fn()
    const cleanup = resizable({ min_width: 20, on_resize })(element)
    onTestFinished(() => {
      globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 80))
      cleanup?.()
    })

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 230, 80))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 230, 80))
    // 230 border-box minus the 30px of padding and border CSS width excludes here
    expect(element.style.width).toBe(`200px`)

    globalThis.dispatchEvent(pointer_event(`pointermove`, 0, 80))
    expect(element.style.width).toBe(`0px`)
    expect(on_resize).toHaveBeenLastCalledWith(expect.any(PointerEvent), {
      width: 30,
      height: 176,
    })
  })

  // A height-only drag that also pinned the width would freeze a responsive element at
  // whatever it happened to measure the first time anyone grabbed it
  it(`writes only the axis its grab controls`, () => {
    const element = create_box()
    Object.assign(element.style, { width: ``, height: `` })
    attach_resizable(element, { edges: [`bottom`] })

    grip(element, `bottom`).dispatchEvent(pointer_event(`pointerdown`, 100, 145))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 100, 245))

    expect([element.style.width, element.style.height]).toEqual([``, `250px`])
    globalThis.dispatchEvent(pointer_event(`pointerup`, 100, 245))
  })

  // aria values describe the node a strip resizes, so an outer instance rewriting every
  // separator it can find would make a nested pane's handles report the wrong size
  it(`leaves a nested resizable's separator values alone`, () => {
    const outer = create_box()
    const inner = create_element(`div`, { width: `80px`, height: `60px` })
    mock_rect(inner, { left: 0, top: 0, width: 80, height: 60 })
    outer.append(inner)
    attach_resizable(inner, { edges: [`right`] })
    attach_resizable(outer, { edges: [`right`] })
    const outer_strip = outer.querySelector(`:scope > [data-resize-edge="right"]`)

    expect(grip(inner).getAttribute(`aria-valuenow`)).toBe(`80`)

    outer_strip?.dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 295, 75))

    expect(outer_strip?.getAttribute(`aria-valuenow`)).toBe(`300`)
    expect(grip(inner).getAttribute(`aria-valuenow`)).toBe(`80`)
    globalThis.dispatchEvent(pointer_event(`pointerup`, 295, 75))
  })

  // detaching a strip does not unbind its listeners, so a consumer holding one could still
  // press it and resize a node this attachment no longer manages
  it(`stops responding to a strip retained across cleanup`, () => {
    const element = create_box()
    const on_resize = vi.fn()
    const cleanup = resizable({ on_resize })(element)
    const strip = grip(element)

    cleanup?.()
    strip.dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 300, 75))
    expect(on_resize).not.toHaveBeenCalled()
    expect(element.style.width).toBe(`200px`) // untouched from create_box
  })

  it(`creates a strip per edge, plus a handle per corner the edges form`, () => {
    const element = create_box()
    const cleanup = resizable({ edges: [`right`, `bottom`, `top`] })(element)

    const strips = [...element.querySelectorAll(`[data-resize-edge]`)]
    expect(strips.map((strip) => strip.getAttribute(`data-resize-edge`))).toEqual([
      `top`,
      `bottom`,
      `right`,
    ])
    // only the two corners whose *both* edges are enabled; `left` is absent so its are too
    const corners = [...element.querySelectorAll(`[data-resize-corner]`)]
    expect(corners.map((corner) => corner.getAttribute(`data-resize-corner`))).toEqual([
      `top-right`,
      `bottom-right`,
    ])
    const corner = corner_grip(element, `top-right`)
    expect([corner.tabIndex, corner.getAttribute(`aria-hidden`)]).toEqual([-1, `true`])
    expect(corner.style.cursor).toBe(`nesw-resize`)
    // corners come last so they paint over the strip overlap they sit on
    expect(element.lastElementChild?.getAttribute(`data-resize-corner`)).toBe(
      `bottom-right`,
    )

    cleanup?.()
    expect(
      element.querySelectorAll(`[data-resize-edge], [data-resize-corner]`),
    ).toHaveLength(0)

    // an `edges` change re-runs the attachment; the old handles must not survive it
    attach_resizable(element, { edges: [`left`] })
    const after = [...element.querySelectorAll(`[data-resize-edge]`)]
    expect(after.map((strip) => strip.getAttribute(`data-resize-edge`))).toEqual([`left`])
    // one edge forms no corner
    expect(element.querySelectorAll(`[data-resize-corner]`)).toHaveLength(0)
  })

  // The whole point of a corner: dragging it moves both axes, where the edge strips it
  // overlaps would each move only their own.
  it.each([
    [`bottom-right`, 300, 250, 300, 250],
    [`top-left`, -50, -30, 250, 180],
  ] as const)(`the %s corner resizes both axes`, (corner, to_x, to_y, width, height) => {
    const element = create_box()
    const on_resize = vi.fn()
    attach_resizable(element, {
      edges: [`top`, `right`, `bottom`, `left`],
      on_resize,
    })

    const handle = corner_grip(element, corner)
    expect(handle.style.cursor).toBe(`nwse-resize`)

    const [from_x, from_y] = corner === `bottom-right` ? [200, 150] : [0, 0]
    handle.dispatchEvent(pointer_event(`pointerdown`, from_x, from_y))
    globalThis.dispatchEvent(pointer_event(`pointermove`, to_x, to_y))

    expect([element.style.width, element.style.height]).toEqual([
      `${width}px`,
      `${height}px`,
    ])
    // a top/left corner grows away from the pointer, so the far corner has to stay put
    if (corner === `top-left`) {
      expect([element.style.left, element.style.top]).toEqual([`-50px`, `-30px`])
    }
    expect(on_resize).toHaveBeenLastCalledWith(expect.any(PointerEvent), {
      width,
      height,
    })
    globalThis.dispatchEvent(pointer_event(`pointerup`, to_x, to_y))
  })

  it(`locks a corner drag to its pointer-down aspect ratio while Shift is held`, () => {
    const element = create_box()
    attach_resizable(element, { edges: [`right`, `bottom`] })
    const handle = corner_grip(element)

    handle.dispatchEvent(pointer_event(`pointerdown`, 200, 150))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 300, 160, { shiftKey: true }))

    expect([element.style.width, element.style.height]).toEqual([`300px`, `225px`])
    globalThis.dispatchEvent(pointer_event(`pointerup`, 300, 160))
  })

  it.each([
    [`right`, `ArrowRight`, false, `210px`, `150px`, ``],
    [`right`, `ArrowRight`, true, `250px`, `150px`, ``],
    [`left`, `ArrowLeft`, false, `210px`, `150px`, `-10px`],
    [`bottom`, `ArrowDown`, true, `200px`, `200px`, ``],
    [`top`, `ArrowUp`, true, `200px`, `200px`, `-50px`],
  ] as const)(
    `resizes from the %s edge via %s (Shift: %s)`,
    (edge, key, shift_key, width, height, position) => {
      const element = create_box()
      attach_resizable(element, { edges: [edge] })

      const event = dispatch_key(grip(element, edge), key, { shiftKey: shift_key })

      expect(event.defaultPrevented).toBe(true)
      expect([element.style.width, element.style.height]).toEqual([width, height])
      expect(element.style[edge === `left` ? `left` : `top`]).toBe(position)
    },
  )

  it(`resets a keyboard resize with Enter`, () => {
    const element = create_box()
    const [on_resize_start, on_resize_reset] = [vi.fn(), vi.fn()]
    attach_resizable(element, { edges: [`right`], on_resize_start, on_resize_reset })
    const handle = grip(element, `right`)

    dispatch_key(handle, `ArrowRight`, { shiftKey: true })
    expect(on_resize_start).toHaveBeenCalledWith(expect.any(KeyboardEvent), {
      width: 200,
      height: 150,
    })

    expect(dispatch_key(handle, `Enter`).defaultPrevented).toBe(true)
    expect(handle.getAttribute(`aria-keyshortcuts`)?.split(` `)).toContain(`Enter`)
    expect([element.style.width, element.style.height]).toEqual([``, `150px`])
    expect(on_resize_reset).toHaveBeenCalledWith(expect.any(KeyboardEvent), {
      width: 200,
      height: 150,
    })
  })

  // the one visible way back from a manual resize, so it has to clear what the drag wrote
  it.each<[string, ResizableOptions | undefined, string, string]>([
    [`a strip`, undefined, ``, ``],
    // width-only must not wipe a consumer-set height
    [`a strip of a width-only instance`, { edges: [`right`] }, ``, `240px`],
  ])(`double-clicking %s clears managed sizes`, (_desc, options, width, height) => {
    const element = create_box()
    const on_resize_reset = vi.fn()
    attach_resizable(element, { ...options, on_resize_reset })
    element.style.width = `320px`
    element.style.height = `240px`

    grip(element).dispatchEvent(pointer_event(`dblclick`, 195, 75))
    expect([element.style.width, element.style.height]).toEqual([width, height])
    expect(on_resize_reset).toHaveBeenCalledWith(expect.any(MouseEvent), {
      width: 200,
      height: 150,
    })
  })

  it(`leaves a double-click on the content alone`, () => {
    const element = create_box()
    attach_resizable(element)
    element.style.width = `320px`

    element.dispatchEvent(pointer_event(`dblclick`, 100, 75))
    expect(element.style.width).toBe(`320px`)
  })

  // left/top are also written by `draggable` on the same node, so a reset that blanks them
  // unconditionally would snap a dragged element back to wherever its stylesheet puts it
  it(`double-click leaves a left/top this instance never wrote`, () => {
    const element = create_box()
    attach_resizable(element, { edges: [`left`, `top`] })
    // stands in for draggable having positioned the node
    element.style.left = `60px`
    element.style.top = `60px`

    grip(element, `left`).dispatchEvent(pointer_event(`dblclick`, 5, 75))
    expect([element.style.left, element.style.top]).toEqual([`60px`, `60px`])
  })

  it.each([
    [`min_width`, { min_width: 100 }, `right`, [50, 75], `width`, `100px`],
    [`max_width`, { max_width: 300 }, `right`, [500, 75], `width`, `300px`],
    [`min_height`, { min_height: 80 }, `bottom`, [100, 30], `height`, `80px`],
    [`max_height`, { max_height: 250 }, `bottom`, [100, 400], `height`, `250px`],
  ] as const)(
    `respects the %s constraint`,
    (_constraint, options, edge, [drag_client_x, drag_client_y], dimension, expected) => {
      const element = create_box()
      attach_resizable(element, options)

      grip(element, edge).dispatchEvent(pointer_event(`pointerdown`, 195, 145))
      globalThis.dispatchEvent(pointer_event(`pointermove`, drag_client_x, drag_client_y))

      expect(element.style[dimension]).toBe(expected)

      globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))
    },
  )

  it(`resolves functional size limits for each gesture`, () => {
    const element = create_box()
    let current_max_width = 240
    attach_resizable(element, { max_width: () => current_max_width })
    current_max_width = 260

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 500, 75))

    expect(element.style.width).toBe(`260px`)
    globalThis.dispatchEvent(pointer_event(`pointerup`, 500, 75))
  })

  // a second finger drives and ends nothing; the resize belongs to the first, until the OS
  // takes it away — cancel or lost capture both end it
  it.each([
    [
      `pointercancel`,
      (el: HTMLElement, id: number) =>
        globalThis.dispatchEvent(
          pointer_event(`pointercancel`, 250, 75, { pointerId: id }),
        ),
    ],
    [
      `lostpointercapture`,
      (el: HTMLElement, id: number) =>
        el.dispatchEvent(pointer_event(`lostpointercapture`, 250, 75, { pointerId: id })),
    ],
  ])(`ignores another pointer, ends on %s`, (_end_type, dispatch_end) => {
    const element = create_box()
    const on_resize_end = vi.fn()
    attach_resizable(element, { on_resize_end })

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75, { pointerId: 1 }))
    expect(element.hasPointerCapture(1)).toBe(true)
    globalThis.dispatchEvent(pointer_event(`pointermove`, 400, 75, { pointerId: 2 }))
    globalThis.dispatchEvent(pointer_event(`pointerup`, 400, 75, { pointerId: 2 }))
    expect(element.style.width).toBe(`200px`) // untouched from create_box
    expect(on_resize_end).not.toHaveBeenCalled()

    globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75, { pointerId: 1 }))
    dispatch_end(element, 1)
    expect(element.style.width).toBe(`255px`)
    expect(on_resize_end).toHaveBeenCalledOnce()
    expect(document.body.style.userSelect).toBe(``)
    expect(element.hasPointerCapture(1)).toBe(false)
  })

  // every way a gesture can fail to be a resize. A non-primary press matters most: the
  // context menu it opens can swallow the release, leaving the element stuck to the cursor
  it.each([
    [
      `a press on the content, clear of every strip`,
      (box: HTMLElement) => box.dispatchEvent(pointer_event(`pointerdown`, 100, 75)),
    ],
    [
      `a non-primary button on a strip`,
      (box: HTMLElement) =>
        grip(box).dispatchEvent(pointer_event(`pointerdown`, 195, 75, { button: 2 })),
    ],
  ])(`does not start resizing on %s`, (_desc, gesture) => {
    const element = create_box()
    const [on_resize_start, on_resize, on_resize_end] = [vi.fn(), vi.fn(), vi.fn()]
    attach_resizable(element, { on_resize_start, on_resize, on_resize_end })

    gesture(element)
    globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75))
    globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))

    expect(on_resize_start).not.toHaveBeenCalled()
    expect(on_resize).not.toHaveBeenCalled()
    expect(on_resize_end).not.toHaveBeenCalled()
    expect(element.style.width).toBe(`200px`) // untouched from create_box
  })

  it(`fires on_resize_start, on_resize and on_resize_end callbacks`, () => {
    const element = create_box()

    const [on_resize_start, on_resize, on_resize_end] = [vi.fn(), vi.fn(), vi.fn()]

    attach_resizable(element, { on_resize_start, on_resize, on_resize_end })

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    expect(document.body.style.userSelect).toBe(`none`)
    expect(on_resize_start).toHaveBeenCalledTimes(1)
    expect(on_resize_start).toHaveBeenCalledWith(expect.any(PointerEvent), {
      width: 200,
      height: 150,
    })

    globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75))
    expect(on_resize).toHaveBeenCalledTimes(1)
    expect(on_resize).toHaveBeenCalledWith(expect.any(PointerEvent), {
      width: 255,
      height: 150,
    })

    // End resize
    globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))
    expect(document.body.style.userSelect).toBe(``)
    expect(on_resize_end).toHaveBeenCalledTimes(1)
    expect(on_resize_end).toHaveBeenCalledWith(
      expect.any(PointerEvent),
      { width: 200, height: 150 }, // offsetWidth/Height from mock
    )
  })

  it.each([
    [
      `left`,
      { left: 100, top: 50, width: 200, height: 150 },
      [105, 100],
      [55, 100],
      { width: `250px`, left: `-50px` },
    ],
    [
      `top`,
      { left: 100, top: 100, width: 200, height: 150 },
      [200, 105],
      [200, 55],
      { height: `200px`, top: `-50px` },
    ],
  ] as const)(
    `handles a %s edge resize with position adjustment`,
    (
      _edge,
      rect,
      [start_client_x, start_client_y],
      [drag_client_x, drag_client_y],
      expected_styles,
    ) => {
      const element = create_box(rect)
      attach_resizable(element, { edges: [_edge] })

      grip(element, _edge).dispatchEvent(
        pointer_event(`pointerdown`, start_client_x, start_client_y),
      )
      globalThis.dispatchEvent(pointer_event(`pointermove`, drag_client_x, drag_client_y))

      for (const [property, value] of Object.entries(expected_styles)) {
        expect(element.style.getPropertyValue(property)).toBe(value)
      }

      globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))
    },
  )

  it(`does nothing when disabled`, () => {
    const element = create_box()
    const cleanup = resizable({ disabled: true })(element)

    expect(cleanup).toBeUndefined()
    expect(element.style.position).toBe(``) // disabled skips the position: relative fixup
    expect(element.querySelectorAll(`[data-resize-edge]`)).toHaveLength(0)
  })

  it.each([
    [`width`, { min_width: 300, max_width: 100 }],
    [`height`, { min_height: 300, max_height: 100 }],
  ] as const)(`warns and skips invalid %s constraints`, (_dimension, options) => {
    const element = create_box()
    const warn = vi.spyOn(console, `warn`).mockImplementation(() => undefined)
    onTestFinished(() => warn.mockRestore())

    expect(resizable(options)(element)).toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`min dimensions exceed max dimensions`),
    )
    expect(element.querySelectorAll(`[data-resize-edge]`)).toHaveLength(0)
  })

  it.each([
    [`static`, `relative`],
    [`absolute`, `absolute`],
  ])(`position %s becomes %s, then restores`, (initial_position, expected_position) => {
    const element = create_box()
    element.style.position = initial_position

    const cleanup = resizable()(element)
    expect(element.style.position).toBe(expected_position)
    cleanup?.()
    expect(element.style.position).toBe(initial_position)
  })

  it(`restores body userSelect when cleaned up mid-resize`, () => {
    const element = create_box()
    const on_resize = vi.fn()

    const cleanup = resizable({ on_resize })(element)
    document.body.style.userSelect = `text`
    onTestFinished(() => void document.body.style.removeProperty(`user-select`))
    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    expect(document.body.style.userSelect).toBe(`none`)

    cleanup?.() // unmount mid-resize, before any release
    expect(document.body.style.userSelect).toBe(`text`)
    expect(element.querySelectorAll(`[data-resize-edge]`)).toHaveLength(0)

    globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75))
    expect(on_resize).not.toHaveBeenCalled()
  })
})
