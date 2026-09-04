// Unit tests for JSON tree utility functions
import {
  collect_all_paths,
  compute_diff,
  estimate_byte_size,
  find_matching_paths,
  format_preview,
  get_ancestor_paths,
  get_child_count,
  get_children,
  get_value_at_path,
  get_value_type,
  is_css_color,
  is_expandable,
  is_expandable_type,
  is_url,
  matches_search,
  relative_path_segments,
  serialize_for_copy,
  set_at_path,
  values_equal,
} from '$lib/json-tree/utils'
import { describe, expect, it } from 'vite-plus/test'

it.each([
  [null, `null`, 0, false],
  [undefined, `undefined`, 0, false],
  [`hello`, `string`, 0, false],
  [42, `number`, 0, false],
  [NaN, `number`, 0, false],
  [true, `boolean`, 0, false],
  [Symbol(`test`), `symbol`, 0, false],
  [123n, `bigint`, 0, false],
  [() => {}, `function`, 0, false],
  [[], `array`, 0, true],
  [[1, 2], `array`, 2, true],
  [[1, 2, 3], `array`, 3, true],
  [{}, `object`, 0, true],
  [{ a: 1 }, `object`, 1, true],
  [{ a: 1, b: 2 }, `object`, 2, true],
  [new Date(), `date`, 0, false],
  [/test/g, `regexp`, 0, false],
  [new Map(), `map`, 0, true],
  [
    new Map([
      [`a`, 1],
      [`b`, 2],
    ]),
    `map`,
    2,
    true,
  ],
  [new Set(), `set`, 0, true],
  [new Set([1, 2, 3, 4]), `set`, 4, true],
  [new Error(`test`), `error`, 0, false],
] as const)(
  `classifies %p as %s with %s children (expandable=%s)`,
  (value, type, count, expandable) => {
    expect(get_value_type(value)).toBe(type)
    expect(is_expandable_type(type)).toBe(expandable)
    expect(is_expandable(value)).toBe(expandable)
    expect(get_child_count(value)).toBe(count)
  },
)

describe(`serialize_for_copy`, () => {
  it.each([
    [undefined, `undefined`],
    [null, `null`],
    [`hello`, `hello`],
    [42, `42`],
    [true, `true`],
    [false, `false`],
    [BigInt(123), `123n`],
    [Symbol(`test`), `Symbol(test)`],
    [new Date(`2024-01-15T10:30:00.000Z`), `2024-01-15T10:30:00.000Z`],
    [/test/gi, `/test/gi`],
    [new Error(`Something went wrong`), `Error: Something went wrong`],
  ])(`serializes %p correctly`, (value, expected) => {
    expect(serialize_for_copy(value)).toBe(expected)
  })

  it(`serializes function to its source`, () => {
    const fn = function example() {
      return 42
    }
    expect(serialize_for_copy(fn)).toContain(`function example()`)
  })

  it.each([
    [
      [1, 2, 3],
      [1, 2, 3],
    ],
    [
      { a: 1, b: 2 },
      { a: 1, b: 2 },
    ],
    [
      new Map([
        [`a`, 1],
        [`b`, 2],
      ]),
      [
        [`a`, 1],
        [`b`, 2],
      ],
    ],
    [new Set([1, 2, 3]), [1, 2, 3]],
  ])(`serializes %p to JSON`, (value, expected) => {
    expect(JSON.parse(serialize_for_copy(value))).toEqual(expected)
  })

  it(`handles circular references`, () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj.self = obj
    expect(serialize_for_copy(obj)).toContain(`[Circular]`)
    // Also in Map/Set values
    const map = new Map([[`circular`, obj]])
    expect(serialize_for_copy(map)).toContain(`[Circular]`)
    const set = new Set([obj])
    expect(serialize_for_copy(set)).toContain(`[Circular]`)
  })
})

