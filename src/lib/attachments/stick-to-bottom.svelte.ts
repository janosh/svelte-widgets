import { untrack } from 'svelte'
import { is_editable_event_target } from '../utils'

// Keeps a scroll container pinned to the bottom of growing content (a streaming chat thread, a
// log tail) until the reader scrolls away, and re-pins once they scroll back. Layout alone
// emits scroll events indistinguishable from a reader scrolling up (the engine clamps the
// scroll offset when content above the viewport shrinks), so only evidence of real input
// (wheel, touch, scroll keys, a scrollbar drag) detaches. Returning to the end needs no proof.
// A reader mid-selection is left where they are, and a selection they finish detaches.
export interface StickToBottomOptions {
  // Distance in px from the end still counted as at the end: rounding and elastic overscroll
  // leave a pinned container a few px short
  threshold?: number
  // Distance in px from the end at which far_from_end turns true; one viewport by default,
  // far enough that the way back is worth a "jump to latest" button
  far_threshold?: number
  behavior?: ScrollBehavior // how following scrolls; scroll_to_end() takes its own
  // Follow DOM changes anywhere inside (appended lines, streamed text): one subtree observer.
  // Turn it off when the caller reports growth with follow() instead.
  observe_mutations?: boolean
  // Also watch each direct child's size, catching growth DOM mutations miss (an image
  // loading, a <details> opening) at the cost of one resize observation per child
  observe_children?: boolean
  // Runs after each scroll event is classified, so `stuck` is already current
  on_scroll?: (event: Event) => void
  // Runs instead of following whenever content changes size while detached, for containers
  // that hold a scroll anchor (e.g. keep the first visible item in place) themselves
  hold_position?: () => void
}

// Keys the browser scrolls a focused container with
const SCROLL_KEYS = new Set([
  `ArrowDown`,
  `ArrowUp`,
  `End`,
  `Home`,
  `PageDown`,
  `PageUp`,
  ` `,
])
// Momentum keeps scroll events coming after a gesture ends, so evidence of input reaches this
// far forward in time
const INPUT_WINDOW_MS = 800

// Reactive controller: read `stuck`, `distance`, `far_from_end` and `selecting` in templates,
// attach it to the scroll container ({@attach stick.attach}), and call `follow()` after content
// changes no observer sees. Setting `stuck` detaches or re-pins programmatically (e.g. false
// before attaching to start detached, or before jumping to a search hit). Create it anywhere:
// it installs nothing until attached.
export interface StickToBottom {
  stuck: boolean
  readonly distance: number // px left to scroll before the end
  readonly far_from_end: boolean
  readonly selecting: boolean // whether a text selection inside is pausing the follow
  attach: (node: HTMLElement) => () => void
  follow: () => void
  scroll_to_end: (scroll_behavior?: ScrollBehavior) => void
}

