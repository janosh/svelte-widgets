import { PrevNext } from '$lib'
import { createRawSnippet, mount, type ComponentProps, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import TestSnippetHarness from './TestSnippetHarness.svelte'

const items = [`page1`, `page2`, `page3`, `page4`].map((href) => ({ href, label: href }))

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

  test.each<[string, Omit<ComponentProps<typeof PrevNext>, `current`>, number]>([
    [`fewer items than the default min_items`, { items: items.slice(0, 2) }, 0],
    [`fewer items than a custom min_items`, { items, min_items: 5 }, 0],
    [`exactly min_items`, { items: items.slice(0, 2), min_items: 2 }, 2],
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
  ] as const)(`%s labels`, (_label, labels, expected_labels) => {
    mount_prev_next({ items, current: `page2`, labels })
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

  test.each([
    [`without between`, undefined],
    [
      `with between content`,
      createRawSnippet(() => ({ render: () => `<span>|</span>` })),
    ],
  ])(`only the next link is end-aligned %s`, (_desc, between) => {
    mount_prev_next({ items, current: `page2`, between })
    // positional nth-child(2) styling landed on the between content instead
    const aligns = [...target.querySelectorAll(`.prev-next > *`)].map(
      (element) => getComputedStyle(element).textAlign,
    )
    expect(aligns.at(-1)).toBe(`end`)
    expect(aligns.slice(0, -1)).not.toContain(`end`)
  })

  test(`custom wrapper preserves its class`, () => {
    mount_prev_next({ items, current: `page2`, as: `div`, class: `custom` })
    expect(target.querySelector(`div.prev-next`)).toBeInstanceOf(HTMLDivElement)
    expect(target.querySelector(`nav`)).toBeNull()
    expect(target.querySelector(`div.prev-next.custom`)).not.toBeNull()
    expect(link_hrefs()).toEqual([`page1`, `page3`]) // links still render inside the div
  })

  test(`uses explicit href and label`, () => {
    const pages = [1, 2, 3, 4].map((num) => ({ href: `/page/${num}`, label: `P${num}` }))
    mount_prev_next({ items: pages, current: `/page/2` })
    expect(link_hrefs()).toEqual([`/page/1`, `/page/3`])
    expect(
      [...target.querySelectorAll(`a`)].map((link) => link.textContent?.trim()),
    ).toEqual([`P1`, `P3`])
  })

  test.each([
    [`page2`, `1`],
    [`page1`, `0`],
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
      current === `page2` ? [`page1`, `page3`] : [`page4`, `page2`],
    )
    expect(target.querySelector(`[data-testid="prevnext-between"]`)?.textContent).toBe(
      `between`,
    )
  })

  test(`rejects an unknown current destination but allows empty lists`, () => {
    expect(() => mount_prev_next({ items, current: `missing` })).toThrow(
      `current="missing" is absent`,
    )
    mount_prev_next({ items: [], current: `missing` })
    expect(target.querySelector(`nav`)).toBeNull()
  })

  test(`item attributes override shared link_props`, () => {
    const link_props = {
      class: `custom-class`,
      'data-testid': `nav-link`,
      target: `_blank`,
      'data-sveltekit-preload-data': `hover`,
    }
    mount_prev_next({
      items: [
        { ...items[0], target: `_self`, rel: `author`, title: `First page` },
        ...items.slice(1),
      ],
      current: `page2`,
      link_props,
    })

    const link_attrs = [...target.querySelectorAll(`a`)].map((link) => [
      link.classList.contains(`custom-class`),
      link.getAttribute(`data-testid`),
      link.getAttribute(`target`),
      link.getAttribute(`data-sveltekit-preload-data`), // caller-owned router policy
    ])
    const expected = [true, `nav-link`, `_blank`, `hover`]
    expect(link_attrs).toEqual([[true, `nav-link`, `_self`, `hover`], expected])
    expect([target.querySelector(`a`)?.rel, target.querySelector(`a`)?.title]).toEqual([
      `author`,
      `First page`,
    ])
  })
})
