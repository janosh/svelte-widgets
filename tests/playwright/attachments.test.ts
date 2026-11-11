// Real-browser coverage for tooltip layout, top-layer rendering and live updates.
import { expect, test, type Locator, type Page } from '@playwright/test'
import process from 'node:process'
import { build } from 'vite'
import type * as ContrastModule from '../../src/lib/attachments/contrast-color'
import { hover_until, goto } from './helpers'

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

// the tooltip uses border-box sizing
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

const hover_tooltip = async (
  page: Page,
  button_name: string,
  content_snippet: string,
): Promise<Locator> => {
  const tooltip_el = page.locator(`.custom-tooltip`)
  const button = page.getByRole(`button`, { name: button_name, exact: true })
  await hover_until(page, button, () => expect(tooltip_el).toBeVisible({ timeout: 1000 }))
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
    await goto(page, `/attachments/tooltip`, { waitUntil: `networkidle` })
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
      `xpath=ancestor::div[contains(@style, "overflow: auto")][1]`,
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

  // The arrow's insets resolve against the padding box while its geometry is measured in
  // border-box space, so both axes must add the border back — transparent ones included.
  for (const border of [`unset`, `4px solid transparent`]) {
    test(`arrow tip clears and centers on the trigger on every side (border: ${border})`, async ({
      page,
    }) => {
      const demo = page.locator(`#attachments-tooltip-placement`)
      const button = demo.getByRole(`button`, { name: `Hover the target` })
      await button.evaluate(
        (element, value) => element.style.setProperty(`--tooltip-border`, value),
        border,
      )
      const tooltip_el = page.locator(`.custom-tooltip`)

      for (const placement of [`top`, `right`, `bottom`, `left`] as const) {
        await demo.getByLabel(`placement`).selectOption(placement)
        await hover_until(page, button, () =>
          expect(tooltip_el).toHaveAttribute(`data-placement`, placement, {
            timeout: 1000,
          }),
        )
        await expect(tooltip_el).toHaveCSS(`opacity`, `1`)

        const [button_box, arrow_box, surface_box] = await Promise.all([
          button.boundingBox(),
          tooltip_el.locator(`.custom-tooltip-arrow`).boundingBox(),
          tooltip_el.boundingBox(),
        ])
        if (!button_box || !arrow_box || !surface_box) {
          throw new Error(`Missing ${placement} arrow geometry`)
        }
        // a square rotated 45° has a bounding box centred on its tip, so the box's cross axis
        // gives the tip's position and its leading edge the tip itself
        const vertical = placement === `top` || placement === `bottom`
        const cross = (box: typeof arrow_box) =>
          vertical ? box.x + box.width / 2 : box.y + box.height / 2
        expect(
          Math.abs(cross(arrow_box) - cross(button_box)),
          `${placement} arrow off the trigger's center`,
        ).toBeLessThanOrEqual(0.5)
        // the tip stands the default 6px --tooltip-arrow-size clear of the surface
        const protrusion = {
          top: arrow_box.y + arrow_box.height - surface_box.y - surface_box.height,
          bottom: surface_box.y - arrow_box.y,
          left: arrow_box.x + arrow_box.width - surface_box.x - surface_box.width,
          right: surface_box.x - arrow_box.x,
        }[placement]
        expect(protrusion, `${placement} arrow protrusion`).toBeCloseTo(6, 0)
      }
    })
  }

  // The arrow copies the border and clears the corners of the side it hangs off. Every
  // --tooltip-* shorthand sets all four alike, so only a consumer stylesheet can tell them apart.
  test(`the arrow follows the side it hangs off, not the top`, async ({ page }) => {
    const radius = 80
    await page.addStyleTag({
      // a rule, not an inline style: the surface rewrites its own cssText on every open.
      // min-width leaves the clamp somewhere to put the tip short of the centre fallback.
      content: `.custom-tooltip { border-bottom: 6px solid rgb(255, 0, 0) !important;
        border-radius: 0 0 ${radius}px ${radius}px !important; min-width: 400px !important }`,
    })
    const demo = page.locator(`#attachments-tooltip-placement`)
    await demo.getByLabel(`placement`).selectOption(`top`)
    await demo.getByLabel(`align`).selectOption(`start`) // pull the tip toward the curve
    const tooltip_el = page.locator(`.custom-tooltip`)
    await hover_until(page, demo.getByRole(`button`, { name: `Hover the target` }), () =>
      expect(tooltip_el).toHaveAttribute(`data-placement`, `top`, { timeout: 1000 }),
    )

    const arrow = tooltip_el.locator(`.custom-tooltip-arrow`)
    // the legs (the rotated square's top and right) draw it; the base side stays transparent
    await expect(arrow).toHaveCSS(`border-top-color`, `rgb(255, 0, 0)`)
    await expect(arrow).toHaveCSS(`border-right-color`, `rgb(255, 0, 0)`)
    await expect(arrow).toHaveCSS(`border-bottom-color`, `rgba(0, 0, 0, 0)`)
    await expect(arrow).toHaveCSS(`border-top-width`, `6px`)
    const [arrow_box, box] = await Promise.all([
      arrow.boundingBox(),
      tooltip_el.boundingBox(),
    ])
    if (!arrow_box || !box) throw new Error(`Missing tooltip arrow geometry`)
    expect(
      arrow_box.x + arrow_box.width / 2 - box.x,
      `tip inside the corner`,
    ).toBeGreaterThanOrEqual(radius)
    // still 6px proud: unlike the colour this survives reading the wrong border, so it is the
    // one guard that the arrow's size and inset come off the SAME side
    expect(arrow_box.y + arrow_box.height - box.y - box.height).toBeCloseTo(6, 0)
  })

  // The arrow's base sits on the surface's inner border edge, its fill hiding the surface
  // border there. Device-pixel snapping at some sub-pixel offsets (on 2x displays) let a
  // translucent border show through as a line across the base.
  test.describe(() => {
    test.use({ deviceScaleFactor: 2 })
    test(`no surface border shows across the arrow's base at any sub-pixel offset`, async ({
      page,
    }) => {
      await page.addStyleTag({
        content: `.custom-tooltip { border: 1px solid rgba(255, 255, 255, 0.3) !important;
          background: rgb(42, 42, 46) !important; transition: none !important }`,
      })
      const demo = page.locator(`#attachments-tooltip-placement`)
      await demo.getByLabel(`placement`).selectOption(`top`)
      const tooltip_el = page.locator(`.custom-tooltip`)
      await hover_until(
        page,
        demo.getByRole(`button`, { name: `Hover the target` }),
        () =>
          expect(tooltip_el).toHaveAttribute(`data-placement`, `top`, { timeout: 1000 }),
      )
      await expect(tooltip_el).toHaveCSS(`opacity`, `1`)
      const arrow = tooltip_el.locator(`.custom-tooltip-arrow`)
      // brightest pixel in a screenshot region, decoded in the page (no image library)
      const max_red = async (clip: {
        x: number
        y: number
        width: number
        height: number
      }) =>
        page.evaluate(
          async (data) => {
            const img = new Image()
            img.src = `data:image/png;base64,${data}`
            await img.decode()
            const canvas = new OffscreenCanvas(img.width, img.height)
            const ctx = canvas.getContext(`2d`)
            if (!ctx) throw new Error(`No 2d context`)
            ctx.drawImage(img, 0, 0)
            const { data: pixels } = ctx.getImageData(0, 0, img.width, img.height)
            return Math.max(...pixels.filter((_value, idx) => idx % 4 === 0))
          },
          (await page.screenshot({ clip })).toString(`base64`),
        )
      const seams: string[] = []
      const base_padding = await tooltip_el.evaluate(
        (el) => getComputedStyle(el).paddingBottom,
      )
      const fractions = [0, 0.2, 0.4, 0.5, 0.6, 0.8]
      for (const [offset, extra_height] of fractions.flatMap((dy) =>
        fractions.map((dh) => [dy, dh]),
      )) {
        // both the surface's position and its height (where the arrow's base sits) go fractional
        await tooltip_el.evaluate(
          (el, [dy, dh, pad]) => {
            el.style.marginTop = `${dy}px`
            el.style.paddingBottom = `calc(${pad} + ${dh}px)`
          },
          [offset, extra_height, base_padding] as const,
        )
        const [arrow_box, box] = await Promise.all([
          arrow.boundingBox(),
          tooltip_el.boundingBox(),
        ])
        if (!arrow_box || !box) throw new Error(`Missing tooltip arrow geometry`)
        // the middle half of the base, clear of the legs, across the surface's bottom border
        const x = Math.round(arrow_box.x + arrow_box.width * 0.375)
        const width = Math.round(arrow_box.width / 4)
        const bottom = Math.floor(box.y + box.height)
        const fill = await max_red({ x, y: bottom - 6, width, height: 2 })
        const base = await max_red({ x, y: bottom - 2, width, height: 4 })
        // a clean base is fill throughout; a seam is the lighter border mixed in
        if (base - fill > 10) {
          seams.push(
            `+${offset}px, +${extra_height}px tall: base ${base} vs fill ${fill}`,
          )
        }
      }
      expect(seams).toEqual([])
    })
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

// happy-dom leaves assignedSlot unset, so slotted composition needs a real browser. The
// module is bundled here rather than imported from a route so dev and preview runs match.
test(`contrast_color walks slotted content through the slot's painted wrapper`, async ({
  page,
}) => {
  // Vite's build sets NODE_ENV=production for the whole worker, so a later dev server here
  // (Markdown.test.ts) would compile without HMR. Restore it once bundled.
  const node_env = process.env.NODE_ENV
  const result = await build({
    configFile: false,
    logLevel: `silent`,
    build: {
      write: false,
      minify: false,
      lib: {
        entry: `${process.cwd()}/src/lib/attachments/contrast-color.ts`,
        formats: [`iife`],
        name: `contrast_module`,
      },
    },
  }).finally(() => {
    if (node_env === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = node_env
  })
  const [bundle] = Array.isArray(result) ? result : [result]
  if (!bundle || !(`output` in bundle))
    throw new Error(`expected one bundle, got watcher`)
  await page.setContent(`<div id="host" style="background: rgb(250, 250, 250)"></div>`)
  await page.addScriptTag({ content: bundle.output[0].code })
  const walked = await page.evaluate(() => {
    const host = document.querySelector(`#host`)
    if (!host) throw new Error(`missing #host`)
    const wrapper = document.createElement(`div`)
    wrapper.style.background = `rgb(10, 10, 10)`
    wrapper.append(document.createElement(`slot`))
    host.attachShadow({ mode: `open` }).append(wrapper)
    const node = document.createElement(`span`)
    host.append(node)
    const { contrast_color, get_bg_color } = (
      globalThis as unknown as { contrast_module: typeof ContrastModule }
    ).contrast_module
    contrast_color()(node)
    return {
      slotted: node.assignedSlot?.parentElement === wrapper,
      bg_color: get_bg_color(node),
      color: node.style.color,
    }
  })
  expect(walked).toEqual({ slotted: true, bg_color: `rgb(10, 10, 10)`, color: `white` })
})
