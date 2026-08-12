// Real-browser coverage for tooltip layout, top-layer rendering and live updates.
import { expect, test, type Locator, type Page } from '@playwright/test'

type TooltipMetrics = {
  border_box_width: number
  content_width: number
  text_width: number
  max_width: number
  line_count: number
  left: number
  top: number
  right: number
  bottom: number
  viewport_width: number
  viewport_height: number
  surface_overflow: string
  content_overflow_y: string
  content_scrolls: boolean
}

// Measure final tooltip geometry. The tooltip uses border-box sizing.
const measure_tooltip = (tooltip_el: Locator): Promise<TooltipMetrics> =>
  tooltip_el.evaluate((el) => {
    const rect = el.getBoundingClientRect()
    const style = getComputedStyle(el)
    // computed lengths are `<number>px` strings — strip the unit for Number()
    const css_px = (css_length: string) => Number(css_length.replace(/px$/, ``))
    const box_adjust =
      css_px(style.paddingLeft) +
      css_px(style.paddingRight) +
      css_px(style.borderLeftWidth) +
      css_px(style.borderRightWidth)
    const content_el = el.querySelector(`.tooltip-content`)
    const content_range = document.createRange()
    if (content_el) content_range.selectNodeContents(content_el)
    const content_style = content_el ? getComputedStyle(content_el) : null
    return {
      border_box_width: rect.width,
      content_width: rect.width - box_adjust,
      text_width: content_el?.getBoundingClientRect().width ?? 0,
      max_width: css_px(style.maxWidth),
      line_count: content_el ? content_range.getClientRects().length : 0,
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewport_width: globalThis.innerWidth,
      viewport_height: globalThis.innerHeight,
      surface_overflow: style.overflow,
      content_overflow_y: content_style?.overflowY ?? ``,
      content_scrolls: (content_el?.scrollHeight ?? 0) > (content_el?.clientHeight ?? 0),
    }
  })

// Hover until hydration has attached the delegated pointer listeners.
const hover_tooltip = async (
  page: Page,
  button_name: string,
  content_snippet: string,
): Promise<Locator> => {
  const tooltip_el = page.locator(`.custom-tooltip`)
  await expect(async () => {
    await page.mouse.move(0, 0) // move off the button so pointerover re-fires
    await page.getByRole(`button`, { name: button_name, exact: true }).hover()
    await expect(tooltip_el).toBeVisible({ timeout: 1000 })
  }).toPass({ timeout: 15_000 })
  await expect(tooltip_el).toContainText(content_snippet)
  await expect(tooltip_el).toHaveCSS(`opacity`, `1`)
  return tooltip_el
}

const expect_within_viewport = (metrics: TooltipMetrics) => {
  expect(metrics.left).toBeGreaterThanOrEqual(0)
  expect(metrics.top).toBeGreaterThanOrEqual(0)
  expect(metrics.right).toBeLessThanOrEqual(metrics.viewport_width)
  expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewport_height)
}

