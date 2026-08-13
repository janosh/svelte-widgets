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
  await expect(sheet).toHaveCSS(`right`, `0px`)
  await expect(sheet).toHaveCSS(`border-radius`, `0px`)

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

test(`Dialog supports every backdrop and Escape dismissal policy`, async ({ page }) => {
  for (const [close_on_backdrop, close_on_escape] of [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ] as const) {
    const demo = page.locator(`#patterns-dialog`)
    await demo.getByLabel(`Backdrop dismissal`).setChecked(close_on_backdrop)
    await demo.getByLabel(`Escape dismissal`).setChecked(close_on_escape)
    const opener = demo.getByRole(`button`, { name: `Edit profile` })
    const dialog = page.getByRole(`dialog`, { name: `Edit profile` })

    await opener.click()
    await page.keyboard.press(`Escape`)
    if (close_on_escape) {
      await expect(dialog).toBeHidden()
      await expect(demo.getByText(`Last close: escape`)).toBeVisible()
      await opener.click()
    } else await expect(dialog).toBeVisible()

    await page.mouse.click(1, 1)
    if (close_on_backdrop) {
      await expect(dialog).toBeHidden()
      await expect(demo.getByText(`Last close: pointer`)).toBeVisible()
    } else {
      await expect(dialog).toBeVisible()
      await dialog.getByRole(`button`, { name: `Close` }).click()
    }
  }
})

test(`a stale native close event cannot close a reopened Dialog`, async ({ page }) => {
  const demo = page.locator(`#patterns-dialog`)
  const opener = demo.getByRole(`button`, { name: `Edit profile` })
  await opener.click()

  await page.evaluate(async () => {
    const dialog_opener = document.querySelector<HTMLButtonElement>(
      `#patterns-dialog button`,
    )
    const old_dialog = document.querySelector<HTMLDialogElement>(`dialog.dialog`)
    const close_button = old_dialog?.querySelector<HTMLButtonElement>(`button`)
    if (!dialog_opener || !old_dialog || !close_button) {
      throw new Error(`Dialog controls not found`)
    }
    const closed = new Promise<void>((resolve) => {
      old_dialog.addEventListener(`close`, () => resolve(), { once: true })
    })
    close_button.click()
    await closed
    await new Promise(requestAnimationFrame)
    dialog_opener.click()
    await new Promise(requestAnimationFrame)
    old_dialog.dispatchEvent(new Event(`close`))
  })

  const dialog = page.getByRole(`dialog`, { name: `Edit profile` })
  await expect(dialog).toBeVisible()
  await page.waitForTimeout(100)
  await expect(dialog).toBeVisible()
})
