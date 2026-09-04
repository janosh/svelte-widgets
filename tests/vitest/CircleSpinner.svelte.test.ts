import { CircleSpinner } from '$lib'
import { mount } from 'svelte'
import { expect, test } from 'vitest'
import { doc_query } from './index'

test.each([
  [`defaults`, {}, `1em`, `cornflowerblue`, `1.5s`, null],
  [
    `custom props`,
    { size: `100px`, color: `rebeccapurple`, duration: `250ms` },
    `100px`,
    `rebeccapurple`,
    `250ms`,
    null,
  ],
  [
    `rest style and class`,
    { style: `margin: 0`, class: `in-button` },
    `1em`,
    `cornflowerblue`,
    `1.5s`,
    `0px`,
  ],
] as const)(
  `CircleSpinner renders %s`,
  (_label, props, expected_size, expected_color, expected_duration, expected_margin) => {
    mount(CircleSpinner, { target: document.body, props })

    const div = doc_query(
      expected_margin === null ? `.circle-spinner` : `.circle-spinner.in-button`,
    )
    expect(div.style.width).toBe(expected_size)
    expect(div.style.height).toBe(expected_size)
    expect(div.style.borderColor).toBe(
      `${expected_color} transparent ${expected_color} ${expected_color}`,
    )
    expect(div.style.getPropertyValue(`--duration`)).toBe(expected_duration)
    if (expected_margin !== null) expect(div.style.margin).toBe(expected_margin)
  },
)
