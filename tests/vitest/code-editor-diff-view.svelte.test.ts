import {
  DiffView,
  editor_line_height,
  EMPHASIS_BIT,
  set_diff_backend,
  TOKEN_CLASS_NAMES,
} from '$lib/code-editor'
import type {
  DiffHunk,
  DiffLine,
  DiffResult,
  DiffRow,
  DiffTextArgs,
  DiffViewOptions,
  RowKind,
  SpanList,
  TokenClassName,
} from '$lib/code-editor'
import { flushSync, mount, unmount } from 'svelte'
import { SvelteSet } from 'svelte/reactivity'
import { describe, expect, onTestFinished, test, vi } from 'vite-plus/test'

const DEFAULT_OPTIONS: DiffViewOptions = {
  font_size: 13,
  context_lines: 3,
  layout: `side-by-side`,
}
const ROW_HEIGHT = editor_line_height(DEFAULT_OPTIONS.font_size)

const packed = (class_name: TokenClassName, emphasized = false): number =>
  TOKEN_CLASS_NAMES.indexOf(class_name) | (emphasized ? EMPHASIS_BIT : 0)

const diff_line = (lineNo: number, text: string, spans: SpanList = []): DiffLine => ({
  lineNo,
  text,
  spans,
})

const diff_row = (
  kind: RowKind,
  old: DiffLine | null,
  new_line: DiffLine | null,
): DiffRow => ({ kind, old, new: new_line })

const hunk_of = (rows: DiffRow[], overrides: Partial<DiffHunk> = {}): DiffHunk => ({
  oldStart: rows.find((row) => row.old)?.old?.lineNo ?? 1,
  newStart: rows.find((row) => row.new)?.new?.lineNo ?? 1,
  skippedBefore: 0,
  rows,
  ...overrides,
})

const diff_result = (overrides: Partial<DiffResult> = {}): DiffResult => ({
  hunks: [],
  added: 0,
  removed: 0,
  language: `Rust`,
  oldLineCount: 0,
  newLineCount: 0,
  skippedAfter: 0,
  oldEndsWithNewline: true,
  newEndsWithNewline: true,
  truncated: false,
  ...overrides,
})

const rows_result = (rows: DiffRow[], overrides: Partial<DiffResult> = {}): DiffResult =>
  diff_result({ hunks: [hunk_of(rows)], oldLineCount: 1, newLineCount: 1, ...overrides })

const simple_change = diff_row(`replace`, diff_line(1, `a`), diff_line(1, `a-changed`))

interface MountOptions {
  old_text?: string
  new_text?: string
  options?: DiffViewOptions
  single_col?: boolean
  on_error?: (message: string) => void
  use_default_backend?: boolean
  rejects_with?: unknown
  no_backend?: boolean
}

const flush_async = async (
  ready_selector = `.diff-view[aria-busy='false']`,
): Promise<void> => {
  flushSync()
  await Promise.resolve()
  await vi.waitFor(() => {
    expect(document.querySelector(ready_selector)).not.toBeNull()
  })
  flushSync()
}

// oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- callers name the DOM subtype
const query_element = <ElementType extends Element = HTMLElement>(
  selector: string,
): ElementType => {
  const element = document.querySelector<ElementType>(selector)
  if (!element) throw new Error(`${selector} not found`)
  return element
}

const query_by_text = (selector: string, text: string): Element => {
  const element = [...document.querySelectorAll(selector)].find((candidate) =>
    candidate.textContent?.includes(text),
  )
  if (!element) throw new Error(`${selector} with text ${JSON.stringify(text)} not found`)
  return element
}

const mount_diff = async (
  result: DiffResult,
  {
    use_default_backend = false,
    no_backend = false,
    rejects_with,
    options = DEFAULT_OPTIONS,
    ...rest
  }: MountOptions = {},
) => {
  const diff_text = vi.fn(async (_args: DiffTextArgs) => {
    // oxlint-disable-next-line typescript/only-throw-error
    if (rejects_with !== undefined) throw rejects_with
    return result
  })
  if (use_default_backend) {
    set_diff_backend({ diff_text })
    onTestFinished(() => {
      set_diff_backend(null)
    })
  }
  const props = {
    old_text: ``,
    new_text: ``,
    filename: `main.rs`,
    options,
    ...(use_default_backend || no_backend ? {} : { backend: { diff_text } }),
    ...rest,
  }
  const instance = mount(DiffView, { target: document.body, props })
  onTestFinished(() => unmount(instance))
  await flush_async()
  return diff_text
}

const text_of = (element: Element | null): string => element?.textContent ?? ``

