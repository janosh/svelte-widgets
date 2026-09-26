import { FileInput } from '$lib'
import { createRawSnippet, flushSync, tick, type ComponentProps } from 'svelte'
import { expect, test, vi } from 'vitest'
import {
  data_transfer,
  doc_query,
  drag_event,
  next_task,
  render as mount_body,
} from './index'

const render = (props: ComponentProps<typeof FileInput>) => {
  const destroy = mount_body(FileInput, props)
  const input = doc_query<HTMLInputElement>(`input[type="file"]`)
  const select = async (files: File[]) => {
    Object.defineProperty(input, `files`, { configurable: true, value: files })
    input.dispatchEvent(new Event(`change`, { bubbles: true }))
    await tick()
  }
  return { target: document.body, input, select, destroy }
}
const drop = async (items: object[], files: File[] = []) => {
  const transfer = data_transfer(files, items as DataTransferItem[])
  doc_query(`.file-input`).dispatchEvent(drag_event(`drop`, transfer))
  await next_task() // file expansion is async
  await tick()
}
const json = (name = `ok.json`, size = 2) => new File([`x`.repeat(size)], name)

test(`file picker validates, cancels superseded work, removes files and permits reselection`, async () => {
  const signals: AbortSignal[] = []
  const reject_loads: ((reason: Error) => void)[] = []
  const on_files = vi.fn((_files: File[], signal: AbortSignal) => {
    signals.push(signal)
    return new Promise<void>((_resolve, reject) => {
      reject_loads.push(reject)
    })
  })
  const on_reject = vi.fn()
  const props = $state({
    accept: `.json`,
    max_size: 10,
    multiple: true,
    max_files: 1,
    on_files,
    on_reject,
  })
  const { target, select, destroy } = render(props)
  const good = new File([`{}`], `ok.json`)
  await select([
    new File([`x`], `bad.txt`),
    new File([`x`.repeat(11)], `large.json`),
    good,
    good,
  ])
  expect(
    on_reject.mock.calls[0][0].map(({ reason }: { reason: string }) => reason),
  ).toEqual([`type`, `size`, `count`])
  expect(on_files.mock.calls[0][0]).toEqual([good])
  await select([good])
  expect(signals[0].aborted).toBe(true)
  expect(on_files).toHaveBeenCalledTimes(2)
  reject_loads[0](new Error(`Superseded failure`))
  await tick()
  expect(target.textContent).not.toContain(`Superseded failure`)
  expect(target.textContent).toContain(`Processing files`)
  await select([new File([`x`], `bad.txt`)])
  expect(signals[1].aborted).toBe(false)
  target.querySelector<HTMLButtonElement>(`button[aria-label="Remove ok.json"]`)?.click()
  await tick()
  expect(signals[1].aborted).toBe(true)
  expect(target.querySelectorAll(`li`)).toHaveLength(0)
  await select([good])
  reject_loads[2](new Error(`Retry this file`))
  await tick()
  expect(target.textContent).toContain(`Retry this file`)
  Array.from(target.querySelectorAll(`button`))
    .find((button) => button.textContent === `Retry`)
    ?.click()
  await tick()
  expect(on_files).toHaveBeenCalledTimes(4)
  props.accept = `.txt`
  await tick()
  const text_file = new File([`x`], `accepted.txt`)
  await select([good, text_file])
  expect(on_files.mock.lastCall?.[0]).toEqual([text_file])
  expect(on_reject.mock.lastCall?.[0]).toEqual([{ file: good, reason: `type` }])
  await destroy()
  expect(signals.at(-1)?.aborted).toBe(true)
})

test.each([
  [`type`, { accept: `.json` }, [json(`bad.txt`)], `bad.txt: File type not accepted`],
  [`size`, { max_size: 1 }, [json()], `ok.json: File too large`],
  [
    `count in single mode`,
    {},
    [json(`a.json`), json(`b.json`)],
    `b.json: Too many files`,
  ],
  [
    `count past max_files`,
    { multiple: true, max_files: 2 },
    [json(`a.json`), json(`b.json`), json(`c.json`)],
    `c.json: Too many files`,
  ],
] as const)(`announces a %s rejection`, async (_desc, props, files, message) => {
  const on_reject = vi.fn()
  const { select } = render({ ...props, on_reject })
  await select([...files])
  expect(doc_query(`[role="status"]`).textContent?.trim()).toBe(message)
  expect(on_reject).toHaveBeenCalledOnce()
})

