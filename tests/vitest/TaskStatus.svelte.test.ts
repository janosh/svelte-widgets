import { TaskStatus } from '$lib'
import {
  createRawSnippet,
  flushSync,
  mount,
  tick,
  unmount,
  type ComponentProps,
} from 'svelte'
import { expect, onTestFinished, test, vi } from 'vitest'
import { doc_query } from './index'

type Props = ComponentProps<typeof TaskStatus>
const render = (props: Props) => {
  const component = mount(TaskStatus, { target: document.body, props })
  onTestFinished(() => unmount(component))
  flushSync()
  return doc_query(`.task-status`)
}
const button_texts = (root: Element) =>
  [...root.querySelectorAll(`button`)].map((button) => button.textContent)

test.each([
  [`idle`, false, []],
  [`running`, true, [`Cancel`]],
  [`success`, false, []],
  [`error`, false, [`Retry`]],
  [`cancelled`, false, [`Retry`]],
] as const)(`state=%s: progress=%s, buttons=%j`, (state, has_progress, buttons) => {
  const root = render({ state, label: `Parsing`, on_cancel: vi.fn(), on_retry: vi.fn() })
  expect(root.dataset.state).toBe(state)
  const status = doc_query(`[role="status"]`)
  expect([status.textContent, status.getAttribute(`aria-live`)]).toEqual([
    `Parsing`,
    `polite`,
  ])
  expect(root.querySelector(`progress`) !== null).toBe(has_progress)
  expect(button_texts(root)).toEqual(buttons)
})

test.each([`running`, `error`, `cancelled`] as const)(
  `state=%s offers no button without its handler`,
  (state) => {
    expect(button_texts(render({ state, label: `Parsing` }))).toEqual([])
  },
)

test.each([
  [undefined, null],
  [25, `25`],
  [150, `100`],
  [-10, `0`],
])(
  `task progress %s with caller-owned cancellation and retry`,
  async (value, expected) => {
    const props = $state<Props>({
      state: `running`,
      label: `Parsing`,
      value,
      on_cancel: vi.fn(),
      on_retry: vi.fn(),
    })
    const root = render(props)
    const progress = doc_query(`progress`)
    expect(progress.getAttribute(`value`)).toBe(expected)
    expect(progress.getAttribute(`aria-label`)).toBe(`Parsing`)
    root.querySelector(`button`)?.click()
    expect(props.on_cancel).toHaveBeenCalledOnce()
    props.state = `error`
    await tick()
    expect(root.querySelector(`progress`)).toBeNull()
    root.querySelector(`button`)?.click()
    expect(props.on_retry).toHaveBeenCalledOnce()
  },
)

test(`custom labels, children and forwarded attributes`, () => {
  const children = createRawSnippet(() => ({
    render: () => `<em>3 of 7 files</em>`,
  }))
  const root = render({
    state: `running`,
    label: `Parsing`,
    value: 3,
    max: 7,
    on_cancel: vi.fn(),
    cancel_label: `Stop`,
    children,
    class: `caller-class`,
    id: `task`,
  })
  expect(button_texts(root)).toEqual([`Stop`])
  expect(root.querySelector(`em`)?.textContent).toBe(`3 of 7 files`)
  expect(root.classList.contains(`caller-class`)).toBe(true)
  expect(root.id).toBe(`task`)
  expect(doc_query(`progress`).getAttribute(`max`)).toBe(`7`)
})

test(`custom retry_label`, () => {
  const root = render({
    state: `error`,
    label: `Failed`,
    on_retry: vi.fn(),
    retry_label: `Again`,
  })
  expect(button_texts(root)).toEqual([`Again`])
})