const side_text = (root: ParentNode, side: string): string =>
  text_of(root.querySelector(`.code[data-side='${side}']`))

const code_texts = (): string[] =>
  [...document.querySelectorAll(`.code[data-side]`)].map((cell) => text_of(cell))

const click = async (element: Element): Promise<void> => {
  ;(element as HTMLElement).click()
  await flush_async()
}

describe(`rows and layouts`, () => {
  test(`renders aligned split rows with syntax and intra-line emphasis`, async () => {
    const spans = [0, packed(`plain`), 2, packed(`variable`, true), 7, packed(`plain`)]
    const rows = [
      diff_row(`equal`, diff_line(3, `context`), diff_line(1, `context`)),
      diff_row(
        `replace`,
        diff_line(4, `  alpha beta`, spans),
        diff_line(2, `  gamma beta`, spans),
      ),
      diff_row(`delete`, diff_line(5, `removed`), null),
      diff_row(`insert`, null, diff_line(3, `added`)),
    ]
    await mount_diff(
      rows_result(rows, {
        added: 2,
        removed: 2,
        language: `Python`,
        oldLineCount: 5,
        newLineCount: 3,
        truncated: true,
      }),
    )

    const summary = query_element(`.panel-summary`)
    expect(summary.textContent).toContain(`Python`)
    expect(text_of(summary.querySelector(`.added`))).toBe(`+2`)
    expect(text_of(summary.querySelector(`.removed`))).toBe(`-2`)
    expect(query_element(`[data-note='truncated']`).textContent).toContain(`still exact`)
    const visual_rows = [...document.querySelectorAll(`.diff-row.pair`)]
    expect(visual_rows).toHaveLength(4)
    expect([...visual_rows[1].querySelectorAll(`.gutter`)].map(text_of)).toEqual([
      `4`,
      `2`,
    ])
    expect(side_text(visual_rows[1], `old`)).toBe(`  alpha beta`)
    expect(side_text(visual_rows[1], `new`)).toBe(`  gamma beta`)
    expect(text_of(query_element(`.diff-row-delete .tok-emph`))).toBe(`alpha`)
    expect(text_of(query_element(`.diff-row-insert .tok-emph`))).toBe(`gamma`)
    expect(query_element(`[data-spacer='new']`)).toBeDefined()
    expect(query_element(`[data-spacer='old']`)).toBeDefined()
  })

  test(`toggles between unified and split without duplicating context`, async () => {
    const rows = [
      diff_row(`equal`, diff_line(1, `keep me`), diff_line(1, `keep me`)),
      diff_row(`replace`, diff_line(2, `was here`), diff_line(2, `is here`)),
      diff_row(`delete`, diff_line(3, `dropped`), null),
      diff_row(`insert`, null, diff_line(3, `arrived`)),
    ]
    const expected = new SvelteSet([
      `keep me`,
      `was here`,
      `is here`,
      `dropped`,
      `arrived`,
    ])
    await mount_diff(rows_result(rows, { oldLineCount: 3, newLineCount: 3 }), {
      options: { ...DEFAULT_OPTIONS, layout: `unified` },
    })

    expect(document.querySelectorAll(`.diff-row.unified`)).toHaveLength(5)
    expect(new SvelteSet(code_texts())).toEqual(expected)
    expect(text_of(query_element(`.diff-row-delete`))).toBe(`was here`)
    expect(text_of(query_element(`.diff-row-insert`))).toBe(`is here`)

    await click(query_element(`.segmented button[aria-pressed='false']`))
    expect(document.querySelectorAll(`.diff-row.pair`)).toHaveLength(4)
    expect(new SvelteSet(code_texts())).toEqual(expected)
    await click(query_element(`.segmented button[aria-pressed='false']`))
    expect(document.querySelectorAll(`.diff-row.unified`)).toHaveLength(5)
  })

  test(`renders created files as one untoned column`, async () => {
    const created = [
      diff_row(`insert`, null, diff_line(1, `first line`)),
      diff_row(`insert`, null, diff_line(2, `second line`)),
    ]
    await mount_diff(
      rows_result(created, {
        added: 2,
        newLineCount: 2,
        oldEndsWithNewline: false,
        newEndsWithNewline: false,
      }),
      { single_col: true, new_text: `first line\nsecond line` },
    )
    expect(code_texts()).toEqual([`first line`, `second line`])
    expect(document.querySelectorAll(`.diff-row.solo`)).toHaveLength(3)
    expect(document.querySelector(`.diff-row-delete, .diff-row-insert`)).toBeNull()
    expect(document.querySelector(`.panel-header`)).toBeNull()
    expect(document.querySelector(`[data-no-newline='old']`)).toBeNull()
    expect(text_of(query_element(`[data-no-newline='new']`))).toBe(
      String.raw`\ No newline at end of file`,
    )
  })
})

