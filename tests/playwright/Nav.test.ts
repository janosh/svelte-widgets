import type { Locator, Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

// oxlint-disable-next-line vitest/prefer-each -- Playwright test has no each API
for (const [stored_theme, color_scheme] of [
  [`dark`, `light`],
  [`system`, `dark`],
] as const) {
  test(`${stored_theme} theme is applied before body parsing and hydration`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: color_scheme })
    await page.addInitScript((theme_mode) => {
      localStorage.setItem(`theme`, theme_mode)
      const snapshot_promise = new Promise((resolve) => {
        const observer = new MutationObserver(() => {
          const theme = document.documentElement?.dataset.theme
          if (!theme) return
          observer.disconnect()
          resolve({
            body_present: Boolean(document.body),
            theme,
          })
        })
        observer.observe(document, { attributes: true, childList: true, subtree: true })
      })
      Object.assign(globalThis, { __theme_prepaint_snapshot: snapshot_promise })
    }, stored_theme)
    await page.goto(`/`)
    const snapshot = await page.evaluate(() => {
      const browser_global = globalThis as typeof globalThis & {
        __theme_prepaint_snapshot: Promise<{ body_present: boolean; theme: string }>
      }
      return browser_global.__theme_prepaint_snapshot
    })
    expect(snapshot).toEqual({
      body_present: false,
      theme: `dark`,
    })
  })
}

test(`generated Nav and MultiSelect ids survive hydration`, async ({ page }) => {
  const hydration_warnings: string[] = []
  page.on(`console`, (message) => {
    const text = message.text()
    if (/hydration_attribute_changed|changed.*server.*client/iu.test(text)) {
      hydration_warnings.push(text)
    }
  })
  // This route renders MultiSelect directly during SSR; live-example routes mount
  // their demo components client-side and cannot expose an SSR/client ID mismatch.
  const response = await page.goto(`/range-select`, { waitUntil: `networkidle` })
  const server_html = await response?.text()
  if (!server_html) throw new Error(`Missing SSR response body for /range-select`)
  const server_panel_id = /aria-controls="(?<panel_id>nav-menu-[^"]+)"/u.exec(server_html)
    ?.groups?.panel_id
  const server_listbox_id = /id="(?<listbox_id>sms-[^"]+-listbox)"/u.exec(server_html)
    ?.groups?.listbox_id

  const nav_toggle = page.locator(`button.burger`)
  const panel_id = await nav_toggle.getAttribute(`aria-controls`)
  expect(panel_id).toMatch(/^nav-menu-/u)
  expect(panel_id).toBe(server_panel_id)
  await expect(page.locator(`[id="${panel_id}"]`)).toHaveCount(1)

  const input = page.locator(`main input[autocomplete]`)
  const listbox_id = await input.getAttribute(`aria-controls`)
  expect(listbox_id).toMatch(/^sms-.+-listbox$/u)
  expect(listbox_id).toBe(server_listbox_id)
  await expect(page.locator(`[id="${listbox_id}"]`)).toHaveCount(1)

  await input.click()
  await input.press(`ArrowDown`)
  const active_id = await input.getAttribute(`aria-activedescendant`)
  expect(active_id).toMatch(/^sms-.+-opt-/u)
  await expect(page.locator(`[id="${active_id}"]`)).toHaveCount(1)
  expect(hydration_warnings).toEqual([])
})

test.describe(`Nav dropdown`, () => {
  const hover_open = async (
    page: Page,
    dropdown: Locator,
    menu: Locator,
  ): Promise<void> => {
    const trigger = dropdown.locator(`:scope > div`).first()
    await expect(trigger).toBeVisible()
    await expect(async () => {
      await page.mouse.move(0, 0)
      await trigger.hover()
      await expect(menu).toHaveCSS(`display`, `flex`, { timeout: 500 })
    }).toPass({ timeout: 10_000 })
  }

  test(`opens on hover and closes on mouse leave`, async ({ page }) => {
    await page.goto(`/nav`, { waitUntil: `networkidle` })

    const dropdown = page.locator(`.dropdown`).first()
    const menu = dropdown.locator(`[data-submenu]`)

    await expect(menu).toHaveCSS(`display`, `none`)
    await hover_open(page, dropdown, menu)
    await expect(menu.locator(`a`).first()).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(menu).toHaveCSS(`display`, `none`)
  })

  test(`click pins dropdown until outside, Escape, or toggle closes it`, async ({
    page,
  }) => {
    await page.goto(`/nav`, { waitUntil: `networkidle` })

    const dropdown = page.locator(`.dropdown`).first()
    const menu = dropdown.locator(`[data-submenu]`)
    const toggle = dropdown.locator(`[data-dropdown-toggle]`)
    const toggle_metrics = await toggle.evaluate((button) => {
      const icon = button.querySelector(`svg`)
      if (!icon) throw new Error(`Dropdown toggle has no icon`)
      const label = button.previousElementSibling
      if (!label) throw new Error(`Dropdown toggle has no label`)
      const button_rect = button.getBoundingClientRect()
      const icon_rect = icon.getBoundingClientRect()
      const font_size = Number(getComputedStyle(button).fontSize.replace(`px`, ``))
      return {
        icon_em: icon_rect.width / font_size,
        label_gap: Number(getComputedStyle(label).paddingInlineEnd.replace(`px`, ``)),
        leading_gap: icon_rect.left - button_rect.left,
        trailing_gap: button_rect.right - icon_rect.right,
      }
    })
    expect(toggle_metrics.icon_em).toBeGreaterThanOrEqual(0.95)
    expect(toggle_metrics.label_gap).toBeLessThan(3)
    expect(toggle_metrics.leading_gap).toBeLessThan(1)
    expect(toggle_metrics.trailing_gap).toBeLessThan(1)

    await toggle.click()
    await expect(menu).toHaveCSS(`display`, `flex`)
    await expect(toggle).toHaveCSS(`transform`, `none`)
    await expect(toggle.locator(`svg`)).not.toHaveCSS(`transform`, `none`)
    await page.mouse.move(0, 0)
    await expect(menu).toHaveCSS(`display`, `flex`)

    await page.locator(`body`).click({ position: { x: 10, y: 10 } })
    await expect(menu).toHaveCSS(`display`, `none`)

    await toggle.click()
    await page.keyboard.press(`Escape`)
    await expect(menu).toHaveCSS(`display`, `none`)

    await toggle.click()
    await toggle.click()
    await expect(menu).toHaveCSS(`display`, `none`)
  })
})
