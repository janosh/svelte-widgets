import { ControlGroup, EmptyState, GlassChip, KeyValueList, LiveMessage } from '#lib'
import { flushSync, type ComponentProps } from 'svelte'
import { expect, test } from 'vite-plus/test'
import { doc_query, raw_snippet, render } from './index'

const children = raw_snippet(`<span class="custom">Custom content</span>`)
const attrs = { class: `caller`, id: `root`, style: `margin-top: 3px` }
const legend = `Stacking`
const children_text = `Custom content`

test.each([
  [`.empty-state`, () => render(EmptyState, attrs)],
  [`dl.key-value-list`, () => render(KeyValueList, { rows: [], ...attrs })],
  [`span.sr-only`, () => render(LiveMessage, attrs)],
  [`.glass-chip`, () => render(GlassChip, { children, ...attrs })],
  [`fieldset.control-group`, () => render(ControlGroup, { legend, children, ...attrs })],
] as const)(`%s forwards class, attributes and style`, (selector, mount) => {
  mount()
  const root = doc_query(`${selector}.caller`)
  expect([root.id, root.style.marginTop]).toEqual([`root`, `3px`])
})

test.each([
  [{}, `No data to display`, null, false, `status`],
  [{ message: `Hidden`, children }, null, `Custom content`, false, `status`],
  [{ overlay: true, role: `alert` }, `No data to display`, null, true, `alert`],
])(
  `EmptyState %j: message %s, children %s, overlay %s, role %s`,
  (props, ...expected) => {
    render(EmptyState, props)
    const root = doc_query(`.empty-state`)
    // a span, so the message stays valid inside a <p>
    const text = (selector: string) => root.querySelector(selector)?.textContent ?? null
    const state = [root.classList.contains(`overlay`), root.getAttribute(`role`)]
    expect([text(`span.message`), text(`.custom`), ...state]).toEqual(expected)
  },
)

test(`KeyValueList shows each full value in its title and follows updates`, () => {
  const props = $state<ComponentProps<typeof KeyValueList>>({
    rows: [
      [`Atoms`, 42],
      [`Spacings`, `1.2, 3.4`],
    ],
  })
  render(KeyValueList, props)
  const rows = () =>
    [...document.querySelectorAll(`dl div`)].map((row) =>
      [`dt`, `dd`]
        .map((tag) => row.querySelector(tag)?.textContent)
        .concat(row.querySelector(`dd`)?.title),
    )
  expect(rows()).toEqual([
    [`Atoms`, `42`, `42`],
    [`Spacings`, `1.2, 3.4`, `1.2, 3.4`],
  ])
  props.rows = [[`Atoms`, 7]]
  flushSync()
  expect(rows()).toEqual([[`Atoms`, `7`, `7`]])
})

test(`LiveMessage stays mounted while empty and lets children and aria-live override`, () => {
  const props = $state<ComponentProps<typeof LiveMessage>>({ message: `` })
  render(LiveMessage, props)
  const region = doc_query(`span.sr-only`)
  expect([region.getAttribute(`aria-live`), region.textContent]).toEqual([`polite`, ``])
  props.message = `3 matches`
  flushSync()
  expect([doc_query(`span.sr-only`), region.textContent]).toEqual([region, `3 matches`])
  Object.assign(props, { children, 'aria-live': `assertive` })
  flushSync()
  expect([region.textContent, region.getAttribute(`aria-live`)]).toEqual([
    `Custom content`,
    `assertive`,
  ])
})

test(`GlassChip stays start-aligned inside a centered parent`, () => {
  const section = document.createElement(`section`)
  section.style.textAlign = `center`
  document.body.append(section)
  render(GlassChip, { children }, section)
  const chip = doc_query(`.glass-chip`)
  expect([chip.textContent, getComputedStyle(chip).textAlign]).toEqual([
    children_text,
    `start`,
  ])
})

test(`ControlGroup is a fieldset named by its legend that disables its controls`, () => {
  const label = raw_snippet(`<label>Gap <input type="number" /></label>`)
  render(ControlGroup, { legend, children: label, disabled: true })
  const fieldset = doc_query<HTMLFieldSetElement>(`fieldset.control-group`)
  const { tagName, textContent } = fieldset.firstElementChild ?? {}
  expect([tagName, textContent]).toEqual([`LEGEND`, legend])
  expect([fieldset.disabled, fieldset.querySelector(`input`)?.type]).toEqual([
    true,
    `number`,
  ])
})
