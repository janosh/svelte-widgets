import { expect, test } from '@playwright/test'

test(`native Popover dismissal reports pointer and Escape`, async ({ page }) => {
  await page.goto(`/popover`, { waitUntil: `networkidle` })
  const demo = page.locator(`#popover-basic`)
  const trigger = demo.getByRole(`button`, { name: `Open popover` })
  const popover = demo.getByRole(`dialog`)

  await trigger.click()
  await popover.getByPlaceholder(`type something`).click()
  await expect(popover).toBeVisible()
  await page.mouse.click(1, 1)
  await expect(popover).toBeHidden()
  await expect(demo.getByText(/last closed via pointer/u)).toBeVisible()

  await trigger.click()
  await page.keyboard.press(`Escape`)
  await expect(popover).toBeHidden()
  await expect(demo.getByText(/last closed via escape/u)).toBeVisible()
})

test(`nested Popovers report Escape only for the surface it closes`, async ({ page }) => {
  await page.goto(`/popover`, { waitUntil: `networkidle` })
  const demo = page.locator(`#popover-basic`)
  const outer = demo.getByRole(`dialog`).first()
  await demo.getByRole(`button`, { name: `Open popover` }).click()
  await outer.getByRole(`button`, { name: `Open nested popover` }).click()
  const inner = demo.getByRole(`dialog`, { name: `Nested popover` })

  await page.keyboard.press(`Escape`)
  await expect(inner).toBeHidden()
  await expect(outer).toBeVisible()
  await expect(demo.getByText(/nested closed via escape/u)).toBeVisible()

  await page.mouse.click(1, 1)
  await expect(outer).toBeHidden()
  await expect(demo.getByText(/last closed via pointer/u)).toBeVisible()
})

test(`Tab closes ActionMenu and continues page order`, async ({ page }) => {
  await page.goto(`/popover`, { waitUntil: `networkidle` })
  const demo = page.locator(`#action-menu-basic`)
  await demo.getByRole(`button`, { name: `Edit actions` }).click()
  await expect(demo.getByRole(`menuitem`, { name: `Cut` })).toBeFocused()

  await page.keyboard.press(`Tab`)
  await expect(demo.getByRole(`menu`)).toBeHidden()
  await expect(demo.getByRole(`button`, { name: `After menu` })).toBeFocused()
})

test(`right-button press outside dismisses a context ActionMenu`, async ({ page }) => {
  await page.goto(`/popover`, { waitUntil: `networkidle` })
  const demo = page.locator(`#action-menu-basic`)
  await demo.getByText(`Right-click me`, { exact: true }).click({ button: `right` })
  await expect(demo.getByRole(`menu`)).toBeVisible()

  await page.mouse.click(1, 1, { button: `right` })
  await expect(demo.getByRole(`menu`)).toBeHidden()
})
