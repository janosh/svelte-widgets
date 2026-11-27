import {
  format_shortcut_keys,
  shortcut_attrs,
  shortcut_entries,
  shortcuts_in_scopes,
} from '#lib/shortcuts.ts'
import type { Shortcut } from '#lib/shortcuts.ts'
import { describe, expect, test } from 'vite-plus/test'

const reset: Shortcut = { keys: `R`, description: `Reset camera`, scopes: [`camera`] }
const first: Shortcut = {
  keys: `Home Control+ArrowLeft`,
  description: `First frame`,
  scopes: [`sequence`],
}
const jump: Shortcut = {
  keys: `0 1 2`,
  label: `0-2`,
  description: `Jump`,
  scopes: [`sequence`, `camera`],
}

describe(`shortcut registry helpers`, () => {
  test.each([
    [reset, `R`],
    [first, `Home / Ctrl+←`],
    [{ ...reset, keys: `- +` }, `- / +`],
    [{ ...reset, keys: `Escape Shift+V` }, `Esc / ⇧+V`],
    [jump, `0-2`],
  ])(`format_shortcut_keys(%j) is %s`, (shortcut, expected) => {
    expect(format_shortcut_keys(shortcut)).toBe(expected)
  })

  test(`shortcut_attrs gives aria-keyshortcuts and a title naming the keys`, () => {
    expect(shortcut_attrs(reset)).toEqual({
      'aria-keyshortcuts': `R`,
      title: `Reset camera (R)`,
    })
    expect(shortcut_attrs(first, `Rewind`).title).toBe(`Rewind (Home / Ctrl+←)`)
  })

  test(`shortcut_entries maps to ShortcutsList rows`, () => {
    expect(shortcut_entries([first, jump])).toEqual([
      {
        keys: [`Home`, `Control+ArrowLeft`],
        label: `First frame`,
        keys_label: undefined,
      },
      { keys: [`0`, `1`, `2`], label: `Jump`, keys_label: `0-2` },
    ])
  })

  test.each([
    [
      [`camera`, `camera`],
      [reset, jump],
    ],
    [[`sequence`], [first, jump]],
    [[`nope`], []],
    [[], []],
  ])(`shortcuts_in_scopes(%j) keeps input order, each once`, (scopes, expected) => {
    expect(shortcuts_in_scopes([reset, first, jump], scopes)).toEqual(expected)
  })
})
