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
