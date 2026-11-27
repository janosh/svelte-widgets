import FullscreenButton from '#lib/FullscreenButton.svelte'
import { sync_fullscreen } from '#lib/browser/index.ts'
import * as icons from '#lib/icons.ts'
import type { ComponentProps } from 'svelte'
import { createRawSnippet, tick } from 'svelte'
import { fromStore, get, writable } from 'svelte/store'
import {
  assert,
  beforeEach,
  describe,
  expect,
  onTestFinished,
  test,
  vi,
} from 'vite-plus/test'
import { click, create_element, press_key, render } from './index'

// happy-dom implements no part of the Fullscreen API, so requestFullscreen,
// exitFullscreen and the fullscreenElement getter are stubbed. The stubs keep one
// document-wide element like a browser does, so the per-wrapper keying lives in the source.
let fullscreen_element: Element | null = null
let request_calls: Element[] = []

// browsers fire fullscreenchange once the request settles, so dispatch off a microtask
const set_fullscreen_element = (element: Element | null): Promise<void> => {
  fullscreen_element = element
  return Promise.resolve().then(() => {
    document.dispatchEvent(new Event(`fullscreenchange`))
  })
}

// effects and the stubbed fullscreenchange dispatch both land on the microtask queue
const settle = async (): Promise<void> => {
  await tick()
  await tick()
}

beforeEach(() => {
  fullscreen_element = null
  request_calls = []
  document.body.style.backgroundColor = ``
  document.documentElement.style.backgroundColor = ``
  Object.defineProperty(document, `fullscreenElement`, {
    configurable: true,
    get: () => fullscreen_element,
  })
  Element.prototype.requestFullscreen = vi.fn(function (this: Element) {
    request_calls.push(this)
    return set_fullscreen_element(this)
  })
  document.exitFullscreen = vi.fn(() => set_fullscreen_element(null))
  onTestFinished(() => {
    Reflect.deleteProperty(document, `fullscreenElement`)
    Reflect.deleteProperty(Element.prototype, `requestFullscreen`)
    Reflect.deleteProperty(document, `exitFullscreen`)
  })
})

type ButtonProps = Partial<ComponentProps<typeof FullscreenButton>>

// this file isn't compiled by the Svelte plugin so $state is unavailable - a
// getter/setter pair backed by fromStore mimics a parent's bind:fullscreen
const mount_button = (props: ButtonProps = {}) => {
  const wrapper = create_element()
  const flag = writable(false)
  const flag_proxy = fromStore(flag)
  const unmount_button = render(
    FullscreenButton,
    {
      wrapper,
      get fullscreen() {
        return flag_proxy.current
      },
      set fullscreen(next_fullscreen: boolean) {
        flag.set(next_fullscreen)
      },
      ...props,
    },
    wrapper,
  )
  const button = wrapper.querySelector(`button`)
  assert(button !== null, `FullscreenButton rendered no button`)
  return { wrapper, flag, button, unmount_button }
}

const outsider_goes_fullscreen = async (): Promise<void> => {
  await set_fullscreen_element(create_element())
  await settle()
}

const icon_path = (button: HTMLElement): string | null =>
  button.querySelector(`svg path`)?.getAttribute(`d`) ?? null

// The default glyphs' extents in their path units: mdi:fullscreen spans 5..19, the exit glyph 4..20.
// Both default icons are cropped so their glyph fills the same share of the box, centered.
test(`default enter and exit glyphs fill the same centered share of the icon box`, async () => {
  const { button, flag } = mount_button()
  const view_box = () =>
    (button.querySelector(`svg`)?.getAttribute(`viewBox`) ?? ``).split(` `).map(Number)
  const share = ([min_x, min_y, width, height]: number[], [lo, hi]: [number, number]) => {
    expect([min_x + width / 2, min_y + height / 2, width]).toEqual([12, 12, height])
    return (hi - lo) / width
  }
  const enter_share = share(view_box(), [5, 19])
  flag.set(true)
  await settle()
  expect(icon_path(button)).toBe(icons.ExitFullscreen.d)
  expect(share(view_box(), [4, 20])).toBeCloseTo(enter_share, 5)
  expect(enter_share).toBeCloseTo(0.768, 3)
})

