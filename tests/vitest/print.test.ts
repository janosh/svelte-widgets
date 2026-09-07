import { format_print_filename, print_page } from '$lib/print'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

// happy-dom has no window.print and never fires afterprint, so print is spied and the
// event dispatched by hand.
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

const after_print = () => globalThis.dispatchEvent(new Event(`afterprint`))
test(`format_print_filename appends the date, zero-padded`, () => {
  expect(format_print_filename(`report`, new Date(2026, 6, 5))).toBe(`report-2026-07-05`)
  expect(format_print_filename(`cv`, new Date(2026, 11, 31))).toBe(`cv-2026-12-31`)
})

test(`filename swaps document.title for the print and restores it after`, () => {
  document.title = `Some Page`
  print_page({ filename: `janosh-cv-2026-07-27` })

  expect(document.title).toBe(`janosh-cv-2026-07-27`) // browsers suggest it as the PDF name
  expect(print_spy).toHaveBeenCalledTimes(1)

  after_print()
  expect(document.title).toBe(`Some Page`)
})

// afterprint lands a turn late; the second print must not capture the swapped title.
test(`overlapping prints restore the title the first one found`, () => {
  document.title = `Some Page`
  print_page({ filename: `first-print` })
  print_page({ filename: `second-print` })

  expect(document.title).toBe(`first-print`) // the second call does not re-swap
  after_print()
  expect(document.title).toBe(`Some Page`)
})

test(`without a filename the title is left alone`, () => {
  const add_listener = vi.spyOn(globalThis, `addEventListener`)
  document.title = `Untouched`
  print_page()

  expect(document.title).toBe(`Untouched`)
  expect(print_spy).toHaveBeenCalledTimes(1)
  expect(add_listener).not.toHaveBeenCalledWith(
    `afterprint`,
    expect.any(Function),
    expect.anything(),
  )
  add_listener.mockRestore()
})

// a print() that throws never fires afterprint, so nothing else would undo the swap
test(`a print that throws still restores the title`, () => {
  document.title = `Docs`
  const print_error = new Error(`print blocked`)
  print_spy.mockImplementationOnce(() => {
    throw print_error
  })

  expect(() => print_page({ filename: `docs-print` })).toThrow(print_error)

  expect(document.title).toBe(`Docs`)
})

test(`a second cleanup leaves a title the app set in the meantime alone`, () => {
  document.title = `Docs`
  print_spy.mockImplementationOnce(() => {
    after_print()
    document.title = `App Renamed`
    throw new Error(`print blocked`)
  })

  expect(() => print_page({ filename: `docs-print` })).toThrow(`print blocked`)
  expect(document.title).toBe(`App Renamed`)
})

// headless and embedded webviews return from print() without ever firing afterprint,
// leaving the title swapped and later filename swaps disabled
test(`a print that never fires afterprint is undone by the watchdog`, () => {
  vi.useFakeTimers()
  document.title = `Docs`
  print_page({ filename: `docs-print` })
  expect(document.title).toBe(`docs-print`)

  vi.advanceTimersByTime(60_000)

  expect(document.title).toBe(`Docs`)
  // the swap flag reset too, so a later print still gets its filename
  print_page({ filename: `later-print` })
  expect(document.title).toBe(`later-print`)
})

test(`a completed print disarms its watchdog before the next print`, () => {
  vi.useFakeTimers()
  document.title = `Docs`
  print_page({ filename: `first` })
  after_print()
  expect(vi.getTimerCount()).toBe(0)
  vi.advanceTimersByTime(30_000)
  print_page({ filename: `second` })
  vi.advanceTimersByTime(30_000)
  expect(document.title).toBe(`second`)
  after_print()
  expect(document.title).toBe(`Docs`)
})
