import { MULTI_SELECT_LABELS, merge_defaults } from '$lib/labels'
import { MultiSelect } from '$lib'
import { mount, tick } from 'svelte'
import { expect, test } from 'vite-plus/test'
import { doc_query } from './index'

// Spreading a partial over the defaults keeps an explicitly-undefined key as undefined
// instead of falling back. `exactOptionalPropertyTypes` is off, so a conditional override
// — an ordinary Svelte idiom — type-checks and then renders nothing.
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

// the same hazard applies to the icon sets CopyButton and FullscreenButton merge
test(`merge_defaults guards non-label records too`, () => {
  const defaults = { ready: `copy-icon`, error: `alert-icon` }
  expect(merge_defaults(defaults, { ready: undefined })).toEqual(defaults)
  expect(merge_defaults(defaults, { ready: `custom` }).ready).toBe(`custom`)
})

// the merge runs in every component, so pin it through one of them end to end
test(`a conditionally undefined label renders the default, not nothing`, async () => {
  const translate = false // the shape of `condition ? translation : undefined`
  mount(MultiSelect, {
    target: document.body,
    props: {
      options: [`a`, `b`, `c`],
      selected: [`a`, `b`, `c`],
      maxVisibleChips: 1,
      labels: {
        more_chips: translate ? (hidden: number) => `noch ${hidden}` : undefined,
        show_less: translate ? `weniger` : undefined,
      },
    },
  })
  await tick()

  const toggle = doc_query<HTMLButtonElement>(`li.more-chip button.more-chips`)
  expect(toggle.textContent?.trim()).toBe(`+2 more`)
  toggle.click()
  await tick()
  expect(doc_query(`li.more-chip button.more-chips`).textContent?.trim()).toBe(
    `show less`,
  )
})
