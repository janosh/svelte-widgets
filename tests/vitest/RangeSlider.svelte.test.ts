import { RangeSlider, type RangeValue } from '$lib'
import RangeSliderDemo from '../../src/routes/(demos)/(range-slider)/range-slider/+page.svelte'
import { snap_range_value, step_range_value, validate_range } from '$lib/range-slider'
import { flushSync, mount, tick, unmount, type ComponentProps } from 'svelte'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { doc_query, mock_rect, pointer_event, press_key } from './index'

type Props = ComponentProps<typeof RangeSlider>
const setup = (props: Props = {}) => {
  const component = mount(RangeSlider, { target: document.body, props })
  flushSync()
  onTestFinished(() => unmount(component))
  const thumbs = [...document.querySelectorAll<HTMLButtonElement>(`[role=slider]`)]
  const inputs = [...document.querySelectorAll<HTMLInputElement>(`input[type=number]`)]
  const rail = doc_query(`.rail`)
  mock_rect(rail, { left: 0, top: 0, width: 100, height: 44 })
  rail.setPointerCapture = vi.fn()
  rail.hasPointerCapture = vi.fn(() => true)
  rail.releasePointerCapture = vi.fn()
  const pointer = (
    type: string,
    position: number,
    target: HTMLElement = rail,
    init: PointerEventInit = {},
  ) => {
    target.dispatchEvent(
      pointer_event(type, position, 22, { pointerId: 1, cancelable: true, ...init }),
    )
  }
  return { thumbs, inputs, rail, pointer }
}
const announced = (thumbs: HTMLButtonElement[]) =>
  thumbs.map((thumb) => Number(thumb.getAttribute(`aria-valuenow`)))
const edit = async (input: HTMLInputElement, text: string, final = true) => {
  input.value = text
  input.dispatchEvent(new Event(`input`, { bubbles: true }))
  if (final) input.dispatchEvent(new Event(`change`, { bubbles: true }))
  await tick()
}

test(`demo Usage example highlights Svelte source`, async () => {
  const component = mount(RangeSliderDemo, { target: document.body })
  onTestFinished(() => unmount(component))
  const usage = doc_query(`[aria-label="RangeSlider usage"]`)
  await vi.waitFor(() => expect(usage.querySelector(`.pl-k`)?.textContent).toBe(`import`))
  expect(usage.getAttribute(`aria-busy`)).toBe(`false`)
  expect(usage.textContent).toContain(`bind:value`)
  expect(usage.querySelector(`script`)).toBeNull()
})

describe(`range arithmetic`, () => {
  test(`snapping and stepping match an integer-built decimal grid`, () => {
    const expected_grid = Array.from(
      { length: 11 },
      (_value, idx) => (-35 + idx * 10) / 100,
    )
    for (const [idx, value] of expected_grid.entries()) {
      expect(snap_range_value(value, -0.35, 0.65, 0.1)).toBe(value)
      expect(step_range_value(value, -0.35, 0.65, 0.1, 1, 1)).toBe(
        expected_grid[Math.min(10, idx + 1)],
      )
      expect(step_range_value(value, -0.35, 0.65, 0.1, -1, 1)).toBe(
        expected_grid[Math.max(0, idx - 1)],
      )
    }
  })
  test.each([
    [1e16, 1e16 + 100, 2, 1e16 + 8, 1, 1e16 + 10],
    [-1e16, 1e16, 4.5, 9999999999999968, -1, 9999999999999960],
    [
      Number.MAX_SAFE_INTEGER - 3,
      Number.MAX_SAFE_INTEGER,
      1,
      Number.MAX_SAFE_INTEGER - 1,
      1,
      Number.MAX_SAFE_INTEGER,
    ],
  ])(
    `large-domain stepping from %s to %s at step %s`,
    (min, max, step, value, direction, expected) => {
      validate_range([min, max], min, max, step)
      expect(step_range_value(value, min, max, step, direction, 1)).toBe(expected)
      expect(snap_range_value(expected, min, max, step)).toBe(expected)
    },
  )
  test.each([
    [0.26, 0, 1, 0.1, 0.3],
    [-0.24, -0.35, 0.65, 0.1, -0.25],
    [0.00000026, 0, 0.000001, 1e-7, 3e-7],
    [4, 0, 10, 3, 3],
    [9.6, 0, 10, 3, 10],
    [5, 0, 10, 20, 0],
    [6, 0, 10, 20, 10],
    [-100, -5, 5, 0.5, -5],
    [100, -5, 5, 0.5, 5],
    [2e-101, 0, 1e-100, 1e-101, 2e-101],
  ])(`snaps %s within [%s, %s] at step %s to %s`, (value, min, max, step, expected) => {
    expect(snap_range_value(value, min, max, step)).toBe(expected)
  })
  test.each([
    [0, 0, 1],
    [10, 0, 1],
    [0, Infinity, 1],
    [NaN, 100, 1],
    [0, 100, 0],
    [0, 100, -1],
    [0, 100, NaN],
    [0, 100, Infinity],
    [-Number.MAX_VALUE, Number.MAX_VALUE, 1],
    [0, 1, 1e-20],
    [1e20, 1e21, 1],
    [1e16, 1e16 + 100, 1.5],
  ])(`rejects invalid min/max/step %s/%s/%s`, (min, max, step) => {
    expect(() => validate_range([min, max], min, max, step)).toThrow(`RangeSlider needs`)
  })
  test.each([
    [80, 20],
    [-1, 50],
    [20, 101],
    [NaN, 80],
    [20, Infinity],
  ] as RangeValue[])(`rejects invalid pair %s/%s`, (lower, upper) => {
    expect(() => validate_range([lower, upper], 0, 100, 1)).toThrow(`ordered pair`)
  })
})

