import { blob_to_data_url, download, type DownloadData } from '#lib/download.ts'
import { expect, test, vi } from 'vite-plus/test'

// fake timers hold the deferred revoke until the test advances them; the click may throw
const stub = (click = () => {}) => {
  vi.useFakeTimers()
  return {
    create: vi.spyOn(URL, `createObjectURL`).mockReturnValue(`blob:file`),
    revoke: vi.spyOn(URL, `revokeObjectURL`).mockImplementation(() => {}),
    click: vi.spyOn(HTMLAnchorElement.prototype, `click`).mockImplementation(click),
  }
}

test.each([
  [`text`, `a,b`, `a,b`],
  [`ArrayBuffer`, new TextEncoder().encode(`buf`).buffer, `buf`],
  [`Uint8Array`, new TextEncoder().encode(`bytes`), `bytes`],
  [`Blob`, new Blob([`blob`]), `blob`],
] as [string, DownloadData, string][])(
  `download saves %s through a detached anchor and revokes the URL after the click`,
  async (_kind, data, text) => {
    const { create, revoke, click } = stub()
    download(data, `out.csv`, `text/csv`)
    const blob = create.mock.calls[0][0] as Blob
    expect([await blob.text(), blob.type]).toEqual([text, `text/csv`])
    const { download: name, isConnected } = click.mock.instances[0] as HTMLAnchorElement
    expect([name, isConnected, revoke.mock.calls.length]).toEqual([`out.csv`, false, 0])
    await vi.advanceTimersByTimeAsync(0)
    expect(revoke).toHaveBeenCalledWith(`blob:file`)
  },
)

test(`download still revokes the URL when the click throws`, async () => {
  const { revoke } = stub(() => {
    throw new Error(`click failed`)
  })
  expect(() => download(`content`, `test.txt`, `text/plain`)).toThrow(`click failed`)
  await vi.advanceTimersByTimeAsync(0)
  expect(revoke).toHaveBeenCalledExactlyOnceWith(`blob:file`)
})

test(`download defers to a global download override`, () => {
  const host_download = vi.fn()
  vi.stubGlobal(`download`, host_download)
  const { create } = stub()
  download(`{}`, `data.json`, `application/json`)
  expect(host_download).toHaveBeenCalledWith(`{}`, `data.json`, `application/json`)
  expect(create).not.toHaveBeenCalled()
  vi.unstubAllGlobals()
})

test(`blob_to_data_url encodes the blob as base64 with its type`, async () => {
  const url = await blob_to_data_url(new Blob([`hi`], { type: `text/plain` }))
  expect(url).toBe(`data:text/plain;base64,${btoa(`hi`)}`)
})
