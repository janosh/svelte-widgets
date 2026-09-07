import { load } from '../../src/routes/(demos)/(authoring)/authoring/+page.server'
import { expect, test } from 'vitest'

test(`published checker scenarios contain real type and assertion diagnostics`, async () => {
  const { checks } = await load()
  expect(
    checks.map(
      ({
        id,
        result: {
          ok,
          value: { checked, asserted },
        },
      }) => ({
        id,
        ok,
        checked,
        asserted,
      }),
    ),
  ).toEqual([
    { id: `valid`, ok: true, checked: 1, asserted: 0 },
    { id: `type-error`, ok: false, checked: 1, asserted: 0 },
    { id: `component`, ok: true, checked: 1, asserted: 0 },
    { id: `assertion`, ok: true, checked: 1, asserted: 1 },
    { id: `assertion-error`, ok: false, checked: 1, asserted: 0 },
  ])
  expect(checks[1].result.diagnostics).toMatchObject([
    {
      code: `TS2322`,
      range: { start: { line: 2 } },
    },
  ])
  expect(checks[4].result.diagnostics).toContainEqual(
    expect.objectContaining({
      code: `assertion`,
      message: `increment: Expected count 1 after increment(), got 2`,
    }),
  )
})
