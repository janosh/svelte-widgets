import type { FocusTrapOptions } from '$lib/attachments'
import { focus_trap } from '$lib/attachments'
import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import { create_element, press_key as dispatch_key } from '../index'

describe(`focus_trap`, () => {
  const make_surface = (count = 3) => {
    const surface = create_element()
    const buttons = Array.from({ length: count }, () => document.createElement(`button`))
    surface.append(...buttons)
    return { surface, buttons }
  }

  // returned so callers can assert whether the key was swallowed
  const press_tab = (shiftKey = false) => dispatch_key(document, `Tab`, { shiftKey })
  const press_escape = () => dispatch_key(document, `Escape`)

  // focus lands outside, then the microtask a recapture would schedule gets to run
  const focus_out_to = async (target: HTMLElement) => {
    target.focus()
    await Promise.resolve()
    return document.activeElement
  }

  // the trap layer stack is module-global, so a leaked trap steers a later test's Tab
  const attach_trap = (surface: HTMLElement, options: FocusTrapOptions = {}) => {
    const cleanup = focus_trap(options)(surface)
    if (cleanup) onTestFinished(cleanup)
    return cleanup
  }

  it(`focuses the first tabbable, then cycles Tab both ways past the ends`, () => {
    const { surface, buttons } = make_surface()
    attach_trap(surface)
    expect(document.activeElement).toBe(buttons[0])

    press_tab()
    expect(document.activeElement).toBe(buttons[1])
    press_tab()
    press_tab()
    expect(document.activeElement).toBe(buttons[0]) // wrapped past the last
    press_tab(true)
    expect(document.activeElement).toBe(buttons[2]) // and back past the first
  })

  it(`orders and filters structural Tab candidates`, () => {
    const surface = create_element()
    surface.innerHTML = `
      <button id="three" tabindex="3"></button><button id="one" tabindex="1"></button>
      <button id="plain"></button><button disabled></button><button tabindex="-1"></button>
      <input type="hidden" style="display: block"><button style="visibility: collapse"></button>
      <input type="radio" name="choice"><input id="checked" type="radio" name="choice" checked>
      <details id="details" tabindex="0"><summary id="summary"></summary><button></button></details>
      <fieldset disabled><legend><button id="legend"></button></legend><button></button></fieldset>
      <div hidden><button></button></div>
      <div style="display: none"><button style="display: block"></button></div>
      <div style="visibility: hidden"><button id="visible" style="visibility: visible"></button></div>
    `
    attach_trap(surface)

    for (const id of [
      `three`,
      `plain`,
      `checked`,
      `details`,
      `summary`,
      `legend`,
      `visible`,
      `one`,
    ]) {
      press_tab()
      expect(document.activeElement).toBe(surface.querySelector(`#${id}`))
    }
  })

  it.each([false, true])(
    `walks into an open shadow root (trap is host: %s)`,
    (is_host) => {
      const { surface, buttons } = make_surface(1)
      const host = is_host ? surface : document.createElement(`div`)
      const shadow = host.attachShadow({ mode: `open` })
      shadow.append(document.createElement(`button`))
      if (is_host) shadow.append(buttons[0])
      else buttons[0].before(host)

      attach_trap(surface)
      expect(shadow.activeElement).toBe(shadow.querySelector(`button`))
      press_tab()
      expect(is_host ? shadow.activeElement : document.activeElement).toBe(buttons[0])
    },
  )

  // an <a href> in an <svg> is tabbable, but an HTMLElement-typed indexOf misses the
  // SVGElement, so Tab jumped back to the edge instead of stepping to the neighbor
  it(`steps past an SVG focusable instead of jumping to the edge`, () => {
    const { surface, buttons } = make_surface()
    const svg = document.createElementNS(`http://www.w3.org/2000/svg`, `svg`)
    const svg_link = document.createElementNS(`http://www.w3.org/2000/svg`, `a`)
    svg_link.setAttribute(`href`, `#target`)
    svg.append(svg_link)
    buttons[0].after(svg)

    attach_trap(surface)
    svg_link.focus()
    expect(document.activeElement).toBe(svg_link)

    press_tab()
    expect(document.activeElement).toBe(buttons[1])
  })

  it(`resolves the initial focus selector inside the surface`, () => {
    const { surface, buttons } = make_surface()
    buttons[2].className = `wanted`
    const outside = create_element(`button`)
    outside.focus()

    attach_trap(surface, { initial: `.wanted` })
    expect(document.activeElement).toBe(buttons[2])
  })

  it(`restores to the trigger, to a named element, or wherever the user moved it`, () => {
    const trigger = create_element(`button`)
    trigger.focus()
    const { surface } = make_surface()
    focus_trap()(surface)?.()
    expect(document.activeElement).toBe(trigger)

    const elsewhere = create_element(`button`)
    focus_trap({ restore: elsewhere })(surface)?.()
    expect(document.activeElement).toBe(elsewhere)

    // a deliberate move out during the trap's life outranks the recorded trigger
    trigger.focus()
    const cleanup = focus_trap()(surface)
    elsewhere.focus()
    cleanup?.()
    expect(document.activeElement).toBe(elsewhere)
  })

  it(`gives Tab to the innermost focused trap`, () => {
    const [outer, inner] = [make_surface(), make_surface()]
    attach_trap(outer.surface)
    const cleanup_inner = attach_trap(inner.surface, { initial: false })

    press_tab()
    expect(document.activeElement).toBe(outer.buttons[1])

    inner.buttons[0].focus()
    press_tab()
    expect(document.activeElement).toBe(inner.buttons[1])

    cleanup_inner?.()
    outer.buttons[0].focus()
    press_tab()
    expect(document.activeElement).toBe(outer.buttons[1])
  })

  // the trap listens on the document, so a surface never given focus must not confiscate
  // Tab: Nav pins a submenu while focus stays on the toggle outside it
  it(`leaves Tab alone while focus sits outside the trap`, () => {
    const { surface, buttons } = make_surface()
    const outside = create_element(`button`)
    outside.focus()

    attach_trap(surface, { initial: false })
    expect(document.activeElement).toBe(outside) // initial: false kept focus put

    const event = press_tab()
    expect(document.activeElement).toBe(outside) // not dragged into the surface
    expect(event.defaultPrevented).toBe(false) // the browser still gets its Tab

    // once focus is inside, the trap takes over again
    buttons[0].focus()
    press_tab()
    expect(document.activeElement).toBe(buttons[1])
  })

  it(`covers portalled parts of the same surface via include`, () => {
    const { surface, buttons } = make_surface(1)
    const portalled = create_element() // moved to body, no longer a descendant
    const portalled_button = document.createElement(`button`)
    portalled.append(portalled_button)

    attach_trap(surface, { include: [null, portalled] })
    expect(document.activeElement).toBe(buttons[0])
    press_tab()
    expect(document.activeElement).toBe(portalled_button)
  })

  it(`does nothing when disabled`, () => {
    const { surface } = make_surface()
    const outside = create_element(`button`)
    outside.focus()

    expect(focus_trap({ enabled: false })(surface)).toBeUndefined()
    expect(document.activeElement).toBe(outside)
    press_tab()
    expect(document.activeElement).toBe(outside)
  })

  // Layered modal: backdrop button beside a dialog; only the dialog is in the Tab cycle.
  const make_layer = () => {
    const layer = create_element()
    const backdrop = document.createElement(`button`)
    const dialog = document.createElement(`section`)
    dialog.className = `dialog`
    const [first, last] = [
      document.createElement(`button`),
      document.createElement(`button`),
    ]
    dialog.append(first, last)
    layer.append(backdrop, dialog)
    return { layer, backdrop, dialog, first, last }
  }

  it(`without root the whole node is the trap, backdrop included`, () => {
    const { layer, backdrop, first } = make_layer()
    attach_trap(layer)
    expect(document.activeElement).toBe(backdrop) // first tabbable in DOM order
    press_tab()
    expect(document.activeElement).toBe(first)
  })

  it.each([`selector`, `element`, `function`] as const)(
    `root as %s keeps the sibling backdrop out of the Tab cycle`,
    (kind) => {
      const { layer, backdrop, dialog, first, last } = make_layer()
      const root =
        kind === `selector` ? `.dialog` : kind === `element` ? dialog : () => dialog
      attach_trap(layer, { root })

      expect(document.activeElement).toBe(first) // the backdrop is no longer reachable
      press_tab()
      expect(document.activeElement).toBe(last)
      press_tab()
      expect(document.activeElement).toBe(first) // wrapped, never onto the backdrop
      press_tab(true)
      expect(document.activeElement).toBe(last)

      // `root` narrows what Tab cycles, not what counts as inside: a focused backdrop
      // reading as outside would disarm Tab entirely
      backdrop.focus()
      expect(press_tab().defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(first)
    },
  )

  it(`resolves initial within root, and falls back to the node when root finds nothing`, () => {
    const { layer, dialog, last } = make_layer()
    const decoy = document.createElement(`button`)
    decoy.className = `wanted` // outside the root, so the selector must not reach it
    layer.prepend(decoy)
    last.className = `wanted`
    attach_trap(layer, { root: dialog, initial: `.wanted` })
    expect(document.activeElement).toBe(last)

    const unresolvable = make_layer()
    attach_trap(unresolvable.layer, { root: () => null })
    expect(document.activeElement).toBe(unresolvable.backdrop) // back to the node
  })

  it(`handles Escape only when configured and only in the innermost trap`, () => {
    const plain = make_surface()
    const cleanup_plain = attach_trap(plain.surface)
    expect(press_escape().defaultPrevented).toBe(false)
    cleanup_plain?.()

    const [outer, inner] = [make_surface(), make_surface()]
    const [on_outer, on_inner] = [vi.fn(), vi.fn()]
    attach_trap(outer.surface, { on_escape: on_outer })
    const cleanup_inner = attach_trap(inner.surface, { on_escape: on_inner })

    const event = press_escape()
    expect(on_inner).toHaveBeenCalledTimes(1)
    expect(on_outer).not.toHaveBeenCalled()
    // canceled on purpose so a native <dialog> around the surface needs a second Escape
    expect(event.defaultPrevented).toBe(true)

    cleanup_inner?.()
    press_escape()
    expect(on_outer).toHaveBeenCalledTimes(1)
    expect(on_inner).toHaveBeenCalledTimes(1)
  })

  it(`recapture pulls focus back to the last element that held it inside`, async () => {
    const { surface, buttons } = make_surface()
    attach_trap(surface, { recapture: true })
    expect(document.activeElement).toBe(buttons[0])

    buttons[2].focus()
    expect(await focus_out_to(create_element(`button`))).toBe(buttons[2])
  })

  // a recapture re-resolves `root`, so one trap can inject its fallback tabindex into
  // several elements over its life and owes each a cleanup
  it(`takes the injected tabindex off every root it fell back to`, async () => {
    const surface = create_element()
    // no tabbables in either panel, so the root itself is the fallback focus target
    const panels = [document.createElement(`div`), document.createElement(`div`)]
    surface.append(...panels)
    let current = panels[0]

    const cleanup = attach_trap(surface, {
      root: () => current,
      recapture: true,
      restore: false,
    })
    expect(panels[0].getAttribute(`tabindex`)).toBe(`-1`)

    // the first panel goes away as focus leaves, so the recapture resolves the other
    current = panels[1]
    create_element(`button`).focus()
    panels[0].remove()
    await Promise.resolve()
    expect(panels[1].getAttribute(`tabindex`)).toBe(`-1`)

    cleanup?.()
    expect(panels.map((panel) => panel.hasAttribute(`tabindex`))).toEqual([false, false])
  })

  // counterpart of the Tab holds_focus guard: a trap never given focus must not summon it
  it(`recapture stays out of focus moves that never touched the trap`, async () => {
    const { surface } = make_surface()
    const elsewhere = create_element(`button`)
    attach_trap(surface, { recapture: true, initial: false })

    create_element(`button`).focus() // a focus move that never touches the trap
    expect(await focus_out_to(elsewhere)).toBe(elsewhere)
  })

  it(`leaves escaped focus alone without recapture, and after teardown with it`, async () => {
    const { surface, buttons } = make_surface()
    const outside = create_element(`button`)

    const cleanup_plain = attach_trap(surface, { restore: false })
    buttons[1].focus()
    expect(await focus_out_to(outside)).toBe(outside) // no recapture by default
    cleanup_plain?.()

    const removals = vi.spyOn(document, `removeEventListener`)
    const cleanup = focus_trap({ recapture: true, restore: false })(surface)
    buttons[1].focus()
    cleanup?.()
    expect(await focus_out_to(outside)).toBe(outside) // a torn-down trap stops recapturing
    // Silencing recapture also releases its document listeners.
    expect(removals.mock.calls.map(([type]) => type)).toEqual(
      expect.arrayContaining([`focusin`, `focusout`]),
    )
    removals.mockRestore()
  })
})
