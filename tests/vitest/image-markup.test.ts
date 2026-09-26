import { draw_markup_strokes, object_fit_contain_box } from '$lib/image-markup'
import { expect, test, vi } from 'vite-plus/test'

test.each([
  [200, 100, 100, 100, { x: 0, y: 25, width: 100, height: 50, scale: 0.5 }],
  [100, 200, 100, 100, { x: 25, y: 0, width: 50, height: 100, scale: 0.5 }],
  [100, 100, 200, 200, { x: 0, y: 0, width: 200, height: 200, scale: 2 }],
  [0, 100, 100, 100, { x: 0, y: 0, width: 0, height: 0, scale: 0 }],
  [100, 100, 100, 0, { x: 0, y: 0, width: 0, height: 0, scale: 0 }],
] as const)(`fits %s×%s into %s×%s`, (width, height, box_width, box_height, expected) => {
  expect(object_fit_contain_box(width, height, box_width, box_height)).toEqual(expected)
})

test.each([-1, NaN, Infinity])(`rejects invalid dimensions %s`, (invalid) => {
  for (const idx of [0, 1, 2, 3]) {
    const dimensions: [number, number, number, number] = [100, 200, 300, 400]
    dimensions[idx] = invalid
    expect(() => object_fit_contain_box(...dimensions)).toThrow(RangeError)
  }
})

test(`draws multi-point strokes and lone taps, ignoring empty strokes`, () => {
  const colors: string[] = []
  const context = {
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn((): void => {
      colors.push(context.strokeStyle)
    }),
    lineCap: ``,
    lineJoin: ``,
    lineWidth: 0,
    strokeStyle: ``,
  }
  const strokes = [
    { color: `red`, points: [] },
    {
      color: `green`,
      points: [
        { x: 1, y: 2 },
        { x: 3, y: 4 },
        { x: 5, y: 6 },
      ],
    },
    { color: `blue`, points: [{ x: 10, y: 20 }] },
  ] as const
  const original_strokes = structuredClone(strokes)
  draw_markup_strokes(context as unknown as CanvasRenderingContext2D, strokes, 4)
  expect([
    context.lineCap,
    context.lineJoin,
    context.lineWidth,
    context.strokeStyle,
  ]).toEqual([`round`, `round`, 4, `blue`])
  expect(context.beginPath).toHaveBeenCalledTimes(2)
  expect(colors).toEqual([`green`, `blue`])
  expect(context.moveTo.mock.calls).toEqual([
    [1, 2],
    [10, 20],
  ])
  expect(context.lineTo.mock.calls).toEqual([
    [3, 4],
    [5, 6],
    [10.01, 20],
  ])
  expect(strokes).toEqual(original_strokes)
})
