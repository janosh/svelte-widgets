// Print one element as a document of its own: the print dialog offers no handle on the
// suggested PDF filename (it comes from document.title) or on pagination (a long element
// is chopped across sheets), so both are set up here and undone on afterprint.

export interface PrintOptions {
  // Suggested PDF filename, applied by swapping document.title for the duration of the
  // print and restoring it afterward. Omit to leave the title alone.
  filename?: string
  // Size the page to the element instead of paginating it, so the output is a single
  // continuous sheet however long the element is.
  single_page?: boolean
  // Printed page width in mm, only used with single_page. Defaults to A4 portrait.
  page_width_mm?: number
  // Converts the measured height into the mm @page takes. 96 is the CSS definition of an
  // inch and what every engine prints at; override it where zoom scales absolute units,
  // so a rect measured there converts at the ratio actually in force.
  px_per_inch?: number
}

// `prefix-YYYY-MM-DD`, the shape most people want out of a "save as PDF" button.
export const format_print_filename = (prefix: string, date = new Date()): string => {
  const month = String(date.getMonth() + 1).padStart(2, `0`)
  const day = String(date.getDate()).padStart(2, `0`)
  return `${prefix}-${date.getFullYear()}-${month}-${day}`
}

// Marks the element the injected rules apply to, so nothing about the caller's markup
// (a class, an id, a tag name) has to be known here.
const print_attr = `data-print-target`

// afterprint lands a turn of the event loop after print() returns, so back-to-back calls
// overlap. Without this the second one reads the first one's filename as the title to put
// back, and the page keeps that filename for good.
let title_swap_in_flight = false

// Headless and embedded webviews return from print() without ever firing afterprint,
// which leaves the swapped title and the injected rules standing for good and
// title_swap_in_flight disabling every later swap. Long enough that a dialog a user
// actually opened has closed first.
const AFTERPRINT_TIMEOUT_MS = 60_000

// Stamped into the marker attribute so a print only ever clears its own. The attribute is
// shared state on the node, and disarming does not cover a watchdog that is still armed
// because its own print never ended: it would strip a later print's marker off the node.
let print_seq = 0

export const print_element = (node: HTMLElement, options: PrintOptions = {}): void => {
  const { filename, single_page = false, page_width_mm = 210, px_per_inch = 96 } = options

  let style: HTMLStyleElement | null = null
  // non-null only for the call that owns the swap, which is the only one that restores
  let restore_title: string | null = null
  let watchdog: ReturnType<typeof setTimeout> | undefined
  const token = `${++print_seq}`

  const cleanup = () => {
    // afterprint and the watchdog both undo this print, so each disarms the other: a
    // leftover one would fire mid-print later and strip that print's setup instead
    clearTimeout(watchdog)
    globalThis.removeEventListener(`afterprint`, cleanup)
    if (restore_title !== null) {
      document.title = restore_title
      // Prevent another cleanup from restoring this title again.
      restore_title = null
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
    // Measured as the element stands on screen (getBoundingClientRect flushes layout): an
    // @media print rule of the caller's own that changes it is not reflected here.
    const height_px = node.getBoundingClientRect().height
    const height_mm = Math.ceil((height_px * 25.4) / px_per_inch)

    // Ancestors are cleared as well, since a scrolling container clips the element to
    // its own height and prints only what was in view.
    style = document.createElement(`style`)
    style.textContent = `@media print {
  @page { size: ${page_width_mm}mm ${height_mm}mm; margin: 0 }
  [${print_attr}] { width: ${page_width_mm}mm !important; max-width: none !important; margin: 0 !important; box-sizing: border-box !important; box-shadow: none !important }
  html, body, [${print_attr}] { height: auto !important; max-height: none !important; overflow: visible !important }
}`
    document.head.append(style)
  }

  // No setup means no listener/watchdog needs to retain `node`.
  if (restore_title !== null || style) {
    // afterprint covers both saving and canceling the print dialog.
    globalThis.addEventListener(`afterprint`, cleanup, { once: true })
    watchdog = setTimeout(cleanup, AFTERPRINT_TIMEOUT_MS)
  }
  // A print() that throws never fires afterprint, so the swapped title and the injected
  // rules would outlive the call and follow the page around.
  try {
    globalThis.print()
  } catch (error) {
    cleanup()
    throw error
  }
}
