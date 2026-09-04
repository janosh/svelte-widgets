// Unit tests for the dotted/bracketed JSON path codec
import { build_path, format_path, parse_path, resolve_path } from '$lib/json-tree/path'
import { describe, expect, it } from 'vitest'

describe(`format_path`, () => {
  it.each([
    [[], ``],
    [[`root`], `root`],
    [[`users`, `name`], `users.name`],
    // numeric segments use bracket notation
    [[`users`, 0], `users[0]`],
    [[`arr`, 0, `name`], `arr[0].name`],
    // special characters use bracket notation
    [[`data`, `key-with-dash`], `data["key-with-dash"]`],
    [[`data`, `key with space`], `data["key with space"]`],
    // quotes in keys are escaped
    [[`data`, `key"with"quotes`], `data["key\\"with\\"quotes"]`],
    // root numeric index
    [[0, `name`], `[0].name`],
    [[0], `[0]`],
    [[42, `nested`, 3], `[42].nested[3]`],
    // root special key
    [[`key.with.dot`], `["key.with.dot"]`],
    [[`key.with.dot`, `child`], `["key.with.dot"].child`],
    [[`key-with-dash`], `["key-with-dash"]`],
  ] as [(string | number)[], string][])(`format_path(%j) = %p`, (segments, expected) => {
    expect(format_path(segments)).toBe(expected)
  })

  it(`round-trips correctly with parse_path`, () => {
    // Root numeric index
    expect(parse_path(format_path([0, `name`]))).toEqual([0, `name`])
    // Root special key with dots
    expect(parse_path(format_path([`key.with.dot`]))).toEqual([`key.with.dot`])
    // Mixed path
    expect(parse_path(format_path([`users`, 0, `data`, `key.with.dot`]))).toEqual([
      `users`,
      0,
      `data`,
      `key.with.dot`,
    ])
  })

  it.each([
    `a[b]`,
    `dot.key`,
    `say "hello"`,
    `slash\\key`,
    `mix.["quoted"]\\tail`,
    ``,
    `0`,
  ])(`round-trips arbitrary key %p`, (key) => {
    const segments = [`root`, key, 2, `leaf`]
    expect(parse_path(format_path(segments))).toEqual(segments)
  })
})

describe(`build_path`, () => {
  it.each([
    // empty parent
    [``, `key`, `key`],
    [``, 0, `[0]`],
    [``, `key.with.dot`, `["key.with.dot"]`],
    [``, `key-with-dash`, `["key-with-dash"]`],
    [``, `key"with"quotes`, `["key\\"with\\"quotes"]`],
    // string keys use dot notation, numeric keys bracket notation
    [`root`, `child`, `root.child`],
    [`arr`, 0, `arr[0]`],
    [`data`, `special-key`, `data["special-key"]`],
  ] as [string, string | number, string][])(
    `build_path(%p, %p) = %p`,
    (parent, key, expected) => {
      expect(build_path(parent, key)).toBe(expected)
    },
  )

  it.each([`123`, `0`, `-1`, `1.5`, `1e10`])(
    `treats numeric-looking key %p as string`,
    (key) => {
      const path = build_path(`obj`, key)
      expect(path).toBe(`obj["${key}"]`)
      expect(parse_path(path)).toEqual([`obj`, key])
    },
  )

  it(`handles nested paths`, () => {
    let path = build_path(``, `users`)
    path = build_path(path, 0)
    path = build_path(path, `name`)
    expect(path).toBe(`users[0].name`)
  })
})

describe(`parse_path`, () => {
  it.each([
    [``, []],
    [`a.b.c`, [`a`, `b`, `c`]],
    [`arr[0][1]`, [`arr`, 0, 1]],
    [`users[0].name`, [`users`, 0, `name`]],
    [`data["special-key"]`, [`data`, `special-key`]],
    // quotes in bracketed keys are unescaped
    [`data["key\\"with\\"quotes"]`, [`data`, `key"with"quotes`]],
    // malformed paths with unclosed brackets still parse trailing tokens
    [`a[0`, [`a`, 0]],
    [`arr[123`, [`arr`, 123]],
    [`data["key`, [`data`, `key`]],
    // empty brackets are silently ignored
    [`a[]`, [`a`]],
    [`a[].b`, [`a`, `b`]],
    [`a[-1]`, [`a`, -1]],
  ] as [string, (string | number)[]][])(`parse_path(%p) = %j`, (path, expected) => {
    expect(parse_path(path)).toEqual(expected)
  })

  it(`round-trips keys with quotes via build_path and parse_path`, () => {
    const key_with_quotes = `say "hello"`
    const path = build_path(`root`, key_with_quotes)
    expect(parse_path(path)).toEqual([`root`, key_with_quotes])
  })
})

describe(`resolve_path`, () => {
  const data = { a: { b: [1, 2, 3] }, 'odd key': 4 }

  it.each([
    [`a.b[1]`, 2],
    [`a`, data.a],
    [`["odd key"]`, 4],
    [``, data],
    [`a.missing`, undefined],
    [`a.b[9]`, undefined],
  ])(`resolves %j`, (path, expected) => {
    expect(resolve_path(data, path)).toEqual(expected)
  })

  // A bare lookup walks the prototype chain, so a segment naming an inherited member returned
  // Object.prototype or the Object function where the caller expects a value from its own data
  it.each([`__proto__`, `constructor`, `toString`, `hasOwnProperty`, `a.constructor`])(
    `returns undefined for the inherited member %j`,
    (path) => {
      expect(resolve_path(data, path)).toBeUndefined()
    },
  )
})
