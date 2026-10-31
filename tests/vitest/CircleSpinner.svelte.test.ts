import { CircleSpinner } from '#lib'
import { expect, test } from 'vite-plus/test'
import { doc_query, render } from './index'

test(`CircleSpinner applies custom props and forwards rest props`, () => {
  render(CircleSpinner, {
    size: `100px`,
    color: `rebeccapurple`,
    duration: `250ms`,
    style: `margin: 0`,
    class: `in-button`,
  })

  const div = doc_query(`.circle-spinner.in-button`)
  expect(div.style.width).toBe(`100px`)
  expect(div.style.height).toBe(`100px`)
  expect(div.style.borderColor).toBe(
    `rebeccapurple transparent rebeccapurple rebeccapurple`,
  )
  expect(div.style.getPropertyValue(`--duration`)).toBe(`250ms`)
  expect(div.style.margin).toBe(`0px`)
})
