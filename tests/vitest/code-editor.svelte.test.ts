import CodeEditor from '$lib/code-editor/CodeEditor.svelte'
import type {
  ApplyEditArgs,
  EditorBackend,
  HighlightLinesArgs,
  OpenDocResult,
  SetTextArgs,
  SpanList,
} from '$lib/code-editor'
import { mount, tick, unmount } from 'svelte'
import type { ComponentProps } from 'svelte'
import { expect, onTestFinished, test, vi } from 'vite-plus/test'
import { doc_query, press_key } from './index'

const DEMO_TEXT = `const first = 1\nconst second = 2\nconst third = 3`
const OPEN_RESULT: OpenDocResult = {
  language: `TypeScript`,
  lineCount: 3,
  eol: `lf`,
  hadBom: false,
  highlightable: true,
  editable: true,
}

interface BackendRecorder {
  backend: EditorBackend
  edits: ApplyEditArgs[]
  resyncs: SetTextArgs[]
  highlights: HighlightLinesArgs[]
  closed: string[]
  opened_text: string[]
}

const create_backend = (spans: SpanList[] = [[0, 6], [0, 2], []]): BackendRecorder => {
  const edits: ApplyEditArgs[] = []
  const resyncs: SetTextArgs[] = []
  const highlights: HighlightLinesArgs[] = []
  const closed: string[] = []
  const opened_text: string[] = []
  const backend: EditorBackend = {
    open_doc: ({ text }) => {
      opened_text.push(text)
      return Promise.resolve(OPEN_RESULT)
    },
    highlight_lines: (args) => {
      highlights.push(args)
      return Promise.resolve(spans.slice(args.startLine, args.endLine))
    },
    apply_edit: (args) => {
      edits.push(args)
      return Promise.resolve(args.expectedLineCount)
    },
    set_text: (args) => {
      resyncs.push(args)
      return Promise.resolve(args.text.split(`\n`).length)
    },
    close_doc: ({ docId }) => {
      closed.push(docId)
      return Promise.resolve()
    },
  }
  return { backend, edits, resyncs, highlights, closed, opened_text }
}

const flush_async = async (): Promise<void> => {
  await tick()
  await Promise.resolve()
  await tick()
}

const emit_edit = (
  area: HTMLTextAreaElement,
  insert: string,
  at: number,
  through = at,
  input_type = `insertText`,
): void => {
  area.setSelectionRange(at, through)
  area.dispatchEvent(
    new InputEvent(`beforeinput`, { inputType: input_type, bubbles: true }),
  )
  area.value = area.value.slice(0, at) + insert + area.value.slice(through)
  const caret = at + insert.length
  area.setSelectionRange(caret, caret)
  area.dispatchEvent(new InputEvent(`input`, { inputType: input_type, bubbles: true }))
}

type ExecCommand = (command: string, show_ui?: boolean, value?: string) => boolean

const default_exec_command: ExecCommand = (command, _show_ui, value) => {
  const area = document.activeElement
  if (command !== `insertText` || !(area instanceof HTMLTextAreaElement)) return false
  emit_edit(area, value ?? ``, area.selectionStart, area.selectionEnd)
  return true
}

const install_exec_command = (
  implementation: ExecCommand | null = default_exec_command,
): void => {
  const original = Object.getOwnPropertyDescriptor(document, `execCommand`)
  if (implementation) {
    Object.defineProperty(document, `execCommand`, {
      configurable: true,
      value: implementation,
    })
  } else Reflect.deleteProperty(document, `execCommand`)
  onTestFinished(() => {
    if (original) Object.defineProperty(document, `execCommand`, original)
    else Reflect.deleteProperty(document, `execCommand`)
  })
}

const mount_editor = async (
  overrides: Partial<ComponentProps<typeof CodeEditor>> = {},
) => {
  const recorder = create_backend()
  const props = $state({
    text: DEMO_TEXT,
    filename: `demo.ts`,
    backend: recorder.backend,
    options: {
      font_size: 13,
      tab_size: 2,
      insert_spaces: true,
      line_numbers: true,
    },
    ...overrides,
  })
  const instance = mount(CodeEditor, { target: document.body, props })
  onTestFinished(() => unmount(instance))
  await flush_async()
  return {
    instance,
    props,
    recorder,
    textarea: doc_query<HTMLTextAreaElement>(`textarea`),
  }
}

const overlay_lines = (): string[] =>
  [...document.querySelectorAll(`.token-layer .line`)].map(
    (line) => line.textContent ?? ``,
  )

