import { expect, test } from '@playwright/test'

const SOURCE = `https://github.com/janosh/svelte-widgets/blob/`

test(`inline code mentions of components link to their source, on load and after navigation`, async ({
  page,
}) => {
  const errors: string[] = []
  page.on(`pageerror`, (error) => errors.push(error.message))
  page.on(`console`, (message) => {
    if (message.text().includes(`hydration_`)) errors.push(message.text())
  })
  await page.route(
    `https://api.github.com/repos/janosh/svelte-widgets/contributors*`,
    (route) =>
      route.fulfill({
        json: [
          {
            login: `contributor`,
            html_url: `https://github.com/contributor`,
            avatar_url: ``,
          },
          {
            login: `automation[bot]`,
            html_url: `https://github.com/bot`,
            avatar_url: ``,
          },
        ],
      }),
  )
  await page.goto(`/`)
  // Direct headings remain eligible for the site's table of contents.
  await expect(page.locator(`main > h2`).filter({ hasText: `Demos` })).toBeVisible()
  await expect(page.getByRole(`button`, { name: `View code` }).first()).toBeVisible()
  await expect(
    page.getByRole(`link`, { name: `contributor`, exact: true }),
  ).toHaveAttribute(`href`, `https://github.com/contributor`)
  await expect(page.getByRole(`link`, { name: `automation[bot]` })).toHaveCount(0)
  expect(errors).toEqual([])
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
  await page.getByRole(`button`, { name: `Toggle Overlays submenu` }).hover()
  await page.locator(`header nav a[href="/dialogs"]`).first().click()
  await expect(page).toHaveURL(/\/dialogs$/)
  await expect(
    page.locator(`code > a[href$="/src/lib/ConfirmDialog.svelte"]`).first(),
  ).toBeVisible()
  expect(errors).toEqual([])
})
