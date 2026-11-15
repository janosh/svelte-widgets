import { ShortcutsList } from '#lib'
import type { ShortcutEntry } from '#lib'
import { flushSync } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'
import { doc_query, render } from './index'

const text = (node: Element) => node.textContent?.replaceAll(/\s+/g, ` `).trim()

// keys render through format_shortcut (alternatives joined by ` / `), keys_label verbatim
test.each<[string, ShortcutEntry, string[]]>([
  [`single chord`, { keys: `Escape`, label: `Close` }, [`Esc`]],
  [`modifier chord`, { keys: `ctrl+shift+p`, label: `Palette` }, [`Ctrl+⇧+P`]],
  [
    `alternatives`,
    { keys: [`ArrowLeft`, `Control+ArrowLeft`], label: `Back` },
    [`←`, `Ctrl+←`],
  ],
  [
    `keys_label`,
    { keys: [`Control`, `Meta`], keys_label: `⌘/Ctrl + scroll`, label: `Zoom` },
    [`⌘/Ctrl + scroll`],
  ],
])(`%s`, (_name, entry, kbds) => {
  render(ShortcutsList, { shortcuts: [entry] })
  const kbd_texts = [...document.querySelectorAll(`dt kbd`)].map(text)
  expect(kbd_texts).toEqual(kbds)
  expect(text(doc_query(`dt`))).toBe(kbds.join(` / `))
  expect(doc_query(`dd`).textContent).toBe(entry.label)
})

test(`mod renders as the platform's primary modifier`, () => {
  vi.stubGlobal(`navigator`, { userAgent: `Macintosh` })
  try {
    render(ShortcutsList, { shortcuts: [{ keys: `mod+k`, label: `Search` }] })
    expect(text(doc_query(`dt kbd`))).toBe(`⌘+K`)
  } finally {
    vi.unstubAllGlobals()
  }
})

test(`collapsed by default, keeps row order, takes summary, class and bind:open`, () => {
  const shortcuts = [
    { keys: `r`, label: `Reset camera` },
    { keys: `f`, label: `Toggle fullscreen` },
  ]
  render(ShortcutsList, { shortcuts, summary: `Keys`, class: `extra` })
  const details = doc_query<HTMLDetailsElement>(`details.shortcuts-list.extra`)
  expect(details.open).toBe(false)
  expect(doc_query(`summary`).textContent).toBe(`Keys`)
  expect([...details.querySelectorAll(`dd`)].map(text)).toEqual([
    `Reset camera`,
    `Toggle fullscreen`,
  ])
  document.body.innerHTML = ``

  render(ShortcutsList, { shortcuts, open: true })
  expect(doc_query<HTMLDetailsElement>(`details`).open).toBe(true)
  expect(doc_query(`summary`).textContent).toBe(`Keyboard shortcuts`)
  flushSync()
})
