import { create_stick_to_bottom } from '#lib/attachments/index.ts'
import type { StickToBottomOptions } from '#lib/attachments/index.ts'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import { pointer_event, press_key } from '../index'

// `resize` fires the latest fake observer, the way a container or child resize would
let resize: () => void
const observed = new Set<Element>()
class FakeResizeObserver {
  constructor(callback: () => void) {
    resize = callback
  }
  observe = (node: Element) => observed.add(node)
  unobserve = (node: Element) => observed.delete(node)
  disconnect = () => observed.clear()
}

// happy-dom has no layout, so the scroll box is modeled by hand: the offset clamps to
// [0, extent - viewport] like a real one
const scroll_box = () => {
  const node = document.createElement(`div`)
  const box = { extent: 1000, viewport: 200, offset: 0 }
  Object.defineProperties(node, {
    scrollTop: {
      get: () => box.offset,
      set: (value: number) => {
        box.offset = Math.min(Math.max(0, value), box.extent - box.viewport)
      },
    },
    scrollHeight: { get: () => box.extent },
    clientHeight: { get: () => box.viewport },
  })
  document.body.append(node)
  return { node, box }
}
const scroll_to = (node: HTMLElement, offset: number) => {
  node.scrollTop = offset
  node.dispatchEvent(new Event(`scroll`))
}

beforeEach(() => {
  vi.stubGlobal(`ResizeObserver`, FakeResizeObserver)
})
afterEach(() => {
  vi.unstubAllGlobals()
  observed.clear()
  document.body.innerHTML = ``
})

