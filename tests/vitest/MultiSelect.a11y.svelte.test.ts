// deno-lint-ignore-file no-await-in-loop
import { tick } from 'svelte'
import { describe, expect, test } from 'vite-plus/test'
import type { MultiSelectProps } from '$lib/types'
import { doc_query } from './index'
import {
  focus_input,
  fresh_key,
  get_input,
  mount_multiselect,
  type_search_text,
  unmount_component,
} from './MultiSelect.test-utils'

describe(`VoiceOver/screen reader accessibility (issue #118)`, () => {
  const mount_a11y = (props: Partial<MultiSelectProps> = {}) =>
    mount_multiselect({ options: [`foo`, `bar`, `baz`], ...props })

  test(`implements ARIA combobox pattern with proper attributes and listbox association`, async () => {
    mount_a11y()

    const input = get_input()
    expect(input.getAttribute(`role`)).toBe(`combobox`)
    expect(input.getAttribute(`aria-haspopup`)).toBe(`listbox`)
    expect(input.getAttribute(`aria-expanded`)).toBe(`false`)

    await focus_input()
    expect(input.getAttribute(`aria-expanded`)).toBe(`true`)

    const listbox_id = input.getAttribute(`aria-controls`)
    expect(listbox_id).toBeTypeOf(`string`)
    const listbox = doc_query(`ul.options`)
    expect(listbox.id).toBe(listbox_id)
    expect(listbox.getAttribute(`role`)).toBe(`listbox`)

    input.dispatchEvent(fresh_key(`Escape`))
    await tick()
    expect(input.getAttribute(`aria-expanded`)).toBe(`false`)
  })

  test(`aria-activedescendant tracks keyboard navigation with unique option IDs`, async () => {
    mount_a11y()

    const input = await focus_input()

    const options = document.querySelectorAll<HTMLLIElement>(
      `ul.options > li[role="option"]`,
    )
    const ids = [...options].map((opt) => opt.id)
    expect(ids.every(Boolean)).toBe(true)
    expect(new Set(ids).size).toBe(3) // one id per option, none shared

    expect(input.getAttribute(`aria-activedescendant`)).toBeNull() // nothing active yet

    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()

    const active_id = input.getAttribute(`aria-activedescendant`)
    expect(active_id).toBeTypeOf(`string`)
    const active_option = document.querySelector(`#${active_id}`)
    expect(active_option?.getAttribute(`role`)).toBe(`option`)
    expect(active_option?.classList.contains(`active`)).toBe(true)
  })

  test.each([
    [``, `3 options available`],
    [`ba`, `2 options available`],
    [`foo`, `1 option available`],
    [`xyz`, `0 options available`],
  ])(`aria-live region announces "%s" filter as "%s"`, async (filter, expected) => {
    mount_a11y()

    const input = await focus_input()

    if (filter) {
      await type_search_text(filter, input)
    }

    const live_region = doc_query(`.sr-only[aria-live="polite"]`)
    expect(live_region.getAttribute(`aria-atomic`)).toBe(`true`)
    expect(live_region.textContent).toContain(expected)
  })

  test(`custom id prop is used for ARIA associations`, async () => {
    mount_multiselect({ options: [`foo`, `bar`], id: `my-select` })

    const input = await focus_input()

    expect(input.getAttribute(`aria-controls`)).toBe(`my-select-listbox`)
    expect(doc_query(`ul.options`).id).toBe(`my-select-listbox`)

    input.dispatchEvent(fresh_key(`ArrowDown`))
    await tick()
    expect(input.getAttribute(`aria-activedescendant`)).toMatch(/^my-select-opt-/u)
  })

  test(`unique id stays stable across ticks when id prop is omitted`, async () => {
    mount_multiselect({ options: [`foo`, `bar`], open: true })
    const listbox_id = doc_query(`ul.options`).id
    expect(listbox_id).toMatch(/^sms-.+-listbox$/u)
    await tick()
    expect(doc_query(`ul.options`).id).toBe(listbox_id)
    expect(get_input().getAttribute(`aria-controls`)).toBe(listbox_id)
  })

  test(`aria-label can be passed via rest props for accessible name`, () => {
    mount_multiselect({ options: [`foo`, `bar`], [`aria-label`]: `Select your favorite` })

    const input = get_input()
    expect(input.getAttribute(`aria-label`)).toBe(`Select your favorite`)
  })

  test(`aria-busy reflects loading state`, async () => {
    const props = $state({ options: [`foo`, `bar`], loading: false })
    mount_multiselect(props)

    const input = get_input()
    expect(input.getAttribute(`aria-busy`)).toBeNull()

    props.loading = true
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBe(`true`)

    props.loading = false
    await tick()
    expect(input.getAttribute(`aria-busy`)).toBeNull()
  })

  test(`options have aria-posinset and aria-setsize for position announcements`, async () => {
    mount_a11y()

    await focus_input()

    const options = document.querySelectorAll<HTMLLIElement>(
      `ul.options > li[role="option"]`,
    )
    expect(options).toHaveLength(3)

    options.forEach((option, idx) => {
      expect(option.getAttribute(`aria-posinset`)).toBe(`${idx + 1}`)
      expect(option.getAttribute(`aria-setsize`)).toBe(`3`)
    })
  })

  test(`aria-live announces selection changes`, async () => {
    mount_a11y()

    await focus_input()

    const option = doc_query<HTMLLIElement>(`ul.options > li[role="option"]`)
    option.click()
    await tick()

    const live_region = doc_query(`.sr-only[aria-live="polite"]`)
    expect(live_region.textContent).toContain(`selected`)

    const selected_chip = doc_query(`ul.selected > li`)
    expect(selected_chip.getAttribute(`role`)).toBeNull()
    expect(selected_chip.getAttribute(`aria-selected`)).toBeNull()

    doc_query<HTMLButtonElement>(`ul.selected button.remove`).click()
    await tick()
    expect(live_region.textContent).toContain(`removed`)
  })
})

