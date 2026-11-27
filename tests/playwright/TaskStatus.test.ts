import { expect, test } from '@playwright/test'
import { goto } from './helpers'

// Real layout, which jsdom can't compute: the overlay's spinner/label row and its cancel button
// both follow --task-status-justify, so neither stays centered while the other moves
for (const justify of [`center`, `end`] as const) {
  test(`overlay label row and button align with --task-status-justify: ${justify}`, async ({
    page,
  }) => {
    await goto(page, `/workbench`)
    const status = page.locator(`.overlay-demo .task-status`)
    await expect(status.getByRole(`status`)).toContainText(`Loading structure`)

    const { column, content, button } = await status.evaluate(
      (root: HTMLElement, value) => {
        root.style.setProperty(`--task-status-justify`, value)
        const row = root.querySelector(`[role="status"]`)
        const button_el = root.querySelector(`button`)
        if (!row || !button_el) throw new Error(`overlay row or button missing`)
        const boxes = [...row.children].map((child) => child.getBoundingClientRect())
        // the overlay's single grid column, centered in its box (not the row, which could shrink)
        const root_box = root.getBoundingClientRect()
        const width = Number(
          getComputedStyle(root).gridTemplateColumns.replace(/px$/, ``),
        )
        const left = root_box.left + (root_box.width - width) / 2
        const { left: button_left, right: button_right } =
          button_el.getBoundingClientRect()
        return {
          column: { left, right: left + width },
          content: {
            left: Math.min(...boxes.map((box) => box.left)),
            right: Math.max(...boxes.map((box) => box.right)),
          },
          button: { left: button_left, right: button_right },
        }
      },
      justify,
    )

    // a short label must leave room in the column, or this test can't tell alignments apart
    expect(column.right - column.left).toBeGreaterThan(content.right - content.left + 40)
    if (justify === `center`) {
      const mid = (box: { left: number; right: number }) => (box.left + box.right) / 2
      expect(Math.abs(mid(content) - mid(column))).toBeLessThan(1)
      expect(Math.abs(mid(button) - mid(column))).toBeLessThan(1)
    } else {
      expect(Math.abs(content.right - column.right)).toBeLessThan(1)
      expect(Math.abs(button.right - column.right)).toBeLessThan(1)
    }
  })
}
