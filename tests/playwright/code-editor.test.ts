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

  const scrollport = page.locator(`#code-editor-basic .content`)
  await editor.focus()
  await page.keyboard.press(`ControlOrMeta+a`)
  await page.keyboard.insertText(`a`.repeat(300))
  await page.keyboard.press(`Home`)
  await expect.poll(() => scrollport.evaluate((node) => node.scrollLeft)).toBe(0)
  await page.keyboard.press(`End`)
  await expect
    .poll(() => scrollport.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(1800)
  await expect
    .poll(() =>
      scrollport.evaluate(
        (node) => node.scrollWidth - node.scrollLeft - node.clientWidth,
      ),
    )
    .toBeLessThanOrEqual(8)
  await page.keyboard.press(`Home`)
  await expect.poll(() => scrollport.evaluate((node) => node.scrollLeft)).toBe(0)
  await page.keyboard.insertText(`b`.repeat(100))
  await expect
    .poll(() => scrollport.evaluate((node) => node.scrollLeft))
    .toBeGreaterThan(400)
  await page.keyboard.press(`Home`)
  await expect.poll(() => scrollport.evaluate((node) => node.scrollLeft)).toBe(0)

  await page.locator(`#code-editor-basic [data-load-large]`).click()
  await expect(page.locator(`#code-editor-basic [data-load-large]`)).toBeEnabled()
  await expect
    .poll(() =>
      editor.evaluate((area: HTMLTextAreaElement) => area.value.endsWith(`line 100000`)),
    )
    .toBe(true)
  expect(
    await editor.evaluate((area: HTMLTextAreaElement) => area.value.split(`\n`).length),
  ).toBeLessThan(50)
  const visible_row_count = await page
    .locator(`#code-editor-basic .token-layer .line`)
    .count()
  expect(visible_row_count).toBeGreaterThan(0)
  expect(visible_row_count).toBeLessThan(50)
  await editor.focus()
  await page.keyboard.press(`Control+End`)
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
  // Cross multiple input-window boundaries while retaining the caret column.
  for (let count = 0; count < 40; count++) await page.keyboard.press(`ArrowUp`)
  await expect(page.locator(`#code-editor-basic .gutter-line.active`)).toHaveText(`99960`)
  await page.keyboard.press(`Home`)
  await page.keyboard.type(`viewport!`)
  await expect.poll(() => editor.inputValue()).toContain(`viewport!line 99960`)
  expect(
    await editor.evaluate((area: HTMLTextAreaElement) => area.value.split(`\n`).length),
  ).toBeLessThan(50)
  await page.keyboard.press(`ControlOrMeta+z`)
  await expect.poll(() => editor.inputValue()).not.toContain(`viewport!`)
})

// oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each API
for (const text of [
  `a\u0301a\u0301a\u0301\n123456`,
  `👩‍💻👩‍💻\n123456`,
  `123\na\u0301a\u0301a\u0301`,
  `12\n👩‍💻x`,
  `a\u0301\t\n123456`,
]) {
  test(`CodeEditor vertical navigation matches native grapheme layout: ${JSON.stringify(text)}`, async ({
    page,
  }) => {
    await page.goto(`/code-editor`)
    const area = page.locator(`#code-editor-basic textarea`)
    await expect(page.locator(`#code-editor-basic .code-editor`)).toHaveAttribute(
      `aria-busy`,
      `false`,
    )
    await area.focus()
    await page.keyboard.press(`ControlOrMeta+a`)
    await page.keyboard.insertText(text)
    const start = text.indexOf(`\n`)
    await page.keyboard.press(`Control+Home`)
    await page.keyboard.press(`End`)
    const font = await area.evaluate((node: HTMLTextAreaElement) => {
      const style = getComputedStyle(node)
      return {
        family: style.fontFamily,
        size: style.fontSize,
        height: style.lineHeight,
        tabs: style.tabSize,
      }
    })
    await page.keyboard.press(`ArrowDown`)
    const actual = await area.evaluate((node: HTMLTextAreaElement) => node.selectionStart)
    await page.setContent(`<textarea></textarea>`)
    const native = page.locator(`textarea`)
    await native.fill(text)
    await native.evaluate(
      (node: HTMLTextAreaElement, { font: font_styles, start: selection_start }) => {
        node.style.cssText = `font-family:${font_styles.family};font-size:${font_styles.size};line-height:${font_styles.height};tab-size:${font_styles.tabs};width:600px;height:200px;`
        node.setSelectionRange(selection_start, selection_start)
      },
      { font, start },
    )
    await native.focus()
    await page.keyboard.press(`ArrowDown`)
    expect(actual).toBe(
      await native.evaluate((node: HTMLTextAreaElement) => node.selectionStart),
    )
  })
}

