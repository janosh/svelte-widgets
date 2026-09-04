import { PrevNext } from '$lib'
import { mount, type ComponentProps, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import TestSnippetHarness from './TestSnippetHarness.svelte'

const items = [`page1`, `page2`, `page3`, `page4`]

describe(`PrevNext`, () => {
  let target: HTMLElement
  const link_hrefs = () =>
    [...target.querySelectorAll(`a`)].map((link) => link.getAttribute(`href`))
  const mounted: Record<string, unknown>[] = []
  const mount_prev_next = (props: ComponentProps<typeof PrevNext>) => {
    mounted.push(mount(PrevNext, { target, props }))
  }
  const mount_snippet_harness = (props: ComponentProps<typeof TestSnippetHarness>) => {
    mounted.push(mount(TestSnippetHarness, { target, props }))
  }
  const child_snippets = () => [
    ...target.querySelectorAll<HTMLElement>(`[data-testid="prevnext-child"]`),
  ]

  beforeEach(() => {
    target = document.body
  })

  afterEach(() => {
    for (const instance of mounted) void unmount(instance)
    mounted.length = 0
  })

  test.each<[string, ComponentProps<typeof PrevNext>, number]>([
    [`fewer items than the default min_items`, { items: [`page1`, `page2`] }, 0],
    [`fewer items than a custom min_items`, { items, min_items: 5 }, 0],
    [`exactly min_items`, { items: [`page1`, `page2`], min_items: 2 }, 2],
  ])(`min_items gate: %s renders %d links`, (_desc, props, expected_links) => {
    mount_prev_next({ ...props, current: `page1` })
    expect(target.querySelectorAll(`a`)).toHaveLength(expected_links)
  })

  test.each([
    [`middle item`, `page2`, [`page1`, `page3`]],
    [`first item wraps`, `page1`, [`page4`, `page2`]],
    [`last item wraps`, `page4`, [`page3`, `page1`]],
  ] as const)(`prev/next links for %s`, (_desc, current, expected_hrefs) => {
    mount_prev_next({ items, current })
    expect(link_hrefs()).toEqual(expected_hrefs)
  })

  test.each([
    [`custom`, { prev: `Back`, next: `Forward` }, [`Back`, `Forward`]],
    [`empty`, { prev: ``, next: `` }, []],
  ] as const)(`%s titles`, (_label, titles, expected_labels) => {
    mount_prev_next({ items, current: `page2`, titles })
    expect([...target.querySelectorAll(`span`)].map((span) => span.textContent)).toEqual(
      expected_labels,
    )
    expect(target.querySelectorAll(`a`)).toHaveLength(2)
  })

  test(`leaves global arrow shortcuts to the app and forwards local DOM events`, () => {
    const replace_state = vi.spyOn(history, `replaceState`)
    const push_state = vi.spyOn(history, `pushState`)
    const scroll_to = vi.spyOn(globalThis, `scrollTo`)
    const onkeyup = vi.fn()
    mount_prev_next({ items, current: `page2`, onkeyup })
    for (const key of [`ArrowLeft`, `ArrowRight`]) {
      globalThis.dispatchEvent(new KeyboardEvent(`keyup`, { key }))
    }
    expect(onkeyup).not.toHaveBeenCalled()
    const event = new KeyboardEvent(`keyup`, { key: `ArrowRight`, bubbles: true })
    target.querySelector(`a`)?.dispatchEvent(event)
    expect(onkeyup).toHaveBeenCalledExactlyOnceWith(event)
    expect(link_hrefs()).toEqual([`page1`, `page3`])
    for (const spy of [replace_state, push_state, scroll_to]) {
      expect(spy).not.toHaveBeenCalled()
      spy.mockRestore()
    }
  })

  test(`custom node element`, () => {
    mount_prev_next({ items, current: `page2`, node: `div` })
    expect(target.querySelector(`div.prev-next`)).toBeInstanceOf(HTMLDivElement)
    expect(target.querySelector(`nav`)).toBeNull()
    expect(link_hrefs()).toEqual([`page1`, `page3`]) // links still render inside the div
  })

  test(`uses tuple href and label`, () => {
    const tuple_items: [string, string][] = [1, 2, 3, 4].map((num) => [
      `/page/${num}`,
      `P${num}`,
    ])
    mount_prev_next({ items: tuple_items, current: `/page/2` })
    expect(link_hrefs()).toEqual([`/page/1`, `/page/3`])
    expect(
      [...target.querySelectorAll(`a`)].map((link) => link.textContent?.trim()),
    ).toEqual([`P1`, `P3`])
  })

  test.each([
    [`page2`, `1`],
    [`nonexistent`, undefined], // index is not rendered when current is not among items
  ])(`children snippet receives kind, index and total (current=%s)`, (current, index) => {
    const component = `prev-next-children`
    mount_snippet_harness({ component, items, current })

    expect(
      child_snippets().map((snippet) => [
        snippet.dataset.kind,
        snippet.dataset.index,
        snippet.dataset.total,
      ]),
    ).toEqual([
      [`prev`, index, `4`],
      [`next`, index, `4`],
    ])
    expect(child_snippets().map((snippet) => snippet.textContent?.trim())).toEqual(
      current === `page2` ? [`page1`, `page3`] : [`page4`, `page1`],
    )
    expect(target.querySelector(`[data-testid="prevnext-between"]`)?.textContent).toBe(
      `between`,
    )
  })

  test(`link_props and default attributes applied to links`, () => {
    const link_props = {
      class: `custom-class`,
      'data-testid': `nav-link`,
      target: `_blank`,
    }
    mount_prev_next({ items, current: `page2`, link_props })

    const link_attrs = [...target.querySelectorAll(`a`)].map((link) => [
      link.classList.contains(`custom-class`),
      link.getAttribute(`data-testid`),
      link.getAttribute(`target`),
      link.getAttribute(`data-sveltekit-preload-data`), // component default
    ])
    const expected = [true, `nav-link`, `_blank`, `hover`]
    expect(link_attrs).toEqual([expected, expected])
  })
})
