import { FileDetails } from '$lib'
import type { ComponentProps } from 'svelte'
import { flushSync, mount, tick } from 'svelte'
import { expect, test, vi } from 'vite-plus/test'
import { doc_query } from './index'
import TestSnippetHarness from './TestSnippetHarness.svelte'

const all_text = (selector: string) =>
  [...document.querySelectorAll(selector)].map((node) => node.textContent)

const mount_files = (props: ComponentProps<typeof FileDetails> = {}) =>
  mount(FileDetails, { target: document.body, props })

test.each<[string, string, string, string?]>([
  // inferred from title extension
  [`comp.svelte`, `<p>hi</p>`, `svelte`],
  [`util.ts`, `const x = 1`, `typescript`],
  [`app.js`, `let x`, `javascript`],
  [`styles.css`, `.a{}`, `css`],
  [`script.py`, `x = 1`, `python`],
  [`config.yml`, `key: val`, `yaml`],
  // HTML-wrapped title — extension extracted after stripping tags
  [`<code>options.ts</code>`, `export const x = 1`, `typescript`],
  // explicit language overrides title inference
  [`data.json`, `{}`, `javascript`, `javascript`],
  // unknown extension uses extension directly as language flag
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
  // pre is white-space: pre, so an in-flow label shifts the first code line right.
  // absolute positioning takes it out of flow (regression guard, see FileDetails.svelte)
  expect(getComputedStyle(doc_query(`.lang-label`)).position).toBe(`absolute`)
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
  // wait for highlight attempt to complete and fall back
  await vi.waitFor(() => expect(doc_query(`pre code`).innerHTML).toContain(`&lt;`), {
    timeout: 5000,
  })
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

test(`distinct language-content pairs cannot collide in the highlight cache`, async () => {
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

test(`each file is highlighted exactly once, even as siblings resolve`, async () => {
  const { default_highlighter } = await import(`$lib/live-examples/default-highlighter`)
  // staggered, so one result lands while the others are still pending
  const highlight = vi.spyOn(default_highlighter, `highlight`).mockImplementation(
    (code) =>
      new Promise((resolve) => {
        setTimeout(() => resolve(`<span class="pl-x">${code}</span>`), code.length)
      }),
  )
  const files = [`a`, `bb`, `ccc`].map((content) => ({ title: `${content}.ts`, content }))
  mount_files({ files })

  await vi.waitFor(() =>
    expect(document.querySelectorAll(`pre code span[class^="pl-"]`)).toHaveLength(3),
  )
  expect(highlight).toHaveBeenCalledTimes(3)
  highlight.mockRestore()
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

  expect(open_states()).toEqual([false, false, false]) // initially closed
  expect(button_label()).toBe(`Open all`)

  btn.click()
  flushSync()
  expect(open_states()).toEqual([true, true, true])
  expect(button_label()).toBe(`Close all`)

  btn.click()
  flushSync()
  expect(open_states()).toEqual([false, false, false])
  expect(button_label()).toBe(`Open all`)

  // user opens a single <details> directly - the DOM open property is not
  // reactive, so the label must update via the native toggle event
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
  // details render open from the start - the toggle event never fires on mount,
  // so the label must be initialized from detail_elements in the sync $effect
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

test(`detail element refs are trimmed when files are removed to prevent memory leaks`, async () => {
  type FileWithNode = { title: string; content: string; node?: HTMLDetailsElement | null }
  const reactive_files: FileWithNode[] = $state([
    { title: `file1`, content: `content1` },
    { title: `file2`, content: `content2` },
    { title: `file3`, content: `content3` },
  ])

  mount_files({
    get files() {
      return reactive_files
    },
    set files(val) {
      reactive_files.splice(0, reactive_files.length, ...val)
    },
  })
  await tick()

  const details_nodes = () => [...document.querySelectorAll(`details`)]
  // by identity, not structural toEqual: [0, 1, ...] means every file points at its
  // own <details>, -1 means the ref is null or stale
  const ref_positions = (nodes: (HTMLDetailsElement | null | undefined)[]) =>
    nodes.map((node) => (node ? details_nodes().indexOf(node) : -1))
  const file_nodes = () => reactive_files.map((file) => file.node)

  expect(details_nodes()).toHaveLength(3)
  expect(ref_positions(file_nodes())).toEqual([0, 1, 2])

  // Store references to the old nodes before removal
  const old_nodes = file_nodes()

  // Remove the last file
  flushSync(() => {
    reactive_files.pop()
  })
  await tick()

  // surviving refs must be the same nodes as before, still in their own slots
  expect(reactive_files).toHaveLength(2)
  expect(details_nodes()).toHaveLength(2)
  expect(ref_positions(file_nodes())).toEqual([0, 1])
  expect(ref_positions(old_nodes.slice(0, 2))).toEqual([0, 1])

  // The removed file's node should no longer be in the DOM
  expect(old_nodes[2]?.isConnected).toBe(false)
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
  mount(TestSnippetHarness, {
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
