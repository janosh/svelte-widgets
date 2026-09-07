import { expect, test } from '@playwright/test'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { writeFile } from 'node:fs/promises'
import { browser_fixture } from './browser-fixture'
import { create_markdown } from '../../src/lib/markdown/index.ts'
import { markdown_vite } from '../../src/lib/markdown/vite.ts'

let fixture: Awaited<ReturnType<typeof browser_fixture>>

const page_source = (color = `red`, title = `Markdown fixture`, extra = ``) => `---
title: ${title}
__proto__: { value: data }
---

# {metadata.title}

{#if Object.hasOwn(metadata, "__proto__")}
Own metadata
{/if}

${extra}

\`\`\`svelte example id="counter"
<script>
  let count = $state(0)
</script>
<button onclick={() => count++}>Count: {count}</button>
<style>
  button { color: ${color} }
</style>
\`\`\`

\`\`\`svelte example csr id="browser-only"
<script>
  const protocol = window.location.protocol
</script>
<p>Browser only: {protocol}</p>
\`\`\`
`

test.beforeAll(async () => {
  const docs = markdown_vite(
    create_markdown({ examples: { collapsible: true, hide_style: true } }),
  )
  fixture = await browser_fixture(
    `Page.md`,
    {
      'Page.md': page_source(),
      'render.js': `import { render } from 'svelte/server'; import Page from './Page.md'; export const html = render(Page).body`,
    },
    {
      optimizeDeps: { noDiscovery: true, include: [] },
      plugins: [
        docs.plugin,
        svelte({ extensions: [`.svelte`, `.md`], preprocess: docs.preprocess }),
      ],
      resolve: { alias: { 'svelte-widgets': `${process.cwd()}/src/lib/index.ts` } },
    },
  )
})
test.afterAll(async () => fixture?.close())

test(`metadata, runnable examples and CSS-only hot updates work in the browser`, async ({
  page,
}) => {
  const errors: string[] = []
  page.on(`pageerror`, (error) => errors.push(error.message))
  const ssr = await fixture.server.ssrLoadModule(`/render.js`)
  expect(ssr.html).toContain(`Count: 0`)
  expect(ssr.html).not.toContain(`Browser only: http:`)
  await page.goto(fixture.url)
  await expect(page.getByRole(`heading`, { name: `Markdown fixture` })).toBeVisible()
  await expect(page.getByText(`Browser only: http:`, { exact: true })).toBeVisible()
  const counter = page.getByRole(`button`, { name: /^Count:/u })
  await counter.click()
  await expect(counter).toHaveText(`Count: 1`)
  await expect(counter).toHaveCSS(`color`, `rgb(255, 0, 0)`)
  await page.getByRole(`button`, { name: `View code` }).first().click()
  await expect(page.locator(`#counter code`)).toContainText(`let count = $state(0)`)

  await writeFile(`${fixture.directory}/Page.md`, page_source(`blue`))
  await expect(counter).toHaveCSS(`color`, `rgb(0, 0, 255)`)
  await expect(counter).toHaveText(`Count: 1`)

  await writeFile(
    `${fixture.directory}/Page.md`,
    page_source(`blue`, `Markdown fixture`, `**New prose**`),
  )
  await expect(page.locator(`strong`)).toHaveText(`New prose`)
  await expect(counter).toHaveText(`Count: 1`)
  expect((await fixture.server.ssrLoadModule(`/render.js`)).html).toContain(
    `<strong>New prose</strong>`,
  )
  await writeFile(
    `${fixture.directory}/Page.md`,
    page_source(
      `blue`,
      `Markdown fixture`,
      `## Added section\n\nNew paragraph\n\n\`\`\`js\nconst example = 1\n\`\`\``,
    ),
  )
  await expect(page.getByRole(`heading`, { name: `Added section` })).toBeVisible()
  await expect(page.locator(`pre`).first()).toContainText(`const example = 1`)
  await expect(counter).toHaveText(`Count: 1`)

  await writeFile(
    `${fixture.directory}/Page.md`,
    page_source(`blue`, `Updated title`, `**New prose**`),
  )
  await expect(page.getByRole(`heading`, { name: `Updated title` })).toBeVisible()
  await expect(page.locator(`strong`)).toHaveText(`New prose`)
  await counter.click()
  await expect(counter).toHaveText(`Count: 1`)
  await expect(page.getByText(`Own metadata`, { exact: true })).toBeVisible()
  await writeFile(`${fixture.directory}/Page.md`, `# No examples`)
  await expect(page.getByRole(`heading`, { name: `No examples` })).toBeVisible()
  await expect(counter).toHaveCount(0)
  expect(errors).toEqual([])
})
