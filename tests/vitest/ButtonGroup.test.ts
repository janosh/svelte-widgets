import ButtonGroup from '$lib/ButtonGroup.svelte'
import { Check } from '$lib/icons'
import button_group_source from '$lib/ButtonGroup.svelte?raw'
import type { ButtonGroupOption } from '$lib/types'
import type { ComponentProps } from 'svelte'
import { createRawSnippet, tick } from 'svelte'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { doc_query, hover as dispatch_hover, render, press_key } from './index'

describe(`ButtonGroup`, () => {
  type Props = Partial<ComponentProps<typeof ButtonGroup>>
  type Option = ButtonGroupOption

  afterEach(() => void vi.useRealTimers())

  const mount_group = (props: Props) => {
    render(ButtonGroup, props as ComponentProps<typeof ButtonGroup>)
    // `[data-value]` so an option_suffix rendering its own button doesn't join the list
    return [
      ...document.querySelectorAll<HTMLButtonElement>(`.options button[data-value]`),
    ]
  }
  const values_of = (buttons: HTMLButtonElement[]) =>
    buttons.map((button) => button.dataset.value)
  const checked_state = (button: HTMLButtonElement) =>
    button.getAttribute(`aria-checked`) ?? button.getAttribute(`aria-pressed`)
  const press = (key: string, target: Element | null = document.activeElement) =>
    target && press_key(target, key)

  const letters = [
    { value: `alpha`, label: `Alpha` },
    { value: `beta`, label: `Beta` },
    { value: `gamma`, label: `Gamma` },
  ]
  // happy-dom drops nested CSS; inspect source for the styling contract.
  const styles = button_group_source.slice(button_group_source.indexOf(`<style>`))
  const info_link = createRawSnippet<[{ option: { value: string }; selected: boolean }]>(
    (get_params) => ({
      render: () => {
        const { option: opt, selected } = get_params()
        return `<a href="/docs/${opt.value}" data-sel="${selected}">i</a>`
      },
    }),
  )

  test.each([
    [`bare values`, [`alpha`, `beta`, `gamma`], [`alpha`, `beta`, `gamma`]],
    [
      `option objects`,
      [
        { value: `alpha`, label: `Alpha` },
        { value: `beta`, label: `Beta` },
        { value: `gamma` },
      ],
      [`Alpha`, `Beta`, `gamma`],
    ],
  ] as const)(`renders %s as one button per option`, (_desc, options, labels) => {
    const buttons = mount_group({ options, value: `beta` })

    expect(values_of(buttons)).toEqual([`alpha`, `beta`, `gamma`])
    expect(buttons.map((button) => button.textContent?.trim())).toEqual(labels)
    expect(buttons.map(checked_state)).toEqual([`false`, `true`, `false`])
  })

  test(`throws on an option shape it cannot read`, () => {
    expect(() => mount_group({ options: [{ label: `no value` }] as never })).toThrow(
      /unsupported option/,
    )
  })

  test.each([
    [`radiogroup`, `radio`, `aria-checked`, `aria-pressed`, { value: `beta` }],
    [
      `group`,
      null,
      `aria-pressed`,
      `aria-checked`,
      // `value` is bindable and reassigned, so it must stay mutable under `as const`
      { mode: `multiple`, value: [`beta`] as string[] },
    ],
  ] as const)(
    `a %s announces state through %s`,
    (group_role, button_role, used_attr, unused_attr, mode) => {
      const buttons = mount_group({ options: letters, label: `Greek letters`, ...mode })

      const group = doc_query(`.options`)
      expect(group.getAttribute(`role`)).toBe(group_role)
      expect(group.getAttribute(`aria-label`)).toBe(`Greek letters`)
      expect(buttons.map((button) => button.getAttribute(`role`))).toEqual(
        Array(3).fill(button_role),
      )
      expect(buttons.map((button) => button.getAttribute(used_attr))).toEqual([
        `false`,
        `true`,
        `false`,
      ])
      // the mode's own attribute only: aria-pressed on a radio would announce twice
      expect(buttons.map((button) => button.getAttribute(unused_attr))).toEqual(
        Array(3).fill(null),
      )
      expect(buttons.every((button) => button.type === `button`)).toBe(true)
    },
  )

  test(`single select replaces the selection and never clears it`, async () => {
    const on_change = vi.fn()
    const buttons = mount_group({ options: letters, value: `alpha`, on_change })

    buttons[2].click()
    await tick()
    expect(on_change.mock.calls).toEqual([[`gamma`]])
    expect(buttons.map(checked_state)).toEqual([`false`, `false`, `true`])

    buttons[2].click() // re-picking the checked radio is a no-op, not a deselect
    await tick()
    expect(on_change).toHaveBeenCalledOnce()
    expect(buttons.map(checked_state)).toEqual([`false`, `false`, `true`])
  })

  test(`multi select toggles each option independently`, async () => {
    const on_change = vi.fn()
    const buttons = mount_group({ options: letters, mode: `multiple`, on_change })
    expect(buttons.map(checked_state)).toEqual([`false`, `false`, `false`])

    buttons[0].click()
    await tick()
    buttons[2].click()
    await tick()
    expect(buttons.map(checked_state)).toEqual([`true`, `false`, `true`])

    buttons[0].click() // second press removes it, leaving the other selection alone
    await tick()
    expect(buttons.map(checked_state)).toEqual([`false`, `false`, `true`])
    expect(on_change.mock.calls).toEqual([[[`alpha`]], [[`alpha`, `gamma`]], [[`gamma`]]])

    // unlike radios, arrow keys move focus without selecting
    buttons[0].focus()
    press(`ArrowRight`)
    await tick()
    expect(document.activeElement).toBe(buttons[1])
    expect(buttons.map(checked_state)).toEqual([`false`, `false`, `true`])
    expect(on_change).toHaveBeenCalledTimes(3)
  })

  test(`arrow keys move focus and the selection with it, wrapping both ends`, async () => {
    const on_change = vi.fn()
    const buttons = mount_group({ options: letters, value: `alpha`, on_change })
    buttons[0].focus()

    const walk: [string, number][] = [
      [`ArrowRight`, 1],
      [`ArrowDown`, 2],
      [`ArrowRight`, 0], // wraps past the end
      [`ArrowLeft`, 2], // and back past the start
      [`ArrowUp`, 1],
      [`Home`, 0],
      [`End`, 2],
    ]
    for (const [key, expected_idx] of walk) {
      press(key)
      await tick()
      expect(document.activeElement, key).toBe(buttons[expected_idx])
      expect(checked_state(buttons[expected_idx]), key).toBe(`true`)
    }
    expect(on_change.mock.calls.flat()).toEqual(walk.map(([, idx]) => letters[idx].value))
  })

  test.each([
    [`ArrowLeft`, 2],
    [`ArrowUp`, 2],
    [`ArrowRight`, 0],
    [`Home`, 0],
    [`End`, 2],
  ] as const)(`%s enters the group at the right end from outside`, async (key, idx) => {
    const buttons = mount_group({ options: letters })
    ;(document.activeElement as HTMLElement | null)?.blur()

    press(key, doc_query(`.options`))
    await tick()
    expect(document.activeElement).toBe(buttons[idx])
  })

  test(`disabled options are skipped by clicks and by arrow keys`, async () => {
    const on_change = vi.fn()
    const options: Option[] = [
      { value: `alpha`, label: `Alpha` },
      { value: `beta`, label: `Beta`, disabled: true },
      { value: `gamma`, label: `Gamma` },
    ]
    const buttons = mount_group({ options, value: `alpha`, on_change })
    expect(buttons.map((button) => button.disabled)).toEqual([false, true, false])
    buttons[1].click()
    await tick()
    expect(on_change).not.toHaveBeenCalled()
    expect(buttons.map(checked_state)).toEqual([`true`, `false`, `false`])

    buttons[0].focus()
    press(`ArrowRight`)
    await tick()
    expect(document.activeElement).toBe(buttons[2]) // beta skipped
    expect(checked_state(buttons[2])).toBe(`true`)

    press(`ArrowRight`)
    await tick()
    expect(document.activeElement).toBe(buttons[0]) // wraps over beta too
    expect(on_change.mock.calls.flat()).toEqual([`gamma`, `alpha`])
  })

  test(`the whole group can be disabled, which also mutes the keyboard`, async () => {
    const on_change = vi.fn()
    const buttons = mount_group({
      options: letters,
      disabled: true,
      sort_order: `asc`,
      on_change,
    })
    expect(buttons.every((button) => button.disabled)).toBe(true)
    expect(doc_query<HTMLButtonElement>(`.sort-order`).disabled).toBe(true)

    press(`ArrowRight`, doc_query(`.options`))
    await tick()
    expect(on_change).not.toHaveBeenCalled()
  })

  // Multi-select keeps native tab stops; an empty field means no tabindex attribute.
  test.each([
    [`the checked option`, { value: `gamma` }, `-1,-1,0`],
    [`the first option when nothing is selected`, {}, `0,-1,-1`],
    [`the first, when the selection matches no option`, { value: `delta` }, `0,-1,-1`],
    [
      `every button, in multi select`,
      { mode: `multiple`, value: [`beta`] as string[] },
      `,,`,
    ],
  ] as const)(`the tab stop sits on %s`, (_desc, mode, expected) => {
    const buttons = mount_group({ options: letters, ...mode })

    expect(buttons.map((btn) => btn.getAttribute(`tabindex`) ?? ``).join(`,`)).toBe(
      expected,
    )
  })

  test(`the sort arrow is opt-in and flips between asc and desc`, async () => {
    mount_group({ options: letters })
    expect(document.querySelector(`.sort-order`)).toBeNull()

    const onclick = vi.fn()
    const sort_button_props = {
      class: `sort-extra`,
      style: `font-size: 1.2em`,
      type: `submit` as const,
      onclick,
    }
    // labels merge key by key: only the descending wording is overridden
    mount_group({
      options: letters,
      sort_order: `asc`,
      sort_button_props,
      labels: { sort_descending: `Absteigend sortiert` },
    })

    const arrow = doc_query<HTMLButtonElement>(`.sort-order`)
    // A changing sort label must not also announce aria-pressed.
    const arrow_state = () => [
      arrow.textContent?.trim(),
      arrow.getAttribute(`aria-label`),
    ]
    const ascending = `Sorted ascending, activate to sort descending`
    const descending = `Absteigend sortiert`
    expect(arrow_state()).toEqual([`↑`, ascending])
    expect(arrow.hasAttribute(`aria-pressed`)).toBe(false)
    // it sits outside the radiogroup, which may only own radios
    expect(arrow.closest(`.options`)).toBeNull()
    expect(arrow.classList.contains(`sort-extra`)).toBe(true)
    expect(arrow.getAttribute(`style`)).toBe(`font-size: 1.2em;`)
    expect(arrow.type).toBe(`button`)

    arrow.click()
    await tick()
    expect(arrow_state()).toEqual([`↓`, descending])
    expect(onclick).toHaveBeenCalledOnce()

    arrow.click()
    await tick()
    expect(arrow_state()).toEqual([`↑`, ascending])
    expect(onclick).toHaveBeenCalledTimes(2)
  })

  test(`renders per-option icon and spinner, and forwards class and rest props`, () => {
    const options: Option[] = [
      { value: `alpha`, label: `Alpha`, icon: Check },
      { value: `beta`, label: `Beta`, loading: true },
      { value: `gamma`, label: `Gamma`, loading: false },
    ]
    const buttons = mount_group({ options, class: `consumer-class`, id: `letters` })

    expect(buttons[0].querySelector(`svg`)).not.toBeNull()
    expect(buttons[1].querySelector(`svg`)).toBeNull()
    // Hidden spinners reserve width; aria-busy carries their state.
    expect(buttons[1].querySelector(`div`)?.style.width).toBe(`0.8em`)
    expect(buttons[1].querySelector(`div`)?.style.visibility).toBe(`visible`)
    expect(buttons[2].querySelector(`div`)?.style.visibility).toBe(`hidden`)
    expect(
      buttons.map((button) => [
        button.getAttribute(`aria-busy`),
        button.querySelector(`div`)?.getAttribute(`aria-hidden`),
      ]),
    ).toEqual([
      [null, undefined],
      [`true`, `true`],
      [null, `true`],
    ])

    const wrapper = doc_query(`#letters`)
    expect(wrapper.classList.contains(`button-group`)).toBe(true)
    expect(wrapper.classList.contains(`consumer-class`)).toBe(true)
  })

  test(`an option snippet replaces the default button content`, () => {
    const option = createRawSnippet<[{ option: { label?: string }; selected: boolean }]>(
      (get_params) => ({
        render: () => {
          const { option: opt, selected } = get_params()
          return `<span data-testid="custom">${opt.label}:${selected}</span>`
        },
      }),
    )
    const buttons = mount_group({ options: letters, value: `beta`, option })

    expect(buttons.map((button) => button.textContent?.trim())).toEqual([
      `Alpha:false`,
      `Beta:true`,
      `Gamma:false`,
    ])
  })

  test(`per-option tooltips always render plain text`, async () => {
    vi.useFakeTimers()
    const options: Option[] = [{ value: `a`, tooltip: `<b>bold</b>` }, { value: `b` }]
    const buttons = mount_group({ options })
    await tick()

    dispatch_hover(buttons[1])
    vi.runAllTimers()
    expect(document.querySelector(`.tooltip-content`)).toBeNull()

    dispatch_hover(buttons[0])
    vi.runAllTimers()
    expect(doc_query(`.tooltip-content`).innerHTML).toBe(`&lt;b&gt;bold&lt;/b&gt;`)
  })

  // Phrasing content requires both wrappers to avoid block elements.
  test.each([
    [`div`, undefined],
    [`span`, `span` as const],
  ])(`renders a %s root with a phrasing-safe options wrapper`, (expected_tag, as) => {
    mount_group({ options: [`alpha`], ...(as ? { as } : {}) })

    expect(doc_query(`.button-group`).tagName.toLowerCase()).toBe(expected_tag)
    expect(doc_query(`.options`).tagName.toLowerCase()).toBe(`span`)
  })

  // Suffix wrappers are opt-in to preserve consumers' direct-child selectors.
  // the suffix is a sibling of the button and gets the same params as option
  test.each([
    [`options`, `nothing is slotted`, undefined, []],
    [
      `option`,
      `a suffix is slotted`,
      info_link,
      [`/docs/alpha:false`, `/docs/beta:true`, `/docs/gamma:false`],
    ],
  ] as const)(
    `the button's parent is .%s when %s`,
    (parent, _desc, option_suffix, links) => {
      const buttons = mount_group({ options: letters, value: `beta`, option_suffix })

      expect(document.querySelectorAll(`.options > .option`)).toHaveLength(links.length)
      expect(buttons.map((btn) => btn.parentElement?.classList.contains(parent))).toEqual(
        Array(3).fill(true),
      )
      expect(buttons.map((btn) => btn.querySelector(`a`))).toEqual(Array(3).fill(null))
      const suffix_links = [
        ...document.querySelectorAll<HTMLAnchorElement>(`.option > a`),
      ]
      expect(
        suffix_links.map((link) => `${link.getAttribute(`href`)}:${link.dataset.sel}`),
      ).toEqual(links)
    },
  )

  // A broad button selector would incorrectly include suffix buttons in navigation.
  test(`suffix buttons stay out of arrow key navigation`, async () => {
    const on_change = vi.fn()
    const option_suffix = createRawSnippet<[{ option: { value: string } }]>(
      (get_params) => ({
        render: () =>
          `<button type="button" data-remove="${get_params().option.value}">x</button>`,
      }),
    )
    const buttons = mount_group({
      options: letters,
      value: `alpha`,
      on_change,
      option_suffix,
    })
    buttons[0].focus()

    press(`ArrowRight`)
    await tick()
    expect(document.activeElement).toBe(buttons[1])
    expect(buttons.map(checked_state)).toEqual([`false`, `true`, `false`])

    press(`End`)
    await tick()
    expect(document.activeElement).toBe(buttons[2])
    expect(on_change.mock.calls.flat()).toEqual([`beta`, `gamma`])
  })

  // Pin the public CSS hooks to catch accidental removals or undocumented additions.
  test(`exposes exactly the documented custom properties`, () => {
    // font shorthand would override consumer weight/style through higher specificity
    expect(styles).toMatch(/font-family:\s*var\(--btn-group-btn-font-family/u)
    expect(styles).not.toMatch(/[^-]font:/u)
    expect(styles).not.toMatch(/font-(?:weight|style):/u)
    const matches = styles.matchAll(/var\(\s*--btn-group-(?<name>[\w-]+)/gu)
    const used = [...matches].map((match) => match.groups?.name ?? ``)
    expect([...new Set(used)].toSorted().join(` `)).toBe(
      `bg border btn-active-bg btn-active-border-color btn-active-color btn-bg ` +
        `btn-border btn-color btn-cursor btn-disabled-opacity btn-font-family ` +
        `btn-font-size btn-gap btn-hover-bg btn-hover-color btn-hover-transform ` +
        `btn-padding btn-radius btn-transition display gap justify-content ` +
        `option-btn-padding-right padding radius`,
    )
    // hover color chains to the resting one, so setting only that survives hover
    expect(styles).toMatch(
      /--btn-group-btn-hover-color,\s*var\(\s*--btn-group-btn-color/u,
    )
    expect(styles).toContain(
      `padding-right: var(--btn-group-option-btn-padding-right, 0.5ex)`,
    )
  })
})
