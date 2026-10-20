import CodeBlock from '#lib/CodeBlock.svelte'
import CopyButton from '#lib/CopyButton.svelte'
import type { CodeHighlight, CodeHighlighter } from '#lib/code-block.ts'
import { Typst } from '#lib/icons.ts'
import { createRawSnippet, tick, type ComponentProps } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'
import { doc_query, render } from './index'

const mount_block = (props: ComponentProps<typeof CodeBlock>) => {
  const unmount_block = render(CodeBlock, props)
  return { unmount_block, pre: doc_query(`pre`), code: doc_query(`code`) }
}

test.each([
  [`tokens`, [{ text: `<img src=x onerror=alert(1)>`, css: `syntax` }]],
  [`HTML`, `<span class="syntax">trusted &amp; highlighted</span>`],
] satisfies [string, CodeHighlight][])(
  `renders %s output with its trust contract`,
  async (_kind, output) => {
    const highlight = vi.fn<CodeHighlighter>(() => output)
    const { pre, code } = mount_block({ code: `original`, language: `html`, highlight })
    expect(code.textContent).toBe(`original`)
    expect(pre.getAttribute(`aria-busy`)).toBe(`true`)
    await vi.waitFor(() => expect(pre.getAttribute(`aria-busy`)).toBe(`false`))
    expect(highlight).toHaveBeenCalledExactlyOnceWith(
      `original`,
      `html`,
      expect.any(AbortSignal),
    )
    if (typeof output === `string`) {
      expect(code.querySelector(`.syntax`)?.outerHTML).toBe(output)
      expect(code.textContent).toBe(`trusted & highlighted`)
    } else {
      expect(code.textContent).toBe(output[0].text)
      expect(code.querySelector(`img`)).toBeNull()
      expect(code.querySelector(`.syntax`)?.textContent).toBe(output[0].text)
    }
  },
)

test.each([
  [`resolve`, `code`],
  [`reject`, `language`],
  [`resolve`, `highlight`],
] as const)(`stale %s cannot replace an updated %s`, async (completion, changed) => {
  const requests: {
    result: ReturnType<typeof Promise.withResolvers<CodeHighlight>>
    signal: AbortSignal
  }[] = []
  const highlight = vi.fn<CodeHighlighter>((_code, _language, signal) => {
    const result = Promise.withResolvers<CodeHighlight>()
    requests.push({ result, signal })
    return result.promise
  })
  const props = $state({ code: `old`, language: `ts`, highlight })
  const { unmount_block, pre, code } = mount_block(props)
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  if (changed === `code`) props.code = `new`
  else if (changed === `language`) props.language = `js`
  else
    props.highlight = vi.fn((...args: Parameters<CodeHighlighter>) => highlight(...args))
  await tick()
  expect(requests[0].signal.aborted).toBe(true)
  expect(code.textContent).toBe(props.code)
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  expect(highlight).toHaveBeenLastCalledWith(
    props.code,
    props.language,
    requests[1].signal,
  )
  requests[1].result.resolve([{ text: `current`, css: `fresh` }])
  await vi.waitFor(() => expect(code.textContent).toBe(`current`))
  if (completion === `resolve`) requests[0].result.resolve(`<b>stale</b>`)
  else requests[0].result.reject(new Error(`stale error`))
  await Promise.resolve()
  await tick()
  expect(code.textContent).toBe(`current`)
  expect(pre.getAttribute(`aria-busy`)).toBe(`false`)
  expect(document.querySelector(`[role=alert]`)).toBeNull()

  props.code = `unmounted`
  await vi.waitFor(() => expect(requests).toHaveLength(3))
  await unmount_block()
  expect(requests[2].signal.aborted).toBe(true)
  requests[2].result.reject(new Error(`after unmount`))
  await Promise.resolve()
  expect(document.querySelector(`[role=alert]`)).toBeNull()
})

test.each([new Error(`bad grammar`), `bad grammar`])(
  `recovers from highlighter failure %s and supports plain output`,
  async (failure) => {
    const highlight = vi
      .fn<CodeHighlighter>()
      .mockImplementationOnce(() => {
        if (failure instanceof Error) throw failure
        // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- test arbitrary caller failures
        return Promise.reject(failure)
      })
      .mockResolvedValue(`<b>recovered</b>`)
    const props = $state<ComponentProps<typeof CodeBlock>>({
      code: `<plain>`,
      highlight,
      label: `Source`,
      wrap: true,
      class: `custom`,
      'data-language': `test`,
      tabindex: -1,
      role: `none`,
      'aria-label': `Explicit label`,
    })
    const { pre, code } = mount_block(props)
    await vi.waitFor(() =>
      expect(doc_query(`[role=alert]`).textContent).toBe(`bad grammar`),
    )
    expect(code.textContent).toBe(`<plain>`)
    expect(code.querySelector(`plain`)).toBeNull()
    expect(pre.getAttribute(`aria-busy`)).toBe(`false`)
    expect(pre.getAttribute(`aria-label`)).toBe(`Explicit label`)
    expect(pre.getAttribute(`role`)).toBe(`none`)
    expect(pre.getAttribute(`data-language`)).toBe(`test`)
    expect(pre.tabIndex).toBe(-1)
    expect(pre.classList.contains(`custom`) && pre.classList.contains(`wrap`)).toBe(true)

    props.code = `retry`
    await vi.waitFor(() => expect(code.querySelector(`b`)?.textContent).toBe(`recovered`))
    expect(document.querySelector(`[role=alert]`)).toBeNull()
    props.highlight = undefined
    props.wrap = false
    await tick()
    expect(code.textContent).toBe(`retry`)
    expect(code.querySelector(`b`)).toBeNull()
    expect(pre.classList.contains(`wrap`)).toBe(false)
    expect(pre.getAttribute(`aria-busy`)).toBe(`false`)
  },
)

