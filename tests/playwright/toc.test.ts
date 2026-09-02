import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 780 } })
test.beforeEach(({ page }) => page.goto(`/extras`, { waitUntil: `networkidle` }))

// The title's rule cancels the panel's inline padding, a custom property that substitutes as
// text: in `em` it resolved against the h2's larger font-size and overhung the panel.
test(`mobile ToC title rule spans the panel without overflowing it`, async ({ page }) => {
  await page.locator(`aside.toc.mobile > button`).first().click()
  const panel = page.locator(`aside.toc.mobile > nav`).first()
  await expect(panel.locator(`.toc-title`)).toBeVisible()

  const geometry = await panel.evaluate((nav) => {
    const heading = nav.querySelector(`.toc-title`)
    const item = nav.querySelector(`ol > li`)
    if (!heading || !item) throw new Error(`ToC panel is missing its title or entries`)
    const border = Number(getComputedStyle(nav).borderLeftWidth.replace(`px`, ``))
    return {
      overflow: nav.scrollWidth - nav.clientWidth,
      border,
      nav: nav.getBoundingClientRect().toJSON(),
      title: heading.getBoundingClientRect().toJSON(),
      gap: item.getBoundingClientRect().top - heading.getBoundingClientRect().bottom,
    }
  })

  expect(geometry.overflow, `title rule scrolls the panel sideways`).toBe(0)
  // flush to the panel's padding box: inside its border, but past its inline padding
  expect(geometry.title.left - geometry.nav.left).toBeCloseTo(geometry.border, 1)
  expect(geometry.nav.right - geometry.title.right).toBeCloseTo(geometry.border, 1)
  // the title is a header here, not a paragraph with a desktop-sized gap under it
  expect(geometry.gap).toBeLessThanOrEqual(10)
})

// The base rule floors the aside at --toc-min-width (15em by default). A closed toggle then
// towed a transparent 15em box around the corner of the screen, and a fixed box with no
// background still swallows the taps aimed at the page under it. The docs site zeroes the
// token, so set it back to the library default here or the test proves nothing.
test(`closed mobile toggle hugs its own box`, async ({ page }) => {
  await page.evaluate(() =>
    document
      .querySelector<HTMLElement>(`.docs-body`)
      ?.style.setProperty(`--toc-min-width`, `15em`),
  )
  const aside = page.locator(`aside.toc.mobile`).first()

  const corner = await aside.evaluate((node) => {
    const box = node.getBoundingClientRect()
    const button = node.querySelector(`button`)?.getBoundingClientRect()
    if (!button) throw new Error(`mobile ToC has no toggle`)
    // just inside the aside's left edge, level with the middle of the toggle
    const hit = document.elementFromPoint(box.left + 2, button.top + button.height / 2)
    return { slack: box.width - button.width, hit_is_toc: node.contains(hit) }
  })

  expect(corner.slack, `dead strip beside the toggle`).toBeLessThanOrEqual(1)
  expect(corner.hit_is_toc).toBe(true) // the only pixels the aside claims are the toggle's own
})

// li:hover sits after li.active so the active row still lights up, but an unset
// --toc-li-hover-color makes `color` invalid at computed-value time, which resolves to the
// inherited text colour instead of dropping out and wipes the accent off that row.
test(`active ToC row keeps its accent under the pointer`, async ({ page }) => {
  await page.locator(`aside.toc.mobile > button`).first().click()
  // scroll rather than click an entry: clicking closes the panel
  await page.evaluate(() => globalThis.scrollTo({ top: 2500, behavior: `instant` }))
  const active = page.locator(`aside.toc.mobile > nav > ol > li.active`).first()
  await expect(active).toBeVisible()

  const read_color = () => active.evaluate((li) => getComputedStyle(li).color)
  const idle = await read_color()
  const list_color = await page
    .locator(`aside.toc.mobile > nav > ol`)
    .evaluate((ol) => getComputedStyle(ol).color)
  expect(idle, `active row carries no accent to lose`).not.toBe(list_color)

  // hover inside the poll: activeHeading can still move to another row just after the scroll,
  // which leaves the pointer over the previous one and the locator pointing at a third
  await expect(async () => {
    await active.hover()
    expect(await active.evaluate((li) => li.matches(`:hover`))).toBe(true)
    expect(await read_color()).toBe(idle)
  }).toPass()
})

// on_keydown listens on the window and preventDefaults to drive the ToC's own list, which
// cancelled the activation of whatever else had focus. The toggle is the visible case; every
// button on the page went dead the same way while the panel was open.
test(`Enter on the mobile toggle closes the panel`, async ({ page }) => {
  const toggle = page.locator(`aside.toc.mobile > button`).first()
  await toggle.click()
  const panel = page.locator(`aside.toc.mobile > nav`)
  await expect(panel).toBeVisible()

  await toggle.focus()
  await page.keyboard.press(`Enter`)
  await expect(panel).toHaveCount(0)
  expect(await page.evaluate(() => globalThis.scrollY)).toBe(0) // no heading was activated

  await page.keyboard.press(`Enter`) // and it reopens, rather than only closing
  await expect(panel).toBeVisible()
  await page.keyboard.press(`Escape`) // Escape still reaches the window handler
  await expect(panel).toHaveCount(0)
})

test(`the ToC leaves keys to whatever else has focus`, async ({ page }) => {
  await page.locator(`aside.toc.mobile > button`).first().click()
  await expect(page.locator(`aside.toc.mobile > nav`)).toBeVisible()

  // a copy button on the page behind the open panel still activates on Enter
  const card = page.locator(`#icon-demo button`).first()
  await card.focus()
  await page.keyboard.press(`Enter`)
  await expect(card.locator(`small`)).toBeVisible() // its copied/failed overlay

  // and arrow keys still move the caret in a text field rather than the ToC's selection
  const search = page.locator(`#icon-demo input[type=search]`)
  await search.fill(`chart`)
  await page.keyboard.press(`ArrowUp`)
  const caret = await search.evaluate((node: HTMLInputElement) => node.selectionStart)
  expect(caret).toBe(0) // ArrowUp in a single-line input jumps to the start
})
