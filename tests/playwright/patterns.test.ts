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

test(`nested Dialogs give Escape and focus to the innermost modal`, async ({ page }) => {
  const demo = page.locator(`#patterns-dialog`)
  const opener = demo.getByRole(`button`, { name: `Edit profile` })
  await opener.click()

  const outer = page.getByRole(`dialog`, { name: `Edit profile` })
  const nested_opener = outer.getByRole(`button`, { name: `Advanced` })
  await nested_opener.click()

  const inner = page.getByRole(`dialog`, { name: `Advanced profile settings` })
  await expect(inner).toBeVisible()
  await page.keyboard.press(`Escape`)
  await expect(inner).toBeHidden()
  await expect(outer).toBeVisible()
  await expect(nested_opener).toBeFocused()

  await page.keyboard.press(`Escape`)
  await expect(outer).toBeHidden()
  await expect(opener).toBeFocused()
})

test(`a stale native close event cannot close a reopened Dialog`, async ({ page }) => {
  const demo = page.locator(`#patterns-dialog`)
  const opener = demo.getByRole(`button`, { name: `Edit profile` })
  await opener.click()

  await page.evaluate(async () => {
    const dialog_opener = document.querySelector<HTMLButtonElement>(
      `#patterns-dialog button`,
    )
    const close_button = document.querySelector<HTMLButtonElement>(`dialog.dialog button`)
    if (!dialog_opener || !close_button) throw new Error(`Dialog controls not found`)
    close_button.click()
    await Promise.resolve()
    dialog_opener.click()
  })

  const dialog = page.getByRole(`dialog`, { name: `Edit profile` })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(100)
  await expect(dialog).toBeVisible()
})
