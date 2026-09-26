import CodeBlock from '$lib/CodeBlock.svelte'
import type { CodeHighlight, CodeHighlighter } from '$lib/code-block'
import { flushSync, mount, tick, unmount, type ComponentProps } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'
import { doc_query } from './index'

const mount_block = (props: ComponentProps<typeof CodeBlock>) => {
  const component = mount(CodeBlock, { target: document.body, props })
  onTestFinished(() => unmount(component))
  flushSync()
  return { component, pre: doc_query(`pre`), code: doc_query(`code`) }
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
  const { component, pre, code } = mount_block(props)
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
  await unmount(component)
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
  const { component } = mount_block({ code: `source`, highlight })
  await unmount(component)
  await Promise.resolve()
  expect(highlight).not.toHaveBeenCalled()
})
