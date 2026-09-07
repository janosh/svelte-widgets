import CodeWalkthrough from '$lib/CodeWalkthrough.svelte'
import CopyButton from '$lib/CopyButton.svelte'
import {
  validate_walkthrough,
  walkthrough_lines,
  type WalkthroughStep,
} from '$lib/code-walkthrough'
import { createRawSnippet, mount, tick } from 'svelte'
import { SvelteMap } from 'svelte/reactivity'
import { expect, test, vi } from 'vitest'
import { doc_query } from './index'

const steps: WalkthroughStep[] = [
  {
    id: `initial`,
    title: `Start`,
    description: `Declare a value`,
    code: `let count = 0`,
    focus_lines: [1],
    annotations: { 1: `Initial count` },
  },
  {
    id: `increment`,
    title: `Increment`,
    description: `Update it`,
    before: `let count = 0`,
    code: `let count = 0\ncount += 1`,
    focus_lines: [2],
    annotations: { 2: `Add one` },
  },
  { id: `show`, title: `Display`, code: `<p>{count}</p>` },
]

test(`walkthrough has roving keyboard navigation, annotations, diffs and a live preview`, async () => {
  const write_text = vi.spyOn(navigator.clipboard, `writeText`).mockResolvedValue()
  const onstep = vi.fn()
  let preview_step = () => steps[0]
  const preview = createRawSnippet<[WalkthroughStep]>((get_step) => {
    preview_step = get_step
    return { render: () => `<output>${get_step().title}</output>` }
  })
  mount(CodeWalkthrough, { target: document.body, props: { steps, onstep, preview } })
  await tick()
  const tabs = [...document.querySelectorAll<HTMLButtonElement>(`[role=tab]`)]
  expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1])
  expect(doc_query(`.focused .annotation`).textContent).toBe(`Initial count`)
  const panel = doc_query(`[role=tabpanel]`)
  expect(panel.getAttribute(`aria-labelledby`)).toBe(tabs[0].id)
  tabs[0].focus()
  tabs[0].dispatchEvent(
    new KeyboardEvent(`keydown`, { key: `ArrowDown`, bubbles: true, cancelable: true }),
  )
  await tick()
  expect(document.activeElement).toBe(tabs[1])
  expect(tabs.map((tab) => tab.getAttribute(`aria-selected`))).toEqual([
    `false`,
    `true`,
    `false`,
  ])
  expect(doc_query(`.added .text`).textContent).toBe(`count += 1`)
  expect(doc_query(`.added [role=img]`).getAttribute(`aria-label`)).toBe(`Added`)
  expect(doc_query(`.focused .annotation`).textContent).toBe(`Add one`)
  mount(CopyButton, { target: document.body, props: { global: true } })
  await tick()
  expect(document.querySelectorAll(`[data-sms-copy]`)).toHaveLength(1)
  doc_query<HTMLButtonElement>(`[data-sms-copy]`).click()
  await tick()
  expect(write_text).toHaveBeenCalledExactlyOnceWith(steps[1].code)
  expect(preview_step()).toBe(steps[1])
  expect(onstep).toHaveBeenLastCalledWith(steps[1], 1)
  tabs[1].dispatchEvent(new KeyboardEvent(`keydown`, { key: `End`, bubbles: true }))
  await tick()
  expect(document.activeElement).toBe(tabs[2])
  expect(
    [...document.querySelectorAll<HTMLButtonElement>(`footer button`)].map(
      (button) => button.disabled,
    ),
  ).toEqual([false, true])
  expect(doc_query(`.text`).textContent).toBe(`<p>{count}</p>`)
  tabs[2].dispatchEvent(new KeyboardEvent(`keydown`, { key: `ArrowDown`, bubbles: true }))
  await tick()
  expect(document.activeElement).toBe(tabs[0])
  expect(
    [...document.querySelectorAll<HTMLButtonElement>(`footer button`)].map(
      (button) => button.disabled,
    ),
  ).toEqual([true, false])
})

