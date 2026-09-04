import JsonTreeReplacementHarness from './JsonTreeReplacementHarness.svelte'
// Component tests for JsonTree, JsonNode, and JsonValue
import { JsonTree } from '$lib'
import { serialize_for_copy } from '$lib/json-tree/utils'
import { type ComponentProps, flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, describe, expect, it, onTestFinished, test, vi } from 'vite-plus/test'

const doc_query = <ElementType extends Element = HTMLElement>(
  selector: string,
  element_type?: new () => ElementType,
): ElementType => {
  const node = document.querySelector<ElementType>(selector)
  if (element_type && !(node instanceof element_type))
    throw new Error(`Wrong element type: ${selector}`)
  if (!node) throw new Error(`Missing element ${selector}`)
  return node
}
const keydown = (key: string, init: KeyboardEventInit = {}) =>
  new KeyboardEvent(`keydown`, { key, bubbles: true, ...init })
const mouse = (type: string, init: MouseEventInit = {}) =>
  new MouseEvent(type, { bubbles: true, ...init })
const mock_clipboard_write = (error?: Error) => {
  const mock = vi.spyOn(navigator.clipboard, `writeText`)
  return error ? mock.mockRejectedValue(error) : mock.mockResolvedValue(undefined)
}

const mount_tree = (props: ComponentProps<typeof JsonTree>): void => {
  const component = mount(JsonTree, { target: document.body, props })
  onTestFinished(() => unmount(component))
  flushSync()
}

const click_and_tick = async (element: Element | null | undefined): Promise<void> => {
  if (!(element instanceof HTMLElement)) throw new Error(`element not found`)
  element.click()
  flushSync()
  await tick()
}

const fire = (target: Element | null | undefined, event: Event): void => {
  target?.dispatchEvent(event)
  flushSync()
}

const node_at = (path: string) =>
  document.querySelector<HTMLElement>(`.json-node[data-path="${CSS.escape(path)}"]`)
const tree = () => doc_query<HTMLDivElement>(`.json-tree`)
// Header button groups: [T, #], [expand all, collapse all, 1, 2, 3], [copy, download]
const control_group = (idx: number) =>
  document
    .querySelectorAll(`.controls`)
    .item(idx)
    .querySelectorAll<HTMLButtonElement>(`button`)

const match_count = () => document.querySelector(`.match-count`)?.textContent ?? ``
// Type into the search box and wait for the debounced (150 ms) search to report `expected`
async function type_search(query: string, expected: string): Promise<void> {
  const input = doc_query<HTMLInputElement>(`.search-input`)
  input.value = query
  fire(input, new Event(`input`, { bubbles: true }))
  await vi.waitFor(() => expect(match_count()).toBe(expected))
  await tick()
}

afterEach(() => vi.unstubAllGlobals())

