import {
  create_recent_list,
  persisted_choice,
  storage_get,
  storage_get_json,
  storage_get_size,
  storage_remove,
  storage_set,
  storage_set_json,
} from '$lib/storage'
import { describe, expect, test, vi } from 'vitest'

describe(`storage_get/set/remove`, () => {
  test(`round-trips values through localStorage`, () => {
    storage_set(`key`, `value`)
    expect(storage_get(`key`)).toBe(`value`)
    expect(localStorage.getItem(`key`)).toBe(`value`)
    storage_remove(`key`)
    expect(storage_get(`key`)).toBeNull()
  })

  test.each([
    [`getItem`, () => storage_get(`k`), null],
    [`setItem`, () => storage_set(`k`, `v`), undefined],
    [`removeItem`, () => storage_remove(`k`), undefined],
  ] as const)(
    `%s throwing (quota/private mode) is swallowed`,
    (method, run, expected) => {
      // Spied on the instance, not Storage.prototype: happy-dom's localStorage carries
      // its own methods, so a prototype mock never fires.
      const spy = vi.spyOn(globalThis.localStorage, method).mockImplementation(() => {
        throw new DOMException(`QuotaExceededError`)
      })
      expect(run()).toBe(expected)
      spy.mockRestore()
    },
  )

  test.each([
    [`corrupt JSON`, `{not json`, { ok: true }],
    [`nothing stored`, null, { ok: true }],
    // Wrong-shaped JSON stays unknown rather than adopting the fallback's type.
    [`a payload of another shape`, `[1,2,3]`, [1, 2, 3]],
  ])(`storage_get_json on %s`, (_case, stored, expected) => {
    if (stored !== null) localStorage.setItem(`test.json`, stored)
    expect(storage_get_json(`test.json`, { ok: true })).toEqual(expected)
  })

  test(`storage_get_json makes the caller narrow before using the value`, () => {
    localStorage.setItem(`test.json`, `{"ok":true}`)
    // @ts-expect-error the fallback must not assert a shape; narrow like is_valid instead
    const typed: { ok: boolean } = storage_get_json(`test.json`, { ok: false })
    expect(typed.ok).toBe(true)
  })

  const cyclic: { self?: object } = {}
  cyclic.self = cyclic
  test.each([
    [`cyclic value`, cyclic],
    [`undefined toJSON result`, { toJSON: () => undefined }],
  ])(`storage_set_json skips %s`, (case_name, value) => {
    expect(() => storage_set_json(case_name, value)).not.toThrow()
    expect(storage_get(case_name)).toBeNull()
  })
})

describe(`storage_get_size`, () => {
  test.each([
    [`a valid size`, JSON.stringify({ w: 320, h: 240 }), { w: 320, h: 240 }],
    [`a non-finite extent`, JSON.stringify({ w: null, h: 240 }), null],
    [`a missing extent`, JSON.stringify({ w: 320 }), null],
    [`a non-object payload`, `42`, null],
    [`nothing stored`, null, null],
  ])(`reads back %s`, (_case, stored, expected) => {
    if (stored !== null) localStorage.setItem(`test.size`, stored)
    expect(storage_get_size(`test.size`)).toEqual(expected)
  })
})

describe(`create_recent_list`, () => {
  type Item = { id: string; label?: string }
  const item_config = {
    key_of: (item: Item) => item.id,
    is_valid: (value: unknown): value is Item =>
      typeof value === `object` &&
      value !== null &&
      `id` in value &&
      typeof value.id === `string`,
  }
  const list = create_recent_list<Item>({
    storage_key: `test.recent`,
    max_items: 3,
    ...item_config,
  })

  test(`remember prepends, dedupes, persists, and evicts the oldest entry`, () => {
    let items = list.remember({ id: `a` }, [])
    items = list.remember({ id: `b` }, items)
    expect(items.map((item) => item.id)).toEqual([`b`, `a`])

    items = list.remember({ id: `a`, label: `renamed` }, items)
    expect(items).toEqual([{ id: `a`, label: `renamed` }, { id: `b` }])
    for (const id of [`c`, `d`]) items = list.remember({ id }, items)
    expect(items.map((item) => item.id)).toEqual([`d`, `c`, `a`])
    expect(JSON.parse(localStorage.getItem(`test.recent`) ?? ``)).toEqual(items)
  })

  test(`forget removes by key and restore undoes at the original index`, () => {
    let items: Item[] = []
    for (const id of [`c`, `b`, `a`]) items = list.remember({ id }, items)
    // items = [a, b, c]; forget the middle one
    items = list.forget(`b`, items)
    expect(items.map((item) => item.id)).toEqual([`a`, `c`])

    items = list.restore({ id: `b` }, 1, items)
    expect(items.map((item) => item.id)).toEqual([`a`, `b`, `c`])
  })

  test.each([
    [-5, [`x`, `a`, `b`]], // negative index clamps to front
    [99, [`a`, `b`, `x`]], // past-end index clamps to back
  ])(`restore clamps out-of-range index %i`, (index, expected) => {
    const items: Item[] = [{ id: `a` }, { id: `b` }]
    expect(list.restore({ id: `x` }, index, items).map((item) => item.id)).toEqual(
      expected,
    )
  })

  test.each([
    [`corrupt JSON`, `{not json`],
    [`non-array JSON`, `{"id":"a"}`],
  ])(`load returns [] for %s`, (_case, stored) => {
    localStorage.setItem(`test.recent`, stored)
    expect(list.load()).toEqual([])
  })

  test(`load drops entries failing is_valid but keeps the rest`, () => {
    localStorage.setItem(
      `test.recent`,
      JSON.stringify([{ id: `a` }, { id: 42 }, null, `nope`, { id: `b` }]),
    )
    expect(list.load()).toEqual([{ id: `a` }, { id: `b` }])
  })

  test(`load keeps the newest item per key and caps oversized stored lists`, () => {
    localStorage.setItem(
      `test.recent`,
      JSON.stringify([
        { id: `a`, label: `newest` },
        { id: `b` },
        { id: `a`, label: `stale duplicate` },
        { id: `c` },
        { id: `d` },
      ]),
    )
    expect(list.load()).toEqual([{ id: `a`, label: `newest` }, { id: `b` }, { id: `c` }])
  })

  test.each([-1, 1.5])(`rejects invalid max_items=%s`, (max_items) => {
    expect(() =>
      create_recent_list<Item>({
        storage_key: `test.invalid-limit`,
        max_items,
        ...item_config,
      }),
    ).toThrow(RangeError)
  })
})

describe(`persisted_choice`, () => {
  test.each([
    [`stored valid option`, `treemap`, `treemap`],
    [`stored stale/garbage option`, `piechart`, `sunburst`],
    [`nothing stored`, null, `sunburst`],
  ])(`%s`, (_case, stored, expected) => {
    if (stored !== null) localStorage.setItem(`test.choice`, stored)
    expect(persisted_choice(`test.choice`, [`sunburst`, `treemap`], `sunburst`)).toBe(
      expected,
    )
  })
})
