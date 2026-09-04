import PaneDivider from '$lib/SplitPane.svelte'
import { flushSync, mount, unmount } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'

let notify_resize = () => {}

const pointer_event = (type: string, init: PointerEventInit = {}): PointerEvent =>
  new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init })

type PixelClamps = {
  min_px?: number
  max_px?: number
  second_min_px?: number
  first_px?: number
}
type Size = { width: number; height: number }
// `clamps` is copied by descriptor so a bindable `first_px` accessor pair (see bound_first_px)
// survives; `size` may be a getter for container resizes
const mount_divider = (
  orientation: `horizontal` | `vertical`,
  direction: `ltr` | `rtl` = `ltr`,
  ratio?: number,
  clamps: PixelClamps = {},
  size: Size | (() => Size) = { width: 400, height: 200 },
) => {
  const parent = document.createElement(`div`)
  parent.dir = direction
  parent.style.direction = direction
  document.body.append(parent)
  parent.getBoundingClientRect = () =>
    DOMRect.fromRect({ x: 100, y: 50, ...(typeof size === `function` ? size() : size) })
  const props = Object.defineProperties(
    { orientation, ratio },
    Object.getOwnPropertyDescriptors(clamps),
  )
  vi.stubGlobal(
    `ResizeObserver`,
    class implements ResizeObserver {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      constructor(callback: ResizeObserverCallback) {
        notify_resize = () => callback([], this)
      }
    },
  )
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  const component = mount(PaneDivider, { target: parent, props })
  onTestFinished(() => unmount(component).finally(() => parent.remove()))
  flushSync()
  const divider = parent.querySelector<HTMLElement>(`[role="separator"]`)
  if (!divider) throw new Error(`Missing separator`)
  return { divider, parent }
}
// A bound first_px readable through a plain accessor (Svelte writes bindable props through the
// prop descriptor's setter)
const bound_first_px = (initial: number, clamps: Omit<PixelClamps, `first_px`>) => {
  let value = initial
  return {
    ...clamps,
    get first_px() {
      return value
    },
    set first_px(next: number) {
      value = next
    },
  }
}

test.each([
  [`horizontal`, `ltr`, { clientX: 400 }, `vertical`],
  [`horizontal`, `rtl`, { clientX: 200 }, `vertical`],
  [`vertical`, `ltr`, { clientY: 200 }, `horizontal`],
] as const)(
  `%s %s divider resizes during pointer movement`,
  (orientation, direction, position, aria) => {
    const { divider, parent } = mount_divider(orientation, direction)
    expect(divider.getAttribute(`aria-orientation`)).toBe(aria)
    // no pixel clamps: the announced range is the bare ratio range
    expect(divider.getAttribute(`aria-valuemin`)).toBe(`15`)
    expect(divider.getAttribute(`aria-valuemax`)).toBe(`85`)
    divider.dispatchEvent(pointer_event(`pointerdown`, { pointerId: 7 }))
    divider.dispatchEvent(pointer_event(`pointermove`, { ...position, pointerId: 7 }))

    // The split changes before pointerup, rather than snapping on release.
    expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`75%`)
    divider.dispatchEvent(pointer_event(`pointerup`, { pointerId: 7 }))
    divider.dispatchEvent(pointer_event(`pointermove`, { pointerId: 7 }))
    expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`75%`)
  },
)

test.each([
  [`horizontal LTR`, `horizontal`, `ltr`, `ArrowRight`, undefined, 10, 85],
  [`horizontal RTL`, `horizontal`, `rtl`, `ArrowLeft`, undefined, 10, 85],
  [`vertical`, `vertical`, `ltr`, `ArrowDown`, undefined, 10, 85],
  [`non-finite start`, `horizontal`, `ltr`, `ArrowRight`, Number.NaN, 1, 55],
] as const)(
  `%s keyboard resizing clamps`,
  (_name, orientation, direction, key, ratio, repeats, expected) => {
    const { divider, parent } = mount_divider(orientation, direction, ratio)
    for (let repeat = 0; repeat < repeats; repeat++) {
      divider.dispatchEvent(
        new KeyboardEvent(`keydown`, { key, bubbles: true, cancelable: true }),
      )
    }
    flushSync()
    const split_percentage = parent.style.getPropertyValue(`--split-pane-size`)
    expect(split_percentage.endsWith(`%`)).toBe(true)
    expect(Number(split_percentage.slice(0, -1))).toBeCloseTo(expected, 12)
    expect(divider.getAttribute(`aria-valuenow`)).toBe(`${expected}`)
  },
)

