import { expect, test } from '@playwright/test'

test(`theming page lists variables and filters them by name`, async ({ page }) => {
  await page.goto(`/theming`, { waitUntil: `networkidle` })
  await expect(
    page.getByRole(`cell`, { name: `--tooltip-bg`, exact: true }),
  ).toBeVisible()

  await page.getByRole(`searchbox`, { name: `Filter variables` }).fill(`nav-burger`)
  const sections = page.locator(`section:has(table)`)
  await expect(sections).toHaveCount(1)
  await expect(page.getByRole(`table`, { name: `Nav` })).toBeVisible()
  await expect(page.getByRole(`table`, { name: `Shared tokens` })).toHaveCount(0)
})
