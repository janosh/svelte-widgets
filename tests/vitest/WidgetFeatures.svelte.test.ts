import {
  Accordion,
  ButtonGroup,
  SplitPane,
  TreeView,
  VirtualList,
  type TreeNode,
  type SelectionProps,
} from '#lib'
import OptionRows from '#lib/internal/OptionRows.svelte'
import { create_key_selector } from '#lib/internal/key-selector.svelte.ts'
import { create_option_rows } from '#lib/internal/option-list.ts'
import { virtual_window } from '#lib/virtual.ts'
import { createRawSnippet, flushSync, mount, tick, unmount } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
import { expect, test, vi, onTestFinished } from 'vite-plus/test'
import { click, create_element, doc_query, key_reads, press_key, render } from './index'

vi.mock(`#lib/internal/key-selector.svelte.ts`, async (import_original) =>
  (await import(`./index`)).count_key_reads(await import_original()),
)

// a fresh target, so queries stay scoped to this test's widget
const target_for = () => {
  const target = create_element()
  onTestFinished(() => target.remove())
  return target
}
// VirtualList row snippet rendering each item as text
const children = createRawSnippet<[unknown, number]>((item) => ({
  render: () => `<span>${item()}</span>`,
}))

test.each([
  [
    `Accordion`,
    (props: SelectionProps) =>
      render(Accordion, { items: [{ value: `alpha` }], ...props }),
  ],
  [
    `ButtonGroup`,
    (props: SelectionProps) => render(ButtonGroup, { options: [`alpha`], ...props }),
  ],
  [
    `TreeView`,
    (props: SelectionProps) =>
      render(TreeView, { nodes: [{ id: `alpha`, label: `Alpha` }], ...props }),
  ],
] as const)(`%s rejects a selection with the wrong mode`, (_name, mount_selection) => {
  for (const props of [
    { mode: `single`, value: [`alpha`] },
    { mode: `multiple`, value: `alpha` },
    { mode: `multiple`, value: null },
  ]) {
    expect(() => mount_selection(props as SelectionProps)).toThrow(`incompatible value`)
  }
})

test(`split collapse restores size and Home/End respect bounds`, async () => {
  const on_resize = vi.fn()
  const target = target_for()
  render(SplitPane, { collapsible: true, ratio: 0.4, on_resize }, target)
  const separator = doc_query(`[role="separator"]`)
  for (const [key, size] of [
    [`Enter`, `0px`],
    [`Enter`, `40%`],
    [`End`, `85%`],
    [`Home`, `15%`],
  ]) {
    press_key(separator, key)
    await tick()
    expect(target.style.getPropertyValue(`--split-pane-size`)).toBe(size)
  }
  expect(on_resize).toHaveBeenCalledTimes(4)
})

test.each([0, 5])(
  `virtual list scrolls to an unmounted row with overscan=%s`,
  async (overscan) => {
    const key = vi.fn(Number)
    let items = $state(Array.from({ length: 10000 }, (_value, idx) => idx))
    const target = target_for()
    // mounted directly: the test calls the instance's exported scroll_to_index
    const component = mount(VirtualList, {
      target,
      props: {
        get items() {
          return items
        },
        item_size: 20,
        initial_count: 10,
        key,
        overscan,
        children,
      },
    })
    onTestFinished(() => unmount(component))
    flushSync()
    expect(target.querySelectorAll(`[data-index]`)).toHaveLength(10)
    expect(key.mock.calls.length).toBeLessThan(100)
    component.scroll_to_index(9000)
    await tick()
    expect(target.querySelector(`[data-index="9000"]`)?.textContent).toBe(`9000`)
    expect(target.querySelectorAll(`[data-index]`).length).toBeLessThan(25)
    expect(() => component.scroll_to_index(1.5)).toThrow(`integer index`)
    items = []
    await tick()
    expect(target.querySelector(`.virtual-list`)?.scrollTop).toBe(0)
    expect(target.querySelectorAll(`[data-index]`)).toHaveLength(0)
    // Invalid indices throw even when there is nothing to reveal
    expect(() => component.scroll_to_index(1.5)).toThrow(`integer index`)
  },
)

