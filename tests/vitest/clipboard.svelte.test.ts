import {
  copy_text,
  create_clipboard_feedback,
  type CopyAnchor,
} from '#lib/browser/index.ts'
import { flushSync } from 'svelte'
import { afterAll, beforeEach, expect, test, vi } from 'vite-plus/test'

// happy-dom has no navigator.clipboard, so writeText is a spy. Timers are faked to keep
// the feedback window assertions exact rather than sleeping through them.
const write_text = vi.fn<(text: string) => Promise<void>>()
vi.stubGlobal(`navigator`, { clipboard: { writeText: write_text } })

beforeEach(() => {
  write_text.mockReset()
  write_text.mockResolvedValue(undefined)
  vi.useFakeTimers()
})
// the stub is file-wide, so it can only go once every test is done
afterAll(() => vi.unstubAllGlobals())

test(`copy writes the text and flags the key for the feedback window`, async () => {
  const { copied, copy } = create_clipboard_feedback(1000)

  expect(await copy(`npm test`, `install-cmd`)).toBe(true)
  expect(write_text).toHaveBeenCalledWith(`npm test`)
  expect([...copied]).toEqual([`install-cmd`])

  await vi.advanceTimersByTimeAsync(999)
  expect([...copied]).toEqual([`install-cmd`])
  await vi.advanceTimersByTimeAsync(1)
  expect([...copied]).toEqual([])

  await copy(`git status`) // key defaults to the text
  expect([...copied]).toEqual([`git status`])
})

// Without the reset, a re-copy would inherit the remainder of the first timer and the
// checkmark would blink out early - the one thing the caller cannot fix from outside.
test(`re-copying a key restarts its timer without touching the others`, async () => {
  const { copied, copy } = create_clipboard_feedback(1000)
  await copy(`a`, `first`)
  await vi.advanceTimersByTimeAsync(800)
  await copy(`b`, `second`)
  await vi.advanceTimersByTimeAsync(100)
  await copy(`a`, `first`) // 900ms into `first`'s original window

  expect([...copied].toSorted()).toEqual([`first`, `second`])
  await vi.advanceTimersByTimeAsync(900)
  expect([...copied]).toEqual([`first`]) // `second` expired on its own schedule
  await vi.advanceTimersByTimeAsync(100)
  expect([...copied]).toEqual([])
})

test(`a failed write throws unless on_error takes it, and flags nothing either way`, async () => {
  const failure = new Error(`clipboard blocked`)
  write_text.mockRejectedValue(failure)
  const unhandled = create_clipboard_feedback()
  await expect(unhandled.copy(`x`, `key`)).rejects.toThrow(failure) // never silently swallowed
  expect([...unhandled.copied]).toEqual([])

  const on_error = vi.fn()
  const handled = create_clipboard_feedback(1000, on_error)
  expect(await handled.copy(`x`, `key`)).toBe(false)
  expect(on_error).toHaveBeenCalledWith(failure, `x`)
  expect([...handled.copied]).toEqual([])
})

test(`clear drops one key or all of them, canceling their timers`, async () => {
  const { copied, copy, clear } = create_clipboard_feedback(1000)
  await copy(`a`, `first`)
  await copy(`b`, `second`)

  clear(`first`)
  expect([...copied]).toEqual([`second`])

  await copy(`a`, `first`)
  clear()
  expect([...copied]).toEqual([])
  expect(vi.getTimerCount()).toBe(0) // no timer left to un-flag a key that is gone
})

// A `clear()` that read the flag set would make every later copy re-run its caller's
// effect, so a "reset on unmount" effect would loop against its own cleanup.
test(`clear does not subscribe its calling effect to timer state`, async () => {
  const { copy, clear } = create_clipboard_feedback(1000)
  await copy(`a`, `first`)

  let runs = 0
  const cleanup = $effect.root(() => {
    $effect(() => {
      runs++
      clear()
    })
  })
  flushSync()
  expect(runs).toBe(1)

  await copy(`b`, `second`)
  flushSync()
  expect(runs).toBe(1)

  cleanup()
  clear()
})

