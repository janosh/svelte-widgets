import { expect, test } from '@playwright/test'

const SOURCE = `https://github.com/janosh/svelte-widgets/blob/`

test(`inline code mentions of components link to their source, on load and after navigation`, async ({
  page,
}) => {
  await page.goto(`/`)
  // the readme's component table names every component in inline code
  const multi_select = page.locator(`code > a`, { hasText: `MultiSelect` }).first()
  await expect(multi_select).toHaveAttribute(
    `href`,
    /^.*\/blob\/[0-9a-f]{40}\/src\/lib\/MultiSelect\.svelte$/,
  )
  await expect(multi_select).toHaveAttribute(`target`, `_blank`)
  expect(await multi_select.getAttribute(`href`)).toContain(SOURCE)
  // code inside pre blocks and existing links stays untouched
  expect(await page.locator(`pre code a`).count()).toBe(0)
  expect(await page.locator(`a code a`).count()).toBe(0)

  // client-side nav swaps the page inside the same wrapper: new mentions link too
  await page.goto(`/popover`)
  await expect(
    page.locator(`code > a[href$="/src/lib/Popover.svelte"]`).first(),
  ).toBeVisible()
  await page.locator(`header nav a[href="/dialogs"]`).first().click()
  await expect(page).toHaveURL(/\/dialogs$/)
  await expect(
    page.locator(`code > a[href$="/src/lib/ConfirmDialog.svelte"]`).first(),
  ).toBeVisible()
})
