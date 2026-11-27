import { expect, test } from '@playwright/test'
import { goto } from './helpers'

// Real cascade (happy-dom drops nested CSS): hosts restyle the box through vars instead of
// out-specifying its per-type padding rule
test(`--status-message-padding and --status-message-font-size override the defaults`, async ({
  page,
}) => {
  await goto(page, `/workbench`)
  const box = page.locator(`.status-message.success`).first()
  await expect(box).toBeVisible()
  const read = () =>
    box.evaluate((node) => {
      const { padding, fontSize } = getComputedStyle(node)
      return { padding, fontSize }
    })
  const before = await read()
  expect(before.padding.split(` `)).toHaveLength(2) // 0.5em 1em
  await box.evaluate((node) => {
    const host = node.parentElement?.parentElement
    host?.style.setProperty(`--status-message-padding`, `3px 5px`)
    host?.style.setProperty(`--status-message-font-size`, `11px`)
  })
  expect(await read()).toEqual({ padding: `3px 5px`, fontSize: `11px` })
})
