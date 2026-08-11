// deno-lint-ignore-file no-await-in-loop
import { foods, languages, octicons } from '$site/options'
import { expect, test, type Locator, type Page } from '@playwright/test'

// Open the /portal demo modal and return its content locator
async function open_portal_modal(page: Page): Promise<Locator> {
  await page.goto(`/portal`, { waitUntil: `networkidle` })
  await page.getByRole(`button`, { name: `Open Modal` }).click()
  return page.locator(`div.modal-content.modal`)
}

// Locate the visible portalled dropdown containing an option with the given label
const portalled_options = (page: Page, label: string): Locator =>
  page.locator(`body > ul.options:not(.hidden):has(li:has-text("${label}"))`)

async function goto_persistent(page: Page): Promise<void> {
  await page.goto(`/persistent`)
  await expect(page.locator(`#languages input[autocomplete]`)).toBeVisible()
  const store_binding_input = page.locator(
    `#store-binding input[placeholder='Select colors...']`,
  )
  await expect(store_binding_input).toBeVisible()
  await page.waitForFunction(() => {
    const input_el = document.querySelector<HTMLInputElement>(
      `#store-binding input[placeholder='Select colors...']`,
    )
    return input_el && !String(input_el.focus).includes(`[native code]`)
  })
}

// Issue #309: Array cloning by reactive wrappers (stores, Superforms) caused infinite loops
// https://github.com/janosh/svelte-widgets/issues/309
test(`array cloning infinite loop prevention (issue #309)`, async ({ page }) => {
  await goto_persistent(page)

  const input = page.locator(`#store-binding input[placeholder='Select colors...']`)
  await input.focus()
  await input.press(`ArrowDown`)
  await input.press(`Enter`)

  const status = page.locator(`#store-binding-status`)
  await expect(status.locator(`text=✅ Fixed`)).toBeVisible()
  await expect(status.locator(`text=⚠️ Regression`)).not.toBeVisible()

  const count_text = await status.textContent()
  const count = Math.trunc(Number(count_text?.match(/\d+/u)?.[0] ?? `0`))
  expect(count).toBeLessThan(10)
})

test.describe(`input`, () => {
  // https://github.com/janosh/svelte-widgets/issues/289
  test(`programmatic focus opens dropdown`, async ({ page }) => {
    await page.goto(`/ui`, { waitUntil: `networkidle` })
    const dropdown = page.locator(`#foods div.multiselect > ul.options`)
    // Raw DOM focus/blur (not locator.focus(), which skips an already-focused element
    // and would bypass the component's .focus() override in the retry below).
    const input_method = (method: `focus` | `blur`) =>
      page.evaluate((name) => {
        document.querySelector<HTMLInputElement>(`#foods input[autocomplete]`)?.[name]()
      }, method)

    await expect(dropdown).toHaveClass(/hidden/u)
    await expect(dropdown).toBeHidden()

    // Retry focus: it's a no-op if it fires before hydration installs the .focus()
    // override; each retry re-invokes .focus() until the override opens the dropdown.
    await expect(async () => {
      await input_method(`focus`)
      await expect(dropdown).not.toHaveClass(/hidden/u, { timeout: 1000 })
    }).toPass()
    await expect(dropdown).toBeVisible()

    await input_method(`blur`)
    await expect(dropdown).toHaveClass(/hidden/u)
    await expect(dropdown).toBeHidden()
  })

  // https://github.com/janosh/svelte-widgets/issues/423
  test(`retain-focus keeps input focused after mouse selection`, async ({ page }) => {
    await page.goto(`/ui`, { waitUntil: `networkidle` })
    const input = page.locator(`#retain-focus input[autocomplete]`)
    const dropdown = page.locator(`#retain-focus ul.options`)

    await input.click()
    await expect(input).toBeFocused()
    await expect(dropdown).toBeVisible()

    await dropdown.getByRole(`option`, { name: `Svelte`, exact: true }).click()

    await expect(dropdown).toBeHidden()
    await expect(input).toBeFocused()

    await page.keyboard.type(`r`)

    await expect(dropdown).toBeVisible()
    await expect(
      dropdown.getByRole(`option`, { name: `React`, exact: true }),
    ).toBeVisible()
  })
})

