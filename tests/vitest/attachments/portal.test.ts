import { portal } from '$lib/attachments'
import { describe, expect, it } from 'vitest'
import { create_element } from '../index'

describe(`portal`, () => {
  // home has siblings on both sides, so restoring to the wrong index is visible
  const setup = () => {
    const [home, target] = [create_element(), create_element()]
    const node = document.createElement(`b`)
    home.append(document.createElement(`i`), node, document.createElement(`u`))
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
      expect(home.innerHTML).toBe(`<i></i><b></b><u></u>`) // not re-appended after <u>
    },
  )

  // Svelte tears a destroyed block's DOM down before running teardown. The node can only
  // be in home or target, so home's markup and an empty target pin where it ended up.
  type TearDown = (fixture: ReturnType<typeof setup>) => void
  it.each<[string, TearDown, string]>([
    [
      `removes the node when its anchor is gone`,
      ({ home }) => home.replaceChildren(),
      ``,
    ],
    [
      `does not resurrect a node its block removed`,
      ({ node }) => node.remove(),
      `<i></i><u></u>`,
    ],
    // whole subtree detached, anchor still marks the spot inside it
    [
      `restores into a detached home`,
      ({ home }) => home.remove(),
      `<i></i><b></b><u></u>`,
    ],
  ])(`%s`, (_desc, tear_down, home_html) => {
    const fixture = setup()
    const cleanup = portal(fixture.target)(fixture.node)

    tear_down(fixture)
    cleanup?.()
    expect(fixture.home.innerHTML).toBe(home_html)
    expect(fixture.target.childNodes).toHaveLength(0)
  })
})