test(`an active drag ignores other pointers and ends on lost capture`, () => {
  const { divider, parent } = mount_divider(`horizontal`)
  divider.dispatchEvent(pointer_event(`pointerdown`, { pointerId: 7 }))
  divider.dispatchEvent(pointer_event(`pointerdown`, { pointerId: 8 }))
  divider.dispatchEvent(pointer_event(`pointermove`, { clientX: 400, pointerId: 8 }))
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`50%`)

  divider.dispatchEvent(pointer_event(`pointermove`, { clientX: 400, pointerId: 7 }))
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`75%`)
  divider.dispatchEvent(pointer_event(`lostpointercapture`, { pointerId: 7 }))
  divider.dispatchEvent(pointer_event(`pointermove`, { clientX: 200, pointerId: 7 }))
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`75%`)

  divider.dispatchEvent(pointer_event(`pointerdown`, { button: 1, pointerId: 9 }))
  divider.dispatchEvent(pointer_event(`pointermove`, { clientX: 200, pointerId: 9 }))
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`75%`)
})

// Pixel clamps tighten the [15%, 85%] ratio clamps using the container's measured size (400
// px wide, 200 px tall here); an over-constrained container settles at the first pane's floor,
// and a floor wider than the container caps at 100% rather than pushing the divider outside.
// Rows: clamps, orientation, then (pointer coordinate along the axis, expected split %) pairs;
// the aria range announces the same tightened bounds (in %), not the bare 15/85
test.each([
  [{ min_px: 120 }, `horizontal`, 120, 30, 480, 85],
  [{ min_px: 500, second_min_px: 50 }, `horizontal`, 120, 100, 480, 100],
  [{ max_px: 100 }, `horizontal`, 480, 25, 120, 15],
  [{ second_min_px: 300 }, `horizontal`, 480, 25, 120, 15],
  [{ min_px: 80 }, `vertical`, 60, 40, 240, 85],
  [{ min_px: 200, second_min_px: 300 }, `horizontal`, 120, 50, 480, 50],
] as const)(
  `%j clamps %s pointer drags in pixels`,
  (clamps, orientation, low, low_pct, high, high_pct) => {
    const { divider, parent } = mount_divider(orientation, `ltr`, 0.5, clamps)
    expect(divider.getAttribute(`aria-valuemin`)).toBe(`${Math.min(low_pct, high_pct)}`)
    expect(divider.getAttribute(`aria-valuemax`)).toBe(`${Math.max(low_pct, high_pct)}`)
    const axis = orientation === `horizontal` ? `clientX` : `clientY`
    divider.dispatchEvent(pointer_event(`pointerdown`, { pointerId: 4 }))
    for (const [coord, pct] of [
      [low, low_pct],
      [high, high_pct],
    ]) {
      divider.dispatchEvent(pointer_event(`pointermove`, { [axis]: coord, pointerId: 4 }))
      expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`${pct}%`)
    }
  },
)

test(`an initial ratio outside the pixel clamps is shown clamped`, () => {
  const { divider, parent } = mount_divider(`horizontal`, `ltr`, 0.2, { min_px: 160 })
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`40%`)
  expect(divider.getAttribute(`aria-valuenow`)).toBe(`40`)
})

