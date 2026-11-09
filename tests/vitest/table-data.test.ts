import {
  type CellVal,
  type Column,
  type RowData,
  type SortCriterion,
  cell_readers,
  cell_text,
  compile_filter,
  type ColumnFilterValue,
  compute_column_stats,
  discover_columns,
  format_datetime,
  infer_datetime_kind,
  middle_ellipsis_parts,
  parse_datetime_val,
  parse_numeric_val,
  resolve_domain,
  sort_table_rows,
} from '#lib/table/index.ts'
import { html_to_text } from '#lib/utils.ts'
import { virtual_window } from '#lib/virtual.ts'
import { describe, expect, it } from 'vite-plus/test'

describe(`column stats and domains`, () => {
  const values = [...Array.from({ length: 20 }, (_unused_value, idx) => idx * 5), 10_000]

  it(`summarizes a column in one pass, ignoring non-numeric and non-finite entries`, () => {
    const stats = compute_column_stats([
      1,
      2,
      3,
      null,
      undefined,
      NaN,
      Infinity,
      -Infinity,
    ])
    expect(stats).toMatchObject({ min: 1, max: 3, mean: 2, median: 2, count: 3 })
    expect(compute_column_stats([null, undefined, NaN])).toBeNull()
    // without quantiles, q_lo/q_hi fall back to min/max and no median is computed
    expect(compute_column_stats(values, false)).toMatchObject({
      q_lo: 0,
      q_hi: 10_000,
      median: null,
    })
    for (const zero of [-0, 0]) {
      expect(compute_column_stats([zero, -zero], false)).toMatchObject({
        min: zero,
        max: zero,
      })
    }
  })

  // Pinned exactly: a loose "somewhere below the outlier" bound would pass for almost any
  // wrong quantile implementation. 21 values -> q05 index 1.0, q95 index 19.0.
  it(`clips a quantile domain inside the outlier-driven full range`, () => {
    const stats = compute_column_stats(values)
    if (!stats) throw new Error(`expected stats`)
    expect(resolve_domain(stats, `minmax`)).toEqual([0, 10_000])
    expect(resolve_domain(stats, `quantile`)).toEqual([5, 95])
    expect([stats.q_lo, stats.median, stats.q_hi]).toEqual([5, 50, 95])
  })

  // summing before dividing would overflow MAX_VALUE/2 x 4 to an Infinity mean
  const huge = Number.MAX_VALUE / 2
  it.each([
    [`a single value`, [7]],
    [`all-equal values`, [3, 3, 3]],
    [`values whose sum overflows`, [huge, huge, huge, huge]],
  ])(`handles %s without collapsing`, (_desc, input) => {
    const [val] = input
    const stats = compute_column_stats(input)
    if (!stats) throw new Error(`expected stats`)
    const { min, max, mean, median, q_lo, q_hi } = stats
    expect([min, max, mean, median, q_lo, q_hi]).toEqual(Array(6).fill(val))
    // a zero-width quantile range must fall back to min/max, not produce an empty domain
    expect(resolve_domain(stats, `quantile`)).toEqual([val, val])
  })

  // oxfmt-ignore
  it.each([
    [[-8, 1, 2], [-8, 8]],
    [[1, 2, 3], [-3, 3]],
    [[0, 0], [-1, 1]],
  ])(`centers a diverging domain on zero for %s`, (input, expected) => {
    const stats = compute_column_stats(input)
    if (!stats) throw new Error(`expected stats`)
    expect(resolve_domain(stats, `diverging`)).toEqual(expected)
  })
})

it(`discovers columns from the first 50 rows' keys, skipping style/class`, () => {
  const rows = [
    { b: 1, style: `x` },
    { a: 2, class: `y` },
    ...Array.from({ length: 60 }, () => ({ b: 3 })),
    { late: 1 },
  ]
  expect(discover_columns(rows)).toEqual([
    { id: `b`, label: `b` },
    { id: `a`, label: `a` },
  ])
  expect(discover_columns([])).toEqual([])
})

