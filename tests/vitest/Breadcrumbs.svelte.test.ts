import { Breadcrumbs, type BreadcrumbItem } from '#lib'
import { Home } from '#lib/icons.ts'
import { createRawSnippet, tick, type ComponentProps } from 'svelte'
import { describe, expect, test, vi } from 'vite-plus/test'
import { click, doc_query, render } from './index'

type Props = ComponentProps<typeof Breadcrumbs>

const trail = (count: number, with_href = true): BreadcrumbItem[] =>
  Array.from({ length: count }, (_, idx) => ({
    label: `level${idx}`,
    ...(with_href ? { href: `/l${idx}` } : {}),
  }))

describe(`Breadcrumbs`, () => {
  const crumbs = () => [...document.querySelectorAll<HTMLElement>(`.crumb`)]
  const describe_crumbs = () =>
    crumbs().map((el) => [
      el.tagName,
      el.textContent?.trim(),
      el.getAttribute(`aria-current`),
    ])
  const texts = () =>
    [...document.querySelectorAll(`li`)].map((li) =>
      li.querySelector(`.crumb, .ellipsis`)?.textContent?.trim(),
    )
  const separators = () =>
    [...document.querySelectorAll(`.separator`)].map((sep) => [
      sep.textContent?.trim(),
      sep.getAttribute(`aria-hidden`),
    ])

  test(`renders nav > ol with links and a plain, aria-current last item`, () => {
    render(Breadcrumbs, { items: trail(3) })
    const nav = doc_query(`nav.breadcrumbs`)
    expect(nav.getAttribute(`aria-label`)).toBe(`Breadcrumb`)
    expect(nav.querySelectorAll(`ol > li`)).toHaveLength(3)
    expect(describe_crumbs()).toEqual([
      [`A`, `level0`, null],
      [`A`, `level1`, null],
      [`SPAN`, `level2`, `page`],
    ])
    expect(crumbs()[1].getAttribute(`href`)).toBe(`/l1`)
    // separators sit between items only, hidden from assistive tech
    expect(separators()).toEqual([
      [`/`, `true`],
      [`/`, `true`],
    ])
  })

  test.each<[string, Partial<Props>, (string | null)[]]>([
    [`link_current keeps the last link`, { link_current: true }, [`A`, `A`, `A`]],
    [`aria_current variant`, { aria_current: `location` }, [`A`, `A`, `SPAN`]],
    [
      `no href, onclick or on_navigate is plain text`,
      { items: trail(3, false) },
      [`SPAN`, `SPAN`, `SPAN`],
    ],
  ])(`%s`, (_desc, props, tag_names) => {
    render(Breadcrumbs, { items: trail(3), ...props })
    expect(crumbs().map((el) => el.tagName)).toEqual(tag_names)
    expect(crumbs().at(-1)?.getAttribute(`aria-current`)).toBe(
      props.aria_current ?? `page`,
    )
  })

  test(`callback navigation renders buttons and runs item onclick before on_navigate`, async () => {
    const calls: string[] = []
    const on_navigate = (item: BreadcrumbItem, index: number) =>
      calls.push(`navigate ${item.label} ${index}`)
    const items: BreadcrumbItem[] = [
      { label: `root`, onclick: () => calls.push(`root onclick`) },
      { label: `blocked`, onclick: (event) => event.preventDefault() },
      { label: `leaf` },
    ]
    render(Breadcrumbs, { items, on_navigate })
    expect(describe_crumbs()).toEqual([
      [`BUTTON`, `root`, null],
      [`BUTTON`, `blocked`, null],
      [`SPAN`, `leaf`, `page`],
    ])
    expect(crumbs()[0].getAttribute(`type`)).toBe(`button`)
    await click(crumbs()[0])
    await click(crumbs()[1])
    expect(calls).toEqual([`root onclick`, `navigate root 0`])
  })

  test(`link clicks reach on_navigate, which can take over routing`, () => {
    const on_navigate = vi.fn(
      (_item: BreadcrumbItem, _index: number, event: MouseEvent) =>
        event.preventDefault(),
    )
    render(Breadcrumbs, { items: trail(3), on_navigate })
    const event = new MouseEvent(`click`, { bubbles: true, cancelable: true })
    crumbs()[1].dispatchEvent(event)
    expect(on_navigate).toHaveBeenCalledExactlyOnceWith(trail(3)[1], 1, event)
    expect(event.defaultPrevented).toBe(true)
  })

  test.each<[string, Partial<Props>, string[], string]>([
    [
      `default head`,
      { max_items: 4 },
      [`level0`, `…`, `level3`, `level4`, `level5`],
      `Show 2 hidden levels`,
    ],
    [
      `custom head`,
      { max_items: 3, items_before: 2 },
      [`level0`, `level1`, `…`, `level5`],
      `Show 3 hidden levels`,
    ],
    [
      `no head`,
      { max_items: 2, items_before: 0 },
      [`…`, `level4`, `level5`],
      `Show 4 hidden levels`,
    ],
    [
      `translated label`,
      { max_items: 5, labels: { expand: (count: number) => `${count} weitere` } },
      [`level0`, `…`, `level2`, `level3`, `level4`, `level5`],
      `1 weitere`,
    ],
    // plain text crumbs take focus too, so it never drops to <body>
    [
      `plain text crumbs`,
      { max_items: 4, items: trail(6, false) },
      [`level0`, `…`, `level3`, `level4`, `level5`],
      `Show 2 hidden levels`,
    ],
  ])(
    `collapses a long trail (%s), and the ellipsis expands it and focuses the first revealed item`,
    async (_desc, props, visible, aria_label) => {
      const state = $state<Props>({ items: trail(6), expanded: false, ...props })
      render(Breadcrumbs, state)
      expect(texts()).toEqual(visible)
      expect(separators()).toHaveLength(visible.length - 1)
      const ellipsis = doc_query(`button.ellipsis`)
      expect(ellipsis.getAttribute(`aria-label`)).toBe(aria_label)
      ellipsis.click()
      await tick()
      await tick()
      expect(state.expanded).toBe(true)
      expect(texts()).toEqual(trail(6).map(({ label }) => label))
      const first_hidden = visible.indexOf(`…`)
      const focused = document.activeElement
      expect(focused?.textContent?.trim()).toBe(`level${first_hidden}`)
      // happy-dom focuses anything, a browser only these
      expect(focused?.matches(`a[href], button, [tabindex]`)).toBe(true)
      // resetting the binding collapses again
      state.expanded = false
      await tick()
      expect(texts()).toEqual(visible)
    },
  )

  // items_before is clamped to max_items - 1, so no more than max_items levels ever show
  test.each([
    [4, 1, 4, [`level0`, `level1`, `level2`, `level3`]],
    [3, 3, 5, [`level0`, `level1`, `…`, `level4`]],
    [2, 5, 4, [`level0`, `…`, `level3`]],
  ])(
    `max_items=%s items_before=%s over %s items shows %j`,
    (max_items, items_before, count, visible) => {
      render(Breadcrumbs, { items: trail(count), max_items, items_before })
      expect(texts()).toEqual(visible)
    },
  )

  test.each([1, 0, Number.NaN])(`max_items=%s throws`, (max_items) => {
    expect(() => render(Breadcrumbs, { items: trail(5), max_items })).toThrow(
      /max_items must be at least 2, got/u,
    )
  })

  test(`separator and item snippets customize rendering inside the default crumb`, () => {
    const separator = createRawSnippet(() => ({ render: () => `<b>›</b>` }))
    const item = createRawSnippet<[{ item: BreadcrumbItem; current: boolean }]>(
      (args) => ({
        render: () =>
          `<i>${args().item.label.toUpperCase()}${args().current ? `!` : ``}</i>`,
      }),
    )
    render(Breadcrumbs, { items: trail(3), separator, item })
    expect(separators()).toEqual([
      [`›`, `true`],
      [`›`, `true`],
    ])
    expect(describe_crumbs()).toEqual([
      [`A`, `LEVEL0`, null],
      [`A`, `LEVEL1`, null],
      [`SPAN`, `LEVEL2!`, `page`],
    ])
  })

  test(`icons, titles, link attributes and nav attributes pass through`, () => {
    render(Breadcrumbs, {
      items: [
        { label: `home`, href: `/`, icon: Home, title: `Go home`, target: `_self` },
        { label: `page` },
      ],
      link_props: { rel: `nofollow`, class: `extra` },
      'aria-label': `Path`,
      class: `custom`,
      id: `trail`,
    } as Props)
    const nav = doc_query(`nav#trail`)
    expect(nav.getAttribute(`aria-label`)).toBe(`Path`)
    expect([...nav.classList]).toEqual(expect.arrayContaining([`breadcrumbs`, `custom`]))
    const [home] = crumbs()
    expect(home.querySelector(`svg`)).not.toBeNull()
    expect([home.title, home.getAttribute(`target`), home.getAttribute(`rel`)]).toEqual([
      `Go home`,
      `_self`,
      `nofollow`,
    ])
    expect(home.classList.contains(`extra`)).toBe(true)
  })
})
