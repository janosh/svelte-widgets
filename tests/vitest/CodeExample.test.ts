import CodeExample from '$lib/CodeExample.svelte'
import { mount, tick } from 'svelte'
import { assert, expect, test, vi } from 'vite-plus/test'
import { doc_query } from './index'

const [id, src] = [`uniq-id`, `some code`]

test(`CodeExample toggles class .open on <pre> on button click`, async () => {
  const onclick = vi.fn()
  const button_props = { onclick }
  // Omit'd from the prop type; a bare button inside a form would submit it on toggle
  Reflect.set(button_props, `type`, `submit`)
  const props = {
    id: `host-id`,
    meta: { collapsible: true, id },
    src,
    button_props,
  }
  mount(CodeExample, { target: document.body, props })

  // collapsible defaults code_above to true, which orders the <pre> above the example
  expect(doc_query(`div.code-example#${id}`).classList.contains(`code-above`)).toBe(true)

  const toggle_button = doc_query<HTMLButtonElement>(`nav > button`)
  const toggle_label = () => toggle_button.textContent?.trim()
  expect(toggle_button.type).toBe(`button`)
  expect(toggle_label()).toBe(`View code`)
  expect(getComputedStyle(toggle_button).whiteSpace).toBe(`nowrap`)
  const pre_closed = doc_query<HTMLPreElement>(`pre`)
  expect(pre_closed.classList.contains(`open`)).toBe(false)
  const { maxHeight, overflow } = getComputedStyle(pre_closed)
  expect([maxHeight, overflow]).toEqual([`0`, `hidden`])

  toggle_button.click()
  await tick()

  const { overflowX, overflowY } = getComputedStyle(doc_query(`pre.open`))
  expect([overflowX, overflowY]).toEqual([`auto`, `auto`])
  expect(doc_query(`pre.open > code`).textContent).toBe(src)
  expect(toggle_label()).toBe(`Close`)
  expect(onclick).toHaveBeenCalledOnce()
})

test(`forwards host attributes when metadata does not override the ID`, () => {
  mount(CodeExample, {
    target: document.body,
    props: {
      id: `host-id`,
      class: `host-class`,
      style: `max-width: 40rem`,
      'data-testid': `example`,
    },
  })
  const host = doc_query(`div.code-example`)
  expect([host.id, host.classList.contains(`host-class`), host.style.maxWidth]).toEqual([
    `host-id`,
    true,
    `40rem`,
  ])
  expect(host.dataset.testid).toBe(`example`)
})

// both links always render and toggle via display, so a lost `cond` ships a dead link
test.each([
  [
    `Svelte`,
    { collapsible: true, repl: `https://svelte.dev/playground` },
    `https://svelte.dev/playground`,
  ],
  [
    `GitHub`,
    {
      collapsible: true,
      github: true,
      repo: `https://github.com/janosh/svelte-widgets`,
      file: `src/lib/CodeExample.svelte`,
    },
    `https://github.com/janosh/svelte-widgets/blob/-/src/lib/CodeExample.svelte`,
  ],
] as const)(
  `renders the %s link in nav and hides the unconfigured one`,
  (shown_title, meta, expected_href) => {
    // one bag is shared by every external link, so an href on it could only point the
    // repl and github icons at the same URL. `title` stays overridable by design.
    const link_props = { class: `consumer-link` }
    Reflect.set(link_props, `href`, `/hijacked`)
    mount(CodeExample, { target: document.body, props: { meta, src, link_props } })
    const link = (title: string) =>
      doc_query<HTMLAnchorElement>(`nav a[title="${title}"]`)

    expect(link(shown_title).getAttribute(`href`)).toBe(expected_href)
    expect([...link(shown_title).classList]).toContain(`consumer-link`)
    expect(link(shown_title).getAttribute(`target`)).toBe(`_blank`)
    expect(link(shown_title).getAttribute(`rel`)).toBe(`noreferrer`)
    expect(link(shown_title).style.display).toBe(`inline-block`)
    expect(link(shown_title === `Svelte` ? `GitHub` : `Svelte`).style.display).toBe(
      `none`,
    )
  },
)

// github: true + meta.file is covered by the GitHub link case above; these cover the
// mdsvex filename fallback and an explicit string blob path
test.each([
  [
    `true + meta.filename (set by mdsvex transform)`,
    { github: true, filename: `src/routes/(demos)/(attachments)/attachments/+page.md` },
    `src/routes/(demos)/(attachments)/attachments/+page.md`,
  ],
  [`string`, { github: `docs/example.svelte` }, `docs/example.svelte`],
])(`github: %s links to its blob path`, (_label, github_meta, expected_path) => {
  const repo = `https://github.com/janosh/svelte-widgets`
  const meta = { repo, ...github_meta }
  mount(CodeExample, { target: document.body, props: { meta, src } })

  const link = doc_query<HTMLAnchorElement>(`nav a[href*="github.com"]`)
  expect(link.getAttribute(`href`)).toBe(`${repo}/blob/-/${expected_path}`)
})

test(`labels prop overrides toggle text, omitted keys keep their default`, async () => {
  mount(CodeExample, {
    target: document.body,
    props: { src, meta: { collapsible: true }, labels: { show_code: `Code zeigen` } },
  })
  const toggle_button = doc_query<HTMLButtonElement>(`nav > button`)
  expect(toggle_button.textContent?.trim()).toBe(`Code zeigen`)

  toggle_button.click()
  await tick()
  expect(toggle_button.textContent?.trim()).toBe(`Close`) // hide_code falls back
})

test.each([
  [`typescript`, `typescript`],
  [undefined, null],
] as const)(`lang-label for meta.lang=%j`, (lang, expected_text) => {
  mount(CodeExample, {
    target: document.body,
    props: { src, meta: lang === undefined ? {} : { lang } },
  })
  const label = document.querySelector<HTMLSpanElement>(`.lang-label`)
  if (expected_text === null) {
    expect(label).toBeNull()
    return
  }
  assert(label !== null)
  expect(label.textContent).toBe(expected_text)
  // pre is white-space: pre, so an in-flow label shifts the first code line right.
  // absolute positioning takes it out of flow (regression guard, see CodeExample.svelte)
  expect(getComputedStyle(label).position).toBe(`absolute`)
})
