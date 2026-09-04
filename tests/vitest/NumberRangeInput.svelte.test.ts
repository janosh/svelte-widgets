import { NumberRangeInput } from '$lib'
import { createRawSnippet, mount, tick, type ComponentProps } from 'svelte'
import { describe, expect, test } from 'vitest'

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

  const schema = {
    radius: {
      minimum: 0,
      maximum: 2,
      multipleOf: 0.1,
      description: `Radius from schema`,
    },
  }
  test.each([
    [
      `explicit props override the schema`,
      { min: 0.25, max: 1.25, step: 0.25, title: `Custom radius` },
      { min: `0.25`, max: `1.25`, step: `0.25` },
      `Custom radius`,
    ],
    [
      `the schema supplies absent bounds and description`,
      {},
      { min: `0`, max: `2`, step: `0.1` },
      `Radius from schema`,
    ],
    [
      `a schema without an increment allows any step`,
      { schema: { radius: { minimum: 0, maximum: 1 } } },
      { min: `0`, max: `1`, step: `any` },
      `radius`,
    ],
  ] as const)(`%s`, (_name, overrides, expected_bounds, expected_label) => {
    const { target, inputs, range } = mount_range({
      setting: `radius`,
      schema,
      value: 0.5,
      ...overrides,
    })
    expect(target.querySelector(`label`)?.dataset.key).toBe(`radius`)
    expect(inputs.map(({ min, max, step }) => ({ min, max, step }))).toEqual([
      expected_bounds,
      expected_bounds,
    ])
    expect(range.getAttribute(`aria-label`)).toBe(expected_label)
  })

  // Silently rendering an unbounded slider would hide the typo that caused it
  test(`throws when the schema has no entry for the setting`, () => {
    expect(() =>
      mount_range({ setting: `raidus`, schema: { radius: { minimum: 0 } }, value: 1 }),
    ).toThrow(`NumberRangeInput schema has no entry for setting "raidus"`)
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
    oncommit: (value: number | undefined) => updates.push(value),
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
