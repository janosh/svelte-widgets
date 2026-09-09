import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

test(`standalone example buttons keep their natural width across demos`, async ({
  page,
}) => {
  for (const route of [`/authoring/hot-reload`, `/toast`, `/attachments/tooltip`]) {
    await page.goto(`http://localhost:3005${route}`, { waitUntil: `networkidle` })
    const buttons = page.locator(`.code-example > button`)
    expect(
      await buttons.count(),
      `Missing standalone buttons on ${route}`,
    ).toBeGreaterThan(0)
    for (const button of await buttons.all()) {
      const ratio = await button.evaluate((element) => {
        const parent = element.parentElement
        if (!parent) throw new Error(`Missing example wrapper`)
        return (
          element.getBoundingClientRect().width / parent.getBoundingClientRect().width
        )
      })
      expect(ratio, `Button stretches across ${route}`).toBeLessThan(0.5)
    }
  }
  // Explicit sizing remains available for intentionally wide controls.
  const button = page.locator(`.code-example > button`).first()
  const ratio = await button.evaluate((element) => {
    element.style.width = `100%`
    const parent = element.parentElement
    if (!parent) throw new Error(`Missing example wrapper`)
    return element.getBoundingClientRect().width / parent.getBoundingClientRect().width
  })
  expect(ratio).toBeCloseTo(1, 2)
})

test.beforeEach(async ({ page }) => {
  // Exercise the real highlighter without depending on CDN latency or availability.
  await page.route(`https://esm.sh/vscode-oniguruma@*/release/onig.wasm`, (route) =>
    route.fulfill({
      path: fileURLToPath(import.meta.resolve(`vscode-oniguruma/release/onig.wasm`)),
      contentType: `application/wasm`,
    }),
  )
})

