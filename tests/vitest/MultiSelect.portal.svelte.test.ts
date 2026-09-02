import { tick } from 'svelte'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import type { MultiSelectProps, PortalParams } from '$lib/types'
import { doc_query } from './index'
import { mount_multiselect, unmount_component } from './MultiSelect.test-utils'

describe(`portal placement`, () => {
  afterEach(() => vi.unstubAllGlobals()) // don't leak innerHeight overrides to other tests

  // happy-dom has no layout engine: stub trigger rect, dropdown offsetHeight, viewport
  function stub_layout({
    trigger_rect,
    dropdown_height,
    viewport_height,
  }: {
    trigger_rect: { top: number; bottom: number }
    dropdown_height: number
    viewport_height: number
  }): HTMLUListElement {
    const { top, bottom } = trigger_rect
    const rect = {
      top,
      bottom,
      left: 10,
      right: 210,
      width: 200,
      height: bottom - top,
      x: 10,
      y: top,
      toJSON: () => ({}),
    } as DOMRect
    vi.spyOn(doc_query(`div.multiselect`), `getBoundingClientRect`).mockReturnValue(rect)
    const dropdown = doc_query<HTMLUListElement>(`body > ul.options`)
    Object.defineProperty(dropdown, `offsetHeight`, {
      value: dropdown_height,
      configurable: true,
    })
    vi.stubGlobal(`innerHeight`, viewport_height)
    return dropdown
  }

  async function mount_with_portal(placement?: PortalParams[`placement`]) {
    mount_multiselect({
      options: [1, 2, 3],
      open: true,
      portal: { active: true, placement },
    })
    await tick()
  }

  // `top` positions the margin edge, so the action subtracts margin-top when above
  function expected_top_style(
    expected_placement: `top` | `bottom`,
    trigger_rect: { top: number; bottom: number },
    dropdown_height: number,
    dropdown: HTMLUListElement,
  ): string {
    if (expected_placement === `bottom`) return `${trigger_rect.bottom}px`
    const margin_px = getComputedStyle(dropdown).marginTop.replace(/px$/u, ``)
    const margin_top = Number(margin_px) || 0
    return `${Math.max(0, trigger_rect.top - dropdown_height - margin_top)}px`
  }

  test.each([
    {
      placement: `auto`,
      trigger_rect: { top: 100, bottom: 130 },
      dropdown_height: 200,
      viewport_height: 800,
      expected_placement: `bottom`,
      desc: `plenty of space below`,
    },
    {
      placement: `auto`,
      trigger_rect: { top: 600, bottom: 630 },
      dropdown_height: 200,
      viewport_height: 700,
      expected_placement: `top`,
      desc: `insufficient space below and more space above`,
    },
    {
      placement: `top`,
      trigger_rect: { top: 300, bottom: 330 },
      dropdown_height: 200,
      viewport_height: 800,
      expected_placement: `top`,
      desc: `forced above despite ample space below`,
    },
    {
      placement: `bottom`,
      trigger_rect: { top: 600, bottom: 630 },
      dropdown_height: 200,
      viewport_height: 700,
      expected_placement: `bottom`,
      desc: `forced below despite tight space below`,
    },
    {
      placement: `auto`,
      trigger_rect: { top: 600, bottom: 630 },
      dropdown_height: 0,
      viewport_height: 700,
      expected_placement: `bottom`,
      desc: `unmeasured dropdown (offsetHeight 0) falls back to bottom`,
    },
    {
      // same tight-space-below setup as the auto row above, so a flip proves the default
      placement: undefined,
      trigger_rect: { top: 600, bottom: 630 },
      dropdown_height: 200,
      viewport_height: 700,
      expected_placement: `top`,
      desc: `omitted placement defaults to auto and flips above`,
    },
  ] as const)(
    `placement=$placement with $desc resolves to $expected_placement`,
    async ({
      placement,
      trigger_rect,
      dropdown_height,
      viewport_height,
      expected_placement,
    }) => {
      await mount_with_portal(placement)
      const dropdown = stub_layout({ trigger_rect, dropdown_height, viewport_height })

      globalThis.dispatchEvent(new Event(`resize`)) // force update_position with stubs

      expect(dropdown.dataset.placement).toBe(expected_placement)
      expect(dropdown.style.top).toBe(
        expected_top_style(expected_placement, trigger_rect, dropdown_height, dropdown),
      )
    },
  )

  test.each([
    // forced top with trigger near viewport top and dropdown taller than space above
    { placement: `top`, trigger_rect: { top: 50, bottom: 80 }, dropdown_height: 300 },
    // auto flips above (830 + 900 > 800 and 750 > 800 - 780) but 750 - 900 < 0
    { placement: `auto`, trigger_rect: { top: 750, bottom: 780 }, dropdown_height: 900 },
  ] as const)(
    `placement=$placement never positions dropdown above viewport top (clamps to 0)`,
    async ({ placement, trigger_rect, dropdown_height }) => {
      await mount_with_portal(placement)
      const dropdown = stub_layout({
        trigger_rect,
        dropdown_height,
        viewport_height: 800,
      })

      globalThis.dispatchEvent(new Event(`resize`))

      expect(dropdown.dataset.placement).toBe(`top`)
      expect(dropdown.style.top).toBe(`0px`)
    },
  )

  test(`placement recomputes on scroll and reacts to updated portal params`, async () => {
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3],
      open: true,
      portal: { active: true, placement: `auto` },
    })
    mount_multiselect(props)
    await tick()

    const dropdown = stub_layout({
      trigger_rect: { top: 100, bottom: 130 },
      dropdown_height: 200,
      viewport_height: 800,
    })
    globalThis.dispatchEvent(new Event(`scroll`)) // scroll listener also repositions
    expect(dropdown.dataset.placement).toBe(`bottom`)
    expect(dropdown.style.top).toBe(`130px`)

    // trigger near viewport bottom → auto flips above on next scroll
    stub_layout({
      trigger_rect: { top: 600, bottom: 630 },
      dropdown_height: 200,
      viewport_height: 700,
    })
    globalThis.dispatchEvent(new Event(`scroll`))
    expect(dropdown.dataset.placement).toBe(`top`)

    // changing placement via props flows through the action's update() method
    props.portal = { active: true, placement: `bottom` }
    await tick()
    globalThis.dispatchEvent(new Event(`resize`))
    expect(dropdown.dataset.placement).toBe(`bottom`)
    expect(dropdown.style.top).toBe(`630px`)
  })
})

