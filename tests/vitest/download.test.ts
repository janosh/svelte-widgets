import { blob_to_data_url, download, type DownloadData } from '#lib/download.ts'
import { expect, test, vi } from 'vite-plus/test'

test.each([
  [`text`, `a,b`, `a,b`],
  [`ArrayBuffer`, new TextEncoder().encode(`buf`).buffer, `buf`],
  [`Uint8Array`, new TextEncoder().encode(`bytes`), `bytes`],
  [`Blob`, new Blob([`blob`]), `blob`],
] as [string, DownloadData, string][])(
  `download saves %s data through an anchor and revokes its URL after the click`,
  async (_kind, data, text) => {
    vi.useFakeTimers()
    const create_url = vi.spyOn(URL, `createObjectURL`).mockReturnValue(`blob:file`)
    const revoke_url = vi.spyOn(URL, `revokeObjectURL`).mockImplementation(() => {})
    const anchor_click = vi
      .spyOn(HTMLAnchorElement.prototype, `click`)
      .mockImplementation(() => {})
    download(data, `out.csv`, `text/csv`)
    const blob = create_url.mock.calls[0][0] as Blob
    expect([await blob.text(), blob.type]).toEqual([text, `text/csv`])
    const anchor = anchor_click.mock.instances[0] as HTMLAnchorElement
    expect([anchor.download, anchor.isConnected]).toEqual([`out.csv`, false])
    expect(revoke_url).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(0)
    expect(revoke_url).toHaveBeenCalledWith(`blob:file`)
  },
)

test(`download keeps its link detached and still revokes the URL when click throws`, async () => {
  vi.useFakeTimers()
  vi.spyOn(URL, `createObjectURL`).mockReturnValue(`blob:test`)
  const revoke_url = vi.spyOn(URL, `revokeObjectURL`).mockImplementation(() => {})
  const append = vi.spyOn(Element.prototype, `append`)
  vi.spyOn(HTMLAnchorElement.prototype, `click`).mockImplementation(() => {
    throw new Error(`click failed`)
  })
  expect(() => download(`content`, `test.txt`, `text/plain`)).toThrow(`click failed`)
  expect(append).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(0)
  expect(revoke_url).toHaveBeenCalledExactlyOnceWith(`blob:test`)
})

test(`download defers to a global download override`, () => {
  const host_download = vi.fn()
  vi.stubGlobal(`download`, host_download)
  const create_url = vi.spyOn(URL, `createObjectURL`)
  download(`{}`, `data.json`, `application/json`)
  expect(host_download).toHaveBeenCalledWith(`{}`, `data.json`, `application/json`)
  expect(create_url).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

test(`blob_to_data_url encodes the blob as base64 with its type`, async () => {
  const url = await blob_to_data_url(new Blob([`hi`], { type: `text/plain` }))
  expect(url).toBe(`data:text/plain;base64,${btoa(`hi`)}`)
})
