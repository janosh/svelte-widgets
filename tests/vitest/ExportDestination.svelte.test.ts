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
  await export_state.run(({ filename, save }) => {
    expect(export_state.disabled).toBe(true)
    return save(`contents`, `${filename}.csv`, `text/csv`)
  })
  expect(export_state.disabled).toBe(false)
  expect(download).toHaveBeenCalledExactlyOnceWith(`contents`, `My movie.csv`, `text/csv`)
  // No folder picker, no destination row: its button could never work and its label could name
  // the wrong place under a host's download hook.
  expect(document.querySelector(`[aria-label="Choose export folder"]`)).toBeNull()
  expect(document.body.textContent).not.toContain(`Browser downloads`)
  // A frame cross-origin to the top page (a VS Code webview) has the picker but may not use it
  vi.stubGlobal(`showDirectoryPicker`, vi.fn())
  vi.stubGlobal(`top`, {
    get location() {
      throw new DOMException(`Blocked`, `SecurityError`)
    },
  })
  const framed = mount_pane(export_state)
  await tick()
  expect(document.querySelector(`[aria-label="Choose export folder"]`)).toBeNull()
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
  [`cancel-write`, `Cancelled`],
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
    const choose = document.querySelector<HTMLButtonElement>(
      `[aria-label="Choose export folder"]`,
    )
    choose?.click()
    await vi.waitFor(() => expect(export_state.directory).toBe(directory))
    expect(picker).toHaveBeenCalledWith({
      id: `file-export`,
      mode: `readwrite`,
      startIn: `downloads`,
    })
    expect(document.body.textContent).toContain(`Movies/`)
    // Cancelling a subsequent picker preserves the chosen folder and reports no error.
    picker.mockRejectedValueOnce(new DOMException(`Cancelled`, `AbortError`))
    choose?.click()
    await vi.waitFor(() => expect(picker).toHaveBeenCalledTimes(2))
    await tick()
    expect(export_state.directory).toBe(directory)
    expect(export_state.error).toBe(``)

    const encode = vi.fn(() => new Blob([`encoded video`], { type: `video/mp4` }))
    await export_state.run(async ({ filename, prepare }) => {
      const save = await prepare(`${filename}.mp4`, controller.signal)
      const blob = encode()
      // same-name writes started together: the second must not reopen the first's file
      const writes = outcome === `concurrent` ? [save(blob, `video/mp4`)] : []
      writes.push(save(blob, `video/mp4`))
      for (const result of await Promise.allSettled(writes))
        if (result.status === `rejected`) throw result.reason
    })
    expect(download).not.toHaveBeenCalled()
    expect(export_state.busy).toBe(false)
    expect(export_state.error).toContain(error_message)
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
    if (outcome === `success`) {
      expect(export_state.error).toBe(``)
      expect(get_file).toHaveBeenLastCalledWith(`My movie.mp4`, { create: true })
    }
    if (outcome === `cancel-write`) expect(abort).toHaveBeenCalledOnce()
    // a failed write removes the empty file it created, so retrying under the same name works,
    // but keeps one that another program filled meanwhile
    expect(remove_entry.mock.calls).toEqual(
      [`write-error`, `cancel-write`].includes(outcome) ? [[`My movie.mp4`]] : [],
    )
    document
      .querySelector<HTMLButtonElement>(`[aria-label="Use browser downloads"]`)
      ?.click()
    await tick()
    expect(export_state.directory).toBeNull()
    expect(document.body.textContent).toContain(`Browser downloads`)
    await unmount(pane)
  },
)
