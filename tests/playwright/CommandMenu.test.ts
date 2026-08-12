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

// close_if_outside reads composedPath() rather than event.target, which only matters once
// the menu sits in a shadow root: by the time the click reaches window its target is the
// host element, so containment against the dialog fails. happy-dom retargets nothing, so
// this contract is only observable in a real browser.
test(`a click inside the menu keeps it open from within a shadow root`, async ({
  page,
}) => {
  await page.goto(`/shadow-dom`, { waitUntil: `networkidle` })
  const menu = page.locator(`#shadow-host dialog`)
  await expect(menu).toBeVisible()

  // force: the host is what hit-testing reports at these coordinates, so Playwright refuses
  // the click as intercepted — the browser still targets the input and retargets to the host
  await menu.getByRole(`combobox`).click({ force: true })
  await expect(menu).toBeVisible()

  // dispatched, not clicked: the modal backdrop covers the heading, so a real click there
  // closes through backdrop_dismiss and would pass with close_if_outside gone
  await page.locator(`h2`).dispatchEvent(`click`)
  await expect(menu).toBeHidden()
})
