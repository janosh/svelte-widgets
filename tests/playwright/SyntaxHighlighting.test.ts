import { readdirSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { default_highlighter } from '../../src/lib/highlight/default-highlighter'

const missing_syntax_colors = async (page: Page): Promise<string[]> => {
  const uncolored = await page.locator(`pre > code`).evaluateAll((blocks) =>
    blocks.flatMap((code) => {
      const source = code.textContent ?? ``
      if (!source.trim()) return []
      const color = getComputedStyle(code).color
      const colored = [...code.querySelectorAll(`[class^="pl-"]`)].some(
        (token) => getComputedStyle(token).color !== color,
      )
      const language = code.parentElement?.className.match(
        /(?:^|\s)(?:highlight|language)-(?<language>\S+)/u,
      )?.groups?.language
      return colored ? [] : [{ source, language }]
    }),
  )
  const grammar = await default_highlighter.ready()
  const failures: string[] = []
  for (const { source, language } of uncolored) {
    // Any grammar can leave code unclassified. Missing language metadata or an unknown
    // grammar must still fail, as must tokens whose CSS failed to load.
    if (
      !language ||
      !grammar.flagToScope(language) ||
      (await default_highlighter.highlight(source, language)).includes(`<span class="pl-`)
    ) {
      failures.push(source.slice(0, 100))
    }
  }
  return failures
}

test(`distinguishes unclassified code from missing syntax markup and colors`, async ({
  page,
}) => {
  const source = `const value = 1`
  const styles = `code { color: black } [class^="pl-"] { color: red }`
  const blocks = await Promise.all([
    default_highlighter.highlight_block(`git push origin main`, `sh`),
    default_highlighter.highlight_block(`git push origin main`, `bash`),
    default_highlighter.highlight_block(`hello`, `html`),
    default_highlighter.highlight_block(source, `ts`),
  ])
  // FileDetails uses language-*; Markdown's generated blocks use highlight-*.
  blocks[1] = blocks[1].replace(`highlight-bash`, `language-bash`)
  await page.setContent(`<style>${styles}</style>${blocks.join(``)}`)
  expect(await missing_syntax_colors(page)).toEqual([])

  await page.addStyleTag({ content: `code, code [class] { color: black }` })
  expect(await missing_syntax_colors(page)).toEqual([source])
  for (const class_name of [`highlight-ts`, `highlight-unknown`, ``]) {
    await page.setContent(
      `<style>${styles}</style><pre class="${class_name}"><code>${source}</code></pre>`,
    )
    expect(await missing_syntax_colors(page), `Missing markup: ${class_name}`).toEqual([
      source,
    ])
  }
})

const routes = readdirSync(`src/routes`, { recursive: true, encoding: `utf8` })
  .filter((path) => /\+page\.(?:md|svelte)$/u.test(path))
  .map(
    (path) =>
      `/${path
        .split(`/`)
        .slice(0, -1)
        .filter((part) => !part.startsWith(`(`))
        .join(`/`)}`,
  )

// eslint-disable-next-line vitest/prefer-each -- Playwright does not provide test.each.
for (const route of routes) {
  test(`code fences on ${route} render syntax colors`, async ({ page, baseURL }) => {
    const response = await page.goto(
      new URL(route, baseURL ?? `http://localhost:3005`).href,
    )
    expect(response?.ok(), route).toBe(true)
    await expect
      .poll(() => missing_syntax_colors(page), {
        message: `Unhighlighted code on ${route}`,
        timeout: 15_000,
      })
      .toEqual([])
  })
}
