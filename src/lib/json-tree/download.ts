export type DownloadData = string | Blob | ArrayBuffer | ArrayBufferView<ArrayBuffer>

// The VSCode host can override downloads; browsers use a detached anchor.
export function download(data: DownloadData, filename: string, type: string): void {
  const global_download = (globalThis as Record<string, unknown>).download
  if (typeof global_download === `function` && global_download !== download)
    return (global_download as typeof download)(data, filename, type)

  const link = document.createElement(`a`)
  const url = URL.createObjectURL(new Blob([data], { type }))
  link.href = url
  link.download = filename
  // A detached anchor keeps its synthetic click away from document-level dismissal handlers.
  try {
    link.click()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
