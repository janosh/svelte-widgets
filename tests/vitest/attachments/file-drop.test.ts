import { file_drop } from '$lib/attachments'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { create_element, data_transfer, drag_event } from '../index'

describe(`file_drop`, () => {
  const cleanups: (() => void)[] = []
  afterEach(() => {
    for (const cleanup of cleanups.splice(0)) cleanup()
    vi.unstubAllGlobals()
  })
  const attach_file_drop = (
    options: Parameters<typeof file_drop>[0],
    node = create_element(),
  ) => {
    const cleanup = file_drop(options)(node)
    if (cleanup) cleanups.push(cleanup)
    return { node, cleanup }
  }
  const flush_tasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
  const pending_until_aborted = (signal: AbortSignal) =>
    new Promise<void>((_resolve, reject) => {
      signal.addEventListener(
        `abort`,
        () => reject(new DOMException(`Drop superseded`, `AbortError`)),
        { once: true },
      )
    })
  const delayed_transfer = (file: File) => {
    let deliver_file: FileCallback | undefined
    const entry = {
      isFile: true,
      isDirectory: false,
      name: file.name,
      fullPath: `/${file.name}`,
      file: (callback: FileCallback) => {
        deliver_file = callback
      },
    } as unknown as FileSystemFileEntry
    const item = {
      kind: `file`,
      webkitGetAsEntry: () => entry,
    } as unknown as DataTransferItem
    return {
      transfer: data_transfer([], [item]),
      resolve: () => {
        if (!deliver_file)
          throw new Error(`Delayed file ${file.name} was never requested`)
        deliver_file(file)
      },
    }
  }

  it(`tracks nested drag activity, filters accept types, and honors multiple`, async () => {
    const on_files = vi.fn()
    const on_drag_active = vi.fn()
    const transfer = data_transfer([
      new File([`one`], `one.TXT`, { type: `text/plain` }),
      new File([`image`], `photo.webp`, { type: `image/webp` }),
      new File([`pdf`], `notes.bin`, { type: `application/pdf` }),
      new File([`skip`], `skip.json`, { type: `application/json` }),
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
    node.dispatchEvent(drag_event(`drop`, transfer))

    await vi.waitFor(() => expect(on_files).toHaveBeenCalledOnce())
    expect(on_files.mock.calls[0][0].map((file: File) => file.name)).toEqual([
      `one.TXT`,
      `photo.webp`,
      `notes.bin`,
    ])
    expect(node.hasAttribute(`data-drag-active`)).toBe(false)
    expect(on_drag_active.mock.calls.map(([active]) => active)).toEqual([true, false])
  })

  it.each([
    [
      `single-file mode chooses the first accepted file`,
      [
        new File([``], `skip.txt`, { type: `text/plain` }),
        new File([``], `first.png`, { type: `image/png` }),
        new File([``], `second.png`, { type: `image/png` }),
      ],
      [[`first.png`]],
    ],
    [
      `a drop with no accepted file is ignored`,
      [new File([``], `notes.txt`, { type: `text/plain` })],
      [],
    ],
  ] as const)(`%s`, async (_description, files, expected_calls) => {
    const on_files = vi.fn<(files: File[]) => void>()
    const { node } = attach_file_drop({ accept: `image/*`, on_files })

    node.dispatchEvent(drag_event(`drop`, data_transfer([...files])))
    await flush_tasks()
    expect(
      on_files.mock.calls.map(([accepted]) => accepted.map((file) => file.name)),
    ).toEqual(expected_calls)
  })

  it(`ignores stale expansion and aborts superseded callbacks and cleanup`, async () => {
    const on_error = vi.fn()
    const on_files = vi.fn((_files: File[], signal: AbortSignal) =>
      pending_until_aborted(signal),
    )
    const { node, cleanup } = attach_file_drop({ accept: `.txt`, on_files, on_error })
    const first = delayed_transfer(new File([``], `first.txt`))
    const second = new File([``], `second.txt`)

    node.dispatchEvent(drag_event(`drop`, first.transfer))
    node.dispatchEvent(drag_event(`drop`, data_transfer([second])))
    await vi.waitFor(() => expect(on_files).toHaveBeenCalledOnce())
    expect(on_files.mock.calls[0][0].map((file: File) => file.name)).toEqual([
      `second.txt`,
    ])

    first.resolve()
    await flush_tasks()
    expect(on_files).toHaveBeenCalledOnce()

    const rejected_transfer = data_transfer([new File([``], `rejected.png`)])
    node.dispatchEvent(drag_event(`drop`, rejected_transfer))
    await flush_tasks()
    expect(on_files.mock.calls.map(([, signal]) => signal.aborted)).toEqual([false])

    const third = new File([``], `third.txt`)
    node.dispatchEvent(drag_event(`drop`, data_transfer([third])))
    await vi.waitFor(() => expect(on_files).toHaveBeenCalledTimes(2))
    expect(on_files.mock.calls.map(([, signal]) => signal.aborted)).toEqual([true, false])

    const after_cleanup = delayed_transfer(new File([``], `after-cleanup.txt`))
    node.dispatchEvent(drag_event(`drop`, after_cleanup.transfer))
    cleanup?.()
    after_cleanup.resolve()
    await flush_tasks()
    expect(on_files.mock.calls.map(([, signal]) => signal.aborted)).toEqual([true, true])
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
    if (typeof attached.cleanup !== `function`) throw new Error(`Missing cleanup`)
    cleanup = attached.cleanup
    const first_transfer = data_transfer([new File([``], `first.txt`)])
    const second_transfer = data_transfer([new File([``], `second.txt`)])

    attached.node.dispatchEvent(drag_event(`drop`, first_transfer))
    await vi.waitFor(() => expect(on_files).toHaveBeenCalledOnce())
    attached.node.dispatchEvent(drag_event(`drop`, second_transfer))
    await flush_tasks()

    expect(on_files).toHaveBeenCalledOnce()
  })

  it(`reports directory expansion failures through on_error`, async () => {
    const failure = new DOMException(`entry disappeared`, `NotFoundError`)
    const broken_entry = {
      isFile: true,
      isDirectory: false,
      name: `broken.txt`,
      fullPath: `/broken.txt`,
      file: (_on_file: FileCallback, on_error?: ErrorCallback) => on_error?.(failure),
    } as FileSystemFileEntry
    const item = {
      kind: `file`,
      webkitGetAsEntry: () => broken_entry,
    } as unknown as DataTransferItem
    const on_files = vi.fn()
    const on_error = vi.fn()
    const { node } = attach_file_drop({ multiple: true, on_files, on_error })

    node.dispatchEvent(drag_event(`drop`, data_transfer([], [item])))
    await vi.waitFor(() => expect(on_error).toHaveBeenCalledExactlyOnceWith(failure))
    expect(on_files).not.toHaveBeenCalled()
  })

  it(`disabled mode prevents browser navigation without activating or processing`, () => {
    const on_files = vi.fn()
    const on_drag_active = vi.fn()
    const { node, cleanup } = attach_file_drop({
      disabled: true,
      on_files,
      on_drag_active,
    })
    const transfer = data_transfer([
      new File([``], `ignored.txt`, { type: `text/plain` }),
    ])
    const dragover = drag_event(`dragover`, transfer)
    const drop = drag_event(`drop`, transfer)

    node.dispatchEvent(dragover)
    node.dispatchEvent(drop)
    expect(cleanup).toBeTypeOf(`function`)
    expect(dragover.defaultPrevented).toBe(true)
    expect(transfer.dropEffect).toBe(`none`)
    expect(drop.defaultPrevented).toBe(true)
    expect(node.hasAttribute(`data-drag-active`)).toBe(false)
    expect(on_drag_active).not.toHaveBeenCalled()
    expect(on_files).not.toHaveBeenCalled()
  })

  it(`global dragend clears activity after unbalanced dragenter events`, () => {
    const on_drag_active = vi.fn()
    const transfer = data_transfer([new File([``], `file.txt`)])
    const { node } = attach_file_drop({ on_files: vi.fn(), on_drag_active })

    node.dispatchEvent(drag_event(`dragenter`, transfer))
    node.dispatchEvent(drag_event(`dragenter`, transfer))
    expect(node.hasAttribute(`data-drag-active`)).toBe(true)
    globalThis.dispatchEvent(drag_event(`dragend`, transfer))

    expect(node.hasAttribute(`data-drag-active`)).toBe(false)
    expect(on_drag_active.mock.calls.map(([active]) => active)).toEqual([true, false])
  })

  it(`uses reportError when asynchronous processing fails without on_error`, async () => {
    const report_error = vi.fn()
    vi.stubGlobal(`reportError`, report_error)
    const failure = new Error(`consumer rejected files`)
    const on_files = vi.fn((files: File[], signal: AbortSignal) => {
      if (files[0]?.name === `second.txt`) throw failure
      return pending_until_aborted(signal)
    })
    const { node } = attach_file_drop({ on_files })

    const first_transfer = data_transfer([new File([``], `first.txt`)])
    node.dispatchEvent(drag_event(`drop`, first_transfer))
    await vi.waitFor(() => expect(on_files).toHaveBeenCalledOnce())
    const second_transfer = data_transfer([new File([``], `second.txt`)])
    node.dispatchEvent(drag_event(`drop`, second_transfer))
    await vi.waitFor(() => expect(report_error).toHaveBeenCalledExactlyOnceWith(failure))
    expect(on_files.mock.calls.map(([, signal]) => signal.aborted)).toEqual([true, false])
  })

  const reporting_error = new Error(`error reporter failed`)
  it.each([
    [
      `throws`,
      () => {
        throw reporting_error
      },
    ],
    [`rejects`, () => Promise.reject(reporting_error)],
  ])(`uses reportError when on_error %s`, async (_description, report_failure) => {
    const report_error = vi.fn()
    vi.stubGlobal(`reportError`, report_error)
    const initial_failure = new Error(`consumer rejected files`)
    const on_error = vi.fn(report_failure)
    const { node } = attach_file_drop({
      on_files: vi.fn(() => {
        throw initial_failure
      }),
      on_error,
    })

    const transfer = data_transfer([new File([``], `file.txt`)])
    node.dispatchEvent(drag_event(`drop`, transfer))
    await vi.waitFor(() =>
      expect(report_error).toHaveBeenCalledExactlyOnceWith(reporting_error),
    )
    expect(on_error).toHaveBeenCalledExactlyOnceWith(initial_failure)
  })

  it(`cleanup removes handlers, resets state, and restores the prior data attribute`, () => {
    const node = create_element()
    node.setAttribute(`data-drag-active`, `consumer-value`)
    const on_files = vi.fn()
    const on_drag_active = vi.fn()
    const transfer = data_transfer([new File([``], `file.txt`)])
    const { cleanup } = attach_file_drop({ on_files, on_drag_active }, node)

    node.dispatchEvent(drag_event(`dragenter`, transfer))
    cleanup?.()
    expect(on_drag_active.mock.calls.map(([active]) => active)).toEqual([true, false])
    expect(node.getAttribute(`data-drag-active`)).toBe(`consumer-value`)

    const drop = drag_event(`drop`, transfer)
    node.dispatchEvent(drop)
    expect(drop.defaultPrevented).toBe(false)
    expect(on_files).not.toHaveBeenCalled()
  })
})
