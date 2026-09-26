import { Toggle } from '$lib'
import type { ComponentProps } from 'svelte'
import { tick } from 'svelte'
import { describe, expect, test, vi } from 'vitest'
import { doc_query, press_key, render } from './index'
import TestSnippetHarness from './TestSnippetHarness.svelte'

describe(`Toggle`, () => {
  const get_input = () => doc_query<HTMLInputElement>(`input[type="checkbox"]`)
  const keydown = (key: string, init: KeyboardEventInit = {}) =>
    press_key(get_input(), key, init)

  // a checkbox flips its own DOM state on click, so input.checked passes even with
  // bind:checked gone - only the written-back value proves the binding works
  const mount_bindable_toggle = (
    checked: boolean,
    extra_props: Partial<ComponentProps<typeof Toggle>> = {},
  ) => {
    const props = $state({ checked, ...extra_props })
    render(Toggle, props)
    return () => [get_input().checked, props.checked]
  }

  test(`toggles on click`, () => {
    const state = mount_bindable_toggle(true)
    expect(state()).toEqual([true, true])

    get_input().click()
    expect(state()).toEqual([false, false])

    get_input().click()
    expect(state()).toEqual([true, true])
  })

  test(`Enter toggles, fires change, prevents default and runs onkeydown first`, () => {
    const call_order: string[] = []
    const onchange = vi.fn()
    const onkeydown = vi.fn(() => call_order.push(`onkeydown`))
    const state = mount_bindable_toggle(false, {
      onkeydown,
      input_props: { onchange, onclick: () => call_order.push(`click`) },
    })

    const event = keydown(`Enter`)

    expect(state()).toEqual([true, true])
    expect(onchange).toHaveBeenCalledWith(expect.any(Event))
    expect(event.defaultPrevented).toBe(true)
    expect(onkeydown).toHaveBeenCalledWith(expect.any(KeyboardEvent))
    // full order, not just call_order[0]: also pins that Enter synthesizes the click
    expect(call_order).toEqual([`onkeydown`, `click`])

    keydown(`Enter`)
    expect(state()).toEqual([false, false])
    expect(onchange).toHaveBeenCalledTimes(2)
  })

  test.each([`A`, `Escape`, `Tab`, `Space`])(`doesn't toggle on %s key`, (key) => {
    render(Toggle, {})
    keydown(key)
    expect(get_input().checked).toBe(false)
  })

  test.each([`prevented`, `composing`])(`doesn't toggle on %s Enter`, (mode) => {
    const onkeydown = vi.fn((event: KeyboardEvent) => {
      if (mode === `prevented`) event.preventDefault()
    })
    const state = mount_bindable_toggle(false, { onkeydown })
    keydown(`Enter`, { isComposing: mode === `composing` })
    expect(onkeydown).toHaveBeenCalledOnce()
    expect(state()).toEqual([false, false])
  })

  test(`applies custom class and styles, keeps input_props off owned attrs`, () => {
    const input_props = { style: `width: 20px;` }
    // `type` and `checked` are Omit'd from the prop type; a JS consumer bypassing that
    // must still not swap the element out or detach bind:checked
    Reflect.set(input_props, `type`, `radio`)
    Reflect.set(input_props, `checked`, true)
    render(Toggle, { class: `custom-class`, style: `margin: 10px;`, input_props })
    expect(doc_query(`label`).classList.contains(`custom-class`)).toBe(true)
    expect(doc_query(`label`).getAttribute(`style`)).toBe(`margin: 10px;`)
    expect(doc_query(`input`).getAttribute(`style`)).toBe(`width: 20px;`)
    expect(get_input().type).toBe(`checkbox`)
    expect(get_input().checked).toBe(false)
  })

  // onchange/onclick forwarding is pinned by the Enter test
  test(`forwards other input_props handlers like onblur`, () => {
    const onblur = vi.fn()
    render(Toggle, { input_props: { onblur } })
    get_input().dispatchEvent(new FocusEvent(`blur`))
    expect(onblur).toHaveBeenCalledOnce()
  })

  test(`children snippet receives checked state and updates on toggle`, async () => {
    render(TestSnippetHarness, { component: `toggle`, checked: false })

    const snippet = doc_query(`[data-testid="toggle-snippet"]`)
    expect(snippet.dataset.checked).toBe(`false`)

    get_input().click()
    await tick()
    expect(snippet.dataset.checked).toBe(`true`)
  })
})
