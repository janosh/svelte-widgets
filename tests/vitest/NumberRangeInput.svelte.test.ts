import { NumberRangeInput } from '$lib'
import {
  createRawSnippet,
  flushSync,
  mount,
  tick,
  unmount,
  type ComponentProps,
} from 'svelte'
import { describe, expect, test, vi } from 'vitest'
import { doc_query, hover, press_key } from './index'

const label_snippet = createRawSnippet(() => ({
  render: () => `<span>Atom radius</span>`,
}))
const named_props = { min: 0, max: 1, step: 0.1, value: 0, title: `Atom radius` }

const mount_range = (props: ComponentProps<typeof NumberRangeInput>) => {
  const target = document.createElement(`div`)
  mount(NumberRangeInput, { target, props })
  const inputs = [...target.querySelectorAll<HTMLInputElement>(`input`)]
  const [number, range] = inputs
  if (!number || !range) throw new Error(`NumberRangeInput did not render both inputs`)
  return { target, inputs, number, range }
}

describe(`NumberRangeInput`, () => {
  test(`shows the description only while hovering the label text`, async () => {
    vi.useFakeTimers()
    const component = mount(NumberRangeInput, {
      target: document.body,
      props: { ...named_props, children: label_snippet },
    })
    await tick()
    try {
      for (const input of document.querySelectorAll(`input`)) {
        hover(input)
        await vi.advanceTimersByTimeAsync(150)
        expect(document.querySelector(`.custom-tooltip`)).toBeNull()
      }
      hover(doc_query(`label > span`))
      await vi.advanceTimersByTimeAsync(150)
      expect(document.querySelector(`.custom-tooltip`)?.textContent).toBe(`Atom radius`)
    } finally {
      await unmount(component)
      vi.useRealTimers()
    }
  })

  test(`renders number before range and two-way binds both to one value`, async () => {
    const props = $state({ min: 0, max: 1, step: 0.1, title: `vol`, value: 0.5 })
    const { number, range } = mount_range(props)

    expect(
      number.compareDocumentPosition(range) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeGreaterThan(0)
    expect(range.getAttribute(`aria-label`)).toBe(`vol`)
    expect(number.valueAsNumber).toBe(0.5)
    expect(range.valueAsNumber).toBe(0.5)

    number.value = `0.8`
    number.dispatchEvent(new Event(`input`, { bubbles: true }))
    await tick()
    expect(props.value).toBe(0.8)
    expect(range.valueAsNumber).toBe(0.8)

    range.value = `0.3`
    range.dispatchEvent(new Event(`input`, { bubbles: true }))
    await tick()
    expect(props.value).toBe(0.3)
    expect(number.valueAsNumber).toBe(0.3)
  })

  // a wrapping <label> names only its first control, so the range needs an explicit name;
  // without children the label is empty and the number input goes unnamed too
  test.each([
    [`children name the number input`, { children: label_snippet }, null, `Atom radius`],
    [`a bare title names both inputs`, {}, `Atom radius`, `Atom radius`],
    [`neither falls back to a generic name`, { title: undefined }, `Value`, `Value`],
    [
      `labels reword that generic fallback`,
      { title: undefined, labels: { value: `Wert` } },
      `Wert`,
      `Wert`,
    ],
  ])(`%s`, (_name, overrides, ...expected) => {
    const { inputs } = mount_range({ ...named_props, ...overrides })
    expect(inputs.map((input) => input.getAttribute(`aria-label`))).toEqual(expected)
  })

  test.each([0.25, `any`])(
    `forwards explicit bounds and setting metadata with step=%s`,
    (step_size) => {
      const { target, inputs, range } = mount_range({
        value: 0.5,
        min: 0.25,
        max: 1.25,
        step: step_size,
        setting: `radius`,
      })
      expect(target.querySelector(`label`)?.dataset.key).toBe(`radius`)
      expect(inputs.map(({ min, max, step }) => ({ min, max, step }))).toEqual([
        { min: `0.25`, max: `1.25`, step: String(step_size) },
        { min: `0.25`, max: `1.25`, step: String(step_size) },
      ])
      expect(range.getAttribute(`aria-label`)).toBe(`radius`)
    },
  )

  test.each([
    ...[`min`, `max`, `step`].flatMap((prop) =>
      [undefined, ``, `NaN`, Infinity, `100garbage`, `0x10`, ` 1 `, `+1`, `1.`].map(
        (value) => [prop, value],
      ),
    ),
    [`min`, 2],
    [`max`, -1],
    [`step`, 0],
    [`step`, -0.1],
  ])(`rejects invalid %s=%s`, (prop, value) => {
    const props = { ...named_props, [String(prop)]: value }
    expect(() => {
      mount_range(props)
      flushSync()
    }).toThrow(`NumberRangeInput needs finite min <= max and positive step or "any"`)
  })
})

describe(`logarithmic NumberRangeInput`, () => {
  const log_props = { min: 0.001, max: 1000, step: 1, scale: `log`, value: 1 } as const

  test.each([`input`, `change`] as const)(
    `keeps bindings, typed drafts and announcements in real units with commit=%s`,
    async (commit) => {
      const on_commit = vi.fn()
      const props = $state({ ...log_props, value: 1, commit, on_commit })
      const { number, range } = mount_range(props)
      expect([number.min, number.max, number.step]).toEqual([`0.001`, `1000`, `any`])
      expect([range.min, range.max, range.step, range.value]).toEqual([
        `-3`,
        `3`,
        `any`,
        `0`,
      ])
      expect(
        [`aria-valuemin`, `aria-valuemax`, `aria-valuenow`].map((attr) =>
          range.getAttribute(attr),
        ),
      ).toEqual([`0.001`, `1000`, `1`])
      range.value = `2`
      range.dispatchEvent(new Event(`input`, { bubbles: true }))
      await tick()
      expect(props.value).toBe(commit === `input` ? 100 : 1)
      expect(range.getAttribute(`aria-valuenow`)).toBe(`100`)
      range.dispatchEvent(new Event(`change`, { bubbles: true }))
      await tick()
      expect(number.valueAsNumber).toBe(100)
      expect(on_commit).toHaveBeenCalledExactlyOnceWith(100)

      number.value = `2.5`
      number.dispatchEvent(new Event(`input`, { bubbles: true }))
      await tick()
      expect(props.value).toBe(commit === `input` ? 2.5 : 100)
      number.dispatchEvent(new Event(`change`, { bubbles: true }))
      await tick()
      expect(props.value).toBe(2.5)
      expect(range.valueAsNumber).toBe(Math.log10(2.5))
      expect(number.checkValidity()).toBe(true)
      props.value = 0.001
      await tick()
      expect([number.valueAsNumber, range.valueAsNumber]).toEqual([0.001, -3])
      expect(on_commit.mock.calls).toEqual([[100], [2.5]])
    },
  )

  test.each([
    [`input`, 0.3, 0.3],
    [`change`, 0.3, 0.3],
    [`input`, `any`, 0.43],
    [`change`, `any`, 0.43],
  ] as const)(
    `log range edits respect commit=%s and step=%s`,
    async (commit, step, coordinate) => {
      const on_commit = vi.fn()
      const props = $state({
        min: 1,
        max: 10,
        step,
        scale: `log` as const,
        value: 10,
        commit,
        on_commit,
      })
      const { number, range } = mount_range(props)
      expect(range.step).toBe(`any`)
      press_key(range, `End`)
      await tick()
      expect([range.valueAsNumber, props.value]).toEqual([1, 10])
      expect(on_commit).not.toHaveBeenCalled()
      props.value = 2.5
      await tick()
      expect(range.valueAsNumber).toBe(Math.log10(2.5))
      range.value = `0.43`
      range.dispatchEvent(new Event(`input`, { bubbles: true }))
      await tick()
      expect(range.valueAsNumber).toBe(Math.log10(10 ** coordinate))
      expect(props.value).toBe(commit === `input` ? 10 ** coordinate : 2.5)
      range.dispatchEvent(new Event(`change`, { bubbles: true }))
      await tick()
      expect([number.valueAsNumber, props.value]).toEqual([
        10 ** coordinate,
        10 ** coordinate,
      ])
      expect(on_commit).toHaveBeenCalledExactlyOnceWith(10 ** coordinate)
    },
  )

  test.each([
    [`number`, `ArrowUp`, 10],
    [`number`, `ArrowDown`, 0.1],
    [`number`, `PageUp`, 1000],
    [`range`, `ArrowRight`, 10],
    [`range`, `ArrowLeft`, 0.1],
    [`range`, `Home`, 0.001],
    [`range`, `End`, 1000],
  ] as const)(`%s %s commits %s in real units`, async (control, key, expected) => {
    const on_commit = vi.fn()
    const props = $state({ ...log_props, value: 1, commit: `change` as const, on_commit })
    const inputs = mount_range(props)
    expect(press_key(inputs[control], key).defaultPrevented).toBe(true)
    await tick()
    expect(props.value).toBe(expected)
    expect(inputs.number.valueAsNumber).toBe(expected)
    expect(inputs.range.getAttribute(`aria-valuenow`)).toBe(String(expected))
    expect(on_commit).toHaveBeenCalledExactlyOnceWith(expected)
  })

  test.each([`0`, `-1`, `0.0001`, `1001`])(`rejects typed value %s`, async (text) => {
    const on_commit = vi.fn()
    const { number } = mount_range({ ...log_props, on_commit })
    number.value = text
    number.dispatchEvent(new Event(`input`, { bubbles: true }))
    number.dispatchEvent(new Event(`change`, { bubbles: true }))
    await tick()
    expect(number.valueAsNumber).toBe(1)
    expect(on_commit).not.toHaveBeenCalled()
  })

  test.each([
    { min: 0 },
    { min: -1 },
    { max: 0.001 },
    { value: 0 },
    { value: -1 },
    { value: Infinity },
    { value: 1001 },
    { min: Number.MIN_VALUE, step: 0.1 },
  ])(`rejects invalid logarithmic configuration %j`, (overrides) => {
    expect(() => {
      mount_range({ ...log_props, ...overrides })
      flushSync()
    }).toThrow(/Logarithmic range|logarithmic value|logarithmic step/)
  })

  test(`preserves caller key cancellation and formatted announcements`, () => {
    const on_commit = vi.fn()
    const { range } = mount_range({
      ...log_props,
      on_commit,
      range_props: {
        onkeydown: (event: KeyboardEvent) => event.preventDefault(),
        'aria-valuetext': `1 bar`,
      },
    })
    press_key(range, `ArrowUp`)
    expect(range.getAttribute(`aria-valuetext`)).toBe(`1 bar`)
    expect(range.valueAsNumber).toBe(0)
    expect(on_commit).not.toHaveBeenCalled()
  })

  test.each([`number`, `range`] as const)(
    `%s log grid traversal never stalls`,
    async (control) => {
      const props = $state({
        min: 0.003,
        max: 3,
        step: 0.3,
        scale: `log` as const,
        value: 3,
      })
      const inputs = mount_range(props)
      let previous = 3
      for (let idx = 0; idx < 10; idx++) {
        press_key(inputs[control], `ArrowDown`)
        await tick()
        expect(props.value).toBeLessThan(previous)
        previous = props.value
      }
      expect(props.value).toBe(0.003)
      // Model Chromium's native range serialization so tiny keyboard steps cannot
      // silently disappear when the input handler reads the rounded coordinate.
      vi.spyOn(inputs.range, `valueAsNumber`, `get`).mockImplementation(() =>
        Number(Number(inputs.range.value).toPrecision(15)),
      )
      for (const [direction, initial] of [
        [1, 0.5000014999272548],
        [-1, 0.5000019999040063],
      ]) {
        Object.assign(props, {
          min: 0.5,
          max: 0.50005,
          step: 1.3368417291558519e-16,
          value: initial,
        })
        await tick()
        let previous_value = initial
        for (let idx = 0; idx < 10; idx++) {
          press_key(inputs[control], direction > 0 ? `ArrowUp` : `ArrowDown`)
          await tick()
          expect(direction * (props.value - previous_value)).toBeGreaterThan(0)
          previous_value = props.value
        }
      }
    },
  )
  test(`empty values remain unset and any-step keys use one percent of the log span`, async () => {
    const props = $state({
      ...log_props,
      step: `any`,
      value: 1,
      empty: `undefined` as const,
    })
    const { number, range } = mount_range(props)
    number.value = ``
    number.dispatchEvent(new Event(`change`, { bubbles: true }))
    await tick()
    expect(props.value).toBeUndefined()
    expect(range.valueAsNumber).toBe(-3)
    press_key(range, `ArrowRight`)
    await tick()
    expect(props.value).toBe(10 ** -2.94)
    expect(number.valueAsNumber).toBe(props.value)
  })
})

test.each([
  [`retain`, `input`, ``, 0.5],
  [`undefined`, `input`, ``, undefined],
  [`retain`, `change`, `0.8`, 0.5],
  [`retain`, `input`, `2`, 0.5],
  [`retain`, `input`, `0.85`, 0.85],
] as const)(`draft policy %s / %s / %s`, async (empty, commit, draft, expected) => {
  const updates: (number | undefined)[] = []
  const props = $state({
    ...named_props,
    value: 0.5,
    empty,
    commit,
    on_commit: (value: number | undefined) => updates.push(value),
  })
  const { number, range } = mount_range(props)
  number.value = draft
  number.dispatchEvent(new Event(`input`, { bubbles: true }))
  await tick()
  expect(props.value).toBe(expected)
  expect(range.valueAsNumber).toBe(expected ?? named_props.min)
  number.dispatchEvent(new Event(`change`, { bubbles: true }))
  await tick()
  const final = commit === `change` ? 0.8 : expected
  expect(props.value).toBe(final)
  expect(number.value).toBe(final === undefined ? `` : String(final))
  expect(updates).toEqual(final === 0.5 ? [] : [final])
  props.value = 0.2
  await tick()
  expect(number.value).toBe(`0.2`)
})
