import {
  files_from_data_transfer,
  file_matches_accept,
  filter_accepted_files,
} from '$lib/file-drop'
import { expect, test, vi } from 'vite-plus/test'

// happy-dom has DataTransfer but no webkitGetAsEntry, so drops use hand-rolled entries
// implementing the callback APIs the real thing exposes - entry.file(cb, err) and
// reader.readEntries(cb, err), batching included since draining it is the tricky part.

// `file` defaults to a File named after the entry; error and timing tests pass their own.
const file_entry = (
  name: string,
  file: FileSystemFileEntry[`file`] = (on_file) => on_file(new File([name], name)),
): FileSystemFileEntry =>
  ({
    isFile: true,
    isDirectory: false,
    name,
    fullPath: `/${name}`,
    file,
  }) as unknown as FileSystemFileEntry

// `batch_size` mirrors the browser: readEntries returns at most 100 per call and ends
// with an empty batch, so one call is not enough.
const dir_entry = (
  name: string,
  children: FileSystemEntry[],
  batch_size = children.length,
): FileSystemDirectoryEntry => {
  const entry = {
    isFile: false,
    isDirectory: true,
    name,
    fullPath: `/${name}`,
    // per-reader cursor like the browser's: a second reader restarts the listing
    createReader: () => {
      let read_idx = 0
      return {
        readEntries: (on_entries: (entries: FileSystemEntry[]) => void) => {
          const batch = children.slice(read_idx, read_idx + Math.max(batch_size, 1))
          read_idx += batch.length
          on_entries(batch)
        },
      }
    },
  }
  return entry as unknown as FileSystemDirectoryEntry
}

const drop = (entries: (FileSystemEntry | null)[], files: File[] = []): DataTransfer =>
  ({
    items: entries.map((entry) => ({ webkitGetAsEntry: () => entry })),
    files,
  }) as unknown as DataTransfer

const names = (files: File[]) => files.map((file) => file.name)

test.each([
  [`case-insensitive extension`, new File([``], `REPORT.PDF`), `.pdf`, true],
  [
    `exact MIME type`,
    new File([``], `renamed.bin`, { type: `application/pdf` }),
    `application/pdf`,
    true,
  ],
  [
    `MIME wildcard`,
    new File([``], `photo.unknown`, { type: `image/avif` }),
    `image/*`,
    true,
  ],
  [
    `comma-separated alternatives`,
    new File([``], `notes.txt`, { type: `text/plain` }),
    `.md, text/plain`,
    true,
  ],
  [`empty accept`, new File([``], `anything.bin`), ``, true],
  [
    `non-matching MIME and extension`,
    new File([``], `data.json`, { type: `application/json` }),
    `.txt,image/*`,
    false,
  ],
] as const)(`accept matching supports %s`, (_description, file, accept, expected) => {
  expect(file_matches_accept(file, accept)).toBe(expected)
})

test(`accept filtering happens before the multiple limit`, () => {
  const files = [
    new File([``], `skip.txt`, { type: `text/plain` }),
    new File([``], `first.png`, { type: `image/png` }),
    new File([``], `second.png`, { type: `image/png` }),
  ]

  expect(names(filter_accepted_files(files, `image/*`))).toEqual([`first.png`])
  expect(names(filter_accepted_files(files, `image/*`, true))).toEqual([
    `first.png`,
    `second.png`,
  ])
})

test(`plain files come back in drop order`, async () => {
  const dropped = drop([file_entry(`a.txt`), file_entry(`b.txt`)])

  expect(names(await files_from_data_transfer(dropped))).toEqual([`a.txt`, `b.txt`])
})

// why the helper exists: DataTransfer.files reports a dropped directory as one zero-byte
// File named after it, losing the contents
test(`directories are expanded depth-first, keeping their listed order`, async () => {
  const lib_dir = dir_entry(`lib`, [file_entry(`deep.ts`)])
  const src_dir = dir_entry(`src`, [file_entry(`index.ts`), lib_dir])
  const tree = dir_entry(`project`, [
    file_entry(`readme.md`),
    dir_entry(`empty`, []),
    src_dir,
    file_entry(`package.json`),
  ])
  const dropped = drop([tree, file_entry(`loose.txt`)], [new File([``], `project`)])

  expect(names(await files_from_data_transfer(dropped))).toEqual([
    `readme.md`,
    `index.ts`,
    `deep.ts`,
    `package.json`,
    `loose.txt`,
  ])
})

