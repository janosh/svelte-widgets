import StatGrid from '$lib/StatGrid.svelte'
import {
  format_stat_delta,
  format_stat_value,
  stat_delta_label,
  type StatItem,
} from '$lib/stats'
import { mount, tick, unmount, type ComponentProps } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'

test.each([
  [`ready`, `ready`],
  [0, `0`],
  [1234, `1,234`],
  [-1234, `-1,234`],
  [1.23456, `1.235`],
  [-1.23456, `-1.235`],
  [0.001, `0.001`],
  [0.000999, `9.99e-4`],
  [999999, `999,999`],
  [1e6, `1.00e+6`],
  [-1e6, `-1.00e+6`],
  [Number.NaN, `n/a`],
  [Infinity, `n/a`],
  [-Infinity, `n/a`],
] as const)(`formats %s as %s`, (value, expected) => {
  expect(format_stat_value(value)).toBe(expected)
})

test.each([
  [12.345, `▲ 12.35`, `change up 12.35`],
  [-12.345, `▼ 12.35`, `change down 12.35`],
  [0, `▸ 0`, `change flat 0`],
  [-0, `▸ 0`, `change flat 0`],
  [NaN, `n/a`, `change unavailable`],
  [Infinity, `n/a`, `change unavailable`],
  [-Infinity, `n/a`, `change unavailable`],
] as const)(`formats delta %s visually and accessibly`, (delta, visual, accessible) => {
  expect(format_stat_delta(delta)).toBe(visual)
  expect(stat_delta_label(delta)).toBe(accessible)
})

test(`renders stats, units, hints and delta directions with reactive custom formatting`, async () => {
  const items: StatItem[] = [
    { label: `Energy`, value: -1234, unit: `eV`, hint: `Per cell`, delta: 2 },
    { label: `Time`, value: 1.23456, delta: -3, delta_tone: `positive` },
    { label: `Status`, value: `ready`, delta: 0 },
    { label: `Missing`, value: NaN },
  ]
  const props = $state<ComponentProps<typeof StatGrid>>({
    items,
    id: `stats`,
    class: `custom`,
    'aria-label': `Summary`,
  })
  const component = mount(StatGrid, { target: document.body, props })
  onTestFinished(() => unmount(component))
  await tick()
  expect(
    document.querySelector(`#stats.stat-tiles.custom`)?.getAttribute(`aria-label`),
  ).toBe(`Summary`)
  const tiles = [...document.querySelectorAll(`[role=listitem]`)]
  expect(tiles.map((tile) => tile.querySelector(`.stat-label`)?.textContent)).toEqual(
    items.map(({ label }) => label),
  )
  expect(
    tiles.map((tile) => tile.querySelector(`.stat-value`)?.textContent?.trim()),
  ).toEqual([`-1,234eV`, `1.235`, `ready`, `n/a`])
  expect(tiles[0].querySelector(`.stat-unit`)?.textContent).toBe(`eV`)
  expect(tiles[0].querySelector(`.stat-hint`)?.textContent).toBe(`Per cell`)
  expect(tiles[1].querySelector(`.stat-unit, .stat-hint`)).toBeNull()
  expect(
    tiles.map((tile) => tile.querySelector(`.stat-delta`)?.getAttribute(`aria-label`)),
  ).toEqual([`change up 2`, `change down 3`, `change flat 0`, undefined])
  expect(
    tiles.map((tile) => {
      const delta = tile.querySelector(`.stat-delta`)
      return delta && [delta.classList.contains(`up`), delta.classList.contains(`down`)]
    }),
  ).toEqual([[true, false], [false, true], [false, false], null])
  expect(document.querySelectorAll(`.stat-delta.positive`)).toHaveLength(1)
  expect(tiles[1].querySelector(`.stat-delta`)?.classList.contains(`positive`)).toBe(true)
  expect(tiles[0].hasAttribute(`title`)).toBe(false)

  const format = vi.fn((value: string | number) => `custom ${value}`)
  props.format = format
  await tick()
  expect(format.mock.calls).toEqual(items.map(({ value }) => [value]))
  expect(tiles[0].querySelector(`.stat-value`)?.textContent?.trim()).toBe(
    `custom -1234eV`,
  )
  props.items = [NaN, Infinity, -Infinity].map((delta, idx) => ({
    label: `Unavailable`,
    value: 0,
    delta,
    delta_tone: idx % 2 ? `positive` : `negative`,
  }))
  await tick()
  const invalid_deltas = [...document.querySelectorAll(`.stat-delta`)]
  expect(
    invalid_deltas.map((delta) => [
      delta.textContent?.trim(),
      delta.getAttribute(`aria-label`),
    ]),
  ).toEqual(Array.from({ length: 3 }, () => [`n/a`, `change unavailable`]))
  expect(document.querySelector(`.stat-delta.up, .stat-delta.down`)).toBeNull()
  expect(document.querySelector(`.stat-delta.positive, .stat-delta.negative`)).toBeNull()
  expect(document.querySelector(`.stat-hint, [title]`)).toBeNull()
  props.items = [{ label: `Cost`, value: 20, delta: 5, delta_tone: `negative` }]
  await tick()
  expect(document.querySelector(`.stat-delta.up.negative`)).not.toBeNull()
  props.items = []
  await tick()
  expect(document.querySelectorAll(`[role=listitem]`)).toHaveLength(0)
})