describe(`hotkey`, () => {
  const hover = (node: Element) => node.dispatchEvent(new PointerEvent(`pointerenter`))

  // claimed only while the pointer is over the wrapper or focus is inside it; chords stay the
  // browser's (Cmd/Ctrl+F is find-in-page)
  test.each([
    [`plain f toggles`, `F`, { key: `f` }, true, `hover`],
    [`Caps Lock F toggles`, `F`, { key: `F` }, true, `hover`],
    [`f with focus inside the wrapper toggles`, `F`, { key: `f` }, true, `focus`],
    [`a non-letter hotkey matches event.key`, `F11`, { key: `F11` }, true, `hover`],
    [`Cmd+F stays find-in-page`, `F`, { key: `f`, metaKey: true }, false, `hover`],
    [`Ctrl+F stays find-in-page`, `F`, { key: `f`, ctrlKey: true }, false, `hover`],
    [`Shift+F is another shortcut`, `F`, { key: `F`, shiftKey: true }, false, `hover`],
    [`an autorepeat does not re-toggle`, `F`, { key: `f`, repeat: true }, false, `hover`],
    [`other keys are ignored`, `F`, { key: `g` }, false, `hover`],
    [`f outside the wrapper is ignored`, `F`, { key: `f` }, false, `none`],
  ] as const)(`%s`, async (_name, hotkey, { key, ...init }, toggles, via) => {
    const { wrapper, flag, button } = mount_button({ hotkey })
    expect([button.title, button.getAttribute(`aria-keyshortcuts`)]).toEqual([
      `Enter fullscreen (${hotkey})`,
      hotkey,
    ])
    if (via === `hover`) hover(wrapper)
    press_key(via === `focus` ? button : globalThis, key, init)
    await settle()
    expect(get(flag)).toBe(toggles)
    // the button flashes as the key's feedback
    expect(button.style.boxShadow.includes(`1px`)).toBe(toggles)
    if (toggles) expect(button.title).toBe(`Exit fullscreen (${hotkey})`)
  })

  // a key nothing would handle is not advertised
  test.each([
    [`no hotkey`, {}],
    [`a hotkey without a wrapper`, { hotkey: `F`, wrapper: undefined }],
  ])(`%s: plain title, no aria-keyshortcuts, no key`, async (_name, props) => {
    const { wrapper, flag, button } = mount_button(props)
    expect([button.title, button.hasAttribute(`aria-keyshortcuts`)]).toEqual([
      `Enter fullscreen`,
      false,
    ])
    hover(wrapper)
    press_key(globalThis, `f`)
    await settle()
    expect(get(flag)).toBe(false)
  })

  test.each([`Shift+F`, `F F11`, `Control+F`])(
    `hotkey %j (not one plain key) throws`,
    (hotkey) => {
      expect(() => mount_button({ hotkey })).toThrow(`must be one plain key`)
    },
  )

  test(`a hidden button takes no key and marks no wrapper; the marker goes on unmount`, async () => {
    const hidden = mount_button({ hotkey: `F`, hidden: true })
    expect(hidden.wrapper.hasAttribute(`data-fullscreen-hotkey`)).toBe(false)
    hover(hidden.wrapper)
    press_key(globalThis, `f`)
    await settle()
    expect(get(hidden.flag)).toBe(false)
    const shown = mount_button({ hotkey: `F` })
    expect(shown.wrapper.getAttribute(`data-fullscreen-hotkey`)).toBe(`f`)
    await shown.unmount_button()
    expect(shown.wrapper.hasAttribute(`data-fullscreen-hotkey`)).toBe(false)
  })

  // both wrappers are hovered at once, and the inner one (mounted first, as a child's effects
  // run first) would take the key before the outer one sees it. It defers only to a live
  // outer button with the same key.
  test.each([
    [`same key`, { hotkey: `F` }, [false, true]],
    [`outer has another key`, { hotkey: `G` }, [true, false]],
    [`outer button hidden`, { hotkey: `F`, hidden: true }, [true, false]],
  ] as const)(`nested wrapper, %s`, async (_name, outer_props, expected) => {
    const outer = create_element()
    const inner = create_element()
    outer.append(inner)
    const flags = (
      [
        [inner, { hotkey: `F` }],
        [outer, outer_props],
      ] as const
    ).map(([wrapper, props]) => {
      const flag = writable(false)
      const flag_proxy = fromStore(flag)
      const unmount_button = render(
        FullscreenButton,
        {
          wrapper,
          ...props,
          get fullscreen() {
            return flag_proxy.current
          },
          set fullscreen(next_fullscreen: boolean) {
            flag.set(next_fullscreen)
          },
        },
        wrapper,
      )
      onTestFinished(unmount_button)
      hover(wrapper)
      return flag
    })
    press_key(globalThis, `f`)
    await settle()
    expect(flags.map((flag) => get(flag))).toEqual(expected)
  })
})

