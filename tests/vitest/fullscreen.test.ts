import FullscreenButton from '$lib/FullscreenButton.svelte'
import { get_page_background, sync_fullscreen } from '$lib/fullscreen.svelte'
import * as icons from '$lib/icons'
import type { ComponentProps } from 'svelte'
import { createRawSnippet, mount, tick, unmount } from 'svelte'
import { fromStore, get, writable } from 'svelte/store'
import { afterEach, assert, beforeEach, describe, expect, test, vi } from 'vitest'

// happy-dom implements no part of the Fullscreen API, so requestFullscreen,
// exitFullscreen and the fullscreenElement getter are stubbed. The stubs keep one
// document-wide element like a browser does, so the per-wrapper keying lives in the source.
let fullscreen_element: Element | null = null
let request_calls: Element[] = []
const mounted: Record<string, unknown>[] = []

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
})

afterEach(() => {
  // clearing document.body does not undo a button's fullscreenchange subscription
  for (const component of mounted.splice(0)) void unmount(component)
  Reflect.deleteProperty(document, `fullscreenElement`)
  Reflect.deleteProperty(Element.prototype, `requestFullscreen`)
  Reflect.deleteProperty(document, `exitFullscreen`)
})

type ButtonProps = Partial<ComponentProps<typeof FullscreenButton>>

// this file isn't compiled by the Svelte plugin so $state is unavailable - a
// getter/setter pair backed by fromStore mimics a parent's bind:fullscreen
const mount_button = (props: ButtonProps = {}) => {
  const wrapper = document.createElement(`div`)
  document.body.append(wrapper)
  const flag = writable(false)
  const flag_proxy = fromStore(flag)
  const component = mount(FullscreenButton, {
    target: wrapper,
    props: {
      wrapper,
      get fullscreen() {
        return flag_proxy.current
      },
      set fullscreen(next_fullscreen: boolean) {
        flag.set(next_fullscreen)
      },
      ...props,
    },
  })
  mounted.push(component)
  const button = wrapper.querySelector(`button`)
  assert(button !== null, `FullscreenButton rendered no button`)
  return { wrapper, flag, button, component }
}

const icon_path = (button: HTMLElement): string | null =>
  button.querySelector(`svg path`)?.getAttribute(`d`) ?? null

describe(`per-wrapper isolation`, () => {
  test(`an unrelated element going fullscreen flips no flag`, async () => {
    const [first, second] = [mount_button(), mount_button()]
    const outsider = document.createElement(`div`)
    document.body.append(outsider)

    await set_fullscreen_element(outsider)
    await settle()

    expect(get(first.flag)).toBe(false)
    expect(get(second.flag)).toBe(false)
    expect(request_calls).toEqual([])
  })

  test(`exiting one wrapper does not clear a second wrapper that took over`, async () => {
    const [first, second] = [mount_button(), mount_button()]

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
  })
})

