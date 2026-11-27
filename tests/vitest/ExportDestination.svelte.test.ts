import { FileExportState } from '#lib/browser/index.ts'
import ExportDestination from '#lib/ExportDestination.svelte'
import { mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, expect, test, vi } from 'vite-plus/test'
import { fire_input } from './index'

// `download` hands saves to a global `download` hook when one is installed (as VS Code
// webviews do), so stubbing that hook observes browser-download saves without a module mock
const download = vi.fn()
beforeEach(() => vi.stubGlobal(`download`, download))
afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})
const mount_pane = (state: FileExportState) =>
  mount(ExportDestination, { target: document.body, props: { state } })
// A destination button by its accessible name, which must be its visible text (WCAG 2.5.3)
const button = (name: string): HTMLButtonElement | undefined => {
  const found = [...document.querySelectorAll(`button`)].find(
    (node) => node.textContent?.trim() === name,
  )
  if (found) expect(found.getAttribute(`aria-label`) ?? name).toBe(name)
  return found
}
// A destination radio by its label text
const radio = (label: string): HTMLInputElement | undefined =>
  [...document.querySelectorAll<HTMLInputElement>(`input[type="radio"]`)].find(
    (node) => node.parentElement?.textContent?.trim() === label,
  )
// label text of the checked destination radio
const checked = (): (string | undefined)[] =>
  [...document.querySelectorAll(`input[type="radio"]:checked`)].map((node) =>
    node.parentElement?.textContent?.trim(),
  )

test(`filename follows the source until edited, then keeps the typed name; rejects paths`, async () => {
  let source = $state(`initial`)
  const export_state = new FileExportState(() => source)
  const pane = mount_pane(export_state)
  await tick()
  const input = document.querySelector(`input`)
  if (!input) throw new Error(`Missing filename input`)
  expect(input.value).toBe(`initial`)
  source = `changed`
  await tick()
  expect(input.value).toBe(`changed`)
  await fire_input(input, `My movie`, `input`)
  // a typed name survives later changes to the default
  source = `frame 2`
  await tick()
  expect(input.value).toBe(`My movie`)
  await export_state.run(async ({ filename, open }) => {
    expect(export_state.disabled).toBe(true)
    return (await open(`${filename}.csv`, `text/csv`))(`contents`)
  })
  expect(export_state.disabled).toBe(false)
  expect(download).toHaveBeenCalledExactlyOnceWith(`contents`, `My movie.csv`, `text/csv`)
  // No folder picker, no destination row: its button could never work and its label could name
  // the wrong place under a host's download hook.
  expect(button(`Choose folder…`)).toBeUndefined()
  expect(document.body.textContent).not.toContain(`Browser downloads`)
  // A frame cross-origin to the top page (a VS Code webview) has the picker but may not use it
  vi.stubGlobal(`showDirectoryPicker`, vi.fn())
  vi.stubGlobal(`top`, {
    get location() {
      throw new DOMException(`Blocked`, `SecurityError`)
    },
  })
  vi.stubGlobal(`showSaveFilePicker`, vi.fn())
  const framed = mount_pane(export_state)
  await tick()
  expect(button(`Choose folder…`)).toBeUndefined()
  expect(radio(`Ask each time`)).toBeUndefined()
  await unmount(framed)
  const task = vi.fn()
  vi.spyOn(console, `error`).mockImplementation(() => {})
  for (const invalid of [
    ``,
    `..`,
    ` .`,
    ` .. `,
    `folder/file`,
    `folder\\file`,
    `bad\0name`,
  ]) {
    export_state.filename = invalid
    await export_state.run(task)
    expect(export_state.error).not.toBe(``)
    expect(export_state.disabled).toBe(true)
  }
  expect(task).not.toHaveBeenCalled()
  await unmount(pane)
})

