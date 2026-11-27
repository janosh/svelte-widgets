import {
  css_var_names,
  declared_color_scheme,
  is_dark_mode,
  nearest_declared,
  resolve_color_token,
  system_scheme,
  watch_dark_mode,
  watch_theme_changes,
  type ColorScheme,
} from '#lib/theme-core.ts'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'

// observers report async
const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
const stoppers: (() => void)[] = []
afterEach(() => {
  for (const stop of stoppers.splice(0)) stop()
  document.body.replaceChildren()
  document.documentElement.removeAttribute(`data-theme`)
  document.documentElement.removeAttribute(`style`)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test(`theme-core and its imports stay free of runes and Svelte, so workers can load them`, () => {
  const lib_dir = `${import.meta.dirname}/../../src/lib`
  const pending = [`theme-core.ts`]
  const seen = new Set<string>()
  for (let file = pending.pop(); file; file = pending.pop()) {
    if (seen.has(file)) continue
    seen.add(file)
    const source = readFileSync(`${lib_dir}/${file}`, `utf8`)
    // rune calls, or runtime (non-type) imports of svelte or a .svelte module
    expect(source, file).not.toMatch(/\$(?:state|derived|effect)(?:\.\w+)?\(/)
    expect(source, file).not.toMatch(
      /^(?:import|export) (?!type )[^']*'(?:svelte|[^']*\.svelte)/m,
    )
    for (const { groups } of source.matchAll(
      /^(?:import|export) (?!type )[^']*'(?<spec>\.[^']+)'/gm,
    )) {
      const resolved = new URL(groups?.spec ?? ``, `file:///${file}`).pathname.slice(1)
      pending.push(resolved.endsWith(`.ts`) ? resolved : `${resolved}.ts`)
    }
  }
  expect([...seen]).toContain(`attachments/contrast-color.ts`)
})

test.each([
  [`dark`, `dark`],
  [`light`, `light`],
  [`only dark`, `dark`],
  [`light dark`, null], // both schemes defer to the user's preference
  [`dark light`, null],
  [``, null],
] as const)(`declared_color_scheme(color-scheme: %j) = %s`, (scheme, expected) => {
  document.documentElement.style.colorScheme = scheme
  expect(declared_color_scheme(document.documentElement)).toBe(expected)
})

test(`nearest_declared walks ancestors and crosses shadow roots to their host`, () => {
  const host = document.createElement(`section`)
  host.dataset.theme = `dark`
  document.body.append(host)
  const inner = document.createElement(`span`)
  host.attachShadow({ mode: `open` }).append(inner)
  const read = (element: Element) =>
    (element.getAttribute(`data-theme`) as ColorScheme) ?? null
  expect(nearest_declared(inner, read)).toBe(`dark`)
  host.removeAttribute(`data-theme`)
  expect(nearest_declared(inner, read)).toBeNull()
  expect(nearest_declared(null)).toBeNull()
})

describe(`is_dark_mode + watch_dark_mode`, () => {
  // The element's computed color-scheme decides: the root's inline scheme on a site, a widget
  // element's own scheme in a notebook; nothing declared falls back to the OS preference
  test.each([
    [`dark`, false, true],
    [`light`, true, false],
    [`light dark`, false, false],
    [`light dark`, true, true],
    [``, true, true],
  ])(`color-scheme %j with OS dark=%s -> dark=%s`, (scheme, os_dark, expected) => {
    vi.stubGlobal(`matchMedia`, () => ({ matches: os_dark }))
    document.documentElement.style.colorScheme = scheme
    expect(system_scheme()).toBe(os_dark ? `dark` : `light`)
    expect(is_dark_mode()).toBe(expected)
  })

  test(`a widget element's own scheme wins over the page root's`, () => {
    document.documentElement.style.colorScheme = `light`
    const widget = document.createElement(`div`)
    widget.style.colorScheme = `dark`
    const canvas = document.createElement(`canvas`)
    widget.append(canvas)
    document.body.append(widget)
    expect([is_dark_mode(canvas), is_dark_mode()]).toEqual([true, false])
  })

  test(`watch_dark_mode reports the element's scheme, never on subscribe, and stops after cleanup`, async () => {
    const widget = document.createElement(`div`)
    document.body.append(widget)
    const widget_calls: boolean[] = []
    stoppers.push(watch_dark_mode((dark) => widget_calls.push(dark), widget))
    expect(widget_calls).toEqual([])
    widget.style.colorScheme = `dark`
    document.documentElement.style.colorScheme = `light`
    await settle()
    expect(widget_calls.at(-1)).toBe(true) // re-read from the element, not the (light) root

    const calls: boolean[] = []
    const cleanup = watch_dark_mode((dark) => calls.push(dark))
    document.documentElement.style.colorScheme = `dark`
    await settle()
    expect(calls).toEqual([true])
    cleanup()
    document.documentElement.style.colorScheme = `light`
    await settle()
    expect(calls).toEqual([true])
  })
})

// One shared observer serves every subscriber, filtered to what can change the colors it reads:
// a layout write on an ancestor (a toolbar width, left/top) must not re-run color reads below
describe(`watch_theme_changes`, () => {
  // outer > inner (watched) and a sibling subtree another subscriber watches
  const make_tree = () => {
    const [outer, inner, sibling] = [`div`, `div`, `div`].map((tag) =>
      document.createElement(tag),
    )
    outer.className = `host`
    outer.append(inner)
    document.body.append(outer, sibling)
    return { outer, inner, sibling }
  }
  const watch = (node: Element, props: string[] = []) => {
    const on_change = vi.fn()
    stoppers.push(watch_theme_changes(node, on_change, props))
    return on_change
  }

  test.each([
    [`class on an ancestor`, ({ outer }) => outer.classList.add(`jp-theme-dark`), 1],
    [
      `data-theme on the root`,
      () => (document.documentElement.dataset.theme = `dark`),
      1,
    ],
    [`inline color-scheme`, ({ outer }) => (outer.style.colorScheme = `dark`), 1],
    [
      `a watched inline variable`,
      ({ outer }) => outer.style.setProperty(`--page-bg`, `#000`),
      1,
    ],
    [
      `a layout variable`,
      ({ outer }) => outer.style.setProperty(`--toolbar-width`, `40px`),
      0,
    ],
    [
      `left/top`,
      ({ outer }) => Object.assign(outer.style, { left: `3px`, top: `4px` }),
      0,
    ],
    [`an unchanged class`, ({ outer }) => outer.setAttribute(`class`, `host`), 0],
    [`a sibling subtree`, ({ sibling }) => sibling.classList.add(`dark`), 0],
  ] satisfies [string, (tree: ReturnType<typeof make_tree>) => unknown, number][])(
    `%s notifies %i time(s)`,
    async (_label, mutate, expected) => {
      const tree = make_tree()
      const on_change = watch(tree.inner, [`--page-bg`])
      watch(tree.sibling) // so the sibling subtree is observed too
      mutate(tree)
      mutate(tree) // a burst of writes on the same nodes still notifies once
      await settle()
      expect(on_change).toHaveBeenCalledTimes(expected)
    },
  )

  test(`a shadow host's class change reaches subscribers inside its shadow root`, async () => {
    const host = document.createElement(`div`)
    document.body.append(host)
    const inner = document.createElement(`span`)
    host.attachShadow({ mode: `open` }).append(inner)
    const on_change = watch(inner)
    host.classList.add(`dark`)
    await settle()
    expect(on_change).toHaveBeenCalledOnce()
  })

  test(`the OS preference flipping notifies every subscriber`, () => {
    const listeners: (() => void)[] = []
    vi.stubGlobal(`matchMedia`, () => ({
      matches: false,
      addEventListener: (_type: string, listener: () => void) => listeners.push(listener),
      removeEventListener: vi.fn(),
    }))
    const { inner, sibling } = make_tree()
    const [on_inner, on_sibling] = [watch(inner), watch(sibling)]
    for (const listener of listeners) listener()
    expect([on_inner.mock.calls.length, on_sibling.mock.calls.length]).toEqual([1, 1])
  })

  test(`is a no-op without MutationObserver (workers, SSR)`, () => {
    vi.stubGlobal(`MutationObserver`, undefined)
    const on_change = vi.fn()
    const stop = watch_theme_changes(document.body, on_change)
    document.body.classList.add(`dark`)
    stop()
    expect(on_change).not.toHaveBeenCalled()
    document.body.classList.remove(`dark`)
  })

  test(`a subscriber leaving keeps the others notified and the last one stops it all`, async () => {
    const { outer, inner } = make_tree()
    const [on_inner, on_outer] = [watch(inner), watch(outer)]
    stoppers.shift()?.() // inner unsubscribes: the shared observer re-observes the rest
    await settle()
    outer.classList.add(`dark`)
    await settle()
    expect([on_inner.mock.calls.length, on_outer.mock.calls.length]).toEqual([0, 1])
    stoppers.shift()?.()
    outer.classList.add(`light`)
    await settle()
    expect(on_outer).toHaveBeenCalledOnce()
  })
})

test.each([
  [`var(--a)`, [`--a`]],
  [`var( --a, var(--b-2, red))`, [`--a`, `--b-2`]],
  [`color-mix(in srgb, var(--x) 50%, white)`, [`--x`]],
  [`#123456`, []],
])(`css_var_names(%j) = %j`, (value, expected) => {
  expect(css_var_names(value)).toEqual(expected)
})

// Color-function tokens like light-dark() compute to that literal string, which only a browser
// resolves. happy-dom can't, so a var() value and a stubbed probe style stand in for it.
test(`resolve_color_token resolves color functions on a removed probe and passes colors through`, () => {
  const node = document.createElement(`div`)
  document.body.append(node)
  const real = globalThis.getComputedStyle
  vi.spyOn(globalThis, `getComputedStyle`).mockImplementation((element) =>
    element.tagName === `SPAN`
      ? ({ color: `rgb(24, 23, 28)` } as CSSStyleDeclaration)
      : real(element),
  )
  expect(resolve_color_token(node, `var(--surface)`)).toBe(`rgb(24, 23, 28)`)
  expect(node.querySelector(`span`)).toBeNull()
  for (const value of [`#123456`, `red`, ``, `not-a-color`])
    expect(resolve_color_token(node, value)).toBe(value)
})
