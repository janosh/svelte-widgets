// PropsTable: rendering of extracted docs, and a failed load retried on reopen
import PropsTable from '#lib/PropsTable.svelte'
import type { ComponentDoc } from '#lib/prop-docs/types.ts'
import { flushSync } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'
import { doc_query, render } from './index'

const long_type = `Pick<ComponentProps<typeof Trajectory>, 'class' | 'style' | 'fps_range' | 'step_labels'>`
const doc: ComponentDoc = {
  props: [
    {
      name: `label`,
      type: `string`,
      description: `Label text (supports HTML)`,
      required: true,
    },
    {
      name: `fps`,
      type: `number`,
      default: `DEFAULT_FPS`,
      default_value: `24`,
      description: `Frames per second, see \`fps_range\``,
      bindable: true,
    },
    { name: `trajectory_props`, type: long_type, default: `{}` },
  ],
  rest_attributes: `<span>`,
}

const toggle = (details: HTMLDetailsElement, open: boolean) => {
  details.open = open
  details.dispatchEvent(new Event(`toggle`))
  flushSync()
}

test(`renders the docs, retrying a failed load when the table is reopened`, async () => {
  // the first load fails (e.g. an extraction error mid-edit), later ones succeed
  const load = vi
    .fn<() => Promise<{ default: ComponentDoc }>>()
    .mockRejectedValueOnce(new Error(`extraction failed`))
    .mockResolvedValue({ default: doc })
  render(PropsTable, {
    name: `Trajectory`,
    loaders: { Trajectory: load },
    scroll_props: { class: `wide` },
    id: `trajectory-props`,
  })
  const details = doc_query<HTMLDetailsElement>(`details#trajectory-props.props-table`)
  // the name is plain text: a <code> could become a source link that eats the summary click
  expect(details.querySelector(`summary code`)).toBeNull()
  expect(details.querySelector(`summary .component-name`)?.textContent).toBe(`Trajectory`)
  expect(details.querySelector(`table`)).toBeNull() // nothing rendered while closed
  toggle(details, true)
  await vi.waitFor(() => expect(details.textContent).toContain(`extraction failed`))
  toggle(details, false)
  toggle(details, true)
  await vi.waitFor(() => expect(details.querySelectorAll(`tbody tr`)).toHaveLength(3))
  // the first open made the failing call (the idle prefetch hadn't run), the reopen one retry
  expect(load).toHaveBeenCalledTimes(2)
  expect(details.querySelector(`.table-scroll.wide > table`)).not.toBeNull()

  const rows = [...details.querySelectorAll(`tbody tr`)].map((row) =>
    [...row.children].map((cell) => cell.textContent?.replaceAll(/\s+/g, ` `).trim()),
  )
  // sorted by name (the docs list label, fps, trajectory_props) and numbered in that order;
  // a constant default shows its value with the name beneath
  expect(rows.slice(0, 2)).toEqual([
    [`1`, `fps bindable`, `number`, `24DEFAULT_FPS`, `Frames per second, see fps_range`],
    [`2`, `label required`, `string`, ``, `Label text (supports HTML)`],
  ])
  expect(rows[2].slice(0, 2)).toEqual([`3`, `trajectory_props`])
  // a `code` span in the comment renders as code, without its backticks
  expect(
    details.querySelector(`tbody tr:first-child td:last-child code`)?.textContent,
  ).toBe(`fps_range`)
  // a long type collapses to two lines until clicked
  const type_button = doc_query<HTMLButtonElement>(`button.long-type`)
  expect(type_button.textContent?.trim()).toBe(long_type)
  expect(type_button.getAttribute(`aria-expanded`)).toBe(`false`)
  type_button.click()
  flushSync()
  expect(type_button.classList.contains(`expanded`)).toBe(true)
  expect(type_button.getAttribute(`aria-expanded`)).toBe(`true`)
  expect(details.querySelector(`.rest-attributes`)?.textContent).toContain(
    `Also takes any <span> attribute`,
  )
})

test(`prefetches when idle and reports a component without docs`, async () => {
  vi.useFakeTimers()
  const load = vi.fn(() => Promise.resolve({ default: doc }))
  render(PropsTable, { name: `Plot`, loaders: { Plot: load } })
  expect(load).not.toHaveBeenCalled()
  await vi.runAllTimersAsync()
  expect(load).toHaveBeenCalledOnce()
  vi.useRealTimers()

  render(PropsTable, { name: `Missing`, loaders: {}, open: true })
  await vi.waitFor(() =>
    expect(doc_query(`details:last-of-type`).textContent).toContain(
      `Failed to load the props of Missing: Error: No props extracted for Missing`,
    ),
  )
})
