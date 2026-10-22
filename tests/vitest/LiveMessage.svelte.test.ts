import { LiveMessage } from '#lib'
import { flushSync, type ComponentProps } from 'svelte'
import { expect, test } from 'vite-plus/test'
import { doc_query, raw_snippet, render } from './index'

test(`stays mounted while empty and announces message changes politely`, () => {
  const props = $state<ComponentProps<typeof LiveMessage>>({ message: `` })
  render(LiveMessage, props)
  const region = doc_query(`span.sr-only`)
  expect([region.getAttribute(`aria-live`), region.textContent]).toEqual([`polite`, ``])
  props.message = `3 matches`
  flushSync()
  expect(doc_query(`span.sr-only`)).toBe(region)
  expect(region.textContent).toBe(`3 matches`)
})

test(`children take precedence and attributes pass through, aria-live included`, () => {
  render(LiveMessage, {
    message: `ignored`,
    children: raw_snippet(`<span>from children</span>`),
    'aria-live': `assertive`,
    'aria-atomic': `true`,
    class: `caller-class`,
  })
  const region = doc_query(`.sr-only.caller-class`)
  expect(region.textContent).toBe(`from children`)
  expect([`aria-live`, `aria-atomic`].map((attr) => region.getAttribute(attr))).toEqual([
    `assertive`,
    `true`,
  ])
})