test(`virtual list sizes its window from the measured viewport, not initial_count`, async () => {
  vi.spyOn(HTMLElement.prototype, `clientHeight`, `get`).mockReturnValue(100)
  const target = target_for()
  const key = vi.fn(Number)
  const component = mount(VirtualList, {
    target,
    props: {
      items: Array.from({ length: 1000 }, (_value, idx) => idx),
      item_size: 20,
      overscan: 2,
      initial_count: 50,
      key,
      children,
    },
  })
  onTestFinished(() => unmount(component))
  flushSync()
  const indices = () =>
    Array.from(target.querySelectorAll<HTMLElement>(`[data-index]`), (row) =>
      Number(row.dataset.index),
    )
  // 100px viewport / 20px rows = 5 visible rows + 2 overscan below
  expect(indices()).toEqual([0, 1, 2, 3, 4, 5, 6])
  // Revealing row 10 scrolls just far enough to show its bottom edge.
  component.scroll_to_index(10)
  await tick()
  expect(target.querySelector(`.virtual-list`)?.scrollTop).toBe(120)
  expect(indices()).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12])
  // a scroll within the same rows (window [4, 14) at both offsets) re-slices nothing
  const scroll_to = (top: number) => {
    const list = doc_query(`.virtual-list`)
    list.scrollTop = top
    list.dispatchEvent(new Event(`scroll`))
    flushSync()
  }
  scroll_to(125)
  key.mockClear()
  scroll_to(135)
  expect(key).not.toHaveBeenCalled()
  expect(indices()).toHaveLength(10)
})

// One reader per key, as rows are: a change re-runs only readers whose answer flips
test(`key selector re-runs only the readers whose key enters or leaves the current value`, () => {
  let current = $state<string | Set<string>>(`a`)
  let bump = $state(0) // re-runs every reader, as a rebuilt row would
  const runs: Record<string, number> = {}
  const answers: Record<string, boolean> = {}
  const readers: Record<string, () => boolean> = {}
  const cleanup = $effect.root(() => {
    const is = create_key_selector(() => current)
    for (const key of [`a`, `b`, `c`]) {
      const answer = $derived.by(() => {
        void bump
        runs[key] = (runs[key] ?? 0) + 1
        return is(key)
      })
      readers[key] = () => answer
      $effect(() => void (answers[key] = answer))
    }
  })
  onTestFinished(cleanup)
  flushSync()
  const step = (change: () => void) => {
    for (const key of Object.keys(runs)) runs[key] = 0
    change()
    flushSync()
    return [{ ...runs }, { ...answers }]
  }
  const no = { a: false, b: false, c: false }
  expect(step(() => (current = `b`))).toEqual([
    { a: 1, b: 1, c: 0 },
    { ...no, b: true },
  ])
  // a set mutated in place diffs against what readers last saw
  const keys = new SvelteSet([`b`])
  expect(step(() => (current = keys))).toEqual([
    { a: 0, b: 0, c: 0 },
    { ...no, b: true },
  ])
  expect(step(() => keys.add(`c`))).toEqual([
    { a: 0, b: 0, c: 1 },
    { ...no, b: true, c: true },
  ])
  // a reader answering before the effect ran, for a change since reverted, isn't left stale
  expect(
    step(() => {
      current = `a`
      bump++
      readers.b()
      current = keys
    }),
  ).toEqual([
    { a: 1, b: 2, c: 1 },
    { ...no, b: true, c: true },
  ])
})

// MultiSelect and OptionList get a fresh window object from option_window on every scroll
test(`option rows re-slice only when the window's rows change, reusing unchanged rows`, () => {
  let render_key_reads = 0
  const rows = Array.from({ length: 100 }, (_value, idx) => ({
    get render_key() {
      render_key_reads++
      return idx
    },
  }))
  let window = $state({ start: 10, end: 20, item_height: 30 })
  const target = target_for()
  const component = mount(OptionRows, {
    target,
    props: {
      rows,
      get window() {
        return window
      },
      children: createRawSnippet<[{ render_key: unknown }]>((row) => ({
        render: () => `<li>row ${String(row().render_key)}</li>`,
      })),
    },
  })
  onTestFinished(() => unmount(component))
  flushSync()
  const labels = () =>
    Array.from(target.querySelectorAll(`li:not([aria-hidden])`), (li) => li.textContent)
  expect(labels()).toHaveLength(10)
  render_key_reads = 0
  window = { start: 10, end: 20, item_height: 30 }
  flushSync()
  expect(render_key_reads).toBe(0)
  window = { start: 11, end: 21, item_height: 30 }
  flushSync()
  expect([labels()[0], labels().length]).toEqual([`row 11`, 10])
  // rebuilt rows keep their objects where option and position are unchanged, so appending
  // an option renders its row alone rather than re-rendering every row
  const build = create_option_rows<string>()
  const build_from = (options: string[]) =>
    build(
      [{ group: null, options, collapsed: false }],
      (option) => option,
      false,
      undefined,
    )
  const [first, second] = build_from([`a`, `b`])
  const appended = build_from([`a`, `b`, `c`])
  expect(appended[0]).toBe(first)
  expect(appended[1]).toBe(second)
  expect(build_from([`b`])[0]).not.toBe(second) // a shifted option is a new row
})