test.describe(`tooltip layout and lifecycle`, () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`/attachments/tooltip`, { waitUntil: `networkidle` })
  })

  test(`short single-word tooltip renders one snug line below its max-width`, async ({
    page,
  }) => {
    const content = `antidisestablishmentarianism`
    const tooltip_el = await hover_tooltip(page, `Single long word`, content)
    const metrics = await measure_tooltip(tooltip_el)

    expect(metrics.max_width).toBe(280)
    expect(metrics.line_count).toBe(1)
    expect(metrics.content_width).toBeLessThan(metrics.max_width)
    // snug: width matches the rendered text, not the max-width cap
    expect(Math.abs(metrics.content_width - metrics.text_width)).toBeLessThanOrEqual(3)
    expect_within_viewport(metrics)
  })

  for (const [button_name, snippet, expected_max_width, min_lines] of [
    [`Long German word`, `Donaudampfschifffahrtsgesellschaftskapitän`, 280, 2],
    [`Balanced wrapping`, `balanced text wrapping`, 200, 2],
    [`Long text viewport-safe`, `Lorem ipsum`, 220, 5],
  ] as const) {
    test(`${button_name} tooltip wraps to ≥${min_lines} lines within its ${expected_max_width}px max-width`, async ({
      page,
    }) => {
      const tooltip_el = await hover_tooltip(page, button_name, snippet)
      const metrics = await measure_tooltip(tooltip_el)

      expect(metrics.max_width).toBe(expected_max_width)
      expect(metrics.line_count).toBeGreaterThanOrEqual(min_lines)
      expect(metrics.border_box_width).toBeLessThanOrEqual(expected_max_width + 3)
      expect(Math.abs(metrics.content_width - metrics.text_width)).toBeLessThanOrEqual(3)
      expect_within_viewport(metrics)
    })
  }

  test(`scroll-boundary demo flips between vertical edges`, async ({ page }) => {
    const button = page.getByRole(`button`, {
      name: `Click, then scroll me past the edges`,
    })
    const boundary = button.locator(
      `xpath=ancestor::div[contains(@class, "demo-box")][1]`,
    )
    const tooltip_el = page.locator(`.custom-tooltip`)

    await button.click()
    await expect(tooltip_el).toHaveAttribute(`data-placement`, `top`)

    await boundary.evaluate((element) => (element.scrollTop = element.scrollHeight))
    await expect(tooltip_el).toHaveAttribute(`data-placement`, `bottom`)
  })

  test(`narrow viewports keep the top-layer tooltip and shifted arrow on screen`, async ({
    page,
  }) => {
    const button_name = `Long text viewport-safe`
    await page.setViewportSize({ width: 360, height: 560 })
    const button = page.getByRole(`button`, { name: button_name, exact: true })
    await button.evaluate((element) =>
      element.style.setProperty(`--tooltip-max-height`, `80px`),
    )
    const tooltip_el = await hover_tooltip(page, button_name, `Lorem ipsum`)
    const metrics = await measure_tooltip(tooltip_el)
    // the 8px viewport padding, less a pixel for sub-pixel rounding
    expect(metrics.left).toBeGreaterThanOrEqual(7)
    expect(metrics.right).toBeLessThanOrEqual(metrics.viewport_width - 7)
    expect(await tooltip_el.evaluate((element) => element.matches(`:popover-open`))).toBe(
      true,
    )

    const [button_box, arrow_box, placement] = await Promise.all([
      button.boundingBox(),
      tooltip_el.locator(`.custom-tooltip-arrow`).boundingBox(),
      tooltip_el.getAttribute(`data-placement`),
    ])
    if (!button_box || !arrow_box) throw new Error(`Missing tooltip arrow geometry`)
    await expect(tooltip_el.locator(`[class^="custom-tooltip-arrow"]`)).toHaveCount(1)
    expect(metrics).toMatchObject({
      surface_overflow: `visible`,
      content_overflow_y: `auto`,
      content_scrolls: true,
    })
    const arrow_center_x = arrow_box.x + arrow_box.width / 2
    const arrow_center_y = arrow_box.y + arrow_box.height / 2
    const button_center_x = button_box.x + button_box.width / 2
    const button_center_y = button_box.y + button_box.height / 2
    const cross_axis_error =
      placement === `top` || placement === `bottom`
        ? Math.abs(arrow_center_x - button_center_x)
        : Math.abs(arrow_center_y - button_center_y)
    expect(cross_axis_error).toBeLessThanOrEqual(3)
  })

  test(`active attribute content rerenders without leaving the viewport`, async ({
    page,
  }) => {
    const tooltip_el = await hover_tooltip(page, `Hover me`, `Edit me!`)
    await page
      .getByRole(`button`, { name: `Hover me`, exact: true })
      .locator(`xpath=preceding-sibling::input[1]`)
      .fill(`A much longer reactive tooltip value that must reposition and wrap safely`)

    await expect(tooltip_el).toContainText(`A much longer reactive tooltip value`)
    const metrics = await measure_tooltip(tooltip_el)
    expect(Math.abs(metrics.content_width - metrics.text_width)).toBeLessThanOrEqual(3)
    expect_within_viewport(metrics)
  })
})
