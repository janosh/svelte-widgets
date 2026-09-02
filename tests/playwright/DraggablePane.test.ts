import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

// A touch drag never produces mousemove, which happy-dom cannot model — hence a real browser.

type Point = { x: number; y: number }

const box_of = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`no box for ${locator}`)
  return box
}

const center_of = async (locator: Locator): Promise<Point> => {
  const { x, y, width, height } = await box_of(locator)
  return { x: x + width / 2, y: y + height / 2 }
}

const mouse_drag = async (page: Page, from: Point, [dx, dy]: readonly number[]) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy)
  await page.mouse.up()
}

const open_pane = async (page: Page) => {
  await page.goto(`/draggable-pane`, { waitUntil: `networkidle` })
  await page.locator(`button.pane-toggle`).first().click()
  const pane = page.locator(`div.draggable-pane`).first()
  await expect(pane).toBeVisible()
  await pane.scrollIntoViewIfNeeded() // coords outside the viewport hit nothing
  return { pane, handle: pane.locator(`.drag-handle`) }
}

test(`a mouse drag moves the pane`, async ({ page }) => {
  const { pane, handle } = await open_pane(page)
  const before = await box_of(pane)
  const grip = await center_of(handle)

  await mouse_drag(page, grip, [-60, 40])

  const after = await box_of(pane)
  expect(Math.round(after.x - before.x)).toBe(-60)
  expect(Math.round(after.y - before.y)).toBe(40)
})

// The resize strips anchor to the padding box and reach the pane's 1px border only via their
// negative insets — press outside one and nothing resizes.
test(`the outermost pixel of the right edge still resizes`, async ({ page }) => {
  const { pane } = await open_pane(page)
  const before = await box_of(pane)
  const outer_edge = { x: before.x + before.width - 0.5, y: before.y + before.height / 2 }

  await mouse_drag(page, outer_edge, [-70, 0])

  const after = await box_of(pane)
  expect(Math.round(after.width - before.width)).toBe(-70)
})

// The pane's insets resolve against the ancestor's padding box but were computed from its
// border-box rect, so a bordered host used to push the pane off the toggle by the border width.
test(`a bordered positioned ancestor keeps the pane anchored to its toggle`, async ({
  page,
}) => {
  const { pane } = await open_pane(page)
  const toggle = page.locator(`button.pane-toggle`).first()
  const anchoring_error = async () => {
    const [pane_box, toggle_box] = await Promise.all([box_of(pane), box_of(toggle)])
    return {
      // default offset={ x: 5, y: 5 } hangs the pane off the toggle's bottom right
      right: pane_box.x + pane_box.width - (toggle_box.x + toggle_box.width + 5),
      top: pane_box.y - (toggle_box.y + toggle_box.height + 5),
    }
  }
  expect(await anchoring_error()).toEqual({ right: 0, top: 0 })

  await toggle.evaluate((element: HTMLElement) => {
    const ancestor = element.offsetParent as HTMLElement
    ancestor.style.border = `10px solid transparent`
  })
  // reset_position() reruns the anchoring maths against the now-bordered ancestor
  await toggle.click()
  await toggle.click()
  await expect(pane).toBeVisible()
  expect(await anchoring_error()).toEqual({ right: 0, top: 0 })
})

// A toggle outside the pane's containing block has offsetParent null (viewport) while the
// pane's is still the host; reading the toggle's would write document coords as host-local
// insets, dropping the pane by the host's offset down the page.
test(`a fixed toggle still anchors the pane to its own offset parent`, async ({
  page,
}) => {
  const { pane } = await open_pane(page)
  const toggle = page.locator(`button.pane-toggle`).first()

  await toggle.evaluate((element: HTMLElement) => {
    const host = element.offsetParent as HTMLElement
    // push the host well down the page so a document/host mix-up cannot coincide
    host.style.marginTop = `400px`
    const { top, left } = element.getBoundingClientRect()
    Object.assign(element.style, {
      position: `fixed`,
      top: `${top}px`,
      left: `${left}px`,
    })
  })
  await toggle.click()
  await toggle.click()
  await expect(pane).toBeVisible()

  const [pane_box, toggle_box] = await Promise.all([box_of(pane), box_of(toggle)])
  expect({
    right: pane_box.x + pane_box.width - (toggle_box.x + toggle_box.width + 5),
    top: pane_box.y - (toggle_box.y + toggle_box.height + 5),
  }).toEqual({ right: 0, top: 0 })
})

// The corner has its own square handle painted over the two edge strips it overlaps, so it
// drives BOTH axes; which handle a press lands on is a browser hit-test fact.
test(`a corner drag resizes both axes`, async ({ page }) => {
  const { pane } = await open_pane(page)
  const before = await box_of(pane)
  const corner = { x: before.x + before.width - 3, y: before.y + before.height - 3 }

  await mouse_drag(page, corner, [-80, 50])

  const after = await box_of(pane)
  expect(Math.round(after.width - before.width)).toBe(-80)
  expect(Math.round(after.height - before.height)).toBe(50)
})

test.describe(`touch`, () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 900, height: 800 } })

  // Playwright's touchscreen only taps; drag goes through CDP
  const touch_drag = async (page: Page, from: Point, [dx, dy]: readonly number[]) => {
    const cdp = await page.context().newCDPSession(page)
    for (const [type, point] of [
      [`touchStart`, from],
      [`touchMove`, { x: from.x + dx, y: from.y + dy }],
      [`touchEnd`, null],
    ] as const) {
      await cdp.send(`Input.dispatchTouchEvent`, {
        type,
        touchPoints: point ? [point] : [],
      })
    }
  }

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