test.each([
  [`success`, ``],
  [`exists`, `already exists`],
  [`denied`, `permission denied`],
  [`write-error`, `Disk full`],
  [`cancel-write`, ``], // the task's own abort: quiet, its partial file still removed
  // another program creates the name after prepare's check, or fills the empty file we created
  [`created-meanwhile`, `already exists`],
  [`written-meanwhile`, `Disk full`],
  [`concurrent`, `already being exported`],
] as const)(
  `selected folder handles %s without redirecting to browser downloads`,
  async (outcome, error_message) => {
    const error_spy = vi.spyOn(console, `error`).mockImplementation(() => {})
    const controller = new AbortController()
    const chunks: Uint8Array<ArrayBuffer>[] = []
    const close = vi.fn()
    const abort = vi.fn()
    const create_writable = vi.fn(
      async () =>
        new WritableStream<Uint8Array<ArrayBuffer>>({
          write(chunk) {
            chunks.push(chunk)
            if ([`write-error`, `written-meanwhile`].includes(outcome))
              throw new Error(`Disk full`)
            if (outcome === `cancel-write`) controller.abort(new Error(`Cancelled`))
          },
          close,
          abort,
        }),
    )
    let lookups = 0
    const get_file = vi.fn(async (_name: string, options?: { create?: boolean }) => {
      if (outcome === `denied`)
        throw new DOMException(`Folder permission denied`, `NotAllowedError`)
      const exists =
        outcome === `exists` || (outcome === `created-meanwhile` && lookups++ > 0)
      if (!options?.create && !exists) throw new DOMException(`Missing`, `NotFoundError`)
      const content = outcome === `written-meanwhile` ? [`other`] : []
      return {
        createWritable: create_writable,
        getFile: async () => new File(content, ``),
      }
    })
    const remove_entry = vi.fn(async () => {})
    const directory = {
      name: `Movies`,
      getFileHandle: get_file,
      removeEntry: remove_entry,
    }
    const picker = vi.fn().mockResolvedValue(directory)
    vi.stubGlobal(`showDirectoryPicker`, picker)
    const export_state = new FileExportState(() => `My movie`)
    const pane = mount_pane(export_state)
    await tick()
    const choose = button(`Choose folder…`)
    choose?.click()
    await vi.waitFor(() => expect(export_state.destination).toBe(directory))
    expect(picker).toHaveBeenCalledWith({
      id: `file-export`,
      mode: `readwrite`,
      startIn: `downloads`,
    })
    expect(checked()).toEqual([`Movies/`])
    // Cancelling a subsequent picker preserves the chosen folder and reports no error.
    picker.mockRejectedValueOnce(new DOMException(`Cancelled`, `AbortError`))
    choose?.click()
    await vi.waitFor(() => expect(picker).toHaveBeenCalledTimes(2))
    await tick()
    expect(export_state.destination).toBe(directory)
    expect(export_state.error).toBe(``)

    const encode = vi.fn(() => new Blob([`encoded video`], { type: `video/mp4` }))
    await export_state.run(async ({ filename, open }) => {
      const write = await open(`${filename}.mp4`, `video/mp4`, controller.signal)
      const blob = encode()
      // same-name writes started together: the second must not reopen the first's file
      const writes = outcome === `concurrent` ? [write(blob)] : []
      writes.push(write(blob))
      for (const result of await Promise.allSettled(writes))
        if (result.status === `rejected`) throw result.reason
    })
    expect(download).not.toHaveBeenCalled()
    expect(export_state.busy).toBe(false)
    if (error_message) expect(export_state.error).toContain(error_message)
    else expect(export_state.error).toBe(``)
    // a kept file is logged on top of the export error
    expect(error_spy).toHaveBeenCalledTimes(
      outcome === `written-meanwhile` ? 2 : error_message ? 1 : 0,
    )
    expect(encode).toHaveBeenCalledTimes([`exists`, `denied`].includes(outcome) ? 0 : 1)
    expect(close).toHaveBeenCalledTimes(
      [`success`, `concurrent`].includes(outcome) ? 1 : 0,
    )
    expect(get_file.mock.calls.some(([, options]) => options?.create)).toBe(
      ![`exists`, `denied`, `created-meanwhile`].includes(outcome),
    )
    if ([`success`, `concurrent`].includes(outcome))
      expect(await new Blob(chunks).text()).toBe(`encoded video`)
    if (outcome === `success`)
      expect(get_file).toHaveBeenLastCalledWith(`My movie.mp4`, { create: true })
    if (outcome === `cancel-write`) expect(abort).toHaveBeenCalledOnce()
    // a failed write removes the empty file it created, so retrying under the same name works,
    // but keeps one that another program filled meanwhile
    expect(remove_entry.mock.calls).toEqual(
      [`write-error`, `cancel-write`].includes(outcome) ? [[`My movie.mp4`]] : [],
    )
    expect(checked()).toEqual([`Movies/`])
    radio(`Downloads`)?.click()
    await tick()
    expect(export_state.destination).toBe(`downloads`)
    expect(checked()).toEqual([`Downloads`])
    // the chosen folder stays one radio away
    radio(`Movies/`)?.click()
    await tick()
    expect(export_state.destination).toBe(directory)
    await unmount(pane)
  },
)