it.each([
  [`abcdefghijklmnopqrstuvwxyz`, [`abcdefghijklmnopqr`, `stuvwxyz`]], // tail capped at 8
  [`abcdefghij`, [`abcde`, `fghij`]], // short strings split in half
  [`a👨‍👩‍👧b👨‍👩‍👧`, [`a👨‍👩‍👧`, `b👨‍👩‍👧`]], // graphemes, not code units
])(`middle_ellipsis_parts(%j) = %j`, (text, expected) => {
  expect(middle_ellipsis_parts(text)).toEqual(expected)
})

// Entity cells render decoded via {@html}, so search, sort and export must read them decoded
// too: `AT&amp;T` exported as `AT&amp;T` and missed a search for `at&t`.
it.each([
  [`<div><span>nested</span></div>`, `nested`],
  [`<a href="https://example.com" class="link">link text</a>`, `link text`],
  [`plain text`, `plain text`],
  [``, ``],
  [`before<br/>after`, `beforeafter`],
  [`<b>bold</b> and <i>italic</i>`, `bold and italic`],
  [`T < 300 K and P > 1 bar`, `T < 300 K and P > 1 bar`], // a comparison pair is not a tag
  [`<b>T < 300 K</b>`, `T < 300 K`],
  [`<B>UPPER</B>`, `UPPER`], // tags are case-insensitive
  [`<!-- note -->kept`, `kept`],
  [`<span title="x>0" data-y='a>b'>Si</span>`, `Si`], // `>` inside quoted attributes
  [`AT&amp;T`, `AT&T`],
  [
    `<b>&Delta;H</b> = &minus;5&nbsp;&plusmn;&#160;0.1&#x3bc;m`,
    `ΔH = −5\u00A0±\u00A00.1μm`,
  ],
  [`&Aring; &angst; &Ouml;l &eacute; &ccedil; &micro; &deg; &times;`, `Å Å Öl é ç µ ° ×`],
  [`&alpha;&Omega;&sigmaf;&#X3A3;`, `αΩςΣ`],
  [`&lt;b&gt;shown&lt;/b&gt; &amp;lt;`, `<b>shown</b> &lt;`], // escaped markup is text, decoded once
  [`&l<i></i>t;`, `&lt;`], // a tag can't splice an entity together
  [`&bogus; &constructor; a & b`, `&bogus; &constructor; a & b`],
  [`&#0;&#xD800;&#x110000;`, `\uFFFD\uFFFD\uFFFD`], // NUL, surrogate, out-of-range: U+FFFD
])(`html_to_text and cell_text: %j -> %j`, (input, expected) => {
  expect(html_to_text(input)).toBe(expected)
  expect(cell_text(input)).toBe(expected)
})

// numbers skip the markup decode, which must not change their text
it.each([1.5, -0, 1e21, -2.5e-7, Infinity])(
  `cell_text(%s) is its decoded string`,
  (num) => expect(cell_text(num)).toBe(html_to_text(String(num)).trim()),
)

it.each<[CellVal, number | null]>([
  [42, 42],
  [Infinity, null],
  [NaN, null],
  [`1.23 ± 0.05`, 1.23],
  [`-1.5 +- 0.2`, -1.5],
  [`2.890(8)`, 2.89],
  [`−3.5`, -3.5], // unicode minus
  [`<b>10</b>`, 10],
  [`&minus;5`, -5], // entities decode before parsing
  [`5 &plusmn; 0.1`, 5],
  [`<span data-sort-value="1000">1,000</span>`, 1000],
  [`<span data-sort-value="zulu">9</span>`, null], // non-numeric sort value wins
  [`<span data-sort-value="">42</span>`, null], // blank: not Number('') = 0, nor the text
  [`<span data-sort-value="0">n/a</span>`, 0], // an explicit zero still counts
  [`<span data-sort-value='7'>seven</span>`, 7], // single-quoted attribute
  [`<span data-sort-value=''>42</span>`, null],
  [`abc`, null],
  // only decimal notation: Number() would read these literals as 16, 3 and 7
  [`0x10`, null],
  [`0b11`, null],
  [`0o7`, null],
  [`1.2.3`, null], // version string
  [`<span data-sort-value="0x10">x</span>`, null], // a sort value is decimal-only too
  [` 1e3 `, 1000],
  [``, null],
  [null, null],
  [new Date(0), null],
])(`parse_numeric_val(%j) = %j`, (val, expected) => {
  expect(parse_numeric_val(val)).toBe(expected)
})