describe(`rendering`, () => {
  it(`renders header, content and ARIA roles; spreads attributes`, () => {
    mount_tree({
      value: { nested: { a: 1 } },
      default_fold_level: 5,
      style: `max-height: 300px`,
      'data-testid': `json-tree`,
    })
    expect(tree().getAttribute(`role`)).toBe(`tree`)
    expect(tree().getAttribute(`aria-label`)).toBe(`JSON tree viewer`)
    expect(tree().dataset.testid).toBe(`json-tree`)
    expect(tree().style.maxHeight).toBe(`300px`)
    expect(document.querySelector(`.json-tree-header .search-input`)).toBeInstanceOf(
      HTMLInputElement,
    )
    expect(document.querySelectorAll(`[role="treeitem"]`)).toHaveLength(3)
    expect(node_at(``)?.getAttribute(`aria-expanded`)).toBe(`true`)
    // leaf values are clickable (copy) but carry no native tooltip
    const value_el = doc_query(`.json-value`)
    expect(value_el.getAttribute(`role`)).toBe(`button`)
    expect(value_el.getAttribute(`title`)).toBeNull()
    // keys are buttons whose text is just the key (hover hint lives in CSS ::after)
    const key = doc_query<HTMLButtonElement>(`.node-key`)
    expect(key.tagName).toBe(`BUTTON`)
    expect(key.textContent?.trim()).toBe(`"nested"`)
  })

  it(`hides header with show_header=false and labels the root with root_label`, () => {
    mount_tree({ value: [1, 2, 3], root_label: `items`, show_header: false })
    expect(document.querySelector(`.json-tree-header`)).toBeNull()
    expect(node_at(`items`)?.querySelector(`.node-key`)?.textContent).toContain(`"items"`)
  })

  it.each([
    [`hello`, `string`, `"hello"`],
    [42, `number`, `42`],
    [3.125, `number`, `3.125`],
    [true, `boolean`, `true`],
    [false, `boolean`, `false`],
    [null, `null`, `null`],
    [undefined, `undefined`, `undefined`],
    [BigInt(9007199254740991), `bigint`, `9007199254740991n`],
    [new Date(`2024-01-15T10:30:00.000Z`), `date`, `2024-01-15T10:30:00.000Z`],
    [/test/gi, `regexp`, `/test/gi`],
    [new Error(`Something failed`), `error`, `Error: Something failed`],
    [Symbol(`description`), `symbol`, `Symbol(description)`],
    [function example_fn() {}, `function`, `ƒ example_fn()`],
    [Infinity, `number`, `Infinity`],
    [-Infinity, `number`, `-Infinity`],
    [NaN, `number`, `NaN`],
    [0, `number`, `0`],
    [``, `string`, `""`],
    [6.022e23, `number`, `6.022e+23`],
    [`日本語 🚀 ∑`, `string`, `"日本語 🚀 ∑"`],
    [`<div>html</div>`, `string`, `"<div>html</div>"`],
  ])(`renders leaf %p with class %s as %p`, (value, css_class, expected) => {
    mount_tree({ value: { test: value }, show_header: false })
    const value_el = doc_query(`.json-value`)
    expect(value_el.classList.contains(css_class)).toBe(true)
    expect(value_el.textContent?.trim()).toBe(expected)
  })

  it.each([
    [`just a string`, `"just a string"`],
    [null, `null`],
  ])(`renders primitive root %p`, (value, expected) => {
    mount_tree({ value, show_header: false })
    expect(doc_query(`.json-value`).textContent?.trim()).toBe(expected)
  })

  it(`uses [] for arrays, {} for objects and sorts keys with sort_keys`, () => {
    mount_tree({
      value: { zebra: [1], apple: { a: 1 }, 'key-with-dash': 2 },
      show_header: false,
      default_fold_level: 5,
      sort_keys: true,
    })
    const brackets = Array.from(
      document.querySelectorAll(`.bracket`),
      (el) => el.textContent,
    )
    expect(brackets).toEqual([`{`, `{`, `}`, `[`, `]`, `}`])
    const keys = Array.from(document.querySelectorAll(`.node-key`), (el) =>
      el.textContent?.replaceAll(`"`, ``).trim(),
    )
    expect(keys).toEqual([`apple`, `a`, `key-with-dash`, `zebra`, `0`])
  })

  it.each([
    [{ arr: [1, 2, 3, 4, 5] }, `Array(5)`],
    [{ obj: { a: 1, b: 2 } }, `{2 keys}`],
    [{ empty: [] }, `Array(0)`],
    [{ empty: {} }, `{0 keys}`],
    [{ m: new Map([[`a`, 1]]) }, `Map(1)`],
    [{ s: new Set([1, 2, 3, 4]) }, `Set(4)`],
  ])(`collapsed %j previews as %p with a byte-size hint`, (value, expected) => {
    mount_tree({ value, show_header: false, default_fold_level: 1 })
    expect(doc_query(`.preview`).textContent?.trim()).toBe(expected)
    expect(doc_query(`.size-hint`).textContent?.trim()).toMatch(/^\d+ B$/)
  })

  it(`renders Map entries as key/value pairs and Set members by index`, () => {
    const nested = new Map([[`inner`, new Set([{ deep: true }])]])
    mount_tree({ value: { nested }, show_header: false, default_fold_level: 10 })
    expect(node_at(`nested[0].key`)?.textContent).toContain(`"inner"`)
    expect(node_at(`nested[0].value[0].deep`)?.textContent).toContain(`true`)
  })

  it(`truncates long strings behind an expand button`, async () => {
    mount_tree({
      value: { long: `a`.repeat(300) },
      show_header: false,
      max_string_length: 50,
    })
    const value_el = doc_query(`.json-value`)
    expect(value_el.textContent).toContain(`"${`a`.repeat(50)}..."`)
    await click_and_tick(document.querySelector(`.expand-btn`))
    expect(value_el.textContent).toContain(`"${`a`.repeat(300)}"`)
  })

  it.each([
    [`https://example.com`, true],
    [`not a url`, false],
  ])(`URL auto-link for %p = %s`, (text, is_link) => {
    mount_tree({ value: { link: text }, show_header: false })
    const link = document.querySelector<HTMLAnchorElement>(`.url-link`)
    expect(Boolean(link)).toBe(is_link)
    if (link) {
      expect(link.href).toBe(`https://example.com/`)
      expect(link.target).toBe(`_blank`)
      expect(link.rel).toBe(`noopener noreferrer`)
    }
  })

  it.each([`#ff0000`, `#fff`, `rgb(255, 0, 0)`, `hsl(120, 100%, 50%)`, `hello`])(
    `color swatch for %p`,
    (color) => {
      mount_tree({ value: { color }, show_header: false })
      const swatch = document.querySelector<HTMLSpanElement>(`.color-swatch`)
      expect(Boolean(swatch)).toBe(color !== `hello`)
      if (swatch) expect(swatch.style.background).not.toBe(``)
    },
  )

  it(`marks expanded nodes at depth <= 2 as sticky headers`, () => {
    mount_tree({
      value: { a: { b: { c: { d: 1 } } } },
      show_header: false,
      default_fold_level: 5,
    })
    expect(
      Array.from(document.querySelectorAll(`.sticky-header`), (el) =>
        el.getAttribute(`data-path`),
      ),
    ).toEqual([``, `a`, `a.b`])
  })
})

