import { expect, test } from '@playwright/test'

test(`CodeEditor focus, alignment, virtualization, and 100k-line editing`, async ({
  page,
}) => {
  await page.goto(`/code-editor`)
  const editor = page.locator(`#code-editor-basic textarea`)
  await expect(editor).toBeEditable()
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
  await page
    .locator(`#code-editor-basic .code-editor`)
    .evaluate((node) => (node.style.width = `300px`))
  await expect.poll(layer_width).toBeLessThan(wide_width)

  await page.locator(`#code-editor-basic [data-load-large]`).click()
  await expect
    .poll(() =>
      editor.evaluate((area) => {
        if (!(area instanceof HTMLTextAreaElement)) throw new Error(`Expected textarea`)
        return area.value.split(`\n`).length
      }),
    )
    .toBe(100_000)
  const visible_row_count = await page
    .locator(`#code-editor-basic .token-layer .line`)
    .count()
  expect(visible_row_count).toBeGreaterThan(0)
  expect(visible_row_count).toBeLessThan(50)
  await editor.evaluate((area) => {
    area.scrollTop = area.scrollHeight
    area.dispatchEvent(new Event(`scroll`))
  })
  await expect(page.locator(`#code-editor-basic .gutter-line`).last()).toHaveText(
    `100000`,
  )

  await editor.focus()
  await editor.evaluate((area) => {
    if (!(area instanceof HTMLTextAreaElement)) throw new Error(`Expected textarea`)
    area.setSelectionRange(area.value.length, area.value.length)
  })
  await page.keyboard.type(`!`)
  const ends_with_bang = () =>
    editor.evaluate((area) => {
      if (!(area instanceof HTMLTextAreaElement)) throw new Error(`Expected textarea`)
      return area.value.endsWith(`!`)
    })
  await expect.poll(ends_with_bang).toBe(true)
  await page.keyboard.press(`Control+z`)
  await expect.poll(ends_with_bang).toBe(false)
})
