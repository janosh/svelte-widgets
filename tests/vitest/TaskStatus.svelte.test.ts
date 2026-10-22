import { TaskStatus } from '#lib'
import { tick, type ComponentProps } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'
import { doc_query, render, raw_snippet } from './index'

type Props = ComponentProps<typeof TaskStatus>
const render_task = (props: Props) => {
  render(TaskStatus, props)
  return doc_query(`.task-status`)
}
const button_texts = (root: Element) =>
  [...root.querySelectorAll(`button`)].map((button) => button.textContent)
const region_text = (role: string) => doc_query(`[role="${role}"]`).textContent?.trim()
const handlers = { on_cancel: vi.fn(), on_retry: vi.fn() }

// both regions stay mounted; only errors go to the assertive one
test.each([
  [`idle`, false, [], `status`],
  [`running`, true, [`Cancel`], `status`],
  [`success`, false, [], `status`],
  [`error`, false, [`Retry`], `alert`],
  [`cancelled`, false, [`Retry`], `status`],
] as const)(
  `state=%s: progress %s, buttons %j, label in %s`,
  (state, bar, buttons, role) => {
    const root = render_task({ state, label: `Parsing`, ...handlers })
    expect(root.dataset.state).toBe(state)
    expect([
      region_text(role),
      region_text(role === `alert` ? `status` : `alert`),
    ]).toEqual([`Parsing`, ``])
    expect(root.querySelector(`progress`) !== null).toBe(bar)
    expect(button_texts(root)).toEqual(buttons)
  },
)

test.each([`running`, `error`, `cancelled`] as const)(
  `%s: no button without handler`,
  (state) => {
    expect(button_texts(render_task({ state, label: `Parsing` }))).toEqual([])
  },
)

// value clamping belongs to Progress and is tested there
test(`forwards progress, children and attributes, and runs cancel/retry`, async () => {
  const children = raw_snippet(`<em>3 of 7 files</em>`)
  const labels = { cancel_label: `Stop`, retry_label: `Again` }
  const fns = { on_cancel: vi.fn(), on_retry: vi.fn() }
  const props = $state<Props>({
    label: `Parsing`,
    value: 3,
    max: 7,
    children,
    id: `task`,
  })
  Object.assign(props, { class: `caller`, ...fns, ...labels })
  const root = render_task(props)
  expect([root.id, root.className.includes(`caller`)]).toEqual([`task`, true])
  expect(root.querySelector(`em`)?.textContent).toBe(`3 of 7 files`)
  const progress = doc_query(`progress`)
  const attrs = [`value`, `max`, `aria-label`].map((attr) => progress.getAttribute(attr))
  expect(attrs).toEqual([`3`, `7`, null])
  // named by the visible label, which may be a snippet
  const label_id = progress.getAttribute(`aria-labelledby`)
  expect(doc_query(`[id="${label_id}"]`).textContent).toBe(`Parsing`)
  expect(button_texts(root)).toEqual([`Stop`])
  root.querySelector(`button`)?.click()
  props.state = `error`
  await tick()
  expect([root.querySelector(`progress`), ...button_texts(root)]).toEqual([null, `Again`])
  root.querySelector(`button`)?.click()
  const calls = [fns.on_cancel, fns.on_retry].map((fn) => fn.mock.calls.length)
  expect(calls).toEqual([1, 1])
})

test(`spinner adds no live region; an error moves the label to the mounted alert`, async () => {
  const props = $state<Props>({ label: `Loading`, spinner: true })
  props.spinner_props = { title: `Worker` }
  const root = render_task(props)
  const spinner = doc_query(`[role="status"] .spinner`)
  const attrs = [`role`, `aria-live`, `aria-label`, `title`].map((key) =>
    spinner.getAttribute(key),
  )
  expect(attrs).toEqual([null, null, null, `Worker`])
  const alert = doc_query(`[role="alert"]`)
  Object.assign(props, { state: `error`, label: `Failed` })
  await tick()
  // the same mounted region, so the change is announced
  expect([doc_query(`[role="alert"]`), region_text(`alert`)]).toEqual([alert, `Failed`])
  expect(root.querySelector(`.spinner`)).toBeNull()
})

// a spinner stands in for the bar only while progress is unknown, never both
test.each([
  [{}, true, false],
  [{ spinner: true }, false, true],
  [{ spinner: true, value: 40 }, true, false],
])(`%j while running: progress bar %s, spinner %s`, (extra, bar, spinner) => {
  const root = render_task({ label: `Loading`, ...extra })
  const found = [`progress`, `.spinner`].map(
    (selector) => root.querySelector(selector) !== null,
  )
  expect(found).toEqual([bar, spinner])
})

test(`overlay class and snippet labels with markup`, () => {
  const label = raw_snippet(`<span>Could not load κ<sub>SRME</sub></span>`)
  const root = render_task({ state: `error`, label, overlay: true })
  expect(root.classList.contains(`overlay`)).toBe(true)
  expect(doc_query(`[role="alert"] sub`).textContent).toBe(`SRME`)
})
