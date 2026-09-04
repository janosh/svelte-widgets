// Flatten a drop into the files it actually carries. DataTransfer.files stops at the top
// level — a dropped directory reports one zero-byte File named after it — and
// webkitGetAsEntry, the only way inside, is readable during the drop event alone.

// Matches the comma-separated specifiers of `<input type="file" accept="…">`: extensions,
// exact MIME types and MIME wildcards. Empty accept means no restriction, as natively.
export const file_matches_accept = (file: File, accept = ``): boolean => {
  const tokens = accept
    .split(`,`)
    .map((token) => token.trim().toLowerCase())
    .filter(Boolean)
  if (tokens.length === 0) return true

  const file_name = file.name.toLowerCase()
  const mime_type = file.type.toLowerCase()
  return tokens.some((token) => {
    if (token.startsWith(`.`)) return file_name.endsWith(token)
    if (token.endsWith(`/*`)) return mime_type.startsWith(token.slice(0, -1))
    return mime_type === token
  })
}

// Native picker order: drop disallowed files first, so a single-select consumer gets the
// first acceptable one rather than being blocked by an unacceptable first item.
export const filter_accepted_files = (
  files: Iterable<File>,
  accept = ``,
  multiple = false,
): File[] => {
  const accepted = Array.from(files).filter((file) => file_matches_accept(file, accept))
  return multiple ? accepted : accepted.slice(0, 1)
}

const is_file_entry = (entry: FileSystemEntry): entry is FileSystemFileEntry =>
  entry.isFile

const is_directory_entry = (entry: FileSystemEntry): entry is FileSystemDirectoryEntry =>
  entry.isDirectory

const read_all_entries = async (
  reader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> => {
  const entries: FileSystemEntry[] = []
  // readEntries returns at most 100 per call and ends with an empty batch
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>(reader.readEntries.bind(reader))
    if (batch.length === 0) return entries
    entries.push(...batch)
  }
}

// Entry traversal can follow symlink cycles. Cap depth for chains and total reads for
// branching cycles; report overflow rather than silently dropping files.
const MAX_DEPTH = 32
const MAX_DIRS = 20_000

const files_from_entry = async (
  entry: FileSystemEntry,
  budget: { remaining: number },
  depth = 0,
): Promise<File[]> => {
  if (is_file_entry(entry)) {
    return [await new Promise<File>(entry.file.bind(entry))]
  }
  if (!is_directory_entry(entry)) return []
  if (depth >= MAX_DEPTH) {
    throw new Error(
      `Dropped directory ${entry.fullPath} nests deeper than ${MAX_DEPTH} levels`,
    )
  }
  if (--budget.remaining < 0) {
    throw new Error(
      `Dropped tree expands past ${MAX_DIRS} directories at ${entry.fullPath}`,
    )
  }
  const entries = await read_all_entries(entry.createReader())
  return (
    await Promise.all(entries.map((child) => files_from_entry(child, budget, depth + 1)))
  ).flat()
}

// Every file in a drop, directories expanded depth-first in the browser's own order,
// falling back to flat DataTransfer.files when the entry API yields nothing (a paste or a
// synthetic drop). Rejects past the caps above, so drop handlers must catch — a symlink
// cycle is the realistic way there.
export const files_from_data_transfer = async (
  data_transfer: DataTransfer,
): Promise<File[]> => {
  const items = Array.from(data_transfer.items)
  const entries = items.map((item) => item.webkitGetAsEntry?.())
  if (!entries.some(Boolean)) return Array.from(data_transfer.files)
  // one budget for the whole drop, so branches cannot each spend the full allowance
  const budget = { remaining: MAX_DIRS }
  return (
    await Promise.all(
      items.map(async (item, item_idx) => {
        const entry = entries[item_idx]
        if (entry) return files_from_entry(entry, budget)
        const file = item.kind === `file` ? item.getAsFile() : null
        return file ? [file] : []
      }),
    )
  ).flat()
}
