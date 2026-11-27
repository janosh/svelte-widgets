import { download, type DownloadData } from './download'
import { to_error } from '../utils'

// Where an export UI saves its files: a base name plus, where the File System Access API allows,
// a chosen folder (writes refuse to overwrite), else browser downloads via `download`.

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
export class FileExportState {
  filename = $derived.by(() => this.default_filename())
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
        if (directory) {
          let existing: FileSystemFileHandle | undefined
          try {
            existing = await directory.getFileHandle(filename)
          } catch (error) {
            if (!(error instanceof DOMException && error.name === `NotFoundError`))
              throw error
          }
          if (existing)
            throw new Error(
              `${directory.name}/${filename} already exists. Choose another name.`,
            )
        }
        signal?.throwIfAborted()
        return async (data: DownloadData, mime: string) => {
          signal?.throwIfAborted()
          if (!directory) return download(data, filename, mime)
          const handle = await directory.getFileHandle(filename, { create: true })
          try {
            signal?.throwIfAborted()
            const writable = await handle.createWritable()
            await new Blob([data], { type: mime }).stream().pipeTo(writable, { signal })
          } catch (error) {
            // the create above left an empty file that would block a retry under this name
            await directory.removeEntry(filename).catch((cleanup_error: unknown) => {
              console.error(
                `Cannot remove partial ${directory.name}/${filename}:`,
                cleanup_error,
              )
            })
            throw error
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
