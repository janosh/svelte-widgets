import { float } from '$lib/attachments'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { create_element, mock_rect, stub_prop } from '../index'

describe(`float`, () => {
  const cleanups: (() => void)[] = []
  afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

  // anchor as a bare rect, so no element geometry has to be mocked for the anchor
  const anchor_rect = { top: 100, bottom: 140, left: 60, right: 200 }

  const attach_float = (options: Parameters<typeof float>[0] = {}) => {
    const node = create_element()
    mock_rect(node, { left: 0, top: 0, width: 50, height: 20 })
    const cleanup = float({ anchor: anchor_rect, ...options })(node)
    if (cleanup) cleanups.push(cleanup)
    return node
  }

  it.each([
    [`fixed`, `fixed`, 0, 0],
    // absolute is measured against the document, so page scroll has to be added back
    [`absolute`, `absolute`, 400, 700],
  ] as const)(
    `%s strategy positions relative to the right origin`,
    (_desc, strategy, scroll_x, scroll_y) => {
      cleanups.push(
        stub_prop(globalThis, `scrollX`, scroll_x),
        stub_prop(globalThis, `scrollY`, scroll_y),
      )

      const node = attach_float({ strategy, placement: `bottom`, align: `start` })

      expect(node.style.position).toBe(strategy)
      // bottom placement sits below the anchor, start aligns the left edges
      expect(node.style.top).toBe(`${140 + scroll_y}px`)
      expect(node.style.left).toBe(`${60 + scroll_x}px`)
    },
  )

  it.each([false, true])(
    `restores only owned sizing with match_width=%s`,
    (match_width) => {
      const matched = attach_float({ match_width: true })
      expect([
        matched.style.width,
        matched.style.minWidth,
        matched.style.boxSizing,
      ]).toEqual([`140px`, `140px`, `border-box`])
      expect(attach_float().style.width).toBe(``)

      const node = create_element()
      node.style.cssText = `position: sticky; left: 1px; top: 2px; box-sizing: content-box; min-width: 10rem; width: 20px`
      node.dataset.placement = `original`
      mock_rect(node, { left: 0, top: 0, width: 50, height: 20 })
      const cleanup = float({ anchor: anchor_rect, match_width })(node)
      // A consumer remains free to change sizing when the attachment only positions.
      if (!match_width)
        Object.assign(node.style, {
          width: `40px`,
          minWidth: `5px`,
          boxSizing: `border-box`,
        })
      cleanup?.()
      expect([node.style.position, node.style.left, node.style.top]).toEqual([
        `sticky`,
        `1px`,
        `2px`,
      ])
      expect([node.style.width, node.style.minWidth, node.style.boxSizing]).toEqual(
        match_width ? [`20px`, `10rem`, `content-box`] : [`40px`, `5px`, `border-box`],
      )
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
    const node = create_element()
    mock_rect(node, { left: 0, top: 0, width: 50, height: 20 })
    cleanups.push(stub_prop(node, `ownerDocument`, { defaultView: animation_host }))
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
