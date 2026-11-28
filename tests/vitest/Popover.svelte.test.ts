import { tick, type ComponentProps } from 'svelte'
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import type Popover from '#lib/Popover.svelte'
import {
  click,
  create_element,
  doc_query,
  mock_rect,
  render,
  pointer_event,
  press_escape,
} from './index'
import TestPopover from './TestPopover.svelte'

describe(`Popover`, () => {
  type PopoverProps = Omit<ComponentProps<typeof Popover>, `children`>
  // hover/focus open and close on timers
  beforeEach(() => void vi.useFakeTimers())
  // click_outside and focus_trap leave document listeners that outlive innerHTML = '',
  // so unmount for real between cases
  let unmount_popover: () => Promise<void>
  const mount_popover = (extra: Partial<PopoverProps> = {}) => {
    const props = $state({ ...extra })
    unmount_popover = render(TestPopover, props)
    return props
  }
  const trigger = () => doc_query<HTMLButtonElement>(`[data-testid="popover-trigger"]`)
  const item = () => doc_query<HTMLButtonElement>(`[data-testid="popover-item"]`)
  const surface = () => document.querySelector<HTMLElement>(`.popover`)
  // pointer_event sets isPrimary; a bare PointerEvent reads as a second finger
  const press = (target: EventTarget) =>
    target.dispatchEvent(pointer_event(`pointerdown`, 0, 0))
  const release = (target: EventTarget) => {
    press(target)
    target.dispatchEvent(new MouseEvent(`click`, { bubbles: true, detail: 1 }))
  }
  const escape_native_popover = () => {
    press_escape()
    doc_query(`.popover`).hidePopover()
  }
  const click_trigger = () => click(trigger())
  const mouse_enter = (target: EventTarget = trigger()) =>
    target.dispatchEvent(new MouseEvent(`mouseenter`))
  const mouse_leave = (target: EventTarget = trigger()) =>
    target.dispatchEvent(new MouseEvent(`mouseleave`, { relatedTarget: document.body }))
  const advance_time = async (milliseconds: number) => {
    await vi.advanceTimersByTimeAsync(milliseconds)
    await tick()
  }

  test.each([
    [`menu`, `menu`],
    [`alertdialog`, `dialog`],
  ] as const)(
    `trigger and %s surface share consumer ID, class and ARIA semantics`,
    async (role, has_popup) => {
      mount_popover({
        id: `consumer-id`,
        role,
        class: `consumer-class`,
        'aria-label': `Actions`,
      })
      expect(surface()).toBeNull()
      expect(trigger().getAttribute(`aria-expanded`)).toBe(`false`)
      expect(trigger().getAttribute(`aria-haspopup`)).toBe(has_popup)
      expect(trigger().getAttribute(`aria-controls`)).toBeNull()

      await click_trigger()

      const popup = doc_query(`.popover`)
      expect(trigger().getAttribute(`aria-expanded`)).toBe(`true`)
      expect(trigger().getAttribute(`aria-controls`)).toBe(`consumer-id`)
      expect(popup.id).toBe(`consumer-id`)
      expect(popup.getAttribute(`role`)).toBe(role)
      expect(popup.getAttribute(`popover`)).toBe(`auto`)
      expect(popup.getAttribute(`aria-label`)).toBe(`Actions`)
      expect(popup.classList.contains(`consumer-class`)).toBe(true)
      // focus_trap moved the keyboard into the surface
      expect(document.activeElement).toBe(item())
      await click_trigger()
      expect(trigger().getAttribute(`aria-controls`)).toBeNull()
    },
  )

  // the trigger wrapper is `display: contents` and measures 0x0, so anchoring to it
  // would pin every popover to the viewport corner
  test(`positions against the trigger, not the wrapper around it`, async () => {
    mount_popover({ offset: 8 })
    mock_rect(trigger(), { left: 100, top: 20, height: 30 }) // bottom: 50

    await click_trigger()

    expect(doc_query(`.popover`).style.top).toBe(`58px`) // 50 + 8
  })

  test(`trigger opens and native dismissals report their reason`, async () => {
    const [on_open, on_close] = [vi.fn(), vi.fn()]
    const added = vi.spyOn(document, `addEventListener`)
    mount_popover({ on_open, on_close })
    // closed popovers register no document-wide close trackers; those carry an abort
    // signal, unlike the delegated listeners Svelte adds for every component loaded so far
    const has_signal = (options: unknown) =>
      typeof options === `object` && options !== null && `signal` in options
    expect(added.mock.calls.filter(([, , options]) => has_signal(options))).toEqual([])
    await click_trigger()
    escape_native_popover()
    await tick()
    expect(on_close).toHaveBeenLastCalledWith({ via: `escape` })

    await click_trigger()
    release(document.body)
    doc_query(`.popover`).hidePopover()
    await tick()

    expect(surface()).toBeNull()
    expect(on_close).toHaveBeenLastCalledWith({ via: `pointer` })
    expect(on_open.mock.calls).toEqual([[{ via: `trigger` }], [{ via: `trigger` }]])
    // the trap handed the keyboard back to where it came from
    expect(document.activeElement).toBe(trigger())

    await click_trigger()
    await click_trigger()
    expect(on_close).toHaveBeenLastCalledWith({ via: `trigger` })
    expect([on_open.mock.calls.length, on_close.mock.calls.length]).toEqual([3, 3])
  })

  test.each([false, true])(
    `mounting with open=%s reports nothing; the bound prop reports programmatic`,
    async (initially_open) => {
      const [on_open, on_close] = [vi.fn(), vi.fn()]
      const props = mount_popover({ open: initially_open, on_open, on_close })
      await tick()
      expect([on_open.mock.calls, on_close.mock.calls]).toEqual([[], []])

      props.open = !initially_open
      await tick()
      props.open = initially_open
      await tick()
      expect(Boolean(surface())).toBe(initially_open)
      const programmatic = [[{ via: `programmatic` }]]
      expect([on_open.mock.calls, on_close.mock.calls]).toEqual([
        programmatic,
        programmatic,
      ])
    },
  )

  // each callback flips the state back once; the flip is a new change, reported in turn
  test.each([
    [`on_open closing`, true],
    [`on_close reopening`, false],
  ] as const)(`%s the popover reports the flip back`, async (_label, flip_on_open) => {
    let flipped = false
    const flip_back = (open: boolean) => () => {
      if (flipped) return
      flipped = true
      props.open = open
    }
    const on_open = vi.fn(flip_on_open ? flip_back(false) : undefined)
    const on_close = vi.fn(flip_on_open ? undefined : flip_back(true))
    const props = mount_popover({ open: !flip_on_open, on_open, on_close })

    await click_trigger()
    await tick()
    expect([props.open, Boolean(surface())]).toEqual([!flip_on_open, !flip_on_open])
    const [first, second] = flip_on_open ? [on_open, on_close] : [on_close, on_open]
    expect([first.mock.calls, second.mock.calls]).toEqual([
      [[{ via: `trigger` }]],
      [[{ via: `programmatic` }]],
    ])
  })

  test(`dismiss_on: 'press' uses a manual popover and closes on pointerdown`, async () => {
    mount_popover({ dismiss_on: `press` })
    await click_trigger()
    expect(doc_query(`.popover`).getAttribute(`popover`)).toBe(`manual`)

    press(document.body)
    await tick()
    expect(surface()).toBeNull()
  })

  test(`escape: false and trap_focus: false leave Escape and focus to the consumer`, async () => {
    mount_popover({ escape: false, trap_focus: false })
    trigger().focus()
    await click_trigger()
    expect(document.activeElement).toBe(trigger())

    press_escape()
    await tick()
    expect(surface()).not.toBeNull()
  })

  test(`hover honors delays and stays open across the trigger-surface gap`, async () => {
    const [on_open, on_close] = [vi.fn(), vi.fn()]
    mount_popover({ trigger_mode: `hover`, open_delay_ms: 40, on_open, on_close })

    mouse_enter()
    await advance_time(39)
    expect(surface()).toBeNull()

    await advance_time(1)
    const dialog = doc_query(`[role="dialog"]`)

    // An 8px CSS gap reports body, not the surface, as relatedTarget while crossed.
    mouse_leave()
    await vi.advanceTimersByTimeAsync(100)
    mouse_enter(dialog)
    await advance_time(150)
    expect(surface()).toBe(dialog)

    mouse_leave(dialog)
    await advance_time(149)
    expect(surface()).toBe(dialog)
    await advance_time(1)
    expect(surface()).toBeNull()
    expect([on_open.mock.calls, on_close.mock.calls]).toEqual([
      [[{ via: `trigger` }]],
      [[{ via: `trigger` }]],
    ])
  })

  test.each([`hover`, `focus`] as const)(
    `%s keeps focus transitions between trigger and surface open`,
    async (trigger_mode) => {
      mount_popover({ trigger_mode, close_delay_ms: 25 })
      const outside = create_element(`button`)

      trigger().focus()
      await advance_time(0)
      // Non-click opening must not steal focus before the user moves it.
      expect(document.activeElement).toBe(trigger())

      item().focus()
      await advance_time(25)
      expect(surface()).not.toBeNull()

      outside.focus()
      await advance_time(24)
      expect(surface()).not.toBeNull()
      await advance_time(1)
      expect(surface()).toBeNull()
      expect(document.activeElement).toBe(outside)
    },
  )

  test(`hover stays open while either pointer or focus remains inside`, async () => {
    mount_popover({ trigger_mode: `hover`, close_delay_ms: 20 })
    const outside = create_element(`button`)

    trigger().focus()
    await advance_time(0)
    mouse_enter()
    outside.focus()
    await advance_time(20)
    expect(surface()).not.toBeNull()

    mouse_leave()
    await advance_time(20)
    expect(surface()).toBeNull()

    mouse_enter()
    await advance_time(0)
    trigger().focus()
    mouse_leave()
    await advance_time(20)
    expect(surface()).not.toBeNull()

    outside.focus()
    await advance_time(20)
    expect(surface()).toBeNull()
  })

  test(`Escape from a focus popover closes without immediately reopening`, async () => {
    const props = mount_popover({ trigger_mode: `focus` })
    const outside = create_element(`button`)

    trigger().focus()
    await advance_time(0)
    item().focus()

    props.trap_focus = false
    escape_native_popover()
    await advance_time(0)
    expect(surface()).toBeNull()
    expect(document.activeElement).toBe(trigger())

    outside.focus()
    trigger().focus()
    await advance_time(0)
    expect(surface()).not.toBeNull()
  })

  test(`focus can reopen after Escape without focus restoration`, async () => {
    const props = mount_popover({ open: true, trigger_mode: `focus`, trap_focus: false })
    await tick()
    item().focus()

    props.trap_focus = true
    escape_native_popover()
    await advance_time(0)
    expect(surface()).toBeNull()

    trigger().focus()
    await advance_time(0)
    expect(surface()).not.toBeNull()
  })

  // removing a focused surface delivers no focusout, so focus_trap's handback to the
  // trigger reopens what was dismissed unless close drops the stale focus state
  test(`hover dismissal with focus inside stays closed`, async () => {
    const props = mount_popover({ trigger_mode: `hover`, close_delay_ms: 10 })
    trigger().focus()
    await advance_time(0)
    item().focus()
    await advance_time(0)
    expect(surface()).not.toBeNull()

    props.open = false
    await advance_time(100)
    expect(surface()).toBeNull()
  })

  // same stale state from the other side: with nothing to restore focus to, a later hover
  // cycle must still close on mouseleave rather than wait on a focus that left
  test(`hover-out still closes after a dismissal that stranded focus`, async () => {
    const props = mount_popover({
      trigger_mode: `hover`,
      open_delay_ms: 0,
      close_delay_ms: 10,
      trap_focus: false,
    })
    mouse_enter()
    await advance_time(0)
    item().focus()
    await advance_time(0)
    props.open = false
    await advance_time(100)

    mouse_enter()
    await advance_time(0)
    expect(surface()).not.toBeNull()
    mouse_leave()
    await advance_time(100)
    expect(surface()).toBeNull()
  })

  test(`controlled state scopes focus restoration to each open cycle`, async () => {
    const opener = create_element(`button`)
    opener.focus()
    const props = mount_popover({ open: true, placement: `right` })
    const close_and_expect_focus = async (expected: HTMLElement) => {
      props.open = false
      await tick()
      expect(surface()).toBeNull()
      expect(document.activeElement).toBe(expected)
    }
    await tick()

    const dialog = doc_query(`[role="dialog"]`)
    expect(dialog.dataset.placement).toBe(`right`)
    expect(trigger().getAttribute(`aria-expanded`)).toBe(`true`)
    expect(document.activeElement).toBe(item())

    await close_and_expect_focus(opener)
    expect(trigger().getAttribute(`aria-expanded`)).toBe(`false`)

    await click_trigger()
    await close_and_expect_focus(trigger())

    const next_opener = create_element(`button`)
    next_opener.focus()
    props.open = true
    await tick()
    await close_and_expect_focus(next_opener)
  })

  // a torn-down component renders no surface either way, so only the timer id tells a
  // canceled timer from one that still fires
  test(`unmount cancels a pending delayed open`, async () => {
    mount_popover({ trigger_mode: `hover`, open_delay_ms: 50 })
    await tick()
    const set_timeout = vi.spyOn(globalThis, `setTimeout`)
    const clear_timeout = vi.spyOn(globalThis, `clearTimeout`)
    mouse_enter()
    const pending_timer = set_timeout.mock.results.at(-1)?.value as unknown
    expect(pending_timer).toBeDefined()

    await unmount_popover()
    expect(clear_timeout).toHaveBeenCalledWith(pending_timer)
  })

  test(`changing trigger mode invalidates a pending delayed open`, async () => {
    const props = mount_popover({ trigger_mode: `hover`, open_delay_ms: 50 })
    mouse_enter()

    props.trigger_mode = `click`
    await tick()
    trigger().click()
    props.open = false
    props.trigger_mode = `hover`
    await advance_time(50)
    expect(surface()).toBeNull()
  })
})
