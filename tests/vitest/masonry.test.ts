import { Masonry } from '$lib'
import { order_options as ALL_ORDER_MODES } from '$lib/utils'
import { type ComponentProps, mount, tick } from 'svelte'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { doc_query } from './index'
import MasonryAppendHarness from './MasonryAppendHarness.svelte'

const mount_masonry = (props: ComponentProps<typeof Masonry>) =>
  mount(Masonry, { target: document.body, props })

// most harness tests only use append/remove/set_cols, so `events` defaults to a throwaway
const mount_harness = (
  props: ComponentProps<typeof MasonryAppendHarness> = { events: [] },
) => mount(MasonryAppendHarness, { target: document.body, props })

const n_items = 30
const make_items = (count: number) => Array.from({ length: count }, (_, idx) => idx)
const indices = make_items(n_items)

const masonry_el = () => document.querySelector<HTMLElement>(`div.masonry`)
const col_els = () => document.querySelectorAll<HTMLElement>(`div.masonry > div.col`)
// item wrappers (`> div`) vs any child (`> *`) - the latter also counts default spans
const item_els = () =>
  document.querySelectorAll<HTMLElement>(`div.masonry > div.col > div`)
const child_els = () => document.querySelectorAll(`div.masonry > div.col > *`)

const get_col_dist = () =>
  Array.from(col_els()).map((col) =>
    Array.from(col.children).map((child) => child.textContent),
  )
// Rendered layout as a readable string, e.g. `0,3,6 | 1,4 | 2,5` for 3 columns
const as_columns = () =>
  get_col_dist()
    .map((col) => col.join(`,`))
    .join(` | `)
const resize_observers = new Map<Element, ResizeObserverCallback>()
// number for a uniform height, or a function to give each item its own measured height
let mock_height: number | ((el: Element) => number) = 100
const measured_height = (el: Element): number =>
  typeof mock_height === `number` ? mock_height : mock_height(el)

const mock_resize_entry = (target: Element): ResizeObserverEntry => ({
  target,
  contentRect: new DOMRect(0, 0, 0, 0),
  borderBoxSize: [],
  contentBoxSize: [],
  devicePixelContentBoxSize: [],
})

let observers_created = 0
globalThis.ResizeObserver = class ResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback
  // disconnect() must untrack everything this instance observed, like the real API
  private readonly targets = new Set<Element>()
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    observers_created += 1
  }
  observe(target: Element): void {
    this.targets.add(target)
    resize_observers.set(target, this.callback)
    Object.defineProperty(target, `offsetHeight`, {
      value: measured_height(target),
      configurable: true,
    })
    this.callback([mock_resize_entry(target)], this)
  }
  unobserve(target: Element): void {
    this.targets.delete(target)
    resize_observers.delete(target)
  }
  disconnect(): void {
    for (const target of this.targets) resize_observers.delete(target)
    this.targets.clear()
  }
}

beforeEach(() => {
  resize_observers.clear()
  mock_height = 100
})

const scroll_to = async (scroll_top: number) => {
  const masonry = doc_query(`div.masonry`)
  Object.defineProperty(masonry, `scrollTop`, { value: scroll_top, configurable: true })
  masonry.dispatchEvent(new Event(`scroll`))
  await new Promise(requestAnimationFrame)
  await tick()
}

const mount_virtualized = (count: number, overrides = {}) => {
  document.body.innerHTML = ``
  mount_masonry({
    items: make_items(count),
    virtualize: true,
    height: 300,
    calc_cols: () => 2,
    masonry_width: 500,
    ...overrides,
  })
}

