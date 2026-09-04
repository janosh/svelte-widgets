import Accordion from '$lib/Accordion.svelte'
import type { AccordionItem } from '$lib/types'
import type { ComponentProps } from 'svelte'
import { createRawSnippet, mount, tick } from 'svelte'
import { describe, expect, test, vi } from 'vitest'
import TestNestedAccordion from './TestNestedAccordion.svelte'
import { press_key } from './index'

describe(`Accordion`, () => {
  const items = [
    { value: `alpha`, label: `Alpha` },
    { value: `disabled`, label: `Disabled`, disabled: true },
    { value: `gamma`, label: `Gamma` },
  ] satisfies AccordionItem[]
  type Props = ComponentProps<typeof Accordion>

  const mount_accordion = (extra: Partial<Props> = {}) => {
    const props: Props = $state({ items, ...extra })
    mount(Accordion, { target: document.body, props })
    return props
  }
  const triggers = () => [
    ...document.querySelectorAll<HTMLButtonElement>(`button.accordion-trigger`),
  ]
  const panels = () => [...document.querySelectorAll<HTMLDivElement>(`[role="region"]`)]
  const click_trigger = async (trigger_idx: number) => {
    triggers()[trigger_idx].click()
    await tick()
  }

  test(`renders heading buttons linked to labeled regions`, async () => {
    const props = mount_accordion({ value: `gamma`, heading_level: 4 })
    expect(document.querySelectorAll(`h4.accordion-heading`)).toHaveLength(3)
    const trigger_nodes = triggers()
    const panel_nodes = panels()
    const initial_ids = trigger_nodes.map((trigger) => trigger.id)
    expect(
      trigger_nodes.map((trigger, trigger_idx) => {
        const panel = panel_nodes[trigger_idx]
        return [
          trigger.textContent?.trim(),
          trigger.getAttribute(`aria-expanded`),
          trigger.getAttribute(`aria-disabled`),
          panel.hidden,
          trigger.getAttribute(`aria-controls`) === panel.id,
          panel.getAttribute(`aria-labelledby`) === trigger.id,
        ]
      }),
    ).toEqual([
      [`Alpha`, `false`, null, true, true, true],
      [`Disabled`, `false`, `true`, true, true, true],
      [`Gamma`, `true`, null, false, true, true],
    ])

    props.value = `alpha`
    await tick()
    expect(trigger_nodes.map((trigger) => trigger.id)).toEqual(initial_ids)
    expect(trigger_nodes.map((trigger) => trigger.getAttribute(`aria-expanded`))).toEqual(
      [`true`, `false`, `false`],
    )
  })

  test(`single mode controls one open item and honors collapsible`, async () => {
    const on_change = vi.fn()
    const props = mount_accordion({ value: null, on_change })

    await click_trigger(0)
    expect(props.value).toBe(`alpha`)
    expect(panels().map((panel) => panel.hidden)).toEqual([false, true, true])
    expect(on_change).toHaveBeenLastCalledWith(`alpha`)

    await click_trigger(2)
    expect(props.value).toBe(`gamma`)
    expect(panels().map((panel) => panel.hidden)).toEqual([true, true, false])
    expect(on_change).toHaveBeenLastCalledWith(`gamma`)

    props.collapsible = false
    await click_trigger(2)
    expect(props.value).toBe(`gamma`)
    expect(on_change).toHaveBeenCalledTimes(2)
    expect(triggers()[2].getAttribute(`aria-disabled`)).toBe(`true`)

    await click_trigger(0)
    expect(props.value).toBe(`alpha`)
    expect(on_change).toHaveBeenLastCalledWith(`alpha`)
    expect(triggers()[0].getAttribute(`aria-disabled`)).toBe(`true`)

    props.collapsible = true
    await click_trigger(0)
    expect(props.value).toBeNull()
    expect(on_change).toHaveBeenLastCalledWith(null)

    triggers()[1].click()
    expect(props.value).toBeNull()
    expect(on_change).toHaveBeenCalledTimes(4)
  })

  test(`multiple mode adds and removes controlled values independently`, async () => {
    const on_change = vi.fn()
    const props = mount_accordion({
      multiple: true,
      collapsible: false,
      value: [`alpha`],
      on_change,
    })

    await click_trigger(2)
    expect(props.value).toEqual([`alpha`, `gamma`])
    expect(triggers().map((trigger) => trigger.getAttribute(`aria-expanded`))).toEqual([
      `true`,
      `false`,
      `true`,
    ])
    expect(on_change).toHaveBeenLastCalledWith([`alpha`, `gamma`])

    await click_trigger(0)
    expect(props.value).toEqual([`gamma`])
    expect(on_change).toHaveBeenLastCalledWith([`gamma`])
  })

  // An uncontrolled accordion falls back to the empty shape for its mode, and a value
  // whose shape belongs to the other mode reads as nothing open rather than throwing.
  test.each([
    [`uncontrolled single`, {}, []],
    [`uncontrolled multiple`, { multiple: true }, []],
    [`array value in single mode`, { value: [`alpha`] }, []],
    [`single value in multiple mode`, { multiple: true, value: `alpha` }, []],
    [`matching multiple value`, { multiple: true, value: [`alpha`, `gamma`] }, [0, 2]],
  ] as [string, Partial<Props>, number[]][])(`%s`, (_name, props, open_panel_indices) => {
    mount_accordion(props)
    expect(
      panels().flatMap((panel, panel_idx) => (panel.hidden ? [] : [panel_idx])),
    ).toEqual(open_panel_indices)
  })

  test(`arrow, Home and End keys move focus across enabled headings`, () => {
    mount_accordion({ value: `alpha` })
    triggers()[0].focus()

    for (const [key, expected_idx] of [
      [`ArrowDown`, 2],
      [`ArrowDown`, 0],
      [`ArrowUp`, 2],
      [`Home`, 0],
      [`End`, 2],
    ] as const) {
      const event = press_key(document.activeElement ?? document.body, key)
      expect(event.defaultPrevented).toBe(true)
      expect(document.activeElement).toBe(triggers()[expected_idx])
    }
    expect(triggers().map((trigger) => trigger.getAttribute(`aria-expanded`))).toEqual([
      `true`,
      `false`,
      `false`,
    ])

    const left = press_key(document.activeElement ?? document.body, `ArrowLeft`)
    expect(left.defaultPrevented).toBe(false)
    expect(document.activeElement).toBe(triggers()[2])
  })

  test(`nested accordions keep arrow navigation within the owning root`, () => {
    mount(TestNestedAccordion, { target: document.body })
    const inner_root = document.querySelectorAll(`.accordion`)[1]
    const inner_triggers = [
      ...inner_root.querySelectorAll<HTMLButtonElement>(`button.accordion-trigger`),
    ]

    inner_triggers[0].focus()
    press_key(inner_triggers[0], `ArrowDown`)

    expect(document.activeElement).toBe(inner_triggers[1])
  })

  test(`trigger and panel snippets receive item and open state`, () => {
    const trigger = createRawSnippet<[{ item: AccordionItem; open: boolean }]>(
      (get_params) => ({
        render: () => {
          const { item, open } = get_params()
          return `<span data-trigger="${item.value}">${item.label}/${open}</span>`
        },
      }),
    )
    const panel = createRawSnippet<[{ item: AccordionItem; open: boolean }]>(
      (get_params) => ({
        render: () => {
          const { item, open } = get_params()
          return `<p data-panel="${item.value}">${item.value}/${open}</p>`
        },
      }),
    )
    mount_accordion({ value: `alpha`, trigger, panel })

    expect(triggers().map((trigger_el) => trigger_el.textContent)).toEqual([
      `Alpha/true`,
      `Disabled/false`,
      `Gamma/false`,
    ])
    expect(panels().map((panel_el) => panel_el.textContent)).toEqual([
      `alpha/true`,
      `disabled/false`,
      `gamma/false`,
    ])
  })
})
