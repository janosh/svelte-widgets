import DraggablePane from '$lib/DraggablePane.svelte'
import pane_source from '$lib/DraggablePane.svelte?raw'
import demo_page from '$root/src/routes/(demos)/(draggable-pane)/draggable-pane/+page.md?raw'
import { createRawSnippet, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { doc_query, escape_key, mock_rect, pointer_event, stub_prop } from './index'
import TestPaneExternalToggles from './TestPaneExternalToggles.svelte'

// Every drag/resize test works against the same 450x300 pane; only the origin varies.
const mock_pane_rect = (pane: HTMLElement, left = 0, top = 0) =>
  mock_rect(pane, { left, top, width: 450, height: 300 })

describe(`DraggablePane`, () => {
  // click_outside registers document listeners that outlive innerHTML = '', and
  // stubbed globals must not leak into the next case
  const mounted: Record<string, unknown>[] = []
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const app of mounted.splice(0)) void unmount(app)
    for (const undo of cleanups.splice(0)) undo()
    vi.useRealTimers()
  })

  // raw snippets render once, so this captures the payload rather than tracking it;
  // the reactive half of the pane state is asserted through the DOM below
  let last_pane_state: Record<string, unknown> = {}
  const children = createRawSnippet<[Record<string, unknown>]>((state) => ({
    render: () => {
      last_pane_state = state()
      return `<div data-testid="content">pane content</div>`
    },
  }))

  type PaneProps = Record<string, unknown>
  const setup = async (props: PaneProps = {}) => {
    mounted.push(
      mount(DraggablePane, { target: document.body, props: { children, ...props } }),
    )
    await tick()
    const pane = doc_query<HTMLDivElement>(`.draggable-pane`)
    // happy-dom does not apply the component stylesheet; mirror its border-box rule so
    // resizable's box-model conversion matches the browser.
    pane.style.boxSizing = `border-box`
    return {
      toggle: doc_query<HTMLButtonElement>(`button.pane-toggle`),
      // by class, not [role="dialog"]: the role is itself under test, and finding the
      // pane by it would make those assertions tautological
      pane,
    }
  }

  // Toggle bottom-right at (320, 420) in a 1000x500 viewport, pane 450 wide.
  const mock_viewport = (inner_width = 1000, inner_height = 500) => {
    cleanups.push(
      stub_prop(globalThis, `innerWidth`, inner_width),
      stub_prop(globalThis, `innerHeight`, inner_height),
    )
  }

  // for the tests that need no geometry mocked before the pane opens
  const open_pane = async (props: PaneProps = {}) => {
    const refs = await setup(props)
    refs.toggle.click()
    await tick()
    return refs
  }

  // pointer_event sets isPrimary; a bare PointerEvent reads as a second finger
  const press = (target: EventTarget) =>
    target.dispatchEvent(pointer_event(`pointerdown`, 0, 0))
  // The pane dismisses on release, so a gesture meant to dismiss needs both halves.
  // Kept apart from `press` because a lone pointerdown is what several tests assert on.
  const press_release = (target: EventTarget) => {
    press(target)
    // detail: 1 is a real pointer click; 0 is keyboard/programmatic and skips the
    // press-started-inside exemption
    return target.dispatchEvent(new MouseEvent(`click`, { bubbles: true, detail: 1 }))
  }
  const release_pointer = () =>
    globalThis.dispatchEvent(
      new PointerEvent(`pointerup`, { bubbles: true, isPrimary: true }),
    )
  // returns false once a handler cancels the key, i.e. the pane swallowed it
  const escape = () => document.dispatchEvent(escape_key())
  const is_open = (pane: HTMLElement) => pane.style.display === `grid`

  // the press-move-release both attachments listen for, on the pane (resize) or on
  // its handle (drag)
  const drag = (
    target: EventTarget,
    [start_x, start_y]: readonly number[],
    [end_x, end_y]: readonly number[],
  ) => {
    target.dispatchEvent(pointer_event(`pointerdown`, start_x, start_y))
    globalThis.dispatchEvent(pointer_event(`pointermove`, end_x, end_y))
    release_pointer()
  }
  const drag_by = (dx: number, dy: number) =>
    drag(doc_query(`.drag-handle`), [0, 0], [dx, dy])
  // resizable hit-tests nothing itself: each edge gets a strip, and pressing one is the
  // only way in. happy-dom paints nothing, so the corner's precedence lives in playwright.
  const handle_of = (pane: HTMLElement, attribute: string, value: string) => {
    const handle = pane.querySelector<HTMLElement>(`[${attribute}="${value}"]`)
    if (!handle) throw new Error(`pane has no ${value} ${attribute}`)
    return handle
  }
  const strip_of = (pane: HTMLElement, edge: `right` | `bottom`) =>
    handle_of(pane, `data-resize-edge`, edge)
  const corner_of = (pane: HTMLElement, corner = `bottom-right`) =>
    handle_of(pane, `data-resize-corner`, corner)

  test(`toggle opens the pane, flips aria-expanded and swaps the icon`, async () => {
    const { toggle, pane } = await setup()
    expect(is_open(pane)).toBe(false)
    expect(toggle.getAttribute(`aria-expanded`)).toBe(`false`)

    toggle.click()
    await tick()
    expect(is_open(pane)).toBe(true)
    expect(toggle.getAttribute(`aria-expanded`)).toBe(`true`)
    // closed_icon is Expand, open_icon is Cross — different paths, so the swap shows
    const open_path = doc_query(`button.pane-toggle path`).getAttribute(`d`)

    toggle.click()
    await tick()
    expect(is_open(pane)).toBe(false)
    expect(doc_query(`button.pane-toggle path`).getAttribute(`d`)).not.toBe(open_path)
  })

  test.each([
    [`toggle`, (toggle: HTMLElement) => toggle.click()],
    [`button`, () => doc_query<HTMLButtonElement>(`.close-button`).click()],
    [`pointer`, () => press_release(document.body)],
  ] as const)(`closes via %s`, async (via, dismiss) => {
    const on_close = vi.fn()
    const { toggle, pane } = await open_pane({ on_close })
    // the close button only exists once the pane has been moved
    if (via === `button`) {
      drag_by(0, 0)
      await tick()
    }

    dismiss(toggle)
    await tick()

    expect(is_open(pane)).toBe(false)
    expect(on_close).toHaveBeenCalledWith({ via })
  })

  // dismiss_on undefined leaves the pane's own default in force, which is what pins it
  const mount_toggles = async (dismiss_on?: `press` | `release`, open = false) => {
    const props = { dismiss_on, open }
    mounted.push(mount(TestPaneExternalToggles, { target: document.body, props }))
    await tick()
    return {
      pane: doc_query<HTMLDivElement>(`.draggable-pane`),
      checkbox: doc_query<HTMLInputElement>(`input[type="checkbox"]`),
      trigger: doc_query<HTMLButtonElement>(`[data-testid="pointerdown-trigger"]`),
    }
  }

  // The main reason for the `release` default. Dismissing on the press lets Svelte's flush
  // write checked=false to the DOM before the click, whose pre-click activation flips it back
  // for the bind to commit — reopening the pane, leaving it uncloseable from that checkbox.
  // On the click, dismissal lands after that activation instead.
  test.each([
    [`press`, true, `press`],
    [`release`, false, `release`],
    [`the default`, false, undefined],
  ] as const)(
    `dismiss_on=%s, an outside checkbox bound to open reopens the pane: %s`,
    async (_label, reopens, dismiss_on) => {
      const { pane, checkbox } = await mount_toggles(dismiss_on, true)
      expect(is_open(pane)).toBe(true)

      press(checkbox)
      await tick() // the flush a browser gets between pointerdown and click
      checkbox.click() // UA activation: flips checked, then fires click and change
      await tick()

      expect(is_open(pane)).toBe(reopens)
      expect(checkbox.checked).toBe(reopens)
    },
  )

  // `release` keeps a pane open during a bare press behind it, but closes an outside trigger
  // that opened on the same gesture. `press` has the inverse behavior.
  test.each([
    [`press`, true, false],
    [`release`, false, true],
  ] as const)(
    `dismiss_on=%s times outside pointer gestures`,
    async (dismiss_on, stays_open_after_click, stays_open_after_press) => {
      const { pane, trigger } = await mount_toggles(dismiss_on)

      press(trigger)
      await tick()
      expect(is_open(pane)).toBe(true)
      trigger.dispatchEvent(new MouseEvent(`click`, { bubbles: true, detail: 1 }))
      await tick()
      expect(is_open(pane)).toBe(stays_open_after_click)

      // A second press opens in both modes; no click follows, as when panning behind the pane.
      press(trigger)
      await tick()
      expect(is_open(pane)).toBe(true)
      press(document.body)
      await tick()
      expect(is_open(pane)).toBe(stays_open_after_press)
    },
  )

  // and the fix for it, when the trigger is one the consumer holds a reference to
  test.each([`press`, `release`] as const)(
    `inside spares an outside control's press and click, dismiss_on=%s`,
    async (dismiss_on) => {
      const control = document.createElement(`button`)
      document.body.append(control)
      cleanups.push(() => control.remove())
      const { pane } = await open_pane({ inside: [control], dismiss_on })

      press_release(control)
      await tick()
      expect(is_open(pane)).toBe(true)

      press_release(document.body) // control: an unregistered element still dismisses
      await tick()
      expect(is_open(pane)).toBe(false)
    },
  )

  test(`persistent ignores an outside press but honors Escape`, async () => {
    const on_close = vi.fn()
    const { pane } = await open_pane({ persistent: true, on_close })

    press_release(document.body)
    await tick()
    expect(is_open(pane)).toBe(true)
    expect(on_close).not.toHaveBeenCalled()

    escape()
    await tick()
    expect(is_open(pane)).toBe(false)
    expect(on_close).toHaveBeenCalledWith({ via: `escape` })
  })

  test(`closing hands focus inside the pane back to the toggle`, async () => {
    const { pane, toggle } = await open_pane()
    const field = document.createElement(`input`)
    pane.querySelector(`.pane-content`)?.append(field)
    field.focus()
    expect(document.activeElement).toBe(field)

    escape()
    await tick()
    expect(document.activeElement).toBe(toggle)
  })

  test(`Escape while closed leaves the pane alone and the key to the page`, async () => {
    const on_close = vi.fn()
    await setup({ on_close })

    const reached_the_page = escape()
    await tick()

    expect(on_close).not.toHaveBeenCalled()
    expect(reached_the_page).toBe(true)
  })

  // The whole point of position="fixed": a toggle low on screen or hard against the
  // right edge must not park the pane off-viewport.
  test.each([
    // [description, toggle rect, expected left, top, --pane-viewport-clamp]
    // the top clamps to 500 - 180 - 8, leaving exactly that 180 below it
    [`bottom edge`, { left: 300, top: 400 }, `8px`, `312px`, `180px`],
    [`right edge`, { left: 970, top: 20 }, `542px`, `45px`, `447px`], // left = 1000 - 450 - 8
    [`no clamping needed`, { left: 600, top: 20 }, `175px`, `45px`, `447px`], // 620 - 450 + 5
  ])(`fixed positioning clamps against the %s`, async (_desc, rect, left, top, clamp) => {
    mock_viewport()
    const { toggle, pane } = await setup({ position: `fixed` })
    mock_rect(toggle, { ...rect, width: 20, height: 20 })
    mock_pane_rect(pane)

    toggle.click()
    await tick()

    expect(pane.style.left).toBe(left)
    expect(pane.style.top).toBe(top)
    // the room left below the pane's top edge, which CSS min()s into its max-height
    expect(pane.style.getPropertyValue(`--pane-viewport-clamp`)).toBe(clamp)
  })

  // Stubbed on the pane, not the toggle: the pane's own containing block is what its
  // left/top resolve against, and the two only coincide while nothing repositions the
  // toggle out of it.
  test(`absolute positioning measures against the pane's offsetParent`, async () => {
    const ancestor = document.createElement(`div`)
    document.body.append(ancestor)
    mock_rect(ancestor, { left: 100, top: 50, width: 800, height: 600 })
    const { toggle, pane } = await setup()
    cleanups.push(stub_prop(pane, `offsetParent`, ancestor))
    mock_rect(toggle, { left: 700, top: 300, width: 20, height: 20 })
    mock_pane_rect(pane)

    toggle.click()
    await tick()

    expect(pane.style.left).toBe(`175px`) // 720 - 100 - 450 + 5
    expect(pane.style.top).toBe(`275px`) // 320 - 50 + 5
    // absolute panes scroll with the page, so no viewport cap is written
    expect(pane.style.getPropertyValue(`--pane-viewport-clamp`)).toBe(``)
  })

  test(`falls back to document coordinates without a positioned ancestor`, async () => {
    cleanups.push(
      stub_prop(globalThis, `scrollX`, 30),
      stub_prop(globalThis, `scrollY`, 60),
    )
    const { toggle, pane } = await setup()
    cleanups.push(stub_prop(toggle, `offsetParent`, null))
    mock_rect(toggle, { left: 700, top: 300, width: 20, height: 20 })
    mock_pane_rect(pane)

    toggle.click()
    await tick()

    expect(pane.style.left).toBe(`305px`) // 720 - 450 + 5 + 30
    expect(pane.style.top).toBe(`385px`) // 320 + 5 + 60
  })

  test(`reset returns a dragged pane to its anchor and hides the controls`, async () => {
    const ancestor = document.createElement(`div`)
    document.body.append(ancestor)
    mock_rect(ancestor, { left: 0, top: 0, width: 800, height: 600 })
    const { toggle, pane } = await setup()
    cleanups.push(stub_prop(toggle, `offsetParent`, ancestor))
    mock_rect(toggle, { left: 500, top: 100, width: 20, height: 20 })
    mock_pane_rect(pane, 75, 125)

    toggle.click()
    await tick()
    const anchored = { left: pane.style.left, top: pane.style.top }
    expect(anchored).toEqual({ left: `75px`, top: `125px` })
    expect(document.querySelector(`.reset-button`)).toBeNull()

    drag_by(60, 40)
    await tick()
    expect({ left: pane.style.left, top: pane.style.top }).toEqual({
      left: `135px`,
      top: `165px`,
    })

    doc_query<HTMLButtonElement>(`.reset-button`).click()
    await tick()

    expect({ left: pane.style.left, top: pane.style.top }).toEqual(anchored)
    // the controls hide again, which is the pane reporting has_been_dragged = false
    expect(document.querySelector(`.reset-button`)).toBeNull()
  })

  test(`labels prop renames the control-tab buttons, omitted keys fall back`, async () => {
    await open_pane({
      has_been_dragged: true,
      labels: { close_pane: `Bereich schließen` },
    })

    const attrs = (selector: string) => {
      const btn = doc_query(selector)
      return [btn.getAttribute(`title`), btn.getAttribute(`aria-label`)]
    }
    expect(attrs(`.close-button`)).toEqual([`Bereich schließen`, `Bereich schließen`])
    expect(attrs(`.reset-button`)).toEqual([`Reset pane position`, `Reset pane position`])
  })

  test(`a drag reports through on_drag_start and data-dragging`, async () => {
    const on_drag_start = vi.fn()
    const { pane } = await open_pane({ on_drag_start })
    expect(pane.dataset.dragging).toBe(`false`)

    doc_query(`.drag-handle`).dispatchEvent(pointer_event(`pointerdown`, 0, 0))
    await tick()
    expect(on_drag_start).toHaveBeenCalledTimes(1)
    expect(pane.dataset.dragging).toBe(`true`)

    release_pointer()
    await tick()
    expect(pane.dataset.dragging).toBe(`false`)
  })

  // The toggle snippet exists because matterviz passes icons this library doesn't
  // bundle (Info, Filter, Export, Orbit), which Icon.svelte swaps for its Alert fallback
  test(`both snippets get the pane state, and toggle replaces the button content`, async () => {
    let toggle_state: Record<string, unknown> = {}
    const toggle = createRawSnippet<[Record<string, unknown>]>((state) => ({
      render: () => {
        toggle_state = state()
        return `<span data-testid="custom-toggle">custom</span>`
      },
    }))
    const { toggle: toggle_btn } = await setup({ open: true, toggle })

    const pane_state = {
      open: true,
      show_controls: false,
      has_been_dragged: false,
      dragging: false,
    }
    expect(last_pane_state).toEqual(pane_state)
    expect(toggle_state).toEqual(pane_state)
    expect(toggle_btn.querySelector(`[data-testid="custom-toggle"]`)).not.toBeNull()
    // the bundled icon is gone, but the button (and its aria wiring) is still ours
    expect(toggle_btn.querySelector(`svg`)).toBeNull()
    expect(toggle_btn.getAttribute(`aria-expanded`)).toBe(`true`)
  })

  test.each([
    [`both`, [`bottom`, `right`], `8px`, `8px`, true],
    [`width`, [`right`], `8px`, ``, false],
    [`height`, [`bottom`], ``, `8px`, false],
    [`none`, [], ``, ``, false],
  ] as const)(
    `resize=%s configures edge strips, gutters and grip`,
    async (resize, expected_edges, padding_right, padding_bottom, has_grip) => {
      const { pane } = await setup({ resize })
      const strips = [...pane.querySelectorAll(`[data-resize-edge]`)]
      expect(strips.map((strip) => strip.getAttribute(`data-resize-edge`))).toEqual(
        expected_edges,
      )
      expect([pane.style.paddingRight, pane.style.paddingBottom]).toEqual([
        padding_right,
        padding_bottom,
      ])
      expect(Boolean(pane.querySelector(`.resize-grip`))).toBe(has_grip)
    },
  )

  // An edge strip writes only its own axis; the other stays with the stylesheet, so a
  // height drag cannot freeze the pane's responsive width (and vice versa).
  test.each([
    [`both`, `right`, [545, 150], { width: `550px`, height: `` }],
    [`both`, `bottom`, [200, 395], { width: ``, height: `400px` }],
    [`width`, `right`, [545, 150], { width: `550px`, height: `` }],
    [`height`, `bottom`, [200, 395], { width: ``, height: `400px` }],
  ] as const)(
    `resize=%s dragging the %s strip sets the pane size`,
    async (resize, edge, [end_x, end_y], expected) => {
      const { pane } = await open_pane({ resize })
      mock_pane_rect(pane)

      drag(strip_of(pane, edge), [445, 295], [end_x, end_y])
      await tick()

      expect({ width: pane.style.width, height: pane.style.height }).toEqual(expected)
      expect(pane.style.maxWidth).toBe(edge === `right` ? `calc(100vw - 16px)` : `450px`)
    },
  )

  test(`a narrow viewport preserves width until a horizontal resize changes it`, async () => {
    mock_viewport(400, 500)
    const { pane } = await open_pane({ resize: `both` })
    mock_pane_rect(pane)

    strip_of(pane, `right`).dispatchEvent(pointer_event(`pointerdown`, 445, 150))
    await tick()
    expect(pane.style.maxWidth).toBe(`450px`)

    globalThis.dispatchEvent(pointer_event(`pointermove`, 600, 150))
    await tick()
    expect(pane.style.width).toBe(`450px`)

    globalThis.dispatchEvent(pointer_event(`pointermove`, 425, 150))
    await tick()
    expect(pane.style.width).toBe(`430px`)
    expect(pane.style.maxWidth).toBe(`max(calc(100vw - 16px), 430px)`)
    release_pointer()
  })

  test(`the default max width caps natural size but not a manual viewport-safe resize`, async () => {
    mock_viewport(700, 500)
    const { pane } = await open_pane({ resize: `both` })
    mock_pane_rect(pane, 100, 50)
    expect(pane.style.maxWidth).toBe(`450px`)

    drag(corner_of(pane), [550, 350], [900, 900])
    await tick()

    // Width is capped so 8px on the far edge stays visible: 700 - left 100 - margin 8 = 592.
    // Height takes the full drag: it is already bounded by the CSS `max-height`, and a second
    // JS cap there only fought the gesture (it could even shrink a pane being dragged larger).
    expect(pane.style.width).toBe(`592px`)
    expect(pane.style.height).toBe(`850px`)
    expect(pane.style.maxWidth).toBe(`calc(100vw - 16px)`)

    doc_query<HTMLButtonElement>(`.reset-button`).click()
    await tick()
    expect(pane.style.width).toBe(``)
    expect(pane.style.height).toBe(``)
    expect(pane.style.maxWidth).toBe(`450px`)
  })

  test(`an explicit max_width remains authoritative after resizing`, async () => {
    const { pane } = await open_pane({ resize: `width`, max_width: `600px` })
    mock_pane_rect(pane)
    const right_strip = strip_of(pane, `right`)

    drag(right_strip, [450, 150], [700, 150])
    await tick()

    expect(pane.style.width).toBe(`600px`)
    expect(pane.style.maxWidth).toBe(`600px`)
    expect(right_strip.getAttribute(`aria-valuenow`)).toBe(`600`)
  })

  // The visible grip is pointer-transparent decoration over the attachment's corner handle.
  test(`double-clicking the corner resets a manual resize`, async () => {
    const { pane } = await open_pane({ resize: `both` })
    mock_pane_rect(pane)

    drag(strip_of(pane, `right`), [445, 295], [545, 150])
    await tick()
    expect(pane.style.width).toBe(`550px`)
    expect(pane.style.maxWidth).toBe(`calc(100vw - 16px)`)

    corner_of(pane).dispatchEvent(pointer_event(`dblclick`, 445, 295))
    await tick()

    expect(pane.style.width).toBe(``)
    expect(pane.style.height).toBe(``)
    expect(pane.style.maxWidth).toBe(`450px`)
  })

  test(`a resize opts the pane out of repositioning and reveals the controls`, async () => {
    const { pane } = await open_pane({ resize: `both` })
    mock_pane_rect(pane)
    expect(document.querySelector(`.reset-button`)).toBeNull()

    strip_of(pane, `right`).dispatchEvent(pointer_event(`pointerdown`, 445, 150))
    await tick()

    expect(document.querySelector(`.reset-button`)).not.toBeNull()
    release_pointer()
  })

  // The pane dismisses on the click, which browsers (and Playwright) synthesize even after
  // a resize that ends outside it — click_outside exempts it because the pointerdown was
  // inside, so matterviz's 200 ms post-resize guard is unnecessary here.
  test(`a resize released outside the pane does not dismiss it`, async () => {
    const on_close = vi.fn()
    const { pane } = await open_pane({ resize: `both`, on_close })
    mock_pane_rect(pane)

    // press the grab strip, drag past the pane, release over the page
    drag(strip_of(pane, `right`), [445, 150], [900, 150])
    document.body.dispatchEvent(new MouseEvent(`click`, { bubbles: true, detail: 1 }))
    await tick()

    expect(pane.style.width).toBe(`905px`) // the resize really happened
    expect(is_open(pane)).toBe(true)
    expect(on_close).not.toHaveBeenCalled()
  })

  test(`a press on the toggle counts as inside, so its click still toggles`, async () => {
    const on_close = vi.fn()
    const { toggle, pane } = await open_pane({ on_close })

    press(toggle)
    press(doc_query(`[data-testid="content"]`))
    await tick()
    expect(is_open(pane)).toBe(true)
    expect(on_close).not.toHaveBeenCalled()

    toggle.click()
    await tick()
    expect(is_open(pane)).toBe(false)
    expect(on_close).toHaveBeenCalledWith({ via: `toggle` })
  })

  test(`a window resize repositions an unmoved pane but not a dragged one`, async () => {
    vi.useFakeTimers()
    mock_viewport()
    const { toggle, pane } = await setup({ position: `fixed` })
    mock_rect(toggle, { left: 600, top: 20, width: 20, height: 20 })
    mock_pane_rect(pane)

    toggle.click()
    await tick()
    expect(pane.style.left).toBe(`175px`)

    cleanups.push(stub_prop(globalThis, `innerWidth`, 600))
    globalThis.dispatchEvent(new Event(`resize`))
    vi.advanceTimersByTime(60)
    await tick()
    expect(pane.style.left).toBe(`142px`) // 600 - 450 - 8

    // draggable starts from the pane's mocked offsetLeft of 0, so a 20px drag lands
    // at 20px — and stays there, where repositioning would give 900 - 450 - 8 = 442
    drag_by(20, 0)
    cleanups.push(stub_prop(globalThis, `innerWidth`, 900))
    globalThis.dispatchEvent(new Event(`resize`))
    vi.advanceTimersByTime(60)
    await tick()
    expect(pane.style.left).toBe(`20px`)
  })

  test(`spreads consumer props without losing its own class, role or click`, async () => {
    const onclick = vi.fn()
    const pane_props = {
      class: `consumer-pane`,
      id: `my-pane`,
      'data-resize': `both`,
      'aria-label': `Structure controls`,
    }
    const toggle_props = { class: `consumer-toggle`, title: `Options`, onclick }
    // Omit'd from the prop types; set reflectively to prove the runtime ordering holds
    // for JS consumers too
    Reflect.set(pane_props, `role`, `region`)
    Reflect.set(pane_props, `aria-modal`, `true`)
    Reflect.set(toggle_props, `type`, `submit`)
    const { toggle, pane } = await setup({ pane_props, toggle_props })

    expect(pane.id).toBe(`my-pane`)
    // role, aria-modal, data-resize and type sit after the spread, so a consumer cannot
    // clobber them: a `region` pane loses its dialog semantics, an `aria-modal` one traps
    // screen readers inside non-modal chrome, a `submit` toggle posts the form
    expect([pane.getAttribute(`role`), pane.dataset.resize]).toEqual([`dialog`, `none`])
    expect(pane.getAttribute(`aria-modal`)).toBe(`false`)
    expect(toggle.getAttribute(`type`)).toBe(`button`)
    // the other side of the ordering: aria-label sits before the spread, so a page with
    // several panes can rename them apart rather than reading three "Draggable pane"s
    expect(pane.getAttribute(`aria-label`)).toBe(`Structure controls`)
    expect(pane.classList.contains(`draggable-pane`)).toBe(true)
    expect(pane.classList.contains(`consumer-pane`)).toBe(true)
    // Toc skips headings whose closest() match is excluded, so pane content (floating
    // chrome, not page structure) stays out of a page's contents
    expect(pane.classList.contains(`toc-exclude`)).toBe(true)
    expect(toggle.classList.contains(`pane-toggle`)).toBe(true)
    expect(toggle.classList.contains(`consumer-toggle`)).toBe(true)

    // the spread lands before our own onclick, so without chaining theirs is dropped
    toggle.click()
    await tick()
    expect(onclick).toHaveBeenCalledOnce()
    expect(pane.style.display).toBe(`grid`) // our own handler still opened it
  })

  // the demo page's Styling section is the only list of these, so a var added to the
  // component without a mention there is a knob nobody can find
  test(`every --pane-* custom property the styles read is documented`, () => {
    const declared = new Set(
      [...pane_source.matchAll(/var\(\s*(?<prop>--pane-[\w-]+)/gu)].map(
        (match) => match.groups?.prop ?? ``,
      ),
    )
    expect(declared.size).toBeGreaterThan(10)

    // --pane-toggle-* vars are covered by the wildcard the page names them under
    const undocumented = [...declared].filter(
      (prop) => !prop.startsWith(`--pane-toggle-`) && !demo_page.includes(prop),
    )
    expect(undocumented).toEqual([])
  })
})