describe(`Masonry`, () => {
  test.each([true, false])(`renders items with animate=%s`, (animate) => {
    mock_height = 0
    const get_estimated_height = vi.fn(() => 150)
    mount_masonry({ items: indices, animate, order: `row-first`, get_estimated_height })
    expect(child_els()).toHaveLength(n_items)
    expect(get_estimated_height).not.toHaveBeenCalled()
  })

  test.each([
    [`foo`, `bar`, /masonry foo/u, /col col-\d+ bar/u],
    [``, ``, /^masonry\s+svelte-\w+/u, /col col-\d+\s+svelte-\w+/u],
  ])(`applies class=%j and column_props.class=%j`, (cls, col_cls, div_re, col_re) => {
    mount_masonry({ items: indices, class: cls, column_props: { class: col_cls } })
    expect(masonry_el()?.className).toMatch(div_re)
    expect(col_els()[0]?.className).toMatch(col_re)
  })

  test(`merges container attributes and style with layout and spreads column_props`, async () => {
    const style = `background-color: darkblue;`
    const column_style = `border: 1px solid red;`
    mount_masonry({
      items: [1, 2],
      style,
      column_props: { style: column_style, 'data-testid': `col`, role: `list` },
      max_col_width: 150,
      gap: 5,
      'data-testid': `my-masonry`,
      'aria-label': `Image gallery`,
    })
    // container: user style merges with (not clobbers) the layout styles; display is inline
    // so CSS resets can't break the layout (svelte-bricks#48)
    const masonry = masonry_el()
    expect(masonry?.getAttribute(`data-testid`)).toBe(`my-masonry`)
    expect(masonry?.getAttribute(`aria-label`)).toBe(`Image gallery`)
    expect(masonry?.getAttribute(`style`)).toContain(style)
    expect(masonry?.style.display).toBe(`flex`)
    expect(masonry?.style.boxSizing).toBe(`border-box`)
    // every column: column_props style merges with the style: directives, arbitrary attrs pass through
    for (const col of col_els()) {
      expect(col.getAttribute(`style`)).toContain(column_style)
      expect(col.style.display).toBe(`grid`)
      expect(col.style.gap).toBe(`5px`)
      expect(col.style.maxWidth).toBe(`150px`)
      expect(col.getAttribute(`data-testid`)).toBe(`col`)
      expect(col.getAttribute(`role`)).toBe(`list`)
    }
  })

  test.each([
    [370, 50, 10, 6], // normal case
    [100, 50, 0, 2], // gap=0
    [200, 100, 50, 1], // large gap forces single column
    [500, 100, 10, 4], // exact fit
    [109, 100, 10, 1], // just under 2 columns
    [110, 100, 10, 1], // exactly at boundary (needs 220 for 2 cols)
    [220, 100, 10, 2], // exactly 2 columns
  ])(
    `calculates columns: width=%d, min_col=%d, gap=%d -> %d cols`,
    (width, min_col_width, gap, expected) => {
      mount_masonry({ items: indices, masonry_width: width, min_col_width, gap })
      expect(col_els()).toHaveLength(expected)
    },
  )

  test.each([
    [
      { min_col_width: 50, max_col_width: 40 },
      `max_col_width (40) < min_col_width (50).`,
    ],
    [
      { virtualize: true },
      `virtualize=true requires a height prop. Falling back to 400px.`,
    ],
  ])(`warns exactly once for %o`, (props, message) => {
    const warn = vi.spyOn(console, `warn`).mockImplementation(() => {})
    mount_masonry({ items: indices, ...props })
    expect(warn).toHaveBeenCalledExactlyOnceWith(`Masonry: ${message}`)
  })

  test(`throws a descriptive error if an item has no usable id`, () => {
    expect(() => mount_masonry({ items: [{ name: `no id` }] })).toThrow(
      `Masonry: item["id"] is undefined, expected string | number (or pass get_id). Item: {"name":"no id"}`,
    )
  })

  test.each([`key`, `uuid`])(`keys items by id_key=%s`, (id_key) => {
    mount_masonry({ items: [{ [id_key]: 1 }, { [id_key]: 2 }], id_key })
    expect(item_els()).toHaveLength(2)
  })

  test(`uses custom get_id function`, () => {
    // Masonry's props type the item as unknown, so narrow inside the callback
    const get_id = vi.fn((item: unknown) => (item as { x: number }).x)
    mount_masonry({ items: [{ x: 1 }, { x: 2 }], get_id })
    expect(get_id).toHaveBeenCalled()
    expect(item_els()).toHaveLength(2)
  })

  test(`uses custom calc_cols and adds col-N classes`, () => {
    const calc_cols = vi.fn<() => number>(() => 3)
    mount_masonry({ items: indices, calc_cols, masonry_width: 500 })
    expect(calc_cols).toHaveBeenCalled()
    const columns = col_els()
    expect(columns).toHaveLength(3)
    columns.forEach((col, idx) => expect(col.classList).toContain(`col-${idx}`))
  })

  // masonry_width=0 is SSR: without initial_cols it renders the max columns for a 1930px
  // screen, hidden by container queries; every source is capped at items.length
  test.each([
    [{ min_col_width: 200, gap: 10 }, indices, Math.floor(1930 / 210)],
    [{ min_col_width: 100 }, [1, 2, 3], 3],
    [{ initial_cols: 4 }, indices, 4],
    [{ initial_cols: 99 }, indices, n_items],
    [{ calc_cols: (): number => 40 }, indices, 40],
    [{ initial_cols: 4, masonry_width: 500, calc_cols: (): number => 2 }, indices, 2],
  ])(`resolves column count from %o`, (props, items, expected) => {
    mount_masonry({ items, masonry_width: 0, ...props })
    expect(col_els()).toHaveLength(expected)
  })

  test.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    `throws for invalid initial_cols=%s even after width is measured`,
    (initial_cols) => {
      expect(() =>
        mount_masonry({ items: indices, initial_cols, masonry_width: 500 }),
      ).toThrow(`Masonry: initial_cols must be a positive integer when provided`)
    },
  )

  test.each(
    [[], indices].flatMap((items) =>
      [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, ...(items.length ? [0] : [])].map(
        (cols) => ({ items, cols }),
      ),
    ),
  )(`rejects invalid calc_cols=$cols for $items`, ({ items, cols }) => {
    expect(() =>
      mount_masonry({ items, calc_cols: () => cols, masonry_width: 500 }),
    ).toThrow(`Masonry: calc_cols must return a positive integer`)
  })

  test.each([0, 2])(`accepts %s columns when there is nothing to place`, (cols) => {
    expect(() =>
      mount_masonry({ items: [], calc_cols: () => cols, masonry_width: 500 }),
    ).not.toThrow()
  })

  test(`injects named container query CSS into <head>`, () => {
    mount_masonry({ items: indices, min_col_width: 200, gap: 10 })
    const masonry = masonry_el()
    const masonry_id = masonry?.getAttribute(`data-masonry-id`)
    if (!masonry || !masonry_id) throw new Error(`masonry or data-masonry-id missing`)
    // the queries below target this named container
    expect(getComputedStyle(masonry).containerName).toBe(`masonry`)
    expect(getComputedStyle(masonry).containerType).toBe(`inline-size`)
    const head_styles = Array.from(document.head.querySelectorAll(`style`))
    const container_css = head_styles.find((style_el) =>
      style_el.textContent.includes(`[data-masonry-id="${masonry_id}"]`),
    )?.textContent
    expect(container_css).toContain(`@container masonry`)
    expect(container_css).toContain(`[data-masonry-id="${masonry_id}"] > .col:nth-child`)
    expect(container_css).not.toContain(`.masonry > .col:nth-child`)
    expect(container_css).toContain(`display: none !important`)
    // no unnamed @container queries should remain (regression guard for #56)
    expect(container_css).not.toMatch(/@container\s*\(/u)
    // styles must be in <head> not <body> to avoid flash on SSR first paint
    const body_container_styles = Array.from(
      document.body.querySelectorAll(`style`),
    ).filter((style_el) => style_el.textContent.includes(`@container`))
    expect(body_container_styles).toHaveLength(0)
  })

  test(`binds div and masonry_height`, async () => {
    let bound_div: HTMLDivElement | undefined
    let bound_height = 0
    const fake_height = function (this: HTMLElement) {
      return this.classList.contains(`masonry`) ? 250 : 0
    }
    vi.spyOn(HTMLElement.prototype, `clientHeight`, `get`).mockImplementation(fake_height)
    mount_masonry({
      items: [1, 2],
      get div() {
        return bound_div
      },
      set div(val: HTMLDivElement | undefined) {
        bound_div = val
      },
      get masonry_height() {
        return bound_height
      },
      set masonry_height(val: number) {
        bound_height = val
      },
    })
    await tick()
    expect(bound_div?.classList).toContain(`masonry`)
    expect(bound_height).toBe(250)
  })

  test(`renders string items as spans with correct content`, () => {
    const items = [`apple`, `banana`, `cherry`, `date`, `elderberry`, `fig`]
    mount_masonry({ items, masonry_width: 500, min_col_width: 200 })
    const spans = document.querySelectorAll(`div.masonry > div.col > div > span`) // default rendering
    expect(spans).toHaveLength(items.length)
    // balanced-stable alternates equal-height items across 2 columns; DOM order is by column
    expect(Array.from(spans).map((span) => span.textContent)).toEqual([
      `apple`,
      `cherry`,
      `elderberry`,
      `banana`,
      `date`,
      `fig`,
    ])
  })
})

