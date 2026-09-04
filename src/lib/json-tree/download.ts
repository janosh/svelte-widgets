export type DownloadData = string | Blob | ArrayBuffer | ArrayBufferView<ArrayBuffer>

// Original download implementation
function default_download(data: DownloadData, filename: string, type: string) {
  const file = new Blob([data], { type })
  const link = document.createElement(`a`)
  const url = URL.createObjectURL(file)
  link.href = url
  link.download = filename
  // A detached anchor keeps its synthetic click away from document-level dismissal handlers.
  try {
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Function to download data to a file - checks for global override first
export function download(data: DownloadData, filename: string, type: string): void {
  // Check if there's a global download override (used by VSCode extension)
  const global_download = (globalThis as Record<string, unknown>).download
  if (typeof global_download === `function` && global_download !== download) {
    return (global_download as typeof download)(data, filename, type)
  }

  // Use default browser download
  return default_download(data, filename, type)
}
