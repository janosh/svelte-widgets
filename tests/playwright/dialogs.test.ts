import { expect, test } from '@playwright/test'

test(`ConfirmDialog advances queued focus and restores the opener`, async ({ page }) => {
  await page.goto(`/dialogs`, { waitUntil: `networkidle` })
  const opener = page.getByRole(`button`, { name: `Ask both at once` })
  await opener.click()

  const dialog = page.locator(`dialog.confirm-dialog`)
  await expect(dialog.locator(`h2`)).toHaveCSS(`margin-top`, `0px`)
  await expect(dialog).toHaveCSS(`padding`, `12px`)
  const delete_button = dialog.getByRole(`button`, { name: `Delete` })
  expect((await delete_button.boundingBox())?.height ?? Infinity).toBeLessThan(32)
  await delete_button.click()
  await expect(dialog.getByRole(`button`, { name: `Keep editing` })).toBeFocused()
  await page.keyboard.press(`Escape`)
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})