describe(`Masonry order modes`, () => {
  test.each([
    // Rounded card heights from diagrams.janosh.dev at a six-column viewport.
    [
      `gallery`,
      [
        272, 387, 474, 478, 352, 318, 270, 431, 439, 417, 376, 218, 379, 262, 470, 241,
        287, 321, 420, 410, 342, 313, 397, 255,
      ],
      6,
      16,
    ],
    [`uniform`, Array.from({ length: 25 }, () => 100), 6, 16],
    [`tall last item`, [100, 100, 100, 100, 100, 1000], 3, 0],
    [`one item per column`, [10, 10, 10, 1000], 4, 0],
  ] as const)(
    `column-balanced keeps later columns populated: %s`,
    async (_label, heights, cols, gap) => {
      mock_height = (el) => heights[Number(el.textContent)]
      mount_masonry({
        items: make_items(heights.length),
        order: `column-balanced`,
        animate: false,
        calc_cols: () => cols,
        gap,
      })
      await tick()

      const columns = get_col_dist().map((column) => column.map(Number))
      expect(columns.flat()).toEqual(make_items(heights.length))
      expect(columns.every((column) => column.length > 0)).toBe(true)
      const column_heights = columns.map((column) =>
        column.reduce((sum, idx) => sum + heights[idx] + gap, -gap),
      )
      // A whole-card-sized deficit is avoidable for these fixtures, even with a tall outlier.
      expect(
        Math.max(...column_heights) - Math.min(...column_heights),
      ).toBeLessThanOrEqual(Math.max(...heights) + gap)
    },
  )

  // distinct heights make every mode yield a different distribution, pinning exact output
  const dist_heights = [300, 80, 120, 400, 60, 220, 90]
  const dist_height = (item: number) => dist_heights[item]

  test.each([
    [`balanced`, `0,6 | 1,3 | 2,4,5`],
    [`balanced-stable`, `0,6 | 1,3 | 2,4,5`],
    [`row-first`, `0,3,6 | 1,4 | 2,5`],
    [`column-sequential`, `0,1,2 | 3,4 | 5,6`],
    [`column-balanced`, `0,1 | 2,3 | 4,5,6`],
  ] as const)(`order=%s puts 7 items into 3 columns as %s`, async (order, expected) => {
    mock_height = (el) => dist_height(Number(el.textContent))
    mount_masonry({
      items: make_items(7),
      order,
      animate: false,
      calc_cols: () => 3,
      gap: 10,
      masonry_width: 500,
      get_estimated_height: (item: unknown) => dist_height(Number(item)),
    })
    await tick()
    expect(as_columns()).toBe(expected)
  })

  // Appending can't tell the balancing modes apart (greedy placement is prefix-deterministic);
  // only a mid-list removal re-packs, which balanced-stable must not do (issue #53).
  test.each([
    [`balanced`, `2,4 | 3`], // re-packed from scratch
    [`balanced-stable`, `3 | 2,4`], // survivors keep their columns
  ] as const)(`order=%s after removing an item mid-list`, async (order, expected) => {
    const harness = mount_harness({ events: [], order })
    await tick()
    expect(as_columns()).toBe(`1,3 | 2,4`)

    harness.remove(1)
    await tick()

    expect(as_columns()).toBe(expected)
  })

  test.each([
    [6, 2],
    [25, 6],
    [2, 5],
  ])(
    `column-sequential spreads %s items over %s columns in reading order`,
    (count, cols) => {
      mount_masonry({
        items: make_items(count),
        order: `column-sequential`,
        calc_cols: () => cols,
        masonry_width: 500,
      })
      const columns = get_col_dist()
      expect(columns.flat().map(Number)).toEqual(make_items(count))
      expect(columns.filter((column) => column.length > 0)).toHaveLength(
        Math.min(count, cols),
      )
      const sizes = columns.map((column) => column.length)
      expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(1)
    },
  )

  test.each([
    [`balanced`, `0,3 | 1,4 | 2,5`, `0 | 1,3,5 | 2,4`, `0,3,5 | 1 | 2,4`],
    [`column-balanced`, `0,1 | 2,3 | 4,5`, `0 | 1,2 | 3,4,5`, `0 | 1 | 2,3,4,5`],
  ] as const)(
    `%s rebalances when already-measured cards resize`,
    async (order, before, after, swapped) => {
      mount_masonry({
        items: make_items(6),
        order,
        animate: false,
        gap: 0,
        calc_cols: () => 3,
      })
      await tick()
      expect(as_columns()).toBe(before)

      const resize_card = (id: number, height: number) => {
        const node = [...item_els()].find((item) => item.textContent === String(id))
        const notify = node && resize_observers.get(node)
        if (!node || !notify) throw new Error(`Missing resize observer for card ${id}`)
        Object.defineProperty(node, `offsetHeight`, { value: height, configurable: true })
        notify([mock_resize_entry(node)], {} as ResizeObserver)
      }
      resize_card(0, 500)
      await tick()
      expect(as_columns()).toBe(after)

      // Swapping heights keeps both count and sum unchanged, but must still rebalance.
      resize_card(0, 100)
      resize_card(1, 500)
      await tick()
      expect(as_columns()).toBe(swapped)
    },
  )

  test(`order=balanced-stable repopulates columns after count increases`, async () => {
    const harness = mount_harness()
    const initial_cols = get_col_dist()
    expect(initial_cols).toHaveLength(2)
    expect(initial_cols[1].length).toBeGreaterThan(0)

    harness.set_cols(1)
    await tick()
    const collapsed_cols = get_col_dist()
    expect(collapsed_cols).toHaveLength(1)
    expect(collapsed_cols[0].toSorted()).toEqual(initial_cols.flat().toSorted())

    const removed_ids = initial_cols[1].map(Number)
    harness.remove(...removed_ids)

    harness.set_cols(2)
    await tick()
    const expanded_cols = get_col_dist()
    expect(expanded_cols).toHaveLength(2)
    expect(expanded_cols.every((col) => col.length > 0)).toBe(true)
    expect(expanded_cols.flat().toSorted()).toEqual(initial_cols[0].toSorted())
  })

  test(`order=balanced-stable ignores zero estimated heights`, () => {
    mock_height = 0
    mount_masonry({
      items: make_items(3),
      order: `balanced-stable`,
      calc_cols: () => 2,
      gap: 0,
      get_estimated_height: () => 0,
      masonry_width: 500,
    })

    expect(as_columns()).toBe(`0,2 | 1`)
  })

  test.each(ALL_ORDER_MODES)(
    `order=%s always attaches ResizeObservers for mode switching support`,
    async (order) => {
      mount_masonry({ items: [1, 2, 3], order, masonry_width: 500 })
      await tick()
      expect(resize_observers.size).toBe(4) // masonry container + 3 items
    },
  )

  test(`one ResizeObserver measures every card`, async () => {
    const created_before = observers_created
    mount_masonry({ items: make_items(50), masonry_width: 500 })
    await tick()
    expect(resize_observers.size).toBe(51) // container + 50 cards
    // the container binding may bring its own; the cards share one
    expect(observers_created - created_before).toBeLessThanOrEqual(2)
  })

  test(`virtualization skips ResizeObservers (only estimated heights used)`, () => {
    mount_masonry({
      items: [1, 2, 3],
      order: `balanced`,
      virtualize: true,
      height: 300,
      masonry_width: 500,
    })
    expect(resize_observers.size).toBe(1) // the container only
  })

  // Every mode must render every item, whatever the item shape or column count
  const shapes: [label: string, items: unknown[], n_cols: number, expected: number][] = [
    [`no items`, [], 3, 0],
    [`a single item`, [42], 3, 1],
    [`fewer items than columns`, [1, 2], 5, 2],
    [`string items`, [`apple`, `banana`, `cherry`], 2, 3],
    [`object items`, [{ id: `a` }, { id: `b` }, { id: `c` }], 2, 3],
  ]

  test.each(
    ALL_ORDER_MODES.flatMap((order) => shapes.map((shape) => [order, ...shape] as const)),
  )(`order=%s renders %s`, (order, _label, items, n_cols, expected) => {
    mount_masonry({ items, order, calc_cols: () => n_cols, masonry_width: 500 })
    expect(child_els()).toHaveLength(expected)
  })
})

