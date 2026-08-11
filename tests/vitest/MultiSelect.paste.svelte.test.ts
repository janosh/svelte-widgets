import { tick } from 'svelte'
import { describe, expect, test, vi } from 'vite-plus/test'
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
    onadd: vi.fn(),
    oncreate: vi.fn(),
    onchange: vi.fn(),
    onmaxreached: vi.fn(),
    onduplicate: vi.fn(),
    onparsed_paste: vi.fn(),
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
  // No macrotask wait: sync-oncreate paste must complete synchronously. handle_paste
  // only awaits add() when an async oncreate suspends.
  await tick()
  return { ...spies, props, event }
}

describe(`parse_paste`, () => {
  test(`splits pasted text into multiple selected options`, async () => {
    const { onadd, event } = await paste_into(
      { options: [`alpha`, `beta`, `gamma`] },
      `alpha,beta`,
    )
    expect(event.defaultPrevented).toBe(true)
    expect(onadd).toHaveBeenCalledTimes(2)
    expect(onadd).toHaveBeenCalledWith(expect.objectContaining({ option: `alpha` }))
    expect(onadd).toHaveBeenCalledWith(expect.objectContaining({ option: `beta` }))
  })

  test(`fires oncreate for each created option with allowUserOptions`, async () => {
    const { oncreate, onadd } = await paste_into(
      {
        options: [`existing`],
        allowUserOptions: true,
        parse_paste: (text: string) => text.split(/[,\s]+/u).filter(Boolean),
      },
      `new1,new2,new3`,
    )
    expect(oncreate).toHaveBeenCalledTimes(3)
    expect(onadd).toHaveBeenCalledTimes(3)
  })

  test.each([
    [`without parse_paste`, { parse_paste: undefined }],
    [`parse_paste returns empty`, { parse_paste: () => [] }],
  ])(`%s: paste not intercepted`, async (_label, override) => {
    const { onadd, event } = await paste_into(
      { options: [`a`, `b`, `c`], ...override },
      `a,b`,
    )
    expect(onadd).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  test(`object options via allowUserOptions`, async () => {
    const { oncreate } = await paste_into(
      {
        options: [{ label: `existing` }],
        allowUserOptions: `append`,
        parse_paste: (text: string) => text.split(`,`).map((str) => str.trim()),
      },
      `foo,bar`,
    )
    expect(oncreate).toHaveBeenCalledTimes(2)
    expect(oncreate).toHaveBeenCalledWith({ option: { label: `foo` } })
    expect(oncreate).toHaveBeenCalledWith({ option: { label: `bar` } })
  })

  test(`object options preserve extra fields from parse_paste`, async () => {
    const { oncreate, props } = await paste_into(
      {
        options: [{ label: `existing`, value: 0 }],
        selected: [],
        allowUserOptions: `append`,
        parse_paste: (text: string) =>
          text.split(`,`).map((str, idx) => ({ label: str.trim(), value: idx + 1 })),
      },
      `alpha,beta`,
    )
    expect(oncreate).toHaveBeenCalledWith({ option: { label: `alpha`, value: 1 } })
    expect(oncreate).toHaveBeenCalledWith({ option: { label: `beta`, value: 2 } })
    expect(props.selected).toEqual([
      { label: `alpha`, value: 1 },
      { label: `beta`, value: 2 },
    ])
  })

  test(`clears searchText when maxSelect blocks some options`, async () => {
    const { props } = await paste_into(
      {
        options: [`a`, `b`, `c`, `d`],
        selected: [`a`, `b`],
        // non-empty so clearing is observable, else the assertion below is tautological
        searchText: `partial`,
        maxSelect: 3,
      },
      `c,d`,
    )
    expect(props.selected).toEqual([`a`, `b`, `c`])
    expect(props.searchText).toBe(``)
  })

  test.each([
    [`already at max`, [`a`, `b`], 2, `c`, 0, 1, `c`],
    [`exceeds max mid-paste`, [`a`, `b`], 3, `c,d,e`, 1, 1, `d`],
  ])(
    `maxSelect: %s`,
    async (
      _label,
      selected,
      maxSelect,
      paste_text,
      expected_adds,
      expected_max,
      attempted,
    ) => {
      const { onadd, onmaxreached } = await paste_into(
        { options: [`a`, `b`, `c`, `d`, `e`], selected, maxSelect },
        paste_text,
      )
      expect(onadd).toHaveBeenCalledTimes(expected_adds)
      expect(onmaxreached).toHaveBeenCalledTimes(expected_max)
      expect(onmaxreached).toHaveBeenCalledWith(
        expect.objectContaining({ maxSelect, attemptedOption: attempted }),
      )
    },
  )

  test.each([
    [`empty selection`, [], [`a`]],
    [`replaces existing`, [`x`], [`a`]],
  ])(
    `maxSelect=1 with %s: only first option selected`,
    async (_label, initial, expected) => {
      const { onadd, props } = await paste_into(
        { options: [`a`, `b`, `c`, `x`], selected: initial, maxSelect: 1 },
        `a,b,c`,
      )
      expect(onadd).toHaveBeenCalledTimes(1)
      expect(props.selected).toEqual(expected)
    },
  )

  test.each([
    [`preselected duplicate`, [`a`], `a,b,c`, 2, [`a`, `b`, `c`]],
    [`self-duplicate within paste`, [], `a,a,b`, 2, [`a`, `b`]],
  ])(
    `handles %s`,
    async (_label, initial, paste_text, expected_adds, expected_selected) => {
      const { onadd, onduplicate, props } = await paste_into(
        { options: [`a`, `b`, `c`, `d`], selected: initial },
        paste_text,
      )
      expect(onadd).toHaveBeenCalledTimes(expected_adds)
      expect(onduplicate).toHaveBeenCalledTimes(1)
      expect(onduplicate).toHaveBeenCalledWith(expect.objectContaining({ option: `a` }))
      expect(props.selected).toEqual(expected_selected)
    },
  )

  test(`mixed existing and new options with allowUserOptions`, async () => {
    const { onadd, oncreate, props } = await paste_into(
      { options: [`existing1`, `existing2`], selected: [], allowUserOptions: `append` },
      `existing1,brand_new,existing2`,
    )
    expect(onadd).toHaveBeenCalledTimes(3)
    expect(oncreate).toHaveBeenCalledTimes(1)
    expect(oncreate).toHaveBeenCalledWith({ option: `brand_new` })
    expect(props.selected).toEqual([`existing1`, `brand_new`, `existing2`])
  })

  test(`oncreate returning false during paste skips only rejected options`, async () => {
    const oncreate_spy = vi.fn(({ option }: { option: Option }) => {
      const label = typeof option === `object` ? option.label : option
      return `${label}`.length >= 3 ? undefined : false
    })
    const { onadd, props } = await paste_into(
      { options: [], selected: [], allowUserOptions: `append`, oncreate: oncreate_spy },
      `ab,valid,x,also_ok`,
    )
    expect(oncreate_spy).toHaveBeenCalledTimes(4)
    expect(onadd).toHaveBeenCalledTimes(2)
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
      desc: `added/overflow summary beyond maxSelect`,
      props: { options: [`a`, `b`, `c`, `d`, `e`], selected: [`a`], maxSelect: 3 },
      paste: `b,c,d,e`,
      expected: { added: [`b`, `c`], overflow: [`d`, `e`], raw_text: `b,c,d,e` },
    },
    {
      desc: `maxSelect=1 reports replaced option as added`,
      props: { options: [`a`, `b`, `c`], selected: [`a`], maxSelect: 1 },
      paste: `b,c`,
      expected: { added: [`b`], overflow: [`c`] },
      expected_selected: [`b`],
    },
    {
      desc: `reports rejected options from oncreate`,
      props: {
        options: [],
        selected: [],
        allowUserOptions: `append`,
        oncreate: ({ option }) =>
          `${typeof option === `object` ? option.label : option}`.length >= 3
            ? undefined
            : false,
      },
      paste: `ab,valid,x`,
      expected: { added: [`valid`], rejected: [`ab`, `x`], overflow: [] },
    },
  ])(`onparsed_paste $desc`, async ({ props, paste, expected, expected_selected }) => {
    const { onparsed_paste, props: bound } = await paste_into(props, paste)
    expect(onparsed_paste).toHaveBeenCalledTimes(1)
    expect(onparsed_paste.mock.calls[0][0]).toEqual(expect.objectContaining(expected))
    if (expected_selected) expect(bound.selected).toEqual(expected_selected)
  })
})
