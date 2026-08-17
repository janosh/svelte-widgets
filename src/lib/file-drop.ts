// Flatten a drop into the files it actually carries.
//
// DataTransfer.files stops at the top level: drop a directory and it reports one
// zero-byte File named after the directory. webkitGetAsEntry is the only way to see
// inside, and it is only readable during the drop event itself.

// Match the comma-separated unique file type specifiers accepted by
// `<input type="file" accept="…">`: filename extensions, exact MIME types and MIME
// wildcards. Empty accept strings impose no restriction, like the native input.
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

// Apply drop/input selection constraints in the same order as a native picker:
// disallowed files disappear first, then a single-select consumer gets the first
// remaining file rather than an unacceptable first item blocking later matches.
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
  // readEntries hands back at most 100 per call and signals the end with an empty batch,
  // so one call is only enough for a small directory
  while (true) {
    const batch = await new Promise<FileSystemEntry[]>(reader.readEntries.bind(reader))
    if (batch.length === 0) return entries
    entries.push(...batch)
  }
}

// The entry API resolves symlinks, so a directory linked to one of its own ancestors
// recurses forever and hangs the tab. Both caps are needed: depth alone stops a single
// chain before the stack does, but two sibling links to a common ancestor branch as fast
// as they descend — measured at 300k reads by depth 17 — so only a budget over the whole
// expansion bounds that. Reported rather than silently truncated: a drop that quietly
// lost half its files is worse than one that failed.
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

// Every file in a drop, with dropped directories expanded depth-first and in the order
// the browser lists them. Falls back to the flat DataTransfer.files list when the entry
// API yields nothing, which is what a paste or a synthetic drop event gives.
//
// Rejects on a tree that nests or branches past the caps above, so a drop handler has to
// catch — a symlink cycle is the realistic way to get there.
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
