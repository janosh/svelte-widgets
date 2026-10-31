import { expect, test } from '@playwright/test'
import { goto } from './helpers'

test(`ConfirmDialog advances queued focus and restores the opener`, async ({ page }) => {
  await goto(page, `/dialogs`, { waitUntil: `networkidle` })
  const opener = page.getByRole(`button`, { name: `Ask both at once` })
  await opener.click()

  const dialog = page.locator(`dialog.confirm-dialog`)
  const delete_button = dialog.getByRole(`button`, { name: `Delete` })
  expect((await delete_button.boundingBox())?.height ?? Infinity).toBeLessThan(32)
  await delete_button.click()
  await expect(dialog.getByRole(`button`, { name: `Keep editing` })).toBeFocused()
  await page.keyboard.press(`Escape`)
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

// Browsers fire the native `close` event asynchronously, so a second close() in the same task
// lands while the surface is already shut but `open` is still true
test(`Dialog close() twice in one task closes once without throwing`, async ({
  page,
}) => {
  await goto(page, `/patterns`, { waitUntil: `networkidle` })
  const errors: string[] = []
  page.on(`pageerror`, (error) => errors.push(error.message))
  const demo = page.locator(`#patterns-dialog`)
  await demo.getByRole(`button`, { name: `Edit profile` }).click()
  const dialog = page.getByRole(`dialog`, { name: `Edit profile` })
  const close_events = await dialog.evaluate(async (surface: HTMLDialogElement) => {
    let count = 0
    surface.addEventListener(`close`, () => count++)
    const close_button = surface.querySelector<HTMLButtonElement>(`header button`)
    if (!close_button) throw new Error(`Dialog close button not found`)
    close_button.click()
    close_button.click()
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    return count
  })
  await expect(dialog).toBeHidden()
  expect({ close_events, errors }).toEqual({ close_events: 1, errors: [] })
  await expect(demo.getByText(`Last close: close`)).toBeVisible()
})

// Dialog's class-scoped rule outranked a bare `dialog.sheet` selector, so its margin: auto and
// 2rem max-height inset the sheet from the top and bottom of its edge
test(`a side Sheet spans its whole edge`, async ({ page }) => {
  await goto(page, `/patterns`, { waitUntil: `networkidle` })
  await page
    .locator(`#patterns-sheet`)
    .getByRole(`button`, { name: `Open settings` })
    .click()
  const box = await page.getByRole(`dialog`, { name: `Settings` }).boundingBox()
  expect([box?.y, box?.height]).toEqual([0, page.viewportSize()?.height])
})
