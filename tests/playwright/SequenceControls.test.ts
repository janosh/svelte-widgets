import { expect, test } from '@playwright/test'
import { goto } from './helpers'

// Real layout, which jsdom can't compute: in a wrapping host the step section shares the nav
// row while its slider fits at --sequence-slider-min-width, starts a new row once it doesn't,
// and comes back when the host widens again
test(`step section starts its own row in a narrow wrapping host`, async ({ page }) => {
  await goto(page, `/sequence-controls`)
  const host = page.locator(`#sequence-controls-basic .nav-section`)
  await expect(host).toBeVisible()

  const layout_at = (width: number, slider_min_width = ``) =>
    host.evaluate(
      (nav: HTMLElement, [host_width, min_width]) => {
        const parent = nav.parentElement
        const step = parent?.querySelector(`.step-section`)
        const slider = step?.querySelector(`.slider-container`)
        if (!parent || !step || !slider) throw new Error(`sequence controls missing`)
        parent.style.width = `${host_width}px`
        parent.style.setProperty(`--sequence-slider-min-width`, min_width)
        const [nav_box, step_box, parent_box] = [nav, step, parent].map((el) =>
          el.getBoundingClientRect(),
        )
        return {
          same_row: Math.abs(step_box.top - nav_box.top) < nav_box.height,
          // first on a row below the nav buttons
          new_row:
            step_box.top >= nav_box.bottom &&
            Math.abs(step_box.left - parent_box.left) < 1,
          slider_width: slider.getBoundingClientRect().width,
        }
      },
      [width, slider_min_width] as const,
    )

  const wide = await layout_at(700)
  expect(wide.same_row).toBe(true)
  expect(wide.slider_width).toBeGreaterThan(100)

  const narrow = await layout_at(260)
  expect(narrow).toMatchObject({ same_row: false, new_row: true })
  expect(narrow.slider_width).toBeGreaterThanOrEqual(100)

  expect((await layout_at(700)).same_row).toBe(true)
  // the threshold follows the slider's min width, not the range input's intrinsic width
  const raised = await layout_at(700, `550px`)
  expect(raised).toMatchObject({ same_row: false, new_row: true })
  expect(raised.slider_width).toBeGreaterThanOrEqual(550)
})
