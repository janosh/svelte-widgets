import { expect, test } from '@playwright/test'

test(`Escape then Tab moves focus out of CodeEditor`, async ({ page }) => {
  await page.goto(`/code-editor`)
  const editor = page.locator(`#code-editor-basic textarea`)
  await expect(editor).toBeEditable()
  await editor.focus()

  await page.keyboard.press(`Tab`)
  await expect(editor).toBeFocused()

  await page.keyboard.press(`Escape`)
  await page.keyboard.press(`Tab`)
  await expect(editor).not.toBeFocused()
})