test.describe(`multiselect`, () => {
  // https://github.com/janosh/svelte-widgets/issues/111
  test(`loops through dropdown list with arrow keys making each option active in turn`, async ({
    page,
  }) => {
    await page.goto(`/ui`, { waitUntil: `networkidle` })
    const input = page.locator(`#foods input[autocomplete]`)
    await input.click()
    await expect(input).toBeFocused()
    await expect(page.locator(`#foods ul.options`)).toBeVisible()

    const active_option = page.locator(`#foods ul.options > li.active`)
    for (const expected_fruit of foods) {
      await input.press(`ArrowDown`)
      await expect(active_option).toHaveCount(1)
      await expect(active_option).toHaveText(expected_fruit)
    }

    await input.press(`ArrowDown`)
    await expect(active_option).toHaveText(foods[0])

    await input.press(`ArrowUp`)
    await expect(active_option).toHaveText(foods.at(-1) ?? ``)
  })

  // https://github.com/janosh/svelte-widgets/issues/357
  test(`keyboard nav ignores scroll-triggered mouseover but re-enables on mouse movement`, async ({
    page,
  }) => {
    await page.goto(`/ui`, { waitUntil: `networkidle` })
    await page.click(`#foods input[autocomplete]`)

    for (let idx = 0; idx < 3; idx++) await page.keyboard.press(`ArrowDown`)
    const active_option = page.locator(`#foods ul.options > li.active`)
    await expect(active_option).toHaveText(foods[2])

    await page.evaluate(() => {
      const first_option = document.querySelector(`#foods ul.options > li`)
      first_option?.dispatchEvent(new MouseEvent(`mouseover`, { bubbles: true }))
    })

    const active_after_synthetic_hover = await active_option.textContent()
    expect(active_after_synthetic_hover?.trim()).toBe(foods[2])

    await page.evaluate(() => {
      const options = document.querySelector(`#foods ul.options`)
      const fifth_option = document.querySelectorAll(`#foods ul.options > li`)[4]
      options?.dispatchEvent(new MouseEvent(`mousemove`, { bubbles: true }))
      fifth_option?.dispatchEvent(new MouseEvent(`mouseover`, { bubbles: true }))
    })

    await expect(active_option).toHaveText(foods[4])
  })

  test(`retains its selected state on page reload when bound to localStorage`, async ({
    page,
  }) => {
    await goto_persistent(page)
    await page.evaluate(() => sessionStorage.clear())
    await page.reload()
    await expect(page.locator(`#languages input[autocomplete]`)).toBeVisible()

    const selected = page.locator(`#languages ul.selected`)
    await expect(selected).toContainText(`Python`)

    await page.click(`#languages input[autocomplete]`)
    await expect(page.locator(`#languages ul.options`)).toBeVisible()
    await page.locator(`#languages ul.options li:has-text("Ruby")`).first().click()

    await page.reload()

    await expect(selected).toContainText(`Ruby`)
    await expect(selected).toContainText(`Python`)
  })
})

// https://github.com/janosh/svelte-widgets/issues/176
test(`browser drag reorders selected options`, async ({ page }) => {
  await goto_persistent(page)
  const selected = page.locator(`#languages ul.selected`)
  await expect(selected).toHaveText(`1  Python 2  TypeScript 3  C 4  Haskell`)

  const first_selected_option = page.locator(`#languages ul.selected li:nth-child(1)`)
  const second_selected_option = page.locator(`#languages ul.selected li:nth-child(2)`)
  await first_selected_option.dragTo(second_selected_option)

  await expect(selected).toHaveText(`1  TypeScript 2  Python 3  C 4  Haskell`)
})