test.each([
  { item_size: 0 },
  { item_size: Number.NaN },
  { item_size: Infinity },
  { overscan: 1.5 },
  { overscan: -1 },
  { initial_count: 2.5 },
  { initial_count: -1 },
])(`virtual list rejects invalid sizing prop %o`, (invalid) => {
  const props = { items: [1, 2], children, ...invalid }
  expect(() => mount(VirtualList, { target: target_for(), props })).toThrow(
    `VirtualList requires positive item_size`,
  )
})

test.each([
  [
    { scroll: 900, viewport: 100, item_size: 10, count: 5, overscan: 1 },
    { start: 0, end: 5 },
  ],
  [
    { scroll: -100, viewport: 50, item_size: 10, count: 5 },
    { start: 0, end: 0 },
  ],
  [
    { scroll: 0, viewport: 0, item_size: 10, count: 100, min_window: 10 },
    { start: 0, end: 10 },
  ],
])(`window clamps stale or leading offsets`, (input, expected) => {
  expect(virtual_window(input)).toEqual(expected)
})

test.each([
  [false, false],
  [false, true],
  [true, false],
  [true, true],
])(
  `tree lazy expansion, navigation, selection and disabled branches (initial=%s, multiple=%s)`,
  async (initial, multiple) => {
    const load = vi.fn(async () => [{ id: `child`, label: `Child` }])
    const nodes: TreeNode[] = [
      { id: `root`, label: `Root`, load },
      { id: `last`, label: `Last` },
    ]
    const on_select = vi.fn()
    const on_change = vi.fn()
    const props = $state({
      nodes,
      ...(multiple ? { mode: `multiple` as const } : { mode: `single` as const }),
      on_select,
      on_change,
      expanded: new Set(initial ? [`root`] : []),
    })
    const target = target_for()
    render(TreeView, props, target)
    const root = doc_query(`[data-tree-id="root"]`)
    expect(root.getAttribute(`aria-label`)).toBe(`Root`)
    root.focus()
    if (!initial) press_key(root, `Enter`)
    await tick()
    await tick()
    expect(load).toHaveBeenCalledOnce()
    expect(target.querySelectorAll(`[role="treeitem"]`)).toHaveLength(3)
    press_key(root, `ArrowRight`)
    await tick()
    expect(document.activeElement?.getAttribute(`data-tree-id`)).toBe(`child`)
    press_key(doc_query(`[role="treeitem"]:focus`), `Enter`)
    expect(on_select).toHaveBeenCalledWith({ id: `child`, label: `Child` })
    press_key(doc_query(`[role="treeitem"]:focus`), `ArrowLeft`)
    await tick()
    press_key(root, `ArrowLeft`)
    await tick()
    expect(target.querySelectorAll(`[role="treeitem"]`)).toHaveLength(2)
    for (const [key, expanded] of [
      [`ArrowRight`, true],
      [`Enter`, false],
      [`Enter`, true],
      [`Enter`, false],
    ] as const) {
      press_key(root, key)
      await tick()
      expect(root.getAttribute(`aria-expanded`)).toBe(String(expanded))
      expect(document.activeElement).toBe(root)
      if (expanded)
        expect(doc_query(`[data-tree-id="child"]`).getAttribute(`aria-selected`)).toBe(
          `true`,
        )
    }
    expect(load).toHaveBeenCalledOnce()
    expect(on_select).toHaveBeenCalledTimes(1)
    expect(on_change).toHaveBeenCalledTimes(1)
    for (const [key, id] of [
      [`l`, `last`],
      [`r`, `root`],
      [`End`, `last`],
      [`Home`, `root`],
    ]) {
      press_key(doc_query(`[role="treeitem"]:focus`), key)
      await tick()
      expect(document.activeElement?.getAttribute(`data-tree-id`)).toBe(id)
    }
    press_key(root, ` `)
    await tick()
    expect(root.getAttribute(`aria-selected`)).toBe(`true`)
    expect(root.getAttribute(`aria-expanded`)).toBe(`false`)

    props.nodes[0].disabled = true
    for (const expanded of [false, true]) {
      props.expanded = new Set(expanded ? [`root`] : [])
      await tick()
      press_key(root, `Enter`)
      await tick()
      expect(root.getAttribute(`aria-expanded`)).toBe(String(expanded))
      expect(document.activeElement).toBe(root)
    }
    expect(on_select).toHaveBeenCalledTimes(2)
    expect(on_change).toHaveBeenCalledTimes(2)
  },
)

