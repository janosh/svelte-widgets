import { tick } from 'svelte'
import { describe, expect, test, vi } from 'vitest'
import type { Option } from '$lib'
import type { MultiSelectProps } from '$lib/types'
import { get_input, mount_multiselect } from './MultiSelect.test-utils'

function make_paste_event(text: string): ClipboardEvent {
  const data_transfer = new DataTransfer()
  data_transfer.setData(`text/plain`, text)
  const event = new ClipboardEvent(`paste`, { bubbles: true, cancelable: true })
  Object.assign(event, { clipboardData: data_transfer })
  return event
}

async function paste_into(extra_props: Partial<MultiSelectProps>, paste_text: string) {
  const spies = {
    on_add: vi.fn(),
    on_create: vi.fn(),
    on_change: vi.fn(),
    on_max_reached: vi.fn(),
    on_duplicate: vi.fn(),
    on_parsed_paste: vi.fn(),
  }
  const props = $state<MultiSelectProps>({
    parse_paste: (text: string) => text.split(`,`),
    ...spies,
    ...extra_props,
  })
  mount_multiselect(props)
  const input = get_input()
  const event = make_paste_event(paste_text)
  input.dispatchEvent(event)
  // no macrotask wait: handle_paste only awaits add() when an async on_create suspends
  await tick()
  return { ...spies, props, event }
}

