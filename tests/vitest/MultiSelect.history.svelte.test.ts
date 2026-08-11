// deno-lint-ignore-file no-await-in-loop
import { tick } from 'svelte'
import { describe, expect, test, vi } from 'vite-plus/test'
import type { MultiSelectProps } from '$lib/types'
import { doc_query } from './index'
import { focus_input, mount_multiselect } from './MultiSelect.test-utils'

describe(`history / undo-redo`, () => {
  async function mount_history(extra: Partial<MultiSelectProps> = {}) {
    const props = $state<MultiSelectProps>({
      options: [1, 2, 3],
      history: true,
      selected: [],
      undo: undefined,
      redo: undefined,
      canUndo: false,
      canRedo: false,
      ...extra,
    })
    mount_multiselect(props)
    await tick()
    return props
  }

  test(`undo/redo bound by default, canUndo/canRedo initially false`, async () => {
    // keys must exist on the $state props for the bindables to write back;
    // canUndo/canRedo start true to verify the component resets them to false
    const props = await mount_history({
      history: undefined,
      canUndo: true,
      canRedo: true,
    })

    expect(props.undo).toBeInstanceOf(Function)
    expect(props.redo).toBeInstanceOf(Function)
    expect(props.canUndo).toBe(false)
    expect(props.canRedo).toBe(false)
    expect(props.undo?.()).toBe(false) // nothing to undo
    expect(props.redo?.()).toBe(false) // nothing to redo
  })

  // an empty stack already returns false, so these build real history first - otherwise
  // move_history bails on next_index < 0 and never reaches the guard under test
  test.each([`undo`, `redo`] as const)(`%s is a no-op while disabled`, async (method) => {
    const props = await mount_history()
    props.selected = [1]
    await tick()
    if (method === `redo`) {
      props.undo?.() // leaves an undone state that redo could restore
      await tick()
    }
    const selected_before = [...(props.selected ?? [])]

    props.disabled = true
    await tick()

    expect(props[method]?.()).toBe(false)
    expect(props.selected).toEqual(selected_before)
    expect(props.canUndo).toBe(false)
    expect(props.canRedo).toBe(false)
  })

  // false and 0 hit different branches of the max_history derivation; enabled values
  // (true, positive integers) are covered by the undo/redo behavior tests below
  test.each([false, 0] as const)(
    `history=%s records nothing, leaving undo bound but inert`,
    async (history_val) => {
      const props = await mount_history({ history: history_val })
      props.selected = [1]
      await tick()

      expect(props.canUndo).toBe(false)
      expect(props.undo).toBeInstanceOf(Function)
      expect(props.undo?.()).toBe(false)
      expect(props.selected).toEqual([1]) // undo did not roll the change back
    },
  )

  test.each([
    [`default shortcuts undo`, {}, `z`, { ctrlKey: true }, true],
    [
      `custom shortcuts undo`,
      { shortcuts: { undo: `alt+u` } },
      `u`,
      { altKey: true },
      true,
    ],
    [
      `disabled shortcuts ignore keypress`,
      { shortcuts: { undo: null } },
      `z`,
      {
        ctrlKey: true,
      },
      false,
    ],
  ])(`%s`, async (_desc, extra, key, modifiers, should_undo) => {
    const props = await mount_history(extra)
    document.querySelector<HTMLElement>(`ul.options > li`)?.click()
    await tick()
    expect(props.selected).toHaveLength(1)

    const input = await focus_input()
    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key, bubbles: true, ...modifiers }),
    )
    await tick()

    expect(props.selected).toHaveLength(should_undo ? 0 : 1)
  })

  test.each([
    [
      `object options`,
      [
        { label: `A`, value: 1 },
        { label: `B`, value: 2 },
      ],
      {},
    ],
    [`maxSelect=1`, [1, 2, 3], { maxSelect: 1 }],
    [`sortSelected`, [3, 1, 2], { sortSelected: true }],
    [`duplicates`, [1, 2, 3], { duplicates: true }],
    [`allowUserOptions`, [1, 2, 3], { allowUserOptions: true }],
    [`minSelect`, [1, 2, 3], { minSelect: 1 }],
    [
      `grouped`,
      [
        { label: `A`, group: `G1` },
        { label: `B`, group: `G2` },
      ],
      {},
    ],
  ])(`compatible with %s`, async (_desc, options, extra) => {
    const props = await mount_history({ options, ...extra })

    // Select first selectable option (skip group headers)
    // A missing row is a failure, not a reason to silently skip a compatibility case.
    doc_query(`ul.options > li:not(.group-header)`).click()
    await tick()
    expect(props.selected?.length).toBeGreaterThan(0)

    const input = await focus_input()
    input.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `z`, ctrlKey: true, bubbles: true }),
    )
    await tick()
    expect(props.selected).toEqual([])
  })

  test(`history isolated per component instance`, async () => {
    const [div1, div2] = [document.createElement(`div`), document.createElement(`div`)]
    document.body.append(div1, div2)

    const props_1 = $state<MultiSelectProps>({
      options: [1, 2],
      selected: [],
      history: true,
      undo: undefined,
    })
    const props_2 = $state<MultiSelectProps>({
      options: [`a`, `b`],
      selected: [],
      history: true,
      undo: undefined,
      canUndo: false,
    })
    mount_multiselect(props_1, div1)
    mount_multiselect(props_2, div2)
    await tick()
    props_1.selected = [1]
    props_2.selected = [`a`]
    await tick()

    props_1.undo?.()
    await tick()

    expect(props_1.selected).toEqual([])
    // the other instance keeps both its selection and its own undoable step
    expect(props_2.selected).toEqual([`a`])
    expect(props_2.canUndo).toBe(true)
  })

  test(`undo restores previous selection state, redo restores undone state`, async () => {
    const props = await mount_history()

    expect(props.selected).toEqual([])
    expect(props.canUndo).toBe(false)
    expect(props.canRedo).toBe(false)

    await focus_input()
    const first_option = doc_query(`ul.options li`)
    first_option.click()
    await tick()

    expect(props.selected).toEqual([1])
    expect(props.canUndo).toBe(true)
    expect(props.canRedo).toBe(false)

    expect(props.undo?.()).toBe(true)
    await tick()
    expect(props.selected).toEqual([])
    expect(props.canUndo).toBe(false)
    expect(props.canRedo).toBe(true)

    // Calling undo again when nothing to undo should return false and not change state
    expect(props.undo?.()).toBe(false)
    await tick()
    expect(props.selected).toEqual([]) // state unchanged

    expect(props.redo?.()).toBe(true)
    await tick()
    expect(props.selected).toEqual([1])
    expect(props.canUndo).toBe(true)
    expect(props.canRedo).toBe(false)
  })

  test(`undo and redo callbacks receive changes and new actions clear redo`, async () => {
    const onundo = vi.fn()
    const onredo = vi.fn()
    const props = await mount_history({ onundo, onredo })

    const click_option = async (label: string) => {
      const option_to_click = [
        ...document.querySelectorAll<HTMLLIElement>(`ul.options > li`),
      ].find((option) => option.textContent?.trim() === label)
      if (!option_to_click) throw new Error(`option ${label} not found`)
      option_to_click.click()
      await tick()
    }

    await click_option(`1`)
    await click_option(`2`)
    expect(props.selected).toEqual([1, 2])

    expect(props.undo?.()).toBe(true)
    await tick()
    expect(props.selected).toEqual([1])
    expect(props.canRedo).toBe(true)
    expect(onundo).toHaveBeenCalledWith({ previous: [1, 2], current: [1] })

    expect(props.redo?.()).toBe(true)
    await tick()
    expect(props.selected).toEqual([1, 2])
    expect(onredo).toHaveBeenCalledWith({ previous: [1], current: [1, 2] })

    expect(props.undo?.()).toBe(true)
    await tick()
    await click_option(`3`)
    expect(props.selected).toEqual([1, 3])
    expect(props.canRedo).toBe(false)
    expect(props.redo?.()).toBe(false)
  })

  test(`preselected values are correctly tracked as initial state`, async () => {
    // Regression: prev_selected must sync to initial selected on mount,
    // otherwise undo after deselect restores [] instead of preselected state
    const props = await mount_history({ selected: [1, 2] })

    // Remove one item, then undo - should restore [1, 2], not []
    doc_query(`ul.selected li button.remove`).click()
    await tick()
    expect(props.selected).toEqual([2])

    props.undo?.()
    await tick()
    expect(props.selected).toEqual([1, 2])
  })

  test(`history=N caps the undo stack at N states`, async () => {
    const props = await mount_history({ options: [1, 2, 3, 4], history: 2 })

    // three selection changes with history=2: only the last two states survive
    for (const selection of [[1], [1, 2], [1, 2, 3]]) {
      props.selected = selection
      await tick()
    }

    expect(props.canUndo).toBe(true)
    expect(props.undo?.()).toBe(true)
    await tick()
    expect(props.selected).toEqual([1, 2])
    // the [1] and [] states were trimmed away — no second undo
    expect(props.canUndo).toBe(false)
    expect(props.undo?.()).toBe(false)
  })
})