describe(`format_preview`, () => {
  it.each([
    [[1, 2, 3], `Array(3)`],
    [[], `Array(0)`],
    [{ a: 1 }, `{1 key}`],
    [{ a: 1, b: 2 }, `{2 keys}`],
    [{}, `{0 keys}`],
    [
      new Map([
        [`a`, 1],
        [`b`, 2],
      ]),
      `Map(2)`,
    ],
    [new Set([1, 2, 3]), `Set(3)`],
    [`hello`, `"hello"`],
    [new Date(`2024-01-15T10:30:00.000Z`), `2024-01-15T10:30:00.000Z`],
    [/test/gi, `/test/gi`],
    [new Error(`fail`), `Error: fail`],
    [Symbol(`desc`), `Symbol(desc)`],
    [BigInt(999), `999n`],
  ])(`formats %p correctly`, (value, expected) => {
    expect(format_preview(value)).toBe(expected)
  })

  it(`truncates long string`, () => {
    expect(format_preview(`a`.repeat(100), 50)).toBe(`"${`a`.repeat(50)}..."`)
  })

  it(`formats functions with ƒ prefix`, () => {
    function named_fn() {}
    expect(format_preview(named_fn)).toBe(`ƒ named_fn()`)
    expect(format_preview(() => {})).toBe(`ƒ anonymous()`)
  })

  it.each([
    [6.022e23, `6.022e+23`],
    [1e-10, `1e-10`],
    [0.000000000001, `1e-12`],
  ])(`formats scientific number %p as %p`, (value, expected) => {
    expect(format_preview(value)).toBe(expected)
  })

  it.each([`日本語テキスト`, `🚀 🎨 🔧`, `∑∏∫∂∇`, `First\nSecond\tThird`, ``, `   `])(
    `preserves unicode/special string: %p`,
    (str) => {
      expect(format_preview(str)).toBe(`"${str}"`)
    },
  )
})

describe(`matches_search`, () => {
  it.each([
    // empty query
    [`path`, `key`, `value`, ``, false],
    // path matches (case-insensitive)
    [`users.name`, `name`, `John`, `user`, true],
    [`USERS.name`, `name`, `John`, `user`, true],
    // key matches (case-insensitive)
    [`path`, `firstName`, `John`, `name`, true],
    [`path`, `FIRSTNAME`, `John`, `name`, true],
    // numeric key
    [`arr`, 123, `value`, `12`, true],
    // string value (case-insensitive)
    [`path`, `key`, `Hello World`, `world`, true],
    [`path`, `key`, `HELLO`, `hello`, true],
    // number value
    [`path`, `key`, 42, `42`, true],
    [`path`, `key`, 3.14, `3.14`, true],
    // boolean value
    [`path`, `key`, true, `true`, true],
    [`path`, `key`, false, `fal`, true],
    // object/array don't match directly
    [`path`, `key`, { nested: true }, `nested`, false],
    [`path`, `key`, [1, 2, 3], `1`, false],
    // null key
    [`root`, null, `value`, `root`, true],
    [`root`, null, `value`, `key`, false],
  ] as const)(
    `matches_search(%p, %p, %p, %p) = %p`,
    (path, key, value, query, expected) => {
      expect(matches_search(path, key, value, query)).toBe(expected)
    },
  )
})

describe(`collect_all_paths`, () => {
  const circular: Record<string, unknown> = { a: 1 }
  circular.self = circular
  it.each([
    [`string`, `root`, Infinity, []],
    [42, ``, Infinity, []],
    [null, `root`, Infinity, []],
    [{ a: { b: { c: 1 } }, d: 2 }, `root`, Infinity, [`root`, `root.a`, `root.a.b`]],
    [[{ a: 1 }, { b: 2 }], `items`, Infinity, [`items`, `items[0]`, `items[1]`]],
    [{ a: { b: { c: { d: 1 } } } }, `root`, 2, [`root`, `root.a`]],
    // the self reference is listed once; its (already seen) children are not walked again
    [circular, `root`, Infinity, [`root`, `root.self`]],
    [
      { map: new Map([[`key`, { nested: true }]]) },
      `root`,
      Infinity,
      [`root`, `root.map`, `root.map[0]`, `root.map[0].value`],
    ],
    [
      { set: new Set([{ inner: 1 }]) },
      `root`,
      Infinity,
      [`root`, `root.set`, `root.set[0]`],
    ],
  ])(
    `collect_all_paths(%j, %p, max_depth=%s) = %j`,
    (value, path, max_depth, expected) => {
      expect(collect_all_paths(value, path, max_depth)).toEqual(expected)
    },
  )
})

