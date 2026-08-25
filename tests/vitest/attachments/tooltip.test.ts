import type { TooltipOpenReason, TooltipOptions } from '$lib/attachments'
import { register_escape_layer, tooltip } from '$lib/attachments'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import {
  create_element,
  doc_query,
  escape_key,
  hover as pointer_over,
  mock_rect,
  pointer_event,
  stub_prop,
} from '../index'

describe(`tooltip manager`, () => {
  const cleanups: (() => void)[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    cleanups.push(
      stub_prop(globalThis, `innerWidth`, 1000),
      stub_prop(globalThis, `innerHeight`, 800),
    )
  })

  afterEach(() => {
    for (const cleanup of cleanups.splice(0).toReversed()) cleanup()
    vi.useRealTimers()
  })

  const attach_tooltip = (
    element: HTMLElement,
    options: TooltipOptions = {},
  ): (() => void) => {
    if (!Object.hasOwn(element, `getBoundingClientRect`)) {
      mock_rect(element, { left: 100, top: 100, width: 80, height: 30 })
    }
    options.strategy ??= `absolute`
    options.open_delay_ms ??= 0
    options.close_delay_ms ??= 0
    const cleanup = tooltip(options)(element)
    if (!cleanup) throw new Error(`tooltip did not return cleanup`)
    cleanups.push(cleanup)
    return cleanup
  }

  const register_tooltip = (title: string, options: TooltipOptions = {}) => {
    const element = create_element(`button`)
    element.title = title
    return { cleanup: attach_tooltip(element, options), element }
  }

  const open_detail = (trigger: HTMLElement, reason: TooltipOpenReason) => ({
    trigger,
    reason,
  })

  const pointer_out = (
    element: HTMLElement,
    related_target: EventTarget = document.body,
  ) => {
    element.dispatchEvent(
      pointer_event(`pointerout`, 110, 110, {
        pointerType: `mouse`,
        relatedTarget: related_target,
      }),
    )
    vi.advanceTimersByTime(0)
  }
  const focus_in = (element: HTMLElement) =>
    element.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
  const focus_out = (element: HTMLElement) =>
    element.dispatchEvent(
      new FocusEvent(`focusout`, { bubbles: true, relatedTarget: document.body }),
    )

  const visible_tooltip = (): HTMLElement => {
    const tooltip_el = doc_query(`.custom-tooltip`)
    expect(tooltip_el.hidden).toBe(false)
    return tooltip_el
  }

  const show_tooltip = (options: TooltipOptions = {}, title = `Tooltip content`) => {
    const { cleanup, element } = register_tooltip(title, options)
    pointer_over(element)
    return { cleanup, element, tooltip_el: visible_tooltip() }
  }

  const setup_controlled_handoff = () => {
    const on_open_change = vi.fn()
    const controlled = create_element(`button`)
    const close = attach_tooltip(controlled, {
      content: `Controlled`,
      open: true,
      on_open_change,
    })
    const root = create_element()
    const child = document.createElement(`button`)
    child.title = `Next`
    root.append(child)
    attach_tooltip(root, { trigger: `hover-focus` })
    mock_rect(child, { left: 250, top: 100, width: 80, height: 30 })
    return { child, close, controlled, on_open_change }
  }

  // the registry outlives a retry of the same test, so defining twice would throw
  const define_once = (tag_name: string, element_class: CustomElementConstructor) => {
    if (!customElements.get(tag_name)) customElements.define(tag_name, element_class)
    return tag_name
  }

  const mock_tooltip_rect = (width: number, height: number) => {
    const original = HTMLElement.prototype.getBoundingClientRect
    return vi
      .spyOn(HTMLElement.prototype, `getBoundingClientRect`)
      .mockImplementation(function (this: HTMLElement) {
        if (!this.classList.contains(`custom-tooltip`)) return original.call(this)
        return new DOMRect(0, 0, width, height)
      })
  }

  it.each([
    [`title`, `From title`],
    [`aria-label`, `From aria`],
    [`data-title`, `From data`],
  ])(`resolves %s content and restores stripped titles`, (attribute, expected) => {
    const element = create_element(`button`)
    element.setAttribute(attribute, expected)
    const cleanup = attach_tooltip(element)
    pointer_over(element)

    expect(doc_query(`.tooltip-content`).textContent).toBe(expected)
    if (attribute === `title`) expect(element.hasAttribute(`title`)).toBe(false)
    cleanup()
    if (attribute === `title`) expect(element.title).toBe(expected)
  })

  it(`gives explicit content precedence and treats an empty result as disabled`, () => {
    const element = create_element(`button`)
    element.title = `Native`
    attach_tooltip(element, { content: `Explicit` })
    pointer_over(element)
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Explicit`)

    const empty = create_element(`button`)
    empty.setAttribute(`aria-label`, `Fallback must not win`)
    attach_tooltip(empty, { content: () => `` })
    pointer_over(empty)
    const tooltip_el = doc_query(`.custom-tooltip`)
    expect(tooltip_el.hidden).toBe(true)
    expect(tooltip_el.style.display).toBe(`none`)
  })

  it.each([
    [
      `disabled render with content`,
      { content: `text`, disabled: true, render: (): undefined => undefined },
      `render cannot be combined`,
    ],
    [
      `render with allow_html: false`,
      { allow_html: false, render: (): undefined => undefined },
      `render cannot be combined`,
    ],
    [
      `sanitizer without HTML`,
      { sanitize_html: (html: string) => html },
      `sanitize_html requires`,
    ],
    [
      `delegated HTML without a sanitizer`,
      { allow_html: true, delegate: true },
      `delegated allow_html requires sanitize_html`,
    ],
    [`manual without open`, { trigger: `manual` as const }, `requires the open option`],
  ])(`rejects invalid options: %s`, (_name, options, message) => {
    const element = create_element()
    expect(() => tooltip(options)(element)).toThrow(message)
  })

  it(`delegates to descendants added after attachment`, () => {
    const root = create_element()
    attach_tooltip(root)
    const child = document.createElement(`button`)
    child.title = `Dynamic child`
    root.append(child)
    mock_rect(child, { left: 120, top: 120, width: 80, height: 30 })

    pointer_over(child)
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Dynamic child`)
    expect(child.hasAttribute(`title`)).toBe(false)
    pointer_out(child)
    expect(child.title).toBe(`Dynamic child`)
    child.remove()
    root.append(child)
    pointer_over(child)
    expect(visible_tooltip().textContent).toBe(`Dynamic child`)
  })

  it(`does not infer delegation from explicitly undefined content`, () => {
    const root = create_element()
    const child = document.createElement(`button`)
    child.title = `<b>Untrusted</b>`
    root.append(child)
    attach_tooltip(root, { allow_html: true, content: undefined })

    pointer_over(child)
    expect(document.querySelector(`.tooltip-content`)).toBeNull()
  })

  it(`sanitizes delegated attribute HTML before rendering`, () => {
    const root = create_element()
    attach_tooltip(root, {
      allow_html: true,
      sanitize_html: (html) => html.replaceAll(/<script.*?<\/script>/giu, ``),
    })
    const child = document.createElement(`button`)
    child.title = `<script>bad()</script><b>Safe</b>`
    root.append(child)
    mock_rect(child, { left: 120, top: 120, width: 80, height: 30 })

    pointer_over(child)
    expect(doc_query(`.tooltip-content`).innerHTML).toBe(`<b>Safe</b>`)
  })

  it(`supports explicit delegated selectors with per-trigger content factories`, () => {
    const root = create_element()
    attach_tooltip(root, {
      delegate: `[data-tip]`,
      content: (trigger) => trigger.getAttribute(`data-tip`) ?? ``,
    })
    const child = document.createElement(`button`)
    child.setAttribute(`data-tip`, `Selected child`)
    root.append(child)
    mock_rect(child, { left: 120, top: 120, width: 80, height: 30 })

    pointer_over(child)
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Selected child`)
  })

  it(`defaults to hover-focus and focus ignores pointer delay`, () => {
    const { element } = register_tooltip(`Keyboard`, { open_delay_ms: 1000 })
    document.dispatchEvent(new KeyboardEvent(`keydown`, { key: `Tab`, bubbles: true }))
    focus_in(element)
    const tooltip_el = visible_tooltip()
    expect(tooltip_el.textContent).toBe(`Keyboard`)
    focus_out(element)
    vi.advanceTimersByTime(0)
    expect(tooltip_el.hidden).toBe(true)
  })

  it(`explicit hover stays dismissed after a press until re-entered`, () => {
    const { element } = register_tooltip(`Hover only`, { trigger: `hover` })
    pointer_over(element)
    const tooltip_el = visible_tooltip()
    element.dispatchEvent(pointer_event(`pointerdown`, 110, 110))
    focus_in(element)
    expect(tooltip_el.hidden).toBe(true)

    pointer_out(element)
    pointer_over(element)
    expect(visible_tooltip()).toBe(tooltip_el)
  })

  it(`keeps one tooltip when pointer and focus states overlap`, () => {
    const on_open_change = vi.fn()
    const { element, tooltip_el } = show_tooltip({
      trigger: `hover-focus`,
      on_open_change,
    })
    focus_in(element)
    pointer_out(element)
    expect(tooltip_el.hidden).toBe(false)

    focus_out(element)
    vi.advanceTimersByTime(0)
    expect(tooltip_el.hidden).toBe(true)
    expect(on_open_change).toHaveBeenLastCalledWith(false, open_detail(element, `blur`))
  })

  it(`closes only once every pointer has left both trigger and tooltip`, () => {
    const { element, tooltip_el } = show_tooltip({ close_delay_ms: 100 })
    const surface_pointer = (type: string, pointer_type = `mouse`) =>
      tooltip_el.dispatchEvent(
        pointer_event(type, 100, 140, {
          pointerType: pointer_type,
          relatedTarget: document.body,
        }),
      )

    // a second pointer touring the surface cannot close what the trigger still holds
    surface_pointer(`pointerenter`, `pen`)
    surface_pointer(`pointerleave`, `pen`)
    vi.advanceTimersByTime(100)
    expect(tooltip_el.hidden).toBe(false)

    pointer_out(element, tooltip_el) // crossing the gap onto the tooltip keeps it up
    vi.advanceTimersByTime(100)
    expect(tooltip_el.hidden).toBe(false)

    surface_pointer(`pointerleave`)
    vi.advanceTimersByTime(50)
    pointer_over(element) // back onto the trigger inside the delay cancels the close
    vi.advanceTimersByTime(100)
    expect(tooltip_el.hidden).toBe(false)

    pointer_out(element)
    vi.advanceTimersByTime(100)
    expect(tooltip_el.hidden).toBe(true)
  })

  it(`Escape dismisses one layer and blocks reopen until interaction exits`, () => {
    const { element, tooltip_el } = show_tooltip()
    const escape = escape_key()
    document.dispatchEvent(escape)
    expect(escape.defaultPrevented).toBe(true)
    expect(tooltip_el.hidden).toBe(true)

    pointer_over(element)
    expect(tooltip_el.hidden).toBe(true)
    pointer_out(element)
    pointer_over(element)
    expect(tooltip_el.hidden).toBe(false)
  })

  it(`restores trigger focus without reopening after Escape`, () => {
    const on_open_change = vi.fn()
    // Stands in for a surface the tooltip opened over, e.g. a dialog owning Escape.
    const surrounding_layer = vi.fn(() => true)
    cleanups.push(register_escape_layer(surrounding_layer))
    const element = create_element(`button`)
    attach_tooltip(element, {
      trigger: `focus`,
      on_open_change,
      render: (content_el) => {
        const control = document.createElement(`button`)
        control.textContent = `Custom control`
        content_el.append(control)
        return undefined
      },
    })
    focus_in(element)
    const tooltip_el = visible_tooltip()
    const control = doc_query<HTMLButtonElement>(`.tooltip-content button`)
    control.focus()

    document.dispatchEvent(escape_key())
    expect(tooltip_el.hidden).toBe(true)
    expect(document.activeElement).toBe(element)

    // Handing focus back re-enters through focusout/focusin, which must not resurrect
    // the dismissed tooltip — leaving the trigger afterwards is not a second close.
    focus_out(element)
    vi.advanceTimersByTime(0)
    expect(tooltip_el.hidden).toBe(true)
    expect(on_open_change.mock.calls.filter(([open]) => open === false)).toEqual([
      [false, open_detail(element, `escape`)],
    ])

    // The reopen the handoff caused subscribed an Escape layer of its own. Left on the
    // stack it answers for the surface underneath, which never hears Escape again.
    document.dispatchEvent(escape_key())
    expect(surrounding_layer).toHaveBeenCalledOnce()
  })

  it(`suppresses touch-induced default triggers but allows explicit focus mode`, () => {
    const { element: automatic } = register_tooltip(`Automatic`)
    // Browser ordering puts pointerover before pointerdown on first contact.
    pointer_over(automatic, `touch`)
    automatic.dispatchEvent(pointer_event(`pointerdown`, 0, 0, { pointerType: `touch` }))
    focus_in(automatic)
    expect(document.querySelector(`.custom-tooltip`)).toBeNull()
    pointer_over(automatic, `mouse`)
    expect(visible_tooltip().textContent).toBe(`Automatic`)

    const { element: focus_only } = register_tooltip(`Focus only`, { trigger: `focus` })
    focus_only.dispatchEvent(pointer_event(`pointerdown`, 0, 0, { pointerType: `touch` }))
    focus_in(focus_only)
    expect(visible_tooltip().textContent).toBe(`Focus only`)
  })

  it(`merges and removes only its aria-describedby token`, () => {
    const element = create_element(`button`)
    element.title = `Described`
    element.setAttribute(`aria-describedby`, `help error`)
    attach_tooltip(element)
    pointer_over(element)
    const tooltip_id = visible_tooltip().id

    expect(element.getAttribute(`aria-describedby`)?.split(/\s+/u)).toEqual([
      `help`,
      `error`,
      tooltip_id,
    ])
    pointer_out(element)
    expect(element.getAttribute(`aria-describedby`)).toBe(`help error`)
  })

  it(`recycles one node across owners, relationships and render cleanup`, () => {
    const render_cleanup = vi.fn()
    const first = create_element(`button`)
    attach_tooltip(first, {
      render: (content_el) => {
        content_el.textContent = `First`
        return render_cleanup
      },
    })
    const { element: second } = register_tooltip(`Second`)

    pointer_over(first)
    const shared = visible_tooltip()
    pointer_over(second)
    expect(visible_tooltip()).toBe(shared)
    expect(shared.textContent).toBe(`Second`)
    expect(render_cleanup).toHaveBeenCalledOnce()
    expect(first.hasAttribute(`aria-describedby`)).toBe(false)
    expect(second.getAttribute(`aria-describedby`)).toBe(shared.id)
  })

  it(`shares one document listener pair across all registrations`, () => {
    const add_listener = vi.spyOn(document, `addEventListener`)
    const remove_listener = vi.spyOn(document, `removeEventListener`)
    const { cleanup: cleanup_first } = register_tooltip(`First`)
    const { cleanup: cleanup_second } = register_tooltip(`Second`)
    const manager_events = (calls: unknown[][]) =>
      calls
        .filter(
          ([event_name]) => event_name === `pointerdown` || event_name === `keydown`,
        )
        .map(([event_name]) => event_name)

    expect(manager_events(add_listener.mock.calls)).toEqual([`pointerdown`, `keydown`])
    cleanup_first()
    expect(manager_events(remove_listener.mock.calls)).toEqual([])
    cleanup_second()
    expect(manager_events(remove_listener.mock.calls)).toEqual([`pointerdown`, `keydown`])
  })

  it(`uses first-hover delay and skips it for the next tooltip`, () => {
    const options = { open_delay_ms: 100, close_delay_ms: 0, skip_delay_ms: 300 }
    const { element: first } = register_tooltip(`First`, options)
    const { element: second } = register_tooltip(`Second`, options)

    first.dispatchEvent(pointer_event(`pointerover`, 0, 0, { pointerType: `mouse` }))
    vi.advanceTimersByTime(99)
    expect(document.querySelector(`.custom-tooltip`)).toBeNull()
    vi.advanceTimersByTime(1)
    expect(visible_tooltip().textContent).toBe(`First`)
    pointer_out(first)
    pointer_over(second)
    expect(visible_tooltip().textContent).toBe(`Second`)
  })

  it(`supports controlled manual opening and reports lifecycle reasons`, async () => {
    const changes = vi.fn()
    const element = create_element(`button`)
    attach_tooltip(element, {
      content: `Controlled`,
      trigger: `manual`,
      open: true,
      on_open_change: changes,
    })
    await Promise.resolve()

    expect(visible_tooltip().textContent).toBe(`Controlled`)
    expect(changes).toHaveBeenCalledWith(true, open_detail(element, `controlled`))
    pointer_out(element)
    focus_out(element)
    vi.advanceTimersByTime(0)
    expect(visible_tooltip().textContent).toBe(`Controlled`)

    document.dispatchEvent(escape_key())
    expect(visible_tooltip().textContent).toBe(`Controlled`)
    expect(changes).toHaveBeenLastCalledWith(false, open_detail(element, `escape`))
  })

  it(`keeps controlled hover tooltips visible until open changes`, async () => {
    const on_open_change = vi.fn()
    const element = create_element(`button`)
    attach_tooltip(element, { content: `Controlled`, open: true, on_open_change })
    await Promise.resolve()
    const tooltip_el = visible_tooltip()

    pointer_out(element)
    expect(tooltip_el.hidden).toBe(false)
    expect(on_open_change).toHaveBeenLastCalledWith(
      false,
      open_detail(element, `pointer`),
    )
  })

  it(`preempts a controlled tooltip without replaying it`, async () => {
    const { child, close, controlled, on_open_change } = setup_controlled_handoff()
    await Promise.resolve()
    expect(visible_tooltip().textContent).toBe(`Controlled`)

    pointer_over(child)
    expect(visible_tooltip().textContent).toBe(`Next`)
    expect(child.hasAttribute(`title`)).toBe(false)
    expect(on_open_change).toHaveBeenLastCalledWith(
      false,
      open_detail(controlled, `pointer`),
    )

    pointer_out(child)
    close() // releasing the controlled registration must not resurrect anything
    vi.advanceTimersByTime(0)

    expect(doc_query(`.custom-tooltip`).hidden).toBe(true)
    expect(child.title).toBe(`Next`)
  })

  it(`requests controlled opening without showing against open: false`, () => {
    const on_open_change = vi.fn()
    const { element } = register_tooltip(`Controlled`, { open: false, on_open_change })
    pointer_over(element)

    expect(document.querySelector(`.custom-tooltip`)).toBeNull()
    expect(on_open_change).toHaveBeenCalledWith(true, open_detail(element, `pointer`))
  })

  it(`sanitizes trusted HTML and normalizes newline markup`, () => {
    const sanitizer = vi.fn((html: string) =>
      html.replaceAll(/<script[^>]*>.*?<\/script>/giu, ``),
    )
    const { tooltip_el } = show_tooltip(
      { allow_html: true, sanitize_html: sanitizer },
      `<script>bad()</script><b>Safe</b>\nNext`,
    )

    expect(sanitizer).toHaveBeenCalledOnce()
    expect(tooltip_el.querySelector(`script`)).toBeNull()
    expect(tooltip_el.querySelector(`b`)?.textContent).toBe(`Safe`)
    expect(tooltip_el.querySelector(`br`)).not.toBeNull()
  })

  it.each([
    [`balance`, `balance`, `anywhere`, `normal`],
    [`normal`, `wrap`, `anywhere`, `normal`],
    [`nowrap`, `nowrap`, `normal`, `nowrap`],
  ] as const)(
    `applies the %s wrapping policy`,
    (wrap, text_wrap, overflow_wrap, white_space) => {
      const { tooltip_el } = show_tooltip({ wrap })
      expect(tooltip_el.style.textWrap).toBe(text_wrap)
      expect(tooltip_el.style.overflowWrap).toBe(overflow_wrap)
      expect(tooltip_el.style.whiteSpace).toBe(white_space)
    },
  )

  it(`copies language, direction, theme variables and honors reduced motion`, () => {
    vi.mocked(matchMedia).mockReturnValueOnce({
      media: `(prefers-reduced-motion: reduce)`,
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as MediaQueryList)
    const wrapper = create_element()
    wrapper.lang = `ar`
    wrapper.dir = `rtl`
    const element = document.createElement(`button`)
    element.title = `مرحبا`
    element.style.setProperty(`--tooltip-bg`, `red`)
    wrapper.append(element)
    attach_tooltip(element)
    pointer_over(element)
    const tooltip_el = visible_tooltip()

    expect(tooltip_el.lang).toBe(`ar`)
    expect(tooltip_el.dir).toBe(`rtl`)
    expect(tooltip_el.style.getPropertyValue(`--tooltip-bg`)).toBe(`red`)
    expect(tooltip_el.style.transition).toBe(`none`)

    // the trigger's own lang/dir outrank the wrapper's
    element.lang = `he`
    element.dir = `ltr`
    pointer_out(element)
    pointer_over(element)
    expect([visible_tooltip().lang, visible_tooltip().dir]).toEqual([`he`, `ltr`])
  })

  type SchemeCase = { bg?: string; page_scheme?: string; style?: string }
  it.each<[string, SchemeCase, string]>([
    [`follows the OS scheme on a page that declares none`, {}, `light dark`],
    [`defers to a trigger that overrides the background`, { bg: `red` }, ``],
    [`defers to a page that declares its own scheme`, { page_scheme: `dark` }, ``],
    // Pins the ordering: the fallback judges what `style` left, so it cannot precede it
    [
      `defers to a background the style option sets`,
      { style: `--tooltip-bg: black;` },
      ``,
    ],
  ])(`%s`, (_desc, { bg, page_scheme, style }, scheme) => {
    if (page_scheme) {
      document.body.style.colorScheme = page_scheme
      cleanups.push(() => document.body.style.removeProperty(`color-scheme`))
    }
    const element = create_element(`button`)
    element.title = `Themed`
    if (bg) element.style.setProperty(`--tooltip-bg`, bg)
    attach_tooltip(element, style ? { style } : {})
    pointer_over(element)

    const tooltip_el = visible_tooltip()
    expect(tooltip_el.style.getPropertyValue(`color-scheme`)).toBe(scheme)
    // The paired text color only makes sense alongside the scheme it was chosen for
    expect(tooltip_el.style.getPropertyValue(`--text-color`)).toBe(
      scheme ? `light-dark(#222, #eee)` : ``,
    )
  })

  it(`updates active attribute content and repositions it`, async () => {
    const element = create_element(`button`)
    element.setAttribute(`aria-label`, `Initial`)
    attach_tooltip(element)
    pointer_over(element)
    const tooltip_el = visible_tooltip()
    const initial_left = tooltip_el.style.left

    mock_rect(element, { left: 300, top: 100, width: 80, height: 30 })
    element.setAttribute(`aria-label`, `Updated`)
    await Promise.resolve()
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Updated`)
    expect(tooltip_el.style.left).not.toBe(initial_left)
  })

  it(`uses the final title from a batched update and restores it`, async () => {
    const { cleanup, element } = show_tooltip({}, `Initial`)

    element.title = `Intermediate`
    element.title = `Final`
    await Promise.resolve()
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Final`)
    expect(element.hasAttribute(`title`)).toBe(false)

    cleanup()
    expect(element.title).toBe(`Final`)
  })

  it(`keeps synchronous context mutations caused by title stripping`, async () => {
    const tag_name = define_once(
      `tooltip-title-context`,
      class extends HTMLElement {
        static observedAttributes = [`title`]
        attributeChangedCallback(): void {
          if (this.hasAttribute(`title`)) return
          this.style.setProperty(`--tooltip-bg`, `blue`)
          if (this.dataset.normalizeTitle === `true` && !this.dataset.normalized) {
            this.dataset.normalized = `true`
            this.title = `Normalized`
          }
        }
      },
    )
    const element = create_element(tag_name)
    element.title = `Initial`
    const cleanup = attach_tooltip(element)
    element.style.setProperty(`--tooltip-bg`, `red`)
    pointer_over(element)
    const tooltip_el = visible_tooltip()
    expect(tooltip_el.style.getPropertyValue(`--tooltip-bg`)).toBe(`red`)

    element.dataset.normalizeTitle = `true`
    element.title = `Updated`
    await Promise.resolve()
    expect(tooltip_el.style.getPropertyValue(`--tooltip-bg`)).toBe(`blue`)
    expect(tooltip_el.textContent).toBe(`Normalized`)
    expect(element.hasAttribute(`title`)).toBe(false)
    cleanup()
    expect(element.title).toBe(`Normalized`)
  })

  it(`gives up on a title it cannot strip without throwing`, async () => {
    const tag_name = define_once(
      `tooltip-title-restorer`,
      class extends HTMLElement {
        static observedAttributes = [`title`]
        attributeChangedCallback(): void {
          if (!this.hasAttribute(`title`)) this.setAttribute(`title`, `Insistent`)
        }
      },
    )
    const errors = vi.spyOn(console, `error`).mockImplementation(() => {})
    const element = create_element(tag_name)
    const cleanup = attach_tooltip(element, { content: `Custom` })
    pointer_over(element)
    visible_tooltip()

    element.setAttribute(`title`, `Insistent`)
    await Promise.resolve()

    expect(errors).toHaveBeenCalledOnce()
    expect(doc_query(`.custom-tooltip`).hidden).toBe(true)
    cleanup()
  })

  it(`hides once the trigger leaves the document`, async () => {
    const { element, tooltip_el } = show_tooltip({}, `Transient`)

    // No scroll or resize follows a detachment, so only the removal observer sees it.
    element.remove()
    await Promise.resolve()
    expect(tooltip_el.hidden).toBe(true)
  })

  it(`repositions on scroll and hides when the trigger stops rendering`, () => {
    const { element, tooltip_el } = show_tooltip({}, `Moving`)
    const first_top = tooltip_el.style.top

    mock_rect(element, { left: 100, top: 200, width: 80, height: 30 })
    window.dispatchEvent(new Event(`scroll`))
    vi.advanceTimersByTime(20)
    expect(tooltip_el.style.top).not.toBe(first_top)

    element.style.display = `none`
    window.dispatchEvent(new Event(`scroll`))
    vi.advanceTimersByTime(20)
    expect(tooltip_el.hidden).toBe(true)
  })

  it(`stops listening for repositions once closed`, () => {
    const { element } = show_tooltip({}, `Temporary`)
    pointer_out(element)

    // A surviving scroll subscription still schedules a frame, even though the guard
    // inside would make that frame a no-op, so the frame is what proves the release.
    const frame = vi.spyOn(window, `requestAnimationFrame`)
    window.dispatchEvent(new Event(`scroll`))
    expect(frame).not.toHaveBeenCalled()
  })

  it(`keeps one bordered arrow visible and aimed after shifting`, () => {
    mock_tooltip_rect(200, 40)
    const element = create_element(`button`)
    element.title = `Edge`
    mock_rect(element, { left: 940, top: 100, width: 40, height: 20 })
    attach_tooltip(element, {
      placement: `bottom`,
      style: `background: rgb(1, 2, 3); border: 2px solid rgb(4, 5, 6)`,
    })
    pointer_over(element)
    const tooltip_el = visible_tooltip()
    const arrow = doc_query(`.custom-tooltip-arrow`)
    const content_el = doc_query(`.tooltip-content`)

    expect(tooltip_el.style.overflow).toBe(`visible`)
    expect(tooltip_el.style.maxHeight).toBe(``)
    expect(content_el.style.maxHeight).toBe(
      `var(--tooltip-max-height, min(50dvh, 480px))`,
    )
    expect(content_el.style.overflowY).toBe(`auto`)
    expect(tooltip_el.querySelectorAll(`[class^="custom-tooltip-arrow"]`)).toHaveLength(1)
    expect(arrow.style.border).toBe(`2px solid rgb(4, 5, 6)`)
    expect(arrow.style.clipPath).toBe(`polygon(0 0, 100% 0, 100% 100%)`)
    expect(Number(tooltip_el.style.left.replace(/px$/u, ``))).toBeLessThan(860)
    expect(Number(arrow.style.left.replace(/px$/u, ``))).toBeGreaterThan(150)
  })

  it.each([
    [`top`, `bottom`],
    [`bottom`, `top`],
    [`left`, `right`],
    [`right`, `left`],
  ] as const)(`positions the arrow for %s placement`, (placement, inset_side) => {
    mock_tooltip_rect(200, 40)
    show_tooltip({ placement, flip: false }, `Arrow`)
    const arrow = doc_query(`.custom-tooltip-arrow`)

    expect(arrow.style.getPropertyValue(inset_side)).not.toBe(``)
  })

  it(`clips placement to a boundary element and appends the style option`, () => {
    mock_tooltip_rect(200, 100)
    const boundary = create_element()
    mock_rect(boundary, { left: 0, top: 0, width: 300, height: 200 })
    const element = create_element(`button`)
    element.title = `Bounded`
    mock_rect(element, { left: 100, top: 150, width: 80, height: 30 })
    // The 1000x800 viewport leaves room to the right; the boundary leaves only above.
    attach_tooltip(element, {
      placement: `auto`,
      boundary,
      style: `font-weight: bold`,
    })
    pointer_over(element)

    const tooltip_el = visible_tooltip()
    expect(tooltip_el.dataset.placement).toBe(`top`)
    expect(tooltip_el.style.fontWeight).toBe(`bold`)
  })

  it(`reuses the Popover top layer after Escape dismissal`, () => {
    let popover_open = false
    const show_popover = vi.fn(() => (popover_open = true))
    const hide_popover = vi.fn(() => {
      if (!popover_open)
        throw new DOMException(`Popover is not open`, `InvalidStateError`)
      popover_open = false
    })
    cleanups.push(
      stub_prop(HTMLElement.prototype, `popover`, null),
      stub_prop(HTMLElement.prototype, `showPopover`, show_popover),
      stub_prop(HTMLElement.prototype, `hidePopover`, hide_popover),
    )
    const { element } = register_tooltip(`Top layer`, { strategy: `top-layer` })
    pointer_over(element)
    const tooltip_el = visible_tooltip()
    const native_matches = tooltip_el.matches.bind(tooltip_el)
    vi.spyOn(tooltip_el, `matches`).mockImplementation((selector) =>
      selector === `:popover-open` ? popover_open : native_matches(selector),
    )

    expect(show_popover).toHaveBeenCalledWith({ source: element })
    document.dispatchEvent(escape_key())
    expect(hide_popover).toHaveBeenCalledOnce()
    expect([tooltip_el.hidden, tooltip_el.style.display]).toEqual([true, `none`])

    // Exiting the dismissed trigger closes the retained state without rehiding a
    // popover Escape already closed. The same surface remains reusable afterwards.
    pointer_out(element)
    expect(hide_popover).toHaveBeenCalledOnce()
    pointer_over(element)
    pointer_out(element)
    expect(show_popover).toHaveBeenCalledTimes(2)
    expect(hide_popover).toHaveBeenCalledTimes(2)
    expect([tooltip_el.hidden, tooltip_el.style.display]).toEqual([true, `none`])
  })

  it(`falls back to absolute positioning without the Popover API`, () => {
    cleanups.push(stub_prop(HTMLElement.prototype, `showPopover`, undefined))
    const { element } = register_tooltip(`No popover`, { strategy: `top-layer` })
    pointer_over(element)
    const tooltip_el = visible_tooltip()

    expect(tooltip_el.hasAttribute(`popover`)).toBe(false)
    expect(tooltip_el.style.position).toBe(`absolute`)
    pointer_out(element)
    expect(tooltip_el.hidden).toBe(true)
  })

  it(`propagates a top-layer Popover API failure`, () => {
    const show_error = new Error(`showPopover failed`)
    cleanups.push(
      stub_prop(HTMLElement.prototype, `showPopover`, () => {
        throw show_error
      }),
    )
    const element = create_element(`button`)
    element.title = `Top layer`
    attach_tooltip(element, { strategy: `top-layer` })

    expect(() => pointer_over(element)).toThrow(show_error)
  })
})
