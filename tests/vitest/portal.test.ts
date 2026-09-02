import { portal_action } from '$lib/portal'
import { tick } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'

function create_fixture(in_shadow_root = false) {
  const host = document.createElement(`div`)
  const home = in_shadow_root ? host.attachShadow({ mode: `open` }) : host
  const target = document.createElement(`button`)
  const node = document.createElement(`div`)
  const sibling = document.createElement(`span`)
  home.append(target, node, sibling)
  document.body.append(host)
  return { home, target, node, sibling }
}

test(`restores from a shadow root after its anchor is removed`, async () => {
  const { target, node, sibling } = create_fixture(true)
  const active_params = { active: true, open: true, target_node: target }
  node.style.color = `red`
  const action = portal_action(node, active_params)
  await tick()
  expect(node.parentElement).toBe(document.body)

  sibling.remove()
  action.update({ ...active_params, active: false })
  expect(node.previousSibling).toBe(target)
  expect(node.nextSibling).toBeNull()
  expect(node.style.cssText).toBe(`color: red;`)
  expect(node.hidden).toBe(false)
  expect(node.hasAttribute(`data-placement`)).toBe(false)

  action.update(active_params)
  await tick()
  action.destroy()
  expect(node.isConnected).toBe(false)
})

// deferring the hide to the reposition microtask would paint a stale dropdown for a frame
test(`hides synchronously when open flips false`, () => {
  const { target, node } = create_fixture()
  const action = portal_action(node, { active: true, open: true, target_node: target })
  expect(node.hidden).toBe(false)

  action.update({ active: true, open: false, target_node: target })
  expect(node.hidden).toBe(true)

  // deactivating hands visibility back to the consumer's markup. Latching the closed
  // state would stick: update() stops touching `hidden` once the node is home.
  action.update({ active: false, open: false, target_node: target })
  expect(node.hidden).toBe(false)

  action.update({ active: false, open: true, target_node: target })
  expect(node.hidden).toBe(false)
  action.destroy()
})

// target_node is positioning only: it gates visibility while portalled, not at home
test(`losing the target hides while portalled but not once deactivated`, () => {
  const { home, target, node } = create_fixture()
  const action = portal_action(node, { active: true, open: true, target_node: target })
  expect(node.hidden).toBe(false)

  // portalled with nowhere to anchor: no position to paint at
  action.update({ active: true, open: true, target_node: null })
  expect(node.hidden).toBe(true)

  // back home, an open dropdown renders inline and needs no target
  action.update({ active: false, open: true, target_node: null })
  expect(node.parentNode).toBe(home)
  expect(node.hidden).toBe(false)
  action.destroy()
})

test(`queues one positioning pass when activated by an update`, async () => {
  const { target, node } = create_fixture()
  const rect_spy = vi.spyOn(target, `getBoundingClientRect`)
  const action = portal_action(node, { active: false, open: true, target_node: target })

  action.update({ active: true, open: true, target_node: target })
  await tick()
  expect(rect_spy).toHaveBeenCalledOnce()
  action.destroy()
})

test(`destroy detaches viewport listeners and cancels queued positioning`, async () => {
  const { home, target, node } = create_fixture()
  const remove_spy = vi.spyOn(globalThis, `removeEventListener`)
  const rect_spy = vi.spyOn(target, `getBoundingClientRect`)

  // never portalled, so Svelte owns removal and the action must leave the node alone
  portal_action(node, { active: false, open: true, target_node: target }).destroy()
  expect(node.parentNode).toBe(home)
  const baseline = remove_spy.mock.calls.length

  const action = portal_action(node, { active: true, open: true, target_node: target })
  action.destroy()
  await tick()
  // scroll must be removed with capture=true or the capturing listener stays bound
  expect(
    remove_spy.mock.calls.slice(baseline).map(([type, , options]) => [type, options]),
  ).toEqual([
    [`scroll`, true],
    [`resize`, undefined],
  ])
  expect(node.isConnected).toBe(false)
  expect(rect_spy).not.toHaveBeenCalled()
})
