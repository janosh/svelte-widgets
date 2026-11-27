import { expect, test } from '@playwright/test'
import { box_of, goto } from './helpers'

// An angled label leans over the ordinary header after it, which paints later at the same
// level: the label must stay on top there, visible and clickable along its length
test(`an angled header label stays on top over the next ordinary header`, async ({
  page,
}) => {
  await goto(page, `/table`)
  const demo = page.locator(`#data-table-angled`)
  await expect(demo.locator(`.angled-label`)).toHaveCount(2)
  // elementFromPoint only sees the viewport
  await demo.scrollIntoViewIfNeeded()
  const hit = await demo
    .locator(`th[data-col-id="f1"] .angled-label`)
    .evaluate((label) => {
      const next = label.closest(`th`)?.nextElementSibling?.getBoundingClientRect()
      // the label's last character ({@html} also leaves comment nodes around the text)
      const walker = document.createTreeWalker(label, NodeFilter.SHOW_TEXT)
      let node: Node | null = null
      while (walker.nextNode()) node = walker.currentNode
      const length = node?.textContent?.length ?? 0
      if (!node || !length) throw new Error(`angled label has no text`)
      const range = document.createRange()
      range.setStart(node, length - 1)
      range.setEnd(node, length)
      const { x, y, width, height } = range.getBoundingClientRect()
      const [cx, cy] = [x + width / 2, y + height / 2]
      return {
        over_next: next !== undefined && cx > next.left && cx < next.right,
        on_label: label.contains(document.elementFromPoint(cx, cy)),
      }
    })
  expect(hit).toEqual({ over_next: true, on_label: true })
})

// Selected rows drew border lines and a row background: the borders grew the row by 2px and
// a pinned cell's opaque (striped) background hid both the tint and its bottom edge
test(`a selected row keeps its height and pinned cells show its edges and tint`, async ({
  page,
}) => {
  await goto(page, `/table`)
  const rows = page.locator(`#data-table tbody tr`)
  const height = async (idx: number) => (await rows.nth(idx).boundingBox())?.height
  const unselected_height = await height(1)
  for (const idx of [0, 1]) await rows.nth(idx).locator(`td.select-col input`).check()
  await expect(rows.nth(1)).toHaveClass(/\bselected\b/)
  expect(await height(1)).toBe(unselected_height)
  // the pinned cell paints through its ::before layer; edges plus the tint, on odd rows too
  for (const idx of [0, 1]) {
    const shadow = await rows
      .nth(idx)
      .locator(`td.pinned`)
      .evaluate((cell) => getComputedStyle(cell, `::before`).boxShadow)
    expect(shadow.match(/inset/g), shadow).toHaveLength(3)
    expect(shadow).toContain(`0px -2px 0px 0px inset`)
  }
})

// `striped` rows paint the stripe under cells' own backgrounds, so column colors stay visible
// whatever the stripe's opacity; a pinned cell (opaque, to occlude columns scrolling beneath)
// layers it over its background as an image instead, with the hover wash on top
test(`striped rows keep column colors and reach pinned cells under the hover wash`, async ({
  page,
}) => {
  await goto(page, `/table`)
  const demo = page.locator(`#data-table`)
  // an opaque stripe, the case that would hide column color fills painted beneath it
  await demo.evaluate((el: HTMLElement) =>
    el.style.setProperty(`--table-stripe-bg`, `#f00`),
  )
  const rows = demo.locator(`tbody tr`)
  const paint = (idx: number) =>
    rows.nth(idx).evaluate((row) => {
      const style = (selector: string) => {
        const cell = row.querySelector(selector)
        if (!cell) throw new Error(`row has no ${selector}`)
        return getComputedStyle(cell)
      }
      const [pinned, colored] = [style(`td.pinned`), style(`td[style*="--cell-bg"]`)]
      return {
        row: getComputedStyle(row).backgroundColor,
        pinned_layers: pinned.backgroundImage.match(/linear-gradient/g)?.length ?? 0,
        pinned_color: pinned.backgroundColor,
        colored: [colored.backgroundColor, colored.backgroundImage],
      }
    })
  const [striped, plain] = [await paint(0), await paint(1)]
  expect([striped.row, plain.row]).toEqual([`rgb(255, 0, 0)`, `rgba(0, 0, 0, 0)`])
  expect([striped.pinned_layers, plain.pinned_layers]).toEqual([1, 0])
  expect(striped.pinned_color).toBe(plain.pinned_color) // its own opaque background stays
  expect(striped.pinned_color).not.toMatch(/(?:, 0|\/ 0)\)$|transparent/)
  expect(striped.colored).toEqual([
    expect.not.stringMatching(/rgba\(0, 0, 0, 0\)/),
    `none`,
  ])
  await rows.nth(0).locator(`td.pinned`).hover()
  expect((await paint(0)).pinned_layers).toBe(2)
})

// Past 500 rows only those on screen render: in the scroller's view under a height limit, and
// in the page's without one. Each time the middle of the view shows a row, not a blank spacer.
test(`a large table renders the rows on screen when scrolled inside or with the page`, async ({
  page,
}) => {
  await goto(page, `/table`)
  const scroller = page.locator(`#data-table-large .table-scroll`)
  const rendered = scroller.locator(`tbody tr:not(.virtual-spacer)`)
  // the row number of the cell at a point, null over a spacer or outside the table
  const row_at = (x: number, y: number) =>
    page.evaluate(
      ([px, py]) => {
        const row = document.elementFromPoint(px, py)?.closest(`tr`)
        return row && !row.classList.contains(`virtual-spacer`)
          ? Number(row.querySelector(`td`)?.textContent)
          : null
      },
      [x, y],
    )
  await expect(rendered).toHaveCount(60)
  await scroller.scrollIntoViewIfNeeded() // elementFromPoint only sees the viewport

  await scroller.evaluate((el) => (el.scrollTop = el.scrollHeight / 2))
  const box = await box_of(scroller)
  await expect
    .poll(() => row_at(box.x + 20, box.y + box.height / 2))
    .toBeGreaterThan(4900)

  await scroller.evaluate((el) => {
    el.style.maxHeight = `none`
    el.scrollTop = 0
    const { top, height } = el.getBoundingClientRect()
    window.scrollBy(0, top + height / 2)
  })
  const viewport = page.viewportSize() ?? { width: 0, height: 0 }
  await expect.poll(() => row_at(box.x + 20, viewport.height / 2)).toBeGreaterThan(4900)
  expect(await rendered.count()).toBeLessThan(100)
})