describe(`stick_to_bottom`, () => {
  const setup = (options: StickToBottomOptions = {}, stuck = true) => {
    const { node, box } = scroll_box()
    const stick = create_stick_to_bottom(options)
    stick.stuck = stuck
    const cleanup = stick.attach(node)
    return { node, box, stick, cleanup }
  }

  test(`pins on attach and follows growth while stuck`, () => {
    const { node, box, stick } = setup()
    expect([stick.stuck, node.scrollTop, stick.distance]).toEqual([true, 800, 0])
    box.extent = 1500
    resize()
    expect([node.scrollTop, stick.distance, stick.far_from_end]).toEqual([1300, 0, false])
  })

  test(`setting stuck false before attaching starts detached and does not scroll`, () => {
    const { node, stick } = setup({}, false)
    expect([stick.stuck, node.scrollTop, stick.distance, stick.far_from_end]).toEqual([
      false,
      0,
      800,
      true,
    ])
  })

  // layout clamps the offset when content shrinks, emitting a scroll no reader made
  test.each<[string, string, (child: Element) => void]>([
    [`no input`, `p`, () => {}],
    [
      `a scroll key typed into an editable child`,
      `input`,
      (child) => press_key(child, `PageUp`),
    ],
    [`a non-scrolling key`, `p`, (child) => press_key(child, `a`)],
    [
      `a pointer press on content, not the scrollbar`,
      `p`,
      (child) => child.dispatchEvent(pointer_event(`pointerdown`, 0, 0)),
    ],
  ])(`a scroll after %s keeps it pinned`, (_desc, child_tag, input) => {
    const { node, stick } = setup()
    const child = document.createElement(child_tag)
    node.append(child)
    input(child)
    scroll_to(node, 300)
    expect(stick.stuck).toBe(true)
  })

  test.each<[string, (node: HTMLElement) => void]>([
    [`wheel`, (node) => node.dispatchEvent(new WheelEvent(`wheel`))],
    [`touchmove`, (node) => node.dispatchEvent(new Event(`touchmove`))],
    [`scroll key`, (node) => press_key(node, `PageUp`)],
    [`scrollbar drag`, (node) => node.dispatchEvent(pointer_event(`pointerdown`, 0, 0))],
  ])(`%s then scrolling away detaches; scrolling back re-pins`, (_desc, input) => {
    const stuck_seen: boolean[] = []
    const { node, box, stick } = setup({ on_scroll: () => stuck_seen.push(stick.stuck) })
    input(node)
    scroll_to(node, 300)
    expect([stick.stuck, stick.distance, stick.far_from_end]).toEqual([false, 500, true])
    // detached: growth no longer pulls the view along
    box.extent = 2000
    resize()
    expect(node.scrollTop).toBe(300)
    scroll_to(node, 1765) // within the default 40 px threshold
    // on_scroll runs after classification, so it sees the updated state
    expect(stuck_seen).toEqual([false, true])
    globalThis.dispatchEvent(new Event(`pointerup`))
  })

  test(`a smooth follow inside the input window stays stuck`, () => {
    const { node, box, stick } = setup()
    press_key(node, `End`)
    box.extent = 2000
    scroll_to(node, 1000) // first frame of the smooth scroll toward the new end, still far
    expect(stick.stuck).toBe(true)
  })

  test(`a held scrollbar drag outlives the input window until release`, () => {
    vi.useFakeTimers()
    try {
      const { node, stick } = setup()
      node.dispatchEvent(pointer_event(`pointerdown`, 0, 0))
      vi.advanceTimersByTime(5000)
      scroll_to(node, 300)
      expect(stick.stuck).toBe(false)
      scroll_to(node, 800)
      globalThis.dispatchEvent(new Event(`pointerup`))
      vi.advanceTimersByTime(1000)
      scroll_to(node, 300) // released and the window lapsed: layout, not the reader
      expect(stick.stuck).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  test(`threshold and far_threshold tune what counts as at and far from the end`, () => {
    const { node, stick } = setup({ threshold: 5, far_threshold: 100 })
    node.dispatchEvent(new WheelEvent(`wheel`))
    scroll_to(node, 790)
    expect([stick.stuck, stick.far_from_end]).toEqual([false, false])
    scroll_to(node, 700) // exactly far_threshold away already counts
    expect(stick.far_from_end).toBe(true)
    scroll_to(node, 796)
    expect(stick.stuck).toBe(true)
  })

  test(`setting stuck detaches or re-pins programmatically, and scroll_to_end pins`, () => {
    const { node, box, stick } = setup()
    stick.stuck = false
    box.extent = 1200
    stick.follow()
    expect(node.scrollTop).toBe(800)
    stick.stuck = true
    stick.follow()
    expect(node.scrollTop).toBe(1000)
    stick.stuck = false
    box.extent = 1400
    stick.scroll_to_end()
    expect([stick.stuck, node.scrollTop]).toEqual([true, 1200])
  })

  test(`behavior sets how following scrolls; scroll_to_end takes its own`, () => {
    const { node, stick } = setup({ behavior: `smooth` })
    const scroll_spy = vi.spyOn(node, `scrollTo`)
    stick.follow()
    expect(scroll_spy).toHaveBeenLastCalledWith({ top: 1000, behavior: `smooth` })
    stick.scroll_to_end(`instant`)
    expect(scroll_spy).toHaveBeenLastCalledWith({ top: 1000, behavior: `instant` })
  })

  test(`hold_position runs instead of following while detached`, () => {
    const hold_position = vi.fn()
    const { node, box, stick } = setup({ hold_position }, false)
    expect(hold_position).toHaveBeenCalledOnce() // from the detached attach
    stick.stuck = true
    box.extent = 1500
    resize()
    expect(node.scrollTop).toBe(1300)
    expect(hold_position).toHaveBeenCalledOnce()
    stick.stuck = false
    resize()
    expect(hold_position).toHaveBeenCalledTimes(2)
  })

  test.each([
    [`a finished selection detaches`, `selected text`, false],
    [`a collapsed selection stays pinned`, ``, true],
  ])(`selection pauses following; %s`, (_desc, text, stuck_after) => {
    const { node, box, stick } = setup()
    node.dispatchEvent(new Event(`selectstart`))
    expect(stick.selecting).toBe(true)
    box.extent = 1500
    resize()
    expect(node.scrollTop).toBe(800) // left where the reader is selecting
    vi.spyOn(globalThis, `getSelection`).mockReturnValue({
      isCollapsed: text === ``,
    } as Selection)
    globalThis.dispatchEvent(new Event(`pointerup`))
    expect([stick.selecting, stick.stuck]).toEqual([false, stuck_after])
    vi.restoreAllMocks()
  })

  test.each([
    [true, 1300],
    [false, 800],
  ])(
    `observe_mutations=%s: an appended child scrolls it to %i`,
    async (observe_mutations, expected) => {
      const { node, box } = setup({ observe_mutations })
      box.extent = 1500
      node.append(document.createElement(`p`))
      await Promise.resolve()
      expect(node.scrollTop).toBe(expected)
    },
  )

  test(`observe_children watches each direct child's size as children come and go`, async () => {
    const { node } = setup({ observe_children: true, observe_mutations: false })
    const [first, second] = [document.createElement(`p`), document.createElement(`p`)]
    node.append(first, second)
    await Promise.resolve()
    expect(observed).toEqual(new Set([node, first, second]))
    first.remove()
    await Promise.resolve()
    expect(observed).toEqual(new Set([node, second]))
  })

  test(`cleanup removes listeners and observers`, () => {
    const { node, box, stick, cleanup } = setup()
    node.dispatchEvent(new Event(`selectstart`))
    cleanup()
    expect([observed.size, stick.selecting]).toEqual([0, false])
    node.dispatchEvent(new WheelEvent(`wheel`))
    scroll_to(node, 100)
    expect(stick.stuck).toBe(true)
    box.extent = 1500
    stick.follow() // detached element: a no-op
    expect(node.scrollTop).toBe(100)
  })
})
