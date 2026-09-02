// Print one element as its own document. The dialog exposes no handle on the suggested PDF
// filename (it comes from document.title) or on pagination, so both are set up here and
// undone on afterprint.

export interface PrintOptions {
  // suggested PDF filename, applied by swapping document.title for the print's duration
  filename?: string
  // size the page to the element rather than paginate it, however long the element is
  single_page?: boolean
  // printed page width in mm, single_page only; defaults to A4 portrait
  page_width_mm?: number
  // Converts the measured height into @page's mm. 96 is the CSS inch every engine prints
  // at; override where zoom scales absolute units, so the rect converts at the real ratio.
  px_per_inch?: number
}

// `prefix-YYYY-MM-DD`, the shape most "save as PDF" buttons want
export const format_print_filename = (prefix: string, date = new Date()): string => {
  const month = String(date.getMonth() + 1).padStart(2, `0`)
  const day = String(date.getDate()).padStart(2, `0`)
  return `${prefix}-${date.getFullYear()}-${month}-${day}`
}

// marks the element the injected rules apply to, so the caller's markup stays unknown here
const print_attr = `data-print-target`

// afterprint lands a turn of the event loop after print() returns, so back-to-back calls
// overlap: without this the second reads the first's filename as the title to restore, and
// the page keeps that filename for good
let title_swap_in_flight = false

// Headless and embedded webviews return from print() without firing afterprint, leaving the
// swapped title and injected rules standing and title_swap_in_flight blocking later swaps.
// Long enough that a dialog a user actually opened has closed first.
const AFTERPRINT_TIMEOUT_MS = 60_000

// Stamped into the marker attribute so a print only clears its own: the attribute is shared
// node state, and a watchdog still armed from a print that never ended would otherwise strip
// a later print's marker.
let print_seq = 0

export const print_element = (node: HTMLElement, options: PrintOptions = {}): void => {
  const { filename, single_page = false, page_width_mm = 210, px_per_inch = 96 } = options

  let style: HTMLStyleElement | null = null
  // non-null only for the call that owns the swap, which is the only one that restores
  let restore_title: string | null = null
  let watchdog: ReturnType<typeof setTimeout> | undefined
  const token = `${++print_seq}`

  const cleanup = () => {
    // afterprint and the watchdog each disarm the other; a leftover one would fire during
    // a later print and strip that print's setup
    clearTimeout(watchdog)
    globalThis.removeEventListener(`afterprint`, cleanup)
    if (restore_title !== null) {
      document.title = restore_title
      restore_title = null // stops a second cleanup restoring it again
      title_swap_in_flight = false
    }
    // the selector matches on presence, so the token is invisible to the printed rules
    if (node.getAttribute(print_attr) === token) node.removeAttribute(print_attr)
    style?.remove()
  }

  if (filename !== undefined && !title_swap_in_flight) {
    restore_title = document.title
    title_swap_in_flight = true
    document.title = filename
  }

  if (single_page) {
    node.setAttribute(print_attr, token)
    // measured as the element stands on screen, so a caller's own @media print rule that
    // changes its height is not reflected here
    const height_px = node.getBoundingClientRect().height
    const height_mm = Math.ceil((height_px * 25.4) / px_per_inch)

    // ancestors are cleared too: a scrolling container clips the element to its own height
    style = document.createElement(`style`)
    style.textContent = `@media print {
  @page { size: ${page_width_mm}mm ${height_mm}mm; margin: 0 }
  [${print_attr}] { width: ${page_width_mm}mm !important; max-width: none !important; margin: 0 !important; box-sizing: border-box !important; box-shadow: none !important }
  html, body, [${print_attr}] { height: auto !important; max-height: none !important; overflow: visible !important }
}`
    document.head.append(style)
  }

  // no setup means no listener/watchdog needs to retain `node`
  if (restore_title !== null || style) {
    // afterprint covers both saving and canceling the dialog
    globalThis.addEventListener(`afterprint`, cleanup, { once: true })
    watchdog = setTimeout(cleanup, AFTERPRINT_TIMEOUT_MS)
  }
  // a print() that throws fires no afterprint, so title and rules would outlive the call
  try {
    globalThis.print()
  } catch (error) {
    cleanup()
    throw error
  }
}
