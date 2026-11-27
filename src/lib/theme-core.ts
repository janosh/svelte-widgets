// Theme helpers free of runes and Svelte imports, so workers and plain-JS bootstraps (embedded
// notebook widgets) can import them. theme.svelte.ts layers the reactive mode on top.
import { parse_color_syntax } from './attachments/contrast-color'

export const THEME_MODES = [`light`, `dark`, `system`] as const
export type ThemeMode = (typeof THEME_MODES)[number]
export type ColorScheme = `light` | `dark`

export const THEME_MODE_CYCLE = {
  light: `system`,
  system: `dark`,
  dark: `light`,
} as const

// The OS preference, light without a browser
export const system_scheme = (): ColorScheme =>
  globalThis.matchMedia?.(`(prefers-color-scheme: dark)`).matches ? `dark` : `light`

// Inline <head> script restoring the theme before first paint, so prerendered pages don't
// flash the wrong theme before hydration. Mirrors apply_theme_mode: a stored light/dark wins,
// anything else (system, unset, unreadable storage) follows prefers-color-scheme. Render it via
// ThemeScript, or inject it yourself (e.g. a transformPageChunk hook or a static app.html).
export const theme_init_script = `{
  let theme
  try {
    theme = localStorage.getItem('theme')
  } catch {}
  if (theme !== 'light' && theme !== 'dark')
    theme = globalThis.matchMedia?.('(prefers-color-scheme: dark)')?.matches ? 'dark' : 'light'
  document.documentElement.style.colorScheme = theme
  document.documentElement.dataset.theme = theme
}`

// === Reading the scheme an element renders in ===

// The scheme an element declares through the CSS API, or null when it names none. `only` is a
// modifier (`only dark`), not a scheme. A value listing BOTH schemes (`light dark`) defers to
// the user's preference rather than declaring light, so a stylesheet setting `light dark` on
// :root lets a walk continue to a real statement above it.
export const declared_color_scheme = (element: Element): ColorScheme | null => {
  const tokens = (
    getComputedStyle(element).colorScheme?.trim().split(/\s+/) ?? []
  ).filter((token) => token !== `only`)
  if (tokens.includes(`light`) && tokens.includes(`dark`)) return null
  const [scheme] = tokens
  return scheme === `dark` || scheme === `light` ? scheme : null
}

// The element, its ancestors and, across shadow boundaries, the shadow hosts above it
const composed_ancestors = (node: Element): Element[] => {
  const chain: Element[] = []
  for (let current: Element | null = node; current;) {
    chain.push(current)
    const root = current.getRootNode()
    current =
      current.parentElement ??
      (typeof ShadowRoot !== `undefined` && root instanceof ShadowRoot ? root.host : null)
  }
  return chain
}

// Nearest scheme `read` finds at or above `element`, crossing shadow roots. Browsers inherit the
// computed color-scheme so the first read normally answers; the walk covers DOMs that don't and
// host markers (e.g. a notebook's `jp-theme-dark` class) a custom `read` scans for.
export const nearest_declared = (
  element: Element | null,
  read: (element: Element) => ColorScheme | null = declared_color_scheme,
): ColorScheme | null => {
  for (const ancestor of element ? composed_ancestors(element) : []) {
    const scheme = read(ancestor)
    if (scheme) return scheme
  }
  return null
}

// Whether `element` renders in the dark scheme: its declared color-scheme, which every
// light-dark() around it resolves against, else (nothing declared) the OS preference
export const is_dark_mode = (
  element: Element | undefined = globalThis.document?.documentElement,
): boolean =>
  element !== undefined && (nearest_declared(element) ?? system_scheme()) === `dark`

// === Theme change watching ===
// A theme change lands on class, data-theme or inline style (color-scheme or a custom property)
// of the element or an ancestor, or comes from the OS preference. One MutationObserver serves
// every subscriber: it watches the union of their ancestor chains (crossing shadow hosts) with
// old values recorded, so a write that changes nothing, or a style write touching neither
// color-scheme nor a property the subscriber reads (a layout variable, left/top), notifies no one.
type ThemeSubscriber = {
  chain: ReadonlySet<Node>
  props: ReadonlySet<string>
  on_change: () => void
}
const THEME_ATTRIBUTES = [`class`, `data-theme`, `style`]
const subscribers = new Set<ThemeSubscriber>()
const observed_counts = new Map<Node, number>()
let theme_observer: MutationObserver | undefined
let scheme_query: MediaQueryList | undefined
let rebuild_queued = false
let style_parser: CSSStyleDeclaration | undefined

const style_declarations = (css_text: string | null): Map<string, string> => {
  style_parser ??= document.createElement(`div`).style
  style_parser.cssText = css_text ?? ``
  const declarations = new Map<string, string>()
  for (let idx = 0; idx < style_parser.length; idx++) {
    const name = style_parser.item(idx)
    declarations.set(name, style_parser.getPropertyValue(name))
  }
  return declarations
}

// Properties whose inline value differs between two style attributes
const changed_style_props = (
  before: string | null,
  after: string | null,
): Set<string> => {
  const [old_decls, new_decls] = [style_declarations(before), style_declarations(after)]
  const changed = new Set<string>()
  for (const [name, value] of old_decls)
    if (new_decls.get(name) !== value) changed.add(name)
  for (const name of new_decls.keys()) if (!old_decls.has(name)) changed.add(name)
  return changed
}

