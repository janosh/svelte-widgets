import { expect, test } from '@playwright/test'

test(`ColorInput examples preserve hex drafts and restore transparent colors`, async ({
  page,
}) => {
  await page.goto(`/color-input`, { waitUntil: `networkidle` })
  const basic = page.locator(`#color-input-basic`)
  const hex = basic.getByRole(`textbox`, { name: `Hex color` })
  await hex.fill(``)
  await hex.pressSequentially(`#abcdef`)
  await expect(hex).toHaveValue(`#abcdef`)
  await expect(basic.locator(`> p`)).toHaveText(`Selected color: #abcdef`)
  await hex.fill(`#wrong`)
  await expect(hex).toHaveAttribute(`aria-invalid`, `true`)
  await hex.press(`Escape`)
  await expect(hex).toHaveValue(`#abcdef`)

  const transparent = page.locator(`#color-input-alpha`)
  const opacity = transparent.getByRole(`slider`, { name: `Opacity` })
  await opacity.focus()
  await opacity.press(`Home`)
  await expect(transparent.getByRole(`textbox`, { name: `Hex color` })).toHaveValue(
    `#e76f5100`,
  )
  await opacity.press(`End`)
  await expect(transparent.getByRole(`textbox`, { name: `Hex color` })).toHaveValue(
    `#e76f51ff`,
  )

  const deferred = page.locator(`#color-input-commit`)
  await deferred.getByRole(`textbox`, { name: `Hex color` }).fill(`#123456`)
  await expect(deferred.locator(`> p`)).toContainText(`updates: 0`)
  await deferred.getByRole(`textbox`, { name: `Hex color` }).press(`Enter`)
  await expect(deferred.locator(`> p`)).toHaveText(`Committed: #123456 · updates: 1`)
})

test(`TreeView examples select nodes and ranges, and retry failed lazy branches`, async ({
  page,
}) => {
  await page.goto(`/tree-view`, { waitUntil: `networkidle` })
  const basic = page.locator(`#tree-view-basic`)
  await basic.getByRole(`treeitem`, { name: `README.md`, exact: true }).focus()
  await page.keyboard.press(`Enter`)
  await expect(basic.locator(`> p`)).toHaveText(`Selected: readme`)

  const multiple = page.locator(`#tree-view-multiple`)
  const app = multiple.getByRole(`treeitem`, { name: `App.svelte`, exact: true })
  const theme = multiple.getByRole(`treeitem`, { name: `theme.css`, exact: true })
  await app.focus()
  await theme.click({ modifiers: [`Shift`] })
  await expect(multiple.locator(`> p`)).toHaveText(`Selected: app, theme`)
  await multiple.getByRole(`button`, { name: `Clear selection` }).click()
  await app.click()
  await theme.click({ modifiers: [`ControlOrMeta`] })
  await expect(multiple.locator(`> p`)).toHaveText(`Selected: app, theme`)
  await app.click({ modifiers: [`ControlOrMeta`] })
  await multiple
    .getByRole(`treeitem`, { name: `README.md`, exact: true })
    .click({ modifiers: [`Shift`] })
  await expect(multiple.locator(`> p`)).toHaveText(`Selected: app, theme, readme`)
  await expect(
    multiple.getByRole(`treeitem`, { name: `config.ts`, exact: true }),
  ).toHaveAttribute(`aria-disabled`, `true`)
  await multiple.getByRole(`button`, { name: `Clear selection` }).click()
  await expect(multiple.locator(`> p`)).toHaveText(`Selected: None`)
  await app.focus()
  await page.keyboard.press(`Shift+ArrowDown`)
  await page.keyboard.press(`Shift+ArrowDown`)
  await expect(multiple.locator(`> p`)).toHaveText(`Selected: app, theme`)

  const lazy = page.locator(`#tree-view-loading`)
  await lazy.getByRole(`button`, { name: `Expand Remote files` }).click()
  await expect(lazy.getByRole(`status`)).toContainText(`Example source is unavailable`)
  await expect(lazy.getByRole(`treeitem`)).toHaveAttribute(`aria-busy`, `false`)
  await lazy.getByRole(`checkbox`).uncheck()
  await lazy.getByRole(`button`, { name: `Expand Remote files` }).click()
  await expect(
    lazy.getByRole(`treeitem`, { name: `report.json`, exact: true }),
  ).toBeVisible()
  await expect(lazy.getByRole(`status`)).toBeEmpty()
})

