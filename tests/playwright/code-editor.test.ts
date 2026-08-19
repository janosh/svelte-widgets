import { expect, test } from '@playwright/test'

test(`CodeEditor focus, alignment, virtualization, and 100k-line editing`, async ({
  page,
}) => {
  await page.goto(`/code-editor`)
  const code_editor = page.locator(`#code-editor-basic .code-editor`)
  const editor = page.locator(`#code-editor-basic textarea`)
  await expect(editor).toBeEditable()
  await expect(code_editor).toHaveAttribute(`aria-busy`, `false`)
  await editor.focus()

  await page.keyboard.press(`Tab`)
  await expect(editor).toBeFocused()

  await page.keyboard.press(`Escape`)
  await page.keyboard.press(`Tab`)
  await expect(editor).not.toBeFocused()

  const token_layer = page.locator(`#code-editor-basic .token-layer`)
  const layer_width = () =>
    token_layer.evaluate((node) => Number(node.style.minWidth.replace(`px`, ``)))
  const wide_width = await layer_width()
  expect(wide_width).toBeGreaterThan(0)
  await code_editor.evaluate((node) => (node.style.width = `300px`))
  await expect.poll(layer_width).toBeLessThan(wide_width)

  await page.locator(`#code-editor-basic [data-load-large]`).click()
  await expect
    .poll(() =>
      editor.evaluate((area: HTMLTextAreaElement) => area.value.split(`\n`).length),
    )
    .toBe(100_000)
  const visible_row_count = await page
    .locator(`#code-editor-basic .token-layer .line`)
    .count()
  expect(visible_row_count).toBeGreaterThan(0)
  expect(visible_row_count).toBeLessThan(50)
  await editor.evaluate((area: HTMLTextAreaElement) => {
    const document_end = area.value.length
    area.focus()
    area.setSelectionRange(document_end, document_end)
    area.scrollTop = area.scrollHeight
    area.dispatchEvent(new Event(`scroll`))
  })
  await expect(page.locator(`#code-editor-basic .gutter-line`).last()).toHaveText(
    `100000`,
  )
  const gutter_side_gap_difference = await page
    .locator(`#code-editor-basic .gutter`)
    .evaluate((gutter) => {
      const widest_number = gutter.querySelector(`.gutter-line:last-child`)
      if (!(widest_number instanceof HTMLElement))
        throw new Error(`Expected widest gutter number`)
      const gutter_box = gutter.getBoundingClientRect()
      const number_box = widest_number.getBoundingClientRect()
      const border_right = gutter_box.width - gutter.clientWidth
      const left_gap = number_box.left - gutter_box.left
      const right_gap = gutter_box.right - border_right - number_box.right
      return left_gap - right_gap
    })
  expect(Math.abs(gutter_side_gap_difference)).toBeLessThan(0.5)

  await page.keyboard.type(`!`)
  const ends_with_bang = () =>
    editor.evaluate((area: HTMLTextAreaElement) => area.value.endsWith(`!`))
  await expect.poll(ends_with_bang).toBe(true)
  await page.keyboard.press(`ControlOrMeta+z`)
  await expect.poll(ends_with_bang).toBe(false)
})
