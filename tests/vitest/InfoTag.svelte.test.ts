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
  // the clickable part: Tag's content element, a <button> when it has an action
  const mount_tag = (props: ComponentProps<typeof InfoTag>): HTMLElement => {
    render(InfoTag, props)
    return doc_query(`.tag.info-tag > .content`)
  }

  test(`renders trusted HTML labels and hover details while retaining click actions`, async () => {
    const onclick = vi.fn()
    const tag = mount_tag({
      label: `E<sub>hull</sub>:`,
      value: 42,
      title: `<b>Energy</b>`,
      onclick,
    })
    expect(tag.tagName).toBe(`BUTTON`)
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

  // Tag props pass straight through; disabled disables the native button, blocking clicks
  test.each([
    [`defaults`, {}, [`soft`]],
    [
      `Tag props and spread attrs`,
      { variant: `solid`, color: `red`, class: `extra`, style: `margin: 3px` },
      [`solid`, `extra`],
    ],
    [`disabled`, { disabled: true }, [`soft`, `disabled`]],
  ] as const)(`%s`, (_name, props, classes) => {
    const onclick = vi.fn()
    const tag = mount_tag({ label: `Test`, value: 1, onclick, ...props })
    const pill = doc_query(`.tag.info-tag`)
    for (const cls of classes) expect(pill.classList.contains(cls)).toBe(true)
    expect(pill.style.margin).toBe(`style` in props ? `3px` : ``)
    expect(pill.style.getPropertyValue(`--tag-color`)).toBe(`color` in props ? `red` : ``)
    expect((tag as HTMLButtonElement).disabled).toBe(`disabled` in props)
    tag.click()
    flushSync()
    expect(onclick).toHaveBeenCalledTimes(`disabled` in props ? 0 : 1)
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
      expect(tag.tagName).toBe(copied ? `BUTTON` : `SPAN`)
      tag.click()
      flushSync()
      expect(write_text.mock.calls).toEqual(copied ? [[copied]] : [])
    },
  )

  // a title-only tag has no button, so it must take focus itself (as a role=button, which makes
  // its aria-expanded valid) to open its popover
  test.each([
    [{ title: `<b>Details</b>` }, `SPAN`, `0`, `button`],
    [{ title: `<b>Details</b>`, copy_value: `id` }, `BUTTON`, null, null],
    [{}, `SPAN`, null, null],
  ])(
    `props=%j renders a %s with tabindex %j, role %j`,
    async (props, tag_name, tabindex, role) => {
      const tag = mount_tag({ label: `Note`, value: undefined, ...props })
      expect([
        tag.tagName,
        tag.getAttribute(`tabindex`),
        tag.getAttribute(`role`),
      ]).toEqual([tag_name, tabindex, role])
      if (!(`title` in props)) return
      tag.dispatchEvent(new FocusEvent(`focusin`, { bubbles: true }))
      await vi.waitFor(() =>
        expect(document.querySelector(`.popover b`)?.textContent).toBe(`Details`),
      )
    },
  )

  // copy and remove are sibling native buttons inside a non-interactive pill
  test(`copy and remove are sibling buttons, not nested in a role=button`, () => {
    const copy_button = mount_tag({ label: `ID:`, value: `abc`, on_remove: vi.fn() })
    const pill = doc_query(`.tag.info-tag`)
    const remove = doc_query(`.tag.info-tag > button.remove`)
    expect([
      copy_button.tagName,
      copy_button.parentElement,
      remove.parentElement,
    ]).toEqual([`BUTTON`, pill, pill])
    expect(copy_button.contains(remove)).toBe(false)
    expect(document.querySelector(`[role="button"]`)).toBeNull()
  })

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
    expect(tag.tagName).toBe(`BUTTON`)
    tag.click()
    flushSync()
    expect(onclick).toHaveBeenCalledOnce()
    expect(write_text).not.toHaveBeenCalled()
  })

  // the remove button is Tag's, a sibling of the clickable content rather than nested in it
  test.each([
    { disabled: false, callback: true, expected: true },
    { disabled: true, callback: true, expected: true },
    { disabled: false, callback: false, expected: false },
  ])(
    `remove button present=$expected when disabled=$disabled, callback=$callback`,
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
      expect(remove.disabled).toBe(disabled)
      expect(remove.closest(`.content`)).toBeNull()
      remove.click()
      flushSync()
      expect(on_remove).toHaveBeenCalledTimes(disabled ? 0 : 1)
      expect(onclick).not.toHaveBeenCalled()
    },
  )
})
