import CodePlayground from '$lib/CodePlayground.svelte'
import type { PlaygroundBuild, PlaygroundCompiler } from '$lib/code-playground'
import { mount, tick, unmount } from 'svelte'
import { expect, onTestFinished, test } from 'vitest'
import { doc_query } from './index'

const flush = async (): Promise<void> => {
  await tick()
  await Promise.resolve()
  await tick()
}

test(`late builds cannot replace a newer run, reset, or disposed playground`, async () => {
  const pending: ReturnType<typeof Promise.withResolvers<PlaygroundBuild>>[] = []
  const compiler: PlaygroundCompiler = () => {
    const build = Promise.withResolvers<PlaygroundBuild>()
    pending.push(build)
    return build.promise
  }
  const instance = mount(CodePlayground, {
    target: document.body,
    props: {
      files: { 'App.svelte': `<p>Hello</p>`, 'other.js': `export default 1` },
      runtime_source: ``,
      auto_run: false,
      compiler,
      labels: { run: `Ausführen`, console: `Konsole` },
    },
  })
  onTestFinished(() => unmount(instance))
  await flush()
  const run_button = doc_query<HTMLButtonElement>(`button[aria-label="Ausführen"]`)
  const first_tab = doc_query<HTMLButtonElement>(`[role="tab"]`)
  first_tab.focus()
  for (const init of [
    { altKey: true },
    { ctrlKey: true },
    { metaKey: true },
    { shiftKey: true },
    { isComposing: true },
    {},
  ]) {
    const event = new KeyboardEvent(`keydown`, {
      key: `End`,
      bubbles: true,
      cancelable: true,
      ...init,
    })
    if (!Object.keys(init).length) event.preventDefault()
    first_tab.dispatchEvent(event)
    await flush()
    expect(first_tab.getAttribute(`aria-selected`)).toBe(`true`)
    expect(document.activeElement).toBe(first_tab)
  }
  first_tab.dispatchEvent(new KeyboardEvent(`keydown`, { key: `End`, bubbles: true }))
  await flush()
  expect(first_tab.getAttribute(`aria-selected`)).toBe(`false`)
  expect(document.activeElement?.textContent).toBe(`other.js`)
  const build = { modules: { main: `` }, entry: `main`, html: `<p>Latest preview</p>` }
  run_button.click()
  run_button.click()
  await flush()
  expect(doc_query(`.empty`).textContent).toContain(`Preparing your preview…`)
  pending[1].resolve(build)
  await flush()
  expect(doc_query<HTMLIFrameElement>(`iframe`).srcdoc).toContain(`Latest preview`)
  pending[0].reject(new Error(`Stale failure`))
  await flush()
  expect(document.body.textContent).not.toContain(`Stale failure`)
  run_button.click()
  const reset_button = [...document.querySelectorAll(`button`)].find(
    (button) => button.textContent === `Reset`,
  )
  reset_button?.click()
  pending[2].resolve(build)
  await flush()
  expect(document.querySelector(`iframe`)).toBeNull()
  expect(doc_query(`.empty`).textContent).toContain(`Run your code to see the result.`)
  run_button.click()
  pending[3].reject(new Error(`Current failure`))
  await flush()
  expect(doc_query(`[role="log"]`).getAttribute(`aria-label`)).toBe(`Konsole`)
  expect(doc_query(`[role=status]`).textContent).toContain(`Compilation failed`)
  expect(doc_query(`.empty`).textContent).toContain(`Run your code to see the result.`)
  run_button.click()
  await unmount(instance)
  pending[4].resolve(build)
  await flush()
  expect(document.querySelector(`iframe`)).toBeNull()
})

test(`edits during compilation stay marked unrun and foreign messages are ignored`, async () => {
  const pending = Promise.withResolvers<PlaygroundBuild>()
  const instance = mount(CodePlayground, {
    target: document.body,
    props: {
      files: { 'App.svelte': `<p>Hello</p>` },
      runtime_source: ``,
      auto_run: false,
      compiler: () => pending.promise,
    },
  })
  onTestFinished(() => unmount(instance))
  await flush()
  doc_query<HTMLButtonElement>(`button[aria-label="Run"]`).click()
  const textarea = doc_query<HTMLTextAreaElement>(`textarea`)
  textarea.setSelectionRange(0, textarea.value.length)
  textarea.dispatchEvent(
    new InputEvent(`beforeinput`, {
      inputType: `insertText`,
      bubbles: true,
      cancelable: true,
    }),
  )
  textarea.value = `<p>Edited</p>`
  textarea.dispatchEvent(
    new InputEvent(`input`, { inputType: `insertText`, bubbles: true }),
  )
  await flush()
  pending.resolve({ modules: { main: `` }, entry: `main`, html: `<p>Hello</p>` })
  await flush()
  expect(document.body.textContent).toContain(`Changes not run`)
  const frame = doc_query<HTMLIFrameElement>(`iframe`)
  const channel = /const channel = "(?<channel>[^"]+)"/u.exec(frame.srcdoc)?.groups
    ?.channel
  window.dispatchEvent(
    new MessageEvent(`message`, {
      source: window,
      data: { channel, kind: `log`, text: `Forged` },
    }),
  )
  window.dispatchEvent(
    new MessageEvent(`message`, {
      source: frame.contentWindow,
      data: { channel: `wrong`, kind: `log`, text: `Wrong channel` },
    }),
  )
  await flush()
  expect(document.body.textContent).not.toMatch(/Forged|Wrong channel/u)
})

test(`oversized shared projects report an error without offering a broken URL`, async () => {
  const instance = mount(CodePlayground, {
    target: document.body,
    props: {
      files: { 'main.js': `\u0000`.repeat(512_000) },
      entry: `main.js`,
      runtime_source: ``,
      auto_run: false,
    },
  })
  onTestFinished(() => unmount(instance))
  await flush()
  const share_button = [...document.querySelectorAll(`button`)].find(
    (button) => button.textContent === `Share`,
  )
  expect(share_button).toBeDefined()
  share_button?.click()
  await flush()
  expect(doc_query(`[role="log"]`).textContent).toContain(`Encoded playground exceeds`)
  expect(document.querySelector(`.share-url`)).toBeNull()
})
