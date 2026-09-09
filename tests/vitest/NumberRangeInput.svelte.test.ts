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
import { doc_query, hover } from './index'

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