export const create_stick_to_bottom = (
  options: StickToBottomOptions = {},
): StickToBottom => {
  const {
    threshold = 40,
    far_threshold,
    behavior = `instant`,
    observe_mutations = true,
    observe_children = false,
    on_scroll,
    hold_position,
  } = options
  const state = $state({
    stuck: true,
    distance: 0,
    far_from_end: false,
    selecting: false,
  })
  let element: HTMLElement | null = null
  let user_scroll_until = 0
  let last_top = 0
  // Removers of the window listeners of an open press (a scrollbar drag can rest on the thumb
  // indefinitely, outliving any timed window, so it holds intent until released) and of a
  // selection. Whichever listener fires removes them all, as does teardown.
  let end_press: (() => void) | undefined
  let end_selection_listeners: (() => void) | undefined

  const listen_window = (types: string[], handler: () => void) => {
    for (const type of types) globalThis.addEventListener(type, handler)
    return () => {
      for (const type of types) globalThis.removeEventListener(type, handler)
    }
  }
  const note_user_scroll = (): void => {
    user_scroll_until = performance.now() + INPUT_WINDOW_MS
    if (element) last_top = element.scrollTop
  }
  const measure = (node: HTMLElement): number => {
    last_top = node.scrollTop
    state.distance = Math.max(0, node.scrollHeight - node.scrollTop - node.clientHeight)
    // a zero-height (hidden) container is at its end, not far from it
    state.far_from_end =
      state.distance > 0 && state.distance >= (far_threshold ?? node.clientHeight)
    return state.distance
  }
  const scroll_to_end = (scroll_behavior: ScrollBehavior = behavior): void => {
    state.stuck = true
    element?.scrollTo({ top: element.scrollHeight, behavior: scroll_behavior })
  }

  // Re-evaluates after content changed: pins when stuck, else hands over to hold_position.
  // Untracked, so calling it from an $effect subscribes that effect to nothing here.
  const follow = (): void =>
    untrack(() => {
      if (!element) return
      if (!state.stuck) hold_position?.()
      else if (!state.selecting) scroll_to_end()
      measure(element)
    })

  const handle_scroll = (event: Event): void => {
    if (!element) return
    // a move toward the end never detaches: a smooth follow passes through far positions on
    // its way, possibly inside the input window of the keystroke or flick that preceded it
    const toward_end = element.scrollTop > last_top
    if (measure(element) <= threshold) state.stuck = true
    else if (!toward_end && (end_press || performance.now() < user_scroll_until)) {
      state.stuck = false
      note_user_scroll()
    }
    on_scroll?.(event)
  }
  const release = (): void => {
    end_press?.()
    end_press = undefined
    note_user_scroll() // the flick a drag ends on coasts past the release
  }
  const handle_pointerdown = (event: PointerEvent): void => {
    // A scrollbar drag fires no wheel event and targets the container's own box
    if (event.target !== element) return
    end_press?.()
    end_press = listen_window([`pointerup`, `pointercancel`], release)
    note_user_scroll()
  }
  const handle_keydown = (event: KeyboardEvent): void => {
    if (SCROLL_KEYS.has(event.key) && !is_editable_event_target(event.target))
      note_user_scroll()
  }
  const end_selection = (): void => {
    end_selection_listeners?.()
    state.selecting = false
    if (globalThis.getSelection()?.isCollapsed === false) state.stuck = false
  }
  const handle_selectstart = (): void => {
    if (state.selecting) return
    state.selecting = true
    const types = [`pointerup`, `pointercancel`, `blur`]
    end_selection_listeners = listen_window(types, end_selection)
  }

  const attach = (node: HTMLElement): (() => void) => {
    element = node
    const listeners = new AbortController()
    const listen = { passive: true, signal: listeners.signal }
    node.addEventListener(`scroll`, handle_scroll, listen)
    node.addEventListener(`wheel`, note_user_scroll, listen)
    node.addEventListener(`touchmove`, note_user_scroll, listen)
    node.addEventListener(`pointerdown`, handle_pointerdown, listen)
    node.addEventListener(`keydown`, handle_keydown, listen)
    node.addEventListener(`selectstart`, handle_selectstart, listen)
    // The container's own box shrinks as its neighbours grow, moving the end
    const sizes = new ResizeObserver(follow)
    sizes.observe(node)
    if (observe_children) for (const child of node.children) sizes.observe(child)
    const mutations = new MutationObserver((records) => {
      for (const { target, addedNodes, removedNodes } of records) {
        if (!observe_children || target !== node) continue
        for (const removed of removedNodes)
          if (removed instanceof Element) sizes.unobserve(removed)
        for (const added of addedNodes) if (added instanceof Element) sizes.observe(added)
      }
      follow()
    })
    if (observe_mutations || observe_children) {
      const deep = observe_mutations
      mutations.observe(node, { childList: true, subtree: deep, characterData: deep })
    }
    follow()
    return () => {
      listeners.abort()
      sizes.disconnect()
      mutations.disconnect()
      // teardown mid-drag or mid-selection would otherwise leave window listeners behind
      end_press?.()
      end_selection_listeners?.()
      end_press = undefined
      state.selecting = false
      if (element === node) element = null
    }
  }

  return Object.assign(state, { attach, follow, scroll_to_end })
}
