import { tick } from 'svelte'
import { afterEach, describe, expect, test, vi } from 'vite-plus/test'
import { css_px } from '#lib/attachments/shared.ts'
import type { MultiSelectProps, PortalParams } from '#lib/types.ts'
import { create_element, doc_query } from './index'
import { focus_input, mount_multiselect } from './MultiSelect.test-utils'

const is_open = () => doc_query(`div.multiselect`).classList.contains(`open`)

// fires a window event the portal listens to, then waits for the rAF-scheduled reposition
const reposition = async (type: `resize` | `scroll` = `resize`) => {
  globalThis.dispatchEvent(new Event(type))
  await new Promise(requestAnimationFrame)
}

describe(`portal placement`, () => {
  afterEach(() => vi.unstubAllGlobals()) // don't leak innerHeight overrides to other tests

  // happy-dom has no layout engine: stub trigger rect, dropdown height, viewport
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
    vi.spyOn(dropdown, `getBoundingClientRect`).mockReturnValue(
      new DOMRect(0, 0, rect.width, dropdown_height),
    )
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

  // `top` positions the margin edge and float places the whole margin box, so above the
  // input it subtracts both vertical margins (the default margin-bottom is 0)
  function expected_top_style(
    expected_placement: `top` | `bottom`,
    trigger_rect: { top: number; bottom: number },
    dropdown_height: number,
    dropdown: HTMLUListElement,
  ): string {
    if (expected_placement === `bottom`) return `${trigger_rect.bottom}px`
    const { marginTop, marginBottom } = getComputedStyle(dropdown)
    const margin_y = css_px(marginTop) + css_px(marginBottom)
    return `${Math.max(0, trigger_rect.top - dropdown_height - margin_y)}px`
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
      desc: `unmeasured dropdown (height 0) falls back to bottom`,
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
    // the next two would place the dropdown above the viewport top, so it clamps to 0
    {
      placement: `top`,
      trigger_rect: { top: 50, bottom: 80 },
      dropdown_height: 300,
      viewport_height: 800,
      expected_placement: `top`,
      desc: `forced above a trigger near the viewport top`,
    },
    {
      // flips above (830 + 900 > 800 and 750 > 800 - 780) but 750 - 900 < 0
      placement: `auto`,
      trigger_rect: { top: 750, bottom: 780 },
      dropdown_height: 900,
      viewport_height: 800,
      expected_placement: `top`,
      desc: `a dropdown taller than the space above`,
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
      await reposition() // force a float update with stubs

      expect(dropdown.dataset.placement).toBe(expected_placement)
      expect(dropdown.style.top).toBe(
        expected_top_style(expected_placement, trigger_rect, dropdown_height, dropdown),
      )
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
    await reposition(`scroll`) // scroll listener also repositions
    expect(dropdown.dataset.placement).toBe(`bottom`)
    expect(dropdown.style.top).toBe(`130px`)

    // trigger near viewport bottom → auto flips above on next scroll
    stub_layout({
      trigger_rect: { top: 600, bottom: 630 },
      dropdown_height: 200,
      viewport_height: 700,
    })
    await reposition(`scroll`)
    expect(dropdown.dataset.placement).toBe(`top`)

    // changing placement via props re-runs the float attachment
    props.portal = { active: true, placement: `bottom` }
    await tick()
    await reposition()
    expect(dropdown.dataset.placement).toBe(`bottom`)
    expect(dropdown.style.top).toBe(`630px`)
  })
})

