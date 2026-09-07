import { expect, test } from '@playwright/test'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer, type ViteDevServer } from 'vite'
import { create_markdown } from '../../src/lib/markdown/index.ts'
import { markdown_vite } from '../../src/lib/markdown/vite.ts'

let directory: string
let server: ViteDevServer
let url: string

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

// Keep the files, server, and optimizer cache isolated; only dependencies are shared.
test.beforeAll(async () => {
  directory = await realpath(await mkdtemp(`${tmpdir()}/widgets-browser-`))
  await symlink(`${process.cwd()}/node_modules`, `${directory}/node_modules`)
  for (const [filename, source] of Object.entries({
    'index.html': `<html><head></head><body><script type="module" src="/main.js"></script></body></html>`,
    'main.js': `import { mount } from 'svelte'; import Page from './Page.md'; mount(Page, { target: document.body })`,
    'Page.md': page_source(),
    'render.js': `import { render } from 'svelte/server'; import Page from './Page.md'; export const html = render(Page).body`,
  }))
    await writeFile(`${directory}/${filename}`, source)
  const docs = markdown_vite(
    create_markdown({ examples: { collapsible: true, hide_style: true } }),
  )
  server = await createServer({
    configFile: false,
    root: directory,
    cacheDir: `${directory}/.vite`,
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      docs.plugin,
      svelte({ extensions: [`.svelte`, `.md`], preprocess: docs.preprocess }),
    ],
    resolve: {
      dedupe: [`svelte`],
      alias: { 'svelte-widgets': `${process.cwd()}/src/lib/index.ts` },
    },
    server: {
      port: 0,
      host: `127.0.0.1`,
      fs: { allow: [directory, process.cwd()] },
      // Queue complete writes instead of dropping rapid saves in the watcher's 50ms throttle.
      watch: { awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 } },
    },
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === `string`) throw new Error(`Expected HTTP address`)
  url = `http://127.0.0.1:${address.port}`
})
test.afterAll(async () => {
  await server?.close()
  if (directory) await rm(directory, { recursive: true, force: true })
})

test(`metadata, runnable examples and CSS-only hot updates work in the browser`, async ({
  page,
}) => {
  const errors: string[] = []
  page.on(`pageerror`, (error) => errors.push(error.message))
  const ssr = await server.ssrLoadModule(`/render.js`)
  expect(ssr.html).toContain(`Count: 0`)
  expect(ssr.html).not.toContain(`Browser only: http:`)
  await page.goto(url)
  await expect(page.getByRole(`heading`, { name: `Markdown fixture` })).toBeVisible()
  await expect(page.getByText(`Browser only: http:`, { exact: true })).toBeVisible()
  const counter = page.getByRole(`button`, { name: /^Count:/u })
  await counter.click()
  await expect(counter).toHaveText(`Count: 1`)
  await expect(counter).toHaveCSS(`color`, `rgb(255, 0, 0)`)
  await page.getByRole(`button`, { name: `View code` }).first().click()
  await expect(page.locator(`#counter code`)).toContainText(`let count = $state(0)`)

  await writeFile(`${directory}/Page.md`, page_source(`blue`))
  await expect(counter).toHaveCSS(`color`, `rgb(0, 0, 255)`)
  await expect(counter).toHaveText(`Count: 1`)

  await writeFile(
    `${directory}/Page.md`,
    page_source(`blue`, `Markdown fixture`, `**New prose**`),
  )
  await expect(page.locator(`strong`)).toHaveText(`New prose`)
  expect((await server.ssrLoadModule(`/render.js`)).html).toContain(
    `<strong>New prose</strong>`,
  )
  await writeFile(
    `${directory}/Page.md`,
    page_source(`blue`, `Updated title`, `**New prose**`),
  )
  await expect(page.getByRole(`heading`, { name: `Updated title` })).toBeVisible()
  await expect(page.locator(`strong`)).toHaveText(`New prose`)
  const count_before = Number((await counter.textContent())?.split(`: `)[1])
  await counter.click()
  await expect(counter).toHaveText(`Count: ${count_before + 1}`)
  await expect(page.getByText(`Own metadata`, { exact: true })).toBeVisible()
  await writeFile(`${directory}/Page.md`, `# No examples`)
  await expect(page.getByRole(`heading`, { name: `No examples` })).toBeVisible()
  await expect(counter).toHaveCount(0)
  expect(errors).toEqual([])
})
