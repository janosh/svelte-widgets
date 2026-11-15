import { InfoTag } from '#lib'
import { type ComponentProps, flushSync } from 'svelte'
import { beforeEach, describe, expect, test, vi } from 'vite-plus/test'
import { doc_query, render } from './index'

const write_text = vi.fn()
vi.stubGlobal(`navigator`, { clipboard: { writeText: write_text } })
beforeEach(() => {
  write_text.mockReset().mockResolvedValue(undefined)
})

describe(`InfoTag`, () => {
  const mount_tag = (props: ComponentProps<typeof InfoTag>): HTMLSpanElement => {
    render(InfoTag, props)
    return doc_query(`.info-tag`)
  }

  test(`renders trusted HTML labels and hover details while retaining click actions`, async () => {
    const onclick = vi.fn()
    const tag = mount_tag({
      label: `E<sub>hull</sub>:`,
      value: 42,
      title: `<b>Energy</b>`,
      onclick,
    })
    expect(tag.getAttribute(`role`)).toBe(`button`)
    expect(tag.querySelector(`sub`)?.textContent).toBe(`hull`)
    expect(doc_query(`em`).textContent).toBe(`42`)
    tag.dispatchEvent(new MouseEvent(`mouseenter`))
    await vi.waitFor(() =>
      expect(document.querySelector(`.popover b`)?.textContent).toBe(`Energy`),
    )
    expect(document.querySelector(`.popover`)?.getAttribute(`aria-label`)).toBe(
      `Tag details`,
    )
    tag.click()
    expect(onclick).toHaveBeenCalledOnce()
  })

  // variant, size and extra attributes pass straight through; disabled leaves the tab order
  // and blocks click plus Enter/Space activation
  test.each([
    [`defaults`, {}, [`default`, `md`]],
    [
      `variant, size and spread attrs`,
      { variant: `error`, size: `lg`, style: `color: red` },
      [`error`, `lg`],
    ],
    [`disabled`, { disabled: true }, [`default`, `md`]],
  ] as const)(`%s`, (_name, props, classes) => {
    const onclick = vi.fn()
    const tag = mount_tag({ label: `Test`, value: 1, onclick, ...props })
    const disabled = `disabled` in props
    for (const cls of classes) expect(tag.classList.contains(cls)).toBe(true)
    expect(tag.classList.contains(`disabled`)).toBe(disabled)
    expect(tag.getAttribute(`tabindex`)).toBe(disabled ? `-1` : `0`)
    expect(tag.getAttribute(`aria-disabled`)).toBe(String(disabled))
    expect(tag.style.color).toBe(`style` in props ? `red` : ``)
    tag.click()
    for (const key of [`Enter`, ` `])
      tag.dispatchEvent(new KeyboardEvent(`keydown`, { key, bubbles: true }))
    flushSync()
    expect(onclick).toHaveBeenCalledTimes(disabled ? 0 : 3)
  })

  // a tag is a copy button only when it has something to copy
  test.each([
    { value: undefined, copy_value: undefined, copied: undefined },
    { value: `mp-1234`, copy_value: undefined, copied: `mp-1234` },
    { value: 123.456, copy_value: undefined, copied: `123.456` },
    { value: `abc123`, copy_value: `full-id-abc123`, copied: `full-id-abc123` },
    // an HTML value copies as the text it renders, an explicit copy_value verbatim
    {
      value: `Fe<sub>2</sub>O<sub>3</sub> &amp; co`,
      copy_value: undefined,
      copied: `Fe2O3 & co`,
      text: `Fe2O3 & co`,
    },
    {
      value: `Fe<sub>2</sub>`,
      copy_value: `<b>raw</b>`,
      copied: `<b>raw</b>`,
      text: `Fe2`,
    },
    { value: undefined, copy_value: `full-id-abc123`, copied: `full-id-abc123` },
  ])(
    `value=$value, copy_value=$copy_value copies $copied`,
    ({ value, copy_value, copied, text = String(value ?? ``) }) => {
      const tag = mount_tag({ label: `ID:`, value, copy_value })
      expect(doc_query(`em`).textContent).toBe(text)
      expect(tag.getAttribute(`role`)).toBe(copied ? `button` : null)
      expect(tag.getAttribute(`tabindex`)).toBe(copied ? `0` : null)
      tag.click()
      flushSync()
      expect(write_text.mock.calls).toEqual(copied ? [[copied]] : [])
    },
  )

  test(`shows a checkmark after copying and removes it after 1s`, async () => {
    vi.useFakeTimers()
    try {
      mount_tag({ label: `ID:`, value: `abc123` }).click()
      await vi.advanceTimersByTimeAsync(0)
      flushSync()
      expect(document.querySelector(`.copy-checkmark`)).toBeInstanceOf(SVGSVGElement)
      vi.advanceTimersByTime(1000)
      flushSync()
      expect(document.querySelector(`.copy-checkmark`)).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  test(`a failed copy reaches on_copy_error and shows no checkmark`, async () => {
    const error = new Error(`denied`)
    write_text.mockRejectedValue(error)
    const on_copy_error = vi.fn()
    mount_tag({ label: `ID:`, value: `abc`, on_copy_error }).click()
    await vi.waitFor(() =>
      expect(on_copy_error).toHaveBeenCalledExactlyOnceWith(error, `abc`),
    )
    flushSync()
    expect(document.querySelector(`.copy-checkmark`)).toBeNull()
  })

  test(`custom onclick overrides copy`, () => {
    const onclick = vi.fn()
    const tag = mount_tag({ label: `Test`, value: undefined, copy_value: `id`, onclick })
    expect(tag.getAttribute(`role`)).toBe(`button`)
    tag.click()
    flushSync()
    expect(onclick).toHaveBeenCalledOnce()
    expect(write_text).not.toHaveBeenCalled()
  })

  test.each([
    { disabled: false, callback: true, expected: true },
    { disabled: true, callback: true, expected: false },
    { disabled: false, callback: false, expected: false },
  ])(
    `remove button visible=$expected when disabled=$disabled, callback=$callback`,
    ({ disabled, callback, expected }) => {
      const onclick = vi.fn()
      const on_remove = vi.fn()
      const props = {
        label: `Test`,
        value: 1,
        disabled,
        onclick,
        labels: { remove: `Drop` },
      }
      mount_tag({ ...props, on_remove: callback ? on_remove : undefined })
      const remove = document.querySelector<HTMLButtonElement>(
        `button[aria-label="Drop"]`,
      )
      expect(Boolean(remove)).toBe(expected)
      if (!remove) return
      for (const key of [`Enter`, ` `])
        remove.dispatchEvent(new KeyboardEvent(`keydown`, { key, bubbles: true }))
      expect(onclick).not.toHaveBeenCalled()
      remove.click()
      flushSync()
      expect(on_remove).toHaveBeenCalledExactlyOnceWith()
      expect(onclick).not.toHaveBeenCalled()
    },
  )
})