const toast = () => document.querySelector<HTMLElement>(`.copy-toast`)
const live = () => document.querySelector<HTMLElement>(`.copy-toast-live`)
const element_at = (rect: DOMRect, parent: Element = document.body) => {
  const element = document.createElement(`button`)
  parent.append(element)
  element.getBoundingClientRect = () => rect
  return element
}
// centered above a point 10px over the viewport's bottom edge (toast stubbed 0x0, offset 6)
const bottom_center = [`${innerWidth / 2}px`, `${innerHeight - 16}px`]

// Right of the anchor and vertically centered, or left of it where the viewport's right edge
// leaves no room; a detached or page-level anchor falls back to the viewport's bottom center
test.each<[string, () => CopyAnchor | undefined, [number, number], string[]]>([
  [`element`, () => element_at(new DOMRect(30, 50, 70, 20)), [0, 0], [`106px`, `60px`]],
  [
    `element at the right edge`,
    () => element_at(new DOMRect(950, 50, 60, 20)),
    [80, 20],
    [`864px`, `50px`],
  ],
  [`viewport point`, () => ({ x: 200, y: 100 }), [0, 0], [`206px`, `100px`]],
  [
    `focused element (default)`,
    () => {
      element_at(new DOMRect(30, 50, 70, 20)).focus()
      return undefined
    },
    [0, 0],
    [`106px`, `60px`],
  ],
  [`detached element`, () => document.createElement(`button`), [0, 0], bottom_center],
  [`body`, () => document.body, [0, 0], bottom_center],
])(
  `copy_text confirms beside a %s anchor, then fades out`,
  async (_kind, anchor_of, [width, height], expected) => {
    const anchor = anchor_of()
    vi.spyOn(HTMLDivElement.prototype, `getBoundingClientRect`).mockReturnValue(
      new DOMRect(0, 0, width, height),
    )
    expect(await copy_text(`npm test`, { anchor, duration_ms: 500 })).toBe(true)
    expect(write_text).toHaveBeenCalledWith(`npm test`)
    const el = toast()
    const shown = () => [el?.textContent, el?.style.opacity, el?.matches(`:popover-open`)]
    expect([el?.style.left, el?.style.top, el?.hasAttribute(`data-error`)]).toEqual([
      ...expected,
      false,
    ])
    expect(shown()).toEqual([`Copied!`, `1`, true])
    await vi.advanceTimersByTimeAsync(500)
    // stays rendered, so the next message is announced: it only empties and turns transparent
    expect(shown()).toEqual([``, `0`, true])
    vi.restoreAllMocks()
  },
)

// A popover re-shown per copy re-enters the accessibility tree, so the toast is aria-hidden and
// a separate status region announces; a just-inserted one is often skipped, so its first
// message waits a beat. A copy mid-fade cancels the fade, else its fill holds the old opacity.
test(`copy_text announces through a live region and restarts the fade`, async () => {
  live()?.remove()
  await copy_text(`a`, { labels: { success: `first` }, duration_ms: 1000 })
  expect([toast()?.getAttribute(`aria-hidden`), live()?.getAttribute(`role`)]).toEqual([
    `true`,
    `status`,
  ])
  expect(live()?.textContent).toBe(``)
  await vi.advanceTimersByTimeAsync(100)
  expect(live()?.textContent).toBe(`first`)
  const cancel = vi.fn()
  Object.assign(toast() ?? {}, { getAnimations: () => [{ cancel }] })
  await copy_text(`b`, { labels: { success: `second` }, duration_ms: 1000 })
  expect([live()?.textContent, cancel.mock.calls.length]).toEqual([`second`, 1]) // immediate
  await vi.advanceTimersByTimeAsync(1000)
  expect(live()?.textContent).toBe(``)
  // a copy landing inside the first one's insertion delay waits out only its remainder
  live()?.remove()
  await copy_text(`c`, { labels: { success: `third` } })
  await vi.advanceTimersByTimeAsync(60)
  await copy_text(`d`, { labels: { success: `fourth` } })
  expect(live()?.textContent).toBe(``)
  await vi.advanceTimersByTimeAsync(40)
  expect(live()?.textContent).toBe(`fourth`)
})