describe(`RangeSlider`, () => {
  test.each([`keyboard`, `number`, `pointer`])(
    `synchronous external resets inside oninput do not commit (%s)`,
    async (mode) => {
      const oncommit = vi.fn()
      const props = $state<Props>({
        value: [20, 80],
        oncommit,
        oninput: () => {
          props.value = [25, 75]
        },
      })
      const { thumbs, inputs, pointer } = setup(props)
      if (mode === `keyboard`) press_key(thumbs[0], `ArrowUp`)
      else if (mode === `number`) await edit(inputs[0], `40`)
      else {
        pointer(`pointerdown`, 40)
        pointer(`pointerup`, 40)
      }
      await tick()
      expect(announced(thumbs)).toEqual([25, 75])
      expect(oncommit).not.toHaveBeenCalled()
    },
  )
  test.each([
    { ctrlKey: true },
    { metaKey: true },
    { altKey: true },
    { isComposing: true },
  ])(
    `modified or composing keys preserve thumb values and numeric drafts %j`,
    async (modifiers) => {
      const { inputs, thumbs } = setup({ value: [20, 80] })
      expect(press_key(thumbs[0], `ArrowRight`, modifiers).defaultPrevented).toBe(false)
      await tick()
      expect(announced(thumbs)).toEqual([20, 80])
      await edit(inputs[0], `43`, false)
      expect(press_key(inputs[0], `ArrowUp`, modifiers).defaultPrevented).toBe(false)
      await tick()
      expect(inputs[0].value).toBe(`43`)
      expect(announced(thumbs)).toEqual([20, 80])
    },
  )
  test.each([false, true])(
    `form reset discards drafts only unless prevented=%s`,
    async (prevented) => {
      const form = document.createElement(`form`)
      document.body.append(form)
      const component = mount(RangeSlider, { target: form, props: { value: [20, 80] } })
      onTestFinished(() => unmount(component))
      await tick()
      const input = form.querySelector(`input`)
      if (!input) throw new Error(`Missing numeric field`)
      await edit(input, `43`, false)
      if (prevented) form.addEventListener(`reset`, (event) => event.preventDefault())
      // happy-dom resets controls before dispatch and ignores preventDefault. Exercise
      // cancellation directly here; real native reset is covered in Playwright.
      if (prevented) form.dispatchEvent(new Event(`reset`, { cancelable: true }))
      else form.reset()
      await tick()
      expect(input.value).toBe(prevented ? `43` : `20`)
    },
  )
  test.each([
    [[0, 10], 1, `ArrowLeft`, [0, 9]],
    [[0, 9], 1, `ArrowRight`, [0, 10]],
    [[2, 8], 1, `Home`, [2, 2]],
    [[2, 8], 0, `End`, [8, 8]],
    [[2, 8], 0, `ArrowUp`, [3, 8]],
    [[2, 8], 1, `ArrowDown`, [2, 6]],
  ] as const)(`off-grid pair %j: thumb %s / %s`, async (value, thumb, key, expected) => {
    const { thumbs } = setup({ value: [...value], min: 0, max: 10, step: 3 })
    press_key(thumbs[thumb], key)
    await tick()
    expect(announced(thumbs)).toEqual(expected)
  })
  test(`supported off-grid values remain valid native form fields`, () => {
    const { inputs, rail } = setup({ value: [2, 10], min: 0, max: 10, step: 3 })
    const form = document.createElement(`form`)
    document.body.append(form)
    form.append(rail.closest(`.range-slider`) as HTMLElement)
    expect(inputs.every((input) => input.checkValidity())).toBe(true)
    expect(form.checkValidity()).toBe(true)
  })
  test.each([
    [`43`, `ArrowUp`, 45],
    [`43`, `ArrowDown`, 40],
    [`40`, `ArrowUp`, 45],
    [``, `ArrowUp`, 25],
  ])(`numeric draft %s then %s becomes %s`, async (draft, key, expected) => {
    const { inputs, thumbs } = setup({ value: [20, 80], step: 5 })
    await edit(inputs[0], draft, false)
    press_key(inputs[0], key)
    await tick()
    expect(announced(thumbs)).toEqual([expected, 80])
    expect(inputs[0].valueAsNumber).toBe(expected)
  })
  test.each([false, true])(
    `an external reset during a drag does not commit (moved=%s)`,
    async (moved) => {
      const props = $state<Props>({ value: [20, 80], oncommit: vi.fn() })
      const { thumbs, pointer } = setup(props)
      pointer(`pointerdown`, 20, thumbs[0])
      if (moved) pointer(`pointermove`, 40)
      props.value = [30, 70]
      await tick()
      pointer(`pointerup`, 20)
      await tick()
      expect(announced(thumbs)).toEqual([30, 70])
      expect(props.oncommit).not.toHaveBeenCalled()
    },
  )
  test(`names both ends, reports dependent limits and follows external state without events`, async () => {
    const props = $state<Props>({
      value: [20, 80],
      label: `Budget`,
      description: `Per night`,
      format_value: (value: number) => `$${value}`,
      oninput: vi.fn(),
      oncommit: vi.fn(),
    })
    const { thumbs, inputs } = setup(props)
    expect(inputs).toHaveLength(2)
    expect(inputs.every((input) => input.closest(`.heading .summary`))).toBe(true)
    expect(inputs.some((input) => input.closest(`[aria-hidden=true]`))).toBe(false)
    for (const [idx, thumb] of thumbs.entries()) {
      const label = thumb.getAttribute(`aria-label`)
      expect(label).toBe(`Budget ${idx === 0 ? `Minimum` : `Maximum`}`)
      expect(inputs[idx].getAttribute(`aria-label`)).toBe(label)
      expect(thumb.getAttribute(`aria-valuetext`)).toBe(idx === 0 ? `$20` : `$80`)
      expect(
        document.querySelector(`[id="${thumb.getAttribute(`aria-describedby`)}"]`)
          ?.textContent,
      ).toBe(`Per night`)
    }
    expect(
      thumbs.map((thumb) => [
        thumb.getAttribute(`aria-valuemin`),
        thumb.getAttribute(`aria-valuemax`),
      ]),
    ).toEqual([
      [`0`, `80`],
      [`20`, `100`],
    ])
    props.min = -50
    props.max = 50
    props.value = [-10, 40]
    await tick()
    expect(announced(thumbs)).toEqual([-10, 40])
    expect(inputs.map((input) => input.valueAsNumber)).toEqual([-10, 40])
    expect(
      [...document.querySelectorAll(`.formatted`)].map((node) => node.textContent),
    ).toEqual([`$-10`, `$40`])
    expect(props.oninput).not.toHaveBeenCalled()
    expect(props.oncommit).not.toHaveBeenCalled()
  })
  test(`defaults to the full interval and keeps names when numeric inputs are hidden`, () => {
    const { thumbs, inputs } = setup({ min: -1, max: 1, step: 0.1, show_inputs: false })
    expect(announced(thumbs)).toEqual([-1, 1])
    expect(inputs).toHaveLength(0)
    expect(thumbs.map((thumb) => thumb.getAttribute(`aria-label`))).toEqual([
      `Range Minimum`,
      `Range Maximum`,
    ])
  })
  test.each([
    [0, `ArrowRight`, {}, [21, 80]],
    [0, `ArrowDown`, {}, [19, 80]],
    [1, `ArrowUp`, {}, [20, 81]],
    [1, `ArrowLeft`, {}, [20, 79]],
    [0, `Home`, {}, [0, 80]],
    [0, `End`, {}, [80, 80]],
    [1, `Home`, {}, [20, 20]],
    [1, `End`, {}, [20, 100]],
    [0, `PageUp`, {}, [30, 80]],
    [1, `PageDown`, {}, [20, 70]],
    [0, `ArrowRight`, { shiftKey: true }, [30, 80]],
  ] as const)(`thumb %s handles %s (%j)`, async (thumb, key, modifiers, expected) => {
    const props = $state<Props>({ value: [20, 80], oninput: vi.fn(), oncommit: vi.fn() })
    const { thumbs } = setup(props)
    expect(press_key(thumbs[thumb], key, modifiers).defaultPrevented).toBe(true)
    await tick()
    expect(props.value).toEqual(expected)
    expect(announced(thumbs)).toEqual(expected)
    expect(props.oninput).toHaveBeenCalledExactlyOnceWith(expected)
    expect(props.oncommit).toHaveBeenCalledExactlyOnceWith(expected)
  })
  test(`ignores claimed and unrelated keys, and emits nothing at a bound`, async () => {
    const oncommit = vi.fn()
    const { thumbs } = setup({ value: [0, 100], oncommit })
    const event = new KeyboardEvent(`keydown`, {
      key: `ArrowRight`,
      bubbles: true,
      cancelable: true,
    })
    event.preventDefault()
    thumbs[0].dispatchEvent(event)
    expect(press_key(thumbs[0], `Tab`).defaultPrevented).toBe(false)
    press_key(thumbs[0], `ArrowLeft`)
    await tick()
    expect(announced(thumbs)).toEqual([0, 100])
    expect(oncommit).not.toHaveBeenCalled()
  })
  test(`mirrors horizontal keys in RTL while keeping vertical keys increasing upwards`, async () => {
    const { thumbs, rail, pointer } = setup({ value: [20, 80], dir: `rtl` })
    vi.spyOn(window, `getComputedStyle`).mockReturnValue({
      direction: `rtl`,
    } as CSSStyleDeclaration)
    press_key(thumbs[0], `ArrowLeft`)
    press_key(thumbs[1], `ArrowRight`)
    await tick()
    expect(announced(thumbs)).toEqual([21, 79])
    pointer(`pointerdown`, 10, rail)
    pointer(`pointerup`, 10, rail)
    await tick()
    expect(announced(thumbs)).toEqual([21, 90])
  })
  test.each([
    [`43`, 45],
    [`-100`, 0],
    [`100`, 80],
    [``, 20],
    [`not a number`, 20],
  ])(`numeric draft %s commits as %s and never crosses`, async (draft, expected) => {
    const oncommit = vi.fn()
    const { inputs, thumbs } = setup({ value: [20, 80], step: 5, oncommit })
    await edit(inputs[0], draft, false)
    expect(announced(thumbs)).toEqual([20, 80])
    inputs[0].dispatchEvent(new Event(`blur`))
    await tick()
    expect(announced(thumbs)).toEqual([expected, 80])
    expect(inputs[0].valueAsNumber).toBe(expected)
    expect(oncommit).toHaveBeenCalledTimes(expected === 20 ? 0 : 1)
  })
  test(`Enter commits once, Escape discards, and numeric arrows use the configured step`, async () => {
    const props = $state<Props>({
      min: 0,
      max: 1,
      step: 0.1,
      value: [0.2, 0.8],
      oncommit: vi.fn(),
    })
    const { inputs, thumbs } = setup(props)
    await edit(inputs[0], `0.34`, false)
    expect(press_key(inputs[0], `Enter`).defaultPrevented).toBe(true)
    inputs[0].dispatchEvent(new Event(`blur`))
    await tick()
    expect(props.oncommit).toHaveBeenCalledExactlyOnceWith([0.3, 0.8])
    await edit(inputs[0], `0.7`, false)
    press_key(inputs[0], `Escape`)
    await tick()
    expect(inputs[0].value).toBe(`0.3`)
    press_key(inputs[0], `ArrowUp`)
    await tick()
    expect(announced(thumbs)).toEqual([0.4, 0.8])
  })
  test.each([`pointerup`, `pointercancel`, `lostpointercapture`])(
    `drag updates live, clamps without crossing and commits once on %s`,
    async (ending) => {
      const props = $state<Props>({
        value: [20, 80],
        oninput: vi.fn(),
        oncommit: vi.fn(),
      })
      const { thumbs, rail, pointer } = setup(props)
      pointer(`pointerdown`, 20, thumbs[0])
      pointer(`pointermove`, 40)
      await tick()
      expect(props.value).toEqual([40, 80])
      expect(props.oncommit).not.toHaveBeenCalled()
      pointer(`pointermove`, 120)
      pointer(ending, 120)
      pointer(`pointerup`, 120)
      await tick()
      expect(props.value).toEqual([80, 80])
      expect(props.oncommit).toHaveBeenCalledExactlyOnceWith([80, 80])
      expect(rail.releasePointerCapture).toHaveBeenCalledWith(1)
    },
  )
  test.each([
    [30, [30, 80]],
    [70, [20, 70]],
    [0, [0, 80]],
    [100, [20, 100]],
  ] as const)(`track press at %s selects nearest thumb`, async (position, expected) => {
    const { thumbs, pointer } = setup({ value: [20, 80] })
    pointer(`pointerdown`, position)
    pointer(`pointerup`, position)
    await tick()
    expect(announced(thumbs)).toEqual(expected)
    expect(document.activeElement).toBe(thumbs[position <= 50 ? 0 : 1])
  })
  test.each([
    [30, [30, 50]],
    [70, [50, 70]],
  ] as const)(`coincident handles can separate toward %s`, async (position, expected) => {
    const { thumbs, pointer } = setup({ value: [50, 50] })
    pointer(`pointerdown`, 50, thumbs[0])
    pointer(`pointermove`, position)
    pointer(`pointerup`, position)
    await tick()
    expect(announced(thumbs)).toEqual(expected)
  })
  test(`grabbing the edge of a thumb preserves its pointer offset`, async () => {
    const { thumbs, pointer } = setup({ value: [20, 80] })
    pointer(`pointerdown`, 25, thumbs[0])
    await tick()
    expect(announced(thumbs)).toEqual([20, 80])
    pointer(`pointermove`, 35)
    pointer(`pointerup`, 35)
    await tick()
    expect(announced(thumbs)).toEqual([30, 80])
  })
  test(`ignores other pointers and non-primary buttons, no-op gestures do not commit`, async () => {
    const oncommit = vi.fn()
    const { thumbs, rail, pointer } = setup({ value: [20, 80], oncommit })
    pointer(`pointerdown`, 50, rail, { button: 2 })
    pointer(`pointerdown`, 50, rail, { isPrimary: false })
    pointer(`pointerdown`, 20, thumbs[0])
    pointer(`pointermove`, 50, rail, { pointerId: 2 })
    pointer(`pointerup`, 50, rail, { pointerId: 2 })
    pointer(`pointerup`, 20)
    await tick()
    expect(announced(thumbs)).toEqual([20, 80])
    expect(oncommit).not.toHaveBeenCalled()
  })
  test(`disabled controls reject input and disabling during a drag releases capture`, async () => {
    const props = $state<Props>({ value: [20, 80], disabled: true, oncommit: vi.fn() })
    const { thumbs, inputs, rail, pointer } = setup(props)
    expect([...thumbs, ...inputs].every((input) => input.disabled)).toBe(true)
    pointer(`pointerdown`, 40)
    press_key(thumbs[0], `ArrowRight`)
    await edit(inputs[0], `50`)
    expect(announced(thumbs)).toEqual([20, 80])
    props.disabled = false
    await tick()
    pointer(`pointerdown`, 20, thumbs[0])
    pointer(`pointermove`, 30)
    props.disabled = true
    await tick()
    pointer(`pointermove`, 40)
    pointer(`pointerup`, 40)
    await tick()
    expect(announced(thumbs)).toEqual([30, 80])
    expect(rail.releasePointerCapture).toHaveBeenCalledWith(1)
    expect(props.oncommit).not.toHaveBeenCalled()
  })
})
