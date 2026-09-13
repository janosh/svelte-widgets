import {
  FileInput,
  SplitPane,
  TaskStatus,
  TreeView,
  VirtualList,
  type TreeNode,
} from '$lib'
import { virtual_window } from '$lib/virtual'
import {
  createRawSnippet,
  flushSync,
  mount,
  tick,
  unmount,
  type ComponentProps,
} from 'svelte'
import { expect, test, vi, onTestFinished } from 'vitest'
import { doc_query } from './index'

const target_for = () => {
  const target = document.createElement(`div`)
  document.body.append(target)
  onTestFinished(() => target.remove())
  return target
}
const fire_key = (target: Element, key: string, options: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent(`keydown`, { key, bubbles: true, cancelable: true, ...options }),
  )

test(`split collapse restores size and Home/End respect bounds`, async () => {
  const target = target_for()
  const on_resize = vi.fn()
  const component = mount(SplitPane, {
    target,
    props: { collapsible: true, ratio: 0.4, on_resize },
  })
  onTestFinished(() => unmount(component))
  flushSync()
  const separator = doc_query(`[role="separator"]`)
  for (const [key, size] of [
    [`Enter`, `0px`],
    [`Enter`, `40%`],
    [`End`, `85%`],
    [`Home`, `15%`],
  ]) {
    fire_key(separator, key)
    await tick()
    expect(target.style.getPropertyValue(`--split-pane-size`)).toBe(size)
  }
  expect(on_resize).toHaveBeenCalledTimes(4)
})

test.each([
  [undefined, null],
  [25, `25`],
  [150, `100`],
  [-10, `0`],
])(
  `task progress %s with caller-owned cancellation and retry`,
  async (value, expected) => {
    const target = target_for()
    const props = $state<ComponentProps<typeof TaskStatus>>({
      state: `running`,
      label: `Parsing`,
      value,
      on_cancel: vi.fn(),
      on_retry: vi.fn(),
    })
    mount(TaskStatus, { target, props })
    const progress = doc_query(`progress`)
    expect(progress.getAttribute(`value`)).toBe(expected)
    expect(progress.getAttribute(`aria-label`)).toBe(`Parsing`)
    target.querySelector(`button`)?.click()
    expect(props.on_cancel).toHaveBeenCalledOnce()
    props.state = `error`
    await tick()
    expect(target.querySelector(`progress`)).toBeNull()
    target.querySelector(`button`)?.click()
    expect(props.on_retry).toHaveBeenCalledOnce()
  },
)

test(`file picker validates, cancels superseded work, removes files and permits reselection`, async () => {
  const target = target_for()
  const signals: AbortSignal[] = []
  const reject_loads: ((reason: Error) => void)[] = []
  const on_files = vi.fn((_files: File[], signal: AbortSignal) => {
    signals.push(signal)
    return new Promise<void>((_resolve, reject) => {
      reject_loads.push(reject)
    })
  })
  const on_reject = vi.fn()
  const props = $state({
    accept: `.json`,
    max_size: 10,
    multiple: true,
    max_files: 1,
    on_files,
    on_reject,
  })
  const component = mount(FileInput, {
    target,
    props,
  })
  const input = doc_query<HTMLInputElement>(`input`)
  const good = new File([`{}`], `ok.json`)
  const select = async (files: File[]) => {
    Object.defineProperty(input, `files`, { configurable: true, value: files })
    input.dispatchEvent(new Event(`change`, { bubbles: true }))
    await tick()
  }
  await select([
    new File([`x`], `bad.txt`),
    new File([`x`.repeat(11)], `large.json`),
    good,
    good,
  ])
  expect(
    on_reject.mock.calls[0][0].map(({ reason }: { reason: string }) => reason),
  ).toEqual([`type`, `size`, `count`])
  expect(on_files.mock.calls[0][0]).toEqual([good])
  await select([good])
  expect(signals[0].aborted).toBe(true)
  expect(on_files).toHaveBeenCalledTimes(2)
  reject_loads[0](new Error(`Superseded failure`))
  await tick()
  expect(target.textContent).not.toContain(`Superseded failure`)
  expect(target.textContent).toContain(`Processing files`)
  await select([new File([`x`], `bad.txt`)])
  expect(signals[1].aborted).toBe(false)
  target.querySelector<HTMLButtonElement>(`button[aria-label="Remove ok.json"]`)?.click()
  await tick()
  expect(signals[1].aborted).toBe(true)
  expect(target.querySelectorAll(`li`)).toHaveLength(0)
  await select([good])
  reject_loads[2](new Error(`Retry this file`))
  await tick()
  expect(target.textContent).toContain(`Retry this file`)
  Array.from(target.querySelectorAll(`button`))
    .find((button) => button.textContent === `Retry`)
    ?.click()
  await tick()
  expect(on_files).toHaveBeenCalledTimes(4)
  props.accept = `.txt`
  await tick()
  const text_file = new File([`x`], `accepted.txt`)
  await select([good, text_file])
  expect(on_files.mock.lastCall?.[0]).toEqual([text_file])
  expect(on_reject.mock.lastCall?.[0]).toEqual([{ file: good, reason: `type` }])
  await unmount(component)
  expect(signals.at(-1)?.aborted).toBe(true)
})

