import { expect, test } from '@playwright/test'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import { browser_fixture } from './browser-fixture'
import { playground_vite } from '../../src/lib/code-playground/vite.ts'
import { encode_project } from '../../src/lib/code-playground/index.ts'

let fixture: Awaited<ReturnType<typeof browser_fixture>>
const files = {
  'App.svelte': `<script>import Child from './Child.svelte'; import { title } from './data.js'; import './theme.css'; let count = $state(0)</script><Child {title}/><button onclick={() => { count++; console.log('count', count) }}>Count: {count}</button>`,
  'Child.svelte': `<script>let {title} = $props()</script><h1>{title}</h1>`,
  'data.js': `import { get, readable } from 'svelte/store'; export const title = get(readable('Multi-file preview'))`,
  'theme.css': `h1 { color: rgb(200, 20, 40) }`,
}

test.beforeAll(async () => {
  fixture = await browser_fixture(
    `Page.svelte`,
    {
      'Page.svelte': `<script>import CodePlayground from '${process.cwd()}/src/lib/CodePlayground.svelte'; import runtime_source from 'virtual:svelte-widgets/playground'; const files = ${JSON.stringify(files).replaceAll(`<`, `\\u003c`)}</script><CodePlayground {files} {runtime_source} restore_hash />`,
    },
    { plugins: [playground_vite(), svelte()] },
  )
})
test.afterAll(async () => fixture?.close())

test(`multi-file editing, execution, console, reset and shared state work in an isolated preview`, async ({
  page,
}) => {
  await page.goto(fixture.url)
  const preview = page.frameLocator(`iframe`)
  await expect(preview.getByRole(`heading`, { name: `Multi-file preview` })).toBeVisible()
  await expect(preview.getByRole(`heading`)).toHaveCSS(`color`, `rgb(200, 20, 40)`)
  await preview.getByRole(`button`, { name: `Count: 0` }).click()
  await expect(preview.getByRole(`button`, { name: `Count: 1` })).toBeVisible()
  await expect(page.getByRole(`log`)).toContainText(`count 1`)
  await page.getByRole(`tab`, { name: `data.js`, exact: true }).click()
  await page
    .getByRole(`textbox`, { name: `Edit data.js` })
    .fill(`export const title = 'Edited locally'`)
  await expect(page.getByRole(`status`)).toContainText(`Changes not run`)
  await page.getByRole(`button`, { name: `Run` }).click()
  await expect(preview.getByRole(`heading`, { name: `Edited locally` })).toBeVisible()
  await page.getByRole(`button`, { name: `Share`, exact: true }).click()
  const share_url = await page
    .getByRole(`textbox`, { name: `Shareable project link` })
    .inputValue()
  await page.goto(share_url)
  await expect(preview.getByRole(`heading`, { name: `Edited locally` })).toBeVisible()
  await page.getByRole(`button`, { name: `Reset`, exact: true }).click()
  await expect(preview.getByRole(`heading`, { name: `Multi-file preview` })).toBeVisible()
  await page.getByRole(`tab`, { name: `App.svelte`, exact: true }).focus()
  await page.keyboard.press(`End`)
  await expect(page.getByRole(`tab`, { name: `theme.css`, exact: true })).toBeFocused()
  await page.getByRole(`tab`, { name: `data.js`, exact: true }).click()
  await page
    .getByRole(`textbox`, { name: `Edit data.js` })
    .fill(`export const title = parent.document.title`)
  await page.getByRole(`button`, { name: `Run` }).click()
  await expect(page.getByRole(`log`)).toContainText(/Blocked a frame|cross-origin/u)
  await expect(page.getByRole(`status`)).toHaveText(`Preview error`)
  await page
    .getByRole(`textbox`, { name: `Edit data.js` })
    .fill(`import './missing.js'; export const title = 'Broken'`)
  await page.getByRole(`button`, { name: `Run` }).click()
  await expect(page.getByRole(`log`)).toContainText(`missing imported file ./missing.js`)
  await expect(page.locator(`iframe`)).toHaveCount(0)
})

test(`HTML entrypoints, dynamic modules and literal script-closing text work`, async ({
  page,
}) => {
  const project = {
    entry: `index.html`,
    files: {
      'index.html': `<h1>Loading</h1><link rel="stylesheet" href="./style.css"><script type="module" src="./main.js"></script>`,
      'main.js': `import data from './json.js'; const dynamic = await import('./data.json', {with:{type:'json'}}); if (JSON.stringify(data) !== JSON.stringify(dynamic.default)) throw new Error('JSON imports differ'); if (!Object.hasOwn(data, '__proto__') || Object.getPrototypeOf(data) !== Object.prototype) throw new Error('Corrupted JSON module'); const loaded = await import('./content.js'); document.querySelector('h1').textContent = loaded.title`,
      'json.js': `export {default} from './data.json' with {type:'json'};`,
      'content.js': `export const title = 'Literal </script> text'`,
      'data.json': `{"__proto__":{"inherited":true}}`,
      'style.css': `h1 { color: rgb(12, 34, 56) }`,
    },
  }
  await page.goto(`${fixture.url}#playground=${encode_project(project)}`)
  const heading = page.frameLocator(`iframe`).getByRole(`heading`)
  await expect(heading).toHaveText(`Literal </script> text`)
  await expect(heading).toHaveCSS(`color`, `rgb(12, 34, 56)`)
  await expect(page.getByRole(`status`)).toHaveText(`Preview ready`)
})

test(`HTML raw-text elements cannot swallow the preview bootstrap`, async ({ page }) => {
  const project = {
    entry: `index.html`,
    files: { 'index.html': `<plaintext>Literal <script> and <style> text` },
  }
  await page.goto(`${fixture.url}#playground=${encode_project(project)}`)
  await expect(page.getByRole(`status`)).toHaveText(`Preview ready`)
  await expect(page.frameLocator(`iframe`).locator(`plaintext`)).toContainText(
    `Literal <script> and <style> text`,
  )
})
