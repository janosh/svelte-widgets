import { expect, test, type Locator, type Page } from '@playwright/test'
import { box_of, center_of, mouse_drag, touch_drag, type Point } from './helpers'

// A touch drag never produces mousemove, which happy-dom cannot model — hence a real browser.

// default offset={ x: 5, y: 5 } hangs the pane off the toggle's bottom right; 0 is anchored
const anchoring_error = async (pane: Locator, toggle: Locator) => {
  const [pane_box, toggle_box] = await Promise.all([box_of(pane), box_of(toggle)])
  return {
    right: pane_box.x + pane_box.width - (toggle_box.x + toggle_box.width + 5),
    top: pane_box.y - (toggle_box.y + toggle_box.height + 5),
  }
}

const open_pane = async (page: Page) => {
  await page.goto(`/draggable-pane`, { waitUntil: `networkidle` })
  const toggle = page.locator(`button.pane-toggle`).first()
  await toggle.click()
  const pane = page.locator(`div.draggable-pane`).first()
  await expect(pane).toBeVisible()
  await pane.scrollIntoViewIfNeeded() // coords outside the viewport hit nothing
  return { pane, toggle, handle: pane.locator(`.drag-handle`) }
}

type Box = Awaited<ReturnType<typeof box_of>>
// [title, press point from the pane box and handle center, drag delta, expected box change]
const mouse_drags: [string, (pane: Box, grip: Point) => Point, number[], Partial<Box>][] =
  [
    [`a mouse drag moves the pane`, (_pane, grip) => grip, [-60, 40], { x: -60, y: 40 }],
    // The resize strips anchor to the padding box and reach the pane's 1px border only via
    // their negative insets — press outside one and nothing resizes.
    [
      `the outermost pixel of the right edge still resizes`,
      ({ x, y, width, height }) => ({ x: x + width - 0.5, y: y + height / 2 }),
      [-70, 0],
      { width: -70 },
    ],
    // The corner has its own square handle painted over the two edge strips it overlaps, so
    // it drives BOTH axes; which handle a press lands on is a browser hit-test fact.
    [
      `a corner drag resizes both axes`,
      ({ x, y, width, height }) => ({ x: x + width - 3, y: y + height - 3 }),
      [-80, 50],
      { width: -80, height: 50 },
    ],
  ]
// oxlint-disable-next-line vitest/prefer-each -- Playwright test has no each API
for (const [title, press_at, delta, expected] of mouse_drags) {
  test(title, async ({ page }) => {
    const { pane, handle } = await open_pane(page)
    const before = await box_of(pane)

    await mouse_drag(page, press_at(before, await center_of(handle)), delta)

    const after = await box_of(pane)
    const keys = Object.keys(expected) as (keyof Box)[]
    const change = keys.map((key) => [key, Math.round(after[key] - before[key])])
    expect(Object.fromEntries(change)).toEqual(expected)
  })
}

// Reopening re-anchors (position_pane), rerunning the anchoring maths against the mutated layout
// oxlint-disable-next-line vitest/prefer-each -- Playwright test has no each API
for (const [title, mutate_layout] of [
  // The pane's insets resolve against the ancestor's padding box but were computed from its
  // border-box rect, so a bordered host used to push the pane off the toggle by the border.
  [
    `a bordered positioned ancestor`,
    (element: HTMLElement) => {
      const ancestor = element.offsetParent as HTMLElement
      ancestor.style.border = `10px solid transparent`
    },
  ],
  // A toggle outside the pane's containing block has offsetParent null (viewport) while the
  // pane's is still the host; reading the toggle's would write document coords as host-local
  // insets, dropping the pane by the host's offset down the page.
  [
    `a fixed toggle`,
    (element: HTMLElement) => {
      const host = element.offsetParent as HTMLElement
      // push the host well down the page so a document/host mix-up cannot coincide
      host.style.marginTop = `400px`
      const { top, left } = element.getBoundingClientRect()
      Object.assign(element.style, {
        position: `fixed`,
        top: `${top}px`,
        left: `${left}px`,
      })
    },
  ],
] as const) {
  test(`${title} keeps the pane anchored to its toggle`, async ({ page }) => {
    const { pane, toggle } = await open_pane(page)
    expect(await anchoring_error(pane, toggle)).toEqual({ right: 0, top: 0 })

    await toggle.evaluate(mutate_layout)
    await toggle.click()
    await toggle.click()
    await expect(pane).toBeVisible()
    expect(await anchoring_error(pane, toggle)).toEqual({ right: 0, top: 0 })
  })
}