const handle_theme_records = (records: MutationRecord[]): void => {
  const notified = new Set<ThemeSubscriber>()
  for (const { target, attributeName, oldValue } of records) {
    if (!(target instanceof Element) || !attributeName) continue
    const current = target.getAttribute(attributeName)
    if (current === oldValue) continue
    // class and data-theme can restyle every token through the stylesheets; a style write
    // matters through color-scheme (light-dark()) or an inline value a subscriber reads
    const changed =
      attributeName === `style` ? changed_style_props(oldValue, current) : null
    if (changed?.size === 0) continue
    const any_subscriber = changed === null || changed.has(`color-scheme`)
    for (const subscriber of subscribers) {
      if (notified.has(subscriber) || !subscriber.chain.has(target)) continue
      if (any_subscriber || [...changed].some((name) => subscriber.props.has(name)))
        notified.add(subscriber)
    }
  }
  for (const subscriber of notified) subscriber.on_change()
}

const notify_all = (): void => {
  for (const subscriber of subscribers) subscriber.on_change()
}

const observe_node = (node: Node): void =>
  theme_observer?.observe(node, {
    attributes: true,
    attributeFilter: THEME_ATTRIBUTES,
    attributeOldValue: true,
  })

// MutationObserver has no unobserve: drop nodes no subscriber watches by re-observing the rest,
// after handing over records already queued for them
const rebuild_observer = (): void => {
  rebuild_queued = false
  if (!theme_observer) return
  handle_theme_records(theme_observer.takeRecords())
  theme_observer.disconnect()
  for (const node of observed_counts.keys()) observe_node(node)
}

// Call `on_change` when the theme `node` renders in may have changed: a class or data-theme
// change on it or an ancestor, an inline color-scheme or one of `props` (CSS property or custom
// property names the caller reads) changing there, or the OS preference flipping. Never on
// subscribe. The chain is fixed at subscribe time, so resubscribe after moving `node`.
// Returns the teardown; a no-op without a DOM.
export const watch_theme_changes = (
  node: Element,
  on_change: () => void,
  props: Iterable<string> = [],
): (() => void) => {
  if (typeof MutationObserver === `undefined`) return () => {}
  theme_observer ??= new MutationObserver(handle_theme_records)
  if (!scheme_query) {
    scheme_query = globalThis.matchMedia?.(`(prefers-color-scheme: dark)`)
    scheme_query?.addEventListener(`change`, notify_all)
  }
  const chain = new Set<Node>(composed_ancestors(node))
  const subscriber: ThemeSubscriber = { chain, props: new Set(props), on_change }
  subscribers.add(subscriber)
  for (const ancestor of chain) {
    const count = observed_counts.get(ancestor) ?? 0
    observed_counts.set(ancestor, count + 1)
    if (count === 0) observe_node(ancestor)
  }
  return () => {
    if (!subscribers.delete(subscriber)) return
    for (const ancestor of chain) {
      const count = (observed_counts.get(ancestor) ?? 1) - 1
      if (count > 0) observed_counts.set(ancestor, count)
      else observed_counts.delete(ancestor)
    }
    if (subscribers.size === 0) {
      theme_observer?.disconnect()
      theme_observer = undefined
      scheme_query?.removeEventListener(`change`, notify_all)
      scheme_query = undefined
      return
    }
    if (rebuild_queued) return
    rebuild_queued = true
    queueMicrotask(rebuild_observer)
  }
}

// Call `on_change` with is_dark_mode(element) whenever the scheme `element` renders in may have
// changed (see watch_theme_changes). Not on subscribe: callers subscribe inside effects whose
// callback writes state, which a synchronous first call would re-trigger, so read
// is_dark_mode(element) for the initial value. Returns the teardown; a no-op without a DOM.
export const watch_dark_mode = (
  on_change: (dark: boolean) => void,
  element: Element | undefined = globalThis.document?.documentElement,
): (() => void) =>
  element
    ? watch_theme_changes(element, () => on_change(is_dark_mode(element)))
    : () => {}

// === Color tokens ===

// Custom property names a CSS value reads (`var(--a, var(--b, red))` -> --a, --b), so a color
// read can watch exactly the inline variables it depends on (see watch_theme_changes)
export const css_var_names = (value: string): string[] =>
  [...value.matchAll(/var\(\s*(?<name>--[\w-]+)/g)].flatMap(({ groups }) =>
    groups?.name ? [groups.name] : [],
  )

// A custom property defined as a color function (`--page-bg: light-dark(...)`, var(),
// color-mix()) computes to that literal string, not a color, which canvas and WebGL can't
// paint. Resolve it as the `color` of a probe inside `node`: the probe inherits the node's
// custom properties and color-scheme, which picks the light-dark() branch and system colors
// (Canvas). Visible literal colors pass through as written; rejected values come back unchanged.
export const resolve_color_token = (node: Element, value: string): string => {
  if (!value || (parse_color_syntax(value)?.[3] ?? 0) > 0) return value
  const probe = document.createElement(`span`)
  probe.style.color = value
  if (!probe.style.color) return value
  const host = node instanceof HTMLElement ? node : (node.parentElement ?? document.body)
  host.append(probe)
  const color = getComputedStyle(probe).color
  probe.remove()
  return color || value
}