test(`a directory larger than one readEntries batch is drained fully`, async () => {
  const children = Array.from({ length: 250 }, (_unused, idx) =>
    file_entry(`file-${idx}.txt`),
  )
  const big_dir = dir_entry(`big`, children, 100)

  const files = await files_from_data_transfer(drop([big_dir]))
  expect(files).toHaveLength(250) // two full batches, a partial one, then an empty one
  expect(names(files).slice(-1)).toEqual([`file-249.txt`])

  // a fresh reader restarts the listing, so a second drop is not silently empty
  expect(await files_from_data_transfer(drop([big_dir]))).toHaveLength(250)
})

// entries are absent on synthetic drops and outside the drop event, leaving only files
test.each([
  [`items yield no entries`, [null, null]],
  [`there are no items at all`, []],
])(`falls back to DataTransfer.files when %s`, async (_desc, entries) => {
  const dropped = drop(entries, [new File([`x`], `plain.txt`)])

  expect(names(await files_from_data_transfer(dropped))).toEqual([`plain.txt`])
})

test(`an item without webkitGetAsEntry is skipped, not fatal`, async () => {
  const dropped = {
    items: [{}, { webkitGetAsEntry: () => file_entry(`kept.txt`) }],
    files: [],
  } as unknown as DataTransfer

  expect(names(await files_from_data_transfer(dropped))).toEqual([`kept.txt`])
})

test(`flat file items are kept when only some items expose entries`, async () => {
  const flat_file = new File([`flat`], `flat.txt`)
  const dropped = {
    items: [
      { kind: `file`, webkitGetAsEntry: () => file_entry(`entry.txt`) },
      { kind: `file`, webkitGetAsEntry: () => null, getAsFile: () => flat_file },
    ],
  } as unknown as DataTransfer

  expect(names(await files_from_data_transfer(dropped))).toEqual([
    `entry.txt`,
    `flat.txt`,
  ])
})

test(`a rejected entry.file call rejects the whole expansion`, async () => {
  const failure = new DOMException(`NotFoundError`)
  const broken = file_entry(`broken.txt`, (_on_file, on_error) => on_error?.(failure))

  await expect(files_from_data_transfer(drop([broken]))).rejects.toThrow(failure)
})

// `depth` directories wrapped around one file, outermost first: d{depth-1}/.../d0/bottom
const nested_dirs = (depth: number): FileSystemEntry => {
  let entry: FileSystemEntry = file_entry(`bottom.txt`)
  for (let level = 0; level < depth; level++) entry = dir_entry(`d${level}`, [entry])
  return entry
}

// a symlink to an ancestor nests without end (the entry API resolves it), so uncapped
// recursion hangs the tab. Both sides of the cap are pinned so it can't trip a real tree.
test(`directory nesting is capped`, async () => {
  const deepest_allowed = drop([nested_dirs(32)])
  expect(names(await files_from_data_transfer(deepest_allowed))).toEqual([`bottom.txt`])

  const too_deep = drop([nested_dirs(33)])
  await expect(files_from_data_transfer(too_deep)).rejects.toThrow(
    `Dropped directory /d0 nests deeper than 32 levels`,
  )
})

// two sibling links to a common ancestor branch as fast as they descend, so the depth cap
// alone never trips (300k reads by depth 17) - only the entry budget stops it. The read
// counter fails loudly if it stops: an uncapped run is a non-yielding microtask loop that
// vitest's timeout cannot interrupt.
test(`a branching cycle is stopped by the entry budget`, async () => {
  let reads = 0
  const fanout_dir = (): FileSystemEntry =>
    ({
      isFile: false,
      isDirectory: true,
      name: `loop`,
      fullPath: `/loop`,
      createReader: () => {
        let drained = false
        return {
          readEntries: (on_entries: (entries: FileSystemEntry[]) => void) => {
            if (++reads > 50_000) throw new Error(`budget never tripped after ${reads}`)
            on_entries(drained ? [] : [fanout_dir(), fanout_dir()])
            drained = true
          },
        }
      },
    }) as unknown as FileSystemDirectoryEntry

  const walk = files_from_data_transfer(drop([fanout_dir()]))
  await expect(walk).rejects.toThrow(
    `Dropped tree expands past 20000 directories at /loop`,
  )
})

test(`entries are read in parallel rather than one after another`, async () => {
  const started: string[] = []
  const slow_entry = (name: string, delay_ms: number) =>
    file_entry(name, (on_file) => {
      started.push(name)
      setTimeout(() => on_file(new File([name], name)), delay_ms)
    })

  vi.useFakeTimers()
  try {
    const pending = files_from_data_transfer(
      drop([slow_entry(`slow.txt`, 50), slow_entry(`fast.txt`, 1)]),
    )
    expect(started).toEqual([`slow.txt`, `fast.txt`]) // both in flight before either lands
    await vi.advanceTimersByTimeAsync(50)
    expect(names(await pending)).toEqual([`slow.txt`, `fast.txt`]) // order still preserved
  } finally {
    vi.useRealTimers()
  }
})