// Save As asks for every file before it is encoded: the browser confirms overwrites, and a
// dismissed dialog or an aborted export ends it quietly
test.each([
  [`success`, `chart.csv`, `text/csv;charset=utf-8`, ``],
  [`no extension`, `README`, `text/plain`, ``],
  [`dialog dismissed`, `chart.csv`, `text/csv`, ``],
  [`aborted`, `chart.csv`, `text/csv`, ``],
  [`write error`, `chart.csv`, `text/csv`, `Disk full`],
  // an AbortError that is neither the dialog's nor the task's signal is a real failure
  [`encoder abort`, `chart.csv`, `text/csv`, `Encoder gave up`],
] as const)(`Save As destination: %s`, async (outcome, filename, mime, error_message) => {
  const error_spy = vi.spyOn(console, `error`).mockImplementation(() => {})
  const chunks: Uint8Array<ArrayBuffer>[] = []
  const handle = {
    name: filename,
    // a picked file exists, empty, until a write completes
    getFile: vi.fn(async () => new File(chunks, filename)),
    remove: vi.fn(async () => {}),
    createWritable: vi.fn(
      async () =>
        new WritableStream<Uint8Array<ArrayBuffer>>({
          write(chunk) {
            if (outcome === `write error`) throw new Error(`Disk full`)
            chunks.push(chunk)
          },
        }),
    ),
  }
  const picker = vi.fn(async () => {
    if (outcome === `dialog dismissed`)
      throw new DOMException(`The user aborted a request.`, `AbortError`)
    return handle
  })
  vi.stubGlobal(`showSaveFilePicker`, picker)
  const export_state = new FileExportState(() => `chart`)
  const pane = mount_pane(export_state)
  await tick()
  // no folder picker in this browser, so no button for one
  expect(button(`Choose folder…`)).toBeUndefined()
  expect(checked()).toEqual([`Downloads`])
  radio(`Ask each time`)?.click()
  await tick()
  expect(export_state.destination).toBe(`save-as`)
  expect(checked()).toEqual([`Ask each time`])
  const controller = new AbortController()
  const encode = vi.fn(() => {
    if (outcome === `encoder abort`)
      throw new DOMException(`Encoder gave up`, `AbortError`)
    return `a,b`
  })
  await export_state.run(async ({ open }) => {
    const write = await open(filename, mime, controller.signal)
    if (outcome === `aborted`) controller.abort()
    await write(encode())
  })
  const extension = filename.split(`.`)[1]
  expect(picker).toHaveBeenCalledExactlyOnceWith({
    id: `file-export`,
    suggestedName: filename,
    ...(extension && {
      types: [{ accept: { [mime.split(`;`)[0]]: [`.${extension}`] } }],
    }),
  })
  expect(export_state.error).toBe(error_message)
  expect(error_spy).toHaveBeenCalledTimes(error_message ? 1 : 0)
  expect(encode).toHaveBeenCalledTimes(outcome === `dialog dismissed` ? 0 : 1)
  expect(handle.createWritable).toHaveBeenCalledTimes(
    [`success`, `no extension`, `write error`].includes(outcome) ? 1 : 0,
  )
  if (!error_message && handle.createWritable.mock.calls.length)
    expect(await new Blob(chunks).text()).toBe(`a,b`)
  // a picked file left empty by a failed or stopped export is removed, a written one kept
  expect(handle.remove).toHaveBeenCalledTimes(
    [`aborted`, `write error`, `encoder abort`].includes(outcome) ? 1 : 0,
  )
  expect(download).not.toHaveBeenCalled()
  radio(`Downloads`)?.click()
  await tick()
  expect(export_state.destination).toBe(`downloads`)
  await unmount(pane)
})
