import {
  bool_from_param,
  bool_url_entry,
  sync_url_params,
  url_with_params,
  valid_query_param,
} from '$lib/url-params'
import { expect, expectTypeOf, test, vi } from 'vite-plus/test'

test.each([
  [``, false, false],
  [`flag=1`, false, true],
  [``, true, true],
  [`flag=0`, true, false],
] as const)(`bool_from_param(%s, fallback=%s) is %s`, (query, fallback, expected) => {
  expect(bool_from_param(new URLSearchParams(query), `flag`, fallback)).toBe(expected)
})

test.each([
  [true, false, [`flag`, `1`]],
  [false, false, [`flag`, ``]],
  [false, true, [`flag`, `0`]],
  [true, true, [`flag`, ``]],
] as const)(`bool_url_entry(value=%s, fallback=%s)`, (value, fallback, expected) => {
  expect(bool_url_entry(`flag`, value, fallback)).toEqual(expected)
})

test(`valid_query_param infers allowed set members and record keys`, () => {
  const params = new URLSearchParams(`sort=energy`)
  expect(valid_query_param(new URLSearchParams(`sort=`), `sort`, `force`)).toBe(`force`)
  const valid_values = { force: 0, energy: 1 }
  const unvalidated = valid_query_param(params, `sort`, `force`)
  const set_like_validated = valid_query_param(params, `sort`, `force`, valid_values)
  const narrowed = valid_query_param(
    params,
    `sort`,
    `force`,
    new Set<`energy` | `force`>([`energy`, `force`]),
  )
  expectTypeOf(unvalidated).toEqualTypeOf<string>()
  expectTypeOf(narrowed).toEqualTypeOf<`energy` | `force`>()
  expectTypeOf(set_like_validated).toEqualTypeOf<`energy` | `force`>()
  const numeric_key = valid_query_param(new URLSearchParams(`key=42`), `key`, `none`, {
    42: true,
  })
  expectTypeOf(numeric_key).toEqualTypeOf<`42` | `none`>()
  expect(numeric_key).toBe(`42`)
  expect([unvalidated, set_like_validated, narrowed]).toEqual([
    `energy`,
    `energy`,
    `energy`,
  ])
  expect(
    valid_query_param(params, `sort`, `force`, { has: () => false, energy: 1 }),
  ).toBe(`energy`)
  const empty = new URL(
    `https://example.com${url_with_params([[`filter`, ``, `all`]], new URL(`https://example.com/`))}`,
  )
  for (const valid of [new Set([``, `all`]), { '': true, all: true }]) {
    expect(valid_query_param(empty.searchParams, `filter`, `all`, valid)).toBe(``)
    expect(valid_query_param(new URLSearchParams(), `filter`, `all`, valid)).toBe(`all`)
  }
})

test(`URL entries preserve unrelated params, commas, and hashes`, () => {
  const current_url = new URL(`https://example.com/tasks/md?keep=1&drop=default#results`)
  expect(
    url_with_params(
      [
        [`weights`, `0.6,0.3,0.1`],
        [`drop`, `default`, `default`],
      ],
      current_url,
    ),
  ).toBe(`/tasks/md?keep=1&weights=0.6,0.3,0.1#results`)
  expect(
    url_with_params(
      [[`drop`, `default`, `default`]],
      new URL(`https://example.com/tasks/md?drop=default#results`),
    ),
  ).toBe(`/tasks/md#results`)
})

test(`sync_url_params writes only semantic URL changes`, () => {
  const write_url = vi.fn()
  const current_url = new URL(`https://example.com/tasks/md?sort=force`)
  sync_url_params([[`sort`, `force`]], current_url, write_url)
  sync_url_params([[`sort`, `energy`]], current_url, write_url)
  expect(write_url.mock.calls).toEqual([[`/tasks/md?sort=energy`]])

  write_url.mockClear()
  const encoded_url = new URL(`https://example.com/?weights=0.5%2C0.4%2C0.1`)
  sync_url_params([[`weights`, `0.5,0.4,0.1`]], encoded_url, write_url)
  expect(write_url).not.toHaveBeenCalled()
})