// activeElement stops at a shadow host; the default anchor and modal lookup use the
// element focused inside it, and a custom write replaces the clipboard write
test(`copy_text defaults to the focus inside open shadow roots`, async () => {
  const dialog = document.createElement(`dialog`)
  const shadow_host = document.createElement(`div`)
  document.body.append(shadow_host)
  const shadow = shadow_host.attachShadow({ mode: `open` })
  shadow.append(dialog)
  const inner = element_at(new DOMRect(30, 50, 70, 20), dialog)
  vi.spyOn(Element.prototype, `closest`).mockImplementation(function (this: Element) {
    return dialog.contains(this) ? dialog : null
  })
  Object.defineProperty(shadow, `activeElement`, { value: inner, configurable: true })
  inner.focus()
  Object.defineProperty(document, `activeElement`, {
    value: shadow_host,
    configurable: true,
  })
  const write = vi.fn(async () => {})
  expect(await copy_text(`x`, { write })).toBe(true)
  expect([write.mock.calls, write_text.mock.calls.length]).toEqual([[[`x`]], 0])
  const shadow_toast = dialog.querySelector<HTMLElement>(`.copy-toast`)
  expect(shadow_toast?.style.left).toBe(`106px`)
  Reflect.deleteProperty(document, `activeElement`)
  vi.restoreAllMocks()
  shadow_host.remove()
})

test(`copy_text resolves false and says so when the write fails`, async () => {
  write_text.mockRejectedValue(new Error(`blocked`))
  expect(await copy_text(`x`, { labels: { error: `No clipboard` } })).toBe(false)
  expect([toast()?.textContent, toast()?.hasAttribute(`data-error`)]).toEqual([
    `No clipboard`,
    true,
  ])
})

// The live region stays empty until the write settles (an announced "Copied!" must be true),
// and a slow earlier write must not overwrite a newer one
test(`copy_text confirms only after the write, and the newest copy wins`, async () => {
  let resolve_first = () => {}
  write_text.mockImplementationOnce(
    () =>
      new Promise<void>((done) => {
        resolve_first = done
      }),
  )
  const first = copy_text(`first`, { labels: { success: `first` } })
  expect([toast()?.textContent, live()?.textContent]).toEqual([``, ``])
  await copy_text(`second`, { labels: { success: `second` } })
  resolve_first()
  expect(await first).toBe(true)
  expect(toast()?.textContent).toBe(`second`)
})

// a modal dialog makes the page outside it inert, so the toast moves in, also for a point
// anchor (a canvas inside the dialog); a non-modal dialog leaves it on the page
test(`copy_text hosts the toast in the modal dialog holding the anchor or focus`, async () => {
  const dialog = document.createElement(`dialog`)
  document.body.append(dialog)
  let modal = true
  // happy-dom has no :modal
  const closest = Element.prototype.closest
  vi.spyOn(Element.prototype, `closest`).mockImplementation(function (
    this: Element,
    selector,
  ) {
    if (selector !== `dialog:modal`) return closest.call(this, selector)
    return modal && dialog.contains(this) ? dialog : null
  })
  const in_dialog = () => element_at(new DOMRect(0, 0, 10, 10), dialog)
  await copy_text(`x`, { anchor: in_dialog() })
  expect(toast()?.parentElement).toBe(dialog)
  await copy_text(`y`, { anchor: element_at(new DOMRect(0, 0, 10, 10)) })
  expect(toast()?.parentElement).toBe(document.body)
  in_dialog().focus()
  await copy_text(`z`, { anchor: { x: 5, y: 5 } })
  expect(toast()?.parentElement).toBe(dialog)
  // closest() stops at a shadow root: the lookup continues from its host
  const shadow_host = element_at(new DOMRect(0, 0, 10, 10), dialog)
  const in_shadow = document.createElement(`button`)
  shadow_host.attachShadow({ mode: `open` }).append(in_shadow)
  await copy_text(`s`, { anchor: in_shadow })
  expect([toast()?.parentElement, live()?.parentElement]).toEqual([dialog, dialog])
  modal = false
  await copy_text(`w`, { anchor: in_dialog() })
  expect([toast()?.parentElement, live()?.parentElement]).toEqual([
    document.body,
    document.body,
  ])
  vi.restoreAllMocks()
  dialog.remove()
})
