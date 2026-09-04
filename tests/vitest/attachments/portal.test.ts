import { portal } from '$lib/attachments'
import { describe, expect, it } from 'vitest'
import { create_element } from '../index'

describe(`portal`, () => {
  // home has siblings on both sides, so restoring to the wrong index is visible
  const setup = () => {
    const [home, target] = [create_element(), create_element()]
    const [before, node, after] = [
      document.createElement(`i`),
      document.createElement(`b`),
      document.createElement(`u`),
    ]
    home.append(before, node, after)
    return { home, target, node }
  }

  it(`moves the node into the target and restores its position on teardown`, () => {
    const { home, target, node } = setup()

    const cleanup = portal(target)(node)

    expect(node.parentElement).toBe(target)
    expect(home.innerHTML).toBe(`<i></i><!--portal--><u></u>`) // anchor holds the spot
    home.append(document.createElement(`s`))

    cleanup?.()
    expect(node.parentElement).toBe(home)
    expect(home.innerHTML).toBe(`<i></i><b></b><u></u><s></s>`)
    expect(target.childNodes).toHaveLength(0)
  })

  it.each([`null`, `undefined`, `already the parent`] as const)(
    `a %s target leaves the node where it is`,
    (kind) => {
      const { home, node } = setup()
      const target = { null: null, undefined, 'already the parent': home }[kind]

      expect(portal(target)(node)).toBeUndefined()
      expect(node.parentElement).toBe(home)
      expect(home.innerHTML).toBe(`<i></i><b></b><u></u>`) // not re-appended after <u>
    },
  )

  it(`removes the node instead of stranding it when its anchor is gone`, () => {
    const { home, target, node } = setup()
    const cleanup = portal(target)(node)

    home.innerHTML = `` // the block that owned the node tore its markup down
    cleanup?.()

    expect(node.parentElement).toBeNull()
    expect(target.childNodes).toHaveLength(0)
  })

  it(`does not resurrect a node its block already removed`, () => {
    const { home, target, node } = setup()
    const cleanup = portal(target)(node)

    node.remove() // Svelte tears the block's DOM down before running teardown
    cleanup?.()

    expect(node.parentElement).toBeNull()
    expect(home.innerHTML).toBe(`<i></i><u></u>`) // anchor gone too
  })

  it(`restores into a detached home rather than dropping the node`, () => {
    const { home, target, node } = setup()
    const cleanup = portal(target)(node)

    home.remove() // whole subtree detached, anchor still marks the spot inside it
    cleanup?.()

    expect(node.parentElement).toBe(home)
    expect(target.childNodes).toHaveLength(0)
  })
})
