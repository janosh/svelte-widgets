import { create_find_state, type FindOptions } from '$lib/find-in-page.svelte'
import FindBar from '$lib/FindBar.svelte'
import type { ComponentProps } from 'svelte'
import { mount, tick, unmount } from 'svelte'
import { describe, expect, onTestFinished, test, vi } from 'vite-plus/test'
import { doc_query, press_key, stub_css_highlights } from './index'

type Props = ComponentProps<typeof FindBar>

const render_root = (html: string): HTMLElement => {
  document.body.innerHTML = `<main>${html}</main><div id="bar"></div>`
  return doc_query(`main`)
}

const mount_bar = (html: string, extra: Partial<Props> = {}) => {
  const root = render_root(html)
  const on_close = vi.fn()
  const bar = mount(FindBar, {
    target: doc_query(`#bar`),
    props: { root, on_close, ...extra },
  })
  let is_mounted = true
  const unmount_bar = async (): Promise<void> => {
    if (!is_mounted) return
    is_mounted = false
    await unmount(bar)
  }
  onTestFinished(unmount_bar)
  return { bar, root, on_close, unmount_bar }
}

const input = () => doc_query<HTMLInputElement>(`.find-bar input`)
const status = () => doc_query(`.find-status`).textContent?.trim()
const nav_button = (name: `Previous` | `Next`) =>
  doc_query<HTMLButtonElement>(`.find-bar button[aria-label="${name} match"]`)

// Use a real input event so FindBar's async path runs.
const type_query = async (query: string) => {
  const element = input()
  element.value = query
  element.dispatchEvent(new Event(`input`, { bubbles: true }))
  await tick()
  await tick()
}

const jumped = () => document.querySelector(`.search-match-jump`)?.textContent

