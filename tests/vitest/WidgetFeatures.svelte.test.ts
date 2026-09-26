import {
  Accordion,
  ButtonGroup,
  SplitPane,
  TreeView,
  VirtualList,
  type TreeNode,
  type SelectionProps,
} from '$lib'
import { virtual_window } from '$lib/virtual'
import { createRawSnippet, flushSync, mount, tick, unmount, type Component } from 'svelte'
import { expect, test, vi, onTestFinished } from 'vitest'
import { doc_query, press_key } from './index'

const target_for = () => {
  const target = document.createElement(`div`)
  document.body.append(target)
  onTestFinished(() => target.remove())
  return target
}
// mounts into a fresh target that is unmounted and removed when the test finishes
const mount_in_target = <
  Props extends Record<string, unknown>,
  Exports extends Record<string, unknown>,
>(
  component: Component<Props, Exports>,
  props: Props,
) => {
  const target = target_for()
  const instance = mount(component, { target, props })
  onTestFinished(() => unmount(instance))
  return { target, instance }
}

test.each([
  [
    `Accordion`,
    (props: SelectionProps) =>
      mount_in_target(Accordion, { items: [{ value: `alpha` }], ...props }),
  ],
  [
    `ButtonGroup`,
    (props: SelectionProps) =>
      mount_in_target(ButtonGroup, { options: [`alpha`], ...props }),
  ],
  [
    `TreeView`,
    (props: SelectionProps) =>
      mount_in_target(TreeView, { nodes: [{ id: `alpha`, label: `Alpha` }], ...props }),
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
  const { target } = mount_in_target(SplitPane, {
    collapsible: true,
    ratio: 0.4,
    on_resize,
  })
  flushSync()
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
    const children = createRawSnippet<[unknown, number]>((item) => ({
      render: () => `<span>${item()}</span>`,
    }))
    const key = vi.fn(Number)
    let items = $state(Array.from({ length: 10000 }, (_value, idx) => idx))
    const { target, instance: component } = mount_in_target(VirtualList, {
      get items() {
        return items
      },
      item_size: 20,
      initial_count: 10,
      key,
      overscan,
      children,
    })
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
    const { target } = mount_in_target(TreeView, props)
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
    const on_change = vi.fn()
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
        { id: `delta`, label: `Delta` },
      ],
      expanded: new Set([`folder`]),
      value: [`alpha`],
      on_change,
    })
    const { target } = mount_in_target(TreeView, props)
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
    row(`disabled`).click()
    await tick()
    expect(on_change).toHaveBeenCalledTimes(calls)
    expect(row(`disabled`).hasAttribute(`aria-selected`)).toBe(false)

    // Collapsing keeps hidden selections; ranges only include rows still visible.
    doc_query<HTMLButtonElement>(`button[aria-label="Collapse Folder"]`).click()
    await tick()
    expect(selected()).toEqual([])
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

test(`tree keyboard ranges shrink, Space toggles, and focus alone preserves selection`, async () => {
  const on_change = vi.fn()
  mount_in_target(TreeView, {
    mode: `multiple` as const,
    nodes: [`Alpha`, `Disabled`, `Beta`, `Gamma`].map((label) => ({
      id: label,
      label,
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
  const input = document.createElement(`input`)
  doc_query(`[data-tree-id="Alpha"]`).append(input)
  const calls = on_change.mock.calls.length
  expect(press_key(input, `a`, { ctrlKey: true }).defaultPrevented).toBe(false)
  expect(on_change).toHaveBeenCalledTimes(calls)
})
