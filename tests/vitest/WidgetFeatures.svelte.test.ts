import {
  FileInput,
  JsonTree,
  Progress,
  SplitPane,
  TaskStatus,
  TreeView,
  VirtualList,
  type TreeNode,
} from '$lib'
import { virtual_window } from '$lib/virtual'
import { createRawSnippet, flushSync, mount, tick, unmount } from 'svelte'
import { expect, test, vi, onTestFinished } from 'vite-plus/test'

const target_for = () => {
  const target = document.createElement(`div`)
  document.body.append(target)
  onTestFinished(() => target.remove())
  return target
}
const fire_key = (target: Element, key: string) =>
  target.dispatchEvent(
    new KeyboardEvent(`keydown`, { key, bubbles: true, cancelable: true }),
  )

test(`split collapse restores size and Home/End respect bounds`, async () => {
  const target = target_for()
  const onresize = vi.fn()
  const component = mount(SplitPane, {
    target,
    props: { collapsible: true, ratio: 0.4, onresize },
  })
  onTestFinished(() => unmount(component))
  flushSync()
  const separator = target.querySelector(`[role="separator"]`)
  if (!separator) throw new Error(`Missing separator`)
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
  expect(onresize).toHaveBeenCalledTimes(4)
})

test.each([
  [undefined, null],
  [25, `25`],
  [150, `100`],
  [-10, `0`],
])(`progress %s`, (value, expected) => {
  const target = target_for()
  mount(Progress, { target, props: { value, label: `Loading atoms` } })
  expect(target.querySelector(`progress`)?.getAttribute(`value`)).toBe(expected)
  expect(target.querySelector(`progress`)?.getAttribute(`aria-label`)).toBe(
    `Loading atoms`,
  )
})

test(`task cancellation and retry belong to the caller`, async () => {
  const target = target_for()
  const props = $state({
    state: `running`,
    label: `Parsing`,
    oncancel: vi.fn(),
    onretry: vi.fn(),
  })
  mount(TaskStatus, { target, props })
  target.querySelector(`button`)?.click()
  expect(props.oncancel).toHaveBeenCalledOnce()
  props.state = `error`
  await tick()
  expect(target.querySelector(`progress`)).toBeNull()
  target.querySelector(`button`)?.click()
  expect(props.onretry).toHaveBeenCalledOnce()
})

test(`file picker validates, cancels superseded work, removes files and permits reselection`, async () => {
  const target = target_for()
  const signals: AbortSignal[] = []
  const reject_loads: ((reason: Error) => void)[] = []
  const onfiles = vi.fn((_files: File[], signal: AbortSignal) => {
    signals.push(signal)
    return new Promise<void>((_resolve, reject) => {
      reject_loads.push(reject)
    })
  })
  const onreject = vi.fn()
  const component = mount(FileInput, {
    target,
    props: {
      accept: `.json`,
      max_size: 10,
      multiple: true,
      max_files: 1,
      onfiles,
      onreject,
    },
  })
  const input = target.querySelector(`input`)
  if (!input) throw new Error(`Missing input`)
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
    onreject.mock.calls[0][0].map(({ reason }: { reason: string }) => reason),
  ).toEqual([`type`, `size`, `count`])
  expect(onfiles.mock.calls[0][0]).toEqual([good])
  await select([good])
  expect(signals[0].aborted).toBe(true)
  expect(onfiles).toHaveBeenCalledTimes(2)
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
  expect(onfiles).toHaveBeenCalledTimes(4)
  await unmount(component)
  expect(signals[3].aborted).toBe(true)
})

test.each([0, 5])(
  `virtual list scrolls to an unmounted row with overscan=%s`,
  async (overscan) => {
    const target = target_for()
    const children = createRawSnippet<[number, number]>((item) => ({
      render: () => `<span>${item()}</span>`,
    }))
    const component = mount(VirtualList, {
      target,
      props: {
        items: Array.from({ length: 10000 }, (_value, idx) => idx),
        item_size: 20,
        initial_count: 10,
        overscan,
        children,
      },
    })
    onTestFinished(() => unmount(component))
    flushSync()
    expect(target.querySelectorAll(`[data-index]`)).toHaveLength(10)
    component.scroll_to_index(9000)
    await tick()
    expect(target.querySelector(`[data-index="9000"]`)?.textContent).toBe(`9000`)
    expect(target.querySelectorAll(`[data-index]`).length).toBeLessThan(25)
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

test.each([false, true])(
  `tree lazy expansion, keyboard navigation and selection (initial=%s)`,
  async (initial) => {
    const target = target_for()
    const load = vi.fn(async () => [{ id: `child`, label: `Child` }])
    const nodes: TreeNode[] = [
      { id: `root`, label: `Root`, load },
      { id: `last`, label: `Last` },
    ]
    const onselect = vi.fn()
    const component = mount(TreeView, {
      target,
      props: { nodes, onselect, expanded: new Set(initial ? [`root`] : []) },
    })
    onTestFinished(() => unmount(component))
    const root = target.querySelector<HTMLElement>(`[data-tree-id="root"]`)
    if (!root) throw new Error(`Missing root`)
    if (!initial) fire_key(root, `ArrowRight`)
    await tick()
    await tick()
    expect(load).toHaveBeenCalledOnce()
    expect(target.querySelectorAll(`[role="treeitem"]`)).toHaveLength(3)
    fire_key(root, `ArrowRight`)
    await tick()
    expect(document.activeElement?.getAttribute(`data-tree-id`)).toBe(`child`)
    fire_key(document.activeElement as Element, `Enter`)
    expect(onselect).toHaveBeenCalledWith({ id: `child`, label: `Child` })
    fire_key(document.activeElement as Element, `ArrowLeft`)
    await tick()
    fire_key(root, `ArrowLeft`)
    await tick()
    expect(target.querySelectorAll(`[role="treeitem"]`)).toHaveLength(2)
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
    props.nodes = [{ id: `root`, label: `New`, load }]
    await tick()
    expect(requests).toHaveLength(2)
    expect(requests[0].signal.aborted).toBe(true)
    if (reject_old) requests[0].reject(new Error(`Old failed`))
    else requests[0].resolve([{ id: `stale`, label: `Stale` }])
    await tick()
    expect(target.querySelector(`[data-tree-id="root"]`)?.getAttribute(`aria-busy`)).toBe(
      `true`,
    )
    expect(target.textContent).not.toMatch(/Old failed|Stale/)
    requests[1].resolve([{ id: `child`, label: `Child` }])
    await tick()
    expect(target.querySelector(`[data-tree-id="child"]`)).not.toBeNull()
    expect(target.querySelector(`[data-tree-id="root"]`)?.getAttribute(`aria-busy`)).toBe(
      `false`,
    )
    props.nodes = [{ id: `root`, label: `Unmounting`, load }]
    await tick()
    await unmount(component)
    expect(requests[2].signal.aborted).toBe(true)
  },
)

test(`JSON tree preserves nested values and editing controls`, () => {
  const target = target_for()
  mount(JsonTree, {
    target,
    props: {
      value: { name: `example`, nested: { value: 42 } },
      default_fold_level: 5,
      editable: true,
    },
  })
  flushSync()
  expect(target.textContent).toContain(`example`)
  expect(target.textContent).toContain(`42`)
  expect(target.querySelector(`input[type="search"]`)).not.toBeNull()
  expect(target.querySelectorAll(`.json-node`).length).toBeGreaterThan(2)
})
