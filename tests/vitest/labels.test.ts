import { MULTI_SELECT_LABELS, merge_defaults } from '$lib/labels'
import { MultiSelect } from '$lib'
import { tick } from 'svelte'
import { expect, test } from 'vitest'
import { doc_query, render } from './index'

// a plain spread keeps an explicitly-undefined key undefined instead of falling back, and
// with `exactOptionalPropertyTypes` off a conditional override type-checks yet renders ``
test.each([
  [`an explicitly undefined key falls back`, { show_less: undefined }, `show less`],
  [`a provided key wins`, { show_less: `weniger` }, `weniger`],
  [`an empty string is a real value, not a miss`, { show_less: `` }, ``],
])(`merge_defaults: %s`, (_case, overrides, expected) => {
  expect(merge_defaults(MULTI_SELECT_LABELS, overrides).show_less).toBe(expected)
})

test.each([undefined, {}])(`merge_defaults with %j keeps every default`, (overrides) => {
  expect(merge_defaults(MULTI_SELECT_LABELS, overrides)).toEqual(MULTI_SELECT_LABELS)
})

// the merge runs in every component, so pin it through one of them end to end
test(`a conditionally undefined label renders the default, not nothing`, async () => {
  const translate = false // the shape of `condition ? translation : undefined`
  render(MultiSelect, {
    options: [`a`, `b`, `c`],
    value: [`a`, `b`, `c`],
    max_visible_chips: 1,
    labels: {
      more_chips: translate ? (hidden: number) => `noch ${hidden}` : undefined,
      show_less: translate ? `weniger` : undefined,
    },
  })

  const toggle = doc_query<HTMLButtonElement>(`li.more-chip button.more-chips`)
  expect(toggle.textContent?.trim()).toBe(`+2 more`)
  toggle.click()
  await tick()
  expect(doc_query(`li.more-chip button.more-chips`).textContent?.trim()).toBe(
    `show less`,
  )
})
