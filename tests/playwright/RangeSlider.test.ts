import { expect, test, type Locator, type Page } from '@playwright/test'

const box_of = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`Missing layout box for ${locator}`)
  return box
}
const drag_to = async (page: Page, thumb: Locator, destination: number) => {
  await thumb.scrollIntoViewIfNeeded()
  const box = await box_of(thumb)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(destination, box.y + box.height / 2, { steps: 8 })
  await page.mouse.up()
}

test.beforeEach(async ({ page, baseURL }) => {
  await page.goto(new URL(`/range-slider`, baseURL ?? `http://localhost:3005`).href, {
    waitUntil: `networkidle`,
  })
  // Wait for hydration rather than mistaking SSR markup for a working control.
  const lower = page.getByRole(`slider`, { name: `Nightly budget From` })
  await expect(async () => {
    await lower.press(`Home`)
    await expect(lower).toHaveAttribute(`aria-valuenow`, `0`)
  }).toPass()
  await page.getByRole(`button`, { name: `Reset`, exact: true }).click()
})

test(`mouse dragging captures outside the rail, commits once, and keeps handles ordered`, async ({
  page,
}) => {
  const group = page.getByRole(`group`, { name: `Nightly budget`, exact: true })
  const [lower, upper] = [
    group.getByRole(`slider`).nth(0),
    group.getByRole(`slider`).nth(1),
  ]
  const rail = await box_of(group.locator(`.rail`))
  const before = Number(
    (await page.locator(`.commit-count`).textContent())?.split(` `)[0],
  )
  const handle = await box_of(lower)
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(rail.x + rail.width * 0.4, handle.y + handle.height / 2)
  await expect(lower).toHaveAttribute(`aria-valuenow`, `200`)
  await expect(page.locator(`.commit-count`)).toHaveText(`${before} commits`)
  await page.mouse.move(rail.x + rail.width + 150, handle.y + 100)
  await expect(lower).toHaveAttribute(`aria-valuenow`, `360`)
  await page.mouse.up()
  await expect(page.locator(`.commit-count`)).toHaveText(`${before + 1} commits`)
  await expect(upper).toHaveAttribute(`aria-valuemin`, `360`)
  await expect(group.getByRole(`spinbutton`).nth(0)).toHaveValue(`360`)
})

test(`track clicks, keyboard bounds, focus order, and decimal numeric drafts work together`, async ({
  page,
}) => {
  const group = page.getByRole(`group`, { name: `Temperature window`, exact: true })
  const [lower, upper] = [
    group.getByRole(`slider`).nth(0),
    group.getByRole(`slider`).nth(1),
  ]
  await lower.focus()
  await page.keyboard.press(`Tab`)
  await expect(upper).toBeFocused()
  await upper.press(`Home`)
  await expect(upper).toHaveAttribute(`aria-valuenow`, `-5`)
  await upper.press(`End`)
  await expect(upper).toHaveAttribute(`aria-valuenow`, `50`)
  await lower.press(`Shift+ArrowRight`)
  await expect(lower).toHaveAttribute(`aria-valuenow`, `0`)
  const field = group.getByRole(`spinbutton`).nth(0)
  await field.fill(`12.3`)
  await field.press(`ArrowUp`)
  await expect(field).toHaveValue(`12.5`)
  await field.fill(`18`)
  await field.press(`Escape`)
  await expect(field).toHaveValue(`12.5`)
  await field.fill(``)
  await field.blur()
  await expect(field).toHaveValue(`12.5`)
  const rail = await box_of(group.locator(`.rail`))
  await page.mouse.click(rail.x, rail.y + rail.height / 2)
  await expect(lower).toHaveAttribute(`aria-valuenow`, `-30`)
  await expect(lower).toBeFocused()
})

test(`coincident handles separate both ways and remain separately keyboard reachable`, async ({
  page,
}) => {
  const group = page.getByRole(`group`, { name: `Meeting in the middle`, exact: true })
  const thumbs = group.getByRole(`slider`)
  const rail = await box_of(group.locator(`.rail`))
  await drag_to(page, thumbs.nth(0), rail.x + rail.width * 0.25)
  await expect(thumbs.nth(0)).toHaveAttribute(`aria-valuenow`, `25`)
  await expect(thumbs.nth(1)).toHaveAttribute(`aria-valuenow`, `50`)
  await page.getByRole(`button`, { name: `Overlap handles` }).click()
  await drag_to(page, thumbs.nth(0), rail.x + rail.width * 0.75)
  await expect(thumbs.nth(0)).toHaveAttribute(`aria-valuenow`, `50`)
  await expect(thumbs.nth(1)).toHaveAttribute(`aria-valuenow`, `75`)
  await thumbs.nth(0).focus()
  await page.keyboard.press(`Tab`)
  await expect(thumbs.nth(1)).toBeFocused()
})

// Playwright has no test.each API.
// eslint-disable-next-line vitest/prefer-each
for (const direction of [`attribute`, `css`] as const) {
  test(`RTL ${direction} aligns handles with the track and mirrors keys and dragging`, async ({
    page,
  }) => {
    const group = page.getByRole(`group`, { name: `Nightly budget`, exact: true })
    await group.evaluate((element, mode) => {
      if (mode === `attribute`) element.setAttribute(`dir`, `rtl`)
      else element.style.direction = `rtl`
    }, direction)
    const lower = group.getByRole(`slider`).nth(0)
    const rail = await box_of(group.locator(`.rail`))
    const handle = await box_of(lower)
    expect(
      Math.abs(handle.x + handle.width / 2 - (rail.x + rail.width * 0.76)),
    ).toBeLessThan(1)
    await lower.press(`ArrowLeft`)
    await expect(lower).toHaveAttribute(`aria-valuenow`, `130`)
    await lower.press(`ArrowUp`)
    await expect(lower).toHaveAttribute(`aria-valuenow`, `140`)
    await drag_to(page, lower, rail.x + rail.width * 0.6)
    await expect(lower).toHaveAttribute(`aria-valuenow`, `200`)
  })
}

