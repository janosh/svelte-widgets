// The File System Access pickers this page may use, bound to the window. Chromium defines them
// in every frame but rejects them in one cross-origin to the top-level page (a VS Code
// webview, a notebook's output iframe). Reading the top frame's origin throws exactly there,
// so that read is the feature test.

interface DirectoryPickerOptions {
  id: string
  mode: `readwrite`
  startIn: FileSystemDirectoryHandle | `downloads`
}
interface SaveFilePickerOptions {
  id: string
  suggestedName: string
  types?: { accept: Record<string, string[]> }[]
}
type Pickers = {
  showDirectoryPicker?: (
    options: DirectoryPickerOptions,
  ) => Promise<FileSystemDirectoryHandle>
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
}

const same_origin_as_top = (): boolean => {
  try {
    return globalThis.top?.location.origin === globalThis.location.origin
  } catch {
    return false
  }
}

export function file_pickers(): {
  directory?: NonNullable<Pickers[`showDirectoryPicker`]>
  save?: NonNullable<Pickers[`showSaveFilePicker`]>
} {
  if (!same_origin_as_top()) return {}
  const { showDirectoryPicker, showSaveFilePicker } = globalThis as typeof globalThis &
    Pickers
  return {
    directory: showDirectoryPicker?.bind(globalThis),
    save: showSaveFilePicker?.bind(globalThis),
  }
}

// One id for every export picker, so each dialog opens where the last export went
export const PICKER_ID = `file-export`