test(`an empty selection is ignored`, async () => {
  const on_files = vi.fn()
  const on_reject = vi.fn()
  const { select } = render({ on_files, on_reject })
  await select([])
  expect(on_files).not.toHaveBeenCalled()
  expect(on_reject).not.toHaveBeenCalled()
})

test(`disabled blocks input and disabling aborts in-flight work`, async () => {
  let signal: AbortSignal | undefined
  const on_files = vi.fn((_files: File[], next_signal: AbortSignal) => {
    signal = next_signal
    return new Promise<void>(() => {})
  })
  const props = $state({ disabled: false, on_files })
  const { target, input, select } = render(props)
  expect(doc_query(`.file-input`).getAttribute(`aria-disabled`)).toBe(`false`)
  await select([json()])
  expect(signal?.aborted).toBe(false)

  props.disabled = true
  flushSync()
  expect(signal?.aborted).toBe(true)
  expect(input.disabled).toBe(true)
  expect(doc_query(`.file-input`).getAttribute(`aria-disabled`)).toBe(`true`)
  expect(target.querySelector<HTMLButtonElement>(`li button`)?.disabled).toBe(true)
  expect(target.textContent).not.toContain(`Processing files`)
  await select([json(`second.json`)])
  expect(on_files).toHaveBeenCalledOnce()
})

test(`children snippet replaces the default file list and label is customizable`, async () => {
  const children = createRawSnippet<[File[]]>((files) => ({
    render: () => `<p class="custom"></p>`,
    setup: (node) => {
      $effect(() => {
        node.textContent = `${files().length} chosen`
      })
    },
  }))
  const { target, select } = render({ children, label: `Pick data` })
  expect(doc_query(`label`).textContent).toBe(`Pick data`)
  await select([json()])
  expect(target.querySelector(`ul`)).toBeNull()
  expect(target.querySelector(`.custom`)?.textContent).toBe(`1 chosen`)
})

test(`remove_label names each remove button and removal reports the file`, async () => {
  const on_remove = vi.fn()
  const { target, select } = render({
    multiple: true,
    remove_label: `Drop`,
    on_remove,
  })
  const [first, second] = [json(`a.json`), json(`b.json`)]
  await select([first, second])
  target.querySelector<HTMLButtonElement>(`button[aria-label="Drop a.json"]`)?.click()
  await tick()
  expect(on_remove).toHaveBeenCalledExactlyOnceWith(first)
  expect(
    [...target.querySelectorAll(`li`)].map((li) => li.firstChild?.textContent?.trim()),
  ).toEqual([second.name])
})

test(`dropped files go through the same validation, and a failed drop shows its error`, async () => {
  const on_files = vi.fn()
  const on_reject = vi.fn()
  const { target } = render({ accept: `.json`, on_files, on_reject })
  const good = json()
  await drop([{ kind: `file`, webkitGetAsEntry: () => null }], [good, json(`no.txt`)])
  expect(on_files.mock.calls[0][0]).toEqual([good])
  expect(on_reject.mock.calls[0][0]).toEqual([{ file: expect.any(File), reason: `type` }])

  const broken = {
    isFile: true,
    isDirectory: false,
    name: `broken.json`,
    fullPath: `/broken.json`,
    file: (_on_file: unknown, on_error: (error: Error) => void) =>
      on_error(new Error(`Unreadable drop`)),
  }
  await drop([{ kind: `file`, webkitGetAsEntry: () => broken }])
  expect(target.textContent).toContain(`Unreadable drop`)
})

test.each([
  [`negative max_size`, { max_size: -1 }],
  [`NaN max_size`, { max_size: Number.NaN }],
  [`zero max_files`, { max_files: 0 }],
  [`fractional max_files`, { max_files: 1.5 }],
])(`rejects %s`, (_desc, props) => {
  expect(() => mount_body(FileInput, props)).toThrow(
    `FileInput requires max_size >= 0 and max_files >= 1`,
  )
})
