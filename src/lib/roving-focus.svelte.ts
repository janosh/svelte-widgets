import {
  composed_parent,
  is_active_element,
  is_focus_available,
} from './attachments/shared'
import { create_key_selector } from './internal/key-selector.svelte'
import { is_editable_event_target, is_modifier_chord } from './utils'
import { SvelteSet } from 'svelte/reactivity'
// Roving tabindex over keyed HTML or SVG items in DOM order.
// Home scans forward from the first item, End backward from the last
const FORWARD_KEYS = new Set([`ArrowRight`, `ArrowDown`, `Home`])
const BACKWARD_KEYS = new Set([`ArrowLeft`, `ArrowUp`, `End`])
const groups = new SvelteSet<Element>()

export const ROVING_ATTR = `data-roving-key`
// Native eligibility can change without the item list changing (disabled controls,
// hidden panels, or CSS classes).
const ELIGIBILITY_ATTRS = [
  ROVING_ATTR,
  `disabled`,
  `type`,
  `hidden`,
  `inert`,
  `open`,
  `class`,
  `style`,
]

export interface RovingFocus {
  // Set tabindex directly; spreading through a child can delay the first tab stop.
  tabindex: (key: string) => 0 | -1
  focusin: (event: FocusEvent) => void
  handle_keydown: (event: KeyboardEvent) => boolean
}

export function create_roving_focus(opts: {
  container: () => Element | null | undefined
  // Reactive values that change which keyed items render.
  items: () => unknown
}): RovingFocus {
  let focused_key = $state<string | null>(null)
  // DOM order stays stable even when Svelte re-evaluates items out of order.
  let fallback_key = $state<string | null>()
  let dom_revision = $state(0)

  const owns = (mark: Element, container: Element): boolean => {
    for (let parent = mark.parentElement; parent; parent = parent.parentElement) {
      if (parent === container) return true
      if (groups.has(parent)) return false
    }
    return false
  }
  const marks_in = (container: Element) =>
    [...container.querySelectorAll<HTMLElement | SVGElement>(`[${ROVING_ATTR}]`)].filter(
      (mark) => owns(mark, container),
    )
  // Whether a node is a mark or holds one: only then can its mutation change which marks
  // exist or can take focus (a chart restyles thousands of nodes per update)
  const touches_marks = (node: Node | null): boolean =>
    node instanceof Element &&
    (node.matches(`[${ROVING_ATTR}]`) || node.querySelector(`[${ROVING_ATTR}]`) !== null)
  const has_mark_child = (node: Node | null): boolean =>
    node instanceof Element && node.querySelector(`:scope > [${ROVING_ATTR}]`) !== null

  $effect(() => {
    const container = opts.container()
    if (!container) return undefined
    groups.add(container)
    // Batch DOM changes in one observer callback, ignoring those no mark is near. Always
    // relevant: the container's ancestors (observed for their own attributes), a node gaining
    // or losing the mark attribute (once lost, it no longer looks like a mark), a mark's
    // sibling (sibling CSS like `.hide + button` restyles it) and child-list changes beside
    // marks or inside a fieldset/details holding them (a first legend or summary decides
    // which of them are disabled). Nodes with no mark nearby (a chart's axes) don't count.
    const observer = new MutationObserver((records) => {
      const relevant = records.some(
        ({ type, target, attributeName, addedNodes, removedNodes }) =>
          !container.contains(target) ||
          (type === `attributes`
            ? attributeName === ROVING_ATTR ||
              touches_marks(target) ||
              has_mark_child(target.parentNode)
            : [...addedNodes, ...removedNodes].some(touches_marks) ||
              has_mark_child(target) ||
              (target instanceof Element &&
                target.matches(`fieldset, details`) &&
                touches_marks(target))),
      )
      if (relevant) dom_revision++
    })
    const attributes = { attributes: true, attributeFilter: ELIGIBILITY_ATTRS }
    observer.observe(container, { ...attributes, subtree: true, childList: true })
    for (let node = composed_parent(container); node; node = composed_parent(node))
      observer.observe(node, attributes)
    return () => {
      observer.disconnect()
      groups.delete(container)
    }
  })

  // Claim a provisional tab stop until the post-render DOM measurement settles.
  const pass = $derived.by(() => {
    opts.items()
    return { fallback: null as string | null }
  })

  // The marks and DOM revision last checked: the same marks with no eligibility change since
  // keep their tab stops, sparing the computed-style walk (a forced style recalc mid-update)
  let checked: { marks: Element[]; revision: number } | undefined
  $effect(() => {
    opts.items()
    const revision = dom_revision
    const container = opts.container()
    const marks = container ? marks_in(container) : []
    if (
      checked?.revision === revision &&
      checked.marks.length === marks.length &&
      checked.marks.every((mark, idx) => mark === marks[idx])
    )
      return
    checked = { marks, revision }
    // A key left behind by marks that no longer render would strand the group at -1
    if (
      focused_key != null &&
      !marks.some(
        (mark) =>
          mark.getAttribute(ROVING_ATTR) === focused_key && is_focus_available(mark),
      )
    )
      focused_key = null
    fallback_key = marks.find(is_focus_available)?.getAttribute(ROVING_ATTR) ?? null
  })

  // per-key, so a focus move re-runs only the two marks it moves the tab stop between
  const is_tab_stop = create_key_selector(() => focused_key ?? fallback_key)

  return {
    // Until the first measurement the first key asked claims a provisional tab stop. After it
    // `pass` is never read, so a changed item list (a chart's pan frame) re-runs no item.
    tabindex: (key) =>
      (
        fallback_key === undefined
          ? key === (focused_key ?? (pass.fallback ??= key))
          : is_tab_stop(key)
      )
        ? 0
        : -1,
    focusin: (event) => {
      const mark = (event.target as Element | null)?.closest?.(`[${ROVING_ATTR}]`)
      const container = opts.container()
      if (mark && container && owns(mark, container) && is_focus_available(mark))
        focused_key = mark.getAttribute(ROVING_ATTR)
    },
    handle_keydown: (event) => {
      const step = FORWARD_KEYS.has(event.key) ? 1 : BACKWARD_KEYS.has(event.key) ? -1 : 0
      if (
        !step ||
        event.defaultPrevented ||
        event.isComposing ||
        is_modifier_chord(event) ||
        is_editable_event_target(event.target)
      )
        return false
      const container = opts.container()
      const marks = container ? marks_in(container) : []
      const current = (event.target as Element | null)?.closest?.(`[${ROVING_ATTR}]`)
      if (!container || !marks.length || (current && !owns(current, container)))
        return false
      // Arrows step from the focused item; Home, End and focus outside items start at an end
      const current_idx = marks.indexOf(current as HTMLElement | SVGElement)
      let idx = step > 0 ? 0 : marks.length - 1
      if (current_idx !== -1 && event.key.startsWith(`Arrow`)) idx = current_idx + step
      // one lap keeps idx within [-length, 2 * length)
      for (let tries = 0; tries < marks.length; tries++, idx += step) {
        const target = marks[(idx + marks.length) % marks.length]
        if (!is_focus_available(target)) continue
        target.focus()
        if (!is_active_element(target)) continue
        event.preventDefault()
        focused_key = target.getAttribute(ROVING_ATTR)
        return true
      }
      return false
    },
  }
}