test.each([false, true])(
  `tree replacement ignores stale loads (reject=%s)`,
  async (reject_old) => {
    const target = target_for()
    const requests: {
      signal: AbortSignal
      resolve: (nodes: TreeNode[]) => void
      reject: (error: Error) => void
    }[] = []
    const load = (signal: AbortSignal) =>
      new Promise<TreeNode[]>((resolve, reject) => {
        requests.push({ signal, resolve, reject })
      })
    const props = $state({
      nodes: [{ id: `root`, label: `Old`, load }],
      expanded: new Set([`root`]),
    })
    const unmount_tree = render(TreeView, props, target)
    const root = doc_query(`[data-tree-id="root"]`)
    props.nodes = [{ id: `root`, label: `New`, load }]
    await tick()
    expect(requests).toHaveLength(2)
    expect(requests[0].signal.aborted).toBe(true)
    if (reject_old) requests[0].reject(new Error(`Old failed`))
    else requests[0].resolve([{ id: `stale`, label: `Stale` }])
    await tick()
    expect(root.getAttribute(`aria-busy`)).toBe(`true`)
    expect(target.textContent).not.toMatch(/Old failed|Stale/)
    requests[1].resolve([{ id: `child`, label: `Child` }])
    await tick()
    expect(target.querySelector(`[data-tree-id="child"]`)).not.toBeNull()
    expect(root.getAttribute(`aria-busy`)).toBe(`false`)
    props.nodes = [{ id: `root`, label: `Unmounting`, load }]
    await tick()
    await unmount_tree()
    expect(requests[2].signal.aborted).toBe(true)
  },
)

test.each([`ctrlKey`, `metaKey`] as const)(
  `tree multiple selection supports %s toggles and visible ranges`,
  async (modifier) => {
    const on_change = vi.fn()
    let delta_label_reads = 0 // each render of its row reads it
    const props = $state({
      mode: `multiple` as const,
      nodes: [
        {
          id: `folder`,
          label: `Folder`,
          children: [
            { id: `alpha`, label: `Alpha` },
            { id: `disabled`, label: `Disabled`, disabled: true },
            { id: `gamma`, label: `Gamma` },
          ],
        },
        {
          id: `delta`,
          get label() {
            delta_label_reads++
            return `Delta`
          },
        },
      ],
      expanded: new Set([`folder`]),
      value: [`alpha`],
      on_change,
    })
    const target = target_for()
    render(TreeView, props, target)
    const row = (id: string) => doc_query(`[data-tree-id="${id}"]`)
    expect(row(`alpha`).tabIndex).toBe(0)
    const selected = () =>
      [...target.querySelectorAll(`[aria-selected="true"]`)].map((element) =>
        element.getAttribute(`data-tree-id`),
      )
    expect(doc_query(`[role="tree"]`).getAttribute(`aria-multiselectable`)).toBe(`true`)
    row(`alpha`).focus()
    row(`gamma`).dispatchEvent(
      new PointerEvent(`pointerdown`, { shiftKey: true, bubbles: true }),
    )
    row(`gamma`).focus() // native pointer focus precedes click
    row(`gamma`).dispatchEvent(new MouseEvent(`click`, { shiftKey: true, bubbles: true }))
    await tick()
    expect(selected()).toEqual([`alpha`, `gamma`])
    for (const [id, options, expected] of [
      [`alpha`, {}, [`alpha`]],
      [`gamma`, { [modifier]: true }, [`alpha`, `gamma`]],
      [`alpha`, { [modifier]: true }, [`gamma`]],
      [`delta`, { shiftKey: true }, [`alpha`, `gamma`, `delta`]],
      [`gamma`, { shiftKey: true }, [`alpha`, `gamma`]],
    ] as const) {
      row(id).dispatchEvent(new MouseEvent(`click`, { bubbles: true, ...options }))
      await tick()
      expect(selected()).toEqual(expected)
      expect(on_change).toHaveBeenLastCalledWith(expected)
    }
    const calls = on_change.mock.calls.length
    await click(row(`disabled`))
    expect(on_change).toHaveBeenCalledTimes(calls)
    expect(row(`disabled`).hasAttribute(`aria-selected`)).toBe(false)

    // Collapsing keeps hidden selections; ranges only include rows still visible.
    delta_label_reads = 0
    await click(`button[aria-label="Collapse Folder"]`)
    expect(selected()).toEqual([])
    // the sibling row's own fields are unchanged, so collapsing doesn't re-render it
    expect(delta_label_reads).toBe(0)
    row(`delta`).dispatchEvent(new MouseEvent(`click`, { bubbles: true, shiftKey: true }))
    await tick()
    expect(selected()).toEqual([`delta`])
    // Caller-owned selection remains writable after interactions.
    props.value = [`alpha`]
    await tick()
    press_key(row(`delta`), `a`, { [modifier]: true })
    await tick()
    expect(selected()).toEqual([`folder`, `delta`])
    expect(on_change).toHaveBeenLastCalledWith([`alpha`, `folder`, `delta`])
  },
)

