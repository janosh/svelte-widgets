import type { TooltipOptions } from '$lib/attachments'
import { register_escape_layer, tooltip } from '$lib/attachments'
import { beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import {
  create_element,
  doc_query,
  escape_key,
  hover as pointer_over,
  mock_rect,
  pointer_event,
  stub_props,
} from '../index'

describe(`tooltip manager`, () => {
  beforeEach(() => {
    vi.useFakeTimers()
    onTestFinished(() => void vi.useRealTimers()) // registered first, so it runs last
    stub_props(globalThis, { innerWidth: 1000, innerHeight: 800 })
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
    onTestFinished(cleanup)
    return cleanup
  }

  const register_tooltip = (title: string, options: TooltipOptions = {}) => {
    const element = create_element(`button`)
    element.title = title
    return { cleanup: attach_tooltip(element, options), element }
  }

  const append_child = (root: HTMLElement, attribute: string, value: string) => {
    const child = document.createElement(`button`)
    child.setAttribute(attribute, value)
    root.append(child)
    mock_rect(child, { left: 120, top: 120, width: 80, height: 30 })
    return child
  }

  const pointer_out = (
    element: HTMLElement,
    related_target: EventTarget = document.body,
  ) => {
    const init = { pointerType: `mouse`, relatedTarget: related_target }
    element.dispatchEvent(pointer_event(`pointerout`, 110, 110, init))
    vi.advanceTimersByTime(0)
  }
  const focus_in = (element: HTMLElement) =>
    element.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
  const focus_out = (element: HTMLElement) => {
    element.dispatchEvent(
      new FocusEvent(`focusout`, { bubbles: true, relatedTarget: document.body }),
    )
    vi.advanceTimersByTime(0)
  }

  const visible_text = () =>
    document.querySelector(`.custom-tooltip:not([hidden])`)?.textContent ?? null
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
  ])(`resolves %s content and closes once on repeated cleanup`, (attribute, expected) => {
    const element = create_element(`button`)
    element.setAttribute(attribute, expected)
    const on_open_change = vi.fn()
    const cleanup = attach_tooltip(element, { on_open_change })
    pointer_over(element)

    expect(doc_query(`.tooltip-content`).textContent).toBe(expected)
    cleanup()
    cleanup()
    expect(
      on_open_change.mock.calls.map(([open, detail]) => [open, detail.reason]),
    ).toEqual([
      [true, `pointer`],
      [false, `visibility`],
    ])
  })

  it.each([`manual`, `bogus`])(
    `rejects unsupported trigger=%s before changing the title`,
    (trigger) => {
      const element = create_element(`button`)
      element.title = `Description`
      expect(() => tooltip({ trigger } as unknown as TooltipOptions)(element)).toThrow(
        `tooltip trigger must be`,
      )
      expect(element.title).toBe(`Description`)
    },
  )

  it(`gives explicit content precedence and treats an empty result as disabled`, () => {
    pointer_over(register_tooltip(`Native`, { content: `Explicit` }).element)
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Explicit`)

    const empty = create_element(`button`)
    empty.setAttribute(`aria-label`, `Fallback must not win`)
    attach_tooltip(empty, { content: () => `` })
    pointer_over(empty)
    const tooltip_el = doc_query(`.custom-tooltip`)
    expect([tooltip_el.hidden, tooltip_el.style.display]).toEqual([true, `none`])
  })

  it.each([{}, { content: undefined }])(`delegates with absent content %j`, (options) => {
    const root = create_element()
    attach_tooltip(root, options)
    const child = append_child(root, `title`, `Dynamic child`)

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

  it(`honors explicitly disabled delegation with undefined content`, () => {
    const root = create_element()
    const child = append_child(root, `title`, `<b>Untrusted</b>`)
    attach_tooltip(root, { content: undefined, delegate: false })

    pointer_over(child)
    expect(document.querySelector(`.tooltip-content`)).toBeNull()
  })

  it(`supports explicit delegated selectors with per-trigger content factories`, () => {
    const root = create_element()
    attach_tooltip(root, {
      delegate: `[data-tip]`,
      content: (trigger) => trigger.getAttribute(`data-tip`) ?? ``,
    })
    pointer_over(append_child(root, `data-tip`, `Selected child`))
    expect(doc_query(`.tooltip-content`).textContent).toBe(`Selected child`)
  })

  it(`defaults to hover-focus and focus ignores pointer delay`, () => {
    const { element } = register_tooltip(`Keyboard`, { open_delay_ms: 1000 })
    document.dispatchEvent(new KeyboardEvent(`keydown`, { key: `Tab`, bubbles: true }))
    focus_in(element)
    expect(visible_text()).toBe(`Keyboard`)
    focus_out(element)
    expect(visible_text()).toBeNull()
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
    expect(tooltip_el.hidden).toBe(true)
    expect(on_open_change).toHaveBeenLastCalledWith(false, {
      trigger: element,
      reason: `blur`,
    })
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

  it(`keeps text-only tooltips unfocusable and trigger focus intact after Escape`, () => {
    const on_open_change = vi.fn()
    // Stands in for a surface the tooltip opened over, e.g. a dialog owning Escape.
    const surrounding_layer = vi.fn(() => true)
    onTestFinished(register_escape_layer(surrounding_layer))
    const element = create_element(`button`)
    attach_tooltip(element, {
      trigger: `focus`,
      on_open_change,
      content: `<button>Details</button>`,
    })
    element.focus()
    const tooltip_el = visible_tooltip()
    expect(tooltip_el.textContent).toBe(`<button>Details</button>`)
    expect(tooltip_el.querySelector(`button, a, input, [tabindex]`)).toBeNull()
    expect(tooltip_el.hasAttribute(`tabindex`)).toBe(false)

    document.dispatchEvent(escape_key())
    expect(tooltip_el.hidden).toBe(true)
    expect(document.activeElement).toBe(element)

    // Leaving the trigger after dismissal must not announce a second close.
    focus_out(element)
    expect(tooltip_el.hidden).toBe(true)
    expect(on_open_change.mock.calls.filter(([open]) => open === false)).toEqual([
      [false, { trigger: element, reason: `escape` }],
    ])

    // Dismissal releases the tooltip's Escape layer so the surrounding one can respond.
    document.dispatchEvent(escape_key())
    expect(surrounding_layer).toHaveBeenCalledOnce()
  })

  it.each<[TooltipOptions, boolean, boolean]>([
    [{}, false, true],
    [{ touch_focus: false }, false, true],
    [{ touch_focus: true }, true, true],
    [{ trigger: `hover`, touch_focus: true }, false, true],
    [{ trigger: `focus` }, true, false],
    [{ trigger: `focus`, touch_focus: false }, true, false],
  ])(
    `%j opens on touch focus: %s, mouse hover: %s`,
    (options, touch_opens, hover_opens) => {
      const { element } = register_tooltip(`Help`, options)
      // Browser ordering puts pointerover before pointerdown on first contact.
      pointer_over(element, `touch`)
      expect(document.querySelector(`.custom-tooltip`)).toBeNull()
      element.dispatchEvent(pointer_event(`pointerdown`, 0, 0, { pointerType: `touch` }))
      focus_in(element)
      expect(element.hasAttribute(`aria-describedby`)).toBe(touch_opens)
      expect(visible_text()).toBe(touch_opens ? `Help` : null)
      focus_out(element)
      expect(visible_text()).toBeNull()
      pointer_over(element, `mouse`)
      expect(visible_text()).toBe(hover_opens ? `Help` : null)
    },
  )

  it(`merges and removes only its aria-describedby token`, () => {
    const { element } = register_tooltip(`Described`)
    element.setAttribute(`aria-describedby`, `help error`)
    pointer_over(element)

    expect(element.getAttribute(`aria-describedby`)).toBe(
      `help error ${visible_tooltip().id}`,
    )
    pointer_out(element)
    expect(element.getAttribute(`aria-describedby`)).toBe(`help error`)
  })

  it(`recycles one node across owners and relationships`, () => {
    const { element: first } = register_tooltip(``, { content: `First` })
    const { element: second } = register_tooltip(`Second`)

    pointer_over(first)
    const shared = visible_tooltip()
    pointer_over(second)
    expect(visible_tooltip()).toBe(shared)
    expect(shared.textContent).toBe(`Second`)
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
        .map(([name]) => name)
        .filter((name) => name === `pointerdown` || name === `keydown`)

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

    pointer_over(first)
    vi.advanceTimersByTime(99)
    expect(document.querySelector(`.custom-tooltip`)).toBeNull()
    vi.advanceTimersByTime(1)
    expect(visible_tooltip().textContent).toBe(`First`)
    pointer_out(first)
    pointer_over(second)
    expect(visible_tooltip().textContent).toBe(`Second`)
  })

  it(`renders delegated title markup as plain text`, () => {
    const content = `<script>bad()</script><b>Text</b>\nNext`
    const root = create_element()
    attach_tooltip(root, { delegate: true })
    pointer_over(append_child(root, `title`, content))
    expect(visible_tooltip().textContent).toBe(content)
    expect(doc_query(`.tooltip-content`).childElementCount).toBe(0)
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
      onTestFinished(() => {
        document.body.style.removeProperty(`color-scheme`)
      })
    }
    const { element } = register_tooltip(`Themed`, style ? { style } : {})
    if (bg) element.style.setProperty(`--tooltip-bg`, bg)
    pointer_over(element)

    const tooltip_el = visible_tooltip()
    expect(tooltip_el.style.getPropertyValue(`color-scheme`)).toBe(scheme)
    // The paired text color only makes sense alongside the scheme it was chosen for
    expect(tooltip_el.style.getPropertyValue(`--text-color`)).toBe(
      scheme ? `light-dark(#222, #eee)` : ``,
    )
  })

  it(`rerenders on an active aria-label update`, async () => {
    const element = create_element(`button`)
    element.setAttribute(`aria-label`, `Initial`)
    attach_tooltip(element)
    pointer_over(element)
    element.setAttribute(`aria-label`, `Updated`)
    await Promise.resolve()
    expect(visible_tooltip().textContent).toBe(`Updated`)
  })

  it(`repositions on a batched title update and restores the final title`, async () => {
    const { cleanup, element, tooltip_el } = show_tooltip({}, `Initial`)
    const initial_left = tooltip_el.style.left
    mock_rect(element, { left: 300, top: 100, width: 80, height: 30 })
    element.title = `Intermediate`
    element.title = `Final`
    await Promise.resolve()
    expect(tooltip_el.textContent).toBe(`Final`)
    expect(tooltip_el.style.left).not.toBe(initial_left)
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
    attach_tooltip(element, { content: `Custom` })
    pointer_over(element)
    const tooltip_el = visible_tooltip()

    element.setAttribute(`title`, `Insistent`)
    await Promise.resolve()
    expect(errors).toHaveBeenCalledOnce()
    expect(tooltip_el.hidden).toBe(true)
  })

  it(`repositions on scroll, hides when unrendered or detached, and unsubscribes`, async () => {
    const { element, tooltip_el } = show_tooltip()
    const first_top = tooltip_el.style.top
    const scroll = () => {
      window.dispatchEvent(new Event(`scroll`))
      vi.advanceTimersByTime(20)
    }

    mock_rect(element, { left: 100, top: 200, width: 80, height: 30 })
    scroll()
    expect(tooltip_el.style.top).not.toBe(first_top)
    element.style.display = `none`
    scroll()
    expect(tooltip_el.hidden).toBe(true)

    // a surviving subscription still schedules a frame even though its guard no-ops it,
    // so the frame is what proves the release
    const frame = vi.spyOn(window, `requestAnimationFrame`)
    window.dispatchEvent(new Event(`scroll`))
    expect(frame).not.toHaveBeenCalled()
    frame.mockRestore()

    element.style.display = ``
    pointer_out(element)
    pointer_over(element)
    expect(tooltip_el.hidden).toBe(false)
    // no scroll or resize follows a detachment, so only the removal observer sees it
    element.remove()
    await Promise.resolve()
    expect(tooltip_el.hidden).toBe(true)
  })

  it(`keeps one bordered arrow visible and aimed after shifting`, () => {
    mock_tooltip_rect(200, 40)
    const { element } = register_tooltip(`Edge`, {
      placement: `bottom`,
      // happy-dom drops a repeated border shorthand after one containing var()
      style: `--tooltip-bg: rgb(1, 2, 3); --tooltip-border: 2px solid rgb(4, 5, 6)`,
    })
    mock_rect(element, { left: 940, top: 100, width: 40, height: 20 })
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
    show_tooltip({ placement, flip: false })
    const arrow = doc_query(`.custom-tooltip-arrow`)
    expect(arrow.style.getPropertyValue(inset_side)).not.toBe(``)
  })

  it(`clips placement to a boundary element and appends the style option`, () => {
    mock_tooltip_rect(200, 100)
    const boundary = create_element()
    mock_rect(boundary, { left: 0, top: 0, width: 300, height: 200 })
    const options = { placement: `auto`, boundary, style: `font-weight: bold` } as const
    const { element } = register_tooltip(`Bounded`, options)
    // the 1000x800 viewport leaves room to the right; the boundary leaves only above
    mock_rect(element, { left: 100, top: 150, width: 80, height: 30 })
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
    stub_props(HTMLElement.prototype, {
      popover: null,
      showPopover: show_popover,
      hidePopover: hide_popover,
    })
    const { element, tooltip_el } = show_tooltip({ strategy: `top-layer` })
    const native_matches = tooltip_el.matches.bind(tooltip_el)
    vi.spyOn(tooltip_el, `matches`).mockImplementation((selector) =>
      selector === `:popover-open` ? popover_open : native_matches(selector),
    )

    expect(show_popover).toHaveBeenCalledWith({ source: element })
    document.dispatchEvent(escape_key())
    expect(hide_popover).toHaveBeenCalledOnce()
    expect([tooltip_el.hidden, tooltip_el.style.display]).toEqual([true, `none`])

    // exiting the dismissed trigger must not rehide a popover Escape already closed
    pointer_out(element)
    expect(hide_popover).toHaveBeenCalledOnce()
    pointer_over(element)
    pointer_out(element)
    expect(show_popover).toHaveBeenCalledTimes(2)
    expect(hide_popover).toHaveBeenCalledTimes(2)
    expect([tooltip_el.hidden, tooltip_el.style.display]).toEqual([true, `none`])
  })

  it(`falls back to absolute positioning without the Popover API`, () => {
    stub_props(HTMLElement.prototype, { showPopover: undefined })
    const { element, tooltip_el } = show_tooltip({ strategy: `top-layer` })
    expect(tooltip_el.hasAttribute(`popover`)).toBe(false)
    expect(tooltip_el.style.position).toBe(`absolute`)
    pointer_out(element)
    expect(tooltip_el.hidden).toBe(true)
  })

  it(`propagates a top-layer Popover API failure`, () => {
    const show_error = new Error(`showPopover failed`)
    stub_props(HTMLElement.prototype, {
      showPopover: () => {
        throw show_error
      },
    })
    const { element } = register_tooltip(`Top layer`, { strategy: `top-layer` })
    expect(() => pointer_over(element)).toThrow(show_error)
  })
})
