import { expect, test } from '@playwright/test'

test(`page navigation links use the blue accent`, async ({ page }) => {
  await page.emulateMedia({ colorScheme: `light` })
  await page.goto(`/command-menu`, { waitUntil: `networkidle` })
  await expect(page.locator(`nav.prev-next a`).first()).toHaveCSS(
    `color`,
    `rgb(74, 122, 191)`,
  )
})

test(`closing the native dialog restores focus to the opener`, async ({ page }) => {
  await page.goto(`/command-menu`, { waitUntil: `networkidle` })
  const opener = page.getByRole(`button`, { name: `View code` }).first()
  await opener.focus()

  await page.keyboard.press(`Control+n`)
  const dialog = page.getByRole(`dialog`, { name: `Command menu` })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole(`combobox`)).toBeFocused()

  await page.keyboard.press(`Escape`)
  await expect(dialog).toBeHidden()
  await expect(opener).toBeFocused()
})

test(`PageSearch navigates through the generated Pagefind index`, async ({ page }) => {
  test.skip(!process.env.CI, `Pagefind index requires the CI build:site server`)

  await page.goto(`/command-menu`, { waitUntil: `networkidle` })
  await page.keyboard.press(`Control+k`)
  const search = page.getByRole(`dialog`, { name: `Site search` })
  await search.getByRole(`combobox`).fill(`whitespace collapsing`)
  await search.getByRole(`option`, { name: /^Patterns › FindBar\b/u }).click()
  await expect(page).toHaveURL(/\/patterns#findbar$/u)
})

test(`backdrop still dismisses when CommandMenu disables Escape`, async ({ page }) => {
  await page.goto(`/shadow-dom`, { waitUntil: `networkidle` })
  const menu = page.locator(`#shadow-host dialog`)
  await expect(menu).toBeVisible()

  await page.keyboard.press(`Escape`)
  await expect(menu).toBeVisible()

  // force: hit-testing reports the host here so Playwright calls the click intercepted, but
  // the browser still targets the input and retargets the event to the host
  await menu.getByRole(`combobox`).click({ force: true })
  await expect(menu).toBeVisible()

  await page.mouse.click(1, 1)
  await expect(menu).toBeHidden()
})