test(`toggling portal.active at runtime portals and un-portals the dropdown`, async () => {
  const props = $state<MultiSelectProps>({
    options: [1, 2, 3],
    open: true,
    portal: {}, // omitted `active` must stay in place, not position it as if portalled
    ul_options_style: `width: 20em`,
  })
  mount_multiselect(props)
  await tick()

  expect(document.querySelector(`body > ul.options`)).toBeNull()
  const in_place = doc_query<HTMLUListElement>(`div.multiselect ul.options`)
  expect([in_place.style.position, in_place.dataset.placement]).toEqual([``, undefined])

  props.portal = { active: true }
  await tick()
  const portalled = doc_query<HTMLUListElement>(`body > ul.options`)
  expect([portalled.style.position, portalled.style.width]).toEqual([`fixed`, `0px`])
  expect(portalled.hidden).toBe(false)

  // closed while portalled, it has no position to paint at, so it hides at once
  props.open = false
  await tick()
  expect(portalled.hidden).toBe(true)
  props.open = true
  await tick()
  expect(portalled.hidden).toBe(false)

  props.portal = { active: false }
  await tick()
  expect(document.querySelector(`body > ul.options`)).toBeNull()
  const back_inside = doc_query<HTMLUListElement>(`div.multiselect ul.options`)
  // portal-only inline styles must be cleared so component CSS applies again, while the
  // host's own ul_options_style width the portal overrode comes back
  expect(back_inside.style.position).toBe(``)
  expect(back_inside.style.width).toBe(`20em`)
  expect(back_inside.dataset.placement).toBeUndefined()

  // once home, visibility is the component CSS again: closing must not latch `hidden`
  props.open = false
  await tick()
  expect(back_inside.hidden).toBe(false)
})

// click_outside gets `inside: [options_list_el]`, undefined until bind:this lands — the
// attachment must re-run on that reactive read or pressing the list would close it
test(`press on the portalled dropdown does not close it`, async () => {
  mount_multiselect({ options: [1, 2, 3], open: true, portal: { active: true } })
  await tick()
  const press_is_open = async (target: Element) => {
    target.dispatchEvent(new PointerEvent(`pointerdown`, { bubbles: true }))
    await tick()
    return is_open()
  }

  expect(await press_is_open(doc_query(`body > ul.options`))).toBe(true)
  // control: a press with no relation to the component does close it
  expect(await press_is_open(create_element())).toBe(false)
})

// Portalled blur must not close (issue #335); in-place skips blur (it closes on its own).
test.each([
  [`portalled`, { portal: { active: true } }],
  [`in-place`, {}],
] as const)(
  `dismiss_on='release' keeps a %s dropdown open until click`,
  async (_label, extra) => {
    mount_multiselect({ options: [1, 2, 3], dismiss_on: `release`, open: true, ...extra })
    await tick()
    expect(is_open()).toBe(true)

    const outside = create_element(`button`)
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
  },
)

test.each([true, false])(
  `disabling an open list closes it and keeps it closed (portal.active=%s)`,
  async (active) => {
    const on_close = vi.fn()
    const props = $state<MultiSelectProps>({
      options: [`Apple`, `Orange`],
      portal: { active },
      select_all_option: true,
      on_close,
    })
    mount_multiselect(props)
    await focus_input()
    expect(is_open()).toBe(true)
    const select_all = doc_query(`ul.options > li.select-all`)
    select_all.focus() // focus inside the list would keep taking Enter/Space
    expect(document.activeElement).toBe(select_all)

    props.disabled = true
    await tick()
    expect(is_open()).toBe(false)
    expect(document.activeElement).toBe(document.body)
    expect(doc_query(`ul.options`).classList).toContain(`hidden`)
    expect(on_close).toHaveBeenCalledExactlyOnceWith({ via: `disabled` })

    props.open = true // a parent binding can't reopen a disabled control
    await tick()
    expect(is_open()).toBe(false)
    expect(on_close).toHaveBeenCalledOnce() // nor hear another close for it

    // a parent re-opening from on_close itself mustn't ping-pong with the disabled close
    props.disabled = false
    await tick()
    await focus_input()
    on_close.mockImplementation(() => (props.open = true))
    props.disabled = true
    await tick()
    expect(is_open()).toBe(false)
    expect(on_close).toHaveBeenCalledTimes(2)
    on_close.mockReset()

    props.disabled = false
    await tick()
    expect(is_open()).toBe(false) // re-enabling doesn't reopen on its own
    await focus_input()
    expect(is_open()).toBe(true)
  },
)