describe(`find_matching_paths`, () => {
  const obj = {
    users: [{ name: `Alice` }, { name: `Bob` }],
    alice: `x`,
    other: `Alice is here`,
  }
  it.each([
    [``, []],
    [`bob`, [`users[1].name`]],
    // key, path and value matches, in render order
    [`alice`, [`users[0].name`, `alice`, `other`]],
  ])(`query %p finds %j in render order`, (query, expected) => {
    expect(find_matching_paths(obj, query)).toEqual(expected)
  })

  it(`matches Map keys through their { key, value } wrapper`, () => {
    const map = new Map([
      [`Alice_Key`, `value1`],
      [`bob_key`, `value2`],
    ])
    expect(find_matching_paths({ data: map }, `alice`)).toEqual([`data[0].key`])
  })

  it(`follows sort_keys so match order tracks the rendered order`, () => {
    const value = { zeta: `hit`, alpha: `hit` }
    expect(find_matching_paths(value, `hit`)).toEqual([`zeta`, `alpha`])
    expect(find_matching_paths(value, `hit`, ``, true)).toEqual([`alpha`, `zeta`])
  })
})

describe(`get_children / get_value_at_path`, () => {
  const map = new Map<unknown, unknown>([[{ id: 1 }, `v1`]])
  const root = { arr: [10, 20], map, set: new Set([`s0`]), obj: { b: 1, a: 2 } }

  it.each([
    [
      root.arr,
      false,
      [
        { key: 0, value: 10 },
        { key: 1, value: 20 },
      ],
    ],
    [
      root.obj,
      false,
      [
        { key: `b`, value: 1 },
        { key: `a`, value: 2 },
      ],
    ],
    [
      root.obj,
      true,
      [
        { key: `a`, value: 2 },
        { key: `b`, value: 1 },
      ],
    ],
    [map, false, [{ key: 0, value: { key: { id: 1 }, value: `v1` } }]],
    [root.set, false, [{ key: 0, value: `s0` }]],
    [`leaf`, false, []],
  ])(`get_children(%j, sort=%s)`, (value, sort_keys, expected) => {
    expect(get_children(value, sort_keys)).toEqual(expected)
  })

  it.each([
    [``, undefined, root],
    [`arr[1]`, undefined, 20],
    [`obj.a`, undefined, 2],
    // Map entries resolve through the same wrapper JsonNode renders
    [`map[0]`, undefined, { key: { id: 1 }, value: `v1` }],
    [`map[0].value`, undefined, `v1`],
    [`map[0].key.id`, undefined, 1],
    [`set[0]`, undefined, `s0`],
    [`arr[1].nope`, undefined, undefined],
    [`missing.deeper`, undefined, undefined],
    [`__proto__`, undefined, undefined],
    [`obj.constructor`, undefined, undefined],
    [`data.obj.b`, `data`, 1],
    [`data`, `data`, root],
    // Dotted root labels (filenames) are stripped textually, never split by parse_path
    [`data.json`, `data.json`, root],
    [`data.json.obj.b`, `data.json`, 1],
    [`data.json.arr[1]`, `data.json`, 20],
    [`data.json[0]`, `data.json`, undefined],
    [`results.v2.json.map[0].value`, `results.v2.json`, `v1`],
    // a path that merely starts with the label text is not the root
    [`arr[1]`, `ar`, 20],
  ])(`get_value_at_path(%p, root_label=%p) = %j`, (path, root_label, expected) => {
    expect(get_value_at_path(root, path, root_label)).toEqual(expected)
  })

  it.each([
    [`data.json`, `data.json`, []],
    [`data.json.obj.b`, `data.json`, [`obj`, `b`]],
    [`data.json[0].x`, `data.json`, [0, `x`]],
    [`data.jsonl.x`, `data.json`, [`data`, `jsonl`, `x`]],
    [`obj.b`, undefined, [`obj`, `b`]],
  ])(`relative_path_segments(%p, %p) = %j`, (path, root_label, expected) => {
    expect(relative_path_segments(path, root_label)).toEqual(expected)
  })
})