describe(`per-wrapper isolation`, () => {
  test(`an unrelated element going fullscreen flips no flag`, async () => {
    const [first, second] = [mount_button(), mount_button()]
    await outsider_goes_fullscreen()
    expect(get(first.flag)).toBe(false)
    expect(get(second.flag)).toBe(false)
    expect(request_calls).toEqual([])
  })

  test(`exiting one wrapper does not clear a second wrapper that took over`, async () => {
    const [first_change, second_change] = [vi.fn(), vi.fn()]
    const first = mount_button({ on_change: first_change })
    const second = mount_button({ on_change: second_change })

    first.button.click()
    await settle()
    expect(document.fullscreenElement).toBe(first.wrapper)
    expect(get(first.flag)).toBe(true)
    expect(get(second.flag)).toBe(false)
    expect(request_calls).toEqual([first.wrapper])

    second.button.click()
    await settle()

    expect(document.fullscreenElement).toBe(second.wrapper)
    expect(get(first.flag)).toBe(false)
    expect(get(second.flag)).toBe(true)
    // the handoff is a transition of both wrappers
    expect(first_change.mock.calls).toEqual([[true], [false]])
    expect(second_change.mock.calls).toEqual([[true]])
  })
})

describe(`flag <-> browser sync`, () => {
  test(`clicks and outside flag writes drive the browser; clicks call onclick`, async () => {
    const onclick = vi.fn()
    const { button, flag, wrapper } = mount_button({ onclick })

    button.click()
    await settle()
    expect(onclick).toHaveBeenCalledOnce()
    expect(get(flag)).toBe(true)
    expect(document.fullscreenElement).toBe(wrapper)
    expect(button.getAttribute(`aria-pressed`)).toBe(`true`)
    expect(button.getAttribute(`aria-label`)).toBe(`Exit fullscreen`)
    expect(icon_path(button)).toBe(icons.ExitFullscreen.d)

    button.click()
    await settle()
    expect(onclick).toHaveBeenCalledTimes(2)
    expect(get(flag)).toBe(false)
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1)
    expect(document.fullscreenElement).toBeNull()
    expect(icon_path(button)).toBe(icons.Fullscreen.d)

    flag.set(true)
    await settle()
    expect(document.fullscreenElement).toBe(wrapper)
    flag.set(false)
    await settle()
    expect(document.fullscreenElement).toBeNull()
    expect(onclick).toHaveBeenCalledTimes(2)
  })

  test(`canceling a pending entry does not re-enter when the request settles`, async () => {
    const entry_request = Promise.withResolvers<undefined>()
    const exit_request = Promise.withResolvers<undefined>()
    const set_fullscreen_without_event = (element: Element) =>
      void (fullscreen_element = element)
    Element.prototype.requestFullscreen = vi.fn(function (this: Element) {
      request_calls.push(this)
      return entry_request.promise.then(() => set_fullscreen_without_event(this))
    })
    document.exitFullscreen = vi.fn(() =>
      exit_request.promise.then(() => set_fullscreen_element(null)),
    )
    const { button, flag } = mount_button()

    await click(button)
    await click(button)

    entry_request.resolve(undefined)
    await settle()
    expect(document.exitFullscreen).not.toHaveBeenCalled()
    document.dispatchEvent(new Event(`fullscreenchange`))
    await tick()
    exit_request.resolve(undefined)
    await settle()

    expect(document.fullscreenElement).toBeNull()
    expect(get(flag)).toBe(false)
  })

  test(`re-entering during a pending exit survives when the exit settles`, async () => {
    const { button, flag, wrapper } = mount_button()
    button.click()
    await settle()
    const request = Promise.withResolvers<undefined>()
    document.exitFullscreen = vi.fn(() =>
      request.promise.then(() => set_fullscreen_element(null)),
    )

    await click(button)
    await click(button)

    request.resolve(undefined)
    await settle()
    await settle()

    expect(document.fullscreenElement).toBe(wrapper)
    expect(get(flag)).toBe(true)
    expect(request_calls).toEqual([wrapper, wrapper])
  })

  test(`on_change reports each real transition once, whoever initiated it`, async () => {
    const on_change = vi.fn()
    const { button, flag, wrapper } = mount_button({ on_change })

    button.click()
    await settle()
    expect(on_change.mock.calls).toEqual([[true]]) // a granted click

    // a repeat event reading the same state is no transition
    document.dispatchEvent(new Event(`fullscreenchange`))
    await settle()
    expect(on_change).toHaveBeenCalledOnce()

    await set_fullscreen_element(null) // Esc
    await settle()
    expect(get(flag)).toBe(false)
    expect(button.getAttribute(`aria-pressed`)).toBe(`false`)
    expect(on_change.mock.calls).toEqual([[true], [false]])
    // the settled entry no longer counts as pending, so the same request goes out again
    await click(button)
    await settle()
    expect(document.fullscreenElement).toBe(wrapper)

    flag.set(false) // an outside flag write
    await settle()
    await outsider_goes_fullscreen() // never this wrapper's transition
    expect(on_change.mock.calls).toEqual([[true], [false], [true], [false]])
  })

  // an exit before the browser reports the entry (Esc within a frame): every change event
  // then reads "out", which used to strand the entry as pending and skip the next click
  test(`an entry overtaken by an exit before its event leaves the button working`, async () => {
    const on_change = vi.fn()
    const { button, flag, wrapper } = mount_button({ on_change })
    const enter_without_event = (element: Element) => void (fullscreen_element = element)
    Element.prototype.requestFullscreen = vi.fn(function (this: Element) {
      request_calls.push(this)
      enter_without_event(this) // entered, but the fullscreenchange is still to come
      return Promise.resolve()
    })
    await click(button)
    await settle()
    fullscreen_element = null // exited before either event was delivered
    document.dispatchEvent(new Event(`fullscreenchange`)) // the entry's, now reading "out"
    document.dispatchEvent(new Event(`fullscreenchange`)) // the exit's
    await settle()
    expect(get(flag)).toBe(false)
    expect(on_change).not.toHaveBeenCalled() // no event ever saw the wrapper fullscreen

    await click(button)
    await settle()
    expect(request_calls).toEqual([wrapper, wrapper])
    expect(get(flag)).toBe(true)
  })

  test.each([false, true])(
    `a rejected request (exit=%s) is reported as an error, not a transition`,
    async (exiting) => {
      const console_error = vi.spyOn(console, `error`).mockImplementation(() => {})
      const on_request_error = vi.fn()
      const on_change = vi.fn()
      const { button, flag, wrapper } = mount_button({ on_request_error, on_change })
      if (exiting) await click(button)
      await settle()
      on_change.mockClear()
      const error = new Error(`fullscreen denied`)
      const request = vi.fn(() => Promise.reject(error))
      if (exiting) document.exitFullscreen = request
      else Element.prototype.requestFullscreen = request

      await click(button)
      await settle()
      expect(on_request_error).toHaveBeenCalledExactlyOnceWith(error)
      expect(console_error).toHaveBeenCalledOnce()
      expect(document.fullscreenElement).toBe(exiting ? wrapper : null)
      // the flag must match the browser, else aria-pressed lies and the retry is a no-op
      expect(get(flag)).toBe(exiting)
      expect(button.getAttribute(`aria-pressed`)).toBe(String(exiting))
      expect(on_change).not.toHaveBeenCalled()

      await click(button)
      await settle()
      expect(request).toHaveBeenCalledTimes(2)
    },
  )

  test(`a stale exit rejection does not re-enter after an external exit`, async () => {
    vi.spyOn(console, `error`).mockImplementation(() => {})
    const { button, flag, wrapper } = mount_button()

    button.click()
    await settle()
    const exit_request = Promise.withResolvers<undefined>()
    document.exitFullscreen = vi.fn(() => exit_request.promise.then(() => undefined))

    await click(button)
    expect(document.exitFullscreen).toHaveBeenCalledOnce()

    await set_fullscreen_element(null)
    exit_request.reject(new Error(`stale exit rejection`))
    await settle()

    expect(document.fullscreenElement).toBeNull()
    expect(get(flag)).toBe(false)
    expect(request_calls).toEqual([wrapper])
  })

  test(`unmounting stops tracking fullscreenchange`, async () => {
    const on_change = vi.fn()
    const { unmount_button, flag, wrapper } = mount_button({ on_change })

    await unmount_button()
    await set_fullscreen_element(wrapper)
    await settle()

    expect(get(flag)).toBe(false)
    expect(on_change).not.toHaveBeenCalled()
  })

  test(`a flag bound true at mount enters and reports that entry`, async () => {
    const on_change = vi.fn()
    const { wrapper } = mount_button({ fullscreen: true, on_change })
    await settle()
    expect(document.fullscreenElement).toBe(wrapper)
    // read before the mount's own request lands, so its entry counts as a transition
    expect(on_change.mock.calls).toEqual([[true]])
  })

  // the swap tears down the old wrapper's listener, which used to also drop the new
  // wrapper's just-filed request, so its rejection never reverted the flag
  test.each([false, true])(
    `swapping the wrapper mid-fullscreen hands fullscreen over (rejected=%s)`,
    async (rejected) => {
      vi.spyOn(console, `error`).mockImplementation(() => {})
      const [first, second] = [create_element(), create_element()]
      const target = writable(first)
      const target_proxy = fromStore(target)
      const on_change = vi.fn()
      const on_request_error = vi.fn()
      const flag = writable(false)
      const flag_proxy = fromStore(flag)
      // a spread would snapshot the getters, so render directly to keep the wrapper live
      render(FullscreenButton, {
        get wrapper() {
          return target_proxy.current
        },
        get fullscreen() {
          return flag_proxy.current
        },
        set fullscreen(next_fullscreen: boolean) {
          flag.set(next_fullscreen)
        },
        on_change,
        on_request_error,
      })
      flag.set(true)
      await settle()
      expect(document.fullscreenElement).toBe(first)
      const error = new Error(`fullscreen denied`)
      if (rejected) second.requestFullscreen = vi.fn(() => Promise.reject(error))

      target.set(second)
      await settle()
      expect(get(flag)).toBe(!rejected)
      expect(on_request_error.mock.calls).toEqual(rejected ? [[error]] : [])
      // fullscreen never left the component, so the handover is no second entry
      expect(on_change.mock.calls).toEqual([[true]])
      if (!rejected) expect(document.fullscreenElement).toBe(second)
    },
  )

  // a wrapper already fullscreen when adopted (entered outside the flag) reports its exit
  test(`adopting an already-fullscreen wrapper reports its later exit`, async () => {
    const [first, second] = [create_element(), create_element()]
    const target = writable(first)
    const target_proxy = fromStore(target)
    const flag = writable(false)
    const flag_proxy = fromStore(flag)
    const on_change = vi.fn()
    render(FullscreenButton, {
      get wrapper() {
        return target_proxy.current
      },
      get fullscreen() {
        return flag_proxy.current
      },
      set fullscreen(next_fullscreen: boolean) {
        flag.set(next_fullscreen)
      },
      on_change,
    })
    await settle()
    await set_fullscreen_element(second)
    target.set(second)
    flag.set(true)
    await settle()
    expect([request_calls, on_change.mock.calls]).toEqual([[], []])
    await set_fullscreen_element(null)
    await settle()
    expect([get(flag), on_change.mock.calls]).toEqual([false, [[false]]])
  })

  test(`without a wrapper the button only toggles its flag`, async () => {
    const on_change = vi.fn()
    const { button, flag } = mount_button({ wrapper: undefined, on_change })

    button.click()
    await settle()
    expect(get(flag)).toBe(true)
    expect(request_calls).toEqual([])
    expect(on_change).not.toHaveBeenCalled() // no wrapper, so no transition to report

    // an unowned fullscreen session must not overwrite a flag without an explicit sync request
    await outsider_goes_fullscreen()
    expect(get(flag)).toBe(true)
  })

  test(`sync_fullscreen throws outside an effect context`, () => {
    expect(() =>
      sync_fullscreen({
        get_wrapper: () => undefined,
        get_fullscreen: () => false,
        set_fullscreen: () => {},
      }),
    ).toThrow(/effect/u)
  })
})

