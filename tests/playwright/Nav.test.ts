import { expect, test } from '@playwright/test'

test.use({ baseURL: `http://localhost:3005` })

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
  // Compare the authored SSR IDs with the hydrated controls before interacting.
  const response = await page.goto(`/range-select`, { waitUntil: `commit` })
  const server_html = await response?.text()
  if (!server_html) throw new Error(`Missing SSR response body for /range-select`)
  await page.waitForLoadState(`networkidle`)
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
  test(`long desktop submenus read down two columns and collapse to one on mobile`, async ({
    page,
  }) => {
    await page.goto(`/nav`, { waitUntil: `networkidle` })
    const nav = page.locator(`nav`).first()
    const top_rows = await nav
      .locator(`.menu > span, .menu > .dropdown > div:first-child`)
      .evaluateAll((rows) => rows.map((row) => row.getBoundingClientRect().top))
    expect(top_rows).toHaveLength(7)
    expect(Math.max(...top_rows) - Math.min(...top_rows)).toBeLessThanOrEqual(0.5)
    const menu = nav.locator(`[data-submenu].two-columns`).first()
    const dropdown = menu.locator(`..`)
    const href = await dropdown.getAttribute(`data-href`)
    await dropdown.locator(`> div`).first().hover()
    const links = menu.locator(`a`)
    const boxes = await links.evaluateAll((items) =>
      items.map((item) => item.getBoundingClientRect().toJSON()),
    )
    const n_rows = Math.ceil(boxes.length / 2)
    expect(boxes.length).toBeGreaterThan(10)
    for (const [idx, box] of boxes.entries()) {
      expect(box.x).toBeCloseTo(boxes[idx < n_rows ? 0 : n_rows].x, 0)
      if (idx % n_rows > 0) expect(box.top).toBeGreaterThan(boxes[idx - 1].top)
    }
    expect(boxes[n_rows].x).toBeGreaterThan(boxes[0].right)
    expect(boxes[n_rows].x - boxes[0].right).toBeLessThanOrEqual(4)
    expect(boxes[n_rows].width).not.toBe(boxes[0].width)
    expect(boxes[n_rows].top).toBeCloseTo(boxes[0].top, 0)
    // Keyboard order follows the first column to the top of the second.
    await links.nth(n_rows - 1).focus()
    await page.keyboard.press(`ArrowDown`)
    await expect(links.nth(n_rows)).toBeFocused()

    await page.setViewportSize({ width: 800, height: 900 })
    await dropdown.locator(`> div`).first().hover()
    await expect
      .poll(async () => {
        const box = await menu.boundingBox()
        return box && box.x >= 7.5 && box.x + box.width <= 792.5
      })
      .toBe(true)

    const original_box = await menu.boundingBox()
    if (!original_box) throw new Error(`Missing desktop submenu geometry`)
    const original_label = await links.first().textContent()
    await links.first().evaluate((link) => {
      link.textContent = `A much longer dynamically loaded navigation label`
    })
    await expect
      .poll(async () => {
        const box = await menu.boundingBox()
        return box && box.width > original_box.width && box.x + box.width <= 792.5
      })
      .toBe(true)
    await links.first().evaluate((link, label) => {
      link.textContent = label
    }, original_label)
    await expect
      .poll(async () => (await menu.boundingBox())?.x)
      .toBeCloseTo(original_box.x, 0)

    await page.setViewportSize({ width: 420, height: 800 })
    await nav.locator(`.burger`).evaluate((element: HTMLElement) => element.click())
    const mobile_menu = nav.locator(`.dropdown[data-href="${href}"] [data-submenu]`)
    await expect(mobile_menu).not.toHaveClass(/two-columns/u)
    const mobile_toggle = mobile_menu.locator(`..`).locator(`[data-dropdown-toggle]`)
    if ((await mobile_toggle.getAttribute(`aria-expanded`)) === `false`)
      await mobile_toggle.click()
    await expect(mobile_menu).toBeVisible()
    const positions = await mobile_menu
      .locator(`a`)
      .evaluateAll((items) => items.map((item) => item.getBoundingClientRect().x))
    expect(Math.max(...positions) - Math.min(...positions)).toBeLessThanOrEqual(0.5)
  })

  test(`desktop hover opens a pane and keeps it reachable across the gap`, async ({
    page,
  }) => {
    await page.goto(`/nav`, { waitUntil: `networkidle` })

    const dropdown = page.locator(`.dropdown`).first()
    const menu = dropdown.locator(`[data-submenu]`)

    await expect(menu).toHaveCSS(`display`, `none`)
    await dropdown.locator(`:scope > div`).first().hover()
    await expect(menu).toBeVisible()
    const menu_box = await menu.boundingBox()
    if (!menu_box) throw new Error(`Missing submenu geometry`)
    await page.mouse.move(menu_box.x + 5, menu_box.y - 1)
    await expect(menu).toBeVisible()
    await menu.locator(`a`).first().hover()
    await expect(menu.locator(`a`).first()).toBeVisible()
    await page.mouse.move(0, 0)
    await expect(menu).toHaveCSS(`display`, `none`)
    await dropdown.locator(`[data-dropdown-toggle]`).hover()
    await dropdown.locator(`[data-dropdown-toggle]`).focus()
    await page.keyboard.press(`ArrowDown`)
    await expect(menu.locator(`a`).first()).toBeFocused()
    await page.mouse.move(0, 0)
    await expect(menu).toBeVisible()
    await expect(menu.locator(`a`).first()).toBeFocused()
  })

  // the caret only faded 0.6 -> 1 on hover, which reads as the whole row lighting up rather
  // than the arrow being its own target
  for (const mobile of [false, true]) {
    test(`the ${mobile ? `mobile ` : ``}caret recolors under the pointer`, async ({
      page,
    }) => {
      if (mobile) await page.setViewportSize({ width: 420, height: 800 })
      await page.goto(`/nav`, { waitUntil: `networkidle` })
      if (mobile) {
        await page
          .locator(`nav.mobile button.burger`)
          .first()
          .evaluate((element: HTMLElement) => element.click())
      }

      const caret = page
        .locator(`${mobile ? `nav.mobile ` : ``}.dropdown [data-dropdown-toggle]`)
        .first()
      const read = () =>
        caret.evaluate((node) => {
          const style = getComputedStyle(node)
          const icon = node.querySelector(`svg`)
          if (!icon) throw new Error(`Missing caret icon`)
          return {
            color: style.color,
            opacity: style.opacity,
            icon_em:
              icon.getBoundingClientRect().width /
              Number(style.fontSize.replace(`px`, ``)),
            label_color:
              node.previousElementSibling &&
              getComputedStyle(node.previousElementSibling).color,
          }
        })

      const idle = await read()
      expect(idle.icon_em).toBeGreaterThanOrEqual(1.29)
      await caret.hover()
      // both halves matter: opacity is what the mobile rule's specificity used to eat, and
      // colour is what tells the user this glyph is the control
      await expect.poll(async () => (await read()).opacity).toBe(`1`)
      expect(Number(idle.opacity)).toBeLessThan(1)
      const hovered = await read()
      expect(hovered.color, `caret colour is unchanged on hover`).not.toBe(idle.color)
      expect(hovered.color).not.toBe(hovered.label_color)

      await page.mouse.move(0, 0)
      await page.keyboard.press(`Tab`)
      await caret.focus()
      await expect(caret).toHaveCSS(`outline-style`, `none`)
      await expect.poll(async () => (await read()).opacity).toBe(`1`)
      expect((await read()).color).not.toBe(idle.color)
    })
  }

  test(`desktop caret has trailing padding and Escape dismisses a hovered pane`, async ({
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
    expect(toggle_metrics.icon_em).toBeGreaterThanOrEqual(1.29)
    expect(toggle_metrics.label_gap).toBeLessThan(3)
    expect(toggle_metrics.leading_gap).toBeLessThan(1)
    expect(toggle_metrics.trailing_gap).toBeGreaterThanOrEqual(5)

    await toggle.hover()
    await expect(menu).toBeVisible()
    await expect(toggle).toHaveCSS(`transform`, `none`)
    await expect(toggle.locator(`svg`)).not.toHaveCSS(`transform`, `none`)
    await page.mouse.move(0, 0)
    await expect(menu).toHaveCSS(`display`, `none`)

    await toggle.hover()
    await page.keyboard.press(`Escape`)
    await expect(menu).toHaveCSS(`display`, `none`)

    await page.mouse.move(0, 0)
    await toggle.hover()
    await toggle.click()
    await expect(menu).toHaveCSS(`display`, `none`)
  })
})