describe(`set_at_path`, () => {
  const root = { obj: { b: 1, a: 2 }, arr: [10, 20] }

  it.each([
    [`obj.b`, undefined, { obj: { b: 9, a: 2 }, arr: [10, 20] }],
    [`arr[1]`, undefined, { obj: { b: 1, a: 2 }, arr: [10, 9] }],
    [`diagram.obj.a`, `diagram`, { obj: { b: 1, a: 9 }, arr: [10, 20] }],
    [`data.json.arr[0]`, `data.json`, { obj: { b: 1, a: 2 }, arr: [9, 20] }],
    [`data.json`, `data.json`, 9], // editing the root replaces it
  ])(`set_at_path(%p, root_label=%p)`, (path, root_label, expected) => {
    const result = set_at_path(root, path, 9, root_label)
    expect(result).toEqual(expected)
    expect(root.obj.b).toBe(1) // never mutates the input
    if (typeof result === `object` && result !== null) {
      const edited = result as typeof root
      expect(edited.obj === root.obj).toBe(path.includes(`arr[`))
      expect(edited.arr === root.arr).toBe(!path.includes(`arr[`))
    }
  })

  it.each([
    `obj.missing.deep`,
    `obj.missing`,
    `__proto__.polluted`,
    `obj.constructor.prototype`,
    `obj.b.deep`,
  ])(`rejects missing or inherited path %s`, (path) => {
    expect(() => set_at_path(root, path, 9)).toThrow(`Cannot edit missing path ${path}`)
  })

  it(`edits literal prototype keys and proxy values without cloning unrelated data`, () => {
    const original = JSON.parse(`{"__proto__":{"value":1},"constructor":2}`)
    original.callback = () => 1
    original.symbol = Symbol(`untouched`)
    const result = set_at_path(new Proxy(original, {}), `["__proto__"].value`, 9)
    expect(result).toEqual({ ...original, [`__proto__`]: { value: 9 } })
    expect(original.__proto__.value).toBe(1)
    expect(Object.getPrototypeOf(result)).toBe(Object.prototype)
  })

  it.each([
    [new Map(Object.entries({ first: { n: 1 }, last: { n: 2 } })), `[0].value.n`, 9],
    [new Map(Object.entries({ first: 1, last: 2 })), `[0].key`, `renamed`],
    [new Map([[`first`, 1]]), `[0]`, { key: `renamed`, value: 9 }],
    [new Set([{ n: 1 }, { n: 2 }]), `[0].n`, 9],
    [new Set([1, 2]), `[0]`, 9],
    [new Map([[`first`, new Set([1, 2])]]), `[0].value[1]`, 9],
  ])(`edits collection path %s %s immutably`, (collection, path, next) => {
    const before = get_value_at_path(collection, path)
    const updated = set_at_path(collection, path, next)
    expect(get_value_at_path(updated, path)).toEqual(next)
    expect(get_value_at_path(collection, path)).toEqual(before)
    expect(() => set_at_path(collection, `[9]`, next)).toThrow(`missing path`)
    if (collection instanceof Map)
      expect(() => set_at_path(collection, `[0]`, 9)).toThrow(
        `must contain key and value`,
      )
  })
})

describe(`get_ancestor_paths`, () => {
  it.each([
    [``, ``, []],
    [`root`, ``, []],
    [`users[0].name`, ``, [`users`, `users[0]`]],
    [`a.b.c.d`, ``, [`a`, `a.b`, `a.b.c`]],
    [
      `my-file[raw].nested.value`,
      `my-file[raw]`,
      [`my-file[raw]`, `my-file[raw].nested`],
    ],
    [`data.json`, `data.json`, []],
  ])(`get_ancestor_paths(%p, %p) = %p`, (path, root_label, expected) => {
    const result = get_ancestor_paths(path, root_label)
    expect(result).toEqual(expected)
  })
})

describe(`values_equal`, () => {
  it.each([
    [`hello`, `hello`, true],
    [42, 42, true],
    [true, true, true],
    [null, null, true],
    [`hello`, `world`, false],
    [42, 43, false],
    [true, false, false],
    [null, undefined, false],
    [{}, null, false],
    [`42`, 42, false],
    [true, 1, false],
    [/test/gi, /test/gi, true],
    [/test/g, /test/i, false],
    [[1, 2, 3], [4, 5, 6], true], // same length = equal (shallow)
    [[1, 2], [1, 2, 3], false],
    [{ a: 1, b: 2 }, { c: 3, d: 4 }, true], // same key count = equal (shallow)
    [{ a: 1 }, { a: 1, b: 2 }, false],
    [{ a: 1 }, [1], false], // object vs array subtypes differ
    [new Date(`2024-01-01`), {}, false], // date vs object
    [/a/, {}, false], // regexp vs object
    [new Date(`2024-01-15`), new Date(`2024-01-15`), true], // dates compare by timestamp
    [new Date(`2024-01-15`), new Date(`2024-01-16`), false],
    // NaN === NaN is false in JS, but for change detection we want NaN to equal NaN
    [NaN, NaN, true],
    [NaN, 0, false],
    [0, NaN, false],
    [NaN, null, false],
  ])(`values_equal(%p, %p) = %p`, (val_a, val_b, expected) => {
    expect(values_equal(val_a, val_b)).toBe(expected)
  })
})