async function setup_user_message(search_text = `Purple`) {
  const props = $state({
    options: [`Red`],
    activeIndex: null as number | null,
    allowUserOptions: true,
    autoActiveFirstOption: true,
    open: true,
  })
  mount_multiselect(props)
  const input = get_input()
  await type_search_text(search_text, input)

  return { input, props, user_msg: doc_query(`ul.options li.user-msg`) }
}

test(`user message exposes active descendant and toggles active class`, async () => {
  const { input, props, user_msg } = await setup_user_message()

  for (const [event_name, expected_active] of [
    [`mouseover`, true],
    [`mouseout`, false],
    [`focus`, true],
    [`blur`, false],
  ] as const) {
    user_msg.dispatchEvent(new Event(event_name, { bubbles: true }))
    await tick()
    expect(user_msg.classList.contains(`active`)).toBe(expected_active)
  }

  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()

  expect(input.getAttribute(`aria-activedescendant`)).toBe(user_msg.id)
  expect(user_msg.classList.contains(`active`)).toBe(true)

  props.options = [`Purple Rain`, `Purple Haze`, `Red`]
  await tick()
  expect(props.activeIndex).toBe(2)
  expect(user_msg.classList.contains(`active`)).toBe(true)

  await type_search_text(`red`, input)
  expect(doc_query(`li[role=option].active`).textContent).toContain(`Red`)
  expect(doc_query(`li.user-msg`).classList.contains(`active`)).toBe(false)
})

test(`clearing searchText while create-option message is active drops aria-activedescendant`, async () => {
  mount_multiselect({ options: [`foo`], allowUserOptions: true })
  const input = get_input()
  await type_search_text(`xyz`, input)

  // no options match 'xyz' -> ArrowDown activates the create-option message
  input.dispatchEvent(fresh_key(`ArrowDown`))
  await tick()
  expect(doc_query(`ul.options > li.user-msg`).classList.contains(`active`)).toBe(true)
  expect(input.getAttribute(`aria-activedescendant`)).toContain(`user-msg`)

  // clearing the search removes the message li — active state must not go stale
  await type_search_text(``, input)
  expect(document.querySelector(`ul.options > li.user-msg`)).toBeNull()
  // previously kept pointing at the removed user-msg li (dangling ARIA reference)
  expect(input.getAttribute(`aria-activedescendant`)).toBeNull()
})

describe(`ARIA correctness`, () => {
  test(`select-all aria-selected tracks all-selectable-selected, not max capacity`, async () => {
    const first = mount_multiselect({
      options: [1, 2],
      selectAllOption: true,
      open: true,
    })

    const select_all = doc_query(`ul.options li.select-all`)
    expect(select_all.getAttribute(`aria-selected`)).toBe(`false`)

    select_all.dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
    await tick()
    expect(doc_query(`ul.options li.select-all`).getAttribute(`aria-selected`)).toBe(
      `true`,
    )

    // at max capacity the row is disabled but must NOT be announced as selected:
    // aria-selected tracks only whether all selectable options are selected
    // (option 3 is not) — not the maxSelect capacity limit
    await unmount_component(first)
    mount_multiselect({
      options: [1, 2, 3],
      selected: [1, 2],
      maxSelect: 2,
      selectAllOption: true,
      open: true,
      keepSelectedInDropdown: `plain`,
    })

    const capped_select_all = doc_query(`ul.options li.select-all`)
    expect(capped_select_all.classList.contains(`disabled`)).toBe(true)
    expect(capped_select_all.getAttribute(`aria-selected`)).toBe(`false`)
  })

  test(`aria-controls is absent while the listbox is not rendered`, async () => {
    // no options + allowEmpty → the options <ul> is not in the DOM
    const props = $state<MultiSelectProps>({ options: [], allowEmpty: true })
    mount_multiselect(props)

    const input = get_input()
    expect(document.querySelector(`ul.options`)).toBeNull()
    expect(input.getAttribute(`aria-controls`)).toBeNull()

    // once options exist, aria-controls references the actual listbox id
    props.options = [1, 2]
    await tick()
    const listbox = doc_query(`ul.options`)
    expect(input.getAttribute(`aria-controls`)).toBe(listbox.id)
  })
})