describe(`fullscreen background`, () => {
  test.each([
    [`default var`, undefined, `--fullscreen-bg`],
    [`custom var`, `--struct-bg-fullscreen`, `--struct-bg-fullscreen`],
  ])(
    `paints the page background onto the wrapper (%s)`,
    async (_name, bg_css_var, css_var) => {
      document.body.style.backgroundColor = `rgb(7, 8, 9)`
      const { button, wrapper } = mount_button(bg_css_var ? { bg_css_var } : {})

      expect(wrapper.style.getPropertyValue(css_var)).toBe(``)
      button.click()
      await settle()

      expect(wrapper.style.getPropertyValue(css_var)).toBe(`rgb(7, 8, 9)`)

      // dropped on the way out, else it keeps a pre-switch color across a theme change
      button.click()
      await settle()

      expect(wrapper.style.getPropertyValue(css_var)).toBe(``)
    },
  )
})

test(`renaming bg_css_var or unmounting mid-fullscreen leaves no stale var`, async () => {
  document.body.style.backgroundColor = `rgb(7, 8, 9)`
  const css_var = writable(`--old-bg`)
  const css_var_proxy = fromStore(css_var)
  const wrapper = create_element()
  // a spread would snapshot the getter, so render directly to keep bg_css_var live
  const unmount_button = render(
    FullscreenButton,
    {
      wrapper,
      fullscreen: true,
      get bg_css_var() {
        return css_var_proxy.current
      },
    },
    wrapper,
  )
  await settle()
  expect(wrapper.style.getPropertyValue(`--old-bg`)).toBe(`rgb(7, 8, 9)`)

  css_var.set(`--new-bg`)
  await settle()
  expect(wrapper.style.getPropertyValue(`--old-bg`)).toBe(``)
  expect(wrapper.style.getPropertyValue(`--new-bg`)).toBe(`rgb(7, 8, 9)`)

  await unmount_button()
  expect(wrapper.style.getPropertyValue(`--new-bg`)).toBe(``)
})

