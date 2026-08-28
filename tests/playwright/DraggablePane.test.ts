import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

// Pointer events matter for touch: a touch drag never produces mousemove. happy-dom cannot
// show that, so this lives in a real browser.

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

// The strips are absolute children, so they anchor to the padding box and only reach the
// pane's 1px border because of their negative insets — press outside one and nothing
// resizes. Layout is a browser fact.
test(`the outermost pixel of the right edge still resizes`, async ({ page }) => {
  const { pane } = await open_pane(page)
  const before = await box_of(pane)
  const outer_edge = { x: before.x + before.width - 0.5, y: before.y + before.height / 2 }

  await mouse_drag(page, outer_edge, [-70, 0])

  const after = await box_of(pane)
  expect(Math.round(after.width - before.width)).toBe(-70)
})

// The pane's left/top resolve against the positioned ancestor's padding box, but it is
// anchored from that ancestor's border-box rect, so a bordered host used to push the pane
// off the toggle by the border width. Only a browser knows where the padding box starts.
test(`a bordered positioned ancestor keeps the pane anchored to its toggle`, async ({
  page,
}) => {
  const { pane } = await open_pane(page)
  const toggle = page.locator(`button.pane-toggle`).first()
  const anchoring_error = async () => {
    const [pane_box, toggle_box] = await Promise.all([box_of(pane), box_of(toggle)])
    return {
      // the default offset={ x: 5, y: 5 } hangs the pane off the toggle's bottom right
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

// Which handle a corner press lands on is a browser hit-test fact; happy-dom cannot decide
// it. The corner has its own square handle painted over the two edge strips it overlaps, so
// it drives BOTH axes — the edge strips still drive one axis each.
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

  // A pen would pan too and is fixed by the same touch-action, but CDP's injected pen
  // events skip the compositor gesture path, so only touch can show it here.
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
