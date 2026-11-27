import {
  bool_from_param,
  bool_url_entry,
  numbers_from_param,
  numbers_url_entry,
  sync_url_params,
  url_with_params,
  string_from_param,
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
  expect(string_from_param(read_only, `flag`, `none`)).toBe(
    query ? query.slice(5) : `none`,
  )
})

test.each([
  [true, false, `/?flag=1`],
  [false, false, `/`],
  [false, true, `/?flag=0`],
  [true, true, `/`],
] as const)(`bool_url_entry(value=%s, fallback=%s) writes %s`, (value, fallback, url) => {
  const entry = bool_url_entry(`flag`, value, fallback)
  expect(url_with_params([entry], new URL(`https://example.com/?flag=1`))).toBe(url)
  expect(
    bool_from_param(new URL(`https://example.com${url}`).searchParams, `flag`, fallback),
  ).toBe(value)
})

test(`string_from_param infers allowed set members and record keys`, () => {
  const params = new URLSearchParams(`sort=energy`)
  expect(string_from_param(new URLSearchParams(`sort=`), `sort`, `force`)).toBe(`force`)
  const valid_values = { force: 0, energy: 1 }
  const unvalidated = string_from_param(params, `sort`, `force`)
  const set_like_validated = string_from_param(params, `sort`, `force`, valid_values)
  const narrowed = string_from_param(
    params,
    `sort`,
    `force`,
    new Set<`energy` | `force`>([`energy`, `force`]),
  )
  expectTypeOf(unvalidated).toEqualTypeOf<string>()
  expectTypeOf(narrowed).toEqualTypeOf<`energy` | `force`>()
  expectTypeOf(set_like_validated).toEqualTypeOf<`energy` | `force`>()
  const numeric_key = string_from_param(new URLSearchParams(`key=42`), `key`, `none`, {
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
    string_from_param(params, `sort`, `force`, { has: () => false, energy: 1 }),
  ).toBe(`energy`)
  const empty = new URL(
    `https://example.com${url_with_params([[`filter`, ``, `all`]], new URL(`https://example.com/`))}`,
  )
  for (const valid of [new Set([``, `all`]), { '': true, all: true }]) {
    expect(string_from_param(empty.searchParams, `filter`, `all`, valid)).toBe(``)
    expect(string_from_param(new URLSearchParams(), `filter`, `all`, valid)).toBe(`all`)
    for (const value of [`invalid`, `toString`, `__proto__`]) {
      expect(
        string_from_param(new URLSearchParams({ filter: value }), `filter`, `all`, valid),
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
  const sort = sort_from_param(
    new URLSearchParams(query),
    `sort`,
    default_sort,
    valid_columns,
  )
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
  const entry = sort_url_entry(`sort`, sort, default_sort)
  const url = url_with_params([entry], new URL(`https://example.com/`))
  expect(url).toBe(expected_url)
  const params = new URL(`https://example.com${url}`).searchParams
  expect(sort_from_param(params, `sort`, default_sort)).toEqual(sort)
})

test(`sort_from_param returns copies of the default entries`, () => {
  const [entry] = sort_from_param(new URLSearchParams(`sort=-`), `sort`, default_sort)
  entry.dir = `asc`
  expect(default_sort).toEqual([force_desc])
  expect(force_desc.dir).toBe(`desc`)
})

test(`sort_url_entry omits an empty sort when it is the default`, () => {
  expect(sort_url_entry(`sort`, [], [])).toEqual([`sort`, ``, ``])
  expect(sort_from_param(new URLSearchParams(), `sort`, [])).toEqual([])
})

test(`sort helpers take a custom key so two tables can share a URL`, () => {
  const entry = sort_url_entry(`models_sort`, [energy_asc], default_sort)
  expect(entry).toEqual([`models_sort`, `energy`, `-force`])
  const params = new URLSearchParams(`sort=-stress&models_sort=energy`)
  expect(sort_from_param(params, `models_sort`, default_sort)).toEqual([energy_asc])
  expect(sort_from_param(params, `sort`, default_sort)).toEqual([stress_desc])
})

test.each([``, `-energy`, `a,b`])(`sort_url_entry rejects column id %j`, (column) => {
  expect(() => sort_url_entry(`sort`, [{ column, dir: `asc` }], default_sort)).toThrow(
    `can't be a URL param`,
  )
  expect(() => sort_url_entry(`sort`, [], [{ column, dir: `asc` }])).toThrow(
    `can't be a URL param`,
  )
})

const default_weights = [0.5, 0.4, 0.1]
const weights_from = (query: string, normalize = true) =>
  numbers_from_param(new URLSearchParams(query), `w`, default_weights, { normalize })

test.each([
  [default_weights, `/`],
  [[0.7, 0.2, 0.1], `/?w=0.7,0.2,0.1`],
  [[1 / 3, 0.5, 1 / 6], `/?w=${1 / 3},0.5,${1 / 6}`],
  // sums to 1 - 1.1e-16, so dividing by the total would shift each value by an ulp
  [[1 / 6, 2 / 3, 1 / 6], `/?w=${1 / 6},${2 / 3},${1 / 6}`],
])(`numbers_url_entry(%o) round-trips exactly via %s`, (values, expected_url) => {
  const url = url_with_params(
    [numbers_url_entry(`w`, values, default_weights)],
    new URL(`https://example.com/`),
  )
  expect(url).toBe(expected_url)
  expect(weights_from(url.slice(2))).toStrictEqual(values)
})

test.each([[[NaN, 0.4, 0.1]], [[Infinity, 0.4, 0.1]], [[0.5, 0.5]]])(
  `numbers_url_entry rejects %o`,
  (values) => {
    expect(() => numbers_url_entry(`w`, values, default_weights)).toThrow(
      `w: need 3 finite numbers`,
    )
  },
)

test.each([
  [`w=0.7,0.2,0.1`, [0.7, 0.2, 0.1]],
  [`w=2,1,1`, [0.5, 0.25, 0.25]],
  [`w=1e-1,.2,5.`, [0.1 / 5.3, 0.2 / 5.3, 5 / 5.3]],
  [`w=0.5,,0.5`, default_weights],
  [`w=0.5,0.5`, default_weights],
  [`w=-1,1,1`, default_weights],
  [`w=0,0,0`, default_weights],
  [`w=1e308,1e308,1`, default_weights],
  [`w=Infinity,1,1`, default_weights],
  [`w=a,1,1`, default_weights],
  [`w= 1 ,1,1`, default_weights],
  [`w=0x10,1,1`, default_weights],
  [`w=`, default_weights],
  [``, default_weights],
] as const)(`numbers_from_param(%s, normalize)`, (query, expected) => {
  const values = weights_from(query)
  for (const [idx, value] of values.entries())
    expect(value).toBeCloseTo(expected[idx], 12)
  expect(values).toHaveLength(3)
  expect(values).not.toBe(default_weights)
  expect(default_weights).toEqual([0.5, 0.4, 0.1])
})

test.each([
  [`w=-1,2,0`, [-1, 2, 0]],
  [`w=0,0,0`, [0, 0, 0]],
  [`w=-1,x,0`, default_weights],
  // a running sum hitting Infinity mustn't reject finite values that don't get normalized
  [`w=1e308,1e308,-1e308`, [1e308, 1e308, -1e308]],
  [`w=1e309,0,0`, default_weights],
])(
  `numbers_from_param(%s) without normalize keeps values as given`,
  (query, expected) => {
    expect(weights_from(query, false)).toStrictEqual(expected)
  },
)
