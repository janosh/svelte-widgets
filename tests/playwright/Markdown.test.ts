import { expect, test } from '@playwright/test'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createServer, type ViteDevServer } from 'vite'
import { markdown_vite } from '../../src/lib/markdown/vite.ts'

let server: ViteDevServer
let fixture_dir: string
let url: string

const page_source = (color = `red`, title = `Markdown fixture`, extra = ``) => `---
title: ${title}
__proto__: { value: data }
---

# {title}

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
  fixture_dir = await realpath(await mkdtemp(`${tmpdir()}/widgets-markdown-browser-`))
  await symlink(`${process.cwd()}/node_modules`, `${fixture_dir}/node_modules`)
  await writeFile(
    `${fixture_dir}/index.html`,
    `<html><head></head><body><script type="module" src="/main.js"></script></body></html>`,
  )
  await writeFile(
    `${fixture_dir}/main.js`,
    `import { mount } from 'svelte'; import Page from './Page.md'; mount(Page, { target: document.body })`,
  )
  await writeFile(
    `${fixture_dir}/render.js`,
    `import { render } from 'svelte/server'; import Page from './Page.md'; export const html = render(Page).body`,
  )
  await writeFile(`${fixture_dir}/Page.md`, page_source())
  const docs = markdown_vite({ examples: { collapsible: true, hide_style: true } })
  server = await createServer({
    configFile: false,
    root: fixture_dir,
    // node_modules is shared with the site; its optimizer cache must not be.
    cacheDir: `${fixture_dir}/.vite`,
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [
      docs.plugin,
      svelte({ extensions: [`.svelte`, `.md`], preprocess: docs.preprocess }),
    ],
    resolve: {
      dedupe: [`svelte`],
      alias: { 'svelte-widgets': `${process.cwd()}/src/lib/index.ts` },
    },
    server: { port: 0, host: `127.0.0.1`, fs: { allow: [fixture_dir, process.cwd()] } },
  })
  await server.listen()
  const address = server.httpServer?.address()
  if (!address || typeof address === `string`) throw new Error(`Expected an HTTP address`)
  url = `http://127.0.0.1:${address.port}`
})

test.afterAll(async () => {
  await server?.close()
  if (fixture_dir) await rm(fixture_dir, { recursive: true, force: true })
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

  await writeFile(`${fixture_dir}/Page.md`, page_source(`blue`))
  await expect(counter).toHaveCSS(`color`, `rgb(0, 0, 255)`)
  await expect(counter).toHaveText(`Count: 1`)

  await writeFile(
    `${fixture_dir}/Page.md`,
    page_source(`blue`, `Updated title`, `**New prose**`),
  )
  await expect(page.getByRole(`heading`, { name: `Updated title` })).toBeVisible()
  await expect(page.locator(`strong`)).toHaveText(`New prose`)
  await counter.click()
  await expect(counter).toHaveText(`Count: 1`)
  await expect(page.getByText(`Own metadata`, { exact: true })).toBeVisible()
  await writeFile(`${fixture_dir}/Page.md`, `# No examples`)
  await expect(page.getByRole(`heading`, { name: `No examples` })).toBeVisible()
  await expect(counter).toHaveCount(0)
  expect(errors).toEqual([])
})
