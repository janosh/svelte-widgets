import { FileDetails } from '#lib'
import { default_highlighter } from '#lib/highlight/index.ts'
import { flushSync, tick } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'
import { doc_query, render } from './index'
import TestSnippetHarness from './TestSnippetHarness.svelte'

const all_text = (selector: string) =>
  [...document.querySelectorAll(selector)].map((node) => node.textContent)

test.each<[string, string, string, string?]>([
  // inferred from title extension via the alias map
  [`util.ts`, `const x = 1`, `typescript`],
  [`config.yml`, `key: val`, `yaml`],
  // titles, code and language names are plain text, including characters resembling markup
  [`<options>.ts`, `some <weird> content`, `typescript`],
  [`<b>x.ts</b>`, `a`, `<b>ts</b>`, `<b>ts</b>`],
  // explicit language overrides title inference
  [`data.json`, `{}`, `javascript`, `javascript`],
  // unmapped extension used as the language flag
  [`readme.xyz`, `hello`, `xyz`],
  // no extension falls back to default_lang
  [`Makefile`, `all:`, `svelte`],
])(`resolves the language for %s`, (title, content, expected_lang, language) => {
  render(FileDetails, { files: [{ title, content, language }] })
  const [pre, label] = [doc_query(`pre`), doc_query(`.lang-label`)]
  expect(pre.className).toContain(`language-${expected_lang}`)
  // the label must surface the resolved language, not the raw extension
  expect(label.textContent).toBe(expected_lang)
  expect([doc_query(`summary`).textContent, doc_query(`pre code`).textContent]).toEqual([
    title,
    content,
  ])
  // no highlighter by default, so nothing stays pending
  expect(pre.getAttribute(`aria-busy`)).toBe(`false`)
  // out of flow so it can't indent code, painted after the positioned pre so its
  // background cannot cover the badge
  expect(getComputedStyle(label).position).toBe(`absolute`)
  expect(pre.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
    Node.DOCUMENT_POSITION_FOLLOWING,
  )
  expect(document.querySelector(`button`)).toBeNull() // no toggle-all for a single file
})

// a `${language}:${content}` cache key would collide on the last two files
test(`real highlighting keeps each file's escaped source`, async () => {
  const files = [
    {
      title: `App.svelte`,
      content: `<script lang="ts">\n  let count = $state(0)\n</script>`,
    },
    { title: `App.svelte`, content: `<div class="foo">&amp; bar</div>` },
    { title: `plain`, content: `bar`, language: `typescript:foo` },
    { title: `typed.ts`, content: `foo:bar` },
  ]
  const contents = files.map(({ content }) => content)
  render(FileDetails, { files, highlight: default_highlighter.highlight })
  expect(all_text(`pre code`)).toEqual(contents)
  expect(document.querySelector(`pre code :is(div, script)`)).toBeNull()

  const settled = () => expect(document.querySelector(`[aria-busy="true"]`)).toBeNull()
  await vi.waitFor(settled, { timeout: 5000 })
  expect(all_text(`pre code`)).toEqual(contents)
  // the unknown `typescript:foo` stays plain
  expect(all_text(`pre code:has(span[class^="pl-"])`)).toEqual(contents.toSpliced(2, 1))
})

test(`highlights siblings independently and ignores stale completions after edits`, async () => {
  const requests: { code: string; resolve: (html: string) => void }[] = []
  const highlight = vi.fn(
    (code: string) =>
      new Promise<string>((resolve) => {
        requests.push({ code, resolve })
      }),
  )
  const files = $state(
    [`a`, `bb`, `ccc`].map((content) => ({ title: `${content}.ts`, content })),
  )
  render(FileDetails, { files, highlight })
  await vi.waitFor(() => expect(requests).toHaveLength(3))
  files[0].content = `updated`
  await vi.waitFor(() => expect(requests).toHaveLength(4))
  for (const { code, resolve } of requests.slice(1))
    resolve(`<span class="pl-x">${code}</span>`)
  await vi.waitFor(() =>
    expect(all_text(`pre code span`)).toEqual([`updated`, `bb`, `ccc`]),
  )
  requests[0].resolve(`<b>stale</b>`)
  await tick()
  expect(all_text(`pre code`)).toEqual([`updated`, `bb`, `ccc`])
  expect(highlight).toHaveBeenCalledTimes(4)
})

test(`toggle all button opens/closes all, tracks (custom) label, and handles partial/native toggles`, async () => {
  const onclick = vi.fn()
  const files = [`file1`, `file2`, `file3`].map((title) => ({
    title,
    content: `content of ${title}`,
  }))
  const button_props = { onclick }
  // Omit'd from the prop type; a bare button inside a form submits it on every toggle
  Reflect.set(button_props, `type`, `submit`)
  render(FileDetails, {
    files,
    toggle_all_btn_title: `toggle all`,
    button_props,
    labels: { close_all: `Alle schließen` },
  })
  await tick()

  const details = [...document.querySelectorAll(`details`)]
  const btn = doc_query<HTMLButtonElement>(`button[title='toggle all']`)
  const button_label = () => btn.querySelector(`[aria-hidden="false"]`)?.textContent
  expect(btn.type).toBe(`button`)
  expect(getComputedStyle(btn).width).toBe(`fit-content`)
  expect(getComputedStyle(btn).whiteSpace).toBe(`nowrap`)
  const open_states = () => details.map((el) => el.open)

  expect(open_states()).toEqual([false, false, false])
  expect(button_label()).toBe(`Open all`) // label key omitted from labels keeps its default

  btn.click()
  flushSync()
  expect(open_states()).toEqual([true, true, true])
  expect(button_label()).toBe(`Alle schließen`)

  btn.click()
  flushSync()
  expect(open_states()).toEqual([false, false, false])
  expect(button_label()).toBe(`Open all`)

  // the DOM open property is not reactive, so the label must follow the native toggle
  details[0].open = true
  details[0].dispatchEvent(new Event(`toggle`))
  flushSync()
  expect(button_label()).toBe(`Alle schließen`)

  // partial open state: clicking closes all
  details[1].open = true
  btn.click()
  flushSync()
  expect(open_states()).toEqual([false, false, false])
  expect(onclick).toHaveBeenCalledTimes(3)
})

