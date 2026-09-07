import { load } from '../../src/routes/(demos)/(authoring)/authoring/+page.server'
import { expect, test } from 'vitest'
import { checked_examples } from '../../src/routes/(demos)/(authoring)/authoring/examples'

// Five real compiler runs need the same budget as the checker integration tests.
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
  for (const [idx, check] of checks.entries()) {
    const code = document.createElement(`code`)
    code.innerHTML = check.highlighted_source
    expect(code.textContent).toBe(check.source)
    expect(code.textContent).toContain(checked_examples[idx].code)
    expect(code.querySelector(`.pl-k`)).not.toBeNull()
    expect(code.querySelector(`script, button`)).toBeNull()
  }
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
}, 60_000)
