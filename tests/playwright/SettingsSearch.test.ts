import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

// The corner trigger and the filtered-row override are pure CSS, which happy-dom applies no
// layout for. Every locator is scoped to this demo: other examples repeat these classes.

const open_demo = async (page: Page) => {
  await page.goto(`/settings`, { waitUntil: `networkidle` })
  const demo = page.locator(`#settings-search`).first()
  // `networkidle` lands before mdsvex compiles the live examples on a cold dev server
  await expect(demo).toBeVisible()
  await demo.scrollIntoViewIfNeeded()
  return {
    pane: demo.locator(`.settings-search`).first(),
    trigger: demo.locator(`.open-search`),
    field: demo.locator(`input[type="search"]`),
    color_row: demo.locator(`[data-key="color_scheme"]`),
    radius_row: demo.locator(`[data-key="atom_radius"]`),
    zoom_row: demo.locator(`[data-key="zoom"]`),
    camera: demo.locator(`.group-title`, { hasText: `Camera` }),
    group: demo.locator(`details.settings-group`).first(),
  }
}

const box_of = async (locator: Locator) => {
  const box = await locator.boundingBox()
  if (!box) throw new Error(`no box for ${locator}`)
  return box
}

test(`the corner trigger expands into the content flow`, async ({ page }) => {
  const { pane, trigger, field, group } = await open_demo(page)
  const pane_box = await box_of(pane)
  const trigger_box = await box_of(trigger)
  const group_before = await box_of(group)

  // collapsed: flush with the pane's top-right corner and out of flow, so the first group
  // starts at the pane's top edge rather than below the icon
  expect(trigger_box.x + trigger_box.width).toBeCloseTo(pane_box.x + pane_box.width, 0)
  expect(trigger_box.y).toBeCloseTo(pane_box.y, 0)
  expect(group_before.y).toBeLessThan(trigger_box.y + trigger_box.height)

  await trigger.click()

  // open: a full-width field that pushes the content below it down
  expect((await box_of(field)).width).toBeGreaterThan(pane_box.width * 0.8)
  expect((await box_of(group)).y).toBeGreaterThan(group_before.y)
})

test(`filtering paints rows away and matches on group titles`, async ({ page }) => {
  const { trigger, field, color_row, radius_row, zoom_row, camera } =
    await open_demo(page)
  await trigger.click()
  await expect(color_row).toBeVisible()

  await field.fill(`radius`)

  // `data-search-hidden` alone loses to the `display: grid` a grid section puts on its rows
  await expect(color_row).toBeHidden()
  await expect(radius_row).toBeVisible()
  await expect(camera).toBeHidden() // the group holding no match goes with it

  // no row says "camera"; only the group heading does, and matching it opens the group
  await field.fill(`camera`)

  await expect(camera).toBeVisible()
  await expect(color_row).toBeHidden()
  await expect(zoom_row).toBeVisible()
})

test(`Escape collapses the field and hands focus back to the trigger`, async ({
  page,
}) => {
  const { trigger, field, color_row } = await open_demo(page)
  await trigger.click()
  await field.fill(`radius`)
  await expect(color_row).toBeHidden()

  await page.keyboard.press(`Escape`)

  await expect(field).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(color_row).toBeVisible()
})
