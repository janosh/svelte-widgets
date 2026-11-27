import { download, type DownloadData } from './download'
import { file_pickers, PICKER_ID } from '../internal/file-pickers'
import { to_error } from '../utils'

// Where an export UI saves its files: a base name plus a destination, by default browser
// downloads via `download`. Where the File System Access API allows, the user may instead pick
// a folder, whose writes refuse names that already exist (best effort only: the API has no
// exclusive create, so another program creating the same name between the last check and
// the write can still be overwritten), or have a native Save As dialog ask for each file,
// which confirms overwrites itself.

// Writes one export's data to the destination `open` checked (and, for Save As, chose)
export type FileWriter = (data: DownloadData) => Promise<void>

export interface FileExportContext {
  filename: string
  // Where `open` writes, so an export of several files can refuse Save As (one dialog per
  // click: a second has no user activation left) before showing any dialog
  destination: ExportTarget
  // Checks `filename` against the destination now, so a long export fails (or the user picks
  // where it goes) before anything is encoded, and returns the writer to call once it is
  open: (filename: string, mime: string, signal?: AbortSignal) => Promise<FileWriter>
}

export type ExportTarget = `downloads` | `save-as` | FileSystemDirectoryHandle

// Folder writes in progress, claimed page-wide so same-name exports can't clobber each other
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

// One destination per export UI, shared by all its formats. Native handles stay in memory.
// `run` validates the name and hands the task `open`.
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
  destination = $state.raw<ExportTarget>(`downloads`)
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

  // A dismissed Save As dialog (ExportCancelledError) or the abort reason of a signal the task
  // passed to `open` ends the task without an error message; any other error shows, even an
  // AbortError from elsewhere
  async run(task: (context: FileExportContext) => unknown) {
    if (this.busy) return
    this.error = ``
    this.busy = true
    const signals: AbortSignal[] = []
    // Save As files picked but not (fully) written yet, removed again while still empty
    const unwritten = new Set<FileSystemFileHandle>()
    try {
      if (this.filename_error) throw new Error(this.filename_error)
      const { destination } = this
      const open = async (filename: string, mime: string, signal?: AbortSignal) => {
        if (signal) signals.push(signal)
        signal?.throwIfAborted()
        if (destination === `downloads`)
          return async (data: DownloadData) => {
            signal?.throwIfAborted()
            download(data, filename, mime)
          }
        if (destination === `save-as`) {
          const handle = await save_file_dialog(filename, mime)
          unwritten.add(handle)
          signal?.throwIfAborted()
          return async (data: DownloadData) => {
            signal?.throwIfAborted()
            // writes go to a swap file until close, so a failed one leaves any old file intact
            const writable = await handle.createWritable()
            await new Blob([data], { type: mime }).stream().pipeTo(writable, { signal })
            unwritten.delete(handle)
          }
        }
        return open_in_folder(destination, filename, mime, signal)
      }
      await task({ filename: this.filename.trim(), destination, open })
    } catch (error) {
      if (
        error instanceof ExportCancelledError ||
        signals.some(({ aborted, reason }) => aborted && error === reason)
      )
        return
      this.error = to_error(error).message
      console.error(`Export ${this.filename} failed:`, error)
    } finally {
      // only awaited when needed: callers watching `busy` see it clear as soon as the task does
      if (unwritten.size > 0) await Promise.all([...unwritten].map(remove_if_empty))
      this.busy = false
    }
  }
}

// Thrown by `open` when the user dismisses its Save As dialog
export class ExportCancelledError extends Error {
  constructor(filename: string) {
    super(`Export of ${filename} cancelled`)
    this.name = 'ExportCancelledError'
  }
}

// Chromium creates a picked file when its dialog closes, so an export that fails or stops
// before writing would leave it empty. Only an empty one goes: a confirmed overwrite of an
// existing file keeps its old content until a write completes.
async function remove_if_empty(
  handle: FileSystemFileHandle & { remove?: () => Promise<void> },
) {
  try {
    if ((await handle.getFile()).size === 0) await handle.remove?.()
  } catch (error) {
    console.error(`Cannot remove empty ${handle.name}:`, error)
  }
}

// The file a native Save As dialog picks for `filename`, filtered to its extension and mime
async function save_file_dialog(
  filename: string,
  mime: string,
): Promise<FileSystemFileHandle> {
  const picker = file_pickers().save
  if (!picker) throw new Error(`This page cannot open a Save As dialog.`)
  const extension = /\.(?<ext>[\da-z]{1,15})$/i.exec(filename)?.groups?.ext
  const base_mime = mime.split(`;`)[0].trim()
  try {
    return await picker({
      id: PICKER_ID,
      suggestedName: filename,
      ...(extension &&
        base_mime && { types: [{ accept: { [base_mime]: [`.${extension}`] } }] }),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === `AbortError`)
      throw new ExportCancelledError(filename)
    throw error
  }
}

async function open_in_folder(
  directory: FileSystemDirectoryHandle,
  filename: string,
  mime: string,
  signal?: AbortSignal,
): Promise<FileWriter> {
  await assert_free(directory, filename)
  signal?.throwIfAborted()
  return async (data: DownloadData) => {
    signal?.throwIfAborted()
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
          if ((await handle.getFile()).size === 0) await directory.removeEntry(filename)
          else console.error(`Kept ${key}: another program wrote it after our check`)
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