test(`unmounting before highlighting starts skips the queued work`, async () => {
  const highlight = vi.fn<CodeHighlighter>(() => `highlighted`)
  const { unmount_block } = mount_block({ code: `source`, highlight })
  await unmount_block()
  await Promise.resolve()
  expect(highlight).not.toHaveBeenCalled()
})

const bg_var = (el: HTMLElement) => el.style.getPropertyValue(`--code-block-bg`).trim()

test(`renders a bare pre without a header unless title, actions or copy is set`, async () => {
  const props = $state<ComponentProps<typeof CodeBlock>>({
    code: `x`,
    line_count: true,
    class: `custom`,
    style: `--code-block-bg: red`,
  })
  mount_block(props)
  expect(document.querySelector(`figure, figcaption, button`)).toBeNull()
  const bare = doc_query(`pre`)
  expect([bare.getAttribute(`aria-label`), bg_var(bare)]).toEqual([`Code`, `red`])
  expect(bare.classList.contains(`custom`)).toBe(true)
  props.copy = true
  await tick()
  // class and style move to the figure so header CSS variables reach it
  const [figure, pre] = [doc_query(`figure`), doc_query(`figure > pre`)]
  expect([figure.classList.contains(`custom`), bg_var(figure)]).toEqual([true, `red`])
  expect([pre.classList.contains(`custom`), pre.hasAttribute(`style`)]).toEqual([
    false,
    false,
  ])
  expect(figure.hasAttribute(`aria-labelledby`)).toBe(false)
  expect(doc_query(`figcaption button`).getAttribute(`aria-label`)).toBe(`Copy code`)
})

test.each([
  [{ code: `single`, line_count: true }, `diagram.typ (1 line)`],
  [{ code: `a\nb\nc\n`, line_count: true }, `diagram.typ (3 lines)`],
  [{ code: ``, line_count: true }, `diagram.typ (0 lines)`],
  [{ code: `a\nb` }, `diagram.typ`],
  [
    { code: `a`, line_count: true, labels: { line_count: (n: number) => `[${n}]` } },
    `diagram.typ [1]`,
  ],
])(`header for %j reads %j`, (props, caption) => {
  mount_block({ ...props, title: `diagram.typ`, icon: Typst })
  const figcaption = doc_query(`figure > figcaption`)
  expect(figcaption.textContent?.replaceAll(/\s+/gu, ` `).trim()).toBe(caption)
  expect(figcaption.querySelector(`svg`)?.getAttribute(`aria-hidden`)).toBe(`true`)
  const labelled_by = doc_query(`figure`).getAttribute(`aria-labelledby`) ?? ``
  expect(document.querySelector(`#${labelled_by}`)?.textContent).toBe(`diagram.typ`)
  expect(doc_query(`pre`).getAttribute(`aria-label`)).toBe(`diagram.typ`)
})

test(`an explicit label names the code region over the title`, () => {
  mount_block({ code: `x`, title: `file.typ`, label: `Typst source` })
  expect(doc_query(`pre`).getAttribute(`aria-label`)).toBe(`Typst source`)
})

test(`header renders actions before a copy button that copies the code`, async () => {
  const write_text = vi.fn(() => Promise.resolve())
  vi.stubGlobal(`navigator`, { clipboard: { writeText: write_text } })
  onTestFinished(() => {
    vi.unstubAllGlobals()
  })
  const actions = createRawSnippet(() => ({
    render: () => `<a href="https://github.com/x">GitHub</a>`,
  }))
  mount_block({ code: `copy me`, copy: true, actions, label: `Source` })
  const controls = [...doc_query(`figcaption .actions`).children]
  expect(controls.map((el) => el.tagName)).toEqual([`A`, `BUTTON`])
  expect(doc_query(`pre`).getAttribute(`aria-label`)).toBe(`Source`)
  controls[1].dispatchEvent(new MouseEvent(`click`, { bubbles: true }))
  await vi.waitFor(() => expect(write_text).toHaveBeenCalledExactlyOnceWith(`copy me`))
})

test(`global CopyButton skips blocks whose header already has a copy button`, async () => {
  render(CopyButton, { global: true })
  mount_block({ code: `with header`, copy: true })
  render(CodeBlock, { code: `bare` })
  await vi.waitFor(() =>
    expect(document.querySelectorAll(`pre [data-sms-copy]`)).toHaveLength(1),
  )
  expect(document.querySelectorAll(`[data-sms-copy]`)).toHaveLength(2)
  expect(document.querySelector(`figure pre [data-sms-copy]`)).toBeNull()
})