// `\d+\.?\d*` overlapped itself: a 30k-digit cell ending in a letter backtracked O(n²),
// over a second per call (now well under a millisecond)
it(`parse_numeric_val stays linear on long digit runs`, () => {
  const long_digits = `${`1`.repeat(30_000)}x`
  const start = performance.now()
  expect(parse_numeric_val(long_digits)).toBeNull()
  expect(performance.now() - start).toBeLessThan(200)
})

describe(`sort_table_rows`, () => {
  const rows = (...vals: CellVal[]): RowData[] => vals.map((val) => ({ val }))
  const order = (vals: CellVal[], ascending = true) => {
    const data = rows(...vals)
    const criteria = [{ key: `val`, ascending }]
    return sort_table_rows(data, criteria).map((row) => row.val)
  }

  it.each([true, false])(`sinks missing sort keys with ascending=%s`, (ascending) => {
    const invalid_date = new Date(NaN)
    expect(cell_text(invalid_date)).toBe(``)
    const blank_key = `<span data-sort-value="">42</span>` // not sorted by its numeric text
    // blank text (`` rose above every number when descending) sinks too
    const vals = [
      null,
      3,
      ``,
      undefined,
      `a`,
      1,
      NaN,
      2,
      blank_key,
      invalid_date,
      ` <b></b>`,
    ]
    expect(order(vals, ascending)).toEqual([
      ...(ascending ? [1, 2, 3, `a`] : [`a`, 3, 2, 1]),
      null,
      ``,
      undefined,
      NaN,
      blank_key,
      invalid_date,
      ` <b></b>`,
    ])
  })

  // as text, a space sorted before `T` and every UTC offset compared as digits
  it(`orders ISO date/time strings by their instant`, () => {
    // oxfmt-ignore
    expect(order([`2024-01-01T06:00Z`, `2024-01-01T10:00+05:00`])) // 06:00Z after 05:00Z
      .toEqual([`2024-01-01T10:00+05:00`, `2024-01-01T06:00Z`])
    // oxfmt-ignore
    expect(order([`2024-01-01 10:00`, `2024-01-01T09:00`, `2023-12-31`]))
      .toEqual([`2023-12-31`, `2024-01-01T09:00`, `2024-01-01 10:00`])
  })

  it(`puts numbers before strings and compares strings in natural order`, () => {
    const mixed = order([`10`, `abc`, `9`, `a2`, `a10`, 2])
    expect(mixed).toEqual([2, `9`, `10`, `a2`, `a10`, `abc`])
    // ±Infinity are numbers at the ends, not text after them
    expect(order([3, Infinity, `x`, -Infinity, 1])).toEqual([
      -Infinity,
      1,
      3,
      Infinity,
      `x`,
    ])
    expect(order([3, Infinity, -Infinity, 1], false)).toEqual([Infinity, 3, 1, -Infinity])
    expect(order([`b`, `B`, `a`])).toEqual([`a`, `b`, `B`]) // case-insensitive keeps input order for ties
  })

  // sorting the raw cell compared markup by tag name and put all markup ahead of plain text
  it(`orders markup cells by their visible text, not their tags`, () => {
    // oxfmt-ignore
    expect(order([`<span>Apple</span>`, `<i>Zebra</i>`, `<b>Mango</b>`]))
      .toEqual([`<span>Apple</span>`, `<b>Mango</b>`, `<i>Zebra</i>`])
    // oxfmt-ignore
    expect(order([`<b>Beta</b>`, `Alpha`, `<i>Gamma</i>`, `Delta`]))
      .toEqual([`Alpha`, `<b>Beta</b>`, `Delta`, `<i>Gamma</i>`])
    expect(order([`Zeta`, `&Ouml;l`, `Beta`])).toEqual([`Beta`, `&Ouml;l`, `Zeta`]) // as Öl
    // a non-numeric data-sort-value still wins over the rendered text
    // oxfmt-ignore
    expect(order([`<b data-sort-value="aaa">Zulu</b>`, `Alpha`]))
      .toEqual([`<b data-sort-value="aaa">Zulu</b>`, `Alpha`])
  })

  // as text the collator compared digit runs as integers: 1.5 eV after 1.25 eV, -1 before -3
  // oxfmt-ignore
  it.each<[CellVal[], CellVal[]]>([
    [[`1.5 eV`, `1.25 eV`, `0.9 eV`], [`0.9 eV`, `1.25 eV`, `1.5 eV`]],
    [[`-1 GPa`, `-3 GPa`, `2 GPa`], [`-3 GPa`, `-1 GPa`, `2 GPa`]],
    // equal numbers: a bare number first, then by text
    [[`2 meV`, `abc`, `2 eV`, 2, `1e3 K`], [2, `2 eV`, `2 meV`, `1e3 K`, `abc`]],
    [[`3.10.0`, `3.9.0`], [`3.9.0`, `3.10.0`]], // versions keep natural text order
    [[`0x1f`, `1 eV`, `0x0a`], [`1 eV`, `0x0a`, `0x1f`]], // so do hex IDs
  ])(`sorts unit-suffixed numbers %j by their number`, (vals, expected) => {
    expect(order(vals)).toEqual(expected)
    expect(order(vals, false)).toEqual(expected.toReversed())
  })

  // the type-mismatch branch answered "the other one first" both ways: not a total order
  it.each([
    [`a boolean`, true],
    [`an object`, { a: 1 }],
    [`an invalid date`, new Date(NaN)],
  ])(`compares a string against %s antisymmetrically`, (_case, other) => {
    expect(order([`abc`, other])).toEqual(order([other, `abc`]))
  })

  it(`sorts one multiset to one order whatever order it arrives in`, () => {
    const permutations: CellVal[][] = [
      [`abc`, true, 5, false, `zed`],
      [5, false, `zed`, `abc`, true],
      [true, `zed`, 5, `abc`, false],
      [`zed`, `abc`, false, true, 5],
    ]
    const results = permutations.map((permutation) => order(permutation))
    for (const result of results) expect(result).toEqual(results[0])
    expect(results[0]).toEqual([5, `abc`, false, true, `zed`]) // numbers first, then text
  })

  // cells were re-read on each of the O(n log n) comparisons (67 ms for 50k rows, now 15 ms)
  it(`reads each cell and object once per sort and refreshes mutated sort values`, () => {
    let [reads, cell_reads] = [0, 0]
    const values = Array.from({ length: 40 }, (_, idx) => ({
      rank: 39 - idx,
      toJSON() {
        reads++
        return this.rank
      },
    }))
    const data = values.map((val) => ({ val }))
    const criteria = [{ key: `val`, ascending: true }]
    expect(sort_table_rows(data, criteria).map(({ val }) => val.rank)).toEqual(
      Array.from({ length: 40 }, (_, idx) => idx),
    )
    expect(reads).toBe(40)
    const counted = values.map((_, idx) => ({
      get val() {
        cell_reads++
        return 39 - idx
      },
    }))
    const sorted = sort_table_rows(counted, criteria)
    expect(cell_reads).toBe(40)
    expect(sorted.map(({ val }) => val)).toEqual(
      Array.from({ length: 40 }, (_, idx) => idx),
    )
    values[0].rank = -1
    expect(sort_table_rows(data, criteria)[0]).toBe(data[0])
    expect(reads).toBe(80)
    const dates = [{ val: new Date(2024, 0, 2) }, { val: new Date(2024, 0, 1) }]
    expect(sort_table_rows(dates, criteria)[0]).toBe(dates[1])
    dates[0].val.setFullYear(2023)
    expect(sort_table_rows(dates, criteria)[0]).toBe(dates[0])
  })

  // every primary key ties, so only a working secondary criterion yields the name order
  const by_name: SortCriterion = { key: `name`, ascending: true }
  const by_score: SortCriterion = { key: `score`, ascending: true }
  // oxfmt-ignore
  it.each<[string, RowData[], SortCriterion[], string[]]>([
    [`dates compare by time`,
      [{ when: new Date(2024, 0, 2), name: `b` }, { when: new Date(2024, 0, 1), name: `z` }, { when: new Date(2024, 0, 2), name: `a` }],
      [{ key: `when`, ascending: false }, by_name], [`a`, `b`, `z`]],
    // both-NaN rows sink together but still order by name among themselves
    [`both primary values are invalid`,
      [{ score: NaN, name: `b` }, { score: NaN, name: `a` }, { score: 1, name: `c` }],
      [by_score, by_name], [`c`, `a`, `b`]],
    // null vs undefined is equally invalid, so the secondary criterion decides
    [`null and undefined meet`,
      [{ score: null, name: `b` }, { score: undefined, name: `a` }],
      [by_score, by_name], [`a`, `b`]],
  ])(`honours later criteria when %s`, (_case, data, criteria, expected) => {
    expect(sort_table_rows(data, criteria).map((row) => row.name)).toEqual(expected)
  })
})

