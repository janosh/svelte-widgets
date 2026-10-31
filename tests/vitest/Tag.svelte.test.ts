import { apply_theme_mode, Tag } from '#lib'
import { Star } from '#lib/icons.ts'
import { createRawSnippet, flushSync, type ComponentProps } from 'svelte'
import { describe, expect, onTestFinished, test, vi } from 'vite-plus/test'
import { click, doc_query, render } from './index'

type TagProps = ComponentProps<typeof Tag>

describe(`Tag`, () => {
  const content = () => doc_query(`.tag > .content`)
  const remove_button = () => doc_query<HTMLButtonElement>(`.tag > button.remove`)

  test.each<[string, TagProps, string, string | null]>([
    [`static badge`, { label: `new` }, `SPAN`, null],
    [`link`, { label: `docs`, href: `/docs` }, `A`, null],
    [`button`, { label: `run`, onclick: () => {} }, `BUTTON`, null],
    [`toggle`, { label: `svelte`, onclick: () => {}, active: false }, `BUTTON`, `false`],
    [`pressed toggle`, { label: `a`, onclick: () => {}, active: true }, `BUTTON`, `true`],
    // active on a badge only styles: a static tag matching the current filter
    [`styled-active badge`, { label: `svelte`, active: true }, `SPAN`, null],
  ])(`%s renders as %s with aria-pressed=%s`, (_desc, props, tag_name, pressed) => {
    render(Tag, props)
    expect(content().tagName).toBe(tag_name)
    expect(content().getAttribute(`aria-pressed`)).toBe(pressed)
    expect(content().textContent?.trim()).toBe(props.label)
    expect(doc_query(`.tag`).classList.contains(`active`)).toBe(Boolean(props.active))
    if (tag_name === `BUTTON`) expect(content().getAttribute(`type`)).toBe(`button`)
  })

  test(`class and style land on the pill, other attributes on its link`, async () => {
    const onclick = vi.fn()
    render(Tag, {
      label: `docs`,
      href: `/docs`,
      onclick,
      target: `_blank`,
      class: [`custom`, { on: true }],
      style: `margin: 3px`,
      title: `Read the docs`,
    })
    const pill = doc_query(`.tag`)
    expect([...pill.classList]).toEqual(expect.arrayContaining([`custom`, `on`, `soft`]))
    expect([pill.style.margin, pill.hasAttribute(`title`)]).toEqual([`3px`, false])
    const link = content()
    expect([link.getAttribute(`href`), link.getAttribute(`target`), link.title]).toEqual([
      `/docs`,
      `_blank`,
      `Read the docs`,
    ])
    link.addEventListener(`click`, (event) => event.preventDefault())
    await click(link)
    expect(onclick).toHaveBeenCalledOnce()
  })

  // the remove button is named by its own text, then the content (resolves aria-labelledby,
  // which happy-dom does not)
  const remove_name = () => {
    const button = remove_button()
    const ids = button.getAttribute(`aria-labelledby`)?.split(` `) ?? []
    return ids
      .map((id) => document.querySelector(`#${CSS.escape(id)}`))
      .map((el) =>
        el === button ? el.getAttribute(`aria-label`) : el?.textContent?.trim(),
      )
      .join(` `)
  }

  test.each<[string, TagProps, string]>([
    [`labelled`, { label: `svelte` }, `Remove svelte`],
    [
      `children-only`,
      { children: createRawSnippet(() => ({ render: () => `<em>svelte</em>` })) },
      `Remove svelte`,
    ],
    [`custom id`, { label: `svelte`, id: `svelte-tag` }, `Remove svelte`],
    [
      `translated`,
      { label: `svelte`, labels: { remove: `Entfernen` } },
      `Entfernen svelte`,
    ],
  ])(
    `%s remove button is named after the content and calls on_remove`,
    async (_desc, props, name) => {
      const on_remove = vi.fn()
      render(Tag, { ...props, on_remove })
      expect(remove_name()).toBe(name)
      await click(remove_button())
      expect(on_remove).toHaveBeenCalledOnce()
    },
  )

  test.each([
    [`button`, {}, `BUTTON`],
    [`link`, { href: `/docs` }, `A`],
  ])(`disabled %s and its remove button are inert`, async (_desc, props, tag_name) => {
    const onclick = vi.fn()
    render(Tag, { label: `x`, disabled: true, on_remove: () => {}, onclick, ...props })
    const element = content()
    expect(element.tagName).toBe(tag_name)
    if (tag_name === `A`) {
      expect(element.hasAttribute(`href`)).toBe(false)
      expect(element.getAttribute(`role`)).toBe(`link`)
      expect(element.getAttribute(`aria-disabled`)).toBe(`true`)
    } else expect((element as HTMLButtonElement).disabled).toBe(true)
    expect(remove_button().disabled).toBe(true)
    expect(doc_query(`.tag`).classList.contains(`disabled`)).toBe(true)
    await click(element)
    expect(onclick).not.toHaveBeenCalled()
  })

  test(`icon and count frame the label; children replace the label`, () => {
    render(Tag, { label: `stars`, icon: Star, count: 12 })
    const { firstElementChild: first, lastElementChild: last } = content()
    expect([first?.localName, last?.matches(`.count`), last?.textContent]).toEqual([
      `svg`,
      true,
      `12`,
    ])

    document.body.innerHTML = ``
    const children = createRawSnippet(() => ({ render: () => `<em>custom</em>` }))
    render(Tag, { label: `ignored`, children })
    expect(content().innerHTML).toContain(`<em>custom</em>`)
    expect(content().textContent?.trim()).toBe(`custom`)
  })

  // a fill gets readable text picked from its painted background; tints don't
  test.each<[string, TagProps, string | undefined]>([
    [`dark solid fill`, { variant: `solid`, color: `#1a1a2e` }, `white`],
    [`light solid fill`, { variant: `solid`, color: `#f7d154` }, `black`],
    [`active soft tag fills`, { color: `#1a1a2e`, active: true }, `white`],
    [
      `--tag-color from style`,
      { variant: `solid`, style: `--tag-color: #1a1a2e` },
      `white`,
    ],
    [`soft tint keeps inherited text`, { color: `#1a1a2e` }, undefined],
  ])(`%s sets --tag-contrast-color=%s`, (_desc, props, expected) => {
    render(Tag, { label: `x`, ...props })
    const contrast = doc_query(`.tag`).style.getPropertyValue(`--tag-contrast-color`)
    expect(contrast || undefined).toBe(expected)
  })

  test(`contrast is re-picked when the color, theme, variant or style changes`, () => {
    const sheet = document.createElement(`style`)
    sheet.textContent = `:root { --brand: #1a1a2e } :root[data-theme='dark'] { --brand: #f7d154 }`
    document.head.append(sheet)
    onTestFinished(() => {
      sheet.remove()
      delete document.documentElement.dataset.theme
    })
    apply_theme_mode(`light`)
    const props = $state<TagProps>({
      label: `x`,
      variant: `solid`,
      color: `var(--brand)`,
    })
    render(Tag, props)
    const contrast = () =>
      doc_query(`.tag`).style.getPropertyValue(`--tag-contrast-color`)
    expect(contrast()).toBe(`white`)
    apply_theme_mode(`dark`) // the same color prop now paints a light fill
    flushSync()
    expect(contrast()).toBe(`black`)
    props.color = `#1a1a2e`
    flushSync()
    expect(contrast()).toBe(`white`)
    props.variant = `outline`
    flushSync()
    expect(contrast()).toBe(``)
    props.variant = `solid`
    props.style = `--tag-color: #f7d154` // style comes last, so it wins over color
    flushSync()
    expect(contrast()).toBe(`black`)
  })
})