// The pill is painted on `.menu > span` but its `flex: 1` link fills only the content box, so
// without the link stretching over the span's padding that padding is a dead band.
test(`the whole painted mobile row is part of its link's hit area`, async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 800 })
  await page.goto(`/nav`, { waitUntil: `networkidle` })

  // .click() races a decorative overlay for the press, and the burger's hit area is not what
  // this test is about
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

  const row_boxes = await page
    .locator(`nav.mobile`)
    .first()
    .locator(`.menu > span, .menu > .dropdown > div:first-child`)
    .evaluateAll((rows) => rows.map((item) => item.getBoundingClientRect().toJSON()))
  const gaps = row_boxes.slice(1).map((box, idx) => box.top - row_boxes[idx].bottom)
  expect(Math.min(...gaps)).toBeGreaterThanOrEqual(6)
  // Half a CSS pixel allows layout rounding while catching the old 2pt submenu margin.
  expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(0.5)
  const heights = row_boxes.map((box) => box.height)
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(0.5)
  const padding = await link.evaluate((element) =>
    Number(getComputedStyle(element).paddingInlineStart.replace(`px`, ``)),
  )
  expect(padding).toBeGreaterThanOrEqual(5)
  expect(padding).toBeLessThan(6)

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

// The submenu inherits line-height from the host page, which once made every child row taller
// than its parent. Its guide line is one border on the wrapper, recoloured in part by the
// active link sitting exactly on top.
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
  // out to the painted trailing edge
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
  const icon_box = await caret.locator(`svg`).boundingBox()
  if (!icon_box) throw new Error(`Missing caret icon geometry`)
  const trailing_padding = row_box.x + row_box.width - (icon_box.x + icon_box.width)
  expect(trailing_padding).toBeGreaterThanOrEqual(5)
  expect(trailing_padding).toBeLessThan(6)

  await caret.evaluate((el: HTMLElement) => el.click())
  const links = dropdown.locator(`> div:last-child a`)
  await expect(links.first()).toBeVisible()
  // the section opens over 0.25s; mid-transition the wrapper is still shorter than its links
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
  expect(wrapper.x - parent_box.x, `submenu guide is too deeply indented`).toBeCloseTo(
    8,
    0,
  )

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

  await links.first().hover()
  const hovered = await links.first().evaluate((link) => {
    const style = getComputedStyle(link)
    const text_range = document.createRange()
    text_range.selectNodeContents(link)
    return {
      text_indent:
        text_range.getBoundingClientRect().left - link.getBoundingClientRect().left,
      right_corners: [style.borderStartEndRadius, style.borderEndEndRadius],
      left_corners: [style.borderStartStartRadius, style.borderEndStartRadius],
    }
  })
  expect(hovered.text_indent).toBeLessThan(7)
  expect(hovered.right_corners).toEqual([`4px`, `4px`])
  expect(hovered.left_corners).toEqual([`0px`, `0px`])

  // The desktop panel hugs its content and its links never wrap, which suits a box floating
  // free of the page. Inline in the phone column both leaked: a long label pushed the menu
  // wider than the viewport, so its tail sat outside the panel and had to be scrolled to.
  const long_label = await links.first().evaluate((link) => {
    link.textContent = `Extremely Long Submenu Label That Cannot Possibly Fit`
    const menu = link.closest(`.menu`)
    if (!menu) throw new Error(`Missing mobile menu panel`)
    const box = link.getBoundingClientRect()
    return {
      menu_overflow: menu.scrollWidth - menu.clientWidth,
      // the far end of the label, and what is painted there
      tail: document.elementFromPoint(box.right - 4, box.top + box.height / 2)?.tagName,
      wrapped: box.height,
      row_height: menu.querySelector(`.dropdown > div:first-child`)?.clientHeight ?? 0,
    }
  })
  expect(long_label.menu_overflow, `phone menu scrolls sideways`).toBe(0)
  expect(long_label.tail, `label tail is outside the panel`).toBe(`A`)
  expect(long_label.wrapped, `label did not wrap onto more rows`).toBeGreaterThan(
    long_label.row_height,
  )

  // the panel's other desktop sizing knob is a floor wide enough to clear the trigger, which
  // on a narrow phone is wider than the whole column
  await page.setViewportSize({ width: 320, height: 800 })
  const floored = await links.first().evaluate((link) => {
    document.documentElement.style.setProperty(`--nav-dropdown-min-width`, `20em`)
    const menu = link.closest(`.menu`)
    if (!menu) throw new Error(`Missing mobile menu panel`)
    return menu.scrollWidth - menu.clientWidth
  })
  expect(floored, `--nav-dropdown-min-width leaks into the phone column`).toBe(0)
})

