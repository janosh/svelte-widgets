import {
  apply_weights_param,
  bool_from_param,
  bool_url_entry,
  sync_url_params,
  url_with_params,
  valid_query_param,
  weights_to_param,
  type WeightsConfig,
} from '#lib/browser/index.ts'
import { sort_from_param, sort_url_entry, type TableSort } from '#lib/table/index.ts'
import { expect, expectTypeOf, test, vi } from 'vite-plus/test'

test.each([
  [``, false, false],
  [`flag=1`, false, true],
  [``, true, true],
  [`flag=0`, true, false],
] as const)(`bool_from_param(%s, fallback=%s) is %s`, (query, fallback, expected) => {
  const params = new URLSearchParams(query)
  expect(bool_from_param(params, `flag`, fallback)).toBe(expected)
  // read-only views (e.g. SvelteKit's page.url.searchParams) only need get()
  const read_only = { get: (key: string) => params.get(key) }
  expect(bool_from_param(read_only, `flag`, fallback)).toBe(expected)
  expect(valid_query_param(read_only, `flag`, `none`)).toBe(
    query ? query.slice(5) : `none`,
  )
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
    for (const value of [`invalid`, `toString`, `__proto__`]) {
      expect(
        valid_query_param(new URLSearchParams({ filter: value }), `filter`, `all`, valid),
      ).toBe(`all`)
    }
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

const default_sort: TableSort[] = [{ column: `force`, dir: `desc` }]
const energy_asc: TableSort = { column: `energy`, dir: `asc` }
const force_desc: TableSort = { column: `force`, dir: `desc` }
const force_asc: TableSort = { column: `force`, dir: `asc` }
const stress_desc: TableSort = { column: `stress`, dir: `desc` }

test.each([
  [`sort=energy`, undefined, [energy_asc]],
  [`sort=-energy,force`, undefined, [{ column: `energy`, dir: `desc` }, force_asc]],
  [
    `sort=-stress,energy,-force`,
    new Set([`energy`, `force`, `stress`]),
    [stress_desc, energy_asc, force_desc],
  ],
  [`sort=`, undefined, []],
  [``, undefined, default_sort],
  [`dir=asc`, undefined, default_sort],
  [`sort=-`, undefined, default_sort],
  [`sort=--energy`, undefined, default_sort],
  [`sort=energy,,force`, undefined, default_sort],
  [`sort=energy,`, undefined, default_sort],
  [`sort=energy,-energy`, undefined, default_sort],
  [`sort=energy`, new Set<string>(), default_sort],
  [`sort=energy,unknown`, new Set([`energy`, `force`]), default_sort],
] as const)(`sort_from_param(%s, valid=%o)`, (query, valid_columns, expected) => {
  const sort = sort_from_param(new URLSearchParams(query), default_sort, valid_columns)
  expect(sort).toEqual(expected)
})

test.each([
  [[force_desc], `/`],
  [[], `/?sort=`],
  [[energy_asc], `/?sort=energy`],
  [[force_asc], `/?sort=force`],
  [[stress_desc, energy_asc, force_desc], `/?sort=-stress,energy,-force`],
  [[{ column: `κ_SRME`, dir: `asc` }], `/?sort=%CE%BA_SRME`],
  [
    [
      { column: `Run Time (discovery)`, dir: `desc` },
      { column: `κ_SRME`, dir: `asc` },
    ],
    `/?sort=-Run+Time+%28discovery%29,%CE%BA_SRME`,
  ],
] as const)(`sort_url_entry(%o) round-trips via %s`, (sort, expected_url) => {
  const entry = sort_url_entry(sort, default_sort)
  const url = url_with_params([entry], new URL(`https://example.com/`))
  expect(url).toBe(expected_url)
  const params = new URL(`https://example.com${url}`).searchParams
  expect(sort_from_param(params, default_sort)).toEqual(sort)
})

test(`sort_from_param returns copies of the default entries`, () => {
  const [entry] = sort_from_param(new URLSearchParams(`sort=-`), default_sort)
  entry.dir = `asc`
  expect(default_sort).toEqual([force_desc])
  expect(force_desc.dir).toBe(`desc`)
})

test(`sort_url_entry omits an empty sort when it is the default`, () => {
  expect(sort_url_entry([], [])).toEqual([`sort`, ``, ``])
  expect(sort_from_param(new URLSearchParams(), [])).toEqual([])
})

test.each([``, `-energy`, `a,b`])(`sort_url_entry rejects column id %j`, (column) => {
  expect(() => sort_url_entry([{ column, dir: `asc` }], default_sort)).toThrow(
    `can't be a URL param`,
  )
  expect(() => sort_url_entry([], [{ column, dir: `asc` }])).toThrow(
    `can't be a URL param`,
  )
})

const make_weights = (weights: number[]): WeightsConfig => ({
  energy: { weight: weights[0] },
  force: { weight: weights[1] },
  stress: { weight: weights[2] },
})
const make_reversed_weights = (weights: number[]): WeightsConfig =>
  Object.fromEntries(Object.entries(make_weights(weights)).toReversed())
const default_weights = make_weights([0.5, 0.4, 0.1])

test.each([
  [`default weights`, make_weights([0.5, 0.4, 0.1]), ``],
  [`non-default weights`, make_weights([0.7, 0.2, 0.1]), `0.7,0.2,0.1`],
  [`full precision`, make_weights([1 / 3, 0.5, 1 / 6]), `${1 / 3},0.5,${1 / 6}`],
  [`reversed config keys`, make_reversed_weights([0.7, 0.2, 0.1]), `0.7,0.2,0.1`],
] as const)(`weights_to_param serializes %s`, (_case_name, config, expected) => {
  expect(weights_to_param(config, default_weights)).toBe(expected)
})

test(`full-precision weights round-trip exactly`, () => {
  const weights = [1 / 6, 2 / 3, 1 / 6] // sums to 1 - 1.1e-16; dividing would shift each by an ulp
  const param = weights_to_param(make_weights(weights), default_weights)
  const config = make_weights([0.2, 0.3, 0.5])
  apply_weights_param(param, config, default_weights)
  expect(Object.values(config).map(({ weight }) => weight)).toStrictEqual(weights)
})

test.each([
  [`missing`, { energy: { weight: 0.5 }, force: { weight: 0.5 } }],
  [`extra`, { ...make_weights([0.5, 0.4, 0.1]), other: { weight: 0 } }],
])(`weight parameter helpers reject %s keys`, (_case_name, config) => {
  const message = `Weight config keys must exactly match defaults: energy, force, stress`
  expect(() => weights_to_param(config, default_weights)).toThrow(message)
  expect(() => apply_weights_param(null, config, default_weights)).toThrow(message)
})

test.each([
  [`0.7,0.2,0.1`, [0.7, 0.2, 0.1]],
  [`2,1,1`, [0.5, 0.25, 0.25]],
  [`0.5,,0.5`, [0.5, 0.4, 0.1]],
  [`0.5,0.5`, [0.5, 0.4, 0.1]],
  [`-1,1,1`, [0.5, 0.4, 0.1]],
  [`0,0,0`, [0.5, 0.4, 0.1]],
  [`1e308,1e308,1`, [0.5, 0.4, 0.1]],
  [`Infinity,1,1`, [0.5, 0.4, 0.1]],
  [`a,1,1`, [0.5, 0.4, 0.1]],
  [` `, [0.5, 0.4, 0.1]],
  [` 1 ,1,1`, [0.5, 0.4, 0.1]],
  [`0x10,1,1`, [0.5, 0.4, 0.1]],
  [`1e-1,.2,5.`, [0.1 / 5.3, 0.2 / 5.3, 5 / 5.3]],
  [null, [0.5, 0.4, 0.1]],
] as const)(`apply_weights_param(%s)`, (param, expected) => {
  const config = make_weights([0.2, 0.3, 0.5])
  apply_weights_param(param, config, default_weights)
  for (const [idx, { weight }] of Object.values(config).entries()) {
    expect(weight).toBeCloseTo(expected[idx], 10)
  }
  expect(default_weights).toEqual(make_weights([0.5, 0.4, 0.1]))
})

test(`apply_weights_param refuses a shallow copy of the defaults`, () => {
  expect(() =>
    apply_weights_param(`1,1,1`, { ...default_weights }, default_weights),
  ).toThrow(`must not share entries`)
})

test.each([NaN, -0.1, Infinity])(`weights_to_param rejects weight %s`, (weight) => {
  expect(() =>
    weights_to_param(make_weights([weight, 0.4, 0.1]), default_weights),
  ).toThrow(`Weights must be finite and non-negative: energy`)
})

test(`apply_weights_param uses canonical order for reversed config`, () => {
  const config = make_reversed_weights([0.2, 0.3, 0.5])
  apply_weights_param(`0.7,0.2,0.1`, config, default_weights)
  expect(Object.keys(config)).toEqual([`stress`, `force`, `energy`])
  expect(config.energy.weight).toBeCloseTo(0.7)
  expect(config.force.weight).toBeCloseTo(0.2)
  expect(config.stress.weight).toBeCloseTo(0.1)
})
