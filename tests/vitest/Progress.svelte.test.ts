import { Progress } from '$lib'
import { flushSync, mount, type ComponentProps } from 'svelte'
import { expect, test } from 'vitest'
import { doc_query, render } from './index'

const render_progress = (props: ComponentProps<typeof Progress>) => {
  render(Progress, props)
  return doc_query<HTMLProgressElement>(`progress`)
}

test.each([
  [`indeterminate without a value`, undefined, 100, null],
  [`in range`, 40, 100, `40`],
  [`clamped to max`, 150, 100, `100`],
  [`clamped to 0`, -5, 100, `0`],
  [`on a custom max`, 3, 4, `3`],
] as const)(`value is %s`, (_desc, value, max, expected) => {
  const progress = render_progress({ value, max })
  expect(progress.getAttribute(`value`)).toBe(expected)
  expect(progress.getAttribute(`max`)).toBe(String(max))
})

test.each([
  [{}, `Progress`],
  [{ label: `Upload` }, `Upload`],
  [{ label: `Upload`, 'aria-label': `Uploading report` }, `Uploading report`],
] as const)(`props %j give aria-label %s and forward rest props`, (props, expected) => {
  const progress = render_progress({ ...props, id: `bar`, class: `caller-class` })
  expect(progress.getAttribute(`aria-label`)).toBe(expected)
  expect(progress.id).toBe(`bar`)
  expect(progress.classList.contains(`caller-class`)).toBe(true)
})

// NaN once reached the DOM before validation, which threw a generic TypeError
test.each([
  [`max=0`, { max: 0 }],
  [`max<0`, { max: -1 }],
  [`max=NaN`, { max: Number.NaN }],
  [`max=Infinity`, { max: Infinity }],
  [`value=NaN`, { value: Number.NaN }],
  [`value=Infinity`, { value: Infinity }],
])(`rejects %s with a clear error`, (_desc, props) => {
  expect(() => {
    mount(Progress, { target: document.body, props })
    flushSync()
  }).toThrow(`Progress requires finite value and positive max`)
})