test.describe(`portal feature`, () => {
  test(`dropdown renders within component when portal is inactive`, async ({ page }) => {
    await page.goto(`/ui`, { waitUntil: `networkidle` })
    await page.click(`#foods input[autocomplete]`)

    await expect(
      page.locator(`#foods > div.multiselect > ul.options:not(.hidden)`),
    ).toBeVisible()
    await expect(page.locator(`body > ul.options:not(.hidden)`)).toHaveCount(0)
  })

  test(`mobile touch selection works with portal enabled`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    const modal_content = await open_portal_modal(page)
    const languages_input = modal_content.locator(
      `div.multiselect input[placeholder='Choose languages...']`,
    )

    await languages_input.click()

    const portalled_languages_options = portalled_options(page, languages[0])
    await expect(portalled_languages_options).toBeVisible()

    const dropdown_stays_open = await page.evaluate(() => {
      const outer_div = document.querySelector(`div.multiselect`)
      const portalled_option = document.querySelector(
        `body > ul.options li[role="option"]`,
      )
      const dropdown = document.querySelector(`body > ul.options`)

      if (!outer_div || !portalled_option || !dropdown) return false

      const click_event = new MouseEvent(`click`, { bubbles: true })
      Object.defineProperty(click_event, `target`, { value: portalled_option })
      globalThis.dispatchEvent(click_event)

      return !dropdown.classList.contains(`hidden`)
    })

    expect(dropdown_stays_open).toBe(true)

    await portalled_languages_options
      .getByRole(`option`, { name: languages[0], exact: true })
      .click()
    await expect(
      modal_content.getByRole(`button`, { name: `Remove ${languages[0]}` }),
    ).toBeVisible()
  })

  test(`dropdowns in modal render in body when portal is active`, async ({ page }) => {
    const modal_content = await open_portal_modal(page)
    const languages_input = modal_content.locator(
      `div.multiselect input[placeholder='Choose languages...']`,
    )
    await languages_input.click()

    const portalled_languages_options = portalled_options(page, languages[0])
    await expect(portalled_languages_options).toBeVisible()
    await expect(
      modal_content
        .locator(`div.multiselect:has(input[placeholder='Choose languages...'])`)
        .locator(`> ul.options`),
    ).not.toBeAttached()

    await portalled_languages_options
      .getByRole(`option`, { name: languages[0], exact: true })
      .click()
    await expect(portalled_languages_options).toBeVisible()
    await expect(
      modal_content.getByRole(`button`, { name: `Remove ${languages[0]}` }),
    ).toBeVisible()

    await page.keyboard.press(`Escape`)
    await expect(portalled_languages_options).toBeHidden()
    await expect(modal_content).toBeVisible()

    const octicons_input = modal_content.locator(
      `div.multiselect input[placeholder='Choose octicons...']`,
    )
    await octicons_input.click()

    const portalled_octicons_options = portalled_options(page, octicons[0])
    await expect(portalled_octicons_options).toBeVisible()
    await expect(
      modal_content
        .locator(`div.multiselect:has(input[placeholder='Choose octicons...'])`)
        .locator(`> ul.options`),
    ).not.toBeAttached()

    await portalled_octicons_options
      .getByRole(`option`, { name: octicons[0], exact: true })
      .click()
    await expect(portalled_octicons_options).toBeHidden()
    await expect(
      modal_content.getByRole(`button`, { name: `Remove ${octicons[0]}` }),
    ).toBeVisible()

    await page.keyboard.press(`Escape`)
    await page.getByRole(`button`, { name: `Close Modal` }).click()
    await expect(modal_content).toBeHidden()
  })

  test(`portalled dropdown tracks trigger after nested scroll and resize`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 900, height: 700 })
    const modal_content = await open_portal_modal(page)
    const languages_input_selector = `div.multiselect input[placeholder='Choose languages...']`
    const languages_input = modal_content.locator(languages_input_selector)

    await page.evaluate(() => {
      const modal = document.querySelector<HTMLElement>(`div.modal-content.modal`)
      const first_multiselect = modal?.querySelector(`div.multiselect`)
      if (!modal || !first_multiselect) throw new Error(`portal modal setup missing`)

      modal.style.maxHeight = `220px`
      modal.style.overflowY = `auto`
      const spacer = document.createElement(`div`)
      spacer.style.height = `120px`
      spacer.textContent = `scroll spacer`
      first_multiselect.before(spacer)
    })

    await languages_input.click()
    const portalled_languages_options = portalled_options(page, languages[0])
    await expect(portalled_languages_options).toBeVisible()

    const assert_aligned = async () => {
      const metrics_handle = await page.waitForFunction((input_selector) => {
        const input = document.querySelector<HTMLInputElement>(
          `div.modal-content.modal ${input_selector}`,
        )
        const wrapper = input?.closest<HTMLElement>(`div.multiselect`)
        const dropdown = document.querySelector<HTMLElement>(
          `body > ul.options:not(.hidden)`,
        )
        if (!wrapper || !dropdown) return false

        const wrapper_rect = wrapper.getBoundingClientRect()
        const dropdown_rect = dropdown.getBoundingClientRect()
        const left_delta = Math.abs(dropdown_rect.left - wrapper_rect.left)
        // auto placement may flip the dropdown above the trigger when space below
        // is tight; measure the gap on whichever edge the portal chose
        const top_delta =
          dropdown.dataset.placement === `top`
            ? Math.abs(wrapper_rect.top - dropdown_rect.bottom)
            : Math.abs(dropdown_rect.top - wrapper_rect.bottom)
        const width_delta = Math.abs(dropdown_rect.width - wrapper_rect.width)
        const aligned =
          left_delta <= 2 &&
          top_delta <= 10 &&
          width_delta <= 2 &&
          dropdown_rect.top >= 0 &&
          dropdown_rect.right <= globalThis.innerWidth + 1
        return aligned ? [left_delta, top_delta, width_delta] : false
      }, languages_input_selector)
      const metrics = await metrics_handle.jsonValue()
      if (metrics === false) throw new Error(`portal dropdown alignment timed out`)
      const [left_delta, top_delta, width_delta] = metrics

      expect(left_delta).toBeLessThanOrEqual(2)
      expect(top_delta).toBeLessThanOrEqual(10)
      expect(width_delta).toBeLessThanOrEqual(2)
    }

    await assert_aligned()

    await page.evaluate(() => {
      const modal = document.querySelector<HTMLElement>(`div.modal-content.modal`)
      if (!modal) throw new Error(`portal modal missing`)
      modal.scrollTop = 80
      modal.dispatchEvent(new Event(`scroll`, { bubbles: true }))
    })
    await assert_aligned()

    await page.setViewportSize({ width: 760, height: 620 })
    await assert_aligned()
  })
})

