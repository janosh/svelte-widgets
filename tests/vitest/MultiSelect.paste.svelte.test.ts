import { tick } from 'svelte'
import { describe, expect, test, vi } from 'vitest'
import type { Option } from '$lib'
import type { MultiSelectProps } from '$lib/types'
import { get_input, mount_multiselect, type_search_text } from './MultiSelect.test-utils'

function make_paste_event(text: string): ClipboardEvent {
  const data_transfer = new DataTransfer()
  data_transfer.setData(`text/plain`, text)
  const event = new ClipboardEvent(`paste`, { bubbles: true, cancelable: true })
  Object.assign(event, { clipboardData: data_transfer })
  return event
}

async function paste_into(extra_props: MultiSelectProps, paste_text: string) {
  const spies = {
    on_add: vi.fn(),
    on_create: vi.fn(),
    on_change: vi.fn(),
    on_max_reached: vi.fn(),
    on_duplicate: vi.fn(),
    on_parsed_paste: vi.fn(),
    onpaste: vi.fn((event: ClipboardEvent) => event.currentTarget),
  }
  const props = $state<MultiSelectProps>({
    parse_paste: (text: string) => text.split(`,`),
    ...spies,
    ...extra_props,
  })
  mount_multiselect(props)
  const event = make_paste_event(paste_text)
  get_input().dispatchEvent(event)
  // no macrotask wait: handle_paste only awaits add() when an async on_create suspends
  await tick()
  return { ...spies, props, event }
}

