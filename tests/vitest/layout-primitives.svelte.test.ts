import { ControlGroup, EmptyState, GlassChip, KeyValueList, LiveMessage } from '#lib'
import { flushSync, type ComponentProps } from 'svelte'
import { expect, test } from 'vite-plus/test'
import { doc_query, raw_snippet, render } from './index'

const children = raw_snippet(`<span class="custom">Custom content</span>`)
const attrs = { class: `caller`, id: `root`, style: `margin-top: 3px` }

test.each([
  [`EmptyState`, () => render(EmptyState, attrs), `.empty-state`],
  [
    `KeyValueList`,
    () => render(KeyValueList, { rows: [], ...attrs }),
    `dl.key-value-list`,
  ],
  [`LiveMessage`, () => render(LiveMessage, attrs), `span.sr-only`],
  [`GlassChip`, () => render(GlassChip, { children, ...attrs }), `.glass-chip`],
  [
    `ControlGroup`,
    () => render(ControlGroup, { legend: `Stacking`, children, ...attrs }),
    `fieldset.control-group`,
  ],
] as const)(
  `%s forwards class, attributes and style to its root`,
  (_name, mount, selector) => {
    mount()
    const root = doc_query(`${selector}.caller`)
    expect([root.id, root.style.marginTop]).toEqual([`root`, `3px`])
  },
)

test.each([
  [{}, `No data to display`, null, false, `status`],
  [{ message: `Hidden`, children }, null, `Custom content`, false, `status`],
  [{ overlay: true, role: `alert` }, `No data to display`, null, true, `alert`],
])(
  `EmptyState %j: message %s, children %s, overlay %s, role %s`,
  (props, message, custom, overlay, role) => {
    render(EmptyState, props)
    const root = doc_query(`.empty-state`)
    // a span, so the message stays valid inside a <p>
    expect(root.querySelector(`span.message`)?.textContent ?? null).toBe(message)
    expect(root.querySelector(`.custom`)?.textContent ?? null).toBe(custom)
    expect([root.classList.contains(`overlay`), root.getAttribute(`role`)]).toEqual([
      overlay,
      role,
    ])
  },
)

test(`KeyValueList renders term/value rows with the full value in the title and follows updates`, () => {
  const props = $state<ComponentProps<typeof KeyValueList>>({
    rows: [
      [`Atoms`, 42],
      [`Spacings`, `1.2, 3.4, 5.6`],
    ],
  })
  render(KeyValueList, props)
  const rows = () =>
    [...document.querySelectorAll(`dl div`)].map((row) => [
      row.querySelector(`dt`)?.textContent,
      row.querySelector(`dd`)?.textContent,
      row.querySelector(`dd`)?.getAttribute(`title`),
    ])
  expect(rows()).toEqual([
    [`Atoms`, `42`, `42`],
    [`Spacings`, `1.2, 3.4, 5.6`, `1.2, 3.4, 5.6`],
  ])
  props.rows = [[`Atoms`, 7]]
  flushSync()
  expect(rows()).toEqual([[`Atoms`, `7`, `7`]])
})

test(`LiveMessage stays mounted while empty, announces changes and lets children and aria-live override`, () => {
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

test(`GlassChip renders children start-aligned inside a centered parent`, () => {
  const section = document.createElement(`section`)
  section.style.textAlign = `center`
  document.body.append(section)
  render(GlassChip, { children }, section)
  const chip = doc_query(`.glass-chip`)
  expect([chip.textContent, getComputedStyle(chip).textAlign]).toEqual([
    `Custom content`,
    `start`,
  ])
})

test(`ControlGroup renders a fieldset named by its legend that disables its controls`, () => {
  render(ControlGroup, {
    legend: `Stacking`,
    children: raw_snippet(`<label>Gap <input type="number" /></label>`),
    disabled: true,
  })
  const fieldset = doc_query<HTMLFieldSetElement>(`fieldset.control-group`)
  const legend = fieldset.firstElementChild
  expect([legend?.tagName, legend?.textContent, fieldset.disabled]).toEqual([
    `LEGEND`,
    `Stacking`,
    true,
  ])
  expect(fieldset.querySelector(`input`)).not.toBeNull()
})
