import { format_print_filename, print_page } from '#lib/print.ts'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'

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
  vi.unstubAllGlobals()
  document.title = original_title
})

const after_print = () => globalThis.dispatchEvent(new Event(`afterprint`))
test(`format_print_filename appends the date, zero-padded`, () => {
  expect(format_print_filename(`report`, new Date(2026, 6, 5))).toBe(`report-2026-07-05`)
  expect(format_print_filename(`cv`, new Date(2026, 11, 31))).toBe(`cv-2026-12-31`)
})

// headless and embedded webviews return from print() without ever firing afterprint, so a
// watchdog must restore the title and re-enable later filename swaps too
test.each([
  [`afterprint`, undefined],
  [`afterprint`, `App Renamed`],
  [`watchdog`, undefined],
  [`watchdog`, `App Renamed`],
])(`%s preserves app title %s`, (trigger, app_title) => {
  vi.useFakeTimers()
  document.title = `Docs`
  print_page({ filename: `docs-print` })
  expect(document.title).toBe(`docs-print`) // browsers suggest it as the PDF name
  expect(print_spy).toHaveBeenCalledTimes(1)

  if (app_title) document.title = app_title
  if (trigger === `watchdog`) vi.advanceTimersByTime(60_000)
  else after_print()
  expect(document.title).toBe(app_title ?? `Docs`)
  print_page({ filename: `later-print` })
  expect(document.title).toBe(`later-print`)
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
})

// a print() that throws never fires afterprint, so nothing else would undo the swap, and
// a second cleanup must not clobber a title the app set after the first one ran
test.each([
  [`restores the title`, () => {}, `Docs`],
  [
    `keeps a title the app set after afterprint`,
    () => {
      after_print()
      document.title = `App Renamed`
    },
    `App Renamed`,
  ],
])(`a print that throws %s`, (_case, during_print, expected_title) => {
  document.title = `Docs`
  print_spy.mockImplementationOnce(() => {
    during_print()
    throw new Error(`print blocked`)
  })
  expect(() => print_page({ filename: `docs-print` })).toThrow(`print blocked`)
  expect(document.title).toBe(expected_title)
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