describe(`parse_paste`, () => {
  test(`splits pasted text into multiple selected options`, async () => {
    const { on_add, onpaste, event } = await paste_into(
      { options: [`alpha`, `beta`, `gamma`] },
      `alpha,beta`,
    )
    expect(event.defaultPrevented).toBe(true)
    expect(on_add.mock.calls.map(([{ option }]) => option)).toEqual([`alpha`, `beta`])
    expect(onpaste).toHaveBeenCalledExactlyOnceWith(event)
    expect(onpaste).toHaveReturnedWith(get_input())
  })

  test(`input display keeps a draft typed while pasted creation is pending`, async () => {
    const creation = Promise.withResolvers<undefined>()
    const completed = Promise.withResolvers<undefined>()
    const { props } = await paste_into(
      {
        options: [],
        value: null,
        mode: `single`,
        selected_display: `input`,
        allow_user_options: `append`,
        on_create: () => creation.promise,
        on_parsed_paste: () => completed.resolve(undefined),
      },
      `alpha`,
    )
    await type_search_text(`typed later`)
    creation.resolve(undefined)
    await completed.promise
    // the visible text is the selection, so the newer draft wins and nothing is selected
    expect(props.value).toBeNull()
    expect(get_input().value).toBe(`typed later`)
  })

  test(`native paste runs during dispatch while parsed paste waits for async creation`, async () => {
    const creation = Promise.withResolvers<undefined>()
    const completed = Promise.withResolvers<undefined>()
    const on_parsed_paste = vi.fn(() => completed.resolve(undefined))
    const { onpaste, props, event } = await paste_into(
      {
        options: [],
        value: [],
        allow_user_options: `append`,
        on_create: () => creation.promise,
        on_parsed_paste,
      },
      `alpha,beta`,
    )

    expect(event.defaultPrevented).toBe(true)
    expect(onpaste).toHaveBeenCalledExactlyOnceWith(event)
    expect(onpaste).toHaveReturnedWith(get_input())
    expect(on_parsed_paste).not.toHaveBeenCalled()
    expect(props.value).toEqual([])
    await type_search_text(`typed later`)

    creation.resolve(undefined)
    await completed.promise
    expect(props.value).toEqual([`alpha`, `beta`])
    // typed while creation was pending, so neither add nor paste may clear it
    expect(get_input().value).toBe(`typed later`)
    expect(on_parsed_paste).toHaveBeenCalledExactlyOnceWith({
      added: [`alpha`, `beta`],
      rejected: [],
      overflow: [],
      raw_text: `alpha,beta`,
    })
    expect(onpaste).toHaveBeenCalledOnce()
  })

  // an empty parsed entry makes `add` throw; that throw used to reject handle_paste, so
  // the loop stopped, later entries vanished and on_parsed_paste never fired
  test.each([`alpha,beta,`, `alpha,,beta`])(
    `an empty parsed entry is rejected without aborting the paste (%j)`,
    async (paste_text) => {
      const { on_add, on_parsed_paste } = await paste_into(
        { options: [`alpha`, `beta`] },
        paste_text,
      )
      expect(on_add).toHaveBeenCalledTimes(2)
      expect(on_parsed_paste).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ added: [`alpha`, `beta`], rejected: [``] }),
      )
    },
  )

  test.each([
    [`without parse_paste`, { parse_paste: undefined }],
    [`parse_paste returns empty`, { parse_paste: () => [] }],
  ])(`%s: paste not intercepted`, async (_label, override) => {
    const { on_add, onpaste, event } = await paste_into(
      { options: [`a`, `b`, `c`], ...override },
      `a,b`,
    )
    expect(on_add).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    expect(onpaste).toHaveBeenCalledExactlyOnceWith(event)
    expect(onpaste).toHaveReturnedWith(get_input())
  })

  test(`object options via allow_user_options`, async () => {
    const { on_create } = await paste_into(
      {
        options: [{ label: `existing` }],
        allow_user_options: `append`,
        parse_paste: (text: string) => text.split(`,`).map((str) => str.trim()),
      },
      `foo,bar`,
    )
    expect(on_create).toHaveBeenCalledTimes(2)
    expect(on_create).toHaveBeenCalledWith({ option: { label: `foo` } })
    expect(on_create).toHaveBeenCalledWith({ option: { label: `bar` } })
  })

  test(`object options preserve extra fields from parse_paste`, async () => {
    const { on_create, props } = await paste_into(
      {
        options: [{ label: `existing`, value: 0 }],
        value: [],
        allow_user_options: `append`,
        parse_paste: (text: string) =>
          text.split(`,`).map((str, idx) => ({ label: str.trim(), value: idx + 1 })),
      },
      `alpha,beta`,
    )
    expect(on_create).toHaveBeenCalledWith({ option: { label: `alpha`, value: 1 } })
    expect(on_create).toHaveBeenCalledWith({ option: { label: `beta`, value: 2 } })
    expect(props.value).toEqual([
      { label: `alpha`, value: 1 },
      { label: `beta`, value: 2 },
    ])
  })

  test(`clears search_text when max_select blocks some options`, async () => {
    const { props } = await paste_into(
      {
        options: [`a`, `b`, `c`, `d`],
        value: [`a`, `b`],
        // non-empty so clearing is observable, else the assertion below is tautological
        search_text: `partial`,
        max_select: 3,
      },
      `c,d`,
    )
    expect(props.value).toEqual([`a`, `b`, `c`])
    expect(props.search_text).toBe(``)
  })

  test.each([
    [`already at max`, [`a`, `b`], 2, `c`, 0, 1, `c`],
    [`exceeds max mid-paste`, [`a`, `b`], 3, `c,d,e`, 1, 1, `d`],
  ])(
    `max_select: %s`,
    async (
      _label,
      selected,
      max_select,
      paste_text,
      expected_adds,
      expected_max,
      attempted,
    ) => {
      const { on_add, on_max_reached } = await paste_into(
        { options: [`a`, `b`, `c`, `d`, `e`], value: selected, max_select },
        paste_text,
      )
      expect(on_add).toHaveBeenCalledTimes(expected_adds)
      expect(on_max_reached).toHaveBeenCalledTimes(expected_max)
      expect(on_max_reached).toHaveBeenCalledWith(
        expect.objectContaining({ max_select, attempted_option: attempted }),
      )
    },
  )

  test.each([`single`, `multiple`] as const)(
    `paste respects %s mode when one item is already selected`,
    async (mode) => {
      const selection: MultiSelectProps =
        mode === `single` ? { mode, value: `a` } : { mode, value: [`a`], max_select: 1 }
      const { props, on_add, on_max_reached, on_parsed_paste } = await paste_into(
        { options: [`a`, `b`, `c`], ...selection },
        `b,c`,
      )
      expect(props.value).toEqual(mode === `single` ? `b` : [`a`])
      expect(on_add).toHaveBeenCalledTimes(mode === `single` ? 1 : 0)
      expect(on_max_reached).toHaveBeenCalledTimes(mode === `single` ? 0 : 1)
      expect(on_parsed_paste).toHaveBeenCalledWith({
        added: mode === `single` ? [`b`] : [],
        rejected: [],
        overflow: mode === `single` ? [`c`] : [`b`, `c`],
        raw_text: `b,c`,
      })
    },
  )

  test.each([
    [`preselected duplicate`, [`a`], `a,b,c`, 2, [`a`, `b`, `c`]],
    [`self-duplicate within paste`, [], `a,a,b`, 2, [`a`, `b`]],
  ])(
    `handles %s`,
    async (_label, initial, paste_text, expected_adds, expected_selected) => {
      const { on_add, on_duplicate, props } = await paste_into(
        { options: [`a`, `b`, `c`, `d`], value: initial },
        paste_text,
      )
      expect(on_add).toHaveBeenCalledTimes(expected_adds)
      expect(on_duplicate).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ option: `a` }),
      )
      expect(props.value).toEqual(expected_selected)
    },
  )

  test(`mixed existing and new options with allow_user_options`, async () => {
    const { on_add, on_create, props } = await paste_into(
      { options: [`existing1`, `existing2`], value: [], allow_user_options: `append` },
      `existing1,brand_new,existing2`,
    )
    expect(on_add).toHaveBeenCalledTimes(3)
    expect(on_create).toHaveBeenCalledExactlyOnceWith({ option: `brand_new` })
    expect(props.value).toEqual([`existing1`, `brand_new`, `existing2`])
  })

  test(`on_create returning false during paste skips only rejected options`, async () => {
    const oncreate_spy = vi.fn(({ option }: { option: Option }) => {
      const label = typeof option === `object` ? option.label : option
      return `${label}`.length >= 3 ? undefined : false
    })
    const { on_add, on_parsed_paste, props } = await paste_into(
      {
        options: [],
        value: [],
        allow_user_options: `append`,
        on_create: oncreate_spy,
      },
      `ab,valid,x,also_ok`,
    )
    expect(oncreate_spy).toHaveBeenCalledTimes(4)
    expect(on_add).toHaveBeenCalledTimes(2)
    expect(props.value).toEqual([`valid`, `also_ok`])
    expect(on_parsed_paste).toHaveBeenCalledWith(
      expect.objectContaining({ added: [`valid`, `also_ok`], rejected: [`ab`, `x`] }),
    )
  })

  test(`on_parsed_paste summarizes added and overflow options beyond max_select`, async () => {
    const { on_parsed_paste } = await paste_into(
      { options: [`a`, `b`, `c`, `d`, `e`], value: [`a`], max_select: 3 },
      `b,c,d,e`,
    )
    expect(on_parsed_paste).toHaveBeenCalledExactlyOnceWith({
      added: [`b`, `c`],
      rejected: [],
      overflow: [`d`, `e`],
      raw_text: `b,c,d,e`,
    })
  })
})