// virtualList windowing needs real browser layout (happy-dom reports zero
// heights), exercised on the internal /virtual-list test page which mounts
// 2000 options with rows pinned to the default 30px itemHeight
test.describe(`virtualList`, () => {
  const item_height = 30
  const total_options = 2000
  const rendered_options = (page: Page): Locator =>
    page.locator(`.virtual ul.options > li[role="option"]`)
  const spacers = (page: Page): Locator =>
    page.locator(`.virtual ul.options > li[aria-hidden="true"]`)

  const goto_virtual_list = async (page: Page): Promise<void> => {
    await page.goto(`/virtual-list`, { waitUntil: `networkidle` })
    await expect(page.locator(`.virtual ul.options`)).toBeVisible()
    // scroll + keyboard handlers only work once hydration installs the
    // component's input.focus override (same readiness signal as goto_persistent)
    await page.waitForFunction(() => {
      const input_el = document.querySelector<HTMLInputElement>(
        `.virtual input[autocomplete]`,
      )
      return input_el && !String(input_el.focus).includes(`[native code]`)
    })
  }

  test(`renders only a small window of the 2000-option list`, async ({ page }) => {
    await goto_virtual_list(page)

    await expect(rendered_options(page).first()).toHaveText(`Option 0`)
    const option_count = await rendered_options(page).count()
    expect(option_count).toBeGreaterThan(5)
    expect(option_count).toBeLessThan(100)

    // spacers keep scrollHeight at the full 2000 * 30px list height
    await expect(spacers(page)).toHaveCount(2)
    const scroll_height = await page
      .locator(`.virtual ul.options`)
      .evaluate((ul_el) => ul_el.scrollHeight)
    expect(Math.abs(scroll_height - total_options * item_height)).toBeLessThanOrEqual(100)
  })

  test(`scrolling to the middle re-windows options and adjusts spacers`, async ({
    page,
  }) => {
    await goto_virtual_list(page)
    const options_list = page.locator(`.virtual ul.options`)
    await expect(rendered_options(page).first()).toHaveText(`Option 0`)

    const target_scroll = 15_000 // row 500 of 2000
    await options_list.evaluate(
      (ul_el, scroll_top) => (ul_el.scrollTop = scroll_top),
      target_scroll,
    )

    // window start = floor(15_000 / 30) - default overscan 10 = 490
    await expect(rendered_options(page).first()).toHaveText(`Option 490`)
    await expect(
      options_list.getByRole(`option`, { name: `Option 0`, exact: true }),
    ).toHaveCount(0)

    const [top_spacer_height, bottom_spacer_height] = await spacers(page).evaluateAll(
      (spacer_els) => spacer_els.map((el) => (el as HTMLElement).offsetHeight),
    )
    expect(top_spacer_height).toBe(490 * item_height)
    expect(bottom_spacer_height).toBeGreaterThan(40_000)

    const { scroll_height, scroll_top } = await options_list.evaluate((ul_el) => ({
      scroll_height: ul_el.scrollHeight,
      scroll_top: ul_el.scrollTop,
    }))
    expect(scroll_top).toBe(target_scroll)
    expect(Math.abs(scroll_height - total_options * item_height)).toBeLessThanOrEqual(100)
  })

  test(`ArrowDown navigation keeps the active option rendered and visible`, async ({
    page,
  }) => {
    await goto_virtual_list(page)
    const input = page.locator(`.virtual input[autocomplete]`)
    await input.click()

    const active_option = page.locator(`.virtual ul.options > li.active`)
    // 15 rows * 30px > 300px dropdown viewport → navigation must scroll the window
    for (let idx = 0; idx < 15; idx++) {
      await input.press(`ArrowDown`)
      await expect(active_option).toHaveCount(1)
      await expect(active_option).toHaveText(`Option ${idx}`)
    }

    // the active row must lie fully inside the dropdown's scroll viewport
    const in_view = await page.waitForFunction(() => {
      const ul_el = document.querySelector(`.virtual ul.options`)
      const active_el = ul_el?.querySelector(`li.active`)
      if (!ul_el || !active_el) return false
      const ul_rect = ul_el.getBoundingClientRect()
      const active_rect = active_el.getBoundingClientRect()
      return (
        active_rect.top >= ul_rect.top - 2 && active_rect.bottom <= ul_rect.bottom + 2
      )
    })
    expect(await in_view.jsonValue()).toBe(true)
  })
})