// eslint-disable-next-line vitest/prefer-each -- Playwright does not provide test.each.
for (const width of [390, 1440]) {
  test(`figure navigation uses definition order and native history at width ${width}`, async ({
    page,
  }) => {
    const first_figure = page.locator(`[id="fig:particles"]`)
    const second_equation = page.locator(`[id="eq:hooke"]`)
    const history_index = () => page.evaluate(() => history.state?.[`sveltekit:history`])
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ colorScheme: `dark` })
    await page.goto(`/authoring#fig%3Aparticles`)
    await expect(first_figure).toBeInViewport()
    for (const [idx, id] of [`eq:mass-energy`, `eq:hooke`].entries()) {
      const equation = page.locator(`[id="${id}"]`)
      await expect(equation.locator(`.katex-mathml`)).toHaveCSS(`clip-path`, `inset(50%)`)
      await expect(
        equation.getByRole(`link`, { name: `Equation ${idx + 1}` }),
      ).toHaveText(`(${idx + 1})`)
      await expect(equation.locator(`.equation-number`)).toBeVisible()
    }
    await expect(page.locator(`main > p .katex`)).toHaveCount(2)
    await expect(page.locator(`main > figure figcaption`)).toHaveText([
      `Figure 1. Two interacting particles`,
      `Figure 2. Spring displacement`,
    ])
    await page.goto(`/authoring`)
    const sidebar = page.locator(`aside.toc`)
    const mobile = width < 1100
    if (mobile) {
      await sidebar.getByRole(`button`, { name: `Open table of contents` }).click()
      await expect(sidebar.locator(`nav`)).toHaveCSS(
        `background-color`,
        `rgb(34, 34, 38)`,
      )
    }
    const figures = sidebar.getByRole(`group`, { name: `Figures`, exact: true })
    const equations = sidebar.getByRole(`group`, { name: `Equations`, exact: true })
    await expect(figures.getByRole(`link`)).toHaveText([
      `1 · Particle interaction`,
      `2 · Spring model`,
    ])
    await expect(equations.getByRole(`link`)).toHaveText([
      `1 · Mass–energy equivalence`,
      `2 · Hooke's law`,
    ])
    // Re-rendering a definition must update the sidebar's target, even with the same ID.
    await first_figure.evaluate((node) => node.replaceWith(node.cloneNode(true)))
    await expect(sidebar.locator(`nav > ol`)).not.toContainText(
      `Two interacting particles`,
    )
    const figure_toggle = figures.getByRole(`button`, { name: `Figures`, exact: true })
    const figure_list = figures.locator(`ul`)
    const list_height = await figure_list.evaluate(
      (node) => node.getBoundingClientRect().height,
    )
    await figure_toggle.focus()
    await page.keyboard.press(`Enter`)
    await expect(figure_toggle).toHaveAttribute(`aria-expanded`, `false`)
    const closing = await page
      .waitForFunction(() => {
        const node = document.querySelector(`[aria-label="Figures"] ul`)
        const animation = node
          ?.getAnimations()
          .find((entry) => Number(entry.effect?.getTiming().duration) > 0)
        if (!node || !animation) return false
        animation.pause()
        animation.currentTime = 90
        return node.getBoundingClientRect().height
      })
      .then((result) => result.jsonValue())
    expect(closing).toBeGreaterThan(0)
    expect(closing).toBeLessThan(list_height)
    await figure_list.evaluate((node) => node.getAnimations()[0].finish())
    await expect(figures.getByRole(`link`).first()).toBeHidden()
    await expect(equations.getByRole(`link`).first()).toBeVisible()
    await page.keyboard.press(`Enter`)
    await expect(figure_toggle).toHaveAttribute(`aria-expanded`, `true`)
    await expect(figures.getByRole(`link`).first()).toBeVisible()
    await expect
      .poll(() =>
        figure_list.evaluate((node) =>
          node.getAnimations().every((animation) => animation.playState === `finished`),
        ),
      )
      .toBe(true)
    const initial_history = await history_index()
    await page.keyboard.press(`Tab`)
    await expect(figures.getByRole(`link`).first()).toBeFocused()
    await page.keyboard.press(`Enter`)
    await expect(page).toHaveURL(/\/authoring#fig%3Aparticles$/u)
    await expect(first_figure).toBeInViewport()
    // Wait for Kit to record each native hash navigation before the next action.
    await expect.poll(history_index).toBeGreaterThan(initial_history)
    const figure_history = await history_index()
    const caption = page.locator(`[id="fig:particles"] figcaption`)
    await expect(caption).toHaveClass(/toc-clicked/u)
    const flash_animation = await caption.evaluate(
      (node) => getComputedStyle(node).animationName,
    )
    expect(flash_animation).toContain(`toc-flash`)
    if (mobile)
      await sidebar.getByRole(`button`, { name: `Open table of contents` }).click()
    await equations.getByRole(`link`, { name: `2 · Hooke's law`, exact: true }).click()
    await expect(page).toHaveURL(/\/authoring#eq%3Ahooke$/u)
    await expect(second_equation).toBeInViewport()
    await expect(second_equation).toHaveClass(/toc-clicked/u)
    await expect(second_equation).toHaveCSS(`animation-name`, flash_animation)
    await expect.poll(history_index).toBeGreaterThan(figure_history)
    await page.goBack()
    await expect(page).toHaveURL(/\/authoring#fig%3Aparticles$/u)
    await expect(first_figure).toBeInViewport()
    await page.reload()
    await expect(first_figure).toBeInViewport()
    if (mobile)
      await sidebar.getByRole(`button`, { name: `Open table of contents` }).click()
    const heading = page.locator(`#checked-examples`)
    const original_color = await heading.evaluate((node) => getComputedStyle(node).color)
    await sidebar
      .locator(`nav > ol`)
      .getByRole(`link`, { name: `Checked examples`, exact: true })
      .click()
    await expect(heading).toHaveCSS(`animation-name`, flash_animation)
    await expect(heading).not.toHaveCSS(`color`, original_color)
    await expect(heading).not.toHaveClass(/toc-clicked/u)
    await expect(heading).toHaveCSS(`color`, original_color)
    if (mobile) await page.getByRole(`button`, { name: `Toggle navigation menu` }).click()
    const inputs_toggle = page.getByRole(`button`, { name: `Toggle Inputs submenu` })
    if (mobile) await inputs_toggle.click()
    else await inputs_toggle.hover()
    await page.getByRole(`link`, { name: `RangeSlider`, exact: true }).click()
    await expect(page).toHaveURL(/\/range-slider$/u)
    await expect(sidebar.locator(`.reference-navigation`)).toHaveCount(0)
  })
}

test(`editable content labs validate manifests and recover from bad references`, async ({
  page,
}) => {
  await page.goto(`/authoring`)
  await expect(
    page.getByRole(`navigation`, { name: `Authoring features` }).getByRole(`link`),
  ).toHaveText([
    `Figure and equation navigation`,
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
  const copy_button = scenario.locator(`[data-sms-copy]`)
  await expect(copy_button).toBeVisible()
  const { width, height } = await copy_button.evaluate((node) =>
    node.getBoundingClientRect().toJSON(),
  )
  expect(width).toBe(height)
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