test(`disabled controls cannot change values and are skipped by Tab`, async ({
  page,
}) => {
  const group = page.getByRole(`group`, { name: `Nightly budget`, exact: true })
  await page.getByLabel(`Lock this range`).check()
  for (const control of await group.locator(`button, input`).all())
    await expect(control).toBeDisabled()
  await page.getByRole(`button`, { name: `Reset`, exact: true }).focus()
  await page.keyboard.press(`Tab`)
  await expect(page.getByLabel(`Lock this range`)).toBeFocused()
  const rail = await box_of(group.locator(`.rail`))
  await page.mouse.click(rail.x + rail.width / 2, rail.y + rail.height / 2)
  await expect(group.getByRole(`slider`).nth(0)).toHaveAttribute(`aria-valuenow`, `120`)
  await page.getByLabel(`Lock this range`).uncheck()
  await group.getByRole(`slider`).nth(0).press(`ArrowRight`)
  await expect(group.getByRole(`slider`).nth(0)).toHaveAttribute(`aria-valuenow`, `130`)
})

test(`mobile touch dragging works with 44px targets and no horizontal overflow`, async ({
  browser,
  browserName,
  baseURL,
}) => {
  test.skip(
    browserName !== `chromium`,
    `Real touch dragging uses Chromium's CDP input API`,
  )
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  })
  const page = await context.newPage()
  await page.goto(new URL(`/range-slider`, baseURL ?? `http://localhost:3005`).href, {
    waitUntil: `networkidle`,
  })
  const group = page.getByRole(`group`, { name: `Nightly budget`, exact: true })
  const lower = group.getByRole(`slider`).nth(0)
  await group.scrollIntoViewIfNeeded()
  const rail = await box_of(group.locator(`.rail`))
  const handle = await box_of(lower)
  expect(handle.width).toBeGreaterThanOrEqual(44)
  expect(handle.height).toBeGreaterThanOrEqual(44)
  const session = await context.newCDPSession(page)
  const start = { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 }
  await session.send(`Input.dispatchTouchEvent`, {
    type: `touchStart`,
    touchPoints: [start],
  })
  await session.send(`Input.dispatchTouchEvent`, {
    type: `touchMove`,
    touchPoints: [{ x: rail.x + rail.width * 0.4, y: start.y }],
  })
  await session.send(`Input.dispatchTouchEvent`, { type: `touchEnd`, touchPoints: [] })
  await expect(lower).toHaveAttribute(`aria-valuenow`, `200`)
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
  ).toBe(true)
  await context.close()
})

test(`focus, reduced motion and forced colors retain visible handles`, async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: `reduce`, forcedColors: `active` })
  const lower = page.getByRole(`slider`, { name: `Nightly budget From` })
  await page.getByRole(`button`, { name: `Reset`, exact: true }).focus()
  await page.keyboard.press(`Tab`)
  await expect(lower).toBeFocused()
  const styles = await lower.locator(`.knob`).evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      outline: style.outlineStyle,
      outline_width: style.outlineWidth,
      transition: style.transitionDuration,
      border: style.borderTopWidth,
    }
  })
  expect(styles).toEqual({
    outline: `solid`,
    outline_width: `2px`,
    transition: `0s`,
    border: `3px`,
  })
})

test(`native forms accept off-grid endpoints and reset the complete interval`, async ({
  page,
}) => {
  const group = page.getByRole(`group`, { name: `Batch size`, exact: true })
  const form = page.locator(`form.card`)
  const upper = group.getByRole(`slider`).nth(1)
  const input = group.getByRole(`spinbutton`).nth(1)
  expect(
    await form.evaluate((element) => (element as HTMLFormElement).checkValidity()),
  ).toBe(true)
  await upper.press(`ArrowLeft`)
  await expect(upper).toHaveAttribute(`aria-valuenow`, `9`)
  await input.fill(`4`)
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(input).toHaveValue(`10`)
  await expect(upper).toHaveAttribute(`aria-valuenow`, `10`)
  await form.evaluate((element) =>
    element.addEventListener(`reset`, (event) => event.preventDefault(), {
      once: true,
      capture: true,
    }),
  )
  await input.fill(`4`)
  await form.evaluate((element) => (element as HTMLFormElement).reset())
  await expect(input).toHaveValue(`4`)
})

test(`fieldset disabling blocks rail gestures and respects the first legend exemption`, async ({
  page,
}) => {
  const group = page.getByRole(`group`, { name: `Nightly budget`, exact: true })
  await group.evaluate((element) => {
    const fieldset = document.createElement(`fieldset`)
    fieldset.disabled = true
    element.before(fieldset)
    fieldset.append(element)
  })
  const lower = group.getByRole(`slider`).nth(0)
  await expect(lower).toBeDisabled()
  const rail = await box_of(group.locator(`.rail`))
  await page.mouse.click(rail.x + rail.width * 0.4, rail.y + rail.height / 2)
  await expect(lower).toHaveAttribute(`aria-valuenow`, `120`)
  await group.evaluate((element) => {
    const legend = document.createElement(`legend`)
    element.before(legend)
    legend.append(element)
  })
  await expect(lower).toBeEnabled()
  await lower.press(`ArrowRight`)
  await expect(lower).toHaveAttribute(`aria-valuenow`, `130`)
})
