import { expect, test } from '@playwright/test'
import { goto } from './helpers'

test.beforeEach(({ page }) => goto(page, `/patterns`, { waitUntil: `networkidle` }))

test(`FindBar registers the matching range`, async ({ page }) => {
  const demo = page.locator(`#patterns-find-bar`)
  await demo.getByRole(`searchbox`).fill(`browser's own`)

  await expect
    .poll(() =>
      page.evaluate(() => Array.from(CSS.highlights.get(`find-match`) ?? [], String)),
    )
    .toEqual([`browser's own`])
})

test(`Sheet backdrop closes and restores focus`, async ({ page }) => {
  const opener = page
    .locator(`#patterns-sheet`)
    .getByRole(`button`, { name: `Open settings` })
  await opener.click()

  const sheet = page.getByRole(`dialog`, { name: `Settings` })
  await expect(sheet.getByRole(`button`, { name: `Close` })).toBeFocused()
  await expect(sheet).toHaveCSS(`right`, `0px`)

  await page.mouse.click(1, 1)
  await expect(sheet).toBeHidden()
  await expect(opener).toBeFocused()
})

test(`nested Dialogs give Escape and focus to the innermost modal`, async ({ page }) => {
  const demo = page.locator(`#patterns-dialog`)
  const opener = demo.getByRole(`button`, { name: `Edit profile` })
  await opener.click()

  const outer = page.getByRole(`dialog`, { name: `Edit profile` })
  const nested_opener = outer.getByRole(`button`, { name: `Advanced` })
  await nested_opener.click()

  const inner = page.getByRole(`dialog`, { name: `Advanced profile settings` })
  await expect(inner).toBeVisible()
  await page.keyboard.press(`Escape`)
  await expect(inner).toBeHidden()
  await expect(outer).toBeVisible()
  await expect(nested_opener).toBeFocused()

  await page.keyboard.press(`Escape`)
  await expect(outer).toBeHidden()
  await expect(opener).toBeFocused()
})

test(`Dialog backdrop dims without blurring by default`, async ({ page }) => {
  const demo = page.locator(`#patterns-dialog`)
  await demo.getByRole(`button`, { name: `Edit profile` }).click()
  const dialog = page.getByRole(`dialog`, { name: `Edit profile` })

  const backdrop_style = () =>
    dialog.evaluate((element) => {
      const style = getComputedStyle(element, `::backdrop`)
      return [style.backgroundColor, style.backdropFilter]
    })
  await expect.poll(backdrop_style).toEqual([`rgba(0, 0, 0, 0.42)`, `none`])

  await dialog.evaluate((element) => {
    element.removeAttribute(`data-backdrop-dim`)
    element.setAttribute(`data-backdrop-blur`, `true`)
  })
  await expect.poll(backdrop_style).toEqual([`rgba(0, 0, 0, 0)`, `blur(2px)`])
})

test(`Dialog supports every backdrop and Escape dismissal policy`, async ({ page }) => {
  for (const closedby of [`any`, `closerequest`, `none`] as const) {
    const demo = page.locator(`#patterns-dialog`)
    await demo.getByLabel(`Dismissal policy`).selectOption(closedby)
    const opener = demo.getByRole(`button`, { name: `Edit profile` })
    const dialog = page.getByRole(`dialog`, { name: `Edit profile` })

    await opener.click()
    await page.keyboard.press(`Escape`)
    if (closedby !== `none`) {
      await expect(dialog).toBeHidden()
      await expect(demo.getByText(`Last close: escape`)).toBeVisible()
      await opener.click()
    } else await expect(dialog).toBeVisible()

    await page.mouse.click(1, 1)
    if (closedby === `any`) {
      await expect(dialog).toBeHidden()
      await expect(demo.getByText(`Last close: pointer`)).toBeVisible()
    } else {
      await expect(dialog).toBeVisible()
      await dialog.getByRole(`button`, { name: `Close` }).click()
    }
  }
})

test(`a stale native close event cannot close a reopened Dialog`, async ({ page }) => {
  const demo = page.locator(`#patterns-dialog`)
  const opener = demo.getByRole(`button`, { name: `Edit profile` })
  await opener.click()

  await page.evaluate(async () => {
    const dialog_opener = document.querySelector<HTMLButtonElement>(
      `#patterns-dialog button`,
    )
    const old_dialog = document.querySelector<HTMLDialogElement>(`dialog.dialog`)
    const close_button = old_dialog?.querySelector<HTMLButtonElement>(`button`)
    if (!dialog_opener || !old_dialog || !close_button) {
      throw new Error(`Dialog controls not found`)
    }
    const closed = new Promise<void>((resolve) => {
      old_dialog.addEventListener(`close`, () => resolve(), { once: true })
    })
    close_button.click()
    await closed
    await new Promise(requestAnimationFrame)
    dialog_opener.click()
    await new Promise(requestAnimationFrame)
    old_dialog.dispatchEvent(new Event(`close`))
    await new Promise(requestAnimationFrame)
  })

  const dialog = page.getByRole(`dialog`, { name: `Edit profile` })
  await expect(dialog).toBeVisible()
})

// Headless Tabs' and Accordion's one default style: their buttons take the surrounding font,
// not the browser's 13.33px button font, at zero specificity so any consumer rule still wins
for (const [role, name, selector] of [
  [`tab`, `Overview`, `.tabs-tab`],
  [`button`, `Installation`, `.accordion-trigger`],
] as const) {
  test(`${selector} buttons inherit the surrounding font`, async ({ page }) => {
    const button = page.getByRole(role, { name })
    const fonts = await button.evaluate((el, rule_selector) => {
      const font = (node: Element) => {
        const { fontSize, fontFamily, fontWeight } = getComputedStyle(node)
        return { fontSize, fontFamily, fontWeight }
      }
      if (!el.parentElement) throw new Error(`button has no parent`)
      const inherited = font(el)
      const sheet = new CSSStyleSheet()
      sheet.replaceSync(`${rule_selector} { font-size: 7px }`)
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      const overridden = getComputedStyle(el).fontSize
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter(
        (it) => it !== sheet,
      )
      return { inherited, parent: font(el.parentElement), overridden }
    }, selector)
    expect(fonts.inherited).toEqual(fonts.parent)
    expect(fonts.overridden).toBe(`7px`)
  })
}
