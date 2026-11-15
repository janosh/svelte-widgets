import { float } from '#lib/attachments/index.ts'
import { describe, expect, it, vi } from 'vite-plus/test'
import { create_element, mock_rect, stub_props, stub_resize_observer } from '../index'

describe(`float`, () => {
  // anchor as a bare rect, so no element geometry has to be mocked for the anchor
  const anchor_rect = { top: 100, bottom: 140, left: 60, right: 200 }
  const floating_node = () => {
    const node = create_element()
    mock_rect(node, { left: 0, top: 0, width: 50, height: 20 })
    return node
  }
  const sizing = ({ style }: HTMLElement) => [
    style.width,
    style.minWidth,
    style.boxSizing,
  ]

  it.each([
    [`fixed`, 0, 0],
    // absolute is measured against the document, so page scroll has to be added back
    [`absolute`, 400, 700],
  ] as const)(
    `%s strategy positions relative to the right origin`,
    (strategy, scroll_x, scroll_y) => {
      stub_props(globalThis, { scrollX: scroll_x, scrollY: scroll_y })
      const node = floating_node()
      const cleanup = float({
        anchor: anchor_rect,
        strategy,
        placement: `bottom`,
        align: `start`,
      })(node)

      expect(node.style.position).toBe(strategy)
      // bottom placement sits below the anchor, start aligns the left edges
      expect([node.style.top, node.style.left]).toEqual([
        `${140 + scroll_y}px`,
        `${60 + scroll_x}px`,
      ])
      expect(node.dataset.placement).toBe(`bottom`)
      cleanup?.()
      expect(node.dataset.placement).toBeUndefined()
    },
  )

  // a consumer remains free to change sizing when the attachment only positions
  it.each([
    [true, {}, [`140px`, `140px`, `border-box`], [`20px`, `10rem`, `content-box`]],
    [
      false,
      { width: `40px`, minWidth: `5px`, boxSizing: `border-box` },
      [`20px`, `10rem`, `content-box`],
      [`40px`, `5px`, `border-box`],
    ],
  ])(
    `restores only owned styles with match_width=%s`,
    (match_width, consumer_sizing, attached, restored) => {
      const node = floating_node()
      node.style.cssText = `position: sticky; left: 1px; top: 2px; box-sizing: content-box; min-width: 10rem; width: 20px`
      node.dataset.placement = `original`
      const cleanup = float({ anchor: anchor_rect, match_width })(node)
      expect(sizing(node)).toEqual(attached)

      Object.assign(node.style, consumer_sizing)
      cleanup?.()
      expect([node.style.position, node.style.left, node.style.top]).toEqual([
        `sticky`,
        `1px`,
        `2px`,
      ])
      expect(sizing(node)).toEqual(restored)
      expect(node.dataset.placement).toBe(`original`)
    },
  )

  it(`uses the floating window's scroll and stops updating after cleanup`, () => {
    const animation_host = Object.assign(new EventTarget(), {
      scrollX: 25,
      scrollY: 35,
      requestAnimationFrame: vi.fn((callback: FrameRequestCallback) => {
        callback(0)
        return 42
      }),
      cancelAnimationFrame: vi.fn(),
    }) as unknown as Window
    const node = floating_node()
    stub_props(node, { ownerDocument: { defaultView: animation_host } })
    const cleanup = float({
      anchor: anchor_rect,
      placement: `bottom`,
      strategy: `absolute`,
    })(node)
    expect([node.style.left, node.style.top]).toEqual([`130px`, `175px`])

    node.style.top = `0px`
    animation_host.dispatchEvent(new Event(`scroll`))
    expect(node.style.top).toBe(`175px`)
    cleanup?.()
    animation_host.dispatchEvent(new Event(`scroll`))
    expect(node.style.top).toBe(``)
  })

  // anchor 100..140 in an 800x400 viewport, floating box 50x20 (60x30 with margins)
  it.each([
    [`no margins`, `top`, ``, [`80px`, `60px`]],
    // the margin box sits against the anchor: below, margin-top is the gap; above,
    // both vertical margins come off
    [`margins`, `bottom`, `margin: 4px 0 6px 10px`, [`140px`, `60px`]],
    [`margins`, `top`, `margin: 4px 0 6px 10px`, [`70px`, `60px`]],
  ] as const)(
    `places the margin box with %s, placement=%s`,
    (_desc, placement, css, expected) => {
      stub_props(globalThis, { innerWidth: 800, innerHeight: 400 })
      const node = floating_node()
      node.style.cssText = css
      float({ anchor: anchor_rect, placement, align: `start`, flip: false })(node)
      expect([node.style.top, node.style.left]).toEqual(expected)
    },
  )

  // 400px tall viewport; the anchor overflows past both vertical edges once moved
  it.each([
    // overflowing below: an edge list without `bottom` leaves it there, unlike true
    [[`top`], { top: 390, bottom: 400 }, `bottom`, 20, `400px`],
    [true, { top: 390, bottom: 400 }, `bottom`, 20, `380px`],
    [[`bottom`], { top: 390, bottom: 400 }, `bottom`, 20, `380px`],
    [[`top`], { top: 10, bottom: 40 }, `top`, 20, `0px`],
    [[`bottom`], { top: 10, bottom: 40 }, `top`, 20, `-10px`],
    [false, { top: 10, bottom: 40 }, `top`, 20, `-10px`],
    // taller than the viewport: with both edges, the top edge wins
    [[`top`, `bottom`], { top: 10, bottom: 40 }, `top`, 500, `0px`],
  ] as const)(
    `shift=%j clamps only the listed edges`,
    (shift, rect, placement, height, top) => {
      stub_props(globalThis, { innerWidth: 800, innerHeight: 400 })
      const node = floating_node()
      mock_rect(node, { left: 0, top: 0, width: 50, height })
      float({ anchor: { ...rect, left: 60, right: 200 }, placement, flip: false, shift })(
        node,
      )
      expect(node.style.top).toBe(top)
      expect(node.style.left).toBe(`105px`) // a top-only edge list never shifts sideways
    },
  )

  it(`tracks floating and anchor resizes and releases observers on cleanup`, async () => {
    const { observed, resize } = stub_resize_observer()
    const anchor = create_element()
    mock_rect(anchor, { left: 20, top: 300, width: 200, height: 30 })
    const node = floating_node()
    mock_rect(node, { left: 0, top: 0, width: 200, height: 100 })
    const cleanup = float({ anchor, placement: `top`, flip: false, match_width: true })(
      node,
    )
    expect(node.style.top).toBe(`200px`)

    mock_rect(node, { left: 0, top: 0, width: 200, height: 200 })
    resize(node)
    await new Promise(requestAnimationFrame)
    expect(node.style.top).toBe(`100px`)

    mock_rect(anchor, { left: 20, top: 300, width: 300, height: 50 })
    resize(anchor)
    await new Promise(requestAnimationFrame)
    expect(node.style.width).toBe(`300px`)
    cleanup?.()
    expect(observed().size).toBe(0)
  })

  it.each([
    [`disabled`, { enabled: false }],
    [`no anchor`, { anchor: null }],
  ] as const)(`%s attaches nothing`, (_desc, options) => {
    const node = create_element()
    expect(float({ anchor: anchor_rect, ...options })(node)).toBeUndefined()
    expect(node.style.position).toBe(``)
  })
})
