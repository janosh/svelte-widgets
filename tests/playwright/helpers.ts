// Shared Playwright helpers (no `.test.` suffix, so the runner never collects this file)
import { expect, type Locator, type Page } from '@playwright/test'

export type Point = { x: number; y: number }

// On a loaded runner even networkidle fires long before hydration ends, so wait for the
// marker the root layout sets on mount before interacting with a docs page
const hydrated = (page: Page) =>
  page.locator(`html[data-hydrated]`).waitFor({ state: `attached` })

export const goto = async (
  page: Page,
  url: string,
  options?: Parameters<Page[`goto`]>[1],
) => {
  const response = await page.goto(url, options)
  await hydrated(page)
  return response
}

export const reload = async (page: Page) => {
  await page.reload()
  await hydrated(page)
}

export const box_of = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`Missing layout box for ${locator}`)
  return box
}

export const center_of = async (locator: Locator): Promise<Point> => {
  const { x, y, width, height } = await box_of(locator)
  return { x: x + width / 2, y: y + height / 2 }
}

export const mouse_drag = async (
  page: Page,
  from: Point,
  [dx, dy]: readonly number[],
  steps = 1,
) => {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x + dx, from.y + dy, { steps })
  await page.mouse.up()
}

// Playwright's touchscreen only taps, so a touch drag goes through CDP (Chromium only)
export const touch_drag = async (
  page: Page,
  from: Point,
  [dx, dy]: readonly number[],
) => {
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

// retry until hydration has attached the delegated pointer listeners
export const hover_until = (page: Page, target: Locator, check: () => Promise<void>) =>
  expect(async () => {
    await page.mouse.move(0, 0) // move off the target so pointerover re-fires
    await target.hover()
    await check()
  }).toPass({ timeout: 15_000 })
