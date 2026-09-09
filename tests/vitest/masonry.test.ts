import { Masonry } from '$lib'
import { order_options as ALL_ORDER_MODES } from '$lib/utils'
import { type ComponentProps, mount, tick } from 'svelte'
import { beforeEach, describe, expect, onTestFinished, test, vi } from 'vitest'
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

globalThis.ResizeObserver = class ResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback
  // disconnect() must untrack everything this instance observed, like the real API
  private readonly targets = new Set<Element>()
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
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

function create_mock_animation(): Animation {
  const mock_animation = { cancel: () => {}, finished: Promise.resolve() }
  return mock_animation as unknown as Animation
}

Element.prototype.animate = vi.fn<typeof Element.prototype.animate>(create_mock_animation)
Element.prototype.getAnimations = vi.fn<typeof Element.prototype.getAnimations>(() => [])

beforeEach(() => {
  document.body.innerHTML = ``
  resize_observers.clear()
  mock_height = 100
})

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
    [[`foo`, `bar`], /masonry foo/u, /col col-\d+ bar/u],
    [[`custom`, `col-class`], /masonry custom/u, /col col-\d+ col-class/u],
    [[``, ``], /^masonry\s+svelte-\w+/u, /col col-\d+\s+svelte-\w+/u],
  ])(
    `applies class=%j and column_props.class correctly`,
    ([cls, colCls], divRe, colRe) => {
      mount_masonry({ items: indices, class: cls, column_props: { class: colCls } })
      expect(masonry_el()?.className).toMatch(divRe)
      expect(col_els()[0]?.className).toMatch(colRe)
    },
  )

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
    // container: user style merges with (not clobbers) the layout styles
    const masonry = masonry_el()
    expect(masonry?.getAttribute(`data-testid`)).toBe(`my-masonry`)
    expect(masonry?.getAttribute(`aria-label`)).toBe(`Image gallery`)
    expect(masonry?.getAttribute(`style`)).toContain(style)
    expect(masonry?.style.display).toBe(`flex`)
    expect(masonry?.style.boxSizing).toBe(`border-box`)
    // every column: column_props style merges with the style: directives, arbitrary attrs pass through
    for (const col of col_els()) {
      expect(col.getAttribute(`style`)).toContain(column_style)
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
    `calculates columns: width=%d, minCol=%d, gap=%d -> %d cols`,
    (width, minCol, gap, expected) => {
      mount_masonry({ items: indices, masonry_width: width, min_col_width: minCol, gap })
      expect(col_els()).toHaveLength(expected)
    },
  )

  test(`warns if max_col_width < min_col_width`, () => {
    vi.spyOn(console, `warn`).mockImplementation(() => {})
    mount_masonry({ items: indices, min_col_width: 50, max_col_width: 40 })
    expect(console.warn).toHaveBeenCalledWith(
      `Masonry: max_col_width (40) < min_col_width (50).`,
    )
  })

  test(`throws a descriptive error if an item has no usable id`, () => {
    expect(() => mount_masonry({ items: [{ name: `no id` }] })).toThrow(
      `Masonry: item["id"] is undefined, expected string | number. Item: {"name":"no id"}`,
    )
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

  test.each([0, 1, 5, 50])(`renders %d items`, (count) => {
    mount_masonry({ items: Array.from({ length: count }, (_, idx) => idx) })
    expect(child_els()).toHaveLength(count)
  })

  test.each([`id`, `key`, `uuid`])(`works with id_key=%s`, (id_key) => {
    mount_masonry({ items: [{ [id_key]: 1 }, { [id_key]: 2 }], id_key })
    expect(item_els()).toHaveLength(2)
  })

  test(`renders max columns when masonry_width=0 (SSR mode)`, () => {
    mount_masonry({ items: indices, min_col_width: 200, gap: 10, masonry_width: 0 })
    expect(col_els()).toHaveLength(Math.floor(1930 / 210))
  })

  test.each([
    [{ initial_cols: 4, masonry_width: 0 }, 4],
    [{ initial_cols: 99, masonry_width: 0 }, n_items],
    [{ masonry_width: 0, calc_cols: (): number => 40 }, 40],
    [{ initial_cols: 4, masonry_width: 500, calc_cols: (): number => 2 }, 2],
  ])(`resolves column count from %o`, (props, expected) => {
    mount_masonry({ items: indices, ...props })
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
    const masonry_id = masonry_el()?.getAttribute(`data-masonry-id`)
    if (!masonry_id) throw new Error(`data-masonry-id not found`)
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

  test(`masonry div has container-name for scoped queries`, () => {
    mount_masonry({ items: indices })
    const masonry = masonry_el()
    if (!masonry) throw new Error(`masonry div not found`)
    const style = getComputedStyle(masonry)
    expect(style.containerName).toBe(`masonry`)
    expect(style.containerType).toBe(`inline-size`)
  })

  test(`limits columns to items.length`, () => {
    mount_masonry({ items: [1, 2, 3], min_col_width: 100, masonry_width: 0 })
    expect(col_els()).toHaveLength(3)
  })
})

describe(`Masonry append render stability`, () => {
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
    [7, 3],
    [2, 5],
  ])(
    `column-sequential spreads %s items over %s columns in reading order`,
    async (count, cols) => {
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

      const first = item_els()[0]
      const callback = resize_observers.get(first)
      if (!callback) throw new Error(`Missing resize observer for first card`)
      Object.defineProperty(first, `offsetHeight`, { value: 500, configurable: true })
      callback([mock_resize_entry(first)], {} as ResizeObserver)
      await tick()
      expect(as_columns()).toBe(after)

      // Swapping heights keeps both count and sum unchanged, but must still rebalance.
      for (const [id, height] of [
        [0, 100],
        [1, 500],
      ]) {
        const node = [...item_els()].find((item) => item.textContent === String(id))
        const notify = node && resize_observers.get(node)
        if (!node || !notify) throw new Error(`Missing resize observer for card ${id}`)
        Object.defineProperty(node, `offsetHeight`, { value: height, configurable: true })
        notify([mock_resize_entry(node)], {} as ResizeObserver)
      }
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

  test(`order=balanced-stable ignores zero estimated heights`, async () => {
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
      // All modes attach observers to support runtime mode switching
      expect(resize_observers.size).toBe(4) // masonry container + 3 items
    },
  )

  test(`virtualization skips ResizeObservers (only estimated heights used)`, async () => {
    mount_masonry({
      items: [1, 2, 3],
      order: `balanced`,
      virtualize: true,
      height: 300,
      masonry_width: 500,
    })
    // Only masonry container observer, no item observers during virtualization
    expect(resize_observers.size).toBe(1)
  })
})

describe(`Masonry bindable props`, () => {
  test(`exposes div bindable for DOM access`, async () => {
    let bound_div: HTMLDivElement | undefined
    mount_masonry({
      items: [1, 2],
      get div() {
        return bound_div
      },
      set div(val: HTMLDivElement | undefined) {
        bound_div = val
      },
    })
    await tick()
    expect(bound_div).toBeInstanceOf(HTMLDivElement)
    expect(bound_div?.classList).toContain(`masonry`)
  })

  test(`exposes masonry_height bindable`, async () => {
    let bound_height = 0
    const height_spy = vi
      .spyOn(HTMLElement.prototype, `clientHeight`, `get`)
      .mockImplementation(function (this: HTMLElement) {
        return this.classList.contains(`masonry`) ? 250 : 0
      })
    onTestFinished(() => height_spy.mockRestore())
    mount_masonry({
      items: [1, 2],
      get masonry_height() {
        return bound_height
      },
      set masonry_height(val: number) {
        bound_height = val
      },
    })
    expect(bound_height).toBe(250)
  })
})

describe(`Masonry default rendering`, () => {
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

describe(`Masonry virtualization`, () => {
  test(`warns exactly once if virtualize=true without height prop`, () => {
    vi.spyOn(console, `warn`).mockImplementation(() => {})
    mount_masonry({ items: indices, virtualize: true })
    expect(console.warn).toHaveBeenCalledExactlyOnceWith(
      `Masonry: virtualize=true requires a height prop. Falling back to 400px.`,
    )
  })

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

  test(`calls get_estimated_height and applies column padding`, async () => {
    const get_estimated_height = vi.fn<() => number>(() => 120)
    mount_masonry({
      items: indices,
      virtualize: true,
      height: 500,
      get_estimated_height,
      order: `balanced`,
      masonry_width: 500,
    })
    expect(get_estimated_height).toHaveBeenCalled()
    expect(col_els()[0]?.getAttribute(`style`)).toMatch(/padding-top:.*padding-bottom:/u)
  })

  test(`respects overscan prop`, async () => {
    mount_virtualized(100, {
      get_estimated_height: () => 100,
      overscan: 1,
      calc_cols: () => 1,
    })
    const count_1 = item_els().length

    mount_virtualized(100, {
      get_estimated_height: () => 100,
      overscan: 5,
      calc_cols: () => 1,
    })
    const count_5 = item_els().length

    expect(count_5).toBeGreaterThan(count_1)
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
    [`balanced`, 2],
    [`row-first`, 3],
  ] as const)(`renders subset of items %s`, async (order, cols) => {
    mount_virtualized(100, { order, calc_cols: () => cols })
    expect(col_els()).toHaveLength(cols)
    const rendered = item_els().length
    expect(rendered).toBeGreaterThan(0)
    expect(rendered).toBeLessThan(100)
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

    const masonry = masonry_el()
    if (!masonry) throw new Error(`masonry div not found`)
    Object.defineProperty(masonry, `scrollTop`, { value: 5000, configurable: true })
    masonry.dispatchEvent(new Event(`scroll`))
    await new Promise(requestAnimationFrame)
    await tick()

    // scroll_top=5000 with 100px items lands on item 50, minus 1 and 5 overscan
    expect(rendered_ids()[0]).toBe(`43`)
    expect(consumer_scroll).toHaveBeenCalledOnce()
  })

  test(`defers virtualization until masonry_height is measured for string heights`, async () => {
    const height_spy = vi
      .spyOn(HTMLElement.prototype, `clientHeight`, `get`)
      .mockReturnValue(0)
    onTestFinished(() => height_spy.mockRestore())
    mount_masonry({
      items: make_items(100),
      virtualize: true,
      height: `500px`,
      calc_cols: () => 2,
    })

    // clientHeight=0 means unmeasured, so virtualization is deferred
    expect(item_els()).toHaveLength(100)
  })

  test(`virtualize=false skips padding and overflow styles`, async () => {
    mount_masonry({ items: indices, virtualize: false })
    expect(masonry_el()?.style.overflowY).toBe(``)
    expect(col_els()[0]?.getAttribute(`style`)).not.toContain(`padding-top:`)
  })
})

describe(`Masonry item cleanup`, () => {
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

describe(`Masonry CSS reset compatibility`, () => {
  // Regression: https://github.com/janosh/svelte-bricks/issues/48
  test.each([
    [`div.masonry`, `flex`],
    [`div.masonry > div.col`, `grid`],
  ])(`%s has inline display:%s style`, async (selector, display) => {
    mount_masonry({ items: [1, 2, 3], masonry_width: 500 })
    expect(document.querySelector<HTMLElement>(selector)?.style.display).toBe(display)
  })
})

describe(`Masonry virtual scroll stability`, () => {
  // Regression: https://github.com/janosh/svelte-bricks/issues/50

  test(`filtering a scrolled grid fills the last viewport before another scroll event`, async () => {
    const harness = mount_harness({ events: [], virtualize: true })
    harness.append(...Array.from({ length: 96 }, (_, idx) => idx + 5))
    await tick()
    const masonry = masonry_el()
    if (!masonry) throw new Error(`Missing masonry container`)
    masonry.scrollTop = 6000
    masonry.dispatchEvent(new Event(`scroll`))
    await new Promise(requestAnimationFrame)
    await tick()

    harness.remove(...Array.from({ length: 80 }, (_, idx) => idx + 21))
    await tick()
    expect(as_columns()).toBe(`15,17,19 | 16,18,20`)
  })

  test(`uses round-robin distribution when virtualizing regardless of order prop`, async () => {
    mount_virtualized(12, {
      order: `balanced`,
      calc_cols: () => 3,
      get_estimated_height: () => 100,
    })
    const columns = col_els()
    // round-robin: item N belongs in column N % 3
    for (let col_idx = 0; col_idx < columns.length; col_idx++) {
      const spans = columns[col_idx].querySelectorAll(`span`)
      const item_ids = Array.from(spans)
        .map((span) => Math.trunc(Number(span.textContent || `-1`)))
        .filter((id) => id >= 0)
      for (const item_id of item_ids) {
        expect(item_id % 3).toBe(col_idx)
      }
    }
  })

  test(`padding uses estimated heights, not measured`, async () => {
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
    const padding_css = col?.style.paddingBottom ?? `0`
    const padding = Math.trunc(Number(padding_css.replace(`px`, ``)))

    // Should match estimated calculation, not measured
    const expected_estimated = (item_count - rendered) * (estimated + gap)
    const expected_measured = (item_count - rendered) * (mock_height + gap)
    expect(padding).toBeLessThan(expected_measured * 0.8)
    expect(padding).toBeGreaterThan(expected_estimated * 0.5)
  })

  test(`10k items render only a virtualized window`, async () => {
    mount_virtualized(10000, {
      calc_cols: () => 4,
      get_estimated_height: () => 100,
      height: 500,
    })

    const rendered = item_els().length
    expect(rendered).toBeLessThan(200)
    expect(rendered).toBeGreaterThan(0)
  })

  // A 0 estimate must fall through to the 150 default; with `??` it stays 0, prefix sums
  // become gaps alone and the window swells to 58 items instead of 14.
  test(`a zero get_estimated_height falls back to the default rather than collapsing`, () => {
    mount_virtualized(500, { get_estimated_height: () => 0, height: 500 })

    expect(item_els().length).toBeLessThan(30)
  })
})

describe(`Masonry order mode edge cases`, () => {
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
  )(`order=%s renders %s`, async (order, _label, items, n_cols, expected) => {
    mount_masonry({ items, order, calc_cols: () => n_cols, masonry_width: 500 })
    expect(child_els()).toHaveLength(expected)
  })
})
