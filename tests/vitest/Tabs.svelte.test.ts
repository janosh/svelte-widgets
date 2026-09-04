import Tabs from '$lib/Tabs.svelte'
import type { TabItem } from '$lib/types'
import type { ComponentProps } from 'svelte'
import { createRawSnippet, mount, tick } from 'svelte'
import { describe, expect, test, vi } from 'vitest'
import { press_key } from './index'

describe(`Tabs`, () => {
  const items = [
    { value: `overview`, label: `Overview` },
    { value: `disabled`, label: `Disabled`, disabled: true },
    { value: `details`, label: `Details` },
  ] satisfies TabItem[]
  type Props = ComponentProps<typeof Tabs>

  const mount_tabs = (extra: Partial<Props> = {}) => {
    const props: Props = $state({ items, ...extra })
    mount(Tabs, { target: document.body, props })
    return props
  }
  const tabs = () => [
    ...document.querySelectorAll<HTMLButtonElement>(`button[role="tab"]`),
  ]
  const panels = () => [...document.querySelectorAll<HTMLDivElement>(`[role="tabpanel"]`)]

  test.each([
    [`omitted`, { value: undefined }],
    [`invalid`, { value: `missing` }],
  ] as const)(`materializes the first enabled value when %s`, async (_case, extra) => {
    const on_change = vi.fn()
    const props = mount_tabs({ ...extra, on_change })
    await tick()

    expect(props.value).toBe(`overview`)
    expect(tabs().map((tab) => tab.getAttribute(`aria-selected`))).toEqual([
      `true`,
      `false`,
      `false`,
    ])
    expect(on_change).not.toHaveBeenCalled()
  })

  test(`materializes a new fallback when items invalidate the value`, async () => {
    const on_change = vi.fn()
    const props = mount_tabs({ value: `details`, on_change })
    props.items = [
      { value: `unavailable`, disabled: true },
      { value: `replacement`, label: `Replacement` },
    ]
    await tick()

    expect(props.value).toBe(`replacement`)
    expect(
      tabs().map((tab) => [tab.dataset.value, tab.getAttribute(`aria-selected`)]),
    ).toEqual([
      [`unavailable`, `false`],
      [`replacement`, `true`],
    ])
    expect(on_change).not.toHaveBeenCalled()
  })

  test(`renders stable linked tab and panel semantics`, async () => {
    const props = mount_tabs({
      value: `details`,
      label: `Documentation sections`,
      orientation: `vertical`,
    })
    const tab_list = document.querySelector(`[role="tablist"]`)
    expect([
      tab_list?.getAttribute(`aria-label`),
      tab_list?.getAttribute(`aria-orientation`),
    ]).toEqual([`Documentation sections`, `vertical`])

    const initial_ids = tabs().map((tab) => tab.id)
    expect(
      tabs().map((tab, tab_idx) => [
        tab.textContent?.trim(),
        tab.getAttribute(`aria-selected`),
        tab.getAttribute(`aria-disabled`),
        tab.tabIndex,
        tab.getAttribute(`aria-controls`),
        panels()[tab_idx].id,
        panels()[tab_idx].getAttribute(`aria-labelledby`),
        panels()[tab_idx].hidden,
      ]),
    ).toEqual([
      [`Overview`, `false`, null, -1, panels()[0].id, panels()[0].id, tabs()[0].id, true],
      [
        `Disabled`,
        `false`,
        `true`,
        -1,
        panels()[1].id,
        panels()[1].id,
        tabs()[1].id,
        true,
      ],
      [`Details`, `true`, null, 0, panels()[2].id, panels()[2].id, tabs()[2].id, false],
    ])

    props.value = `overview`
    await tick()
    expect(tabs().map((tab) => tab.id)).toEqual(initial_ids)
    expect(
      tabs().map((tab) => [tab.getAttribute(`aria-selected`), tab.tabIndex]),
    ).toEqual([
      [`true`, 0],
      [`false`, -1],
      [`false`, -1],
    ])
  })

  test(`clicks update the controlled value and ignore disabled tabs`, async () => {
    const on_change = vi.fn()
    const props = mount_tabs({ value: `overview`, on_change })

    tabs()[1].click()
    expect(props.value).toBe(`overview`)
    expect(on_change).not.toHaveBeenCalled()

    tabs()[2].click()
    await tick()
    expect(props.value).toBe(`details`)
    expect(on_change).toHaveBeenCalledExactlyOnceWith(`details`)
    expect(panels().map((panel) => panel.hidden)).toEqual([true, true, false])

    tabs()[2].click()
    expect(on_change).toHaveBeenCalledOnce()
  })

  test(`automatic activation follows horizontal focus navigation`, async () => {
    const props = mount_tabs({ value: `overview` })
    tabs()[0].focus()

    for (const [key, expected] of [
      [`ArrowRight`, `details`],
      [`ArrowRight`, `overview`],
      [`End`, `details`],
      [`Home`, `overview`],
      [`ArrowLeft`, `details`],
    ] as const) {
      const event = press_key(document.activeElement ?? document.body, key)
      await tick()
      expect(event.defaultPrevented).toBe(true)
      expect((document.activeElement as HTMLElement | null)?.dataset.value).toBe(expected)
      expect(props.value).toBe(expected)
    }

    const vertical_key = press_key(document.activeElement ?? document.body, `ArrowDown`)
    expect(vertical_key.defaultPrevented).toBe(false)
    expect(props.value).toBe(`details`)
  })

  test.each([
    [`ArrowDown`, `details`],
    [`ArrowUp`, `details`],
  ] as const)(`vertical %s navigation skips disabled tabs`, async (key, expected) => {
    const props = mount_tabs({ value: `overview`, orientation: `vertical` })
    tabs()[0].focus()
    press_key(tabs()[0], key)
    await tick()
    expect((document.activeElement as HTMLElement | null)?.dataset.value).toBe(expected)
    expect(props.value).toBe(expected)
  })

  test(`manual activation moves the roving stop before button activation selects`, async () => {
    const on_change = vi.fn()
    const props = mount_tabs({ value: `overview`, activation: `manual`, on_change })
    tabs()[0].focus()

    press_key(tabs()[0], `ArrowRight`)
    await tick()
    expect(document.activeElement).toBe(tabs()[2])
    expect(props.value).toBe(`overview`)
    expect(
      tabs().map((tab) => [tab.getAttribute(`aria-selected`), tab.tabIndex]),
    ).toEqual([
      [`true`, -1],
      [`false`, -1],
      [`false`, 0],
    ])

    tabs()[2].click()
    await tick()
    expect(props.value).toBe(`details`)
    expect(on_change).toHaveBeenLastCalledWith(`details`)

    press_key(tabs()[2], `ArrowLeft`)
    tabs()[0].click()
    await tick()
    expect(props.value).toBe(`overview`)
    expect(on_change).toHaveBeenLastCalledWith(`overview`)

    tabs()[2].focus()
    props.items = [items[0]]
    await tick()
    expect(tabs()[0].tabIndex).toBe(0)
  })

  test(`tab and panel snippets receive item and selection state`, () => {
    const tab = createRawSnippet<
      [{ item: TabItem; selected: boolean; focused: boolean }]
    >((get_params) => ({
      render: () => {
        const { item, selected, focused } = get_params()
        return `<span data-tab="${item.value}">${selected}/${focused}</span>`
      },
    }))
    const panel = createRawSnippet<[{ item: TabItem; selected: boolean }]>(
      (get_params) => ({
        render: () => {
          const { item, selected } = get_params()
          return `<p data-panel="${item.value}">${item.label}/${selected}</p>`
        },
      }),
    )
    mount_tabs({ value: `details`, tab, panel })

    expect(tabs().map((tab_el) => tab_el.textContent)).toEqual([
      `false/false`,
      `false/false`,
      `true/true`,
    ])
    expect(panels().map((panel_el) => panel_el.textContent)).toEqual([
      `Overview/false`,
      `Disabled/false`,
      `Details/true`,
    ])
  })
})
