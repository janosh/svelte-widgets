import { expect, test } from '@playwright/test'

test.beforeEach(({ page }) => page.goto(`/patterns`, { waitUntil: `networkidle` }))

test(`FindBar registers the matching range`, async ({ page }) => {
  const demo = page.locator(`#patterns-find-bar`)
  await demo.getByRole(`searchbox`).fill(`browser's own`)

  await expect
    .poll(() =>
      page.evaluate(() => Array.from(CSS.highlights.get(`find-match`) ?? [], String)),
    )
    .toEqual([`browser's own`])
})

test(`Sheet backdrop closes and restores focus`, async ({ page }) => {
  const opener = page
    .locator(`#patterns-sheet`)
    .getByRole(`button`, { name: `Open settings` })
  await opener.click()

  const sheet = page.getByRole(`dialog`, { name: `Settings` })
  await expect(sheet.getByRole(`button`, { name: `Close` })).toBeFocused()

  await page.mouse.click(1, 1)
  await expect(sheet).toBeHidden()
  await expect(opener).toBeFocused()
})
