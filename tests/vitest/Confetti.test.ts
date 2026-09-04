import Confetti from '$site/Confetti.svelte'
import { mount } from 'svelte'
import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => vi.useRealTimers())

const spans = () => [...document.querySelectorAll<HTMLSpanElement>(`div > span`)]
const span_tops = () => spans().map((span) => span.style.top)

test(`renders n_items spans and reuses DOM nodes across animation frames`, async () => {
  mount(Confetti, { target: document.body, props: { n_items: 5, speed: 5 } })

  const initial_spans = spans()
  expect(initial_spans).toHaveLength(5)
  const initial_tops = span_tops()

  // wait until the animation loop has moved at least one span
  await vi.waitFor(() => {
    if (span_tops().every((top, idx) => top === initial_tops[idx])) {
      throw new Error(`animation has not advanced yet`)
    }
  })

  // spans must be updated in place - a content-derived each key would destroy
  // and recreate every span on each frame
  const after = spans()
  expect(after).toHaveLength(5)
  after.forEach((span, idx) => expect(span).toBe(initial_spans[idx]))
})

test(`freeze stops the animation`, async () => {
  vi.useFakeTimers()
  mount(Confetti, {
    target: document.body,
    props: { n_items: 3, speed: 5, freeze: true },
  })

  const initial_tops = span_tops()
  // without this, an empty span list would make the comparison below [] === []
  expect(initial_tops).toHaveLength(3)
  await vi.advanceTimersByTimeAsync(100)
  expect(span_tops()).toEqual(initial_tops)
})