test(`pre-opened details set the toggle-all label and forward native toggle events`, () => {
  const ontoggle = vi.fn()
  const files = [`file1`, `file2`].map((title) => ({ title, content: title }))
  // the toggle event never fires on mount, so the label must init from detail_elements
  render(FileDetails, { files, details_props: { open: true, ontoggle } })
  const details = doc_query<HTMLDetailsElement>(`details`)
  expect(details.open).toBe(true)
  expect(doc_query(`button[title='Toggle all'] [aria-hidden='false']`).textContent).toBe(
    `Close all`,
  )

  const toggle_event = new Event(`toggle`)
  details.dispatchEvent(toggle_event)
  // the component wraps ontoggle, so it must forward the very same event object
  expect(ontoggle).toHaveBeenCalledExactlyOnceWith(toggle_event)
})

test(`keeps DOM refs internal and toggles surviving files after removal`, async () => {
  const files = Object.freeze(
    [1, 2, 3].map((idx) =>
      Object.freeze({ title: `file${idx}`, content: `content${idx}` }),
    ),
  )
  let visible_files = $state.raw(files)
  render(FileDetails, {
    get files() {
      return visible_files
    },
  })
  await tick()
  const original_nodes = [...document.querySelectorAll(`details`)]
  original_nodes[2].open = true
  visible_files = [files[2], files[0]]
  await tick()
  const remaining = [...document.querySelectorAll(`details`)]
  expect(remaining).toHaveLength(2)
  expect(remaining[0]).toBe(original_nodes[2])
  expect(remaining[1]).toBe(original_nodes[0])
  expect(original_nodes[1].isConnected).toBe(false)
  const toggle = doc_query<HTMLButtonElement>(`body > button`)
  toggle.click()
  flushSync()
  expect(original_nodes.map((node) => node.open)).toEqual([false, false, false])
  toggle.click()
  flushSync()
  expect(original_nodes.map((node) => node.open)).toEqual([true, false, true])
  for (const file of files) expect(Object.keys(file)).toEqual([`title`, `content`])
})

test(`renders empty default file list`, () => {
  render(FileDetails, {})

  expect(document.querySelector(`ol`)).toBeInstanceOf(HTMLOListElement)
  expect(document.querySelectorAll(`button, li`)).toHaveLength(0)
})

test(`renders custom container, summary titles (none when empty) and custom default_lang`, () => {
  render(FileDetails, {
    as: `ul`,
    class: `files-list`,
    default_lang: `txt`,
    files: [
      { title: `script.ts`, content: `const answer = 42` },
      { title: `README`, content: `plain text` },
      { title: ``, content: `untitled` },
    ],
  })

  expect(document.querySelector(`ul.files-list`)).toBeInstanceOf(HTMLUListElement)
  // an empty title renders its details without a summary
  expect(document.querySelectorAll(`details`)).toHaveLength(3)
  expect(all_text(`summary`)).toEqual([`script.ts`, `README`])
  expect(all_text(`.lang-label`)).toEqual([`typescript`, `txt`, `txt`])
})

test(`title snippet renders title content (incl. empty titles) and receives index`, () => {
  const files = [`first.ts`, `second.py`, ``].map((title) => ({ title, content: `x` }))
  render(TestSnippetHarness, { component: `file-details`, files })
  const titles = [...document.querySelectorAll<HTMLElement>(`[data-testid="file-title"]`)]
  expect(titles.map((node) => [node.textContent, node.dataset.idx])).toEqual([
    [`first.ts`, `0`],
    [`second.py`, `1`],
    [``, `2`],
  ])
  // with a title snippet, even empty-title files render a summary
  expect(document.querySelectorAll(`summary`)).toHaveLength(3)
})

test(`duplicate titles render and keep their open state across inserts`, async () => {
  const files = $state([
    { title: `index.ts`, content: `export const a = 1` },
    { title: `index.ts`, content: `export const b = 2` },
  ])
  render(FileDetails, { files })
  await tick()

  const all_details = () => [...document.querySelectorAll(`details`)]
  const open_states = () => all_details().map((el) => el.open)
  expect(all_text(`details pre code`)).toEqual([
    `export const a = 1`,
    `export const b = 2`,
  ])
  all_details()[1].open = true
  await tick()
  expect(open_states()).toEqual([false, true])

  files.unshift({ title: `z.ts`, content: `const z = 0` })
  await tick()

  expect(all_text(`details > summary`)).toHaveLength(3)
  expect(open_states()).toEqual([false, false, true])
})