describe(`parse_paste`, () => {
  test(`splits pasted text into multiple selected options`, async () => {
    const { on_add, event } = await paste_into(
      { options: [`alpha`, `beta`, `gamma`] },
      `alpha,beta`,
    )
    expect(event.defaultPrevented).toBe(true)
    expect(on_add).toHaveBeenCalledTimes(2)
    expect(on_add).toHaveBeenCalledWith(expect.objectContaining({ option: `alpha` }))
    expect(on_add).toHaveBeenCalledWith(expect.objectContaining({ option: `beta` }))
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
      expect(on_parsed_paste).toHaveBeenCalledTimes(1)
      expect(on_parsed_paste).toHaveBeenCalledWith(
        expect.objectContaining({ added: [`alpha`, `beta`], rejected: [``] }),
      )
    },
  )

  test(`fires on_create for each created option with allow_user_options`, async () => {
    const { on_create, on_add } = await paste_into(
      {
        options: [`existing`],
        allow_user_options: true,
        parse_paste: (text: string) => text.split(/[,\s]+/u).filter(Boolean),
      },
      `new1,new2,new3`,
    )
    expect(on_create).toHaveBeenCalledTimes(3)
    expect(on_add).toHaveBeenCalledTimes(3)
  })

  test.each([
    [`without parse_paste`, { parse_paste: undefined }],
    [`parse_paste returns empty`, { parse_paste: () => [] }],
  ])(`%s: paste not intercepted`, async (_label, override) => {
    const { on_add, event } = await paste_into(
      { options: [`a`, `b`, `c`], ...override },
      `a,b`,
    )
    expect(on_add).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
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
        selected: [],
        allow_user_options: `append`,
        parse_paste: (text: string) =>
          text.split(`,`).map((str, idx) => ({ label: str.trim(), value: idx + 1 })),
      },
      `alpha,beta`,
    )
    expect(on_create).toHaveBeenCalledWith({ option: { label: `alpha`, value: 1 } })
    expect(on_create).toHaveBeenCalledWith({ option: { label: `beta`, value: 2 } })
    expect(props.selected).toEqual([
      { label: `alpha`, value: 1 },
      { label: `beta`, value: 2 },
    ])
  })

  test(`clears search_text when max_select blocks some options`, async () => {
    const { props } = await paste_into(
      {
        options: [`a`, `b`, `c`, `d`],
        selected: [`a`, `b`],
        // non-empty so clearing is observable, else the assertion below is tautological
        search_text: `partial`,
        max_select: 3,
      },
      `c,d`,
    )
    expect(props.selected).toEqual([`a`, `b`, `c`])
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
        { options: [`a`, `b`, `c`, `d`, `e`], selected, max_select },
        paste_text,
      )
      expect(on_add).toHaveBeenCalledTimes(expected_adds)
      expect(on_max_reached).toHaveBeenCalledTimes(expected_max)
      expect(on_max_reached).toHaveBeenCalledWith(
        expect.objectContaining({ max_select, attempted_option: attempted }),
      )
    },
  )

  test.each([
    [`empty selection`, [], [`a`]],
    [`replaces existing`, [`x`], [`a`]],
  ])(
    `max_select=1 with %s: only first option selected`,
    async (_label, initial, expected) => {
      const { on_add, props } = await paste_into(
        { options: [`a`, `b`, `c`, `x`], selected: initial, max_select: 1 },
        `a,b,c`,
      )
      expect(on_add).toHaveBeenCalledTimes(1)
      expect(props.selected).toEqual(expected)
    },
  )

  test.each([
    [`preselected duplicate`, [`a`], `a,b,c`, 2, [`a`, `b`, `c`]],
    [`self-duplicate within paste`, [], `a,a,b`, 2, [`a`, `b`]],
  ])(
    `handles %s`,
    async (_label, initial, paste_text, expected_adds, expected_selected) => {
      const { on_add, on_duplicate, props } = await paste_into(
        { options: [`a`, `b`, `c`, `d`], selected: initial },
        paste_text,
      )
      expect(on_add).toHaveBeenCalledTimes(expected_adds)
      expect(on_duplicate).toHaveBeenCalledTimes(1)
      expect(on_duplicate).toHaveBeenCalledWith(expect.objectContaining({ option: `a` }))
      expect(props.selected).toEqual(expected_selected)
    },
  )

  test(`mixed existing and new options with allow_user_options`, async () => {
    const { on_add, on_create, props } = await paste_into(
      { options: [`existing1`, `existing2`], selected: [], allow_user_options: `append` },
      `existing1,brand_new,existing2`,
    )
    expect(on_add).toHaveBeenCalledTimes(3)
    expect(on_create).toHaveBeenCalledTimes(1)
    expect(on_create).toHaveBeenCalledWith({ option: `brand_new` })
    expect(props.selected).toEqual([`existing1`, `brand_new`, `existing2`])
  })

  test(`on_create returning false during paste skips only rejected options`, async () => {
    const oncreate_spy = vi.fn(({ option }: { option: Option }) => {
      const label = typeof option === `object` ? option.label : option
      return `${label}`.length >= 3 ? undefined : false
    })
    const { on_add, props } = await paste_into(
      {
        options: [],
        selected: [],
        allow_user_options: `append`,
        on_create: oncreate_spy,
      },
      `ab,valid,x,also_ok`,
    )
    expect(oncreate_spy).toHaveBeenCalledTimes(4)
    expect(on_add).toHaveBeenCalledTimes(2)
    expect(props.selected).toEqual([`valid`, `also_ok`])
  })

  test.each<{
    desc: string
    props: Partial<MultiSelectProps>
    paste: string
    expected: Record<string, unknown>
    expected_selected?: Option[]
  }>([
    {
      desc: `added/overflow summary beyond max_select`,
      props: { options: [`a`, `b`, `c`, `d`, `e`], selected: [`a`], max_select: 3 },
      paste: `b,c,d,e`,
      expected: { added: [`b`, `c`], overflow: [`d`, `e`], raw_text: `b,c,d,e` },
    },
    {
      desc: `max_select=1 reports replaced option as added`,
      props: { options: [`a`, `b`, `c`], selected: [`a`], max_select: 1 },
      paste: `b,c`,
      expected: { added: [`b`], overflow: [`c`] },
      expected_selected: [`b`],
    },
    {
      desc: `reports rejected options from on_create`,
      props: {
        options: [],
        selected: [],
        allow_user_options: `append`,
        on_create: ({ option }) =>
          `${typeof option === `object` ? option.label : option}`.length >= 3
            ? undefined
            : false,
      },
      paste: `ab,valid,x`,
      expected: { added: [`valid`], rejected: [`ab`, `x`], overflow: [] },
    },
  ])(`on_parsed_paste $desc`, async ({ props, paste, expected, expected_selected }) => {
    const { on_parsed_paste, props: bound } = await paste_into(props, paste)
    expect(on_parsed_paste).toHaveBeenCalledTimes(1)
    expect(on_parsed_paste.mock.calls[0][0]).toEqual(expect.objectContaining(expected))
    if (expected_selected) expect(bound.selected).toEqual(expected_selected)
  })
})