test.describe(`touch`, () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 900, height: 800 } })

  test(`a touch drag moves the pane`, async ({ page }) => {
    const { pane, handle } = await open_pane(page)
    const before = await box_of(pane)
    const grip = await center_of(handle)

    await touch_drag(page, grip, [-50, 30])

    const after = await box_of(pane)
    expect(Math.round(after.x - before.x)).toBe(-50)
    expect(Math.round(after.y - before.y)).toBe(30)
  })

  // A pen pans too and is fixed by the same touch-action, but CDP's injected pen events skip
  // the compositor gesture path, so only touch can show it here.
  test(`a touch drag on the bottom edge resizes the pane`, async ({ page }) => {
    const { pane } = await open_pane(page)
    const before = await box_of(pane)
    const scroll_before = await page.evaluate(() => globalThis.scrollY)
    const edge = { x: before.x + before.width / 2, y: before.y + before.height - 3 }

    await touch_drag(page, edge, [0, 60])

    const after = await box_of(pane)
    expect(Math.round(after.height - before.height)).toBe(60)
    expect(after.width).toBeCloseTo(before.width, 0)
    expect(await page.evaluate(() => globalThis.scrollY)).toBe(scroll_before)
  })
})

// The pane is anchored to its toggle's right edge, so its width decides how far left it
// reaches. The 450px default outgrew a phone and hung 78px off the left edge, where nothing
// scrolls to bring it back; the default cap now carries the same viewport bound a manual
// resize does. Only absolute positioning clamps the anchor itself, so a few px of spill
// remain when the toggle sits at the very edge — bounded by the viewport margin, not by the
// pane's width.
test(`the default pane is capped to the viewport at phone width`, async ({ page }) => {
  const [viewport_width, viewport_margin] = [390, 8]
  await page.setViewportSize({ width: viewport_width, height: 780 })
  const { pane } = await open_pane(page)

  const box = await box_of(pane)
  expect(box.width, `default outgrew the viewport`).toBeLessThanOrEqual(
    viewport_width - 2 * viewport_margin,
  )
  expect(box.x, `pane hangs off the left edge`).toBeGreaterThanOrEqual(-viewport_margin)
  expect(box.x + box.width, `pane hangs off the right edge`).toBeLessThanOrEqual(
    viewport_width,
  )
})

// The pane's Escape layer listens on the document in capture phase, so it used to close the
// whole pane before an open dropdown or popover inside it saw the key. The auto popover
// closes through the browser's close watcher, which happy-dom lacks.
test.describe(`Escape inside an open pane`, () => {
  const open_fixture = async (page: Page) => {
    await page.goto(`/pane-escape`, { waitUntil: `networkidle` })
    await page.locator(`button.pane-toggle`).click()
    const pane = page.locator(`div.draggable-pane`)
    await expect(pane).toBeVisible()
    return pane
  }

  test(`closes a MultiSelect dropdown first, the pane second`, async ({ page }) => {
    const pane = await open_fixture(page)
    const multiselect = pane.locator(`div.multiselect`)
    await multiselect.getByPlaceholder(`Pick`).click()
    await expect(multiselect).toHaveClass(/\bopen\b/)

    await page.keyboard.press(`Escape`)
    await expect(multiselect).not.toHaveClass(/\bopen\b/)
    await expect(pane).toBeVisible()

    await page.keyboard.press(`Escape`)
    await expect(pane).toBeHidden()
  })

  test(`closes a native auto Popover first, the pane second`, async ({ page }) => {
    const pane = await open_fixture(page)
    await pane.getByRole(`button`, { name: `Details` }).click()
    const popover = page.locator(`.popover`)
    await expect(popover).toBeVisible()

    await page.keyboard.press(`Escape`)
    await expect(popover).toHaveCount(0)
    await expect(page.getByText(`pane: true · popover: false`)).toBeVisible()

    await page.keyboard.press(`Escape`)
    await expect(pane).toBeHidden()
  })
})
