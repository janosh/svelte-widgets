import type { TooltipOpenReason, TooltipOptions } from '$lib/attachments'
import { tooltip } from '$lib/attachments'
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

  type QueuedCase = [string, readonly string[], boolean, string?]
  const setup_controlled_handoff = (blur_on_open = false, content = `Controlled`) => {
    const on_open_change = vi.fn()
    const controlled = create_element(`button`)
    const options: TooltipOptions = { content, open: true, on_open_change }
    const close = attach_tooltip(controlled, options)
    const root = create_element()
    const child = document.createElement(`button`)
    const other = document.createElement(`button`)
    child.title = `Next`
    other.title = `Other`
    root.append(child, other)
    attach_tooltip(
      root,
      blur_on_open
        ? {
            on_open_change: (open) => {
              if (open) {
                child.dispatchEvent(
                  new FocusEvent(`focusout`, {
                    bubbles: true,
                    relatedTarget: document.body,
                  }),
                )
              }
            },
          }
        : {},
    )
    mock_rect(child, { left: 250, top: 100, width: 80, height: 30 })
    mock_rect(other, { left: 350, top: 100, width: 80, height: 30 })
    return { child, close, controlled, on_open_change, options, other }
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

  it(`keeps one tooltip when pointer and focus states overlap`, () => {
    const on_open_change = vi.fn()
    const { element, tooltip_el } = show_tooltip({ on_open_change })
    element.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
    pointer_out(element)
    expect(tooltip_el.hidden).toBe(false)

    element.dispatchEvent(
      new FocusEvent(`focusout`, { bubbles: true, relatedTarget: document.body }),
    )
    vi.advanceTimersByTime(0)
    expect(tooltip_el.hidden).toBe(true)
    expect(on_open_change).toHaveBeenLastCalledWith(false, open_detail(element, `blur`))
  })

  it(`stays open while the pointer crosses onto the tooltip`, () => {
    const { element, tooltip_el } = show_tooltip({ close_delay_ms: 100 })
    pointer_out(element, tooltip_el)
    vi.advanceTimersByTime(100)
    expect(tooltip_el.hidden).toBe(false)

    tooltip_el.dispatchEvent(
      pointer_event(`pointerleave`, 100, 140, {
        pointerType: `mouse`,
        relatedTarget: document.body,
      }),
    )
    vi.advanceTimersByTime(100)
    expect(tooltip_el.hidden).toBe(true)
  })

  it(`stays open while another pointer remains on the trigger`, () => {
    const { tooltip_el } = show_tooltip()
    tooltip_el.dispatchEvent(
      pointer_event(`pointerenter`, 100, 140, { pointerType: `pen` }),
    )
    tooltip_el.dispatchEvent(
      pointer_event(`pointerleave`, 100, 140, {
        pointerType: `pen`,
        relatedTarget: document.body,
      }),
    )
    expect(tooltip_el.hidden).toBe(false)
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

  it(`restores trigger focus when Escape hides custom rendered content`, () => {
    const element = create_element(`button`)
    attach_tooltip(element, {
      render: (content_el) => {
        const control = document.createElement(`button`)
        control.textContent = `Custom control`
        content_el.append(control)
        return undefined
      },
    })
    pointer_over(element)
    const control = doc_query<HTMLButtonElement>(`.tooltip-content button`)
    control.focus()

    document.dispatchEvent(escape_key())
    expect(doc_query(`.custom-tooltip`).hidden).toBe(true)
    expect(document.activeElement).toBe(element)
  })

  it(`stays dismissed when Escape hands focus back to the trigger`, () => {
    const on_open_change = vi.fn()
    const element = create_element(`button`)
    attach_tooltip(element, {
      trigger: `focus`,
      on_open_change,
      render: (content_el) => {
        content_el.append(document.createElement(`button`))
        return undefined
      },
    })
    element.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
    const tooltip_el = visible_tooltip()
    doc_query<HTMLButtonElement>(`.tooltip-content button`).focus()
    document.dispatchEvent(escape_key())
    expect(tooltip_el.hidden).toBe(true)

    // Handing focus back re-enters through focusout/focusin, which must not resurrect
    // the dismissed tooltip — leaving the trigger afterwards is not a second close.
    element.dispatchEvent(
      new FocusEvent(`focusout`, { bubbles: true, relatedTarget: document.body }),
    )
    vi.advanceTimersByTime(0)
    expect(tooltip_el.hidden).toBe(true)
    expect(on_open_change.mock.calls.filter(([open]) => open === false)).toEqual([
      [false, open_detail(element, `escape`)],
    ])
  })

  it(`focus opens immediately despite a long pointer delay`, () => {
    const { element } = register_tooltip(`Keyboard`, { open_delay_ms: 1000 })
    document.dispatchEvent(new KeyboardEvent(`keydown`, { key: `Tab`, bubbles: true }))
    element.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))

    expect(visible_tooltip().textContent).toBe(`Keyboard`)
  })

  it(`suppresses touch-induced default triggers but allows explicit focus mode`, () => {
    const { element: automatic } = register_tooltip(`Automatic`)
    // Browser ordering puts pointerover before pointerdown on first contact.
    pointer_over(automatic, `touch`)
    automatic.dispatchEvent(pointer_event(`pointerdown`, 0, 0, { pointerType: `touch` }))
    automatic.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
    expect(document.querySelector(`.custom-tooltip`)).toBeNull()
    pointer_over(automatic, `mouse`)
    expect(visible_tooltip().textContent).toBe(`Automatic`)

    const { element: focus_only } = register_tooltip(`Focus only`, { trigger: `focus` })
    focus_only.dispatchEvent(pointer_event(`pointerdown`, 0, 0, { pointerType: `touch` }))
    focus_only.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
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

  it(`recycles one node across triggers and swaps owner relationships`, () => {
    const { element: first } = register_tooltip(`First`)
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
    element.dispatchEvent(
      new FocusEvent(`focusout`, { bubbles: true, relatedTarget: document.body }),
    )
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

  it.each([
    [`hands off immediately after controlled close`, [`close`], true],
    [`hands off after controlled state closes`, [`release`], true],
    [`hands off when controlled content never opened`, [`release`], true, ``],
    [`cancels after its pointer leaves`, [`leave-child`, `close`], false],
    [
      `survives blur while its pointer remains`,
      [`focus-child`, `blur-child`, `close`],
      true,
    ],
    [
      `keeps its pointer state when blur follows controlled close`,
      [`focus-child`, `close`, `blur-child`],
      true,
    ],
    [
      `survives reentrant blur from its open callback`,
      [`focus-child-reentrant`, `close`],
      true,
    ],
    [
      `keeps a focused trigger ahead of a transient hover`,
      [`leave-child`, `focus-child`, `hover-other`, `leave-other`, `close`],
      true,
    ],
    [
      `restores a hovered trigger after transient focus elsewhere`,
      [`focus-other`, `blur-other`, `close`],
      true,
    ],
    [
      `drops a stale hover after focus elsewhere also leaves`,
      [`focus-other`, `leave-child`, `blur-other`, `close`],
      false,
    ],
  ] as const)(`queued %s`, async (...[, actions, opens, content]: QueuedCase) => {
    const controlled_content = content ?? `Controlled`
    const reentrant = actions.some((action) => action === `focus-child-reentrant`)
    const { child, close, controlled, on_open_change, options, other } =
      setup_controlled_handoff(reentrant, controlled_content)
    await Promise.resolve()

    pointer_over(child)
    expect(document.querySelector(`.tooltip-content`)?.textContent).toBe(
      controlled_content || undefined,
    )
    expect(child.title).toBe(`Next`)
    expect(on_open_change).toHaveBeenLastCalledWith(
      false,
      open_detail(controlled, `pointer`),
    )
    for (const action of actions) {
      if (action === `close`) close()
      else if (action === `release`) {
        options.open = false
        pointer_out(controlled)
      } else if (action === `leave-child`) pointer_out(child)
      else if (action === `hover-other`) pointer_over(other)
      else if (action === `leave-other`) pointer_out(other)
      else {
        const target = action.includes(`child`) ? child : other
        const event_type = action.startsWith(`focus`) ? `focusin` : `focusout`
        target.dispatchEvent(
          new FocusEvent(event_type, {
            bubbles: true,
            relatedTarget: event_type === `focusout` ? document.body : null,
          }),
        )
      }
    }
    vi.advanceTimersByTime(0)

    if (opens) {
      expect(visible_tooltip().textContent).toBe(`Next`)
      expect(child.hasAttribute(`title`)).toBe(false)
    } else {
      expect(document.querySelector<HTMLElement>(`.custom-tooltip`)?.hidden).toBe(true)
      expect(child.title).toBe(`Next`)
    }
  })

  it(`drops queued triggers once an activation succeeds`, async () => {
    // Nesting the controlled trigger inside a queued one is the only way the pointer
    // reaches it without leaving the outer trigger, so a two-deep queue survives to
    // see a successful activation.
    const outer = create_element()
    outer.title = `Outer`
    const controlled = document.createElement(`button`)
    outer.append(controlled)
    mock_rect(controlled, { left: 20, top: 20, width: 80, height: 30 })
    attach_tooltip(outer)
    const cleanup_controlled = attach_tooltip(controlled, {
      content: `Controlled`,
      open: true,
    })
    const { element: elsewhere } = register_tooltip(`Elsewhere`)
    await Promise.resolve()

    pointer_over(outer) // queues behind the controlled tooltip
    elsewhere.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true })) // queues ahead
    pointer_out(outer, controlled) // stays inside `outer`, so its entry survives
    pointer_over(controlled) // reactivating the controlled trigger clears the queue
    elsewhere.dispatchEvent(
      new FocusEvent(`focusout`, { bubbles: true, relatedTarget: document.body }),
    )
    cleanup_controlled()
    vi.advanceTimersByTime(0)

    // Nothing replays: the queue was superseded, not merely reordered.
    expect(document.querySelector<HTMLElement>(`.custom-tooltip`)?.hidden).toBe(true)
  })

  it(`requests controlled opening without showing against open: false`, () => {
    const on_open_change = vi.fn()
    const { element } = register_tooltip(`Controlled`, { open: false, on_open_change })
    pointer_over(element)

    expect(document.querySelector(`.custom-tooltip`)).toBeNull()
    expect(on_open_change).toHaveBeenCalledWith(true, open_detail(element, `pointer`))
  })

  it(`runs custom render cleanup when switching owners`, () => {
    const cleanup = vi.fn()
    const first = create_element(`button`)
    attach_tooltip(first, {
      render: (content_el) => {
        content_el.textContent = `Rendered`
        return cleanup
      },
    })
    const { element: second } = register_tooltip(`Second`)

    pointer_over(first)
    expect(visible_tooltip().textContent).toBe(`Rendered`)
    pointer_over(second)
    expect(cleanup).toHaveBeenCalledOnce()
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
    const tag_name = `tooltip-title-context`
    if (!customElements.get(tag_name)) {
      customElements.define(
        tag_name,
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
    }
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

  it(`repositions on scroll through one coalesced animation frame`, () => {
    const element = create_element(`button`)
    element.title = `Moving`
    mock_rect(element, { left: 100, top: 100, width: 80, height: 30 })
    attach_tooltip(element)
    pointer_over(element)
    const tooltip_el = visible_tooltip()
    const first_top = tooltip_el.style.top

    mock_rect(element, { left: 100, top: 200, width: 80, height: 30 })
    window.dispatchEvent(new Event(`scroll`))
    vi.advanceTimersByTime(20)
    expect(tooltip_el.style.top).not.toBe(first_top)
  })

  it(`aims the arrow at an edge trigger after shifting`, () => {
    mock_tooltip_rect(200, 40)
    const element = create_element(`button`)
    element.title = `Edge`
    mock_rect(element, { left: 940, top: 100, width: 40, height: 20 })
    attach_tooltip(element, { placement: `bottom` })
    pointer_over(element)
    const tooltip_el = visible_tooltip()
    const arrow = doc_query(`.custom-tooltip-arrow`)

    expect(Number(tooltip_el.style.left.replace(/px$/u, ``))).toBeLessThan(860)
    expect(arrow.style.left).not.toBe(`calc(50% - 6px)`)
    expect(Number(arrow.style.left.replace(/px$/u, ``))).toBeGreaterThan(150)
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

  it(`uses the Popover top layer when available`, () => {
    const show_popover = vi.fn()
    const hide_popover = vi.fn()
    cleanups.push(
      stub_prop(HTMLElement.prototype, `popover`, null),
      stub_prop(HTMLElement.prototype, `showPopover`, show_popover),
      stub_prop(HTMLElement.prototype, `hidePopover`, hide_popover),
    )
    const { element } = register_tooltip(`Top layer`, { strategy: `top-layer` })
    pointer_over(element)

    expect(show_popover).toHaveBeenCalledWith({ source: element })
    pointer_out(element)
    expect(hide_popover).toHaveBeenCalledOnce()
  })

  it(`falls back to the document layer without the Popover API`, () => {
    const properties = [`popover`, `showPopover`, `hidePopover`] as const
    const descriptors = properties.map((property) =>
      Object.getOwnPropertyDescriptor(HTMLElement.prototype, property),
    )
    properties.forEach((property) =>
      Reflect.deleteProperty(HTMLElement.prototype, property),
    )
    cleanups.push(() => {
      properties.forEach((property, idx) => {
        const descriptor = descriptors[idx]
        if (descriptor) Object.defineProperty(HTMLElement.prototype, property, descriptor)
      })
    })
    const { cleanup, element, tooltip_el } = show_tooltip(
      { strategy: `top-layer` },
      `Fallback`,
    )

    expect(tooltip_el.style.position).toBe(`absolute`)
    pointer_out(element)
    expect(tooltip_el.hidden).toBe(true)
    expect(tooltip_el.style.display).toBe(`none`)
    cleanup()
    expect(document.querySelector(`.custom-tooltip`)).toBeNull()
    expect(element.title).toBe(`Fallback`)
  })
})
