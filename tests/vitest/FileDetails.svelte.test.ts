import { FileDetails } from '$lib'
import type { ComponentProps } from 'svelte'
import { flushSync, mount, tick, unmount } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vitest'
import { doc_query } from './index'
import TestSnippetHarness from './TestSnippetHarness.svelte'

const all_text = (selector: string) =>
  [...document.querySelectorAll(selector)].map((node) => node.textContent)

const mount_files = (props: ComponentProps<typeof FileDetails> = {}) => {
  const component = mount(FileDetails, { target: document.body, props })
  onTestFinished(() => unmount(component))
}

test.each<[string, string, string, string?]>([
  // inferred from title extension
  [`comp.svelte`, `<p>hi</p>`, `svelte`],
  [`util.ts`, `const x = 1`, `typescript`],
  [`app.js`, `let x`, `javascript`],
  [`styles.css`, `.a{}`, `css`],
  [`script.py`, `x = 1`, `python`],
  [`config.yml`, `key: val`, `yaml`],
  // extension extracted after stripping tags
  [`<code>options.ts</code>`, `export const x = 1`, `typescript`],
  // explicit language overrides title inference
  [`data.json`, `{}`, `javascript`, `javascript`],
  // unknown extension used as the language flag
  [`readme.xyz`, `hello`, `xyz`],
  // no extension falls back to default_lang
  [`Makefile`, `all:`, `svelte`],
])(`resolves the language for %s`, (title, content, expected_lang, language) => {
  mount_files({ files: [{ title, content, language }] })
  expect(doc_query(`pre`).className).toContain(`language-${expected_lang}`)
  // the label must surface the resolved language, not the raw extension
  expect(doc_query(`.lang-label`).textContent).toBe(expected_lang)
})