test(`buttons never submit forms and respect canceled/composing keys`, async () => {
  mount(CodeWalkthrough, {
    target: document.body,
    props: {
      steps,
      labels: {
        next: `Weiter`,
        progress: (current: number, total: number) => `${current}/${total}`,
      },
    },
  })
  const tab = doc_query<HTMLButtonElement>(`[role=tab]`)
  const canceled = new KeyboardEvent(`keydown`, {
    key: `End`,
    cancelable: true,
    bubbles: true,
  })
  canceled.preventDefault()
  tab.dispatchEvent(canceled)
  for (const modifier of [`isComposing`, `altKey`, `ctrlKey`, `metaKey`, `shiftKey`]) {
    tab.dispatchEvent(
      new KeyboardEvent(`keydown`, { key: `End`, bubbles: true, [modifier]: true }),
    )
  }
  await tick()
  expect(tab.getAttribute(`aria-selected`)).toBe(`true`)
  expect(
    [...document.querySelectorAll(`button`)].every((button) => button.type === `button`),
  ).toBe(true)
  doc_query<HTMLButtonElement>(`footer button:last-child`).click()
  await tick()
  expect(doc_query(`[aria-live]`).textContent).toBe(`2/3`)
  expect(doc_query(`footer button:last-child`).textContent).toBe(`Weiter`)
  const selected = doc_query<HTMLButtonElement>(`[aria-selected=true]`)
  selected.dispatchEvent(new KeyboardEvent(`keydown`, { key: `Home`, bubbles: true }))
  await tick()
  expect(document.activeElement).toBe(tab)
  tab.dispatchEvent(new KeyboardEvent(`keydown`, { key: `ArrowUp`, bubbles: true }))
  await tick()
  expect(doc_query(`[aria-selected=true]`).textContent).toContain(`Display`)
})

test(`bound selection and keyboard focus follow step IDs after reordering`, async () => {
  const state = new SvelteMap([[`steps`, steps]])
  const selection = new SvelteMap([[`active`, `increment`]])
  const onstep = vi.fn()
  mount(CodeWalkthrough, {
    target: document.body,
    props: {
      get steps() {
        return state.get(`steps`) ?? []
      },
      get active_id() {
        return selection.get(`active`)
      },
      set active_id(value) {
        selection.set(`active`, value ?? ``)
      },
      onstep,
    },
  })
  await tick()
  state.set(`steps`, [steps[2], steps[1], steps[0]])
  await tick()
  const selected = doc_query<HTMLButtonElement>(`[aria-selected=true]`)
  expect(selected.textContent).toContain(`Increment`)
  selected.focus()
  selected.dispatchEvent(
    new KeyboardEvent(`keydown`, { key: `ArrowDown`, bubbles: true }),
  )
  await tick()
  expect(selection.get(`active`)).toBe(`initial`)
  expect(document.activeElement?.textContent).toContain(`Start`)
  expect(onstep).toHaveBeenLastCalledWith(steps[0], 2)
  selection.set(`active`, `show`)
  await tick()
  expect(doc_query(`[aria-selected=true]`).textContent).toContain(`Display`)
  expect(doc_query(`.text`).textContent).toBe(`<p>{count}</p>`)
})

test(`selection does not rescan source in inactive steps`, async () => {
  const read_source = vi.fn(() => `const value = 1\n`.repeat(10_000))
  mount(CodeWalkthrough, {
    target: document.body,
    props: {
      steps: [
        {
          ...steps[0],
          get code() {
            return read_source()
          },
        },
        ...steps.slice(1),
      ],
      active_id: `increment`,
    },
  })
  await tick()
  read_source.mockClear()
  doc_query<HTMLButtonElement>(`footer button:last-child`).click()
  await tick()
  expect(doc_query(`.text`).textContent).toBe(`<p>{count}</p>`)
  expect(read_source).not.toHaveBeenCalled()
})

test.each([
  [`same\nend`, `same\nend`],
  [`one\nold\nend`, `one\nnew\nextra\nend`],
  [``, `first`],
  [`first`, ``],
  [`start\nend\n`, `start\ninsert\nend\n`],
])(`diff reconstructs before=%j and after=%j exactly`, (before, code) => {
  const lines = walkthrough_lines({ id: `diff`, title: `Diff`, before, code })
  expect(
    lines
      .filter(({ kind }) => kind !== `added`)
      .map(({ text }) => text)
      .join(`\n`),
  ).toBe(before)
  expect(
    lines
      .filter(({ kind }) => kind !== `removed`)
      .map(({ text }) => text)
      .join(`\n`),
  ).toBe(code)
})

test.each(
  [
    [],
    [{ ...steps[0], id: `` }],
    [steps[0], steps[0]],
    [{ ...steps[0], focus_lines: [0] }],
    [{ ...steps[0], focus_lines: [1.5] }],
    [{ ...steps[0], annotations: { 2: `Missing` } }],
  ].map((invalid) => ({ invalid })),
)(`rejects invalid walkthrough input $invalid`, ({ invalid }) => {
  expect(() => validate_walkthrough(invalid)).toThrow(`CodeWalkthrough`)
})