describe(`FindBar`, () => {
  test(`focus_input focuses and selects the query, and mounting does not`, async () => {
    const { bar } = mount_bar(`<p>alpha</p>`)
    await type_query(`alpha`)
    expect(document.activeElement).not.toBe(input())

    bar.focus_input()
    expect(document.activeElement).toBe(input())
    expect([input().selectionStart, input().selectionEnd]).toEqual([0, `alpha`.length])
  })

  test(`counts every hit, walks them with the arrows and wraps at both ends`, async () => {
    // The second paragraph has two hits: navigation is per occurrence, not per element.
    const disconnect = vi.spyOn(MutationObserver.prototype, `disconnect`)
    mount_bar(`<p>alpha</p><p>beta alpha alpha</p>`)
    expect(status()).toBe(``)

    await type_query(`alpha`)
    expect(disconnect).not.toHaveBeenCalled()
    expect(status()).toBe(`1 of 3`)
    expect(jumped()).toBe(`alpha`)

    nav_button(`Next`).click()
    await tick()
    expect(status()).toBe(`2 of 3`)
    expect(jumped()).toBe(`beta alpha alpha`)

    for (const expected_status of [`3 of 3`, `1 of 3`]) {
      nav_button(`Next`).click()
      await tick()
      expect(status()).toBe(expected_status)
    }
    nav_button(`Previous`).click()
    await tick()
    expect(status()).toBe(`3 of 3`)
    press_key(input(), `Enter`)
    await tick()
    expect(status()).toBe(`1 of 3`)
    press_key(input(), `Enter`, { shiftKey: true })
    await tick()
    expect(status()).toBe(`3 of 3`)
  })

  test(`reports no matches and disables the arrows`, async () => {
    mount_bar(`<p>alpha</p>`)
    await type_query(`omega`)

    expect(status()).toBe(`No matches`)
    expect([nav_button(`Previous`).disabled, nav_button(`Next`).disabled]).toEqual([
      true,
      true,
    ])
  })

  test(`the close button closes the bar`, async () => {
    const { on_close } = mount_bar(`<p>alpha</p>`)
    await type_query(`alpha`)
    doc_query<HTMLButtonElement>(`.find-close`).click()
    expect(on_close).toHaveBeenCalledOnce()
  })

  test(`Escape closes the bar without reaching the searched surface`, async () => {
    const { on_close } = mount_bar(`<p>alpha</p>`)
    const outer = vi.fn()
    document.body.addEventListener(`keydown`, outer)

    const event = press_key(input(), `Escape`)
    document.body.removeEventListener(`keydown`, outer)
    expect(on_close).toHaveBeenCalledOnce()
    expect(outer).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  test(`opens every collapsed <details> ancestor holding a match`, async () => {
    mount_bar(
      `<details><summary>outer</summary><details><summary>inner</summary>` +
        `<p>buried alpha</p></details></details>`,
    )
    const details = [...document.querySelectorAll<HTMLDetailsElement>(`details`)]
    expect(details.map(({ open }) => open)).toEqual([false, false])

    await type_query(`buried`)
    expect(details.map(({ open }) => open)).toEqual([true, true])
  })

  test(`required labels and role override rest props`, () => {
    mount_bar(`<p>alpha</p>`, { label: `x`, 'aria-label': `y`, role: `none` })

    expect(input().closest(`[role=search]`)?.getAttribute(`aria-label`)).toBe(`Find in x`)
    expect(input().placeholder).toBe(`Find in x…`)
    expect(doc_query(`.find-close`).getAttribute(`aria-label`)).toBe(`Close x search`)
  })

  test(`labels prop overrides strings, omitted keys keep the English defaults`, () => {
    mount_bar(`<p>alpha</p>`, {
      label: `x`,
      labels: {
        find_in: (scope: string) => `Suchen in ${scope}`,
        next_match: `Nächster Treffer`,
        close: (scope: string) => `${scope}-Suche schließen`,
      },
    })

    const step_titles = [
      ...document.querySelectorAll(`.find-bar button:not(.find-close)`),
    ].map((btn) => btn.getAttribute(`title`))

    // one find_in override moves both the placeholder and the region label
    expect(input().placeholder).toBe(`Suchen in x…`)
    expect(input().getAttribute(`aria-label`)).toBe(`Suchen in x`)
    expect(doc_query(`.find-close`).getAttribute(`aria-label`)).toBe(`x-Suche schließen`)
    // omitted keys keep the defaults
    expect(step_titles).toEqual([
      `Previous match (Shift+Enter)`,
      `Nächster Treffer (Enter)`,
    ])
    expect(doc_query(`.find-close`).getAttribute(`title`)).toBe(`Close (Escape)`)
  })

  // Fixture: plain, aria-hidden, sr-only, and .skip; also_ignore extends defaults.
  test.each([
    [`nothing extra`, undefined, `1 of 2`],
    [`also_ignore`, `.skip`, `1 of 1`],
  ])(`skips the never-findable selectors plus %s`, async (_case, also_ignore, count) => {
    mount_bar(
      `<p>alpha</p><p aria-hidden="true">alpha</p><p class="sr-only">alpha</p>` +
        `<p class="skip">alpha</p>`,
      { also_ignore },
    )
    await type_query(`alpha`)
    expect(status()).toBe(count)
  })

  // only_within scopes search; always-excluded selectors still apply inside.
  test.each([
    [`without only_within`, undefined, `1 of 3`],
    [`with only_within`, `.content`, `1 of 1`],
  ])(`%s`, async (_case, only_within, count) => {
    mount_bar(
      `<div class="content"><p>alpha</p><p aria-hidden="true">alpha</p></div>` +
        `<nav><p>alpha</p></nav><footer><p>alpha</p></footer>`,
      { only_within },
    )
    await type_query(`alpha`)
    expect(status()).toBe(count)
  })
})

describe(`create_find_state`, () => {
  const setup = (html: string, options: FindOptions = {}) => {
    const root = render_root(html)
    return { root, find: create_find_state(() => options) }
  }
  const run_search = (
    root: Element,
    find: ReturnType<typeof create_find_state>,
    query: string,
  ) => {
    find.query = query
    find.refresh(root)
  }

  test(`setting a query resets navigation and refresh recomputes matches`, () => {
    const { root, find } = setup(`<p>alpha two</p><p>alpha two</p>`)

    run_search(root, find, `alpha`)
    expect(find.matches).toHaveLength(2)
    expect(find.status).toBe(`1 of 2`) // idx -1 reads as the first match

    find.jump_to(1)
    expect(find.status).toBe(`2 of 2`)
    run_search(root, find, `two`)
    expect(find.status).toBe(`1 of 2`)
  })

  // Public jump_to must handle values below -length; bare `% length` stays negative.
  test.each([
    [-5, 1],
    [-1, 2],
    [4, 1],
  ])(`jump_to(%i) wraps into range`, (idx, expected) => {
    const { root, find } = setup(`<p>a x</p><p>b x</p><p>c x</p>`)
    run_search(root, find, `x`)

    find.jump_to(idx)
    expect(find.status).toBe(`${expected + 1} of 3`)
  })

  test(`refresh with no root clears the matches`, () => {
    const { root, find } = setup(`<p>alpha</p>`)
    run_search(root, find, `alpha`)
    expect(find.matches).toHaveLength(1)

    find.refresh(undefined)
    expect(find.matches).toEqual([])
    expect(find.status).toBe(`No matches`)
  })

  test(`keeps the cursor on the same element when a re-search preserves it`, () => {
    const { root, find } = setup(`<p>alpha one</p><p>alpha two</p><p>alpha three</p>`)
    run_search(root, find, `alpha`)
    find.jump_to(2)
    const current = find.matches[2]

    doc_query(`main p`).remove()
    find.refresh(root)
    expect(find.status).toBe(`2 of 2`)
    expect(find.matches[1]).toBe(current)
  })

  test(`clamps the cursor when its element is gone`, () => {
    const { root, find } = setup(`<p>alpha one</p><p>alpha two</p><p>alpha three</p>`)
    run_search(root, find, `alpha`)
    find.jump_to(2)

    root.querySelectorAll(`p`)[2].remove()
    find.refresh(root)
    expect(find.status).toBe(`2 of 2`)
  })

  test(`before_search runs ahead of the search, so its [hidden] writes take effect`, () => {
    const { root, find } = setup(`<p>alpha one</p><p id="two">alpha two</p>`, {
      before_search: (query) => {
        doc_query(`#two`).hidden = query === `alpha`
      },
    })

    run_search(root, find, `alpha`)
    expect(find.matches).toHaveLength(1)
  })

  test(`observe re-searches after the DOM settles and jumps to a first match`, async () => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const { root, find } = setup(`<p>nothing here</p>`)
    run_search(root, find, `late`)
    expect(find.matches).toEqual([])

    const stop = find.observe(root)
    root.append(Object.assign(document.createElement(`p`), { textContent: `late hit` }))
    await vi.advanceTimersByTimeAsync(200)

    expect(find.matches).toHaveLength(1)
    expect(jumped()).toBe(`late hit`)
    stop()
  })

  test(`swapping a mounted FindBar root replaces its highlight ownership`, async () => {
    const { registry } = stub_css_highlights()
    document.body.innerHTML =
      `<main id="first"><p>alpha first</p></main>` +
      `<main id="second"><p>alpha second</p></main><div id="bar"></div>`
    const [first_root, second_root] = [doc_query(`#first`), doc_query(`#second`)]
    const props = $state<Props>({ root: first_root, on_close: vi.fn() })
    const bar = mount(FindBar, { target: doc_query(`#bar`), props })
    onTestFinished(() => unmount(bar))
    const match_node = () =>
      (registry.get(`find-match`) as { ranges: Range[] }).ranges[0].startContainer

    await type_query(`alpha`)
    expect(first_root.contains(match_node())).toBe(true)

    props.root = second_root
    await tick()
    expect(second_root.contains(match_node())).toBe(true)
  })

  test(`a mounted FindBar stops observing and drops its highlight on unmount`, async () => {
    const { registry } = stub_css_highlights()
    const disconnect = vi.spyOn(MutationObserver.prototype, `disconnect`)
    const { root, unmount_bar } = mount_bar(`<p>alpha</p>`)
    await type_query(`alpha`)
    expect(registry.has(`find-match`)).toBe(true)

    await unmount_bar()
    await tick()
    expect(disconnect).toHaveBeenCalled()
    // Unmount must drop the highlight owner.
    expect(registry.has(`find-match`)).toBe(false)
    expect(root.isConnected).toBe(true) // the searched subtree is left alone
  })
})
