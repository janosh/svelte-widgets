import { download, type DownloadData } from './download'
import { to_error } from '../utils'

// Where an export UI saves its files: a base name plus, where the File System Access API allows,
// a chosen folder, else browser downloads via `download`. Folder writes refuse names that
// already exist, but best effort only: the API has no exclusive create, so another program
// creating the same name between the last check and the write can still be overwritten.

export type FileSaver = (
  data: DownloadData,
  filename: string,
  mime: string,
) => void | Promise<void>

export interface FileExportContext {
  filename: string
  save: FileSaver
  prepare: (
    filename: string,
    signal?: AbortSignal,
  ) => Promise<(data: DownloadData, mime: string) => Promise<void>>
}

// One destination per export UI, shared by all its formats. Native handles stay in memory.
// `run` validates the name, then hands the task a `save` (check, then write) and a `prepare`
// (check now, write later) so long exports can fail on an existing file before encoding.
// The write checks again and claims the name page-wide, so same-name exports can't clobber
// each other in this page.
const writing = new Set<string>()

const assert_free = async (directory: FileSystemDirectoryHandle, filename: string) => {
  try {
    await directory.getFileHandle(filename)
  } catch (error) {
    if (error instanceof DOMException && error.name === `NotFoundError`) return
    throw error
  }
  throw new Error(`${directory.name}/${filename} already exists. Choose another name.`)
}

export class FileExportState {
  // follows the default until the user types a name, which then sticks (a default derived from
  // e.g. the current trajectory frame changes during playback)
  #typed_filename = $state<string | null>(null)
  get filename(): string {
    return this.#typed_filename ?? this.default_filename()
  }
  set filename(name: string) {
    this.#typed_filename = name
  }
  directory = $state.raw<FileSystemDirectoryHandle | null>(null)
  busy = $state(false)
  error = $state(``)
  // checks the trimmed name `run` passes on, so ` .` can't slip through as a dotfile
  filename_error = $derived.by(() => {
    const name = this.filename.trim()
    if (!name || /^[.]+$/.test(name)) return `Enter a file name.`
    if (/[/\\\p{Cc}]/u.test(name))
      return `Enter a name without path separators; choose the folder below.`
    return ``
  })
  disabled = $derived(this.busy || Boolean(this.filename_error))

  constructor(private readonly default_filename: () => string) {}

  async run(task: (context: FileExportContext) => unknown) {
    if (this.busy) return
    this.error = ``
    this.busy = true
    try {
      if (this.filename_error) throw new Error(this.filename_error)
      const directory = this.directory
      const prepare = async (filename: string, signal?: AbortSignal) => {
        if (directory) await assert_free(directory, filename)
        signal?.throwIfAborted()
        return async (data: DownloadData, mime: string) => {
          signal?.throwIfAborted()
          if (!directory) return download(data, filename, mime)
          // keyed by folder name, not identity: two pickers on one folder give distinct handles
          const key = `${directory.name}/${filename}`
          if (writing.has(key)) throw new Error(`${key} is already being exported.`)
          writing.add(key)
          try {
            await assert_free(directory, filename)
            const handle = await directory.getFileHandle(filename, { create: true })
            try {
              signal?.throwIfAborted()
              const writable = await handle.createWritable()
              await new Blob([data], { type: mime }).stream().pipeTo(writable, { signal })
            } catch (error) {
              // writes land on disk only on close, so a failed one leaves the empty file the
              // create made, which would block a retry. Remove it only while still empty: if
              // it has content, another program wrote it after our check.
              try {
                if ((await handle.getFile()).size === 0)
                  await directory.removeEntry(filename)
                else
                  console.error(`Kept ${key}: another program wrote it after our check`)
              } catch (cleanup_error) {
                console.error(`Cannot remove partial ${key}:`, cleanup_error)
              }
              throw error
            }
          } finally {
            writing.delete(key)
          }
        }
      }
      await task({
        filename: this.filename.trim(),
        prepare,
        save: async (data, filename, mime) => (await prepare(filename))(data, mime),
      })
    } catch (error) {
      this.error = to_error(error).message
      console.error(`Export ${this.filename} failed:`, error)
    } finally {
      this.busy = false
    }
  }
}
