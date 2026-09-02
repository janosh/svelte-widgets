import { format_print_filename, print_element } from '$lib/print'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'

// happy-dom has no window.print and never fires afterprint, so print is spied and the
// event dispatched by hand. Heights are stubbed too: the DOM does no layout, so every
// element reports 0 and the mm arithmetic would be vacuous.
const print_spy = vi.fn()
let original_title = ``

beforeEach(() => {
  vi.stubGlobal(`print`, print_spy)
  print_spy.mockClear()
  original_title = document.title
})
afterEach(() => {
  after_print() // the dialog always closes eventually
  vi.useRealTimers() // the watchdog cases opt into fake ones
  vi.unstubAllGlobals()
  document.title = original_title
})

const make_target = (height_px: number): HTMLElement => {
  const node = document.createElement(`section`)
  document.body.append(node)
  // only height is read, so the cast stands in for the rest of DOMRect
  vi.spyOn(node, `getBoundingClientRect`).mockReturnValue({
    height: height_px,
  } as DOMRect)
  return node
}
const after_print = () => globalThis.dispatchEvent(new Event(`afterprint`))
const print_styles = () =>
  [...document.head.querySelectorAll(`style`)].filter((style) =>
    style.textContent?.includes(`@page`),
  )
const page_rule = () => /@page \{[^}]*\}/u.exec(print_styles()[0]?.textContent ?? ``)?.[0]

test(`format_print_filename appends the date, zero-padded`, () => {
  expect(format_print_filename(`report`, new Date(2026, 6, 5))).toBe(`report-2026-07-05`)
  expect(format_print_filename(`cv`, new Date(2026, 11, 31))).toBe(`cv-2026-12-31`)
})

test(`filename swaps document.title for the print and restores it after`, () => {
  document.title = `Some Page`
  print_element(make_target(500), { filename: `janosh-cv-2026-07-27` })

  expect(document.title).toBe(`janosh-cv-2026-07-27`) // browsers suggest it as the PDF name
  expect(print_spy).toHaveBeenCalledTimes(1)

  after_print()
  expect(document.title).toBe(`Some Page`)
})

// afterprint lands a turn late; the second print must not capture the swapped title.
test(`overlapping prints restore the title the first one found`, () => {
  document.title = `Some Page`
  print_element(make_target(500), { filename: `first-print` })
  print_element(make_target(500), { filename: `second-print` })

  expect(document.title).toBe(`first-print`) // the second call does not re-swap
  after_print()
  expect(document.title).toBe(`Some Page`)
})

test(`without a filename the title is left alone`, () => {
  const add_listener = vi.spyOn(globalThis, `addEventListener`)
  document.title = `Untouched`
  print_element(make_target(500))

  expect(document.title).toBe(`Untouched`)
  expect(print_styles()).toHaveLength(0) // single_page is opt-in
  expect(print_spy).toHaveBeenCalledTimes(1)
  expect(add_listener).not.toHaveBeenCalledWith(
    `afterprint`,
    expect.any(Function),
    expect.anything(),
  )
  add_listener.mockRestore()
})

test.each([
  // [height_px, options, expected @page size]
  [960, {}, `210mm 254mm`], // 10in at 96 CSS px per inch
  [960, { page_width_mm: 148 }, `148mm 254mm`], // A5 instead of the A4 default
  [960, { px_per_inch: 192 }, `210mm 127mm`], // a context reporting scaled pixels
  [100, {}, `210mm 27mm`], // 26.46mm rounded up, never onto a second sheet
])(`single_page sizes the page to the element (%i px)`, (height, options, expected) => {
  const node = make_target(height)
  print_element(node, { single_page: true, ...options })

  expect(page_rule()).toBe(`@page { size: ${expected}; margin: 0 }`)
  expect(node.hasAttribute(`data-print-target`)).toBe(true)
  // rules must reach the element and the ancestors that would clip it
  const css = print_styles()[0].textContent ?? ``
  expect(css).toContain(`[data-print-target] { width: ${expected.split(` `)[0]}`)
  expect(css).toContain(`html, body, [data-print-target] { height: auto !important`)
})

// an injected rule outliving the print would resize every later @page on the document
test(`afterprint removes the injected @page rule and the target marker`, () => {
  const node = make_target(960)
  document.title = `Docs`
  print_element(node, { single_page: true, filename: `docs-print` })
  expect(print_styles()).toHaveLength(1)

  after_print()

  expect(print_styles()).toHaveLength(0)
  expect(node.hasAttribute(`data-print-target`)).toBe(false)
  expect(document.title).toBe(`Docs`)
})

// a print() that throws never fires afterprint, so nothing else would undo the swap
test(`a print that throws still restores the title, marker and style`, () => {
  const node = make_target(960)
  document.title = `Docs`
  const print_error = new Error(`print blocked`)
  print_spy.mockImplementationOnce(() => {
    throw print_error
  })

  expect(() =>
    print_element(node, { single_page: true, filename: `docs-print` }),
  ).toThrow(print_error)

  expect(document.title).toBe(`Docs`)
  expect(node.hasAttribute(`data-print-target`)).toBe(false)
  expect(print_styles()).toHaveLength(0)
})

test(`a second cleanup leaves a title the app set in the meantime alone`, () => {
  const node = make_target(500)
  document.title = `Docs`
  print_spy.mockImplementationOnce(() => {
    after_print()
    document.title = `App Renamed`
    throw new Error(`print blocked`)
  })

  expect(() => print_element(node, { filename: `docs-print` })).toThrow(`print blocked`)
  expect(document.title).toBe(`App Renamed`)
})

// headless and embedded webviews return from print() without ever firing afterprint,
// leaving the title swapped, the rules injected and later filename swaps disabled
test(`a print that never fires afterprint is undone by the watchdog`, () => {
  vi.useFakeTimers()
  const node = make_target(960)
  document.title = `Docs`
  print_element(node, { single_page: true, filename: `docs-print` })
  expect(document.title).toBe(`docs-print`)

  vi.advanceTimersByTime(60_000)

  expect(document.title).toBe(`Docs`)
  expect(node.hasAttribute(`data-print-target`)).toBe(false)
  expect(print_styles()).toHaveLength(0)
  // the swap flag reset too, so a later print still gets its filename
  print_element(node, { filename: `later-print` })
  expect(document.title).toBe(`later-print`)
})

// both prints share the marker on one node, so the first print's cleanup must leave the
// second alone whether it was disarmed by afterprint or is still armed. Without token
// ownership the armed one strips the live marker mid-dialog.
test.each([
  [`disarmed by afterprint`, true],
  [`still armed, its own print never having ended`, false],
])(`a first watchdog %s leaves the second print alone`, (_desc, first_print_ends) => {
  vi.useFakeTimers()
  const node = make_target(960)
  print_element(node, { single_page: true })
  if (first_print_ends) {
    after_print()
    // pins the disarm: without it, failures blame the marker, not the stale timer
    expect(vi.getTimerCount()).toBe(0)
  }

  vi.advanceTimersByTime(30_000)
  print_element(node, { single_page: true, page_width_mm: 100 })
  vi.advanceTimersByTime(30_000) // the first watchdog's deadline passes here

  expect(print_styles()).toHaveLength(1) // one live style, not a growing stack
  expect(page_rule()).toBe(`@page { size: 100mm 254mm; margin: 0 }`)
  expect(node.hasAttribute(`data-print-target`)).toBe(true)
})