test.each([0, 5])(
  `virtual list scrolls to an unmounted row with overscan=%s`,
  async (overscan) => {
    const target = target_for()
    const children = createRawSnippet<[unknown, number]>((item) => ({
      render: () => `<span>${item()}</span>`,
    }))
    const key = vi.fn(Number)
    let items = $state(Array.from({ length: 10000 }, (_value, idx) => idx))
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
  },
)

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
    const target = target_for()
    const load = vi.fn(async () => [{ id: `child`, label: `Child` }])
    const nodes: TreeNode[] = [
      { id: `root`, label: `Root`, load },
      { id: `last`, label: `Last` },
    ]
    const on_select = vi.fn()
    const on_selection_change = vi.fn()
    const props = $state({
      nodes,
      multiple,
      on_select,
      on_selection_change,
      expanded: new Set(initial ? [`root`] : []),
    })
    const component = mount(TreeView, { target, props })
    onTestFinished(() => unmount(component))
    const root = doc_query(`[data-tree-id="root"]`)
    expect(root.getAttribute(`aria-label`)).toBe(`Root`)
    root.focus()
    if (!initial) fire_key(root, `Enter`)
    await tick()
    await tick()
    expect(load).toHaveBeenCalledOnce()
    expect(target.querySelectorAll(`[role="treeitem"]`)).toHaveLength(3)
    fire_key(root, `ArrowRight`)
    await tick()
    expect(document.activeElement?.getAttribute(`data-tree-id`)).toBe(`child`)
    fire_key(doc_query(`[role="treeitem"]:focus`), `Enter`)
    expect(on_select).toHaveBeenCalledWith({ id: `child`, label: `Child` })
    fire_key(doc_query(`[role="treeitem"]:focus`), `ArrowLeft`)
    await tick()
    fire_key(root, `ArrowLeft`)
    await tick()
    expect(target.querySelectorAll(`[role="treeitem"]`)).toHaveLength(2)
    for (const [key, expanded] of [
      [`ArrowRight`, true],
      [`Enter`, false],
      [`Enter`, true],
      [`Enter`, false],
    ] as const) {
      fire_key(root, key)
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
    expect(on_selection_change).toHaveBeenCalledTimes(multiple ? 1 : 0)
    for (const [key, id] of [
      [`l`, `last`],
      [`r`, `root`],
      [`End`, `last`],
      [`Home`, `root`],
    ]) {
      fire_key(doc_query(`[role="treeitem"]:focus`), key)
      await tick()
      expect(document.activeElement?.getAttribute(`data-tree-id`)).toBe(id)
    }
    fire_key(root, ` `)
    await tick()
    expect(root.getAttribute(`aria-selected`)).toBe(`true`)
    expect(root.getAttribute(`aria-expanded`)).toBe(`false`)

    props.nodes[0].disabled = true
    for (const expanded of [false, true]) {
      props.expanded = new Set(expanded ? [`root`] : [])
      await tick()
      fire_key(root, `Enter`)
      await tick()
      expect(root.getAttribute(`aria-expanded`)).toBe(String(expanded))
      expect(document.activeElement).toBe(root)
    }
    expect(on_select).toHaveBeenCalledTimes(2)
    expect(on_selection_change).toHaveBeenCalledTimes(multiple ? 2 : 0)
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
    const component = mount(TreeView, { target, props })
    flushSync()
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
    await unmount(component)
    expect(requests[2].signal.aborted).toBe(true)
  },
)

test.each([`ctrlKey`, `metaKey`] as const)(
  `tree multiple selection supports %s toggles and visible ranges`,
  async (modifier) => {
    const target = target_for()
    const on_selection_change = vi.fn()
    const props = $state({
      multiple: true,
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
        { id: `delta`, label: `Delta` },
      ],
      expanded: new Set([`folder`]),
      selected_ids: new Set([`alpha`]),
      on_selection_change,
    })
    const component = mount(TreeView, { target, props })
    onTestFinished(() => unmount(component))
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
      expect(on_selection_change).toHaveBeenLastCalledWith(new Set(expected))
    }
    const calls = on_selection_change.mock.calls.length
    row(`disabled`).click()
    await tick()
    expect(on_selection_change).toHaveBeenCalledTimes(calls)
    expect(row(`disabled`).hasAttribute(`aria-selected`)).toBe(false)

    // Collapsing keeps hidden selections; ranges only include rows still visible.
    doc_query<HTMLButtonElement>(`button[aria-label="Collapse Folder"]`).click()
    await tick()
    expect(selected()).toEqual([])
    row(`delta`).dispatchEvent(new MouseEvent(`click`, { bubbles: true, shiftKey: true }))
    await tick()
    expect(selected()).toEqual([`delta`])
    // Caller-owned selection remains writable after interactions.
    props.selected_ids = new Set([`alpha`])
    await tick()
    fire_key(row(`delta`), `a`, { [modifier]: true })
    await tick()
    expect(selected()).toEqual([`folder`, `delta`])
    expect(on_selection_change).toHaveBeenLastCalledWith(
      new Set([`alpha`, `folder`, `delta`]),
    )
  },
)

test(`tree keyboard ranges shrink, Space toggles, and focus alone preserves selection`, async () => {
  const target = target_for()
  const on_selection_change = vi.fn()
  const component = mount(TreeView, {
    target,
    props: {
      multiple: true,
      nodes: [`Alpha`, `Disabled`, `Beta`, `Gamma`].map((label) => ({
        id: label,
        label,
        disabled: label === `Disabled`,
      })),
      on_selection_change,
    },
  })
  onTestFinished(() => unmount(component))
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
    fire_key(doc_query(`[role="treeitem"]:focus`), key, options)
    await tick()
    expect(document.activeElement?.getAttribute(`data-tree-id`)).toBe(focused)
    expect(on_selection_change).toHaveBeenLastCalledWith(new Set(selected))
  }
  const input = document.createElement(`input`)
  doc_query(`[data-tree-id="Alpha"]`).append(input)
  const select_all = new KeyboardEvent(`keydown`, {
    key: `a`,
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  })
  const calls = on_selection_change.mock.calls.length
  input.dispatchEvent(select_all)
  expect(select_all.defaultPrevented).toBe(false)
  expect(on_selection_change).toHaveBeenCalledTimes(calls)
})
