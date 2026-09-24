import { ColorInput } from '$lib'
import { mount, tick, unmount, type ComponentProps } from 'svelte'
import { describe, expect, onTestFinished, test, vi } from 'vitest'
import { press_key } from './index'

const mount_color = (options: ComponentProps<typeof ColorInput> = {}) => {
  const props = $state({
    value: `#336699`,
    ...options,
    on_commit: vi.fn(options.on_commit),
  })
  const target = document.createElement(`form`)
  document.body.append(target)
  const component = mount(ColorInput, { target, props })
  onTestFinished(() => unmount(component))
  const input = (type: string): HTMLInputElement => {
    const element = target.querySelector<HTMLInputElement>(`input[type="${type}"]`)
    if (!element) throw new Error(`Missing ${type} input`)
    return element
  }
  const change = async (type: string, value: string, event = `input`) => {
    const element = input(type)
    element.value = value
    element.dispatchEvent(new Event(event, { bubbles: true }))
    await tick()
  }
  const press = async (type: string, key: string) => {
    expect(press_key(input(type), key).defaultPrevented).toBe(true)
    await tick()
  }
  return { props, target, input, change, press }
}

describe(`ColorInput`, () => {
  test.each([
    [`#AbC`, false, `#aabbcc`],
    [`112233`, false, `#112233`],
    [`#ABCD`, true, `#aabbccdd`],
    [`#112233`, true, `#112233ff`],
    [`#ABCDEF00`, true, `#abcdef00`],
    [` \t#AbCdEf \t`, false, `#abcdef`],
    [` \t#AbCdEf80 \t`, true, `#abcdef80`],
  ])(`normalizes %s with alpha=%s`, async (value, alpha, normalized) => {
    const { props, target, input, change } = mount_color({ alpha, name: `color` })
    input(`text`).focus()
    await change(`text`, ``)
    let typed = ``
    for (const character of value) {
      typed += character
      // Append to the rendered field, so premature expansion of short hex corrupts
      // the next input just as it would while a user types a six-digit color.
      await change(`text`, input(`text`).value + character)
      expect(input(`text`).value).toBe(typed)
    }
    expect(props.value).toBe(normalized)
    expect(input(`color`).value).toBe(normalized.slice(0, 7))
    expect(input(`text`).value).toBe(value)
    expect(props.on_commit).toHaveBeenLastCalledWith(normalized)
    const n_commits = props.on_commit.mock.calls.length
    await change(`text`, value, `change`)
    expect(input(`text`).value).toBe(normalized)
    expect([...new FormData(target)]).toEqual([[`color`, normalized]])
    input(`text`).dispatchEvent(new FocusEvent(`blur`))
    await tick()
    if (alpha) {
      input(`number`).dispatchEvent(new FocusEvent(`blur`))
      await tick()
      expect(props.value).toBe(normalized)
    }
    expect(props.on_commit).toHaveBeenCalledTimes(n_commits)
  })

  test.each([``, `#12`, `#12xz89`, `red`, `#aabbcc00`])(
    `keeps invalid draft %j out of committed state and form submissions`,
    async (draft) => {
      const { props, target, input, change } = mount_color({ name: `surface` })
      await change(`text`, draft)
      expect(props.value).toBe(`#336699`)
      expect(props.on_commit).not.toHaveBeenCalled()
      expect(input(`text`).getAttribute(`aria-invalid`)).toBe(`true`)
      expect(target.checkValidity()).toBe(false)
      const error_id = input(`text`).getAttribute(`aria-describedby`)
      expect(target.querySelector(`[id="${error_id}"]`)?.textContent).toBe(
        `Enter a valid hexadecimal color`,
      )
      expect(input(`color`).value).toBe(`#336699`)
      await change(`text`, draft, `change`)
      expect(input(`text`).value).toBe(`#336699`)
      expect(input(`text`).hasAttribute(`aria-invalid`)).toBe(false)
      expect(target.checkValidity()).toBe(true)
      expect([...new FormData(target)]).toEqual([[`surface`, `#336699`]])
    },
  )

  test.each(
    [`text`, `number`].flatMap((type) =>
      [`change`, `blur`, `Enter`].map((event) => [type, event]),
    ),
  )(`commits deferred %s drafts on %s`, async (type, event) => {
    const alpha = type === `number`
    const expected = alpha ? `#33669940` : `#aabbcc`
    const { props, input, change, press } = mount_color({ alpha, commit: `change` })
    await change(type, alpha ? `25` : `#abc`)
    expect(props.value).toBe(`#336699`)
    expect(input(`color`).value).toBe(expected.slice(0, 7))
    if (event === `Enter`) await press(type, event)
    else await change(type, input(type).value, event)
    expect(props.value).toBe(expected)
    expect(props.on_commit).toHaveBeenCalledExactlyOnceWith(expected)
  })

  test.each([
    [`#ff880000`, `#a`, `0`],
    [`#ff8800ff`, `#a`, `100`],
    [`#ff8800fe`, `#a`, `100`],
    [`#336699fe`, `#a`, `100`],
    [`#ff8800ff`, `#ff8800ff`, `100`],
  ])(
    `Escape cancels drafts and external %s replaces draft %s`,
    async (color, hex_draft, opacity) => {
      const { props, target, input, change, press } = mount_color({
        alpha: true,
        commit: `change`,
      })
      await change(`text`, `#abc0`)
      await press(`text`, `Escape`)
      expect(input(`text`).value).toBe(`#336699ff`)
      expect(input(`number`).value).toBe(`100`)
      await change(`number`, `25`)
      await press(`number`, `Escape`)
      expect(input(`number`).value).toBe(`100`)
      expect(input(`text`).value).toBe(`#336699ff`)
      await change(`number`, `101`)
      await press(`number`, `Escape`)
      expect(input(`number`).hasAttribute(`aria-invalid`)).toBe(false)
      await change(`text`, hex_draft)
      await change(`number`, `101`)
      props.value = color
      await tick()
      expect(input(`text`).value).toBe(color)
      expect(input(`color`).value).toBe(color.slice(0, 7))
      expect(input(`number`).value).toBe(opacity)
      expect(input(`number`).hasAttribute(`aria-invalid`)).toBe(false)
      expect(input(`number`).hasAttribute(`aria-describedby`)).toBe(false)
      expect(target.querySelector(`small`)).toBeNull()
      expect(target.checkValidity()).toBe(true)
      expect(props.on_commit).not.toHaveBeenCalled()
    },
  )

  test.each([``, `-1`, `-0.1`, `101`, `100.1`, `50.5`])(
    `rejects invalid opacity draft %j and restores it on blur`,
    async (draft) => {
      const { props, target, input, change } = mount_color({
        alpha: true,
        value: `#33669980`,
      })
      await change(`number`, draft)
      expect(input(`number`).value).toBe(draft)
      expect(input(`number`).getAttribute(`aria-invalid`)).toBe(`true`)
      expect(input(`number`).hasAttribute(`aria-valuetext`)).toBe(false)
      const error_id = input(`number`).getAttribute(`aria-describedby`)
      expect(target.querySelector(`[id="${error_id}"]`)?.textContent).toBe(
        `Enter a whole percentage from 0 to 100`,
      )
      expect(target.checkValidity()).toBe(false)
      expect(props.value).toBe(`#33669980`)
      expect(input(`text`).value).toBe(`#33669980`)
      await change(`number`, draft, `blur`)
      expect(input(`number`).value).toBe(`50`)
      expect(input(`number`).hasAttribute(`aria-invalid`)).toBe(false)
      expect(input(`number`).hasAttribute(`aria-describedby`)).toBe(false)
      expect(target.querySelector(`[id="${error_id}"]`)).toBeNull()
      expect(target.checkValidity()).toBe(true)
      expect(props.on_commit).not.toHaveBeenCalled()
    },
  )

  test.each([`input`, `change`] as const)(
    `preserves RGB at zero alpha in %s mode`,
    async (commit) => {
      const { props, input, change } = mount_color({
        alpha: true,
        commit,
        value: `#33669980`,
      })
      await change(`number`, `0`)
      expect(props.value).toBe(commit === `input` ? `#33669900` : `#33669980`)
      await change(`number`, `0`, `change`)
      expect(props.value).toBe(`#33669900`)
      expect(input(`color`).value).toBe(`#336699`)
      await change(`color`, `#aabbcc`)
      expect(props.value).toBe(commit === `input` ? `#aabbcc00` : `#33669900`)
      await change(`color`, `#aabbcc`, `change`)
      expect(props.value).toBe(`#aabbcc00`)
      await change(`number`, `100`, `change`)
      expect(props.value).toBe(`#aabbccff`)
      expect(props.on_commit.mock.calls).toEqual([
        [`#33669900`],
        [`#aabbcc00`],
        [`#aabbccff`],
      ])
    },
  )

  test(`presets commit immediately and accessible labels can be translated`, async () => {
    const { props, target, input, change } = mount_color({
      alpha: true,
      commit: `change`,
      label: `Surface`,
      presets: [`#abc0`, `#000`],
      labels: {
        picker: `Farbe wählen`,
        hex: `Hex-Farbe`,
        opacity: `Deckkraft`,
        invalid_opacity: `Ganze Prozentzahl zwischen 0 und 100 eingeben`,
        preset: (color: string) => `Wähle ${color}`,
      },
    })
    expect(target.querySelector(`legend`)?.textContent).toBe(`Surface`)
    expect(input(`color`).getAttribute(`aria-label`)).toBe(`Farbe wählen`)
    expect(input(`text`).getAttribute(`aria-label`)).toBe(`Hex-Farbe`)
    expect(input(`number`).closest(`label`)?.textContent).toContain(`Deckkraft`)
    await change(`number`, `101`)
    expect(target.querySelector(`small`)?.textContent).toBe(
      `Ganze Prozentzahl zwischen 0 und 100 eingeben`,
    )
    const preset = target.querySelector(`button`)
    expect(preset?.getAttribute(`aria-label`)).toBe(`Wähle #aabbcc00`)
    preset?.click()
    await tick()
    expect(props.value).toBe(`#aabbcc00`)
    expect(preset?.getAttribute(`aria-pressed`)).toBe(`true`)
    expect(props.on_commit).toHaveBeenCalledExactlyOnceWith(`#aabbcc00`)
    expect(input(`number`).getAttribute(`aria-valuetext`)).toBe(`0%`)
    expect(input(`number`).hasAttribute(`aria-invalid`)).toBe(false)
    expect(target.querySelector(`small`)).toBeNull()
  })

  test.each([`disabled`, `readonly`] as const)(
    `%s blocks changes through every control`,
    async (state) => {
      const { props, target, input, change } = mount_color({
        [state]: true,
        alpha: true,
        presets: [`#abc`],
      })
      expect(input(`color`).disabled).toBe(true)
      expect(input(`number`).disabled).toBe(true)
      expect(input(`text`)[state === `readonly` ? `readOnly` : `disabled`]).toBe(true)
      await change(`text`, `#aabbcc`)
      await change(`color`, `#aabbcc`)
      await change(`number`, `0`)
      const preset = target.querySelector(`button`)
      expect(preset?.disabled).toBe(true)
      preset?.click()
      expect(props.value).toBe(`#336699`)
      expect(props.on_commit).not.toHaveBeenCalled()
    },
  )

  test.each([
    { value: `red` },
    { presets: [`#xyxyxy`] },
    { value: `#1234`, alpha: false },
  ])(`rejects invalid configured colors %j`, (props) =>
    expect(() => mount_color(props)).toThrow(`ColorInput needs a hex color`),
  )
})
