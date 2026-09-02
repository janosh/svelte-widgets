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
  test(`hover leaves the dropdown shut; only a click opens it`, async ({ page }) => {
    await page.goto(`/nav`, { waitUntil: `networkidle` })

    const dropdown = page.locator(`.dropdown`).first()
    const menu = dropdown.locator(`[data-submenu]`)

    await expect(menu).toHaveCSS(`display`, `none`)
    await dropdown.locator(`:scope > div`).first().hover()
    await expect(menu).toHaveCSS(`display`, `none`)

    await dropdown.locator(`[data-dropdown-toggle]`).click()
    await expect(menu.locator(`a`).first()).toBeVisible()
  })

  test(`click opens the dropdown until outside, Escape, or the toggle closes it`, async ({
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

// The pill is painted on `.menu > span`, but the link inside it is `flex: 1`, which fills
// only the content box. Without the link stretching back over the span's padding, that
// padding is a dead band inside the visible row. Only a browser resolves these boxes.
test(`the whole painted mobile row is part of its link's hit area`, async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 })
  await page.goto(`/nav`, { waitUntil: `networkidle` })

  // .click() here races a decorative overlay for the press; the burger's own hit area is
  // not what this test is about, so open the menu directly
  await page
    .locator(`nav.mobile button.burger`)
    .first()
    .evaluate((element: HTMLElement) => element.click())
  const row = page
    .locator(`nav.mobile .menu > span`)
    .filter({ has: page.locator(`a`) })
    .first()
  const link = row.locator(`> a`).first()
  await expect(link).toBeVisible()

  const [row_box, link_box] = await Promise.all([row.boundingBox(), link.boundingBox()])
  if (!row_box || !link_box) throw new Error(`Missing mobile nav row geometry`)
  // the link covers the pill exactly: no padding band left over on any side
  for (const [edge, delta] of Object.entries({
    left: link_box.x - row_box.x,
    top: link_box.y - row_box.y,
    right: row_box.x + row_box.width - (link_box.x + link_box.width),
    bottom: row_box.y + row_box.height - (link_box.y + link_box.height),
  })) {
    expect(
      Math.abs(delta),
      `${edge} of the pill is outside the link`,
    ).toBeLessThanOrEqual(0.5)
  }
})

// The submenu inherits its line-height from the host page, which once made every child row
// taller than the parent it hangs under. Its guide line is one border on the wrapper, and the
// active link recolours a segment of it by sitting exactly on top. Layout-only, so: a browser.
test(`expanded submenu rows are compact and share one continuous guide line`, async ({
  page,
}) => {
  await page.setViewportSize({ width: 420, height: 800 })
  await page.goto(`/nav`, { waitUntil: `networkidle` })
  await page
    .locator(`nav.mobile button.burger`)
    .first()
    .evaluate((element: HTMLElement) => element.click())

  const dropdown = page.locator(`nav.mobile .dropdown`).first()
  const parent_row = dropdown.locator(`> div:first-child`)
  const caret = parent_row.locator(`> button`)
  // the caret is the only way to open a section, so it claims the row's full height and runs
  // out to the painted trailing edge rather than stopping inside the row's padding
  const [caret_box, row_box] = await Promise.all([
    caret.boundingBox(),
    parent_row.boundingBox(),
  ])
  if (!caret_box || !row_box) throw new Error(`Missing mobile dropdown caret geometry`)
  expect(caret_box.height).toBeCloseTo(row_box.height, 0)
  expect(row_box.x + row_box.width - (caret_box.x + caret_box.width)).toBeLessThanOrEqual(
    0.5,
  )
  expect(caret_box.width).toBeGreaterThan(caret_box.height)

  await caret.evaluate((el: HTMLElement) => el.click())
  const links = dropdown.locator(`> div:last-child a`)
  await expect(links.first()).toBeVisible()
  // the section opens over 0.25s; measuring mid-transition reads a wrapper still shorter
  // than the links it clips
  const wrapper_locator = dropdown.locator(`.submenu-inner`)
  await expect
    .poll(async () => (await wrapper_locator.boundingBox())?.height ?? 0)
    .toBeGreaterThan(0)
  await dropdown
    .locator(`> div:last-child`)
    .evaluate((el) =>
      Promise.all(el.getAnimations({ subtree: true }).map((anim) => anim.finished)),
    )

  const parent_box = await parent_row.boundingBox()
  const link_boxes = await links.evaluateAll((els) =>
    els.map((el) => el.getBoundingClientRect().toJSON()),
  )
  const wrapper = await dropdown
    .locator(`.submenu-inner`)
    .evaluate((el) => el.getBoundingClientRect().toJSON())
  if (!parent_box) throw new Error(`Missing mobile dropdown row geometry`)

  for (const box of link_boxes) {
    expect(box.height, `child row is taller than its parent`).toBeLessThanOrEqual(
      parent_box.height,
    )
    // each link's own (transparent, or accent when current) border sits on the wrapper's line
    expect(Math.abs(box.x - wrapper.x)).toBeLessThanOrEqual(0.5)
  }
  // one unbroken line: the wrapper spans from above the first row to below the last
  const last = link_boxes[link_boxes.length - 1]
  expect(wrapper.y).toBeLessThanOrEqual(link_boxes[0].y)
  expect(wrapper.bottom).toBeGreaterThanOrEqual(last.bottom - 0.5)
})
