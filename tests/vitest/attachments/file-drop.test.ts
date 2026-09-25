import { file_drop, type FileDropOptions } from '$lib/attachments'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { create_element, data_transfer, drag_event, next_task } from '../index'

describe(`file_drop`, () => {
  const attach_file_drop = (
    options: Parameters<typeof file_drop>[0],
    node = create_element(),
  ) => {
    const cleanup = file_drop(options)(node)
    if (cleanup) onTestFinished(cleanup)
    return { node, cleanup }
  }
  const file = (name: string, type = ``) => new File([``], name, { type })
  const files_of = (...names: string[]) => data_transfer(names.map((name) => file(name)))
  const drop = (node: HTMLElement, transfer: DataTransfer) =>
    node.dispatchEvent(drag_event(`drop`, transfer))
  const pending_until_aborted = (signal: AbortSignal) =>
    new Promise<void>((_resolve, reject) => {
      signal.addEventListener(
        `abort`,
        () => reject(new DOMException(`Drop superseded`, `AbortError`)),
        { once: true },
      )
    })
  const aborted_calls = (on_files: ReturnType<typeof vi.fn>) =>
    on_files.mock.calls.map(([, signal]) => (signal as AbortSignal).aborted)
  const active_calls = (on_drag_active: ReturnType<typeof vi.fn>) =>
    on_drag_active.mock.calls.map(([active]) => active)
  // a directory-style drop whose single file entry reads through `read_file`
  const entry_transfer = (name: string, read_file: FileSystemFileEntry[`file`]) => {
    const entry = { isFile: true, isDirectory: false, name, fullPath: `/${name}` }
    const item = {
      kind: `file`,
      webkitGetAsEntry: () => ({ ...entry, file: read_file }),
    } as unknown as DataTransferItem
    return data_transfer([], [item])
  }
  const delayed_transfer = (name: string) => {
    let deliver_file: FileCallback | undefined
    return {
      transfer: entry_transfer(name, (callback) => void (deliver_file = callback)),
      resolve: () => {
        if (!deliver_file) throw new Error(`Delayed file ${name} was never requested`)
        deliver_file(file(name))
      },
    }
  }

  it(`tracks nested drag activity, filters accept types, and honors multiple`, async () => {
    const [on_files, on_drag_active] = [vi.fn(), vi.fn()]
    const transfer = data_transfer([
      file(`one.TXT`, `text/plain`),
      file(`photo.webp`, `image/webp`),
      file(`notes.bin`, `application/pdf`),
      file(`skip.json`, `application/json`),
    ])
    const { node } = attach_file_drop({
      accept: `.txt,image/*,application/pdf`,
      multiple: true,
      on_files,
      on_drag_active,
    })

    const enter = drag_event(`dragenter`, transfer)
    node.dispatchEvent(enter)
    node.dispatchEvent(drag_event(`dragenter`, transfer))
    expect(enter.defaultPrevented).toBe(true)
    expect(node.hasAttribute(`data-drag-active`)).toBe(true)
    expect(on_drag_active).toHaveBeenCalledExactlyOnceWith(true, enter)

    const over = drag_event(`dragover`, transfer)
    node.dispatchEvent(over)
    expect(over.defaultPrevented).toBe(true)
    expect(transfer.dropEffect).toBe(`copy`)

    node.dispatchEvent(drag_event(`dragleave`, transfer))
    expect(node.hasAttribute(`data-drag-active`)).toBe(true)
    drop(node, transfer)

    await vi.waitFor(() => expect(on_files).toHaveBeenCalledOnce())
    expect(on_files.mock.calls[0][0].map((dropped: File) => dropped.name)).toEqual([
      `one.TXT`,
      `photo.webp`,
      `notes.bin`,
    ])
    expect(node.hasAttribute(`data-drag-active`)).toBe(false)
    expect(active_calls(on_drag_active)).toEqual([true, false])
  })

  it.each([
    [
      `single-file mode chooses the first accepted file`,
      [
        file(`skip.txt`, `text/plain`),
        file(`first.png`, `image/png`),
        file(`second.png`, `image/png`),
      ],
      [[`first.png`]],
    ],
    [`a drop with no accepted file is ignored`, [file(`notes.txt`, `text/plain`)], []],
  ])(`%s`, async (_description, files, expected_calls) => {
    const on_files = vi.fn<(files: File[]) => void>()
    const { node } = attach_file_drop({ accept: `image/*`, on_files })

    drop(node, data_transfer(files))
    await next_task()
    expect(
      on_files.mock.calls.map(([accepted]) => accepted.map(({ name }) => name)),
    ).toEqual(expected_calls)
  })

  it(`ignores stale expansion and aborts superseded callbacks and cleanup`, async () => {
    const on_error = vi.fn()
    const on_files = vi.fn((_files: File[], signal: AbortSignal) =>
      pending_until_aborted(signal),
    )
    const { node, cleanup } = attach_file_drop({ accept: `.txt`, on_files, on_error })
    const first = delayed_transfer(`first.txt`)

    drop(node, first.transfer)
    drop(node, files_of(`second.txt`))
    await vi.waitFor(() => expect(on_files).toHaveBeenCalledOnce())
    expect(on_files.mock.calls[0][0].map(({ name }) => name)).toEqual([`second.txt`])

    first.resolve()
    await next_task()
    expect(on_files).toHaveBeenCalledOnce()

    drop(node, files_of(`rejected.png`))
    await next_task()
    expect(aborted_calls(on_files)).toEqual([false])

    drop(node, files_of(`third.txt`))
    await vi.waitFor(() => expect(on_files).toHaveBeenCalledTimes(2))
    expect(aborted_calls(on_files)).toEqual([true, false])

    const after_cleanup = delayed_transfer(`after-cleanup.txt`)
    drop(node, after_cleanup.transfer)
    cleanup?.()
    after_cleanup.resolve()
    await next_task()
    expect(aborted_calls(on_files)).toEqual([true, true])
    expect(on_error).not.toHaveBeenCalled()
  })

  it(`stops delivery when aborting the previous callback destroys the attachment`, async () => {
    let cleanup: (() => void) | undefined
    const on_files = vi.fn((_files: File[], signal: AbortSignal) => {
      if (on_files.mock.calls.length === 1) {
        signal.addEventListener(`abort`, () => cleanup?.(), { once: true })
      }
      return pending_until_aborted(signal)
    })
    const attached = attach_file_drop({ on_files })
    cleanup = attached.cleanup || undefined

    drop(attached.node, files_of(`first.txt`))
    await vi.waitFor(() => expect(on_files).toHaveBeenCalledOnce())
    drop(attached.node, files_of(`second.txt`))
    await next_task()
    expect(on_files).toHaveBeenCalledOnce()
  })

  it(`reports directory expansion failures through on_error`, async () => {
    const failure = new DOMException(`entry disappeared`, `NotFoundError`)
    const [on_files, on_error] = [vi.fn(), vi.fn()]
    const { node } = attach_file_drop({ multiple: true, on_files, on_error })

    drop(
      node,
      entry_transfer(`broken.txt`, (_on_file, on_fail) => on_fail?.(failure)),
    )
    await vi.waitFor(() => expect(on_error).toHaveBeenCalledExactlyOnceWith(failure))
    expect(on_files).not.toHaveBeenCalled()
  })

  it(`disabled mode prevents browser navigation without activating or processing`, () => {
    const [on_files, on_drag_active] = [vi.fn(), vi.fn()]
    const { node, cleanup } = attach_file_drop({
      disabled: true,
      on_files,
      on_drag_active,
    })
    const transfer = data_transfer([file(`ignored.txt`, `text/plain`)])
    const [dragover, drop_event] = [
      drag_event(`dragover`, transfer),
      drag_event(`drop`, transfer),
    ]

    node.dispatchEvent(dragover)
    node.dispatchEvent(drop_event)
    expect(cleanup).toBeTypeOf(`function`)
    expect(dragover.defaultPrevented).toBe(true)
    expect(transfer.dropEffect).toBe(`none`)
    expect(drop_event.defaultPrevented).toBe(true)
    expect(node.hasAttribute(`data-drag-active`)).toBe(false)
    expect(on_drag_active).not.toHaveBeenCalled()
    expect(on_files).not.toHaveBeenCalled()
  })

  it(`global dragend clears activity after unbalanced dragenter events`, () => {
    const on_drag_active = vi.fn()
    const transfer = files_of(`file.txt`)
    const { node } = attach_file_drop({ on_files: vi.fn(), on_drag_active })

    node.dispatchEvent(drag_event(`dragenter`, transfer))
    node.dispatchEvent(drag_event(`dragenter`, transfer))
    expect(node.hasAttribute(`data-drag-active`)).toBe(true)
    globalThis.dispatchEvent(drag_event(`dragend`, transfer))

    expect(node.hasAttribute(`data-drag-active`)).toBe(false)
    expect(active_calls(on_drag_active)).toEqual([true, false])
  })

  // a consumer's handler failing must not itself become an unhandled rejection
  const consumer_failure = new Error(`consumer rejected files`)
  const reporting_error = new Error(`error reporter failed`)
  it.each<[string, FileDropOptions[`on_error`], Error]>([
    [`on_error is absent`, undefined, consumer_failure],
    [
      `on_error throws`,
      () => {
        throw reporting_error
      },
      reporting_error,
    ],
    [`on_error rejects`, () => Promise.reject(reporting_error), reporting_error],
  ])(`uses reportError when %s`, async (_description, on_error, reported) => {
    const report_error = vi.fn()
    vi.stubGlobal(`reportError`, report_error)
    onTestFinished(() => void vi.unstubAllGlobals())
    const on_files = () => {
      throw consumer_failure
    }
    const { node } = attach_file_drop({ on_files, on_error })

    drop(node, files_of(`file.txt`))
    await vi.waitFor(() => expect(report_error).toHaveBeenCalledExactlyOnceWith(reported))
  })

  it(`cleanup removes handlers, resets state, and restores the prior data attribute`, () => {
    const node = create_element()
    node.setAttribute(`data-drag-active`, `consumer-value`)
    const [on_files, on_drag_active] = [vi.fn(), vi.fn()]
    const transfer = files_of(`file.txt`)
    const { cleanup } = attach_file_drop({ on_files, on_drag_active }, node)

    node.dispatchEvent(drag_event(`dragenter`, transfer))
    cleanup?.()
    expect(active_calls(on_drag_active)).toEqual([true, false])
    expect(node.getAttribute(`data-drag-active`)).toBe(`consumer-value`)

    const drop_event = drag_event(`drop`, transfer)
    node.dispatchEvent(drop_event)
    expect(drop_event.defaultPrevented).toBe(false)
    expect(on_files).not.toHaveBeenCalled()
  })
})
