import { expect, test } from '@playwright/test'
import { goto } from './helpers'

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
