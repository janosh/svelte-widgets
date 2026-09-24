import { portal_action } from '$lib/portal'
import { tick } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vitest'

// `active` holds params that portal an open dropdown under `target`
const create_fixture = (in_shadow_root = false) => {
  const host = document.createElement(`div`)
  const home = in_shadow_root ? host.attachShadow({ mode: `open` }) : host
  const [target, node, sibling] = [`button`, `div`, `span`].map((tag) =>
    document.createElement(tag),
  )
  home.append(target, node, sibling)
  document.body.append(host)
  const active = { active: true, open: true, target_node: target }
  return { home, target, node, sibling, active }
}
const next_frame = () => new Promise(requestAnimationFrame)

test(`restores from a shadow root after its anchor is removed`, async () => {
  const { target, node, sibling, active } = create_fixture(true)
  node.style.color = `red`
  const action = portal_action(node, active)
  await tick()
  expect(node.parentElement).toBe(document.body)

  sibling.remove()
  action.update({ ...active, active: false })
  expect([node.previousSibling, node.nextSibling]).toEqual([target, null])
  expect(node.style.cssText).toBe(`color: red;`)
  expect(node.hidden).toBe(false)
  expect(node.hasAttribute(`data-placement`)).toBe(false)

  action.update(active)
  await tick()
  action.destroy()
  expect(node.isConnected).toBe(false)
})

// while portalled, a closed dropdown or one with no target has no position to paint at, so
// it hides at once: deferring to the reposition microtask would paint a stale frame. Once
// home, visibility is the consumer's markup again, and latching `hidden` would stick since
// update() stops touching it there.
test.each([
  [`closing`, { open: false }],
  [`losing the target`, { target_node: null }],
])(`%s hides while portalled but not once deactivated`, (_desc, hiding) => {
  const { home, node, active } = create_fixture()
  const action = portal_action(node, active)
  expect(node.hidden).toBe(false)

  action.update({ ...active, ...hiding })
  expect(node.hidden).toBe(true)

  action.update({ ...active, ...hiding, active: false })
  expect([node.parentNode, node.hidden]).toEqual([home, false])
  action.update({ ...active, active: false })
  expect(node.hidden).toBe(false)
  action.destroy()
})

test(`queues one positioning pass when activated by an update`, async () => {
  const { target, node, active } = create_fixture()
  const rect_spy = vi.spyOn(target, `getBoundingClientRect`)
  const action = portal_action(node, { ...active, active: false })

  action.update(active)
  await tick()
  expect(rect_spy).toHaveBeenCalledOnce()
  action.destroy()
})

test(`destroy detaches viewport listeners and cancels queued positioning`, async () => {
  const { home, target, node, active } = create_fixture()
  const rect_spy = vi.spyOn(target, `getBoundingClientRect`)

  // never portalled, so Svelte owns removal and the action must leave the node alone
  portal_action(node, { ...active, active: false }).destroy()
  expect(node.parentNode).toBe(home)

  portal_action(node, active).destroy()
  await tick()
  globalThis.dispatchEvent(new Event(`scroll`))
  globalThis.dispatchEvent(new Event(`resize`))
  await next_frame()
  expect(node.isConnected).toBe(false)
  expect(rect_spy).not.toHaveBeenCalled()
})

test(`tracks dropdown and anchor resizing and releases observers when deactivated`, async () => {
  const callbacks = new Map<Element, () => void>()
  vi.stubGlobal(
    `ResizeObserver`,
    class implements ResizeObserver {
      private readonly targets = new Set<Element>()
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.targets.add(target)
        callbacks.set(target, () => this.callback([], this))
      }
      unobserve(target: Element) {
        callbacks.delete(target)
      }
      disconnect() {
        for (const target of this.targets) callbacks.delete(target)
      }
    },
  )
  onTestFinished(() => void vi.unstubAllGlobals())
  const { target, node, active } = create_fixture()
  const rect_spy = vi.spyOn(target, `getBoundingClientRect`)
  rect_spy.mockReturnValue(new DOMRect(20, 300, 200, 30))
  let dropdown_height = 100
  vi.spyOn(node, `offsetHeight`, `get`).mockImplementation(() => dropdown_height)
  const params = { ...active, placement: `top` as const }
  const action = portal_action(node, params)
  await tick()
  expect(node.style.top).toBe(`200px`)

  dropdown_height = 200
  callbacks.get(node)?.()
  await next_frame()
  expect(node.style.top).toBe(`100px`)

  rect_spy.mockReturnValue(new DOMRect(20, 300, 300, 50))
  callbacks.get(target)?.()
  await next_frame()
  expect(node.style.width).toBe(`300px`)
  action.update({ ...params, active: false })
  expect(callbacks.size).toBe(0)
  action.destroy()
})