// the portal's `auto` placement flips the dropdown above the input when it would
// overflow the viewport bottom — needs real viewport geometry. Uses the /portal
// modal: in a short viewport the lower (octicons) input has more space above.
test.describe(`portal placement auto-flip`, () => {
  const open_dropdown_at_viewport_height = async (
    page: Page,
    height: number,
    placeholder: string,
    pin_modal_to_bottom = false,
  ): Promise<{ dropdown: Locator; input: Locator }> => {
    await page.setViewportSize({ width: 800, height })
    const modal_content = await open_portal_modal(page)
    if (pin_modal_to_bottom) {
      // the centered modal never leaves enough room above AND too little below;
      // pin it to the viewport bottom so the flip geometry is deterministic
      await page.evaluate(() => {
        const backdrop = document.querySelector<HTMLElement>(`.modal-backdrop`)
        if (!backdrop) throw new Error(`modal backdrop not found`)
        backdrop.style.alignItems = `flex-end`
      })
    }
    const input = modal_content.locator(`input[placeholder='${placeholder}']`)

    const dropdown = page.locator(`body > ul.options:not(.hidden)`)
    await expect(async () => {
      await input.click()
      await expect(dropdown).toBeVisible({ timeout: 1000 })
    }).toPass()
    return { dropdown, input }
  }

  test(`input near viewport bottom flips dropdown above the input`, async ({ page }) => {
    const { dropdown, input } = await open_dropdown_at_viewport_height(
      page,
      500,
      `Choose octicons...`,
      true,
    )
    await expect(dropdown).toHaveAttribute(`data-placement`, `top`)

    const [dropdown_box, input_box] = [
      await dropdown.boundingBox(),
      await input.boundingBox(),
    ]
    if (!dropdown_box || !input_box) throw new Error(`missing bounding box`)
    expect(dropdown_box.y + dropdown_box.height).toBeLessThanOrEqual(input_box.y + 1)
  })

  test(`input with ample space below keeps dropdown below the input`, async ({
    page,
  }) => {
    const { dropdown, input } = await open_dropdown_at_viewport_height(
      page,
      900,
      `Choose languages...`,
    )
    await expect(dropdown).toHaveAttribute(`data-placement`, `bottom`)

    const [dropdown_box, input_box] = [
      await dropdown.boundingBox(),
      await input.boundingBox(),
    ]
    if (!dropdown_box || !input_box) throw new Error(`missing bounding box`)
    expect(dropdown_box.y).toBeGreaterThanOrEqual(input_box.y + input_box.height - 1)
  })
})

test(`input width minimizes when options are selected`, async ({ page }) => {
  await page.goto(`/ui`, { waitUntil: `networkidle` })
  const input = page.locator(`#foods input[autocomplete]`)

  const init_input_width = await input.evaluate(
    (element) => getComputedStyle(element).minWidth,
  )
  expect(init_input_width).toBe(`32px`)

  await input.click()
  await page.click(`text=🍌 Banana`)

  const input_width_w_selected = await input.evaluate(
    (element) => getComputedStyle(element).minWidth,
  )
  expect(input_width_w_selected).toBe(`1px`)

  await page.click(`button[title='Remove 🍌 Banana']`)
  const input_width_w_no_selected = await input.evaluate(
    (element) => getComputedStyle(element).minWidth,
  )
  expect(input_width_w_no_selected).toBe(init_input_width)
})

