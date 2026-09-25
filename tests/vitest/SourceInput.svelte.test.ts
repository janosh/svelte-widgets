import SourceInput from '$site/SourceInput.svelte'
import { default_highlighter } from '$lib/highlight'
import { tick } from 'svelte'
import { expect, test, vi } from 'vitest'
import { doc_query, render } from './index'

test(`source input highlights edits without changing the editable text and synchronizes scrolling`, async () => {
  render(SourceInput, {
    value: `const count: number = 1`,
    language: `ts`,
    label: `Example source`,
  })
  const input = doc_query<HTMLTextAreaElement>(`textarea`)
  const preview = doc_query(`.preview`)
  await default_highlighter.ready()
  await vi.waitFor(() =>
    expect(preview.querySelector(`.pl-k`)?.textContent).toBe(`const`),
  )
  expect(input.getAttribute(`aria-label`)).toBe(`Example source`)
  expect(preview.getAttribute(`aria-hidden`)).toBe(`true`)
  expect(preview.hasAttribute(`inert`)).toBe(true)
  input.value = `let title = "<img src=x onerror=alert(1)>"\n`
  input.dispatchEvent(new Event(`input`, { bubbles: true }))
  await tick()
  await vi.waitFor(() => expect(preview.querySelector(`.pl-k`)?.textContent).toBe(`let`))
  expect(preview.querySelector(`code`)?.textContent).toBe(`${input.value}\n`)
  expect(preview.querySelector(`img`)).toBeNull()
  input.scrollTop = 30
  input.scrollLeft = 50
  input.dispatchEvent(new Event(`scroll`))
  expect(preview.scrollTop).toBe(30)
  expect(preview.scrollLeft).toBe(50)
})
