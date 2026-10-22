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

test.each([
  [`idle`, false, [], `status`],
  [`running`, true, [`Cancel`], `status`],
  [`success`, false, [], `status`],
  [`error`, false, [`Retry`], `alert`],
  [`cancelled`, false, [`Retry`], `status`],
] as const)(
  `state=%s: progress=%s, buttons=%j, label in the %s region`,
  (state, has_progress, buttons, region) => {
    const root = render_task({
      state,
      label: `Parsing`,
      on_cancel: vi.fn(),
      on_retry: vi.fn(),
    })
    expect(root.dataset.state).toBe(state)
    // both regions stay mounted; only errors go to the assertive one
    const texts = [`status`, `alert`].map((role) =>
      doc_query(`[role="${role}"]`).textContent?.trim(),
    )
    expect(texts).toEqual(region === `status` ? [`Parsing`, ``] : [``, `Parsing`])
    expect(root.querySelector(`progress`) !== null).toBe(has_progress)
    expect(button_texts(root)).toEqual(buttons)
  },
)

test.each([`running`, `error`, `cancelled`] as const)(
  `state=%s offers no button without its handler`,
  (state) => {
    expect(button_texts(render_task({ state, label: `Parsing` }))).toEqual([])
  },
)

// value clamping belongs to Progress and is tested there
test(`forwards progress, children and attributes, and runs cancel/retry under custom labels`, async () => {
  const props = $state<Props>({
    state: `running`,
    label: `Parsing`,
    value: 3,
    max: 7,
    children: raw_snippet(`<em>3 of 7 files</em>`),
    class: `caller-class`,
    id: `task`,
    on_cancel: vi.fn(),
    on_retry: vi.fn(),
    cancel_label: `Stop`,
    retry_label: `Again`,
  })
  const root = render_task(props)
  expect([root.id, root.classList.contains(`caller-class`)]).toEqual([`task`, true])
  expect(root.querySelector(`em`)?.textContent).toBe(`3 of 7 files`)
  const progress = doc_query(`progress`)
  expect(
    [`value`, `max`, `aria-label`].map((attr) => progress.getAttribute(attr)),
  ).toEqual([`3`, `7`, null])
  // named by the visible label, which may be a snippet
  const label_id = progress.getAttribute(`aria-labelledby`) ?? ``
  expect(doc_query(`[id="${label_id}"]`).textContent).toBe(`Parsing`)
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

test(`spinner mode adds no live region and moves an error label to the alert region`, async () => {
  const props = $state<Props>({
    state: `running`,
    label: `Loading`,
    spinner: true,
    spinner_props: { title: `Parsing in a worker` },
  })
  const root = render_task(props)
  const [status, alert] = [`status`, `alert`].map((role) => doc_query(`[role="${role}"]`))
  const spinner = doc_query(`[role="status"] .spinner`)
  expect(
    [`role`, `aria-live`, `aria-label`].map((attr) => spinner.getAttribute(attr)),
  ).toEqual([null, null, null])
  expect([spinner.title, status.textContent?.trim()]).toEqual([
    `Parsing in a worker`,
    `Loading`,
  ])
  expect(document.querySelectorAll(`[aria-live]`)).toHaveLength(2)
  props.state = `error`
  props.label = `Failed`
  await tick()
  // same mounted regions, so the change is announced
  expect([doc_query(`[role="status"]`), doc_query(`[role="alert"]`)]).toEqual([
    status,
    alert,
  ])
  expect([
    root.querySelector(`.spinner`),
    status.textContent?.trim(),
    alert.textContent?.trim(),
  ]).toEqual([null, ``, `Failed`])
})

// a spinner stands in for the bar only while progress is unknown, never both
test.each([
  [{}, true, false],
  [{ spinner: true }, false, true],
  [{ spinner: true, value: 40 }, true, false],
])(
  `%j while running: progress bar %s, spinner %s`,
  (extra, has_progress, has_spinner) => {
    const root = render_task({ label: `Loading`, ...extra })
    expect(root.querySelector(`progress`) !== null).toBe(has_progress)
    expect(root.querySelector(`.spinner`) !== null).toBe(has_spinner)
  },
)

test(`overlay class and snippet labels with markup`, () => {
  const root = render_task({
    state: `error`,
    label: raw_snippet(`<span>Could not load κ<sub>SRME</sub></span>`),
    overlay: true,
  })
  expect(root.classList.contains(`overlay`)).toBe(true)
  expect(doc_query(`[role="alert"] sub`).textContent).toBe(`SRME`)
})