// The panel hangs off the pinned burger but used to restate its corner as its own constants,
// which drifted as the button grew: it covered the burger's bottom 2px and started 8px to its
// left. Both now derive from --nav-burger-inset and the button's own box.
test(`the mobile menu clears the burger and shares its left edge`, async ({ page }) => {
  await page.setViewportSize({ width: 614, height: 900 })
  await page.goto(`/`, { waitUntil: `networkidle` })
  const burger = page.locator(`nav.mobile button.burger`).first()
  await burger.evaluate((el: HTMLElement) => el.click())
  const menu = page.locator(`nav.mobile .menu`).first()
  await expect(menu).toBeVisible()

  await burger.evaluate((button) =>
    Promise.all(
      button.getAnimations({ subtree: true }).map((animation) => animation.finished),
    ),
  )
  const centers = await burger.locator(`span`).evaluateAll((bars) =>
    bars.map((bar) => {
      const box = bar.getBoundingClientRect()
      return box.y + box.height / 2
    }),
  )
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(0.5)

  const [burger_box, menu_box] = await Promise.all([
    burger.boundingBox(),
    menu.boundingBox(),
  ])
  if (!burger_box || !menu_box) throw new Error(`Missing burger or menu geometry`)

  expect(menu_box.x, `menu is not flush with the burger's left edge`).toBeCloseTo(
    burger_box.x,
    0,
  )
  expect(menu_box.y, `menu overlaps the burger`).toBeGreaterThanOrEqual(
    burger_box.y + burger_box.height,
  )
})

