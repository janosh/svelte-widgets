// Save data as a file from the browser, plus a blob-to-data-URL reader for inlining assets.

export type DownloadData = string | Blob | ArrayBuffer | ArrayBufferView<ArrayBuffer>

// Download data to a file, unless a global `download` override (installed by VS Code webviews
// to route saves through the extension host) takes it
export const download = (data: DownloadData, filename: string, type: string): void => {
  const global_download = (globalThis as Record<string, unknown>).download
  if (typeof global_download === `function` && global_download !== download) {
    return (global_download as typeof download)(data, filename, type)
  }
  const link = document.createElement(`a`)
  const url = URL.createObjectURL(new Blob([data], { type }))
  link.href = url
  link.download = filename
  // A detached anchor keeps its synthetic click away from document-level dismissal handlers.
  try {
    link.click()
  } finally {
    // deferred: some browsers resolve the blob URL after click() returns
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}

// Base64 data URL of a blob (FileReader streams it; a fromCharCode spread overflows on big ones)
export const blob_to_data_url = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener(`load`, () => resolve(reader.result as string))
    reader.addEventListener(`error`, () =>
      reject(new Error(`Failed to read blob`, { cause: reader.error })),
    )
    reader.readAsDataURL(blob)
  })
