import { expect, test } from '@playwright/test'

test(`walkthrough supports keyboard steps and stays readable on narrow screens`, async ({
  page,
}) => {
  await page.goto(`/authoring`)
  await expect(page.locator(`.code-playground [role=status]`)).toHaveText(`Preview ready`)
  const walkthrough = page.getByRole(`region`, { name: `Code walkthrough`, exact: true })
  const first = walkthrough.getByRole(`tab`, { name: `Create state` })
  await first.focus()
  await page.keyboard.press(`ArrowDown`)
  await expect(walkthrough.getByRole(`tab`, { name: `Handle a click` })).toBeFocused()
  await expect(walkthrough.locator(`.added .text`)).toHaveText(
    `const increment = () => count += 1`,
  )
  await expect(walkthrough.locator(`.focused .annotation`)).toHaveText(
    `One action, one state update`,
  )
  await expect(walkthrough.locator(`.line`)).toHaveCount(2)
  await page.keyboard.press(`End`)
  await expect(walkthrough.getByRole(`button`, { name: `Next` })).toBeDisabled()
  await expect(walkthrough.locator(`.removed .text`)).toHaveText(`<button>Count</button>`)
  await page.setViewportSize({ width: 375, height: 850 })
  await expect(walkthrough.getByRole(`tabpanel`)).toBeVisible()
  const width = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }))
  expect(width.page).toBeLessThanOrEqual(width.viewport)
  await walkthrough.getByRole(`button`, { name: `Previous` }).click()
  await expect(walkthrough.locator(`[aria-live]`)).toHaveText(`Step 2 of 3`)
  const annotation_bounds = await walkthrough.locator(`.annotation`).boundingBox()
  expect(annotation_bounds).not.toBeNull()
  if (annotation_bounds)
    expect(annotation_bounds.x + annotation_bounds.width).toBeLessThanOrEqual(
      width.viewport,
    )
  const references = page
    .frameLocator(`iframe[title="Scientific reference preview"]`)
    .locator(`body`)
  await expect(references.getByRole(`link`, { name: `Equation (1)` })).toHaveAttribute(
    `href`,
    `#eq:energy`,
  )
  await expect(references.locator(`figcaption`)).toHaveText(`Figure 1. Svelte Widgets`)
  await expect
    .poll(() =>
      references
        .locator(`img`)
        .evaluate((element) =>
          element instanceof HTMLImageElement ? element.naturalWidth : 0,
        ),
    )
    .toBeGreaterThan(0)
  await expect(references.locator(`math`)).toHaveCount(1)
  await expect(references.getByRole(`heading`, { name: `References` })).toBeVisible()
})

test(`editable content labs validate manifests, reuse highlights, and recover from bad references`, async ({
  page,
}) => {
  await page.goto(`/authoring`)
  const manifest = page.getByRole(`region`, { name: `Content manifest lab`, exact: true })
  await expect(manifest.getByRole(`status`)).toHaveText(`2 headings · 1 links · 0 issues`)
  await manifest.getByRole(`button`, { name: `Break a link` }).click()
  await expect(manifest.getByRole(`status`)).toHaveText(`2 headings · 1 links · 1 issues`)
  await expect(manifest).toContainText(`Missing document /missing.md`)
  const source = manifest.getByRole(`textbox`, { name: `Content manifest source` })
  await source.fill(`---\ntitle: 42\n---\n# Invalid`)
  await manifest
    .getByRole(`button`, { name: `Run content manifest`, exact: true })
    .click()
  await expect(manifest.getByRole(`alert`)).toContainText(
    `title must be a nonempty string`,
  )
  await manifest.getByRole(`button`, { name: `Reset source` }).click()
  await expect(manifest.getByRole(`status`)).toContainText(`0 issues`)

  const incremental = page.getByRole(`region`, {
    name: `Incremental compilation lab`,
    exact: true,
  })
  await expect(incremental.getByRole(`status`)).toHaveText(
    `1 examples · 1 new highlight calls`,
  )
  await incremental.getByRole(`button`, { name: `Add prose` }).click()
  await expect(incremental.getByRole(`status`)).toHaveText(
    `1 examples · 0 new highlight calls`,
  )
  const code = incremental.getByRole(`textbox`, {
    name: `Incremental compilation source`,
  })
  await code.fill((await code.inputValue()).replace(`count++`, `count += 2`))
  await incremental
    .getByRole(`button`, { name: `Run incremental compilation`, exact: true })
    .click()
  await expect(incremental.getByRole(`status`)).toHaveText(
    `1 examples · 1 new highlight calls`,
  )
  await expect(incremental).toContainText(`ids_unchanged`)

  const science = page.getByRole(`region`, {
    name: `Scientific references lab`,
    exact: true,
  })
  await science.getByRole(`button`, { name: `Try an unresolved reference` }).click()
  await expect(science.getByRole(`alert`)).toContainText(`Unresolved reference missing`)
  await science.getByRole(`button`, { name: `Reset source` }).click()
  await expect(science.getByRole(`status`)).toHaveText(`3 references resolved`)
  await expect(science.locator(`iframe`)).toHaveAttribute(`sandbox`, ``)
  await expect(science.getByRole(`alert`)).toHaveCount(0)
})

test(`checked-example scenarios and editable syntax checks expose actual failures`, async ({
  page,
}) => {
  await page.goto(`/authoring`)
  const lab = page.getByRole(`region`, { name: `Checked examples lab`, exact: true })
  await lab
    .getByRole(`combobox`, { name: `Check scenario` })
    .selectOption({ label: `Type mismatch` })
  await expect(lab.getByRole(`status`)).toHaveText(
    `Failed · 1 checked · 0 assertions passed`,
  )
  await expect(lab).toContainText(`TS2322`)
  await lab.getByRole(`combobox`).selectOption({ label: `Passing assertion` })
  await expect(lab.getByRole(`status`)).toHaveText(
    `Passed · 1 checked · 1 assertions passed`,
  )
  await lab.getByRole(`combobox`).selectOption({ label: `Failing assertion` })
  await expect(lab).toContainText(`Expected count 1 after increment(), got 2`)
  const source = lab.getByRole(`textbox`, { name: `Svelte source` })
  await source.fill(`<p>{#if true}`)
  await lab.getByRole(`button`, { name: `Check Svelte syntax` }).click()
  await expect(lab.getByRole(`alert`)).toBeVisible()
  await source.fill(`<p>Fixed</p>`)
  await lab.getByRole(`button`, { name: `Check Svelte syntax` }).click()
  await expect(lab.getByRole(`alert`)).toHaveCount(0)
  await expect(lab).toContainText(`Svelte syntax passes`)
  await page.getByRole(`link`, { name: `live Markdown counter`, exact: true }).click()
  await expect(page).toHaveURL(/\/authoring\/hot-reload$/)
  const counter = page.getByRole(`button`, { name: `Count: 0`, exact: true })
  await counter.click()
  await page.getByRole(`button`, { name: `Count: 1`, exact: true }).click()
  await expect(page.getByRole(`button`, { name: `Count: 2`, exact: true })).toBeVisible()
})