describe(`Masonry virtualization`, () => {
  test.each([
    [`a numeric height`, 500, `500px`, undefined],
    [`a CSS height`, `80vh`, `80vh`, undefined],
    [`conflicting styles`, 300, `300px`, `height: 900px; overflow-y: hidden`],
  ] as const)(`handles %s when virtualize=true`, (_desc, height, expected, style) => {
    mount_masonry({ items: indices, virtualize: true, height, style })
    expect(masonry_el()?.style.height).toBe(expected)
    expect(masonry_el()?.style.overflowY).toBe(`auto`)
    expect(masonry_el()?.getAttribute(`style`)).not.toContain(`\n`)
  })

  test(`respects overscan prop`, () => {
    const count_for = (overscan: number) => {
      mount_virtualized(100, {
        get_estimated_height: () => 100,
        overscan,
        calc_cols: () => 1,
      })
      return item_els().length
    }
    expect(count_for(5)).toBeGreaterThan(count_for(1))
  })

  // overscan=0 removed the slack hiding an exclusive end one row short: the bottom-edge
  // item went unrendered, leaving a blank strip
  test(`overscan=0 still renders the item at the viewport's bottom edge`, () => {
    mount_virtualized(50, {
      get_estimated_height: () => 100,
      overscan: 0,
      gap: 0,
      calc_cols: () => 1,
    })
    // 100px items in a 300px viewport: rows 0, 1 and 2 all sit on screen
    expect([...item_els()].map((el) => el.textContent?.trim())).toEqual([`0`, `1`, `2`])
  })

  test.each([
    [`balanced`, 2, 100, 100],
    [`row-first`, 3, 100, 100],
    [`balanced`, 4, 10_000, 200],
  ] as const)(`order=%s, %i cols, %i items renders < %i`, (order, cols, count, max) => {
    mount_virtualized(count, {
      order,
      calc_cols: () => cols,
      get_estimated_height: () => 100,
    })
    expect(col_els()).toHaveLength(cols)
    const rendered = item_els().length
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(max)
  })

  test(`scrolling moves the window, and a consumer's onscroll still fires`, async () => {
    // the explicit onscroll follows `{...rest}`, so unless chained it replaces the consumer's
    // handler and their callback silently stops firing
    const consumer_scroll = vi.fn()
    mount_virtualized(200, {
      calc_cols: () => 1,
      get_estimated_height: () => 100,
      gap: 0,
      height: 300,
      onscroll: consumer_scroll,
    })
    const rendered_ids = () => Array.from(item_els()).map((item) => item.textContent)
    expect(rendered_ids()[0]).toBe(`0`)

    await scroll_to(5000)

    // scroll_top=5000 with 100px items lands on item 50, minus 1 and 5 overscan
    expect(rendered_ids()[0]).toBe(`43`)
    expect(consumer_scroll).toHaveBeenCalledOnce()
  })

  test(`defers virtualization until masonry_height is measured for string heights`, () => {
    vi.spyOn(HTMLElement.prototype, `clientHeight`, `get`).mockReturnValue(0)
    mount_masonry({
      items: make_items(100),
      virtualize: true,
      height: `500px`,
      calc_cols: () => 2,
    })

    // clientHeight=0 means unmeasured, so virtualization is deferred
    expect(item_els()).toHaveLength(100)
  })

  test(`measuring a string height starts virtualizing without remounting cards`, async () => {
    let container_height = 0
    vi.spyOn(HTMLElement.prototype, `clientHeight`, `get`).mockImplementation(
      function (this: HTMLElement) {
        return this.classList.contains(`masonry`) ? container_height : 0
      },
    )
    mount_masonry({
      items: make_items(100),
      virtualize: true,
      animate: true,
      height: `300px`,
      calc_cols: () => 2,
      get_estimated_height: () => 100,
    })
    expect(item_els()).toHaveLength(100) // unmeasured, so every card renders
    const first_card = item_els()[0]
    const container = doc_query(`.masonry`)
    const notify = resize_observers.get(container)
    if (!notify) throw new Error(`Missing resize observer for the masonry container`)
    container_height = 300
    notify([mock_resize_entry(container)], {} as ResizeObserver)
    await tick()
    expect(item_els().length).toBeLessThan(100) // now windowed
    expect(item_els()[0]).toBe(first_card) // same node: the render branch didn't swap
  })

  test(`virtualize=false skips padding and overflow styles`, () => {
    mount_masonry({ items: indices, virtualize: false })
    expect(masonry_el()?.style.overflowY).toBe(``)
    expect(col_els()[0]?.getAttribute(`style`)).not.toContain(`padding-top:`)
  })

  // Regression: https://github.com/janosh/svelte-bricks/issues/50
  test(`filtering a scrolled grid fills the last viewport before another scroll event`, async () => {
    const harness = mount_harness({ events: [], virtualize: true })
    harness.append(...Array.from({ length: 96 }, (_, idx) => idx + 5))
    await tick()
    await scroll_to(6000)

    harness.remove(...Array.from({ length: 80 }, (_, idx) => idx + 21))
    await tick()
    expect(as_columns()).toBe(`15,17,19 | 16,18,20`)
  })

  test(`uses round-robin distribution when virtualizing regardless of order prop`, () => {
    mount_virtualized(12, {
      order: `balanced`,
      calc_cols: () => 3,
      get_estimated_height: () => 100,
    })
    // round-robin: item N belongs in column N % 3
    get_col_dist().forEach((column, col_idx) => {
      expect(column.length).toBeGreaterThan(0)
      for (const id of column) expect(Number(id) % 3).toBe(col_idx)
    })
  })

  test(`padding uses estimated heights, not measured`, () => {
    const [estimated, gap, item_count] = [100, 10, 100]
    mock_height = 200 // 2x the estimate

    mount_masonry({
      items: make_items(item_count),
      virtualize: true,
      height: 300,
      calc_cols: () => 1,
      gap,
      get_estimated_height: () => estimated,
      masonry_width: 500,
    })

    const col = col_els()[0]
    const rendered = col?.children.length ?? 0
    expect(col?.style.paddingTop).toBe(`0px`) // unscrolled
    const padding = Math.trunc(Number(col?.style.paddingBottom.replace(`px`, ``)))

    const expected_estimated = (item_count - rendered) * (estimated + gap)
    const expected_measured = (item_count - rendered) * (mock_height + gap)
    expect(padding).toBeLessThan(expected_measured * 0.8)
    expect(padding).toBeGreaterThan(expected_estimated * 0.5)
  })

  // A 0 estimate must fall through to the 150 default; with `??` it stays 0, prefix sums
  // become gaps alone and the window swells to 58 items instead of 14.
  test(`a zero get_estimated_height falls back to the default rather than collapsing`, () => {
    mount_virtualized(500, { get_estimated_height: () => 0, height: 500 })

    expect(item_els().length).toBeLessThan(30)
  })
})

