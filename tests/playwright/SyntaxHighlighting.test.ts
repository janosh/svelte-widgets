import { readdirSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { default_highlighter } from '../../src/lib/highlight/default-highlighter'

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

test(`code fences across every site route render syntax colors`, async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000)
  for (const route of routes) {
    const response = await page.goto(
      new URL(route, baseURL ?? `http://localhost:3005`).href,
    )
    expect(response?.ok(), route).toBe(true)
    await expect
      .poll(
        async () => {
          const uncolored = await page.locator(`pre > code`).evaluateAll((blocks) =>
            blocks.flatMap((code) => {
              const source = code.textContent?.trim() ?? ``
              if (!source) return []
              const color = getComputedStyle(code).color
              const colored = [...code.querySelectorAll(`[class^="pl-"]`)].some(
                (token) => getComputedStyle(token).color !== color,
              )
              return colored
                ? []
                : [
                    {
                      source,
                      shell: code.parentElement?.classList.contains(`highlight-sh`),
                    },
                  ]
            }),
          )
          const failures: string[] = []
          for (const { source, shell } of uncolored) {
            // Shell commands can legitimately contain no classified tokens. Ask the
            // grammar instead of guessing from punctuation or line breaks.
            if (
              !shell ||
              (await default_highlighter.highlight(source, `sh`)).includes(
                `<span class="pl-`,
              )
            ) {
              failures.push(source.slice(0, 100))
            }
          }
          return failures
        },
        { message: `Unhighlighted code on ${route}`, timeout: 15_000 },
      )
      .toEqual([])
  }
})
