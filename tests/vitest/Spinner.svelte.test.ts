import { Spinner } from '#lib'
import { expect, test } from 'vite-plus/test'
import { doc_query, render } from './index'

test.each([
  [undefined, null],
  [`Processing...`, `Processing...`],
])(
  `text=%j renders a live status region with text %j and forwarded props`,
  (text, expected) => {
    render(Spinner, {
      text,
      id: `custom-id`,
      class: `caller-class`,
      style: `--spinner-size: 60px; --spinner-color: red`,
    })
    const container = doc_query(
      `.spinner.caller-class[role="status"][aria-live="polite"]`,
    )
    expect(container.hasAttribute(`aria-hidden`)).toBe(false)
    expect(container.getAttribute(`aria-label`)).toBe(text ? null : `Loading`)
    expect(container.id).toBe(`custom-id`)
    expect(container.style.getPropertyValue(`--spinner-size`)).toBe(`60px`)
    expect(container.style.getPropertyValue(`--spinner-color`)).toBe(`red`)
    // The decorative circle is separate from the accessible status text.
    expect(container.children).toHaveLength(expected === null ? 1 : 2)
    expect(container.querySelector(`span:not(.circle)`)?.textContent ?? null).toBe(
      expected,
    )
  },
)

test(`status={false} is aria-hidden decoration and size/color/duration props set its custom properties`, () => {
  render(Spinner, { status: false, size: `0.8em`, color: `tomato`, duration: `250ms` })
  const spinner = doc_query(`.spinner`)
  const attrs = [`role`, `aria-live`, `aria-label`, `aria-hidden`].map((key) =>
    spinner.getAttribute(key),
  )
  expect(attrs).toEqual([null, null, null, `true`])
  const props = [`--spinner-size`, `--spinner-color`, `--spinner-duration`].map((name) =>
    spinner.style.getPropertyValue(name),
  )
  expect(props).toEqual([`0.8em`, `tomato`, `250ms`])
})
