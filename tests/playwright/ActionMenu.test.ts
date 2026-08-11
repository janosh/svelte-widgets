import { expect, test } from '@playwright/test'

test(`Tab closes ActionMenu and continues page order`, async ({ page }) => {
  await page.goto(`/popover`, { waitUntil: `networkidle` })
  const demo = page.locator(`#action-menu-basic`)
  await demo.getByRole(`button`, { name: `Edit actions` }).click()
  await expect(demo.getByRole(`menuitem`, { name: `Cut` })).toBeFocused()

  await page.keyboard.press(`Tab`)
  await expect(demo.getByRole(`menu`)).toBeHidden()
  await expect(demo.getByRole(`button`, { name: `After menu` })).toBeFocused()
})

test(`right-button press outside dismisses a context ActionMenu`, async ({ page }) => {
  await page.goto(`/popover`, { waitUntil: `networkidle` })
  const demo = page.locator(`#action-menu-basic`)
  await demo.getByText(`Right-click me`, { exact: true }).click({ button: `right` })
  await expect(demo.getByRole(`menu`)).toBeVisible()

  await page.mouse.click(1, 1, { button: `right` })
  await expect(demo.getByRole(`menu`)).toBeHidden()
})