test(`lang-label is positioned out of flow so it can't indent code`, () => {
  mount_files({ files: [{ title: `util.ts`, content: `const x = 1` }] })
  const label = doc_query(`.lang-label`)
  expect(getComputedStyle(label).position).toBe(`absolute`)
  // Paint after the positioned pre so its background cannot cover the badge.
  expect(
    doc_query(`pre`).compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
})

test(`lang-label escapes HTML in the language name`, () => {
  mount_files({ files: [{ title: `x`, content: `a`, language: `<b>ts</b>` }] })
  expect(doc_query(`.lang-label`).textContent).toBe(`<b>ts</b>`)
  expect(doc_query(`.lang-label`).querySelector(`b`)).toBeNull()
})

test(`content with HTML characters is escaped before highlighting loads`, () => {
  const html_content = `<div class="foo">&amp; bar</div>`
  mount_files({ files: [{ title: `test.svelte`, content: html_content }] })
  const code_el = doc_query(`pre code`)
  expect(code_el.textContent).toBe(html_content)
  expect(code_el.innerHTML).not.toContain(`<div class="foo">`)
})

test(`unsupported language falls back to escaped raw content`, async () => {
  const content = `some <weird> content`
  mount_files({
    files: [{ title: `file.xyz`, content, language: `nonexistent-lang-xyz` }],
  })
  flushSync()
  await vi.waitFor(() => expect(doc_query(`pre`).getAttribute(`aria-busy`)).toBe(`false`))
  expect(doc_query(`pre code`).innerHTML).toContain(`&lt;`)
  expect(document.querySelector(`[role=alert]`)).toBeNull()
  expect(doc_query(`pre code`).textContent).toBe(content)
})

test(`syntax highlighting produces starry-night spans`, async () => {
  const svelte_code = `<script lang="ts">\n  let count = $state(0)\n</script>`
  mount_files({ files: [{ title: `App.svelte`, content: svelte_code }] })

  await vi.waitFor(
    () =>
      expect(doc_query(`pre code`).querySelector(`span[class^="pl-"]`)).not.toBeNull(),
    { timeout: 5000 },
  )
  expect(doc_query(`pre code`).textContent).toContain(`let count`)
})

test(`renders distinct language-content pairs independently`, async () => {
  const contents = [`bar`, `foo:bar`]
  mount_files({
    files: [
      { title: `plain`, content: contents[0], language: `typescript:foo` },
      { title: `typed.ts`, content: contents[1], language: `typescript` },
    ],
  })

  await vi.waitFor(
    () => expect(document.querySelector(`pre code span[class^="pl-"]`)).not.toBeNull(),
    { timeout: 5000 },
  )
  expect(all_text(`pre code`)).toEqual(contents)
})

test(`highlights siblings independently and ignores stale completions after edits`, async () => {
  const { default_highlighter } = await import(`$lib/live-examples/default-highlighter`)
  const requests: { code: string; resolve: (html: string) => void }[] = []
  const highlight = vi.spyOn(default_highlighter, `highlight`).mockImplementation(
    (code) =>
      new Promise((resolve) => {
        requests.push({ code, resolve })
      }),
  )
  const files = $state(
    [`a`, `bb`, `ccc`].map((content) => ({ title: `${content}.ts`, content })),
  )
  mount_files({ files })
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

test(`reports highlighting failures without hiding source`, async () => {
  const { default_highlighter } = await import(`$lib/live-examples/default-highlighter`)
  vi.spyOn(default_highlighter, `highlight`).mockRejectedValue(
    new Error(`Grammar unavailable`),
  )
  mount_files({ files: [{ title: `file.ts`, content: `<source>` }] })
  await vi.waitFor(() =>
    expect(doc_query(`[role=alert]`).textContent).toBe(`Grammar unavailable`),
  )
  expect(doc_query(`pre code`).textContent).toBe(`<source>`)
  expect(doc_query(`pre code`).querySelector(`source`)).toBeNull()
})

test(`toggle all button opens/closes all, tracks label, and handles partial/native toggles`, async () => {
  const onclick = vi.fn()
  const files = [`file1`, `file2`, `file3`].map((title) => ({
    title,
    content: `content of ${title}`,
  }))
  const button_props = { onclick }
  // Omit'd from the prop type; a bare button inside a form submits it on every toggle
  Reflect.set(button_props, `type`, `submit`)
  mount_files({ files, toggle_all_btn_title: `toggle all`, button_props })
  await tick()

  const details = [...document.querySelectorAll(`details`)]
  const btn = doc_query<HTMLButtonElement>(`button[title='toggle all']`)
  const button_label = () => btn.querySelector(`[aria-hidden="false"]`)?.textContent
  expect(btn.type).toBe(`button`)
  expect(getComputedStyle(btn).width).toBe(`fit-content`)
  expect(getComputedStyle(btn).whiteSpace).toBe(`nowrap`)
  const open_states = () => details.map((el) => el.open)

  expect(open_states()).toEqual([false, false, false])
  expect(button_label()).toBe(`Open all`)

  btn.click()
  flushSync()
  expect(open_states()).toEqual([true, true, true])
  expect(button_label()).toBe(`Close all`)

  btn.click()
  flushSync()
  expect(open_states()).toEqual([false, false, false])
  expect(button_label()).toBe(`Open all`)

  // the DOM open property is not reactive, so the label must follow the native toggle
  details[0].open = true
  details[0].dispatchEvent(new Event(`toggle`))
  flushSync()
  expect(button_label()).toBe(`Close all`)

  // partial open state: clicking closes all
  details[1].open = true
  btn.click()
  flushSync()
  expect(open_states()).toEqual([false, false, false])
  expect(onclick).toHaveBeenCalledTimes(3)
})

test(`toggle all label reflects pre-opened details on mount`, async () => {
  const files = [
    { title: `file1`, content: `content1` },
    { title: `file2`, content: `content2` },
  ]
  // the toggle event never fires on mount, so the label must init from detail_elements
  mount_files({ files, details_props: { open: true } })
  await tick()

  expect(doc_query<HTMLDetailsElement>(`details`).open).toBe(true)
  expect(doc_query(`button[title='Toggle all'] [aria-hidden='false']`).textContent).toBe(
    `Close all`,
  )
})

test(`labels prop overrides toggle-all text, omitted keys keep their default`, async () => {
  const files = [`a.ts`, `b.ts`].map((title) => ({ title, content: title }))
  mount_files({ files, labels: { close_all: `Alle schließen` } })
  await tick()

  const btn = doc_query<HTMLButtonElement>(`button`)
  const button_label = () => btn.querySelector(`[aria-hidden="false"]`)?.textContent
  expect(button_label()).toBe(`Open all`) // open_all falls back

  btn.click()
  flushSync()
  expect(button_label()).toBe(`Alle schließen`)
})

test(`keeps DOM refs internal and toggles surviving files after removal`, async () => {
  const files = Object.freeze(
    [1, 2, 3].map((idx) =>
      Object.freeze({ title: `file${idx}`, content: `content${idx}` }),
    ),
  )
  let visible_files = $state.raw(files)
  mount_files({
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
  const toggle = doc_query<HTMLButtonElement>(`button[title="Toggle all"]`)
  toggle.click()
  flushSync()
  expect(original_nodes.map((node) => node.open)).toEqual([false, false, false])
  toggle.click()
  flushSync()
  expect(original_nodes.map((node) => node.open)).toEqual([true, false, true])
  for (const file of files) expect(Object.keys(file)).toEqual([`title`, `content`])
})

test(`renders empty default file list`, () => {
  mount_files()

  expect(document.querySelector(`ol`)).toBeInstanceOf(HTMLOListElement)
  expect(document.querySelectorAll(`button, li`)).toHaveLength(0)
})

test(`renders custom container with summary titles and custom default_lang`, () => {
  mount_files({
    as: `ul`,
    class: `files-list`,
    default_lang: `txt`,
    files: [
      { title: `<code>component.svelte</code>`, content: `<h1>Hello</h1>` },
      { title: `script.ts`, content: `const answer = 42` },
      { title: `README`, content: `plain text` },
    ],
  })

  expect(document.querySelector(`ul.files-list`)).toBeInstanceOf(HTMLUListElement)
  expect(all_text(`summary`)).toEqual([`component.svelte`, `script.ts`, `README`])
  expect(all_text(`.lang-label`)).toEqual([`svelte`, `typescript`, `txt`])
})

test(`single file omits toggle-all button and forwards details toggle event`, () => {
  const ontoggle = vi.fn()
  mount_files({
    details_props: { open: true, ontoggle },
    files: [{ title: `config.yml`, content: `name: test` }],
  })

  expect(document.querySelector(`button`)).toBeNull()
  const details = doc_query<HTMLDetailsElement>(`details`)
  expect(details.open).toBe(true)

  const toggle_event = new Event(`toggle`)
  details.dispatchEvent(toggle_event)
  // the component wraps ontoggle, so it must forward the very same event object
  expect(ontoggle).toHaveBeenCalledExactlyOnceWith(toggle_event)
  expect(doc_query(`.lang-label`).textContent).toBe(`yaml`)
})

test(`title snippet renders title content (incl. empty titles) and receives index`, () => {
  const component = mount(TestSnippetHarness, {
    target: document.body,
    props: {
      component: `file-details`,
      files: [
        { title: `first.ts`, content: `const first = true` },
        { title: `second.py`, content: `second = True` },
        { title: ``, content: `untitled` }, // default rendering would omit this summary
      ],
    },
  })

  onTestFinished(() => unmount(component))
  expect(all_text(`[data-testid="file-title"]`)).toEqual([`first.ts`, `second.py`, ``])
  expect(
    [...document.querySelectorAll<HTMLElement>(`[data-testid="file-title"]`)].map(
      (node) => node.dataset.idx,
    ),
  ).toEqual([`0`, `1`, `2`])
  // with a title snippet, even empty-title files render a summary
  expect(document.querySelectorAll(`summary`)).toHaveLength(3)
})

test(`empty title renders details without summary`, () => {
  mount_files({ files: [{ title: ``, content: `untitled` }] })

  expect(document.querySelector(`details`)).toBeInstanceOf(HTMLDetailsElement)
  expect(document.querySelector(`summary`)).toBeNull()
})

test(`duplicate titles render and keep their open state across inserts`, async () => {
  const files = $state([
    { title: `index.ts`, content: `export const a = 1` },
    { title: `index.ts`, content: `export const b = 2` },
  ])
  mount_files({ files })
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