test(`editing writes through bind:text, repaints immediately, and sends one line edit`, async () => {
  const on_dirty_change = vi.fn()
  const { props, recorder, textarea } = await mount_editor({ on_dirty_change })

  expect(textarea.getAttribute(`aria-label`)).toBe(`demo.ts source`)
  const description_id = textarea.getAttribute(`aria-describedby`)
  if (!description_id) throw new Error(`CodeEditor help text is not referenced`)
  expect(doc_query(`[id="${description_id}"]`).textContent?.trim()).toBe(
    `Press Escape, then Tab to move focus away`,
  )

  emit_edit(textarea, `xy`, 6)
  await flush_async()

  const expected = `const xyfirst = 1\nconst second = 2\nconst third = 3`
  expect(props.text).toBe(expected)
  expect(overlay_lines()).toEqual(expected.split(`\n`))
  expect(recorder.edits).toEqual([
    expect.objectContaining({
      startLine: 0,
      removedCount: 1,
      insertedLines: [`const xyfirst = 1`],
      expectedTotalLength: expected.length,
    }),
  ])
  expect(recorder.resyncs).toEqual([])
  expect(recorder.opened_text).toEqual([DEMO_TEXT])
  expect(on_dirty_change).toHaveBeenCalledTimes(1)
  expect(on_dirty_change).toHaveBeenCalledWith(true)
})

test(`initial disk text keeps its raw open shape but binds the normalized buffer`, async () => {
  const raw_text = `\uFEFFfirst\r\nsecond\r\n`
  const { props, recorder, textarea } = await mount_editor({ text: raw_text })

  expect(recorder.opened_text).toEqual([raw_text])
  expect(textarea.value).toBe(`first\nsecond\n`)
  expect(props.text).toBe(`first\nsecond\n`)
  expect(overlay_lines()).toEqual([`first`, `second`, ``])
})

test(`keyboard edit commands use configurable indentation and filename comments`, async () => {
  install_exec_command()
  const { textarea } = await mount_editor()
  textarea.focus()
  textarea.setSelectionRange(0, 0)

  press_key(textarea, `Tab`)
  await flush_async()
  expect(textarea.value.split(`\n`)[0]).toBe(`  const first = 1`)

  textarea.setSelectionRange(0, 0)
  press_key(textarea, `/`, { metaKey: true })
  await flush_async()
  expect(textarea.value.split(`\n`)[0]).toBe(`  // const first = 1`)

  textarea.setSelectionRange(5, 5)
  press_key(textarea, `Enter`)
  await flush_async()
  expect(textarea.value.startsWith(`  // \n  const`)).toBe(true)

  const before_escape = textarea.value
  press_key(textarea, `Escape`)
  expect(press_key(textarea, `Tab`).defaultPrevented).toBe(false)
  expect(textarea.value).toBe(before_escape)
})

test.each([
  { label: `missing`, implementation: null },
  { label: `returning false`, implementation: () => false },
])(
  `keyboard commands fall back when execCommand is $label`,
  async ({ implementation }) => {
    install_exec_command(implementation)
    const { textarea } = await mount_editor()
    textarea.focus()
    textarea.setSelectionRange(0, 0)

    press_key(textarea, `Tab`)
    await flush_async()

    expect(textarea.value.startsWith(`  const first`)).toBe(true)
  },
)

test(`a cancelled fallback beforeinput cannot leak into the next edit`, async () => {
  install_exec_command(null)
  const { recorder, textarea } = await mount_editor()
  const cancel_input = (event: Event) => event.preventDefault()
  textarea.addEventListener(`beforeinput`, cancel_input)
  textarea.focus()
  textarea.setSelectionRange(0, 0)
  press_key(textarea, `Tab`)
  textarea.removeEventListener(`beforeinput`, cancel_input)

  textarea.value = `x${textarea.value}`
  textarea.setSelectionRange(1, 1)
  textarea.dispatchEvent(
    new InputEvent(`input`, { bubbles: true, inputType: `insertText` }),
  )
  await flush_async()

  expect(recorder.edits).toEqual([])
  expect(recorder.resyncs).toEqual([{ docId: expect.any(String), text: `x${DEMO_TEXT}` }])
})

