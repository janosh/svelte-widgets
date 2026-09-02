import { expect, test } from '@playwright/test'

test.beforeEach(({ page }) => page.goto(`/extras`, { waitUntil: `networkidle` }))

// CopyButton is white-space: nowrap and ActionButton is width: fit-content, so a card
// holding a long CamelCase icon name used to outgrow its track and paint over its neighbor.
test(`icon catalog cards and labels stay inside their grid track`, async ({ page }) => {
  const demo = page.locator(`#icon-demo`)
  await demo.getByRole(`searchbox`).fill(`chart`) // ChartBellCurveCumulative et al

  const layout = await demo.locator(`div:has(> button)`).evaluate((grid) => {
    const grid_right = grid.getBoundingClientRect().right
    const cards = Array.from(grid.children, (card) => {
      const box = card.getBoundingClientRect()
      const label = card.querySelector(`code`)?.getBoundingClientRect()
      return { name: card.querySelector(`code`)?.textContent ?? ``, box, label }
    })
    return {
      spilling_grid: cards
        .filter((it) => it.box.right > grid_right + 0.5)
        .map((it) => it.name),
      spilling_card: cards
        .filter((it) => it.label && it.label.right > it.box.right + 0.5)
        .map((it) => it.name),
      distinct_widths: new Set(cards.map((it) => Math.round(it.box.width))).size,
    }
  })

  expect(layout.spilling_grid).toEqual([])
  expect(layout.spilling_card).toEqual([])
  expect(layout.distinct_widths).toBe(1) // fit-content would size each card to its name
})

test(`copy feedback covers the icon name instead of squeezing it`, async ({ page }) => {
  const demo = page.locator(`#icon-demo`)
  await demo.getByRole(`searchbox`).fill(`ChartBellCurveCumulative`)
  const card = demo.getByRole(`button`).first()

  // the width sizer only overlays the label while the button keeps ActionButton's grid
  await expect(card).toHaveCSS(`display`, `grid`)
  const label_width = async () => (await card.locator(`code`).boundingBox())?.width ?? 0
  const before = await label_width()
  expect(before).toBeGreaterThan(0)

  await card.click()
  await expect(card.locator(`small`)).toBeVisible()
  expect(await label_width()).toBe(before)
})
