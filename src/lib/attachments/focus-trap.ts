import { register_escape_layer, register_trap_layer } from './shared'

export interface FocusTrapOptions {
  enabled?: boolean
  // What to focus on activation: an element, a selector resolved within the root, or
  // `false` to leave focus where it is. Defaults to the first tabbable descendant.
  initial?: Element | string | false
  // Where focus returns on teardown. Defaults to whatever held it on activation;
  // `false` leaves focus alone, for a trigger the surface itself removed.
  restore?: Element | false
  // Further containers the trap covers, for portalled parts of the same surface
  include?: (Element | null | undefined)[]
  // Narrows Tab cycling to a descendant. Resolved per keystroke; falls back to the node.
  root?: Element | string | null | (() => Element | null | undefined)
  // Escape handler, on the same layer stack `click_outside` uses, so only the innermost
  // trap hears the key. Omit and Escape passes through untouched.
  on_escape?: (event: KeyboardEvent) => void
  // Pull focus back to where it last sat inside whenever something outside takes it.
  recapture?: boolean
}

// CSS candidates only; filtering and ordering stay private below.
export const tabbable_selector = [
  `a[href]`,
  `area[href]`,
  `button`,
  `input`,
  `select`,
  `textarea`,
  `summary`,
  `iframe`,
  `object`,
  `embed`,
  `audio[controls]`,
  `video[controls]`,
  `[contenteditable]:not([contenteditable=false])`,
  `[tabindex]`,
].join(`,`)

// Selector matches can include SVG anchors; only these two element types expose focus().
const is_focusable = (element: unknown): element is HTMLElement | SVGElement =>
  element instanceof HTMLElement || element instanceof SVGElement

