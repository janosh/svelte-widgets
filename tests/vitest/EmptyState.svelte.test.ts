import { EmptyState } from '#lib'
import { expect, test } from 'vite-plus/test'
import { doc_query, raw_snippet, render } from './index'

test(`renders message in a span (valid inside <p>) and forwards class, attributes and style`, () => {
  render(EmptyState, {
    message: `No data available`,
    class: `custom-class`,
    id: `my-empty-state`,
    role: `alert`,
    style: `min-height: 200px`,
  })
  const container = doc_query(`.empty-state.custom-class`)
  expect(container.querySelector(`span.message`)?.textContent).toBe(`No data available`)
  expect([container.id, container.getAttribute(`role`)]).toEqual([
    `my-empty-state`,
    `alert`,
  ])
  expect(container.style.minHeight).toBe(`200px`)
})

const children = raw_snippet(`<p class="custom-content">Custom content</p>`)
// children take precedence over the message prop, and `` leaves a bare container
test.each([
  [{}, `No data to display`, null, false],
  [{ message: `` }, null, null, false],
  [{ message: `Hidden`, children }, null, `Custom content`, false],
  [{ overlay: true }, `No data to display`, null, true],
])(
  `props %j render message %s, children %s, overlay %s`,
  (props, message, custom, overlay) => {
    render(EmptyState, props)
    const container = doc_query(`.empty-state`)
    expect(container.querySelector(`span.message`)?.textContent ?? null).toBe(message)
    expect(container.querySelector(`.custom-content`)?.textContent ?? null).toBe(custom)
    expect(container.classList.contains(`overlay`)).toBe(overlay)
    expect(container.getAttribute(`role`)).toBe(`status`) // announced politely by default
  },
)