test(`CodeEditor mouse selection keeps its anchor while scrolling beyond the input window`, async ({
  page,
}) => {
  await page.goto(`/code-editor`)
  const area = page.locator(`#code-editor-basic textarea`)
  await expect(page.locator(`#code-editor-basic .code-editor`)).toHaveAttribute(
    `aria-busy`,
    `false`,
  )
  await page.locator(`#code-editor-basic [data-load-large]`).click()
  await expect.poll(() => area.inputValue()).toContain(`line 100000`)
  await area.focus()
  await page.keyboard.press(`Control+Home`)
  const port = page.locator(`#code-editor-basic .content`)
  await port.scrollIntoViewIfNeeded()
  const box = await port.boundingBox()
  if (!box) throw new Error(`Editor scroll viewport has no bounding box`)
  await page.mouse.move(box.x + 12, box.y + 10)
  await page.mouse.down()
  await page.mouse.move(box.x + 50, box.y + box.height - 10, { steps: 10 })
  const anchor = await area.evaluate((node: HTMLTextAreaElement) => node.selectionStart)
  const selected_end = await area.evaluate(
    (node: HTMLTextAreaElement) => node.selectionEnd,
  )
  expect(selected_end).toBeGreaterThan(anchor)
  await page.mouse.move(box.x + 50, box.y + box.height + 50, { steps: 10 })
  await expect.poll(() => port.evaluate((node) => node.scrollTop)).toBeGreaterThan(500)
  await page.mouse.up()
  expect(
    await area.evaluate(
      (node: HTMLTextAreaElement) => Number(node.dataset.inputFrom) + node.selectionStart,
    ),
  ).toBe(anchor)
  expect(
    await area.evaluate((node: HTMLTextAreaElement) => node.selectionEnd),
  ).toBeGreaterThan(selected_end)
  await page.keyboard.press(`Control+Home`)
  await area.dblclick({ position: { x: 20, y: 10 } })
  expect(
    await area.evaluate((node: HTMLTextAreaElement) =>
      node.value.slice(node.selectionStart, node.selectionEnd),
    ),
  ).toBe(`line`)
})

// oxlint-disable-next-line vitest/prefer-each -- Playwright has no test.each API.
for (const [text, direction] of [
  [`ab אבג cd`, `ltr`],
  [`ab العربية cd`, `ltr`],
  [`ab אב العربية cd`, `ltr`],
  [`אבג ab דהו`, `rtl`],
]) {
  test(`CodeEditor uses native bidi caret geometry for ${direction} ${text}`, async ({
    page,
  }) => {
    await page.goto(`/code-editor`)
    const editor = page.locator(`#code-editor-basic .code-editor`)
    const area = page.locator(`#code-editor-basic textarea`)
    await expect(editor).toHaveAttribute(`aria-busy`, `false`)
    await editor.evaluate((node, dir) => node.setAttribute(`dir`, dir), direction)
    const document_text = `${text}\n12345678901234567890`
    await area.focus()
    await page.keyboard.press(`ControlOrMeta+a`)
    await page.keyboard.insertText(document_text)
    await page.keyboard.press(`Control+Home`)
    const metrics = await area.evaluate((node: HTMLTextAreaElement) => {
      const style = getComputedStyle(node)
      return {
        family: style.fontFamily,
        size: style.fontSize,
        height: style.lineHeight,
        padding: style.padding,
        direction: style.direction,
        width: node.clientWidth,
      }
    })
    const positions = [12, 20, 28, 36, 44, 52, 60, 68, 76].map((offset) =>
      direction === `rtl` ? metrics.width - offset : offset,
    )
    const actual: number[] = []
    for (const position of positions) {
      await area.click({ position: { x: position, y: 10 } })
      actual.push(await area.evaluate((node: HTMLTextAreaElement) => node.selectionStart))
    }
    // An interior caret needs the whole source line's bidi/shaping context.
    await area.evaluate((node: HTMLTextAreaElement) => {
      node.setSelectionRange(4, 4)
      node.dispatchEvent(new Event(`select`))
    })
    await page.keyboard.press(`ArrowDown`)
    const actual_vertical = await area.evaluate(
      (node: HTMLTextAreaElement) => node.selectionStart,
    )
    await page.setContent(`<textarea spellcheck="false" wrap="off"></textarea>`)
    const native = page.locator(`textarea`)
    await native.fill(document_text)
    await native.evaluate((node: HTMLTextAreaElement, style) => {
      node.style.cssText = `font-family:${style.family};font-size:${style.size};line-height:${style.height};padding:${style.padding};direction:${style.direction};width:${style.width}px;height:200px;border:0;box-sizing:border-box`
    }, metrics)
    const expected: number[] = []
    for (const position of positions) {
      await native.click({ position: { x: position, y: 10 } })
      expected.push(
        await native.evaluate((node: HTMLTextAreaElement) => node.selectionStart),
      )
    }
    await native.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(4, 4))
    await page.keyboard.press(`ArrowDown`)
    expect(actual).toEqual(expected)
    expect(actual_vertical).toBe(
      await native.evaluate((node: HTMLTextAreaElement) => node.selectionStart),
    )
  })
}