const composed_parent = (element: Element): Element | null => {
  if (element.parentElement) return element.parentElement
  const root = element.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

const candidate_tab_index = (element: Element) =>
  Number(element.getAttribute(`tabindex`) ?? 0)
const candidate_order = (element: Element) =>
  candidate_tab_index(element) || Number.MAX_SAFE_INTEGER

const is_tab_candidate = (element: Element): element is HTMLElement | SVGElement => {
  if (!is_focusable(element) || candidate_tab_index(element) < 0) return false
  if (element.matches(`:disabled`)) return false
  // Descendants can override inherited visibility, so only the candidate's value matters.
  if (getComputedStyle(element).visibility === `hidden`) return false
  let current: Element | null = element
  while (current) {
    const style = getComputedStyle(current)
    if (
      current.matches(`[hidden],[inert]`) ||
      style.display === `none` ||
      (current.matches(`details:not([open])`) &&
        !current.querySelector(`:scope > summary`)?.contains(element)) ||
      (element.matches(`button,input,select,textarea`) &&
        current.matches(`fieldset[disabled]`) &&
        !current.querySelector(`:scope > legend`)?.contains(element))
    )
      return false
    current = composed_parent(current)
  }
  return true
}

const is_named_radio = (element: Element): element is HTMLInputElement =>
  element instanceof HTMLInputElement && element.type === `radio` && Boolean(element.name)

const collect_tab_candidates = (
  root: Element | ShadowRoot,
  candidates: Set<Element>,
): void => {
  for (const child of root.children) {
    if (child.matches(tabbable_selector)) candidates.add(child)
    if (child.shadowRoot) collect_tab_candidates(child.shadowRoot, candidates)
    collect_tab_candidates(child, candidates)
  }
}

// Covers light DOM and open shadow roots; closed roots are necessarily opaque.
const get_tab_candidates = (roots: Element[]): (HTMLElement | SVGElement)[] => {
  const candidate_set = new Set<Element>()
  for (const root of roots) collect_tab_candidates(root, candidate_set)
  const candidates = [...candidate_set]

  return candidates
    .filter(is_tab_candidate)
    .filter((element) => {
      if (!is_named_radio(element)) return true
      const checked_peer = candidates.find(
        (peer) =>
          is_named_radio(peer) &&
          peer.name === element.name &&
          peer.form === element.form &&
          peer.getRootNode() === element.getRootNode() &&
          peer.checked,
      )
      return !checked_peer || checked_peer === element
    })
    .toSorted((left, right) => candidate_order(left) - candidate_order(right))
}

const deep_active_element = (): Element | null => {
  let active = document.activeElement
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement
  return active
}

const composed_contains = (container: Element, target: Element): boolean => {
  let current: Element | null = target
  while (current && current !== container) current = composed_parent(current)
  return current === container
}

const focus_element = (element: Element | null | undefined) => {
  if (is_focusable(element)) element.focus()
}

// Keep Tab inside a surface and hand focus back when it closes.
export const focus_trap =
  (options: FocusTrapOptions = {}) =>
  (node: Element): (() => void) | undefined => {
    const {
      enabled = true,
      initial,
      restore,
      include = [],
      root,
      on_escape,
      recapture = false,
    } = options
    if (!enabled || !(node instanceof HTMLElement)) return undefined

    const extra_containers = include.filter((el) => el instanceof Element)
    const resolve_root = (): Element =>
      (typeof root === `function`
        ? root()
        : typeof root === `string`
          ? node.querySelector(root)
          : root) ?? node
    // `root` narrows Tab order, but the whole node remains inside the trap.
    // Recollected per keystroke: menus grow, filter and disable items while open
    const tabbables = () => get_tab_candidates([resolve_root(), ...extra_containers])
    const is_inside = (target: unknown): target is Element =>
      target instanceof Element &&
      [node, ...extra_containers].some((el) => composed_contains(el, target))
    const holds_focus = () => is_inside(deep_active_element())

    const focus_origin = deep_active_element()
    // Recapture can inject tabindex into several roots; teardown restores them all.
    const tabindex_added_to: Element[] = []
    let last_inside: Element | null = null
    let trap_active = true

    // Recapture still needs a fallback when initial activation left focus alone.
    const wanted = initial === false ? undefined : initial

    const focus_into = () => {
      const root_el = resolve_root()
      // Recapture prefers the last focused element over the initial entry point.
      const preferred = is_inside(last_inside) ? last_inside : null
      const requested =
        typeof wanted === `string` ? root_el.querySelector(wanted) : wanted
      const target = preferred ?? requested ?? tabbables()[0] ?? root_el
      if (target === root_el && !root_el.hasAttribute(`tabindex`)) {
        root_el.setAttribute(`tabindex`, `-1`)
        tabindex_added_to.push(root_el)
      }
      focus_element(target)
    }

    const on_focusin = (event: FocusEvent) => {
      const active = deep_active_element() ?? event.target
      if (is_inside(active)) last_inside = active
    }

    // Wait through the transient body focus between normal focus moves.
    const on_focusout = (event: FocusEvent) => {
      if (!is_inside(event.target)) return
      queueMicrotask(() => {
        if (trap_active && !holds_focus()) focus_into()
      })
    }

    // Registered before the initial focus so `last_inside` starts out recorded
    if (recapture) {
      document.addEventListener(`focusin`, on_focusin)
      document.addEventListener(`focusout`, on_focusout)
    }

    if (initial !== false) focus_into()

    const on_tab = (event: KeyboardEvent) => {
      // A document-wide trap must ignore Tab until focus has entered it.
      if (!holds_focus()) return false
      const items = tabbables()
      event.preventDefault() // even with nothing to focus, Tab must not leave
      if (items.length === 0) return true
      const step = event.shiftKey ? -1 : 1
      // findIndex keeps the SVG candidate type compatible.
      const active = deep_active_element()
      const idx = items.findIndex((item) => item === active)
      // Focus on the container enters at the edge Tab would reach first.
      const edge = event.shiftKey ? items.at(-1) : items[0]
      const next = idx === -1 ? edge : items[(idx + step + items.length) % items.length]
      next?.focus()
      return true
    }

    const unregister = register_trap_layer(on_tab)
    // Swallowing the key is the same bargain dismiss_on_outside_press strikes above
    const unregister_escape = on_escape
      ? register_escape_layer((event) => {
          event.preventDefault()
          event.stopPropagation()
          on_escape(event)
          return true
        })
      : undefined

    return () => {
      trap_active = false
      unregister()
      unregister_escape?.()
      document.removeEventListener(`focusin`, on_focusin)
      document.removeEventListener(`focusout`, on_focusout)
      for (const element of tabindex_added_to) element.removeAttribute(`tabindex`)
      if (restore === false) return
      // Preserve a deliberate focus move outside the trap.
      if (!holds_focus() && document.activeElement !== document.body) return
      focus_element(restore ?? focus_origin)
    }
  }
