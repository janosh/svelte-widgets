import { expect, test } from '@playwright/test'

test(`CodeEditor releases focus and tracks viewport width`, async ({ page }) => {
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
})
