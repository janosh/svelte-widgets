import CodeExample from '#lib/CodeExample.svelte'
import LazyMount from '#lib/LazyMount.svelte'
import LazyMountTextHarness from './LazyMountTextHarness.svelte'
import StatusMessage from '#lib/StatusMessage.svelte'
import { createRawSnippet, tick } from 'svelte'
import { beforeEach, expect, test, vi } from 'vite-plus/test'
import { doc_query, raw_snippet, render, stub_resize_observer } from './index'

// `intersect` delivers a crossing to the observer watching the target, throwing if none does
const observers = new Map<
  Element,
  { callback: IntersectionObserverCallback; init?: object }
>()
const intersect = (target: Element, isIntersecting: boolean) => {
  const observer = observers.get(target)
  if (!observer) throw new Error(`no IntersectionObserver observes the target`)
  observer.callback(
    [{ target, isIntersecting } as IntersectionObserverEntry],
    {} as never,
  )
}
class FakeIntersectionObserver {
  readonly #targets = new Set<Element>()
  constructor(
    readonly callback: IntersectionObserverCallback,
    readonly init?: IntersectionObserverInit,
  ) {}
  observe(target: Element) {
    this.#targets.add(target)
    observers.set(target, this)
  }
  disconnect() {
    for (const target of this.#targets) observers.delete(target)
  }
}
beforeEach(() => {
  vi.stubGlobal(`IntersectionObserver`, FakeIntersectionObserver)
  stub_resize_observer()
})

test(`defers loading until near view, loads once and forwards reactive props`, async () => {
  const result = Promise.withResolvers<{
    default: typeof StatusMessage
    props: { message: string }
  }>()
  const load = vi.fn(() => result.promise)
  const props = $state({
    label: `Test demo`,
    load,
    props: { message: `Current message` },
  })
  render(LazyMount, props)
  const region = doc_query(`.lazy-mount`)
  expect(observers.get(region)?.init).toMatchObject({ rootMargin: `200px` })
  expect([region.getAttribute(`role`), region.getAttribute(`aria-label`)]).toEqual([
    `region`,
    `Test demo`,
  ])
  // a caller's role and label win over the defaults
  render(LazyMount, {
    label: `Other`,
    load,
    props: { message: `x` },
    role: `group`,
    'aria-label': `Custom`,
  })
  const custom = document.querySelectorAll(`.lazy-mount`)[1]
  expect([custom.getAttribute(`role`), custom.getAttribute(`aria-label`)]).toEqual([
    `group`,
    `Custom`,
  ])
  intersect(region, false)
  await tick()
  expect(load).not.toHaveBeenCalled()
  expect(region.textContent).toBe(`Test demo`)

  intersect(region, true)
  await tick()
  expect(load).toHaveBeenCalledOnce()
  expect(region.querySelector(`[role="status"]`)?.textContent).toBe(`Loading Test demo…`)
  result.resolve({ default: StatusMessage, props: { message: `Loaded default` } })
  await vi.waitFor(() => expect(region.textContent).toContain(`Current message`))
  props.props.message = `Updated message`
  await tick()
  expect(region.textContent).toContain(`Updated message`)
  expect(load).toHaveBeenCalledOnce()
})

test(`reports a failed import with the label`, async () => {
  const load = vi.fn(() => Promise.reject(new Error(`Module unavailable`)))
  render(LazyMount, { label: `Phonon spectra`, load, props: {} })
  intersect(doc_query(`.lazy-mount`), true)
  await vi.waitFor(() =>
    expect(doc_query(`[role="alert"]`).textContent).toContain(
      `Failed to load Phonon spectra: Module unavailable`,
    ),
  )
})

// content that renders nothing at first (its own chunk loading) must not drop the held height,
// or every LazyMount below would scroll into view and load at once
// a live-region root (StatusMessage) is content like any other; only a child marked
// data-lazy-placeholder (a loader the content shows itself) never releases the hold
test.each([
  [`<div class="content" role="status"></div>`, ``],
  [`<p class="content" data-lazy-placeholder>Loading…</p>`, `350px`],
])(`holds its height until content with some height lays out: %s`, async (html, held) => {
  const children = raw_snippet(html)
  const resize = stub_resize_observer()
  render(LazyMount, { label: `Demo`, height: `350px`, children })
  const region = doc_query(`.lazy-mount`)
  expect(region.style.minHeight).toBe(`350px`)
  intersect(region, true)
  await tick()
  const content = doc_query(`.lazy-mount .content`)
  let height = 0
  content.getBoundingClientRect = () => new DOMRect(0, 0, 100, height)
  resize.resize(content)
  await tick()
  expect(region.style.minHeight).toBe(`350px`)
  height = 120
  resize.resize(content)
  await tick()
  expect(region.style.minHeight).toBe(held)
})

test(`releases the held height for bare text content, which has no box to observe`, async () => {
  render(LazyMountTextHarness, {})
  const region = doc_query(`.lazy-mount`)
  expect(region.style.minHeight).toBe(`350px`)
  intersect(region, true)
  await tick()
  expect(region.textContent).toBe(`plain text`)
  expect(region.style.minHeight).toBe(``)
})

test.each([true, false])(
  `lazy CodeExample keeps its source readable and mounts the example once (collapsible=%s)`,
  async (collapsible) => {
    const cleanup = vi.fn()
    const setup = vi.fn((element: Element) => {
      const button = element.querySelector(`button`)
      if (!button) throw new Error(`Missing example button`)
      button.addEventListener(`click`, () => (button.textContent = `Changed`))
      return cleanup
    })
    const unmount = render(CodeExample, {
      src: `Example source`,
      meta: {
        collapsible,
        lazy: true,
        id: `example-anchor`,
        title: collapsible ? `Counter` : undefined,
      },
      example: createRawSnippet(() => ({
        render: () => `<div><button>Change</button></div>`,
        setup,
      })),
    })
    const region = doc_query(`#example-anchor > .lazy-mount`)
    expect(region.getAttribute(`aria-label`)).toBe(
      collapsible ? `Counter` : `Interactive example`,
    )
    expect(region.style.minHeight).toBe(`var(--code-example-lazy-height, 350px)`)
    intersect(region, false)
    await tick()
    expect(setup).not.toHaveBeenCalled()
    expect(doc_query(`#example-anchor pre`).textContent).toContain(`Example source`)
    expect(doc_query(`pre`).classList.contains(`open`)).toBe(!collapsible)

    intersect(region, true)
    await tick()
    expect(setup).toHaveBeenCalledOnce()
    doc_query(`.lazy-mount button`).click()
    // mounted for good: the observer is gone, so scrolling away can't unmount it
    expect(() => intersect(region, false)).toThrow(`no IntersectionObserver observes`)
    await tick()
    expect(region.textContent).toBe(`Changed`)
    expect(setup).toHaveBeenCalledOnce()
    await unmount()
    expect(cleanup).toHaveBeenCalledOnce()
  },
)

test(`CodeExample without lazy renders its example directly`, () => {
  render(CodeExample, {
    src: ``,
    meta: { id: `eager` },
    example: raw_snippet(`<p class="demo">Demo</p>`),
  })
  expect(doc_query(`#eager > p.demo`).textContent).toBe(`Demo`)
  expect(document.querySelector(`.lazy-mount`)).toBeNull()
})