describe(`is_url`, () => {
  it.each([
    [`https://example.com`, true],
    [`http://localhost:3000/path`, true],
    [`https://example.com/path?q=1&b=2#hash`, true],
    [`https://sub.domain.example.co.uk`, true],
    [`ftp://example.com`, false],
    [`not a url`, false],
    [`example.com`, false],
    [``, false],
    [`https://`, false], // no path after protocol
    [` https://example.com `, true], // trimmed
  ])(`is_url(%p) = %p`, (str, expected) => {
    expect(is_url(str)).toBe(expected)
  })
})

describe(`is_css_color`, () => {
  it.each([
    // hex colors (case-insensitive, 3/4/6/8 digit)
    [`#fff`, true],
    [`#ABCDEF`, true],
    [`#abcd`, true], // 4-digit with alpha
    [`#aabbccdd`, true], // 8-digit with alpha
    // functional colors
    [`rgb(255, 0, 0)`, true],
    [`rgba(255, 0, 0, 0.5)`, true],
    [`hsl(120, 100%, 50%)`, true],
    [`hsla(120, 100%, 50%, 0.5)`, true],
    [`oklch(0.5 0.2 120)`, true],
    [`oklab(0.5 0.1 -0.1)`, true],
    [`lch(50 30 120)`, true],
    [`lab(50 20 -30)`, true],
    [`color(display-p3 1 0 0)`, true],
    // non-colors
    [`red`, false],
    [`not a color`, false],
    [`#gg`, false],
    [`#12345`, false], // 5 digits invalid
    [`rgb`, false],
    [``, false],
    [` #fff `, true], // trimmed
    // CSS injection prevention: semicolons rejected
    [`rgb(0,0,0);position:fixed`, false],
    [`#fff;background:red`, false],
    // CSS injection prevention: url() injection blocked by [^)]* regex
    [`rgb(255,0,0) url(https://evil.com/track.png)`, false],
    [`hsl(0,0%,0%) url(data:,x)`, false],
  ])(`is_css_color(%p) = %p`, (str, expected) => {
    expect(is_css_color(str)).toBe(expected)
  })
})

describe(`estimate_byte_size`, () => {
  const deep = { a: { b: { c: { d: { e: 1 } } } } }
  it.each([
    [null, undefined, 4],
    [undefined, undefined, 9],
    [true, undefined, 4],
    [false, undefined, 5],
    [42, undefined, 2],
    [3.14, undefined, 4],
    [`hello`, undefined, 7], // 5 chars + 2 for quotes
    [``, undefined, 2], // empty string + quotes
    [[], undefined, 2], // empty array brackets
    [{}, undefined, 2], // empty object braces
    [[1, 2, 3], undefined, 8], // 2 + 3*(1+1)
    [{ ab: 1 }, undefined, 9], // 2 + 2(key) + 4(quotes+colon+comma) + 1(value)
    [new Map([[`key`, `val`]]), undefined, 17], // 2 + 5(value) + 10(key allowance)
    [new Set([1, 2, 3]), undefined, 8], // same as the array
    [deep, 2, 24], // subtrees at max_depth count a flat 10: 2+5+(2+5+10)
    [deep, 5, 45],
  ])(`estimates %p (max_depth=%s) as %d bytes`, (value, max_depth, expected) => {
    expect(estimate_byte_size(value, max_depth)).toBe(expected)
  })
})

