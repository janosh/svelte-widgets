import { tick } from 'svelte'
import type { PortalParams } from './types'
import { compute_position } from './utils'

type PortalActionParams = PortalParams & { open: boolean }

// MultiSelect keeps this an action wrapped by `fromAction`, so updates can toggle portalling
// without replacing the node; it also owns width matching and DOM restoration. Repositions
// after a tick so rendered dropdown content counts toward offsetHeight. No SSR guard needed:
// Svelte only runs actions on the client.
export function portal_action(node: HTMLElement, initial_params: PortalActionParams) {
  let params = initial_params
  let home_parent: ParentNode | null = null
  let home_anchor: Node | null = null

  const update_position = (): void => {
    if (!home_parent) return
    const { target_node, open, placement = `auto` } = params
    if (!target_node || !open) {
      node.hidden = true
      return
    }
    const rect = target_node.getBoundingClientRect()
    node.style.left = `${rect.left}px`
    node.style.width = `${rect.width}px`
    node.hidden = false
    const dropdown_height = node.offsetHeight
    // Only above or below: a dropdown beside its input is not a dropdown. Height 0 means
    // the list has not rendered, so nothing to fit — stay below. No shift either: the list
    // scrolls, and sliding it up would cover the input.
    const can_flip = placement === `auto` && dropdown_height > 0
    const { placement: chosen } = compute_position(
      rect,
      { width: rect.width, height: dropdown_height },
      { placement, align: `start`, flip: can_flip && [`bottom`, `top`], shift: false },
    )
    if (chosen === `top`) {
      // oxlint-disable-next-line unicorn/prefer-number-coercion -- computed CSS lengths include units
      const margin_top = Number.parseFloat(getComputedStyle(node).marginTop) || 0
      node.style.top = `${Math.max(0, rect.top - dropdown_height - margin_top)}px`
    } else node.style.top = `${rect.bottom}px`
    node.dataset.placement = chosen
  }

  const reposition = () => {
    if (params.open && params.target_node) void tick().then(update_position)
    else node.hidden = true
  }

  const stop_tracking_viewport = () => {
    globalThis.removeEventListener(`scroll`, update_position, true)
    globalThis.removeEventListener(`resize`, update_position)
  }

  const activate = () => {
    if (home_parent || !node.isConnected) return
    home_parent = node.parentNode
    home_anchor = node.nextSibling
    document.body.append(node)
    node.style.position = `fixed`
    globalThis.addEventListener(`scroll`, update_position, true)
    globalThis.addEventListener(`resize`, update_position)
  }

  const deactivate = () => {
    if (!home_parent) return
    stop_tracking_viewport()
    // insertBefore handles missing/stale anchors; Node.before is absent from native previews.
    // oxlint-disable-next-line unicorn/prefer-modern-dom-apis
    home_parent.insertBefore(
      node,
      home_anchor?.parentNode === home_parent ? home_anchor : null,
    )
    for (const property of [`position`, `left`, `top`, `width`]) {
      node.style.removeProperty(property)
    }
    delete node.dataset.placement
    // hand visibility back to the consumer's CSS: update() won't re-sync once home
    node.hidden = false
    home_parent = null
    home_anchor = null
  }

  if (initial_params.active) {
    activate()
    reposition()
  }

  return {
    update(next_params: PortalActionParams) {
      params = next_params
      if (params.active && !home_parent) activate()
      else if (!params.active && home_parent) deactivate()
      if (home_parent) reposition()
    },
    destroy() {
      if (!home_parent) return
      stop_tracking_viewport()
      home_parent = null
      home_anchor = null
      node.remove()
    },
  }
}
