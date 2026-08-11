import type { CmdAction, Option, OptionStyle } from '$lib'
import {
  chain_handlers,
  cmd_action_matches,
  compute_position,
  event_to_combo,
  format_cmd_metadata,
  format_shortcut,
  fuzzy_match,
  fuzzy_match_indices,
  get_label,
  get_option_key,
  get_style,
  get_uuid,
  has_group,
  is_editable_event_target,
  is_modifier_chord,
  is_object,
  matches_shortcut,
  normalize_combo,
  observe_subtree,
  parse_shortcut,
  sanitize_shortcut_overrides,
  slug_to_title,
  step_focus,
  values_equal,
} from '$lib/utils'
import { afterEach, assert, beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import { doc_query, stub_prop } from './index'

// RFC 4122 v4 is xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx (y = 8/9/a/b); the timestamp+counter
// fallback used when crypto is unavailable only guarantees the generic UUID shape
const uuid_v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu
const uuid_any = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu
test.each([
  [`crypto`, false, uuid_v4],
  [`fallback`, true, uuid_any],
] as const)(`get_uuid via %s: unique valid UUIDs`, (_desc, drop_crypto, regex) => {
  const original = globalThis.crypto?.randomUUID?.bind(globalThis.crypto)
  // @ts-expect-error - mocking randomUUID as undefined
  if (drop_crypto) globalThis.crypto.randomUUID = undefined
  try {
    const uuids = Array.from({ length: 100 }, () => get_uuid())
    uuids.forEach((uuid) => expect(uuid).toMatch(regex))
    expect(new Set(uuids).size).toBe(100)
  } finally {
    if (original) globalThis.crypto.randomUUID = original
  }
})

// only letters not preceded by a letter/mark/number/underscore get capitalized
test.each([
  [`über-café`, `Über Café`], // Unicode slug words
  [`hello-world-again`, `Hello World Again`],
  [`2d-plot`, `2d Plot`], // letter after a digit stays lowercase
  [`snake_case-slug`, `Snake_case Slug`], // underscore blocks capitalization
  [`already Capitalized`, `Already Capitalized`],
  [``, ``],
])(`slug_to_title(%j) returns %j`, (slug, expected) => {
  expect(slug_to_title(slug)).toBe(expected)
})

describe(`get_label`, () => {
  test.each([
    [{ label: `Test Label`, value: 42 }, `Test Label`, false],
    [`Simple String`, `Simple String`, false],
    [123, `123`, false],
    [null, `null`, false],
    [undefined, `undefined`, false],
    [{ value: 42, name: `Test` }, undefined, true],
  ])(`handles option %j correctly`, (input, expected, should_log_error) => {
    // spyOn, not assignment: only a spy is undone by the suite's restoreAllMocks,
    // otherwise console.error stays mocked for every later test in the file
    vi.spyOn(console, `error`).mockImplementation(() => {})
    // @ts-expect-error testing runtime behavior with non-Option types
    const result = get_label(input)
    expect(result).toBe(expected)

    if (should_log_error) {
      expect(console.error).toHaveBeenCalledWith(
        `MultiSelect: option is an object but has no label key`,
        JSON.stringify(input),
      )
    } else expect(console.error).not.toHaveBeenCalled()
  })
})

describe(`get_style`, () => {
  test.each([
    [`plain string`, ``],
    [{ style: `color: red` }, `color: red;`],
    [{ style: `color: red;` }, `color: red;`],
    [{ style: `` }, ``],
    [{ style: `   ` }, `   `], // whitespace is preserved, not trimmed
    [{ label: `Test`, value: 42 }, ``],
  ])(`returns correct style for %j`, (option, expected) => {
    // @ts-expect-error testing with mixed types for get_style
    expect(get_style(option)).toBe(expected)
  })

  const option_style: OptionStyle = {
    selected: `color: blue`,
    option: `color: green`,
  }
  // object styles get the same trailing-semicolon normalization as string styles;
  // partial style objects (e.g. only `selected`) are fine, but any key other than
  // `option`/`selected` logs an error, even when a valid key is also present.
  // A null/undefined key selects no sub-style but still validates the style object.
  test.each([
    [option_style, `selected`, `color: blue;`, false],
    [option_style, `option`, `color: green;`, false],
    [{ selected: `color: blue` }, `option`, ``, false], // missing key → empty, no error
    [{}, `option`, ``, false],
    [option_style, null, ``, false],
    [option_style, undefined, ``, false],
    // unknown keys log even when a valid key is also present and selected
    [{ selected: `color: blue`, custom: `color: red` }, `selected`, `color: blue;`, true],
    [{ selected: `color: blue`, custom: `color: red` }, `option`, ``, true],
    [{ invalid_key: `some-style` }, `selected`, ``, true],
    [{ custom: `color: red` }, null, ``, true],
  ] as const)(
    `object style %j with key %s returns %j (logs error: %s)`,
    (style, key, expected, should_log_error) => {
      vi.spyOn(console, `error`).mockImplementation(() => {})
      const option = { label: `test`, style }
      // @ts-expect-error style objects with unknown keys test runtime validation
      expect(get_style(option, key)).toBe(expected)
      if (should_log_error) {
        expect(console.error).toHaveBeenCalledWith(
          `MultiSelect: invalid style object for option`,
          option,
        )
      } else expect(console.error).not.toHaveBeenCalled()
    },
  )

  test(`logs error and returns empty for an invalid key before reading style`, () => {
    vi.spyOn(console, `error`).mockImplementation(() => {})
    // @ts-expect-error invalid key — style is never consulted once the key fails
    expect(get_style({ style: `color: red;` }, `invalid_key`)).toBe(``)
    expect(console.error).toHaveBeenCalledWith(
      `MultiSelect: Invalid key=invalid_key for get_style`,
    )
  })
})

const [mac, linux] = [`Macintosh; Intel Mac OS X 10_15`, `X11; Linux x86_64`]

describe(`keyboard shortcut parsing`, () => {
  afterEach(() => Reflect.deleteProperty(globalThis.navigator, `userAgent`))

  test.each([
    [`+`, { key: `+`, ctrl: false, shift: false, alt: false, meta: false }],
    [`ctrl++`, { key: `+`, ctrl: true, shift: false, alt: false, meta: false }],
    [`ctrl+shift++`, { key: `+`, ctrl: true, shift: true, alt: false, meta: false }],
    [`ctrl+`, { key: ``, ctrl: true, shift: false, alt: false, meta: false }],
    // non-plus keys and the remaining modifiers (alt, meta, cmd alias)
    [`k`, { key: `k`, ctrl: false, shift: false, alt: false, meta: false }],
    [`cmd+k`, { key: `k`, ctrl: false, shift: false, alt: false, meta: true }],
    [`Meta+Alt+X`, { key: `x`, ctrl: false, shift: false, alt: true, meta: true }],
    [`ctrl+shift+k`, { key: `k`, ctrl: true, shift: true, alt: false, meta: false }],
    // spelled-out keys resolve to the `event.key` they stand for, so a combo that
    // survives a split on `+` still matches. `space` never matched before: parts are
    // trimmed, leaving ` ` unspellable any other way.
    [`ctrl+plus`, { key: `+`, ctrl: true, shift: false, alt: false, meta: false }],
    [`ctrl+space`, { key: ` `, ctrl: true, shift: false, alt: false, meta: false }],
    [`shift+comma`, { key: `,`, ctrl: false, shift: true, alt: false, meta: false }],
  ])(`parse_shortcut(%j)`, (shortcut, expected) => {
    expect(parse_shortcut(shortcut)).toEqual(expected)
  })

  // parse_shortcut resolves `mod` itself, so matches_shortcut is correct on its own
  // rather than only when run_hotkeys pre-resolves the binding
  test.each([
    [mac, { meta: true, ctrl: false }],
    [linux, { meta: false, ctrl: true }],
  ])(`parse_shortcut resolves mod per platform (%s)`, (user_agent, expected) => {
    stub_prop(globalThis.navigator, `userAgent`, user_agent)
    expect(parse_shortcut(`mod+shift+k`)).toEqual({
      key: `k`,
      shift: true,
      alt: false,
      ...expected,
    })
  })

  // spelled-out tokens render as the literal `event.key` they stand for
  test(`format_shortcut maps comma/plus/space tokens`, () => {
    expect(format_shortcut(`ctrl+comma+plus+space`)).toEqual([`Ctrl`, `,`, `+`, `␣`])
  })

  test.each([
    [`ctrl++`, { key: `+`, ctrlKey: true }, true],
    [`ctrl++`, { key: `+`, ctrlKey: true, shiftKey: true }, true],
    [`ctrl+shift++`, { key: `+`, ctrlKey: true }, false],
    [`ctrl+`, { key: `+`, ctrlKey: true }, false],
    // the shift escape hatch is plus-only: every other modifier must match exactly
    [`cmd+k`, { key: `K`, metaKey: true }, true], // event key is lowercased
    [`cmd+k`, { key: `k`, metaKey: true, shiftKey: true }, false],
    [`cmd+k`, { key: `k`, ctrlKey: true }, false],
    [`alt+k`, { key: `k`, altKey: true }, true],
  ])(`matches_shortcut(%j) with %j`, (shortcut, event_init, expected) => {
    const event = new KeyboardEvent(`keydown`, event_init)
    expect(matches_shortcut(event, shortcut)).toBe(expected)
  })
})

describe(`shortcut rebinding`, () => {
  afterEach(() => Reflect.deleteProperty(globalThis.navigator, `userAgent`))
  const keydown = (init: KeyboardEventInit) => new KeyboardEvent(`keydown`, init)

  // Here meta is literal; mod is the platform's primary modifier.
  test.each([
    [mac, { key: `k`, metaKey: true }, `mod+k`],
    [linux, { key: `k`, ctrlKey: true }, `mod+k`],
    [mac, { key: `k`, ctrlKey: true }, `ctrl+k`], // Ctrl is its own modifier on a Mac
    [linux, { key: `k`, metaKey: true }, `meta+k`], // ...as is the Windows key elsewhere
    // Libraries aliasing primary as meta must not collapse both-held combinations.
    [linux, { key: `k`, ctrlKey: true, metaKey: true }, `mod+meta+k`],
    [mac, { key: `k`, ctrlKey: true, metaKey: true }, `mod+ctrl+k`],
    // modifier order is fixed regardless of which flags are set
    [mac, { key: `T`, metaKey: true, shiftKey: true, altKey: true }, `mod+alt+shift+t`],
    // keys that would otherwise break a split on `+`
    [linux, { key: `,`, ctrlKey: true }, `mod+comma`],
    [linux, { key: `+`, ctrlKey: true }, `mod+plus`],
    [linux, { key: ` `, altKey: true }, `alt+space`],
    [linux, { key: `ArrowRight`, altKey: true }, `alt+arrowright`],
    [linux, { key: `Escape` }, `escape`], // bare keys are combos too
  ])(`event_to_combo on %s`, (user_agent, init, expected) => {
    stub_prop(globalThis.navigator, `userAgent`, user_agent)
    const event = keydown(init)
    const combo = event_to_combo(event)
    expect(combo).toBe(expected)
    if (expected === `mod+k`) {
      expect(event_to_combo(event, { mod: false })).toBe(
        user_agent === mac ? `meta+k` : `ctrl+k`,
      )
    }
    // A rebinding UI must emit a canonical combo that matches the keydown it recorded.
    for (const round_trip of [combo, event_to_combo(event, { mod: false })]) {
      assert(round_trip !== null)
      expect(round_trip.split(`+`)).not.toContain(``)
      expect(matches_shortcut(event, round_trip)).toBe(true)
      expect(normalize_combo(round_trip)).toBe(round_trip)
      expect(format_shortcut(round_trip)).not.toContain(``)
    }
  })

  test.each([[`Meta`], [`Control`], [`Alt`], [`Shift`], [`CapsLock`], [`AltGraph`]])(
    `event_to_combo(%s) is null while only modifiers are down`,
    (key) => {
      expect(event_to_combo(keydown({ key, shiftKey: true }))).toBeNull()
    },
  )

  test.each([
    [`Ctrl+Shift+K`, `ctrl+shift+k`], // case folded
    [`shift+ctrl+k`, `ctrl+shift+k`], // modifiers reordered
    [`Cmd+K`, `meta+k`], // aliases folded onto one spelling
    [`command+k`, `meta+k`],
    [`control+k`, `ctrl+k`],
    [`option+k`, `alt+k`],
    [`MOD+K`, `mod+k`], // mod is a modifier in its own right, not resolved here
    [`ctrl++`, `ctrl+plus`], // this repo's literal plus spelling, canonicalized
    [`ctrl+plus`, `ctrl+plus`],
    [`ctrl+,`, `ctrl+comma`],
    [`  Alt +  Space `, `alt+space`], // segments are trimmed
    [`escape`, `escape`], // bare key
    [`ctrl+`, null], // no key
    [``, null],
    [`ctrl`, null], // modifiers only
    [`shift+alt`, null],
    [`ctrl+a+b`, null], // two keys
    [`ctrl+capslock`, null], // key that is only ever a modifier
    [`meta+control`, null],
  ])(`normalize_combo(%j) is %j`, (combo, expected) => {
    expect(normalize_combo(combo)).toBe(expected)
  })

  test.each([
    [`mod+k`, `mod+k`],
    [`k`, null], // an unmodified key would swallow ordinary typing
    [`escape`, null],
  ])(`normalize_combo(%j, { require_modifier }) is %j`, (combo, expected) => {
    expect(normalize_combo(combo, { require_modifier: true })).toBe(expected)
  })

  describe(`sanitize_shortcut_overrides`, () => {
    const defaults = { copy: `mod+c`, cut: `mod+x`, paste: `mod+v` }

    test.each([
      [`non-object input`, `mod+c`, {}],
      [`null`, null, {}],
      [`unknown action id`, { nope: `mod+q` }, {}],
      [`non-string combo`, { copy: 42 }, {}],
      [`junk combo`, { copy: `mod+` }, {}],
      [`no-op override`, { copy: `mod+c` }, {}],
      // differently spelled but the same combo is still a no-op
      [`no-op in another spelling`, { copy: `C+MOD` }, {}],
      [`valid override`, { copy: `mod+shift+c` }, { copy: `mod+shift+c` }],
      [`normalizes what it keeps`, { copy: `Shift+MOD+C` }, { copy: `mod+shift+c` }],
      // an override landing on another action's default loses, and so does a pair of
      // overrides landing on each other
      [`collides with a default`, { copy: `mod+v` }, {}],
      [`two overrides collide`, { copy: `mod+q`, cut: `mod+q` }, {}],
      // a straight swap leaves no two actions sharing a combo, so it survives
      [`swap`, { copy: `mod+x`, cut: `mod+c` }, { copy: `mod+x`, cut: `mod+c` }],
      // copy/cut collide, so both are dropped; that frees `mod+c` again, which paste's
      // override had been holding uncontested until copy's default came back
      [`cascading collision`, { copy: `mod+q`, cut: `mod+q`, paste: `mod+c` }, {}],
    ])(`%s`, (_desc, value, expected) => {
      expect(sanitize_shortcut_overrides(value, defaults)).toEqual(expected)
    })

    test(`defaults that already collide do not void unrelated overrides`, () => {
      const clashing = { copy: `mod+c`, cut: `mod+c`, paste: `mod+v` }
      expect(sanitize_shortcut_overrides({ paste: `mod+p` }, clashing)).toEqual({
        paste: `mod+p`,
      })
    })

    // `mod` resolves to the platform's primary modifier, so an override spelling that
    // modifier out lands on the very same keystroke as a `mod` default
    test.each([
      [mac, `meta+x`, {}],
      [mac, `ctrl+x`, { copy: `ctrl+x` }], // Ctrl is its own modifier on a Mac
      [linux, `ctrl+x`, {}],
      [linux, `meta+x`, { copy: `meta+x` }],
    ])(`on %s an override of %j resolves against mod defaults`, (ua, combo, expected) => {
      stub_prop(globalThis.navigator, `userAgent`, ua)
      expect(sanitize_shortcut_overrides({ copy: combo }, defaults)).toEqual(expected)
    })

    test(`survives round-tripping its own output`, () => {
      const once = sanitize_shortcut_overrides({ copy: `MOD+Shift+C` }, defaults)
      expect(sanitize_shortcut_overrides(once, defaults)).toEqual(once)
    })
  })
})

describe(`fuzzy_match`, () => {
  // Index edges live in fuzzy_match_indices; pin the null guard and a thin boolean smoke
  // so the wrapper cannot drift without a failing expected value.
  test.each([
    [null, `test`],
    [undefined, `test`],
    [`test`, null],
    [`test`, undefined],
    [null, null],
  ])(`null/undefined inputs fuzzy_match(%s, %s) are false`, (search, target) => {
    // @ts-expect-error testing runtime behavior with null/undefined
    expect(fuzzy_match(search, target)).toBe(false)
  })

  test.each([
    [`tageoo`, `tasks/geo-opt`, true],
    [`test`, `best`, false],
  ])(`fuzzy_match(%j, %j) is %s`, (search, target, expected) => {
    expect(fuzzy_match(search, target)).toBe(expected)
  })
})

describe(`is_object`, () => {
  test.each([
    [{ key: `value` }, true],
    [[], true], // arrays are objects in JS
    [null, false],
    [`string`, false],
    [() => {}, false],
  ])(`is_object(%j) returns %s`, (input, expected) => {
    expect(is_object(input)).toBe(expected)
  })
})

describe(`has_group`, () => {
  test.each([
    [{ label: `Test`, group: `Group1` }, true],
    [{ label: `Test`, group: `` }, true], // empty string is still a string
    [{ label: `Test` }, false],
    [{ label: `Test`, group: null }, false],
    [{ label: `Test`, group: 123 }, false], // group must be string
    [`plain string`, false],
  ])(`has_group(%j) returns %s`, (input, expected) => {
    // @ts-expect-error testing runtime behavior with non-Option types
    expect(has_group(input)).toBe(expected)
  })
})

describe(`get_option_key`, () => {
  test.each<[Option, unknown]>([
    [{ label: `Apple`, value: 1 }, 1],
    [{ label: `Apple` }, `Apple`], // no value → label
    [{ label: `Apple`, value: undefined }, `Apple`],
    [{ label: `Apple`, value: null }, `Apple`],
    // falsy but defined values are kept (?? only)
    [{ label: `Apple`, value: 0 }, 0],
    [{ label: `Apple`, value: `` }, ``],
    [{ label: `Apple`, value: false }, false],
    [`Apple`, `Apple`], // primitive option is its own key
    [0, 0],
  ])(`get_option_key(%j) returns %j`, (input, expected) => {
    expect(get_option_key(input)).toBe(expected)
  })

  test(`preserves object value identity`, () => {
    const [obj1, obj2] = [{ id: 1 }, { id: 2 }]
    const opt1 = { label: `Item`, value: obj1 }
    const opt2 = { label: `Item`, value: obj2 }
    // Keys are the actual objects, not stringified
    expect(get_option_key(opt1)).toBe(obj1)
    expect(get_option_key(opt2)).toBe(obj2)
    expect(get_option_key(opt1)).not.toBe(get_option_key(opt2))
  })
})

describe(`compute_position`, () => {
  const viewport_cleanups: (() => void)[] = []
  const viewport = (width: number, height: number) =>
    viewport_cleanups.push(
      stub_prop(globalThis, `innerWidth`, width),
      stub_prop(globalThis, `innerHeight`, height),
    )
  afterEach(() => {
    for (const cleanup of viewport_cleanups.splice(0).toReversed()) cleanup()
  })
  const rect = (top: number, height: number, left = 100, width = 200) => ({
    top,
    left,
    bottom: top + height,
    right: left + width,
  })

  test(`keeps the preferred side when the box fits`, () => {
    viewport(1000, 800)
    const box = { width: 200, height: 100 }
    const placed = compute_position(rect(100, 30), box, {
      placement: `bottom`,
      offset: 8,
    })
    expect(placed).toEqual({ top: 138, left: 100, placement: `bottom` })
  })

  test(`flips to the side with room, and center vs start line up differently`, () => {
    viewport(1000, 800)
    const anchor = rect(700, 30) // only 70px below, 700px above
    const box = { width: 300, height: 200 }

    const centered = compute_position(anchor, box, { placement: `bottom` })
    expect(centered.placement).toBe(`top`)
    expect(centered.top).toBe(500) // 700 - 200
    expect(centered.left).toBe(50) // centered on an anchor spanning 100..300

    const aligned = compute_position(anchor, box, { placement: `bottom`, align: `start` })
    expect(aligned.left).toBe(100) // flush with the anchor's left edge
  })

  test.each([
    [`most room below`, 400, 400, rect(10, 20, 190, 20), `bottom`],
    [`most room above`, 400, 400, rect(370, 20, 190, 20), `top`],
    [`most room right`, 400, 400, rect(190, 20, 10, 20), `right`],
    [`most room left`, 400, 400, rect(190, 20, 370, 20), `left`],
    [`a stable four-way tie`, 400, 400, rect(190, 20, 190, 20), `bottom`],
    [`a top/bottom tie`, 400, 400, rect(300, 20, 80, 20), `top`],
    [`a right/left tie`, 600, 200, rect(90, 20, 290, 20), `right`],
  ] as const)(`auto chooses %s`, (_description, width, height, anchor, expected) => {
    viewport(width, height)
    expect(
      compute_position(anchor, { width: 40, height: 40 }, { placement: `auto` })
        .placement,
    ).toBe(expected)
  })

  test(`flip: false pins auto even with no room and explicit fallbacks`, () => {
    viewport(400, 400)
    expect(
      compute_position(
        rect(370, 20, 190, 20), // same anchor the `most room above` row flips to `top`
        { width: 40, height: 40 },
        { placement: `auto`, flip: false, fallback_placements: [`top`, `left`] },
      ).placement,
    ).toBe(`bottom`)
  })

  test(`auto prefers a fitting side over greater unusable clearance`, () => {
    viewport(400, 400)
    expect(
      compute_position(
        rect(180, 20, 50, 20),
        { width: 350, height: 100 },
        { placement: `auto`, shift: false },
      ).placement,
    ).toBe(`bottom`)
  })

  test.each([
    [`aligns the end edge`, `bottom`, { align: `end` }, { top: 140, left: 250 }],
    [`aligns the end edge`, `right`, { align: `end` }, { top: 120, left: 280 }],
    [
      `applies the cross-axis offset`,
      `bottom`,
      { align: `start`, cross_axis_offset: 7 },
      { top: 140, left: 207 },
    ],
    [
      `applies the cross-axis offset`,
      `right`,
      { align: `start`, cross_axis_offset: 7 },
      { top: 107, left: 280 },
    ],
  ] as const)(`%s on %s`, (_description, placement, options, expected) => {
    expect(
      compute_position(
        rect(100, 40, 200, 80),
        { width: 30, height: 20 },
        { placement, ...options, flip: false, shift: false },
      ),
    ).toMatchObject(expected)
  })

  test(`explicit fallback order wins equal overflow inside a custom boundary`, () => {
    const placed = compute_position(
      rect(290, 20, 290, 20),
      { width: 300, height: 300 },
      {
        placement: `auto`,
        boundary: { top: 100, left: 100, right: 500, bottom: 500 },
        padding: 10,
        fallback_placements: [`right`, `top`, `left`],
        shift: false,
      },
    )
    expect(placed.placement).toBe(`right`)
  })

  test.each([
    [`keeps a named placement ahead of its fallbacks`, rect(180, 20, 200, 40), `left`],
    [
      `takes the fallbacks in order once the named side has no room`,
      rect(180, 20, 10, 40),
      `right`,
    ],
  ] as const)(`%s`, (_description, anchor, expected) => {
    viewport(400, 400)
    expect(
      compute_position(
        anchor,
        { width: 100, height: 100 },
        { placement: `left`, fallback_placements: [`right`, `top`], shift: false },
      ).placement,
    ).toBe(expected)
  })

  test(`offset and boundary padding count toward fallback overflow`, () => {
    const placed = compute_position(
      rect(110, 20, 90, 20),
      { width: 50, height: 50 },
      {
        placement: `auto`,
        boundary: { top: 0, left: 0, right: 200, bottom: 200 },
        padding: 10,
        offset: 15,
        flip: [`bottom`, `top`],
        shift: false,
      },
    )
    expect(placed.placement).toBe(`top`)
  })

  test(`shift pulls the box back inside the viewport, padding included`, () => {
    viewport(400, 800)
    const anchor = rect(100, 30, 380, 20) // near the right edge
    const box = { width: 300, height: 100 }

    // flip off, else the box would simply move to the anchor's left where it fits
    const opts = { placement: `bottom`, padding: 8, flip: false } as const
    expect(compute_position(anchor, box, opts)).toEqual({
      top: 130,
      left: 92, // 400 - 300 - 8
      placement: `bottom`,
    })
    // centered, hanging off the right edge
    expect(compute_position(anchor, box, { ...opts, shift: false })).toEqual({
      top: 130,
      left: 240,
      placement: `bottom`,
    })
  })

  test(`custom boundaries clamp shifted coordinates`, () => {
    expect(
      compute_position(
        rect(200, 20, 480, 20),
        { width: 200, height: 100 },
        {
          placement: `bottom`,
          align: `start`,
          boundary: { top: 100, left: 100, right: 500, bottom: 500 },
          padding: 10,
          flip: false,
        },
      ),
    ).toEqual({ top: 220, left: 290, placement: `bottom` })
  })

  test(`oversize boxes retain minimum-overflow cross-axis alignment`, () => {
    viewport(100, 100)
    expect(
      compute_position(
        rect(40, 20, 40, 20),
        { width: 200, height: 200 },
        { placement: `bottom`, padding: 10, flip: false },
      ),
    ).toEqual({ top: 10, left: -50, placement: `bottom` })
  })

  // The portalled dropdown used to carry its own above/below rule. Its replacement
  // has to agree everywhere, including with the anchor scrolled out of view.
  test(`reproduces the dropdown's above/below rule across a grid`, () => {
    const view_height = 800
    viewport(1000, view_height)
    const legacy_place_above = (
      anchor: { top: number; bottom: number },
      height: number,
    ) =>
      height > 0 &&
      anchor.bottom + height > view_height &&
      anchor.top > view_height - anchor.bottom

    const mismatches: string[] = []
    for (const top of [-200, -30, 0, 50, 400, 700, 780, 900]) {
      for (const anchor_height of [0, 30, 120]) {
        for (const box_height of [1, 50, 200, 600, 1200]) {
          const anchor = rect(top, anchor_height)
          const { placement } = compute_position(
            anchor,
            { width: 200, height: box_height },
            { placement: `auto`, align: `start`, flip: [`bottom`, `top`], shift: false },
          )
          const expected = legacy_place_above(anchor, box_height) ? `top` : `bottom`
          if (placement !== expected) {
            mismatches.push(`top=${top} h=${anchor_height} box=${box_height}`)
          }
        }
      }
    }
    expect(mismatches).toEqual([])
  })
})

describe(`chain_handlers`, () => {
  test.each([
    [
      [`a`, null, `b`],
      [`a`, `b`],
    ],
    [[undefined, `a`], [`a`]],
    [[null, undefined], []],
  ])(`runs %s in order, skipping nullish`, (names, expected) => {
    const calls: string[] = []
    const handlers = names.map((name) => (name == null ? name : () => calls.push(name)))
    chain_handlers(...handlers)(new MouseEvent(`click`))
    expect(calls).toEqual(expected)
  })

  test(`passes the same event to every handler`, () => {
    const event = new MouseEvent(`click`)
    const seen: unknown[] = []
    chain_handlers(
      (evt: MouseEvent) => seen.push(evt),
      (evt: MouseEvent) => seen.push(evt),
    )(event)
    expect(seen).toEqual([event, event])
  })

  // documents a real hazard: an internal handler that throws swallows the consumer's
  test(`a throwing handler stops the chain`, () => {
    const later = vi.fn()
    const boom = () => {
      throw new Error(`boom`)
    }
    expect(() => chain_handlers(boom, later)(new MouseEvent(`click`))).toThrow(`boom`)
    expect(later).not.toHaveBeenCalled()
  })
})

describe(`values_equal`, () => {
  // MultiSelect syncs `value`/`selected` through this on every change, so a false
  // negative is an assignment loop against a wrapper that clones arrays (#309, #369)
  const same_items = [{ id: 1 }]
  test.each([
    [`null vs undefined`, null, undefined, true],
    [`null vs empty array`, null, [], true],
    [`undefined vs empty array`, undefined, [], true],
    [`empty vs non-empty array`, [], [`a`], false],
    [`same items in order`, [`a`, `b`], [`a`, `b`], true],
    [`same items reordered`, [`a`, `b`], [`b`, `a`], false],
    [`different lengths`, [`a`], [`a`, `b`], false],
    [`equal objects compared by identity`, [{ id: 1 }], [{ id: 1 }], false],
    [`same array reference`, same_items, same_items, true],
    [`equal primitives`, 3, 3, true],
    [`primitive vs array`, 3, [3], false],
    [`zero vs empty array`, 0, [], false], // 0 is a real value, not an empty state
    [`empty string vs empty array`, ``, [], false],
  ] as const)(`%s`, (_desc, val1, val2, expected) => {
    expect(values_equal(val1, val2)).toBe(expected)
    expect(values_equal(val2, val1)).toBe(expected) // symmetric
  })
})

describe(`fuzzy_match_indices`, () => {
  // Indices must stay offsets into the original target even when matching runs against
  // a whitespace-normalized copy (highlight spans depend on that).
  test.each([
    [`abc`, `abc`, [0, 1, 2]],
    [`ac`, `abc`, [0, 2]], // subsequence, not substring
    [`tageoo`, `tasks/geo-opt`, [0, 1, 6, 7, 8, 10]],
    [`AB`, `ab`, [0, 1]], // case-insensitive both ways
    [`ab`, `AB`, [0, 1]],
    [`ba`, `abc`, null], // order matters
    [`abcd`, `abc`, null],
    [``, `abc`, []], // empty search matches with no indices
    [``, ``, []],
    [`a`, ``, null],
    [`aa`, `aba`, [0, 2]], // repeats consume distinct positions
    [`aa`, `ab`, null],
    [`hello`, `h-e-l-l-o`, [0, 2, 4, 6, 8]],
    [`hello`, `h-e-l-o`, null],
    [`abc`, `a-b-c`, [0, 2, 4]],
    [`aaa`, `banana`, [1, 3, 5]],
    [`aaaa`, `banana`, null],
    [`test`, `testing`, [0, 1, 2, 3]],
    [`test`, `best`, null],
    [`@`, `@user`, [0]],
    [`#`, `#hashtag`, [0]],
    [`/`, `path/to/file`, [4]],
    [`123`, `abc123def`, [3, 4, 5]],
    [`ñ`, `niño`, [2]],
    [`中文`, `中文测试`, [0, 1]],
    [`a  b`, `a b`, [0, 1, 2]], // a run in the search collapses to a single space
    [`a b`, `a\tb`, [0, 1, 2]], // any target whitespace reads as a plain space
    [`a\tb`, `a b`, [0, 1, 2]], // ...and so does any search whitespace
    [`a b`, `a  b`, [0, 1, 3]], // target runs are not collapsed, so `b` stays at 3
    [`a b`, `a\u00A0b`, [0, 1, 2]],
    [`a b c`, `a\t\nb  c`, [0, 1, 3, 4, 6]],
    [`form submit`, `form\n submit`, [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11]],
  ])(`(%j, %j)`, (search, target, expected) => {
    expect(fuzzy_match_indices(search, target)).toEqual(expected)
  })
})

describe(`is_editable_event_target`, () => {
  afterEach(() => {
    document.body.innerHTML = ``
  })

  test.each([
    [`<input />`, `input`, true],
    [`<textarea></textarea>`, `textarea`, true],
    [`<select></select>`, `select`, true],
    [`<div contenteditable="true"></div>`, `div`, true],
    [`<div contenteditable=""></div>`, `div`, true],
    [`<div contenteditable="false"></div>`, `div`, false],
    [`<div></div>`, `div`, false],
    [`<button></button>`, `button`, false], // a button is focusable, not editable
    // closest() walks up, so a span inside an editable region counts as typing
    [`<div contenteditable="true"><span></span></div>`, `span`, true],
    [`<div contenteditable="false"><span></span></div>`, `span`, false],
  ])(`%s -> %s`, (html, selector, expected) => {
    document.body.innerHTML = html
    expect(is_editable_event_target(doc_query(selector))).toBe(expected)
  })

  test.each([[null], [new EventTarget()]])(`non-Element target %j is false`, (target) => {
    expect(is_editable_event_target(target)).toBe(false)
  })
})

describe(`is_modifier_chord`, () => {
  // Shift is excluded on purpose: it types capitals, so `shift+a` is still typing
  test.each([
    [{ altKey: true }, true],
    [{ ctrlKey: true }, true],
    [{ metaKey: true }, true],
    [{ shiftKey: true }, false],
    [{}, false],
    [{ shiftKey: true, ctrlKey: true }, true],
  ])(`%j -> %s`, (init, expected) => {
    expect(is_modifier_chord(new KeyboardEvent(`keydown`, init))).toBe(expected)
  })
})

describe(`format_cmd_metadata`, () => {
  test.each([
    [[`a`, `b`], `a · b`],
    [[], ``],
    [`plain`, `plain`],
    [undefined, ``],
  ])(`%j -> %j`, (metadata, expected) => {
    expect(format_cmd_metadata(metadata)).toBe(expected)
  })
})

describe(`cmd_action_matches`, () => {
  const action: CmdAction = {
    label: `Toggle theme`,
    action: () => {},
    description: `Switch between light and dark`,
    badge: `New`,
    group: `Appearance`,
    keywords: [`color`, `scheme`],
    metadata: [`site`, `chrome`],
    shortcut: `mod+j`,
  }

  // one term per field so dropping any field from the haystack fails this case
  test.each([
    [`toggle`],
    [`dark`],
    [`new`],
    [`appearance`],
    [`color`],
    [`chrome`],
    [`mod+j`],
  ])(`matches haystack term %j`, (search) => {
    expect(cmd_action_matches(action, search)).toBe(true)
  })

  // every term must hit; blank search filters nothing out
  test.each([
    [`toggle appearance`, true],
    [`toggle nonsense`, false],
    [`   `, true],
    [``, true],
  ])(`multi-term search %j -> %s`, (search, expected) => {
    expect(cmd_action_matches(action, search)).toBe(expected)
  })

  test.each([
    [`tgtm`, true, true], // subsequence of "toggle theme", fuzzy only
    [`tgtm`, false, false],
    [`toggle`, false, true], // substring still matches with fuzzy off
  ])(`%j with fuzzy=%s -> %s`, (search, fuzzy, expected) => {
    expect(cmd_action_matches(action, search, fuzzy)).toBe(expected)
  })

  test(`an action with only a label does not throw on absent fields`, () => {
    const bare: CmdAction = { label: `Bare`, action: () => {} }
    expect(cmd_action_matches(bare, `bare`)).toBe(true)
    expect(cmd_action_matches(bare, `missing`)).toBe(false)
  })
})

describe(`step_focus`, () => {
  let items: HTMLButtonElement[] = []
  beforeEach(() => {
    document.body.innerHTML = `<button>0</button><button>1</button><button>2</button>`
    items = [...document.querySelectorAll(`button`)]
  })
  afterEach(() => {
    document.body.innerHTML = ``
  })

  const press = (key: string, options?: { horizontal?: boolean }) => {
    const event = new KeyboardEvent(`keydown`, { key, cancelable: true })
    const target = step_focus(event, items, options)
    return { target, event }
  }

  // -1 is focus entering from outside the list: each key lands where it implies
  test.each([
    [-1, `ArrowDown`, 0],
    [-1, `ArrowUp`, 2],
    [-1, `Home`, 0],
    [-1, `End`, 2],
    [0, `ArrowDown`, 1],
    [0, `ArrowUp`, 2], // wraps backward off the first item
    [2, `ArrowDown`, 0], // wraps forward off the last
    [1, `Home`, 0],
    [1, `End`, 2],
  ])(`from idx %s, %s focuses idx %s`, (from, key, expected) => {
    if (from >= 0) items[from].focus()
    const { target, event } = press(key)
    expect(target).toBe(items[expected])
    expect(document.activeElement).toBe(items[expected])
    expect(event.defaultPrevented).toBe(true)
  })

  // Left/Right are opt-in so a vertical menu leaves them to the page's own handling
  test.each([
    [`ArrowRight`, false, undefined],
    [`ArrowLeft`, false, undefined],
    [`ArrowRight`, true, 1],
    [`ArrowLeft`, true, 2],
  ])(`%s with horizontal=%s`, (key, horizontal, expected) => {
    items[0].focus()
    const { target, event } = press(key, { horizontal })
    expect(target).toBe(expected === undefined ? undefined : items[expected])
    expect(event.defaultPrevented).toBe(expected !== undefined)
  })

  // same early-return branch for every non-nav key; keep a menu key and a nav-like miss
  test.each([`Tab`, `PageDown`])(`leaves %s untouched`, (key) => {
    items[0].focus()
    const { target, event } = press(key)
    expect(target).toBeUndefined()
    expect(event.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(items[0])
  })

  // an empty list must not preventDefault, or a menu with no items would swallow arrows
  test(`an empty list is a no-op that leaves the event alone`, () => {
    items = []
    const { target, event } = press(`ArrowDown`)
    expect(target).toBeUndefined()
    expect(event.defaultPrevented).toBe(false)
  })
})

describe(`observe_subtree`, () => {
  const flush = () => new Promise((resolve) => queueMicrotask(() => resolve(null)))

  test(`coalesces a burst of mutations into one deferred call`, async () => {
    const root = document.createElement(`div`)
    document.body.append(root)
    const refresh = vi.fn()
    const stop = observe_subtree(root, [`data-key`], refresh)

    // the caller owns the first pass, so that `$effect(refresh)` can run it while tracking
    expect(refresh).not.toHaveBeenCalled()

    const child = document.createElement(`span`)
    root.append(child)
    child.setAttribute(`data-key`, `radius`)
    root.append(document.createElement(`b`))
    expect(refresh).not.toHaveBeenCalled() // deferred, not synchronous
    await flush()
    expect(refresh).toHaveBeenCalledOnce()

    child.setAttribute(`data-key`, `diameter`)
    await flush()
    expect(refresh).toHaveBeenCalledTimes(2)

    // attributes outside the filter, and anything at all after teardown, are ignored
    child.setAttribute(`data-label`, `Diameter`)
    await flush()
    expect(refresh).toHaveBeenCalledTimes(2)

    child.setAttribute(`data-key`, `radius`)
    stop()
    await flush()
    expect(refresh).toHaveBeenCalledTimes(2)
    root.remove()
  })

  test.each([
    [`ignores text edits by default`, undefined, 0],
    [`refreshes when text watching is enabled`, true, 1],
  ] as const)(`%s`, async (_description, watch_text, calls) => {
    const root = document.createElement(`div`)
    const text_node = document.createTextNode(`before`)
    root.append(text_node)
    document.body.append(root)
    const refresh = vi.fn()
    const stop = observe_subtree(root, [], refresh, watch_text)

    text_node.nodeValue = `after`
    await flush()
    expect(refresh).toHaveBeenCalledTimes(calls)

    stop()
    root.remove()
  })
})
