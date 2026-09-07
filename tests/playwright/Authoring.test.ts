import { expect, test } from '@playwright/test'

test(`editable content labs validate manifests, reuse highlights, and recover from bad references`, async ({
  page,
}) => {
  await page.goto(`/authoring`)
  await expect(
    page.getByRole(`navigation`, { name: `Authoring features` }).getByRole(`link`),
  ).toHaveText([
    `Checked examples`,
    `Content manifests`,
    `Incremental compilation`,
    `Scientific references`,
  ])

  const manifest = page.getByRole(`region`, { name: `Content manifest lab`, exact: true })
  await expect(manifest.locator(`.preview .pl-k`).first()).toHaveText(`const`)
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
  await expect(incremental.locator(`.preview .pl-k`).first()).toHaveText(`let`)
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

  const science = page.getByRole(`region`, {
    name: `Scientific references lab`,
    exact: true,
  })
  const science_source = science.getByRole(`textbox`, {
    name: `Scientific references source`,
  })
  await science_source.fill(
    `${await science_source.inputValue()}\n\n\`\`\`ts\nconst count: number = 1\n\`\`\``,
  )
  await science
    .getByRole(`button`, { name: `Run scientific references`, exact: true })
    .click()
  const keyword = references.locator(`pre .pl-k`).first()
  await expect(keyword).toHaveText(`const`)
  expect(await keyword.evaluate((element) => getComputedStyle(element).color)).not.toBe(
    await references
      .locator(`pre code`)
      .evaluate((element) => getComputedStyle(element).color),
  )
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
  await expect(lab.locator(`.preview .pl-k`).first()).toHaveText(`let`)
  const scenario = lab.locator(`pre[aria-label="Scenario source"]`)
  await expect(scenario.locator(`.pl-k`).first()).toHaveText(`const`)
  await expect(scenario).toContainText(`const count: number = 1`)
  await lab
    .getByRole(`combobox`, { name: `Check scenario` })
    .selectOption({ label: `Type mismatch` })
  await expect(lab.getByRole(`status`)).toHaveText(
    `Failed · 1 checked · 0 assertions passed`,
  )
  await expect(lab).toContainText(`TS2322`)
  await expect(scenario).toContainText(`const count: number = "one"`)
  await expect(scenario.locator(`.pl-k`).first()).toHaveText(`const`)
  await lab.getByText(`Run these checks in your project`, { exact: true }).click()
  await expect(
    lab.getByRole(`region`, { name: `Checker setup` }).locator(`.pl-k`).first(),
  ).toHaveText(`import`)
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
  await expect(lab.locator(`.preview code`)).toHaveText(`<p>Fixed</p>`)
  await lab.getByRole(`button`, { name: `Check Svelte syntax` }).click()
  await expect(lab.getByRole(`alert`)).toHaveCount(0)
  await expect(lab).toContainText(`Svelte syntax passes`)
  await page.getByRole(`link`, { name: `live Markdown counter`, exact: true }).click()
  await expect(page).toHaveURL(/\/authoring\/hot-reload$/)
  const counter = page.getByRole(`button`, { name: `Count: 0`, exact: true })
  await counter.click()
  await page.getByRole(`button`, { name: `Count: 1`, exact: true }).click()
  await expect(page.getByRole(`button`, { name: `Count: 2`, exact: true })).toBeVisible()
  await page
    .getByRole(`link`, { name: `Return to the interactive authoring labs` })
    .click()
  await expect(page).toHaveURL(/\/authoring#incremental-compilation$/)
})