describe(`flag <-> browser sync`, () => {
  test(`click enters, click again exits`, async () => {
    const { button, flag, wrapper } = mount_button()

    button.click()
    await settle()
    expect(get(flag)).toBe(true)
    expect(document.fullscreenElement).toBe(wrapper)
    expect(button.getAttribute(`aria-pressed`)).toBe(`true`)
    expect(button.getAttribute(`aria-label`)).toBe(`Exit fullscreen`)
    expect(icon_path(button)).toBe(icons.ExitFullscreen.d)

    button.click()
    await settle()
    expect(get(flag)).toBe(false)
    expect(document.exitFullscreen).toHaveBeenCalledTimes(1)
    expect(document.fullscreenElement).toBeNull()
    expect(icon_path(button)).toBe(icons.Fullscreen.d)
  })

  test(`setting the flag from outside drives the browser`, async () => {
    const { flag, wrapper } = mount_button()

    flag.set(true)
    await settle()
    expect(document.fullscreenElement).toBe(wrapper)

    flag.set(false)
    await settle()
    expect(document.fullscreenElement).toBeNull()
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

    button.click()
    await tick()
    button.click()
    await tick()

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

    button.click()
    await tick()
    button.click()
    await tick()

    request.resolve(undefined)
    await settle()
    await settle()

    expect(document.fullscreenElement).toBe(wrapper)
    expect(get(flag)).toBe(true)
    expect(request_calls).toEqual([wrapper, wrapper])
  })

  test(`Esc-style external exit clears the flag and calls on_change`, async () => {
    const on_change = vi.fn()
    const { button, flag } = mount_button({ on_change })

    button.click()
    await settle()
    expect(on_change).not.toHaveBeenCalled() // the flag already agreed with the browser

    await set_fullscreen_element(null)
    await settle()
    expect(get(flag)).toBe(false)
    expect(on_change).toHaveBeenCalledExactlyOnceWith(false)
  })

  test(`a rejected request reports the error and leaves the browser untouched`, async () => {
    const console_error = vi.spyOn(console, `error`).mockImplementation(() => {})
    const on_request_error = vi.fn()
    const request_error = new Error(`fullscreen denied`)
    const request = vi.fn(() => Promise.reject(request_error))
    Element.prototype.requestFullscreen = request
    const { button, flag } = mount_button({ on_request_error })

    button.click()
    await settle()

    expect(on_request_error).toHaveBeenCalledExactlyOnceWith(request_error)
    expect(console_error).toHaveBeenCalledOnce()
    expect(document.fullscreenElement).toBeNull()
    // a flag left true would misreport the browser and make the next attempt a no-op
    expect(get(flag)).toBe(false)

    button.click()
    await settle()
    expect(request).toHaveBeenCalledTimes(2)
  })

  test(`a rejected exit is reported and leaves the browser in fullscreen`, async () => {
    const console_error = vi.spyOn(console, `error`).mockImplementation(() => {})
    const on_request_error = vi.fn()
    const { button, flag, wrapper } = mount_button({ on_request_error })

    button.click()
    await settle()
    const exit_error = new Error(`exit denied`)
    document.exitFullscreen = vi.fn(() => Promise.reject(exit_error))

    button.click()
    await settle()

    expect(console_error).toHaveBeenCalledOnce()
    expect(on_request_error).toHaveBeenCalledExactlyOnceWith(exit_error)
    expect(document.exitFullscreen).toHaveBeenCalledOnce()
    expect(document.fullscreenElement).toBe(wrapper)
    // flag must match the browser or aria-pressed / the next click would lie
    expect(get(flag)).toBe(true)
  })

  test(`a stale exit rejection does not re-enter after an external exit`, async () => {
    vi.spyOn(console, `error`).mockImplementation(() => {})
    const { button, flag, wrapper } = mount_button()

    button.click()
    await settle()
    const exit_request = Promise.withResolvers<undefined>()
    document.exitFullscreen = vi.fn(() => exit_request.promise.then(() => undefined))

    button.click()
    await tick()
    expect(document.exitFullscreen).toHaveBeenCalledOnce()

    await set_fullscreen_element(null)
    exit_request.reject(new Error(`stale exit rejection`))
    await settle()

    expect(document.fullscreenElement).toBeNull()
    expect(get(flag)).toBe(false)
    expect(request_calls).toEqual([wrapper])
  })

  test(`unmounting stops tracking fullscreenchange`, async () => {
    const { component, flag, wrapper } = mount_button()

    await unmount(component)
    await set_fullscreen_element(wrapper)
    await settle()

    expect(get(flag)).toBe(false)
  })

  test(`without a wrapper the button only toggles its flag`, async () => {
    const { button, flag } = mount_button({ wrapper: undefined })

    button.click()
    await settle()
    expect(get(flag)).toBe(true)
    expect(request_calls).toEqual([])

    // an unowned fullscreen session must not clobber a flag nobody asked us to sync
    const outsider = document.createElement(`div`)
    document.body.append(outsider)
    await set_fullscreen_element(outsider)
    await settle()
    expect(get(flag)).toBe(true)
  })

  test(`placement=corner is opt-in`, () => {
    const inline_button = mount_button({ wrapper: undefined }).button
    const corner_button = mount_button({ wrapper: undefined, placement: `corner` }).button

    expect(
      [inline_button, corner_button].map((button) => button.classList.contains(`corner`)),
    ).toEqual([false, true])
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
    [`body wins over html`, `rgb(1, 2, 3)`, `rgb(4, 5, 6)`, `rgb(1, 2, 3)`],
    [`html when body is transparent`, ``, `rgb(4, 5, 6)`, `rgb(4, 5, 6)`],
  ])(`get_page_background: %s`, (_name, body_bg, html_bg, expected) => {
    document.body.style.backgroundColor = body_bg
    document.documentElement.style.backgroundColor = html_bg
    expect(get_page_background()).toBe(expected)
  })

  test.each([
    [true, `#1a1a1a`],
    [false, `#ffffff`],
  ])(
    `get_page_background falls back to prefers-color-scheme (dark=%s)`,
    (dark, expected) => {
      // Once: restoreAllMocks spares vi.fn() mocks, so a lasting value would leak onward
      vi.mocked(globalThis.matchMedia).mockReturnValueOnce({
        matches: dark,
      } as MediaQueryList)
      expect(get_page_background()).toBe(expected)
    },
  )

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

describe(`button rendering`, () => {
  test.each([
    icons.Check,
    { viewBox: icons.Check.viewBox, markup: `<path d="${icons.Check.d}"/>` },
  ])(`custom icons, labels and class merge with the defaults`, (enter_icon) => {
    const { button } = mount_button({
      // only the `enter` half of each record: `exit` must fall back to the default
      icons: { enter: enter_icon },
      labels: { enter: `Grow` },
      class: `my-btn`,
      'aria-pressed': true, // spread before the real one, so it loses
    })

    expect([...button.classList]).toEqual(
      expect.arrayContaining([`fullscreen-btn`, `my-btn`]),
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

    // an explicitly undefined key must fall back too - a plain spread would render nothing
    const undefined_key = mount_button({
      labels: { enter: undefined },
      wrapper: undefined,
    })
    expect(undefined_key.button.title).toBe(`Enter fullscreen`)
  })

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

  test(`a caller's onclick runs alongside the toggle`, async () => {
    const onclick = vi.fn()
    const { button, flag } = mount_button({ onclick })

    button.click()
    await settle()

    expect(onclick).toHaveBeenCalledOnce()
    expect(get(flag)).toBe(true)
  })
})
