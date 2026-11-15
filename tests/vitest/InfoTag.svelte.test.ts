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

  test(`renders trusted HTML labels and hover details, a custom onclick replacing copy`, async () => {
    const onclick = vi.fn()
    const tag = mount_tag({
      label: `E<sub>hull</sub>:`,
      value: 42,
      copy_value: `id`,
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
    flushSync()
    expect(onclick).toHaveBeenCalledOnce()
    expect(write_text).not.toHaveBeenCalled()
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

  // a tag is a copy button only when it has something to copy; an HTML value copies as the
  // text it renders, an explicit copy_value verbatim
  test.each([
    [undefined, undefined, undefined, ``],
    [`mp-1234`, undefined, `mp-1234`, `mp-1234`],
    [123.456, undefined, `123.456`, `123.456`],
    [`abc123`, `full-id-abc123`, `full-id-abc123`, `abc123`],
    [`Fe<sub>2</sub>O<sub>3</sub> &amp; co`, undefined, `Fe2O3 & co`, `Fe2O3 & co`],
    [`Fe<sub>2</sub>`, `<b>raw</b>`, `<b>raw</b>`, `Fe2`],
    [undefined, `full-id-abc123`, `full-id-abc123`, ``],
  ] as const)(
    `value=%j, copy_value=%j copies %j and shows %j`,
    (value, copy_value, copied, text) => {
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

  // a copy flashes the checkmark for 1s; a failed one reaches on_copy_error instead
  test.each([undefined, new Error(`denied`)])(`copy error=%s`, async (error) => {
    vi.useFakeTimers()
    try {
      if (error) write_text.mockRejectedValue(error)
      const on_copy_error = vi.fn()
      mount_tag({ label: `ID:`, value: `abc`, on_copy_error }).click()
      await vi.advanceTimersByTimeAsync(0)
      flushSync()
      const checkmark = () => document.querySelector(`.copy-checkmark`)
      expect(on_copy_error.mock.calls).toEqual(error ? [[error, `abc`]] : [])
      expect(checkmark() instanceof SVGSVGElement).toBe(!error)
      vi.advanceTimersByTime(1000)
      flushSync()
      expect(checkmark()).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  // the remove button is Tag's: a native button beside the clickable content, never nested in
  // it or in a role=button
  test.each([
    { disabled: false, callback: true, expected: true },
    { disabled: true, callback: true, expected: true },
    { disabled: false, callback: false, expected: false },
  ])(
    `remove button present=$expected when disabled=$disabled, callback=$callback`,
    ({ disabled, callback, expected }) => {
      const onclick = vi.fn()
      const on_remove = vi.fn()
      const tag = mount_tag({
        label: `Test`,
        value: 1,
        disabled,
        onclick,
        labels: { remove: `Drop` },
        on_remove: callback ? on_remove : undefined,
      })
      const remove = document.querySelector<HTMLButtonElement>(
        `.tag.info-tag > button[aria-label="Drop"]`,
      )
      expect(Boolean(remove)).toBe(expected)
      if (!remove) return
      expect([tag.tagName, remove.disabled, tag.contains(remove)]).toEqual([
        `BUTTON`,
        disabled,
        false,
      ])
      expect(document.querySelector(`[role="button"]`)).toBeNull()
      remove.click()
      flushSync()
      expect(on_remove).toHaveBeenCalledTimes(disabled ? 0 : 1)
      expect(onclick).not.toHaveBeenCalled()
    },
  )
})
