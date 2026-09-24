import { draggable, resizable, type ResizableOptions } from '$lib/attachments'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  create_element,
  mock_rect,
  pointer_event,
  press_key as dispatch_key,
} from '../index'

describe(`resizable`, () => {
  // every case resizes the same 200x150 box
  const create_box = () => {
    const element = create_element(`div`, { width: `200px`, height: `150px` })
    mock_rect(element, { left: 0, top: 0, width: 200, height: 150 })
    return element
  }
  // cleanup also ends any gesture a test leaves active
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
  const handle_names = (box: HTMLElement, attribute: string) =>
    [...box.querySelectorAll(`[${attribute}]`)].map((el) => el.getAttribute(attribute))
  const drag = (handle: HTMLElement, from: number[], to: number[], shift_key = false) => {
    handle.dispatchEvent(pointer_event(`pointerdown`, from[0], from[1]))
    globalThis.dispatchEvent(
      pointer_event(`pointermove`, to[0], to[1], { shiftKey: shift_key }),
    )
  }
  const size_of = ({ style }: HTMLElement) => [style.width, style.height]

  it(`cleans up when pointer capture is rejected`, () => {
    const element = create_box()
    const [on_resize, on_resize_end] = [vi.fn(), vi.fn()]
    attach_resizable(element, { on_resize, on_resize_end })
    vi.spyOn(element, `setPointerCapture`).mockImplementation(() => {
      throw new DOMException(`stale pointer`, `NotFoundError`)
    })

    drag(grip(element), [195, 75], [400, 75])
    expect(document.body.style.userSelect).toBe(``)
    expect(on_resize_end).toHaveBeenCalledOnce()
    expect(on_resize).not.toHaveBeenCalled()
  })

  // `touch-action` has no per-region form, so each strip is a real element with its own
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
      const aria = [`orientation`, `valuemin`, `valuemax`, `valuenow`, `label`]
      expect([
        handle.tabIndex,
        handle.getAttribute(`role`),
        ...aria.map((name) => handle.getAttribute(`aria-${name}`)),
      ]).toEqual([
        0,
        `separator`,
        orientation,
        `50`,
        // an uncapped axis has no infinite aria value, so it reports the largest safe one
        `${Number.MAX_SAFE_INTEGER}`,
        value,
        `Resize from ${edge} edge`,
      ])
    },
  )

  // handle labels are announced and interpolate the edge, so translations must reach it
  it(`labels rename every resize handle, edge included`, () => {
    const element = create_box()
    attach_resizable(element, {
      edges: [`right`, `bottom`],
      labels: {
        handle: (edge) => `Größe ändern: ${edge === `right` ? `rechts` : `unten`}`,
      },
    })
    expect(
      [`bottom`, `right`].map((edge) => grip(element, edge).getAttribute(`aria-label`)),
    ).toEqual([`Größe ändern: unten`, `Größe ändern: rechts`])
  })

  it(`resolves functional size limits per gesture, capping aria limits below the min`, () => {
    const element = create_box()
    let current_max_width = 30
    attach_resizable(element, { edges: [`right`], max_width: () => current_max_width })
    const aria_limits = () =>
      [`min`, `max`].map((bound) => grip(element).getAttribute(`aria-value${bound}`))
    expect(aria_limits()).toEqual([`30`, `30`])

    current_max_width = 260
    drag(grip(element), [195, 75], [500, 75])
    expect(element.style.width).toBe(`260px`)
    expect(aria_limits()).toEqual([`50`, `260`])
  })

  // absolute children anchor to the padding box, so a strip flush with its edge sits inside
  // the border, leaving the visible (grabbable) edge dead
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
    attach_resizable(element, { min_width: 20, on_resize })

    drag(grip(element), [230, 80], [230, 80])
    // 230 border-box minus the 30px of padding and border CSS width excludes here
    expect(element.style.width).toBe(`200px`)

    globalThis.dispatchEvent(pointer_event(`pointermove`, 0, 80))
    expect(element.style.width).toBe(`0px`)
    expect(on_resize).toHaveBeenLastCalledWith(expect.any(PointerEvent), {
      width: 30,
      height: 176,
    })
  })

  // pinning the untouched axis too would freeze a responsive element at its first measure
  it(`writes only the axis its grab controls`, () => {
    const element = create_box()
    Object.assign(element.style, { width: ``, height: `` })
    attach_resizable(element, { edges: [`bottom`] })

    drag(grip(element, `bottom`), [100, 145], [100, 245])
    expect(size_of(element)).toEqual([``, `250px`])
  })

  // an outer instance rewriting every separator would make a nested pane report wrong sizes
  it(`leaves a nested resizable's separator values alone`, () => {
    const outer = create_box()
    const inner = create_element(`div`, { width: `80px`, height: `60px` })
    mock_rect(inner, { left: 0, top: 0, width: 80, height: 60 })
    outer.append(inner)
    attach_resizable(inner, { edges: [`right`] })
    attach_resizable(outer, { edges: [`right`] })
    const outer_strip = outer.lastElementChild // appended after inner, and no corners
    if (!(outer_strip instanceof HTMLElement)) throw new Error(`missing outer strip`)

    drag(outer_strip, [195, 75], [295, 75])
    expect(outer_strip.getAttribute(`aria-valuenow`)).toBe(`300`)
    expect(grip(inner).getAttribute(`aria-valuenow`)).toBe(`80`)
  })

  it(`creates a strip per edge plus a corner per edge pair, all removed on cleanup`, () => {
    const element = create_box()
    const on_resize = vi.fn()
    const cleanup = resizable({ edges: [`right`, `bottom`, `top`], on_resize })(element)

    expect(handle_names(element, `data-resize-edge`)).toEqual([`top`, `bottom`, `right`])
    // only the two corners whose *both* edges are enabled; `left` is absent so its are too
    expect(handle_names(element, `data-resize-corner`)).toEqual([
      `top-right`,
      `bottom-right`,
    ])
    const corner = handle_of(element, `data-resize-corner`, `top-right`)
    expect([corner.tabIndex, corner.getAttribute(`aria-hidden`)]).toEqual([-1, `true`])
    expect(corner.style.cursor).toBe(`nesw-resize`)
    // corners come last so they paint over the strip overlap they sit on
    expect(element.lastElementChild?.getAttribute(`data-resize-corner`)).toBe(
      `bottom-right`,
    )

    const strip = grip(element)
    cleanup?.()
    expect(
      element.querySelectorAll(`[data-resize-edge], [data-resize-corner]`),
    ).toHaveLength(0)
    // detaching a strip does not unbind its listeners, so a retained one could still resize
    drag(strip, [195, 75], [300, 75])
    expect(on_resize).not.toHaveBeenCalled()
    expect(element.style.width).toBe(`200px`)

    // an `edges` change re-runs the attachment; the old handles must not survive it
    attach_resizable(element, { edges: [`left`] })
    expect(handle_names(element, `data-resize-edge`)).toEqual([`left`])
    expect(handle_names(element, `data-resize-corner`)).toEqual([]) // one edge, no corner
  })

  // the point of a corner: both axes at once, where the strips it overlaps move only one
  it.each([
    [`bottom-right`, [200, 150], [300, 250], false, [300, 250], [``, ``]],
    [`top-left`, [0, 0], [-50, -30], false, [250, 180], [`-50px`, `-30px`]],
    // Shift locks the pointer-down aspect ratio
    [`bottom-right`, [200, 150], [300, 160], true, [300, 225], [``, ``]],
  ] as const)(
    `the %s corner resizes both axes (Shift: %4$s)`,
    (corner, from, to, shift_key, [width, height], position) => {
      const element = create_box()
      const on_resize = vi.fn()
      attach_resizable(element, { edges: [`top`, `right`, `bottom`, `left`], on_resize })
      const handle = handle_of(element, `data-resize-corner`, corner)
      expect(handle.style.cursor).toBe(`nwse-resize`)

      drag(handle, [...from], [...to], shift_key)
      expect(size_of(element)).toEqual([`${width}px`, `${height}px`])
      expect([element.style.left, element.style.top]).toEqual(position)
      expect(on_resize).toHaveBeenLastCalledWith(expect.any(PointerEvent), {
        width,
        height,
      })
    },
  )

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
      expect(size_of(element)).toEqual([width, height])
      expect(element.style[edge === `left` ? `left` : `top`]).toBe(position)
    },
  )

  it(`resets a keyboard resize with Enter`, () => {
    const element = create_box()
    const [on_resize_start, on_resize_reset] = [vi.fn(), vi.fn()]
    attach_resizable(element, { edges: [`right`], on_resize_start, on_resize_reset })
    const handle = grip(element, `right`)
    const initial = { width: 200, height: 150 }

    dispatch_key(handle, `ArrowRight`, { shiftKey: true })
    expect(on_resize_start).toHaveBeenCalledWith(expect.any(KeyboardEvent), initial)

    expect(dispatch_key(handle, `Enter`).defaultPrevented).toBe(true)
    expect(handle.getAttribute(`aria-keyshortcuts`)?.split(` `)).toContain(`Enter`)
    expect(size_of(element)).toEqual([``, `150px`])
    expect(on_resize_reset).toHaveBeenCalledWith(expect.any(KeyboardEvent), initial)
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
    expect(size_of(element)).toEqual([width, height])
    expect(on_resize_reset).toHaveBeenCalledWith(expect.any(MouseEvent), {
      width: 200,
      height: 150,
    })
  })

  // `draggable` writes left/top on the same node, so a blanket reset would snap it back
  it(`double-click ignores content and keeps a left/top this instance never wrote`, () => {
    const element = create_box()
    attach_resizable(element, { edges: [`left`, `top`] })
    // stands in for draggable having positioned the node
    Object.assign(element.style, { width: `320px`, left: `60px`, top: `60px` })

    element.dispatchEvent(pointer_event(`dblclick`, 100, 75))
    expect(element.style.width).toBe(`320px`)

    grip(element, `left`).dispatchEvent(pointer_event(`dblclick`, 5, 75))
    expect([element.style.width, element.style.left, element.style.top]).toEqual([
      ``,
      `60px`,
      `60px`,
    ])
  })

  it.each([
    [`min_width`, { min_width: 100 }, `right`, [50, 75], `width`, `100px`],
    [`max_width`, { max_width: 300 }, `right`, [500, 75], `width`, `300px`],
    [`min_height`, { min_height: 80 }, `bottom`, [100, 30], `height`, `80px`],
    [`max_height`, { max_height: 250 }, `bottom`, [100, 400], `height`, `250px`],
  ] as const)(
    `respects the %s constraint`,
    (_constraint, options, edge, to, dimension, expected) => {
      const element = create_box()
      attach_resizable(element, options)
      drag(grip(element, edge), [195, 145], [...to])
      expect(element.style[dimension]).toBe(expected)
    },
  )

  // a second finger drives nothing; only the first pointer or the OS can end the resize
  it.each([
    [
      `pointercancel`,
      (_el: HTMLElement, init: PointerEventInit) =>
        globalThis.dispatchEvent(pointer_event(`pointercancel`, 250, 75, init)),
    ],
    [
      `lostpointercapture`,
      (el: HTMLElement, init: PointerEventInit) =>
        el.dispatchEvent(pointer_event(`lostpointercapture`, 250, 75, init)),
    ],
  ])(`ignores another pointer, ends on %s`, (_end_type, dispatch_end) => {
    const element = create_box()
    const on_resize_end = vi.fn()
    attach_resizable(element, { on_resize_end })
    const [first, second] = [{ pointerId: 1 }, { pointerId: 2 }]

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75, first))
    expect(element.hasPointerCapture(1)).toBe(true)
    globalThis.dispatchEvent(pointer_event(`pointermove`, 400, 75, second))
    globalThis.dispatchEvent(pointer_event(`pointerup`, 400, 75, second))
    expect(element.style.width).toBe(`200px`)
    expect(on_resize_end).not.toHaveBeenCalled()

    globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75, first))
    dispatch_end(element, first)
    expect(element.style.width).toBe(`255px`)
    expect(on_resize_end).toHaveBeenCalledOnce()
    expect(document.body.style.userSelect).toBe(``)
    expect(element.hasPointerCapture(1)).toBe(false)
  })

  // the non-primary press matters most: the context menu it opens can swallow the release,
  // leaving the element stuck to the cursor
  it.each([
    [`a press on the content, clear of every strip`, (box: HTMLElement) => box, {}],
    [`a non-primary button on a strip`, (box: HTMLElement) => grip(box), { button: 2 }],
  ])(`does not start resizing on %s`, (_desc, target_of, init) => {
    const element = create_box()
    const [on_resize_start, on_resize, on_resize_end] = [vi.fn(), vi.fn(), vi.fn()]
    attach_resizable(element, { on_resize_start, on_resize, on_resize_end })

    target_of(element).dispatchEvent(pointer_event(`pointerdown`, 100, 75, init))
    globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75))
    globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))

    for (const callback of [on_resize_start, on_resize, on_resize_end]) {
      expect(callback).not.toHaveBeenCalled()
    }
    expect(element.style.width).toBe(`200px`)
  })

  it(`fires on_resize_start, on_resize and on_resize_end callbacks`, () => {
    const element = create_box()
    const [on_resize_start, on_resize_end] = [vi.fn(), vi.fn()]
    // consumers can convert the reported pixels back to their own responsive units
    const on_resize = vi.fn((_event: unknown, { width }: { width: number }) => {
      element.style.width = `${(width / 500) * 100}%`
    })
    attach_resizable(element, { on_resize_start, on_resize, on_resize_end })

    grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75))
    expect(document.body.style.userSelect).toBe(`none`)
    expect(on_resize_start).toHaveBeenCalledExactlyOnceWith(expect.any(PointerEvent), {
      width: 200,
      height: 150,
    })

    globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75))
    expect(on_resize).toHaveBeenCalledExactlyOnceWith(expect.any(PointerEvent), {
      width: 255,
      height: 150,
    })
    expect(element.style.width).toBe(`51%`)

    globalThis.dispatchEvent(pointer_event(`pointerup`, 0, 0))
    expect(document.body.style.userSelect).toBe(``)
    // offsetWidth/Height from the mock
    expect(on_resize_end).toHaveBeenCalledExactlyOnceWith(expect.any(PointerEvent), {
      width: 200,
      height: 150,
    })
  })

  // invalid limits would make clamp() inconsistent, so they are refused like disabled
  it.each([
    [`disabled`, { disabled: true }, 0],
    [`invalid width limits`, { min_width: 300, max_width: 100 }, 1],
    [`invalid height limits`, { min_height: 300, max_height: 100 }, 1],
  ] as const)(`attaches nothing when %s`, (_desc, options, n_warnings) => {
    const element = create_box()
    const warn = vi.spyOn(console, `warn`).mockImplementation(() => undefined)
    onTestFinished(() => warn.mockRestore())

    expect(resizable(options)(element)).toBeUndefined()
    expect(warn.mock.calls.flat()).toEqual(
      Array(n_warnings).fill(
        expect.stringContaining(`min dimensions exceed max dimensions`),
      ),
    )
    expect(element.style.position).toBe(``) // skips the position: relative fixup
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

  it.each([`resize first`, `drag first`])(
    `restores shared selection after %s cleanup`,
    (order) => {
      const element = create_box()
      const on_resize = vi.fn()
      const cleanup = resizable({ on_resize })(element)
      const drag_box = create_box()
      const cleanup_drag = draggable()(drag_box)
      document.body.style.setProperty(`user-select`, `text`, `important`)
      onTestFinished(() => void document.body.style.removeProperty(`user-select`))
      grip(element).dispatchEvent(pointer_event(`pointerdown`, 195, 75))
      drag_box.dispatchEvent(
        pointer_event(`pointerdown`, 10, 10, { pointerId: 2, pointerType: `touch` }),
      )
      expect(document.body.style.userSelect).toBe(`none`)

      const cleanups =
        order === `resize first` ? [cleanup, cleanup_drag] : [cleanup_drag, cleanup]
      cleanups[0]?.() // unmount one owner while the other gesture remains active
      cleanups[0]?.() // releases are idempotent
      expect(document.body.style.userSelect).toBe(`none`)
      cleanups[1]?.()
      expect(document.body.style.userSelect).toBe(`text`)
      expect(document.body.style.getPropertyPriority(`user-select`)).toBe(`important`)
      expect(element.querySelectorAll(`[data-resize-edge]`)).toHaveLength(0)

      globalThis.dispatchEvent(pointer_event(`pointermove`, 250, 75))
      expect(on_resize).not.toHaveBeenCalled()
    },
  )
})