test(`demo section navigation and titles render before hydration`, async ({
  request,
}) => {
  const events = await request.get(`/events`)
  expect(events.ok()).toBe(true)
  const markup = await events.text()
  expect(markup).toContain(`aria-label="Demo section"`)
  expect(markup).toContain(`MultiSelect guide`)
  expect(markup).toMatch(/class="prev-next(?:\s|")/u)
  const overview = await request.get(`/multiselect`)
  expect(await overview.text()).toContain(`<title>MultiSelect</title>`)
})

// oxlint-disable-next-line vitest/prefer-each -- Playwright test has no each API
for (const width of [390, 1440]) {
  test(`demo navigation keeps recipes local at width ${width}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(`/inputs`, { waitUntil: `networkidle` })
    await expect(page.locator(`main h1`)).toHaveText(`Inputs`)
    await page.locator(`main .card[href="/multiselect"]`).click()
    await expect(page.getByLabel(`MultiSelect guide`)).toHaveValue(`/multiselect`)
    await page.getByLabel(`MultiSelect guide`).selectOption(`/events`)
    await expect(page).toHaveURL(/\/events$/u)
    await expect(page.getByLabel(`MultiSelect guide`)).toHaveValue(`/events`)
    const form_box = await page.locator(`.demo-section`).boundingBox()
    const log_box = await page.locator(`.event-log`).boundingBox()
    if (!form_box || !log_box) throw new Error(`Missing event demo panels`)
    if (width < 768)
      expect(log_box.y).toBeGreaterThanOrEqual(form_box.y + form_box.height)
    else expect(log_box.x).toBeGreaterThanOrEqual(form_box.x + form_box.width)
    const header = page.locator(`.site-header`)
    await expect(header.locator(`a[href="/events"]`)).toHaveCount(0)
    await expect(header.locator(`a[href="/multiselect"]`)).toHaveAttribute(
      `aria-current`,
      `page`,
    )
    const previous_next = page.locator(`main .prev-next`)
    await expect(previous_next.getByRole(`link`)).toHaveText([`Duplicates`, `Form`])
    await previous_next.getByRole(`link`, { name: `Form`, exact: true }).click()
    await expect(page.getByLabel(`MultiSelect guide`)).toHaveValue(`/form`)
    if (width < 768)
      await header.getByRole(`button`, { name: `Toggle navigation menu` }).click()
    const inputs_toggle = header.getByRole(`button`, { name: `Toggle Inputs submenu` })
    if (width < 768) await inputs_toggle.click()
    else await inputs_toggle.hover()
    await expect(
      header.locator(`.dropdown[data-href="/inputs"] [data-submenu] a`),
    ).toHaveText([
      `ActionButton`,
      `Button Group`,
      `FileInput`,
      `MultiSelect`,
      `RangeSlider`,
      `Settings`,
    ])
    await header.getByRole(`link`, { name: `FileInput`, exact: true }).click()
    await expect(page).toHaveURL(/\/file-input$/u)
    await expect(page.getByLabel(`MultiSelect guide`)).toHaveCount(0)
    await expect(
      page.getByRole(`navigation`, { name: `Demo section` }).getByRole(`link`),
    ).toHaveText(`Inputs`)
  })
}