test(`JsonTree example applies leaf edits and restores the comparison snapshot`, async ({
  page,
}) => {
  await page.goto(`/json-tree`, { waitUntil: `networkidle` })
  const demo = page.locator(`#json-tree-edit`)
  await demo.locator(`.json-value.string`).dblclick()
  await demo.locator(`.edit-input`).fill(`Updated experiment`)
  await demo.locator(`.edit-input`).press(`Enter`)
  await expect(demo.locator(`.json-value.string`)).toHaveText(`"Updated experiment"`)
  await demo.getByRole(`button`, { name: `Reset edits` }).click()
  await expect(demo.locator(`.json-value.string`)).toHaveText(`"Experiment"`)
})

test(`FileInput example reports parse errors then displays and removes valid JSON`, async ({
  page,
}) => {
  await page.goto(`/file-input`, { waitUntil: `networkidle` })
  const demo = page.locator(`#file-input-json`)
  const input = demo.getByLabel(`Choose a JSON file`)
  await input.setInputFiles({
    name: `invalid.json`,
    mimeType: `application/json`,
    buffer: Buffer.from(`{`),
  })
  await expect(demo.getByRole(`button`, { name: `Retry` })).toBeVisible()
  await expect(demo.locator(`.json-tree`)).toHaveCount(0)
  await input.setInputFiles({
    name: `valid.json`,
    mimeType: `application/json`,
    buffer: Buffer.from(`{"answer":42}`),
  })
  await expect(demo.locator(`.json-value.number`)).toHaveText(`42`)
  await expect(demo.getByRole(`button`, { name: `Retry` })).toHaveCount(0)
  await demo.getByRole(`button`, { name: `Remove valid.json` }).click()
  await expect(demo.locator(`.json-tree`)).toHaveCount(0)
  await expect(demo.locator(`> p`)).toHaveText(`No JSON preview available.`)
})

test(`SplitPane example sizes panes and restores keyboard collapse`, async ({ page }) => {
  await page.goto(`/split-pane`, { waitUntil: `networkidle` })
  const demo = page.locator(`#split-pane-basic`)
  const divider = demo.getByRole(`separator`)
  const first_pane = demo.locator(`section`).first()
  await divider.focus()
  await page.keyboard.press(`ArrowRight`)
  await expect(demo.locator(`> p`)).toHaveText(`Sidebar: 45%`)
  const expanded_width = await first_pane.evaluate(
    (element) => element.getBoundingClientRect().width,
  )
  expect(expanded_width).toBeGreaterThan(0)
  await page.keyboard.press(`Enter`)
  await expect(first_pane).toHaveCSS(`width`, `0px`)
  await page.keyboard.press(`Enter`)
  expect(
    await first_pane.evaluate((element) => element.getBoundingClientRect().width),
  ).toBe(expanded_width)
})

test(`VirtualList example jumps without mounting every row and resets filtered scrolling`, async ({
  page,
}) => {
  await page.goto(`/virtual-list`, { waitUntil: `networkidle` })
  const demo = page.locator(`#virtual-list-filter`)
  const list = demo.locator(`.virtual-list`)
  const rows = list.locator(`[data-index]`)
  await expect(rows.first()).toHaveText(`Record 1`)
  expect(await rows.count()).toBeLessThan(30)
  await demo.getByRole(`button`, { name: `Jump to last result` }).click()
  await expect(rows.last()).toHaveText(`Record 10000`)
  await demo.getByRole(`textbox`).fill(`9999`)
  await expect(rows).toHaveCount(1)
  await expect(rows).toHaveText(`Record 9999`)
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBe(0)
  await demo.getByRole(`textbox`).fill(`missing`)
  await expect(demo.getByRole(`status`)).toHaveText(`No records match your filter.`)
  await expect(demo.getByRole(`button`, { name: `Jump to last result` })).toBeDisabled()
})
