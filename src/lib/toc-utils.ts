const flash_timeouts = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>()
const scroll_overrides = new WeakMap<
  CSSStyleDeclaration,
  {
    value: string
    priority: string
    requests: Map<symbol, ScrollBehavior>
  }
>()

// The latest active TOC owns root scrolling; the last release restores the authored CSS.
export function override_scroll_behavior(
  style: CSSStyleDeclaration,
  behavior: ScrollBehavior,
) {
  let state = scroll_overrides.get(style)
  if (!state) {
    state = {
      value: style.getPropertyValue(`scroll-behavior`),
      priority: style.getPropertyPriority(`scroll-behavior`),
      requests: new Map(),
    }
    scroll_overrides.set(style, state)
  }
  const owner = Symbol(`toc-scroll`)
  const { requests, value, priority } = state
  requests.set(owner, behavior)
  style.setProperty(`scroll-behavior`, behavior, priority)
  return () => {
    if (!requests.delete(owner)) return
    style.setProperty(`scroll-behavior`, [...requests.values()].at(-1) ?? value, priority)
    if (!requests.size) scroll_overrides.delete(style)
  }
}

export function flash_toc_target(node: HTMLElement, duration = 1500): void {
  clearTimeout(flash_timeouts.get(node))
  node.classList.remove(`toc-clicked`)
  node.style.setProperty(`--toc-flash-duration`, `${duration}ms`)
  // Restart the same animation when a reader clicks the target again before it finishes.
  void node.offsetWidth
  node.classList.add(`toc-clicked`)
  flash_timeouts.set(
    node,
    setTimeout(() => {
      node.classList.remove(`toc-clicked`)
      node.style.removeProperty(`--toc-flash-duration`)
      flash_timeouts.delete(node)
    }, duration),
  )
}

export function get_heading_visibility(
  levels: readonly number[],
  active_idx: number | null,
  collapse_threshold: number,
): boolean[] {
  if (active_idx === null) return levels.map(() => true)

  const min_level = levels.reduce((minimum, level) => Math.min(minimum, level), Infinity)
  const expanded = levels.map(() => false)

  if (active_idx !== -1) {
    expanded[active_idx] = true
    let need = levels[active_idx]
    for (let idx = active_idx - 1; idx >= 0 && need > min_level; idx--) {
      if (levels[idx] < need) {
        expanded[idx] = true
        need = levels[idx]
      }
    }
  }

  const visible: boolean[] = []
  const ancestors: number[] = []
  let threshold_ancestor = -1
  for (let idx = 0; idx < levels.length; idx++) {
    const level = levels[idx]
    while (ancestors.length && levels[ancestors[ancestors.length - 1]] >= level)
      ancestors.pop()
    const parent_idx = ancestors.at(-1)

    if (level === min_level) {
      visible.push(true)
    } else if (level <= collapse_threshold) {
      visible.push(parent_idx === undefined || expanded[parent_idx])
    } else {
      visible.push(
        threshold_ancestor < 0 ||
          levels[threshold_ancestor] < collapse_threshold ||
          visible[threshold_ancestor],
      )
    }
    ancestors.push(idx)
    if (level <= collapse_threshold) threshold_ancestor = idx
  }

  return visible
}
