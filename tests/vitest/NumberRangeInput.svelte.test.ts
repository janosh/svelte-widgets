import { NumberRangeInput } from '$lib'
import { mount, tick, type ComponentProps } from 'svelte'
import { describe, expect, test } from 'vite-plus/test'

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

    expect(
      mount_range({ min: 0, max: 1, step: 0.1, value: 0 }).range.getAttribute(
        `aria-label`,
      ),
    ).toBe(`Value`)
  })

  test.each([
    {
      name: `explicit metadata overrides schema values`,
      props: {
        setting: `radius`,
        schema: {
          radius: {
            minimum: 0,
            maximum: 2,
            multipleOf: 0.1,
            description: `Radius from schema`,
          },
        },
        min: 0.25,
        max: 1.25,
        step: 0.25,
        title: `Custom radius`,
        value: 0.5,
      },
      expected_bounds: { min: `0.25`, max: `1.25`, step: `0.25` },
      expected_label: `Custom radius`,
    },
    {
      name: `schema values supply absent bounds and description`,
      props: {
        setting: `opacity`,
        schema: {
          opacity: {
            minimum: 0,
            maximum: 1,
            multipleOf: 0.05,
            description: `Layer opacity`,
          },
        },
        value: 0.5,
      },
      expected_bounds: { min: `0`, max: `1`, step: `0.05` },
      expected_label: `Layer opacity`,
    },
  ])(`$name`, ({ props, expected_bounds, expected_label }) => {
    const { target, inputs, range } = mount_range(props)
    expect(target.querySelector(`label`)?.dataset.key).toBe(props.setting)
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
