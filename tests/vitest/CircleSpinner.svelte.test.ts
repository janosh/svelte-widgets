import { CircleSpinner } from '$lib'
import { mount } from 'svelte'
import { expect, test } from 'vitest'
import { doc_query } from './index'

test.each([
  [`defaults`, {}, `1em`, `cornflowerblue`, `1.5s`],
  [
    `custom props`,
    { size: `100px`, color: `rebeccapurple`, duration: `250ms` },
    `100px`,
    `rebeccapurple`,
    `250ms`,
  ],
] as const)(
  `CircleSpinner renders %s and forwards rest props`,
  (_label, props, size, color, duration) => {
    mount(CircleSpinner, {
      target: document.body,
      props: { ...props, style: `margin: 0`, class: `in-button` },
    })

    const div = doc_query(`.circle-spinner.in-button`)
    expect(div.style.width).toBe(size)
    expect(div.style.height).toBe(size)
    expect(div.style.borderColor).toBe(`${color} transparent ${color} ${color}`)
    expect(div.style.getPropertyValue(`--duration`)).toBe(duration)
    expect(div.style.margin).toBe(`0px`)
  },
)