describe(`Masonry live item updates`, () => {
  // Regression: https://github.com/janosh/svelte-bricks/issues/58
  test(`balanced-stable append only re-runs effects for new children`, async () => {
    const events: number[] = []
    const harness = mount_harness({ events })
    await tick()
    events.length = 0

    harness.append(5, 6)
    await tick()
    expect(events).toEqual([5, 6])
  })

  // Regression: a removed id must be purged from stable_assignments, else re-adding it
  // pins it back to its old column.
  test(`re-adding a removed id places it fresh, not in its old column`, async () => {
    // item 3 is tall, so the column holding it stays clearly the longest
    mock_height = (el) => (el.textContent === `3` ? 500 : 100)
    const harness = mount_harness()
    await tick()
    expect(as_columns()).toBe(`1,3 | 2,4`)

    harness.remove(1)
    await tick()
    expect(as_columns()).toBe(`3 | 2,4`)

    harness.append(1)
    await tick()
    // id 1 lands in the shorter column, not back on top of the tall item
    expect(as_columns()).toBe(`3 | 2,4,1`)
  })

  test(`swapping out every item on a live instance renders only the new ones`, async () => {
    const harness = mount_harness()
    await tick()

    harness.remove(1, 2, 3, 4)
    harness.append(10, 11, 12)
    await tick()

    expect(get_col_dist().flat().toSorted()).toEqual([`10`, `11`, `12`])
  })
})