// each row reads its node's label when it re-renders: the reads count the rows a change hit
test(`expanding or lazily loading one branch re-renders no sibling row`, async () => {
  let label_reads = 0
  const branch = (idx: number): TreeNode => ({
    id: `branch ${idx}`,
    get label() {
      label_reads++
      return `Branch ${idx}`
    },
    children: [{ id: `child ${idx}`, label: `Child ${idx}` }],
  })
  let resolve_load: (nodes: TreeNode[]) => void = () => {}
  const lazy: TreeNode = {
    id: `lazy`,
    label: `Lazy`,
    load: () =>
      new Promise((resolve) => {
        resolve_load = resolve
      }),
  }
  const target = target_for()
  render(
    TreeView,
    { nodes: [...Array.from({ length: 8 }, (_, idx) => branch(idx)), lazy] },
    target,
  )
  const toggle = (id: string) =>
    doc_query(`[data-tree-id="${id}"] button`).dispatchEvent(
      new MouseEvent(`click`, { bubbles: true }),
    )
  label_reads = 0
  toggle(`branch 0`)
  await tick()
  expect(target.querySelector(`[data-tree-id="child 0"]`)).not.toBeNull()
  // branch 0's own row only: re-rendering its 7 expandable siblings too read 10
  expect(label_reads).toBe(3)
  label_reads = 0
  toggle(`lazy`)
  await tick()
  expect(doc_query(`[data-tree-id="lazy"]`).getAttribute(`aria-busy`)).toBe(`true`)
  resolve_load([{ id: `loaded`, label: `Loaded` }])
  await tick()
  await tick()
  expect(target.querySelector(`[data-tree-id="loaded"]`)).not.toBeNull()
  expect(label_reads).toBe(1) // no branch row re-rendered for the lazy row's load
})

test(`tree keyboard ranges shrink, Space toggles, and focus alone preserves selection`, async () => {
  const on_change = vi.fn()
  let label_reads = 0 // each row render reads its label
  render(TreeView, {
    mode: `multiple` as const,
    nodes: [`Alpha`, `Disabled`, `Beta`, `Gamma`].map((label) => ({
      id: label,
      get label() {
        label_reads++
        return label
      },
      disabled: label === `Disabled`,
    })),
    on_change,
  })
  doc_query(`[data-tree-id="Alpha"]`).focus()
  for (const [key, options, focused, selected] of [
    [`ArrowDown`, { shiftKey: true }, `Disabled`, [`Alpha`]],
    [`ArrowDown`, { shiftKey: true }, `Beta`, [`Alpha`, `Beta`]],
    [`ArrowDown`, { shiftKey: true }, `Gamma`, [`Alpha`, `Beta`, `Gamma`]],
    [`ArrowUp`, { shiftKey: true }, `Beta`, [`Alpha`, `Beta`]],
    [`End`, {}, `Gamma`, [`Alpha`, `Beta`]],
    [` `, {}, `Gamma`, [`Alpha`, `Beta`, `Gamma`]],
    [` `, {}, `Gamma`, [`Alpha`, `Beta`]],
    [`Home`, { shiftKey: true }, `Alpha`, [`Alpha`, `Beta`, `Gamma`]],
    [`Enter`, {}, `Alpha`, [`Alpha`]],
  ] as const) {
    press_key(doc_query(`[role="treeitem"]:focus`), key, options)
    await tick()
    expect(document.activeElement?.getAttribute(`data-tree-id`)).toBe(focused)
    expect(on_change).toHaveBeenLastCalledWith(selected)
  }
  // moving focus re-renders only the rows it leaves and enters, not every row
  label_reads = 0
  key_reads.count = 0
  press_key(doc_query(`[role="treeitem"]:focus`), `End`)
  await tick()
  expect([label_reads, key_reads.count]).toEqual([2, 2])
  const input = document.createElement(`input`)
  doc_query(`[data-tree-id="Alpha"]`).append(input)
  const calls = on_change.mock.calls.length
  expect(press_key(input, `a`, { ctrlKey: true }).defaultPrevented).toBe(false)
  expect(on_change).toHaveBeenCalledTimes(calls)
})