describe(`folding`, () => {
  it.each([
    [
      `default_fold_level`,
      { level1: { level2: { level3: `deep` } } },
      { default_fold_level: 1 },
      `{1 key}`,
    ],
    [
      `auto_fold_arrays`,
      Array.from({ length: 15 }, (_, idx) => idx),
      { auto_fold_arrays: 10 },
      `Array(15)`,
    ],
    [
      `auto_fold_objects`,
      Object.fromEntries(Array.from({ length: 25 }, (_, idx) => [`key${idx}`, idx])),
      { auto_fold_objects: 20 },
      `{25 keys}`,
    ],
  ])(
    `%s collapses nodes and the toggle re-expands them`,
    async (_name, value, props, preview) => {
      mount_tree({ value, show_header: false, default_fold_level: 5, ...props })
      const collapsed = doc_query(`.json-node.collapsed`)
      const own_preview = () =>
        collapsed.querySelector(`:scope > .node-content > .preview`)
      expect(collapsed.getAttribute(`aria-expanded`)).toBe(`false`)
      expect(own_preview()?.textContent?.trim()).toBe(preview)

      await click_and_tick(collapsed.querySelector(`.collapse-toggle`))
      expect(collapsed.getAttribute(`aria-expanded`)).toBe(`true`)
      expect(own_preview()).toBeNull()
    },
  )

  // 250 children: a first page, a second full page, then a 50-entry remainder
  const wide = (prefix: string) =>
    Object.fromEntries(
      Array.from({ length: 250 }, (_, idx) => [`key${idx}`, `${prefix}${idx}`]),
    )
  const rendered_children = () =>
    document.querySelectorAll(`.json-tree-content > .json-node > .children > .json-node`)
      .length
  const more_labels = () =>
    [...document.querySelectorAll(`.more-children button`)].map((btn) =>
      btn.textContent?.trim(),
    )

  it(`mounts long containers in pages of 100 that grow by a page or to the whole list`, async () => {
    mount_tree({ value: wide(`v`), default_fold_level: 5, auto_fold_objects: Infinity })
    expect(rendered_children()).toBe(100)
    expect(more_labels()).toEqual([`Show 100 more`, `Show all 250`])
    // the last rendered child is not the container's last, so it keeps its comma
    expect(node_at(`key99`)?.querySelector(`.comma`)).not.toBeNull()

    await click_and_tick(document.querySelector(`.more-children button`))
    expect(rendered_children()).toBe(200)
    expect(more_labels()).toEqual([`Show 50 more`])

    await click_and_tick(document.querySelector(`.more-children button`))
    expect(rendered_children()).toBe(250)
    expect(more_labels()).toEqual([])
    expect(node_at(`key249`)?.querySelector(`.comma`)).toBeNull()
  })

  it.each([``, `data.json`, `my-file[raw]`])(
    `reveals paginated search matches in %s`,
    async (root_label) => {
      mount_tree({
        value: { ...wide(`val`), key230: { target: `val230` } },
        root_label,
        default_fold_level: 1,
        auto_fold_objects: Infinity,
      })
      const match_path = `${root_label ? `${root_label}.` : ``}key230.target`
      expect(node_at(match_path)).toBeNull()
      await type_search(`val230`, `1 of 1`)
      expect(node_at(match_path)?.classList.contains(`current-match`)).toBe(true)
      expect(rendered_children()).toBe(231)
      expect(more_labels()).toEqual([`Show 19 more`])
    },
  )

  it(`clicking a collapsed key expands it, clicking an expanded key copies its value`, async () => {
    const write_text = mock_clipboard_write()
    mount_tree({
      value: { nested: { deep: 42 } },
      show_header: false,
      default_fold_level: 1,
    })
    expect(node_at(`nested.deep`)).toBeNull()
    expect(doc_query(`.node-key`).classList.contains(`collapsed`)).toBe(true) // ▸ hint
    await click_and_tick(doc_query(`.node-key`))
    expect(node_at(`nested.deep`)).toBeInstanceOf(HTMLElement)
    expect(doc_query(`.node-key`).classList.contains(`collapsed`)).toBe(false) // ⧉ hint
    expect(write_text).not.toHaveBeenCalled()

    await click_and_tick(doc_query(`.node-key`))
    expect(write_text).toHaveBeenCalledWith(`{\n  "deep": 42\n}`)
  })

  it(`header buttons expand all, collapse all and collapse to a level`, async () => {
    mount_tree({ value: { a: { b: { c: 1 } } }, default_fold_level: 5 })
    const [expand_all, collapse_all, level_1] = control_group(1)
    const expanded_paths = () =>
      Array.from(document.querySelectorAll(`[aria-expanded="true"]`), (el) =>
        el.getAttribute(`data-path`),
      )
    expect(expanded_paths()).toEqual([``, `a`, `a.b`])

    // the root stays open so the tree never collapses to a single preview line
    await click_and_tick(collapse_all)
    expect(expanded_paths()).toEqual([``])
    expect(doc_query(`.preview`).textContent?.trim()).toBe(`{1 key}`)

    await click_and_tick(expand_all)
    expect(expanded_paths()).toEqual([``, `a`, `a.b`])

    await click_and_tick(level_1)
    expect(expanded_paths()).toEqual([``])
  })

  it.each([
    [`expands a collapsed`, 1, [`a.b.c`, `a.d`]],
    [`collapses an expanded`, 10, []],
  ])(`double-click %s subtree`, async (_desc, default_fold_level, rendered_after) => {
    mount_tree({
      value: { a: { b: { c: 1 }, d: 2 } },
      show_header: false,
      default_fold_level,
    })
    fire(node_at(`a`), mouse(`dblclick`))
    await tick()
    expect(
      [node_at(`a.b.c`), node_at(`a.d`)].flatMap((el) => el?.dataset.path ?? []),
    ).toEqual(rendered_after)
  })

  it(`double-click on the unlabeled root toggles every descendant`, async () => {
    mount_tree({
      value: { a: { b: { c: 1 }, d: 2 } },
      show_header: false,
      default_fold_level: 10,
    })
    const root = node_at(``)
    fire(root, mouse(`dblclick`))
    await tick()
    expect(root?.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(node_at(`a`)).toBeNull()
    fire(root, mouse(`dblclick`))
    await tick()
    expect(node_at(`a`)?.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(node_at(`a.b.c`)).toBeInstanceOf(HTMLElement)
  })

  it(`⊟ collapses children while keeping the node itself open`, async () => {
    mount_tree({
      value: { outer: { inner: { deep: 1 } } },
      show_header: false,
      default_fold_level: 5,
    })
    expect(doc_query(`.collapse-level-btn`).textContent?.trim()).toBe(`⊟`)
    await click_and_tick(node_at(`outer`)?.querySelector(`.collapse-level-btn`))
    expect(node_at(`outer`)?.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(node_at(`outer.inner`)?.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(node_at(`outer.inner.deep`)).toBeNull()
  })

  it(`honors a bound plain Set of collapsed_paths and keeps tracking after toggles`, async () => {
    const collapsed = new Set([`nested`])
    mount_tree({
      value: { nested: { a: 1 }, other: { b: 2 } },
      show_header: false,
      collapsed_paths: collapsed,
      default_fold_level: 5,
    })
    expect(node_at(`nested`)?.classList.contains(`collapsed`)).toBe(true)
    expect(node_at(`other`)?.classList.contains(`collapsed`)).toBe(false)
    await click_and_tick(node_at(`other`)?.querySelector(`.collapse-toggle`))
    expect(node_at(`other`)?.classList.contains(`collapsed`)).toBe(true)
    await click_and_tick(node_at(`nested`)?.querySelector(`.collapse-toggle`))
    expect(node_at(`nested`)?.classList.contains(`collapsed`)).toBe(false)
  })

  it(`preserves search state and prunes invalid collapsed paths on value replacement`, async () => {
    mount(JsonTreeReplacementHarness, { target: document.body })
    flushSync()
    const collapsed_count = () => doc_query(`[data-testid="collapsed-count"]`).textContent
    await type_search(`findme`, `1 of 1`)
    const search_input = doc_query<HTMLInputElement>(`.search-input`)
    expect(search_input.value).toBe(`findme`)

    await click_and_tick(doc_query(`[data-testid="replace-json"]`))
    expect(search_input.value).toBe(`findme`)
    expect(document.querySelector(`.json-value.changed`)).toBeNull()

    await click_and_tick(node_at(`nested`)?.querySelector(`.collapse-toggle`))
    expect(collapsed_count()).toBe(`1`)
    await click_and_tick(doc_query(`[data-testid="replace-flat-json"]`))
    expect(collapsed_count()).toBe(`0`)
  })

  // The un-flash timer hung off an effect cleanup rerunning on every ctx.settings change, so a
  // toggle mid-flash cancelled it without rescheduling and the node stayed highlighted
  it(`un-flashes a changed value even when a setting is toggled mid-flash`, async () => {
    vi.useFakeTimers()
    onTestFinished(() => void vi.useRealTimers())
    mount(JsonTreeReplacementHarness, { target: document.body })
    flushSync()
    const flashing = () => document.querySelector(`.json-value.changed`)
    await click_and_tick(doc_query(`[data-testid="mutate-leaf"]`))
    expect(flashing()).not.toBeNull()
    vi.advanceTimersByTime(500)
    await click_and_tick(control_group(0)[0]) // T: show data types
    expect(flashing()).not.toBeNull()
    vi.advanceTimersByTime(600)
    flushSync()
    expect(flashing()).toBeNull()
  })
})

describe(`header toggles`, () => {
  it(`T toggles type annotations and # toggles array indices`, async () => {
    mount_tree({ value: [`a`, `b`, `c`], default_fold_level: 5 })
    const [type_toggle, index_toggle] = control_group(0)
    expect([type_toggle.textContent, index_toggle.textContent]).toEqual([`T`, `#`])
    expect(document.querySelectorAll(`.type-annotation`)).toHaveLength(0)
    expect(document.querySelectorAll(`.array-index .index`)).toHaveLength(3)

    await click_and_tick(type_toggle)
    await click_and_tick(index_toggle)
    expect(type_toggle.classList.contains(`active`)).toBe(true)
    expect(index_toggle.classList.contains(`active`)).toBe(false)
    expect(document.querySelectorAll(`.type-annotation`)).toHaveLength(3)
    expect(document.querySelectorAll(`.array-index .index`)).toHaveLength(0)
  })

  it(`respects initial show_data_types / show_array_indices`, () => {
    mount_tree({ value: { a: 1 }, show_data_types: true, show_array_indices: false })
    const [type_toggle, index_toggle] = control_group(0)
    expect(type_toggle.classList.contains(`active`)).toBe(true)
    expect(index_toggle.classList.contains(`active`)).toBe(false)
  })
})

describe(`copy and download`, () => {
  it(`copy-all writes the JSON, shows feedback and fires on_copy`, async () => {
    const write_text = mock_clipboard_write()
    const on_copy = vi.fn()
    const value = { name: `test`, count: 42, nested: { a: 1 } }
    mount_tree({ value, on_copy })
    const [copy_btn] = control_group(2)

    await click_and_tick(copy_btn)
    const copied_text = write_text.mock.calls[0][0]
    expect(JSON.parse(copied_text)).toEqual(value)
    expect(doc_query(`.copy-feedback`).textContent).toBe(`Copied!`)
    expect(on_copy).toHaveBeenCalledWith(`[root]`, copied_text)
  })

  it(`shows error feedback when the clipboard write fails`, async () => {
    const write_text = mock_clipboard_write(new Error(`Clipboard error`))
    mount_tree({ value: { a: 1 } })
    control_group(2)[0].click()
    await vi.waitFor(() => expect(write_text).toHaveBeenCalled())
    flushSync()
    await tick()
    expect(doc_query(`.copy-feedback.error`).textContent).toBe(`Copy failed`)
  })

  it.each([
    [{ name: `test`, count: 42 }, undefined, /^data-\d{4}-\d{2}-\d{2}\.json$/, true],
    [{ a: 1 }, `my-custom-data.json`, /^my-custom-data\.json$/, false],
    [`string value`, undefined, /^data-/, false],
  ])(`downloads %j as %s`, async (value, download_filename, filename_re, override) => {
    vi.useFakeTimers()
    onTestFinished(() => {
      vi.useRealTimers()
    })
    const mock_download = vi.fn()
    if (override) vi.stubGlobal(`download`, mock_download)
    const create_url = vi.spyOn(URL, `createObjectURL`).mockReturnValue(`blob:download`)
    const revoke_url = vi.spyOn(URL, `revokeObjectURL`).mockImplementation(() => {})
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, `click`)
      .mockImplementation(() => {})
    mount_tree({ value, download_filename })
    await click_and_tick(control_group(2)[1])
    const blob = create_url.mock.calls[0]?.[0] as Blob | undefined
    const [data, filename, mime_type] = override
      ? mock_download.mock.calls[0]
      : [
          await blob?.text(),
          (click.mock.instances[0] as HTMLAnchorElement).download,
          blob?.type,
        ]
    expect(data).toBe(serialize_for_copy(value))
    expect(filename).toMatch(filename_re)
    expect(mime_type).toBe(`application/json`)
    expect(revoke_url).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(0)
    expect(revoke_url).toHaveBeenCalledTimes(override ? 0 : 1)
    if (!override) expect(revoke_url).toHaveBeenCalledWith(`blob:download`)
  })

  it(`clicking a value copies it with inline feedback and fires on_copy`, async () => {
    const write_text = mock_clipboard_write()
    const on_copy = vi.fn()
    mount_tree({ value: { name: `test` }, show_header: false, on_copy })
    fire(doc_query(`.json-value`), mouse(`click`, { clientX: 40, clientY: 60 }))
    await vi.waitFor(() => expect(on_copy).toHaveBeenCalledWith(`name`, `test`))
    flushSync()
    expect(write_text).toHaveBeenCalledWith(`test`)
    const feedback = doc_query(`.copy-feedback`)
    expect(feedback.textContent?.trim()).toBe(`Copied!`)
    expect(feedback.style.left).toBe(`40px`)
  })

  it(`Shift+click and middle-click on a key or node row copy only that path`, async () => {
    const write_text = mock_clipboard_write()
    mount_tree({
      value: { my_key: { inner: 1 } },
      show_header: false,
      default_fold_level: 5,
    })
    fire(
      node_at(`my_key.inner`)?.querySelector(`.node-key`),
      mouse(`click`, { shiftKey: true }),
    )
    fire(node_at(`my_key`)?.querySelector(`.node-key`), mouse(`auxclick`, { button: 1 }))
    // middle-click on the nested row itself must not bubble into ancestor rows (which would
    // overwrite the clipboard with their paths)
    fire(node_at(`my_key.inner`), mouse(`auxclick`, { button: 1 }))
    await tick()
    expect(write_text.mock.calls.map(([text]) => text)).toEqual([
      `my_key.inner`,
      `my_key`,
      `my_key.inner`,
    ])
  })
})

describe(`search`, () => {
  it(`shows match navigation with wrap-around, clamps when results shrink, Escape clears`, async () => {
    mount_tree({ value: { bar: 1, baz: 2, bat: 3, foo: 4 }, default_fold_level: 5 })
    expect(document.querySelector(`.match-nav`)).toBeNull()

    await type_search(`ba`, `1 of 3`)
    const [prev_btn, next_btn] = document.querySelectorAll<HTMLButtonElement>(`.nav-btn`)
    expect(doc_query(`.current-match`).dataset.path).toBe(`bar`)

    await click_and_tick(next_btn)
    expect(match_count()).toBe(`2 of 3`)
    expect(doc_query(`.current-match`).dataset.path).toBe(`baz`)
    await click_and_tick(next_btn)
    await click_and_tick(next_btn)
    expect(match_count()).toBe(`1 of 3`)
    await click_and_tick(prev_btn)
    expect(match_count()).toBe(`3 of 3`)

    await type_search(`bat`, `1 of 1`)
    expect(doc_query(`.current-match`).dataset.path).toBe(`bat`)

    const input = doc_query<HTMLInputElement>(`.search-input`)
    fire(input, keydown(`Escape`))
    await tick()
    expect(input.value).toBe(``)
    expect(document.querySelector(`.match-nav`)).toBeNull()
    expect(document.querySelector(`.current-match`)).toBeNull()
  })

  it.each([
    [`F3`, false, `tree`, `2 of 3`],
    [`F3`, true, `tree`, `3 of 3`],
    [`Enter`, false, `input`, `2 of 3`],
    [`Enter`, true, `input`, `3 of 3`],
  ])(`%s (shift=%s) on the %s steps matches`, async (key, shiftKey, target, expected) => {
    mount_tree({ value: { bar: 1, baz: 2, bat: 3 }, default_fold_level: 5 })
    await type_search(`ba`, `1 of 3`)
    fire(
      target === `tree` ? tree() : doc_query(`.search-input`),
      keydown(key, { shiftKey }),
    )
    await tick()
    expect(match_count()).toBe(expected)
  })

  it(`expands collapsed ancestors to reveal matches and re-reveals them on navigation`, async () => {
    const scroll_into_view = vi.fn()
    Element.prototype.scrollIntoView = scroll_into_view
    mount_tree({
      value: { outer: { inner: { target: `findme` } }, other: { target: `findme too` } },
      default_fold_level: 1,
    })
    expect(node_at(`outer.inner.target`)).toBeNull()

    await type_search(`findme`, `1 of 2`)
    expect(node_at(`outer.inner.target`)?.classList.contains(`current-match`)).toBe(true)
    expect(node_at(`other.target`)).toBeInstanceOf(HTMLElement)
    expect(scroll_into_view).toHaveBeenCalledTimes(1)

    // Collapsing a match's ancestor hides it; stepping to it expands the ancestor again
    await click_and_tick(node_at(`other`)?.querySelector(`.collapse-toggle`))
    expect(node_at(`other.target`)).toBeNull()
    fire(tree(), keydown(`F3`))
    await tick()
    expect(match_count()).toBe(`2 of 2`)
    expect(node_at(`other.target`)?.classList.contains(`current-match`)).toBe(true)
    await vi.waitFor(() => expect(scroll_into_view).toHaveBeenCalledTimes(2))
  })

  // The search box sits inside the div carrying the tree's keydown handler, so arrows typed
  // there yanked focus onto a tree node and Ctrl/Cmd+C copied the selection
  it(`leaves keys typed in the search box to the input`, async () => {
    const write_text = mock_clipboard_write()
    mount_tree({ value: { bar: 1, baz: 2, bat: 3 }, default_fold_level: 5 })
    fire(node_at(`bar`), mouse(`click`, { ctrlKey: true }))
    const input = doc_query<HTMLInputElement>(`.search-input`)
    input.focus()
    for (const key of [`ArrowLeft`, `ArrowRight`, `ArrowDown`, `ArrowUp`]) {
      fire(input, keydown(key))
      expect(document.activeElement).toBe(input)
    }
    fire(input, keydown(`c`, { ctrlKey: true }))
    await tick()
    expect(write_text).not.toHaveBeenCalled()
    // F3 stays global, so it still steps matches while the box has focus
    await type_search(`ba`, `1 of 3`)
    fire(input, keydown(`F3`))
    await tick()
    expect(match_count()).toBe(`2 of 3`)
  })
})

describe(`keyboard navigation and selection`, () => {
  it(`arrow keys walk nodes in DOM order (clamped), breadcrumb shows the path, on_select fires`, async () => {
    const on_select = vi.fn()
    mount_tree({
      value: { a: { b: 1 }, c: 2 },
      show_header: false,
      default_fold_level: 5,
      on_select,
    })
    const focused_path = () =>
      document.querySelector<HTMLElement>(`.json-node.focused`)?.dataset.path
    fire(tree(), keydown(`ArrowDown`))
    expect(focused_path()).toBe(``)
    expect(on_select).toHaveBeenLastCalledWith(``, { a: { b: 1 }, c: 2 })
    for (const _ of [1, 2, 3, 4]) fire(tree(), keydown(`ArrowDown`))
    expect(focused_path()).toBe(`c`)
    expect(on_select).toHaveBeenLastCalledWith(`c`, 2)
    await tick()
    expect(doc_query(`.path-breadcrumb`).textContent?.trim()).toBe(`c`)
    expect(document.activeElement).toBe(node_at(`c`))
    fire(tree(), keydown(`ArrowUp`))
    fire(tree(), keydown(`ArrowUp`))
    expect(focused_path()).toBe(`a`)
    expect(on_select).toHaveBeenLastCalledWith(`a`, { b: 1 })
  })

  it(`click focuses only the clicked node and on_select resolves Map entry paths through their wrapper`, async () => {
    const on_select = vi.fn()
    const value = { m: new Map([[`k`, { deep: `v` }]]) }
    mount_tree({ value, default_fold_level: 10, on_select })
    await click_and_tick(node_at(`m[0].value.deep`))
    // the click must not bubble into ancestor rows, which would re-focus each of them in
    // turn (ending on the root) and fire on_select once per ancestor
    expect(on_select).toHaveBeenCalledTimes(1)
    expect(on_select).toHaveBeenCalledWith(`m[0].value.deep`, `v`)
    expect(doc_query(`.path-breadcrumb`).textContent?.trim()).toBe(`m[0].value.deep`)
    expect(document.querySelectorAll(`.json-node.focused`)).toHaveLength(1)
    await click_and_tick(node_at(`m[0]`))
    expect(on_select).toHaveBeenCalledTimes(2)
    expect(on_select).toHaveBeenLastCalledWith(`m[0]`, { key: `k`, value: { deep: `v` } })
  })

  it(`focused node: Enter/Space copy leaves and toggle containers, arrows fold/unfold`, async () => {
    const write_text = mock_clipboard_write()
    mount_tree({
      value: { key: 42, obj: { a: 1 } },
      show_header: false,
      default_fold_level: 5,
    })
    fire(tree(), keydown(`ArrowDown`))
    fire(tree(), keydown(`ArrowDown`))
    const leaf = node_at(`key`)
    expect(leaf?.classList.contains(`focused`)).toBe(true)
    fire(leaf, keydown(`Enter`))
    await vi.waitFor(() => expect(write_text).toHaveBeenCalledWith(`42`))

    fire(tree(), keydown(`ArrowDown`))
    const container = node_at(`obj`)
    fire(container, keydown(`ArrowLeft`))
    expect(container?.getAttribute(`aria-expanded`)).toBe(`false`)
    fire(container, keydown(`ArrowRight`))
    expect(container?.getAttribute(`aria-expanded`)).toBe(`true`)
    fire(container, keydown(` `))
    expect(container?.getAttribute(`aria-expanded`)).toBe(`false`)
    fire(container, keydown(`c`, { ctrlKey: true }))
    await vi.waitFor(() => expect(write_text).toHaveBeenCalledWith(`{\n  "a": 1\n}`))
  })

  it(`Ctrl+click toggles selection, Shift extends a range, Ctrl+C copies all, Escape clears`, async () => {
    const write_text = mock_clipboard_write()
    mount_tree({
      value: { a: 1, b: 2, c: 3, d: 4 },
      show_header: false,
      default_fold_level: 5,
    })
    const selected = () =>
      Array.from(
        document.querySelectorAll<HTMLElement>(`.json-node.selected`),
        (el) => el.dataset.path,
      )
    fire(node_at(`b`), mouse(`click`, { ctrlKey: true }))
    expect(selected()).toEqual([`b`])
    expect(node_at(`b`)?.getAttribute(`aria-selected`)).toBe(`true`)
    fire(node_at(`d`), mouse(`click`, { ctrlKey: true, shiftKey: true }))
    expect(selected()).toEqual([`b`, `c`, `d`])
    fire(node_at(`c`), mouse(`click`, { metaKey: true }))
    expect(selected()).toEqual([`b`, `d`])

    fire(tree(), keydown(`c`, { ctrlKey: true }))
    await vi.waitFor(() => expect(write_text).toHaveBeenCalledWith(`2\n4`))

    fire(tree(), keydown(`Escape`))
    expect(selected()).toEqual([])
  })
})

describe(`context menu and pinning`, () => {
  const open_menu = async (target: Element | null, init: MouseEventInit = {}) => {
    fire(target, mouse(`contextmenu`, init))
    await tick()
    return doc_query(`.context-menu`)
  }
  const menu_button = (label: string) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>(`.context-menu button`)).find(
      (btn) => btn.textContent?.includes(label),
    ) ?? null

  it(`opens on nodes and leaf values, clamps to the viewport, closes on backdrop or Escape`, async () => {
    vi.stubGlobal(`innerWidth`, 100)
    vi.stubGlobal(`innerHeight`, 100)
    mount_tree({ value: { key: { a: 1 } }, show_header: false, default_fold_level: 5 })
    let menu = await open_menu(node_at(`key`), { clientX: 100, clientY: 200 })
    expect(menu.textContent).toContain(`Collapse all children`)
    expect(menu.textContent).toContain(`Pin this path`)
    expect([menu.style.left, menu.style.top]).toEqual([`0px`, `0px`])
    await click_and_tick(doc_query(`.context-menu-backdrop`))
    expect(document.querySelector(`.context-menu`)).toBeNull()

    menu = await open_menu(doc_query(`.json-value`))
    expect(menu.textContent).toContain(`Copy value`)
    expect(menu.textContent).toContain(`Copy path`)
    expect(menu.textContent).not.toContain(`children`)
    fire(tree(), keydown(`Escape`))
    await tick()
    expect(document.querySelector(`.context-menu`)).toBeNull()
  })

  it(`copies value/path and folds children from the menu`, async () => {
    const write_text = mock_clipboard_write()
    mount_tree({
      value: { key: { a: { b: 1 } } },
      show_header: false,
      default_fold_level: 5,
    })
    await open_menu(node_at(`key`))
    await click_and_tick(menu_button(`Copy path`))
    await open_menu(node_at(`key.a.b`))
    await click_and_tick(menu_button(`Copy value`))
    await vi.waitFor(() =>
      expect(write_text.mock.calls.map(([text]) => text)).toEqual([`key`, `1`]),
    )

    await open_menu(node_at(`key`))
    await click_and_tick(menu_button(`Collapse all children`))
    expect(node_at(`key`)?.getAttribute(`aria-expanded`)).toBe(`true`)
    expect(node_at(`key.a`)?.getAttribute(`aria-expanded`)).toBe(`false`)
    expect(node_at(`key.a.b`)).toBeNull()
    await open_menu(node_at(``))
    await click_and_tick(menu_button(`Collapse all children`))
    expect(node_at(`key`)?.getAttribute(`aria-expanded`)).toBe(`false`)
    await open_menu(node_at(`key`))
    await click_and_tick(menu_button(`Expand all children`))
    expect(node_at(`key.a.b`)).toBeInstanceOf(HTMLElement)
  })

  it(`pins paths into a panel that copies, unpins and clears`, async () => {
    const write_text = mock_clipboard_write()
    mount_tree({
      value: { a: 1, b: { c: 2 } },
      show_header: false,
      default_fold_level: 5,
    })
    await open_menu(node_at(`a`))
    await click_and_tick(menu_button(`Pin this path`))
    await open_menu(node_at(`b`))
    await click_and_tick(menu_button(`Pin this path`))
    const panel = doc_query(`.pinned-panel`)
    expect(panel.textContent).toContain(`Pinned (2)`)
    expect(
      Array.from(panel.querySelectorAll(`.pinned-value`), (el) => el.textContent),
    ).toEqual([`1`, `{1 key}`])
    await open_menu(node_at(`a`))
    expect(menu_button(`Unpin this path`)).toBeInstanceOf(HTMLButtonElement)
    await click_and_tick(menu_button(`Unpin this path`))
    expect(panel.textContent).toContain(`Pinned (1)`)

    await click_and_tick(panel.querySelector(`.pinned-path`))
    await vi.waitFor(() => expect(write_text).toHaveBeenCalledWith(`{\n  "c": 2\n}`))
    await click_and_tick(panel.querySelector(`.unpin-btn`))
    expect(document.querySelector(`.pinned-panel`)).toBeNull()
  })
})

describe(`diff mode`, () => {
  it.each([
    [`added`, { a: 1, b: 2 }, { a: 1 }, `b`],
    [`changed`, { a: 99 }, { a: 1 }, `a`],
  ])(`highlights %s values`, (status, value, compare_value, path) => {
    mount_tree({ value, compare_value, show_header: false, default_fold_level: 5 })
    expect(node_at(path)?.classList.contains(`diff-${status}`)).toBe(true)
  })

  it.each([``, `data.json`, `my-file`, `data[raw]`, `quote"\\file`])(
    `shows removed children under verbatim root label %s`,
    (root_label) => {
      mount_tree({
        value: { nested: { a: 1 } },
        compare_value: { nested: { a: 1, removed_key: `gone` }, removed: 2 },
        root_label,
        show_header: false,
        default_fold_level: 5,
      })
      const ghost = doc_query(`.json-node .json-node .ghost`)
      expect(ghost.textContent).toContain(`removed_key`)
      expect(ghost.textContent).toContain(`"gone"`)
      expect(ghost.dataset.path).toBe(
        `${root_label ? `${root_label}.` : ``}nested.removed_key`,
      )
      expect(document.querySelectorAll(`.ghost`)).toHaveLength(2)

      document.body.innerHTML = ``
      mount_tree({ value: { a: 1, b: 2 }, show_header: false, default_fold_level: 5 })
      expect(
        document.querySelector(`.diff-added, .diff-changed, .diff-removed, .ghost`),
      ).toBeNull()
    },
  )
})

describe(`inline editing`, () => {
  test.each([1, `1`, `null`, `true`, ``, ` 123 `, null, true, -0])(
    `leaves %j unchanged on blur, commits changed text, and cancels on Escape`,
    async (original) => {
      const on_change = vi.fn()
      mount_tree({
        value: { n: original, s: `x` },
        show_header: false,
        default_fold_level: 5,
        editable: true,
        on_change,
      })
      fire(node_at(`n`)?.querySelector(`.json-value`), mouse(`dblclick`))
      await tick()
      fire(doc_query(`.edit-input`), new FocusEvent(`blur`))
      expect(on_change).not.toHaveBeenCalled()
      fire(node_at(`n`)?.querySelector(`.json-value`), mouse(`dblclick`))
      await tick()
      const input = doc_query<HTMLInputElement>(`.edit-input`)
      input.value = `42`
      fire(input, new Event(`input`, { bubbles: true }))
      fire(input, keydown(`Enter`))
      expect(on_change).toHaveBeenCalledWith(`n`, 42, original)

      fire(node_at(`s`)?.querySelector(`.json-value`), mouse(`dblclick`))
      await tick()
      fire(doc_query(`.edit-input`), keydown(`Escape`))
      expect(document.querySelector(`.edit-input`)).toBeNull()
      expect(on_change).toHaveBeenCalledTimes(1)
    },
  )

  test.each([
    undefined,
    123n,
    new Date(),
    /regex/,
    Symbol(`value`),
    new Error(`value`),
    () => 1,
    NaN,
    Infinity,
    -Infinity,
  ])(`does not offer inline editing for %s`, (value) => {
    const on_change = vi.fn()
    mount_tree({ value, editable: true, on_change })
    const leaf = doc_query(`.json-value`)
    expect(leaf.title).toBe(``)
    fire(leaf, mouse(`dblclick`))
    expect(document.querySelector(`.edit-input`)).toBeNull()
    expect(on_change).not.toHaveBeenCalled()
  })

  test(`a value update inside the click-to-copy delay does not cancel the pending copy`, async () => {
    mock_clipboard_write()
    const on_copy = vi.fn()
    mount(JsonTreeReplacementHarness, {
      target: document.body,
      props: { editable: true, on_change: vi.fn(), on_copy },
    })
    flushSync()
    fire(node_at(`nested.findme`)?.querySelector(`.json-value`), mouse(`click`))
    // live data: the leaf re-renders with a new value before the 250 ms copy delay elapses
    await click_and_tick(doc_query(`[data-testid="replace-json"]`))
    await vi.waitFor(() => expect(on_copy).toHaveBeenCalledWith(`nested.findme`, `new`))
  })
})

describe(`unmount`, () => {
  test(`pending search debounce and copy feedback timers are cleared`, async () => {
    vi.useFakeTimers()
    try {
      mock_clipboard_write()
      const component = mount(JsonTree, {
        target: document.body,
        props: { value: { a: 1 } },
      })
      flushSync()
      const input = doc_query<HTMLInputElement>(`.search-input`)
      input.value = `a`
      fire(input, new Event(`input`, { bubbles: true }))
      control_group(2)[0].click()
      await vi.advanceTimersByTimeAsync(0) // let the clipboard promise resolve and arm the timer
      flushSync()
      expect(doc_query(`.copy-feedback`).textContent).toBe(`Copied!`)
      expect(vi.getTimerCount()).toBe(2)
      await unmount(component)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })
})