describe(`button rendering`, () => {
  test.each([
    icons.Check,
    { viewBox: icons.Check.viewBox, markup: `<path d="${icons.Check.d}"/>` },
  ])(
    `custom icons, labels, class and placement merge with the defaults`,
    (enter_icon) => {
      const { button } = mount_button({
        // only the `enter` half of each record: `exit` must fall back to the default
        icons: { enter: enter_icon },
        labels: { enter: `Grow` },
        class: `my-btn`,
        placement: `corner`,
        'aria-pressed': true, // spread before the real one, so it loses
      })

      expect([...button.classList]).toEqual(
        expect.arrayContaining([`fullscreen-btn`, `my-btn`, `corner`]),
      )
      expect(button.title).toBe(`Grow`)
      expect(button.getAttribute(`aria-label`)).toBe(`Grow`)
      expect(button.getAttribute(`aria-pressed`)).toBe(`false`) // not the consumer's true
      expect(icon_path(button)).toBe(icons.Check.d)

      // the omitted `exit` half of both records keeps its default
      const exiting = mount_button({
        icons: { enter: enter_icon },
        labels: { enter: `Grow` },
        wrapper: undefined,
        fullscreen: true,
      })
      expect(exiting.button.title).toBe(`Exit fullscreen`)
      expect(icon_path(exiting.button)).toBe(icons.ExitFullscreen.d)
      expect(exiting.button.classList.contains(`corner`)).toBe(false) // placement is opt-in

      // an explicitly undefined key must fall back too - a plain spread would render nothing
      const undefined_key = mount_button({
        labels: { enter: undefined },
        wrapper: undefined,
      })
      expect(undefined_key.button.title).toBe(`Enter fullscreen`)
    },
  )

  // a raw snippet's render() runs once, so each flag value gets its own mount; the
  // reactive path is covered by the icon swap in `click enters, click again exits`
  test.each([
    [false, `off`],
    [true, `on`],
  ])(
    `a children snippet replaces the icon and receives fullscreen=%s`,
    (fullscreen, expected) => {
      const children = createRawSnippet<[{ fullscreen: boolean }]>((get_props) => ({
        render: () => `<span>${get_props().fullscreen ? `on` : `off`}</span>`,
      }))
      const { button } = mount_button({ children, wrapper: undefined, fullscreen })

      expect(button.querySelector(`svg`)).toBeNull()
      expect(button.textContent?.trim()).toBe(expected)
    },
  )
})
