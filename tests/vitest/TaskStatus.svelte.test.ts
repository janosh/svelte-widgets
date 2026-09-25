import { TaskStatus } from '$lib'
import { createRawSnippet, mount, tick, unmount, type ComponentProps } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vitest'
import { doc_query } from './index'

type Props = ComponentProps<typeof TaskStatus>
const render_task = (props: Props) => {
  const component = mount(TaskStatus, { target: document.body, props })
  onTestFinished(() => unmount(component))
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
  const root = render_task({
    state,
    label: `Parsing`,
    on_cancel: vi.fn(),
    on_retry: vi.fn(),
  })
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
    expect(button_texts(render_task({ state, label: `Parsing` }))).toEqual([])
  },
)

// value clamping belongs to Progress and is tested there
test(`forwards progress and runs caller-owned cancellation and retry under custom labels`, async () => {
  const props = $state<Props>({
    state: `running`,
    label: `Parsing`,
    value: 25,
    on_cancel: vi.fn(),
    on_retry: vi.fn(),
    cancel_label: `Stop`,
    retry_label: `Again`,
  })
  const root = render_task(props)
  const progress = doc_query(`progress`)
  expect([progress.getAttribute(`value`), progress.getAttribute(`aria-label`)]).toEqual([
    `25`,
    `Parsing`,
  ])
  expect(button_texts(root)).toEqual([`Stop`])
  root.querySelector(`button`)?.click()
  expect(props.on_cancel).toHaveBeenCalledOnce()
  props.state = `error`
  await tick()
  expect(root.querySelector(`progress`)).toBeNull()
  expect(button_texts(root)).toEqual([`Again`])
  root.querySelector(`button`)?.click()
  expect(props.on_retry).toHaveBeenCalledOnce()
})

test(`children, max and forwarded attributes`, () => {
  const children = createRawSnippet(() => ({ render: () => `<em>3 of 7 files</em>` }))
  const root = render_task({
    state: `running`,
    label: `Parsing`,
    value: 3,
    max: 7,
    children,
    class: `caller-class`,
    id: `task`,
  })
  expect(root.querySelector(`em`)?.textContent).toBe(`3 of 7 files`)
  expect(root.classList.contains(`caller-class`)).toBe(true)
  expect(root.id).toBe(`task`)
  expect(doc_query(`progress`).getAttribute(`max`)).toBe(`7`)
})