test(`saving is injected, recovers from errors, and rebases dirty state`, async () => {
  const save_result = Promise.withResolvers<undefined>()
  const on_save = vi
    .fn<NonNullable<ComponentProps<typeof CodeEditor>[`on_save`]>>()
    .mockRejectedValueOnce(new Error(`disk full`))
    .mockReturnValueOnce(save_result.promise)
  const dirty_states: boolean[] = []
  const { instance, recorder, textarea } = await mount_editor({
    on_save,
    on_dirty_change: (dirty: boolean) => void dirty_states.push(dirty),
  })
  emit_edit(textarea, `!`, 0)
  await flush_async()

  await expect(instance.save()).resolves.toBe(false)
  expect(doc_query(`[role="alert"]`).textContent).toBe(`disk full`)
  const backend_calls = [
    recorder.edits.length,
    recorder.resyncs.length,
    recorder.closed.length,
  ]
  const save_request = instance.save()
  await tick()
  expect(doc_query(`.code-editor`).getAttribute(`aria-busy`)).toBe(`true`)
  save_result.resolve(undefined)
  await expect(save_request).resolves.toBe(true)
  await flush_async()

  expect(on_save.mock.calls).toEqual([
    [`!${DEMO_TEXT}`, OPEN_RESULT],
    [`!${DEMO_TEXT}`, OPEN_RESULT],
  ])
  expect(dirty_states).toEqual([true, false])
  expect([
    recorder.edits.length,
    recorder.resyncs.length,
    recorder.closed.length,
  ]).toEqual(backend_calls)
  expect(doc_query(`.code-editor`).getAttribute(`aria-busy`)).toBe(`false`)
  expect(document.querySelector(`[role="alert"]`)).toBeNull()
})

test(`editing stays disabled until the backend confirms the document is editable`, async () => {
  const open_result = Promise.withResolvers<OpenDocResult>()
  const recorder = create_backend()
  recorder.backend.open_doc = () => open_result.promise
  const { props, textarea } = await mount_editor({
    aria_label: `Custom source`,
    backend: recorder.backend,
  })

  expect(textarea.getAttribute(`aria-label`)).toBe(`Custom source`)
  expect(doc_query(`.code-editor`).getAttribute(`aria-busy`)).toBe(`true`)
  expect(textarea.readOnly).toBe(true)
  emit_edit(textarea, `!`, 0)
  await flush_async()
  expect([textarea.value, props.text]).toEqual([DEMO_TEXT, DEMO_TEXT])
  expect([recorder.edits, recorder.resyncs]).toEqual([[], []])

  open_result.resolve({ ...OPEN_RESULT, editable: false })
  await flush_async()
  expect(doc_query(`.code-editor`).getAttribute(`aria-busy`)).toBe(`false`)
  expect(textarea.readOnly).toBe(true)
  expect(props.text).toBe(DEMO_TEXT)
})

test(`an external buffer replacement opens a fresh backend document and resets dirty`, async () => {
  const dirty_states: boolean[] = []
  const { props, recorder, textarea } = await mount_editor({
    on_dirty_change: (dirty: boolean) => void dirty_states.push(dirty),
  })
  emit_edit(textarea, `!`, 0)
  await flush_async()
  Object.defineProperty(textarea, `scrollWidth`, {
    configurable: true,
    get: () => (textarea.value.startsWith(`external`) ? 120 : 500),
  })
  textarea.scrollTop = 60
  textarea.scrollLeft = 20
  textarea.setSelectionRange(10, 18)
  textarea.dispatchEvent(new Event(`scroll`))

  props.text = `external\nreplacement`
  await flush_async()

  expect(textarea.value).toBe(`external\nreplacement`)
  expect(overlay_lines()).toEqual([`external`, `replacement`])
  expect(recorder.closed).toHaveLength(1)
  expect(dirty_states).toEqual([true, false])
  expect({
    scroll_top: textarea.scrollTop,
    scroll_left: textarea.scrollLeft,
    selection_start: textarea.selectionStart,
    selection_end: textarea.selectionEnd,
  }).toEqual({ scroll_top: 0, scroll_left: 0, selection_start: 0, selection_end: 0 })
  expect(doc_query(`.token-layer`).style.minWidth).toBe(`120px`)
})

test.each([`resolve`, `reject`] as const)(
  `unmount suppresses callbacks when open later %s`,
  async (outcome) => {
    const open_result = Promise.withResolvers<OpenDocResult>()
    const recorder = create_backend()
    recorder.backend.open_doc = () => open_result.promise
    const on_ready = vi.fn()
    const on_error = vi.fn()
    const instance = mount(CodeEditor, {
      target: document.body,
      props: {
        text: DEMO_TEXT,
        filename: `deferred.ts`,
        backend: recorder.backend,
        on_ready,
        on_error,
      },
    })
    await tick()
    await unmount(instance)

    if (outcome === `resolve`) open_result.resolve(OPEN_RESULT)
    else open_result.reject(new Error(`open failed`))
    await flush_async()

    expect([on_ready, on_error].map((callback) => callback.mock.calls)).toEqual([[], []])
  },
)
