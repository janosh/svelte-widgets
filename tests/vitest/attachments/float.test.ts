import { float } from '$lib/attachments'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { create_element, mock_rect, stub_prop } from '../index'

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
      onTestFinished(stub_prop(globalThis, `scrollX`, scroll_x))
      onTestFinished(stub_prop(globalThis, `scrollY`, scroll_y))
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
    onTestFinished(stub_prop(node, `ownerDocument`, { defaultView: animation_host }))
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

  it.each([
    [`disabled`, { enabled: false }],
    [`no anchor`, { anchor: null }],
  ] as const)(`%s attaches nothing`, (_desc, options) => {
    const node = create_element()
    expect(float({ anchor: anchor_rect, ...options })(node)).toBeUndefined()
    expect(node.style.position).toBe(``)
  })
})