describe(`search and filters`, () => {
  it.each<[CellVal, ColumnFilterValue, boolean]>([
    [`1.5 ± 0.1`, { kind: `numeric`, min: 1, max: 2 }, true],
    [3, { kind: `numeric`, min: 1, max: 2 }, false],
    [`abc`, { kind: `numeric`, min: 0 }, false],
    [5, { kind: `numeric`, max: 5 }, true],
    [`<i>oxide</i>`, { kind: `category`, values: [`oxide`] }, true],
    // n/a cells never match a category, blank strings do
    [null, { kind: `category`, values: [``] }, false],
    [NaN, { kind: `category`, values: [``] }, false],
    [``, { kind: `category`, values: [``] }, true],
    [`Fe2O3`, { kind: `text`, text: `e2o` }, true],
    [`Fe2O3`, { kind: `text`, text: `cu` }, false],
  ])(`cell %j against %j through cell_readers: %j`, (val, filter, expected) => {
    expect(compile_filter(filter, cell_readers)(val)).toBe(expected)
  })
})

describe(`date/time columns`, () => {
  const plain: Column = { id: `When`, label: `When` }
  const explicit: Column = { id: `When`, label: `When`, datetime_format: `datetime` }

  it.each<[CellVal, Column, number | null]>([
    [`2024-01-02`, plain, new Date(2024, 0, 2).getTime()], // local midnight, not UTC
    [`2024-01-02T03:04:05Z`, plain, Date.UTC(2024, 0, 2, 3, 4, 5)],
    [`2024-01-02 03:04`, plain, new Date(2024, 0, 2, 3, 4).getTime()],
    [`2024-01-02T03:04:05.123456789Z`, plain, Date.UTC(2024, 0, 2, 3, 4, 5, 123)],
    [`2024-02-29`, plain, new Date(2024, 1, 29).getTime()],
    [`0099-01-02`, plain, new Date(`0099-01-02T00:00:00`).getTime()],
    [`2023-02-29`, plain, null],
    [`2024-02-30`, plain, null],
    [`2024-02-30T12:00:00Z`, plain, null],
    [`2024-13-01`, plain, null],
    [`2024-01-00`, plain, null],
    [1_700_000_000, plain, null], // bare numbers need an explicit datetime column
    [1_700_000_000, explicit, 1_700_000_000_000], // epoch seconds scale to ms
    [1_700_000_000_000, explicit, 1_700_000_000_000],
    [12345, explicit, null], // too small to be a timestamp
    [`<span data-sort-value="1700000000000">x</span>`, explicit, 1_700_000_000_000],
    [`not a date`, explicit, null],
    [new Date(NaN), plain, null],
  ])(`parse_datetime_val(%j) = %j`, (val, col, expected) => {
    expect(parse_datetime_val(val, col)).toBe(expected)
  })

  it(`infers the column kind from config first, then from a sample`, () => {
    expect(
      infer_datetime_kind({ id: `x`, label: `x`, datetime_format: `time` }, []),
    ).toBe(`time`)
    expect(infer_datetime_kind(explicit, [])).toBe(`datetime`)
    expect(infer_datetime_kind(plain, [`2024-01-02`, `2024-01-03`])).toBe(`date`)
    // one value with a time of day upgrades the whole column
    expect(infer_datetime_kind(plain, [`2024-01-02`, `2024-01-03T10:00`])).toBe(
      `datetime`,
    )
    expect(infer_datetime_kind(plain, [`abc`, 5, null])).toBeNull()
    expect(infer_datetime_kind(plain, [`2023-02-29`, `2024-13-01`])).toBeNull()
  })

  it(`formats in local time and as relative age`, () => {
    const stamp = new Date(2024, 0, 2, 3, 4).getTime()
    const now = new Date(2024, 0, 3, 5, 34).getTime()
    expect(format_datetime(stamp, `date`)).toBe(`2024-01-02`)
    expect(format_datetime(stamp, `time`)).toBe(`03:04`)
    expect(format_datetime(stamp, `datetime`)).toBe(`2024-01-02 03:04`)
    expect(format_datetime(stamp, `iso`)).toBe(new Date(stamp).toISOString())
    expect(format_datetime(stamp, `relative`, now)).toBe(`1d 2h 30m ago`)
    expect(format_datetime(now, `relative`, stamp)).toBe(`1d 2h 30m from now`)
    // leading zero units are skipped and at most three units render
    expect(format_datetime(new Date(2017, 6, 23, 9, 57).getTime(), `relative`, now)).toBe(
      `6y 5mo 2w ago`,
    )
    // a zero remainder adds no trailing 0m term, but a lone minutes term still renders
    expect(format_datetime(now - 2 * 24 * 60 * 60_000, `relative`, now)).toBe(`2d ago`)
    expect(format_datetime(now - 60 * 60_000, `relative`, now)).toBe(`1h ago`)
    expect(format_datetime(now - 90 * 60_000, `relative`, now)).toBe(`1h 30m ago`)
    expect(format_datetime(now - 30_000, `relative`, now)).toBe(`0m ago`)
  })
})

const window_base = { item_size: 10, count: 100, viewport: 50 }

it.each<[Partial<Parameters<typeof virtual_window>[0]>, [number, number]]>([
  [{ scroll: 0 }, [0, 5]],
  [{ scroll: 123 }, [12, 18]], // partially visible rows at both edges count
  [{ scroll: 120, overscan: 2 }, [10, 19]],
  [{ scroll: 0, overscan: 2 }, [0, 7]], // overscan clamped at the top
  [{ scroll: 990, overscan: 2 }, [93, 100]], // clamped to the last page, then overscan
  [{ scroll: 5000 }, [95, 100]],
  [{ scroll: 0, min_window: 30 }, [0, 30]], // min_window extends the window
  [{ scroll: 900, min_window: 30 }, [90, 100]], // but never past count
  [{ scroll: -40 }, [0, 1]], // negative scroll (leading label track): first row peeks in
  [{ scroll: 0, viewport: 0, min_window: 60 }, [0, 60]], // unmeasured viewport
  [{ scroll: 0, count: 0 }, [0, 0]], // empty data
])(`virtual_window(%o) = %j`, (opts, [start, end]) => {
  expect(virtual_window({ ...window_base, scroll: 0, ...opts })).toEqual({ start, end })
})
