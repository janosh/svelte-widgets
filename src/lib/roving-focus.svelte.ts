import {
  composed_parent,
  is_active_element,
  is_focus_available,
} from './attachments/shared'
import { is_editable_event_target, is_modifier_chord } from './utils'
import { SvelteSet } from 'svelte/reactivity'
// Roving tabindex over keyed HTML or SVG items in DOM order.
const NEXT_KEYS = new Set([`ArrowRight`, `ArrowDown`])
const PREV_KEYS = new Set([`ArrowLeft`, `ArrowUp`])
const groups = new SvelteSet<Element>()

export const ROVING_ATTR = `data-roving-key`

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

  $effect(() => {
    const container = opts.container()
    if (!container) return undefined
    groups.add(container)
    // Native eligibility can change without the item list changing (disabled controls,
    // hidden panels, or CSS classes). Batch DOM changes in one observer callback.
    const observer = new MutationObserver(() => {
      dom_revision++
    })
    const attributes = {
      attributes: true,
      attributeFilter: [
        ROVING_ATTR,
        `disabled`,
        `type`,
        `hidden`,
        `inert`,
        `open`,
        `class`,
        `style`,
      ],
    }
    observer.observe(container, { ...attributes, subtree: true, childList: true })
    for (
      let parent = composed_parent(container);
      parent;
      parent = composed_parent(parent)
    ) {
      observer.observe(parent, attributes)
    }
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

  $effect(() => {
    opts.items()
    void dom_revision
    const container = opts.container()
    const marks = container ? marks_in(container) : []
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

  return {
    tabindex: (key) => {
      pass.fallback ??= key
      return key ===
        (focused_key ?? (fallback_key === undefined ? pass.fallback : fallback_key))
        ? 0
        : -1
    },
    focusin: (event) => {
      const mark = (event.target as Element | null)?.closest?.(`[${ROVING_ATTR}]`)
      const container = opts.container()
      if (mark && container && owns(mark, container) && is_focus_available(mark))
        focused_key = mark.getAttribute(ROVING_ATTR)
    },
    handle_keydown: (event) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        is_modifier_chord(event) ||
        is_editable_event_target(event.target)
      )
        return false
      const is_next = NEXT_KEYS.has(event.key)
      const is_prev = PREV_KEYS.has(event.key)
      if (!is_next && !is_prev && event.key !== `Home` && event.key !== `End`)
        return false
      const container = opts.container()
      if (!container) return false
      const marks = marks_in(container)
      if (marks.length === 0) return false

      const current = (event.target as Element | null)?.closest?.(`[${ROVING_ATTR}]`)
      if (current && !owns(current, container)) return false
      const current_idx = current
        ? marks.indexOf(current as HTMLElement | SVGElement)
        : -1
      const step = is_prev || event.key === `End` ? -1 : 1
      let next_idx = step === -1 ? marks.length - 1 : 0
      if (current_idx >= 0 && (is_next || is_prev))
        next_idx = (current_idx + step + marks.length) % marks.length
      let remaining = marks.length
      while (remaining-- > 0) {
        const target = marks[next_idx]
        if (is_focus_available(target)) {
          target.focus()
          if (is_active_element(target)) {
            event.preventDefault()
            focused_key = target.getAttribute(ROVING_ATTR)
            return true
          }
        }
        next_idx = (next_idx + step + marks.length) % marks.length
      }
      return false
    },
  }
}
