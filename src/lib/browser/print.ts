// Print the current page. Page layout and pagination belong to the caller's print CSS.
export interface PrintOptions {
  // Suggested PDF filename, applied through document.title until printing finishes.
  filename?: string
}

// `prefix-YYYY-MM-DD`, the shape most "save as PDF" buttons want
export const format_print_filename = (prefix: string, date = new Date()): string => {
  const month = String(date.getMonth() + 1).padStart(2, `0`)
  const day = String(date.getDate()).padStart(2, `0`)
  return `${prefix}-${date.getFullYear()}-${month}-${day}`
}

// afterprint may arrive after print() returns; overlapping calls must not capture a
// temporary filename as the title to restore.
let title_swap_in_flight = false
const AFTERPRINT_TIMEOUT_MS = 60_000

export const print_page = ({ filename }: PrintOptions = {}): void => {
  if (filename === undefined || title_swap_in_flight) return globalThis.print()

  let restore_title: string | null = document.title
  title_swap_in_flight = true
  document.title = filename
  const print_title = document.title
  const cleanup = () => {
    clearTimeout(watchdog)
    globalThis.removeEventListener(`afterprint`, cleanup)
    if (restore_title === null) return
    if (document.title === print_title) document.title = restore_title
    restore_title = null
    title_swap_in_flight = false
  }
  // Headless and embedded webviews may never fire afterprint.
  const watchdog = setTimeout(cleanup, AFTERPRINT_TIMEOUT_MS)
  globalThis.addEventListener(`afterprint`, cleanup, { once: true })
  try {
    globalThis.print()
  } catch (error) {
    cleanup()
    throw error
  }
}