// Pixel mode (first_px set): the first pane is sized in px with no ratio clamps, so a 320 px
// sidebar stays 320 px in a 400 px or a 4000 px container; min_px/max_px/second_min_px clamp
// against the measured container and the clamped value is what gets written (and bound back)
test.each([
  [{ first_px: 320 }, 1000, `320px`, 320],
  [{ first_px: 320 }, 4000, `320px`, 320],
  [{ first_px: 320, second_min_px: 200 }, 400, `200px`, 200],
  [{ first_px: 320, min_px: 150, second_min_px: 200 }, 300, `150px`, 150],
  [{ first_px: 50, min_px: 150 }, 1000, `150px`, 150],
  [{ first_px: 900, max_px: 600 }, 1000, `600px`, 600],
] as const)(`%j in a %i px container shows %s`, (clamps, width, expected, aria_now) => {
  const { divider, parent } = mount_divider(`horizontal`, `ltr`, undefined, clamps, {
    width,
    height: 200,
  })
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(expected)
  expect(divider.getAttribute(`aria-valuenow`)).toBe(`${aria_now}`)
})

test(`pixel-mode drags move the first pane in px and bind the clamped value back`, () => {
  const bound = bound_first_px(320, { min_px: 150, second_min_px: 200 })
  const { divider, parent } = mount_divider(`horizontal`, `ltr`, undefined, bound, {
    width: 1000,
    height: 200,
  })
  const measure = vi.spyOn(parent, `getBoundingClientRect`)
  divider.dispatchEvent(pointer_event(`pointerdown`, { pointerId: 2 }))
  // container starts at x=100: pointer at 600 puts the divider 500 px in
  divider.dispatchEvent(pointer_event(`pointermove`, { clientX: 600, pointerId: 2 }))
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`500px`)
  expect(bound.first_px).toBe(500)
  // past the second pane's floor clamps to 800 px; below the first pane's floor to 150 px
  divider.dispatchEvent(pointer_event(`pointermove`, { clientX: 1500, pointerId: 2 }))
  expect(bound.first_px).toBe(800)
  divider.dispatchEvent(pointer_event(`pointermove`, { clientX: 120, pointerId: 2 }))
  expect(bound.first_px).toBe(150)
  divider.dispatchEvent(pointer_event(`pointerup`, { pointerId: 2 }))
  // one layout read per move (the container is measured once, not once per clamp)
  expect(measure).toHaveBeenCalledTimes(3)
})

// Keyboard steps 5% of the container (50 px here) and never drop below the first pane's floor
test(`pixel-mode keyboard resizing steps in px within the clamps`, () => {
  const { divider, parent } = mount_divider(
    `horizontal`,
    `ltr`,
    undefined,
    { first_px: 320, min_px: 150, second_min_px: 200 },
    { width: 1000, height: 200 },
  )
  const press = (key: string) =>
    divider.dispatchEvent(new KeyboardEvent(`keydown`, { key, bubbles: true }))
  press(`ArrowLeft`)
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`270px`)
  for (let repeat = 0; repeat < 4; repeat++) press(`ArrowLeft`)
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`150px`)
  press(`ArrowRight`)
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`200px`)
  flushSync()
  expect(divider.getAttribute(`aria-valuemin`)).toBe(`150`)
  expect(divider.getAttribute(`aria-valuemax`)).toBe(`800`)
  expect(divider.getAttribute(`aria-valuenow`)).toBe(`200`)
})

// A pixel-sized first pane follows the container: a shrink re-clamps what's shown without
// touching the bound preference, and growing back restores it
test(`pixel mode re-clamps on container resize without overwriting first_px`, () => {
  let width = 1000
  const bound = bound_first_px(320, { second_min_px: 200 })
  const { parent } = mount_divider(`horizontal`, `ltr`, undefined, bound, () => ({
    width,
    height: 200,
  }))
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`320px`)

  width = 400
  notify_resize()
  flushSync()
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`200px`)
  expect(bound.first_px).toBe(320)
  width = 1000
  notify_resize()
  flushSync()
  expect(parent.style.getPropertyValue(`--split-pane-size`)).toBe(`320px`)
})
