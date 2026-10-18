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
  // the search filters asynchronously, so measure only once the card shows the searched icon
  await expect(card.locator(`code`)).toContainText(`ChartBellCurveCumulative`)
  await expect.poll(label_width).toBeGreaterThan(0)
  const before = await label_width()

  await card.click()
  await expect(card.locator(`small`)).toBeVisible()
  expect(await label_width()).toBe(before)
})

// The checked knob must travel exactly to the track's inner edge whatever the size vars,
// which the old height-based offset only did for the default proportions.
test.describe(`Toggle checked knob travel`, () => {
  const cases: [string, Record<string, string>][] = [
    [`defaults`, {}],
    [`padding`, { '--toggle-knob-padding': `0.2em` }],
    [`taller track`, { '--toggle-knob-height': `2em` }],
    [`smaller knob`, { '--toggle-knob-after-width': `1em` }],
  ]
  for (const [name, vars] of cases) {
    test(name, async ({ page }) => {
      const label = page.locator(`label:has(> input[type="checkbox"] + span)`).first()
      const { travel, expected } = await label.evaluate((node, css_vars) => {
        const style_vars = {
          ...css_vars,
          '--toggle-knob-transition': `none`,
          '--toggle-knob-after-transition': `none`,
        }
        for (const [key, val] of Object.entries(style_vars))
          (node as HTMLElement).style.setProperty(key, val)
        const input = node.querySelector(`input`)
        const span = node.querySelector(`span`)
        if (!input || !span) throw new Error(`Toggle markup not found`)
        input.checked = true
        const track = getComputedStyle(span)
        const knob = getComputedStyle(span, `::after`)
        const px = (value: string) => Number(value.replace(/px$/u, ``))
        const padding = px(track.paddingLeft) + px(track.paddingRight)
        return {
          travel: new DOMMatrix(knob.transform).m41,
          expected: span.clientWidth - padding - px(knob.width),
        }
      }, vars)
      expect(travel).toBeCloseTo(expected, 1)
    })
  }
})