test(`elided gaps expand using source lines and remain independent`, async () => {
  const context = `one\ntwo\nthree\nfour\n`
  const row = diff_row(`replace`, diff_line(5, `old five`), diff_line(5, `new five`))
  const hunk = hunk_of([row], { oldStart: 5, newStart: 5, skippedBefore: 4 })
  await mount_diff(
    diff_result({
      hunks: [hunk],
      added: 1,
      removed: 1,
      oldLineCount: 6,
      newLineCount: 6,
      skippedAfter: 1,
    }),
    {
      old_text: `${context}old five\ntail`,
      new_text: `${context}new five\ntail`,
    },
  )

  const gaps = [...document.querySelectorAll(`.diff-gap`)]
  expect(gaps.map((gap) => text_of(gap).trim())).toEqual([
    expect.stringMatching(/4 unchanged lines$/u),
    expect.stringMatching(/1 unchanged line$/u),
  ])
  expect(gaps[0].getAttribute(`aria-expanded`)).toBe(`false`)
  await click(gaps[0])
  const expanded = query_by_text(`.diff-row.pair`, `three`)
  expect([...expanded.querySelectorAll(`.gutter`)].map(text_of)).toEqual([`3`, `3`])
  expect(document.querySelectorAll(`.diff-gap`)).toHaveLength(1)
})

test(`gap lines missing a side stay context instead of reading as edits`, async () => {
  // Four rows yield new-only `a`–`c`, then old `only one` paired with new `d`;
  // unified equal rows prefer `row.old`, so offset reconstruction omits `d`.
  const row = diff_row(`replace`, diff_line(2, `old two`), diff_line(5, `new five`))
  const hunk = hunk_of([row], { oldStart: 2, newStart: 5, skippedBefore: 4 })
  await mount_diff(
    diff_result({
      hunks: [hunk],
      added: 1,
      removed: 1,
      oldLineCount: 2,
      newLineCount: 5,
    }),
    {
      old_text: `only one\nold two`,
      new_text: `a\nb\nc\nd\nnew five`,
      options: { ...DEFAULT_OPTIONS, layout: `unified` },
    },
  )

  await click(query_element(`.diff-gap`))
  const signs_by_text = [...document.querySelectorAll(`.diff-row.unified`)].map(
    (diff_row_element) => [
      text_of(diff_row_element.querySelector(`.code`)),
      text_of(diff_row_element.querySelector(`.sign`)).trim(),
    ],
  )
  expect(signs_by_text).toEqual([
    [`a`, ``],
    [`b`, ``],
    [`c`, ``],
    [`only one`, ``],
    [`old two`, `-`],
    [`new five`, `+`],
  ])
})

test.each([
  [`old`, false, true],
  [`new`, true, false],
])(
  `marks only the %s side when its final newline is missing`,
  async (missing_side, old_ends, new_ends) => {
    await mount_diff(
      rows_result([simple_change], {
        oldEndsWithNewline: old_ends,
        newEndsWithNewline: new_ends,
      }),
    )
    const other_side = missing_side === `old` ? `new` : `old`
    expect(text_of(query_element(`[data-no-newline='${missing_side}']`))).toBe(
      String.raw`\ No newline at end of file`,
    )
    expect(document.querySelector(`[data-no-newline='${other_side}']`)).toBeNull()
  },
)

