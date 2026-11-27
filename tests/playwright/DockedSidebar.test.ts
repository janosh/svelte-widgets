import { expect, test } from '@playwright/test'
import { goto } from './helpers'

// Real :has() cascade, which happy-dom lacks: --docked-sidebar-radius rounds the docked pair's
// outer corners and keeps their shared edge square, beside (either direction) and stacked
test(`--docked-sidebar-radius rounds the outer corners beside and stacked`, async ({
  page,
}) => {
  await goto(page, `/split-pane`, { waitUntil: `networkidle` })
  const row = page.locator(`#docked-sidebar .docked-sidebar-row`)
  const main_pane = row.locator(`> section`)
  const sidebar = row.locator(`> .docked-sidebar`)
  await expect(main_pane).toHaveCSS(`border-radius`, `8px 0px 0px 8px`)
  await expect(sidebar).toHaveCSS(`border-radius`, `0px 8px 8px 0px`)
  // right-to-left mirrors the row, so the outer corners swap sides
  await row.evaluate((node: HTMLElement) => (node.dir = `rtl`))
  await expect(main_pane).toHaveCSS(`border-radius`, `0px 8px 8px 0px`)
  await expect(sidebar).toHaveCSS(`border-radius`, `8px 0px 0px 8px`)
  await row.evaluate((node: HTMLElement) => (node.dir = ``))
  // under the 580px of both minimums, the sidebar stacks below the main pane
  await row.evaluate((node: HTMLElement) => (node.style.width = `400px`))
  await expect(row).toHaveClass(/docked-sidebar-stacked/)
  await expect(main_pane).toHaveCSS(`border-radius`, `8px 8px 0px 0px`)
  await expect(sidebar).toHaveCSS(`border-radius`, `0px 0px 8px 8px`)
})
