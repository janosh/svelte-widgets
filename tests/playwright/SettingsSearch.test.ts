import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { goto } from './helpers'

// The corner trigger and the filtered-row override are pure CSS, which happy-dom applies no
// layout for. Every locator is scoped to this demo: other examples repeat these classes.

const open_demo = async (page: Page) => {
  await goto(page, `/settings`, { waitUntil: `networkidle` })
  const demo = page.locator(`#settings-search`).first()
  // `networkidle` lands before Markdown compiles the live examples on a cold dev server
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

// which rows match is unit-tested; this pins the CSS that hides and reveals them
test(`filtering hides rows and groups, then Escape restores focus and rows`, async ({
  page,
}) => {
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
  await expect(zoom_row).toBeVisible()
  await expect(color_row).toBeHidden()

  await page.keyboard.press(`Escape`)
  await expect(field).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(color_row).toBeVisible()
})

test(`per-setting reset buttons preserve control width and restore keyboard focus`, async ({
  page,
}) => {
  await goto(page, `/settings`)
  const row = page.locator(`#settings-section [data-key="radius"]`)
  const input = row.locator(`input`)
  const reset = row.locator(`.setting-reset-button`)
  await expect(row).toHaveClass(/setting-resettable/u)
  const control_width = (await box_of(input)).width
  await input.press(`ArrowUp`)
  await expect(reset).toBeVisible()
  expect((await box_of(input)).width).toBe(control_width)
  await reset.focus()
  await page.keyboard.press(`Enter`)
  await expect(reset).toHaveCount(0)
  await expect(input).toBeFocused()
  expect((await box_of(input)).width).toBe(control_width)
})

test(`grid sections pack lone-checkbox rows into columns and put legends in the label track`, async ({
  page,
}) => {
  await goto(page, `/settings`, { waitUntil: `networkidle` })
  const demo = page.locator(`#settings-section`)
  const section = demo.locator(`.settings-section`)
  await expect(section).toBeVisible()
  const boxes = () =>
    section.evaluate((element) => {
      const rect = (selector?: string) => {
        const node = selector ? element.querySelector(selector) : element
        if (!node) throw new Error(`missing ${selector}`)
        const { left, top, bottom, width } = node.getBoundingClientRect()
        return { left, top, bottom, width }
      }
      return {
        labels: rect(`[data-key="show_labels"]`),
        labels_box: rect(`[data-key="show_labels"] input`),
        labels_text: rect(`[data-key="show_labels"] span`),
        bonds: rect(`[data-key="show_bonds"]`),
        radius: rect(`[data-key="radius"]`),
        radius_text: rect(`[data-key="radius"] span`),
        radius_input: rect(`[data-key="radius"] input`),
        legend: rect(`[data-key="color"] legend`),
        swatch: rect(`[data-key="color"] .swatch`),
        color_controls: rect(`[data-key="color"] .controls`),
        section: rect(),
      }
    })
  const packed = await boxes()
  // checkbox rows share a line, each narrower than the section, box before its text
  expect(packed.bonds.top).toBe(packed.labels.top)
  expect(packed.bonds.left).toBeGreaterThan(packed.labels.left)
  expect(packed.labels.width).toBeLessThanOrEqual(packed.section.width / 2)
  expect(packed.labels_box.left).toBeLessThan(packed.labels_text.left)
  // other rows still span the section
  expect(packed.radius.width).toBe(packed.section.width)
  // the color legend sits in the label track, its swatch in the value track
  expect(packed.legend.left).toBe(packed.radius_text.left)
  expect(packed.swatch.left).toBe(packed.radius_input.left)
  expect(packed.legend.top).toBeLessThan(packed.swatch.bottom)
  expect(packed.swatch.top).toBeLessThan(packed.legend.bottom)

  // an invalid hex adds an error after the controls; both stay in the value tracks
  const hex = demo.getByRole(`textbox`, { name: `Hex color` })
  await hex.fill(`#zz`)
  const error = demo.locator(`[data-key="color"] small`)
  await expect(error).toBeVisible()
  const invalid = await boxes()
  expect(invalid.color_controls.width).toBe(packed.color_controls.width)
  expect((await error.boundingBox())?.x).toBe(packed.swatch.left)
  await hex.press(`Escape`)

  // a changed row shows its reset button and stays packed, so toggling doesn't move it
  await demo.locator(`[data-key="show_labels"] input`).click()
  await expect(
    demo.locator(`[data-key="show_labels"] .setting-reset-button`),
  ).toBeVisible()
  const changed = await boxes()
  expect(changed.labels.width).toBe(packed.labels.width)
  expect(changed.bonds.top).toBe(changed.labels.top)

  // a shown description needs the width, so checkbox rows span again, changed ones included
  await demo.locator(`.description-toggle`).click()
  const spread = await boxes()
  expect(spread.labels.width).toBe(spread.section.width)
  expect(spread.bonds.top).toBeGreaterThan(spread.labels.top)
})