// Issue #380: CSS class specificity - user classes should override component defaults
// https://github.com/janosh/svelte-widgets/issues/380
test(`component buttons are styled correctly with border: none`, async ({ page }) => {
  await page.goto(`/css-classes`, { waitUntil: `networkidle` })

  const button = page.locator(`ul.selected > li button`).first()
  await expect(button).toBeVisible()

  const border_style = await button.evaluate(
    (element) => getComputedStyle(element).borderStyle,
  )
  expect(border_style).toBe(`none`)
})

// Runtime regression tests for the schemeless-dark-page readability fix: the component
// pairs a light-dark() text-color default with its light-dark() backgrounds so text can't
// inherit a near-white page color on pages that never declare `color-scheme` (there
// light-dark() resolves to its light branch). happy-dom strips light-dark()/var() from
// computed styles, so this can only be verified in a real browser.
// light-dark(#222, #eee) → #222 = rgb(34, 34, 34) under the schemeless (light) scheme.
test.describe(`schemeless-dark-page text-color readability`, () => {
  test.use({ colorScheme: `light` }) // schemeless subtree resolves light-dark() to its light branch
  const readable = `rgb(34, 34, 34)`
  const computed_color = (page: Page, selector: string) =>
    page
      .locator(selector)
      .first()
      .evaluate((element) => getComputedStyle(element).color)

  // in-place: the div.multiselect root default cascades to the input the user types in
  test(`in-place widget text uses the light-dark() default, not the inherited page color`, async ({
    page,
  }) => {
    await page.goto(`/ui`, { waitUntil: `networkidle` })

    // simulate a dark page that never declares color-scheme: force the schemeless (normal)
    // scheme on the widget's subtree and give its parent a distinctive inherited color.
    await page.evaluate(() => {
      const parent =
        document.querySelector<HTMLElement>(`#foods div.multiselect`)?.parentElement
      if (!parent) throw new Error(`#foods div.multiselect parent not found`)
      parent.style.colorScheme = `normal`
      parent.style.color = `rgb(255, 0, 0)`
    })

    expect(await computed_color(page, `#foods div.multiselect`), `root`).toBe(readable)
    expect(await computed_color(page, `#foods input[autocomplete]`), `input`).toBe(
      readable,
    )
  })

  // portalled: ul.options is moved to document.body and no longer inherits div.multiselect's
  // color, so it needs its own default — this is the surface an in-place test can't verify.
  test(`portalled dropdown text uses the light-dark() default, not the inherited page color`, async ({
    page,
  }) => {
    const modal_content = await open_portal_modal(page)
    await modal_content.locator(`input[placeholder='Choose languages...']`).click()

    const dropdown = page.locator(`body > ul.options:not(.hidden)`)
    await expect(dropdown).toBeVisible()

    // schemeless dark page: the portalled dropdown inherits color-scheme + color from body
    await page.evaluate(() => {
      document.body.style.colorScheme = `normal`
      document.body.style.color = `rgb(255, 0, 0)`
    })

    expect(await computed_color(page, `body > ul.options:not(.hidden)`), `dropdown`).toBe(
      readable,
    )
    expect(
      await computed_color(page, `body > ul.options:not(.hidden) > li`),
      `option`,
    ).toBe(readable)
  })
})

// the /form demo previews the submitted FormData; spreading it into JSON.stringify()
// silently dropped every field but the first (extra entries land in the replacer/space args)
test(`form demo previews every submitted FormData field`, async ({ page }) => {
  await page.goto(`/form`, { waitUntil: `networkidle` })

  await page.locator(`form input[autocomplete]`).click()
  for (const color of [`Red`, `Green`]) await page.click(`ul.options >> text=${color}`)
  await page.keyboard.press(`Escape`) // dropdown would otherwise cover the submit button
  await page.getByRole(`button`, { name: `Submit` }).click()

  // the page also renders the example's source in a <pre>, so match on content
  const json_preview = page.locator(`pre code`).filter({ hasText: /^\{"martian-flag"/u })
  await expect(json_preview).toHaveCount(1)
  expect(JSON.parse((await json_preview.textContent()) ?? ``)).toEqual({
    'martian-flag': `["Red","Green"]`,
  })
  await expect(
    page.locator(`pre code`).filter({ hasText: /^\["Red","Green"\]$/u }),
  ).toHaveCount(1)
})