test(`toggling portal.active at runtime portals and un-portals the dropdown`, async () => {
  const props = $state<MultiSelectProps>({
    options: [1, 2, 3],
    open: true,
    portal: { active: false },
  })
  mount_multiselect(props)
  await tick()

  expect(document.querySelector(`body > ul.options`)).toBeNull()
  expect(document.querySelector(`div.multiselect ul.options`)).not.toBeNull()

  props.portal = { active: true }
  await tick()
  const portalled = doc_query<HTMLUListElement>(`body > ul.options`)
  expect(portalled.style.position).toBe(`fixed`)

  props.portal = { active: false }
  await tick()
  expect(document.querySelector(`body > ul.options`)).toBeNull()
  const back_inside = doc_query<HTMLUListElement>(`div.multiselect ul.options`)
  // portal-only inline styles must be cleared so component CSS applies again
  expect(back_inside.style.position).toBe(``)
  expect(back_inside.dataset.placement).toBeUndefined()
})

// click_outside gets `inside: [options_list_el]`, undefined until bind:this lands — the
// attachment must re-run on that reactive read or pressing the list would close it
test(`press on the portalled dropdown does not close it`, async () => {
  const props = $state<MultiSelectProps>({
    options: [1, 2, 3],
    open: true,
    portal: { active: true },
  })
  // unmount for real: clearing innerHTML would leave the document press listener
  const app = mount_multiselect(props)
  await tick()

  const portalled = doc_query<HTMLUListElement>(`body > ul.options`)
  portalled.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))
  await tick()
  expect(doc_query(`div.multiselect`).classList.contains(`open`)).toBe(true)

  // control: a press with no relation to the component does close it
  const outside = document.createElement(`div`)
  document.body.append(outside)
  outside.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))
  await tick()
  expect(doc_query(`div.multiselect`).classList.contains(`open`)).toBe(false)
  outside.remove()
  await unmount_component(app)
})

// Portalled blur must not close (issue #335); in-place skips blur (it closes on its own).
test.each([
  [`portalled`, { portal: { active: true } }],
  [`in-place`, {}],
] as const)(
  `dismiss_on='release' keeps a %s dropdown open until click`,
  async (_label, extra) => {
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3],
      dismiss_on: `release`,
      open: true,
      ...extra,
    })
    const app = mount_multiselect(props)
    await tick()
    const is_open = () => doc_query(`div.multiselect`).classList.contains(`open`)
    expect(is_open()).toBe(true)

    const outside = document.createElement(`button`)
    document.body.append(outside)
    outside.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))
    if (`portal` in extra) {
      doc_query(`input[autocomplete]`).dispatchEvent(
        new FocusEvent(`blur`, { relatedTarget: outside }),
      )
    }
    await tick()
    expect(is_open()).toBe(true)

    outside.dispatchEvent(new PointerEvent(`click`, { bubbles: true, detail: 1 }))
    await tick()
    expect(is_open()).toBe(false)
    outside.remove()
    await unmount_component(app)
  },
)