describe(`states and backend wiring`, () => {
  test(`renders an identical-input empty state`, async () => {
    await mount_diff(diff_result({ oldLineCount: 9, newLineCount: 9 }))
    expect(query_element(`[data-empty]`).textContent).toContain(`No changes`)
    expect(query_element(`[data-empty]`).textContent).toContain(`9 lines`)
    expect(
      [`Previous`, `Next`].map(
        (direction) =>
          query_element<HTMLButtonElement>(`[aria-label='${direction} change']`).disabled,
      ),
    ).toEqual([true, true])
  })

  test.each([
    [`an Error`, { rejects_with: new Error(`backend exploded`) }, `backend exploded`],
    [`a non-Error rejection`, { rejects_with: `string failure` }, `string failure`],
    [`no backend at all`, { no_backend: true }, `No DiffBackend available`],
  ])(`reports %s inline and through on_error`, async (_case, failure, message) => {
    const on_error = vi.fn()
    await mount_diff(diff_result(), { ...failure, on_error })

    expect(query_element(`[role='alert']`).textContent).toContain(message)
    expect(on_error).toHaveBeenCalledExactlyOnceWith(expect.stringContaining(message))
    expect(document.querySelector(`[data-empty]`)).toBeNull()
  })

  test(`a slow first diff cannot overwrite the result of a later one`, async () => {
    const resolvers: ((result: DiffResult) => void)[] = []
    const diff_text = vi.fn(
      (_args: DiffTextArgs) =>
        new Promise<DiffResult>((resolve) => resolvers.push(resolve)),
    )
    // Reactive props make reassignment rerun effects (hence `.svelte.test.ts`).
    const props = $state({
      old_text: `a`,
      new_text: `stale`,
      filename: `main.rs`,
      options: DEFAULT_OPTIONS,
      backend: { diff_text },
    })
    const instance = mount(DiffView, { target: document.body, props })
    onTestFinished(() => unmount(instance))
    await flush_async(`.diff-view[aria-busy='true']`)

    props.new_text = `fresh`
    flushSync()
    await vi.waitFor(() => expect(resolvers).toHaveLength(2))

    const line_result = (text: string) =>
      rows_result([diff_row(`insert`, null, diff_line(1, text))], { newLineCount: 1 })
    resolvers[1](line_result(`fresh`)) // newer request answers first
    await flush_async()
    resolvers[0](line_result(`stale`))
    await flush_async()

    expect(code_texts()).toEqual([`fresh`])
  })

  test(`uses the registered backend and forwards diff arguments once`, async () => {
    const diff_text = await mount_diff(
      diff_result({ oldLineCount: 1, newLineCount: 1 }),
      {
        old_text: `left`,
        new_text: `right`,
        options: { ...DEFAULT_OPTIONS, context_lines: 5 },
        use_default_backend: true,
      },
    )
    // The load effect must not refire on its own writes and double-diff large docs.
    expect(diff_text).toHaveBeenCalledExactlyOnceWith({
      oldText: `left`,
      newText: `right`,
      filename: `main.rs`,
      contextLines: 5,
    })
  })
})

describe(`virtualization`, () => {
  const large_result = (row_count: number): DiffResult => {
    const rows = Array.from({ length: row_count }, (_unused, idx) => {
      const line = (prefix: string) => diff_line(idx + 1, `${prefix} ${idx}`)
      return idx % 100 === 0
        ? diff_row(`replace`, line(`old`), line(`new`))
        : diff_row(`equal`, line(`line`), line(`line`))
    })
    return rows_result(rows, { oldLineCount: row_count, newLineCount: row_count })
  }

  test(`renders a bounded window and navigates to the next change`, async () => {
    await mount_diff(large_result(2000))
    const previous_change = query_element<HTMLButtonElement>(
      `[aria-label='Previous change']`,
    )
    const next_change = query_element<HTMLButtonElement>(`[aria-label='Next change']`)
    expect([previous_change.disabled, next_change.disabled]).toEqual([true, false])
    expect(document.querySelectorAll(`.diff-row`).length).toBeLessThan(100)
    expect(code_texts()).not.toContain(`old 1000`)
    expect(code_texts()).not.toContain(`new 1000`)

    const scroller = query_element<HTMLDivElement>(`.diff-scroll`)
    scroller.scrollTop = ROW_HEIGHT * 1000
    scroller.dispatchEvent(new Event(`scroll`))
    await flush_async()
    expect([previous_change.disabled, next_change.disabled]).toEqual([false, false])
    expect(code_texts()).toContain(`old 1000`)
    expect(code_texts()).not.toContain(`line 1`)

    scroller.scrollTop = ROW_HEIGHT * 1900
    scroller.dispatchEvent(new Event(`scroll`))
    await flush_async()
    expect([previous_change.disabled, next_change.disabled]).toEqual([false, true])

    scroller.scrollTop = 0
    scroller.dispatchEvent(new Event(`scroll`))
    await flush_async()
    await click(next_change)
    expect(scroller.scrollTop).toBe(ROW_HEIGHT * 100)
    expect(code_texts()).toContain(`old 100`)

    const assigned: number[] = []
    let scroll_top = 0
    Object.defineProperty(scroller, `scrollTop`, {
      configurable: true,
      get: () => scroll_top,
      set: (value: number) => {
        assigned.push(value)
        scroll_top = Math.min(value, ROW_HEIGHT * 10)
      },
    })
    scroller.dispatchEvent(new Event(`scroll`))
    await click(next_change)
    await click(next_change)

    expect(assigned).toEqual([ROW_HEIGHT * 100, ROW_HEIGHT * 100])
    expect(scroller.scrollTop).toBe(ROW_HEIGHT * 10)
  })
})