describe(`compute_diff`, () => {
  it.each([
    [42, 42],
    [`hello`, `hello`],
    [true, true],
    [null, null],
    [NaN, NaN],
    [{ x: NaN }, { x: NaN }],
    [new Date(`2024-01-15`), new Date(`2024-01-15`)],
    [
      { a: 1, b: [2, 3], c: { d: 4 } },
      { a: 1, b: [2, 3], c: { d: 4 } },
    ],
    [new Map([[`a`, 1]]), new Map([[`a`, 1]])],
    [new Set([1, 2]), new Set([1, 2])],
  ])(`returns an empty map for equal values %j vs %j`, (old_val, new_val) => {
    expect(compute_diff(old_val, new_val).size).toBe(0)
  })

  it.each([
    {
      desc: `changed primitive`,
      old_val: 1,
      new_val: 2,
      root: `root`,
      entry: { status: `changed`, path: `root`, old_value: 1, new_value: 2 },
    },
    {
      desc: `changed primitive at the default (empty) root path`,
      old_val: NaN,
      new_val: 42,
      root: undefined,
      entry: { status: `changed`, path: ``, old_value: NaN, new_value: 42 },
    },
    {
      desc: `type change`,
      old_val: `string`,
      new_val: 42,
      root: `val`,
      entry: { status: `changed`, path: `val`, old_value: `string`, new_value: 42 },
    },
    {
      desc: `date change (compared via string form)`,
      old_val: new Date(`2024-01-15`),
      new_val: new Date(`2024-01-16`),
      root: `d`,
      entry: {
        status: `changed`,
        path: `d`,
        old_value: new Date(`2024-01-15`),
        new_value: new Date(`2024-01-16`),
      },
    },
    {
      desc: `added object key`,
      old_val: { a: 1 },
      new_val: { a: 1, b: 2 },
      root: `root`,
      entry: { status: `added`, path: `root.b`, new_value: 2 },
    },
    {
      desc: `removed object key`,
      old_val: { a: 1, b: 2 },
      new_val: { a: 1 },
      root: `root`,
      entry: { status: `removed`, path: `root.b`, old_value: 2 },
    },
    {
      desc: `changed object value`,
      old_val: { a: 1 },
      new_val: { a: 99 },
      root: `root`,
      entry: { status: `changed`, path: `root.a`, old_value: 1, new_value: 99 },
    },
    {
      desc: `nested object change (unchanged siblings omitted)`,
      old_val: { user: { name: `Alice`, age: 30 } },
      new_val: { user: { name: `Bob`, age: 30 } },
      root: undefined,
      entry: {
        status: `changed`,
        path: `user.name`,
        old_value: `Alice`,
        new_value: `Bob`,
      },
    },
    {
      desc: `added array element`,
      old_val: [1, 2],
      new_val: [1, 2, 3],
      root: `arr`,
      entry: { status: `added`, path: `arr[2]`, new_value: 3 },
    },
    {
      desc: `removed array element`,
      old_val: [1, 2, 3],
      new_val: [1, 2],
      root: `arr`,
      entry: { status: `removed`, path: `arr[2]`, old_value: 3 },
    },
    // Map entries are wrapped as { key, value } to match rendering
    {
      desc: `changed Map value`,
      old_val: new Map([
        [`a`, 1],
        [`b`, 2],
      ]),
      new_val: new Map([
        [`a`, 1],
        [`b`, 99],
      ]),
      root: `m`,
      entry: { status: `changed`, path: `m[1].value`, old_value: 2, new_value: 99 },
    },
    {
      desc: `changed Map key`,
      old_val: new Map([[`a`, 1]]),
      new_val: new Map([[`b`, 1]]),
      root: `m`,
      entry: { status: `changed`, path: `m[0].key`, old_value: `a`, new_value: `b` },
    },
    {
      desc: `added Map entry`,
      old_val: new Map([[`a`, 1]]),
      new_val: new Map([
        [`a`, 1],
        [`b`, 2],
      ]),
      root: `m`,
      entry: { status: `added`, path: `m[1]`, new_value: { key: `b`, value: 2 } },
    },
    {
      desc: `removed Set member`,
      old_val: new Set([1, 2, 3]),
      new_val: new Set([1, 2]),
      root: `s`,
      entry: { status: `removed`, path: `s[2]`, old_value: 3 },
    },
  ])(`detects $desc`, ({ old_val, new_val, root, entry }) => {
    const diff = compute_diff(old_val, new_val, root)
    expect([...diff.values()]).toEqual([entry])
  })

  it(`handles multiple changes at different depths`, () => {
    const untouched = {
      get value(): never {
        throw new Error(`Unchanged branches should not be traversed`)
      },
    }
    const diff = compute_diff(
      { a: 1, b: { c: 2, d: 3 }, untouched },
      { a: 99, b: { c: 2, d: 100, e: 5 }, untouched },
    )
    expect([...diff.values()].map(({ path, status }) => [path, status])).toEqual([
      [`a`, `changed`],
      [`b.d`, `changed`],
      [`b.e`, `added`],
    ])
  })

  it(`handles circular references without infinite loop`, () => {
    const obj: Record<string, unknown> = { a: 1 }
    obj.self = obj
    const diff = compute_diff(obj, { a: 2 })
    expect(diff.get(`a`)?.status).toBe(`changed`)
    expect(diff.get(`self`)?.status).toBe(`removed`)
  })
})
